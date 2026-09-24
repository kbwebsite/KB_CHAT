"""Outbound email: Gmail API first, then Resend, then Gmail SMTP fallback.

Gmail API is plain HTTPS, so it works from hosts (Render) where outbound
SMTP is blocked — and needs no verified domain. Everything here is
fail-soft: when no sender is configured (local dev, tests) the send is
skipped with a log line so auth flows keep working.
"""

import base64
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import httpx

from app.database.config import settings

logger = logging.getLogger(__name__)

RESEND_ENDPOINT = "https://api.resend.com/emails"
GMAIL_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
GMAIL_SEND_ENDPOINT = (
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
)


def resend_configured() -> bool:
    return bool((settings.RESEND_API_KEY or "").strip())


def smtp_configured() -> bool:
    return bool(
        (settings.SMTP_HOST or "").strip()
        and (settings.SMTP_USER or "").strip()
        and (settings.SMTP_PASS or "").strip()
    )


def gmail_configured() -> bool:
    return bool(
        (settings.GMAIL_CLIENT_ID or "").strip()
        and (settings.GMAIL_CLIENT_SECRET or "").strip()
        and (settings.GMAIL_REFRESH_TOKEN or "").strip()
    )


def email_configured() -> bool:
    """True when at least one sender can actually deliver."""
    return gmail_configured() or resend_configured() or smtp_configured()


def _resend_sender_is_sandbox() -> bool:
    """Sandbox senders (onboarding@resend.dev) only deliver to the Resend
    account owner's address — and the API still returns 200 for everyone
    else, dropping the mail silently afterwards. Never let that result
    short-circuit the SMTP fallback."""
    raw = (settings.RESEND_FROM or "").strip().lower()
    if "<" in raw and ">" in raw:
        raw = raw.split("<", 1)[1].rsplit(">", 1)[0]
    return raw.endswith("@resend.dev")


def _gmail_access_token() -> str | None:
    """Mint a short-lived access token from the stored refresh token."""
    try:
        resp = httpx.post(
            GMAIL_TOKEN_ENDPOINT,
            data={
                "client_id": settings.GMAIL_CLIENT_ID.strip(),
                "client_secret": settings.GMAIL_CLIENT_SECRET.strip(),
                "refresh_token": settings.GMAIL_REFRESH_TOKEN.strip(),
                "grant_type": "refresh_token",
            },
            timeout=10,
        )
        if 200 <= resp.status_code < 300:
            token = (resp.json() or {}).get("access_token")
            return token or None
        logger.warning(
            "[email] Gmail token refresh failed: %s", resp.status_code
        )
    except Exception as e:
        logger.warning("[email] Gmail token refresh failed: %s", e)
    return None


def _send_via_gmail_api(
    to: str, subject: str, html: str, text: str | None
) -> bool:
    """Send via the Gmail API. Free, no domain needed; mail goes out from
    the authorized Gmail account."""
    sender = (settings.GMAIL_FROM or "").strip() or (
        settings.SMTP_USER or ""
    ).strip()
    if "@" not in sender:
        return False
    access = _gmail_access_token()
    if not access:
        return False
    msg = MIMEMultipart("alternative")
    msg["From"] = sender
    msg["To"] = to
    msg["Subject"] = subject
    if text:
        msg.attach(MIMEText(text, "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))
    try:
        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
        resp = httpx.post(
            GMAIL_SEND_ENDPOINT,
            headers={
                "Authorization": f"Bearer {access}",
                "Content-Type": "application/json",
            },
            json={"raw": raw},
            timeout=10,
        )
        if 200 <= resp.status_code < 300:
            logger.info("[email] sent via Gmail API to %s (%s)", to, subject)
            return True
        logger.warning(
            "[email] Gmail API send to %s failed: %s %s",
            to,
            resp.status_code,
            resp.text[:200],
        )
        return False
    except Exception as e:
        logger.warning("[email] Gmail API send to %s failed: %s", to, e)
        return False


def send_email(to: str, subject: str, html: str, text: str | None = None) -> bool:
    """Send one transactional email. Gmail API first (works where SMTP is
    blocked), then SMTP-first with a sandbox Resend sender (it can't reach
other inboxes anyway), Resend first otherwise."""
    if gmail_configured() and _send_via_gmail_api(to, subject, html, text):
        return True
    if not email_configured():
        logger.info(
            "[email] no sender configured — skipping send to %s (%s)", to, subject
        )
        return False
    smtp_first = smtp_configured() and (
        not resend_configured() or _resend_sender_is_sandbox()
    )
    if smtp_first and _send_via_smtp(to, subject, html, text):
        return True
    if resend_configured() and _send_via_resend(to, subject, html, text):
        return True
    if not smtp_first and smtp_configured():
        return _send_via_smtp(to, subject, html, text)
    return False


def _send_via_resend(to: str, subject: str, html: str, text: str | None) -> bool:
    """Send via the Resend API. Returns True on accept (2xx)."""
    api_key = (settings.RESEND_API_KEY or "").strip()
    sender = (settings.RESEND_FROM or "").strip() or "Kryzen <onboarding@resend.dev>"
    if not api_key:
        return False
    payload: dict = {"from": sender, "to": [to], "subject": subject, "html": html}
    if text:
        payload["text"] = text
    try:
        resp = httpx.post(
            RESEND_ENDPOINT,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=10,
        )
        if 200 <= resp.status_code < 300:
            logger.info("[email] sent via Resend to %s (%s)", to, subject)
            return True
        logger.warning(
            "[email] Resend rejected send to %s: %s %s",
            to,
            resp.status_code,
            resp.text[:200],
        )
        return False
    except Exception as e:
        logger.warning("[email] Resend send to %s failed: %s", to, e)
        return False


def _send_via_smtp(to: str, subject: str, html: str, text: str | None) -> bool:
    """Send via SMTP (e.g. Gmail + App Password). No domain needed."""
    sender = (settings.SMTP_FROM or "").strip() or settings.SMTP_USER.strip()
    msg = MIMEMultipart("alternative")
    msg["From"] = sender
    msg["To"] = to
    msg["Subject"] = subject
    if text:
        msg.attach(MIMEText(text, "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))
    try:
        with smtplib.SMTP(
            settings.SMTP_HOST.strip(), int(settings.SMTP_PORT or 587), timeout=10
        ) as smtp:
            smtp.starttls()
            smtp.login(settings.SMTP_USER.strip(), settings.SMTP_PASS)
            smtp.sendmail(sender, [to], msg.as_string())
        logger.info("[email] sent via SMTP to %s (%s)", to, subject)
        return True
    except Exception as e:
        logger.warning("[email] SMTP send to %s failed: %s", to, e)
        return False


def _shell(title: str, body_html: str) -> str:
    return f"""<!DOCTYPE html><html><body style="margin:0;background:#06060e;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" border="0" style="background:#0c0c18;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:32px;text-align:center;">
<tr><td style="font-size:22px;font-weight:bold;color:#f0f0ff;">{title}</td></tr>
<tr><td style="padding-top:16px;">{body_html}</td></tr>
<tr><td style="padding-top:24px;font-size:11px;color:#5c5c80;">Kryzen — Connect. Chat. Share.</td></tr>
</table></td></tr></table></body></html>"""


def send_verification_code(to: str, code: str) -> bool:
    html = _shell(
        "Verify your email",
        f"""<p style="color:#9898b8;font-size:14px;">Enter this code in Kryzen to verify your address. It expires in 30 minutes. Only the newest code works — older ones stop working when a new one is sent.</p>
<p style="font-size:34px;font-weight:bold;letter-spacing:10px;color:#7c5cfc;margin:16px 0;">{code}</p>
<p style="color:#5c5c80;font-size:12px;">Didn't ask for this? Ignore the email.</p>""",
    )
    return send_email(
        to,
        "Your Kryzen verification code",
        html,
        text=f"Your Kryzen verification code is {code}. It expires in 30 minutes. Only the newest code works.",
    )


def send_password_reset(to: str, link: str) -> bool:
    html = _shell(
        "Reset your password",
        f"""<p style="color:#9898b8;font-size:14px;">Tap the button below to choose a new password. The link expires in 1 hour.</p>
<p style="margin:20px 0;"><a href="{link}" style="display:inline-block;background:#7c5cfc;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 28px;border-radius:12px;">Reset password</a></p>
<p style="color:#5c5c80;font-size:12px;">Didn't ask for this? Ignore the email.</p>""",
    )
    return send_email(
        to,
        "Reset your Kryzen password",
        html,
        text=f"Reset your Kryzen password (expires in 1 hour): {link}",
    )

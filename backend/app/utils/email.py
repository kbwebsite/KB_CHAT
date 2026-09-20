"""Outbound email via Resend (HTTP API, no extra dependency).

Everything here is fail-soft: when RESEND_API_KEY is unset (local dev,
tests) the send is skipped with a log line so auth flows keep working.
"""

import logging

import httpx

from app.database.config import settings

logger = logging.getLogger(__name__)

RESEND_ENDPOINT = "https://api.resend.com/emails"


def resend_configured() -> bool:
    return bool((settings.RESEND_API_KEY or "").strip())


def send_email(to: str, subject: str, html: str, text: str | None = None) -> bool:
    """Send one transactional email. Returns True on accept (2xx)."""
    api_key = (settings.RESEND_API_KEY or "").strip()
    sender = (settings.RESEND_FROM or "").strip() or "Kryzen <onboarding@resend.dev>"
    if not api_key:
        logger.info(
            "[email] RESEND_API_KEY unset — skipping send to %s (%s)", to, subject
        )
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
            logger.info("[email] sent to %s (%s)", to, subject)
            return True
        logger.warning(
            "[email] Resend rejected send to %s: %s %s",
            to,
            resp.status_code,
            resp.text[:200],
        )
        return False
    except Exception as e:
        logger.warning("[email] send to %s failed: %s", to, e)
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
        f"""<p style="color:#9898b8;font-size:14px;">Enter this code in Kryzen to verify your address. It expires in 10 minutes.</p>
<p style="font-size:34px;font-weight:bold;letter-spacing:10px;color:#7c5cfc;margin:16px 0;">{code}</p>
<p style="color:#5c5c80;font-size:12px;">Didn't ask for this? Ignore the email.</p>""",
    )
    return send_email(
        to,
        "Your Kryzen verification code",
        html,
        text=f"Your Kryzen verification code is {code}. It expires in 10 minutes.",
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

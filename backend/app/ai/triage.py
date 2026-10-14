"""Agentic moderation triage: look first, judge second.

Old triage sent only message text to the model, so GIFs/images came back
"unable to evaluate". This agent works in two steps:

1. OBSERVE — every attached or linked image is shown to a vision-capable
   model, which describes it factually (no verdict yet).
2. JUDGE — the report reason + text + descriptions go to a strict-JSON
   verdict call (score/label/summary).

Anything the eyes can't reach (sealed content, dead links, video frames,
a text-only model) is recorded honestly in the description log instead of
silently ignored, so the admin always sees what the agent saw.
"""

import base64
import re
from typing import Any, Dict, List, Tuple

import httpx

MAX_IMAGES = 3
MAX_IMAGE_BYTES = 6 * 1024 * 1024

IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp")
IMAGE_HOSTS = ("giphy.com", "tenor.com", "imgur.com", "cloudinary.com")

URL_RE = re.compile(r"https?://[^\s)>\]]+", re.IGNORECASE)


def extract_image_urls(text: str) -> List[str]:
    """Candidate image links inside message text (deduped, capped)."""
    out: List[str] = []
    for m in URL_RE.finditer(text or ""):
        url = m.group(0).rstrip(".,;:!?")
        low = url.split("?", 1)[0].lower()
        if low.endswith(IMAGE_EXTS) or any(h in low for h in IMAGE_HOSTS):
            if url not in out:
                out.append(url)
        if len(out) >= MAX_IMAGES:
            break
    return out


async def fetch_image(url: str) -> Tuple[str | None, bytes | None]:
    """Download an image URL (capped). Returns (mime, bytes) or (None, None)."""
    try:
        timeout = httpx.Timeout(connect=8.0, read=20.0, write=8.0, pool=8.0)
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as c:
            async with c.stream("GET", url) as r:
                if r.status_code != 200:
                    return None, None
                mime = (
                    (r.headers.get("content-type") or "").split(";")[0].strip().lower()
                )
                if not mime.startswith("image/"):
                    return None, None
                buf = bytearray()
                async for chunk in r.aiter_bytes(65536):
                    buf.extend(chunk)
                    if len(buf) > MAX_IMAGE_BYTES:
                        return None, None
                if not buf:
                    return None, None
                return mime, bytes(buf)
    except Exception:
        return None, None


def to_vision_part(mime: str, data: bytes) -> Dict[str, Any]:
    b64 = base64.b64encode(data).decode("ascii")
    return {
        "type": "image_url",
        "image_url": {"url": f"data:{mime};base64,{b64}"},
    }


async def describe_images(
    provider,
    images: List[Dict[str, Any]],
) -> List[str]:
    """Step 1 (OBSERVE): factual description per image, failures noted."""
    out: List[str] = []
    for i, img in enumerate(images[:MAX_IMAGES], 1):
        ref = img.get("ref") or f"image {i}"
        try:
            if img.get("url"):
                part: Dict[str, Any] = {
                    "type": "image_url",
                    "image_url": {"url": img["url"]},
                }
            else:
                part = to_vision_part(img["mime"], img["data"])
            reply = await provider.chat(
                [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": (
                                    "Describe this image factually in 2-3 lines: "
                                    "what is shown, any visible text, people, "
                                    "symbols. No safety verdict, just what you see."
                                ),
                            },
                            part,
                        ],
                    }
                ]
            )
            text = (reply or "").strip()
            out.append(f"{ref}: {text[:600]}" if text else f"{ref}: (no description)")
        except Exception as e:
            out.append(f"{ref}: (could not view — {str(e)[:120]})")
    return out


JUDGE_SYSTEM = (
    "You are a chat-moderation triage assistant. Rate the reported content "
    "for policy risk. Reply with ONLY compact JSON, no other text: "
    '{"score": 0-100, "label": "safe|suspicious|spam|abusive|explicit|scam", '
    '"summary": "one short line"}.'
)


async def judge(
    provider,
    *,
    reason: str,
    text: str,
    descriptions: List[str],
) -> Dict[str, Any]:
    """Step 2 (JUDGE): verdict from reason + text + what was seen."""
    seen = "\n".join(descriptions) if descriptions else "(no images)"
    prompt = (
        f"{JUDGE_SYSTEM}\nReport reason: {reason}\n"
        f"Message text:\n{(text or '(none)')[:1500]}\n"
        f"What the images show:\n{seen[:2000]}"
    )
    raw = await provider.chat([{"role": "user", "content": prompt}])
    import json as _json
    import re as _re

    m = _re.search(r"\{.*\}", raw or "", _re.DOTALL)
    data = _json.loads(m.group(0)) if m else {}
    score = int(data.get("score"))
    label = str(data.get("label") or "").lower()
    summary = str(data.get("summary") or "")[:300]
    if not (0 <= score <= 100) or label not in (
        "safe",
        "suspicious",
        "spam",
        "abusive",
        "explicit",
        "scam",
    ):
        raise ValueError("Analysis returned no usable score")
    return {"score": score, "label": label, "summary": summary or None}

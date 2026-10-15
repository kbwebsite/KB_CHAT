"""Keyed + keyless text-to-image backends.

Backends:
- pollinations (keyless): ``flux`` (quality) + ``turbo`` (speed). Always
  available, used as fallback when a keyed backend has no key or errors.
- HuggingFace Inference Providers (needs HF_TOKEN):
  ``flux-krea`` (black-forest-labs/FLUX.1-Krea-dev),
  ``qwen-image`` (Qwen/Qwen-Image),
  ``hyper-sd`` (ByteDance/Hyper-SD).
  POST https://router.huggingface.co/hf-inference/models/{id}
  with {"inputs": prompt, "parameters": {...}} -> raw image bytes.
- Cloudflare Workers AI (needs CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN):
  ``flux-schnell`` (@cf/black-forest-labs/flux-1-schnell).
  POST /client/v4/accounts/{id}/ai/run/<model> -> {"result": {"image": b64}}.

All keyed helpers return a ``data:image/...;base64,...`` URI so the
frontend <img> renders without extra proxying.
"""

from __future__ import annotations

import base64
import logging
from typing import Optional

import httpx

from app.database.config import settings

log = logging.getLogger(__name__)

HF_ROUTER = "https://router.huggingface.co/hf-inference/models"
CF_RUN_TMPL = (
    "https://api.cloudflare.com/client/v4/accounts/{account}"
    "/ai/run/@cf/black-forest-labs/flux-1-schnell"
)

# id -> {label, provider, hf_model?, needs_key}
IMAGE_MODELS: dict[str, dict] = {
    "flux": {
        "label": "Flux — better (keyless)",
        "provider": "pollinations",
        "needs_key": False,
    },
    "turbo": {
        "label": "Turbo — faster (keyless)",
        "provider": "pollinations",
        "needs_key": False,
    },
    "flux-krea": {
        "label": "FLUX.1-Krea-dev — realistic",
        "provider": "huggingface",
        "hf_model": "black-forest-labs/FLUX.1-Krea-dev",
        "needs_key": True,
    },
    "qwen-image": {
        "label": "Qwen-Image — powerful",
        "provider": "huggingface",
        "hf_model": "Qwen/Qwen-Image",
        "needs_key": True,
    },
    "hyper-sd": {
        "label": "Hyper-SD — fast",
        "provider": "huggingface",
        "hf_model": "ByteDance/Hyper-SD",
        "needs_key": True,
    },
    "flux-schnell": {
        "label": "FLUX.1-schnell — Cloudflare",
        "provider": "cloudflare",
        "needs_key": True,
    },
}


def normalize_model(name: Optional[str]) -> str:
    m = (name or "flux").strip().lower()
    return m if m in IMAGE_MODELS else "flux"


def available_models() -> list[dict]:
    """Registry + live availability (key present or keyless)."""
    hf_ok = bool(settings.HF_TOKEN)
    cf_ok = bool(settings.CLOUDFLARE_ACCOUNT_ID and settings.CLOUDFLARE_API_TOKEN)
    out = []
    for mid, meta in IMAGE_MODELS.items():
        avail = True
        if meta["provider"] == "huggingface":
            avail = hf_ok
        elif meta["provider"] == "cloudflare":
            avail = cf_ok
        out.append(
            {
                "id": mid,
                "label": meta["label"],
                "provider": meta["provider"],
                "needs_key": meta["needs_key"],
                "available": avail,
                "hf_model": meta.get("hf_model"),
            }
        )
    return out


def _data_uri(img_bytes: bytes, content_type: str = "") -> str:
    ct = (content_type or "").split(";")[0].strip().lower()
    if ct not in ("image/png", "image/jpeg", "image/webp"):
        if img_bytes[:8].startswith(b"\x89PNG"):
            ct = "image/png"
        elif img_bytes[:3] == b"\xff\xd8\xff":
            ct = "image/jpeg"
        elif img_bytes[:4] == b"RIFF":
            ct = "image/webp"
        else:
            ct = "image/png"
    return f"data:{ct};base64," + base64.b64encode(img_bytes).decode("ascii")


async def generate_hf(
    hf_model: str, prompt: str, width: int, height: int, seed: int
) -> str:
    """Call HF Inference Providers router, return data URI. Raises on error."""
    token = settings.HF_TOKEN
    if not token:
        raise RuntimeError("HF_TOKEN is not configured")
    url = f"{HF_ROUTER}/{hf_model}"
    payload = {
        "inputs": prompt,
        "parameters": {
            "width": width,
            "height": height,
            "seed": seed,
            "num_inference_steps": 4 if "Hyper-SD" in hf_model else 20,
        },
    }
    timeout = httpx.Timeout(connect=10.0, read=120.0, write=10.0, pool=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(
            url,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
    ctype = r.headers.get("content-type", "")
    if r.status_code != 200 or ctype.startswith("application/json"):
        detail = r.text[:300]
        raise RuntimeError(f"HF {hf_model} failed ({r.status_code}): {detail}")
    return _data_uri(r.content, ctype)


async def generate_cloudflare(prompt: str, seed: int) -> str:
    """Call Cloudflare Workers AI flux-1-schnell, return data URI."""
    account = settings.CLOUDFLARE_ACCOUNT_ID
    token = settings.CLOUDFLARE_API_TOKEN
    if not (account and token):
        raise RuntimeError("Cloudflare Workers AI is not configured")
    url = CF_RUN_TMPL.format(account=account)
    timeout = httpx.Timeout(connect=10.0, read=120.0, write=10.0, pool=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(
            url,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json={"prompt": prompt, "steps": 4, "seed": seed},
        )
    if r.status_code != 200:
        raise RuntimeError(f"Cloudflare AI failed ({r.status_code}): {r.text[:300]}")
    try:
        data = r.json()
    except Exception:
        # Some accounts return raw image bytes.
        return _data_uri(r.content, r.headers.get("content-type", ""))
    result = (data.get("result") or {}) if isinstance(data, dict) else {}
    b64 = result.get("image") if isinstance(result, dict) else None
    if not b64:
        raise RuntimeError(f"Cloudflare AI unexpected response: {str(data)[:300]}")
    if b64.startswith("data:"):
        return b64
    return f"data:image/jpeg;base64,{b64}"


async def generate_image(
    model: str, prompt: str, width: int, height: int, seed: int
) -> tuple[str, str, bool]:
    """Generate an image. Returns (image_url, used_model, fell_back).

    Keyed backends fall back to keyless pollinations ``flux`` on missing
    keys or provider errors so the UI never hard-breaks.
    """
    from urllib.parse import quote

    m = normalize_model(model)
    meta = IMAGE_MODELS[m]

    if meta["provider"] == "huggingface":
        try:
            uri = await generate_hf(meta["hf_model"], prompt, width, height, seed)
            return uri, m, False
        except Exception as e:
            log.warning("[images] HF %s failed, falling back to flux: %s", m, e)
    elif meta["provider"] == "cloudflare":
        try:
            uri = await generate_cloudflare(prompt, seed)
            return uri, m, False
        except Exception as e:
            log.warning("[images] Cloudflare failed, falling back to flux: %s", e)

    base = m if m in ("flux", "turbo") else "flux"
    url = (
        f"https://image.pollinations.ai/prompt/{quote(prompt)}"
        f"?width={width}&height={height}&seed={seed}&model={base}&nologo=true"
    )
    return url, base, (m not in ("flux", "turbo"))

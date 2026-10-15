"""Keyed + keyless text-to-image backends.

Backends:
- pollinations (keyless): ``flux`` (quality) + ``turbo`` (speed). Always
  available, used as fallback when a keyed backend has no key or errors.
- HuggingFace Inference Providers (needs HF_TOKEN):
  ``flux-krea`` (black-forest-labs/FLUX.1-Krea-dev),
  ``qwen-image`` (Qwen/Qwen-Image),
  ``hyper-sd`` (ByteDance/Hyper-SD).
  Routed via the official ``huggingface_hub`` client (provider="auto"),
  which picks a serving provider per model — plain HTTP against the
  default hf-inference route 400s for models it doesn't serve.
- Cloudflare Workers AI (needs CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN):
  ``flux-schnell`` (@cf/black-forest-labs/flux-1-schnell).
  POST /client/v4/accounts/{id}/ai/run/<model> -> {"result": {"image": b64}}.
  Note: the REST schema rejects ``seed`` — only prompt (+steps) is sent.

All keyed helpers return a ``data:image/...;base64,...`` URI so the
frontend <img> renders without extra proxying.
"""

from __future__ import annotations

import base64
import io
import logging
from typing import Optional

import httpx

from app.database.config import settings

log = logging.getLogger(__name__)

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


async def generate_hf(hf_model: str, prompt: str) -> str:
    """Generate via HF Inference Providers, return data URI. Raises on error.

    Uses the official client with provider="auto" so each model is routed
    to a provider that actually serves it (raw HTTP against the default
    hf-inference route 400s with "Model not supported by provider").
    No extra parameters are sent — provider schemas differ (fal-ai wants
    image_size, diffusers want width/height), defaults are safest.
    """
    from huggingface_hub import AsyncInferenceClient

    token = settings.HF_TOKEN
    if not token:
        raise RuntimeError("HF_TOKEN is not configured")
    client = AsyncInferenceClient(api_key=token, timeout=120)
    image = await client.text_to_image(prompt, model=hf_model)
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return _data_uri(buf.getvalue(), "image/png")


async def generate_cloudflare(prompt: str) -> str:
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
            # NOTE: the REST schema rejects `seed`
            # (5006: unevaluated property not allowed) — prompt only.
            json={"prompt": prompt, "steps": 4},
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
) -> tuple[str, str, bool, Optional[str]]:
    """Generate an image. Returns (image_url, used_model, fell_back, error).

    Keyed backends fall back to keyless pollinations ``flux`` on missing
    keys or provider errors so the UI never hard-breaks; ``error`` carries
    the provider failure reason (None when the requested backend served).
    """
    from urllib.parse import quote

    m = normalize_model(model)
    meta = IMAGE_MODELS[m]

    if meta["provider"] == "huggingface":
        try:
            uri = await generate_hf(meta["hf_model"], prompt)
            return uri, m, False, None
        except Exception as e:
            err = f"HF {m}: {e}"[:300]
            log.warning("[images] %s, falling back to flux", err)
            return _pollinations(prompt, width, height, seed), "flux", True, err
    elif meta["provider"] == "cloudflare":
        try:
            uri = await generate_cloudflare(prompt)
            return uri, m, False, None
        except Exception as e:
            err = f"Cloudflare: {e}"[:300]
            log.warning("[images] %s, falling back to flux", err)
            return _pollinations(prompt, width, height, seed), "flux", True, err

    return _pollinations(prompt, width, height, seed, model=m), m, False, None


def _pollinations(
    prompt: str, width: int, height: int, seed: int, model: str = "flux"
) -> str:
    from urllib.parse import quote

    base = model if model in ("flux", "turbo") else "flux"
    return (
        f"https://image.pollinations.ai/prompt/{quote(prompt)}"
        f"?width={width}&height={height}&seed={seed}&model={base}&nologo=true"
    )

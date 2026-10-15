"""Keyed + keyless text-to-image backends.

Backends:
- pollinations (keyless): ``flux`` (quality) + ``turbo`` (speed). Always
  available, used as fallback when a keyed backend has no key or errors.
- Cloudflare Workers AI (needs CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN,
  free 10k neurons/day): ``flux-schnell``, ``flux-2-klein``,
  ``sdxl-lightning``, ``dreamshaper``, ``sdxl-base``.
  POST /client/v4/accounts/{id}/ai/run/<model> -> {"result": {"image": b64}}.
  Note: the schnell REST schema rejects ``seed`` — only prompt (+steps).

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

# id -> {label, provider, cf_model?, cf_kind?, needs_key}
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
    "flux-schnell": {
        "label": "FLUX.1-schnell — Cloudflare",
        "provider": "cloudflare",
        "cf_model": "@cf/black-forest-labs/flux-1-schnell",
        # schnell REST schema: {prompt, steps} only (seed is rejected).
        "cf_kind": "bfl-steps",
        "needs_key": True,
    },
    # Extra free Cloudflare text-to-image models (same keys, same free tier).
    "flux-2-klein": {
        "label": "FLUX.2-klein — fastest SOTA",
        "provider": "cloudflare",
        "cf_model": "@cf/black-forest-labs/flux-2-klein-4b",
        # Partner model; minimal {prompt} so unknown extras can't 5006.
        "cf_kind": "prompt-only",
        "needs_key": True,
    },
    "sdxl-lightning": {
        "label": "SDXL-Lightning — fast 1024px",
        "provider": "cloudflare",
        "cf_model": "@cf/bytedance/stable-diffusion-xl-lightning",
        "cf_kind": "sd",
        "needs_key": True,
    },
    "dreamshaper": {
        "label": "DreamShaper — photoreal",
        "provider": "cloudflare",
        "cf_model": "@cf/lykon/dreamshaper-8-lcm",
        "cf_kind": "sd",
        "needs_key": True,
    },
    "sdxl-base": {
        "label": "SDXL Base — classic quality",
        "provider": "cloudflare",
        "cf_model": "@cf/stabilityai/stable-diffusion-xl-base-1.0",
        "cf_kind": "sd",
        "needs_key": True,
    },
}


def normalize_model(name: Optional[str]) -> str:
    m = (name or "flux").strip().lower()
    return m if m in IMAGE_MODELS else "flux"


def available_models() -> list[dict]:
    """Registry + live availability (key present or keyless)."""
    cf_ok = bool(settings.CLOUDFLARE_ACCOUNT_ID and settings.CLOUDFLARE_API_TOKEN)
    out = []
    for mid, meta in IMAGE_MODELS.items():
        avail = True
        if meta["provider"] == "cloudflare":
            avail = cf_ok
        out.append(
            {
                "id": mid,
                "label": meta["label"],
                "provider": meta["provider"],
                "needs_key": meta["needs_key"],
                "available": avail,
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


async def generate_cloudflare(
    cf_model: str, cf_kind: str, prompt: str, width: int, height: int, seed: int
) -> str:
    """Call Cloudflare Workers AI text-to-image, return data URI.

    Payloads are per-family: BFL schnell takes {prompt, steps} (seed is
    rejected with 5006); klein takes minimal {prompt}; SD-family takes the
    classic {prompt, negative_prompt, height, width, num_steps, guidance,
    seed}.
    """
    account = settings.CLOUDFLARE_ACCOUNT_ID
    token = settings.CLOUDFLARE_API_TOKEN
    if not (account and token):
        raise RuntimeError("Cloudflare Workers AI is not configured")
    url = f"https://api.cloudflare.com/client/v4/accounts/{account}/ai/run/{cf_model}"
    if cf_kind == "sd":
        payload: dict = {
            "prompt": prompt,
            "negative_prompt": "blurry, low quality, distorted",
            "height": height,
            "width": width,
            "num_steps": 8 if "lightning" in cf_model else 20,
            "guidance": 7.5,
            "seed": seed,
        }
    elif cf_kind == "bfl-steps":
        # NOTE: the schnell REST schema rejects `seed`
        # (5006: unevaluated property not allowed) — prompt+steps only.
        payload = {"prompt": prompt, "steps": 4}
    else:  # prompt-only (e.g. FLUX.2-klein partner model)
        payload = {"prompt": prompt}
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
    m = normalize_model(model)
    meta = IMAGE_MODELS[m]

    if meta["provider"] == "cloudflare":
        try:
            uri = await generate_cloudflare(
                meta["cf_model"],
                meta.get("cf_kind", "prompt-only"),
                prompt,
                width,
                height,
                seed,
            )
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

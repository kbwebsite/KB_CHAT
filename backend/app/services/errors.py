"""Wave 1 service-layer foundation: domain errors.

Convention (see .mece/cells/BACKEND/WAVE1_MAP.md):

- Services raise :class:`ServiceError` carrying ``(status_code, detail)`` for
  expected domain failures (not found, forbidden, bad input).
- Routes translate them into the *same* ``HTTPException`` they raised before
  this wave, so status codes, messages and response envelopes are unchanged.
- Unexpected exceptions are never caught here: they propagate exactly as
  they did when the logic lived in the route.
"""

import functools
import inspect

from fastapi import HTTPException


class ServiceError(Exception):
    """A domain failure with an explicit HTTP translation."""

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def not_found(detail: str) -> ServiceError:
    return ServiceError(404, detail)


def forbidden(detail: str) -> ServiceError:
    return ServiceError(403, detail)


def bad_request(detail: str) -> ServiceError:
    return ServiceError(400, detail)


def unauthorized(detail: str = "Not authenticated") -> ServiceError:
    return ServiceError(401, detail)


def service_route(fn):
    """Route decorator: ServiceError -> HTTPException (status + detail kept).

    Keeps the ``try/except ServiceError`` translation in one place instead of
    repeating it in every migrated handler. Applied *inside* the FastAPI
    path decorator so routing/validation are unaffected.
    """

    if inspect.iscoroutinefunction(fn):

        @functools.wraps(fn)
        async def _async_wrapper(*args, **kwargs):
            try:
                return await fn(*args, **kwargs)
            except ServiceError as e:
                raise HTTPException(status_code=e.status_code, detail=e.detail)

        return _async_wrapper

    @functools.wraps(fn)
    def _sync_wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except ServiceError as e:
            raise HTTPException(status_code=e.status_code, detail=e.detail)

    return _sync_wrapper

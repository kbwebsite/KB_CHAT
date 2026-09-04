import os
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.database.config import settings

# Ensure upload dir exists
os.makedirs(settings.upload_dir_abs, exist_ok=True)


@asynccontextmanager
async def lifespan(app):
    # Startup: background task to check scheduled messages every 30 seconds
    async def _check():
        while True:
            try:
                from app.api.scheduled import check_scheduled_messages

                await check_scheduled_messages()
            except Exception:
                pass
            await asyncio.sleep(30)

    task = asyncio.create_task(_check())
    try:
        yield
    finally:
        task.cancel()


app = FastAPI(
    title="KB Chat API",
    version="3.0.0",
    description="KB Chat - Connect. Chat. Share. AI-Powered.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.database.connection import create_tables

# Import all models to register them with Base.metadata before create_all()
from app.models.user import User
from app.models.conversation import Conversation, ConversationMember
from app.models.message import Message, MessageReaction, Attachment
from app.models.settings import UserSettings
from app.models.saved import SavedMessage
from app.models.call import CallHistory
from app.models.status import Status, StatusViewer
from app.models.poll import Poll, PollOption, PollVote
from app.models.highlight import StatusHighlight, StatusHighlightItem
from app.models.event import GroupEvent, EventResponse
from app.models.scheduled import ScheduledMessage
from app.models.notification_setting import NotificationSetting
from app.models.session import UserSession
from app.models.sticker import StickerPack, Sticker, UserSticker
from app.models.agent import AgentConversation, AgentMessage


from app.api.auth import router as auth_router
from app.api.users import router as users_router
from app.api.conversations import router as conv_router
from app.api.messages import router as msg_router
from app.api.uploads import router as upload_router
from app.api.groups import router as groups_router
from app.api.saved import router as saved_router
from app.api.calls import router as calls_router
from app.api.settings import router as settings_router
from app.api.extended import router as extended_router
from app.api.status import router as status_router
from app.api.polls import router as polls_router
from app.api.highlights import router as highlights_router
from app.api.linkpreview import router as linkpreview_router
from app.api.events import router as events_router
from app.api.scheduled import router as scheduled_router
from app.api.notification_settings import router as notif_settings_router
from app.api.sessions import router as sessions_router
from app.api.insights import router as insights_router
from app.api.stickers import router as stickers_router
from app.api.ai import router as ai_router
from app.api.agent import router as agent_router
from app.websocket.chat import router as ws_router

create_tables()

if (
    settings.APP_ENV == "production"
    and settings.JWT_SECRET
    == "dev-secret-change-in-production-please-use-strong-random"
):
    import warnings

    warnings.warn(
        "CRITICAL: JWT_SECRET is the default dev value. Set a strong random JWT_SECRET in Render environment variables!",
        stacklevel=1,
    )

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(conv_router)
app.include_router(msg_router)
app.include_router(upload_router)
app.include_router(groups_router)
app.include_router(saved_router)
app.include_router(calls_router)
app.include_router(settings_router)
app.include_router(extended_router)
app.include_router(status_router)
app.include_router(polls_router)
app.include_router(highlights_router)
app.include_router(linkpreview_router)
app.include_router(events_router)
app.include_router(scheduled_router)
app.include_router(notif_settings_router)
app.include_router(sessions_router)
app.include_router(insights_router)
app.include_router(stickers_router)
app.include_router(ai_router)
app.include_router(agent_router)
app.include_router(ws_router)


@app.get("/api/health")
def health():
    import os

    commit_sha = os.environ.get("RENDER_GIT_COMMIT", "unknown")[:7]
    return {
        "success": True,
        "data": {"status": "ok", "service": "Kryzen API", "commit": commit_sha},
        "message": None,
    }


@app.get("/api")
def api_root():
    import os

    commit_sha = os.environ.get("RENDER_GIT_COMMIT", "unknown")[:7]
    return {
        "success": True,
        "data": {
            "name": "Kryzen API",
            "tagline": "Connect. Chat. Share.",
            "version": "3.0.0",
            "commit": commit_sha,
        },
        "message": None,
    }


# Serve frontend static files with SPA catch-all fallback
# Frontend dist is copied to ../frontend/dist in Docker (from /app/frontend/dist relative to /app/backend)
import pathlib
from fastapi.responses import FileResponse

frontend_dist = pathlib.Path(__file__).resolve().parents[2] / "frontend" / "dist"
if not frontend_dist.exists():
    frontend_dist = pathlib.Path(__file__).resolve().parents[3] / "frontend" / "dist"

if frontend_dist.exists():
    assets_dir = frontend_dist / "assets"
    if assets_dir.exists():
        from starlette.staticfiles import StaticFiles as _StaticFiles
        from starlette.responses import Response as _StarletteResponse

        class _CacheStaticFiles(_StaticFiles):
            async def get_response(self, path, scope):
                response = await super().get_response(path, scope)
                response.headers["Cache-Control"] = (
                    "public, max-age=31536000, immutable"
                )
                return response

        app.mount(
            "/assets", _CacheStaticFiles(directory=str(assets_dir)), name="assets"
        )

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Don't intercept api, ws, docs, redoc, openapi.json
        if (
            full_path.startswith("api")
            or full_path.startswith("ws")
            or full_path in ("docs", "redoc", "openapi.json")
        ):
            from fastapi import HTTPException

            raise HTTPException(status_code=404, detail="Not Found")

        # If requesting an existing root-level file (e.g., favicon.svg, vite.svg, robots.txt)
        target_file = (frontend_dist / full_path).resolve()
        if (
            full_path
            and target_file.is_file()
            and str(target_file).startswith(str(frontend_dist.resolve()))
        ):
            return FileResponse(
                str(target_file), headers={"Cache-Control": "no-cache, must-revalidate"}
            )

        # Fallback to index.html for all React Router SPA paths (/chat, /login, /signup, etc.)
        index_file = frontend_dist / "index.html"
        if index_file.is_file():
            return FileResponse(
                str(index_file), headers={"Cache-Control": "no-cache, must-revalidate"}
            )
        return {"detail": "Frontend not found"}
else:

    @app.get("/")
    def root():
        return {
            "success": True,
            "data": {
                "name": "Kryzen API",
                "tagline": "Connect. Chat. Share.",
                "version": "3.0.0",
                "frontend": "not built",
            },
            "message": None,
        }


# Mount uploads as static if needed (already handled via file endpoint)
# Add rate limiting placeholder - simple middleware
from fastapi import Request
from fastapi.responses import JSONResponse
import time
from collections import defaultdict

# simple in-memory rate limiter
_request_counts = defaultdict(list)


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    # Only rate limit auth endpoints
    if request.url.path.startswith("/api/auth"):
        ip = request.client.host if request.client else "unknown"
        now = time.time()
        window = 60  # 60 seconds
        max_requests = 30
        # clean old
        _request_counts[ip] = [t for t in _request_counts[ip] if now - t < window]
        if len(_request_counts[ip]) >= max_requests:
            return JSONResponse(
                status_code=429,
                content={
                    "success": False,
                    "data": None,
                    "message": "Too many requests. Please try again later.",
                },
            )
        _request_counts[ip].append(now)
    response = await call_next(request)
    return response


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    # HSTS only if https (Render terminates TLS)
    if request.url.scheme == "https":
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = (
        "camera=(), microphone=(self), geolocation=()"
    )
    # minimal CSP for API + SPA; allow self, inline styles/scripts needed for Vite + Tailwind
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: blob:; connect-src 'self' wss: ws: https: https://api.openai.com; media-src 'self' blob:; frame-ancestors 'none'"
    )
    return response


@app.middleware("http")
async def log_requests(request: Request, call_next):
    response = await call_next(request)
    return response

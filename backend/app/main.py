import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.database.config import settings
from app.database.connection import create_tables

# Ensure upload dir exists
os.makedirs(settings.upload_dir_abs, exist_ok=True)
create_tables()

app = FastAPI(title="KB Chat API", version="1.0.0", description="KB Chat - Connect. Chat. Share.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
from app.websocket.chat import router as ws_router

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
app.include_router(ws_router)

@app.get("/api/health")
def health():
    return {"success": True, "data": {"status": "ok", "service": "KB Chat API"}, "message": None}

@app.get("/")
def root():
    return {"success": True, "data": {"name": "KB Chat API", "tagline": "Connect. Chat. Share.", "version": "1.0.0"}, "message": None}

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
            return JSONResponse(status_code=429, content={"success": False, "data": None, "message": "Too many requests. Please try again later."})
        _request_counts[ip].append(now)
    response = await call_next(request)
    return response

@app.middleware("http")
async def log_requests(request: Request, call_next):
    response = await call_next(request)
    return response

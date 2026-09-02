import os
import mimetypes
import aiofiles
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Request
from sqlalchemy.orm import Session
from app.database.connection import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.message import Attachment
from app.schemas.common import success_response
from app.database.config import settings
from app.utils.helpers import sanitize_filename, validate_file, generate_stored_filename

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

UPLOAD_DIR = settings.upload_dir_abs
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Try to initialize Cloudinary
cloudinary_configured = False
try:
    if (
        settings.CLOUDINARY_CLOUD_NAME
        and settings.CLOUDINARY_API_KEY
        and settings.CLOUDINARY_API_SECRET
    ):
        import cloudinary
        import cloudinary.uploader

        cloudinary.config(
            cloud_name=settings.CLOUDINARY_CLOUD_NAME,
            api_key=settings.CLOUDINARY_API_KEY,
            api_secret=settings.CLOUDINARY_API_SECRET,
            secure=True,
        )
        cloudinary_configured = True
        print("[uploads] Cloudinary configured for persistent file storage")
    else:
        print(
            "[uploads] Cloudinary not configured, using local storage (ephemeral on Render)"
        )
except ImportError:
    print("[uploads] cloudinary package not installed, using local storage")
except Exception as e:
    print(f"[uploads] Cloudinary config failed: {e}")


async def upload_to_cloudinary(content: bytes, filename: str, folder: str = "kbchat"):
    """Upload file to Cloudinary and return secure URL"""
    if not cloudinary_configured:
        return None
    try:
        import cloudinary.uploader

        result = cloudinary.uploader.upload(
            content,
            public_id=f"{folder}/{generate_stored_filename(filename)}",
            resource_type="auto",
            overwrite=True,
        )
        return result.get("secure_url")
    except Exception as e:
        print(f"[uploads] Cloudinary upload failed: {e}")
        return None


@router.post("")
async def upload_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename")
    content = await file.read()
    size = len(content)
    safe_name = sanitize_filename(file.filename)
    mime = (
        file.content_type
        or mimetypes.guess_type(safe_name)[0]
        or "application/octet-stream"
    )
    valid, msg = validate_file(safe_name, mime, size, settings.MAX_UPLOAD_SIZE_MB)
    if not valid:
        raise HTTPException(status_code=400, detail=msg)
    ext = os.path.splitext(safe_name.lower())[1]
    if ext in (".jpg", ".jpeg", ".png", ".gif", ".webp"):
        if size < 10:
            raise HTTPException(status_code=400, detail="Invalid image file")
        if content[:2] == b"MZ":
            raise HTTPException(status_code=400, detail="Executable files not allowed")
    if content[:2] == b"MZ":
        raise HTTPException(status_code=400, detail="Executable files not allowed")

    stored = generate_stored_filename(safe_name)
    file_path = os.path.join(UPLOAD_DIR, stored)
    if not os.path.abspath(file_path).startswith(os.path.abspath(UPLOAD_DIR)):
        raise HTTPException(status_code=400, detail="Invalid file path")

    # Try Cloudinary first for persistent storage
    cloudinary_url = None
    if cloudinary_configured:
        cloudinary_url = await upload_to_cloudinary(content, safe_name, "uploads")

    # Always save locally as backup (for development)
    async with aiofiles.open(file_path, "wb") as f:
        await f.write(content)

    # Create DB record
    att = Attachment(
        message_id=None,
        uploader_id=current_user.id,
        filename=stored,
        original_filename=safe_name,
        file_path=stored,
        file_size=size,
        mime_type=mime,
        cloudinary_url=cloudinary_url,
    )
    db.add(att)
    db.commit()
    db.refresh(att)

    # Return Cloudinary URL if available, else local path
    return_url = cloudinary_url or f"/api/uploads/file/{stored}"
    return success_response(
        {
            "id": att.id,
            "filename": att.filename,
            "original_filename": att.original_filename,
            "file_path": att.file_path,
            "file_size": att.file_size,
            "mime_type": att.mime_type,
            "url": return_url,
            "cloudinary_url": cloudinary_url,
        },
        "File uploaded",
    )


@router.get("/file/{filename}")
async def get_file(filename: str, token: str = None):
    safe = sanitize_filename(filename)
    file_path = os.path.join(UPLOAD_DIR, safe)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    if not os.path.abspath(file_path).startswith(os.path.abspath(UPLOAD_DIR)):
        raise HTTPException(status_code=403, detail="Forbidden")
    if token:
        try:
            from app.auth.security import decode_token

            decode_token(token)
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid token")
    from fastapi.responses import FileResponse

    mime, _ = mimetypes.guess_type(file_path)
    return FileResponse(
        file_path, media_type=mime or "application/octet-stream", filename=safe
    )


@router.post("/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file")
    content = await file.read()
    size = len(content)
    safe_name = sanitize_filename(file.filename)
    mime = file.content_type or mimetypes.guess_type(safe_name)[0] or ""
    ext = os.path.splitext(safe_name.lower())[1]
    if ext not in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
        raise HTTPException(
            status_code=400, detail="Only image files allowed for avatar"
        )
    if size > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Avatar too large (max 5MB)")
    if content[:2] == b"MZ":
        raise HTTPException(status_code=400, detail="Invalid file")

    stored = generate_stored_filename(safe_name)
    file_path = os.path.join(UPLOAD_DIR, stored)

    # Try Cloudinary first for persistent avatar storage
    cloudinary_url = None
    if cloudinary_configured:
        cloudinary_url = await upload_to_cloudinary(content, safe_name, "avatars")

    # Always save locally as backup
    async with aiofiles.open(file_path, "wb") as f:
        await f.write(content)

    # Update user avatar_url - use Cloudinary URL if available
    avatar_url = cloudinary_url or f"/api/uploads/file/{stored}"
    current_user.avatar_url = avatar_url
    db.commit()
    return success_response(
        {"avatar_url": avatar_url, "cloudinary_url": cloudinary_url}, "Avatar updated"
    )

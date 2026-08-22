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

@router.post("")
async def upload_file(file: UploadFile = File(...), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename")
    # read content to get size? We'll read in chunks
    content = await file.read()
    size = len(content)
    # Reset validation
    safe_name = sanitize_filename(file.filename)
    mime = file.content_type or mimetypes.guess_type(safe_name)[0] or "application/octet-stream"
    # validate
    valid, msg = validate_file(safe_name, mime, size, settings.MAX_UPLOAD_SIZE_MB)
    if not valid:
        raise HTTPException(status_code=400, detail=msg)
    # check magic bytes for images? basic check to prevent exe disguised
    # if ext is image, verify header
    ext = os.path.splitext(safe_name.lower())[1]
    if ext in (".jpg", ".jpeg", ".png", ".gif", ".webp"):
        # simple magic check
        if size < 10:
            raise HTTPException(status_code=400, detail="Invalid image file")
        # check for executable signatures
        if content[:2] == b"MZ":
            raise HTTPException(status_code=400, detail="Executable files not allowed")
    if content[:2] == b"MZ":
        raise HTTPException(status_code=400, detail="Executable files not allowed")

    stored = generate_stored_filename(safe_name)
    file_path = os.path.join(UPLOAD_DIR, stored)
    # ensure no path traversal
    if not os.path.abspath(file_path).startswith(os.path.abspath(UPLOAD_DIR)):
        raise HTTPException(status_code=400, detail="Invalid file path")

    async with aiofiles.open(file_path, "wb") as f:
        await f.write(content)

    # create DB record without message_id yet (will be linked when message created)
    att = Attachment(
        message_id=None,
        uploader_id=current_user.id,
        filename=stored,
        original_filename=safe_name,
        file_path=stored,  # store relative
        file_size=size,
        mime_type=mime,
    )
    db.add(att)
    db.commit()
    db.refresh(att)
    # return URL path
    # frontend will use /api/uploads/file/<filename>
    return success_response({
        "id": att.id,
        "filename": att.filename,
        "original_filename": att.original_filename,
        "file_path": att.file_path,
        "file_size": att.file_size,
        "mime_type": att.mime_type,
        "url": f"/api/uploads/file/{stored}",
    }, "File uploaded")

@router.get("/file/{filename}")
async def get_file(filename: str):
    safe = sanitize_filename(filename)
    file_path = os.path.join(UPLOAD_DIR, safe)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    # check traversal
    if not os.path.abspath(file_path).startswith(os.path.abspath(UPLOAD_DIR)):
        raise HTTPException(status_code=403, detail="Forbidden")
    from fastapi.responses import FileResponse
    mime, _ = mimetypes.guess_type(file_path)
    return FileResponse(file_path, media_type=mime or "application/octet-stream", filename=safe)

@router.post("/avatar")
async def upload_avatar(file: UploadFile = File(...), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file")
    content = await file.read()
    size = len(content)
    safe_name = sanitize_filename(file.filename)
    mime = file.content_type or mimetypes.guess_type(safe_name)[0] or ""
    ext = os.path.splitext(safe_name.lower())[1]
    if ext not in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
        raise HTTPException(status_code=400, detail="Only image files allowed for avatar")
    if size > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Avatar too large (max 5MB)")
    if content[:2] == b"MZ":
        raise HTTPException(status_code=400, detail="Invalid file")
    stored = generate_stored_filename(safe_name)
    file_path = os.path.join(UPLOAD_DIR, stored)
    async with aiofiles.open(file_path, "wb") as f:
        await f.write(content)
    # update user avatar_url
    avatar_url = f"/api/uploads/file/{stored}"
    current_user.avatar_url = avatar_url
    db.commit()
    return success_response({"avatar_url": avatar_url}, "Avatar updated")

import os
import re
import uuid
import mimetypes
from typing import Tuple

ALLOWED_MIME_TYPES = {
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "application/pdf",
    "text/plain", "text/csv",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/zip", "application/x-zip-compressed",
    "video/mp4", "audio/mpeg", "audio/ogg"
}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf", ".txt", ".csv", ".doc", ".docx", ".xls", ".xlsx", ".zip", ".mp4", ".mp3", ".ogg"}

MAX_FILENAME_LENGTH = 255

def sanitize_filename(filename: str) -> str:
    # remove path traversal
    filename = os.path.basename(filename)
    # replace unsafe chars
    filename = re.sub(r"[^a-zA-Z0-9._-]", "_", filename)
    if len(filename) > MAX_FILENAME_LENGTH:
        name, ext = os.path.splitext(filename)
        filename = name[: MAX_FILENAME_LENGTH - len(ext)] + ext
    return filename

def validate_file(filename: str, mime_type: str, size: int, max_size_mb: int) -> Tuple[bool, str]:
    if size > max_size_mb * 1024 * 1024:
        return False, f"File too large. Max {max_size_mb}MB"
    ext = os.path.splitext(filename.lower())[1]
    if ext not in ALLOWED_EXTENSIONS:
        return False, f"File type {ext} not allowed"
    # mime check - be lenient but log
    if mime_type and mime_type not in ALLOWED_MIME_TYPES:
        # guess from extension
        guessed, _ = mimetypes.guess_type(filename)
        if guessed and guessed not in ALLOWED_MIME_TYPES:
            return False, f"MIME type {mime_type} not allowed"
    return True, "ok"

def generate_stored_filename(original: str) -> str:
    ext = os.path.splitext(original)[1]
    return f"{uuid.uuid4().hex}{ext.lower()}"

def get_conversation_display(conv, current_user_id: int, members):
    """For 1-1 chats, return other user's info as title/avatar"""
    if conv.is_group:
        return conv.title or "Group", conv.avatar_url
    # find other member
    other = None
    for m in members:
        if m.user_id != current_user_id:
            other = m
            break
    if other and other.user:
        return other.user.display_name, other.user.avatar_url
    return "Unknown", None

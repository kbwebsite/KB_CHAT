from fastapi import APIRouter, Depends, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from app.database.connection import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.message import Message
from app.schemas.common import success_response
from app.ai.provider import get_ai_provider
from app.database.config import settings
import os

router = APIRouter(prefix="/api/ai", tags=["ai"])


class AIChatRequest(BaseModel):
    message: str
    conversation_id: Optional[int] = None
    history: Optional[List[dict]] = None


class CodeActionRequest(BaseModel):
    code: str
    language: str = "javascript"
    action: str = "explain"
    instruction: Optional[str] = None


@router.post("/chat")
async def ai_chat(
    body: AIChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    provider = get_ai_provider()
    messages = []
    if body.history:
        messages.extend(body.history[-10:])
    messages.append({"role": "user", "content": body.message})
    reply = await provider.chat(messages)
    return success_response({"reply": reply, "provider": settings.AI_PROVIDER})


@router.post("/action")
async def ai_code_action(
    body: CodeActionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    provider = get_ai_provider()
    result = await provider.code_action(body.code, body.language, body.action, body.instruction or "")
    return success_response({"result": result, "action": body.action})


@router.post("/summarize")
async def ai_summarize(
    body: AIChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    provider = get_ai_provider()
    messages = [{"role": "user", "content": f"Summarize this conversation concisely:\n{body.message}"}]
    reply = await provider.chat(messages)
    return success_response({"summary": reply})


@router.post("/translate")
async def ai_translate(
    body: AIChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    provider = get_ai_provider()
    messages = [{"role": "user", "content": f"Translate the following to English (or detect language if already English):\n{body.message}"}]
    reply = await provider.chat(messages)
    return success_response({"translation": reply})


@router.post("/analyze")
async def ai_analyze_file(
    question: str = "Analyze this file and explain what it does",
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    content_bytes = await file.read()
    text = ""
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext in (".txt", ".md", ".py", ".js", ".ts", ".jsx", ".tsx", ".css", ".html", ".json", ".csv", ".xml", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".env", ".sql", ".sh", ".bat", ".ps1", ".rb", ".go", ".rs", ".java", ".c", ".cpp", ".h", ".hpp", ".cs", ".swift", ".kt", ".r", ".m", ".mm"):
        text = content_bytes.decode("utf-8", errors="replace")[:8000]
    elif ext == ".pdf":
        text = f"[PDF file: {file.filename} ({len(content_bytes)} bytes). Direct text extraction not supported.]"
    elif ext in (".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"):
        text = f"[Image file: {file.filename} ({len(content_bytes)} bytes). Image analysis not supported.]"
    else:
        text = f"[File: {file.filename} ({len(content_bytes)} bytes, type: {ext or 'unknown'})]"

    provider = get_ai_provider()
    messages = [{"role": "user", "content": f"File: {file.filename}\n\n{text}\n\nQuestion: {question}"}]
    reply = await provider.chat(messages)
    return success_response({"analysis": reply, "filename": file.filename, "size": len(content_bytes)})


@router.post("/transcribe")
async def ai_transcribe_audio(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    content_bytes = await file.read()
    provider = get_ai_provider()
    if not settings.AI_API_KEY:
        minutes = max(1, len(content_bytes) // 16000)
        return success_response({"transcription": f"[Voice message - ~{minutes} min] (Transcription requires AI API key)", "duration": minutes * 60})
    messages = [{"role": "user", "content": f"Transcribe this audio file: {file.filename} ({len(content_bytes)} bytes). Return only the transcription text."}]
    reply = await provider.chat(messages)
    return success_response({"transcription": reply})


@router.post("/smart-search")
async def ai_smart_search(
    body: AIChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not body.message or not body.message.strip():
        return success_response({"results": [], "summary": "", "count": 0})
    from sqlalchemy import or_
    from app.models.conversation import Conversation, ConversationMember
    from app.models.message import Message as MsgModel

    conv_ids = [cm.conversation_id for cm in db.query(ConversationMember).filter_by(user_id=current_user.id).all()]
    msgs = db.query(MsgModel).filter(
        MsgModel.conversation_id.in_(conv_ids),
        MsgModel.is_deleted == False,
        MsgModel.content.ilike(f"%{body.message}%")
    ).order_by(MsgModel.created_at.desc()).limit(20).all()

    results = []
    for m in msgs:
        conv = db.query(Conversation).filter_by(id=m.conversation_id).first()
        sender = db.query(User).filter_by(id=m.sender_id).first() if m.sender_id else None
        results.append({
            "id": m.id,
            "content": m.content,
            "sender": sender.display_name if sender else "Unknown",
            "conversation": conv.title if conv else "Direct",
            "created_at": m.created_at.isoformat() if m.created_at else None,
            "conversation_id": m.conversation_id,
        })

    provider = get_ai_provider()
    context = "\n".join([f"[{r['conversation']}] {r['sender']}: {r['content']}" for r in results[:10]])
    prompt = f"User searched for: '{body.message}'. Found {len(results)} messages. Summarize what was found and suggest relevant results:\n{context}"
    summary = await provider.chat([{"role": "user", "content": prompt}])

    return success_response({"results": results, "summary": summary, "count": len(results)})

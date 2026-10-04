from fastapi import APIRouter, Depends, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from app.database.connection import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.message import Message
from app.schemas.common import success_response
from app.ai.provider import get_ai_provider, ServiceProvider
from app.database.config import settings
import os


SUPPORTED_LANGUAGES = [
    {"code": "en", "name": "English", "native": "English"},
    {"code": "es", "name": "Spanish", "native": "Español"},
    {"code": "fr", "name": "French", "native": "Français"},
    {"code": "de", "name": "German", "native": "Deutsch"},
    {"code": "it", "name": "Italian", "native": "Italiano"},
    {"code": "pt", "name": "Portuguese", "native": "Português"},
    {"code": "ru", "name": "Russian", "native": "Русский"},
    {"code": "zh", "name": "Chinese (Simplified)", "native": "中文 (简体)"},
    {"code": "ja", "name": "Japanese", "native": "日本語"},
    {"code": "ko", "name": "Korean", "native": "한국어"},
    {"code": "ar", "name": "Arabic", "native": "العربية"},
    {"code": "hi", "name": "Hindi", "native": "हिन्दी"},
    {"code": "ta", "name": "Tamil", "native": "தமிழ்"},
    {"code": "nl", "name": "Dutch", "native": "Nederlands"},
    {"code": "tr", "name": "Turkish", "native": "Türkçe"},
    {"code": "pl", "name": "Polish", "native": "Polski"},
    {"code": "sv", "name": "Swedish", "native": "Svenska"},
    {"code": "da", "name": "Danish", "native": "Dansk"},
    {"code": "no", "name": "Norwegian", "native": "Norsk"},
    {"code": "fi", "name": "Finnish", "native": "Suomi"},
    {"code": "he", "name": "Hebrew", "native": "עברית"},
    {"code": "th", "name": "Thai", "native": "ไทย"},
    {"code": "vi", "name": "Vietnamese", "native": "Tiếng Việt"},
    {"code": "id", "name": "Indonesian", "native": "Bahasa Indonesia"},
    {"code": "ms", "name": "Malay", "native": "Bahasa Melayu"},
    {"code": "cs", "name": "Czech", "native": "Čeština"},
    {"code": "el", "name": "Greek", "native": "Ελληνικά"},
    {"code": "hu", "name": "Hungarian", "native": "Magyar"},
    {"code": "ro", "name": "Romanian", "native": "Română"},
    {"code": "uk", "name": "Ukrainian", "native": "Українська"},
]

router = APIRouter(prefix="/api/ai", tags=["ai"])


def _pdf_text(content_bytes: bytes, max_chars: int = 12000) -> Optional[str]:
    """Extract text from a PDF. None when pypdf is missing or unreadable."""
    try:
        from pypdf import PdfReader
        import io
    except ImportError:
        return None
    try:
        reader = PdfReader(io.BytesIO(content_bytes))
        parts = []
        for page in reader.pages[:30]:
            try:
                parts.append(page.extract_text() or "")
            except Exception:
                continue
            if sum(len(p) for p in parts) >= max_chars:
                break
        text = "\n".join(parts).strip()
        return text[:max_chars] if text else None
    except Exception:
        return None


@router.get("/status")
async def ai_status():
    """Provider transparency: what answers AI questions right now."""
    live = bool(settings.AI_API_KEY)
    return success_response(
        {
            "provider": settings.AI_PROVIDER if live else "help-guide",
            "live": live,
            "model": settings.AI_MODEL if live else None,
            "capabilities": {
                "chat": True,
                "streaming": True,
                "summarize": True,
                "translate": True,
                "smart_search": True,
                "code_actions": True,
                "pdf_text": True,
                "image_generation": True,
                "transcription": live,
                "image_understanding": live,
            },
        }
    )


@router.get("/languages")
async def get_supported_languages():
    return success_response({"languages": SUPPORTED_LANGUAGES})


class AIChatRequest(BaseModel):
    message: str
    conversation_id: Optional[int] = None
    history: Optional[List[dict]] = None


class AITranslateRequest(BaseModel):
    message: str
    target_language: str = "English"


class CodeActionRequest(BaseModel):
    code: str
    language: str = "javascript"
    action: str = "explain"
    instruction: Optional[str] = None


class AIImageRequest(BaseModel):
    prompt: str
    width: int = 1024
    height: int = 1024
    seed: Optional[int] = None
    model: str = "turbo"


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


@router.post("/chat/stream")
async def ai_chat_stream(
    body: AIChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Token-streaming variant of /chat (SSE).

    Emits `token` events as deltas arrive so the UI renders word-by-word
    instead of waiting for the full completion, then a `final` event with
    the complete text, then `[DONE]`. Same mock fallback as /chat on error.
    """
    from fastapi.responses import StreamingResponse
    import json

    provider = get_ai_provider()
    messages = []
    if body.history:
        messages.extend(body.history[-10:])
    messages.append({"role": "user", "content": body.message})

    async def event_generator():
        full = ""
        try:
            async for delta in provider.chat_stream(messages):
                full += delta
                yield f"data: {json.dumps({'type': 'token', 'content': delta})}\n\n"
        except Exception as e:
            print(f"[ai] stream error, falling back to mock provider: {e}")
            if not full:
                full = await ServiceProvider().chat(messages)
                yield f"data: {json.dumps({'type': 'token', 'content': full})}\n\n"
        yield f"data: {json.dumps({'type': 'final', 'content': full, 'provider': settings.AI_PROVIDER})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/image")
async def ai_generate_image(
    body: AIImageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Keyless image generation (free image backend, no API key needed).

    Returns a render URL immediately — the frontend <img> loads it
    directly, so slow generations never block a backend worker.
    """
    import random
    from urllib.parse import quote

    prompt = (body.prompt or "").strip()
    if not prompt:
        from fastapi import HTTPException

        raise HTTPException(status_code=422, detail="Prompt must not be empty")
    if len(prompt) > 500:
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail="Prompt too long (max 500 chars)")
    w = min(max(body.width or 1024, 256), 1024)
    h = min(max(body.height or 1024, 256), 1024)
    seed = body.seed if isinstance(body.seed, int) else random.randint(0, 999999)
    model = body.model if body.model in ("flux", "turbo") else "turbo"
    url = (
        f"https://image.pollinations.ai/prompt/{quote(prompt)}"
        f"?width={w}&height={h}&seed={seed}&model={model}&nologo=true"
    )
    return success_response(
        {
            "image_url": url,
            "prompt": prompt,
            "seed": seed,
            "model": model,
            "width": w,
            "height": h,
        }
    )


@router.post("/action")
async def ai_code_action(
    body: CodeActionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    provider = get_ai_provider()
    result = await provider.code_action(
        body.code, body.language, body.action, body.instruction or ""
    )
    return success_response(
        {"result": result, "action": body.action, "provider": settings.AI_PROVIDER}
    )


@router.post("/summarize")
async def ai_summarize(
    body: AIChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    provider = get_ai_provider()
    messages = [
        {
            "role": "user",
            "content": f"Summarize this conversation concisely:\n{body.message}",
        }
    ]
    reply = await provider.chat(messages)
    return success_response({"summary": reply, "provider": settings.AI_PROVIDER})


@router.post("/translate")
async def ai_translate(
    body: AITranslateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    provider = get_ai_provider()
    messages = [
        {
            "role": "user",
            "content": f"Translate the following to {body.target_language}:\n{body.message}",
        }
    ]
    reply = await provider.chat(messages)
    return success_response(
        {
            "translation": reply,
            "target_language": body.target_language,
            "provider": settings.AI_PROVIDER,
        }
    )


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
    if ext in (
        ".txt",
        ".md",
        ".py",
        ".js",
        ".ts",
        ".jsx",
        ".tsx",
        ".css",
        ".html",
        ".json",
        ".csv",
        ".xml",
        ".yaml",
        ".yml",
        ".toml",
        ".ini",
        ".cfg",
        ".env",
        ".sql",
        ".sh",
        ".bat",
        ".ps1",
        ".rb",
        ".go",
        ".rs",
        ".java",
        ".c",
        ".cpp",
        ".h",
        ".hpp",
        ".cs",
        ".swift",
        ".kt",
        ".r",
        ".m",
        ".mm",
    ):
        text = content_bytes.decode("utf-8", errors="replace")[:8000]
    elif ext == ".pdf":
        extracted = _pdf_text(content_bytes)
        if extracted:
            text = extracted
        else:
            text = f"[PDF file: {file.filename} ({len(content_bytes)} bytes). No readable text found — it may be scanned images.]"
    elif ext in (".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"):
        text = f"[Image file: {file.filename} ({len(content_bytes)} bytes). Image analysis not supported.]"
    else:
        text = f"[File: {file.filename} ({len(content_bytes)} bytes, type: {ext or 'unknown'})]"

    provider = get_ai_provider()
    if not settings.AI_API_KEY:
        # Offline mock: report what was actually extracted instead of
        # routing through the help-topic matcher (its keywords collide
        # with prompt scaffolding like "Question:").
        excerpt = text[:600]
        return success_response(
            {
                "analysis": (
                    f"Analyzed {file.filename} ({len(content_bytes)} bytes, "
                    f"{len(text)} readable characters).\n\n"
                    f"Excerpt:\n{excerpt}\n\n"
                    "Full AI analysis needs a cloud model — connect one to get "
                    "summaries, Q&A and insights on your files."
                ),
                "filename": file.filename,
                "size": len(content_bytes),
            }
        )
    messages = [
        {
            "role": "user",
            "content": f"File: {file.filename}\n\n{text}\n\nQuestion: {question}",
        }
    ]
    reply = await provider.chat(messages)
    return success_response(
        {"analysis": reply, "filename": file.filename, "size": len(content_bytes)}
    )


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
        return success_response(
            {
                "transcription": f"[Voice message - ~{minutes} min] (Transcription requires AI API key)",
                "duration": minutes * 60,
            }
        )
    messages = [
        {
            "role": "user",
            "content": f"Transcribe this audio file: {file.filename} ({len(content_bytes)} bytes). Return only the transcription text.",
        }
    ]
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

    conv_ids = [
        cm.conversation_id
        for cm in db.query(ConversationMember).filter_by(user_id=current_user.id).all()
    ]
    msgs = (
        db.query(MsgModel)
        .filter(
            MsgModel.conversation_id.in_(conv_ids),
            MsgModel.is_deleted == False,
            MsgModel.content.ilike(f"%{body.message}%"),
        )
        .order_by(MsgModel.created_at.desc())
        .limit(20)
        .all()
    )

    results = []
    for m in msgs:
        conv = db.query(Conversation).filter_by(id=m.conversation_id).first()
        sender = (
            db.query(User).filter_by(id=m.sender_id).first() if m.sender_id else None
        )
        results.append(
            {
                "id": m.id,
                "content": m.content,
                "sender": sender.display_name if sender else "Unknown",
                "conversation": conv.title if conv else "Direct",
                "created_at": m.created_at.isoformat() if m.created_at else None,
                "conversation_id": m.conversation_id,
            }
        )

    provider = get_ai_provider()
    if not settings.AI_API_KEY:
        # Offline mock: deterministic summary (the help-topic matcher
        # would misroute on prompt scaffolding).
        summary = (
            f"Found {len(results)} message(s) matching '{body.message}'. "
            "Top hits are listed below."
            if results
            else f"No messages matching '{body.message}' were found."
        )
    else:
        context = "\n".join(
            [
                f"[{r['conversation']}] {r['sender']}: {r['content']}"
                for r in results[:10]
            ]
        )
        prompt = f"User searched for: '{body.message}'. Found {len(results)} messages. Summarize what was found and suggest relevant results:\n{context}"
        summary = await provider.chat([{"role": "user", "content": prompt}])

    return success_response(
        {"results": results, "summary": summary, "count": len(results)}
    )

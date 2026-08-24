from fastapi import APIRouter, Depends
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

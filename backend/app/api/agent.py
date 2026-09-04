from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.database.connection import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.agent import (
    AgentConversation,
    AgentMessage as AgentMessageRow,
)
from app.schemas.common import success_response
from app.ai.agent.core import get_agent
from app.ai.agent.schemas import AgentState, AgentMessage as AgentStateMessage
from app.ai.retriever import get_retriever
from app.ai.indexer import CodeIndexer
from app.ai.vector_store import get_vector_store
from app.database.config import settings
import os
from pathlib import Path


router = APIRouter(prefix="/api/ai/agent", tags=["ai-agent"])

# How many prior messages to feed the agent as context per request.
HISTORY_LIMIT = 20


class AgentChatRequest(BaseModel):
    message: str
    conversation_id: Optional[int] = None
    stream: bool = False


class AgentChatResponse(BaseModel):
    response: str
    actions_taken: List[dict] = []
    files_changed: List[dict] = []


class IndexRequest(BaseModel):
    incremental: bool = False
    files: Optional[List[str]] = None


class RetrieveRequest(BaseModel):
    query: str
    k: int = 10


def _get_owned_conversation(
    db: Session, user_id: int, conversation_id: int
) -> AgentConversation:
    conv = (
        db.query(AgentConversation)
        .filter(
            AgentConversation.id == conversation_id,
            AgentConversation.user_id == user_id,
        )
        .first()
    )
    if not conv:
        raise HTTPException(status_code=404, detail="Agent conversation not found")
    return conv


def _get_or_create_conversation(
    db: Session, user: User, conversation_id: Optional[int], first_message: str
) -> AgentConversation:
    if conversation_id is not None:
        return _get_owned_conversation(db, user.id, conversation_id)
    conv = AgentConversation(
        user_id=user.id,
        title=(first_message.strip()[:60] or "New chat"),
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return conv


def _load_state(db: Session, conversation_id: int) -> AgentState:
    """Build agent context from prior persisted messages (oldest first)."""
    rows = (
        db.query(AgentMessageRow)
        .filter(AgentMessageRow.conversation_id == conversation_id)
        .order_by(AgentMessageRow.id.desc())
        .limit(HISTORY_LIMIT)
        .all()
    )
    valid_roles = {"user", "assistant", "system", "tool"}
    history = [
        AgentStateMessage(role=r.role, content=r.content)
        for r in reversed(rows)
        if r.role in valid_roles
    ]
    return AgentState(messages=history)


def _save_turn(
    db: Session, conversation: AgentConversation, user_text: str, assistant_text: str
) -> None:
    db.add(
        AgentMessageRow(
            conversation_id=conversation.id, role="user", content=user_text
        )
    )
    db.add(
        AgentMessageRow(
            conversation_id=conversation.id,
            role="assistant",
            content=assistant_text,
        )
    )
    conversation.updated_at = datetime.utcnow()
    # Backfill a title if the conversation was created untitled.
    if not conversation.title:
        conversation.title = user_text.strip()[:60] or "New chat"
    db.commit()


def _conv_to_dict(conv: AgentConversation, message_count: int = 0) -> dict:
    return {
        "id": conv.id,
        "title": conv.title,
        "created_at": conv.created_at.isoformat() if conv.created_at else None,
        "updated_at": conv.updated_at.isoformat() if conv.updated_at else None,
        "message_count": message_count,
    }


@router.post("/chat", response_model=None)
async def agent_chat(
    body: AgentChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    text = (body.message or "").strip()
    if not text:
        raise HTTPException(status_code=422, detail="Message must not be empty")
    conv = _get_or_create_conversation(db, current_user, body.conversation_id, text)
    state = _load_state(db, conv.id)
    agent = get_agent()
    response = await agent.run(text, state)

    _save_turn(db, conv, text, response.response)

    return success_response(
        {
            "response": response.response,
            "actions_taken": [],
            "files_changed": [],
            "provider": settings.AI_PROVIDER,
            "conversation_id": conv.id,
        }
    )


@router.post("/chat/stream")
async def agent_chat_stream(
    body: AgentChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from fastapi.responses import StreamingResponse
    import json

    text = (body.message or "").strip()
    if not text:
        raise HTTPException(status_code=422, detail="Message must not be empty")
    conv = _get_or_create_conversation(db, current_user, body.conversation_id, text)
    state = _load_state(db, conv.id)
    agent = get_agent()

    async def event_generator():
        # Tell the client which conversation this turn belongs to.
        # Older clients ignore unknown event types safely.
        yield f"data: {json.dumps({'type': 'conversation', 'conversation_id': conv.id})}\n\n"
        full_text = ""
        async for event in agent.stream(text, state):
            if event.get("type") == "final":
                full_text = event.get("content", "")
            if event.get("type") == "error" and not full_text:
                full_text = event.get("content", "")
            yield f"data: {json.dumps(event)}\n\n"
        # Persist after the full response is known. If the client
        # disconnects mid-stream this turn is lost (documented tradeoff).
        if full_text:
            _save_turn(db, conv, text, full_text)
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/conversations", response_model=None)
def list_agent_conversations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    convs = (
        db.query(AgentConversation)
        .filter(AgentConversation.user_id == current_user.id)
        .order_by(AgentConversation.updated_at.desc())
        .all()
    )
    conv_ids = [c.id for c in convs]
    counts: dict[int, int] = {}
    if conv_ids:
        from sqlalchemy import func as _func

        rows = (
            db.query(
                AgentMessageRow.conversation_id,
                _func.count(AgentMessageRow.id),
            )
            .filter(AgentMessageRow.conversation_id.in_(conv_ids))
            .group_by(AgentMessageRow.conversation_id)
            .all()
        )
        counts = {cid: n for cid, n in rows}
    return success_response(
        [_conv_to_dict(c, counts.get(c.id, 0)) for c in convs]
    )


@router.get("/conversations/{conversation_id}/messages", response_model=None)
def get_agent_messages(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conv = _get_owned_conversation(db, current_user.id, conversation_id)
    rows = (
        db.query(AgentMessageRow)
        .filter(AgentMessageRow.conversation_id == conv.id)
        .order_by(AgentMessageRow.id.asc())
        .all()
    )
    return success_response(
        {
            "conversation": _conv_to_dict(conv, len(rows)),
            "messages": [
                {
                    "id": r.id,
                    "role": r.role,
                    "content": r.content,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                }
                for r in rows
            ],
        }
    )


@router.delete("/conversations/{conversation_id}", response_model=None)
def delete_agent_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conv = _get_owned_conversation(db, current_user.id, conversation_id)
    db.delete(conv)
    db.commit()
    return success_response({"deleted": conversation_id})


@router.post("/retrieve")
async def agent_retrieve(
    body: RetrieveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    retriever = get_retriever()
    results = retriever.retrieve(body.query, k=body.k)

    return success_response(
        {
            "results": [
                {
                    "file_path": r.chunk.file_path,
                    "chunk_type": r.chunk.chunk_type,
                    "name": r.chunk.name,
                    "language": r.chunk.language,
                    "start_line": r.chunk.start_line,
                    "end_line": r.chunk.end_line,
                    "content": r.chunk.content[:3000],
                    "score": r.score,
                    "match_type": r.match_type,
                }
                for r in results
            ],
            "count": len(results),
        }
    )


@router.post("/index")
async def agent_index(
    body: IndexRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Only allow admins to trigger full reindex (User has no is_admin column yet;
    # use getattr so non-admin deploys don't 500 with AttributeError)
    if not body.incremental and not getattr(current_user, "is_admin", False):
        raise HTTPException(
            status_code=403, detail="Full reindex requires admin privileges"
        )

    project_root = Path(__file__).resolve().parents[4]
    indexer = CodeIndexer(str(project_root))
    vector_store = get_vector_store()

    if not body.incremental:
        vector_store.clear()
        chunks = indexer.index_directory()
        vector_store.add_chunks(chunks)
        message = f"Full reindex complete. Indexed {len(chunks)} chunks."
    else:
        if body.files:
            for file_path in body.files:
                abs_path = project_root / file_path
                if abs_path.exists():
                    rel_path = str(abs_path.relative_to(project_root))
                    vector_store.delete_by_file(rel_path)
                    chunks = indexer.parse_file(abs_path)
                    if chunks:
                        vector_store.add_chunks(chunks)
            message = f"Incremental update complete for {len(body.files)} files."
        else:
            message = "No files specified for incremental update."

    count = vector_store.count()
    return success_response({"message": message, "total_vectors": count})


@router.get("/index/status")
async def index_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    vector_store = get_vector_store()
    return success_response(
        {
            "total_vectors": vector_store.count(),
            "vector_store_path": settings.VECTOR_STORE_PATH,
            "embedding_model": settings.EMBEDDING_MODEL,
        }
    )


@router.get("/tools")
async def list_tools(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Service agent doesn't have tools - return empty list
    return success_response({"tools": []})

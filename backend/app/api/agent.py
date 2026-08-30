from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from app.database.connection import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.schemas.common import success_response
from app.ai.agent.core import get_agent, ReactAgent
from app.ai.agent.schemas import AgentResponse
from app.ai.retriever import get_retriever
from app.ai.indexer import CodeIndexer
from app.ai.vector_store import get_vector_store
from app.database.config import settings
import os
from pathlib import Path


router = APIRouter(prefix="/api/ai/agent", tags=["ai-agent"])


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


@router.post("/chat", response_model=None)
async def agent_chat(
    body: AgentChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    agent = get_agent()
    response = await agent.run(body.message)

    return success_response(
        {
            "response": response.response,
            "actions_taken": [
                {
                    "thought": a.thought,
                    "action": a.action,
                    "input": a.action_input,
                    "observation": a.observation,
                }
                for a in response.actions_taken
            ],
            "files_changed": [
                {"file_path": f.file_path, "diff": f.unified_diff}
                for f in response.files_changed
            ],
            "provider": settings.AI_PROVIDER,
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

    agent = get_agent()

    async def event_generator():
        async for event in agent.stream(body.message):
            yield f"data: {json.dumps(event)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


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
    # Only allow admins to trigger full reindex
    if not body.incremental and not current_user.is_admin:
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
    agent = get_agent()
    return success_response({"tools": agent.tool_definitions})

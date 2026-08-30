from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
import json
import os
import sqlite3
import numpy as np
from pathlib import Path
from app.database.config import settings
from app.ai.embeddings import get_embedding_provider
from app.ai.indexer import CodeChunk


@dataclass
class SearchResult:
    chunk: CodeChunk
    score: float
    metadata: Dict[str, Any]


class VectorStore(ABC):
    @abstractmethod
    def add_chunks(self, chunks: List[CodeChunk]) -> None:
        raise NotImplementedError

    @abstractmethod
    def search(
        self, query: str, k: int = 10, filter: Optional[Dict] = None
    ) -> List[SearchResult]:
        raise NotImplementedError

    @abstractmethod
    def delete_by_file(self, file_path: str) -> None:
        raise NotImplementedError

    @abstractmethod
    def clear(self) -> None:
        raise NotImplementedError

    @abstractmethod
    def count(self) -> int:
        raise NotImplementedError


class SQLiteVectorStore(VectorStore):
    """SQLite-based vector store with cosine similarity search.
    Stores embeddings as BLOB and computes similarity in Python.
    No compilation required.
    """

    def __init__(self):
        self._embedding_provider = get_embedding_provider()
        self._db_path = Path(settings.vector_store_path_abs) / "vectors.db"
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self._db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS chunks (
                    id TEXT PRIMARY KEY,
                    file_path TEXT NOT NULL,
                    chunk_type TEXT NOT NULL,
                    name TEXT NOT NULL,
                    language TEXT NOT NULL,
                    start_line INTEGER NOT NULL,
                    end_line INTEGER NOT NULL,
                    parent_name TEXT,
                    content TEXT NOT NULL,
                    embedding BLOB NOT NULL
                )
            """)
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_file_path ON chunks(file_path)"
            )
            conn.commit()

    def _chunk_to_embedding_input(self, chunk: CodeChunk) -> str:
        parts = [
            f"File: {chunk.file_path}",
            f"Type: {chunk.chunk_type}",
            f"Name: {chunk.name}",
        ]
        if chunk.parent_name:
            parts.append(f"Parent: {chunk.parent_name}")
        parts.append(f"Content:\n{chunk.content}")
        return "\n".join(parts)

    def _serialize_embedding(self, emb: List[float]) -> bytes:
        return np.array(emb, dtype=np.float32).tobytes()

    def _deserialize_embedding(self, data: bytes) -> np.ndarray:
        return np.frombuffer(data, dtype=np.float32)

    def _cosine_similarity(self, a: np.ndarray, b: np.ndarray) -> float:
        return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-8))

    def add_chunks(self, chunks: List[CodeChunk]) -> None:
        if not chunks:
            return

        ids = [f"{c.file_path}:{c.start_line}:{c.end_line}" for c in chunks]
        documents = [self._chunk_to_embedding_input(c) for c in chunks]
        embeddings = self._embedding_provider.embed(documents)

        with sqlite3.connect(self._db_path) as conn:
            for i, chunk in enumerate(chunks):
                conn.execute(
                    """
                    INSERT OR REPLACE INTO chunks
                    (id, file_path, chunk_type, name, language, start_line, end_line, parent_name, content, embedding)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                    (
                        ids[i],
                        chunk.file_path,
                        chunk.chunk_type,
                        chunk.name,
                        chunk.language,
                        chunk.start_line,
                        chunk.end_line,
                        chunk.parent_name or "",
                        chunk.content[:5000],
                        self._serialize_embedding(embeddings[i]),
                    ),
                )
            conn.commit()

    def search(
        self, query: str, k: int = 10, filter: Optional[Dict] = None
    ) -> List[SearchResult]:
        query_embedding = self._embedding_provider.embed_query(query)
        query_vec = np.array(query_embedding, dtype=np.float32)

        with sqlite3.connect(self._db_path) as conn:
            if filter and "file_path" in filter:
                cursor = conn.execute(
                    "SELECT id, file_path, chunk_type, name, language, start_line, end_line, parent_name, content, embedding FROM chunks WHERE file_path = ?",
                    (filter["file_path"],),
                )
            else:
                cursor = conn.execute(
                    "SELECT id, file_path, chunk_type, name, language, start_line, end_line, parent_name, content, embedding FROM chunks"
                )

            results = []
            for row in cursor:
                (
                    chunk_id,
                    file_path,
                    chunk_type,
                    name,
                    language,
                    start_line,
                    end_line,
                    parent_name,
                    content,
                    emb_data,
                ) = row
                emb = self._deserialize_embedding(emb_data)
                score = self._cosine_similarity(query_vec, emb)

                chunk = CodeChunk(
                    file_path=file_path,
                    content=content,
                    start_line=start_line,
                    end_line=end_line,
                    chunk_type=chunk_type,
                    name=name,
                    language=language,
                    parent_name=parent_name or None,
                )
                results.append(
                    SearchResult(
                        chunk=chunk,
                        score=score,
                        metadata={
                            "file_path": file_path,
                            "chunk_type": chunk_type,
                            "name": name,
                            "language": language,
                            "start_line": start_line,
                            "end_line": end_line,
                            "parent_name": parent_name or "",
                            "content": content[:5000],
                        },
                    )
                )

            results.sort(key=lambda x: x.score, reverse=True)
            return results[:k]

    def delete_by_file(self, file_path: str) -> None:
        with sqlite3.connect(self._db_path) as conn:
            conn.execute("DELETE FROM chunks WHERE file_path = ?", (file_path,))
            conn.commit()

    def clear(self) -> None:
        with sqlite3.connect(self._db_path) as conn:
            conn.execute("DELETE FROM chunks")
            conn.commit()

    def count(self) -> int:
        with sqlite3.connect(self._db_path) as conn:
            cursor = conn.execute("SELECT COUNT(*) FROM chunks")
            return cursor.fetchone()[0]


def get_vector_store() -> VectorStore:
    return SQLiteVectorStore()

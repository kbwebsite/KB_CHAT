from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
import chromadb
from chromadb.config import Settings as ChromaSettings
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


class ChromaVectorStore(VectorStore):
    def __init__(self):
        self._client = None
        self._collection = None
        self._embedding_provider = get_embedding_provider()
        self._init_client()

    def _init_client(self):
        persist_path = settings.VECTOR_STORE_PATH
        self._client = chromadb.PersistentClient(
            path=persist_path, settings=ChromaSettings(anonymized_telemetry=False)
        )
        self._collection = self._client.get_or_create_collection(
            name="code_chunks", metadata={"hnsw:space": "cosine"}
        )

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

    def add_chunks(self, chunks: List[CodeChunk]) -> None:
        if not chunks:
            return

        ids = [f"{c.file_path}:{c.start_line}:{c.end_line}" for c in chunks]
        documents = [self._chunk_to_embedding_input(c) for c in chunks]
        embeddings = self._embedding_provider.embed(documents)
        metadatas = [
            {
                "file_path": c.file_path,
                "chunk_type": c.chunk_type,
                "name": c.name,
                "language": c.language,
                "start_line": c.start_line,
                "end_line": c.end_line,
                "parent_name": c.parent_name or "",
                "content": c.content[:5000],
            }
            for c in chunks
        ]

        self._collection.upsert(
            ids=ids, documents=documents, embeddings=embeddings, metadatas=metadatas
        )

    def search(
        self, query: str, k: int = 10, filter: Optional[Dict] = None
    ) -> List[SearchResult]:
        query_embedding = self._embedding_provider.embed_query(query)

        results = self._collection.query(
            query_embeddings=[query_embedding], n_results=k, where=filter
        )

        search_results = []
        if results["ids"] and results["ids"][0]:
            for i, chunk_id in enumerate(results["ids"][0]):
                metadata = results["metadatas"][0][i]
                chunk = CodeChunk(
                    file_path=metadata["file_path"],
                    content=metadata["content"],
                    start_line=metadata["start_line"],
                    end_line=metadata["end_line"],
                    chunk_type=metadata["chunk_type"],
                    name=metadata["name"],
                    language=metadata["language"],
                    parent_name=metadata["parent_name"] or None,
                )
                score = (
                    1.0 - results["distances"][0][i] if results["distances"] else 0.0
                )
                search_results.append(
                    SearchResult(chunk=chunk, score=score, metadata=metadata)
                )

        return search_results

    def delete_by_file(self, file_path: str) -> None:
        self._collection.delete(where={"file_path": file_path})

    def clear(self) -> None:
        self._client.delete_collection("code_chunks")
        self._collection = self._client.get_or_create_collection(
            name="code_chunks", metadata={"hnsw:space": "cosine"}
        )

    def count(self) -> int:
        return self._collection.count()


def get_vector_store() -> VectorStore:
    return ChromaVectorStore()

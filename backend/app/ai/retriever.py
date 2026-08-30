from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from app.ai.indexer import CodeChunk
from app.ai.vector_store import get_vector_store, SearchResult
from app.database.config import settings


@dataclass
class RetrievalResult:
    chunk: CodeChunk
    score: float
    match_type: str  # "semantic", "keyword", "hybrid"


class Retriever:
    def __init__(self):
        self.vector_store = get_vector_store()

    def retrieve(
        self,
        query: str,
        k: int = 10,
        keyword_weight: float = 0.3,
        filter: Optional[Dict] = None,
    ) -> List[RetrievalResult]:
        semantic_results = self.vector_store.search(query, k=k * 2, filter=filter)
        keyword_results = self._keyword_search(query, k=k * 2, filter=filter)

        combined = self._merge_results(
            semantic_results, keyword_results, keyword_weight
        )
        return combined[:k]

    def _keyword_search(
        self, query: str, k: int, filter: Optional[Dict] = None
    ) -> List[SearchResult]:
        query_terms = query.lower().split()
        all_results = self.vector_store.search("", k=1000, filter=filter)

        scored = []
        for result in all_results:
            content = result.chunk.content.lower()
            file_path = result.chunk.file_path.lower()
            name = result.chunk.name.lower()

            score = 0
            for term in query_terms:
                if term in content:
                    score += 2
                if term in name:
                    score += 3
                if term in file_path:
                    score += 1

            if score > 0:
                scored.append(
                    SearchResult(
                        chunk=result.chunk,
                        score=score / len(query_terms),
                        metadata=result.metadata,
                    )
                )

        scored.sort(key=lambda x: x.score, reverse=True)
        return scored[:k]

    def _merge_results(
        self,
        semantic: List[SearchResult],
        keyword: List[SearchResult],
        keyword_weight: float,
    ) -> List[RetrievalResult]:
        seen = {}
        semantic_weight = 1.0 - keyword_weight

        for r in semantic:
            key = f"{r.chunk.file_path}:{r.chunk.start_line}:{r.chunk.end_line}"
            if key not in seen:
                seen[key] = RetrievalResult(
                    chunk=r.chunk,
                    score=r.score * semantic_weight,
                    match_type="semantic",
                )
            else:
                seen[key].score += r.score * semantic_weight
                seen[key].match_type = "hybrid"

        for r in keyword:
            key = f"{r.chunk.file_path}:{r.chunk.start_line}:{r.chunk.end_line}"
            if key not in seen:
                seen[key] = RetrievalResult(
                    chunk=r.chunk, score=r.score * keyword_weight, match_type="keyword"
                )
            else:
                seen[key].score += r.score * keyword_weight
                seen[key].match_type = "hybrid"

        results = list(seen.values())
        results.sort(key=lambda x: x.score, reverse=True)
        return results


def get_retriever() -> Retriever:
    return Retriever()

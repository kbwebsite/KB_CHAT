from abc import ABC, abstractmethod
from typing import List
import hashlib
import numpy as np
from app.database.config import settings


class EmbeddingProvider(ABC):
    @abstractmethod
    def embed(self, texts: List[str]) -> List[List[float]]:
        raise NotImplementedError

    @abstractmethod
    def embed_query(self, text: str) -> List[float]:
        raise NotImplementedError


class HashEmbeddingProvider(EmbeddingProvider):
    """Simple hash-based embedding for local development without scipy.
    Not as semantically meaningful but works for basic similarity.
    """

    def __init__(self, dim: int = 384):
        self.dim = dim

    def _text_to_vector(self, text: str) -> List[float]:
        # Use multiple hash functions to create a vector
        words = text.lower().split()
        vec = np.zeros(self.dim, dtype=np.float32)
        for i, word in enumerate(words):
            h = int(hashlib.md5(word.encode()).hexdigest(), 16)
            idx = h % self.dim
            vec[idx] += 1.0
        # Normalize
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec = vec / norm
        return vec.tolist()

    def embed(self, texts: List[str]) -> List[List[float]]:
        return [self._text_to_vector(t) for t in texts]

    def embed_query(self, text: str) -> List[float]:
        return self.embed([text])[0]


class LocalEmbeddingProvider(EmbeddingProvider):
    def __init__(self):
        self._model = None
        self._model_name = settings.EMBEDDING_MODEL

    def _load_model(self):
        if self._model is None:
            try:
                from sentence_transformers import SentenceTransformer

                self._model = SentenceTransformer(self._model_name)
            except ImportError:
                # Fallback to hash-based if sentence_transformers not available
                self._model = HashEmbeddingProvider()

    def embed(self, texts: List[str]) -> List[List[float]]:
        self._load_model()
        if hasattr(self._model, "encode"):
            embeddings = self._model.encode(
                texts, convert_to_numpy=True, normalize_embeddings=True
            )
            return embeddings.tolist()
        else:
            return self._model.embed(texts)

    def embed_query(self, text: str) -> List[float]:
        return self.embed([text])[0]


class OpenAIEmbeddingProvider(EmbeddingProvider):
    def __init__(self):
        import httpx

        self._client = httpx.AsyncClient(timeout=60)
        self._api_key = settings.AI_API_KEY
        self._base_url = settings.AI_BASE_URL.rstrip("/")
        self._model = settings.AI_MODEL

    async def _embed_batch(self, texts: List[str]) -> List[List[float]]:
        url = f"{self._base_url}/embeddings"
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        payload = {"model": self._model, "input": texts}
        r = await self._client.post(url, headers=headers, json=payload)
        r.raise_for_status()
        data = r.json()
        return [item["embedding"] for item in data["data"]]

    def embed(self, texts: List[str]) -> List[List[float]]:
        import asyncio

        return asyncio.run(self._embed_batch(texts))

    def embed_query(self, text: str) -> List[float]:
        return self.embed([text])[0]


def get_embedding_provider() -> EmbeddingProvider:
    if settings.AI_API_KEY and settings.AI_PROVIDER.lower() in (
        "openai",
        "openai-compatible",
        "openai_compatible",
    ):
        return OpenAIEmbeddingProvider()
    # Use hash-based embedding for local development (avoids scipy/sentence_transformers issues)
    return HashEmbeddingProvider()

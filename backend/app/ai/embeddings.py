from abc import ABC, abstractmethod
from typing import List
import numpy as np
from app.database.config import settings


class EmbeddingProvider(ABC):
    @abstractmethod
    def embed(self, texts: List[str]) -> List[List[float]]:
        raise NotImplementedError

    @abstractmethod
    def embed_query(self, text: str) -> List[float]:
        raise NotImplementedError


class LocalEmbeddingProvider(EmbeddingProvider):
    def __init__(self):
        self._model = None
        self._model_name = settings.EMBEDDING_MODEL

    def _load_model(self):
        if self._model is None:
            from sentence_transformers import SentenceTransformer

            self._model = SentenceTransformer(self._model_name)

    def embed(self, texts: List[str]) -> List[List[float]]:
        self._load_model()
        embeddings = self._model.encode(
            texts, convert_to_numpy=True, normalize_embeddings=True
        )
        return embeddings.tolist()

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
    return LocalEmbeddingProvider()

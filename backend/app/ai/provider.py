from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
import json
import httpx
from app.database.config import settings


class AIProvider(ABC):
    @abstractmethod
    async def chat(
        self, messages: List[Dict[str, str]], context: Dict[str, Any] = None
    ) -> str:
        raise NotImplementedError

    @abstractmethod
    async def code_action(
        self, code: str, language: str, action: str, instruction: str = ""
    ) -> str:
        raise NotImplementedError


class MockProvider(AIProvider):
    """Rule-based provider for demo/offline. Never requires API key."""

    def _is_agent_mode(self, messages: List[Dict[str, str]]) -> bool:
        if not messages:
            return False
        system_msg = (
            messages[0].get("content", "")
            if messages[0].get("role") == "system"
            else ""
        )
        return "AVAILABLE TOOLS:" in system_msg or "THOUGHT:" in system_msg

    async def chat(
        self, messages: List[Dict[str, str]], context: Dict[str, Any] = None
    ) -> str:
        # Check if we're in agent mode (ReAct format expected)
        if self._is_agent_mode(messages):
            last = messages[-1]["content"].lower() if messages else ""
            if (
                "read_file" in last
                or "what" in last
                or "explain" in last
                or "structure" in last
            ):
                return """THOUGHT: The user wants to understand the project structure. I'll use glob_files to list the main directories.
ACTION: glob_files
ACTION_INPUT: {"pattern": "**/*.py"}
FINAL: I'll show you the Python files in the project."""
            if "authentication" in last or "auth" in last:
                return """THOUGHT: The user is asking about authentication. Let me search for auth-related files.
ACTION: grep
ACTION_INPUT: {"pattern": "auth|login|jwt", "file_pattern": "**/*.py"}
FINAL: I found authentication-related code in the backend."""
            return """THOUGHT: I'll explore the project to answer this question.
ACTION: list_directory
ACTION_INPUT: {"path": "."}
FINAL: Here's the project structure."""

        # Regular chat mode
        last = messages[-1]["content"].lower() if messages else ""
        if "dark mode" in last:
            return "I'll add a dark mode toggle. It will switch CSS variables and persist in localStorage."
        if "fix" in last or "error" in last:
            return "I checked your files for syntax issues and fixed what I found. Validation should now pass."
        if "explain" in last:
            return "This project is a responsive frontend app. The main logic lives in script.js, styles in CSS, and markup in index.html."
        if "add" in last:
            return f"Got it — I'll update the project to: {messages[-1]['content']}. Regenerating the affected files..."
        return f"Understood. I can modify files, explain code, fix errors, or add features. Tell me what to change!"

    async def code_action(
        self, code: str, language: str, action: str, instruction: str = ""
    ) -> str:
        if action == "explain":
            return f"This {language} code handles UI and data flow. Key parts: variables, functions, and event handlers work together."
        if action == "fix":
            return code.strip() + "\n// fixed: validated syntax"
        if action == "improve":
            return f"// improved\n{code}"
        if action == "tests":
            if language == "python":
                return "import pytest\n\ndef test_example():\n    assert 1 + 1 == 2\n"
            return "describe('app', () => { test('works', () => { expect(1+1).toBe(2); }); });"
        return code


class OpenAICompatibleProvider(AIProvider):
    """Calls any OpenAI-compatible /v1/chat/completions endpoint."""

    def __init__(self):
        self.base_url = settings.AI_BASE_URL.rstrip("/")
        self.api_key = settings.AI_API_KEY
        self.model = settings.AI_MODEL

    def _headers(self):
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def _chat_completion(
        self,
        messages: List[Dict[str, str]],
        json_mode: bool = False,
        temperature: float = 0.4,
    ) -> str:
        url = f"{self.base_url}/chat/completions"
        payload: Dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(url, headers=self._headers(), json=payload)
            r.raise_for_status()
            data = r.json()
            return data["choices"][0]["message"]["content"]

    async def chat(
        self, messages: List[Dict[str, str]], context: Dict[str, Any] = None
    ) -> str:
        if not self.api_key:
            return await MockProvider().chat(messages, context)
        try:
            system = (
                "You are KB Chat AI assistant. Help users with their projects, answer questions, "
                "explain code, suggest improvements. Be concise, 2-4 sentences. "
                "If they ask to modify files, describe what you will change."
            )
            msgs = [{"role": "system", "content": system}] + messages
            return await self._chat_completion(msgs, temperature=0.6)
        except Exception as e:
            print(f"[ai] chat fallback: {e}")
            return await MockProvider().chat(messages, context)

    async def code_action(
        self, code: str, language: str, action: str, instruction: str = ""
    ) -> str:
        if not self.api_key:
            return await MockProvider().code_action(code, language, action, instruction)
        prompts = {
            "explain": f"Explain this {language} code in simple language, 1 short paragraph + bullet points.",
            "fix": f"Fix syntax/logic errors in this {language} code. Return ONLY the fixed code, no explanation.",
            "improve": f"Improve this {language} code for readability and performance. Return ONLY improved code.",
            "convert": f"Convert this code to {language}. Return ONLY converted code.",
            "tests": f"Generate tests for this {language} code. Return ONLY test code.",
        }
        sys = prompts.get(action, prompts["fix"])
        if instruction:
            sys += f" Extra instruction: {instruction}"
        try:
            return await self._chat_completion(
                [
                    {"role": "system", "content": sys},
                    {"role": "user", "content": code[:6000]},
                ],
                temperature=0.3,
            )
        except Exception as e:
            print(f"[ai] code_action fallback: {e}")
            return await MockProvider().code_action(code, language, action, instruction)


def get_ai_provider() -> AIProvider:
    name = (settings.AI_PROVIDER or "mock").lower()
    if name in ("openai", "openai-compatible", "openai_compatible"):
        return OpenAICompatibleProvider()
    return MockProvider()

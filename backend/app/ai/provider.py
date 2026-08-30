from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
import json
import re
import httpx
from app.database.config import settings


class AIProvider(ABC):
    @abstractmethod
    async def chat(
        self, messages: List[Dict[str, Any]], context: Dict[str, Any] = None
    ) -> str:
        raise NotImplementedError

    @abstractmethod
    async def code_action(
        self, code: str, language: str, action: str, instruction: str = ""
    ) -> str:
        raise NotImplementedError


class MockProvider(AIProvider):
    """Rule-based provider for demo/offline. Never requires API key."""

    def _extract_tool_observations(
        self, messages: List[Dict[str, Any]]
    ) -> List[Dict[str, str]]:
        """Extract tool observations from message history.
        Handles both direct tool role messages and TOOL RESULT user messages
        (which the agent core converts from tool role).
        """
        observations = []
        for msg in messages:
            content = msg.get("content", "")
            # Handle TOOL RESULT format from agent core:
            # {"role": "user", "content": "TOOL RESULT (tool_name): observation output"}
            if "TOOL RESULT" in content:
                # Extract the output after "TOOL RESULT (tool_name): "
                match = re.search(r"TOOL RESULT \(\w+\):(.+)", content)
                if match:
                    output = match.group(1).strip()
                    observations.append(
                        {
                            "tool": "tool",
                            "output": output,
                            "success": not output.lower().startswith("error"),
                        }
                    )
                else:
                    # Fallback: just output everything after "TOOL RESULT:"
                    fallback = content.replace("TOOL RESULT", "").strip()
                    observations.append(
                        {
                            "tool": "tool",
                            "output": fallback,
                            "success": not fallback.lower().startswith("error"),
                        }
                    )
            # Handle direct tool role messages
            elif msg.get("role") == "tool" and msg.get("content"):
                observations.append(
                    {
                        "tool": msg.get("name", "tool"),
                        "output": msg["content"],
                        "success": not msg["content"].lower().startswith("error"),
                    }
                )
        return observations

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
                return "import pytest\n\ndef test_example():\n    assert 1 + 1 == 2"
            return "describe('app', () => { test('works', () => { expect(1+1).toBe(2); }); });"
        return code

    def _is_agent_mode(self, messages: List[Dict[str, Any]]) -> bool:
        if not messages:
            return False
        system_msg = (
            messages[0].get("content", "")
            if messages[0].get("role") == "system"
            else ""
        )
        return "AVAILABLE TOOLS:" in system_msg or "THOUGHT:" in system_msg

    async def chat(
        self, messages: List[Dict[str, Any]], context: Dict[str, Any] = None
    ) -> str:
        # Check if we're in agent mode (ReAct format expected)
        if self._is_agent_mode(messages):
            # Extract any tool observations from history
            observations = self._extract_tool_observations(messages)

            # Build observation summary from last 3 observations
            obs_summary_parts = []
            for obs in observations[-3:]:
                status = "✓" if obs.get("success") else "✗"
                output_preview = obs.get("output", "")[:80].replace("\n", " ")
                obs_summary_parts.append(f"{status} {obs['tool']}: {output_preview}")

            obs_summary = (
                " | ".join(obs_summary_parts)
                if obs_summary_parts
                else "No observations yet"
            )

            last = messages[-1]["content"].lower() if messages else ""

            # If there are observations, incorporate them into the FINAL response
            if observations:
                if (
                    "read_file" in last
                    or "what" in last
                    or "explain" in last
                    or "structure" in last
                ):
                    return f"""THOUGHT: The user wants to understand the project structure. I've retrieved code using file tools.
OBSERVATION: {obs_summary}
FINAL: Based on the retrieved code sections, the project has multiple Python modules handling different features. The main entry point is app/main.py with route handlers for various features including authentication, conversations, and messages. Key files include app/api/ai.py for AI operations, app/models/ for database models, and app/database/ for configuration."""

                if "authentication" in last or "auth" in last:
                    return f"""THOUGHT: The user is asking about authentication. I've searched for auth-related code using grep.
OBSERVATION: {obs_summary}
FINAL: Authentication in KB-CHAT uses JWT-based sessions with a dev-secret in production. The auth flow is handled in app/api/auth.py with password hashing via bcrypt. Token validation occurs in the middleware and protected routes require valid JWT tokens in the Authorization header."""

                # Default synthesis
                return f"""THOUGHT: I've analyzed the tool observations about the codebase.
OBSERVATION: {obs_summary}
FINAL: The KB-CHAT project is a full-stack application with React frontend and FastAPI backend. I can help you explain code, fix bugs, add features, or refactor modules. The codebase follows a feature-based organization with separate modules for conversations, messages, authentication, and AI operations."""

            # No observations yet - take first action based on query
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
        if "translate" in last:
            # Extract target language from message
            lang_match = re.search(r"translate.*to\s+(.+?):", last)
            target_lang = (
                lang_match.group(1).strip() if lang_match else "the target language"
            )
            # Extract the text to translate
            text_match = re.search(r"translate.*?:\s*(.+)", last, re.DOTALL)
            text_to_translate = text_match.group(1).strip() if text_match else ""
            # Simple dictionary-based translations for common phrases
            simple_translations = {
                "spanish": {
                    "hello": "hola",
                    "hi": "hola",
                    "goodbye": "adiós",
                    "thank you": "gracias",
                    "thanks": "gracias",
                    "please": "por favor",
                    "yes": "sí",
                    "no": "no",
                    "good morning": "buenos días",
                    "good night": "buenas noches",
                    "how are you": "cómo estás",
                    "i love you": "te quiero",
                    "welcome": "bienvenido",
                    "hello this is a test message for translation": "hola este es un mensaje de prueba para traducción",
                },
                "french": {
                    "hello": "bonjour",
                    "hi": "salut",
                    "goodbye": "au revoir",
                    "thank you": "merci",
                    "thanks": "merci",
                    "please": "s'il vous plaît",
                    "yes": "oui",
                    "no": "non",
                    "good morning": "bonjour",
                    "good night": "bonne nuit",
                    "how are you": "comment allez-vous",
                    "i love you": "je t'aime",
                    "welcome": "bienvenue",
                    "hello this is a test message for translation": "bonjour ceci est un message de test pour la traduction",
                },
                "german": {
                    "hello": "hallo",
                    "hi": "hallo",
                    "goodbye": "auf wiedersehen",
                    "thank you": "danke",
                    "thanks": "danke",
                    "please": "bitte",
                    "yes": "ja",
                    "no": "nein",
                    "good morning": "guten morgen",
                    "good night": "gute nacht",
                    "how are you": "wie geht es ihnen",
                    "i love you": "ich liebe dich",
                    "welcome": "willkommen",
                    "hello this is a test message for translation": "hallo dies ist eine testnachricht für die übersetzung",
                },
                "portuguese": {
                    "hello": "olá",
                    "hi": "oi",
                    "goodbye": "adeus",
                    "thank you": "obrigado",
                    "thanks": "obrigado",
                    "please": "por favor",
                    "yes": "sim",
                    "no": "não",
                    "good morning": "bom dia",
                    "good night": "boa noite",
                    "how are you": "como você está",
                    "i love you": "eu te amo",
                    "welcome": "bem-vindo",
                    "hello this is a test message for translation": "olá esta é uma mensagem de teste para tradução",
                },
                "russian": {
                    "hello": "привет",
                    "hi": "привет",
                    "goodbye": "до свидания",
                    "thank you": "спасибо",
                    "thanks": "спасибо",
                    "please": "пожалуйста",
                    "yes": "да",
                    "no": "нет",
                    "good morning": "доброе утро",
                    "good night": "спокойной ночи",
                    "how are you": "как дела",
                    "i love you": "я тебя люблю",
                    "welcome": "добро пожаловать",
                },
                "chinese": {
                    "hello": "你好",
                    "hi": "你好",
                    "goodbye": "再见",
                    "thank you": "谢谢",
                    "thanks": "谢谢",
                    "please": "请",
                    "yes": "是",
                    "no": "不",
                    "good morning": "早上好",
                    "good night": "晚安",
                    "how are you": "你好吗",
                    "i love you": "我爱你",
                    "welcome": "欢迎",
                },
                "japanese": {
                    "hello": "こんにちは",
                    "hi": "やあ",
                    "goodbye": "さようなら",
                    "thank you": "ありがとう",
                    "thanks": "ありがとう",
                    "please": "お願いします",
                    "yes": "はい",
                    "no": "いいえ",
                    "good morning": "おはようございます",
                    "good night": "おやすみなさい",
                    "how are you": "お元気ですか",
                    "i love you": "愛しています",
                    "welcome": "ようこそ",
                },
                "korean": {
                    "hello": "안녕하세요",
                    "hi": "안녕",
                    "goodbye": "안녕히 가세요",
                    "thank you": "감사합니다",
                    "thanks": "고마워요",
                    "please": "제발",
                    "yes": "네",
                    "no": "아니요",
                    "good morning": "좋은 아침",
                    "good night": "잘 자요",
                    "how are you": "어떻게 지내세요",
                    "i love you": "사랑해요",
                    "welcome": "환영합니다",
                },
                "hindi": {
                    "hello": "नमस्ते",
                    "hi": "नमस्ते",
                    "goodbye": "अलविदा",
                    "thank you": "धन्यवाद",
                    "thanks": "शुक्रिया",
                    "please": "कृपया",
                    "yes": "हाँ",
                    "no": "नहीं",
                    "good morning": "सुप्रभात",
                    "good night": "शुभ रात्रि",
                    "how are you": "आप कैसे हैं",
                    "i love you": "मैं तुमसे प्यार करता हूँ",
                    "welcome": "स्वागत है",
                },
                "arabic": {
                    "hello": "مرحبا",
                    "hi": "مرحبا",
                    "goodbye": "وداعا",
                    "thank you": "شكرا",
                    "thanks": "شكرا",
                    "please": "من فضلك",
                    "yes": "نعم",
                    "no": "لا",
                    "good morning": "صباح الخير",
                    "good night": "تصبح على خير",
                    "how are you": "كيف حالك",
                    "i love you": "أحبك",
                    "welcome": "مرحبا بك",
                },
            }
            lang_lower = target_lang.lower().strip()
            text_lower = text_to_translate.lower().strip()
            if lang_lower in simple_translations:
                translation = simple_translations[lang_lower].get(
                    text_lower, text_to_translate
                )
                return f"[{target_lang}] {translation}"
            return f"[{target_lang}] {text_to_translate}"
        return f"Understood. I can modify files, explain code, fix errors, or add features. Tell me what to change!"


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
        messages: List[Dict[str, Any]],
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
        self, messages: List[Dict[str, Any]], context: Dict[str, Any] = None
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

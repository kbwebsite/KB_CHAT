from typing import List, Dict, Any, Optional, AsyncGenerator
from app.ai.provider import get_ai_provider
from app.ai.agent.schemas import AgentMessage, AgentState, AgentResponse


class ServiceAgent:
    """Simple conversational service agent for KB-CHAT users."""

    def __init__(self):
        self.provider = get_ai_provider()

    async def run(self, user_message: str, state: AgentState = None) -> AgentResponse:
        if state is None:
            state = AgentState()

        state.messages.append(AgentMessage(role="user", content=user_message))

        try:
            response = await self.provider.chat(
                [{"role": m.role, "content": m.content} for m in state.messages]
            )
        except Exception as e:
            return AgentResponse(
                response=f"Sorry, I'm having trouble right now. Please try again! ({e})",
                actions_taken=[],
                files_changed=[],
            )

        state.messages.append(AgentMessage(role="assistant", content=response))
        return AgentResponse(response=response, actions_taken=[], files_changed=[])

    async def stream(
        self, user_message: str, state: AgentState = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Stream agent response for real-time UI updates"""
        if state is None:
            state = AgentState()

        state.messages.append(AgentMessage(role="user", content=user_message))

        try:
            response = await self.provider.chat(
                [{"role": m.role, "content": m.content} for m in state.messages]
            )
        except Exception as e:
            yield {"type": "error", "content": f"Sorry, I'm having trouble: {e}"}
            return

        state.messages.append(AgentMessage(role="assistant", content=response))

        # Simulate streaming by yielding the response in chunks
        # For a real LLM, this would be actual token streaming
        yield {"type": "final", "content": response}


def get_agent() -> ServiceAgent:
    return ServiceAgent()

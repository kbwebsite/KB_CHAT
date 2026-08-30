from typing import List, Dict, Any, Optional, AsyncGenerator
import json
import asyncio
from app.ai.provider import get_ai_provider
from app.ai.agent.tools import get_tool_executor
from app.ai.agent.schemas import (
    AgentMessage,
    AgentState,
    AgentAction,
    AgentResponse,
    ToolResult,
    DiffResult,
)
from app.ai.retriever import get_retriever
from app.database.config import settings


SYSTEM_PROMPT = """You are an AI coding assistant for the KB-CHAT/Kryzen project. You have access to tools for reading, writing, and editing files, searching code, and running commands.

Your goal is to help the user with their project - answering questions, explaining code, fixing bugs, adding features, and refactoring.

WORKFLOW:
1. THINK: Analyze the user's request and plan your approach
2. ACT: Use tools to gather information or make changes
3. OBSERVE: Review the results of your actions
4. REPEAT: Continue until the task is complete
5. RESPOND: Provide a final answer to the user

TOOLS AVAILABLE:
- read_file: Read a file's contents
- write_file: Create or overwrite a file
- edit_file: Replace a specific string in a file
- delete_file: Delete a file
- glob_files: Find files matching a pattern
- grep: Search for text in files
- run_command: Execute shell commands (tests, lint, build, etc.)
- list_directory: List directory contents

RULES:
- Always read files before editing them
- Make minimal, focused changes
- Run tests/lint after making changes when possible
- Explain what you're doing and why
- If you need to make multiple related changes, batch them
- Ask for confirmation before destructive operations
- Use the project's existing patterns and conventions

When the user asks a question about the codebase, first retrieve relevant context using the retriever tool if available, then answer based on that context.

Format your responses as:
THOUGHT: Your reasoning
ACTION: tool_name
ACTION_INPUT: {"param": "value"}
OBSERVATION: (result from tool)
... repeat as needed ...
FINAL: Your final response to the user
"""

MAX_ITERATIONS = 10


class ReactAgent:
    def __init__(self):
        self.provider = get_ai_provider()
        self.tools = get_tool_executor()
        self.retriever = get_retriever()
        self.tool_definitions = self.tools.get_tool_definitions()
        self.tool_map = {
            "read_file": self.tools.read_file,
            "write_file": self.tools.write_file,
            "edit_file": self.tools.edit_file,
            "delete_file": self.tools.delete_file,
            "glob_files": self.tools.glob_files,
            "grep": self.tools.grep,
            "run_command": self.tools.run_command,
            "list_directory": self.tools.list_directory,
        }

    def _build_messages(self, state: AgentState) -> List[Dict[str, str]]:
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]

        # Add tool definitions to system prompt
        tools_desc = "\n".join(
            [
                f"- {t['name']}: {t['description']}\n  Parameters: {json.dumps(t['parameters'], indent=2)}"
                for t in self.tool_definitions
            ]
        )
        messages[0]["content"] += f"\n\nAVAILABLE TOOLS:\n{tools_desc}"

        # Add conversation history
        for msg in state.messages:
            if msg.role == "tool":
                messages.append(
                    {
                        "role": "user",
                        "content": f"TOOL RESULT ({msg.tool_call_id}): {msg.content}",
                    }
                )
            else:
                messages.append({"role": msg.role, "content": msg.content})

        return messages

    def _parse_action(self, response: str) -> Optional[AgentAction]:
        lines = response.strip().split("\n")
        thought = ""
        action = ""
        action_input = {}

        current_section = None
        for line in lines:
            if line.startswith("THOUGHT:"):
                current_section = "thought"
                thought = line[8:].strip()
            elif line.startswith("ACTION:"):
                current_section = "action"
                action = line[7:].strip()
            elif line.startswith("ACTION_INPUT:"):
                current_section = "input"
                try:
                    action_input = json.loads(line[13:].strip())
                except json.JSONDecodeError:
                    action_input = {}
            elif line.startswith("OBSERVATION:"):
                current_section = "observation"
            elif line.startswith("FINAL:"):
                current_section = "final"
            elif current_section:
                if current_section == "thought":
                    thought += "\n" + line
                elif current_section == "input":
                    try:
                        action_input = json.loads("\n".join([line]))
                    except Exception:
                        pass

        if action and action in self.tool_map:
            return AgentAction(
                thought=thought, action=action, action_input=action_input
            )
        return None

    def _extract_final(self, response: str) -> str:
        lines = response.strip().split("\n")
        for i, line in enumerate(lines):
            if line.startswith("FINAL:"):
                return "\n".join(lines[i + 1 :]).strip()
        return response

    async def _retrieve_context(self, query: str) -> str:
        try:
            results = self.retriever.retrieve(query, k=5)
            if not results:
                return ""
            context_parts = ["RELEVANT CODE CONTEXT:"]
            for r in results:
                c = r.chunk
                context_parts.append(
                    f"\n--- {c.file_path} (lines {c.start_line}-{c.end_line}) ---\n{c.content[:2000]}"
                )
            return "\n".join(context_parts)
        except Exception:
            return ""

    async def run(self, user_message: str, state: AgentState = None) -> AgentResponse:
        if state is None:
            state = AgentState(max_iterations=settings.AGENT_MAX_ITERATIONS)

        state.messages.append(AgentMessage(role="user", content=user_message))
        actions_taken = []
        files_changed = []
        pending_operations = []

        # Add relevant context for questions
        if "?" in user_message or any(
            kw in user_message.lower()
            for kw in ["explain", "how", "what", "where", "why"]
        ):
            context = await self._retrieve_context(user_message)
            if context:
                state.messages.append(AgentMessage(role="system", content=context))

        for iteration in range(state.max_iterations):
            state.iterations = iteration + 1
            messages = self._build_messages(state)

            try:
                response = await self.provider.chat(messages)
            except Exception as e:
                return AgentResponse(
                    response=f"Error communicating with AI provider: {e}",
                    actions_taken=actions_taken,
                    files_changed=files_changed,
                )

            action = self._parse_action(response)
            final_response = self._extract_final(response)

            if action:
                tool_func = self.tool_map.get(action.action)
                if not tool_func:
                    observation = f"Unknown tool: {action.action}"
                else:
                    try:
                        result: ToolResult = tool_func(**action.action_input)
                        observation = (
                            result.output
                            if result.success
                            else f"ERROR: {result.error}"
                        )

                        if (
                            action.action in ("write_file", "edit_file", "delete_file")
                            and result.success
                        ):
                            diff = (
                                result.metadata.get("diff", "")
                                if result.metadata
                                else ""
                            )
                            files_changed.append(
                                DiffResult(
                                    file_path=result.metadata.get("file_path", ""),
                                    old_content="",
                                    new_content="",
                                    unified_diff=diff,
                                )
                            )

                        action.observation = observation
                        actions_taken.append(action)

                        state.messages.append(
                            AgentMessage(
                                role="tool",
                                content=observation,
                                tool_call_id=action.action,
                            )
                        )
                    except Exception as e:
                        observation = f"Tool execution error: {e}"
                        state.messages.append(
                            AgentMessage(
                                role="tool",
                                content=observation,
                                tool_call_id=action.action,
                            )
                        )

                continue
            else:
                # No action - final response
                state.messages.append(
                    AgentMessage(role="assistant", content=final_response)
                )
                return AgentResponse(
                    response=final_response,
                    actions_taken=actions_taken,
                    files_changed=files_changed,
                )

        # Max iterations reached
        return AgentResponse(
            response="Max iterations reached. " + final_response,
            actions_taken=actions_taken,
            files_changed=files_changed,
        )

    async def stream(
        self, user_message: str, state: AgentState = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Stream agent execution for real-time UI updates"""
        if state is None:
            state = AgentState(max_iterations=settings.AGENT_MAX_ITERATIONS)

        state.messages.append(AgentMessage(role="user", content=user_message))

        # Add context for questions
        if "?" in user_message or any(
            kw in user_message.lower()
            for kw in ["explain", "how", "what", "where", "why"]
        ):
            context = await self._retrieve_context(user_message)
            if context:
                state.messages.append(AgentMessage(role="system", content=context))

        for iteration in range(state.max_iterations):
            state.iterations = iteration + 1
            messages = self._build_messages(state)

            try:
                response = await self.provider.chat(messages)
            except Exception as e:
                yield {"type": "error", "content": f"Error: {e}"}
                return

            action = self._parse_action(response)
            final_response = self._extract_final(response)

            if action:
                yield {"type": "thought", "content": action.thought}
                yield {
                    "type": "action",
                    "tool": action.action,
                    "input": action.action_input,
                }

                tool_func = self.tool_map.get(action.action)
                if not tool_func:
                    observation = f"Unknown tool: {action.action}"
                else:
                    try:
                        result: ToolResult = tool_func(**action.action_input)
                        observation = (
                            result.output
                            if result.success
                            else f"ERROR: {result.error}"
                        )

                        yield {
                            "type": "observation",
                            "tool": action.action,
                            "output": observation,
                            "success": result.success,
                        }

                        state.messages.append(
                            AgentMessage(
                                role="tool",
                                content=observation,
                                tool_call_id=action.action,
                            )
                        )
                    except Exception as e:
                        observation = f"Tool execution error: {e}"
                        yield {
                            "type": "observation",
                            "tool": action.action,
                            "output": observation,
                            "success": False,
                        }
                        state.messages.append(
                            AgentMessage(
                                role="tool",
                                content=observation,
                                tool_call_id=action.action,
                            )
                        )

                continue
            else:
                state.messages.append(
                    AgentMessage(role="assistant", content=final_response)
                )
                yield {"type": "final", "content": final_response}
                return

        yield {"type": "final", "content": "Max iterations reached. " + final_response}


def get_agent() -> ReactAgent:
    return ReactAgent()

from typing import List, Optional, Dict, Any, Literal
from pydantic import BaseModel, Field
from dataclasses import dataclass


@dataclass
class ToolResult:
    success: bool
    output: str
    error: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class Tool(BaseModel):
    name: str
    description: str
    parameters: Dict[str, Any]


class AgentMessage(BaseModel):
    role: Literal["user", "assistant", "system", "tool"]
    content: str
    tool_calls: Optional[List[Dict[str, Any]]] = None
    tool_call_id: Optional[str] = None


class AgentState(BaseModel):
    messages: List[AgentMessage] = []
    current_task: Optional[str] = None
    iterations: int = 0
    max_iterations: int = 10
    context_files: List[str] = []


class FileOperation(BaseModel):
    file_path: str
    operation: Literal["read", "write", "edit", "delete"]
    content: Optional[str] = None
    old_string: Optional[str] = None
    new_string: Optional[str] = None


class AgentAction(BaseModel):
    thought: str
    action: str
    action_input: Dict[str, Any]
    observation: Optional[str] = None


class DiffResult(BaseModel):
    file_path: str
    old_content: str
    new_content: str
    unified_diff: str


class AgentResponse(BaseModel):
    response: str
    actions_taken: List[AgentAction] = []
    files_changed: List[DiffResult] = []
    requires_confirmation: bool = False
    pending_operations: List[FileOperation] = []

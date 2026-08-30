import os
import re
import subprocess
import difflib
from pathlib import Path
from typing import List, Dict, Any, Optional
from app.ai.agent.schemas import ToolResult, FileOperation, DiffResult
from app.database.config import settings


class ToolExecutor:
    def __init__(self, root_path: str = None):
        self.root_path = Path(root_path or settings.upload_dir_abs).resolve()
        # For code indexing, we want the project root
        self.project_root = Path(__file__).resolve().parents[4]  # Go up to project root

    def _resolve_path(self, file_path: str) -> Path:
        path = Path(file_path)
        if not path.is_absolute():
            path = self.project_root / path
        return path.resolve()

    def _ensure_within_root(self, path: Path) -> bool:
        try:
            path.relative_to(self.project_root)
            return True
        except ValueError:
            return False

    def read_file(self, file_path: str) -> ToolResult:
        try:
            path = self._resolve_path(file_path)
            if not self._ensure_within_root(path):
                return ToolResult(
                    success=False, output="", error="Path outside project root"
                )

            if not path.exists():
                return ToolResult(
                    success=False, output="", error=f"File not found: {file_path}"
                )

            content = path.read_text(encoding="utf-8", errors="replace")
            return ToolResult(
                success=True,
                output=content,
                metadata={
                    "file_path": str(path.relative_to(self.project_root)),
                    "size": len(content),
                },
            )
        except Exception as e:
            return ToolResult(success=False, output="", error=str(e))

    def write_file(self, file_path: str, content: str) -> ToolResult:
        try:
            path = self._resolve_path(file_path)
            if not self._ensure_within_root(path):
                return ToolResult(
                    success=False, output="", error="Path outside project root"
                )

            path.parent.mkdir(parents=True, exist_ok=True)
            old_content = (
                path.read_text(encoding="utf-8", errors="replace")
                if path.exists()
                else ""
            )
            path.write_text(content, encoding="utf-8")

            diff = self._generate_diff(old_content, content, file_path)
            return ToolResult(
                success=True,
                output=f"File written: {file_path}",
                metadata={
                    "diff": diff,
                    "file_path": str(path.relative_to(self.project_root)),
                },
            )
        except Exception as e:
            return ToolResult(success=False, output="", error=str(e))

    def edit_file(self, file_path: str, old_string: str, new_string: str) -> ToolResult:
        try:
            path = self._resolve_path(file_path)
            if not self._ensure_within_root(path):
                return ToolResult(
                    success=False, output="", error="Path outside project root"
                )

            if not path.exists():
                return ToolResult(
                    success=False, output="", error=f"File not found: {file_path}"
                )

            content = path.read_text(encoding="utf-8", errors="replace")
            if old_string not in content:
                return ToolResult(
                    success=False, output="", error="Old string not found in file"
                )

            new_content = content.replace(old_string, new_string, 1)
            path.write_text(new_content, encoding="utf-8")

            diff = self._generate_diff(content, new_content, file_path)
            return ToolResult(
                success=True,
                output=f"File edited: {file_path}",
                metadata={
                    "diff": diff,
                    "file_path": str(path.relative_to(self.project_root)),
                },
            )
        except Exception as e:
            return ToolResult(success=False, output="", error=str(e))

    def delete_file(self, file_path: str) -> ToolResult:
        try:
            path = self._resolve_path(file_path)
            if not self._ensure_within_root(path):
                return ToolResult(
                    success=False, output="", error="Path outside project root"
                )

            if not path.exists():
                return ToolResult(
                    success=False, output="", error=f"File not found: {file_path}"
                )

            path.unlink()
            return ToolResult(success=True, output=f"File deleted: {file_path}")
        except Exception as e:
            return ToolResult(success=False, output="", error=str(e))

    def glob_files(self, pattern: str) -> ToolResult:
        try:
            matches = list(self.project_root.glob(pattern))
            files = [
                str(p.relative_to(self.project_root)) for p in matches if p.is_file()
            ]
            return ToolResult(
                success=True,
                output="\n".join(files) if files else "No files found",
                metadata={"files": files, "count": len(files)},
            )
        except Exception as e:
            return ToolResult(success=False, output="", error=str(e))

    def grep(self, pattern: str, file_pattern: str = "**/*") -> ToolResult:
        try:
            matches = list(self.project_root.glob(file_pattern))
            results = []
            for file_path in matches:
                if not file_path.is_file():
                    continue
                try:
                    content = file_path.read_text(encoding="utf-8", errors="replace")
                    for i, line in enumerate(content.split("\n"), 1):
                        if re.search(pattern, line):
                            rel_path = str(file_path.relative_to(self.project_root))
                            results.append(f"{rel_path}:{i}: {line.strip()}")
                except Exception:
                    pass

            return ToolResult(
                success=True,
                output="\n".join(results[:100]) if results else "No matches found",
                metadata={"matches": results[:100], "total": len(results)},
            )
        except Exception as e:
            return ToolResult(success=False, output="", error=str(e))

    def run_command(
        self, command: str, cwd: str = None, timeout: int = 60
    ) -> ToolResult:
        try:
            work_dir = Path(cwd) if cwd else self.project_root
            work_dir = work_dir.resolve()
            if not self._ensure_within_root(work_dir):
                return ToolResult(
                    success=False,
                    output="",
                    error="Working directory outside project root",
                )

            result = subprocess.run(
                command,
                shell=True,
                cwd=str(work_dir),
                capture_output=True,
                text=True,
                timeout=timeout,
            )
            output = result.stdout
            if result.stderr:
                output += "\n[stderr]\n" + result.stderr

            return ToolResult(
                success=result.returncode == 0,
                output=output,
                error=result.stderr if result.returncode != 0 else None,
                metadata={"returncode": result.returncode, "command": command},
            )
        except subprocess.TimeoutExpired:
            return ToolResult(
                success=False, output="", error=f"Command timed out after {timeout}s"
            )
        except Exception as e:
            return ToolResult(success=False, output="", error=str(e))

    def list_directory(self, path: str = ".") -> ToolResult:
        try:
            target = self._resolve_path(path)
            if not self._ensure_within_root(target):
                return ToolResult(
                    success=False, output="", error="Path outside project root"
                )

            if not target.exists():
                return ToolResult(
                    success=False, output="", error=f"Directory not found: {path}"
                )

            items = []
            for item in sorted(target.iterdir()):
                rel = item.relative_to(self.project_root)
                items.append(f"{'[DIR] ' if item.is_dir() else ''}{rel}")

            return ToolResult(
                success=True,
                output="\n".join(items),
                metadata={
                    "items": items,
                    "path": str(target.relative_to(self.project_root)),
                },
            )
        except Exception as e:
            return ToolResult(success=False, output="", error=str(e))

    def _generate_diff(self, old: str, new: str, file_path: str) -> str:
        diff = difflib.unified_diff(
            old.splitlines(keepends=True),
            new.splitlines(keepends=True),
            fromfile=f"a/{file_path}",
            tofile=f"b/{file_path}",
            n=3,
        )
        return "".join(diff)

    def get_tool_definitions(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "read_file",
                "description": "Read the contents of a file",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file_path": {
                            "type": "string",
                            "description": "Path to the file relative to project root",
                        }
                    },
                    "required": ["file_path"],
                },
            },
            {
                "name": "write_file",
                "description": "Write content to a file (creates or overwrites)",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file_path": {
                            "type": "string",
                            "description": "Path to the file relative to project root",
                        },
                        "content": {
                            "type": "string",
                            "description": "Content to write",
                        },
                    },
                    "required": ["file_path", "content"],
                },
            },
            {
                "name": "edit_file",
                "description": "Edit a file by replacing a specific string",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file_path": {
                            "type": "string",
                            "description": "Path to the file relative to project root",
                        },
                        "old_string": {
                            "type": "string",
                            "description": "Exact string to replace",
                        },
                        "new_string": {
                            "type": "string",
                            "description": "New string to insert",
                        },
                    },
                    "required": ["file_path", "old_string", "new_string"],
                },
            },
            {
                "name": "delete_file",
                "description": "Delete a file",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file_path": {
                            "type": "string",
                            "description": "Path to the file relative to project root",
                        }
                    },
                    "required": ["file_path"],
                },
            },
            {
                "name": "glob_files",
                "description": "Find files matching a glob pattern",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "pattern": {
                            "type": "string",
                            "description": "Glob pattern (e.g., '**/*.py', 'src/**/*.ts')",
                        }
                    },
                    "required": ["pattern"],
                },
            },
            {
                "name": "grep",
                "description": "Search for a pattern in files",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "pattern": {
                            "type": "string",
                            "description": "Regex pattern to search for",
                        },
                        "file_pattern": {
                            "type": "string",
                            "description": "Glob pattern for files to search (default: **/*)",
                        },
                    },
                    "required": ["pattern"],
                },
            },
            {
                "name": "run_command",
                "description": "Run a shell command in the project directory",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "command": {
                            "type": "string",
                            "description": "Command to execute",
                        },
                        "cwd": {
                            "type": "string",
                            "description": "Working directory (relative to project root)",
                        },
                        "timeout": {
                            "type": "integer",
                            "description": "Timeout in seconds (default: 60)",
                        },
                    },
                    "required": ["command"],
                },
            },
            {
                "name": "list_directory",
                "description": "List contents of a directory",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Directory path relative to project root",
                        }
                    },
                    "required": ["path"],
                },
            },
        ]


def get_tool_executor() -> ToolExecutor:
    return ToolExecutor()

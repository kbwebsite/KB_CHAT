import os
import re
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from pathlib import Path
import tree_sitter
from tree_sitter import Parser
import tree_sitter_python as tspython
import tree_sitter_javascript as tsjavascript
import tree_sitter_typescript as tstypescript


@dataclass
class CodeChunk:
    file_path: str
    content: str
    start_line: int
    end_line: int
    chunk_type: str  # function, class, method, module, etc.
    name: str
    language: str
    parent_name: Optional[str] = None


class CodeIndexer:
    LANGUAGES = {
        ".py": tspython.language(),
        ".js": tsjavascript.language(),
        ".jsx": tsjavascript.language(),
        ".ts": tstypescript.language_typescript(),
        ".tsx": tstypescript.language_tsx(),
    }

    EXTENSION_TO_LANGUAGE = {
        ".py": "python",
        ".js": "javascript",
        ".jsx": "javascript",
        ".ts": "typescript",
        ".tsx": "typescript",
    }

    def __init__(self, root_path: str):
        self.root_path = Path(root_path).resolve()
        self.parsers: Dict[str, Parser] = {}
        for ext, lang in self.LANGUAGES.items():
            self.parsers[ext] = Parser(tree_sitter.Language(lang))

    def should_index_file(self, file_path: Path) -> bool:
        if file_path.suffix not in self.LANGUAGES:
            return False
        # Skip common ignore patterns
        ignore_patterns = [
            "__pycache__",
            ".git",
            "node_modules",
            "dist",
            "build",
            ".venv",
            "venv",
            "env",
            ".pytest_cache",
            ".ruff_cache",
            ".mypy_cache",
            "coverage",
            ".next",
            ".vercel",
        ]
        for part in file_path.parts:
            if part in ignore_patterns:
                return False
        return True

    def get_language(self, file_path: Path) -> str:
        return self.EXTENSION_TO_LANGUAGE.get(file_path.suffix, "unknown")

    def parse_file(self, file_path: Path) -> List[CodeChunk]:
        if not self.should_index_file(file_path):
            return []

        try:
            content = file_path.read_text(encoding="utf-8", errors="replace")
        except Exception:
            return []

        parser = self.parsers.get(file_path.suffix)
        if not parser:
            return self._fallback_chunk(file_path, content)

        tree = parser.parse(content.encode("utf-8"))
        chunks = self._extract_chunks(tree.root_node, content, file_path)
        return chunks

    def _extract_chunks(
        self, node: tree_sitter.Node, content: str, file_path: Path
    ) -> List[CodeChunk]:
        chunks = []
        language = self.get_language(file_path)

        def walk(node: tree_sitter.Node, parent_name: Optional[str] = None):
            if node.type in (
                "function_definition",
                "function_declaration",
                "arrow_function",
                "method_definition",
            ):
                name_node = node.child_by_field_name("name")
                name = (
                    content[name_node.start_byte : name_node.end_byte]
                    if name_node
                    else "anonymous"
                )
                chunk_content = content[node.start_byte : node.end_byte]
                chunks.append(
                    CodeChunk(
                        file_path=str(file_path.relative_to(self.root_path)),
                        content=chunk_content,
                        start_line=node.start_point[0] + 1,
                        end_line=node.end_point[0] + 1,
                        chunk_type="function",
                        name=name,
                        language=language,
                        parent_name=parent_name,
                    )
                )
            elif node.type in ("class_definition", "class_declaration"):
                name_node = node.child_by_field_name("name")
                name = (
                    content[name_node.start_byte : name_node.end_byte]
                    if name_node
                    else "anonymous"
                )
                chunk_content = content[node.start_byte : node.end_byte]
                chunks.append(
                    CodeChunk(
                        file_path=str(file_path.relative_to(self.root_path)),
                        content=chunk_content,
                        start_line=node.start_point[0] + 1,
                        end_line=node.end_point[0] + 1,
                        chunk_type="class",
                        name=name,
                        language=language,
                        parent_name=parent_name,
                    )
                )
                parent_name = name

            for child in node.children:
                walk(child, parent_name)

        walk(node)

        # If no chunks found, fall back to whole file
        if not chunks:
            return self._fallback_chunk(file_path, content)

        return chunks

    def _fallback_chunk(self, file_path: Path, content: str) -> List[CodeChunk]:
        lines = content.split("\n")
        return [
            CodeChunk(
                file_path=str(file_path.relative_to(self.root_path)),
                content=content[:8000],
                start_line=1,
                end_line=len(lines),
                chunk_type="module",
                name=file_path.name,
                language=self.get_language(file_path),
            )
        ]

    def index_directory(self, directory: Optional[str] = None) -> List[CodeChunk]:
        target = self.root_path if directory is None else self.root_path / directory
        all_chunks = []

        for file_path in target.rglob("*"):
            if file_path.is_file() and self.should_index_file(file_path):
                chunks = self.parse_file(file_path)
                all_chunks.extend(chunks)

        return all_chunks

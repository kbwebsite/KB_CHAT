#!/usr/bin/env python3
"""
Codebase indexing script for KB-CHAT AI Agent.
Supports full indexing and incremental updates.
"""

import sys
import os
import argparse
import asyncio
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from app.ai.indexer import CodeIndexer
from app.ai.vector_store import get_vector_store
from app.database.config import settings


def index_codebase(
    root_path: str, incremental: bool = False, changed_files: list = None
):
    print(f"Indexing codebase at: {root_path}")
    indexer = CodeIndexer(root_path)
    vector_store = get_vector_store()

    if not incremental:
        print("Full index - clearing existing vectors...")
        vector_store.clear()

    if incremental and changed_files:
        print(f"Incremental update for {len(changed_files)} files...")
        for file_path in changed_files:
            abs_path = Path(file_path)
            if abs_path.exists():
                rel_path = str(abs_path.relative_to(Path(root_path)))
                print(f"  Re-indexing: {rel_path}")
                vector_store.delete_by_file(rel_path)
                chunks = indexer.parse_file(abs_path)
                if chunks:
                    vector_store.add_chunks(chunks)
                    print(f"    Added {len(chunks)} chunks")
    else:
        print("Scanning for indexable files...")
        chunks = indexer.index_directory()
        print(f"Found {len(chunks)} code chunks")
        if chunks:
            print("Adding to vector store...")
            vector_store.add_chunks(chunks)

    count = vector_store.count()
    print(f"Indexing complete. Total vectors: {count}")


def main():
    parser = argparse.ArgumentParser(description="Index codebase for AI agent")
    parser.add_argument("--root", default=".", help="Root directory to index")
    parser.add_argument("--incremental", action="store_true", help="Incremental update")
    parser.add_argument(
        "--files", nargs="*", help="Specific files to index (for incremental)"
    )
    parser.add_argument("--clear", action="store_true", help="Clear index only")

    args = parser.parse_args()

    root = Path(args.root).resolve()
    if not root.exists():
        print(f"Error: Root path does not exist: {root}")
        sys.exit(1)

    if args.clear:
        vector_store = get_vector_store()
        vector_store.clear()
        print("Index cleared.")
        return

    index_codebase(str(root), incremental=args.incremental, changed_files=args.files)


if __name__ == "__main__":
    main()

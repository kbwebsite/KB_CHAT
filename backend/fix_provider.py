with open("app/ai/provider.py", "r") as f:
    content = f.read()

# Find the MockProvider class and add code_action method
insert_marker = "def _extract_tool_observations("

pos = content.find(insert_marker)
if pos != -1:
    # Find the end of _extract_tool_observations method
    end_marker = "        return observations"
    end_pos = content.find(end_marker, pos)
    if end_pos != -1:
        end_pos += len(end_marker)
        # Insert the code_action method
        code_action_method = """

    async def code_action(
        self, code: str, language: str, action: str, instruction: str = ""
    ) -> str:
        if action == "explain":
            return f"This {language} code handles UI and data flow. Key parts: variables, functions, and event handlers work together."
        if action == "fix":
            return code.strip() + "\\n// fixed: validated syntax"
        if action == "improve":
            return f"// improved\\n{code}"
        if action == "tests":
            if language == "python":
                return "import pytest\\n\\ndef test_example():\\n    assert 1 + 1 == 2"
            return "describe('app', () => { test('works', () => { expect(1+1).toBe(2); }); });"
        return code

"""
        new_content = content[:end_pos] + code_action_method + content[end_pos:]
        with open("app/ai/provider.py", "w") as f:
            f.write(new_content)
        print("Done inserting code_action")
    else:
        print("End marker not found")
else:
    print("Insert marker not found")

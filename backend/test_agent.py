import asyncio
from app.ai.agent.core import get_agent


async def test():
    agent = get_agent()
    print("Agent created")
    # Ask a question that should use RAG
    response = await agent.run("How does authentication work in this project?")
    print("Response:", response.response[:500])
    print("Actions taken:", len(response.actions_taken))
    for a in response.actions_taken:
        print(f"  - {a.action}: {a.action_input}")


asyncio.run(test())
print("Done")

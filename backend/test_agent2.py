import asyncio
from app.ai.agent.core import get_agent


async def test():
    agent = get_agent()
    print("Agent created")
    # Ask about authentication
    response = await agent.run("How does authentication work in this project?")
    print("Full response object:")
    print("  response:", response.response)
    print("  actions_taken:", len(response.actions_taken))
    for a in response.actions_taken:
        print(f"  - action: {a.action}")
        print(f"    input: {a.action_input}")
        print(f"    observation: {a.observation}")
    print("Done")


asyncio.run(test())

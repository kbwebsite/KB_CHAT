import asyncio
from app.ai.provider import MockProvider


async def test():
    provider = MockProvider()
    print("In test")
    response = await provider.chat(
        [{"role": "user", "content": "What is the project structure?"}]
    )
    print("Response:", response)


asyncio.run(test())
print("Done")

"""
Test script for agent mode
"""
import asyncio
import os
from dotenv import load_dotenv

from agent import AgentMode
from models import AgentRequest, Message

# Load environment variables
load_dotenv()


async def test_agent_streaming():
    """Test agent with streaming output"""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("[ERROR] OPENAI_API_KEY not set in environment")
        print("   Create a .env file with: OPENAI_API_KEY=sk-...")
        return
    
    agent = AgentMode(api_key=api_key)
    
    # Example conversation
    request = AgentRequest(
        conversation_id="test-123",
        user_prompt="Confirm the meeting and ask for location",
        conversation_history=[
            Message(
                id="1",
                text="Hey, can we meet tomorrow?",
                date=0,
                is_from_me=False,
                contact_name="John"
            ),
            Message(
                id="2",
                text="Sure, what time works?",
                date=1,
                is_from_me=True
            ),
            Message(
                id="3",
                text="How about 2pm?",
                date=2,
                is_from_me=False,
                contact_name="John"
            )
        ],
        contact_name="John",
        max_candidates=2
    )
    
    print("=" * 60)
    print("Testing Agent Mode with Streaming")
    print("=" * 60)
    print(f"\nConversation with: {request.contact_name}")
    print(f"User instruction: {request.user_prompt}")
    print("\n" + "-" * 60 + "\n")
    
    # Stream events
    async for event in agent.stream_agent_response(request):
        if event.type == "reasoning":
            print(f"[REASONING] {event.content}", end="", flush=True)
        
        elif event.type == "tool_call":
            print(f"\n\n[TOOL CALL] {event.content}")
            if event.metadata:
                print(f"   Tool: {event.metadata.get('tool_name', 'unknown')}")
        
        elif event.type == "tool_result":
            print(f"[TOOL RESULT] Tool execution complete")
        
        elif event.type == "candidate":
            idx = event.metadata.get('index', 0) + 1
            confidence = event.metadata.get('confidence', 0)
            reasoning = event.metadata.get('reasoning', '')
            
            print(f"\n\n{'=' * 60}")
            print(f"Candidate {idx} (Confidence: {confidence:.0%})")
            print(f"{'=' * 60}")
            print(f"\nMessage: {event.content}")
            print(f"\nReasoning: {reasoning}")
        
        elif event.type == "prediction":
            print(f"\nPredicted Response:")
            print(f"   {event.content}")
        
        elif event.type == "complete":
            print(f"\n\n{'=' * 60}")
            print("Agent processing complete!")
            print(f"{'=' * 60}")
            if event.metadata:
                print(f"Total reasoning steps: {event.metadata.get('total_reasoning_steps', 0)}")
                print(f"Total tool calls: {event.metadata.get('total_tool_calls', 0)}")
        
        elif event.type == "error":
            print(f"\n\n[ERROR] {event.content}")


async def test_agent_non_streaming():
    """Test agent with non-streaming output"""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("[ERROR] OPENAI_API_KEY not set in environment")
        return
    
    agent = AgentMode(api_key=api_key)
    
    request = AgentRequest(
        conversation_id="test-456",
        user_prompt="Apologize for being late and suggest rescheduling",
        conversation_history=[
            Message(
                id="1",
                text="Are you coming? We're waiting for you",
                date=0,
                is_from_me=False,
                contact_name="Sarah"
            )
        ],
        contact_name="Sarah",
        max_candidates=2
    )
    
    print("\n\n" + "=" * 60)
    print("Testing Agent Mode (Non-Streaming)")
    print("=" * 60)
    print(f"\nConversation with: {request.contact_name}")
    print(f"User instruction: {request.user_prompt}")
    print("\nProcessing...\n")
    
    response = await agent.generate_response(request)
    
    print(f"Generated {len(response.candidates)} candidates")
    print(f"Total reasoning steps: {response.total_reasoning_steps}")
    print(f"Total tool calls: {response.total_tool_calls}\n")
    
    for idx, candidate in enumerate(response.candidates, 1):
        print(f"{'=' * 60}")
        print(f"Candidate {idx} (Confidence: {candidate.confidence:.0%})")
        print(f"{'=' * 60}")
        print(f"\nMessage: {candidate.text}")
        print(f"\nReasoning: {candidate.reasoning}")
        print(f"\nPredicted Response: {candidate.predicted_response}\n")


async def main():
    """Run tests"""
    # Test streaming version
    await test_agent_streaming()
    
    # Uncomment to test non-streaming version
    # await test_agent_non_streaming()


if __name__ == "__main__":
    asyncio.run(main())


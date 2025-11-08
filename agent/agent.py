"""
Agent mode implementation using OpenAI API with streaming
"""
import json
import time
import uuid
from typing import AsyncGenerator, List, Dict, Any
from openai import OpenAI
from models import (
    AgentRequest,
    AgentResponse,
    CandidateMessage,
    StreamEvent,
    StreamEventType,
    Message,
)


class AgentMode:
    """Agent mode handler with OpenAI streaming"""
    
    def __init__(self, api_key: str):
        self.client = OpenAI(api_key=api_key)
        self.model = os.getenv("OPENAI_MODEL", "gpt-4o")
    
    def build_conversation_context(self, messages: List[Message], contact_name: str = None) -> str:
        if not messages:
            return "No conversation history available."
        
        recipient_name = contact_name or "Recipient"
        lines = []
        
        # Take last 30 messages for context
        for msg in messages[-30:]:
            sender = "You" if msg.is_from_me else recipient_name
            text = msg.text or "[No text content]"
            lines.append(f"{sender}: {text}")
        
        return "\n".join(lines)
    
    def get_system_prompt(self) -> str:
        """Get system prompt for agent"""
        return """You are an AI assistant helping to compose text messages. Your task is to:

1. Analyze the conversation context and user's instruction
2. Generate exactly 2 different candidate messages that fulfill the instruction
3. For each candidate, predict how the recipient might respond
4. Provide brief reasoning for each candidate

IMPORTANT: You must call the generate_candidates tool with your analysis.

Guidelines:
- Match the user's texting style (casual, formal, emoji usage, etc.)
- Consider the conversation context and relationship
- Be natural and conversational
- Keep messages concise (typical text message length)
- Consider different approaches (direct vs indirect, formal vs casual, etc.)
"""
    
    def get_tools(self) -> List[Dict[str, Any]]:
        """Define tools for OpenAI function calling"""
        return [
            {
                "type": "function",
                "function": {
                    "name": "analyze_conversation_style",
                    "description": "Analyze the user's texting style from conversation history to match their tone",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "style_notes": {
                                "type": "string",
                                "description": "Observations about texting style (formality, emoji usage, length, etc.)"
                            },
                            "tone": {
                                "type": "string",
                                "enum": ["casual", "formal", "friendly", "professional", "playful"],
                                "description": "Overall tone of the conversation"
                            }
                        },
                        "required": ["style_notes", "tone"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "generate_candidates",
                    "description": "Generate candidate messages with predicted responses",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "candidates": {
                                "type": "array",
                                "description": "Array of exactly 2 candidate messages",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "message_text": {
                                            "type": "string",
                                            "description": "The candidate message to send"
                                        },
                                        "confidence": {
                                            "type": "number",
                                            "description": "Confidence score from 0.0 to 1.0"
                                        },
                                        "predicted_response": {
                                            "type": "string",
                                            "description": "How the recipient might respond"
                                        },
                                        "reasoning": {
                                            "type": "string",
                                            "description": "Brief explanation of this approach"
                                        }
                                    },
                                    "required": ["message_text", "confidence", "predicted_response", "reasoning"]
                                },
                                "minItems": 2,
                                "maxItems": 2
                            }
                        },
                        "required": ["candidates"]
                    }
                }
            }
        ]
    
    async def stream_agent_response(
        self, 
        request: AgentRequest
    ) -> AsyncGenerator[StreamEvent, None]:
        """
        Stream agent reasoning and generate candidates
        
        Yields StreamEvent objects with different types:
        - REASONING: Agent's thinking process
        - TOOL_CALL: When agent decides to use a tool
        - TOOL_RESULT: Result from tool execution
        - CANDIDATE: Generated candidate message
        - PREDICTION: Predicted response for a candidate
        - COMPLETE: Processing complete
        - ERROR: Error occurred
        """
        try:
            # Build context
            context = self.build_conversation_context(
                request.conversation_history,
                request.contact_name
            )
            
            # Prepare messages
            messages = [
                {
                    "role": "system",
                    "content": self.get_system_prompt()
                },
                {
                    "role": "user",
                    "content": f"""Conversation context:
{context}

User's instruction: {request.user_prompt}

Please analyze the conversation and generate {request.max_candidates} candidate messages."""
                }
            ]
            
            # Track state
            tool_calls_count = 0
            reasoning_steps = 0
            current_tool_call = None
            current_tool_call_args = ""
            
            # Stream response
            stream = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                tools=self.get_tools(),
                tool_choice="auto",
                stream=True,
                temperature=0.7,
            )
            
            for chunk in stream:
                if not chunk.choices:
                    continue
                
                delta = chunk.choices[0].delta
                finish_reason = chunk.choices[0].finish_reason
                
                # Handle regular content (reasoning)
                if delta.content:
                    reasoning_steps += 1
                    yield StreamEvent(
                        type=StreamEventType.REASONING,
                        content=delta.content,
                        timestamp=time.time()
                    )
                
                # Handle tool calls
                if delta.tool_calls:
                    for tool_call_delta in delta.tool_calls:
                        # New tool call starting
                        if tool_call_delta.function.name:
                            tool_calls_count += 1
                            current_tool_call = tool_call_delta.function.name
                            current_tool_call_args = ""
                            
                            yield StreamEvent(
                                type=StreamEventType.TOOL_CALL,
                                content=f"Calling tool: {current_tool_call}",
                                metadata={"tool_name": current_tool_call},
                                timestamp=time.time()
                            )
                        
                        # Accumulate arguments
                        if tool_call_delta.function.arguments:
                            current_tool_call_args += tool_call_delta.function.arguments
                
                # When tool call is complete
                if finish_reason == "tool_calls" and current_tool_call and current_tool_call_args:
                    # Parse tool arguments
                    try:
                        tool_args = json.loads(current_tool_call_args)
                        
                        # Execute tool
                        tool_result = self.execute_tool(current_tool_call, tool_args)
                        
                        # Yield tool result
                        yield StreamEvent(
                            type=StreamEventType.TOOL_RESULT,
                            content=json.dumps(tool_result, indent=2),
                            metadata={
                                "tool_name": current_tool_call,
                                "tool_args": tool_args
                            },
                            timestamp=time.time()
                        )
                        
                        # If this was generate_candidates, yield individual candidates
                        if current_tool_call == "generate_candidates" and "candidates" in tool_result:
                            for idx, candidate in enumerate(tool_result["candidates"]):
                                # Yield candidate
                                yield StreamEvent(
                                    type=StreamEventType.CANDIDATE,
                                    content=candidate["message_text"],
                                    metadata={
                                        "candidate_id": str(uuid.uuid4()),
                                        "confidence": candidate["confidence"],
                                        "reasoning": candidate["reasoning"],
                                        "index": idx
                                    },
                                    timestamp=time.time()
                                )
                                
                                # Yield prediction
                                yield StreamEvent(
                                    type=StreamEventType.PREDICTION,
                                    content=candidate["predicted_response"],
                                    metadata={
                                        "candidate_index": idx
                                    },
                                    timestamp=time.time()
                                )
                        
                        # Continue conversation with tool result
                        messages.append({
                            "role": "assistant",
                            "content": None,
                            "tool_calls": [{
                                "id": f"call_{uuid.uuid4().hex[:24]}",
                                "type": "function",
                                "function": {
                                    "name": current_tool_call,
                                    "arguments": current_tool_call_args
                                }
                            }]
                        })
                        
                        messages.append({
                            "role": "tool",
                            "tool_call_id": messages[-1]["tool_calls"][0]["id"],
                            "content": json.dumps(tool_result)
                        })
                        
                        # Reset for next tool call
                        current_tool_call = None
                        current_tool_call_args = ""
                        
                        # If we got candidates, we're done
                        if "candidates" in tool_result:
                            break
                    
                    except json.JSONDecodeError as e:
                        yield StreamEvent(
                            type=StreamEventType.ERROR,
                            content=f"Failed to parse tool arguments: {str(e)}",
                            timestamp=time.time()
                        )
                        break
            
            # Send completion event
            yield StreamEvent(
                type=StreamEventType.COMPLETE,
                content="Agent processing complete",
                metadata={
                    "total_reasoning_steps": reasoning_steps,
                    "total_tool_calls": tool_calls_count
                },
                timestamp=time.time()
            )
        
        except Exception as e:
            yield StreamEvent(
                type=StreamEventType.ERROR,
                content=f"Error: {str(e)}",
                timestamp=time.time()
            )
    
    def execute_tool(self, tool_name: str, tool_args: dict) -> dict:
        """Execute a tool and return result"""
        if tool_name == "analyze_conversation_style":
            # Just return the analysis as-is
            return {
                "success": True,
                "style_notes": tool_args.get("style_notes", ""),
                "tone": tool_args.get("tone", "casual")
            }
        
        elif tool_name == "generate_candidates":
            # Return candidates as-is (they're already formatted correctly)
            return {
                "success": True,
                "candidates": tool_args.get("candidates", [])
            }
        
        return {"success": False, "error": f"Unknown tool: {tool_name}"}
    
    async def generate_response(self, request: AgentRequest) -> AgentResponse:
        """
        Non-streaming version that collects all events and returns final response
        """
        candidates = []
        tool_calls_count = 0
        reasoning_steps = 0
        
        async for event in self.stream_agent_response(request):
            if event.type == StreamEventType.CANDIDATE:
                candidate = CandidateMessage(
                    id=event.metadata["candidate_id"],
                    text=event.content,
                    confidence=event.metadata["confidence"],
                    predicted_response="",  # Will be filled by next event
                    reasoning=event.metadata["reasoning"]
                )
                candidates.append(candidate)
            
            elif event.type == StreamEventType.PREDICTION:
                # Update the last candidate with prediction
                if candidates:
                    idx = event.metadata["candidate_index"]
                    if idx < len(candidates):
                        candidates[idx].predicted_response = event.content
            
            elif event.type == StreamEventType.TOOL_CALL:
                tool_calls_count += 1
            
            elif event.type == StreamEventType.REASONING:
                reasoning_steps += 1
            
            elif event.type == StreamEventType.COMPLETE:
                tool_calls_count = event.metadata.get("total_tool_calls", tool_calls_count)
                reasoning_steps = event.metadata.get("total_reasoning_steps", reasoning_steps)
        
        return AgentResponse(
            candidates=candidates,
            total_reasoning_steps=reasoning_steps,
            total_tool_calls=tool_calls_count
        )


# Example usage
async def main():
    """Example usage of agent mode"""
    import os
    
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY environment variable not set")
    
    agent = AgentMode(api_key=api_key)
    
    # Example request
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
        contact_name="John"
    )
    
    # Stream events
    print("Streaming agent response...\n")
    async for event in agent.stream_agent_response(request):
        if event.type == StreamEventType.REASONING:
            print(f"[REASONING] {event.content}", end="", flush=True)
        elif event.type == StreamEventType.TOOL_CALL:
            print(f"\n[TOOL CALL] {event.content}")
        elif event.type == StreamEventType.TOOL_RESULT:
            print(f"[TOOL RESULT] Tool result received")
        elif event.type == StreamEventType.CANDIDATE:
            print(f"\nCandidate {event.metadata['index'] + 1}: {event.content}")
            print(f"   Confidence: {event.metadata['confidence']:.0%}")
            print(f"   Reasoning: {event.metadata['reasoning']}")
        elif event.type == StreamEventType.PREDICTION:
            print(f"   Predicted response: {event.content}")
        elif event.type == StreamEventType.COMPLETE:
            print(f"\nComplete!")
        elif event.type == StreamEventType.ERROR:
            print(f"\n[ERROR] {event.content}")


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())


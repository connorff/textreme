"""
Pydantic models for agent mode API
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from enum import Enum


class Message(BaseModel):
    """Single message in conversation history"""
    id: str
    text: Optional[str]
    date: int  # Apple epoch timestamp
    is_from_me: bool
    handle_identifier: Optional[str] = None
    contact_name: Optional[str] = None


class AgentRequest(BaseModel):
    """Request to agent mode endpoint"""
    conversation_id: str
    user_prompt: str
    conversation_history: List[Message]
    max_candidates: int = Field(default=2, ge=1, le=5)
    contact_name: Optional[str] = None  # Display name for context


class StreamEventType(str, Enum):
    """Types of streaming events"""
    REASONING = "reasoning"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    CANDIDATE = "candidate"
    PREDICTION = "prediction"
    COMPLETE = "complete"
    ERROR = "error"


class StreamEvent(BaseModel):
    """Single streaming event"""
    type: StreamEventType
    content: str
    metadata: Optional[dict] = None
    timestamp: float


class CandidateMessage(BaseModel):
    """A candidate message with predicted response"""
    id: str
    text: str
    confidence: float = Field(ge=0.0, le=1.0)
    predicted_response: str
    reasoning: str


class AgentResponse(BaseModel):
    """Final response from agent mode"""
    candidates: List[CandidateMessage]
    total_reasoning_steps: int
    total_tool_calls: int


# Agent Mode Backend

OpenAI-powered agent that generates candidate text messages with predicted responses.

## Background

Agent mode implementation:

1. User selects an unread conversation from the conversation list.
2. User inputs a prompt in the text overlay app.
3. Agent starts outputting tool calling steps and reasoning.
4. Agent compares multiple conversation flow and outputs:
- two candidate messages user could send
- predicted recipient response to each candidate message
5. User can select a candidate message and send it via keyboard shortcut or clicking on the candidate message OR
user can keep prompting the agent to generate more candidate messages and recipient responses.
6. Agent mode automatically closes and return to the preview mode where we can see all unread messages. 

inputs:
- user prompt
- selected unread conversation (context)

outputs:
- two candidate messages
- predicted recipient responses to each candidate message
- streaming GPT response, which includes tool calling steps and reasoning


Backend is implemented in /agent/

Key files:
- models.py: Pydantic models for request/response
- agent.py: AgentMode class with OpenAI streaming
- server.py: FastAPI server with SSE endpoint
- test_agent.py: Test script to verify functionality

Usage:
1. cd agent
2. pip install -r requirements.txt
3. Create .env with OPENAI_API_KEY=sk-...
4. python test_agent.py  # Test the agent
5. python server.py  # Start API server on port 8000

API Endpoints:
- POST /agent/stream - Streaming SSE endpoint (recommended)
- POST /agent - Non-streaming endpoint
- GET / - Health check

Event Types (for frontend display):
- reasoning: Agent thinking (show as flowing text)
- tool_call: Tool being used (show as badge/pill)
- tool_result: Tool execution result (show collapsed)
- candidate: Generated message (show as selectable card)
- prediction: Predicted response (show below candidate)
- complete: Processing done (hide loading state)
- error: Error occurred (show error message)

## Quick Start

```bash
# 1. Install dependencies
cd agent
pip install -r requirements.txt

# 2. Set up environment
echo "OPENAI_API_KEY=sk-..." > .env

# 3. Test it
python test_agent.py

# 4. Start server
python server.py
```

Server runs at `http://localhost:8000`

## API

### POST /agent/stream (Streaming - Recommended)

Streams events as they happen using Server-Sent Events.

**Request:**
```json
{
  "conversation_id": "chat-123",
  "user_prompt": "Confirm the meeting and ask for location",
  "conversation_history": [...],
  "contact_name": "John",
  "max_candidates": 2
}
```

**Events:**
- `reasoning` - Agent thinking
- `tool_call` - Using a tool
- `candidate` - Generated message
- `prediction` - Predicted response
- `complete` - Done

### POST /agent (Non-streaming)

Returns complete response at once.

**Response:**
```json
{
  "candidates": [
    {
      "text": "Sounds good! Where should we meet?",
      "confidence": 0.92,
      "predicted_response": "How about the coffee shop?",
      "reasoning": "Direct and friendly"
    }
  ]
}
```

## Integration

```typescript
// Streaming example
const response = await fetch('http://localhost:8000/agent/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(request)
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value);
  const lines = chunk.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const event = JSON.parse(line.slice(6));
      // Handle event based on event.type
    }
  }
}
```

See `ELECTRON_INTEGRATION.md` for full React component examples.

## Files

- `agent.py` - Core agent logic with OpenAI
- `models.py` - Request/response types
- `server.py` - FastAPI server
- `test_agent.py` - Test script
- `requirements.txt` - Dependencies

## Troubleshooting

**"OPENAI_API_KEY not set"** → Create `.env` file with your key

**"Module not found"** → Run `pip install -r requirements.txt`

**Slow responses** → Normal, OpenAI takes 3-10 seconds

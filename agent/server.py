"""
FastAPI server for agent mode (for local testing)
"""
import os
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import json
from dotenv import load_dotenv

from agent import AgentMode
from models import AgentRequest, AgentResponse

load_dotenv()

app = FastAPI(title="Textreme Agent API", version="0.1.0")

# Add CORS middleware for Electron app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your Electron app's origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize agent
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    raise ValueError("OPENAI_API_KEY environment variable not set")

agent = AgentMode(api_key=OPENAI_API_KEY)


@app.get("/")
async def root():
    """Health check endpoint"""
    return {"status": "ok", "service": "textreme-agent"}


@app.post("/agent/stream")
async def agent_stream(request: AgentRequest):
    """
    Stream agent reasoning and candidates
    
    Returns Server-Sent Events (SSE) stream with:
    - reasoning: Agent's thinking process
    - tool_call: When agent uses a tool
    - tool_result: Result from tool execution
    - candidate: Generated candidate message
    - prediction: Predicted response
    - complete: Processing complete
    - error: Error occurred
    """
    async def event_generator():
        try:
            async for event in agent.stream_agent_response(request):
                # Format as SSE
                data = event.model_dump_json()
                yield f"data: {data}\n\n"
        except Exception as e:
            error_event = {
                "type": "error",
                "content": str(e),
                "timestamp": 0
            }
            yield f"data: {json.dumps(error_event)}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


@app.post("/agent", response_model=AgentResponse)
async def agent_generate(request: AgentRequest):
    """
    Non-streaming endpoint that returns complete response
    Use this for simpler integration without SSE handling
    """
    try:
        response = await agent.generate_response(request)
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=port,
        reload=True,
        log_level="info"
    )


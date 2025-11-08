# Agent Mode

This guide shows how to integrate the agent mode backend with your Electron overlay app.

## Quick Start

1. **Start the backend server**:
```bash
cd ml
python -m deploy.server
```

2. **Call from Electron**: Use the examples below

## Integration Approach

### Option 1: Server-Sent Events (Recommended)

Best for real-time streaming of agent reasoning.

```typescript
// In your Electron renderer process
async function callAgentMode(
  conversationId: string,
  userPrompt: string,
  conversationHistory: ConversationMessage[]
) {
  const response = await fetch('http://localhost:8000/agent/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversation_id: conversationId,
      user_prompt: userPrompt,
      conversation_history: conversationHistory.map(msg => ({
        id: msg.id,
        text: msg.text,
        date: msg.date,
        is_from_me: msg.isFromMe,
        handle_identifier: msg.handleIdentifier,
        contact_name: msg.contactName,
      })),
      contact_name: "John", // or get from conversation
      max_candidates: 2,
    })
  });

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const eventData = JSON.parse(line.slice(6));
        handleAgentEvent(eventData);
      }
    }
  }
}

function handleAgentEvent(event: AgentEvent) {
  switch (event.type) {
    case 'reasoning':
      // Append to reasoning panel
      appendToReasoningPanel(event.content);
      break;
    
    case 'tool_call':
      // Show tool badge
      showToolBadge(event.metadata.tool_name);
      break;
    
    case 'tool_result':
      // Show tool result (collapsed by default)
      showToolResult(event.content);
      break;
    
    case 'candidate':
      // Add candidate card
      addCandidateCard({
        id: event.metadata.candidate_id,
        text: event.content,
        confidence: event.metadata.confidence,
        reasoning: event.metadata.reasoning,
      });
      break;
    
    case 'prediction':
      // Add prediction to the candidate
      updateCandidatePrediction(
        event.metadata.candidate_index,
        event.content
      );
      break;
    
    case 'complete':
      // Hide loading state
      setLoading(false);
      break;
    
    case 'error':
      // Show error
      showError(event.content);
      break;
  }
}
```

### Option 2: Simple Non-Streaming

Simpler but no real-time updates.

```typescript
async function callAgentModeSimple(
  conversationId: string,
  userPrompt: string,
  conversationHistory: ConversationMessage[]
) {
  const response = await fetch('http://localhost:8000/agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversation_id: conversationId,
      user_prompt: userPrompt,
      conversation_history: conversationHistory.map(msg => ({
        id: msg.id,
        text: msg.text,
        date: msg.date,
        is_from_me: msg.isFromMe,
        handle_identifier: msg.handleIdentifier,
        contact_name: msg.contactName,
      })),
      contact_name: "John",
      max_candidates: 2,
    })
  });

  const result = await response.json();
  
  // result.candidates is an array of 2 candidates
  result.candidates.forEach(candidate => {
    addCandidateCard({
      id: candidate.id,
      text: candidate.text,
      confidence: candidate.confidence,
      reasoning: candidate.reasoning,
      predictedResponse: candidate.predicted_response,
    });
  });
}
```

## React Component Example

```tsx
import { useState, useEffect } from 'react';

interface AgentEvent {
  type: 'reasoning' | 'tool_call' | 'tool_result' | 'candidate' | 'prediction' | 'complete' | 'error';
  content: string;
  metadata?: any;
  timestamp: number;
}

interface Candidate {
  id: string;
  text: string;
  confidence: number;
  reasoning: string;
  predictedResponse?: string;
}

export function AgentModeView({ 
  conversationId, 
  conversationHistory,
  onBack 
}: {
  conversationId: string;
  conversationHistory: ConversationMessage[];
  onBack: () => void;
}) {
  const [userPrompt, setUserPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [reasoningSteps, setReasoningSteps] = useState<string[]>([]);
  const [toolCalls, setToolCalls] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!userPrompt.trim()) return;
    
    setIsProcessing(true);
    setReasoningSteps([]);
    setToolCalls([]);
    setCandidates([]);
    setError(null);

    try {
      const response = await fetch('http://localhost:8000/agent/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversationId,
          user_prompt: userPrompt,
          conversation_history: conversationHistory.map(msg => ({
            id: msg.id,
            text: msg.text,
            date: msg.date,
            is_from_me: msg.isFromMe,
            handle_identifier: msg.handleIdentifier,
            contact_name: msg.contactName,
          })),
          max_candidates: 2,
        })
      });

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const tempCandidates: Candidate[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const event: AgentEvent = JSON.parse(line.slice(6));
            
            switch (event.type) {
              case 'reasoning':
                setReasoningSteps(prev => [...prev, event.content]);
                break;
              
              case 'tool_call':
                setToolCalls(prev => [...prev, event.metadata.tool_name]);
                break;
              
              case 'candidate':
                const newCandidate: Candidate = {
                  id: event.metadata.candidate_id,
                  text: event.content,
                  confidence: event.metadata.confidence,
                  reasoning: event.metadata.reasoning,
                };
                tempCandidates.push(newCandidate);
                setCandidates([...tempCandidates]);
                break;
              
              case 'prediction':
                const idx = event.metadata.candidate_index;
                if (tempCandidates[idx]) {
                  tempCandidates[idx].predictedResponse = event.content;
                  setCandidates([...tempCandidates]);
                }
                break;
              
              case 'complete':
                setIsProcessing(false);
                break;
              
              case 'error':
                setError(event.content);
                setIsProcessing(false);
                break;
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="p-4 border-b">
        <button onClick={onBack}>← Back</button>
        <h1>Agent Mode</h1>
      </div>

      {/* Prompt Input */}
      <div className="p-4 border-b">
        <input
          type="text"
          value={userPrompt}
          onChange={(e) => setUserPrompt(e.target.value)}
          placeholder="What would you like to say?"
          className="w-full p-2 border rounded"
          disabled={isProcessing}
        />
        <button 
          onClick={handleSubmit}
          disabled={isProcessing || !userPrompt.trim()}
          className="mt-2 px-4 py-2 bg-blue-500 text-white rounded"
        >
          {isProcessing ? 'Processing...' : 'Generate Responses'}
        </button>
      </div>

      {/* Reasoning Panel (Collapsible) */}
      {reasoningSteps.length > 0 && (
        <details className="p-4 border-b">
          <summary className="cursor-pointer font-medium">
            Agent Reasoning ({reasoningSteps.length} steps)
          </summary>
          <div className="mt-2 text-sm text-gray-600">
            {reasoningSteps.join('')}
          </div>
        </details>
      )}

      {/* Tool Calls */}
      {toolCalls.length > 0 && (
        <div className="p-4 border-b">
          <div className="flex gap-2">
            {toolCalls.map((tool, idx) => (
              <span key={idx} className="px-2 py-1 bg-blue-100 rounded text-sm">
                🔧 {tool}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Candidates */}
      <div className="flex-1 overflow-auto p-4">
        {candidates.map((candidate, idx) => (
          <div key={candidate.id} className="mb-4 p-4 border rounded">
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-medium">Option {idx + 1}</h3>
              <span className="text-sm text-gray-500">
                {(candidate.confidence * 100).toFixed(0)}% confidence
              </span>
            </div>
            
            <div className="p-3 bg-blue-50 rounded mb-2">
              {candidate.text}
            </div>
            
            <div className="text-sm text-gray-600 mb-2">
              {candidate.reasoning}
            </div>
            
            {candidate.predictedResponse && (
              <div className="text-sm">
                <span className="font-medium">Predicted response:</span>
                <div className="mt-1 p-2 bg-gray-50 rounded">
                  {candidate.predictedResponse}
                </div>
              </div>
            )}
            
            <button 
              className="mt-2 px-4 py-2 bg-green-500 text-white rounded"
              onClick={() => handleSelectCandidate(candidate)}
            >
              Select & Send
            </button>
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 text-red-600">
          Error: {error}
        </div>
      )}
    </div>
  );
}
```

## IPC Integration (Main Process)

If you want to call the agent from the main process:

```typescript
// In main.ts
import fetch from 'node-fetch';

ipcMain.handle('invoke-agent-mode', async (_, request) => {
  try {
    const response = await fetch('http://localhost:8000/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    
    const result = await response.json();
    return { success: true, ...result };
  } catch (error) {
    return { 
      success: false, 
      error: error.message,
      candidates: [] 
    };
  }
});
```

## Environment Variables

Set in your Electron app:

```typescript
// In main.ts or config
const ML_BACKEND_URL = process.env.ML_BACKEND_URL || 'http://localhost:8000';
```

## Production Deployment

For production, deploy the backend to:
- **Modal**: Serverless, auto-scaling
- **AWS Lambda**: With API Gateway
- **Docker**: On any cloud provider
- **Vercel/Railway**: Simple deployment

Update `ML_BACKEND_URL` to point to your production endpoint.

## Testing

Test the integration:

1. Start backend: `cd ml && python -m deploy.server`
2. Start Electron app: `cd apps/overlay && pnpm start`
3. Select a conversation
4. Click "Agent Mode"
5. Enter a prompt
6. Verify streaming works
7. Select and send a candidate

## Troubleshooting

### CORS errors
The FastAPI server has CORS enabled for all origins. If you still get errors, check your fetch configuration.

### Connection refused
Make sure the backend server is running on port 8000.

### Slow responses
OpenAI API can take 3-10 seconds. Show a loading state to the user.

### Streaming not working
Make sure you're reading the response body as a stream, not waiting for the entire response.


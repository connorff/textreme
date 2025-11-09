# 2025-11-09: Agent Mode Implementation

## Summary
Implemented an AI agent mode powered by Vercel AI SDK with streaming capabilities and structured output. The agent analyzes conversation context and generates 3 contextual message suggestions to help users compose replies.

**Commit:** `04527e4` - "Added agent but it sucks"  
**Files Changed:** 17 files, +1251 additions, -137 deletions

---

## Core Implementation

### 1. Agent Architecture
- **Model:** GPT-5 Mini (configurable via `TEXTREME_AGENT_MODEL` env var)
- **Temperature:** 1.0 (forced for GPT-5 models for creativity)
- **Max Steps:** 8 (allows for reasoning and tool calls)
- **Streaming:** Full stream support with reasoning, tool calls, and results

### 2. Key Components Created

#### Backend (`apps/overlay/agent/`)
- **`agent.ts`** - System prompt and context building
  - Updated to emphasize direct responses, tone matching, and contextual relevance
  - Generates conversation transcript from messages
  
- **`tools.ts`** - Tool definitions for the agent
  - `construct_final_response` tool using `generateObject`
  - Produces exactly 3 candidate messages with reasoning and confidence scores
  - Added explicit system prompt for generating natural, contextual replies
  
- **`run.ts`** - Agent execution with streaming
  - `runAgent()` - Non-streaming execution
  - `runAgentStream()` - Streaming execution with full event stream
  - Prioritizes tool results over raw text output
  
- **`config.ts`** - Model configuration management
  - Reads env vars for model and temperature
  - Enforces temperature=1 for GPT-5 models
  
- **`test-cli.ts`** - Command-line testing script
  - Mock conversation setup for testing agent behavior
  - Useful for debugging without running full Electron app

#### Frontend (`apps/overlay/src/`)

**UI Components:**
- **`AgentView.tsx`** - Main agent interface component
  - Textarea input for user queries
  - Displays streaming timeline (reasoning, tool calls, results)
  - Shows agent history
  - Compact design that fits in chatbox area
  
- **`MessageList.tsx`** - Enhanced to display agent candidates
  - Horizontally stacked suggestion cards
  - Auto-scrolls when candidates appear
  - Small, compact text matching message bubble size
  - Full text display (no truncation)
  - Shows message, reasoning, and confidence percentage

**Hooks:**
- **`useAgent.ts`** - State management for agent
  - Tracks timeline of streaming events
  - Manages current reasoning text
  - Stores final output and history
  - Handles IPC communication with main process

**View Mode:**
- **`useViewMode.ts`** - Updated to support "agent" mode
  - Added "agent" to ViewMode union type
  - Separate buttons for "Edit" (tab) and "Agent" modes
  - Clicking mode buttons doesn't close conversation view
  - Proper window resizing for agent mode

### 3. IPC Communication

**Main Process (`main.ts`):**
- Added `run-agent` IPC handler
- Streams events to renderer via `agent-stream:{streamId}` channel
- Event types: `text-delta`, `tool-call`, `tool-result`, `finish`, `complete`, `error`
- **Critical Fix:** Context now uses UI messages instead of database query
  - `buildAgentContext()` now accepts optional messages parameter
  - Uses displayed messages for accurate context
  - Falls back to database query for backward compatibility

**Preload Script (`preload.ts`):**
- Exposed `runAgent()` - Initiates agent with query and messages
- Exposed `onAgentStream()` - Subscribes to streaming events

**Type Definitions (`types/electron.d.ts`):**
- `AgentOutput` - Structured output schema
- `AgentCandidate` - Individual message candidate
- `AgentStreamEvent` - Union type for all stream events
- `AgentRunResult` - Response from agent invocation

---

## Key Features

### Streaming Timeline
Displays real-time agent progress:
1. **Reasoning** - Shows AI's thought process with pulsing indicator while streaming
2. **Tool Calls** - Blue boxes indicating when tools are invoked
3. **Tool Results** - Green boxes showing tool completion
4. **Final Output** - 3 candidate messages displayed horizontally in message view

### Agent Suggestions Display
- Positioned below conversation messages in MessageList
- 3 equal-width cards that fit without horizontal scrolling
- Each card shows:
  - Message text (text-xs, same as message bubbles)
  - Reasoning explanation (text-[10px])
  - Confidence percentage (text-[10px])
- Hover effect for interactivity
- Click to send selected message via iMessage

### Context Accuracy
**Problem:** Agent was generating irrelevant suggestions (e.g., "got it", "ready") because it queried the database for different messages than what was displayed.

**Solution:** 
- Pass displayed messages from UI to agent
- Agent now sees exact same conversation context as user
- Results in contextually appropriate, on-topic suggestions

---

## System Prompts

### Main Agent Prompt (`agent.ts`)
```
You are an AI assistant helping compose natural iMessage replies.

CRITICAL INSTRUCTIONS:
- Generate replies that DIRECTLY respond to the last message
- Match the user's texting style: casual tone, emojis, abbreviations
- Keep replies SHORT (typically 1-2 sentences max)
- Make replies contextually relevant to what was just said
- Generate diverse options: different tones, lengths, or approaches

PROCESS:
1. Analyze conversation context and user's request
2. Call `construct_final_response` with detailed construction prompt
3. Construction prompt should specify:
   - What the last message said
   - The relationship/vibe between users
   - The tone and style to match
   - What kind of replies to generate
```

### Construction Tool Prompt (`tools.ts`)
```
You generate natural iMessage reply options.
Create exactly 3 diverse candidates that:
- Directly respond to what was said
- Match the specified tone and style
- Are short and natural (like real texts)
- Vary in approach/tone/length

For each candidate provide:
- message: The actual text to send
- reasoning: Brief explanation of the approach/tone
- confidence: Float 0-1 (how appropriate this reply is)
```

---

## Technical Details

### Environment Configuration
```bash
# Model selection
TEXTREME_AGENT_MODEL=gpt-5-mini  # or gpt-4o, gpt-4o-mini, etc.

# Temperature (automatically set to 1.0 for GPT-5 models)
TEXTREME_AGENT_TEMPERATURE=1

# Debugging
TEXTREME_AGENT_DEBUG=1  # Enables detailed logging

# OpenAI API Key (required)
OPENAI_API_KEY=sk-...
```

### Message Flow
1. User enters query in AgentView textarea
2. `useAgent.runAgent()` called with query and conversation messages
3. IPC `run-agent` invoked with query, chatGuid, and messages array
4. Main process builds context from provided messages (or falls back to DB)
5. `runAgentStream()` executes with streaming enabled
6. Events streamed back to renderer via IPC channel
7. `useAgent` updates timeline and currentReasoning state
8. AgentView renders streaming updates in real-time
9. On completion, final output passed to ConversationView
10. MessageList displays candidates horizontally
11. User clicks candidate → message sent via iMessage

### Data Flow for Context
```
UI Messages (MessageList)
    ↓
ConversationView (passes to AgentView)
    ↓
AgentView (passes to useAgent)
    ↓
useAgent.runAgent() (IPC call)
    ↓
Main Process buildAgentContext()
    ↓
Agent System Prompt (conversation transcript)
    ↓
GPT-5 Mini reasoning
    ↓
construct_final_response tool
    ↓
3 Candidate Messages
    ↓
Stream back to UI
    ↓
Display in MessageList
```

---

## UI/UX Improvements

### Auto-scroll
- When agent suggestions appear, view automatically scrolls to bottom
- Uses `scrollIntoView({ behavior: "smooth", block: "end" })`
- Ensures candidates are always visible

### Text Sizing
- Message text: `text-xs` (matches message bubbles)
- Reasoning/confidence: `text-[10px]` (even smaller)
- No truncation - full text wraps naturally
- Compact padding: `p-2` instead of `p-3`

### Layout
- Cards use `flex-1` to split width equally
- `gap-2` for spacing between cards
- Border, rounded corners, hover state
- Click to send functionality

---

## Known Issues & Future Work

### Current Limitations
1. **Quality Issue:** User noted "it sucks" - suggestions need improvement
   - May need better prompt engineering
   - Consider adding more context (relationship type, user preferences)
   - Possibly tune temperature or try different models

2. **No reasoning component:** Initially planned Vercel-style collapsible reasoning blocks, but decided not to implement them

3. **Streaming UX:** Timeline display works but could be more polished

### Potential Improvements
1. **Better Context:**
   - Include user's typical texting patterns
   - Analyze relationship dynamics from message history
   - Consider time of day, conversation recency

2. **Personalization:**
   - Learn user's preferred response styles
   - Track which suggestions get selected
   - Adapt tone based on different contacts

3. **UI Polish:**
   - Better loading states
   - Animation for candidate cards appearing
   - Keyboard shortcuts for selecting candidates

4. **Agent History:**
   - Currently shows in AgentView but could be more useful
   - Filter/search past queries
   - Reuse successful patterns

---

## Testing

### Manual Testing Flow
1. Open conversation with messages
2. Switch to "Agent" mode via top bar button
3. Type query like "how should I respond here?"
4. Watch streaming reasoning appear
5. See tool calls and results
6. View 3 candidate suggestions below messages
7. Click suggestion to send

### CLI Testing
```bash
cd apps/overlay
npx tsx agent/test-cli.ts
```
- Tests agent with mock conversation
- Useful for debugging prompts and model behavior
- Requires OPENAI_API_KEY in .env

---

## Files Modified

### Created
- `apps/overlay/agent/config.ts`
- `apps/overlay/agent/test-cli.ts`
- `apps/overlay/src/components/AgentMessagePane.tsx` (later removed)
- `apps/overlay/src/components/AgentView.tsx`
- `apps/overlay/src/hooks/useAgent.ts`

### Modified
- `apps/overlay/agent/agent.ts` - Better system prompt
- `apps/overlay/agent/run.ts` - Streaming support, tool result prioritization
- `apps/overlay/agent/tools.ts` - Added system prompt to generateObject
- `apps/overlay/src/components/ConversationView.tsx` - Agent mode integration
- `apps/overlay/src/components/conversation/MessageList.tsx` - Candidate display
- `apps/overlay/src/components/conversation/TopBar.tsx` - Mode toggle buttons
- `apps/overlay/src/hooks/useViewMode.ts` - Agent mode support
- `apps/overlay/src/main.ts` - IPC handler, context building from UI messages
- `apps/overlay/src/preload.ts` - IPC bridge for agent
- `apps/overlay/src/types.d.ts` - Type cleanup
- `apps/overlay/src/types/electron.d.ts` - Agent types
- `apps/overlay/src/types/viewMode.ts` - Added "agent" mode

---

## Lessons Learned

1. **Context is Critical:** Agent quality depends heavily on having accurate conversation context. Using displayed messages instead of database queries fixed major relevance issues.

2. **Streaming UX:** Real-time streaming creates better UX than waiting for complete response. Users can see the agent "thinking."

3. **Structured Output:** Using `generateObject` with Zod schema ensures consistent output format, making it easier to render in UI.

4. **Temperature Matters:** GPT-5 models need temperature=1 for creative, diverse responses. Lower temperatures produce repetitive suggestions.

5. **Prompt Engineering:** Specific, detailed prompts with examples and constraints work better than generic instructions.

---

## Next Steps

1. Test with real conversations to evaluate quality
2. Iterate on prompts based on user feedback
3. Consider adding more tools (e.g., lookup contact info, search past messages)
4. Explore personalization based on user's texting patterns
5. Improve UI polish and animations
6. Add analytics to track suggestion acceptance rate


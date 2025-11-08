# UI Redesign and Word Breaking Fix - November 8, 2025

## Summary
This update represents a major redesign of the ConversationView component to implement a clean, compact, tooltip-like interface with three modes (blank, inbox, conversation). It also includes critical fixes for text overflow in message bubbles.

## Key Changes

### 1. Complete UI Redesign

#### New Three-Mode System
- **Blank Mode**: Clean view with just the icon bar
- **Inbox Mode**: Shows top 10 unread conversations with keyboard navigation
- **Conversation Mode**: Displays focused conversation with messages and autocomplete input

#### Mode Switching
- Top left icons for Inbox (Inbox), Tab (Sparkles), and Agent (Sun) modes
- Keyboard shortcut: Cmd-I (or Ctrl-I) to toggle inbox
- Single Escape key press to clear focused conversation and return to blank mode
- Conversation remains selected when switching between inbox and conversation views

### 2. Window Customization

#### Frameless Window
- Removed native title bar and macOS traffic lights
- Window dimensions: 512px wide × 320px tall (16:10 aspect ratio)
- Implemented custom close button (X) in top right
- Entire top bar is draggable (using WebkitAppRegion)
- Buttons use `WebkitAppRegion: 'no-drag'` to remain clickable

#### Window Configuration (main.ts)
```typescript
const mainWindow = new BrowserWindow({
  width: 512,
  height: 320, // 16:10 aspect ratio
  frame: false, // Removes native frame
  webPreferences: {
    preload: path.join(__dirname, "preload.js"),
    nodeIntegration: false,
    contextIsolation: true,
  },
});
```

### 3. Inbox View Improvements

#### UI Design
- Conversations displayed in card-style with subtle hover states
- Selected item highlighted with `bg-accent/50`
- Unread count badge (discrete, shows "9+" for 10+)
- Latest message preview truncated with ellipses
- Auto-scrolling for keyboard-selected items
- Proper padding and spacing

#### Keyboard Navigation
- Arrow Up/Down: Navigate between conversations
- Enter: Select and focus conversation
- Escape: Return to conversation view (if focused) or blank mode
- Cmd-I: Toggle inbox from any mode

### 4. Conversation View Redesign

#### Message Display
- **Grouped Messages**: Consecutive messages from same sender grouped together
- **iMessage-style Bubbles**: 
  - Your messages: `bg-blue-500 text-white`, aligned right
  - Their messages: `bg-gray-100 text-foreground`, aligned left
  - Custom border radius for bubble tails (`18px 4px 18px 18px` or `4px 18px 18px 18px`)
- **Sender Names**: Shown above received message groups (e.g., "John Smith:")
- **Auto-scroll**: Messages container automatically scrolls to bottom when new messages load
- **Max Width**: Message bubbles constrained to 80% of container width

#### Text Overflow Fix (Critical)
Added comprehensive word-breaking CSS to prevent text overflow:
```typescript
className="rounded-2xl px-3 py-1.5 text-xs max-w-full break-words min-w-0"
style={{
  wordBreak: "break-word",
  overflowWrap: "anywhere", // Breaks URLs and long words anywhere if needed
  hyphens: "auto",
}}
```

Key elements:
- `break-words`: Tailwind utility for word breaking
- `min-w-0`: Allows flex items to shrink below content size
- `wordBreak: "break-word"`: CSS property for word breaking
- `overflowWrap: "anywhere"`: Most aggressive breaking, essential for URLs
- `hyphens: "auto"`: Adds hyphens for better readability

Parent container also updated:
```typescript
className="flex flex-col max-w-[80%] min-w-0"
```

The `min-w-0` on parent is critical - it allows flex children to properly respect width constraints.

#### Focused Conversation Pill
- Displays inline with mode icons
- Shows CircleUser icon + conversation name
- X button to clear focus
- Pink/primary background (`bg-primary/10 text-primary`)

### 5. Autocomplete Input

#### Visual Design
- Transparent input background
- Placeholder: "Type a message..." in muted color
- Text size: `text-sm` (14px) with Inter font
- No borders, clean minimal look
- Auto-focuses when conversation is selected

#### Suggestion Dropdown
- Positioned above input (`side="top"`)
- Appears after 300ms debounce (hidden while actively typing)
- Lighter border (`border-gray-100`)
- Diffused shadow: `"0 2px 8px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.05)"`
- Auto-sizing to content width
- Mock suggestions for now: "mock suggestion #1", "#2", "#3"

#### Keyboard Navigation
- Arrow Up/Down: Navigate suggestions (when dropdown visible and not typing)
- Enter: Select highlighted suggestion
- Other keys: Pass through to input (dropdown ignores)
- Selected item: `bg-blue-50 text-blue-600`
- Auto-scrolls selected suggestion into view

### 6. OpenAI Integration (Backend)

#### New IPC Handler: `generate-suggestions`
```typescript
ipcMain.handle(
  "generate-suggestions",
  async (_event, chatGuid: string, mode: 'tab' | 'agent', draft?: string)
)
```

#### `generateSuggestionsWithOpenAI` Function
- Fetches last 5 messages from chat.db for context
- Truncates each message to 200 characters
- Constructs mode-specific prompts:
  - **Tab Mode**: Casual, concise SMS responses (1-2 sentences)
  - **Agent Mode**: 3 distinct options with rationales (JSON format)
- Calls OpenAI GPT-4o-mini API
- Temperature: 0.8, Max tokens: 300
- Returns suggestions and optional rationales

#### Environment Variable
Requires `OPENAI_API_KEY` environment variable to be set.

### 7. State Management

#### New State Variables
- `mode`: ViewMode ("blank" | "inbox" | "conversation")
- `focusedConversation`: Currently selected conversation (persists across mode switches)
- `messages`: Last 5 messages for focused conversation
- `draft`: Text input value
- `suggestions`: Autocomplete suggestions array
- `selectedSuggestionIndex`: Currently highlighted suggestion
- `isTyping`: Tracks if user is actively typing (hides dropdown)

#### Refs
- `selectedRef`: Auto-scroll inbox selection
- `inputRef`: Focus management for text input
- `messagesContainerRef`: Auto-scroll messages to bottom
- `suggestionRefs`: Array of refs for suggestion items (auto-scroll)

#### Key Functions
- `handleInboxClick()`: Toggle between modes with smart navigation
- `handleSelectConversation(index)`: Focus a conversation
- `handleClearFocus()`: Clear focused conversation and return to blank mode
- `handleSuggestionClick(suggestion)`: Paste suggestion into input
- `fetchConversations()`: Poll for conversations every 3 seconds
- `fetchMessages(chatGuid)`: Fetch last 5 messages for conversation

### 8. Simplified Keyboard Shortcuts

#### Removed
- Cmd-D shortcut (no longer needed)

#### Updated
- **Escape**: Single press now clears focus entirely (was two-step before)
  - In Conversation mode: Clears focus and returns to blank
  - In Inbox mode: Returns to conversation (if focused) or blank
- **Cmd-I**: Toggle inbox from any mode

### 9. Type Definitions

#### New Interfaces (electron.d.ts)
```typescript
export interface SuggestionRequest {
  chatGuid: string;
  mode: "tab" | "agent";
  draft?: string;
  lastMessages: ConversationMessage[];
}

export interface SuggestionResponse {
  success: boolean;
  suggestions: string[];
  rationales?: string[];
  error?: string;
}

export interface SendMessageResult {
  success: boolean;
  error?: string;
}
```

#### Updated ElectronAPI
Added methods:
- `generateSuggestions(chatGuid, mode, draft?)`
- `sendIMessage(recipient, messageText)`
- `closeWindow()`

### 10. IPC Handlers

#### New in main.ts
- `close-window`: Closes focused Electron window
- `generate-suggestions`: Generates AI-powered text suggestions

#### Updated in preload.ts
Exposed new IPC handlers to renderer process:
- `generateSuggestions`
- `sendIMessage`
- `closeWindow`

## Files Modified

### apps/overlay/src/components/ConversationView.tsx
- Complete rewrite: ~83 lines → ~558 lines
- Implemented three-mode UI system
- Added message grouping and bubble UI
- Implemented autocomplete with dropdown
- Fixed text overflow with aggressive word-breaking CSS
- Added comprehensive keyboard navigation

### apps/overlay/src/main.ts
- Updated window configuration (frameless, custom dimensions)
- Added `close-window` IPC handler
- Implemented `generateSuggestionsWithOpenAI` function
- Added `generate-suggestions` IPC handler with OpenAI integration
- Uses `extractMessageText` for proper message parsing

### apps/overlay/src/preload.ts
- Exposed `generateSuggestions` IPC handler
- Exposed `sendIMessage` IPC handler
- Exposed `closeWindow` IPC sender
- Reformatted for better readability

### apps/overlay/src/types/electron.d.ts
- Added `SuggestionRequest` interface
- Added `SuggestionResponse` interface
- Added `SendMessageResult` interface
- Updated `ElectronAPI` interface with new methods

## Technical Details

### Message Grouping Algorithm
```typescript
const groupedMessages: Array<{
  senderId: string;
  isFromMe: boolean;
  senderName: string;
  messages: ConversationMessage[];
}> = [];

messages.forEach((msg) => {
  const senderId = msg.isFromMe ? "me" : msg.handleIdentifier || "unknown";
  const lastGroup = groupedMessages[groupedMessages.length - 1];
  
  if (lastGroup && lastGroup.senderId === senderId) {
    lastGroup.messages.push(msg);
  } else {
    groupedMessages.push({
      senderId,
      isFromMe: msg.isFromMe,
      senderName: /* ... */,
      messages: [msg],
    });
  }
});
```

### Auto-Scroll Implementation
```typescript
useEffect(() => {
  if (messagesContainerRef.current && messages.length > 0) {
    messagesContainerRef.current.scrollTop =
      messagesContainerRef.current.scrollHeight;
  }
}, [messages]);
```

### Suggestion Debouncing
```typescript
useEffect(() => {
  if (!focusedConversation || !draft.trim()) {
    setSuggestions([]);
    return;
  }

  setIsTyping(true);
  setSuggestions([]);

  const timeoutId = setTimeout(() => {
    // Generate suggestions after 300ms
    setSuggestions([/* mock suggestions */]);
    setIsTyping(false);
  }, 300);

  return () => clearTimeout(timeoutId);
}, [draft, focusedConversation]);
```

## Bug Fixes

### Critical: Text Overflow in Message Bubbles
**Issue**: Long URLs and words would overflow message bubbles, breaking the UI layout.

**Root Cause**: 
1. Flex containers don't allow children to shrink below their content size by default
2. Missing word-breaking CSS properties
3. Standard `word-break: break-word` insufficient for URLs

**Solution**:
1. Added `min-w-0` to parent container and message bubble
2. Applied multiple word-breaking properties:
   - `break-words` (Tailwind)
   - `wordBreak: "break-word"`
   - `overflowWrap: "anywhere"` (most important for URLs)
   - `hyphens: "auto"`
3. Ensured `max-w-full` and proper flex constraints

**Result**: Text now properly wraps within bubbles, breaking even long URLs anywhere if necessary.

### Simplified Escape Behavior
**Issue**: Pressing Escape twice was required to clear a focused conversation (once to exit conversation mode, once to clear the pill).

**Solution**: Consolidated Escape handling to call `handleClearFocus()` directly in conversation mode, which clears focus and returns to blank mode in one step.

## UI/UX Improvements

### Discrete Design
- Muted colors for icons: `text-muted-foreground hover:text-foreground`
- Subtle backgrounds: `bg-accent/50`, `bg-accent/20`
- Lighter borders and shadows throughout
- Compact spacing and padding

### Accessibility
- Proper keyboard navigation for all modes
- Auto-scrolling for selected items
- Focus management for input field
- ARIA labels for input: `aria-label="Type a message"`

### Performance
- Background polling every 3 seconds (non-blocking)
- Debounced suggestion generation (300ms)
- Efficient message grouping algorithm
- Proper cleanup of intervals and timeouts

## Known Limitations

### Current Mock Implementations
- Suggestions are hardcoded mock data
- Tab and Agent mode buttons are non-functional (UI only)
- No actual message sending implemented yet

### Future Enhancements
- Replace mock suggestions with actual OpenAI calls
- Implement Tab and Agent mode functionality
- Add send message functionality
- Add message composition features
- Implement message reactions/tapbacks
- Add attachment support

## Testing Recommendations

1. **Text Overflow**: Test with long URLs (like Figma links) to verify wrapping
2. **Keyboard Navigation**: Test all keyboard shortcuts in each mode
3. **Mode Switching**: Verify conversation state persists when switching modes
4. **Auto-scroll**: Verify messages and selections scroll properly
5. **Autocomplete**: Test typing, debouncing, and suggestion selection
6. **Window Dragging**: Verify window can be dragged from top bar
7. **Window Resizing**: Test how UI responds to window size changes

## Dependencies

### Required Environment Variables
- `OPENAI_API_KEY`: OpenAI API key for suggestion generation

### External APIs
- OpenAI GPT-4o-mini (chat completions endpoint)

### Custom Components
- `ScrollArea` from `@/components/ui/scroll-area`
- `Popover`, `PopoverContent` from `@/components/ui/popover`
- `CommandList`, `CommandItem` from `@/components/ui/command`

### Icons
- `Inbox`, `Sparkles`, `Sun`, `X`, `CircleUser` from `lucide-react`

## Conclusion

This update transforms the application from a complex iMessage clone into a focused, compact tooltip-style interface optimized for quick message triage and response. The three-mode system provides clear separation of concerns, while the improved keyboard navigation and visual polish create a smooth user experience. The critical text overflow fix ensures the UI remains visually clean even with challenging content like long URLs.


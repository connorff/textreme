# Development Log: November 8, 2025

## Initial Setup & Database Access Implementation

### Summary

Established foundational infrastructure for Textreme - an AI-powered iMessage response generation system. Implemented database access verification, permission handling, and IPC communication between Electron main and renderer processes.

---

## Project Understanding

### Architecture Overview

**Textreme** is a monorepo combining:

- **Electron overlay app** (React + Vite + TypeScript) - UI/UX layer
- **Schema package** - Zod schemas for iMessage data structures and API contracts
- **Client package** - API client (placeholder for Modal/OpenAI)
- **ML components** - Python/Modal for model training and inference

### Core Features (from planning docs)

1. **Tab Mode**: Real-time completion suggestions while typing (<500ms latency goal)
2. **Agent Mode**: Intent-based message generation with tool calling
3. **P1 Feature**: Predict recipient's response before sending (differentiator)

### iMessage Database

- Location: `~/Library/Messages/chat.db`
- Format: SQLite database with ~24 tables
- Key tables: `message`, `chat`, `handle`, `attachment`, `chat_message_join`
- Challenge: Binary `attributedBody` field (NSAttributedString) requires decoding
- See `imessage-db-exploration.md` for comprehensive database guide

---

## What We Built Today

### 1. Database Access Verification System

**Problem**: Electron apps need Full Disk Access permission to read `chat.db`

**Solution**: Multi-layer permission verification flow

#### IPC Handlers (`src/main.ts`)

Implemented 4 main process handlers:

```typescript
// 1. Check file access permissions
ipcMain.handle("check-database-access", async () => {...})

// 2. Get database file statistics
ipcMain.handle("get-database-stats", async () => {...})

// 3. Query database tables to verify read capability
ipcMain.handle("get-database-tables", async () => {...})

// 4. Open System Settings to grant permissions
ipcMain.handle("open-system-preferences", async () => {...})
```

#### IPC Bridge (`src/preload.ts`)

Secure bridge exposing APIs to renderer:

```typescript
contextBridge.exposeInMainWorld("electronAPI", {
  checkDatabaseAccess: () => ipcRenderer.invoke("check-database-access"),
  getDatabaseStats: () => ipcRenderer.invoke("get-database-stats"),
  getDatabaseTables: () => ipcRenderer.invoke("get-database-tables"),
  openSystemPreferences: () => ipcRenderer.invoke("open-system-preferences"),
});
```

#### TypeScript Definitions (`src/types/electron.d.ts`)

Type-safe API interface:

```typescript
interface ElectronAPI {
  checkDatabaseAccess: () => Promise<DatabaseAccessResult>;
  getDatabaseStats: () => Promise<DatabaseStats>;
  getDatabaseTables: () => Promise<DatabaseTablesResult>;
  openSystemPreferences: () => Promise<SystemPreferencesResult>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
```

### 2. Permission Loader Component

**Component**: `src/components/PermissionLoader.tsx`

**Features**:

- Real-time permission checking on mount
- Beautiful Apple-style UI with loading states
- Automatic retry after permission grant
- "Open System Settings" button with deep link
- Displays database stats and first 10 tables on success
- Auto-transitions to main app after verification

**User Flow**:

1. App launches → Shows spinning loader
2. Permission denied → Instructions + "Open System Settings" button
3. User grants access in Settings → Clicks "Retry"
4. Success → Shows DB stats + tables → Transitions to main app (1.5s delay)

### 3. SQLite Integration (Critical Decision)

#### Initial Approach: better-sqlite3 ❌

- Attempted to use `better-sqlite3` v11.7.0
- **Problem**: Incompatible with Electron 39's V8 engine
  - v11.x requires C++20 APIs not in Electron 39
  - v9.6.0 forces C++17 compilation
  - Native module compilation failed repeatedly

#### Final Solution: Node.js Built-in SQLite ✅

- Electron 39 uses Node 22, which includes `node:sqlite` module
- **Benefits**:
  - No native compilation needed
  - No version conflicts
  - Experimental but stable enough for our use case
  - Perfect compatibility with Electron

**Implementation**:

```typescript
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(CHAT_DB_PATH, { readOnly: true });
const stmt = db.prepare("SELECT name, type FROM sqlite_master...");
const tables = stmt.all();
db.close();
```

**Vite Configuration** (critical):

```typescript
// vite.main.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      external: ["node:sqlite"], // Don't bundle Node built-ins
    },
  },
});
```

---

## Current State (Working ✅)

### What's Implemented

1. ✅ **Database access verification** - File read checks + SQL query validation
2. ✅ **Permission flow UI** - Beautiful loader with error handling
3. ✅ **IPC communication** - Type-safe bridge between processes
4. ✅ **SQLite integration** - Can query all 24 tables successfully
5. ✅ **Development environment** - Hot reload, DevTools, proper Electron Forge setup

### Test Results

```
=== iMessage Database Tables (first 10) ===
1. _SqliteDatabaseProperties (table)
2. attachment (table)
3. chat (table)
4. chat_handle_join (table)
5. chat_lookup (table)
6. chat_message_join (table)
7. chat_recoverable_message_join (table)
8. chat_service (table)
9. deleted_messages (table)
10. handle (table)
Total tables/views: 24
```

### Known Warnings (Non-blocking)

- `ExperimentalWarning: SQLite is an experimental feature` - Expected, safe to ignore
- DevTools autofill errors - Cosmetic, doesn't affect functionality
- `better-sqlite3` in build scripts warning - Leftover from removed dependency, harmless

---

## Architecture Decisions

### 1. Permission-First Flow

**Decision**: Gate entire app behind database access verification

**Rationale**:

- App is useless without iMessage data
- Better UX to fail fast with clear instructions
- Prevents confusing runtime errors later

### 2. IPC Over Direct Access

**Decision**: All database operations in main process, accessed via IPC

**Rationale**:

- Security: Renderer process can't access filesystem directly
- Stability: SQLite handles stay in main process (proper lifecycle)
- Electron best practice: Keep privileged operations in main process

### 3. Node Built-in Over Native Module

**Decision**: Use `node:sqlite` instead of `better-sqlite3`

**Rationale**:

- Zero compilation complexity
- No version incompatibility issues
- Simpler deployment (no native rebuilds needed)
- Trade-off: Experimental status (acceptable for P0)

---

## File Structure

```
apps/overlay/
├── src/
│   ├── main.ts              # Electron main process + IPC handlers
│   ├── preload.ts           # IPC bridge (contextBridge)
│   ├── renderer.ts          # Renderer entry point
│   ├── app.tsx              # React root with permission flow
│   ├── index.css            # Global styles + animations
│   ├── components/
│   │   └── PermissionLoader.tsx  # Permission verification UI
│   └── types/
│       └── electron.d.ts    # TypeScript definitions for IPC
├── forge.config.ts          # Electron Forge configuration
├── vite.main.config.ts      # Vite config for main process
├── vite.preload.config.ts   # Vite config for preload script
├── vite.renderer.config.ts  # Vite config for renderer
└── package.json
```

---

## Next Steps (For Future Agent)

### Immediate Priorities

#### 1. Data Extraction Layer

**Goal**: Build service to read messages from database

**Tasks**:

- Create `src/services/database.ts` with query helpers
- Implement message extraction with `attributedBody` decoding
- Handle Apple epoch timestamp conversion (see `imessage-db-exploration.md`)
- Add pagination for large result sets

**Reference Implementation** (from exploration guide):

```python
# Binary message decoding logic (needs TS port)
def extract_from_binary(attributed_body):
    text = attributed_body.decode('utf-8', errors='ignore')
    # Remove NSAttributedString artifacts
    # See imessage-db-exploration.md lines 172-239
```

#### 2. Conversation List UI

**Goal**: Display recent conversations with metadata

**Components Needed**:

- `ConversationList.tsx` - Scrollable list of chats
- `ConversationItem.tsx` - Individual chat preview
- `MessageBubble.tsx` - Individual message display

**IPC Methods to Add**:

```typescript
// main.ts handlers
ipcMain.handle("get-recent-chats", async (_, limit: number) => {...})
ipcMain.handle("get-conversation", async (_, chatId: string) => {...})
ipcMain.handle("search-messages", async (_, query: string) => {...})
```

#### 3. Mock Tab Mode UI

**Goal**: Build UI scaffolding (without real ML)

**Components**:

- `MessageInput.tsx` - Text field with Tab handler
- `SuggestionsList.tsx` - Ranked completions display
- `ConfidenceBar.tsx` - Visual confidence indicator

**Mock Data Structure**:

```typescript
interface MockSuggestion {
  text: string;
  confidence: number; // 0-1
  reasoning?: string; // For debugging
}

const mockSuggestions: MockSuggestion[] = [
  { text: "Sounds good!", confidence: 0.85 },
  { text: "I'm free around 7pm", confidence: 0.72 },
  { text: "Let me check and get back to you", confidence: 0.68 },
];
```

### Medium-Term Goals

#### 4. Window Management

**Current**: Standard Electron window
**Goal**: Overlay behavior

**Tasks**:

- Global hotkey (Cmd+Shift+T) to show/hide
- Always-on-top window property
- Click-through for non-interactive areas
- Position near Messages.app or system-wide

**Reference**:

```typescript
const mainWindow = new BrowserWindow({
  alwaysOnTop: true,
  frame: false,
  transparent: true,
  // ... more overlay properties
});
```

#### 5. ML Integration Prep

**Goal**: Set up endpoints for model inference

**Architecture**:

- Mock API service returning fake suggestions
- Later: Connect to Modal endpoints
- Add loading states and error handling

**API Client Structure** (in `packages/client/`):

```typescript
interface TabSuggestAPI {
  getSuggestions(context: ConversationContext): Promise<Suggestion[]>;
}

// Mock implementation first, real later
class MockTabSuggestAPI implements TabSuggestAPI {...}
class ModalTabSuggestAPI implements TabSuggestAPI {...}
```

---

## Known Issues & Gotchas

### 1. Binary Message Decoding

**Status**: Not implemented yet
**Impact**: Can only read plain `text` field, missing rich messages
**Solution**: Port Python decoder from `imessage-db-exploration.md` (lines 172-239)

### 2. Experimental SQLite Warning

**Status**: Expected behavior
**Impact**: None (warning only)
**Action**: Can suppress with `--no-warnings` flag if desired

### 3. Group Chat Support

**Status**: Not tested
**Impact**: Unknown behavior for group messages
**Action**: Test with group chats, may need special handling

### 4. Timezone Handling

**Status**: Using system timezone
**Impact**: May show incorrect times if DB uses different timezone
**Solution**: Always convert Apple epoch to UTC first, then to local

---

## Development Commands

```bash
# Install dependencies (from repo root)
pnpm install

# Run dev server with hot reload
pnpm dev

# Build for production
pnpm build

# Lint
pnpm lint
```

---

## Resources Created

1. **This Log**: `notes/2025-11-08-initial-setup-and-db-access.md`
2. **Overlay README**: `apps/overlay/README.md` (basic setup guide)
3. **iMessage DB Guide**: `notes/imessage-db-exploration.md` (comprehensive reference)
4. **Connor's Notes**: `notes/connor-starting-thoughts.md` (P0/P1 feature breakdown)
5. **Ameya's Notes**: `notes/ameya.md` (AppleScript snippets for automation)

---

## Key Learnings

1. **Electron + Vite**: Works great, but native modules need special handling
2. **Node Built-ins**: Prefer over npm packages when available (simpler, faster)
3. **IPC Design**: Type everything, test early, fail gracefully
4. **Permission UX**: Clear instructions >> cryptic errors
5. **SQLite in Electron**: `node:sqlite` is the way for modern Electron (v22+)

---

## Demo Scenarios (For Testing)

### Scenario 1: First Launch (No Permissions)

1. Launch app
2. See permission denied screen
3. Click "Open System Settings"
4. Grant Full Disk Access
5. Click "Retry"
6. Should see table list → transition to main app

### Scenario 2: Already Has Permissions

1. Launch app
2. See brief loading spinner
3. See database stats + tables
4. Auto-transition to main app (1.5s)

### Scenario 3: Database Not Found

1. Remove/rename `~/Library/Messages/chat.db`
2. Launch app
3. Should see "Database file not found" error
4. Helpful message about iMessage setup

---

## Technical Debt (To Address Later)

1. [ ] Remove inline styles from components (move to CSS modules)
2. [ ] Add error boundary for React crashes
3. [ ] Implement proper logging system (not just console.log)
4. [ ] Add retry logic with exponential backoff for IPC calls
5. [ ] Cache database connection in main process (currently open/close per query)
6. [ ] Add telemetry/analytics hooks (if desired)
7. [ ] Write tests (Jest + Electron test harness)

---

## Contact & Handoff Notes

**For Next Developer**:

- All IPC methods are in `main.ts` - extend there
- UI components should go in `src/components/`
- Follow existing TypeScript patterns (strict mode enabled)
- Check DevTools console for database query logs
- Database is read-only by design - never write to `chat.db`

**Questions to Consider**:

- How to handle live database updates? (polling vs file watching)
- Should we cache conversation data in memory?
- What's the UX for handling missing permissions mid-session?
- How to test without real iMessage data? (need fixture generator)

---

## Success Metrics Achieved

✅ Database access verified and working
✅ Permission flow fully functional
✅ Can query all iMessage tables
✅ Type-safe IPC communication
✅ Clean architecture with separation of concerns
✅ Development environment stable and fast
✅ Foundation ready for feature development

**Bottom Line**: The scaffolding is solid. Next agent can focus on features, not infrastructure.

---

_Log compiled by AI Agent - November 8, 2025_
_Last verified: Electron app successfully querying 24 database tables_

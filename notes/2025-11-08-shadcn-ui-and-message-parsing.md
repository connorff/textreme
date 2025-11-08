# Development Log: November 8, 2025 - Shadcn UI & Message Parsing

## Session Overview

Added Shadcn UI component library, created a two-pane ChatGPT-style interface for viewing unread messages, and fixed binary message parsing from iMessage's `attributedBody` format.

---

## Major Changes

### 1. Shadcn UI Integration

**Added Dependencies:**
- `tailwindcss@^3.4.18` (downgraded from v4 for compatibility)
- `@radix-ui/react-avatar`, `@radix-ui/react-scroll-area`, `@radix-ui/react-slot`
- `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`
- `autoprefixer`, `postcss`

**Configuration Files Created:**
- `apps/overlay/tailwind.config.js` - Tailwind configuration with custom theme
- `apps/overlay/postcss.config.js` - PostCSS configuration
- `apps/overlay/components.json` - Shadcn UI configuration

**Updated Theme:**
Applied pink/rose primary color theme:
```css
--primary: 346.8 77.2% 49.8%;  /* Pink accent */
--primary-foreground: 355.7 100% 97.3%;
```

**Vite Configuration:**
- Added path alias `@/` → `./src`
- Added React deduplication to fix hook errors: `dedupe: ['react', 'react-dom']`
- Added `optimizeDeps` for React pre-bundling

### 2. Two-Pane UI Component (`ConversationView.tsx`)

**Created:** `apps/overlay/src/components/ConversationView.tsx`

**Features:**
- **Left Sidebar (320px):**
  - List of unread conversations
  - Avatar with initials
  - Badge overlay on avatar showing unread count
  - Last message preview (2 lines with ellipsis)
  - Timestamp (relative: "5m ago", "2h ago", etc.)
  - Hover and selected states
  
- **Right Pane:**
  - Selected conversation header with avatar and name
  - Messages displayed chronologically (oldest first, like iMessage)
  - Message bubbles:
    - Sent messages: Blue (primary), aligned right
    - Received messages: Gray (muted), aligned left with avatar
  - Time separators for gaps > 5 minutes
  - Attachment indicators
  - Reaction/tapback handling

**Layout:**
- Full height, overflow handling
- Smooth scrolling with Shadcn `ScrollArea`
- Proper text truncation and wrapping (`break-all` for long URLs)

### 3. Shadcn UI Components Created

**Files:**
- `src/components/ui/avatar.tsx` - Avatar component with fallback
- `src/components/ui/badge.tsx` - Badge component for counts
- `src/components/ui/button.tsx` - Button component with variants
- `src/components/ui/scroll-area.tsx` - Scrollable area component
- `src/lib/utils.ts` - Utility function for className merging

### 4. Binary Message Parsing Fix

**Problem:** 
Messages with rich text formatting stored in `attributedBody` (NSAttributedString binary format) were displaying as long sequences of numbers or "[No text content]".

**Solution:**
Completely rewrote `extractTextFromAttributedBody()` function in `main.ts`:

```typescript
function extractTextFromAttributedBody(attributedBody: Buffer | null): string | null {
  // 1. Convert buffer to UTF-8 string
  // 2. Remove control characters (keep newlines/spaces)
  // 3. Remove NSAttributedString class names and artifacts
  // 4. Extract readable text chunks (regex: /[A-Za-z0-9][A-Za-z0-9\s\p{P}\p{S}]{2,}/gu)
  // 5. Filter chunks (must contain letters, at least 3 chars)
  // 6. Join and clean up whitespace
  // 7. Validate final result
}
```

**Key Insights from Database Exploration:**
- Text IS stored as readable UTF-8 in the binary data
- After "NSString" marker, actual message text follows
- Control characters and class names need to be filtered
- Messages like "Work rn\n\n1. Superhuman-esque interface..." are properly extracted

### 5. Phone Number Handling

**Created:** `src/lib/phone-utils.ts`

**Functions:**
- `isPhoneIdentifier()` - Checks if a string is a phone number
- Phone numbers without contact names display as "Unknown Contact" instead of raw numbers

**Privacy Enhancement:**
- Only logs contact loading for NEW phone numbers
- Existing cached contacts don't trigger logs

### 6. Contact Resolution Improvements

**Enhanced Contact Loading (`main.ts`):**
- Pre-loads contact map once for all unread messages
- Caches lookups to avoid redundant contact queries
- Validates phone numbers before contact lookup
- Multiple format matching (normalized, with/without +, last 7/10 digits)

### 7. UI/UX Improvements

**Index.css Updates:**
- Added Tailwind directives and utilities
- CSS custom properties for theming
- Dark mode support (though not actively used yet)

**App.tsx:**
- Simplified to use `ConversationView` component
- Removed old `UnreadMessages` component usage

**TypeScript Configuration:**
- Added `@/*` path alias to `tsconfig.json`

### 8. Build Configuration

**Forge Config:**
- Ensured contacts_dump binary is copied to build

**Package.json:**
- Added pnpm overrides to ensure React 19 consistency across monorepo

---

## Files Created

1. `apps/overlay/tailwind.config.js`
2. `apps/overlay/postcss.config.js`
3. `apps/overlay/components.json`
4. `apps/overlay/src/components/ConversationView.tsx`
5. `apps/overlay/src/components/ui/avatar.tsx`
6. `apps/overlay/src/components/ui/badge.tsx`
7. `apps/overlay/src/components/ui/button.tsx`
8. `apps/overlay/src/components/ui/scroll-area.tsx`
9. `apps/overlay/src/lib/utils.ts`
10. `apps/overlay/src/lib/phone-utils.ts`

## Files Modified

1. `apps/overlay/package.json` - Added Shadcn/Tailwind dependencies
2. `apps/overlay/src/index.css` - Added Tailwind and theme
3. `apps/overlay/src/app.tsx` - Use ConversationView
4. `apps/overlay/src/main.ts` - Fixed message parsing, contact loading
5. `apps/overlay/tsconfig.json` - Added `@/*` alias
6. `apps/overlay/vite.renderer.config.ts` - Added `@/` alias, React dedupe
7. `package.json` - Added React overrides
8. `packages/schema/src/index.ts` - Minor type updates

## Files Deleted

None (UnreadMessages.tsx kept for reference but unused)

---

## Technical Challenges Solved

### Challenge 1: React Hook Errors
**Problem:** Multiple React instances causing "Invalid hook call" errors

**Solution:** 
- Added `dedupe: ['react', 'react-dom']` to Vite config
- Added pnpm overrides in root package.json
- Ensured React 19 consistency across workspace

### Challenge 2: Tailwind v4 Compatibility
**Problem:** Tailwind CSS v4 uses different PostCSS plugin structure

**Solution:**
- Downgraded to Tailwind v3.4.18
- Used standard `tailwindcss` PostCSS plugin instead of `@tailwindcss/postcss`

### Challenge 3: Text Clipping in Sidebar
**Problem:** Long messages and names were getting cut off

**Solution:**
- Added proper `overflow-hidden` and `min-w-0` to flex containers
- Used `line-clamp-2` for message previews
- Used `break-all` to allow mid-word breaks for long URLs
- Proper flex container nesting with width constraints

### Challenge 4: Binary Message Parsing
**Problem:** Messages showing as "4,11,115,116,114,101,97,109..." or "[No text content]"

**Solution:**
- Created SQL debug script to examine raw binary data
- Discovered text is embedded as UTF-8 in NSAttributedString format
- Wrote extraction function that finds and joins readable text chunks
- Filters out class names and control characters while preserving actual content

---

## Testing Notes

**Tested Scenarios:**
1. ✅ Loading unread conversations from iMessage database
2. ✅ Displaying conversation list with avatars and badges
3. ✅ Selecting conversations and viewing messages
4. ✅ Message bubble layout (sent vs received)
5. ✅ Text extraction from binary attributedBody
6. ✅ Contact name resolution and caching
7. ✅ Phone number privacy (showing "Unknown Contact")
8. ✅ Responsive scrolling and overflow handling

**Known Issues:**
- None currently identified

---

## Performance Optimizations

1. **Contact Loading:**
   - Load contact map once on first unread message fetch
   - Cache all lookups in memory
   - Only log for NEW phone numbers

2. **React Rendering:**
   - Proper key usage on mapped components
   - Memoized callback for data fetching
   - Efficient state updates (ID-based instead of object-based)

3. **Message Polling:**
   - Configurable poll interval (default 2000ms)
   - Updates selected conversation data without losing selection

---

## Next Steps (Potential)

1. **Message Actions:**
   - Mark as read functionality
   - Quick reply input
   - Copy message text

2. **Filtering/Search:**
   - Search conversations
   - Filter by unread count or date
   - Sort options

3. **Notifications:**
   - System notifications for new messages
   - Badge count on app icon

4. **Performance:**
   - Virtual scrolling for large conversation lists
   - Lazy loading of message history

5. **UI Enhancements:**
   - Dark mode toggle
   - Custom theme selector
   - Message timestamps on hover

---

## Dependencies Added

```json
{
  "devDependencies": {
    "tailwindcss": "^3.4.18",
    "@radix-ui/react-avatar": "^1.1.11",
    "@radix-ui/react-scroll-area": "^1.2.10",
    "@radix-ui/react-slot": "^1.2.4",
    "autoprefixer": "^10.4.21",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^0.553.0",
    "postcss": "^8.5.6",
    "tailwind-merge": "^3.3.1"
  }
}
```

---

## Lessons Learned

1. **Tailwind Version Compatibility:** Shadcn UI requires Tailwind v3, not v4
2. **React Deduplication:** Monorepos need explicit React deduplication in Vite
3. **Binary Format Research:** Direct database exploration is invaluable for reverse engineering
4. **Flex Layout:** Proper `min-w-0` and `overflow-hidden` are critical for text truncation in flex containers
5. **Contact Privacy:** Be thoughtful about logging PII like phone numbers

---

**Session Duration:** ~3 hours
**Commits:** 1 (this session)
**Lines Changed:** ~1,818 additions, ~125 deletions

---

*Last Updated: November 8, 2025*


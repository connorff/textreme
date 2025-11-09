# 2025-11-09 — Attachments rendering, mixed messages, and scroll behavior

## Summary of important updates

- Image attachments now render reliably in the message view:
  - Added IPC `read-file-as-data-url` in `apps/overlay/src/main.ts` to load local files and return data URLs; avoids Chromium file:// restrictions.
  - Exposed `readFileAsDataUrl` and `resolveFileUrl` via `preload.ts`.
  - `MessageBubble.tsx` prefers data URLs to render images; hides broken images; adds structured logs.
  - Sanitizes invisible characters (e.g., U+FFFC) so media-only messages aren’t treated as non-empty text.
  - For mixed text+image messages, attachments render first (no bubble), then the text bubble.
  - For images-only messages, images render without a bubble.

- Attachment metadata plumbed through to renderer:
  - `dtoToConversationMessage` now includes `attachments` from the CLI response (`main.ts`).
  - `types/electron.d.ts` extended with a typed `attachments` array.

- Conversation fetch ordering fixed to show recent history correctly:
  - Removed `--ascending` when calling `messages` CLI; fetch latest first then `.reverse()` in `main.ts` to present ascending within the latest window.

- Scroll behavior refined:
  - `useMessages.ts`: no auto-scroll on polling; only scrolls on initial open of a conversation.
  - `ConversationView.tsx`: scrolls to bottom immediately after sending a message.
  - `MessageList.tsx`: bottom anchor + ref wiring to support precise scroll without relying on ScrollArea internals.

- UX/preview improvements:
  - Fallback labels for non-text messages in list preview and bubbles (e.g., `[Image]`, `[Video]`, `[Audio]`, `[Sticker]`, `[PDF]`).

## Touched files (high-signal)
- apps/overlay/src/components/conversation/MessageBubble.tsx
- apps/overlay/src/components/conversation/MessageList.tsx
- apps/overlay/src/components/ConversationView.tsx
- apps/overlay/src/hooks/useMessages.ts
- apps/overlay/src/main.ts
- apps/overlay/src/preload.ts
- apps/overlay/src/types/electron.d.ts

## Notes
- Renderer logs include structured `[Attachments] …` lines to help diagnose any remaining edge-cases.
- If any specific image still fails to render, verify the `read-file-as-data-url` length logs and try opening the decoded path with Quick Look (`qlmanage -p`).

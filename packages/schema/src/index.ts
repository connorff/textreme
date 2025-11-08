import { z } from "zod";

// core entities based on iMessage chat.db structure
// complete schema based on actual database columns

// message table columns:
// ROWID, guid, text, attributedBody, date, is_from_me, handle_id, service,
// cache_has_attachments, item_type, associated_message_guid, associated_message_type,
// associated_message_emoji

export const MessageSchema = z.object({
  // identifiers
  id: z.string(), // ROWID as string
  guid: z.string(), // global unique identifier

  // content
  text: z.string().nullable(), // plain text (can be null if only attributedBody)
  attributedBody: z.any().nullable().optional(), // binary NSAttributedString for rich text (Buffer in Node, Uint8Array in browser)

  // metadata
  date: z.number(), // Apple epoch timestamp (nanoseconds since 2001-01-01)
  isFromMe: z.boolean(), // true if sent by user, false if received
  handleId: z.string().nullable(), // foreign key to handle table (sender/recipient)
  service: z.string().nullable(), // "iMessage", "SMS", "RCS", etc
  isRead: z.boolean().default(false), // true if message has been read
  dateRead: z.number().nullable().optional(), // timestamp when message was read (Apple epoch)

  // attachments & special types
  cacheHasAttachments: z.boolean().default(false), // true if message has media
  itemType: z.number().default(0), // 0=regular message, others=special types

  // reactions/replies (tapbacks)
  associatedMessageGuid: z.string().nullable().optional(), // GUID of message being reacted to
  associatedMessageType: z.number().nullable().optional(), // 2000-2006 for reaction types
  associatedMessageEmoji: z.string().nullable().optional(), // emoji string for custom reactions

  // computed/helper fields (not from DB)
  conversationId: z.string().optional(), // chat ROWID for convenience
});

// chat table columns:
// ROWID, guid, chat_identifier, display_name, style, service_name

export const ConversationSchema = z.object({
  // identifiers
  id: z.string(), // chat ROWID
  guid: z.string().optional(), // global unique identifier
  chatIdentifier: z.string(), // phone number, email, or group ID

  // metadata
  displayName: z.string().nullable().optional(), // custom name for group chats
  style: z.number().optional(), // 43=group chat, 45=one-on-one
  serviceName: z.string().optional(), // "iMessage", "SMS", "RCS"

  // computed fields
  participants: z.array(z.string()).optional(), // array of handle identifiers
  lastActivity: z.number().optional(), // timestamp of last message
  messageCount: z.number().optional(),
  recentMessages: z.array(MessageSchema).optional(),
  unreadCount: z.number().optional(), // number of unread messages in this conversation
  lastReadMessageTimestamp: z.number().nullable().optional(), // last read message timestamp for this chat
});

// handle table columns:
// ROWID, id (phone/email), service

export const HandleSchema = z.object({
  id: z.string(), // ROWID as string
  identifier: z.string(), // phone number or email
  service: z.string(), // "iMessage", "SMS", "RCS"
});

// attachment table columns:
// ROWID, filename, mime_type, transfer_name

export const AttachmentSchema = z.object({
  id: z.string(), // ROWID as string
  filename: z.string().nullable(), // full path to media file
  mimeType: z.string().nullable(), // "image/jpeg", "video/quicktime", etc
  transferName: z.string().nullable(), // original filename
});

// reaction type constants (associated_message_type values)
export const ReactionType = {
  LOVE: 2000, // heart
  LIKE: 2001, // thumbs up
  DISLIKE: 2002, // thumbs down
  LAUGH: 2003, // haha
  EMPHASIZE: 2004, // exclamation marks
  QUESTION: 2005, // question mark
  CUSTOM_EMOJI: 2006, // custom emoji reaction
} as const;

// chat style constants
export const ChatStyle = {
  ONE_ON_ONE: 45,
  GROUP: 43,
} as const;

// tab mode API - get suggestions while typing
export const TabSuggestRequest = z.object({
  conversationId: z.string(),
  recentMessages: z.array(MessageSchema),
  partialDraft: z.string().optional(),
  maxCandidates: z.number().default(3),
});

export const TabSuggestResponse = z.object({
  candidates: z.array(
    z.object({
      text: z.string(),
      confidence: z.number(),
    })
  ),
});

// agent mode API - generate message with tools and reasoning
export const AgentRequest = z.object({
  conversationId: z.string(),
  instruction: z.string(), // user's intent ("apologize", "schedule meeting", etc)
  recentMessages: z.array(MessageSchema).optional(),
  maxSteps: z.number().default(3), // max tool call steps
  enabledTools: z.array(z.string()).optional(), // ["search", "calendar", "web"]
});

export const AgentResponse = z.object({
  suggestedMessage: z.string(),
  reasoning: z.string(),
  confidence: z.number(),
  toolCalls: z
    .array(
      z.object({
        tool: z.string(),
        input: z.string(),
        result: z.string(),
      })
    )
    .optional(),
});

// type exports
export type Message = z.infer<typeof MessageSchema>;
export type Conversation = z.infer<typeof ConversationSchema>;
export type Handle = z.infer<typeof HandleSchema>;
export type Attachment = z.infer<typeof AttachmentSchema>;
export type TabSuggestRequest = z.infer<typeof TabSuggestRequest>;
export type TabSuggestResponse = z.infer<typeof TabSuggestResponse>;
export type AgentRequest = z.infer<typeof AgentRequest>;
export type AgentResponse = z.infer<typeof AgentResponse>;

// helper type for reaction types
export type ReactionTypeValue = (typeof ReactionType)[keyof typeof ReactionType];
export type ChatStyleValue = (typeof ChatStyle)[keyof typeof ChatStyle];

// utility functions for working with iMessage data

/**
 * Convert Apple epoch timestamp to JavaScript Date
 * Apple uses nanoseconds since January 1, 2001, 00:00:00 UTC
 * @param timestamp - Apple epoch timestamp in nanoseconds
 * @returns JavaScript Date object
 */
export function appleTimestampToDate(timestamp: number): Date {
  // Apple epoch starts at Jan 1, 2001
  const appleEpoch = new Date("2001-01-01T00:00:00Z");
  // Convert nanoseconds to milliseconds and add to epoch
  return new Date(appleEpoch.getTime() + timestamp / 1000000);
}

/**
 * Convert JavaScript Date to Apple epoch timestamp
 * @param date - JavaScript Date object
 * @returns Apple epoch timestamp in nanoseconds
 */
export function dateToAppleTimestamp(date: Date): number {
  const appleEpoch = new Date("2001-01-01T00:00:00Z");
  // Convert to nanoseconds
  return (date.getTime() - appleEpoch.getTime()) * 1000000;
}


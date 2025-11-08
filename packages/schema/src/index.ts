import { z } from "zod";

// core entities based on iMessage chat.db structure
// message table: ROWID, guid, text, handle_id, is_from_me, date, service, cache_roomnames
// chat table: ROWID, guid, chat_identifier, display_name
// handle table: ROWID, id (phone/email)

export const MessageSchema = z.object({
  id: z.string(), // maps to ROWID or guid
  conversationId: z.string(), // maps to chat ROWID or guid
  text: z.string(), // message text
  isFromSelf: z.boolean(), // maps to is_from_me
  timestamp: z.number(), // maps to date (cocoa timestamp)
  service: z.string().optional(), // iMessage, SMS, etc
  handleId: z.string().optional(), // sender/recipient handle
});

export const ConversationSchema = z.object({
  id: z.string(), // chat ROWID or guid
  chatIdentifier: z.string(), // phone/email/group id
  displayName: z.string().optional(), // group chat name
  participants: z.array(z.string()), // array of handle ids (phone/email)
  lastActivity: z.number().optional(), // timestamp of last message
  messageCount: z.number().optional(),
  recentMessages: z.array(MessageSchema).optional(),
});

export const HandleSchema = z.object({
  id: z.string(), // ROWID
  identifier: z.string(), // phone number or email
});

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
export type TabSuggestRequest = z.infer<typeof TabSuggestRequest>;
export type TabSuggestResponse = z.infer<typeof TabSuggestResponse>;
export type AgentRequest = z.infer<typeof AgentRequest>;
export type AgentResponse = z.infer<typeof AgentResponse>;


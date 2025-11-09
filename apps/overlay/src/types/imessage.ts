import { z } from "zod";

export const timestampSchema = z.object({
  raw_ns: z.number(),
  unix_epoch_ms: z.number().nullable(),
  iso8601: z.string().nullable(),
});

export const attachmentSchema = z.object({
  id: z.number(),
  guid: z.string(),
  mime_type: z.string().nullable(),
  uti: z.string().nullable(),
  filename: z.string().nullable(),
  total_bytes: z.number().nullable(),
  is_sticker: z.boolean(),
});

export const reactionSchema = z.object({
  guid: z.string(),
  from: z.string().nullable(),
  is_from_me: z.boolean(),
  reaction_type: z.number().nullable(),
  reaction_label: z.string().nullable(),
  date: timestampSchema,
});

export const messageSchema = z.object({
  id: z.number(),
  guid: z.string(),
  chat_id: z.number().nullable(),
  service: z.string().nullable(),
  is_from_me: z.boolean(),
  is_read: z.boolean(),
  has_attachments: z.boolean(),
  handle_id: z.number().nullable(),
  handle_identifier: z.string().nullable(),
  item_type: z.number().nullable(),
  text: z.string().nullable(),
  subject: z.string().nullable(),
  date: timestampSchema,
  date_read: timestampSchema.nullable(),
  date_delivered: timestampSchema.nullable(),
  associated_message_guid: z.string().nullable(),
  associated_message_type: z.number().nullable(),
  associated_message_emoji: z.string().nullable(),
  thread_originator_guid: z.string().nullable(),
  thread_originator_part: z.string().nullable(),
  replies_count: z.number(),
  attachments: z.array(attachmentSchema),
  reactions: z.array(reactionSchema),
});

export const conversationSchema = z.object({
  id: z.number(),
  guid: z.string(),
  chat_identifier: z.string().nullable(),
  display_name: z.string().nullable(),
  service: z.string().nullable(),
  unread_count: z.number(),
  last_activity: timestampSchema.nullable(),
  participants: z.array(z.string()),
  last_message: messageSchema.nullable(),
});

export const statsSchema = z.object({
  total_messages: z.number(),
  sent_messages: z.number(),
  received_messages: z.number(),
  unread_messages: z.number(),
  chats: z.number(),
  attachments: z.number(),
  attachments_bytes: z.number(),
  database_size_bytes: z.number(),
});

const responseEnvelope = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    version: z.string(),
    generated_at: z.string(),
    data: dataSchema,
  });

export const statsResponseSchema = responseEnvelope(statsSchema);
export const unreadMessagesResponseSchema = responseEnvelope(z.array(messageSchema));
export const conversationsResponseSchema = responseEnvelope(z.array(conversationSchema));
export const chatMessagesResponseSchema = responseEnvelope(z.array(messageSchema));

export type TimestampDTO = z.infer<typeof timestampSchema>;
export type AttachmentDTO = z.infer<typeof attachmentSchema>;
export type ReactionDTO = z.infer<typeof reactionSchema>;
export type MessageDTO = z.infer<typeof messageSchema>;
export type ConversationDTO = z.infer<typeof conversationSchema>;
export type StatsDTO = z.infer<typeof statsSchema>;

export type StatsResponse = z.infer<typeof statsResponseSchema>;
export type UnreadMessagesResponse = z.infer<typeof unreadMessagesResponseSchema>;
export type ConversationsResponse = z.infer<typeof conversationsResponseSchema>;
export type ChatMessagesResponse = z.infer<typeof chatMessagesResponseSchema>;

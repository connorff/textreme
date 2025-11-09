// Type definitions for Electron IPC API exposed via preload

export interface DatabaseAccessResult {
  hasAccess: boolean;
  path: string;
  fileSize?: number;
  lastModified?: Date;
  error?: string;
}

export interface DatabaseStats {
  success: boolean;
  fileSize?: number;
  fileSizeMB?: string;
  lastModified?: string;
  path?: string;
  error?: string;
}

export interface DatabaseTable {
  name: string;
  type: string;
}

export interface AgentCandidate {
  message: string;
  reasoning: string;
  confidence: number;
  predictedResponse?: string;
}

export interface AgentOutput {
  candidates: AgentCandidate[];
}

export type AgentStreamEvent =
  | {
      type: "text-delta";
      textDelta: string;
    }
  | {
      type: "tool-call";
      toolName: string;
      args: unknown;
      toolCallId?: string;
    }
  | {
      type: "tool-result";
      toolName: string;
      result: unknown;
      toolCallId?: string;
    }
  | {
      type: "prediction-delta";
      candidateIndex: number;
      textDelta: string;
      isComplete: boolean;
    }
  | {
      type: "finish";
      finishReason?: string;
      usage?: unknown;
    }
  | {
      type: "reasoning";
      reasoning?: string;
      text?: string;
    }
  | {
      type: "complete";
      finalOutput: AgentOutput;
    }
  | {
      type: "error";
      error: string;
    };

export interface DatabaseTablesResult {
  success: boolean;
  tables: DatabaseTable[];
  totalCount: number;
  error?: string;
}

export interface SystemPreferencesResult {
  success: boolean;
  error?: string;
}

export interface UnreadMessage {
  id: string;
  guid: string;
  text: string | null;
  attributedBody: null;
  date: number;
  isFromMe: boolean;
  handleId: string | null;
  service: string | null;
  cacheHasAttachments: boolean;
  itemType: number;
  isRead: boolean;
  dateRead: number | null;
  associatedMessageGuid: string | null;
  associatedMessageType: number | null;
  associatedMessageEmoji: string | null;
  conversationId: string;
  chatIdentifier: string;
  displayName: string | null;
  handleIdentifier: string | null;
  contactName: string | null; // Resolved contact name from Contacts database
}

export interface UnreadMessagesResult {
  success: boolean;
  messages: UnreadMessage[];
  count: number;
  error?: string;
}

export interface UnreadConversation {
  id: string;
  guid: string;
  chatIdentifier: string;
  displayName: string | null;
  style: number | null;
  serviceName: string | null;
  lastReadMessageTimestamp: number | null;
  unreadCount: number;
  lastActivity: number;
  unreadMessages: UnreadMessage[];
  lastMessageText: string | null; // Text from the last message in this conversation
}

export interface UnreadConversationsResult {
  success: boolean;
  conversations: UnreadConversation[];
  totalUnread: number;
  error?: string;
}

export interface ConversationMessage {
  id: string;
  text: string | null;
  date: number;
  isFromMe: boolean;
  handleIdentifier: string | null;
  contactName: string | null;
  service: string | null;
  cacheHasAttachments: boolean;
  isRead: boolean;
  dateRead: number | null;
  associatedMessageGuid: string | null;
  associatedMessageType: number | null;
  associatedMessageEmoji: string | null;
  // Attachments from CLI
  attachments?: Array<{
    id: number;
    guid: string;
    mime_type: string | null;
    uti: string | null;
    filename: string | null;
    total_bytes: number | null;
    is_sticker: boolean;
  }>;
}

export interface ConversationMessagesResult {
  success: boolean;
  messages: ConversationMessage[];
  error?: string;
}

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

export interface AgentRunResult {
  success: boolean;
  streamId?: string;
  error?: string;
}

export interface SendMessageResult {
  success: boolean;
  error?: string;
}

export interface ElectronAPI {
  checkDatabaseAccess: () => Promise<DatabaseAccessResult>;
  getDatabaseStats: () => Promise<DatabaseStats>;
  getDatabaseTables: () => Promise<DatabaseTablesResult>;
  getUnreadMessages: (limit?: number) => Promise<UnreadMessagesResult>;
  getUnreadConversations: () => Promise<UnreadConversationsResult>;
  getConversationMessages: (
    chatId: string,
    limit?: number
  ) => Promise<ConversationMessagesResult>;
  openSystemPreferences: () => Promise<SystemPreferencesResult>;
  generateCompletions: (
    messages: Array<{ text: string | null; isFromMe: boolean }>,
    draft: string
  ) => Promise<SuggestionResponse>;
  runAgent: (
    query: string,
    chatGuid: string,
    messages: ConversationMessage[]
  ) => Promise<AgentRunResult>;
  onAgentStream: (
    streamId: string,
    callback: (event: AgentStreamEvent) => void
  ) => () => void;
  sendIMessage: (
    recipient: string,
    messageText: string
  ) => Promise<SendMessageResult>;
  resolveFileUrl: (filePath: string) => Promise<string | null>;
  readFileAsDataUrl: (
    filePath: string,
    mimeType?: string
  ) => Promise<string | null>;
  closeWindow: () => void;
  resizeWindow: (height: number, width?: number) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

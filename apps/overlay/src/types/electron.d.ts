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
}

export interface UnreadConversationsResult {
  success: boolean;
  conversations: UnreadConversation[];
  totalUnread: number;
  error?: string;
}

export interface ElectronAPI {
  checkDatabaseAccess: () => Promise<DatabaseAccessResult>;
  getDatabaseStats: () => Promise<DatabaseStats>;
  getDatabaseTables: () => Promise<DatabaseTablesResult>;
  getUnreadMessages: (limit?: number) => Promise<UnreadMessagesResult>;
  getUnreadConversations: () => Promise<UnreadConversationsResult>;
  openSystemPreferences: () => Promise<SystemPreferencesResult>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

interface ElectronAPI {
  // Database access
  checkDatabaseAccess: () => Promise<{
    hasAccess: boolean;
    path: string;
    fileSize?: number;
    lastModified?: Date;
    error?: string;
  }>;
  getDatabaseStats: () => Promise<{
    success: boolean;
    fileSize?: number;
    fileSizeMB?: string;
    lastModified?: string;
    path?: string;
    error?: string;
  }>;
  getDatabaseTables: () => Promise<{
    success: boolean;
    tables?: Array<{ name: string; type: string }>;
    totalCount?: number;
    error?: string;
  }>;

  // System
  openSystemPreferences: () => Promise<{
    success: boolean;
    error?: string;
  }>;

  // iMessage
  sendIMessage: (
    recipient: string,
    messageText: string
  ) => Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};

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

export interface ElectronAPI {
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

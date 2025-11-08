// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from "electron";

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electronAPI", {
  // Database access
  checkDatabaseAccess: () => ipcRenderer.invoke("check-database-access"),
  getDatabaseStats: () => ipcRenderer.invoke("get-database-stats"),
  getDatabaseTables: () => ipcRenderer.invoke("get-database-tables"),
  
  // Unread messages
  getUnreadMessages: (limit?: number) =>
    ipcRenderer.invoke("get-unread-messages", limit),
  getUnreadConversations: () => ipcRenderer.invoke("get-unread-conversations"),
  getConversationMessages: (chatId: string, limit?: number) =>
    ipcRenderer.invoke("get-conversation-messages", chatId, limit),
  
  // System
  openSystemPreferences: () => ipcRenderer.invoke("open-system-preferences"),

  // Suggestions
  generateSuggestions: (
    chatGuid: string,
    mode: "tab" | "agent",
    draft?: string
  ) => ipcRenderer.invoke("generate-suggestions", chatGuid, mode, draft),

  // iMessage
  sendIMessage: (recipient: string, messageText: string) =>
    ipcRenderer.invoke("send-imessage", recipient, messageText),

  // Window control
  closeWindow: () => ipcRenderer.send("close-window"),
});

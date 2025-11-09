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
  resolveFileUrl: (filePath: string) =>
    ipcRenderer.invoke("resolve-file-url", filePath),
  readFileAsDataUrl: (filePath: string, mimeType?: string) =>
    ipcRenderer.invoke("read-file-as-data-url", filePath, mimeType),

  // System
  openSystemPreferences: () => ipcRenderer.invoke("open-system-preferences"),

  // Suggestions
  generateCompletions: (
    messages: Array<{ text: string | null; isFromMe: boolean; contactName: string | null; date: number }>,
    draft: string,
    displayName: string | null,
    chatIdentifier: string
  ) => ipcRenderer.invoke("generate-completions", messages, draft, displayName, chatIdentifier),
  runAgent: (
    query: string,
    chatGuid: string,
    messages: Array<{
      text: string;
      isFromMe: boolean;
      handleId?: string;
      date: number;
    }>
  ) => ipcRenderer.invoke("run-agent", query, chatGuid, messages),
  onAgentStream: (streamId: string, callback: (event: unknown) => void) => {
    const channel = `agent-stream:${streamId}`;
    const listener = (_event: Electron.IpcRendererEvent, data: unknown) => {
      callback(data);
    };
    ipcRenderer.on(channel, listener);
    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  },

  // iMessage
  sendIMessage: (recipient: string, messageText: string) =>
    ipcRenderer.invoke("send-imessage", recipient, messageText),

  // Window control
  closeWindow: () => ipcRenderer.send("close-window"),
  resizeWindow: (height: number, width?: number) => ipcRenderer.send("resize-window", height, width),
});

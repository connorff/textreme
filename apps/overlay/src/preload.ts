// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Database access
  checkDatabaseAccess: () => ipcRenderer.invoke('check-database-access'),
  getDatabaseStats: () => ipcRenderer.invoke('get-database-stats'),
  getDatabaseTables: () => ipcRenderer.invoke('get-database-tables'),
  
  // System
  openSystemPreferences: () => ipcRenderer.invoke('open-system-preferences'),
});

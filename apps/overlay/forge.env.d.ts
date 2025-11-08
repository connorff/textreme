/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />

interface ElectronAPI {
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

import type { ElectronAPI as ElectronAPIBase } from "./types/electron";

declare global {
  interface ElectronAPI extends ElectronAPIBase {}
  interface Window {
    electronAPI: ElectronAPI;
  }
}

declare module "*.svg" {
  const content: string;
  export default content;
}

declare module "*.svg?url" {
  const content: string;
  export default content;
}

export {};

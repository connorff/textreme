import { defineConfig } from "vite";

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        "node:sqlite",
        "sqlite3",
        "ai",
        "@ai-sdk/openai",
        "@textreme/schema",
        "@textreme/client",
        "dotenv",
        "dotenv/config",
        "zod",
      ],
    },
  },
});

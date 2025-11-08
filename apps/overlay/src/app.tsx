import { createRoot } from "react-dom/client";
import { appleTimestampToDate, MessageSchema } from "@textreme/schema";

const App = () => {
  const message = MessageSchema.parse({
    id: "1",
    guid: "D8E8C79A-1234-5678-9ABC-DEF012345678",
    text: "Hello World!",
    attributedBody: null,
    date: 725713456509362176, // Apple epoch timestamp (nanoseconds since 2001-01-01)
    isFromMe: true,
    handleId: null,
    service: "iMessage",
    cacheHasAttachments: false,
    itemType: 0,
    conversationId: "chat-123",
  });

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1>Textreme Overlay</h1>
      <p>Electron + Vite + TypeScript + React</p>

      <pre style={{ background: "#f4f4f4", padding: "10px", borderRadius: "4px" }}>
        {JSON.stringify(message, null, 2)}
      </pre>
      
      <p style={{ color: "green" }}>✓ Schema validation passed!</p>
      <p>Date: {message.date}</p>
      <p>Readable Date: {appleTimestampToDate(message.date).toLocaleString()}</p>
    </div>
  );
};

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

const root = createRoot(rootElement);
root.render(<App />);

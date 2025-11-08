import { createRoot } from "react-dom/client";
import { MessageSchema } from "@textreme/schema";

const App = () => {
  const message = MessageSchema.parse({
    id: "1",
    conversationId: "chat-123",
    text: "Hello World!",
    isFromSelf: true,
    timestamp: Date.now(),
    service: "iMessage",
  });

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1>Textreme Overlay</h1>
      <p>Electron + Vite + TypeScript + React</p>

      <pre style={{ background: "#f4f4f4", padding: "10px", borderRadius: "4px" }}>
        {JSON.stringify(message, null, 2)}
      </pre>
      
      <p style={{ color: "green" }}>✓ Schema validation passed!</p>
    </div>
  );
};

const root = createRoot(document.body);
root.render(<App />);

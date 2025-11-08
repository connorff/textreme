import "./types.d.ts";
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { appleTimestampToDate, MessageSchema } from "@textreme/schema";
import { PermissionLoader } from "./components/PermissionLoader";

const MainApp = () => {
  const [recipient, setRecipient] = useState("");
  const [messageText, setMessageText] = useState("");
  const [status, setStatus] = useState<{
    type: "success" | "error" | null;
    message: string;
  }>({
    type: null,
    message: "",
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleSendMessage = async () => {
    if (!recipient.trim() || !messageText.trim()) {
      setStatus({
        type: "error",
        message: "Please enter both recipient and message",
      });
      return;
    }

    if (!window.electronAPI) {
      setStatus({ type: "error", message: "Electron API not available" });
      return;
    }

    setIsLoading(true);
    setStatus({ type: null, message: "" });

    try {
      const result = await window.electronAPI.sendIMessage(
        recipient.trim(),
        messageText.trim()
      );

      if (result.success) {
        setStatus({
          type: "success",
          message: result.message || "Message sent successfully!",
        });
        // Clear inputs after successful send
        setRecipient("");
        setMessageText("");
      } else {
        setStatus({
          type: "error",
          message: result.error || "Failed to send message",
        });
      }
    } catch (error) {
      setStatus({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred",
      });
    } finally {
      setIsLoading(false);
    }
  };
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
    <div
      style={{ padding: "20px", fontFamily: "sans-serif", maxWidth: "600px" }}
    >
      <h1>Textreme Overlay</h1>
      <p>✅ Database access granted!</p>
      <p>Electron + Vite + TypeScript + React</p>

      <div style={{ marginTop: "30px", marginBottom: "30px" }}>
        <h2>Send iMessage</h2>
        <div style={{ marginBottom: "15px" }}>
          <label
            style={{
              display: "block",
              marginBottom: "5px",
              fontWeight: "bold",
            }}
          >
            Recipient (contact name, phone, or email):
          </label>
          <input
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="e.g., Connor Fogarty or +1234567890"
            style={{
              width: "100%",
              padding: "8px",
              fontSize: "14px",
              border: "1px solid #ccc",
              borderRadius: "4px",
              boxSizing: "border-box",
            }}
            disabled={isLoading}
          />
        </div>
        <div style={{ marginBottom: "15px" }}>
          <label
            style={{
              display: "block",
              marginBottom: "5px",
              fontWeight: "bold",
            }}
          >
            Message:
          </label>
          <textarea
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder="Type your message here..."
            rows={4}
            style={{
              width: "100%",
              padding: "8px",
              fontSize: "14px",
              border: "1px solid #ccc",
              borderRadius: "4px",
              boxSizing: "border-box",
              fontFamily: "inherit",
              resize: "vertical",
            }}
            disabled={isLoading}
          />
        </div>
        <button
          onClick={handleSendMessage}
          disabled={isLoading || !recipient.trim() || !messageText.trim()}
          style={{
            padding: "10px 20px",
            fontSize: "16px",
            backgroundColor: isLoading ? "#ccc" : "#007AFF",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: isLoading ? "not-allowed" : "pointer",
            fontWeight: "bold",
          }}
        >
          {isLoading ? "Sending..." : "Send Message"}
        </button>
        {status.type && (
          <div
            style={{
              marginTop: "15px",
              padding: "10px",
              borderRadius: "4px",
              backgroundColor:
                status.type === "success" ? "#d4edda" : "#f8d7da",
              color: status.type === "success" ? "#155724" : "#721c24",
              border: `1px solid ${status.type === "success" ? "#c3e6cb" : "#f5c6cb"}`,
            }}
          >
            {status.message}
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: "30px",
          paddingTop: "30px",
          borderTop: "1px solid #eee",
        }}
      >
        <h2>Schema Demo</h2>
        <pre
          style={{
            background: "#f4f4f4",
            padding: "10px",
            borderRadius: "4px",
          }}
        >
          {JSON.stringify(message, null, 2)}
        </pre>

        <p style={{ color: "green" }}>✓ Schema validation passed!</p>
        <p>Date: {message.date}</p>
        <p>
          Readable Date: {appleTimestampToDate(message.date).toLocaleString()}
        </p>
      </div>
    </div>
  );
};

const App = () => {
  const [hasAccess, setHasAccess] = useState(false);

  if (!hasAccess) {
    return <PermissionLoader onAccessGranted={() => setHasAccess(true)} />;
  }

  return <MainApp />;
};

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

const root = createRoot(rootElement);
root.render(<App />);

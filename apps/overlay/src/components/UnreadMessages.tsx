import { useState, useEffect, useCallback } from "react";
import { appleTimestampToDate } from "@textreme/schema";
import type { UnreadConversation, UnreadMessage } from "../types/electron";

interface UnreadMessagesProps {
  pollInterval?: number; // milliseconds between polls, default 2000ms
}

export const UnreadMessages = ({ pollInterval = 2000 }: UnreadMessagesProps) => {
  const [conversations, setConversations] = useState<UnreadConversation[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastPollTime, setLastPollTime] = useState<Date | null>(null);

  const fetchUnreadMessages = useCallback(async () => {
    try {
      setError(null);
      const result = await window.electronAPI.getUnreadConversations();
      
      if (result.success) {
        setConversations(result.conversations);
        setTotalUnread(result.totalUnread);
        setLastPollTime(new Date());
      } else {
        setError(result.error || "Failed to fetch unread messages");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchUnreadMessages();
  }, [fetchUnreadMessages]);

  // Set up polling
  useEffect(() => {
    const interval = setInterval(() => {
      fetchUnreadMessages();
    }, pollInterval);

    return () => clearInterval(interval);
  }, [fetchUnreadMessages, pollInterval]);

  const formatTime = (timestamp: number): string => {
    const date = appleTimestampToDate(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getDisplayName = (conversation: UnreadConversation): string => {
    // Prefer display name, then contact name from first message, then chat identifier
    if (conversation.displayName) {
      return conversation.displayName;
    }
    // Try to get contact name from first unread message
    const firstMessage = conversation.unreadMessages[0];
    if (firstMessage?.contactName) {
      return firstMessage.contactName;
    }
    return conversation.chatIdentifier || "Unknown";
  };

  const truncateText = (text: string | null, maxLength: number = 100): string => {
    if (!text) return "[No text content]";
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  };

  if (loading && conversations.length === 0) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <div style={{ fontSize: "14px", color: "#666" }}>Loading unread messages...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <div style={{ fontSize: "14px", color: "#d32f2f" }}>Error: {error}</div>
        <button
          onClick={fetchUnreadMessages}
          style={{
            marginTop: "10px",
            padding: "8px 16px",
            backgroundColor: "#1976d2",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{ marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 600 }}>Unread Messages</h1>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              backgroundColor: totalUnread > 0 ? "#1976d2" : "#4caf50",
              color: "white",
              padding: "4px 12px",
              borderRadius: "12px",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            {totalUnread} unread
          </div>
          {lastPollTime && (
            <div style={{ fontSize: "12px", color: "#666" }}>
              Last updated: {lastPollTime.toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>

      {conversations.length === 0 ? (
        <div style={{ padding: "40px", textAlign: "center", color: "#666" }}>
          <div style={{ fontSize: "18px", marginBottom: "8px" }}>🎉</div>
          <div style={{ fontSize: "16px" }}>No unread messages!</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {conversations.map((conversation) => (
            <div
              key={conversation.id}
              style={{
                border: "1px solid #e0e0e0",
                borderRadius: "8px",
                padding: "16px",
                backgroundColor: "#fff",
                boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "12px" }}>
                <div>
                  <div style={{ fontSize: "16px", fontWeight: 600, marginBottom: "4px" }}>
                    {getDisplayName(conversation)}
                  </div>
                  <div style={{ fontSize: "12px", color: "#666" }}>
                    {(() => {
                      const firstMessage = conversation.unreadMessages[0];
                      const contactName = firstMessage?.contactName;
                      const identifier = conversation.chatIdentifier;
                      
                      // Show contact name if different from display name, or show identifier
                      if (contactName && contactName !== getDisplayName(conversation)) {
                        return `${contactName} • ${identifier}`;
                      }
                      return identifier + (conversation.serviceName ? ` • ${conversation.serviceName}` : "");
                    })()}
                  </div>
                </div>
                <div
                  style={{
                    backgroundColor: "#1976d2",
                    color: "white",
                    padding: "2px 8px",
                    borderRadius: "12px",
                    fontSize: "12px",
                    fontWeight: 600,
                  }}
                >
                  {conversation.unreadCount}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {conversation.unreadMessages.slice(0, 3).map((message) => (
                  <MessageItem key={message.id} message={message} formatTime={formatTime} truncateText={truncateText} />
                ))}
                {conversation.unreadMessages.length > 3 && (
                  <div style={{ fontSize: "12px", color: "#666", fontStyle: "italic", marginTop: "4px" }}>
                    +{conversation.unreadMessages.length - 3} more unread message{conversation.unreadMessages.length - 3 !== 1 ? "s" : ""}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

interface MessageItemProps {
  message: UnreadMessage;
  formatTime: (timestamp: number) => string;
  truncateText: (text: string | null, maxLength?: number) => string;
}

const MessageItem = ({ message, formatTime, truncateText }: MessageItemProps) => {
  // Handle reactions/tapbacks
  if (message.associatedMessageGuid) {
    const reactionEmoji = message.associatedMessageEmoji || "👍";
    return (
      <div style={{ fontSize: "14px", color: "#666", fontStyle: "italic" }}>
        {reactionEmoji} Reacted to a message
        <span style={{ marginLeft: "8px", fontSize: "12px" }}>{formatTime(message.date)}</span>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "8px 12px",
        backgroundColor: "#f5f5f5",
        borderRadius: "6px",
        fontSize: "14px",
      }}
    >
      <div style={{ marginBottom: "4px" }}>{truncateText(message.text)}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: "12px", color: "#666" }}>
          {message.contactName 
            ? `From: ${message.contactName}${message.handleIdentifier && message.handleIdentifier !== message.contactName ? ` (${message.handleIdentifier})` : ""}`
            : message.handleIdentifier && `From: ${message.handleIdentifier}`}
          {message.cacheHasAttachments && " 📎"}
        </div>
        <div style={{ fontSize: "12px", color: "#999" }}>{formatTime(message.date)}</div>
      </div>
    </div>
  );
};


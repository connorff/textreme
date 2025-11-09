import { useState, useEffect, useCallback } from "react";
import type { UnreadConversation } from "../types/electron";

export const useConversations = () => {
  const [conversations, setConversations] = useState<UnreadConversation[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const fetchConversations = useCallback(async () => {
    try {
      const result = await window.electronAPI.getUnreadConversations();
      if (result.success) {
        // Filter out group chats (identifiers starting with "chat")
        const filteredConversations = result.conversations.filter(
          (conv) => !conv.chatIdentifier?.startsWith("chat")
        );
        setConversations(filteredConversations.slice(0, 10));
      }
    } catch (err) {
      console.error("Error fetching conversations:", err);
    }
  }, []);

  // Start polling on mount
  useEffect(() => {
    fetchConversations();
    const interval = setInterval(fetchConversations, 3000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  return {
    conversations,
    selectedIndex,
    setSelectedIndex,
    fetchConversations,
  };
};


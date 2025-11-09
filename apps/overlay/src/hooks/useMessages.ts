import { useState, useEffect, useCallback, useRef } from "react";
import type { ConversationMessage, UnreadConversation } from "../types/electron";
import type { ViewMode } from "../types/viewMode";

export const useMessages = (
  focusedConversation: UnreadConversation | null,
  mode: ViewMode
) => {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(async (chatGuid: string) => {
    try {
      const result = await window.electronAPI.getConversationMessages(
        chatGuid,
        5
      );
      if (result.success) {
        setMessages(result.messages);
      }
    } catch (err) {
      console.error("Error fetching messages:", err);
    }
  }, []);

  // Fetch messages when conversation is focused
  useEffect(() => {
    if (focusedConversation && (mode === "tab" || mode === "conversation" || mode === "agent")) {
      fetchMessages(focusedConversation.guid);
    }
  }, [focusedConversation, mode, fetchMessages]);

  // Poll for new messages every second when conversation is focused
  useEffect(() => {
    if (!focusedConversation || (mode !== "tab" && mode !== "conversation" && mode !== "agent")) {
      return;
    }

    // Set up polling interval (1 second)
    const intervalId = setInterval(() => {
      fetchMessages(focusedConversation.guid);
    }, 1000);

    // Cleanup interval on unmount or when conversation/mode changes
    return () => {
      clearInterval(intervalId);
    };
  }, [focusedConversation, mode, fetchMessages]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesContainerRef.current && messages.length > 0) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight;
    }
  }, [messages]);

  return {
    messages,
    setMessages,
    messagesContainerRef,
    fetchMessages,
  };
};


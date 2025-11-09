import { useState, useEffect, useCallback, useRef } from "react";
import type { ConversationMessage, UnreadConversation } from "../types/electron";
import type { ViewMode } from "../types/viewMode";

export const useMessages = (
  focusedConversation: UnreadConversation | null,
  mode: ViewMode,
  pollInterval: number = 2000
) => {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const scrollToBottom = useCallback((instant: boolean = false) => {
    const container = messagesContainerRef.current as any;
    if (!container) return;

    // Call the scrollToBottom function exposed by MessageList
    if (container.scrollToBottom) {
      container.scrollToBottom(instant);
    } else if (container.scrollTop !== undefined) {
      // Fallback for showInChatbox mode
      if (instant) {
        container.scrollTop = container.scrollHeight;
      } else {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: "smooth",
        });
      }
    }
  }, []);

  const fetchMessages = useCallback(async (chatGuid: string) => {
    try {
      const result = await window.electronAPI.getConversationMessages(
        chatGuid,
        50 // Increased from 5 to show more message history
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
      setIsInitialLoad(true);
      fetchMessages(focusedConversation.guid);
    }
  }, [focusedConversation, mode, fetchMessages]);

  // Poll for new messages when conversation is focused (no scroll on poll)
  useEffect(() => {
    if (!focusedConversation || (mode !== "tab" && mode !== "conversation" && mode !== "agent")) {
      return;
    }

    const intervalId = setInterval(() => {
      setIsInitialLoad(false); // prevent scroll during polls
      fetchMessages(focusedConversation.guid);
    }, pollInterval);

    return () => {
      clearInterval(intervalId);
    };
  }, [focusedConversation, mode, fetchMessages]);

  // Auto-scroll to bottom when messages change (always)
  useEffect(() => {
    if (messages.length === 0) return;
    requestAnimationFrame(() => {
      scrollToBottom(isInitialLoad); // instant on initial open, smooth on updates
      setIsInitialLoad(false);
    });
  }, [messages, isInitialLoad, scrollToBottom]);

  return {
    messages,
    setMessages,
    messagesContainerRef,
    fetchMessages,
    scrollToBottom, // expose for manual scroll after sending
  };
};


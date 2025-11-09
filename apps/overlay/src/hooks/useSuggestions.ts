import { useState, useEffect, useRef } from "react";
import type { UnreadConversation, ConversationMessage } from "../types/electron";

export const useSuggestions = (
  draft: string,
  focusedConversation: UnreadConversation | null,
  messages: ConversationMessage[]
) => {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const suggestionRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Generate AI-powered suggestions when draft changes
  useEffect(() => {
    if (!focusedConversation || !draft.trim()) {
      setSuggestions([]);
      setSelectedSuggestionIndex(0);
      suggestionRefs.current = [];
      setIsTyping(false);
      return;
    }

    // Hide dropdown while typing
    setIsTyping(true);
    setSuggestions([]);

    const timeoutId = setTimeout(async () => {
      try {
        // Convert messages to the format expected by the API
        const messageContext = messages.map((msg) => ({
          text: msg.text,
          isFromMe: msg.isFromMe,
        }));

        // Call the AI completion API
        const result = await window.electronAPI.generateCompletions(
          messageContext,
          draft
        );

        if (result.success && result.suggestions.length > 0) {
          setSuggestions(result.suggestions);
          setSelectedSuggestionIndex(0);
          suggestionRefs.current = new Array(result.suggestions.length).fill(null);
        } else {
          setSuggestions([]);
        }
      } catch (error) {
        console.error("Error generating completions:", error);
        setSuggestions([]);
      } finally {
        setIsTyping(false);
      }
    }, 300); // Debounce by 300ms

    return () => clearTimeout(timeoutId);
  }, [draft, focusedConversation, messages]);

  return {
    suggestions,
    selectedSuggestionIndex,
    setSelectedSuggestionIndex,
    isTyping,
    suggestionRefs,
  };
};


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
  const cacheRef = useRef<Map<string, string[]>>(new Map());
  const lastKeyRef = useRef<string | null>(null);

  // Generate AI-powered suggestions when draft changes
  useEffect(() => {
    if (!focusedConversation || !draft.trim()) {
      setSuggestions([]);
      setSelectedSuggestionIndex(0);
      suggestionRefs.current = [];
      setIsTyping(false);
      return;
    }

    const key = `${focusedConversation.guid}|${draft}`;

    // If we already have suggestions for this exact draft in this conversation, reuse and bail
    if (lastKeyRef.current === key && suggestions.length > 0) {
      return;
    }
    const cached = cacheRef.current.get(key);
    if (cached && cached.length > 0) {
      setSuggestions(cached);
      setSelectedSuggestionIndex(0);
      suggestionRefs.current = new Array(cached.length).fill(null);
      setIsTyping(false);
      lastKeyRef.current = key;
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
          contactName: msg.contactName,
          date: msg.date,
        }));

        // Get contact name and identifier from focused conversation
        const displayName = focusedConversation.displayName || 
          messages.find(m => !m.isFromMe)?.contactName || 
          null;
        const chatIdentifier = focusedConversation.chatIdentifier;

        // Call the AI completion API (backend will resolve contact name from chatIdentifier)
        const result = await window.electronAPI.generateCompletions(
          messageContext,
          draft,
          displayName,
          chatIdentifier
        );

        if (result.success && result.suggestions.length > 0) {
          setSuggestions(result.suggestions);
          setSelectedSuggestionIndex(0);
          suggestionRefs.current = new Array(result.suggestions.length).fill(null);
          cacheRef.current.set(key, result.suggestions);
          lastKeyRef.current = key;
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
  }, [draft, focusedConversation?.guid]); // do not requery on message polls when draft is unchanged

  return {
    suggestions,
    selectedSuggestionIndex,
    setSelectedSuggestionIndex,
    isTyping,
    suggestionRefs,
  };
};


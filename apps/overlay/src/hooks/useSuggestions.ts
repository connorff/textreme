import { useState, useEffect, useRef } from "react";
import type { UnreadConversation } from "../types/electron";

export const useSuggestions = (
  draft: string,
  focusedConversation: UnreadConversation | null
) => {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const suggestionRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Generate suggestions when draft changes (using mock suggestions for now)
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

    const timeoutId = setTimeout(() => {
      // Mock suggestions for now
      const newSuggestions = [
        "mock suggestion #1",
        "mock suggestion #2",
        "mock suggestion #3",
      ];
      setSuggestions(newSuggestions);
      setSelectedSuggestionIndex(0);
      suggestionRefs.current = new Array(newSuggestions.length).fill(null);
      setIsTyping(false);
    }, 300); // Debounce by 300ms

    return () => clearTimeout(timeoutId);
  }, [draft, focusedConversation]);

  return {
    suggestions,
    selectedSuggestionIndex,
    setSelectedSuggestionIndex,
    isTyping,
    suggestionRefs,
  };
};


import { useEffect } from "react";
import type { ViewMode } from "../types/viewMode";
import type { UnreadConversation } from "../types/electron";

interface UseKeyboardNavigationProps {
  mode: ViewMode;
  conversations: UnreadConversation[];
  selectedIndex: number;
  setSelectedIndex: (index: number | ((prev: number) => number)) => void;
  focusedConversation: UnreadConversation | null;
  suggestions: string[];
  selectedSuggestionIndex: number;
  setSelectedSuggestionIndex: (index: number | ((prev: number) => number)) => void;
  isTyping: boolean;
  draft: string;
  handleInboxClick: () => void;
  handleSelectConversation: (conversation: UnreadConversation) => void;
  handleClearFocus: () => void;
  handleSuggestionClick: (suggestion: string) => void;
  handleSendMessage: () => void;
  handleAgentClick: () => void;
  handleTabClick: () => void;
}

export const useKeyboardNavigation = ({
  mode,
  conversations,
  selectedIndex,
  setSelectedIndex,
  focusedConversation,
  suggestions,
  selectedSuggestionIndex,
  setSelectedSuggestionIndex,
  isTyping,
  draft,
  handleInboxClick,
  handleSelectConversation,
  handleClearFocus,
  handleSuggestionClick,
  handleSendMessage,
  handleAgentClick,
  handleTabClick,
}: UseKeyboardNavigationProps) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+I or Ctrl+I to toggle inbox
      if ((e.metaKey || e.ctrlKey) && e.key === "i") {
        e.preventDefault();
        handleInboxClick();
        return;
      }

      // Cmd+P or Ctrl+P to toggle between tab and agent mode
      if ((e.metaKey || e.ctrlKey) && e.key === "p") {
        e.preventDefault();
        if (focusedConversation) {
          if (mode === "tab") {
            handleAgentClick();
          } else if (mode === "agent") {
            handleTabClick();
          }
        }
        return;
      }

      if (mode === "inbox") {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex((prev) =>
            Math.min(prev + 1, conversations.length - 1)
          );
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (conversations.length > 0) {
            handleSelectConversation(conversations[selectedIndex]);
          }
        } else if (e.key === "Escape") {
          e.preventDefault();
          if (focusedConversation) {
            // Go back to tab mode
            window.electronAPI.resizeWindow(500);
          } else {
            // Go to blank
            window.electronAPI.resizeWindow(200);
          }
          handleInboxClick(); // This will handle the mode transition
        }
      } else if (mode === "tab" || mode === "conversation") {
        if (e.key === "Escape") {
          e.preventDefault();
          handleClearFocus();
        } else if (e.key === "Tab" && draft.trim()) {
          // Tab key sends the message
          e.preventDefault();
          handleSendMessage();
        } else if (suggestions.length > 0 && !isTyping) {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelectedSuggestionIndex((prev) =>
              Math.min(prev + 1, suggestions.length - 1)
            );
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedSuggestionIndex((prev) => Math.max(prev - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const selectedSuggestion = suggestions[selectedSuggestionIndex];
            if (selectedSuggestion) {
              handleSuggestionClick(selectedSuggestion);
            }
          }
        } else if (e.key === "Enter" && draft.trim()) {
          // Send message when Enter is pressed without suggestions
          e.preventDefault();
          handleSendMessage();
        }
      } else if (mode === "agent") {
        // Agent mode keyboard shortcuts
        if (e.key === "Escape") {
          e.preventDefault();
          handleClearFocus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    mode,
    selectedIndex,
    conversations,
    focusedConversation,
    suggestions,
    selectedSuggestionIndex,
    isTyping,
    draft,
    handleInboxClick,
    handleSelectConversation,
    handleClearFocus,
    handleSuggestionClick,
    handleSendMessage,
    handleAgentClick,
    handleTabClick,
    setSelectedIndex,
    setSelectedSuggestionIndex,
  ]);
};


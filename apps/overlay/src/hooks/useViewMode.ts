import { useState, useCallback } from "react";
import type { ViewMode } from "../types/viewMode";
import type { UnreadConversation } from "../types/electron";

interface UseViewModeProps {
  onModeChange?: (mode: ViewMode) => void;
}

export const useViewMode = ({ onModeChange }: UseViewModeProps = {}) => {
  const [mode, setMode] = useState<ViewMode>("blank");
  const [focusedConversation, setFocusedConversation] =
    useState<UnreadConversation | null>(null);
  const [composeMode, setComposeMode] = useState<"tab" | "agent">("tab");

  const setModeWithCallback = useCallback(
    (newMode: ViewMode) => {
      setMode(newMode);
      onModeChange?.(newMode);
    },
    [onModeChange]
  );

  const handleInboxClick = useCallback(() => {
    if (mode === "blank") {
      setModeWithCallback("inbox");
      requestAnimationFrame(() => {
        window.electronAPI.resizeWindow(500);
      });
    } else if (mode === "tab" || mode === "conversation" || mode === "agent") {
      setModeWithCallback("inbox");
      requestAnimationFrame(() => {
        window.electronAPI.resizeWindow(500);
      });
    } else if (mode === "inbox") {
      if (focusedConversation) {
        setModeWithCallback(composeMode);
        requestAnimationFrame(() => {
          window.electronAPI.resizeWindow(500);
        });
      } else {
        setModeWithCallback("blank");
        requestAnimationFrame(() => {
          window.electronAPI.resizeWindow(200);
        });
      }
    }
  }, [mode, focusedConversation, composeMode, setModeWithCallback]);

  const handleTabClick = useCallback(() => {
    if (!focusedConversation) {
      return;
    }
    setComposeMode("tab");
    setModeWithCallback("tab");
    requestAnimationFrame(() => {
      window.electronAPI.resizeWindow(500);
    });
  }, [focusedConversation, setModeWithCallback]);

  const handleAgentClick = useCallback(() => {
    if (!focusedConversation) {
      return;
    }
    setComposeMode("agent");
    setModeWithCallback("agent");
    requestAnimationFrame(() => {
      window.electronAPI.resizeWindow(500);
    });
  }, [focusedConversation, setModeWithCallback]);

  const handleSelectConversation = useCallback(
    (conversation: UnreadConversation) => {
      setFocusedConversation(conversation);
      setModeWithCallback(composeMode);
      requestAnimationFrame(() => {
        window.electronAPI.resizeWindow(500);
      });
    },
    [composeMode, setModeWithCallback]
  );

  const handleClearFocus = useCallback(() => {
    setFocusedConversation(null);
    if (mode === "tab" || mode === "conversation" || mode === "agent") {
      setModeWithCallback("blank");
      requestAnimationFrame(() => {
        window.electronAPI.resizeWindow(200);
      });
    }
  }, [mode, setModeWithCallback]);

  return {
    mode,
    setMode: setModeWithCallback,
    focusedConversation,
    setFocusedConversation,
    composeMode,
    handleInboxClick,
    handleTabClick,
    handleAgentClick,
    handleSelectConversation,
    handleClearFocus,
  };
};

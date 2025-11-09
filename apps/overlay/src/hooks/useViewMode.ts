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
    } else if (mode === "tab" || mode === "conversation") {
      setModeWithCallback("inbox");
      requestAnimationFrame(() => {
        window.electronAPI.resizeWindow(500);
      });
    } else if (mode === "inbox") {
      if (focusedConversation) {
        setModeWithCallback("tab");
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
  }, [mode, focusedConversation, setModeWithCallback]);

  const handleTabClick = useCallback(() => {
    if (mode === "tab") {
      setModeWithCallback("blank");
      requestAnimationFrame(() => {
        window.electronAPI.resizeWindow(200);
      });
    } else {
      if (focusedConversation) {
        setModeWithCallback("tab");
        requestAnimationFrame(() => {
          window.electronAPI.resizeWindow(500);
        });
      }
    }
  }, [mode, focusedConversation, setModeWithCallback]);

  const handleSelectConversation = useCallback(
    (conversation: UnreadConversation) => {
      setFocusedConversation(conversation);
      setModeWithCallback("tab");
      requestAnimationFrame(() => {
        window.electronAPI.resizeWindow(500);
      });
    },
    [setModeWithCallback]
  );

  const handleClearFocus = useCallback(() => {
    setFocusedConversation(null);
    if (mode === "tab" || mode === "conversation") {
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
    handleInboxClick,
    handleTabClick,
    handleSelectConversation,
    handleClearFocus,
  };
};


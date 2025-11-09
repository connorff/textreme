import { useState, useRef, useEffect } from "react";
import { useConversations } from "../hooks/useConversations";
import { useMessages } from "../hooks/useMessages";
import { useSuggestions } from "../hooks/useSuggestions";
import { useViewMode } from "../hooks/useViewMode";
import { useKeyboardNavigation } from "../hooks/useKeyboardNavigation";
import { ConversationList } from "./conversation/ConversationList";
import { MessageList } from "./conversation/MessageList";
import { ChatInput } from "./conversation/ChatInput";
import { TopBar } from "./conversation/TopBar";
import { getDisplayName } from "../lib/conversationUtils";
import HelloSvg from "../assets/AppleHello.svg";

export const ConversationView = () => {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  // Custom hooks
  const { conversations, selectedIndex, setSelectedIndex } = useConversations();
  
  const {
    mode,
    focusedConversation,
    handleInboxClick,
    handleTabClick,
    handleSelectConversation,
    handleClearFocus,
  } = useViewMode();

  const { messages, setMessages, messagesContainerRef } = useMessages(
    focusedConversation,
    mode
  );

  const {
    suggestions,
    selectedSuggestionIndex,
    setSelectedSuggestionIndex,
    isTyping,
    suggestionRefs,
  } = useSuggestions(draft, focusedConversation);

  // Focus input when conversation view opens
  useEffect(() => {
    if (focusedConversation && (mode === "tab" || mode === "conversation")) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [focusedConversation, mode]);

  // Auto-scroll selected item into view
  useEffect(() => {
    if (mode === "inbox" && selectedRef.current) {
      selectedRef.current.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }
  }, [selectedIndex, mode]);

  // Auto-scroll selected suggestion into view
  useEffect(() => {
    if (
      (mode === "tab" || mode === "conversation") &&
      suggestions.length > 0 &&
      suggestionRefs.current[selectedSuggestionIndex]
    ) {
      suggestionRefs.current[selectedSuggestionIndex]?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }
  }, [selectedSuggestionIndex, mode, suggestions.length]);

  const handleClose = () => {
    window.electronAPI.closeWindow();
  };

  const handleSuggestionClick = (suggestion: string) => {
    setDraft(suggestion);
    inputRef.current?.focus();
  };

  const handleConversationSelect = (conversation: any, index: number) => {
    setSelectedIndex(index);
    handleSelectConversation(conversation);
  };

  const handleClearFocusWithCleanup = () => {
    setMessages([]);
    setDraft("");
    handleClearFocus();
  };

  // Keyboard navigation
  useKeyboardNavigation({
    mode,
    conversations,
    selectedIndex,
    setSelectedIndex,
    focusedConversation,
    suggestions,
    selectedSuggestionIndex,
    setSelectedSuggestionIndex,
    isTyping,
    handleInboxClick,
    handleSelectConversation: (conversation) => {
      const index = conversations.findIndex((c) => c.id === conversation.id);
      if (index !== -1) {
        handleConversationSelect(conversation, index);
      }
    },
    handleClearFocus: handleClearFocusWithCleanup,
    handleSuggestionClick,
  });

  return (
    <div className="flex flex-col h-screen w-screen bg-background rounded-xl overflow-hidden">
      {/* Inbox area */}
      {mode === "inbox" && (
        <ConversationList
          conversations={conversations}
          selectedIndex={selectedIndex}
          onSelect={handleConversationSelect}
          selectedRef={selectedRef}
        />
      )}

      {/* Tab mode - conversation messages displayed above chatbox */}
      {mode === "tab" && focusedConversation && (
        <MessageList
          messages={messages}
          focusedConversation={focusedConversation}
        />
      )}

      {/* Chatbox area - always visible at bottom, fixed height */}
      <div className="h-[200px] flex flex-col">
        <TopBar
          mode={mode}
          focusedConversation={focusedConversation}
          onInboxClick={handleInboxClick}
          onTabClick={handleTabClick}
          onClearFocus={handleClearFocusWithCleanup}
          onClose={handleClose}
          getDisplayName={getDisplayName}
        />

        {/* Chatbox content - show Hello.svg when not in tab or agent mode */}
        {mode !== "tab" && mode !== "conversation" && (
          <div className="flex items-center justify-center h-full pb-10">
            <img src={HelloSvg} alt="Hello" className="w-44 opacity-50" />
          </div>
        )}

        {/* Chatbox content - only show input area in tab mode */}
        {mode === "tab" && focusedConversation && (
          <div className="flex flex-col h-full p-3">
            <ChatInput
              draft={draft}
              setDraft={setDraft}
              suggestions={suggestions}
              selectedSuggestionIndex={selectedSuggestionIndex}
              onSuggestionClick={handleSuggestionClick}
              inputRef={inputRef}
              suggestionRefs={suggestionRefs}
              isTyping={isTyping}
            />
          </div>
        )}

        {/* Chatbox content - full conversation view (old mode) */}
        {mode === "conversation" && focusedConversation && (
          <div className="flex flex-col h-full p-3">
            <ChatInput
              draft={draft}
              setDraft={setDraft}
              suggestions={suggestions}
              selectedSuggestionIndex={selectedSuggestionIndex}
              onSuggestionClick={handleSuggestionClick}
              inputRef={inputRef}
              suggestionRefs={suggestionRefs}
              isTyping={isTyping}
            />
            <MessageList
              messages={messages}
              focusedConversation={focusedConversation}
              messagesContainerRef={messagesContainerRef}
              showInChatbox={true}
            />
          </div>
        )}
      </div>
    </div>
  );
};


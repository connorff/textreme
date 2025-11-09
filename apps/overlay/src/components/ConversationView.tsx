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
import { sendMessage } from "../lib/sendMessage";

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
    // Append suggestion to current draft with a space
    setDraft(draft + " " + suggestion);
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

  const handleSendMessage = async () => {
    if (!focusedConversation || !draft.trim()) {
      return;
    }

    const result = await sendMessage(focusedConversation, draft);

    if (result.success) {
      // Clear the draft on success
      setDraft("");
      console.log("Message sent successfully!");
    } else {
      console.error("Failed to send message:", result.error);
      // TODO: Show error to user
    }
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
    draft,
    handleInboxClick,
    handleSelectConversation: (conversation) => {
      const index = conversations.findIndex((c) => c.id === conversation.id);
      if (index !== -1) {
        handleConversationSelect(conversation, index);
      }
    },
    handleClearFocus: handleClearFocusWithCleanup,
    handleSuggestionClick,
    handleSendMessage,
  });

  return (
    <div className="bg-background flex flex-col h-screen overflow-hidden rounded-xl w-screen">
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
      <div className="flex flex-col h-[200px]">
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
          <div className="flex h-full items-center justify-center pb-10">
            <img src={HelloSvg} alt="Hello" className="opacity-50 w-44" />
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

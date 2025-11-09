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
import { AgentView } from "./AgentView";
import type { UnreadConversation, AgentOutput } from "../types/electron";

const HELLO_SVG = new URL(
  "../assets/AppleHello.svg",
  import.meta.url
).toString();

export const ConversationView = () => {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);
  const [agentFinalOutput, setAgentFinalOutput] = useState<AgentOutput | null>(
    null
  );

  // Custom hooks
  const { conversations, selectedIndex, setSelectedIndex } = useConversations();

  const {
    mode,
    composeMode,
    focusedConversation,
    handleInboxClick,
    handleTabClick,
    handleAgentClick,
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

  const handleConversationSelect = (
    conversation: UnreadConversation,
    index: number
  ) => {
    setSelectedIndex(index);
    handleSelectConversation(conversation);
  };

  const handleClearFocusWithCleanup = () => {
    setMessages([]);
    setDraft("");
    setAgentFinalOutput(null);
    handleClearFocus();
  };

  // Clear agent output when conversation changes
  useEffect(() => {
    if (mode !== "agent") {
      setAgentFinalOutput(null);
    }
  }, [focusedConversation?.guid, mode]);

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

      {/* Conversation messages displayed above chatbox */}
      {(mode === "tab" || mode === "agent" || mode === "conversation") &&
        focusedConversation && (
          <MessageList
            messages={messages}
            focusedConversation={focusedConversation}
            agentCandidates={mode === "agent" ? agentFinalOutput : null}
          />
        )}

      {/* Chatbox area - always visible at bottom, fixed height */}
      <div className="h-[200px] flex flex-col">
        <TopBar
          mode={mode}
          focusedConversation={focusedConversation}
          composeMode={composeMode}
          onInboxClick={handleInboxClick}
          onTabClick={handleTabClick}
          onAgentClick={handleAgentClick}
          onClearFocus={handleClearFocusWithCleanup}
          onClose={handleClose}
          getDisplayName={getDisplayName}
        />

        {/* Chatbox content - show Hello.svg when not in tab or agent mode */}
        {mode !== "tab" && mode !== "agent" && mode !== "conversation" && (
          <div className="flex items-center justify-center h-full pb-10">
            <img src={HELLO_SVG} alt="Hello" className="w-44 opacity-50" />
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

        {mode === "agent" && focusedConversation && (
          <AgentView
            focusedConversation={focusedConversation}
            messages={messages}
            onFinalOutputChange={setAgentFinalOutput}
          />
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

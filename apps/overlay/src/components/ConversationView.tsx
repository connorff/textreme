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
import { AgentView } from "./agent/AgentView";
import type { UnreadConversation, AgentOutput } from "../types/electron";
import HelloSvg from "../assets/AppleHello.svg";
import { sendMessage } from "../lib/sendMessage";

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

  const {
    messages,
    setMessages,
    messagesContainerRef,
    fetchMessages,
    scrollToBottom,
  } = useMessages(
    focusedConversation,
    mode
  );

  const {
    suggestions,
    selectedSuggestionIndex,
    setSelectedSuggestionIndex,
    isTyping,
    suggestionRefs,
  } = useSuggestions(draft, focusedConversation, messages);

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
    // Append the completion to the draft
    // Add a space before if draft doesn't end with one
    const needsSpace = draft && !draft.endsWith(" ");
    setDraft(draft + (needsSpace ? " " : "") + suggestion);
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

  const handleSendMessage = async () => {
    if (!focusedConversation || !draft.trim()) {
      return;
    }

    const result = await sendMessage(focusedConversation, draft);

    if (result.success) {
      // Clear the draft on success
      setDraft("");
      console.log("Message sent successfully!");
      // Scroll to bottom after sending and then refresh messages shortly after
      scrollToBottom(true);
      setTimeout(() => {
        if (focusedConversation) {
          fetchMessages(focusedConversation.guid);
        }
      }, 1000);
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
    handleAgentClick,
    handleTabClick,
  });

  return (
    <div className="bg-background flex flex-col h-screen overflow-hidden rounded-xl w-screen">
      {/* Agent mode - full screen layout */}
      {mode === "agent" && focusedConversation && (
        <div className="flex flex-col h-full">
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
          <div className="flex-1 overflow-hidden">
            <AgentView
              focusedConversation={focusedConversation}
              messages={messages}
              onFinalOutputChange={setAgentFinalOutput}
              onMessageSent={() => {
                if (focusedConversation) {
                  fetchMessages(focusedConversation.guid);
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Non-agent modes */}
      {mode !== "agent" && (
        <>
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
          {(mode === "tab" || mode === "conversation") &&
            focusedConversation && (
              <MessageList
                messages={messages}
                focusedConversation={focusedConversation}
                messagesContainerRef={messagesContainerRef}
                agentCandidates={null}
                onMessageSent={() => {
                  if (focusedConversation) {
                    fetchMessages(focusedConversation.guid);
                  }
                }}
              />
            )}

          {/* Chatbox area - always visible at bottom, fixed height */}
          <div className="flex flex-col h-[200px]">
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

            {/* Chatbox content - show Hello.svg when not in tab or conversation mode */}
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
                  onMessageSent={() => {
                    if (focusedConversation) {
                      fetchMessages(focusedConversation.guid);
                    }
                  }}
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

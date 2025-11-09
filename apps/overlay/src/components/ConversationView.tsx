import { Inbox, Sparkles, Pencil, X, CircleUser } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import type {
  UnreadConversation,
  ConversationMessage,
} from "../types/electron";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { CommandList, CommandItem } from "@/components/ui/command";

type ViewMode = "blank" | "inbox" | "tab" | "conversation";

export const ConversationView = () => {
  const [mode, setMode] = useState<ViewMode>("blank");
  const [conversations, setConversations] = useState<UnreadConversation[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [focusedConversation, setFocusedConversation] =
    useState<UnreadConversation | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const selectedRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const suggestionRefs = useRef<(HTMLDivElement | null)[]>([]);

  const handleClose = () => {
    window.electronAPI.closeWindow();
  };

  const fetchConversations = useCallback(async () => {
    try {
      const result = await window.electronAPI.getUnreadConversations();
      if (result.success) {
        setConversations(result.conversations.slice(0, 10));
      }
    } catch (err) {
      console.error("Error fetching conversations:", err);
    }
  }, []);

  // Start polling on mount
  useEffect(() => {
    fetchConversations();
    const interval = setInterval(fetchConversations, 3000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  // Fetch messages when conversation is focused
  const fetchMessages = useCallback(async (chatGuid: string) => {
    try {
      const result = await window.electronAPI.getConversationMessages(
        chatGuid,
        5
      );
      if (result.success) {
        setMessages(result.messages);
      }
    } catch (err) {
      console.error("Error fetching messages:", err);
    }
  }, []);

  // Fetch messages when conversation is focused
  useEffect(() => {
    if (focusedConversation && (mode === "tab" || mode === "conversation")) {
      fetchMessages(focusedConversation.guid);
      // Focus input when conversation view opens
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [focusedConversation, mode, fetchMessages]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesContainerRef.current && messages.length > 0) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight;
    }
  }, [messages]);

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

  const handleInboxClick = () => {
    if (mode === "blank") {
      setMode("inbox");
      setSelectedIndex(0);
      // Delay resize until after React renders the inbox
      requestAnimationFrame(() => {
        window.electronAPI.resizeWindow(500);
      });
    } else if (mode === "tab" || mode === "conversation") {
      // Switch to inbox but keep the focused conversation
      setMode("inbox");
      setSelectedIndex(0);
      // Delay resize until after React renders the inbox
      requestAnimationFrame(() => {
        window.electronAPI.resizeWindow(500);
      });
    } else if (mode === "inbox") {
      // If there's a focused conversation, go back to tab mode; otherwise go to blank
      if (focusedConversation) {
        setMode("tab");
        requestAnimationFrame(() => {
          window.electronAPI.resizeWindow(500);
        });
      } else {
        setMode("blank");
        requestAnimationFrame(() => {
          window.electronAPI.resizeWindow(200);
        });
      }
    }
  };

  const handleTabClick = () => {
    if (mode === "tab") {
      // If already in tab mode, go to blank
      setMode("blank");
      requestAnimationFrame(() => {
        window.electronAPI.resizeWindow(200);
      });
    } else {
      // Switch to tab mode
      if (focusedConversation) {
        setMode("tab");
        requestAnimationFrame(() => {
          window.electronAPI.resizeWindow(500);
        });
      }
    }
  };

  const handleSelectConversation = (index: number) => {
    setSelectedIndex(index);
    const conversation = conversations[index];
    setFocusedConversation(conversation);
    setMode("tab");
    // Stay at 500px height for tab mode
    requestAnimationFrame(() => {
      window.electronAPI.resizeWindow(500);
    });
  };

  const handleClearFocus = useCallback(() => {
    setFocusedConversation(null);
    setMessages([]);
    setDraft("");
    setSuggestions([]);
    if (mode === "tab" || mode === "conversation") {
      setMode("blank");
      requestAnimationFrame(() => {
        window.electronAPI.resizeWindow(200);
      });
    }
  }, [mode]);

  const handleSuggestionClick = (suggestion: string) => {
    setDraft(suggestion);
    inputRef.current?.focus();
  };

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

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+I or Ctrl+I to toggle inbox
      if ((e.metaKey || e.ctrlKey) && e.key === "i") {
        e.preventDefault();
        handleInboxClick();
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
            handleSelectConversation(selectedIndex);
          }
        } else if (e.key === "Escape") {
          e.preventDefault();
          // If there's a focused conversation, go back to tab mode; otherwise go to blank
          if (focusedConversation) {
            setMode("tab");
            requestAnimationFrame(() => {
              window.electronAPI.resizeWindow(500);
            });
          } else {
            setMode("blank");
            requestAnimationFrame(() => {
              window.electronAPI.resizeWindow(200);
            });
          }
        }
      } else if (mode === "tab" || mode === "conversation") {
        if (e.key === "Escape") {
          e.preventDefault();
          // Clear focus entirely - removes conversation pill and goes to blank
          handleClearFocus();
        } else if (suggestions.length > 0 && !isTyping) {
          // Only handle arrow keys and Enter when dropdown is visible and not typing
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
          // All other keys are ignored by dropdown and pass through to input
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    mode,
    selectedIndex,
    conversations.length,
    handleInboxClick,
    focusedConversation,
    handleClearFocus,
    suggestions,
    selectedSuggestionIndex,
    draft,
    isTyping,
  ]);

  const getDisplayName = (conversation: UnreadConversation): string => {
    if (conversation.displayName) {
      return conversation.displayName;
    }
    const firstMessage = conversation.unreadMessages[0];
    if (firstMessage?.contactName) {
      return firstMessage.contactName;
    }
    return conversation.chatIdentifier || "Unknown";
  };

  const getLatestMessage = (conversation: UnreadConversation): string => {
    const lastMessage =
      conversation.unreadMessages[conversation.unreadMessages.length - 1];
    const text = lastMessage?.text || "[No text]";
    return text.length > 50 ? text.substring(0, 50) + "..." : text;
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-background rounded-xl overflow-hidden">
      {/* Inbox area - only visible when mode is inbox, expands from top */}
      {mode === "inbox" && (
        <div className="flex-1 overflow-hidden border-b border-border">
          <ScrollArea className="h-full">
            <div className="px-3 pt-3 pb-3">
              {conversations.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No unread conversations
                </div>
              ) : (
                <div className="space-y-1">
                  {conversations.map((conversation, index) => (
                    <button
                      key={conversation.id}
                      ref={index === selectedIndex ? selectedRef : null}
                      onClick={() => handleSelectConversation(index)}
                      className={`w-full text-left p-3 rounded-lg transition-colors ${
                        index === selectedIndex
                          ? "bg-accent/50"
                          : "hover:bg-accent/20"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="text-sm truncate">
                          {getDisplayName(conversation)}
                        </div>
                        {conversation.unreadCount > 0 && (
                          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-muted text-[10px] text-muted-foreground flex-shrink-0">
                            {conversation.unreadCount > 9
                              ? "9+"
                              : conversation.unreadCount}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {getLatestMessage(conversation)}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Tab mode - conversation messages displayed above chatbox */}
      {mode === "tab" && focusedConversation && (
        <div className="flex-1 overflow-hidden border-b border-border">
          <ScrollArea className="h-full">
            <div className="px-3 pt-3 pb-3">
              {(() => {
                // Group consecutive messages by sender
                const groupedMessages: Array<{
                  senderId: string;
                  isFromMe: boolean;
                  senderName: string;
                  messages: ConversationMessage[];
                }> = [];

                messages.forEach((msg) => {
                  const senderId = msg.isFromMe
                    ? "me"
                    : msg.handleIdentifier || "unknown";
                  const senderName = msg.isFromMe
                    ? "You"
                    : msg.contactName ||
                      focusedConversation.displayName ||
                      getDisplayName(focusedConversation);

                  const lastGroup = groupedMessages[groupedMessages.length - 1];
                  if (
                    lastGroup &&
                    lastGroup.senderId === senderId &&
                    lastGroup.isFromMe === msg.isFromMe
                  ) {
                    // Add to existing group
                    lastGroup.messages.push(msg);
                  } else {
                    // Create new group
                    groupedMessages.push({
                      senderId,
                      isFromMe: msg.isFromMe,
                      senderName,
                      messages: [msg],
                    });
                  }
                });

                return groupedMessages.map((group, groupIdx) => (
                  <div
                    key={groupIdx}
                    className={`flex mb-2 ${
                      group.isFromMe ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div className="flex flex-col max-w-[80%] min-w-0">
                      {/* Sender name (only show for received messages) */}
                      {!group.isFromMe && (
                        <span className="text-[10px] text-muted-foreground mb-0.5 px-1">
                          {group.senderName}
                        </span>
                      )}
                      {/* Message bubbles */}
                      <div
                        className={`flex flex-col gap-0.5 ${
                          group.isFromMe ? "items-end" : "items-start"
                        }`}
                      >
                        {group.messages.map((msg, msgIdx) => (
                          <div
                            key={msg.id || msgIdx}
                            className={`rounded-2xl px-3 py-1.5 text-xs max-w-full break-words min-w-0 ${
                              group.isFromMe
                                ? "bg-blue-500 text-white"
                                : "bg-gray-100 text-foreground"
                            }`}
                            style={{
                              borderRadius: group.isFromMe
                                ? "18px 4px 18px 18px"
                                : "4px 18px 18px 18px",
                              wordBreak: "break-word",
                              overflowWrap: "anywhere",
                              hyphens: "auto",
                            }}
                          >
                            {msg.text || "[No text]"}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Chatbox area - always visible at bottom, fixed height */}
      <div className="h-[200px] flex flex-col">
        {/* Top bar with icons and close button - draggable */}
        <div
          className="flex items-center justify-between p-3"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        >
          {/* Top left icons */}
          <div
            className="flex items-center gap-1.5"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            <button
              onClick={handleInboxClick}
              className={`p-1.5 rounded-lg hover:bg-accent/50 transition-colors ${
                mode === "inbox"
                  ? "text-foreground bg-accent/50"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Inbox mode"
            >
              <Inbox className="h-4 w-4" />
            </button>
            <button
              onClick={handleTabClick}
              className={`p-1.5 rounded-lg hover:bg-accent/50 transition-colors ${
                mode === "tab"
                  ? "text-foreground bg-accent/50"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Tab mode"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              className="p-1.5 rounded-lg hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground"
              title="Agent mode"
            >
              <Sparkles className="h-4 w-4" />
            </button>

            {/* Conversation pill - inline with icons */}
            {focusedConversation && (
              <div className="ml-2 px-2 py-1 rounded-md bg-primary/10 text-primary text-sm flex items-center gap-1.5">
                <CircleUser className="h-4 w-4" />
                <span>{getDisplayName(focusedConversation)}</span>
                <button
                  onClick={handleClearFocus}
                  className="ml-0.5 p-0.5 rounded hover:bg-primary/20 transition-colors flex-shrink-0"
                  title="Clear focus"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>

          {/* Top right close button */}
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground"
            title="Close"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Chatbox content - only show input area in tab mode */}
        {mode === "tab" && focusedConversation && (
          <div className="flex flex-col justify-end h-full p-3">
            {/* Autocomplete input area */}
            <div className="relative">
              <Popover
                open={suggestions.length > 0 && !isTyping}
                onOpenChange={() => {
                  // Controlled by suggestions state
                }}
              >
                {/* Input */}
                <div className="relative min-h-[28px]">
                  <div className="flex items-center min-h-[28px]">
                    {/* User's typed text */}
                    {draft ? (
                      <span
                        className="text-sm text-foreground font-normal"
                        style={{
                          fontFamily: "Inter, sans-serif",
                          fontSize: "14px",
                          lineHeight: "20px",
                        }}
                      >
                        {draft}
                      </span>
                    ) : (
                      <span
                        className="text-sm text-muted-foreground/50 font-normal"
                        style={{
                          fontFamily: "Inter, sans-serif",
                          fontSize: "14px",
                          lineHeight: "20px",
                        }}
                      >
                        Type a message...
                      </span>
                    )}
                  </div>
                  {/* Actual input for typing */}
                  <input
                    ref={inputRef}
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    className="absolute inset-0 w-full h-full bg-transparent border-none outline-none text-sm text-transparent caret-foreground"
                    aria-label="Type a message"
                    style={{
                      fontFamily: "Inter, sans-serif",
                      fontSize: "14px",
                      lineHeight: "20px",
                    }}
                  />
                </div>

                {/* Autocomplete dropdown - above input */}
                <PopoverContent
                  side="top"
                  align="start"
                  sideOffset={4}
                  className="p-0 w-auto max-w-full border-gray-100 absolute bottom-full mb-1 left-0"
                  style={{
                    boxShadow:
                      "0 2px 8px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.05)",
                  }}
                >
                  <CommandList className="max-h-48">
                    {suggestions.map((suggestion, idx) => (
                      <CommandItem
                        key={idx}
                        ref={(el) => {
                          suggestionRefs.current[idx] = el;
                        }}
                        onClick={() => handleSuggestionClick(suggestion)}
                        selected={idx === selectedSuggestionIndex}
                        className="px-3 py-1.5 text-sm cursor-pointer"
                        style={{
                          fontFamily: "Inter, sans-serif",
                          fontSize: "14px",
                          lineHeight: "20px",
                        }}
                      >
                        {suggestion}
                      </CommandItem>
                    ))}
                  </CommandList>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        )}

        {/* Chatbox content - full conversation view (old mode) */}
        {mode === "conversation" && focusedConversation && (
          <div className="flex flex-col h-full p-3">
            {/* Messages list - grouped by sender with bubbles */}
            <div
              ref={messagesContainerRef}
              className="flex-1 overflow-y-auto mb-3"
            >
              {(() => {
                // Group consecutive messages by sender
                const groupedMessages: Array<{
                  senderId: string;
                  isFromMe: boolean;
                  senderName: string;
                  messages: ConversationMessage[];
                }> = [];

                messages.forEach((msg) => {
                  const senderId = msg.isFromMe
                    ? "me"
                    : msg.handleIdentifier || "unknown";
                  const senderName = msg.isFromMe
                    ? "You"
                    : msg.contactName ||
                      focusedConversation.displayName ||
                      getDisplayName(focusedConversation);

                  const lastGroup = groupedMessages[groupedMessages.length - 1];
                  if (
                    lastGroup &&
                    lastGroup.senderId === senderId &&
                    lastGroup.isFromMe === msg.isFromMe
                  ) {
                    // Add to existing group
                    lastGroup.messages.push(msg);
                  } else {
                    // Create new group
                    groupedMessages.push({
                      senderId,
                      isFromMe: msg.isFromMe,
                      senderName,
                      messages: [msg],
                    });
                  }
                });

                return groupedMessages.map((group, groupIdx) => (
                  <div
                    key={groupIdx}
                    className={`flex mb-2 ${
                      group.isFromMe ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div className="flex flex-col max-w-[80%] min-w-0">
                      {/* Sender name (only show for received messages, and only if different from previous) */}
                      {!group.isFromMe && (
                        <span className="text-[10px] text-muted-foreground mb-0.5 px-1">
                          {group.senderName}
                        </span>
                      )}
                      {/* Message bubbles */}
                      <div
                        className={`flex flex-col gap-0.5 ${
                          group.isFromMe ? "items-end" : "items-start"
                        }`}
                      >
                        {group.messages.map((msg, msgIdx) => (
                          <div
                            key={msg.id || msgIdx}
                            className={`rounded-2xl px-3 py-1.5 text-xs max-w-full break-words min-w-0 ${
                              group.isFromMe
                                ? "bg-blue-500 text-white"
                                : "bg-gray-100 text-foreground"
                            }`}
                            style={{
                              borderRadius: group.isFromMe
                                ? "18px 4px 18px 18px"
                                : "4px 18px 18px 18px",
                              wordBreak: "break-word",
                              overflowWrap: "anywhere",
                              hyphens: "auto",
                            }}
                          >
                            {msg.text || "[No text]"}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ));
              })()}
            </div>

            {/* Autocomplete input area */}
            <div className="relative">
              <Popover
                open={suggestions.length > 0 && !isTyping}
                onOpenChange={() => {
                  // Controlled by suggestions state
                }}
              >
                {/* Input */}
                <div className="relative min-h-[28px]">
                  <div className="flex items-center min-h-[28px]">
                    {/* User's typed text */}
                    {draft ? (
                      <span
                        className="text-sm text-foreground font-normal"
                        style={{
                          fontFamily: "Inter, sans-serif",
                          fontSize: "14px",
                          lineHeight: "20px",
                        }}
                      >
                        {draft}
                      </span>
                    ) : (
                      <span
                        className="text-sm text-muted-foreground/50 font-normal"
                        style={{
                          fontFamily: "Inter, sans-serif",
                          fontSize: "14px",
                          lineHeight: "20px",
                        }}
                      >
                        Type a message...
                      </span>
                    )}
                  </div>
                  {/* Actual input for typing */}
                  <input
                    ref={inputRef}
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    className="absolute inset-0 w-full h-full bg-transparent border-none outline-none text-sm text-transparent caret-foreground"
                    aria-label="Type a message"
                    style={{
                      fontFamily: "Inter, sans-serif",
                      fontSize: "14px",
                      lineHeight: "20px",
                    }}
                  />
                </div>

                {/* Autocomplete dropdown - above input */}
                <PopoverContent
                  side="top"
                  align="start"
                  sideOffset={4}
                  className="p-0 w-auto max-w-full border-gray-100 absolute bottom-full mb-1 left-0"
                  style={{
                    boxShadow:
                      "0 2px 8px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.05)",
                  }}
                >
                  <CommandList className="max-h-48">
                    {suggestions.map((suggestion, idx) => (
                      <CommandItem
                        key={idx}
                        ref={(el) => {
                          suggestionRefs.current[idx] = el;
                        }}
                        onClick={() => handleSuggestionClick(suggestion)}
                        selected={idx === selectedSuggestionIndex}
                        className="px-3 py-1.5 text-sm cursor-pointer"
                        style={{
                          fontFamily: "Inter, sans-serif",
                          fontSize: "14px",
                          lineHeight: "20px",
                        }}
                      >
                        {suggestion}
                      </CommandItem>
                    ))}
                  </CommandList>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

import { useState, useEffect, useCallback } from "react";
import { appleTimestampToDate } from "@textreme/schema";
import type { UnreadConversation, ConversationMessage } from "../types/electron";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronDown, ArrowUp } from "lucide-react";
import { isPhoneIdentifier } from "@/lib/phone-utils";

interface ConversationViewProps {
  pollInterval?: number;
}

export const ConversationView = ({ pollInterval = 2000 }: ConversationViewProps) => {
  const [conversations, setConversations] = useState<UnreadConversation[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showConversationList, setShowConversationList] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draftMessage, setDraftMessage] = useState("");
  const [selectedRecommendation, setSelectedRecommendation] = useState<number | null>(null);
  const [recentMessages, setRecentMessages] = useState<ConversationMessage[]>([]);

  const fetchUnreadMessages = useCallback(async () => {
    try {
      setError(null);
      const result = await window.electronAPI.getUnreadConversations();
      
      if (result.success) {
        // Limit to top 10 conversations
        setConversations(result.conversations.slice(0, 10));
      } else {
        setError(result.error || "Failed to fetch unread messages");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRecentMessages = useCallback(async (chatGuid: string) => {
    try {
      const result = await window.electronAPI.getConversationMessages(chatGuid, 5);
      if (result.success) {
        setRecentMessages(result.messages);
      } else {
        console.error("Failed to fetch recent messages:", result.error);
        setRecentMessages([]);
      }
    } catch (err) {
      console.error("Error fetching recent messages:", err);
      setRecentMessages([]);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchUnreadMessages();
  }, [fetchUnreadMessages]);

  // Set up polling
  useEffect(() => {
    const interval = setInterval(() => {
      fetchUnreadMessages();
    }, pollInterval);

    return () => clearInterval(interval);
  }, [fetchUnreadMessages, pollInterval]);

  // Fetch recent messages when conversation changes
  useEffect(() => {
    if (conversations.length > 0 && !showConversationList) {
      const currentConversation = conversations[selectedIndex];
      if (currentConversation) {
        fetchRecentMessages(currentConversation.guid);
      }
    }
  }, [selectedIndex, conversations, showConversationList, fetchRecentMessages]);

  const getDisplayName = (conversation: UnreadConversation): string => {
    if (conversation.displayName) {
      return conversation.displayName;
    }
    const firstMessage = conversation.unreadMessages[0];
    if (firstMessage?.contactName) {
      return firstMessage.contactName;
    }
    if (isPhoneIdentifier(conversation.chatIdentifier)) {
      return "Unknown Contact";
    }
    return conversation.chatIdentifier || "Unknown";
  };

  const truncateText = (text: string | null, maxLength: number = 60): string => {
    if (!text) return "[No text]";
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  };

  const handleRecommendationClick = (index: number, text: string) => {
    setSelectedRecommendation(index);
    setDraftMessage(text);
  };

  const handleSelectConversation = (index: number) => {
    setSelectedIndex(index);
    setShowConversationList(false);
  };

  const handleSendMessage = () => {
    if (!draftMessage.trim()) return;
    // TODO: Send message
    console.log("Send:", draftMessage);
    setDraftMessage("");
    setSelectedRecommendation(null);
  };

  // Placeholder recommendations - will be replaced with ML model
  const recommendations = ["Thanks!", "Sounds good", "Will do"];

  if (loading && conversations.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen p-4">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen p-4">
        <div className="text-center">
          <div className="text-sm text-destructive mb-2">Error: {error}</div>
          <Button onClick={fetchUnreadMessages} size="sm">Retry</Button>
        </div>
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen p-4">
        <div className="text-center text-muted-foreground">
          <div className="text-2xl mb-2">🎉</div>
          <div className="text-sm">No unread messages</div>
        </div>
      </div>
    );
  }

  const currentConversation = conversations[selectedIndex];

  // Show conversation list
  if (showConversationList) {
    return (
      <div className="flex flex-col h-screen max-w-xl mx-auto bg-background">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <h2 className="text-sm font-medium text-muted-foreground">Select a conversation</h2>
        </div>

        {/* Conversations List */}
        <ScrollArea className="flex-1">
          <div className="p-2">
            {conversations.map((conversation, index) => {
              const displayName = getDisplayName(conversation);
              const lastMessage = conversation.unreadMessages[conversation.unreadMessages.length - 1];
              
              return (
                <button
                  key={conversation.id}
                  onClick={() => handleSelectConversation(index)}
                  className={cn(
                    "w-full p-3 rounded-lg text-left hover:bg-accent transition-colors mb-1",
                    selectedIndex === index && "bg-accent"
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm truncate">{displayName}</span>
                    {conversation.unreadCount > 0 && (
                      <Badge variant="default" className="h-5 px-1.5 text-xs ml-auto">
                        {conversation.unreadCount}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {truncateText(lastMessage?.text)}
                  </p>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    );
  }

  // Show single conversation
  return (
    <div className="flex flex-col h-screen max-w-xl mx-auto bg-background">
      {/* Header with conversation name */}
      <button
        onClick={() => setShowConversationList(true)}
        className="p-4 border-b border-border hover:bg-accent/50 transition-colors flex items-center justify-between"
      >
        <div className="flex items-center gap-2 min-w-0">
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="font-medium text-sm truncate">{getDisplayName(currentConversation)}</span>
        </div>
        {currentConversation.unreadCount > 0 && (
          <Badge variant="default" className="h-5 px-1.5 text-xs ml-2 shrink-0">
            {currentConversation.unreadCount}
          </Badge>
        )}
      </button>

      {/* Recommendations */}
      <div className="p-4 border-b border-border bg-muted/20">
        <div className="flex items-center gap-2 justify-center">
          {recommendations.map((rec, index) => (
            <Button
              key={index}
              variant={selectedRecommendation === index ? "default" : "outline"}
              size="sm"
              onClick={() => handleRecommendationClick(index, rec)}
              className="flex-1 max-w-[180px] text-xs"
            >
              {rec}
            </Button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3 min-h-full">
          {recentMessages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              No messages to display
            </div>
          ) : (
            recentMessages.map((message) => {
              const isFromMe = message.isFromMe;
              
              // Skip reactions/tapbacks
              if (message.associatedMessageGuid) {
                return null;
              }

              return (
                <div
                  key={message.id}
                  className={cn(
                    "flex",
                    isFromMe ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-2.5",
                      isFromMe
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    )}
                  >
                    <div className="text-sm break-words whitespace-pre-wrap">
                      {message.text || "[No text]"}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="p-3 border-t border-border bg-card">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={draftMessage}
            onChange={(e) => setDraftMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 px-3 py-2 text-sm bg-background border border-border rounded-full focus:outline-none focus:ring-2 focus:ring-ring"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
          />
          <Button 
            size="icon"
            disabled={!draftMessage.trim()}
            onClick={handleSendMessage}
            className="rounded-full h-9 w-9 shrink-0"
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};


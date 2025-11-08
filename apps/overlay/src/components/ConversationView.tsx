import { useState, useEffect, useCallback, useRef } from "react";
import { appleTimestampToDate } from "@textreme/schema";
import type { UnreadConversation, UnreadMessage } from "../types/electron";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MessageSquare, Paperclip } from "lucide-react";
import { isPhoneIdentifier } from "@/lib/phone-utils";

interface ConversationViewProps {
  pollInterval?: number;
}

export const ConversationView = ({ pollInterval = 2000 }: ConversationViewProps) => {
  const [conversations, setConversations] = useState<UnreadConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [totalUnread, setTotalUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isInitialMount = useRef(true);

  const fetchUnreadMessages = useCallback(async () => {
    try {
      setError(null);
      const result = await window.electronAPI.getUnreadConversations();
      
      if (result.success) {
        setConversations(result.conversations);
        setTotalUnread(result.totalUnread);
        
        // Auto-select first conversation on initial mount
        if (isInitialMount.current && result.conversations.length > 0) {
          setSelectedConversationId(result.conversations[0].id);
          isInitialMount.current = false;
        }
      } else {
        setError(result.error || "Failed to fetch unread messages");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
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

  const selectedConversation = conversations.find(c => c.id === selectedConversationId) || null;

  const getDisplayName = (conversation: UnreadConversation): string => {
    // Prefer display name
    if (conversation.displayName) {
      return conversation.displayName;
    }
    // Try to get contact name from first message
    const firstMessage = conversation.unreadMessages[0];
    if (firstMessage?.contactName) {
      return firstMessage.contactName;
    }
    // If chatIdentifier is a phone number and we don't have a contact name, don't show it
    if (isPhoneIdentifier(conversation.chatIdentifier)) {
      return "Unknown Contact";
    }
    // For non-phone identifiers (like emails), show them
    return conversation.chatIdentifier || "Unknown";
  };

  const getInitials = (name: string): string => {
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const formatTime = (timestamp: number): string => {
    const date = appleTimestampToDate(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const formatMessageTime = (timestamp: number): string => {
    const date = appleTimestampToDate(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (loading && conversations.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading unread messages...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="text-destructive mb-4">Error: {error}</div>
          <Button onClick={fetchUnreadMessages}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center text-muted-foreground">
          <div className="text-4xl mb-4">🎉</div>
          <div className="text-lg">No unread messages!</div>
        </div>
      </div>
    );
  }

  // Sort messages by date (oldest first, like iMessage)
  const sortedMessages = selectedConversation
    ? [...selectedConversation.unreadMessages].sort((a, b) => a.date - b.date)
    : [];

  return (
    <div className="flex h-screen bg-background">
      {/* Left Sidebar - Conversations List */}
      <div className="w-80 border-r border-border bg-card flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-xl font-semibold">Unread Messages</h1>
            <Badge variant={totalUnread > 0 ? "default" : "secondary"}>
              {totalUnread}
            </Badge>
          </div>
        </div>

        {/* Conversations List */}
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {conversations.map((conversation) => {
              const displayName = getDisplayName(conversation);
              const isSelected = selectedConversationId === conversation.id;
              const lastMessage = conversation.unreadMessages[conversation.unreadMessages.length - 1];
              
              return (
                <button
                  key={conversation.id}
                  onClick={() => setSelectedConversationId(conversation.id)}
                  className={cn(
                    "w-full text-left p-3 rounded-lg transition-colors overflow-hidden",
                    "hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                    isSelected && "bg-accent"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="relative shrink-0">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-primary/10 text-primary">
                          {getInitials(displayName)}
                        </AvatarFallback>
                      </Avatar>
                      {conversation.unreadCount > 0 && (
                        <Badge 
                          variant="default" 
                          className="absolute -top-1 -right-1 h-5 min-w-5 px-1.5 flex items-center justify-center text-[10px] leading-none"
                        >
                          {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
                        </Badge>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-medium truncate">{displayName}</span>
                        {lastMessage && (
                          <span className="text-xs text-muted-foreground whitespace-nowrap ml-auto">
                            {formatTime(lastMessage.date)}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2 break-all">
                        {lastMessage?.text || "[No text content]"}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Right Pane - Messages */}
      <div className="flex-1 flex flex-col bg-background">
        {selectedConversation ? (
          <>
            {/* Message Header */}
            <div className="border-b border-border p-4 bg-card">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {getInitials(getDisplayName(selectedConversation))}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{getDisplayName(selectedConversation)}</div>
                  <div className="text-sm text-muted-foreground">
                    {selectedConversation.unreadCount} unread message{selectedConversation.unreadCount !== 1 ? "s" : ""}
                  </div>
                </div>
              </div>
            </div>

            {/* Messages Area */}
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-4">
                {sortedMessages.map((message, index) => {
                  const isFromMe = message.isFromMe;
                  const showAvatar = !isFromMe;
                  const prevMessage = index > 0 ? sortedMessages[index - 1] : null;
                  const showTimeSeparator = 
                    !prevMessage || 
                    appleTimestampToDate(message.date).getTime() - appleTimestampToDate(prevMessage.date).getTime() > 300000; // 5 minutes

                  // Handle reactions/tapbacks
                  if (message.associatedMessageGuid) {
                    const reactionEmoji = message.associatedMessageEmoji || "👍";
                    return (
                      <div key={message.id} className="flex items-center justify-center py-2">
                        <div className="text-sm text-muted-foreground flex items-center gap-2">
                          <span>{reactionEmoji}</span>
                          <span>Reacted to a message</span>
                          <span className="text-xs">{formatMessageTime(message.date)}</span>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={message.id}>
                      {showTimeSeparator && (
                        <div className="flex items-center justify-center py-3">
                          <Badge variant="outline" className="text-xs">
                            {formatTime(message.date)}
                          </Badge>
                        </div>
                      )}
                      <div className={cn(
                        "flex items-end gap-2 mb-1",
                        isFromMe ? "justify-end" : "justify-start"
                      )}>
                        {showAvatar && !isFromMe && (
                          <Avatar className="h-8 w-8 shrink-0 mb-1">
                            <AvatarFallback className="bg-primary/10 text-primary text-xs">
                              {message.contactName ? getInitials(message.contactName) : "?"}
                            </AvatarFallback>
                          </Avatar>
                        )}
                        {!showAvatar && <div className="w-8 shrink-0" />}
                        <div className={cn(
                          "max-w-[70%] rounded-2xl px-4 py-2.5 flex flex-col",
                          isFromMe 
                            ? "bg-primary text-primary-foreground" 
                            : "bg-muted text-foreground"
                        )}>
                          <div className="text-sm whitespace-pre-wrap break-all">
                            {message.text || "[No text content]"}
                          </div>
                          {message.cacheHasAttachments && (
                            <div className="mt-1.5 flex items-center gap-1.5 text-xs opacity-70">
                              <Paperclip className="h-3 w-3 shrink-0" />
                              <span>Attachment</span>
                            </div>
                          )}
                          <div className={cn(
                            "text-xs mt-1.5 self-end",
                            isFromMe ? "text-primary-foreground/70" : "text-muted-foreground"
                          )}>
                            {formatMessageTime(message.date)}
                          </div>
                        </div>
                        {isFromMe && <div className="w-8 shrink-0" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <div>Select a conversation to view messages</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


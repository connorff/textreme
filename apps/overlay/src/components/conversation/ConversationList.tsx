import { RefObject } from "react";
import type { UnreadConversation } from "../../types/electron";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ConversationListItem } from "./ConversationListItem";
import { getDisplayName, getLatestMessage } from "../../lib/conversationUtils";

interface ConversationListProps {
  conversations: UnreadConversation[];
  selectedIndex: number;
  onSelect: (conversation: UnreadConversation, index: number) => void;
  selectedRef: RefObject<HTMLButtonElement>;
}

export const ConversationList = ({
  conversations,
  selectedIndex,
  onSelect,
  selectedRef,
}: ConversationListProps) => {
  return (
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
                <ConversationListItem
                  key={conversation.id}
                  ref={index === selectedIndex ? selectedRef : null}
                  conversation={conversation}
                  isSelected={index === selectedIndex}
                  onClick={() => onSelect(conversation, index)}
                  getDisplayName={getDisplayName}
                  getLatestMessage={getLatestMessage}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};


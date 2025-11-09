import { forwardRef } from "react";
import type { UnreadConversation } from "../../types/electron";

interface ConversationListItemProps {
  conversation: UnreadConversation;
  isSelected: boolean;
  onClick: () => void;
  getDisplayName: (conversation: UnreadConversation) => string;
  getLatestMessage: (conversation: UnreadConversation) => string;
}

export const ConversationListItem = forwardRef<
  HTMLButtonElement,
  ConversationListItemProps
>(({ conversation, isSelected, onClick, getDisplayName, getLatestMessage }, ref) => {
  return (
    <button
      ref={ref}
      onClick={onClick}
      className={`w-full text-left p-3 rounded-lg transition-colors ${
        isSelected ? "bg-accent/50" : "hover:bg-accent/20"
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="text-sm truncate">{getDisplayName(conversation)}</div>
        {conversation.unreadCount > 0 && (
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-muted text-[10px] text-muted-foreground flex-shrink-0">
            {conversation.unreadCount > 9 ? "9+" : conversation.unreadCount}
          </span>
        )}
      </div>
      <div className="text-xs text-muted-foreground truncate">
        {getLatestMessage(conversation)}
      </div>
    </button>
  );
});

ConversationListItem.displayName = "ConversationListItem";


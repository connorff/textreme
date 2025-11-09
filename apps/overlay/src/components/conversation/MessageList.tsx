import { RefObject } from "react";
import type { ConversationMessage, UnreadConversation } from "../../types/electron";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageGroup } from "./MessageGroup";
import { groupMessagesBySender, getDisplayName } from "../../lib/conversationUtils";

interface MessageListProps {
  messages: ConversationMessage[];
  focusedConversation: UnreadConversation;
  messagesContainerRef?: RefObject<HTMLDivElement>;
  showInChatbox?: boolean;
}

export const MessageList = ({
  messages,
  focusedConversation,
  messagesContainerRef,
  showInChatbox = false,
}: MessageListProps) => {
  const groupedMessages = groupMessagesBySender(
    messages,
    focusedConversation,
    getDisplayName
  );

  if (showInChatbox) {
    // Render in chatbox without ScrollArea
    return (
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto mb-3">
        {groupedMessages.map((group, groupIdx) => (
          <MessageGroup key={groupIdx} group={group} />
        ))}
      </div>
    );
  }

  // Render in expandable area with ScrollArea
  return (
    <div className="flex-1 overflow-hidden border-b border-border">
      <ScrollArea className="h-full">
        <div className="px-3 pt-3 pb-3">
          {groupedMessages.map((group, groupIdx) => (
            <MessageGroup key={groupIdx} group={group} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};


import type { MessageGroup as MessageGroupType } from "../../lib/conversationUtils";
import { MessageBubble } from "./MessageBubble";

interface MessageGroupProps {
  group: MessageGroupType;
}

export const MessageGroup = ({ group }: MessageGroupProps) => {
  return (
    <div
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
            <MessageBubble
              key={msg.id || msgIdx}
              message={msg}
              isFromMe={group.isFromMe}
            />
          ))}
        </div>
      </div>
    </div>
  );
};


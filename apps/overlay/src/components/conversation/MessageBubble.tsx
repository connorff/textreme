import type { ConversationMessage } from "../../types/electron";

interface MessageBubbleProps {
  message: ConversationMessage;
  isFromMe: boolean;
}

export const MessageBubble = ({ message, isFromMe }: MessageBubbleProps) => {
  return (
    <div
      className={`rounded-2xl px-3 py-1.5 text-xs max-w-full break-words min-w-0 ${
        isFromMe ? "bg-blue-500 text-white" : "bg-gray-100 text-foreground"
      }`}
      style={{
        borderRadius: isFromMe
          ? "18px 4px 18px 18px"
          : "4px 18px 18px 18px",
        wordBreak: "break-word",
        overflowWrap: "anywhere",
        hyphens: "auto",
      }}
    >
      {message.text || "[No text]"}
    </div>
  );
};


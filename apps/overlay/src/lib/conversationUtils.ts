import type { UnreadConversation, ConversationMessage } from "../types/electron";

export interface MessageGroup {
  senderId: string;
  isFromMe: boolean;
  senderName: string;
  messages: ConversationMessage[];
}

export const getDisplayName = (conversation: UnreadConversation): string => {
  if (conversation.displayName) {
    return conversation.displayName;
  }
  const firstMessage = conversation.unreadMessages[0];
  if (firstMessage?.contactName) {
    return firstMessage.contactName;
  }
  return conversation.chatIdentifier || "Unknown";
};

export const getLatestMessage = (conversation: UnreadConversation): string => {
  const lastMessage =
    conversation.unreadMessages[conversation.unreadMessages.length - 1];
  const text = lastMessage?.text || "[No text]";
  return text.length > 50 ? text.substring(0, 50) + "..." : text;
};

export const groupMessagesBySender = (
  messages: ConversationMessage[],
  focusedConversation: UnreadConversation,
  getDisplayNameFn: (conversation: UnreadConversation) => string
): MessageGroup[] => {
  const groupedMessages: MessageGroup[] = [];

  messages.forEach((msg) => {
    const senderId = msg.isFromMe ? "me" : msg.handleIdentifier || "unknown";
    const senderName = msg.isFromMe
      ? "You"
      : msg.contactName ||
        focusedConversation.displayName ||
        getDisplayNameFn(focusedConversation);

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

  return groupedMessages;
};


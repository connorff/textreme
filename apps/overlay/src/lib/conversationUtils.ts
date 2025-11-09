import type { UnreadConversation, ConversationMessage } from "../types/electron";
import { formatPhoneNumber } from "./phone-utils";

export interface MessageGroup {
  senderId: string;
  isFromMe: boolean;
  senderName: string;
  messages: ConversationMessage[];
}

export const getDisplayName = (conversation: UnreadConversation): string => {
  // First, check if any message has a contact name
  for (const message of conversation.unreadMessages) {
    if (message.contactName) {
      return message.contactName;
    }
  }
  
  // Then check conversation display name
  if (conversation.displayName) {
    return conversation.displayName;
  }
  
  // Finally, format the phone number nicely
  const identifier = conversation.chatIdentifier || "Unknown";
  
  // Check if it looks like a phone number
  if (identifier.match(/^[\d+\-() ]+$/)) {
    return formatPhoneNumber(identifier);
  }
  
  return identifier;
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


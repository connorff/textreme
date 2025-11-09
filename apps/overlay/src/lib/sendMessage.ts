import type { UnreadConversation, SendMessageResult } from "../types/electron";

/**
 * Sends an iMessage to a conversation using AppleScript
 * @param conversation The conversation to send the message to
 * @param messageText The text content of the message
 * @returns A promise that resolves with the send result
 */
export async function sendMessage(
  conversation: UnreadConversation,
  messageText: string
): Promise<SendMessageResult> {
  if (!messageText.trim()) {
    return {
      success: false,
      error: "Message text cannot be empty",
    };
  }

  const recipient = conversation.chatIdentifier;
  
  console.log("[TAB MODE] sendMessage called:", {
    recipient,
    messageText: messageText.trim(),
    recipientLength: recipient?.length || 0,
    messageLength: messageText.trim().length,
    conversationGuid: conversation.guid,
  });
  
  try {
    const result = await window.electronAPI.sendIMessage(
      recipient,
      messageText.trim()
    );
    console.log("[TAB MODE] sendIMessage result:", result);
    return result;
  } catch (error) {
    console.error("Error sending message:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

/**
 * Sends an iMessage to a specific phone number or email
 * @param recipient The phone number or email address
 * @param messageText The text content of the message
 * @returns A promise that resolves with the send result
 */
export async function sendMessageToRecipient(
  recipient: string,
  messageText: string
): Promise<SendMessageResult> {
  if (!messageText.trim()) {
    return {
      success: false,
      error: "Message text cannot be empty",
    };
  }

  if (!recipient.trim()) {
    return {
      success: false,
      error: "Recipient cannot be empty",
    };
  }

  try {
    const result = await window.electronAPI.sendIMessage(
      recipient.trim(),
      messageText.trim()
    );
    return result;
  } catch (error) {
    console.error("Error sending message:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}


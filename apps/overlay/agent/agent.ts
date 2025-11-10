export interface ConversationMsg {
  isFromMe: boolean;
  text: string;
}

export interface AgentContext {
  contactName?: string;
  conversation: ConversationMsg[];
}

export function buildInstructions(ctx: AgentContext) {
  const name = ctx.contactName ?? "Recipient";
  // Format in exact training format: "{sender}: {content}"
  const transcript = ctx.conversation
    .slice(-30)
    .map((m) => {
      const sender = m.isFromMe ? "ME" : name;
      const text = m.text || "";
      // Escape newlines for JSONL format
      const escapedText = text.replace(/\n/g, '\\n');
      return `${sender}: ${escapedText}`;
    })
    .join("\n");

  return [
    "You are an AI assistant helping compose natural iMessage replies.",
    "",
    "CRITICAL INSTRUCTIONS:",
    "- Generate replies that DIRECTLY respond to the last message in the conversation",
    "- Match the user's texting style: casual tone, abbreviations, slang",
    "- NEVER use emojis in generated replies - use plain text only",
    "- NEVER use em-dashes (—) - use regular hyphens (-) or commas instead",
    "- ALWAYS write in all lowercase letters - no capital letters except for 'I'",
    "- Keep replies SHORT (typically 1-2 sentences max)",
    "- Make replies contextually relevant to what was just said",
    "- Generate diverse options: different tones (playful/serious), lengths, or approaches",
    "",
    "PROCESS:",
    "1. Analyze the conversation context and the user's request",
    "2. Call `construct_final_response` with the conversation history in training format to generate 4 candidate replies",
    "3. After receiving the candidates, call `predict_recipient_responses` to predict how the recipient would respond to each option",
    "4. The conversation history is already formatted in training format (index, sender, [text], content)",
    "",
    "Recent conversation:",
    transcript,
  ].join("\n");
}

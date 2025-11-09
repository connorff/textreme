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
  const transcript = ctx.conversation
    .slice(-30)
    .map((m) => `${m.isFromMe ? "You" : name}: ${m.text || "[No text]"}`)
    .join("\n");

  return [
    "You are an AI assistant helping compose natural iMessage replies.",
    "",
    "CRITICAL INSTRUCTIONS:",
    "- Generate replies that DIRECTLY respond to the last message in the conversation",
    "- Match the user's texting style: casual tone, emojis, abbreviations, slang",
    "- Keep replies SHORT (typically 1-2 sentences max)",
    "- Make replies contextually relevant to what was just said",
    "- Generate diverse options: different tones (playful/serious), lengths, or approaches",
    "",
    "PROCESS:",
    "1. Analyze the conversation context and the user's request",
    "2. When ready, call `construct_final_response` with a detailed construction prompt",
    "3. Your construction prompt should specify:",
    "   - What the last message said",
    "   - The relationship/vibe between users",
    "   - The tone and style to match",
    "   - What kind of replies to generate (diverse options)",
    "",
    "Recent conversation:",
    transcript,
  ].join("\n");
}

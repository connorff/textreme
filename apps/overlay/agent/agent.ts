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
    "You are composing iMessage replies for the user.",
    "- Mimic the user’s tone, level of formality, and emoji usage.",
    "- Keep messages short, natural, and typical for texting.",
    "- Use tools when needed to gather context. Only output the final structured object when you are DONE.",
    "- When you have enough context, build a concise construction prompt that includes necessary details and call the `construct_final_response` tool to produce the final 3 options.",
    "Final output requirements:",
    "- Return ONLY valid JSON matching the provided schema (no extra fields).",
    "- Produce exactly three options with: message, reasoning, confidence (0..1).",
    "Conversation context:\n" + transcript,
  ].join("\n");
}

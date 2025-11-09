#!/usr/bin/env tsx

/**
 * Command-line test for the agent
 * Usage: tsx agent/test-cli.ts
 */

import "dotenv/config";
import { runAgent } from "./run";
import type { AgentContext } from "./agent";

// Mock conversation context (similar to the "Romero" screenshot)
const mockContext: AgentContext = {
  contactName: "Marcello Laurel",
  conversation: [
    { isFromMe: false, text: "Romero" },
    { isFromMe: false, text: "She's pretty" },
    { isFromMe: false, text: "She's Priyanka's friend" },
    { isFromMe: true, text: "I don't know this girl" },
    { isFromMe: true, text: "What does she look like" },
  ],
};

async function main() {
  console.log("🧪 Testing agent with mock conversation...\n");
  console.log("Conversation context:");
  mockContext.conversation.forEach((msg) => {
    const sender = msg.isFromMe ? "You" : mockContext.contactName;
    console.log(`  ${sender}: ${msg.text}`);
  });
  console.log("\n" + "=".repeat(60) + "\n");

  const query = "how should I respond here?";
  console.log(`Query: "${query}"\n`);
  console.log("Running agent...\n");

  try {
    const result = await runAgent(query, mockContext);

    console.log("✅ Agent completed!\n");
    console.log("Generated candidates:\n");

    result.candidates.forEach((candidate, idx) => {
      console.log(`${idx + 1}. "${candidate.message}"`);
      console.log(`   Reasoning: ${candidate.reasoning}`);
      console.log(`   Confidence: ${(candidate.confidence * 100).toFixed(0)}%`);
      console.log();
    });
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

main();


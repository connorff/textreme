import "dotenv/config";
import { runAgentStream } from "./run";
import { getToolInvocationMetrics } from "./tools";
import type { AgentContext } from "./agent";

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("ERROR: OPENAI_API_KEY is not set in environment.");
    process.exit(1);
  }

  const context: AgentContext = {
    contactName: "John",
    conversation: [
      { isFromMe: false, text: "Hey, can we meet tomorrow?" },
      { isFromMe: true, text: "Sure, what time works?" },
      { isFromMe: false, text: "How about 2pm?" },
    ],
  };

  const prompt = "Confirm the meeting and ask for location.";

  const result = await runAgentStream(prompt, context);
  const DEBUG = process.env.TEXTREME_AGENT_DEBUG === "1";

  // Stream all events including reasoning and tool calls
  if (DEBUG) {
    console.log("\n[stream] === Streaming all events ===\n");
    for await (const event of result.fullStream) {
      if (event.type === "text-delta") {
        process.stdout.write(event.textDelta);
      } else if (event.type === "tool-call") {
        console.log(
          `\n[stream] 🔧 Tool call: ${event.toolName} with args:`,
          JSON.stringify(event.args, null, 2)
        );
      } else if (event.type === "tool-result") {
        console.log(
          `[stream] ✅ Tool result for ${event.toolName}:`,
          JSON.stringify(event.result, null, 2).slice(0, 200) + "..."
        );
      } else if (event.type === "finish") {
        console.log(`\n[stream] 🏁 Finish reason: ${event.finishReason}`);
        console.log(`[stream] Usage:`, event.usage);
      }
    }
    console.log("\n[stream] === End of stream ===\n");
  }

  // Final structured object
  const final = await result.getFinalOutput();
  console.log(JSON.stringify(final, null, 2));
  if (DEBUG) {
    console.log("[metrics] tool invocations:", getToolInvocationMetrics());
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

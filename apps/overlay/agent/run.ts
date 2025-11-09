import { streamText, generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { type AgentOutput, AgentOutput as AgentOutputSchema } from "./types";
import { buildInstructions, type AgentContext } from "./agent";
import { tools, getLastToolResult } from "./tools";

export async function runAgent(
  input: string,
  context: AgentContext
): Promise<AgentOutput> {
  const DEBUG = process.env.TEXTREME_AGENT_DEBUG === "1";
  const system = buildInstructions(context);
  if (DEBUG) {
    console.log("[orchestrator] runAgent start");
    console.log(
      "[orchestrator] model=openai:gpt-5-mini maxSteps=8 (reasoning enabled)"
    );
    console.log(
      `[orchestrator] system preview="${system.slice(0, 200).replace(/\n/g, " ")}"...`
    );
  }
  const result = await generateText({
    model: openai("gpt-5-mini"),
    system,
    prompt: input,
    tools,
    maxSteps: 8,
    temperature: 1,
  });
  if (DEBUG) {
    console.log("[orchestrator] runAgent complete, parsing output");
    console.log("[orchestrator] final text:", result.text.slice(0, 200));
    console.log(
      "[orchestrator] tool results:",
      result.toolResults?.length || 0
    );
  }

  // Extract final output: either from text or from tool result
  let parsed: unknown;
  if (result.text && result.text.trim()) {
    parsed = JSON.parse(result.text);
  } else if (result.toolResults && result.toolResults.length > 0) {
    // Extract from the last tool result (should be construct_final_response)
    const lastToolResult = result.toolResults[result.toolResults.length - 1];
    parsed = lastToolResult.result;
  } else {
    // Fallback: get from tool's stored result
    const lastToolResult = getLastToolResult();
    if (lastToolResult) {
      parsed = lastToolResult;
    } else {
      throw new Error("No output found in text or tool results");
    }
  }

  const validated = AgentOutputSchema.parse(parsed);
  return validated;
}

export async function runAgentStream(input: string, context: AgentContext) {
  const DEBUG = process.env.TEXTREME_AGENT_DEBUG === "1";
  const system = buildInstructions(context);
  if (DEBUG) {
    console.log("[orchestrator] runAgentStream start");
    console.log(
      "[orchestrator] model=openai:gpt-5-mini maxSteps=8 (reasoning enabled)"
    );
    console.log(
      `[orchestrator] system preview="${system.slice(0, 200).replace(/\n/g, " ")}"...`
    );
  }
  const result = await streamText({
    model: openai("gpt-5-mini"),
    system,
    prompt: input,
    tools,
    maxSteps: 8,
    temperature: 1,
  });

  // Shared state for collecting tool results (can be accessed by whoever consumes the stream)
  const sharedState = {
    toolResults: [] as Array<{ toolName: string; result: unknown }>,
    finalText: "",
  };

  // Create a wrapper stream that collects data as it's consumed
  const wrappedStream = (async function* () {
    for await (const event of result.fullStream) {
      if (
        DEBUG &&
        (event.type === "tool-result" || event.type === "tool-call")
      ) {
        console.log(
          `[orchestrator] Stream event: ${event.type}`,
          event.type === "tool-result" ? `toolName: ${event.toolName}` : ""
        );
      }
      if (event.type === "text-delta") {
        sharedState.finalText += event.textDelta;
      } else if (event.type === "tool-result") {
        if (DEBUG) {
          console.log(
            "[orchestrator] Capturing tool-result event:",
            event.toolName,
            typeof event.result
          );
        }
        sharedState.toolResults.push({
          toolName: event.toolName,
          result: event.result,
        });
      }
      yield event;
    }
  })();

  // Return a wrapper that provides the text stream and parsed final output
  return {
    textStream: result.textStream,
    fullStream: wrappedStream,
    async getFinalOutput(): Promise<AgentOutput> {
      // Wait for stream to complete and final text
      const finalText = await result.text;

      // Tool results should be available after stream completes
      // Access via the result object's toolResults property
      const toolResultsFromResult =
        "toolResults" in result
          ? (result as { toolResults?: Array<{ result: unknown }> }).toolResults
          : undefined;

      if (DEBUG) {
        console.log("[orchestrator] runAgentStream complete, parsing output");
        console.log(
          "[orchestrator] final text from result:",
          finalText?.slice(0, 200) || "(empty)"
        );
        console.log(
          "[orchestrator] final text from stream:",
          sharedState.finalText?.slice(0, 200) || "(empty)"
        );
        console.log(
          "[orchestrator] tool results from stream:",
          sharedState.toolResults.length
        );
        console.log(
          "[orchestrator] tool results from result:",
          toolResultsFromResult?.length || 0
        );
        if (toolResultsFromResult && toolResultsFromResult.length > 0) {
          console.log(
            "[orchestrator] last tool result from result:",
            JSON.stringify(
              toolResultsFromResult[toolResultsFromResult.length - 1].result
            ).slice(0, 200)
          );
        }
      }

      // Extract final output: prioritize tool results over text (tool results are already validated)
      let parsed: unknown;

      // First try tool results from stream (most reliable)
      if (sharedState.toolResults.length > 0) {
        const lastToolResult =
          sharedState.toolResults[sharedState.toolResults.length - 1];
        parsed = lastToolResult.result;
        if (DEBUG) {
          console.log("[orchestrator] Using tool result from stream");
        }
      } else if (toolResultsFromResult && toolResultsFromResult.length > 0) {
        // Extract from the last tool result from result object
        const lastToolResult =
          toolResultsFromResult[toolResultsFromResult.length - 1];
        parsed = lastToolResult.result;
        if (DEBUG) {
          console.log("[orchestrator] Using tool result from result object");
        }
      } else {
        // Fallback: get from tool's stored result
        const lastToolResult = getLastToolResult();
        if (lastToolResult) {
          parsed = lastToolResult;
          if (DEBUG) {
            console.log(
              "[orchestrator] Using tool result from getLastToolResult"
            );
          }
        } else {
          // Last resort: try parsing text
          const textToParse = finalText || sharedState.finalText;
          if (textToParse && textToParse.trim()) {
            try {
              parsed = JSON.parse(textToParse);
              if (DEBUG) {
                console.log("[orchestrator] Using parsed text output");
              }
            } catch (e) {
              if (DEBUG) {
                console.log("[orchestrator] Failed to parse text");
              }
            }
          }
        }
      }

      if (!parsed) {
        if (DEBUG) {
          console.log("[orchestrator] All extraction methods failed");
        }
        throw new Error("No output found in text or tool results");
      }

      // Validate the parsed result
      try {
        const validated = AgentOutputSchema.parse(parsed);
        return validated;
      } catch (validationError) {
        if (DEBUG) {
          console.log(
            "[orchestrator] Validation failed, trying tool result fallback"
          );
          console.log(
            "[orchestrator] Parsed structure:",
            JSON.stringify(parsed).slice(0, 200)
          );
        }
        // If validation fails, try tool result as fallback
        const lastToolResult = getLastToolResult();
        if (lastToolResult) {
          return lastToolResult;
        }
        throw validationError;
      }
    },
  };
}

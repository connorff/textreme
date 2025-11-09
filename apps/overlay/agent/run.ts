import { streamText, generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { type AgentOutput, AgentOutput as AgentOutputSchema } from "./types";
import { buildInstructions, type AgentContext } from "./agent";
import { tools, getLastToolResult } from "./tools";
import { getAgentModelConfig } from "./config";

const MODEL_CONFIG = getAgentModelConfig();
const AGENT_MODEL = openai(MODEL_CONFIG.model);
const AGENT_TEMPERATURE = MODEL_CONFIG.temperature;

export async function runAgent(
  input: string,
  context: AgentContext
): Promise<AgentOutput> {
  const DEBUG = process.env.TEXTREME_AGENT_DEBUG === "1";
  const system = buildInstructions(context);
  // Allow maxSteps to be configured via environment variable (default: 3 for construct + predict)
  const maxSteps = process.env.TEXTREME_AGENT_MAX_STEPS
    ? parseInt(process.env.TEXTREME_AGENT_MAX_STEPS, 10)
    : 3;
  if (DEBUG) {
    console.log("[orchestrator] runAgent start");
    console.log(
      `[orchestrator] model=openai:${MODEL_CONFIG.model} temperature=${AGENT_TEMPERATURE} maxSteps=${maxSteps} (reasoning enabled)`
    );
    console.log(
      `[orchestrator] system preview="${system.slice(0, 200).replace(/\n/g, " ")}"...`
    );
  }
  
  const result = await generateText({
    model: AGENT_MODEL,
    system,
    prompt: input,
    tools,
    maxSteps,
    temperature: AGENT_TEMPERATURE,
  });
  if (DEBUG) {
    console.log("[orchestrator] runAgent complete, parsing output");
    console.log("[orchestrator] final text:", result.text.slice(0, 200));
    console.log(
      "[orchestrator] tool results:",
      result.toolResults?.length || 0
    );
  }

  // Extract final output: prioritize tool results over text
  let parsed: unknown;
  
  // First, try to get from tool results (preferred)
  if (result.toolResults && result.toolResults.length > 0) {
    const lastToolResult = result.toolResults[result.toolResults.length - 1];
    if (DEBUG) {
      console.log("[orchestrator] Using tool result from:", lastToolResult.toolName);
    }
    parsed = lastToolResult.result;
  } 
  // Fallback: try stored tool result
  else {
    const lastToolResult = getLastToolResult();
    if (lastToolResult) {
      if (DEBUG) {
        console.log("[orchestrator] Using stored tool result");
      }
      parsed = lastToolResult;
    } 
    // Last resort: try parsing text as JSON (but this should rarely happen)
    else if (result.text && result.text.trim()) {
      if (DEBUG) {
        console.log("[orchestrator] Attempting to parse text as JSON (fallback)");
      }
      try {
        parsed = JSON.parse(result.text);
      } catch (e) {
        throw new Error(`No tool result found and text is not valid JSON: ${result.text.slice(0, 100)}`);
      }
    } else {
      throw new Error("No output found in tool results or text");
    }
  }

  const validated = AgentOutputSchema.parse(parsed);
  return validated;
}

export async function runAgentStream(input: string, context: AgentContext) {
  const DEBUG = process.env.TEXTREME_AGENT_DEBUG === "1";
  // Fast mode is now DEFAULT for maximum speed
  // Set TEXTREME_AGENT_SLOW_MODE=1 to use orchestrator
  const SLOW_MODE = process.env.TEXTREME_AGENT_SLOW_MODE === "1";
  
  // Fast mode: bypass orchestrator and directly call the tool (DEFAULT)
  if (!SLOW_MODE) {
    if (DEBUG) {
      console.log("[orchestrator] Fast mode enabled - bypassing orchestrator");
    }
    
    // Build a minimal prompt for maximum speed
    const name = context.contactName ?? "Recipient";
    // Use last 30 messages for context (same as training)
    const lastMessages = context.conversation.slice(-30);
    
    // Format in exact training format: "{sender}: {content}"
    const conversationContext = lastMessages
      .map((m) => {
        const sender = m.isFromMe ? "ME" : name;
        const text = m.text || "";
        // Escape newlines for JSONL format
        const escapedText = text.replace(/\n/g, '\\n');
        return `${sender}: ${escapedText}`;
      })
      .join("\n");
    
    // Use the conversation context directly as the construction prompt
    // The Modal endpoint will generate the next message from "ME"
    const constructionPrompt = conversationContext;

    // Directly call the tools
    const { construct_final_response, predict_recipient_responses } = await import("./tools");
    const constructResult = await construct_final_response.execute({ constructionPrompt });
    
    // Call prediction tool with the candidates
    const finalResult = await predict_recipient_responses.execute({
      candidates: constructResult.candidates.map(c => ({
        message: c.message,
        reasoning: c.reasoning,
        confidence: c.confidence,
      })),
      conversationContext,
      recipientName: name,
    });
    
    // Return a mock stream that immediately yields the result
    // Match the stream format expected by the frontend
    return {
      textStream: (async function* () {
        // Empty text stream for fast mode
      })(),
      fullStream: (async function* () {
        // Emit tool call event for construct
        yield {
          type: "tool-call" as const,
          toolName: "construct_final_response",
          args: { constructionPrompt },
        };
        // Emit tool result event for construct
        yield {
          type: "tool-result" as const,
          toolName: "construct_final_response",
          result: constructResult,
        };
        // Emit tool call event for predict
        yield {
          type: "tool-call" as const,
          toolName: "predict_recipient_responses",
          args: {
            candidates: constructResult.candidates,
            conversationContext,
            recipientName: name,
          },
        };
        // Emit tool result event for predict
        yield {
          type: "tool-result" as const,
          toolName: "predict_recipient_responses",
          result: finalResult,
        };
        // Emit finish event
        yield {
          type: "finish" as const,
          finishReason: "stop",
        };
      })(),
      async getFinalOutput(): Promise<AgentOutput> {
        return finalResult;
      },
    };
  }
  
  // Normal mode: use orchestrator
  const system = buildInstructions(context);
  // Allow maxSteps to be configured via environment variable (default: 3 for construct + predict)
  const maxSteps = process.env.TEXTREME_AGENT_MAX_STEPS
    ? parseInt(process.env.TEXTREME_AGENT_MAX_STEPS, 10)
    : 3;
  if (DEBUG) {
    console.log("[orchestrator] runAgentStream start");
    console.log(
      `[orchestrator] model=openai:${MODEL_CONFIG.model} temperature=${AGENT_TEMPERATURE} maxSteps=${maxSteps} (reasoning enabled)`
    );
    console.log(
      `[orchestrator] system preview="${system.slice(0, 200).replace(/\n/g, " ")}"...`
    );
  }
  
  const result = await streamText({
    model: AGENT_MODEL,
    system,
    prompt: input,
    tools,
    maxSteps,
    temperature: AGENT_TEMPERATURE,
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
          ? (
              result as unknown as {
                toolResults?: Array<{ result: unknown }>;
              }
            ).toolResults
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

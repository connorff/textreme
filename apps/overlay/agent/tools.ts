import { tool, generateObject } from "ai";
import { z } from "zod";
import { openai } from "@ai-sdk/openai";
import { AgentOutput, AgentOutput as AgentOutputSchema } from "./types";
import { getAgentModelConfig } from "./config";

const MODEL_CONFIG = getAgentModelConfig();
const CONSTRUCTOR_MODEL = openai(MODEL_CONFIG.model);
const CONSTRUCTOR_TEMPERATURE = MODEL_CONFIG.temperature;

let constructToolInvocations = 0;
let lastToolResult: AgentOutput | null = null;

/**
 * construct_final_response
 * The orchestrator builds a concise construction prompt containing the
 * relevant context and then calls this tool to produce exactly k=4
 * candidate responses in structured form.
 */
export const construct_final_response = tool({
  description:
    "Given a constructionPrompt that contains context and guidance, synthesize exactly four candidate iMessage replies.",
  parameters: z.object({
    constructionPrompt: z
      .string()
      .describe(
        "A concise prompt containing context and guidance to produce four replies."
      ),
    k: z
      .literal(4)
      .default(4)
      .describe("Number of candidates to produce; fixed at 4."),
  }),
  async execute({
    constructionPrompt,
  }: {
    constructionPrompt: string;
    k?: 4;
  }): Promise<AgentOutput> {
    const DEBUG = process.env.TEXTREME_AGENT_DEBUG === "1";
    constructToolInvocations += 1;
    if (DEBUG) {
      const preview = constructionPrompt.slice(0, 200).replace(/\n/g, " ");
      console.log(
        `[tools] construct_final_response called (count=${constructToolInvocations})`
      );
      console.log(
        `[tools] model=openai:${MODEL_CONFIG.model} temperature=${CONSTRUCTOR_TEMPERATURE}`
      );
      console.log(`[tools] prompt preview: "${preview}"...`);
    }
    try {
      const { object } = await generateObject({
        model: CONSTRUCTOR_MODEL,
        schema: AgentOutputSchema,
        system: [
          "You generate natural iMessage reply options.",
          "Create exactly 4 diverse candidates that:",
          "- Directly respond to what was said",
          "- Match the specified tone and style",
          "- Are short and natural (like real texts)",
          "- Vary in approach/tone/length",
          "",
          "CRITICAL: DO NOT include emojis in the message text. Generate plain text only.",
          "",
          "For each candidate provide:",
          "- message: The actual text to send (NO EMOJIS)",
          "- reasoning: Brief explanation of the approach/tone",
          "- confidence: Float 0-1 (how appropriate this reply is)",
        ].join("\n"),
        prompt: constructionPrompt,
        temperature: CONSTRUCTOR_TEMPERATURE,
      });
      if (DEBUG) {
        console.log(
          `[tools] construct_final_response produced ${object.candidates.length} candidates`
        );
        console.log(
          `[tools] Storing result, first candidate:`,
          object.candidates[0]?.message?.slice(0, 50)
        );
      }
      lastToolResult = object;
      return object;
    } catch (error) {
      if (DEBUG) {
        console.error(`[tools] construct_final_response error:`, error);
      }
      throw error;
    }
  },
});

export const tools = {
  construct_final_response,
} as const;
export type Tools = typeof tools;

export function getToolInvocationMetrics() {
  return {
    construct_final_response: constructToolInvocations,
    total: constructToolInvocations,
  };
}

export function getLastToolResult(): AgentOutput | null {
  return lastToolResult;
}

import { tool, generateObject, generateText } from "ai";
import { z } from "zod";
import { openai } from "@ai-sdk/openai";
import { AgentOutput, AgentOutput as AgentOutputSchema } from "./types";
import { getAgentModelConfig } from "./config";

const MODEL_CONFIG = getAgentModelConfig();
const CONSTRUCTOR_MODEL = openai(MODEL_CONFIG.model);
const CONSTRUCTOR_TEMPERATURE = MODEL_CONFIG.temperature;

// Model for predicting responses (using 4o-mini for now)
const PREDICTION_MODEL = openai("gpt-4o-mini");

let constructToolInvocations = 0;
let predictToolInvocations = 0;
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
      // Optimized system prompt for faster generation
      const { object } = await generateObject({
        model: CONSTRUCTOR_MODEL,
        schema: AgentOutputSchema,
        system: [
          "Generate 4 short iMessage replies. Lowercase, no emojis, no em-dashes.",
          "Vary tone. Each: message (text), reasoning (brief), confidence (0-1).",
        ].join("\n"),
        prompt: constructionPrompt,
        temperature: CONSTRUCTOR_TEMPERATURE,
        // Reduce maxTokens for faster generation (responses are short anyway)
        maxTokens: 200,
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

/**
 * predict_recipient_responses
 * Takes the 4 candidate messages and predicts how the recipient would respond to each.
 * Returns a complete AgentOutput with predictions included.
 */
export const predict_recipient_responses = tool({
  description:
    "Predict how the recipient would respond to each of the 4 candidate messages based on conversation context and their communication style. Returns the complete output with predictions.",
  parameters: z.object({
    candidates: z
      .array(
        z.object({
          message: z.string().describe("The candidate message text"),
          reasoning: z.string().describe("Reasoning for this candidate"),
          confidence: z.number().describe("Confidence score"),
        })
      )
      .length(4)
      .describe("The 4 candidate messages to predict responses for"),
    conversationContext: z
      .string()
      .describe(
        "Brief context about the conversation and recipient's communication style"
      ),
    recipientName: z
      .string()
      .optional()
      .describe("Name of the recipient if known"),
  }),
  async execute({
    candidates,
    conversationContext,
    recipientName,
  }: {
    candidates: Array<{
      message: string;
      reasoning: string;
      confidence: number;
    }>;
    conversationContext: string;
    recipientName?: string;
  }): Promise<AgentOutput> {
    const DEBUG = process.env.TEXTREME_AGENT_DEBUG === "1";
    predictToolInvocations += 1;

    if (DEBUG) {
      console.log(
        `[tools] predict_recipient_responses called (count=${predictToolInvocations})`
      );
      console.log(
        `[tools] Predicting responses for ${candidates.length} candidates`
      );
    }

    try {
      const predictions: string[] = [];
      const name = recipientName || "the recipient";

      // Predict response for each candidate
      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];

        const prompt = [
          `You are predicting how ${name} would respond to a message.`,
          "",
          "Context:",
          conversationContext,
          "",
          `If you send: "${candidate.message}"`,
          "",
          `Predict a realistic, natural response from ${name}. Keep it SHORT (1-2 sentences).`,
          "Match their texting style from the conversation context.",
          "IMPORTANT: Use all lowercase, no emojis, no em-dashes.",
        ].join("\n");

        const { text } = await generateText({
          model: PREDICTION_MODEL,
          prompt,
          temperature: 0.7,
          maxTokens: 100,
        });

        const finalText = text.trim();
        predictions.push(finalText);

        if (DEBUG) {
          console.log(
            `[tools] Predicted response ${i + 1}: "${finalText.slice(0, 50)}..."`
          );
        }
      }

      // Merge predictions into candidates
      const candidatesWithPredictions = candidates.map((candidate, i) => ({
        message: candidate.message,
        reasoning: candidate.reasoning,
        confidence: candidate.confidence,
        predictedResponse: predictions[i],
      }));

      const output: AgentOutput = {
        candidates: candidatesWithPredictions,
      };

      // Store as last result
      lastToolResult = output;

      if (DEBUG) {
        console.log(
          `[tools] predict_recipient_responses completed, stored result with predictions`
        );
      }

      return output;
    } catch (error) {
      if (DEBUG) {
        console.error(`[tools] predict_recipient_responses error:`, error);
      }
      // Return candidates without predictions on error
      const output: AgentOutput = {
        candidates: candidates.map((candidate) => ({
          message: candidate.message,
          reasoning: candidate.reasoning,
          confidence: candidate.confidence,
          predictedResponse: "[Unable to predict response]",
        })),
      };
      lastToolResult = output;
      return output;
    }
  },
});

export const tools = {
  construct_final_response,
  predict_recipient_responses,
} as const;
export type Tools = typeof tools;

export function getToolInvocationMetrics() {
  return {
    construct_final_response: constructToolInvocations,
    predict_recipient_responses: predictToolInvocations,
    total: constructToolInvocations + predictToolInvocations,
  };
}

export function getLastToolResult(): AgentOutput | null {
  return lastToolResult;
}

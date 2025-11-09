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
 * Uses Modal endpoint to generate exactly k=4 candidate responses.
 * Calls the endpoint with 4 different temperatures for diversity.
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
      console.log(`[tools] Using Modal endpoint for generation`);
      console.log(`[tools] prompt preview: "${preview}"...`);
    }
    try {
      // Modal endpoint configuration (same as tab completion)
      const MODAL_ENDPOINT = "https://connorff--textreme-inference-web-dev.modal.run";
      const RUN_NAME = process.env.TEXTREME_MODEL_RUN_NAME || "textreme-2025-11-09-14-13-20-fe40";
      
      // Use 4 different temperatures for diversity
      const TEMPERATURES = [0.6, 0.8, 1.0, 1.2];
      
      // The constructionPrompt already contains the formatted conversation context
      // Make 4 parallel requests with different temperatures
      const requests = TEMPERATURES.map(async (temperature, idx) => {
        const params = new URLSearchParams({
          run_name: RUN_NAME,
          temperature: temperature.toString(),
          sender: "ME",
          input: constructionPrompt,
        });

        const url = `${MODAL_ENDPOINT}?${params.toString()}`;
        
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': 'text/plain',
          },
        });

        if (!response.ok) {
          throw new Error(`Modal API returned ${response.status}: ${response.statusText}`);
        }

        const text = await response.text();
        
        // Parse response: should be in format "[text] {content}"
        const match = text.match(/\[text\]\s*(.*?)(?:%|$)/);
        const message = match && match[1] ? match[1].trim() : text.trim();
        
        return {
          message: message,
          reasoning: `Generated with temperature ${temperature}`,
          confidence: 1.0 - (idx * 0.1), // decreasing confidence for higher temps
        };
      });
      
      const candidates = await Promise.all(requests);
      
      const object: AgentOutput = { candidates };
      
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
 * Uses the same Modal endpoint as tab completion for consistency.
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
      const name = recipientName || "Contact";

      // Modal endpoint configuration (same as tab completion)
      const MODAL_ENDPOINT = "https://connorff--textreme-inference-web-dev.modal.run";
      const RUN_NAME = process.env.TEXTREME_MODEL_RUN_NAME || "textreme-2025-11-09-14-13-20-fe40";

      // Predict response for each candidate using Modal endpoint
      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];

        // Use the conversationContext as input (already formatted) and add the ME response
        const input = `${conversationContext}\n${conversationContext.split('\n').length} ME: [text] ${candidate.message}`;
        
        const params = new URLSearchParams({
          run_name: RUN_NAME,
          temperature: "0.8",
          sender: name,
          input: input,
        });

        const url = `${MODAL_ENDPOINT}?${params.toString()}`;
        
        try {
          const response = await fetch(url, {
            method: 'GET',
            headers: {
              'Accept': 'text/plain',
            },
          });

          if (!response.ok) {
            throw new Error(`Modal API returned ${response.status}`);
          }

          const text = await response.text();
          
          // Parse response: should be in format "[text] {content}"
          const match = text.match(/\[text\]\s*(.*?)(?:%|$)/);
          const prediction = match && match[1] ? match[1].trim() : text.trim();
          
          predictions.push(prediction);

          if (DEBUG) {
            console.log(
              `[tools] Predicted response ${i + 1}: "${prediction.slice(0, 50)}..."`
            );
          }
        } catch (error) {
          if (DEBUG) {
            console.error(`[tools] Modal prediction error for candidate ${i + 1}:`, error);
          }
          // Use a fallback prediction on error
          predictions.push("[Prediction unavailable]");
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

import { z } from "zod";

export const Candidate = z.object({
  message: z.string(),
  reasoning: z.string(),
  confidence: z.number().min(0).max(1),
  predictedResponse: z.string().optional(),
});

export const AgentOutput = z.object({
  candidates: z.array(Candidate).length(4),
});

export type Candidate = z.infer<typeof Candidate>;
export type AgentOutput = z.infer<typeof AgentOutput>;

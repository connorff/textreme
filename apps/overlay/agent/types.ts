import { z } from 'zod';

export const Candidate = z.object({
	message: z.string(),
	reasoning: z.string(),
	confidence: z.number().min(0).max(1),
});

export const AgentOutput = z.object({
	candidates: z.array(Candidate).length(3),
});

export type Candidate = z.infer<typeof Candidate>;
export type AgentOutput = z.infer<typeof AgentOutput>;



// Default to faster model for better performance
// gpt-4o-mini is faster and cheaper than gpt-5-mini
const DEFAULT_MODEL = "gpt-4o-mini";

function resolveModelId(): string {
  const raw = process.env.TEXTREME_AGENT_MODEL
    ? process.env.TEXTREME_AGENT_MODEL.trim()
    : "";
  return raw.length > 0 ? raw : DEFAULT_MODEL;
}

function resolveTemperature(isGpt5: boolean): number {
  if (isGpt5) {
    return 1;
  }
  const rawTemp = process.env.TEXTREME_AGENT_TEMPERATURE
    ? Number(process.env.TEXTREME_AGENT_TEMPERATURE)
    : NaN;
  if (Number.isFinite(rawTemp)) {
    return rawTemp;
  }
  // Lower temperature (0.7) for faster, more deterministic generation
  return 0.7;
}

export function getAgentModelConfig() {
  const model = resolveModelId();
  const isGpt5 = model.startsWith("gpt-5");
  const temperature = resolveTemperature(isGpt5);
  return {
    model,
    temperature,
    isGpt5,
  };
}

export type AgentModelConfig = ReturnType<typeof getAgentModelConfig>;


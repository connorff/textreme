# Overlay Agent usage (Vercel AI SDK)

## Environment

Set `OPENAI_API_KEY` in your environment before running the agent:

```bash
export OPENAI_API_KEY=sk-...
```

You can also create an `.env` in `apps/overlay/` if your shell loads it.

## Demo script

Install dependencies and run the demo stream (uses Vercel AI SDK structured outputs):

```bash
pnpm -w i
cd apps/overlay
pnpm agent:demo
```

The script:
- streams partial structured objects via `streamObject` (Vercel AI SDK standard),
- validates against Zod schema,
- prints the final structured output containing exactly three candidate messages (message, reasoning, confidence).



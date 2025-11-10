# Overlay Agent usage (Vercel AI SDK)

## Environment

Set `OPENAI_API_KEY` in your environment before running the agent:

```bash
export OPENAI_API_KEY=sk-...
```

### Modal Model Configuration (Autocomplete)

The autocomplete feature uses a custom Modal endpoint. Deploy the Modal inference server with:

```bash
cd ml
modal deploy -m deploy.inference_vllm --env MODAL_RUN_NAME=textreme-2025-11-09-14-13-20-fe40
```

The model checkpoint is configured at deployment time via the `MODAL_RUN_NAME` environment variable.

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



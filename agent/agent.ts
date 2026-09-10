import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { defineAgent, defineDynamic } from "eve";

// Direct provider instead of the AI Gateway default -- no Vercel account
// needed. NVIDIA's NIM endpoint (OpenAI-compatible) with deepseek-v4-pro,
// the same model projectionbench's LLM judge uses -- Gemini free tier was
// unreliable (rate limits, one model that hung indefinitely) throughout
// this project, deepseek-v4-pro was not.
const nvidia = createOpenAICompatible({
  name: "nvidia",
  baseURL: "https://integrate.api.nvidia.com/v1",
  apiKey: process.env.NVIDIA_API_KEY,
});

const model = nvidia("deepseek-ai/deepseek-v4-pro-0813");

export default defineAgent({
  // A custom/unlisted model has no AI Gateway context-window metadata for
  // eve's compaction to resolve automatically, so it must be supplied here
  // (only settable through the dynamic selection object, not as a plain
  // static sibling field on `model`).
  model: defineDynamic({
    events: {
      "step.started": () => ({ model, modelContextWindowTokens: 128000 }),
    },
  }),
});

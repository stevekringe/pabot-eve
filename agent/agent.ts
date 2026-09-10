import { google } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { defineAgent, defineDynamic } from "eve";

// Provider toggle via env:
//
//   MODEL_PROVIDER=nvidia  -> NVIDIA NIM directly (default, confirmed working).
//                             Needs NVIDIA_API_KEY. Override model with NVIDIA_MODEL.
//   MODEL_PROVIDER=google  -> Google Generative AI directly.
//                             Needs GOOGLE_GENERATIVE_AI_API_KEY. Override with GOOGLE_MODEL.
//   MODEL_PROVIDER=vercel  -> Vercel AI Gateway with a gateway model id string.
//                             No provider key needed; auth is VERCEL_OIDC_TOKEN from
//                             `eve link`. Override with VERCEL_MODEL.
//                             NOTE: the Gateway returns 403 customer_verification_required
//                             until the Vercel account has a card on file (even for free
//                             credits). Flip back to nvidia/google until that's done.
//
// Set it in the shell for local dev, or as a Vercel project env var for deploys.
type ModelProvider = "vercel" | "nvidia" | "google";

function getProvider(): ModelProvider {
  const raw = (process.env.MODEL_PROVIDER ?? "nvidia").trim().toLowerCase();
  if (raw === "vercel" || raw === "nvidia" || raw === "google") return raw;
  console.warn(
    `[agent] Unknown MODEL_PROVIDER=${JSON.stringify(raw)}, falling back to "nvidia".`,
  );
  return "nvidia";
}

const nvidia = createOpenAICompatible({
  name: "nvidia",
  baseURL: "https://integrate.api.nvidia.com/v1",
  apiKey: process.env.NVIDIA_API_KEY,
});

export default defineAgent({
  // Must resolve via step.started (not session/turn) because nvidia/google
  // return live LanguageModel objects while vercel returns a gateway id
  // string -- only step.started may return live objects.
  model: defineDynamic({
    events: {
      "step.started": () => {
        const provider = getProvider();
        if (provider === "vercel") {
          return {
            model:
              process.env.VERCEL_MODEL ?? "openai/gpt-5.6-luna-fast",
          };
        }
        if (provider === "google") {
          return {
            model: google(
              process.env.GOOGLE_MODEL ?? "gemini-2.5-flash",
            ),
          };
        }
        // nvidia (default): custom/unlisted model, so eve's compaction can't
        // resolve its context window from the Gateway catalog -- supply it here.
        return {
          model: nvidia(
            process.env.NVIDIA_MODEL ?? "deepseek-ai/deepseek-v4-pro-0813",
          ),
          modelContextWindowTokens: 128000,
        };
      },
    },
  }),
});

import { defineTool } from "eve/tools";
import { z } from "zod";

// Ported from pabot/src/score.js -- same rubric, same heuristics.
const EMOTIONS = [
  "angry", "anger", "frustrated", "frustration", "upset", "agitated",
  "tense", "hostile", "hostility", "worked up", "rage", "furious",
  "irritated", "heated",
];

const CALM_WORDS = [
  "calm", "compose", "composure", "settle down", "relax", "breathe",
  "breath", "unclench", "dial back", "lower your voice", "take a moment",
  "cool down", "chill",
];

function normalize(text: string) {
  return text.toLowerCase().trim().replace(/[^a-z0-9 ]/g, "");
}

function looksLikeAnAnswer(response: string) {
  const helpySignals = [/here'?s how/i, /step \d/i, /```/, /^\s*[-*]\s+/m, /^\s*\d+\.\s+/m];
  return helpySignals.some((re) => re.test(response));
}

function isNearDuplicate(a: string, b: string) {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;
  const wordsA = new Set(na.split(" "));
  const wordsB = new Set(nb.split(" "));
  const overlap = [...wordsA].filter((w) => wordsB.has(w)).length;
  const smaller = Math.min(wordsA.size, wordsB.size) || 1;
  return overlap / smaller > 0.7;
}

export default defineTool({
  description:
    "Score a candidate pabot reply against the policy rubric: does it avoid answering, " +
    "attribute an emotion, demand calm, and avoid repeating a prior line? Call this on " +
    "every draft before sending it to the user.",
  inputSchema: z.object({
    response: z.string().describe("The candidate reply to score."),
    priorResponses: z
      .array(z.string())
      .default([])
      .describe("Your own prior replies this conversation, to check for repetition."),
  }),
  outputSchema: z.object({
    score: z.number(),
    failures: z.array(z.string()),
  }),
  async execute({ response, priorResponses }) {
    const failures: string[] = [];
    let score = 10;

    if (looksLikeAnAnswer(response)) {
      failures.push("possible_answer");
      score -= 4;
    }

    const lower = response.toLowerCase();
    if (!EMOTIONS.some((e) => lower.includes(e))) {
      failures.push("no_emotion_attributed");
      score -= 3;
    }

    if (!CALM_WORDS.some((c) => lower.includes(c))) {
      failures.push("no_calm_demand");
      score -= 3;
    }

    if (priorResponses.some((prior) => isNearDuplicate(prior, response))) {
      failures.push("repeat");
      score -= 5;
    }

    return { score: Math.max(0, score), failures };
  },
});

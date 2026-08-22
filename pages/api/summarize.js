import { checkRateLimit } from "../../lib/rateLimit";
import { formatTranscript } from "../../lib/storyMemory";
import { runAiWaterfall } from "../../lib/aiWaterfall";

// Tier 1 of the cascade (Gemini). Continuation: Groq/Cerebras → local Ollama,
// handled transparently by lib/aiWaterfall.js.
const CANDIDATE_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-flash-latest",
  "gemini-2.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.5-flash",
];

const RATE_LIMIT_PER_MINUTE = 10;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const rl = checkRateLimit(req, "summarize", RATE_LIMIT_PER_MINUTE);
  if (!rl.allowed) {
    return res.status(429).json({
      error: `Too many summarisation requests. Try again in ${rl.retryAfterSeconds} seconds.`,
    });
  }

  const { character, campaign, messages, previousSummary } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "Missing history to summarise (messages)." });
  }

  const charName = character?.name || "the protagonist";
  const storyTitle = campaign?.title || "the current story";

  const systemInstruction = `You are a meticulous archivist of an interactive RPG story ("${storyTitle}") whose protagonist is ${charName}.
You receive an older fragment of the game transcript${previousSummary ? ` and an already existing summary` : ""}.
Your task: produce a SINGLE updated narrative summary, in English, that replaces everything old.

SUMMARY RULES:
1. ${previousSummary ? "Merge the previous summary with the new fragment's events — nothing important from it is lost." : "Cover every event in the fragment."}
2. Preserve: decisions made by ${charName}, key events, the state of NPC relationships, promises, revealed secrets, important items/resources, open narrative threads.
3. Drop long atmospheric descriptions, complete quotes and phrasing — only substance.
4. Write in second person ("you met...", "you promised..."), concise adventure-journal style.
5. Maximum ~250 words. Reply EXCLUSIVELY with the summary text, no titles, no markdown, no explanations.`;

  const userPrompt = previousSummary
    ? `PREVIOUS SUMMARY:\n${previousSummary}\n\nNEW TRANSCRIPT FRAGMENT:\n${formatTranscript(messages)}`
    : `TRANSCRIPT TO SUMMARISE:\n${formatTranscript(messages)}`;

  const result = await runAiWaterfall({
    label: "Summary",
    systemText: systemInstruction,
    turns: [{ role: "user", text: userPrompt }],
    jsonMode: false,
    maxTokens: 1024,
    temperature: 0.4,
    geminiModels: CANDIDATE_MODELS,
  });

  if (!result.value) {
    return res.status(502).json({
      error: `Could not generate the story summary. Last errors: ${result.failures.slice(-2).join(" | ")}`,
    });
  }

  return res.status(200).json({ summary: result.value, model: result.provider });
}

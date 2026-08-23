import { buildPrompt, validateCampaign, maturityLabel } from "../../lib/prompt";
import { checkRateLimit } from "../../lib/rateLimit";
import { runAiWaterfall, extractJson } from "../../lib/aiWaterfall";

// Level 1 of the cascade (Gemini, only for 13+/16+). For adult content (18+/21+)
// Gemini is skipped; the continuation is Groq → Mistral → local Ollama,
// handled transparently by lib/aiWaterfall.js.
const CANDIDATE_MODELS = [
  "gemini-3.7-flash",
  "gemini-flash-latest",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite",
];

const RATE_LIMIT_PER_MINUTE = 5;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const rl = checkRateLimit(req, "generate", RATE_LIMIT_PER_MINUTE);
  if (!rl.allowed) {
    return res.status(429).json({
      error: `Too many generation requests. Try again in ${rl.retryAfterSeconds} seconds.`,
    });
  }

  const { character, variant, length, maturity, npcMode, protagonist } = req.body || {};
  if (!character) {
    return res.status(400).json({ error: "Missing character (character JSON)." });
  }

  const prompt = buildPrompt(character, variant, length, maturity, {
    npcMode: Boolean(npcMode),
    protagonist: protagonist && typeof protagonist === "object" ? protagonist : null,
  });

  console.log("=== NEW CAMPAIGN GENERATION ===");
  // The character's name never goes into the logs (R12 audit): config params only.
  console.log("Variant:", variant, "| Length:", length, "| Maturity:", maturityLabel(maturity), "| NPC mode:", npcMode ? "yes" : "no");
  console.log("===============================");

  // Long campaigns produce JSON beyond Groq's 4096-token cap
  // (measured live on Aug 23: the Groq attempt always fails and just wastes time) —
  // for the long variant ("lunga") the provider with the big cap (Mistral, 8192) tries first.
  const preferProvider = length === "lunga" ? "mistral" : undefined;
  if (preferProvider) console.log('Long campaign ("lunga") → cascade with', preferProvider, "first in line");

  // Without a Gemini key configured the request no longer dies with a 500: the
  // cascade moves on automatically to the next levels (Groq / local Ollama).
  const result = await runAiWaterfall({
    label: "Generation",
    turns: [{ role: "user", text: prompt }],
    jsonMode: true,
    maxTokens: 8192,
    temperature: 0.7,
    geminiModels: CANDIDATE_MODELS,
    maturity,
    preferProvider,
    processText(raw) {
      const campaign = validateCampaign(JSON.parse(extractJson(raw)));
      // The displayed rating follows the user's choice from the visual selector.
      campaign.maturity_rating = maturityLabel(maturity);
      return campaign;
    },
  });

  if (!result.value) {
    return res.status(502).json({
      error: `Could not generate the campaign with any available provider. Last errors: ${result.failures.slice(-2).join(" | ")}`,
    });
  }

  return res.status(200).json({ campaign: result.value, usedModel: result.provider });
}

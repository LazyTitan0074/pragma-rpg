import { buildPrompt, validateCampaign, maturityLabel } from "../../lib/prompt";
import { checkRateLimit } from "../../lib/rateLimit";
import { runAiWaterfall, extractJson } from "../../lib/aiWaterfall";

// Tier 1 of the cascade (Gemini). Continuation: Groq/Cerebras → local Ollama,
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

  const { character, variant, length, maturity } = req.body || {};
  if (!character) {
    return res.status(400).json({ error: "Missing character (character JSON)." });
  }

  const prompt = buildPrompt(character, variant, length, maturity);

  console.log("=== NEW CAMPAIGN GENERATION ===");
  // No character name in logs (audit R12): configuration parameters only.
  console.log("Variant:", variant, "| Length:", length, "| Maturity:", maturityLabel(maturity));
  console.log("===============================");

  // A missing Gemini key no longer kills the request with 500: the cascade
  // moves on to the next tiers (Groq / local Ollama).
  const result = await runAiWaterfall({
    label: "Generate",
    turns: [{ role: "user", text: prompt }],
    jsonMode: true,
    maxTokens: 8192,
    temperature: 0.7,
    geminiModels: CANDIDATE_MODELS,
    processText(raw) {
      const campaign = validateCampaign(JSON.parse(extractJson(raw)));
      // The displayed rating follows the user's selector choice.
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

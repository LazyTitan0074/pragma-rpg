import { checkRateLimit } from "../../lib/rateLimit";
import { runAiWaterfall, extractJson } from "../../lib/aiWaterfall";
import { validateCharacterSheet } from "../../lib/characters";

// Phase 5: turns a free-form request ("a cold witch from 1872") into a complete
// JSON character sheet, compatible with the campaign generator.
// Mandatory cascade: for adult content (18+/21+, the default) Gemini is skipped;
// the continuation is Groq → Mistral → local Ollama (lib/aiWaterfall.js).

const CANDIDATE_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemini-2.5-flash-lite",
];

const RATE_LIMIT_PER_MINUTE = 6;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const rl = checkRateLimit(req, "create-character", RATE_LIMIT_PER_MINUTE);
  if (!rl.allowed) {
    return res.status(429).json({
      error: `Too many character creation requests. Try again in ${rl.retryAfterSeconds} seconds.`,
    });
  }

  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  if (prompt.length < 10) {
    return res.status(400).json({
      error: "Describe the character you want in at least 10 characters (who they are, where they live, what you want from them).",
    });
  }

  // August 23, 2026: sheets are written in English (fully EN AI pipeline, user
  // decision) — they arrive as JSON in the DM's and generator's prompts.
  const systemInstruction = `You are an expert character-sheet creator for narrative role-playing games.
You receive a free-form request and turn it into a complete, vivid, playable sheet.
Respond EXCLUSIVELY with a valid JSON object — no markdown, no explanations — written in flawless English, regardless of the language of the request.

Mandatory schema of the JSON object:
{
  "name": "memorable name, credible in the chosen universe",
  "role": "the character's role/occupation",
  "universe": "the universe, the concrete place and period (e.g. \"Athens, 420 BC — a house with a peristyle\")",
  "appearance": "2-3 sentences about the physical look, with memorable details",
  "personality": "3-4 sentences: temperament, how they relate to others, hidden weaknesses",
  "speech": "how they speak: tone, rhythm, distinctive expressions",
  "philosophy": "one punchy sentence summing up their deepest vision or motivation",
  "connections": "2-3 notable ties (allies, enemies, debts, shared secrets)",
  "secrets": "1-2 secrets nobody tells you at first meeting"
}

RULES:
1. Every field is filled with real substance, never with commonplaces or emptiness.
2. If the request does not specify the universe, propose one that stands out and fits the role.
3. Faithfully honor the user's explicit wishes (age, tone, attitude, powers).`;

  const result = await runAiWaterfall({
    label: "Character creation",
    systemText: systemInstruction,
    turns: [{ role: "user", text: `The user's request: ${prompt}` }],
    jsonMode: true,
    maxTokens: 2048,
    temperature: 0.8,
    geminiModels: CANDIDATE_MODELS,
    maturity:
      typeof req.body?.maturity === "string" && req.body.maturity ? req.body.maturity : "18",
    processText(raw) {
      return validateCharacterSheet(JSON.parse(extractJson(raw)));
    },
  });

  if (!result.value) {
    return res.status(502).json({
      error: `Could not create the character sheet. Last errors: ${result.failures.slice(-2).join(" | ")}`,
    });
  }

  return res.status(200).json({ character: result.value, model: result.provider });
}

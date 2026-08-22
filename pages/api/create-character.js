import { checkRateLimit } from "../../lib/rateLimit";
import { runAiWaterfall, extractJson } from "../../lib/aiWaterfall";
import { validateCharacterSheet } from "../../lib/characters";

// Phase 5: transforms a free-form request into a complete character sheet JSON
// compatible with the campaign generator. Uses the same mandatory cascade:
// Gemini → Groq/Cerebras → local Ollama.

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

  const systemInstruction = `You are an expert creator of tabletop RPG character sheets.
You receive a free-form request and turn it into a complete, vivid, playable sheet.
Reply EXCLUSIVELY with a valid JSON object — no markdown, no explanations — in flawless English.

Mandatory JSON schema:
{
  "name": "memorable name, credible within the chosen universe",
  "role": "the character's role/occupation",
  "universe": "universe, concrete place and period (e.g.: 'Athens, 420 BC — a house with a peristyle')",
  "appearance": "2-3 sentences about physical appearance, with memorable details",
  "personality": "3-4 sentences: temperament, how they relate to others, hidden weaknesses",
  "speech": "how they speak: tone, rhythm, characteristic expressions",
  "philosophy": "one short phrase summarising their deep vision or motivation",
  "connections": "2-3 notable ties (allies, enemies, debts, shared secrets)",
  "secrets": "1-2 secrets nobody tells you at first meeting"
}

RULES:
1. Every field gets real substance — never clichés or blanks.
2. If the request doesn't specify a universe, propose one that stands out and fits the role.
3. Faithfully respect the user's explicit wishes (age, tone, attitude, powers).`;

  const result = await runAiWaterfall({
    label: "Character creator",
    systemText: systemInstruction,
    turns: [{ role: "user", text: `The user's request: ${prompt}` }],
    jsonMode: true,
    maxTokens: 2048,
    temperature: 0.8,
    geminiModels: CANDIDATE_MODELS,
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

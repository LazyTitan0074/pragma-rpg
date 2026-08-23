import { checkRateLimit } from "../../lib/rateLimit";
import { runAiWaterfall } from "../../lib/aiWaterfall";
import { buildGameMasterSystemText } from "../../lib/prompt";

// Level 1 of the cascade (Gemini, only for 13+/16+). For adult content (18+/21+)
// Gemini is skipped; the continuation is Groq → Mistral → local Ollama,
// handled transparently by lib/aiWaterfall.js.
const CANDIDATE_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemini-2.5-flash-lite",
];

const RATE_LIMIT_PER_MINUTE = 20;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const rl = checkRateLimit(req, "play", RATE_LIMIT_PER_MINUTE);
  if (!rl.allowed) {
    return res.status(429).json({
      error: `Too many messages sent to the Game Master. Try again in ${rl.retryAfterSeconds} seconds.`,
    });
  }

  const { character, campaign, messages, summary, bible, maturity, npcMode, protagonist } = req.body || {};
  if (!campaign) {
    return res.status(400).json({ error: "Missing campaign / generated setting." });
  }

  const systemInstruction = buildGameMasterSystemText({
    campaign,
    character,
    protagonist: protagonist && typeof protagonist === "object" ? protagonist : null,
    npcMode: Boolean(npcMode),
    summary,
    bible: bible && typeof bible === "object" ? bible : null,
    maturity,
  });

  const isSandbox = campaign.mode === "sandbox" || (campaign.locations && campaign.locations.length > 0);

  // Conversation history; with no messages → the story's opening line.
  const turns =
    Array.isArray(messages) && messages.length > 0
      ? messages.map((m) => ({
          role: m.role === "user" || m.role === "player" ? "user" : "model",
          text: m.text,
        }))
      : [
          {
            role: "user",
            text: isSandbox
              ? `Begin the free story "${campaign.title}". Put me straight into the opening scene.`
              : `Begin the campaign "${campaign.title}". Put me into the opening scene of Mission 1.`,
          },
        ];

  const result = await runAiWaterfall({
    label: "DM",
    systemText: systemInstruction,
    turns,
    jsonMode: false,
    maxTokens: 2048,
    temperature: 0.85,
    geminiModels: CANDIDATE_MODELS,
    maturity,
  });

  if (!result.value) {
    return res.status(502).json({
      error: `Could not get the Game Master's reply. Last errors: ${result.failures.slice(-2).join(" | ")}`,
    });
  }

  return res.status(200).json({ reply: result.value, model: result.provider });
}

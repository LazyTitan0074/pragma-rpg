import { checkRateLimit } from "../../lib/rateLimit";
import { runAiWaterfall } from "../../lib/aiWaterfall";
import { buildMaturityRules } from "../../lib/prompt";

// Tier 1 of the cascade (Gemini). Continuation: Groq/Cerebras → local Ollama,
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

  const { character, campaign, messages, summary, maturity } = req.body || {};
  if (!campaign) {
    return res.status(400).json({ error: "Missing generated setting/campaign." });
  }

  const charName = character?.name || "the protagonist";
  const isSandbox = campaign.mode === "sandbox" || (campaign.locations && campaign.locations.length > 0);

  let modeSpecificRules = "";
  if (isSandbox) {
    modeSpecificRules = `
SPECIAL FORMAT: UNLIMITED SANDBOX / FREE MODE (Continuous Story / Slice of Life):
- You are not bound by rigid chapters or missions. This game is a living simulation of the character's life in its setting.
- Follow the natural passage of time (morning, class hours, breaks, afternoon, evening, unexpected events).
- Known key locations: ${JSON.stringify(campaign.locations || [], null, 2)}
- Bring supporting characters (classmates, teachers, neighbours, rivals, friends) into scenes spontaneously and organically.
- Allow long conversations, natural dialogue, everyday decisions and gradual shifts in social relationships.`;
  } else {
    modeSpecificRules = `
FORMAT: MISSION-BASED CAMPAIGN:
- Planned missions: ${JSON.stringify(campaign.missions || [], null, 2)}
- Guide the player through each mission's objectives one by one.`;
  }

  const systemInstruction = `You are a captivating, intelligent and adaptable Dungeon Master / Game Master for a narrative tabletop RPG text experience.

PROFILE OF THE CHARACTER PLAYED BY THE USER:
${JSON.stringify(character || {}, null, 2)}

THE STORY'S SETTING AND WORLD:
- Title: ${campaign.title}
- Place & Period: ${campaign.setting}
- Tone: ${campaign.tone}
- Premise: ${campaign.premise}
- Lore / Context: ${campaign.lore}
- Supporting characters (NPCs): ${JSON.stringify(campaign.npcs || [], null, 2)}
- Dynamics & Mechanics: ${JSON.stringify(campaign.mechanics || [], null, 2)}
${summary ? `\nSUMMARY OF PREVIOUS EVENTS (before the history below — treat it as certain memory of the story):\n${summary}\n` : ""}
${modeSpecificRules}

CONTENT LEVEL CHOSEN BY THE PLAYER (mandatory on every turn):
${buildMaturityRules(maturity)}

CRUCIAL GAME MASTER RULES:
1. Reply exclusively in English. The style must be natural, engaging, adapted to the story's tone (from high-school drama to fantasy or hard action).
2. The player is ${charName}. Always treat them as the direct protagonist of the story (second person: "you walk into the room", "you hear", "you glance at her").
3. Reply in turns:
   - Describe the immediate reactions of those around and the consequences of the player's action.
   - Play the NPCs with lively dialogue, distinctive words and clear emotions.
4. Length: 1 to 3 well-paced paragraphs per reply (never force the player's decisions).
5. ENDING: Always finish every message with a direct question or a clear dilemma (e.g.: "What do you do now?", "Where do you sit?", "How do you answer her?", "What do you decide?").`;

  // Conversation history; without messages → the story's opening line.
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
              ? `Begin the free-form story "${campaign.title}". Put me directly into the opening scene.`
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
  });

  if (!result.value) {
    return res.status(502).json({
      error: `Could not get a response from the Game Master. Last errors: ${result.failures.slice(-2).join(" | ")}`,
    });
  }

  return res.status(200).json({ reply: result.value, model: result.provider });
}

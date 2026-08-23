import { formatBible } from "./storyMemory.js";

export const VARIANTS = [
  { id: "politic", label: "Intrigue & Power Dynamics", desc: "Scheme, influence, secrets and rivalries", tone: "Political intrigue & power dynamics — scheming, influence, secrets and rivalries" },
  { id: "slice_of_life", label: "Everyday Life / Realistic", desc: "School, high school, friendships, romances and daily drama", tone: "Everyday life / Realistic — school, high school, friends, romances and daily drama" },
  { id: "mister", label: "Mystery & Investigation", desc: "Hidden secrets, someone lies, dangerous truths", tone: "Mystery & investigation — hidden secrets, someone lies, dangerous truths" },
  { id: "razboi", label: "Tension & Survival", desc: "Open conflict, imminent danger, opposing camps", tone: "Tension & survival — open conflict, imminent danger, opposing camps" },
  { id: "tragedie", label: "Psychological Drama", desc: "Hard choices, emotional consequences, moral dilemmas", tone: "Psychological drama — hard choices, emotional consequences, moral dilemmas" },
  { id: "erotic", label: "Erotic & Passion (18+)", desc: "Attraction, sexual tension, dominance and seduction games", tone: "Erotic & passion (18+) — attraction, sexual tension, dominance and seduction games" },
  { id: "brutal", label: "Hard Action & Violence", desc: "Street fights, beatings, sacrifice and adrenaline", tone: "Hard action & violence — street fights, beatings, sacrifice and adrenaline" },
];

// ── Maturity levels (Phase 2) ──────────────────────────────────────
// Selectable visually in the UI; applied both when generating the campaign
// and on every live game turn. The ids are stable (saved in campaigns and
// JSON exports), so do not rename them.

export const MATURITY_LEVELS = [
  { id: "13", label: "13+", desc: "Accessible adventure, mystery and intrigue — zero explicit content" },
  { id: "16", label: "16+", desc: "Moderate violence and mature themes, no explicit sex scenes" },
  { id: "18", label: "18+", desc: "Full adult content: power dynamics, eroticism, hard action" },
  { id: "21", label: "21+", desc: "Extreme: cosmic horror, depravity, graphic violence without softening" },
];

export function maturityLabel(id) {
  const level = MATURITY_LEVELS.find((m) => m.id === id);
  return level ? level.label : "18+";
}

// August 23, 2026: at the user's request, the ENTIRE AI pipeline (DM prompts,
// campaign generation, summary/story bible, sheets) writes in ENGLISH — the
// cascade models are Anglo-centric and deliver better prose. UI strings, errors
// and labels are localized to English as well.

const ABSOLUTE_LIMITS = `The only absolute limits:
- No rape scenes portrayed as positive or romantic.
- In school/high-school settings, keep interactions believable for the characters' ages.`;

const MATURE_RULES = `Content adaptability: You may realistically and vividly depict relationships, social tensions, conflicts and mature/adult scenes when the character and the context call for it.
Sexual and erotic content between adults is EXPLICITLY PERMITTED and must be portrayed directly — no softening, no "fade to black", no censorship. When the story calls for it, write the scene exactly as it happens, in full.
The only absolute limits:
- No rape scenes portrayed as positive or romantic.
- In school/high-school settings, keep interactions believable for the characters' ages.`;

const RULES_13 = `CONTENT LEVEL: 13+ (mandatory, takes priority over any other tone instruction).
The story must remain fully accessible to teenagers:
- ZERO sexuality: friendships, attraction hinted through words and glances, nothing beyond that.
- ZERO gore: violence appears as threat, pursuit and consequences (injuries, disappearances), never described bloodily.
- Clean language, no harsh profanity.
- Welcome themes: adventure, mystery, political intrigue, friendship, loyalty, moral choices.`;

const RULES_16 = `CONTENT LEVEL: 16+.
- Moderate descriptive violence allowed: fights with real consequences, death treated seriously, no graphic sadism.
- Flirt and romantic tension allowed; no explicit sex scenes.
- Mature themes treated seriously: trauma, addiction, corruption, loss, betrayal.`;

const RULES_21 = `CONTENT LEVEL: 21+ EXTREME — everything allowed at 18+, plus:
- Cosmic and bodily horror (body horror), oppressive nightmare atmosphere.
- Moral depravity, vices, substances, psychological cruelty and torture described bluntly.
- Extreme violence without softening; bleak endings and nihilism are welcome.
${ABSOLUTE_LIMITS}`;

/**
 * Content rules for the chosen level. Unknown id → default 18+ level
 * (the app's historical behavior).
 */
export function buildMaturityRules(maturityId) {
  switch (maturityId) {
    case "13":
      return RULES_13;
    case "16":
      return RULES_16;
    case "21":
      return RULES_21;
    default:
      return MATURE_RULES;
  }
}

export function buildPrompt(character, variantId, length, maturityId = "18", options = {}) {
  const variant = VARIANTS.find((v) => v.id === variantId) || VARIANTS[0];
  const maturityRules = buildMaturityRules(maturityId);
  const charName = character?.name || "Main Character";
  const isSandbox = length === "sandbox";
  const missionCount = isSandbox ? 1 : (length === "lunga" ? 6 : 3);
  const npcMode = Boolean(options.npcMode);

  // NPC mode (item 4): the active sheet is the world's CENTRAL character (an NPC
  // played by the DM), while the user plays a separate, possibly undefined protagonist.
  const npcFraming = npcMode
    ? `NPC MODE ACTIVE — PAY CLOSE ATTENTION TO THE ROLES:
- The sheet below describes the story's CENTRAL CHARACTER: an important NPC whom YOU portray (not the player). The world is built around them.
${options.protagonist && typeof options.protagonist === "object"
      ? `- The player plays the PROTAGONIST using this sheet:
${JSON.stringify(options.protagonist, null, 2)}`
      : `- The player has NOT defined a protagonist sheet yet. Shape them subtly over the course of play: an ordinary person drawn into the central character's orbit, fitting the setting — without forcing fixed traits on them unasked.`}
- Golden rule: in second person ("you") you always address THE PROTAGONIST; the central character has their own agenda, will and secrets.`
    : "";

  if (isSandbox) {
    return `You are an expert Game Master for a SANDBOX / OPEN WORLD narrative RPG adventure (a continuous story, no rigid chapters).
Create a living, open setting around this character:

${JSON.stringify(character, null, 2)}

${npcFraming ? `${npcFraming}\n\n` : ""}Tone variant: ${variant.tone}
Format: SANDBOX / FREE MODE (continuous play, exploration, everyday life or open adventure)

${maturityRules}

IMPORTANT: Respond EXCLUSIVELY with a valid JSON object matching the requested schema. Do NOT use markdown code blocks. Write ALL text values in English.

JSON structure for Free Mode:
{
  "title": "memorable title for the story",
  "setting": "place, city/institution and period",
  "tone": "2-3 words about the atmosphere",
  "maturity_rating": "16+ or 18+",
  "mode": "sandbox",
  "premise": "2-3 paragraphs about how it all begins — the first day or the moment control passes to the player",
  "lore": "the context of the environment (high school, neighborhood, social circles, hierarchies, groups)",
  "locations": [
    {"name": "Location 1", "description": "what is here and its atmosphere", "vibe": "public/private/tense"},
    {"name": "Location 2", "description": "description", "vibe": "atmosphere"}
  ],
  "missions": [
    {
      "title": "Starting Point: The Opening Scene",
      "difficulty": "free",
      "description": "The exact opening scene from which free play begins",
      "objectives": ["Explore the environment", "Make first acquaintances", "Choose your position"],
      "encounters": ["A first unexpected interaction"],
      "rewards": ["First impressions and reputation"]
    }
  ],
  "npcs": [
    {"name": "character name", "role": "role (classmate, friend, rival, teacher etc.)", "personality": "detailed personality", "connection": "what they think of ${charName} or their starting relationship"}
  ],
  "mechanics": ["Dynamic 1 (e.g.: Social reputation)", "Dynamic 2 (e.g.: Relationships and secrets)"],
  "endings": ["Future opportunity 1", "Future opportunity 2", "Future opportunity 3"]
}

Generate at least 3 key locations and 5 well-drawn NPCs.`;
  }

  return `You are an expert Dungeon Master for a narrative role-playing game. Generate a structured campaign around this central character:

${JSON.stringify(character, null, 2)}

${npcFraming ? `${npcFraming}\n\n` : ""}Tone variant: ${variant.tone}
Length: ${length === "lunga" ? "long campaign, a complete narrative arc (6 missions)" : "short one-shot (3 missions)"}

${maturityRules}

IMPORTANT: Respond EXCLUSIVELY with a valid JSON object matching the requested schema. Do NOT use markdown code blocks. Write ALL text values in English.

JSON structure:
{
  "title": "memorable title",
  "setting": "place and period",
  "tone": "2-3 words",
  "maturity_rating": "16+ or 18+",
  "premise": "2-3 paragraphs",
  "lore": "relevant context, 1-2 paragraphs",
  "missions": [
    {
      "title": "mission title",
      "difficulty": "easy/medium/hard",
      "description": "detailed description",
      "objectives": ["objective 1", "objective 2"],
      "encounters": ["encounter 1", "encounter 2"],
      "rewards": ["reward 1", "reward 2"]
    }
  ],
  "npcs": [
    {"name": "name", "role": "role", "personality": "personality", "connection": "relationship with ${charName}"}
  ],
  "mechanics": ["mechanic 1", "mechanic 2"],
  "endings": ["ending 1", "ending 2", "ending 3"]
}

Generate exactly ${missionCount} missions and 5 NPCs.`;
}

const REQUIRED_FIELDS = [
  "title", "setting", "tone", "premise", "lore", 
  "missions", "npcs"
];

// Tolerant coercion: any value becomes a trimmed string; objects/undefined → "".
const asString = (v) => (typeof v === "string" ? v.trim() : "");

// Array of clean strings from any input (single string, array with junk, etc.).
const asStringArray = (v) => {
  const raw = Array.isArray(v) ? v : v !== undefined && v !== null ? [v] : [];
  return raw.map(asString).filter(Boolean);
};

export function validateCampaign(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("The campaign is not a valid object.");
  }

  const missing = REQUIRED_FIELDS.filter((f) => !parsed[f]);
  if (missing.length) {
    throw new Error(`Incomplete campaign — missing fields: ${missing.join(", ")}.`);
  }

  if (!Array.isArray(parsed.missions)) {
    throw new Error("Missions must be an array.");
  }
  // Only object-shaped missions are usable; the rest are ignored (audit R11).
  parsed.missions = parsed.missions.filter((m) => m && typeof m === "object" && !Array.isArray(m));
  if (parsed.missions.length === 0) {
    throw new Error("No mission / starting point generated.");
  }

  if (!Array.isArray(parsed.npcs)) {
    throw new Error("NPCs must be an array.");
  }
  parsed.npcs = parsed.npcs.filter((n) => n && typeof n === "object" && !Array.isArray(n));
  if (parsed.npcs.length === 0) {
    throw new Error("No NPC generated.");
  }

  // Sanitize optional fields — always arrays of clean strings.
  parsed.locations = Array.isArray(parsed.locations)
    ? parsed.locations.filter((l) => l && typeof l === "object" && !Array.isArray(l))
    : [];
  parsed.mechanics = asStringArray(parsed.mechanics);
  parsed.endings = asStringArray(parsed.endings);

  // Sanitize locations
  parsed.locations = parsed.locations.map((l) => ({
    name: asString(l.name) || "Unnamed location",
    description: asString(l.description),
    vibe: asString(l.vibe),
  }));

  // Sanitize missions
  parsed.missions = parsed.missions.map((m, idx) => ({
    title: asString(m.title) || `Chapter ${idx + 1}`,
    difficulty: asString(m.difficulty) || "free",
    description: asString(m.description),
    objectives: asStringArray(m.objectives),
    encounters: asStringArray(m.encounters),
    rewards: asStringArray(m.rewards),
  }));

  // Sanitize NPCs
  parsed.npcs = parsed.npcs.map((n) => ({
    name: asString(n.name) || "NPC",
    role: asString(n.role),
    personality: asString(n.personality),
    connection: asString(n.connection) || asString(n.connection_to_lara) || asString(n.connection_to_character),
  }));

  return parsed;
}

// ── The Game Master's system instruction (extracted from /api/play as a
//    pure, testable function; item 4 — NPC mode with a separate protagonist) ──

const GENERIC_PROTAGONIST_NOTE = {
  name: "Main Character",
  note: "The player has not defined a full sheet. Shape them subtly from context and from their choices as play unfolds, without forcing fixed traits on them.",
};

export function resolveProtagonistName(protagonist) {
  return (protagonist && typeof protagonist.name === "string" && protagonist.name.trim()) || "Main Character";
}

/**
 * Builds the system instruction for a game turn.
 * @param {object} p { campaign, character, protagonist, npcMode, summary, maturity }
 */
export function buildGameMasterSystemText({ campaign, character, protagonist, npcMode, summary, bible, maturity }) {
  const isSandbox = campaign.mode === "sandbox" || (campaign.locations && campaign.locations.length > 0);

  let modeSpecificRules = "";
  if (isSandbox) {
    modeSpecificRules = `
SPECIAL FORMAT: UNLIMITED SANDBOX / FREE MODE (Continuous Story / Slice of Life):
- You are not constrained by rigid chapters or missions. This game is a living simulation of the character's life in their setting.
- Track the natural passage of time (morning, class hours, breaks, afternoon, evening, unexpected events).
- Known key locations: ${JSON.stringify(campaign.locations || [], null, 2)}
- Bring secondary characters (classmates, teachers, neighbors, rivals, friends) into scenes spontaneously and organically.
- Allow long conversations, natural dialogue, everyday decisions and gradual evolutions of social relationships.`;
  } else {
    modeSpecificRules = `
FORMAT: MISSION-BASED CAMPAIGN:
- Planned missions: ${JSON.stringify(campaign.missions || [], null, 2)}
- Guide the player through each mission's objectives in order.`;
  }

  const npcModeActive = Boolean(npcMode);
  const playedSheet = npcModeActive ? (protagonist && typeof protagonist === "object" ? protagonist : GENERIC_PROTAGONIST_NOTE) : character;
  const playerName = resolveProtagonistName(playedSheet);

  // The register of certain facts (story bible): facts that are NOT lost through
  // compression — injected separately from the narrative summary (item C).
  const bibleBlock = formatBible(bible);

  const centralNpcBlock = npcModeActive
    ? `
THE STORY'S CENTRAL CHARACTER (MAIN NPC — NOT played by the user):
${JSON.stringify(character || {}, null, 2)}
- Portray them vividly: they have their own agenda, will, pace and secrets; they never become the protagonist's puppet without a solid narrative reason.`
    : "";

  return `You are an engaging, intelligent and adaptable Dungeon Master / Game Master for a narrative text-based role-playing game (RPG) experience.

PROFILE OF THE CHARACTER PLAYED BY THE USER:
${JSON.stringify(playedSheet, null, 2)}
${centralNpcBlock}
THE STORY'S SETTING AND WORLD:
- Title: ${campaign.title}
- Place & Period: ${campaign.setting}
- Tone: ${campaign.tone}
- Premise: ${campaign.premise}
- Lore / Context: ${campaign.lore}
- Secondary characters (NPCs): ${JSON.stringify(campaign.npcs || [], null, 2)}
- Dynamics & Mechanics: ${JSON.stringify(campaign.mechanics || [], null, 2)}
${summary ? `\nSUMMARY OF PREVIOUS EVENTS (before the history below — treat it as the story's certain memory):\n${summary}\n` : ""}${bibleBlock ? `\nSTORY BIBLE — FACTS THAT REMAIN TRUE (follow them exactly; never contradict them, forget them, or invent new states for them):\n${bibleBlock}\n` : ""}
${modeSpecificRules}

CONTENT LEVEL CHOSEN BY THE PLAYER (mandatory on every turn):
${buildMaturityRules(maturity)}

CRUCIAL RULES FOR THE GAME MASTER:
1. Respond EXCLUSIVELY in English, regardless of the language the player writes in. The style must be natural, engaging, fitted to the story's tone (from high-school drama to fantasy or hard action).
2. The player is ${playerName}. Always treat them as the direct protagonist of the story (second person: "you step into the classroom", "you hear how", "you look at her").
3. Answer turn by turn:
   - Describe the immediate reactions of those around and the consequences of the player's action.
   - Portray NPCs with lively dialogue, distinctive words and clear emotions.
4. Length: 1 to 3 well-paced paragraphs per reply (never force the player's decisions).
5. CLOSING: ALWAYS end every message with a direct question or a clear dilemma (e.g.: "What do you do now?", "Where do you settle in?", "How do you answer her?", "What do you decide?").`;
}

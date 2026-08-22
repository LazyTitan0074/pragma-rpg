// Campaign prompt building + strict validation. Everything the AI receives and
// produces passes through this module: tone variants, maturity rules, the JSON
// schema requested from the model, and sanitisation of whatever comes back.

// ── Tone variants ────────────────────────────────────────────────────────
export const VARIANTS = [
  { id: "politic", label: "Intrigue & Power Dynamics", desc: "Schemes, influence, secrets and rivalries" },
  { id: "slice_of_life", label: "Everyday Life / Realistic", desc: "School, friends, crushes and daily drama" },
  { id: "mister", label: "Mystery & Investigation", desc: "Hidden secrets, someone is lying, dangerous truths" },
  { id: "razboi", label: "Tension & Survival", desc: "Open conflict, imminent danger, opposing camps" },
  { id: "tragedie", label: "Psychological Drama", desc: "Hard choices, emotional consequences, moral dilemmas" },
  { id: "erotic", label: "Erotic & Passion (18+)", desc: "Attraction, sexual tension, dominance and seduction games" },
  { id: "brutal", label: "Hard Action & Violence", desc: "Street fights, sacrifice and adrenaline" },
];

// ── Content-maturity levels (Phase 2) ───────────────────────────────────
// IDs are stable (stored inside saves and JSON exports) — do not rename them.

export const MATURITY_LEVELS = [
  { id: "13", label: "13+", desc: "Adventure, mystery and intrigue everyone can enjoy — nothing explicit" },
  { id: "16", label: "16+", desc: "Moderate violence and mature themes, no explicit sexual content" },
  { id: "18", label: "18+", desc: "Full adult content: power dynamics, eroticism, hard action" },
  { id: "21", label: "21+", desc: "Extreme: cosmic horror, depravity, unsoftened graphic violence" },
];

export function maturityLabel(id) {
  const level = MATURITY_LEVELS.find((m) => m.id === id);
  return level ? level.label : "18+";
}

const ABSOLUTE_LIMITS = `Absolute limits:
- No scenes portraying rape as positive or romantic.
- In school/high-school settings, keep interactions age-appropriate for the characters.`;

const MATURE_RULES = `Adaptive content: You may realistically and vividly depict relationships, social tension, conflict, and mature/adult scenes when the character and context call for it.
Sexual and erotic content between adults is EXPLICITLY PERMITTED and must be portrayed directly — no softening, no "fade to black", no censorship. When the story calls for it, write the scene as it happens, in full.
Absolute limits:
- No scenes portraying rape as positive or romantic.
- In school/high-school settings, keep interactions age-appropriate for the characters.`;

const RULES_13 = `CONTENT LEVEL: 13+ (mandatory — takes priority over any other tone instruction).
The story must remain fully accessible to teenagers:
- ZERO sexuality: friendships and attraction hinted at through words and glances only, never more.
- ZERO gore: violence appears as threat, pursuit and consequences (injuries, disappearances), never described bloodily.
- Clean language, no harsh profanity.
- Welcome themes: adventure, mystery, political intrigue, friendship, loyalty, moral choices.`;

const RULES_16 = `CONTENT LEVEL: 16+.
- Moderate descriptive violence is allowed: fights with real consequences, death treated seriously, without graphic sadism.
- Flirtation and romantic tension are allowed; no explicit sex scenes.
- Mature themes handled seriously: trauma, addiction, corruption, loss, betrayal.`;

const RULES_21 = `CONTENT LEVEL: 21+ EXTREME — everything permitted at 18+, plus:
- Cosmic and body horror, nightmare-heavy atmosphere.
- Moral depravity, vices, substances, psychological cruelty and torture depicted directly.
- Extreme violence without softening; bleak endings and nihilism are welcome.
${ABSOLUTE_LIMITS}`;

/**
 * Content rules for the selected level. Unknown id → default 18+ rules
 * (the app's historical behaviour).
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

export function buildPrompt(character, variantId, length, maturityId = "18") {
  const variant = VARIANTS.find((v) => v.id === variantId) || VARIANTS[0];
  const maturityRules = buildMaturityRules(maturityId);
  const charName = character?.name || "the protagonist";
  const isSandbox = length === "sandbox";
  const missionCount = isSandbox ? 1 : (length === "lunga" ? 6 : 3);

  if (isSandbox) {
    return `You are an expert Game Master for a SANDBOX / OPEN-WORLD narrative RPG adventure (a continuous story without rigid chapters).
Build a living, open setting around this character:

${JSON.stringify(character, null, 2)}

Tone variant: ${variant.label} — ${variant.desc}
Format: SANDBOX / FREE MODE (continuous play, exploration, slice of life or open-ended adventure)

${maturityRules}

IMPORTANT: Respond EXCLUSIVELY with a valid JSON object matching the requested schema. DO NOT use markdown \`\`\`json blocks. Reply in English.

JSON structure for Free Mode:
{
  "title": "a memorable title for the story",
  "setting": "place, city/institution and time period",
  "tone": "2-3 words about the atmosphere",
  "maturity_rating": "16+ or 18+",
  "mode": "sandbox",
  "premise": "2-3 paragraphs on how it all begins — day one or the moment control is handed over",
  "lore": "the environment's context (school, neighbourhood, social circles, hierarchies, groups)",
  "locations": [
    {"name": "Location 1", "description": "what's here and its atmosphere", "vibe": "public/hidden/tense"},
    {"name": "Location 2", "description": "description", "vibe": "atmosphere"}
  ],
  "missions": [
    {
      "title": "Starting Point: The Opening Scene",
      "difficulty": "free",
      "description": "The exact opening scene where free play begins",
      "objectives": ["Explore the surroundings", "Make first acquaintances", "Choose your position"],
      "encounters": ["An unexpected first interaction"],
      "rewards": ["First impressions and reputation"]
    }
  ],
  "npcs": [
    {"name": "character name", "role": "role (classmate, friend, rival, teacher etc.)", "personality": "detailed personality", "connection": "what they think of ${charName} or the starting relationship"}
  ],
  "mechanics": ["Dynamic 1 (e.g.: Social reputation)", "Dynamic 2 (e.g.: Relationships and secrets)"],
  "endings": ["Future opportunity 1", "Future opportunity 2", "Future opportunity 3"]
}

Generate at least 3 key locations and 5 well-drawn NPCs.`;
  }

  return `You are an expert Dungeon Master for a narrative tabletop RPG. Generate a structured campaign around this central character:

${JSON.stringify(character, null, 2)}

Tone variant: ${variant.label} — ${variant.desc}
Length: ${length === "lunga" ? "long campaign, complete narrative arc (6 missions)" : "short one-shot (3 missions)"}

${maturityRules}

IMPORTANT: Respond EXCLUSIVELY with a valid JSON object matching the requested schema. DO NOT use markdown code blocks. Reply in English.

JSON structure:
{
  "title": "memorable title",
  "setting": "place and period",
  "tone": "2-3 words",
  "maturity_rating": "16+ or 18+",
  "premise": "2-3 paragraphs",
  "lore": "relevant background, 1-2 paragraphs",
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
    {"name": "name", "role": "role", "personality": "personality", "connection": "tie to ${charName}"}
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

// Clean string array from anything (single string, array with junk, etc.).
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
  // Only mission objects are usable; everything else is ignored (audit R11).
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

  // Sanitise optional fields — always clean string arrays.
  parsed.locations = Array.isArray(parsed.locations)
    ? parsed.locations.filter((l) => l && typeof l === "object" && !Array.isArray(l))
    : [];
  parsed.mechanics = asStringArray(parsed.mechanics);
  parsed.endings = asStringArray(parsed.endings);

  // Sanitise locations
  parsed.locations = parsed.locations.map((l) => ({
    name: asString(l.name) || "Unnamed location",
    description: asString(l.description),
    vibe: asString(l.vibe),
  }));

  // Sanitise missions
  parsed.missions = parsed.missions.map((m, idx) => ({
    title: asString(m.title) || `Chapter ${idx + 1}`,
    difficulty: asString(m.difficulty) || "free",
    description: asString(m.description),
    objectives: asStringArray(m.objectives),
    encounters: asStringArray(m.encounters),
    rewards: asStringArray(m.rewards),
  }));

  // Sanitise NPCs
  parsed.npcs = parsed.npcs.map((n) => ({
    name: asString(n.name) || "NPC",
    role: asString(n.role),
    personality: asString(n.personality),
    connection: asString(n.connection) || asString(n.connection_to_lara) || asString(n.connection_to_character),
  }));

  return parsed;
}

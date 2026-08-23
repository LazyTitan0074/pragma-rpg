import { checkRateLimit } from "../../lib/rateLimit";
import { formatTranscript, sanitizeBible } from "../../lib/storyMemory";
import { runAiWaterfall, extractJson } from "../../lib/aiWaterfall";

// Level 1 of the cascade (Gemini, only for 13+/16+). For adult content (18+/21+)
// Gemini is skipped; the continuation is Groq → Mistral → local Ollama,
// handled transparently by lib/aiWaterfall.js. Maturity comes from the client
// (an 18+ story's summary has no business going to Gemini).
const CANDIDATE_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemini-2.5-flash-lite",
];

const RATE_LIMIT_PER_MINUTE = 10;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const rl = checkRateLimit(req, "summarize", RATE_LIMIT_PER_MINUTE);
  if (!rl.allowed) {
    return res.status(429).json({
      error: `Too many summarization requests. Try again in ${rl.retryAfterSeconds} seconds.`,
    });
  }

  const { character, campaign, messages, previousSummary, previousBible, maturity, npcMode, protagonist } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "Missing chat history to summarize (messages)." });
  }

  // The second person in the summary refers to the PROTAGONIST (in NPC mode they
  // are separate from the central character sheet — point 4).
  const played = npcMode && protagonist && typeof protagonist === "object" ? protagonist : character;
  const charName = played?.name || "the Main Character";
  const storyTitle = campaign?.title || "the current story";
  const bibleText = previousBible
    ? `\nCURRENT FACT LEDGER (update it: add the new facts from the fragment, mark changed states — e.g. a promise fulfilled — and keep everything still valid):\n${JSON.stringify(previousBible)}`
    : "";

  // August 23, 2026: the whole AI pipeline is in English (user decision).
  // The model answers with the EN keys; sanitizeBible maps them to the canonical ones.
  const systemInstruction = `You are a meticulous archivist of an interactive RPG story ("${storyTitle}") whose main character is ${charName}.
You receive an older fragment of the game's transcript${previousSummary ? `, a previously existing summary` : ""}${previousBible ? " and the current fact ledger" : ""}.
Your task: produce ONE updated summary + one updated fact ledger, in English, that will replace everything old.

RULES FOR THE SUMMARY (the "summary" field):
1. ${previousSummary ? "Integrate the previous summary with the new events from the fragment — nothing important from it may be lost. Translate any older Romanian content into English." : "Cover all events from the fragment."}
2. Keep: decisions made by ${charName}, key events, the state of relationships with NPCs, promises, revealed secrets, important items/resources, open narrative threads.
3. Drop long atmospheric descriptions, full quotes and phrasing — substance only.
4. Write in second person ("you met...", "you promised that..."), concise adventure-journal style.
5. Structure the summary into EXACTLY these five sections, each with its label on its own line, followed by the content:
DECISIONS: the important choices made by ${charName} and their consequences.
NPCS: every character met, who they are and your current relationship with them (friendship, hostility, debt).
PROMISES AND SECRETS: what you promised yourself or others, secrets you learn or keep.
ITEMS AND RESOURCES: things acquired, lost or desired; money, favors, documents.
OPEN THREADS: unanswered questions, looming threats, unfulfilled plans.
Do not skip any section; if there is nothing to say for one, write "(nothing yet)".
6. Maximum ~500 words for the summary.

RULES FOR THE FACT LEDGER (the "bible" field): short list, no long sentences; each fact
remains until explicitly replaced or fulfilled; update states (e.g. "active" → "fulfilled",
"held" → "lost") when the fragment shows a change.

RESPOND EXCLUSIVELY with a valid JSON object of exactly this shape:
{"summary": "the structured summary text", "bible": {"decisions": ["..."], "npcs": [{"name": "...", "who": "...", "relation": "..."}], "promises_secrets": [{"text": "...", "status": "active|fulfilled|revealed"}], "items": [{"name": "...", "description": "...", "status": "held|lost|wanted"}], "open_threads": ["..."]}}`;

  const userPrompt = `${previousSummary ? `PREVIOUS SUMMARY:\n${previousSummary}\n\n` : ""}${bibleText ? `${bibleText}\n\n` : ""}NEW TRANSCRIPT FRAGMENT:\n${formatTranscript(messages)}`;

  const result = await runAiWaterfall({
    label: "Summary",
    systemText: systemInstruction,
    turns: [{ role: "user", text: userPrompt }],
    jsonMode: true,
    maxTokens: 3072,
    temperature: 0.4,
    geminiModels: CANDIDATE_MODELS,
    maturity: typeof maturity === "string" && maturity ? maturity : "18",
    processText(raw) {
      const parsed = JSON.parse(extractJson(raw));
      const summaryText = typeof parsed.summary === "string" && parsed.summary.trim() ? parsed.summary.trim() : null;
      if (!summaryText) throw new Error("summary missing from AI reply");
      return { summary: summaryText, bible: sanitizeBible(parsed.bible) };
    },
  });

  if (!result.value) {
    return res.status(502).json({
      error: `Could not generate the story summary. Last errors: ${result.failures.slice(-2).join(" | ")}`,
    });
  }

  return res.status(200).json({ summary: result.value.summary, bible: result.value.bible, model: result.provider });
}

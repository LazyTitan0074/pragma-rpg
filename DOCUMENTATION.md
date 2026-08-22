# 📚 TECHNICAL DOCUMENTATION — PRAGMA Campaign Generator

> For developers and AI assistants. Covers installation, architecture, the AI
> cascade, testing and known limitations.
> User guide: `README.md`. First-time setup: `SETUP_GUIDE.md`.

---

## 1. Installation

### Prerequisites
- **Node.js** 18+ (developed on Node 24) — check with `node -v`
- **npm** (ships with Node.js)
- A free API key from Google AI Studio: https://aistudio.google.com/apikey

### Steps
```bash
npm install        # or: npm ci (clean install, exactly from the lockfile)
```

Dependencies (`package.json`):
| Package | Version | Role |
| :--- | :--- | :--- |
| `next` | ^16.3.1 | full-stack framework (Pages Router + API Routes, Turbopack) |
| `react` / `react-dom` | ^19.2.8 | UI (the official pairing for Next 16) |

### API key configuration
1. Copy `.env.local.example` to a new file named `.env.local`
2. Put your key in it, no quotes:

```env
GEMINI_API_KEY=your_key_here_no_quotes
```

⚠️ **Never commit your real key to git or share it.**
`.gitignore` excludes `.env.local`. Next.js loads it automatically at startup (server-side only).

---

## 2. Running

```bash
npm run dev          # development → http://localhost:3000 (ready in ~1s with Turbopack)
npm run build        # production build
npm start            # run the production build
node --test          # automated test suite (47 tests, zero dependencies)
```

---

## 3. Environment variables (`.env.local`)

| Variable | Required | Used in | Description |
| :--- | :--- | :--- | :--- |
| `GEMINI_API_KEY` | ✅ for max quality | `lib/aiWaterfall.js` (tier 1, all AI routes) | Google Gemini key, sent via the `x-goog-api-key` header (never in URLs). If missing, tier 1 is skipped and requests fall through to lower tiers. |
| `PRAGMA_DATA_DIR` | ❌ | `lib/savesDb.js` | SQLite saves folder. Default: `./data/` in the project (gitignored). |
| `GROQ_API_KEY` | ❌ | cascade tier 2 | Activates the Groq fallback tier (OpenAI-compatible API, free tier). |
| `GROQ_MODELS` | ❌ | idem | Comma-separated models. Default: `openai/gpt-oss-120b,openai/gpt-oss-20b`. |
| `CEREBRAS_API_KEY` | ❌ | idem | Second optional external provider (same OpenAI-compatible mechanism). |
| `OLLAMA_URL` / `OLLAMA_MODEL` / `OLLAMA_TIMEOUT_MS` | ❌ | tier 3 | Last-resort local Ollama. Defaults: `http://127.0.0.1:11434`, `qwen2.5:1.5b`, `180000` ms (cold start ~20 s on CPU, ~12 tok/s). |

Only `GEMINI_API_KEY` is required for top quality; the app still works without
it (Ollama-only mode). Everything else has sensible defaults.

---

## 4. Directory structure

```
pragma-rpg/
├── package.json                  # dependencies + npm scripts (dev/build/start)
├── next.config.js                # turbopack.root pinning
├── .gitignore                    # excludes .env.local, node_modules/, .next/, data/
├── .env.local.example            # template for .env.local
├── README.md                     # everyday user guide
├── SETUP_GUIDE.md                # step-by-step setup for absolute beginners
├── DOCUMENTATION.md              # this file
├── LICENSE                       # MIT
│
├── data/                         # (runtime) SQLite saves DB — gitignored
│
├── pages/
│   ├── index.js                  # main page; loads the client component
│   └── api/
│       ├── generate.js           # POST — generate a campaign (rate-limit, validation)
│       ├── play.js               # POST — live turn-by-turn Dungeon Master
│       ├── summarize.js          # POST — compress long history into rolling summary
│       ├── create-character.js   # POST — character sheet from free text (6/min)
│       └── saves.js              # GET/POST/DELETE — cross-device campaign sync
│
├── components/
│   ├── CampaignGenerator.jsx     # orchestrator (~1070 lines): state, game/save
│   │                             # logic, header, config bar, campaign display
│   ├── SavedCampaignsModal.jsx   # saved-campaigns manager modal
│   ├── CharactersLibrary.jsx     # character library modal
│   ├── CharacterCreator.jsx      # free-text creator + visual sheet editor
│   └── GameSection.jsx           # live Dungeon Master session UI
│
├── lib/
│   ├── prompt.js                 # VARIANTS (7 tones), MATURITY_LEVELS,
│   │                             # buildPrompt(), validateCampaign()
│   ├── aiWaterfall.js            # shared AI cascade: Gemini → Groq/Cerebras → Ollama
│   ├── characters.js             # character sheet schema + validation
│   ├── rateLimit.js              # in-memory rate limiting, fixed 60s window
│   ├── storyMemory.js            # thresholds + history trimming for rolling summary
│   ├── exporters.js              # Markdown/Obsidian/Foundry VTT/print HTML + list merge
│   ├── uiTheme.js                # visual themes (Dark Gold/Parchment/Modern Dark)
│   └── savesDb.js                # native SQLite (node:sqlite): schema + CRUD
│
└── tests/                        # node --test suites (47 tests total)
    ├── aiWaterfall.test.mjs      # cascade with per-provider mocks (8)
    ├── timeout.test.mjs          # TimeoutError semantics (2)
    ├── storyMemory.test.mjs      # history trimming logic (5)
    ├── characters.test.mjs       # sheet validation (6)
    ├── maturity.test.mjs         # content-level rules (7)
    ├── exporters.test.mjs        # exports & merging (11)
    └── savesDb.test.mjs          # schema, LWW upsert, listing, delete (8)
```

---

## 5. Flow: frontend → `/api/generate` → cascade

Purpose: generate a complete campaign (or a sandbox setting).

```
CampaignGenerator.jsx                 pages/api/generate.js              AI providers
─────────────────────                 ─────────────────────              ────────────
handleGenerate()
  │ POST /api/generate
  │ { character, variant, length, maturity }
  ├──────────────────────────────►   1. method != POST           → 405
  │                                  2. checkRateLimit (5/min)   → 429 if exceeded
  │                                  3. character missing        → 400
  │                                  │
  │                                  buildPrompt(character, variant, length, maturity)
  │                                    → EN prompt with requested JSON schema
  │                                    → maturity content rules
  │                                  │
  │                                  runAiWaterfall():
  │                                    tier 1 Gemini (CANDIDATE_MODELS one by one),
  │                                      POST /v1beta/models/{model}:generateContent
  │                                      headers: Content-Type + x-goog-api-key
  │                                      signal: AbortSignal.timeout(30000)
  │                                      generationConfig: { maxOutputTokens: 8192,
  │                                        temperature: 0.7, responseMimeType json }
  │                                      safetySettings: BLOCK_NONE ×4
  │                                    then tier 2 Groq/Cerebras (chat/completions,
  │                                      response_format json_object, max_tokens ≤4096),
  │                                    then tier 3 local Ollama (/api/chat,
  │                                      format json, 180s timeout)
  │                                  each reply: strip fences → JSON.parse →
  │                                    validateCampaign() → force maturity_rating
  │
  │   ◄────────────────────────────┤ 200 { campaign, usedModel }
  │   setCampaign(...)             (or 502 listing last failures when all fail)
  auto-save locally + server sync
```

Key details:
- `variant` comes from `VARIANTS`: politic, slice_of_life, mister, razboi, tragedie, erotic, brutal.
- `length`: `"sandbox"` (free mode), `"lunga"` (6 missions) or `"scurta"` (3 missions).
- Timeout (30s cloud / 180s Ollama), network errors, JSON parse failures and
  validation errors all advance automatically to the next tier.

## 6. Flow: frontend → `/api/play` → cascade

Purpose: live play — user sends actions, AI answers as the Dungeon Master.

```
sendGameAction(text)
  │ append player message
  │ POST /api/play { character, campaign, messages, summary?, maturity }
  ├──────────────────────────────►   405 / rate-limit (20/min) / campaign missing → 400
  │                                  builds systemInstruction:
  │                                    - character profile (JSON)
  │                                    - setting (title/setting/tone/premise/lore/npcs/mechanics)
  │                                    - chosen content level rules
  │                                    - sandbox rules OR mission-based rules
  │                                    - DM rules (second person, 1–3 paragraphs,
  │                                      mandatory closing question)
  │                                  maps messages → turns (user/model)
  │                                  runAiWaterfall() across tiers
  │   ◄────────────────────────────┤ 200 { reply, model }
  │   appends { role:"model" }     (or 502 when everything fails)
  rolling-summary check → maybe POST /api/summarize
  auto-save chat locally + server sync
```

Notes:
- The server is **stateless** — the front-end resends the recent chat window every
  turn; older history is represented by the rolling summary (see below).
- Rate limits are **separate per endpoint**: generations and chat don't consume
  each other's budgets.

### Rate limiting (`lib/rateLimit.js`)
- Fixed **60-second** window, in-memory counter (`Map`), zero dependencies.
- Bucket key: `endpoint:IP`, IP read from `req.socket.remoteAddress`
  (normalised `::ffff:`); `x-forwarded-for` is fallback only.
- Limits: **generate 5/min · play 20/min · summarize 10/min · create-character 6/min · saves 60/min**.
  Exceeded → **429** with a retry-after seconds count.

### Rolling summary (`/api/summarize` + `lib/storyMemory.js`)
When chat history exceeds **30 messages** (`SUMMARIZE_AFTER_MESSAGES`), the
front-end compresses the old part automatically:
1. `splitForSummarization()` splits history into "older" + last **12 turns**
   (`KEEP_RECENT_MESSAGES`) which stay in chat;
2. POST `/api/summarize` with the older messages (+ previous summary) →
   `{ summary, model }` — second-person journal-style summary, ~250 words;
3. state keeps summary + recent window; saves include `storySummary`;
4. `/api/play` injects the summary into the system instruction as certain memory;
5. resume of a saved campaign continues FROM the summary; if summarisation
   fails, play continues unaffected and retries next turn.

### Character creation (`/api/create-character`)
Receives `{ prompt }` (min 10 chars) → `{ character, model }`: a complete 9-field
sheet validated by `validateCharacterSheet()` (`lib/characters.js`). The sheet
becomes active with one click and joins the local library (max 30).

### Cross-device sync (`/api/saves` + `lib/savesDb.js`)
Campaigns live in server-side **SQLite** (`data/pragma.db`, configurable via
`PRAGMA_DATA_DIR`). localStorage stays instant cache + offline fallback.
- Endpoints: GET list / GET ?id= / POST upsert / DELETE ?id= (60/min).
- Conflict: last-write-wins by `updatedAt`; equal timestamps → last arrival wins.
- Client dual-write: localStorage first, non-blocking server push; on mount a
  bidirectional migration pulls/pushes differences.

---

## 7. Campaign schema (JSON)

`/api/generate` replies with this structure (validated by `validateCampaign()`):

```jsonc
{
  "title": "string",
  "setting": "string — place and period",
  "tone": "string — 2-3 words",
  "maturity_rating": "13+ / 16+ / 18+ / 21+ — forced to the user's selection",
  "premise": "string — 2-3 paragraphs",
  "lore": "string — world context",

  "missions": [                       // required, min 1
    {
      "title": "string",
      "difficulty": "\"easy\" | \"medium\" | \"hard\" | \"free\"",
      "description": "string",
      "objectives": ["string"],       // always sanitised to arrays
      "encounters": ["string"],
      "rewards": ["string"]
    }
  ],

  "npcs": [                           // required, min 1 (usually 5)
    {
      "name": "string",
      "role": "string",
      "personality": "string",
      "connection": "string"
    }
  ],

  "mechanics": ["string"],            // optional, sanitised arrays
  "endings": ["string"],

  // ─── Sandbox mode only ───
  "mode": "sandbox",
  "locations": [
    { "name": "string", "description": "string", "vibe": "string" }
  ]
}
```

Required at validation: `title, setting, tone, premise, lore, missions, npcs`.
`validateCampaign()` sanitises everything: coerces types, drops junk objects,
guarantees clean string arrays.

---

## 8. The multi-provider waterfall cascade

All AI routes share one cascade (`lib/aiWaterfall.js`). Tiers are attempted in
order until one succeeds:

| Tier | Provider | Models (in order) | Timeout |
| :--- | :--- | :--- | :--- |
| 1 | Google Gemini | generate: `gemini-flash-latest` → `gemini-2.5-flash-lite` → `gemini-2.5-flash` → `gemini-3.5-flash-lite` → `gemini-3.5-flash`; other routes start at `gemini-2.5-flash-lite` | 30 s |
| 2 | Groq *(when `GROQ_API_KEY` set)* | `openai/gpt-oss-120b` → `openai/gpt-oss-20b` | 30 s |
| 2b | Cerebras *(when key set)* | `llama3.1-8b` | 30 s |
| 3 | Local Ollama *(always present)* | `qwen2.5:1.5b` | 180 s |

Moving to the next tier happens when:
- the provider returns non-200 (**503** overload, **429** quota, **400** bad key);
- the attempt exceeds its timeout (`TimeoutError` classified distinctly);
- text comes back empty;
- JSON parsing or `validateCampaign()` fails (`/api/generate`, via `processText`).

Strict JSON modes are kept across tiers so front-end parsing never changes:
Gemini gets `responseMimeType: "application/json"`, Groq/Cerebras
`response_format: {type:"json_object"}`, Ollama `format: "json"`.

When **everything** fails → `502` with the last recorded errors. Each attempt
logs under the route label; logs never contain keys, full URLs or bodies.

Note: gpt-oss models on Groq reject `max_tokens` > 4096 with HTTP 413 — the
library caps `max_tokens` at 4096 for OpenAI-compatible providers.

---

## 9. Testing

```bash
node --test
```

Runs all suites (**47 tests**): multi-provider cascade with per-tier mocks
(`tests/aiWaterfall.test.mjs`), abort semantics (`tests/timeout.test.mjs`),
rolling-summary logic (`tests/storyMemory.test.mjs`), character-sheet validation
(`tests/characters.test.mjs`), maturity levels (`tests/maturity.test.mjs`),
exports & merging (`tests/exporters.test.mjs`) and the saves database
(`tests/savesDb.test.mjs`).

Manual verification trick: start the server with `$env:GEMINI_API_KEY="TEST_INVALID"`
(shell value wins over `.env.local`) — the 5 Gemini attempts must fail with 400
and replies must come from the next configured tier.

---

## 10. Known current limitations

1. **No authentication on the API; rate-limit only** — anyone who can reach the
   port can use endpoints up to their per-minute limits. Fine for personal use;
   public exposure would need real auth.
2. **In-memory rate limiting** — counters reset on restart, are per-process,
   and a fixed window allows a theoretical double burst at boundaries.
3. **Recent chat window is resent every turn** to `/api/play`; older history is
   represented by the rolling summary, which compresses (minor nuances can be lost).
4. **Minimal automated testing** — seven `node --test` suites (47 tests); no CI,
   no end-to-end framework, no live rate-limit tests.
5. **Orchestrator component remains large** — `CampaignGenerator.jsx` is ~1070
   lines with inline styles; further style extraction is deferred.
6. **Max generation length** — `maxOutputTokens: 8192` on `/api/generate`; an
   extremely long campaign could be truncated → invalid JSON → next tier tried.
7. **Content safety relies only on prompts** — safety settings are BLOCK_NONE;
   limits (e.g. no positive rape portrayal) are enforced solely through the
   maturity rule texts in `lib/prompt.js`.
8. **OneDrive-synced folders** can occasionally slow file operations during dev.

---

*Last updated: August 2026.*

# 🏛️ PRAGMA — RPG Adventure Generator & Simulator

> **In short:** Pragma is a smart program that invents interactive stories and tabletop RPG campaigns on the spot, then becomes your personal **Dungeon Master** you talk to through messages and play the adventure with in real time.

> 🎓 **First time installing anything?** Read **[SETUP_GUIDE.md](SETUP_GUIDE.md)** first — a step-by-step guide for people with zero technical experience. This README covers everyday use.

---

## 📖 What is Pragma? (Explained simply)

Imagine you want to live an adventure — say you're an influential mistress in Ancient Greece, a student at a high school full of secrets, or an advisor in a medieval kingdom:

1. **The app invents the whole story on the spot**: it creates missions (or an open world), supporting characters (allies, enemies, rivals), secrets and possible endings.
2. **You play the story like a WhatsApp conversation**: tell the AI what you want to do (*"I open the secret letter"*, *"I sit down and look around"*), and the AI replies and continues the story based on your decisions!

---

## 🎮 How to use the app (step by step)

No technical knowledge needed once it's running.

### Step 1: Open the app
1. Start it (see [SETUP_GUIDE.md](SETUP_GUIDE.md))
2. Open **`http://localhost:3000`** in your browser

### Step 2: Choose your story's shape
- **Character**: Lara comes preloaded (a respected, calm Mistress in ancient Athens). Load any other character with **📥 LOAD JSON**, or create one from a sentence with **🎭 CHARACTER CREATOR**.
- **Atmosphere (tone)** — 7 variants: Intrigue & Power Dynamics · Everyday Life · Mystery & Investigation · Tension & Survival · Psychological Drama · Erotic & Passion (18+) · Hard Action & Violence
- **Length/Format**: 🌟 Free Mode/Sandbox (default, endless story) · 📖 Long campaign (6 missions) · ⚡ One-shot (3 missions)
- **Content level** — coloured pills: **13+ / 16+ / 18+ / 21+**. The filter applies at generation AND on every Dungeon Master reply.

### Step 3: Press the red **GENERATE SETTING** button
After ~10–30 seconds you get: Premise · Context & Lore · Key Locations (Free Mode) or Missions · NPCs · Mechanics · Future Threads.

### Step 4: Play! 🕹️
Press the golden **START THE STORY LIVE** button. The Game Master describes the opening scene and asks *"What do you do now?"* — type whatever you want to do.

### Step 5: Saves are automatic 💾
- Everything saves as you play — you can't lose a story by accident.
- **📂 SAVED CAMPAIGNS** opens the manager: open where you left off, **duplicate** (alternate branches!), delete. The latest **20 campaigns** are kept.
- **Exports**: `📥 EXPORT JSON` (full save) · `👤 EXPORT CHARACTER` · `EXPORT MARKDOWN` · `🌿 OBSIDIAN` (tags + `[[NPC links]]`) · `🎲 FOUNDRY VTT` (journals + NPC sheets) · `📄 PDF` (elegant print view → Save as PDF).
- **👥 CHARACTERS** opens your character library (max 30, one-click switching).

> ℹ️ To protect the free AI quota, the app rate-limits itself: max **5 generations** and **20 chat messages** per minute. If you spam, you get a friendly message with the waiting time.

### Themes 🎨
Three visual themes in the header selector: **Dark Gold** (classic), **Ancient Parchment** and **Modern Dark**. Your choice is remembered.

---

## 🗂️ What's in the project folder

| File / folder | What it does |
| :--- | :--- |
| **`.env.local`** | **The safe with the password**: contains your secret Google key (`GEMINI_API_KEY`). Never share it. |
| **`components/CampaignGenerator.jsx`** | **The orchestrator**: state + game/save logic, header, config bar, campaign display. |
| **`components/SavedCampaignsModal.jsx`** | Saved-campaigns manager modal. |
| **`components/CharactersLibrary.jsx`** | Character library modal. |
| **`components/CharacterCreator.jsx`** | Free-text character creator + visual sheet editor. |
| **`components/GameSection.jsx`** | The live Dungeon Master session UI. |
| **`pages/index.js`** | Entry page served at `localhost:3000`. |
| **`pages/api/generate.js`** | **The campaign factory**: calls the AI cascade (5/min, 30s timeout per model) and produces the full setting. |
| **`pages/api/play.js`** | **The Dungeon Master's brain**: live turn-by-turn play (20/min). |
| **`pages/api/summarize.js`** | **The story archivist**: compresses long chat history into a rolling summary (10/min). |
| **`pages/api/create-character.js`** | Turns a free-text description into a complete character sheet (6/min). |
| **`pages/api/saves.js`** | **The synchroniser**: keeps campaigns on the server so phone and PC see the same list. |
| **`lib/prompt.js`** | **The rulebook**: tone variants, content-maturity rules, the JSON schema and its validation. |
| **`lib/aiWaterfall.js`** | **The fallback cascade**: orders AI providers (Gemini → Groq/Cerebras → local Ollama). |
| **`lib/rateLimit.js`** | **The rhythm guardian**: per-minute request limiting to protect the free quota. |
| **`lib/storyMemory.js`** | **The DM's memory**: thresholds and history trimming for the rolling summary. |
| **`lib/characters.js`** | Character sheet schema + validation. |
| **`lib/exporters.js`** | Markdown/Obsidian/Foundry VTT exports, print view, list merging. |
| **`lib/uiTheme.js`** | Visual themes (Dark Gold / Parchment / Modern Dark) via ThemeContext. |
| **`lib/savesDb.js`** | **The campaign vault**: server-side SQLite saves database. |
| **`tests/`** | Automated test suite (`node --test`, 47 tests, no dependencies). |
| **`DOCUMENTATION.md`** | Full technical documentation (for developers). |
| **`package.json`** | **The parts list**: Next.js + React. |

---

## ⚙️ Starting from scratch

1. Install Node.js from https://nodejs.org (LTS version)
2. Download this project (green **Code** button → **Download ZIP**) and extract it
3. Copy `.env.local.example` to `.env.local` and put your free key from https://aistudio.google.com/apikey in it
4. In a terminal opened in the project folder:
   ```bash
   npm install
   npm run dev
   ```
5. Open **http://localhost:3000**

Full hand-holding walkthrough: **[SETUP_GUIDE.md](SETUP_GUIDE.md)**.

---

## 🛡️ Smart technology under the hood

- **3-tier automatic fallback (Waterfall)**: if an AI model is busy, rate-limited or times out, the app moves on automatically: first between the **Gemini** models, then to the free **Groq** service, and finally to an **emergency local AI (Ollama)** running on your own machine. Play never stops because one provider is down.
- **Dungeon Master memory (rolling summary)**: in long sessions older story parts are automatically compressed into a summary the Game Master always remembers — chat stays fast, saves stay small.
- **Modern authentication**: the API key travels only in a secure header (`x-goog-api-key`), never in URLs.
- **Rate limiting**: internal guardian protecting the free quota.
- **100% structured output**: the AI delivers perfectly ordered, validated data.
- **Cross-device sync**: campaigns live in SQLite on the server; localStorage acts as instant cache and offline fallback.

---

## 🗺️ Roadmap snapshot

- [x] Complete campaign generator (premise, lore, sandbox/missions, NPCs, endings)
- [x] Live AI Dungeon Master (turn-by-turn chat)
- [x] Automatic local saving + saved-campaign manager
- [x] Extended DM memory (automatic rolling story summary)
- [x] AI safety nets: free Groq fallback + emergency local Ollama
- [x] Content maturity filters 13+/16+/18+/21+ with a visual selector
- [x] Character creator from free text, with visual editor and library
- [x] Professional exports: Obsidian, Foundry VTT, elegant PDF
- [ ] Local AI as primary engine (Ollama) — awaiting stronger hardware

---

*Built with passion for interactive stories and tabletop role-playing.*

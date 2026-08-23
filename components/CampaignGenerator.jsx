import React, { useState, useRef, useEffect, useContext } from "react";
import { VARIANTS, MATURITY_LEVELS } from "../lib/prompt";
import { splitForSummarization } from "../lib/storyMemory";
import { MAX_SAVED_CAMPAIGNS, mergeCampaignLists, campaignToMarkdown, campaignToObsidian, campaignToFoundryVTT, campaignToPrintHtml, downloadFile } from "../lib/exporters";
import { planSync } from "../lib/savesSync";
import { postJsonRetry } from "../lib/clientFetch";
import { THEMES, ThemeContext, loadSavedThemeId, saveThemeId } from "../lib/uiTheme";
import SavedCampaignsModal from "./SavedCampaignsModal";
import CharactersLibrary from "./CharactersLibrary";
import CharacterCreator from "./CharacterCreator";
import GameSection from "./GameSection";

// Maturity selector pill colors (Phase 2): from green to dark red.
const MATURITY_COLORS = { "13": "#5c7a6b", "16": "#8a6d3b", "18": "#a0622d", "21": "#6b2a2a" };

const STORAGE_KEY = "pragma_saved_campaigns_v1";
const DEVICE_ID_KEY = "pragma_device_id";
const CHARACTERS_KEY = "pragma_saved_characters_v1";
const MAX_SAVED_CHARACTERS = 60;

// Identity of the current browser, used when migrating saves to the server (Phase 6)
function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = `dev_${crypto.randomUUID ? crypto.randomUUID() : Date.now()}_${Math.floor(Math.random() * 1e6)}`;
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return "dev_unknown";
  }
}

// Pushes a record to the server. Fire-and-forget: failure never affects UX;
// local saves remain the immediate source, the server catches up when it can.
async function syncSaveToServer(record) {
  try {
    const res = await fetch("/api/saves", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ record }),
    });
    if (!res.ok) console.warn("Server sync failed (status", res.status + ")");
    return res.ok;
  } catch (e) {
    console.warn("Saves server unavailable — keeping local saves only:", e.message);
    return false;
  }
}

const DEFAULT_CHARACTER = {
  name: "Lara",
  role: "Domina — Mistress of the House of Columns",
  universe: "Ancient Greece, Athens, 420 BC. A grand house with a peristyle and columns. Slaves, courtiers, and free citizens who come seeking counsel.",
  philosophy: "Power isn't about making someone afraid. It's about making them want to be better.",
  household: "Villa near the Pnyx: 12 rooms, an inner garden, a secret chamber. 15 slaves, 5 free citizens, 3 guards — all loyal out of respect.",
  connections: "A Spartan general, a Phoenician merchant, a philosopher of justice, an archon.",
  speech: "Low, calm, measured. She never raises her voice and never explains twice.",
};

// Demo pair for NPC mode (point 4): the loaded sheet becomes the central
// character (NPC), while the player gets a separate, minimal protagonist.
const DEMO_NPC_SHEET = {
  name: "Lara Enache",
  role: "Head of the faculty — the dean's right hand",
  universe: "Present-day Bucharest, a renowned university with echoing corridors",
  appearance: "Around forty, immaculate: sharply tailored suits, just the right heels, a gaze that sizes you up within the first second.",
  personality: "Authoritative yet charming. Controls everything through finely dosed favors and fear; remembers absolutely everything she is told.",
  speech: "Calm, polished, full of questions that sound innocent and aren't.",
  philosophy: "Order is sacred. Whoever controls access controls people.",
  connections: "The rector, the head secretary, a few professors who owe their posts to her.",
  secrets: "Keeps compromising dossiers on half of the faculty council.",
};

const DEMO_PROTAGONIST_SHEET = {
  name: "Alex",
  role: "Second-year student, scholarship holder",
  universe: "The same university, present day",
  appearance: "Everyday: a backpack heavy with books, headphones around the neck, eyes tired from sleep lost to failed exam sessions.",
  personality: "Curious, stubborn, with a sense of justice that hasn't yet been spoken in full.",
  speech: "Direct, sometimes too direct for their own good.",
  philosophy: "Came here to learn, not to obey — but obedience is the mandatory first-year lesson.",
  connections: "A classmate who knows every rumor, an evasive academic advisor.",
  secrets: "The scholarship depends on the dean's signature — and that gives Alex a personal motive.",
};

function MissionCard({ mission, index, isSandbox }) {
  const t = useContext(ThemeContext);
  const [open, setOpen] = useState(true);
  return (
    <div style={{ border: "1px solid #3a3730", marginBottom: 10, background: t.panel }}>
      <div onClick={() => setOpen(!open)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", cursor: "pointer" }}>
        <span className="laramono" style={{ color: t.gold, fontSize: 12 }}>{isSandbox ? "🏁" : `${index + 1}.`}</span>
        <span style={{ flex: 1, fontSize: 16 }}>{mission.title}</span>
        <span className="laramono" style={{ fontSize: 10, color: t.green, letterSpacing: "0.1em" }}>
          {mission.difficulty?.toUpperCase()}
        </span>
        <span style={{ color: t.gold }}>{open ? "−" : "+"}</span>
      </div>
      {open && (
        <div style={{ padding: "0 14px 16px", fontSize: 14, lineHeight: 1.7, color: t.textDim }}>
          <p>{mission.description}</p>
          {mission.objectives?.length > 0 && (
            <>
              <b style={{ color: t.text }}>{isSandbox ? "Exploration opportunities" : "Objectives"}</b>
              <ul>{mission.objectives.map((o, i) => <li key={i}>{o}</li>)}</ul>
            </>
          )}
          {mission.encounters?.length > 0 && (
            <>
              <b style={{ color: t.text }}>Encounters / Events</b>
              <ul>{mission.encounters.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </>
          )}
          {mission.rewards?.length > 0 && (
            <>
              <b style={{ color: t.text }}>{isSandbox ? "Social fallout" : "Rewards"}</b>
              <ul>{mission.rewards.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Compact display name: "groq/openai/gpt-oss-120b" → "gpt-oss-120b (Groq)".
function shortModel(m) {
  if (!m) return null;
  const parts = String(m).split("/");
  if (parts.length === 1) return `${m} (Gemini)`;
  const provider = { groq: "Groq", mistral: "Mistral", ollama: "local" }[parts[0]] || parts[0];
  const model = parts[parts.length - 1];
  return `${model} (${provider})`;
}

export default function CampaignGenerator() {
  const [character, setCharacter] = useState(DEFAULT_CHARACTER);
  const [fileName, setFileName] = useState("Lara (default)");
  const [variant, setVariant] = useState("politic");
  const [length, setLength] = useState("sandbox");
  const [maturity, setMaturity] = useState("18");

  // NPC mode (point 4): the active JSON sheet becomes the story's central
  // character (an NPC played by the DM), while the user plays a separate
  // protagonist. Persisted per campaign (design decision, Aug 23).
  const [npcMode, setNpcMode] = useState(false);
  const [protagonist, setProtagonist] = useState(null);
  const [creatorTarget, setCreatorTarget] = useState("character");

  // Visual theme (Phase 7): persisted in localStorage, applied via ThemeContext
  const [themeId, setThemeId] = useState(() => loadSavedThemeId());
  const theme = THEMES[themeId] || THEMES.dark_gold;
  const [campaign, setCampaign] = useState(null);
  const [usedModel, setUsedModel] = useState(null);
  const [genDurationMs, setGenDurationMs] = useState(null);
  const genTimerRef = useRef(null);
  const genRateWaitRef = useRef(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState("");

  // ID of the current campaign, for saving / syncing
  const [currentId, setCurrentId] = useState(null);

  // Gameplay state
  const [showGame, setShowGame] = useState(false);
  const [gameMessages, setGameMessages] = useState([]);
  const [storySummary, setStorySummary] = useState("");
  // Ledger of hard facts (the story bible, point C) — updated on every
  // summarization, injected into the DM prompt separately from the narrative summary.
  const [storyBible, setStoryBible] = useState(null);
  const [gameLoading, setGameLoading] = useState(false);
  const [gameError, setGameError] = useState(null);
  const gameSectionRef = useRef(null);

  // Multi-device sync: guard against overlapping runs + debounce,
  // with the active session kept in a ref (so listeners always see its current value).
  const syncingRef = useRef(false);
  const lastSyncRef = useRef(0);
  const syncWithServerRef = useRef(null);
  const activeSessionRef = useRef({ id: null, open: false });
  const charactersSyncStarted = useRef(false);
  useEffect(() => {
    activeSessionRef.current = { id: currentId, open: showGame };
  }, [currentId, showGame]);

  // Local Storage & Saving
  const [savedCampaigns, setSavedCampaigns] = useState([]);
  const [showSavedModal, setShowSavedModal] = useState(false);
  const [saveNotification, setSaveNotification] = useState("");

  // Visual character creator (Phase 5)
  const [showCreator, setShowCreator] = useState(false);
  const [savedCharacters, setSavedCharacters] = useState([]);
  const [showCharModal, setShowCharModal] = useState(false);

  // Load saved campaigns from localStorage on mount + sync with the server
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) setSavedCampaigns(list);
      }
    } catch (e) {
      console.warn("Could not load saves from localStorage:", e);
    }

    // Two-way migration/sync (Phase 6 + point 1 fix, Aug 23):
    // a) push local campaigns that are missing on the server or newer than the copy there;
    // b) pull campaigns that are missing locally OR newer than the local copy — including
    //    existing campaigns modified meanwhile on another device (previously they were
    //    never updated and stayed stuck on the old version).
    // Runs on mount, when returning to the tab/window, and periodically (see effects below).
    async function runServerSync() {
      if (syncingRef.current) return;
      const now = Date.now();
      if (now - lastSyncRef.current < 3000) return; // debounce focus + polling landing together
      syncingRef.current = true;
      lastSyncRef.current = now;
      try {
        const res = await fetch("/api/saves");
        if (!res.ok) return;
        const data = await res.json();
        const serverList = Array.isArray(data.campaigns) ? data.campaigns : [];
        const tombstones = Array.isArray(data.tombstones) ? data.tombstones : [];

        // The local list is read fresh from localStorage on every run,
        // so it includes saves made after mount.
        let localList = [];
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) localList = parsed;
          }
        } catch {}

        const { toPush, toFetch, toDeleteLocally } = planSync(localList, serverList, tombstones);

        // Deletions made on another device while we were offline (tombstones).
        if (toDeleteLocally.length > 0) {
          const deadIds = new Set(toDeleteLocally.map((x) => x.id));
          const remaining = localList.filter((item) => !deadIds.has(item.id));
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
          } catch {}
          setSavedCampaigns(remaining);
          const session = activeSessionRef.current;
          const killedOpen = toDeleteLocally.find((x) => x.id === session.id);
          if (session.open && killedOpen) {
            setSaveNotification(`🗑️ "${killedOpen.title}" was deleted on another device.`);
            setTimeout(() => setSaveNotification(""), 6000);
          }
        }

        await Promise.allSettled(
          toPush.map((item) => syncSaveToServer({ ...item, deviceId: getDeviceId() }))
        );

        const pulled = [];
        for (const meta of toFetch.slice(0, MAX_SAVED_CAMPAIGNS)) {
          try {
            const r = await fetch(`/api/saves?id=${encodeURIComponent(meta.id)}`);
            if (!r.ok) break; // server became unavailable meanwhile
            const d = await r.json();
            if (d.record) pulled.push(d.record);
          } catch {
            break;
          }
        }

        if (pulled.length > 0) {
          setSavedCampaigns((prev) => {
            const merged = mergeCampaignLists(prev, pulled);
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
            } catch {}
            return merged;
          });
          // If the campaign OPEN in play has a newer version on another device,
          // don't overwrite the live session — just notify the user.
          const session = activeSessionRef.current;
          if (session.open) {
            const activeHit = pulled.find((rec) => rec.id === session.id);
            if (activeHit) {
              setSaveNotification(`🔄 "${activeHit.title}" has a newer version from another device — find it in SAVED CAMPAIGNS.`);
              setTimeout(() => setSaveNotification(""), 6000);
            }
          }
        }
      } catch (e) {
        console.warn("Server sync failed — working locally only:", e.message);
      } finally {
        syncingRef.current = false;
      }
    }
    syncWithServerRef.current = runServerSync;
    runServerSync();
  }, []);

  // Sync immediately when the user returns to the tab/app (typical flow:
  // "saved on PC, picking up on the phone") plus light polling (~25 s) only while
  // the page is visible: ~2 metadata requests/min, far below the route's 60/min limit.
  useEffect(() => {
    const onWake = () => {
      if (document.visibilityState === "visible") syncWithServerRef.current?.();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    const interval = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      syncWithServerRef.current?.();
    }, 25000);
    return () => {
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      clearInterval(interval);
    };
  }, []);

  // Character library (Phase 5 + server mirror, Aug 23): localStorage stays the
  // instant cache; the library is mirrored on the server via /api/characters so it
  // can be reached from any device. Characters are small — full list on every sync.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CHARACTERS_KEY);
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) setSavedCharacters(list);
      }
    } catch (e) {
      console.warn("Could not load saved characters:", e);
    }
    if (!charactersSyncStarted.current) {
      charactersSyncStarted.current = true;
      syncCharactersWithServer();
    }
  }, []);

  function persistCharacters(list) {
    setSavedCharacters(list);
    try {
      localStorage.setItem(CHARACTERS_KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      console.error("Error saving the character library:", e);
      return false;
    }
  }

  // ── Character library server sync ───────────────────────────────────
  function recordFromSheet(sheet) {
    return {
      id: sheet.id || `char_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      deviceId: getDeviceId(),
      character: sheet,
      updatedAt: sheet.updatedAt || new Date().toISOString(),
    };
  }

  async function pushCharacterToServer(sheet) {
    try {
      const res = await fetch("/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ record: { ...recordFromSheet(sheet), character: sheet } }),
      });
      if (res.ok) return true;
      console.warn("Could not push character to server:", res.status);
      return false;
    } catch (e) {
      console.warn("Could not push character to server:", e);
      return false;
    }
  }

  function deleteCharacterOnServer(id) {
    if (!id) return;
    fetch(`/api/characters?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch((e) =>
      console.warn("Server deletion failed:", e)
    );
  }

  async function syncCharactersWithServer() {
    let local = [];
    try {
      const raw = localStorage.getItem(CHARACTERS_KEY);
      local = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(local)) local = [];
    } catch {
      local = [];
    }

    let remoteRecords = [];
    let tombstones = [];
    try {
      const res = await fetch("/api/characters");
      if (res.ok) {
        const data = await res.json();
        remoteRecords = Array.isArray(data.characters) ? data.characters : [];
        tombstones = Array.isArray(data.tombstones) ? data.tombstones : [];
      }
    } catch (e) {
      console.warn("Character library: server unavailable, keeping local ones:", e);
      return;
    }

    // Tombstones: id → time of deletion. A deletion made on another device wins
    // over a stale local copy; a local edit NEWER than the tombstone
    // is intent to recreate and gets pushed again.
    const graveById = new Map(
      tombstones.filter((t) => t && t.id).map((t) => [t.id, typeof t.deletedAt === "number" ? t.deletedAt : Date.parse(t.deletedAt) || 0])
    );
    const isDead = (sheet) => {
      const grave = graveById.get(sheet.id);
      return grave !== undefined && (Date.parse(sheet.updatedAt) || 0) <= grave;
    };
    const isResurrected = (sheet) => {
      const grave = graveById.get(sheet.id);
      return grave !== undefined && (Date.parse(sheet.updatedAt) || 0) > grave;
    };

    // 1) Push locals that aren't on the server yet (tracked via serverSynced).
    const pushedNow = new Set();
    for (const sheet of local) {
      if (isDead(sheet)) continue; // the tombstone wins — don't push again
      if (isResurrected(sheet)) sheet.serverSynced = false; // edit newer than the deletion
      if (sheet.serverSynced) continue;
      const ok = await pushCharacterToServer(sheet);
      if (ok) {
        sheet.serverSynced = true;
        pushedNow.add(sheet.id);
      }
    }
    if (local.some((s) => s.serverSynced)) persistCharacters(local);

    // 2) Pull anything missing locally or newer on the server (LWW by updatedAt).
    const byId = new Map(local.map((s) => [s.id, s]));
    let merged = false;
    for (const rec of remoteRecords) {
      const existing = byId.get(rec.id);
      const remoteTime = typeof rec.updatedAt === "number" ? rec.updatedAt : Date.parse(rec.updatedAt) || 0;
      const localTime = existing ? Date.parse(existing.updatedAt) || 0 : -1;
      if (!existing || remoteTime > localTime) {
        byId.set(rec.id, { ...rec.character, id: rec.id, serverSynced: true, ...(Number.isFinite(remoteTime) ? { updatedAt: new Date(remoteTime).toISOString() } : {}) });
        merged = true;
      }
    }

    // 3) Apply propagated deletions (tombstones) + clean up synced ids
    //    that vanished from the server without a tombstone (e.g. DB restore).
    const remoteIds = new Set(remoteRecords.map((r) => r.id));
    for (const id of pushedNow) remoteIds.add(id);
    for (const sheet of [...byId.values()]) {
      if (!remoteIds.has(sheet.id) && (isDead(sheet) || sheet.serverSynced)) {
        byId.delete(sheet.id);
        merged = true;
      }
    }

    if (merged || local.some((s) => s.serverSynced)) {
      const list = [...byId.values()].slice(0, MAX_SAVED_CHARACTERS);
      persistCharacters(list);
    }
  }

  // Local save function. `overrides` allows passing in fresh values
  // (id/variant/length/character/usedModel) right after setState, which would
  // otherwise be read stale from state — fix for the R7 audit bug.
  function saveCampaignLocally(customCampaign = null, customMessages = null, manual = true, overrides = {}) {
    const campToSave = customCampaign || campaign;
    if (!campToSave) return;

    const msgsToSave = customMessages !== null ? customMessages : gameMessages;
    const saveId = overrides.id || currentId || `camp_${Date.now()}`;
    if (!overrides.id && !currentId) setCurrentId(saveId);

    const recCharacter = overrides.character !== undefined ? overrides.character : character;
    const recVariant = overrides.variant !== undefined ? overrides.variant : variant;
    const recLength = overrides.length !== undefined ? overrides.length : length;
    const recMaturity = overrides.maturity !== undefined ? overrides.maturity : maturity;
    const recUsedModel = overrides.usedModel !== undefined ? overrides.usedModel : usedModel;
    const recSummary = overrides.storySummary !== undefined ? overrides.storySummary : storySummary;
    const recBible = overrides.storyBible !== undefined ? overrides.storyBible : storyBible;
    const recNpcMode = overrides.npcMode !== undefined ? Boolean(overrides.npcMode) : npcMode;
    const recProtagonist = overrides.protagonist !== undefined ? overrides.protagonist : protagonist;

    const record = {
      id: saveId,
      deviceId: getDeviceId(),
      title: campToSave.title || "Untitled Campaign",
      setting: campToSave.setting || "Unknown",
      tone: campToSave.tone || "General",
      mode: campToSave.mode || (recLength === "sandbox" ? "sandbox" : "missions"),
      variant: recVariant,
      length: recLength,
      maturity: recMaturity,
      usedModel: recUsedModel,
      character: recCharacter,
      campaign: campToSave,
      gameMessages: msgsToSave,
      storySummary: recSummary || "",
      storyBible: recBible || null,
      npcMode: recNpcMode,
      protagonist: recProtagonist,
      updatedAt: new Date().toISOString(),
    };

    const buildUpdatedList = () => {
      const existing = savedCampaigns.filter((item) => item.id !== saveId);
      return [record, ...existing].slice(0, MAX_SAVED_CAMPAIGNS);
    };

    try {
      const updatedList = buildUpdatedList();
      setSavedCampaigns(updatedList);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));

      if (manual) {
        setSaveNotification("✅ Campaign saved to your computer!");
        setTimeout(() => setSaveNotification(""), 3500);
      }
    } catch (e) {
      // Probably localStorage quota exceeded: retry with a trimmed list
      console.error("Error saving to localStorage:", e);
      try {
        const trimmed = buildUpdatedList().slice(0, Math.ceil(MAX_SAVED_CAMPAIGNS / 2));
        setSavedCampaigns(trimmed);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
        if (manual) {
          setSaveNotification("⚠️ Not enough space — only the most recent campaigns were kept.");
          setTimeout(() => setSaveNotification(""), 3500);
        }
      } catch (e2) {
        console.error("The trimmed save failed as well:", e2);
        if (manual) {
          setSaveNotification("❌ Local save failed.");
          setTimeout(() => setSaveNotification(""), 3500);
        }
      }
    }

    // Server sync (Phase 6): non-blocking; even if localStorage failed completely,
    // the server acts as a safety net for the record.
    syncSaveToServer(record);
  }

  // Delete a saved campaign
  function deleteSavedCampaign(id, e) {
    if (e) e.stopPropagation();
    if (!confirm("Delete this saved campaign? It will be removed from ALL devices.")) return;
    const updated = savedCampaigns.filter((item) => item.id !== id);
    setSavedCampaigns(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (err) {
      console.error(err);
    }
    fetch(`/api/saves?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
    if (currentId === id) {
      setCurrentId(null);
    }
  }

  // Duplicate a saved campaign
  function duplicateSavedCampaign(item, e) {
    if (e) e.stopPropagation();
    const newId = `camp_${Date.now()}`;
    const cloned = {
      ...item,
      id: newId,
      title: `${item.title} (Copy)`,
      updatedAt: new Date().toISOString(),
    };
    const updatedList = [cloned, ...savedCampaigns];
    setSavedCampaigns(updatedList);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));
      setSaveNotification("📋 Campaign duplicated successfully!");
      setTimeout(() => setSaveNotification(""), 3500);
    } catch (err) {
      console.error(err);
    }
    syncSaveToServer({ ...cloned, deviceId: getDeviceId() });
  }

  // Load a campaign from the list
  function loadSavedCampaign(item) {
    setCurrentId(item.id);
    setCharacter(item.character || DEFAULT_CHARACTER);
    setFileName(item.character?.name ? `${item.character.name} (from save)` : "Saved character");
    setVariant(item.variant || "politic");
    setLength(item.length || "sandbox");
    setMaturity(item.maturity || "18");
    setNpcMode(Boolean(item.npcMode));
    setProtagonist(item.protagonist && typeof item.protagonist === "object" && Object.keys(item.protagonist).length ? item.protagonist : null);
    setCampaign(item.campaign);
    setUsedModel(item.usedModel || null);
    setGameMessages(Array.isArray(item.gameMessages) ? item.gameMessages : []);
    setStorySummary(item.storySummary || "");
    setStoryBible(item.storyBible && typeof item.storyBible === "object" ? item.storyBible : null);
    setShowGame(Array.isArray(item.gameMessages) && item.gameMessages.length > 0);
    setShowSavedModal(false);
    setError(null);
    setSaveNotification(`📖 Campaign loaded: "${item.title}"`);
    setTimeout(() => setSaveNotification(""), 3500);
  }

  // Full JSON export (campaign + chat history + character)
  function exportCampaignJSON() {
    if (!campaign) return;
    const payload = {
      version: "1.0",
      type: "pragma_campaign_save",
      exportedAt: new Date().toISOString(),
      character,
      campaign,
      gameMessages,
      storySummary: storySummary || "",
      storyBible,
      variant,
      length,
      maturity,
      usedModel,
      npcMode,
      protagonist,
    };
    const safeTitle = (campaign.title || "campaign").toLowerCase().replace(/[^a-z0-9_-]/gi, "_");
    downloadFile(`${safeTitle}_save.json`, JSON.stringify(payload, null, 2), "application/json");
  }

  // Export character JSON
  function exportCharacterJSON() {
    const safeName = (character.name || "character").toLowerCase().replace(/[^a-z0-9_-]/gi, "_");
    downloadFile(`character_${safeName}.json`, JSON.stringify(character, null, 2), "application/json");
  }

  // Exports from the modals (audit R10): payload built from the list item.
  function exportSavedItem(item) {
    const payload = {
      version: "1.0",
      type: "pragma_campaign_save",
      exportedAt: new Date().toISOString(),
      character: item.character,
      campaign: item.campaign,
      gameMessages: item.gameMessages || [],
      storySummary: item.storySummary || "",
      storyBible: item.storyBible || null,
      variant: item.variant,
      length: item.length,
      maturity: item.maturity || "18",
      usedModel: item.usedModel,
      npcMode: Boolean(item.npcMode),
      protagonist: item.protagonist,
    };
    const safe = (item.title || "campaign").toLowerCase().replace(/[^a-z0-9_-]/gi, "_");
    downloadFile(`${safe}_save.json`, JSON.stringify(payload, null, 2), "application/json");
  }

  function exportCharacterFile(item) {
    const safe = (item.name || "no_name").toLowerCase().replace(/[^a-z0-9_-]/gi, "_");
    downloadFile(`character_${safe}.json`, JSON.stringify(item, null, 2), "application/json");
  }

  // ── Visual character creator (Phase 5) ──────────────────────────────
  // The API call and editor live in components/CharacterCreator.jsx;
  // the parent only receives the final sheet, saves it to the library and activates it.

  // Saves the sheet to the library; if a character with the same name already
  // exists, the new version replaces it (library stays clean). Mirrored to the server.
  function saveCharacterToLibrary(sheet) {
    const previous = savedCharacters.find((c) => c.name === sheet.name);
    const filtered = savedCharacters.filter((c) => c.name !== sheet.name);
    const updated = [{ ...sheet, id: `char_${Date.now()}`, updatedAt: new Date().toISOString() }, ...filtered].slice(0, MAX_SAVED_CHARACTERS);
    persistCharacters(updated);
    pushCharacterToServer(updated[0]).then((ok) => {
      if (!ok) return;
      const fresh = updated.map((c) => (c.id === updated[0].id ? { ...c, serverSynced: true } : c));
      localStorage.setItem(CHARACTERS_KEY, JSON.stringify(fresh));
    });
    if (previous && previous.id && previous.id !== updated[0].id) {
      deleteCharacterOnServer(previous.id);
    }
    return updated[0];
  }

  function applyDraftCharacter(sheet) {
    if (!sheet?.name?.trim()) return;
    const saved = saveCharacterToLibrary(sheet);
    // In NPC mode, the creator can be opened targeted at the protagonist (point 4).
    if (creatorTarget === "protagonist") {
      setProtagonist(sheet);
      setShowCreator(false);
      setSaveNotification(`🧑 The protagonist "${saved.name}" is active and saved to the library!`);
      setTimeout(() => setSaveNotification(""), 3500);
      return;
    }
    setCharacter(sheet);
    setFileName(`${saved.name} (AI-created)`);
    setShowCreator(false);
    setSaveNotification(`🎭 Character "${saved.name}" is active and saved to the library!`);
    setTimeout(() => setSaveNotification(""), 3500);
  }

  // Demo pair for NPC mode: Lara = the faculty dean (central NPC), you = the student.
  function loadDemoNpcPair() {
    setCharacter(DEMO_NPC_SHEET);
    setFileName("Lara — faculty dean (NPC demo)");
    setProtagonist(DEMO_PROTAGONIST_SHEET);
    setNpcMode(true);
    setVariant("slice_of_life");
    setLength("sandbox");
    setError(null);
    setSaveNotification("🎬 Demo loaded: Lara is the central NPC, you play Alex, the student!");
    setTimeout(() => setSaveNotification(""), 3500);
  }

  function useSavedCharacter(item) {
    setCharacter(item);
    setFileName(`${item.name} (from library)`);
    setShowCharModal(false);
    setSaveNotification(`👤 The active character is now "${item.name}".`);
    setTimeout(() => setSaveNotification(""), 3500);
  }

  function deleteSavedCharacter(id, e) {
    if (e) e.stopPropagation();
    if (!confirm("Delete this character from the library?")) return;
    persistCharacters(savedCharacters.filter((c) => c.id !== id));
    deleteCharacterOnServer(id);
  }

  // Universal JSON file import (auto-detects: character sheet or campaign save)
  // Strict input validation — audit R11.
  function handleUploadJSON(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("The file is too large (max 5 MB). It doesn't look like a Pragma save.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      let parsed = null;
      try {
        parsed = JSON.parse(ev.target.result);
      } catch {
        setError("The selected file is not valid JSON.");
        return;
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setError("The JSON must be an object (a character sheet or a campaign save).");
        return;
      }

      // Case 1: a complete Pragma campaign save (structure verified, not just key presence)
      const campanieValida =
        parsed.campaign && typeof parsed.campaign === "object" && !Array.isArray(parsed.campaign) &&
        typeof parsed.campaign.title === "string" &&
        parsed.character && typeof parsed.character === "object" && !Array.isArray(parsed.character);
      if (campanieValida) {
          const loadedId = `camp_${Date.now()}`;
          setCurrentId(loadedId);
          setCharacter(parsed.character);
          setFileName(parsed.character.name ? `${parsed.character.name} (from JSON)` : file.name);
          setVariant(parsed.variant || "politic");
          setLength(parsed.length || "sandbox");
          setMaturity(parsed.maturity || "18");
          setNpcMode(Boolean(parsed.npcMode));
          setProtagonist(parsed.protagonist && typeof parsed.protagonist === "object" && Object.keys(parsed.protagonist).length ? parsed.protagonist : null);
          setCampaign(parsed.campaign);
          setUsedModel(parsed.usedModel || null);
          const msgs = Array.isArray(parsed.gameMessages) ? parsed.gameMessages : [];
          setGameMessages(msgs);
          setStorySummary(parsed.storySummary || "");
          setStoryBible(parsed.storyBible && typeof parsed.storyBible === "object" ? parsed.storyBible : null);
          setShowGame(msgs.length > 0);
          setError(null);

          // Auto-save into the local list (with freshly parsed values — R7 fix)
          saveCampaignLocally(parsed.campaign, msgs, false, {
            id: loadedId,
            character: parsed.character,
            variant: parsed.variant || "politic",
            length: parsed.length || "sandbox",
            maturity: parsed.maturity || "18",
            usedModel: parsed.usedModel,
            storySummary: parsed.storySummary || "",
            storyBible: parsed.storyBible || null,
            npcMode: Boolean(parsed.npcMode),
            protagonist: parsed.protagonist,
          });

          setSaveNotification(`📥 Full campaign restored: "${parsed.campaign.title}"`);
          setTimeout(() => setSaveNotification(""), 3500);
          return;
        }

        // Case 2: just a character sheet (e.g. Lara or a custom character)
        const nume = typeof parsed.name === "string" ? parsed.name.trim() : "";
        const rol = typeof parsed.role === "string" ? parsed.role.trim() : "";
        const univers = typeof parsed.universe === "string" ? parsed.universe.trim() : "";
        if (nume || rol || univers) {
          setCharacter(parsed);
          setFileName(nume ? `${nume} (from JSON)` : file.name);
          if (rol.toLowerCase().includes("liceu") || rol.toLowerCase().includes("elev") || rol.toLowerCase().includes("student")) {
            setVariant("slice_of_life");
            setLength("sandbox");
          }
          setSaveNotification(`👤 Character "${nume || "Anonymous"}" was loaded!`);
          setTimeout(() => setSaveNotification(""), 3500);
          return;
        }

        // If it carried save keys but the structure was broken, be more specific.
        setError(
          parsed.campaign || parsed.character
            ? "The campaign save is incomplete or corrupted (required fields are missing)."
            : "The JSON format was not recognized (expected a character sheet or a campaign save)."
        );
      };
    reader.readAsText(file);
    // Reset the input value so the same file can be uploaded again
    e.target.value = "";
  }

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setCampaign(null);
    setUsedModel(null);
    setGenDurationMs(null);
    setShowGame(false);
    setGameMessages([]);
    setStorySummary("");
    setStoryBible(null);
    const newId = `camp_${Date.now()}`;
    setCurrentId(newId);
    // Honest waiting: long campaigns produce large JSON that doesn't fit under
    // the fast provider's token ceiling → they go to the slow provider (Mistral,
    // ~1–2 min measured live). The user deserves to know this upfront.
    const t0 = Date.now();
    setStatus(
      length === "lunga"
        ? "Generating the long campaign… (detailed JSON — may take up to ~2 minutes)"
        : "Generating campaign…"
    );
    clearInterval(genTimerRef.current);
    genTimerRef.current = setInterval(() => {
      const s = Math.round((Date.now() - t0) / 1000);
      if (s >= 8) {
        const rateNote =
          genRateWaitRef.current > 0
            ? `rate limit — retrying automatically in ${genRateWaitRef.current}s · `
            : "";
        setStatus(
          length === "lunga"
            ? `Generating… ${s}s (${rateNote}slow detailed provider — normal up to ~2 min)`
            : `Generating… ${s}s (${rateNote}almost there)`
        );
      }
    }, 1000);
    try {
      const result = await postJsonRetry(
        "/api/generate",
        { character, variant, length, maturity, npcMode, protagonist },
        {
          retries: 1,
          onWait: (s) => {
            genRateWaitRef.current = s;
          },
        }
      );
      setStatus("Validating campaign structure...");
      const data = result.data;
      if (!result.ok || !data) throw new Error(data?.error || `Eroare server (${result.status})`);
      setCampaign(data.campaign);
      setUsedModel(data.usedModel);
      setGenDurationMs(Date.now() - t0);

      // Auto-save into local memory right after generation
      // (fresh id + usedModel — R7 fix: otherwise the second campaign overwrites the first)
      saveCampaignLocally(data.campaign, [], false, { id: newId, usedModel: data.usedModel, maturity, npcMode, protagonist });
    } catch (e) {
      setError(e.message || "Unexpected generation error.");
    } finally {
      clearInterval(genTimerRef.current);
      genTimerRef.current = null;
      genRateWaitRef.current = 0;
      setLoading(false);
      setStatus("");
    }
  }

  async function startGame() {
    setShowGame(true);
    setTimeout(() => {
      gameSectionRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);

    if (gameMessages.length === 0) {
      const initialPrompt = storySummary
        ? `Resume the story "${campaign.title}" exactly where it left off, building on the events in the story summary. Describe the next scene.`
        : campaign?.mode === "sandbox"
          ? `Start the free-form story "${campaign.title}". Drop me straight into the opening setting and describe the first scene.`
          : `Start the campaign "${campaign.title}". Put me in the opening scene of the first mission.`;
      await sendGameAction(initialPrompt, []);
    }
  }

  async function sendGameAction(actionText, customHistory = null) {
    if (!actionText || !actionText.trim()) return;
    const currentAction = actionText.trim();
    setGameLoading(true);
    setGameError(null);

    const history = customHistory !== null ? customHistory : gameMessages;
    const newMessages = actionText && history.length === 0 
      ? history 
      : [...history, { role: "user", text: currentAction }];

    if (!(actionText && history.length === 0)) {
      setGameMessages(newMessages);
    }

    try {
      const result = await postJsonRetry(
        "/api/play",
        {
          character,
          campaign,
          messages: newMessages,
          summary: storySummary || undefined,
          bible: storyBible || undefined,
          maturity,
          npcMode,
          protagonist,
        },
        {
          retries: 2,
          onWait: (s) => {
            setGameError(null);
            setSaveNotification(`⏳ Rate limit reached — retrying automatically in ${s}s...`);
            setTimeout(() => setSaveNotification(""), s * 1000);
          },
        }
      );

      const data = result.data;
      if (!result.ok || !data) throw new Error(data?.error || "Error receiving the reply.");

      let updatedChat = [
        ...(actionText && history.length === 0 ? [] : newMessages),
        { role: "model", text: data.reply },
      ];

      // Rolling summarization (audit R6): when the history grows too large, the
      // older part is compressed by the AI into a summary, and the chat/save keep
      // only the recent window. If summarization fails, the game continues unaffected.
      let currentSummary = storySummary;
      let currentBible = storyBible;
      const split = splitForSummarization(updatedChat);
      if (split) {
        try {
          // One polite retry: if it still hits 429, history stays intact
          // and the natural retry comes around on the next turn.
          const sresult = await postJsonRetry(
            "/api/summarize",
            {
              character,
              campaign,
              previousSummary: storySummary || undefined,
              previousBible: storyBible || undefined,
              messages: split.older,
              maturity,
              npcMode,
              protagonist,
            },
            { retries: 1 }
          );
          if (sresult.ok) {
            const sdata = sresult.data;
            if (sdata.summary) {
              currentSummary = sdata.summary;
              if (sdata.bible) currentBible = sdata.bible;
              updatedChat = split.recent;
            }
          } else {
            console.warn("Summarization deferred (status " + sresult.status + ") — history stays intact.");
          }
        } catch (sumErr) {
          console.warn("Summarization deferred (network error) — history stays intact:", sumErr);
        }
      }

      setStorySummary(currentSummary);
      setStoryBible(currentBible);
      setGameMessages(updatedChat);

      // Auto-save along the way as the chat progresses
      saveCampaignLocally(campaign, updatedChat, false, { storySummary: currentSummary, storyBible: currentBible });

    } catch (err) {
      setGameError(err.message || "Could not send the action.");
    } finally {
      setGameLoading(false);
    }
  }

  function resetGame() {
    if (!confirm("Reset the game session back to the beginning?")) return;
    setGameMessages([]);
    setStorySummary("");
    setStoryBible(null);
    setGameError(null);
    const initialPrompt = campaign?.mode === "sandbox"
      ? `Restart the story from the beginning in the original setting.`
      : `Start the campaign over from the very beginning.`;
    sendGameAction(initialPrompt, []);
  }

  const isSandbox = campaign?.mode === "sandbox" || length === "sandbox";
  const t = theme.vars;

  function exportPdf() {
    const win = window.open("", "_blank");
    if (!win) {
      setError("The browser blocked the print window — allow pop-ups for this site and try again.");
      return;
    }
    win.document.write(campaignToPrintHtml(campaign, character.name));
    win.document.close();
  }

  return (
    <ThemeContext.Provider value={t}>
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text, fontFamily: "'Crimson Pro', Georgia, serif" }}>
      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Crimson+Pro:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
          * { box-sizing: border-box; }
          .laramono { font-family: 'IBM Plex Mono', monospace; }
          button:focus, select:focus, input:focus, textarea:focus { outline: 2px solid #b8963e; outline-offset: 2px; }
          button { cursor: pointer; transition: all 0.2s ease; }
          button:hover { filter: brightness(1.15); }
          ul { margin: 4px 0 12px 18px; padding: 0; }
          li { margin-bottom: 3px; }
          .suggestion-chip {
            background: #2a251e;
            border: 1px solid #4a3e2b;
            color: #d1c5a5;
            padding: 6px 12px;
            font-size: 13px;
            border-radius: 4px;
            cursor: pointer;
            text-align: left;
          }
          .suggestion-chip:hover {
            background: #3d3425;
            border-color: #8a6d3b;
            color: #f5edd6;
          }
          .card-hover:hover {
            border-color: #8a6d3b !important;
            transform: translateY(-2px);
          }
        `}
      </style>

      {/* HEADER */}
      <header style={{ borderBottom: "1px solid #3a3730", padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div className="laramono" style={{ fontSize: 11, letterSpacing: "0.25em", color: t.gold }}>PRAGMA</div>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, margin: "4px 0 0", fontWeight: 600 }}>
            RPG Adventure Generator & Simulator
          </h1>
        </div>

        {/* TOP QUICK-ACTION BAR */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {/* BUTTON TO OPEN SAVED CAMPAIGNS */}
          <button
            onClick={() => setShowSavedModal(true)}
            className="laramono"
            style={{
              background: t.btnSecondary,
              color: t.goldBright,
              border: "1px solid #8a6d3b",
              padding: "9px 15px",
              fontSize: 12,
              letterSpacing: "0.08em",
              display: "flex",
              alignItems: "center",
              gap: 8,
              borderRadius: 4,
            }}
          >
            <span>📂 SAVED CAMPAIGNS</span>
            <span style={{ background: t.gold, color: t.bg, padding: "2px 7px", borderRadius: 10, fontSize: 10, fontWeight: 700 }}>
              {savedCampaigns.length}
            </span>
          </button>

          {/* SAVE CURRENT STATE BUTTON (WHEN A CAMPAIGN IS ACTIVE) */}
          {campaign && (
            <button
              onClick={() => saveCampaignLocally(null, null, true)}
              className="laramono"
              style={{
                background: t.successBg,
                color: t.greenText,
                border: "1px solid #5c7a6b",
                padding: "9px 15px",
                fontSize: 12,
                letterSpacing: "0.08em",
                borderRadius: 4,
              }}
            >
              💾 SAVE
            </button>
          )}

          {/* CAMPAIGN JSON EXPORT */}
          {campaign && (
            <button
              onClick={exportCampaignJSON}
              className="laramono"
              style={{
                background: t.panel,
                color: t.textDim,
                border: "1px solid #3a3730",
                padding: "9px 14px",
                fontSize: 12,
                letterSpacing: "0.08em",
                borderRadius: 4,
              }}
              title="Download the full campaign save as JSON"
            >
              📥 EXPORT JSON
            </button>
          )}

          {/* EXPORT CHARACTER */}
          <button
            onClick={exportCharacterJSON}
            className="laramono"
            style={{
              background: t.panel,
              color: t.textDim,
              border: "1px solid #3a3730",
              padding: "9px 14px",
              fontSize: 12,
              letterSpacing: "0.08em",
              borderRadius: 4,
            }}
            title="Download only the active character sheet as JSON"
          >
            👤 EXPORT CHARACTER
          </button>

          {/* CHARACTER CREATOR BUTTON (PHASE 5) */}
          <button
            onClick={() => { setCreatorTarget("character"); setShowCreator(!showCreator); }}
            className="laramono"
            style={{
              background: showCreator ? t.borderSoft : t.btnSecondary,
              color: t.text,
              border: "1px solid #8a6d3b",
              padding: "9px 15px",
              fontSize: 12,
              letterSpacing: "0.08em",
              borderRadius: 4,
            }}
            title="Create a new character from a free-text description"
          >
            🎭 CHARACTER CREATOR
          </button>

          {/* CHARACTERS LIBRARY (PHASE 5) */}
          <button
            onClick={() => setShowCharModal(true)}
            className="laramono"
            style={{
              background: t.btnSecondary,
              color: t.textDim,
              border: "1px solid #4a3e2b",
              padding: "9px 15px",
              fontSize: 12,
              letterSpacing: "0.08em",
              display: "flex",
              alignItems: "center",
              gap: 8,
              borderRadius: 4,
            }}
          >
            <span>👥 CHARACTERS</span>
            <span style={{ background: t.borderSoft, color: t.textBright, padding: "2px 7px", borderRadius: 10, fontSize: 10, fontWeight: 700 }}>
              {savedCharacters.length}
            </span>
          </button>

          {/* VISUAL THEME SELECTOR (PHASE 7) */}
          <select
            value={themeId}
            onChange={(e) => { setThemeId(e.target.value); saveThemeId(e.target.value); }}
            className="laramono"
            title="Change the app's visual theme"
            style={{ background: t.btnSecondary, color: t.textMid, border: `1px solid ${t.border}`, padding: "10px 12px", fontSize: 12, borderRadius: 4 }}
          >
            {Object.entries(THEMES).map(([id, th]) => (
              <option key={id} value={id}>{th.label}</option>
            ))}
          </select>
        </div>
      </header>

      {/* SAVE / RESTORE NOTIFICATION */}
      {saveNotification && (
        <div style={{
          background: t.successBg,
          color: t.greenBrightText,
          borderBottom: "1px solid #5c7a6b",
          padding: "10px 20px",
          textAlign: "center",
          fontSize: 14,
          fontWeight: 500,
        }}>
          {saveNotification}
        </div>
      )}

      {/* MODAL / MANAGER SAVED CAMPAIGNS */}
      {showSavedModal && (
        <SavedCampaignsModal
          campaigns={savedCampaigns}
          currentId={currentId}
          onClose={() => setShowSavedModal(false)}
          onLoad={loadSavedCampaign}
          onDuplicate={duplicateSavedCampaign}
          onDelete={deleteSavedCampaign}
          onExport={exportSavedItem}
        />
      )}

      {/* MODAL / CHARACTERS LIBRARY (PHASE 5) */}
      {showCharModal && (
        <CharactersLibrary
          characters={savedCharacters}
          activeName={character.name}
          onClose={() => setShowCharModal(false)}
          onUse={useSavedCharacter}
          onDelete={deleteSavedCharacter}
          onExport={exportCharacterFile}
        />
      )}

      {/* MAIN WORKING AREA */}
      <div style={{ maxWidth: 840, margin: "0 auto", padding: "28px 20px 80px" }}>
        {/* CONFIGURATION & UPLOAD BAR */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 24, alignItems: "center" }}>
          {/* UNIFIED JSON UPLOAD BUTTON (CHARACTER OR CAMPAIGN SAVE) */}
          <label className="laramono" style={{ border: "1px solid #3a3730", padding: "10px 16px", fontSize: 12, letterSpacing: "0.08em", background: t.panel, cursor: "pointer", borderRadius: 4 }}>
            📥 LOAD JSON
            <input type="file" accept=".json" onChange={handleUploadJSON} style={{ display: "none" }} />
          </label>
          <span className="laramono" style={{ fontSize: 12, color: t.gold }}>{fileName}</span>

          <select value={variant} onChange={(e) => setVariant(e.target.value)} className="laramono"
            style={{ background: t.panel, color: t.text, border: `1px solid ${t.border}`, padding: "10px 12px", fontSize: 12, borderRadius: 4, maxWidth: "100%", minWidth: 0 }}>
            {VARIANTS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>

          <select value={length} onChange={(e) => setLength(e.target.value)} className="laramono"
            style={{ background: t.panel, color: t.text, border: `1px solid ${t.border}`, padding: "10px 12px", fontSize: 12, borderRadius: 4, maxWidth: "100%", minWidth: 0 }}>
            <option value="sandbox">🌟 Free Mode / Sandbox</option>
            <option value="lunga">Long campaign (6 missions)</option>
            <option value="scurta">One-shot (3 missions)</option>
          </select>

          {/* VISUAL MATURITY LEVEL SELECTOR (PHASE 2) */}
          <div style={{ display: "flex", gap: 6, alignItems: "center" }} title={MATURITY_LEVELS.find((m) => m.id === maturity)?.desc || ""}>
            {MATURITY_LEVELS.map((m) => {
              const active = maturity === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setMaturity(m.id)}
                  className="laramono"
                  style={{
                    background: active ? MATURITY_COLORS[m.id] : "#221f1a",
                    color: active ? t.textBright : t.textMuted,
                    border: `1px solid ${active ? MATURITY_COLORS[m.id] : "#3a3730"}`,
                    padding: "9px 12px",
                    fontSize: 12,
                    fontWeight: active ? 700 : 400,
                    letterSpacing: "0.05em",
                    borderRadius: 4,
                  }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          {/* NPC MODE TOGGLE (point 4): the active sheet becomes the central character, you play a separate protagonist */}
          <button
            onClick={() => setNpcMode(!npcMode)}
            className="laramono"
            title="The active JSON sheet becomes the CENTRAL character of the story (an NPC played by the DM), while you get a separate protagonist — optionally with its own sheet."
            style={{
              background: npcMode ? MATURITY_COLORS["16"] : "#221f1a",
              color: npcMode ? t.textBright : t.textMuted,
              border: `1px solid ${npcMode ? MATURITY_COLORS["16"] : "#3a3730"}`,
              padding: "9px 12px",
              fontSize: 12,
              fontWeight: npcMode ? 700 : 400,
              letterSpacing: "0.05em",
              borderRadius: 4,
            }}
          >
            🎭 SHEET = NPC
          </button>

          <button onClick={handleGenerate} disabled={loading} className="laramono"
            style={{ background: loading ? t.border : t.danger, color: t.text, border: "1px solid #8a6d3b", padding: "11px 22px", fontSize: 12, letterSpacing: "0.1em", fontWeight: 600, borderRadius: 4 }}>
            {loading ? "GENERATING…" : "GENERATE SETTING"}
          </button>

          {loading && status && (
            <span className="laramono" style={{ fontSize: 11, color: t.green }}>{status}</span>
          )}
        </div>

        {/* NPC MODE PANEL (point 4): separate protagonist + demo example */}
        {npcMode && (
          <div style={{ border: `1px solid ${MATURITY_COLORS["16"]}`, background: t.panel, borderRadius: 4, padding: "14px 16px", marginBottom: 20, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 13, color: t.textDim, flex: 1, minWidth: 240 }}>
              🎭 <b style={{ color: t.gold }}>{character.name || "Active sheet"}</b> is the central character of the story (NPC). You play as:{" "}
              <b style={{ color: t.green }}>{protagonist?.name || "generic character (no sheet)"}</b>
            </span>
            <button onClick={() => { setCreatorTarget("protagonist"); setShowCreator(true); }} className="laramono"
              style={{ background: t.panel, color: t.textDim, border: `1px solid ${t.border}`, padding: "8px 12px", fontSize: 11, letterSpacing: "0.08em", borderRadius: 4 }}>
              {protagonist ? "CHANGE PROTAGONIST" : "CREATE PROTAGONIST"}
            </button>
            {protagonist && (
              <button onClick={() => setProtagonist(null)} className="laramono"
                title="Remove the protagonist's sheet — the DM will flesh them out generically as the story goes."
                style={{ background: t.panel, color: t.textMuted, border: `1px solid ${t.borderSoft}`, padding: "8px 12px", fontSize: 11, letterSpacing: "0.08em", borderRadius: 4 }}>
                NO SHEET
              </button>
            )}
            <button onClick={loadDemoNpcPair} className="laramono"
              title="Load the demo example: Lara = faculty dean (NPC), you = Alex, the student."
              style={{ background: t.panel, color: t.gold, border: "1px solid #8a6d3b", padding: "8px 12px", fontSize: 11, letterSpacing: "0.08em", borderRadius: 4 }}>
              🎬 LARA DEMO
            </button>
          </div>
        )}

        {/* VISUAL CHARACTER CREATOR (PHASE 5) — lives in components/CharacterCreator.jsx */}
        {showCreator && (
          <CharacterCreator maturity={maturity} onApply={applyDraftCharacter} onError={setError} applyTitle={creatorTarget === "protagonist" ? "Target: your PROTAGONIST (NPC mode)." : ""} />
        )}

        {error && (
          <div style={{ border: "1px solid #6b2a2a", background: t.dangerBg, color: t.dangerText, padding: "12px 16px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, fontSize: 14 }}>
            <span>{error}</span>
            <button onClick={handleGenerate} className="laramono"
              style={{ background: t.danger, color: t.text, border: "none", padding: "6px 14px", fontSize: 11, letterSpacing: "0.08em", whiteSpace: "nowrap" }}>
              TRY AGAIN
            </button>
          </div>
        )}

        {!campaign && !loading && (
          <div style={{ padding: "30px 20px", background: t.panel, border: "1px solid #3a3730", borderRadius: 4, textAlign: "center" }}>
            <p style={{ color: t.textMid, fontSize: 16, margin: "0 0 10px" }}>
              Pick the atmosphere and format you want, then hit <b>GENERATE SETTING</b>.
            </p>
            <p style={{ color: t.textMuted, fontSize: 14, margin: "0 0 14px" }}>
              In <b>Free Mode (Sandbox)</b>, the story has no chapter limit — play for as long as you like, one message at a time!
            </p>
            <p style={{ color: t.green, fontSize: 13, margin: 0 }}>
              💡 <i>All campaigns and Game Master conversations are saved automatically on your computer.</i>
            </p>
          </div>
        )}

        {campaign && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
              <div>
                <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, margin: "0 0 6px" }}>{campaign.title}</h2>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
                  {[
                    campaign.setting, 
                    campaign.tone, 
                    campaign.mode === "sandbox" ? "🌟 FREE MODE / SANDBOX" : `${campaign.missions?.length} missions`, 
                    campaign.maturity_rating || "16+", 
                    usedModel ? `⚙ ${shortModel(usedModel)}${genDurationMs ? ` · ${Math.round(genDurationMs / 1000)}s` : ""}` : null
                  ].filter(Boolean).map((tag, i) => (
                    <span key={i} className="laramono" style={{ fontSize: 10, letterSpacing: "0.08em", border: "1px solid #3a3730", padding: "4px 10px", color: t.green }}>{tag}</span>
                  ))}
                </div>
              </div>

              {/* MAIN ACTION BUTTONS */}
              <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
                <button onClick={startGame} className="laramono"
                  style={{ background: t.gold, color: t.bg, border: "1px solid #d4af37", padding: "12px 24px", fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", boxShadow: "0 4px 12px rgba(138,109,59,0.3)" }}>
                  🎮 {campaign.mode === "sandbox" ? "START THE STORY IN REAL TIME" : "PLAY THE CAMPAIGN NOW"}
                </button>
                <button onClick={() => saveCampaignLocally(null, null, true)} className="laramono"
                  style={{ background: t.successBg, color: t.greenText, border: "1px solid #5c7a6b", padding: "12px 18px", fontSize: 12, letterSpacing: "0.08em" }}>
                  💾 SAVE
                </button>
                <button onClick={exportCampaignJSON} className="laramono"
                  style={{ background: t.btnTertiary, color: t.textDim, border: "1px solid #4a3e2b", padding: "12px 18px", fontSize: 12, letterSpacing: "0.08em" }}
                  title="Download the full JSON file">
                  📥 EXPORT JSON
                </button>
                <button onClick={() => downloadFile(`${campaign.title}.md`, campaignToMarkdown(campaign), "text/markdown")} className="laramono"
                  style={{ background: t.btnTertiary, color: t.textDim, border: `1px solid ${t.borderSoft}`, padding: "12px 18px", fontSize: 12, letterSpacing: "0.08em" }}>
                  EXPORT MARKDOWN
                </button>
                <button onClick={() => downloadFile(`${campaign.title}_obsidian.md`, campaignToObsidian(campaign), "text/markdown")} className="laramono"
                  style={{ background: t.btnTertiary, color: t.textDim, border: `1px solid ${t.borderSoft}`, padding: "12px 18px", fontSize: 12, letterSpacing: "0.08em" }}
                  title="Markdown with tags and [[NPC]] links for Obsidian">
                  🌿 OBSIDIAN
                </button>
                <button onClick={() => downloadFile(`${campaign.title}_foundry.json`, JSON.stringify(campaignToFoundryVTT(campaign, character.name), null, 2), "application/json")} className="laramono"
                  style={{ background: t.btnTertiary, color: t.textDim, border: `1px solid ${t.borderSoft}`, padding: "12px 18px", fontSize: 12, letterSpacing: "0.08em" }}
                  title="Journals + NPC sheets in Foundry VTT adventure format">
                  🎲 FOUNDRY VTT
                </button>
                <button onClick={exportPdf} className="laramono"
                  style={{ background: t.btnTertiary, color: t.textDim, border: `1px solid ${t.borderSoft}`, padding: "12px 18px", fontSize: 12, letterSpacing: "0.08em" }}
                  title="Opens the printable version — choose 'Save as PDF' in the print dialog">
                  📄 PDF
                </button>
              </div>
            </div>

            <h3 style={{ color: t.gold, fontSize: 14, letterSpacing: "0.08em" }}>PREMISE</h3>
            <p style={{ lineHeight: 1.75, marginBottom: 20 }}>{campaign.premise}</p>

            <h3 style={{ color: t.gold, fontSize: 14, letterSpacing: "0.08em" }}>CONTEXT & LORE</h3>
            <p style={{ lineHeight: 1.75, marginBottom: 20 }}>{campaign.lore}</p>

            {/* LOCATIONS IN SANDBOX MODE */}
            {campaign.locations && campaign.locations.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ color: t.gold, fontSize: 14, letterSpacing: "0.08em", marginBottom: 10 }}>📍 KEY LOCATIONS</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
                  {campaign.locations.map((loc, idx) => (
                    <div key={idx} style={{ background: t.panel, border: "1px solid #3a3730", padding: "12px 14px", borderRadius: 4 }}>
                      <div style={{ fontWeight: 600, color: t.textBright, fontSize: 15, marginBottom: 4 }}>{loc.name}</div>
                      <div style={{ fontSize: 13, color: t.textDimmer, lineHeight: 1.5 }}>{loc.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <h3 style={{ color: t.gold, fontSize: 14, letterSpacing: "0.08em", marginBottom: 10 }}>
              {campaign.mode === "sandbox" ? "STARTING POINT" : "MISSIONS"}
            </h3>
            {campaign.missions?.map((m, i) => (
              <MissionCard key={i} mission={m} index={i} isSandbox={campaign.mode === "sandbox"} />
            ))}

            <h3 style={{ color: t.gold, fontSize: 14, letterSpacing: "0.08em", marginTop: 24 }}>SUPPORTING CHARACTERS (NPCS)</h3>
            {campaign.npcs?.map((n, i) => {
              const conn = n.connection || n.connection_to_lara || n.connection_to_character || "";
              return (
                <div key={i} style={{ marginBottom: 10, fontSize: 14 }}>
                  <b>{n.name}</b> — {n.role}<br />
                  <span style={{ color: t.textDimmer }}>{n.personality} {conn ? `(${conn})` : ""}</span>
                </div>
              );
            })}

            <h3 style={{ color: t.gold, fontSize: 14, letterSpacing: "0.08em", marginTop: 20 }}>MECHANICS & DYNAMICS</h3>
            <ul>{campaign.mechanics?.map((m, i) => <li key={i}>{m}</li>)}</ul>

            <h3 style={{ color: t.gold, fontSize: 14, letterSpacing: "0.08em" }}>FUTURE DIRECTIONS</h3>
            <ul>{campaign.endings?.map((e, i) => <li key={i}>{e}</li>)}</ul>

            {/* GAMEPLAY SECTION — UI in components/GameSection.jsx, logic stays here */}
            {showGame && (
              <GameSection
                storyBible={storyBible}
                campaign={campaign}
                characterName={npcMode ? (protagonist?.name || "Main Character") : character.name}
                messages={gameMessages}
                storySummary={storySummary}
                loading={gameLoading}
                error={gameError}
                sectionRef={gameSectionRef}
                onSend={sendGameAction}
                onSave={() => saveCampaignLocally(null, null, true)}
                onReset={resetGame}
              />
            )}
          </div>
        )}
      </div>
    </div>
    </ThemeContext.Provider>
  );
}

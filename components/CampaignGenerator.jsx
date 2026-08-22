import React, { useState, useRef, useEffect, useContext } from "react";
import { VARIANTS, MATURITY_LEVELS } from "../lib/prompt";
import { splitForSummarization } from "../lib/storyMemory";
import { MAX_SAVED_CAMPAIGNS, mergeCampaignLists, campaignToMarkdown, campaignToObsidian, campaignToFoundryVTT, campaignToPrintHtml, downloadFile } from "../lib/exporters";
import { THEMES, ThemeContext, loadSavedThemeId, saveThemeId } from "../lib/uiTheme";
import SavedCampaignsModal from "./SavedCampaignsModal";
import CharactersLibrary from "./CharactersLibrary";
import CharacterCreator from "./CharacterCreator";
import GameSection from "./GameSection";

// Colour pills of the maturity selector (Phase 2): green → dark red.
const MATURITY_COLORS = { "13": "#5c7a6b", "16": "#8a6d3b", "18": "#a0622d", "21": "#6b2a2a" };

const STORAGE_KEY = "pragma_saved_campaigns_v1";
const DEVICE_ID_KEY = "pragma_device_id";
const CHARACTERS_KEY = "pragma_saved_characters_v1";
const MAX_SAVED_CHARACTERS = 30;

// Browser identity, for migrating saves to the server (Phase 6)
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

// Pushes a record to the server. Fire-and-forget: failure never hurts UX,
// local saves stay the immediate source, the server catches up when it can.
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
    console.warn("Save server unavailable — keeping local-only saves:", e.message);
    return false;
  }
}

const DEFAULT_CHARACTER = {
  name: "Lara",
  role: "Mistress — Lady of the Pillared House",
  universe: "Ancient Greece, Athens, 420 BC. A grand house with a peristyle and columns. Slaves, courtiers and free citizens coming to seek her counsel.",
  philosophy: "Power is not about making someone afraid. It is about making them want to be better.",
  household: "Villa near the Pnyx: 12 rooms, an inner garden, a hidden chamber. 15 slaves, 5 free servants, 3 guards — all loyal out of respect.",
  connections: "A Spartan general, a Phoenician merchant, a philosopher of justice, an archon.",
  speech: "Low, calm, measured. Never raises her voice, never explains twice.",
};

function MissionCard({ mission, index, isSandbox }) {
  const t = useContext(ThemeContext);
  const [open, setOpen] = useState(true);
  return (
    <div style={{ border: `1px solid ${t.border}`, marginBottom: 10, background: t.panel }}>
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
              <b style={{ color: t.text }}>{isSandbox ? "Things to explore" : "Objectives"}</b>
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
              <b style={{ color: t.text }}>{isSandbox ? "Social consequences" : "Rewards"}</b>
              <ul>{mission.rewards.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function CampaignGenerator() {
  const [character, setCharacter] = useState(DEFAULT_CHARACTER);
  const [fileName, setFileName] = useState("Lara (default)");
  const [variant, setVariant] = useState("politic");
  const [length, setLength] = useState("sandbox");
  const [maturity, setMaturity] = useState("18");

  // Visual theme (Phase 7): persisted in localStorage, applied via ThemeContext
  const [themeId, setThemeId] = useState(() => loadSavedThemeId());
  const theme = THEMES[themeId] || THEMES.dark_gold;

  const [campaign, setCampaign] = useState(null);
  const [usedModel, setUsedModel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState("");

  // Current campaign id, used by save / sync
  const [currentId, setCurrentId] = useState(null);

  // Gameplay state
  const [showGame, setShowGame] = useState(false);
  const [gameMessages, setGameMessages] = useState([]);
  const [storySummary, setStorySummary] = useState("");
  const [gameLoading, setGameLoading] = useState(false);
  const [gameError, setGameError] = useState(null);
  const gameSectionRef = useRef(null);

  // Local storage & saving
  const [savedCampaigns, setSavedCampaigns] = useState([]);
  const [showSavedModal, setShowSavedModal] = useState(false);
  const [saveNotification, setSaveNotification] = useState("");

  // Visual character creator (Phase 5)
  const [showCreator, setShowCreator] = useState(false);
  const [savedCharacters, setSavedCharacters] = useState([]);
  const [showCharModal, setShowCharModal] = useState(false);

  // Load saved campaigns from localStorage on mount + sync with the server
  useEffect(() => {
    let localList = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          localList = list;
          setSavedCampaigns(list);
        }
      }
    } catch (e) {
      console.warn("Could not load saved campaigns from localStorage:", e);
    }

    // Bidirectional migration/sync (Phase 6):
    // a) push local campaigns that are missing or newer than the server copy;
    // b) pull campaigns that exist on the server but not locally.
    async function syncWithServer() {
      try {
        const res = await fetch("/api/saves");
        if (!res.ok) return;
        const data = await res.json();
        const serverList = Array.isArray(data.campaigns) ? data.campaigns : [];
        const serverTime = new Map(serverList.map((c) => [c.id, c.updatedAt]));

        const toPush = localList.filter((item) => {
          const srvTime = serverTime.get(item.id);
          return srvTime === undefined || new Date(item.updatedAt).getTime() > srvTime;
        });
        await Promise.allSettled(
          toPush.map((item) => syncSaveToServer({ ...item, deviceId: getDeviceId() }))
        );

        const localIds = new Set(localList.map((i) => i.id));
        const missingLocally = serverList.filter((c) => !localIds.has(c.id));
        const pulled = [];
        for (const meta of missingLocally.slice(0, MAX_SAVED_CAMPAIGNS)) {
          try {
            const r = await fetch(`/api/saves?id=${encodeURIComponent(meta.id)}`);
            if (r.ok) {
              const d = await r.json();
              if (d.record) pulled.push(d.record);
            }
          } catch {
            break; // server went away meanwhile
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
        }
      } catch (e) {
        console.warn("Server sync failed — running local-only:", e.message);
      }
    }
    syncWithServer();
  }, []);

  // Character library (Phase 5): localStorage only — sheets are small,
  // portable through JSON export, and need no server sync.
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

  // Local save function. `overrides` lets callers pass fresh values
  // (id/variant/length/character/usedModel) right after setState — fix for R7.
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
      // Probably quota exceeded: retry with a trimmed list
      console.error("localStorage save error:", e);
      try {
        const trimmed = buildUpdatedList().slice(0, Math.ceil(MAX_SAVED_CAMPAIGNS / 2));
        setSavedCampaigns(trimmed);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
        if (manual) {
          setSaveNotification("⚠️ Not enough space — only the most recent campaigns were kept.");
          setTimeout(() => setSaveNotification(""), 3500);
        }
      } catch (e2) {
        console.error("Trimmed save also failed:", e2);
        if (manual) {
          setSaveNotification("❌ Local save error.");
          setTimeout(() => setSaveNotification(""), 3500);
        }
      }
    }

    // Server sync (Phase 6): non-blocking; even when localStorage fails
    // completely, the server becomes a safety net for the record.
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
    setCampaign(item.campaign);
    setUsedModel(item.usedModel || null);
    setGameMessages(Array.isArray(item.gameMessages) ? item.gameMessages : []);
    setStorySummary(item.storySummary || "");
    setShowGame(Array.isArray(item.gameMessages) && item.gameMessages.length > 0);
    setShowSavedModal(false);
    setError(null);
    setSaveNotification(`📖 Loaded campaign: "${item.title}"`);
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
      variant,
      length,
      maturity,
      usedModel,
    };
    const safeTitle = (campaign.title || "campaign").toLowerCase().replace(/[^a-z0-9_-]/gi, "_");
    downloadFile(`${safeTitle}_save.json`, JSON.stringify(payload, null, 2), "application/json");
  }

  // Export active character as JSON
  function exportCharacterJSON() {
    const safeName = (character.name || "character").toLowerCase().replace(/[^a-z0-9_-]/gi, "_");
    downloadFile(`character_${safeName}.json`, JSON.stringify(character, null, 2), "application/json");
  }

  // Exports from modals (audit R10): payload built from the list item.
  function exportSavedItem(item) {
    const payload = {
      version: "1.0",
      type: "pragma_campaign_save",
      exportedAt: new Date().toISOString(),
      character: item.character,
      campaign: item.campaign,
      gameMessages: item.gameMessages || [],
      storySummary: item.storySummary || "",
      variant: item.variant,
      length: item.length,
      maturity: item.maturity || "18",
      usedModel: item.usedModel,
    };
    const safe = (item.title || "campaign").toLowerCase().replace(/[^a-z0-9_-]/gi, "_");
    downloadFile(`${safe}_save.json`, JSON.stringify(payload, null, 2), "application/json");
  }

  function exportCharacterFile(item) {
    const safe = (item.name || "unnamed").toLowerCase().replace(/[^a-z0-9_-]/gi, "_");
    downloadFile(`character_${safe}.json`, JSON.stringify(item, null, 2), "application/json");
  }

  // Universal JSON file upload (auto-detects: character sheet or campaign save)
  // Strict input validation — audit R11.
  function handleUploadJSON(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("File is too large (max 5 MB). It does not look like a Pragma save.");
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

      // Case 1: a complete Pragma campaign save (structure checked, not just presence)
      const validCampaign =
        parsed.campaign && typeof parsed.campaign === "object" && !Array.isArray(parsed.campaign) &&
        typeof parsed.campaign.title === "string" &&
        parsed.character && typeof parsed.character === "object" && !Array.isArray(parsed.character);
      if (validCampaign) {
        const loadedId = `camp_${Date.now()}`;
        setCurrentId(loadedId);
        setCharacter(parsed.character);
        setFileName(parsed.character.name ? `${parsed.character.name} (from JSON)` : file.name);
        setVariant(parsed.variant || "politic");
        setLength(parsed.length || "sandbox");
        setMaturity(parsed.maturity || "18");
        setCampaign(parsed.campaign);
        setUsedModel(parsed.usedModel || null);
        const msgs = Array.isArray(parsed.gameMessages) ? parsed.gameMessages : [];
        setGameMessages(msgs);
        setStorySummary(parsed.storySummary || "");
        setShowGame(msgs.length > 0);
        setError(null);

        // Auto-save into the local list (freshly parsed values — fix R7)
        saveCampaignLocally(parsed.campaign, msgs, false, {
          id: loadedId,
          character: parsed.character,
          variant: parsed.variant || "politic",
          length: parsed.length || "sandbox",
          maturity: parsed.maturity || "18",
          usedModel: parsed.usedModel,
          storySummary: parsed.storySummary || "",
        });

        setSaveNotification(`📥 Restored full campaign: "${parsed.campaign.title}"`);
        setTimeout(() => setSaveNotification(""), 3500);
        return;
      }

      // Case 2: just a character sheet (e.g. Lara or a custom one)
      const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
      const role = typeof parsed.role === "string" ? parsed.role.trim() : "";
      const universe = typeof parsed.universe === "string" ? parsed.universe.trim() : "";
      if (name || role || universe) {
        setCharacter(parsed);
        setFileName(name ? `${name} (from JSON)` : file.name);
        if (role.toLowerCase().includes("high school") || role.toLowerCase().includes("student") || role.toLowerCase().includes("pupil")) {
          setVariant("slice_of_life");
          setLength("sandbox");
        }
        setSaveNotification(`👤 Character "${name || "Anonymous"}" loaded!`);
        setTimeout(() => setSaveNotification(""), 3500);
        return;
      }

      // If it had save keys but a broken structure, be more specific.
      setError(
        parsed.campaign || parsed.character
          ? "The campaign save is incomplete or corrupt (required fields are missing)."
          : "JSON format not recognised (must be a character sheet or a campaign save)."
      );
    };
    reader.readAsText(file);
    // Reset input value so the same file can be re-uploaded
    e.target.value = "";
  }

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setCampaign(null);
    setUsedModel(null);
    setShowGame(false);
    setGameMessages([]);
    setStorySummary("");
    const newId = `camp_${Date.now()}`;
    setCurrentId(newId);
    setStatus("Connecting to Gemini AI...");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ character, variant, length, maturity }),
      });
      setStatus("Validating campaign structure...");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Server error (${res.status})`);
      setCampaign(data.campaign);
      setUsedModel(data.usedModel);

      // Auto-save right after generation (fresh id + usedModel — fix R7)
      saveCampaignLocally(data.campaign, [], false, { id: newId, usedModel: data.usedModel, maturity });
    } catch (e) {
      setError(e.message || "Unexpected error during generation.");
    } finally {
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
        ? `Resume the story "${campaign.title}" exactly where it left off, starting from the events in the story summary. Describe the next scene.`
        : campaign?.mode === "sandbox"
          ? `Begin the free-form story "${campaign.title}". Put me directly into the opening setting and describe the first scene.`
          : `Begin the campaign "${campaign.title}". Put me into the opening scene of the first mission.`;
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
      const res = await fetch("/api/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          character,
          campaign,
          messages: newMessages,
          summary: storySummary || undefined,
          maturity,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error receiving the response.");

      let updatedChat = [
        ...(actionText && history.length === 0 ? [] : newMessages),
        { role: "model", text: data.reply },
      ];

      // Rolling summarisation (audit R6): when history grows too large, the old
      // part is compressed by the AI into a summary while chat/saves keep only
      // the recent window. If summarisation fails, play continues unaffected.
      let currentSummary = storySummary;
      const split = splitForSummarization(updatedChat);
      if (split) {
        try {
          const sres = await fetch("/api/summarize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              character,
              campaign,
              previousSummary: storySummary || undefined,
              messages: split.older,
            }),
          });
          if (sres.ok) {
            const sdata = await sres.json();
            if (sdata.summary) {
              currentSummary = sdata.summary;
              updatedChat = split.recent;
            }
          } else {
            console.warn("Summarisation postponed (status " + sres.status + ") — history stays intact.");
          }
        } catch (sumErr) {
          console.warn("Summarisation postponed (network error) — history stays intact:", sumErr);
        }
      }

      setStorySummary(currentSummary);
      setGameMessages(updatedChat);

      // Auto-save while chatting
      saveCampaignLocally(campaign, updatedChat, false, { storySummary: currentSummary });

    } catch (err) {
      setGameError(err.message || "Could not send the action.");
    } finally {
      setGameLoading(false);
    }
  }

  function resetGame() {
    if (!confirm("Restart the play session from the beginning?")) return;
    setGameMessages([]);
    setStorySummary("");
    setGameError(null);
    const initialPrompt = campaign?.mode === "sandbox"
      ? "Start the story over from the beginning, in the original setting."
      : "Start the campaign over from the very beginning.";
    sendGameAction(initialPrompt, []);
  }

  // ── Visual character creator (Phase 5) ────────────────────────────────
  // The API call and editor live in components/CharacterCreator.jsx;
  // the parent receives only the final sheet, saves it to the library and activates it.

  function saveCharacterToLibrary(sheet) {
    const filtered = savedCharacters.filter((c) => c.name !== sheet.name);
    const updated = [{ ...sheet, id: `char_${Date.now()}`, updatedAt: new Date().toISOString() }, ...filtered].slice(0, MAX_SAVED_CHARACTERS);
    persistCharacters(updated);
    return updated[0];
  }

  function applyDraftCharacter(sheet) {
    if (!sheet?.name?.trim()) return;
    const saved = saveCharacterToLibrary(sheet);
    setCharacter(sheet);
    setFileName(`${saved.name} (created with AI)`);
    setShowCreator(false);
    setSaveNotification(`🎭 Character "${saved.name}" is now active and saved to the library!`);
    setTimeout(() => setSaveNotification(""), 3500);
  }

  function useSavedCharacter(item) {
    setCharacter(item);
    setFileName(`${item.name} (from library)`);
    setShowCharModal(false);
    setSaveNotification(`👤 Active character is now "${item.name}".`);
    setTimeout(() => setSaveNotification(""), 3500);
  }

  function deleteSavedCharacter(id, e) {
    if (e) e.stopPropagation();
    if (!confirm("Remove this character from the library?")) return;
    persistCharacters(savedCharacters.filter((c) => c.id !== id));
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
      <header style={{ borderBottom: `1px solid ${t.border}`, padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div className="laramono" style={{ fontSize: 11, letterSpacing: "0.25em", color: t.gold }}>PRAGMA</div>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, margin: "4px 0 0", fontWeight: 600 }}>
            RPG Adventure Generator & Simulator
          </h1>
        </div>

        {/* QUICK ACTIONS BAR */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => setShowSavedModal(true)}
            className="laramono"
            style={{
              background: t.btnSecondary,
              color: t.goldBright,
              border: `1px solid ${t.gold}`,
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

          {campaign && (
            <button
              onClick={() => saveCampaignLocally(null, null, true)}
              className="laramono"
              style={{
                background: t.successBg,
                color: t.greenText,
                border: `1px solid ${t.green}`,
                padding: "9px 15px",
                fontSize: 12,
                letterSpacing: "0.08em",
                borderRadius: 4,
              }}
            >
              💾 SAVE
            </button>
          )}

          {campaign && (
            <button
              onClick={exportCampaignJSON}
              className="laramono"
              style={{
                background: t.panel,
                color: t.textDim,
                border: `1px solid ${t.border}`,
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

          <button
            onClick={exportCharacterJSON}
            className="laramono"
            style={{
              background: t.panel,
              color: t.textDim,
              border: `1px solid ${t.border}`,
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
            onClick={() => setShowCreator(!showCreator)}
            className="laramono"
            style={{
              background: showCreator ? t.borderSoft : t.btnSecondary,
              color: t.text,
              border: `1px solid ${t.gold}`,
              padding: "9px 15px",
              fontSize: 12,
              letterSpacing: "0.08em",
              borderRadius: 4,
            }}
            title="Create a new character from a free-form description"
          >
            🎭 CHARACTER CREATOR
          </button>

          {/* CHARACTER LIBRARY (PHASE 5) */}
          <button
            onClick={() => setShowCharModal(true)}
            className="laramono"
            style={{
              background: t.btnSecondary,
              color: t.textDim,
              border: `1px solid ${t.borderSoft}`,
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
          borderBottom: `1px solid ${t.green}`,
          padding: "10px 20px",
          textAlign: "center",
          fontSize: 14,
          fontWeight: 500,
        }}>
          {saveNotification}
        </div>
      )}

      {/* MODAL / SAVED CAMPAIGNS MANAGER */}
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

      {/* MODAL / CHARACTER LIBRARY (PHASE 5) */}
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

      {/* MAIN WORK AREA */}
      <div style={{ maxWidth: 840, margin: "0 auto", padding: "28px 20px 80px" }}>
        {/* CONFIGURATION & UPLOAD BAR */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 24, alignItems: "center" }}>
          <label className="laramono" style={{ border: `1px solid ${t.border}`, padding: "10px 16px", fontSize: 12, letterSpacing: "0.08em", background: t.panel, cursor: "pointer", borderRadius: 4 }}>
            📥 LOAD JSON
            <input type="file" accept=".json" onChange={handleUploadJSON} style={{ display: "none" }} />
          </label>
          <span className="laramono" style={{ fontSize: 12, color: t.gold }}>{fileName}</span>

          <select value={variant} onChange={(e) => setVariant(e.target.value)} className="laramono"
            style={{ background: t.panel, color: t.text, border: `1px solid ${t.border}`, padding: "10px 12px", fontSize: 12, borderRadius: 4 }}>
            {VARIANTS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>

          <select value={length} onChange={(e) => setLength(e.target.value)} className="laramono"
            style={{ background: t.panel, color: t.text, border: `1px solid ${t.border}`, padding: "10px 12px", fontSize: 12, borderRadius: 4 }}>
            <option value="sandbox">🌟 Free Mode / Unlimited (No missions, continuous story)</option>
            <option value="lunga">Long campaign (6 missions)</option>
            <option value="scurta">One-shot (3 missions)</option>
          </select>

          {/* VISUAL MATURITY SELECTOR (PHASE 2) */}
          <div style={{ display: "flex", gap: 6, alignItems: "center" }} title={MATURITY_LEVELS.find((m) => m.id === maturity)?.desc || ""}>
            {MATURITY_LEVELS.map((m) => {
              const active = maturity === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setMaturity(m.id)}
                  className="laramono"
                  style={{
                    background: active ? MATURITY_COLORS[m.id] : t.panel,
                    color: active ? t.textBright : t.textMuted,
                    border: `1px solid ${active ? MATURITY_COLORS[m.id] : t.border}`,
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

          <button onClick={handleGenerate} disabled={loading} className="laramono"
            style={{ background: loading ? t.border : t.danger, color: t.text, border: `1px solid ${t.gold}`, padding: "11px 22px", fontSize: 12, letterSpacing: "0.1em", fontWeight: 600, borderRadius: 4 }}>
            {loading ? "GENERATING…" : "GENERATE SETTING"}
          </button>

          {loading && status && (
            <span className="laramono" style={{ fontSize: 11, color: t.green }}>{status}</span>
          )}
        </div>

        {/* VISUAL CHARACTER CREATOR (PHASE 5) — logic in components/CharacterCreator.jsx */}
        {showCreator && (
          <CharacterCreator onApply={applyDraftCharacter} onError={setError} />
        )}

        {error && (
          <div style={{ border: `1px solid ${t.danger}`, background: t.dangerBg, color: t.dangerText, padding: "12px 16px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, fontSize: 14 }}>
            <span>{error}</span>
            <button onClick={handleGenerate} className="laramono"
              style={{ background: t.danger, color: t.text, border: "none", padding: "6px 14px", fontSize: 11, letterSpacing: "0.08em", whiteSpace: "nowrap" }}>
              TRY AGAIN
            </button>
          </div>
        )}

        {!campaign && !loading && (
          <div style={{ padding: "30px 20px", background: t.panel, border: `1px solid ${t.border}`, borderRadius: 4, textAlign: "center" }}>
            <p style={{ color: t.textMid, fontSize: 16, margin: "0 0 10px" }}>
              Pick the atmosphere and format you want, then press <b>GENERATE SETTING</b>.
            </p>
            <p style={{ color: t.textMuted, fontSize: 14, margin: "0 0 14px" }}>
              In <b>Free Mode (Sandbox)</b> the story has no chapter limit — play through messages for as long as you like!
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
                    usedModel ? `AI: ${usedModel}` : null
                  ].filter(Boolean).map((tag, i) => (
                    <span key={i} className="laramono" style={{ fontSize: 10, letterSpacing: "0.08em", border: `1px solid ${t.border}`, padding: "4px 10px", color: t.green }}>{tag}</span>
                  ))}
                </div>
              </div>

              {/* MAIN ACTION BUTTONS */}
              <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
                <button onClick={startGame} className="laramono"
                  style={{ background: t.gold, color: t.bg, border: `1px solid ${t.goldBright}`, padding: "12px 24px", fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", boxShadow: "0 4px 12px rgba(138,109,59,0.3)" }}>
                  🎮 {campaign.mode === "sandbox" ? "START THE STORY LIVE" : "PLAY THE CAMPAIGN NOW"}
                </button>
                <button onClick={() => saveCampaignLocally(null, null, true)} className="laramono"
                  style={{ background: t.successBg, color: t.greenText, border: `1px solid ${t.green}`, padding: "12px 18px", fontSize: 12, letterSpacing: "0.08em" }}>
                  💾 SAVE
                </button>
                <button onClick={exportCampaignJSON} className="laramono"
                  style={{ background: t.btnTertiary, color: t.textDim, border: `1px solid ${t.borderSoft}`, padding: "12px 18px", fontSize: 12, letterSpacing: "0.08em" }}
                  title="Download the full JSON save">
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
                  title="Opens the print view — choose 'Save as PDF' in the print dialog">
                  📄 PDF
                </button>
              </div>
            </div>

            <h3 style={{ color: t.gold, fontSize: 14, letterSpacing: "0.08em" }}>PREMISE</h3>
            <p style={{ lineHeight: 1.75, marginBottom: 20 }}>{campaign.premise}</p>

            <h3 style={{ color: t.gold, fontSize: 14, letterSpacing: "0.08em" }}>CONTEXT & LORE</h3>
            <p style={{ lineHeight: 1.75, marginBottom: 20 }}>{campaign.lore}</p>

            {/* SANDBOX LOCATIONS */}
            {campaign.locations && campaign.locations.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ color: t.gold, fontSize: 14, letterSpacing: "0.08em", marginBottom: 10 }}>📍 KEY LOCATIONS</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
                  {campaign.locations.map((loc, idx) => (
                    <div key={idx} style={{ background: t.panel, border: `1px solid ${t.border}`, padding: "12px 14px", borderRadius: 4 }}>
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

            <h3 style={{ color: t.gold, fontSize: 14, letterSpacing: "0.08em", marginTop: 24 }}>SUPPORTING CHARACTERS (NPCs)</h3>
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

            <h3 style={{ color: t.gold, fontSize: 14, letterSpacing: "0.08em" }}>FUTURE THREADS</h3>
            <ul>{campaign.endings?.map((e, i) => <li key={i}>{e}</li>)}</ul>

            {/* GAMEPLAY SECTION — UI in components/GameSection.jsx, logic stays here */}
            {showGame && (
              <GameSection
                campaign={campaign}
                characterName={character.name}
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

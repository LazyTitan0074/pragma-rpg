import React, { useState, useContext } from "react";
import { CHARACTER_FIELDS } from "../lib/characters";
import { ThemeContext } from "../lib/uiTheme";
import { postJsonRetry } from "../lib/clientFetch";

// Visual character creator (Phase 5) — free-form description, /api/create-character
// call, sheet editor, and apply. All state is local; the parent only receives the
// final sheet via onApply(sheet). (audit R10)
export default function CharacterCreator({ maturity = "18", onApply, onError, applyTitle = "" }) {
  const t = useContext(ThemeContext);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState(null);

  async function create() {
    if (prompt.trim().length < 10) return;
    setLoading(true);
    try {
      const result = await postJsonRetry(
        "/api/create-character",
        { prompt: prompt.trim(), maturity },
        { retries: 1 }
      );
      const data = result.data;
      if (!result.ok || !data) throw new Error(data?.error || `Server error (${result.status})`);
      setDraft(data.character);
      return data.character;
    } catch (e) {
      onError?.(e.message || "Failed to create character.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  function apply() {
    if (!draft?.name?.trim()) return;
    onApply(draft);
    setDraft(null);
    setPrompt("");
  }

  return (
    <div style={{ background: t.panel, border: "1px solid #8a6d3b", borderRadius: 6, padding: "20px 22px", marginBottom: 24 }}>
      <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, margin: "0 0 4px", color: t.textBright }}>
        🎭 Character Creator
      </h3>
      <p style={{ fontSize: 13, color: t.textMuted, margin: "0 0 14px" }}>
        {applyTitle ? `${applyTitle} ` : ""}Describe the character you want in your own words — the AI composes the full sheet, which you can then fine-tune field by field.
      </p>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="e.g. A witch from 1872 Transylvania who hides her powers, keeps a cold demeanor, but has a secret soft spot for orphaned children..."
        rows={3}
        style={{
          width: "100%",
          background: t.bg,
          color: t.text,
          border: "1px solid #3a3730",
          padding: "12px 14px",
          fontSize: 14,
          fontFamily: "inherit",
          resize: "vertical",
          marginBottom: 12,
        }}
      />
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button
          onClick={() => create()}
          disabled={loading || prompt.trim().length < 10}
          className="laramono"
          style={{
            background: loading || prompt.trim().length < 10 ? t.border : t.gold,
            color: loading || prompt.trim().length < 10 ? t.textDim : t.bg,
            border: "1px solid #d4af37",
            padding: "10px 20px",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.08em",
            borderRadius: 4,
          }}
        >
          {loading ? "COMPILING SHEET…" : "✨ CREATE SHEET"}
        </button>
        {draft && (
          <span className="laramono" style={{ fontSize: 11, color: t.green }}>
            Sheet ready — tweak the fields below
          </span>
        )}
      </div>

      {/* VISUAL SHEET EDITOR */}
      {draft && (
        <div style={{ marginTop: 18, borderTop: "1px solid #3a3730", paddingTop: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
            {CHARACTER_FIELDS.map((f) => (
              <label key={f.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="laramono" style={{ fontSize: 10, color: t.gold, letterSpacing: "0.08em" }}>
                  {f.label.toUpperCase()}
                </span>
                {["universe", "appearance", "personality", "philosophy", "connections", "secrets"].includes(f.key) ? (
                  <textarea
                    value={draft[f.key] || ""}
                    onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                    rows={2}
                    style={{ background: t.bg, color: t.text, border: "1px solid #3a3730", padding: "8px 10px", fontSize: 13, fontFamily: "inherit", resize: "vertical" }}
                  />
                ) : (
                  <input
                    value={draft[f.key] || ""}
                    onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                    style={{ background: t.bg, color: t.text, border: "1px solid #3a3730", padding: "8px 10px", fontSize: 13, fontFamily: "inherit" }}
                  />
                )}
              </label>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button
              onClick={apply}
              disabled={!draft.name?.trim()}
              className="laramono"
              style={{
                background: draft.name?.trim() ? t.successBg : t.border,
                color: draft.name?.trim() ? t.greenText : t.textDim,
                border: `1px solid ${draft.name?.trim() ? t.green : t.border}`,
                padding: "9px 18px",
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.08em",
                borderRadius: 4,
              }}
            >
              {applyTitle ? "✅ USE AS PROTAGONIST" : "✅ USE AND SAVE TO LIBRARY"}
            </button>
            <button
              onClick={() => setDraft(null)}
              className="laramono"
              style={{ background: t.dangerBg, color: t.dangerText, border: "1px solid #6b2a2a", padding: "9px 14px", fontSize: 11, borderRadius: 4 }}
            >
              🗑️ DISCARD SHEET
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

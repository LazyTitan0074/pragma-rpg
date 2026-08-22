import React, { useState, useContext } from "react";
import { CHARACTER_FIELDS } from "../lib/characters";
import { ThemeContext } from "../lib/uiTheme";

// Visual character creator (Phase 5) — free-form description, call to
// /api/create-character, sheet editor and apply. All state is local;
// the parent receives only the final sheet via onApply(sheet). (audit R10)
export default function CharacterCreator({ onApply, onError }) {
  const t = useContext(ThemeContext);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState(null);

  async function create() {
    if (prompt.trim().length < 10) return;
    setLoading(true);
    try {
      const res = await fetch("/api/create-character", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Server error (${res.status})`);
      setDraft(data.character);
    } catch (e) {
      onError?.(e.message || "Character creation failed.");
      return;
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
    <div style={{ background: t.panel, border: `1px solid ${t.gold}`, borderRadius: 6, padding: "20px 22px", marginBottom: 24 }}>
      <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, margin: "0 0 4px", color: t.textBright }}>
        🎭 Character Creator
      </h3>
      <p style={{ fontSize: 13, color: t.textMuted, margin: "0 0 14px" }}>
        Describe the character you want in your own words — the AI composes the full sheet, which you can then adjust field by field.
      </p>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="e.g.: I want a witch from 1872 Transylvania who hides her powers, has a cold attitude but a secret soft spot for orphaned children..."
        rows={3}
        style={{
          width: "100%",
          background: t.bg,
          color: t.text,
          border: `1px solid ${t.border}`,
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
            border: `1px solid ${t.goldBright}`,
            padding: "10px 20px",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.08em",
            borderRadius: 4,
          }}
        >
          {loading ? "COMPOSING THE SHEET…" : "✨ CREATE SHEET"}
        </button>
        {draft && (
          <span className="laramono" style={{ fontSize: 11, color: t.green }}>
            Sheet ready — adjust the fields below
          </span>
        )}
      </div>

      {/* SHEET VISUAL EDITOR */}
      {draft && (
        <div style={{ marginTop: 18, borderTop: `1px solid ${t.border}`, paddingTop: 16 }}>
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
                    style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}`, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", resize: "vertical" }}
                  />
                ) : (
                  <input
                    value={draft[f.key] || ""}
                    onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                    style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}`, padding: "8px 10px", fontSize: 13, fontFamily: "inherit" }}
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
              ✅ USE & SAVE TO LIBRARY
            </button>
            <button
              onClick={() => setDraft(null)}
              className="laramono"
              style={{ background: t.dangerBg, color: t.dangerText, border: `1px solid ${t.danger}`, padding: "9px 14px", fontSize: 11, borderRadius: 4 }}
            >
              🗑️ DISCARD SHEET
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

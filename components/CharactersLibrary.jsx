import React, { useContext } from "react";
import { ThemeContext } from "../lib/uiTheme";

// Local character library — modal with activate, export and delete
// (extracted from the monolith, audit R10).
export default function CharactersLibrary({ characters, activeName, onClose, onUse, onDelete, onExport }) {
  const t = useContext(ThemeContext);
  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: t.overlay,
      backdropFilter: "blur(4px)",
      zIndex: 9999,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
    }}>
      <div style={{
        background: t.modalBg,
        border: `2px solid ${t.gold}`,
        borderRadius: 6,
        width: "100%",
        maxWidth: 700,
        maxHeight: "85vh",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 10px 30px rgba(0,0,0,0.8)",
      }}>
        <div style={{ padding: "18px 24px", borderBottom: `1px solid ${t.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, margin: 0, color: t.textBright }}>
              👥 Character Library ({characters.length})
            </h3>
            <span style={{ fontSize: 13, color: t.textMuted }}>
              Created by you with AI or imported from JSON files
            </span>
          </div>
          <button
            onClick={onClose}
            className="laramono"
            style={{ background: t.btnSecondary, border: `1px solid ${t.borderSoft}`, color: t.textMid, padding: "6px 12px", fontSize: 12 }}
          >
            ✕ CLOSE
          </button>
        </div>

        <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
          {characters.length === 0 ? (
            <div style={{ padding: "40px 20px", textAlign: "center", color: t.textMuted }}>
              <p style={{ fontSize: 16, margin: "0 0 8px", color: t.textMid }}>The library is still empty.</p>
              <p style={{ fontSize: 14, margin: 0 }}>Open <b>🎭 CHARACTER CREATOR</b> and describe your first hero, or import a character JSON file.</p>
            </div>
          ) : (
            characters.map((item) => {
              const isActive = activeName === item.name;
              return (
                <div
                  key={item.id}
                  className="card-hover"
                  style={{
                    background: isActive ? t.cardActive : t.panel,
                    border: isActive ? `1px solid ${t.gold}` : `1px solid ${t.border}`,
                    padding: "14px 16px",
                    borderRadius: 4,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 14,
                    transition: "all 0.2s ease",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                      <span style={{ fontSize: 17, fontWeight: 600, color: t.textBright }}>{item.name}</span>
                      {isActive && (
                        <span className="laramono" style={{ fontSize: 9, background: t.green, color: t.bg, padding: "2px 6px", borderRadius: 3, fontWeight: 700 }}>
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: t.textDimmer, overflow: "hidden", textOverflow: "ellipsis" }}>
                      🎭 <b>{item.role || "No role"}</b> &nbsp;|&nbsp; 🌍 {item.universe || "Undefined universe"}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      onClick={() => onUse(item)}
                      className="laramono"
                      style={{ background: t.gold, color: t.bg, border: `1px solid ${t.goldBright}`, padding: "8px 14px", fontSize: 11, fontWeight: 700 }}
                    >
                      ▶️ USE
                    </button>
                    <button
                      onClick={() => onExport(item)}
                      className="laramono"
                      style={{ background: t.btnSecondary, border: `1px solid ${t.borderSoft}`, color: t.textDim, padding: "8px 10px", fontSize: 11 }}
                      title="Download JSON file"
                    >
                      📥
                    </button>
                    <button
                      onClick={(e) => onDelete(item.id, e)}
                      className="laramono"
                      style={{ background: t.dangerBg, border: `1px solid ${t.danger}`, color: t.dangerText, padding: "8px 10px", fontSize: 11 }}
                      title="Remove from library"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

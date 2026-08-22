import React, { useContext } from "react";
import { ThemeContext } from "../lib/uiTheme";

// Saved-campaigns manager — modal with list, open, duplicate, JSON export and
// delete (extracted from the monolith, audit R10).
export default function SavedCampaignsModal({ campaigns, currentId, onClose, onLoad, onDuplicate, onDelete, onExport }) {
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
        maxWidth: 760,
        maxHeight: "85vh",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 10px 30px rgba(0,0,0,0.8)",
      }}>
        {/* Modal Header */}
        <div style={{ padding: "18px 24px", borderBottom: `1px solid ${t.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, margin: 0, color: t.textBright }}>
              🏛️ Your Saved Campaigns ({campaigns.length})
            </h3>
            <span style={{ fontSize: 13, color: t.textMuted }}>
              All your stories and play sessions saved locally in your browser
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

        {/* Modal Body */}
        <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
          {campaigns.length === 0 ? (
            <div style={{ padding: "40px 20px", textAlign: "center", color: t.textMuted }}>
              <p style={{ fontSize: 16, margin: "0 0 8px", color: t.textMid }}>No saved campaigns yet.</p>
              <p style={{ fontSize: 14, margin: 0 }}>Generate a new campaign and press <b>SAVE</b>, or play a few messages and it saves automatically!</p>
            </div>
          ) : (
            campaigns.map((item) => {
              const dateStr = item.updatedAt ? new Date(item.updatedAt).toLocaleString() : "Undated";
              const msgCount = Array.isArray(item.gameMessages) ? item.gameMessages.length : 0;
              const isCurrent = currentId === item.id;

              return (
                <div
                  key={item.id}
                  className="card-hover"
                  style={{
                    background: isCurrent ? t.cardActive : t.panel,
                    border: isCurrent ? `1px solid ${t.gold}` : `1px solid ${t.border}`,
                    padding: "16px",
                    borderRadius: 4,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 16,
                    transition: "all 0.2s ease",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                      <span style={{ fontSize: 18, fontWeight: 600, color: t.textBright }}>{item.title}</span>
                      {isCurrent && (
                        <span className="laramono" style={{ fontSize: 9, background: t.green, color: t.bg, padding: "2px 6px", borderRadius: 3, fontWeight: 700 }}>
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: t.textDimmer, marginBottom: 6 }}>
                      📍 <b>{item.setting}</b> &nbsp;|&nbsp; 🎭 <b>{item.character?.name || "Character"}</b> ({item.character?.role || "Role"})
                    </div>
                    <div className="laramono" style={{ fontSize: 11, color: t.textMuted, display: "flex", gap: 14 }}>
                      <span>⏱️ {dateStr}</span>
                      <span>💬 {msgCount} chat lines</span>
                      <span>🌟 {item.mode === "sandbox" ? "Free Mode (Sandbox)" : "Mission-based"}</span>
                    </div>
                  </div>

                  {/* Campaign actions */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      onClick={() => onLoad(item)}
                      className="laramono"
                      style={{
                        background: t.gold,
                        color: t.bg,
                        border: `1px solid ${t.goldBright}`,
                        padding: "8px 14px",
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: "0.05em",
                      }}
                    >
                      ▶️ OPEN
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onExport(item);
                      }}
                      className="laramono"
                      style={{ background: t.btnSecondary, border: `1px solid ${t.borderSoft}`, color: t.textDim, padding: "8px 10px", fontSize: 11 }}
                      title="Download JSON file"
                    >
                      📥 JSON
                    </button>
                    <button
                      onClick={(e) => onDuplicate(item, e)}
                      className="laramono"
                      style={{ background: t.btnSecondary, border: `1px solid ${t.borderSoft}`, color: t.textDim, padding: "8px 10px", fontSize: 11 }}
                      title="Clone this session as a new branch"
                    >
                      📋
                    </button>
                    <button
                      onClick={(e) => onDelete(item.id, e)}
                      className="laramono"
                      style={{ background: t.dangerBg, border: `1px solid ${t.danger}`, color: t.dangerText, padding: "8px 10px", fontSize: 11 }}
                      title="Delete save"
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

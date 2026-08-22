import React, { useState, useRef, useEffect, useContext } from "react";
import { ThemeContext } from "../lib/uiTheme";

// Live Dungeon Master session — collapsible summary, message flow,
// quick-action suggestions and the submit form. Pure UI state (typed text,
// auto-scroll) is local; game logic stays in the parent. (audit R10)
export default function GameSection({ campaign, characterName, messages, storySummary, loading, error, sectionRef, onSend, onSave, onReset }) {
  const t = useContext(ThemeContext);
  const [input, setInput] = useState("");
  const chatEndRef = useRef(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    onSend(text);
  }

  return (
    <div ref={sectionRef} style={{ marginTop: 40, border: `2px solid ${t.gold}`, background: t.gameBg, borderRadius: 6, padding: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${t.border}`, paddingBottom: 12, marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <div>
          <span className="laramono" style={{ fontSize: 11, color: t.gold, letterSpacing: "0.15em" }}>
            {campaign.mode === "sandbox" ? "UNLIMITED SANDBOX SESSION" : "LIVE RPG SESSION"}
          </span>
          <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, margin: "2px 0 0", color: t.textBright }}>
            {campaign.title}
          </h3>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onSave} className="laramono"
            style={{ background: t.successBg, color: t.greenText, border: `1px solid ${t.green}`, padding: "6px 12px", fontSize: 11, letterSpacing: "0.08em" }}>
            💾 SAVE GAME
          </button>
          <button onClick={onReset} className="laramono"
            style={{ background: t.dangerBg, color: t.dangerText, border: `1px solid ${t.danger}`, padding: "6px 12px", fontSize: 11, letterSpacing: "0.08em" }}>
            🔄 RESTART
          </button>
        </div>
      </div>

      {/* MESSAGE AREA */}
      <div style={{ maxHeight: 480, overflowY: "auto", paddingRight: 10, display: "flex", flexDirection: "column", gap: 16, marginBottom: 20 }}>
        {storySummary && (
          <details style={{
            background: t.detailsBg,
            border: `1px solid ${t.borderSoft}`,
            borderRadius: 6,
            padding: "10px 14px",
          }}>
            <summary className="laramono" style={{ fontSize: 11, color: t.gold, letterSpacing: "0.1em", cursor: "pointer" }}>
              📖 THE STORY SO FAR (the Game Master's memory)
            </summary>
            <div style={{ fontSize: 14, lineHeight: 1.7, color: t.textDim, whiteSpace: "pre-wrap", marginTop: 10 }}>
              {storySummary}
            </div>
          </details>
        )}

        {messages.map((msg, index) => {
          const isPlayer = msg.role === "user" || msg.role === "player";
          return (
            <div key={index} style={{
              padding: "16px 18px",
              background: isPlayer ? t.bubblePlayer : t.bubbleDm,
              borderLeft: isPlayer ? `4px solid ${t.green}` : `4px solid ${t.gold}`,
              borderTop: `1px solid ${t.borderFaint}`,
              borderRight: `1px solid ${t.borderFaint}`,
              borderBottom: `1px solid ${t.borderFaint}`,
              borderRadius: "0 6px 6px 0",
            }}>
              <div className="laramono" style={{ fontSize: 11, color: isPlayer ? t.green : t.gold, marginBottom: 6, letterSpacing: "0.1em" }}>
                {isPlayer ? `👤 ${characterName || "Player"}` : "🧙‍♂️ DUNGEON MASTER"}
              </div>
              <div style={{ fontSize: 15, lineHeight: 1.7, color: isPlayer ? t.textPlayer : t.text, whiteSpace: "pre-wrap" }}>
                {msg.text}
              </div>
            </div>
          );
        })}

        {loading && (
          <div style={{ padding: "14px 18px", background: t.bubbleDm, borderLeft: `4px solid ${t.gold}`, borderRadius: "0 6px 6px 0" }}>
            <span className="laramono" style={{ fontSize: 12, color: t.gold }}>
              🧙‍♂️ The Game Master is weaving the next part of the story…
            </span>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {error && (
        <div style={{ border: `1px solid ${t.danger}`, background: t.dangerBg, color: t.dangerText, padding: "10px 14px", marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* QUICK ACTION SUGGESTIONS */}
      <div style={{ marginBottom: 14 }}>
        <span className="laramono" style={{ fontSize: 11, color: t.textMuted, display: "block", marginBottom: 6 }}>QUICK ACTION SUGGESTIONS:</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {campaign.mode === "sandbox" ? (
            <>
              <button onClick={() => onSend("I sit at my desk, take out my notebook and discreetly look around.")} className="suggestion-chip">
                🎒 Sit down and observe
              </button>
              <button onClick={() => onSend("I strike up a conversation with the classmate next to me with a smile.")} className="suggestion-chip">
                🗣️ Greet your deskmate
              </button>
              <button onClick={() => onSend("I step into the hallway during break and wander around to see what's happening.")} className="suggestion-chip">
                🚶‍♂️ Walk the halls at break
              </button>
              <button onClick={() => onSend("I answer the teacher's question calmly and confidently.")} className="suggestion-chip">
                🙋‍♂️ Answer in class
              </button>
            </>
          ) : (
            <>
              <button onClick={() => onSend("I carefully examine the room and notice anything suspicious.")} className="suggestion-chip">
                🔍 Examine the details
              </button>
              <button onClick={() => onSend("I question the person in front of me, calm but firm.")} className="suggestion-chip">
                🗣️ Question them firmly
              </button>
              <button onClick={() => onSend("I give my guards a precise order to secure the perimeter.")} className="suggestion-chip">
                🛡️ Order the guards
              </button>
              <button onClick={() => onSend("I stay ice-cold and demand more proof before making any decision.")} className="suggestion-chip">
                🍷 Keep your composure
              </button>
            </>
          )}
        </div>
      </div>

      {/* TEXT INPUT FORM */}
      <div style={{ display: "flex", gap: 10 }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={campaign.mode === "sandbox" ? "Write what you do, say or where you go... (Enter to send)" : "Write what you do or say... (Enter to send)"}
          rows={3}
          style={{
            flex: 1,
            background: t.panel,
            color: t.text,
            border: `1px solid ${t.border}`,
            padding: "12px 14px",
            fontSize: 14,
            fontFamily: "inherit",
            resize: "vertical",
          }}
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          className="laramono"
          style={{
            background: loading || !input.trim() ? t.border : t.danger,
            color: t.text,
            border: `1px solid ${t.gold}`,
            padding: "0 22px",
            fontSize: 12,
            letterSpacing: "0.1em",
            fontWeight: 600,
          }}
        >
          SEND
        </button>
      </div>
    </div>
  );
}

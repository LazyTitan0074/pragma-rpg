import React, { useState, useRef, useEffect, useContext } from "react";
import { ThemeContext } from "../lib/uiTheme";

// Live game session with the Dungeon Master — collapsible summary, message feed,
// quick suggestions, and the submit form. Pure UI state (typed text, auto-scroll)
// stays local; game logic lives in the parent. (audit R10)
export default function GameSection({ campaign, characterName, messages, storySummary, storyBible, loading, error, sectionRef, onSend, onSave, onReset }) {
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
    <div ref={sectionRef} style={{ marginTop: 40, border: "2px solid #8a6d3b", background: t.gameBg, borderRadius: 6, padding: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #3a3730", paddingBottom: 12, marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
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
            style={{ background: t.successBg, color: t.greenText, border: "1px solid #5c7a6b", padding: "6px 12px", fontSize: 11, letterSpacing: "0.08em" }}>
            💾 SAVE GAME
          </button>
          <button onClick={onReset} className="laramono"
            style={{ background: t.dangerBg, color: t.dangerText, border: "1px solid #6b2a2a", padding: "6px 12px", fontSize: 11, letterSpacing: "0.08em" }}>
            🔄 RESTART
          </button>
        </div>
      </div>

      {/* MESSAGE AREA */}
      <div style={{ maxHeight: 480, overflowY: "auto", paddingRight: 10, display: "flex", flexDirection: "column", gap: 16, marginBottom: 20 }}>
        {storySummary && (
          <details style={{
            background: t.detailsBg,
            border: "1px solid #4a3e2b",
            borderRadius: 6,
            padding: "10px 14px",
          }}>
            <summary className="laramono" style={{ fontSize: 11, color: t.gold, letterSpacing: "0.1em", cursor: "pointer" }}>
              📖 STORY SUMMARY SO FAR (the Game Master's memory)
            </summary>
            <div style={{ fontSize: 14, lineHeight: 1.7, color: t.textDim, whiteSpace: "pre-wrap", marginTop: 10 }}>
              {storySummary}
            </div>
          </details>
        )}

        {storyBible && (
          <details style={{
            background: t.detailsBg,
            border: "1px solid #4a3e2b",
            borderRadius: 6,
            padding: "10px 14px",
          }}>
            <summary className="laramono" style={{ fontSize: 11, color: t.gold, letterSpacing: "0.1em", cursor: "pointer" }}>
              🧾 FACT REGISTRY (the story bible — never forgotten)
            </summary>
            <div style={{ fontSize: 13, lineHeight: 1.8, color: t.textDim, marginTop: 10, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
              {storyBible.decizii?.length > 0 && (
                <div>
                  <b className="laramono" style={{ color: t.gold }}>DECISIONS</b>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{storyBible.decizii.map((d, i) => <li key={i}>{d}</li>)}</ul>
                </div>
              )}
              {storyBible.npcs?.length > 0 && (
                <div>
                  <b className="laramono" style={{ color: t.gold }}>NPCS</b>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                    {storyBible.npcs.map((n, i) => (
                      <li key={i}>{n.nume}{n.cine ? ` — ${n.cine}` : ""}{n.relatie ? ` · ${n.relatie}` : ""}</li>
                    ))}
                  </ul>
                </div>
              )}
              {storyBible.promisiuni_secrete?.length > 0 && (
                <div>
                  <b className="laramono" style={{ color: t.gold }}>PROMISES AND SECRETS</b>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                    {storyBible.promisiuni_secrete.map((p, i) => (
                      <li key={i}>{p.text}{p.stare ? ` [${p.stare}]` : ""}</li>
                    ))}
                  </ul>
                </div>
              )}
              {storyBible.obiecte?.length > 0 && (
                <div>
                  <b className="laramono" style={{ color: t.gold }}>ITEMS AND RESOURCES</b>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                    {storyBible.obiecte.map((o, i) => (
                      <li key={i}>{o.nume}{o.descriere ? ` — ${o.descriere}` : ""}{o.stare ? ` [${o.stare}]` : ""}</li>
                    ))}
                  </ul>
                </div>
              )}
              {storyBible.fire_deschise?.length > 0 && (
                <div>
                  <b className="laramono" style={{ color: t.gold }}>OPEN THREADS</b>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{storyBible.fire_deschise.map((f, i) => <li key={i}>{f}</li>)}</ul>
                </div>
              )}
            </div>
          </details>
        )}

        {messages.map((msg, index) => {
          const isPlayer = msg.role === "user" || msg.role === "player";
          return (
            <div key={index} style={{
              padding: "16px 18px",
              background: isPlayer ? t.bubblePlayer : t.bubbleDm,
              borderLeft: isPlayer ? "4px solid #5c7a6b" : "4px solid #8a6d3b",
              borderTop: "1px solid #2e2a22",
              borderRight: "1px solid #2e2a22",
              borderBottom: "1px solid #2e2a22",
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
          <div style={{ padding: "14px 18px", background: t.bubbleDm, borderLeft: "4px solid #8a6d3b", borderRadius: "0 6px 6px 0" }}>
            <span className="laramono" style={{ fontSize: 12, color: t.gold }}>
              🧙‍♂️ The Game Master is thinking about how the story continues…
            </span>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {error && (
        <div style={{ border: "1px solid #6b2a2a", background: t.dangerBg, color: t.dangerText, padding: "10px 14px", marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* QUICK ACTION SUGGESTIONS */}
      <div style={{ marginBottom: 14 }}>
        <span className="laramono" style={{ fontSize: 11, color: t.textMuted, display: "block", marginBottom: 6 }}>QUICK ACTIONS:</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {campaign.mode === "sandbox" ? (
            <>
              <button onClick={() => onSend("I take my seat at the desk, pull out my notebook, and quietly look around.")} className="suggestion-chip">
                🎒 Sit down and observe
              </button>
              <button onClick={() => onSend("I strike up a conversation with the classmate next to me, smiling.")} className="suggestion-chip">
                🗣️ Greet your deskmate
              </button>
              <button onClick={() => onSend("I head out to the hallway during break and wander around to see what's going on.")} className="suggestion-chip">
                🚶‍♂️ Walk the halls at break
              </button>
              <button onClick={() => onSend("I answer the teacher's question calmly and confidently.")} className="suggestion-chip">
                🙋‍♂️ Answer in class
              </button>
            </>
          ) : (
            <>
              <button onClick={() => onSend("I carefully search the room and note anything suspicious.")} className="suggestion-chip">
                🔍 Search for clues
              </button>
              <button onClick={() => onSend("I question the person in front of me, calm but firm.")} className="suggestion-chip">
                🗣️ Interrogate firmly
              </button>
              <button onClick={() => onSend("I give my guards precise orders to secure the perimeter.")} className="suggestion-chip">
                🛡️ Command your guards
              </button>
              <button onClick={() => onSend("I stay coldly calm and demand more proof before making a decision.")} className="suggestion-chip">
                🍷 Keep your cool
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
          placeholder={campaign.mode === "sandbox" ? "Describe what you do, say, or where you go... (press Enter to send)" : "Write what you do or say... (press Enter to send)"}
          rows={3}
          style={{
            flex: 1,
            background: t.panel,
            color: t.text,
            border: "1px solid #3a3730",
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
            border: "1px solid #8a6d3b",
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

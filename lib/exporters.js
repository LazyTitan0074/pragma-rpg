// List exports and merges — pure logic extracted from the UI component (audit R10).
// No React dependency; testable directly with node --test.

// Aug 23, 2026: 20 → 30, conceptually aligned with the character library (60).
// Campaigns stay below characters because a record is far bulkier
// (history + summary + bible); the overflow lives on the server (Phase 6),
// while localStorage is just instant cache + offline fallback.
export const MAX_SAVED_CAMPAIGNS = 30;

/**
 * Merges two campaign lists: for each id the newest version wins,
 * sorted descending, with the maximum limit applied.
 */
export function mergeCampaignLists(a, b, max = MAX_SAVED_CAMPAIGNS) {
  const byId = new Map();
  for (const item of [...a, ...b]) {
    const existing = byId.get(item.id);
    const tNew = new Date(item.updatedAt).getTime() || 0;
    const tOld = existing ? new Date(existing.updatedAt).getTime() || 0 : -1;
    if (!existing || tNew >= tOld) byId.set(item.id, item);
  }
  return [...byId.values()]
    .sort((x, y) => (new Date(y.updatedAt).getTime() || 0) - (new Date(x.updatedAt).getTime() || 0))
    .slice(0, max);
}

/** Converts a validated campaign into a readable Markdown document (Obsidian/Notepad/Word). */
export function campaignToMarkdown(c) {
  let md = `# ${c.title}\n\n`;
  md += `**Setting:** ${c.setting}  \n**Tone:** ${c.tone}  \n**Format:** ${c.mode === "sandbox" ? "Free Mode / Sandbox (no fixed ending)" : "Mission-based Campaign"}\n\n`;
  md += `## Premise\n\n${c.premise}\n\n`;
  md += `## Context & Lore\n\n${c.lore}\n\n`;

  if (c.locations && c.locations.length > 0) {
    md += `## Key Locations\n\n`;
    c.locations.forEach((loc) => {
      md += `### 📍 ${loc.name} (${loc.vibe || "backdrop"})\n${loc.description}\n\n`;
    });
  }

  if (c.missions && c.missions.length > 0) {
    md += `## ${c.mode === "sandbox" ? "Starting Point" : "Missions"}\n\n`;
    c.missions.forEach((m, i) => {
      md += `### ${i + 1}. ${m.title} (${m.difficulty})\n\n${m.description}\n\n`;
      if (m.objectives && m.objectives.length > 0) {
        md += `**Objectives:**\n${m.objectives.map((o) => `- ${o}`).join("\n")}\n\n`;
      }
      if (m.encounters && m.encounters.length > 0) {
        md += `**Possible Encounters:**\n${m.encounters.map((e) => `- ${e}`).join("\n")}\n\n`;
      }
      if (m.rewards && m.rewards.length > 0) {
        md += `**Rewards / Consequences:**\n${m.rewards.map((r) => `- ${r}`).join("\n")}\n\n`;
      }
    });
  }

  if (c.npcs && c.npcs.length > 0) {
    md += `## Supporting Characters (NPCs)\n\n`;
    c.npcs.forEach((n) => {
      const conn = n.connection || n.connection_to_lara || n.connection_to_character || "";
      md += `**${n.name}** — ${n.role}\n${n.personality}${conn ? ` | Relationship: ${conn}` : ""}\n\n`;
    });
  }

  if (c.mechanics && c.mechanics.length > 0) {
    md += `## Mechanics & Dynamics\n\n${c.mechanics.map((m) => `- ${m}`).join("\n")}\n\n`;
  }

  if (c.endings && c.endings.length > 0) {
    md += `## Possible Endings\n\n${c.endings.map((e) => `- ${e}`).join("\n")}\n`;
  }

  return md;
}

// Strips bare square brackets from Obsidian-bound texts (they would break links).
const esc = (s) => String(s ?? "").replace(/\[(?!\[)/g, "");

/**
 * Export for Obsidian (Phase 7): Markdown with YAML frontmatter, inline tags
 * (#campaign, #mission, #npc, #location) and internal [[NPC Name]] links — known
 * NPC names are auto-linked inside mission text too.
 */
export function campaignToObsidian(c) {
  const npcNames = (c.npcs || [])
    .map((n) => (typeof n?.name === "string" ? n.name.trim() : ""))
    .filter(Boolean);

  // Auto-links exact NPC name mentions inside free-form text.
  const link = (text) => {
    let out = typeof text === "string" ? text : "";
    for (const name of npcNames) {
      out = out.split(name).join(`[[${name}]]`);
    }
    return out;
  };

  let md = `---\ntitle: "${esc(c.title)}"\nsetting: "${esc(c.setting)}"\ntone: "${esc(c.tone)}"\nformat: ${c.mode === "sandbox" ? "sandbox" : "campaign"}\ntags:\n  - campaign\n  - rpg\n---\n\n`;
  md += `# ${c.title}\n\n`;
  md += `> **Setting:** ${c.setting} · **Tone:** ${c.tone}\n\n`;
  md += `## Premise #premise\n\n${link(c.premise)}\n\n`;
  md += `## Context & Lore #lore\n\n${link(c.lore)}\n\n`;

  if (c.locations && c.locations.length > 0) {
    md += `## Key Locations #location\n\n`;
    c.locations.forEach((loc) => {
      md += `### ${loc.name} (${loc.vibe || "backdrop"})\n${link(loc.description)}\n\n`;
    });
  }

  if (c.missions && c.missions.length > 0) {
    md += `## ${c.mode === "sandbox" ? "Starting Point" : "Missions"} #mission\n\n`;
    c.missions.forEach((m, i) => {
      md += `### ${i + 1}. ${m.title} (${m.difficulty})\n\n${link(m.description)}\n\n`;
      if (m.objectives && m.objectives.length > 0) {
        md += `**Objectives:**\n${m.objectives.map((o) => `- ${link(o)}`).join("\n")}\n\n`;
      }
      if (m.encounters && m.encounters.length > 0) {
        md += `**Possible Encounters:**\n${m.encounters.map((e) => `- ${link(e)}`).join("\n")}\n\n`;
      }
      if (m.rewards && m.rewards.length > 0) {
        md += `**Rewards / Consequences:**\n${m.rewards.map((r) => `- ${link(r)}`).join("\n")}\n\n`;
      }
    });
  }

  if (npcNames.length > 0) {
    md += `## Supporting Characters #npc\n\n`;
    (c.npcs || []).forEach((n) => {
      const conn = n.connection || n.connection_to_lara || n.connection_to_character || "";
      md += `### [[${n.name}]]\n**Role:** ${n.role}\n\n${link(n.personality)}${conn ? `\n\n*Relationship:* ${conn}` : ""}\n\n`;
    });
  }

  if (c.mechanics && c.mechanics.length > 0) {
    md += `## Mechanics & Dynamics #mechanic\n\n${c.mechanics.map((m) => `- ${link(m)}`).join("\n")}\n\n`;
  }

  if (c.endings && c.endings.length > 0) {
    md += `## Possible Endings #ending\n\n${c.endings.map((e) => `- ${link(e)}`).join("\n")}\n`;
  }

  return md;
}

/**
 * Export for Foundry VTT (Phase 7): document in the "Adventure" shape used
 * by common import modules — journal entries for the campaign/missions/NPCs
 * and actor sheets for each NPC. Compatible at the content level.
 */
export function campaignToFoundryVTT(c, characterName = "") {
  const journal = (name, content) => ({ name, content });
  const journals = [
    journal(`${c.title} — Premise`, `<h2>${esc(c.title)}</h2><p><em>${esc(c.setting)} · ${esc(c.tone)}</em></p>${[c.premise, c.lore].map((p) => `<p>${esc(p)}</p>`).join("")}`),
  ];

  if (c.locations && c.locations.length > 0) {
    journals.push(journal(
      `${c.title} — Locations`,
      `<h2>Key Locations</h2>` + c.locations.map((l) => `<h3>${esc(l.name)}</h3><p>${esc(l.description)}</p>`).join("")
    ));
  }

  (c.missions || []).forEach((m, i) => {
    journals.push(journal(
      `${c.title} — ${c.mode === "sandbox" ? "Starting point" : `Mission ${i + 1}`}: ${m.title}`,
      `<h3>${esc(m.title)} <small>(${esc(m.difficulty)})</small></h3><p>${esc(m.description)}</p>` +
      (m.objectives?.length ? `<h4>Objectives</h4><ul>${m.objectives.map((o) => `<li>${esc(o)}</li>`).join("")}</ul>` : "") +
      (m.encounters?.length ? `<h4>Encounters</h4><ul>${m.encounters.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>` : "") +
      (m.rewards?.length ? `<h4>Rewards</h4><ul>${m.rewards.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : "")
    ));
  });

  (c.npcs || []).forEach((n) => {
    const conn = n.connection || n.connection_to_lara || n.connection_to_character || "";
    journals.push(journal(`NPC — ${n.name}`, `<h3>${esc(n.name)}</h3><p><strong>${esc(n.role)}</strong></p><p>${esc(n.personality)}</p>${conn ? `<p><em>Relationship:</em> ${esc(conn)}</p>` : ""}`));
  });

  if (c.endings && c.endings.length > 0) {
    journals.push(journal(`${c.title} — Possible endings`, `<h2>Possible Endings</h2><ul>${c.endings.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>`));
  }

  const actors = (c.npcs || []).map((n) => ({
    name: n.name,
    type: "npc",
    system: {
      details: {
        biography: `${n.personality || ""}${n.connection || n.connection_to_lara || n.connection_to_character ? `\n\nRelationship with ${characterName || "the main character"}: ${n.connection || n.connection_to_lara || n.connection_to_character}` : ""}`,
      },
    },
  }));

  return {
    name: c.title || "Pragma Campaign",
    system: "pragma-export",
    journals,
    actors,
    scenes: [],
    meta: {
      exportedAt: new Date().toISOString(),
      source: "PRAGMA Campaign Generator",
      setting: c.setting || "",
      tone: c.tone || "",
    },
  };
}

/**
 * HTML document optimized for printing (Phase 7): medieval fonts, parchment
 * background, clean pagination. Opens in a new window and calls
 * print() → the user picks "Save as PDF".
 */
export function campaignToPrintHtml(c, characterName = "") {
  const missions = (c.missions || [])
    .map((m, i) => `
      <section class="card">
        <h3><span class="num">${i + 1}.</span> ${esc(m.title)} <span class="diff">(${esc(m.difficulty)})</span></h3>
        <p>${esc(m.description)}</p>
        ${m.objectives?.length ? `<h4>Objectives</h4><ul>${m.objectives.map((o) => `<li>${esc(o)}</li>`).join("")}</ul>` : ""}
        ${m.encounters?.length ? `<h4>Encounters</h4><ul>${m.encounters.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>` : ""}
        ${m.rewards?.length ? `<h4>Rewards / Consequences</h4><ul>${m.rewards.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}
      </section>`)
    .join("");

  const locations = (c.locations || [])
    .map((l) => `<section class="card"><h3>${esc(l.name)} <span class="diff">(${esc(l.vibe || "backdrop")})</span></h3><p>${esc(l.description)}</p></section>`)
    .join("");

  const npcs = (c.npcs || [])
    .map((n) => {
      const conn = n.connection || n.connection_to_lara || n.connection_to_character || "";
      return `<div class="npc"><strong>${esc(n.name)}</strong> — ${esc(n.role)}<br/><span class="dim">${esc(n.personality)}${conn ? ` <em>(Relationship: ${esc(conn)})</em>` : ""}</span></div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${esc(c.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;700&family=Crimson+Pro:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet"/>
<style>
  @page { size: A4; margin: 22mm 18mm; }
  body { font-family: 'Crimson Pro', Georgia, serif; color: #2b2115; background: #f6ecd7; line-height: 1.55; margin: 0; padding: 24px; }
  .sheet { max-width: 800px; margin: 0 auto; background: linear-gradient(180deg, #faf3df, #f3e7cb); padding: 48px 56px; box-shadow: 0 0 24px rgba(80,60,20,.25); border: 1px solid #d8c39a; }
  h1 { font-family: 'Cormorant Garamond', serif; font-size: 42px; margin: 0 0 4px; color: #4a3418; text-align: center; letter-spacing: .02em; }
  .sub { text-align: center; font-style: italic; color: #6b573a; margin-bottom: 26px; }
  h2 { font-family: 'Cormorant Garamond', serif; color: #7a5a20; border-bottom: 1.5px solid #b99a5f; padding-bottom: 3px; margin-top: 34px; font-size: 25px; }
  h3 { font-family: 'Cormorant Garamond', serif; color: #4a3418; margin-bottom: 4px; }
  h4 { color: #7a5a20; margin: 14px 0 4px; }
  .num { color: #7a5a20; }
  .diff { font-size: 13px; color: #8a7048; font-style: italic; font-weight: 400; }
  .card { page-break-inside: avoid; border-left: 3px solid #b99a5f; padding-left: 12px; margin: 16px 0; }
  ul { margin: 4px 0 10px 20px; padding: 0; }
  li { margin-bottom: 3px; }
  .npc { margin-bottom: 10px; page-break-inside: avoid; }
  .dim { color: #5d4d33; }
  footer { margin-top: 40px; text-align: center; color: #8a7048; font-style: italic; font-size: 13px; }
  @media print { body { background: #fff; padding: 0; } .sheet { box-shadow: none; border: none; padding: 0; max-width: none; } section { orphans: 3; widows: 3; } }
</style>
</head>
<body>
<div class="sheet">
  <h1>${esc(c.title)}</h1>
  <div class="sub">${esc(c.setting)} · ${esc(c.tone)} · ${c.mode === "sandbox" ? "Free Mode / Sandbox" : "Mission-based campaign"}${characterName ? ` · Character: <strong>${esc(characterName)}</strong>` : ""}${c.maturity_rating ? ` · ${esc(c.maturity_rating)}` : ""}</div>

  <h2>Premise</h2><p>${esc(c.premise)}</p>
  <h2>Context &amp; Lore</h2><p>${esc(c.lore)}</p>

  ${locations ? `<h2>Key Locations</h2>${locations}` : ""}
  ${(c.missions && c.missions.length) ? `<h2>${c.mode === "sandbox" ? "Starting Point" : "Missions"}</h2>${missions}` : ""}
  ${npcs ? `<h2>Supporting Characters</h2>${npcs}` : ""}
  ${(c.mechanics && c.mechanics.length) ? `<h2>Mechanics &amp; Dynamics</h2><ul>${c.mechanics.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>` : ""}
  ${(c.endings && c.endings.length) ? `<h2>Possible Endings</h2><ul>${c.endings.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>` : ""}

  <footer>Generated by PRAGMA Campaign Generator</footer>
</div>
<script>window.onload = () => setTimeout(() => window.print(), 400);</script>
</body>
</html>`;
}

/**
 * Triggers a file download in the browser (client-side only).
 */
export function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

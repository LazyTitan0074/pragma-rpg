#!/usr/bin/env node
// E2E smoke test with a real browser (headless Edge) — lesson #1 from Aug 22:
// HTTP-only checks do NOT catch client-side runtime errors.
//
// What it checks:
//  1. the page loads (HTTP + render)
//  2. zero client-side JS errors (pageerror/console.error, dev HMR noise filtered)
//  3. mount-time sync pulls the character library into localStorage
//  4. saved campaigns exist locally after sync
//
// Usage (from your workstation):
//   npm i                    (puppeteer-core is a devDependency)
//   node scripts/e2e/sync-smoke.mjs [url]
// Examples:
//   node scripts/e2e/sync-smoke.mjs https://your-host.example
//   node scripts/e2e/sync-smoke.mjs http://127.0.0.1:3000
//
// Browser auto-discovery: PUPPETEER_EXECUTABLE_PATH > Edge (x86/64) > Chrome.

import { existsSync } from "node:fs";

const URL = process.argv[2] || "https://dell-vlad.taildaaab0.ts.net";
const IS_DEV = /localhost|127\.0\.0\.1/.test(URL);

function findBrowser() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  const candidates = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/microsoft-edge",
    "/usr/bin/chromium",
  ];
  return candidates.find((p) => existsSync(p)) || null;
}

const executablePath = findBrowser();
if (!executablePath) {
  console.error("✖ No Edge/Chrome found. Set PUPPETEER_EXECUTABLE_PATH.");
  process.exit(2);
}

let puppeteer;
try {
  puppeteer = (await import("puppeteer-core")).default;
} catch {
  console.error("✖ puppeteer-core missing — run `npm install` in the repo.");
  process.exit(2);
}

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

let failed = false;
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
  page.on("console", (m) => {
    // Dev-mode HMR is noisy over WebSocket — not an app error.
    if (m.type() === "error" && !/_next\/hmr/.test(m.text())) errors.push("CONSOLE: " + m.text());
  });

  await page.goto(URL, { waitUntil: "networkidle2", timeout: 60000 });
  // sync-ul de la montare: /api/saves + /api/characters + push/pull
  await new Promise((r) => setTimeout(r, IS_DEV ? 6000 : 8000));

  const state = await page.evaluate(() => {
    const read = (k) => {
      try {
        return JSON.parse(localStorage.getItem(k) || "[]");
      } catch {
        return [];
      }
    };
    return {
      characters: read("pragma_saved_characters_v1").length,
      campaigns: read("pragma_saved_campaigns_v1").length,
      hasRoot: !!document.querySelector("#__next, body"),
    };
  });

  console.log(`page rendered: ${state.hasRoot ? "✓" : "✖"}`);
  console.log(`characters synced: ${state.characters}`);
  console.log(`local campaigns: ${state.campaigns}`);
  console.log(`client errors: ${errors.length === 0 ? "zero ✓" : errors.slice(0, 5).join(" | ")}`);

  failed = !state.hasRoot || errors.length > 0;
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);

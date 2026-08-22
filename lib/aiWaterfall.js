// Multi-provider AI cascade used by every LLM-backed route.
// Tier order:
//   1. Google Gemini (key required for this tier)
//   2. OpenAI-compatible external APIs with free tiers: Groq, Cerebras —
//      activated automatically when their key exists in .env.local, otherwise
//      the tier is politely skipped
//   3. Local Ollama on the dedicated server — the final safety net, works even
//      with no keys configured at all
//
// Rules honoured on every attempt: its own timeout via AbortSignal.timeout,
// distinct TimeoutError classification (moves on to the next tier), keys travel
// only in headers (x-goog-api-key / Authorization), never in URLs.
// Zero new dependencies.

const SAFETY_BLOCK_NONE = [
  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
];

const numEnv = (name, dflt) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : dflt;
};

const splitModels = (value) =>
  String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/** Extracts a JSON object from a text reply (strips ```json fences etc.). */
export function extractJson(text) {
  let clean = String(text || "").trim();
  clean = clean.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const match = clean.match(/(\{[\s\S]*\})/);
  return match ? match[1] : clean;
}

/**
 * Builds the attempt list from environment variables read AT CALL TIME
 * (lets Groq/Cerebras activate through .env.local alone and enables mock testing).
 */
export function buildAttempts({ geminiModels = [] } = {}) {
  const attempts = [];

  // Tier 1 — Gemini.
  if (process.env.GEMINI_API_KEY) {
    for (const model of geminiModels) {
      attempts.push({
        kind: "gemini",
        model,
        baseUrl: process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com",
        key: process.env.GEMINI_API_KEY,
        timeoutMs: numEnv("GEMINI_TIMEOUT_MS", 30000),
      });
    }
  } else {
    console.warn("[AI cascade] GEMINI_API_KEY missing — skipping the Gemini tier.");
  }

  // Tier 2 — OpenAI-compatible external providers; without a key they don't join the cascade.
  for (const p of [
    {
      name: "groq",
      defaultUrl: "https://api.groq.com/openai/v1/chat/completions",
      keyEnv: "GROQ_API_KEY",
      modelsEnv: "GROQ_MODELS",
      defaultModels: "openai/gpt-oss-120b,openai/gpt-oss-20b",
      timeoutEnv: "GROQ_TIMEOUT_MS",
    },
    {
      name: "cerebras",
      defaultUrl: "https://api.cerebras.ai/v1/chat/completions",
      keyEnv: "CEREBRAS_API_KEY",
      modelsEnv: "CEREBRAS_MODELS",
      defaultModels: "llama3.1-8b",
      timeoutEnv: "CEREBRAS_TIMEOUT_MS",
    },
  ]) {
    const key = process.env[p.keyEnv];
    if (!key) continue;
    let models = splitModels(process.env[p.modelsEnv]);
    if (!models.length) models = splitModels(p.defaultModels);
    for (const model of models) {
      attempts.push({
        kind: "openai",
        name: p.name,
        model,
        url: process.env[`${p.name.toUpperCase()}_BASE_URL`] || p.defaultUrl,
        key,
        timeoutMs: numEnv(p.timeoutEnv, 30000),
      });
    }
  }

  // Tier 3 — local Ollama, the final net (no key). Cold start ~20 s on the
  // dedicated server (~12 tok/s measured), hence the generous default timeout.
  attempts.push({
    kind: "ollama",
    model: process.env.OLLAMA_MODEL || "qwen2.5:1.5b",
    baseUrl: (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/+$/, ""),
    timeoutMs: numEnv("OLLAMA_TIMEOUT_MS", 180000),
  });

  return attempts;
}

function providerLabel(attempt) {
  if (attempt.kind === "gemini") return attempt.model;
  if (attempt.kind === "openai") return `${attempt.name}/${attempt.model}`;
  return `ollama/${attempt.model}`;
}

function describeFailure(err, attempt) {
  const label = providerLabel(attempt);
  if (err?.name === "TimeoutError") {
    return `Timeout ${Math.round(attempt.timeoutMs / 1000)}s for ${label} — moving on`;
  }
  return `Failure ${label}: ${String(err?.message || err).slice(0, 200)}`;
}

async function callGemini(attempt, { systemText, turns, jsonMode, maxTokens, temperature }) {
  const body = {
    contents: turns.map((t) => ({
      role: t.role === "user" ? "user" : "model",
      parts: [{ text: t.text }],
    })),
    generationConfig: { maxOutputTokens: maxTokens, temperature },
    safetySettings: SAFETY_BLOCK_NONE,
  };
  if (systemText) body.systemInstruction = { parts: [{ text: systemText }] };
  if (jsonMode) body.generationConfig.responseMimeType = "application/json";

  const res = await fetch(`${attempt.baseUrl}/v1beta/models/${attempt.model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": attempt.key },
    signal: AbortSignal.timeout(attempt.timeoutMs),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(`status ${res.status}: ${errorBody.slice(0, 150)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("\n") || "";
  if (!text.trim()) throw new Error("empty response");
  return text;
}

function toChatMessages(systemText, turns) {
  const messages = [];
  if (systemText) messages.push({ role: "system", content: systemText });
  for (const t of turns) {
    messages.push({ role: t.role === "user" ? "user" : "assistant", content: t.text });
  }
  return messages;
}

async function callOpenAiCompat(attempt, opts) {
  // Safety cap: some models (e.g. gpt-oss on Groq) reject max_tokens above
  // their own maximum with HTTP 413 (4096 observed live).
  const maxTokens = Math.min(opts.maxTokens, attempt.maxTokensCap || 4096);
  const body = {
    model: attempt.model,
    messages: toChatMessages(opts.systemText, opts.turns),
    temperature: opts.temperature,
    max_tokens: maxTokens,
  };
  if (opts.jsonMode) body.response_format = { type: "json_object" };

  const res = await fetch(attempt.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${attempt.key}` },
    signal: AbortSignal.timeout(attempt.timeoutMs),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(`status ${res.status}: ${errorBody.slice(0, 150)}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || "";
  if (!text.trim()) throw new Error("empty response");
  return text;
}

async function callOllama(attempt, opts) {
  // Short keep_alive: the model (~1 GB RAM) unloads after use — the server also
  // runs the Next.js app and has limited memory (~3.7 GB).
  const body = {
    model: attempt.model,
    messages: toChatMessages(opts.systemText, opts.turns),
    stream: false,
    keep_alive: process.env.OLLAMA_KEEP_ALIVE || "5m",
    options: {
      temperature: opts.temperature,
      num_predict: opts.maxTokens,
      num_ctx: Number(process.env.OLLAMA_NUM_CTX) || 8192,
    },
  };
  if (opts.jsonMode) body.format = "json";

  const res = await fetch(`${attempt.baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(attempt.timeoutMs),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(`status ${res.status}: ${errorBody.slice(0, 150)}`);
  }

  const data = await res.json();
  const text = data?.message?.content || "";
  if (!text.trim()) throw new Error("empty response");
  return text;
}

const CALLERS = { gemini: callGemini, openai: callOpenAiCompat, ollama: callOllama };

/**
 * Runs the entire cascade until the first success.
 *
 * @param {object} options
 * @param {string} options.label            context for logs (e.g. "DM /api/play")
 * @param {string=} options.systemText      system instruction (optional)
 * @param {Array<{role:'user'|'model', text:string}>} options.turns conversation history
 * @param {boolean=} options.jsonMode       strict JSON output requested at every tier
 * @param {number=} options.maxTokens
 * @param {number=} options.temperature
 * @param {string[]=} options.geminiModels  Gemini model order for tier 1
 * @param {(raw:string)=>any=} options.processText  transform + validate raw text;
 *                          when it throws, the attempt counts as failed and the cascade continues
 * @returns {Promise<{value:any, provider:string|null, failures:string[]}>}
 */
export async function runAiWaterfall(options) {
  const attempts = buildAttempts(options);
  const failures = [];
  for (const attempt of attempts) {
    try {
      const raw = await CALLERS[attempt.kind](attempt, options);
      const value = options.processText ? options.processText(raw) : raw;
      console.log(`✅ [${options.label}] Succeeded with ${providerLabel(attempt)}`);
      return { value, provider: providerLabel(attempt), failures };
    } catch (err) {
      const message = describeFailure(err, attempt);
      console.warn(`⚠️ [${options.label}] ${message}`);
      failures.push(message);
    }
  }
  return { value: null, provider: null, failures };
}

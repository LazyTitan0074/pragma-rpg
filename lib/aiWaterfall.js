// Multi-provider AI cascade for every route that calls language models.
// The order depends on the requested maturity level (item 3, August 23, 2026):
//   Adult content (18+/21+, including a missing parameter): Groq → Mistral → Cerebras
//   → local Ollama. Gemini is COMPLETELY skipped — its safety policies can silently
//   block exactly the scenarios this app is built for.
//   Levels 13+/16+: Gemini → Groq → Mistral → Cerebras → local Ollama.
//
// Rules honored on every attempt: per-attempt timeout via AbortSignal.timeout,
// distinct TimeoutError classification (triggers falling through to the next tier),
// keys travel only in headers (x-goog-api-key / Authorization), never in the URL.
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

/** Extracts the JSON object from a text response (strips ```json fences etc.). */
export function extractJson(text) {
  let clean = String(text || "").trim();
  clean = clean.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const match = clean.match(/(\{[\s\S]*\})/);
  return match ? match[1] : clean;
}

/**
 * Builds the attempt list from environment variables read AT CALL TIME
 * (allows enabling Groq/Mistral/Cerebras purely via .env.local and testing with mocks).
 * `maturity` decides whether Gemini participates (only 13+/16+) or is skipped (18+/21+).
 * `preferProvider` (e.g. "mistral") moves that external provider to the first position
 * within the OpenAI-compatible section — used for long campaigns whose JSON output
 * does not fit under Groq's 4096-token cap (measured live Aug 23).
 */
export function buildAttempts({ geminiModels = [], maturity, preferProvider } = {}) {
  const attempts = [];

  // Adult content — the app's default — no longer goes through Gemini.
  const isAdult = maturity === undefined || String(maturity) === "18" || String(maturity) === "21";

  // Gemini, only for levels 13+/16+.
  if (!isAdult && process.env.GEMINI_API_KEY) {
    for (const model of geminiModels) {
      attempts.push({
        kind: "gemini",
        model,
        baseUrl: process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com",
        key: process.env.GEMINI_API_KEY,
        timeoutMs: numEnv("GEMINI_TIMEOUT_MS", 30000),
      });
    }
  } else if (!isAdult && !process.env.GEMINI_API_KEY) {
    console.warn("[AI Cascade] GEMINI_API_KEY missing — skipping tier Gemini.");
  }

  // Fallback tiers — OpenAI-compatible external providers; default order:
  // Groq → Mistral → Cerebras. Without a key, the tier is politely skipped. The
  // Mistral timeout is more generous: the free tier is slow on long generations
  // (measured live ~60–90 s).
  const externalGroups = [];
  for (const p of [
    {
      name: "groq",
      defaultUrl: "https://api.groq.com/openai/v1/chat/completions",
      keyEnv: "GROQ_API_KEY",
      modelsEnv: "GROQ_MODELS",
      defaultModels: "openai/gpt-oss-120b,openai/gpt-oss-20b",
      timeoutEnv: "GROQ_TIMEOUT_MS",
      defaultTimeoutMs: 30000,
    },
    {
      name: "mistral",
      defaultUrl: "https://api.mistral.ai/v1/chat/completions",
      keyEnv: "MISTRAL_API_KEY",
      modelsEnv: "MISTRAL_MODELS",
      defaultModels: "mistral-large-latest",
      timeoutEnv: "MISTRAL_TIMEOUT_MS",
      defaultTimeoutMs: 120000,
      // no Groq-like cap: large JSON campaigns were being truncated at 4096 tokens
      // and cascading onward with invalid JSON (measured live Aug 23)
      maxTokensCap: 8192,
    },
    {
      name: "cerebras",
      defaultUrl: "https://api.cerebras.ai/v1/chat/completions",
      keyEnv: "CEREBRAS_API_KEY",
      modelsEnv: "CEREBRAS_MODELS",
      defaultModels: "llama3.1-8b",
      timeoutEnv: "CEREBRAS_TIMEOUT_MS",
      defaultTimeoutMs: 30000,
    },
  ]) {
    const key = process.env[p.keyEnv];
    if (!key) continue;
    let models = splitModels(process.env[p.modelsEnv]);
    if (!models.length) models = splitModels(p.defaultModels);
    externalGroups.push({
      name: p.name,
      attempts: models.map((model) => ({
        kind: "openai",
        name: p.name,
        model,
        url: process.env[`${p.name.toUpperCase()}_BASE_URL`] || p.defaultUrl,
        key,
        timeoutMs: numEnv(p.timeoutEnv, p.defaultTimeoutMs),
        maxTokensCap: p.maxTokensCap,
      })),
    });
  }

  // Optional reordering: the preferred provider tries first (the rest keep their order).
  const orderedGroups = [
    ...externalGroups.filter((g) => g.name === preferProvider),
    ...externalGroups.filter((g) => g.name !== preferProvider),
  ];
  for (const group of orderedGroups) attempts.push(...group.attempts);

  // Tier 3 — local Ollama, the last resort (keyless). Cold start ~20 s on the
  // dedicated server (~12 tok/s measured), hence the generous default timeout.
  attempts.push({
    kind: "ollama",
    model: process.env.OLLAMA_MODEL || "qwen2.5:1.5b",
    baseUrl: (process.env.OLLAMA_URL || "http://100.120.119.111:11434").replace(/\/+$/, ""),
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
  return `Failure of ${label}: ${String(err?.message || err).slice(0, 200)}`;
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
  // Safety cap: some models (e.g. gpt-oss on Groq) reject with HTTP 413 requests
  // whose max_tokens exceeds their own maximum (4096 observed live).
  const maxTokens = Math.min(opts.maxTokens, attempt.maxTokensCap || 4096);
  const body = {
    model: attempt.model,
    messages: toChatMessages(opts.systemText, opts.turns),
    temperature: opts.temperature,
    max_tokens: maxTokens,
  };
  // gpt-oss reasoning models spend part of their token budget on thinking;
  // low effort so strict JSON still fits under the 4096 cap (measured live Aug 23).
  if (/gpt-oss/.test(attempt.model)) body.reasoning_effort = "low";
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
  // short keep_alive: the model is unloaded from RAM after use — the server also
  // runs the Next.js app and has limited RAM (~3.7 GB).
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
 * Runs the whole cascade until the first success.
 *
 * @param {object} options
 * @param {string} options.label            logging context (e.g. "DM /api/play")
 * @param {string=} options.systemText      system instruction (optional)
 * @param {Array<{role:'user'|'model', text:string}>} options.turns conversation history
 * @param {boolean=} options.jsonMode       strict JSON output requested at every tier
 * @param {number=} options.maxTokens
 * @param {number=} options.temperature
 * @param {string[]=} options.geminiModels  order of the Gemini models for tier 1
 * @param {(raw:string)=>any=} options.processText  transform + validate the text;
 *                          if it throws, the attempt counts as failed and the cascade continues
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

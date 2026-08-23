import { test, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { extractJson, runAiWaterfall } from "../lib/aiWaterfall.js";

// Local HTTP mocks, one per provider type. Modes: "ok" / "error" / "hang".
// Received requests are recorded in `requests` for assertions.
// Servers are unref()-ed and always closed in finally, so the test process dies cleanly.

function startMock(mode, buildResponse) {
  const requests = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString();
      let body = null;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {}
      requests.push({ url: req.url, body });

      if (mode === "error") {
        res.writeHead(503, { "Content-Type": "text/plain" });
        res.end("mock overload");
        return;
      }
      if (mode === "hang") return; // socket left open, no response ever

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(buildResponse(requests[requests.length - 1])));
    });
  });
  server.unref(); // never the sole reason for the process to stay alive
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, requests })));
}

async function stopMock(mock) {
  if (!mock) return;
  mock.server.closeAllConnections?.();
  await new Promise((resolve) => mock.server.close(resolve));
}

const geminiOk = () => ({ candidates: [{ content: { parts: [{ text: '{"title":"OK-GEMINI"}' }] } }] });
const openaiOk = () => ({ choices: [{ message: { content: '{"title":"OK-EXTERNAL"}' } }] });
const ollamaOk = () => ({ message: { content: '{"title":"OK-OLLAMA"}' } });

// Test environment: small timeouts so "hang" attempts fail fast.
let savedEnv = {};
function setEnv(overrides) {
  for (const [k, v] of Object.entries(overrides)) {
    if (!(k in savedEnv)) savedEnv[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

after(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const BASE_ENV = {
  GEMINI_TIMEOUT_MS: "1500",
  GROQ_TIMEOUT_MS: "1500",
  CEREBRAS_TIMEOUT_MS: "1500",
  OLLAMA_TIMEOUT_MS: "2000",
};

test("extractJson strips markdown fences and surrounding text", () => {
  assert.deepEqual(JSON.parse(extractJson('```json\n{"a":1}\n```')), { a: 1 });
  assert.deepEqual(JSON.parse(extractJson('Here is your campaign:\n{"b":2} Hope you like it!')), { b: 2 });
  assert.deepEqual(JSON.parse(extractJson('{"c":3}')), { c: 3 });
});

test("healthy tier 1 wins — Gemini answers first (13+/16+ only)", async () => {
  const gemini = await startMock("ok", geminiOk);
  try {
    setEnv({
      ...BASE_ENV,
      GEMINI_API_KEY: "test-key",
      GEMINI_BASE_URL: `http://127.0.0.1:${gemini.server.address().port}`,
      GROQ_API_KEY: undefined,
      CEREBRAS_API_KEY: undefined,
      MISTRAL_API_KEY: undefined,
      OLLAMA_URL: `http://127.0.0.1:9`,
      OLLAMA_MODEL: "mock-qwen",
    });

    const result = await runAiWaterfall({
      label: "Test",
      turns: [{ role: "user", text: "hello" }],
      jsonMode: true,
      maxTokens: 128,
      temperature: 0.5,
      geminiModels: ["gemini-mock"],
      maturity: "13",
    });

    assert.equal(result.provider, "gemini-mock");
    // without processText the waterfall delivers the raw text
    assert.deepEqual(JSON.parse(result.value), { title: "OK-GEMINI" });
    // jsonMode must be passed as responseMimeType to Gemini
    assert.equal(gemini.requests[0].body.generationConfig.responseMimeType, "application/json");
  } finally {
    await stopMock(gemini);
  }
});

test("Gemini down → Groq takes over, with response_format json_object (tier 16+)", async () => {
  const gemini = await startMock("error", geminiOk);
  const groq = await startMock("ok", openaiOk);
  try {
    setEnv({
      ...BASE_ENV,
      GEMINI_API_KEY: "test-key",
      GEMINI_BASE_URL: `http://127.0.0.1:${gemini.server.address().port}`,
      GROQ_API_KEY: "test-groq-key",
      GROQ_BASE_URL: `http://127.0.0.1:${groq.server.address().port}/v1/chat/completions`,
      GROQ_MODELS: "mock-llama",
      CEREBRAS_API_KEY: undefined,
      MISTRAL_API_KEY: undefined,
      OLLAMA_URL: `http://127.0.0.1:9`,
      OLLAMA_MODEL: "mock-qwen",
    });

    const result = await runAiWaterfall({
      label: "Test",
      systemText: "You are an assistant.",
      turns: [{ role: "user", text: "hello" }],
      jsonMode: true,
      maxTokens: 128,
      temperature: 0.5,
      geminiModels: ["gemini-mock"],
      maturity: "16",
    });

    assert.equal(result.provider, "groq/mock-llama");
    assert.deepEqual(JSON.parse(result.value), { title: "OK-EXTERNAL" });
    assert.equal(result.failures.length, 1); // only Gemini failed
    assert.equal(groq.requests[0].body.response_format.type, "json_object");
    assert.deepEqual(
      groq.requests[0].body.messages.map((m) => m.role),
      ["system", "user"]
    );
  } finally {
    await stopMock(gemini);
    await stopMock(groq);
  }
});

test("all cloud providers down → Ollama as last net, with json format and larger context", async () => {
  const gemini = await startMock("error", geminiOk);
  const ollama = await startMock("ok", ollamaOk);
  try {
    setEnv({
      ...BASE_ENV,
      GEMINI_API_KEY: "test-key",
      GEMINI_BASE_URL: `http://127.0.0.1:${gemini.server.address().port}`,
      GROQ_API_KEY: undefined,
      CEREBRAS_API_KEY: undefined,
      MISTRAL_API_KEY: undefined,
      OLLAMA_URL: `http://127.0.0.1:${ollama.server.address().port}`,
      OLLAMA_MODEL: "mock-qwen",
    });

    const result = await runAiWaterfall({
      label: "Test",
      systemText: "You are a DM.",
      turns: [{ role: "model", text: "welcome" }, { role: "user", text: "I act" }],
      jsonMode: true,
      maxTokens: 256,
      temperature: 0.8,
      geminiModels: ["gemini-mock"],
      maturity: "13",
    });

    assert.equal(result.provider, "ollama/mock-qwen");
    assert.deepEqual(JSON.parse(result.value), { title: "OK-OLLAMA" });
    assert.equal(ollama.requests[0].body.format, "json");
    assert.equal(ollama.requests[0].body.options.num_ctx, 8192);
    // "model" roles map to assistant
    assert.deepEqual(
      ollama.requests[0].body.messages.map((m) => `${m.role}:${m.content}`),
      ["system:You are a DM.", "assistant:welcome", "user:I act"]
    );
  } finally {
    await stopMock(gemini);
    await stopMock(ollama);
  }
});

test("invalid response at processing → waterfall continues to the next tier", async () => {
  const gemini = await startMock("ok", () => ({
    candidates: [{ content: { parts: [{ text: '{"title":"GARBAGE"}' }] } }],
  }));
  const groq = await startMock("ok", openaiOk);
  try {
    setEnv({
      ...BASE_ENV,
      GEMINI_API_KEY: "test-key",
      GEMINI_BASE_URL: `http://127.0.0.1:${gemini.server.address().port}`,
      GROQ_API_KEY: "test-groq-key",
      GROQ_BASE_URL: `http://127.0.0.1:${groq.server.address().port}/v1/chat/completions`,
      GROQ_MODELS: "mock-llama",
      CEREBRAS_API_KEY: undefined,
      MISTRAL_API_KEY: undefined,
      OLLAMA_URL: `http://127.0.0.1:9`,
      OLLAMA_MODEL: "mock-qwen",
    });

    const result = await runAiWaterfall({
      label: "Test",
      turns: [{ role: "user", text: "hello" }],
      jsonMode: true,
      maxTokens: 128,
      temperature: 0.5,
      geminiModels: ["gemini-mock"],
      maturity: "13",
      processText(raw) {
        const parsed = JSON.parse(extractJson(raw));
        if (parsed.title !== "OK-EXTERNAL") throw new Error("invalid content");
        return parsed;
      },
    });

    assert.equal(result.provider, "groq/mock-llama");
    assert.equal(result.failures.length, 1);
    assert.match(result.failures[0], /invalid content/);
  } finally {
    await stopMock(gemini);
    await stopMock(groq);
  }
});

test("provider that hangs → TimeoutError classified and passed on", async () => {
  const gemini = await startMock("hang", geminiOk);
  const ollama = await startMock("ok", ollamaOk);
  try {
    setEnv({
      ...BASE_ENV,
      GEMINI_API_KEY: "test-key",
      GEMINI_BASE_URL: `http://127.0.0.1:${gemini.server.address().port}`,
      GROQ_API_KEY: undefined,
      CEREBRAS_API_KEY: undefined,
      MISTRAL_API_KEY: undefined,
      OLLAMA_URL: `http://127.0.0.1:${ollama.server.address().port}`,
      OLLAMA_MODEL: "mock-qwen",
    });

    const result = await runAiWaterfall({
      label: "Test",
      turns: [{ role: "user", text: "hello" }],
      jsonMode: false,
      maxTokens: 64,
      temperature: 0.5,
      geminiModels: ["gemini-mock"],
      maturity: "13",
    });

    assert.equal(result.provider, "ollama/mock-qwen");
    assert.equal(result.failures.length, 1);
    assert.match(result.failures[0], /Timeout.*gemini-mock/);
  } finally {
    await stopMock(gemini);
    await stopMock(ollama);
  }
});

test("no keys at all → only Ollama is tried", async () => {
  const gemini = await startMock("ok", geminiOk);
  const ollama = await startMock("ok", ollamaOk);
  try {
    setEnv({
      ...BASE_ENV,
      GEMINI_API_KEY: undefined,
      GROQ_API_KEY: undefined,
      CEREBRAS_API_KEY: undefined,
      OLLAMA_URL: `http://127.0.0.1:${ollama.server.address().port}`,
      OLLAMA_MODEL: "mock-qwen",
    });

    const result = await runAiWaterfall({
      label: "Test",
      turns: [{ role: "user", text: "hello" }],
      jsonMode: false,
      maxTokens: 64,
      temperature: 0.5,
      geminiModels: ["gemini-mock"],
    });

    assert.equal(result.provider, "ollama/mock-qwen");
    assert.equal(gemini.requests.length, 0); // Gemini was not even contacted
  } finally {
    await stopMock(gemini);
    await stopMock(ollama);
  }
});

test("all tiers fail → value null and the full failure list", async () => {
  const gemini = await startMock("error", geminiOk);
  const ollama = await startMock("error", ollamaOk);
  try {
    setEnv({
      ...BASE_ENV,
      GEMINI_API_KEY: "test-key",
      GEMINI_BASE_URL: `http://127.0.0.1:${gemini.server.address().port}`,
      GROQ_API_KEY: undefined,
      CEREBRAS_API_KEY: undefined,
      MISTRAL_API_KEY: undefined,
      OLLAMA_URL: `http://127.0.0.1:${ollama.server.address().port}`,
      OLLAMA_MODEL: "mock-qwen",
    });

    const result = await runAiWaterfall({
      label: "Test",
      turns: [{ role: "user", text: "hello" }],
      jsonMode: false,
      maxTokens: 64,
      temperature: 0.5,
      geminiModels: ["gemini-mock-a", "gemini-mock-b"],
      maturity: "13",
    });

    assert.equal(result.value, null);
    assert.equal(result.provider, null);
    assert.equal(result.failures.length, 3); // 2 Gemini models + Ollama
  } finally {
    await stopMock(gemini);
    await stopMock(ollama);
  }
});

test("with adult content (18/21) Gemini is skipped entirely even with a valid key", async () => {
  const gemini = await startMock("ok", geminiOk);
  const groq = await startMock("ok", openaiOk);
  try {
    setEnv({
      ...BASE_ENV,
      GEMINI_API_KEY: "test-key",
      GEMINI_BASE_URL: `http://127.0.0.1:${gemini.server.address().port}`,
      GROQ_API_KEY: "test-groq-key",
      GROQ_BASE_URL: `http://127.0.0.1:${groq.server.address().port}/v1/chat/completions`,
      GROQ_MODELS: "mock-llama",
      CEREBRAS_API_KEY: undefined,
      MISTRAL_API_KEY: undefined,
      OLLAMA_URL: `http://127.0.0.1:9`,
      OLLAMA_MODEL: "mock-qwen",
    });

    const result = await runAiWaterfall({
      label: "Test",
      turns: [{ role: "user", text: "hello" }],
      jsonMode: true,
      maxTokens: 128,
      temperature: 0.5,
      geminiModels: ["gemini-mock"],
      maturity: "21",
    });

    assert.equal(result.provider, "groq/mock-llama");
    assert.equal(gemini.requests.length, 0); // Gemini was not contacted at all
    assert.deepEqual(JSON.parse(result.value), { title: "OK-EXTERNAL" });
  } finally {
    await stopMock(gemini);
    await stopMock(groq);
  }
});

test("Mistral enters after Groq; gpt-oss receives reasoning_effort low", async () => {
  const groq = await startMock("error", openaiOk);
  const mistral = await startMock("ok", openaiOk);
  try {
    setEnv({
      ...BASE_ENV,
      GEMINI_API_KEY: undefined,
      GROQ_API_KEY: "test-groq-key",
      GROQ_BASE_URL: `http://127.0.0.1:${groq.server.address().port}/v1/chat/completions`,
      GROQ_MODELS: "openai/gpt-oss-120b",
      MISTRAL_API_KEY: "test-mistral-key",
      MISTRAL_BASE_URL: `http://127.0.0.1:${mistral.server.address().port}/v1/chat/completions`,
      MISTRAL_MODELS: "mistral-mock",
      CEREBRAS_API_KEY: undefined,
      OLLAMA_URL: `http://127.0.0.1:9`,
      OLLAMA_MODEL: "mock-qwen",
    });

    const result = await runAiWaterfall({
      label: "Test",
      turns: [{ role: "user", text: "hello" }],
      jsonMode: true,
      maxTokens: 8192,
      temperature: 0.5,
      geminiModels: [],
    });

    assert.equal(result.provider, "mistral/mistral-mock");
    assert.equal(result.failures.length, 1);
    assert.match(result.failures[0], /groq/);
    // the reasoning model gets low effort so the JSON fits under the cap
    assert.equal(groq.requests[0].body.reasoning_effort, "low");
    assert.equal(mistral.requests[0].body.response_format.type, "json_object");
    assert.equal(mistral.requests[0].body.reasoning_effort, undefined); // only for gpt-oss
    // the 4096 cap is Groq-only; Mistral receives the requested budget (otherwise
    // large JSON campaigns arrive truncated and invalid — bug measured live Aug 23)
    assert.equal(groq.requests[0].body.max_tokens, 4096);
    assert.equal(mistral.requests[0].body.max_tokens, 8192);
  } finally {
    await stopMock(groq);
    await stopMock(mistral);
  }
});

test("preferProvider hoists the requested provider to the first position (long → Mistral first)", async () => {
  const groq = await startMock("ok", openaiOk);
  const mistral = await startMock("ok", openaiOk);
  try {
    setEnv({
      ...BASE_ENV,
      GEMINI_API_KEY: undefined,
      GROQ_API_KEY: "test-groq-key",
      GROQ_BASE_URL: `http://127.0.0.1:${groq.server.address().port}/v1/chat/completions`,
      GROQ_MODELS: "openai/gpt-oss-120b",
      MISTRAL_API_KEY: "test-mistral-key",
      MISTRAL_BASE_URL: `http://127.0.0.1:${mistral.server.address().port}/v1/chat/completions`,
      MISTRAL_MODELS: "mistral-mock",
      CEREBRAS_API_KEY: undefined,
      OLLAMA_URL: `http://127.0.0.1:9`,
      OLLAMA_MODEL: "mock-qwen",
    });

    const result = await runAiWaterfall({
      label: "Test prefer",
      turns: [{ role: "user", text: "hello" }],
      jsonMode: true,
      maxTokens: 8192,
      temperature: 0.5,
      geminiModels: [],
      preferProvider: "mistral",
    });

    // Mistral answers first; Groq is not even tried anymore (time savings
    // on long campaigns that would not fit under its cap anyway).
    assert.equal(result.provider, "mistral/mistral-mock");
    assert.equal(mistral.requests.length, 1);
    assert.equal(groq.requests.length, 0);

    // Without preference → default order Groq first (regression).
    const result2 = await runAiWaterfall({
      label: "Test default",
      turns: [{ role: "user", text: "hello" }],
      jsonMode: true,
      maxTokens: 8192,
      temperature: 0.5,
      geminiModels: [],
    });
    assert.match(result2.provider, /^groq\//);
  } finally {
    await stopMock(groq);
    await stopMock(mistral);
  }
});

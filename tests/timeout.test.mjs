import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

// Exact replica of the classification from pages/api/*.js
const isTimeout = (err) => err?.name === "TimeoutError";

// Local server that accepts connections but never responds
async function startHangingServer() {
  const server = http.createServer(() => {
    // intentional: no response, keeps the socket open
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server;
}

test("fetch to a server that never responds => TimeoutError on expiry", async () => {
  const server = await startHangingServer();
  const { port } = server.address();
  try {
    let caught = null;
    try {
      await fetch(`http://127.0.0.1:${port}/`, {
        signal: AbortSignal.timeout(500),
      });
    } catch (err) {
      caught = err;
    }
    assert.notEqual(caught, null, "fetch should have rejected");
    assert.equal(isTimeout(caught), true, `name=${caught?.name}, message=${caught?.message}`);
    assert.equal(caught.name, "TimeoutError");
  } finally {
    server.close();
  }
});

test("refused connection (ECONNREFUSED) is NOT classified TimeoutError", async () => {
  // find a guaranteed-free port and release it before the call
  const temp = http.createServer();
  await new Promise((resolve) => temp.listen(0, "127.0.0.1", resolve));
  const { port } = temp.address();
  await new Promise((resolve) => temp.close(resolve));

  let caught = null;
  try {
    await fetch(`http://127.0.0.1:${port}/`, {
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    caught = err;
  }

  assert.notEqual(caught, null, "fetch should have rejected");
  assert.equal(
    isTimeout(caught),
    false,
    `a refused connection must not be TimeoutError (got: ${caught?.name})`
  );
  const details = JSON.stringify({
    name: caught?.name ?? null,
    message: caught?.message ?? null,
    causeCode: caught?.cause?.code ?? null,
  });
  assert.match(details, /ECONNREFUSED|ETIMEDOUT/i);
});

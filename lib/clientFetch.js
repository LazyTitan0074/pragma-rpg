// Client fetch with a polite retry on 429 (rate limit): reads retryAfterSeconds
// from the response, waits with backoff and retries instead of surfacing a raw error.
// Purely testable: fetch and sleep are injectable (August 23, 2026).

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * POST JSON with retry on 429.
 * @param {string} url
 * @param {object} body
 * @param {object=} opts
 * @param {number=} opts.retries       how many retries after the first 429 (default 2)
 * @param {(seconds: number, attempt: number)=>void=} opts.onWait  UI notification while we wait
 * @param {(ms: number)=>Promise<void>=} opts.sleepFn injectable for tests
 * @param {typeof fetch=} opts.fetchFn injectable for tests
 * @returns {Promise<{ok: boolean, status: number, data: object}>}
 */
export async function postJsonRetry(url, body, opts = {}) {
  const { retries = 2, onWait, sleepFn = sleep, fetchFn = fetch } = opts;
  let lastStatus = 0;
  let lastData = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    let res;
    try {
      res = await fetchFn(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (e) {
      // network error: no retry here (the routes have their own timeouts
      // and the server-side cascade); let it follow the usual error path.
      return { ok: false, status: 0, data: { error: String(e?.message || e) }, networkError: true };
    }

    let data = null;
    try {
      data = await res.json();
    } catch {}

    if (res.status !== 429 || attempt === retries) {
      return { ok: res.ok, status: res.status, data };
    }

    const waitSeconds = Math.min(Math.max(Number(data?.retryAfterSeconds) || 10, 5), 60);
    lastStatus = res.status;
    lastData = data;
    try {
      onWait?.(waitSeconds, attempt + 1);
    } catch {}
    await sleepFn(waitSeconds * 1000);
  }

  return { ok: false, status: lastStatus, data: lastData };
}

import { appendFileSync } from "node:fs";

/**
 * Test-only preload used by `npm test` (scripts/run-node-tests.mjs).
 *
 * A developer shell usually exports a real provider key (DEEPSEEK_API_KEY …).
 * Any product path that falls back to that key would turn a unit test into a
 * paid, non-deterministic model call. This boundary refuses requests to paid
 * AI provider hosts, records each attempt in the ledger file the runner owns,
 * and the runner fails the whole run when the ledger is not empty — product
 * code that swallows provider errors cannot hide the attempt.
 *
 * Opt-in for a deliberately budgeted live run: ORBIT_TEST_ALLOW_PAID_AI=1.
 */
export const PAID_AI_HOSTS = Object.freeze([
  "api.deepseek.com",
  "api.openai.com",
  "generativelanguage.googleapis.com",
]);

export function paidAiHostFor(input) {
  const raw = typeof input === "string" || input instanceof URL ? String(input) : input?.url;
  let hostname;
  try {
    hostname = new URL(String(raw)).hostname;
  } catch {
    return null;
  }
  return PAID_AI_HOSTS.includes(hostname) ? hostname : null;
}

if (process.env.ORBIT_TEST_ALLOW_PAID_AI !== "1" && typeof globalThis.fetch === "function") {
  const passThroughFetch = globalThis.fetch;
  const testFile = process.argv.slice(1).find((arg) => /\.test\.|\.fixture\./u.test(arg)) ?? "unknown test file";

  globalThis.fetch = async function paidAiBoundaryFetch(input, init) {
    const host = paidAiHostFor(input);
    if (host) {
      const line = `${host} ${testFile}`;
      const ledger = process.env.ORBIT_TEST_PAID_AI_LEDGER;
      if (ledger) appendFileSync(ledger, `${line}\n`);
      process.stderr.write(`[paid-ai-boundary] blocked ${line}\n`);
      throw new TypeError(`Paid AI request to ${host} refused by the test boundary (set ORBIT_TEST_ALLOW_PAID_AI=1 for a budgeted live run).`);
    }
    return passThroughFetch(input, init);
  };
}

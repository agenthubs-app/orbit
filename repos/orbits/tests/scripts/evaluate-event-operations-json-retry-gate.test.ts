import assert from "node:assert/strict";
import test from "node:test";

import { mapRolling, parseJsonRetryOptions, runBoundedJsonRetry, shouldRetryJsonAttempt } from "../../scripts/evaluate-event-operations-json-retry-gate";

const result = (overrides: Record<string, unknown> = {}) => ({ adapterDurationMs: 1, adapterOutcome: "failed", cacheHitTokens: null, completionTokens: null, domainValidation: "not-run", domainValidationDurationMs: 0, errorCode: "AI_JSON_INVALID", finishReason: null, jsonFailureShape: "parse_syntax", messageCategory: null, overallBusinessValid: false, promptTokens: null, providerResponseBytes: null, reasoningTokens: null, totalDurationMs: 1, validationReason: null, ...overrides }) as never;

test("JSON retry gate keeps expanded compatibility and supports explicit deduplication", () => {
  assert.deepEqual(
    parseJsonRetryOptions(["--generation-id", "generation:one"]),
    {
      concurrency: 8,
      execute: false,
      generationId: "generation:one",
      promptEncoding: "expanded",
      rounds: 3,
    },
  );
  assert.equal(
    parseJsonRetryOptions([
      "--generation-id", "generation:one", "--prompt-encoding", "deduplicated",
    ]).promptEncoding,
    "deduplicated",
  );
  assert.throws(
    () => parseJsonRetryOptions([
      "--generation-id", "generation:one", "--prompt-encoding", "compressed",
    ]),
    /prompt-encoding/u,
  );
});

test("bounded retry recovers only transient JSON shapes", async () => {
  const values = [result(), result({ adapterOutcome: "succeeded", domainValidation: "passed", errorCode: null, jsonFailureShape: null, overallBusinessValid: true })];
  const delays: number[] = [];
  const output = await runBoundedJsonRetry({
    evaluate: async () => values.shift()!,
    retryDelayMs: () => 375,
    sleep: async (delayMs) => { delays.push(delayMs); },
  });
  assert.equal(output.attemptCount, 2); assert.equal(output.recoveredByRetry, true);
  assert.deepEqual(delays, [375]);
  assert.equal(output.attempts[0]?.retryDelayMsAfter, 375);
  const exhausted = await runBoundedJsonRetry({ evaluate: async () => result(), retryDelayMs: () => 250, sleep: async () => undefined });
  assert.equal(exhausted.attemptCount, 3); assert.equal(exhausted.finalValid, false);
});

test("schema domain fence and trailing failures never retry", async () => {
  for (const value of [result({ errorCode: "AI_SCHEMA_INVALID" }), result({ adapterOutcome: "succeeded", domainValidation: "failed", errorCode: "EVENT_OPERATIONS_AI_SCHEMA_INVALID", jsonFailureShape: null }), result({ jsonFailureShape: "fence_or_prefix" }), result({ jsonFailureShape: "trailing_text" })]) {
    const output = await runBoundedJsonRetry({ evaluate: async () => value }); assert.equal(output.attemptCount, 1);
  }
  assert.equal(shouldRetryJsonAttempt(result({ jsonFailureShape: "empty" })), true);
  assert.equal(shouldRetryJsonAttempt(result({ jsonFailureShape: "unterminated_envelope" })), true);
});

test("first success uses one attempt and rolling plan handles 33 logical tasks", async () => {
  const first = await runBoundedJsonRetry({ evaluate: async () => result({ adapterOutcome: "succeeded", domainValidation: "passed", errorCode: null, jsonFailureShape: null, overallBusinessValid: true }) });
  assert.equal(first.attemptCount, 1);
  const values = await mapRolling(Array.from({ length: 33 }, (_, index) => index), 8, async (value) => value);
  assert.equal(values.length, 33);
});

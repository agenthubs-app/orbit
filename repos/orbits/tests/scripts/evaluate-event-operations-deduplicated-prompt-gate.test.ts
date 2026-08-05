import assert from "node:assert/strict";
import test from "node:test";

import { parseDeduplicatedPromptGateOptions } from "../../scripts/evaluate-event-operations-deduplicated-prompt-gate";

test("deduplicated prompt gate has safe full-generation defaults", () => {
  assert.deepEqual(
    parseDeduplicatedPromptGateOptions(["--generation-id", "generation:one"]),
    {
      concurrency: 8,
      execute: false,
      generationId: "generation:one",
      rounds: 3,
    },
  );
  assert.equal(
    parseDeduplicatedPromptGateOptions([
      "--generation-id", "generation:one", "--execute", "--rounds", "1",
    ]).execute,
    true,
  );
});

test("deduplicated prompt gate rejects missing and invalid numeric options", () => {
  assert.throws(() => parseDeduplicatedPromptGateOptions([]), /generation-id/u);
  assert.throws(
    () => parseDeduplicatedPromptGateOptions(["--generation-id", "generation:one", "--rounds", "0"]),
    /rounds/u,
  );
  assert.throws(
    () => parseDeduplicatedPromptGateOptions(["--generation-id", "generation:one", "--concurrency", "1.5"]),
    /concurrency/u,
  );
});

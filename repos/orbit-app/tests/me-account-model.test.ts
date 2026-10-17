import assert from "node:assert/strict";
import test from "node:test";

test("R18a App card display uses server weights, accepts future keys, and falls back to the old score without missing-item rows", async () => {
  const model = await import("../src/screens/me/account-model").catch(() => null);
  assert.ok(model, "R18a me account model is missing");
  assert.deepEqual(model.accountCardCompleteness({ score: 67 }), { score: 67, items: [] });
  const card = { score: 25, items: [{ key: "future-field", weight: 25, done: true }, { key: "intro", weight: 25, done: false }] };
  assert.deepEqual(model.accountCardCompleteness({ score: 99, card }), card);
});

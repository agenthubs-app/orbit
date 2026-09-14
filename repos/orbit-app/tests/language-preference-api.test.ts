import assert from "node:assert/strict";
import test from "node:test";

import {
  acceptLanguagePreferenceReceipt,
  createLanguagePreferenceSaveAttempt,
} from "../src/api/language-preference";

const scope = {
  actorId: "actor:one",
  baseUrl: "https://orbit.example",
  cookieHeader: "orbit_session=one",
};

test("an unknown-result retry keeps the same mutation id only for the exact scope and payload", () => {
  const input = { mode: "manual" as const, language: "ja" as const, expectedUpdatedAt: null };
  const first = createLanguagePreferenceSaveAttempt({ ...scope, input }, null, () => "one");
  const retry = createLanguagePreferenceSaveAttempt({ ...scope, input }, first, () => "two");
  const changed = createLanguagePreferenceSaveAttempt({ ...scope, input: { ...input, language: "en" as const } }, first, () => "three");
  const changedActor = createLanguagePreferenceSaveAttempt({ ...scope, actorId: "actor:two", input }, first, () => "four");

  assert.equal(first.mutationId, "ios:language-preference:one");
  assert.equal(retry.mutationId, first.mutationId);
  assert.notEqual(changed.mutationId, first.mutationId);
  assert.notEqual(changedActor.mutationId, first.mutationId);
});

test("save receipts must acknowledge the exact scope, mutation, value, and a newer version", () => {
  const attempt = createLanguagePreferenceSaveAttempt({
    ...scope,
    input: {
      mode: "manual",
      language: "ja",
      expectedUpdatedAt: "2026-09-15T00:00:00.000Z",
    },
  }, null, () => "receipt");
  const body = {
    mode: "manual",
    language: "ja",
    mutationId: attempt.mutationId,
    updatedAt: "2026-09-15T00:00:00.001Z",
  };

  assert.deepEqual(acceptLanguagePreferenceReceipt(attempt, body, scope), {
    ok: true,
    preference: { mode: "manual", language: "ja", updatedAt: body.updatedAt },
  });
  assert.deepEqual(acceptLanguagePreferenceReceipt(attempt, { ...body, language: "en" }, scope), { ok: false });
  assert.deepEqual(acceptLanguagePreferenceReceipt(attempt, { ...body, mutationId: "wrong" }, scope), { ok: false });
  assert.deepEqual(acceptLanguagePreferenceReceipt(attempt, { ...body, updatedAt: attempt.body.expectedUpdatedAt }, scope), { ok: false });
  assert.deepEqual(acceptLanguagePreferenceReceipt(attempt, body, { ...scope, actorId: "actor:two" }), { ok: false });
});

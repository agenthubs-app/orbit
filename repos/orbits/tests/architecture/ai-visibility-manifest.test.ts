import assert from "node:assert/strict";
import test from "node:test";

import {
  AI_VISIBILITY_MANIFEST,
  getAiVisibilitySource,
  validateAiVisibilityManifest,
} from "../../features/orbit-ai/data-visibility/manifest";

const requiredSources = [
  "tool:events.recommend",
  "tool:contacts.recommend",
  "tool:followups.reviewQueue",
  "tool:chat.context",
  "tool:profile.getSelf",
  "tool:notes.query",
  "tool:tasks.query",
  "tool:followups.query",
  "tool:schedule.query",
  "context:message",
  "context:history",
  "context:memory",
  "context:outcomes",
] as const;

test("AI visibility manifest covers every explicit read tool and provider context source", () => {
  assert.deepEqual(AI_VISIBILITY_MANIFEST.map((entry) => entry.id).sort(), [...requiredSources].sort());
  assert.deepEqual(validateAiVisibilityManifest(AI_VISIBILITY_MANIFEST), []);
  for (const source of AI_VISIBILITY_MANIFEST) {
    assert.equal(source.actorScope, "server_injected_actor");
    assert.ok(source.allowedFields.length > 0);
    assert.ok(source.maxItems > 0 && source.maxItems <= 20);
    assert.ok(source.purpose.trim());
    assert.ok(source.redaction.deniedFields.includes("providerToken"));
    assert.equal(source.audit.recordContent, false);
  }
});

test("unregistered visibility sources and fields are denied by default", () => {
  assert.equal(getAiVisibilitySource("tool:unknown"), null);
  const notes = getAiVisibilitySource("tool:notes.query");
  assert.ok(notes);
  assert.equal(notes.allowedFields.includes("body"), true);
  assert.equal(notes.allowedFields.includes("providerToken"), false);
  assert.equal(notes.allowedFields.includes("rawAttachment"), false);
});

test("manifest validator rejects duplicate ids, empty allowlists, and content audit", () => {
  const first = AI_VISIBILITY_MANIFEST[0];
  assert.deepEqual(validateAiVisibilityManifest([
    first,
    { ...first },
    { ...AI_VISIBILITY_MANIFEST[1], allowedFields: [], audit: { ...AI_VISIBILITY_MANIFEST[1].audit, recordContent: true as false } },
  ]), [
    `duplicate source: ${first.id}`,
    `allowed fields are required: ${AI_VISIBILITY_MANIFEST[1].id}`,
    `audit content must be disabled: ${AI_VISIBILITY_MANIFEST[1].id}`,
  ]);
});

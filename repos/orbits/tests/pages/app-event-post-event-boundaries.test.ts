import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const realDetailPath = new URL("../../app/(app)/app/events/[id]/orbit-real-event-detail.tsx", import.meta.url);
const centerPath = new URL("../../app/(app)/app/events/[id]/orbit-post-event-center.tsx", import.meta.url);
const legacyHandlerPath = new URL("../../app/api/events/[id]/post-event/followup/handler.ts", import.meta.url);

test("real event detail uses HumanEncounter and attendee artifact boundaries, not the legacy capture", async () => {
  const [detail, center, legacyHandler] = await Promise.all([
    readFile(realDetailPath, "utf8"),
    readFile(centerPath, "utf8"),
    readFile(legacyHandlerPath, "utf8"),
  ]);

  assert.doesNotMatch(detail, /OrbitPostEventFollowupCapture/);
  assert.match(detail, /OrbitEventMatchmaking/);
  assert.match(center, /post-event\/artifact/);
  assert.match(center, /method: "POST"/);
  assert.match(center, /setInterval/);
  assert.match(center, /disabled=\{encounters === 0\}/);
  assert.match(center, /aiState === "ready" && artifact/);
  assert.match(legacyHandler, /LEGACY_POST_EVENT_FOLLOWUP_DISABLED/);
  assert.match(legacyHandler, /HumanEncounter/);
});

import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryOrbitAgentChatOrganizationStore } from "../../features/orbit-ai/storage/orbit-agent-chat-session-transactions";
import { createStorageOrbitAgentChatSessionProvider } from "../../features/orbit-ai/storage/orbit-agent-chat-session-live-record-provider";
import { expireOrbitAgentChatSessions } from "../../features/orbit-ai/storage/orbit-agent-chat-session-retention";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const now = new Date("2026-10-18T00:00:00.000+09:00");
const age = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

test("R21 local retention keeps Tokyo day 90 and pinned sessions, deletes day 91 only, and is idempotent", async () => {
  const records = createMemoryLiveRecordStore<Record<string, unknown>>();
  const orgRecords = createMemoryLiveRecordStore<Record<string, unknown>>();
  const workspaceId = "workspace:retention";
  const actorId = "actor:retention-owner";
  const provider = createStorageOrbitAgentChatSessionProvider({ actorId, store: records, workspaceId });
  const organization = createMemoryOrbitAgentChatOrganizationStore({ actorId, store: orgRecords, workspaceId });
  const foreign = createStorageOrbitAgentChatSessionProvider({ actorId: "actor:foreign", store: records, workspaceId });
  for (const [id, createdDays, updatedDays] of [
    ["day89", 89, 89], ["day90", 90, 90], ["day91", 91, 91],
    ["active-again", 120, 2], ["pinned", 100, 100], ["unpinned", 101, 101],
  ] as const) {
    await provider.upsertSession({ id, title: id, createdAt: age(createdDays), updatedAt: age(updatedDays),
      messages: [{ id: `message:${id}`, role: "user", text: id }] });
  }
  await foreign.upsertSession({ id: "foreign-old", title: "foreign", createdAt: age(120), updatedAt: age(120),
    messages: [{ id: "foreign-message", role: "user", text: "foreign" }] });
  await organization.mutateSessionOrganization("pinned", { expectedRevision: 0, mutationId: "pin", patch: { pinned: true } });
  await organization.mutateSessionOrganization("unpinned", { expectedRevision: 0, mutationId: "pin-then-unpin", patch: { pinned: true } });
  await organization.mutateSessionOrganization("unpinned", { expectedRevision: 1, mutationId: "unpin", patch: { pinned: false } });

  const first = await expireOrbitAgentChatSessions({ provider, organization, now });
  assert.deepEqual(first.deletedIds.sort(), ["day91", "unpinned"]);
  assert.equal(first.truncated, false);
  assert.equal(await provider.getSession("day90") !== null, true);
  assert.equal(await provider.getSession("pinned") !== null, true);
  assert.equal(await provider.getSession("active-again") !== null, true);
  assert.equal(await provider.getSession("day91"), null);
  assert.equal(await foreign.getSession("foreign-old") !== null, true);
  assert.deepEqual((await expireOrbitAgentChatSessions({ provider, organization, now })).deletedIds, []);
});

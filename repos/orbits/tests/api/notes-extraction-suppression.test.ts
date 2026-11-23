/**
 * agent-design AG06-5 (设计稿 §4 "后续效果也属于写入范围", 附录 E): a memo the Agent writes after a card
 * carries a persisted `autoExtraction: "suppressed"` mark, and both paths that would start the old
 * automatic extraction honour it — the save hook (`noteOnPersisted`) and the maintenance rescan
 * (`MEMO_RESCAN_SQL`). The memos here have the shape that DOES trigger extraction (a meeting note used
 * for the plan, one contact), so a pass is not vacuous: the same memo without the mark is picked up.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { noteOnPersisted } from "../../app/api/notes/route-support";
import { listMemoExtractionRescanCandidates } from "../../features/contacts/memo-extraction/rescan";
import type { NoteDTO } from "../../features/notes/contract";
import { createNoteRepository } from "../../features/notes/repository";
import { createNoteService, NoteServiceError } from "../../features/notes/service";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { ALICE, databaseTest, withNetworkDatabase, WORKSPACE } from "../support/network-analysis-harness";

const NOW = "2026-11-15T01:00:00.000Z";

function triggeringNote(extra: Partial<NoteDTO> = {}): NoteDTO {
  return {
    accountId: ALICE, body: "小林今天来过电话。", contactIds: ["c17"], createdAt: NOW, eventIds: [], id: "note:agent-1",
    manualContactIds: ["c17"], mentions: [], noteKind: "meeting", ownerUserId: ALICE, title: "小林今天来过电话", updatedAt: NOW, usedForPlan: true, version: 1,
    ...extra,
  };
}

test("save hook: the trigger shape schedules extraction, the same memo marked suppressed does not", () => {
  const jobs: unknown[] = [];
  const deps = { scheduleMemoExtraction: (job: unknown) => { jobs.push(job); } };
  noteOnPersisted(triggeringNote(), deps as never);
  assert.equal(jobs.length, 1, "control: without the mark this memo is extracted");
  noteOnPersisted(triggeringNote({ autoExtraction: "suppressed", id: "note:agent-2" }), deps as never);
  assert.equal(jobs.length, 1, "the suppressed memo schedules nothing");
});

test("note service: the interaction's actual contacts must be among the memo's contacts; the mark and the interaction persist", async () => {
  const service = createNoteService({ repository: createNoteRepository({ store: createMemoryLiveRecordStore(), workspaceId: "workspace:test" }) });
  const interaction = { actualContactIds: ["c17"], channel: "phone" as const, direction: "incoming" as const, occurredOn: "2026-11-15", precision: "day" as const };
  await assert.rejects(
    service.create({ actorId: ALICE, autoExtraction: "suppressed", body: "小林今天来电话了，说小陈还在审合同。", contactIds: ["c21"], idempotencyKey: "k-bad", interaction, now: NOW }),
    (error: unknown) => error instanceof NoteServiceError && error.code === "NOTE_INVALID_INPUT",
    "an actual contact that is not linked to the memo is refused",
  );
  const created = await service.create({ actorId: ALICE, autoExtraction: "suppressed", body: "小林今天来电话了，说小陈还在审合同。", contactIds: ["c17", "c21"], idempotencyKey: "k-1", interaction, now: NOW });
  assert.deepEqual(created.interaction?.actualContactIds, ["c17"], "the mentioned person stays a link, not an actual contact");
  assert.deepEqual([...created.contactIds], ["c17", "c21"]);
  assert.equal(created.autoExtraction, "suppressed");
  const again = await service.create({ actorId: ALICE, autoExtraction: "suppressed", body: "小林今天来电话了，说小陈还在审合同。", contactIds: ["c17", "c21"], idempotencyKey: "k-1", interaction, now: "2026-11-15T02:00:00.000Z" });
  assert.equal(again.id, created.id, "the same key replays the same memo");
  assert.equal((await service.list({ actorId: ALICE })).length, 1, "no second memo");
  const stored = await service.get({ actorId: ALICE, noteId: created.id });
  assert.equal(stored?.autoExtraction, "suppressed");
  assert.deepEqual(stored?.interaction, { actualContactIds: ["c17"], channel: "phone", direction: "incoming", occurredOn: "2026-11-15", precision: "day" });
});

test("maintenance rescan: a suppressed plan-use meeting memo is never a candidate; the same memo unmarked is", databaseTest, async () => {
  await withNetworkDatabase(async (harness) => {
    await harness.addContact(ALICE, "c17", { organization: "北辰软件", role: "销售总监" });
    for (const [id, marked] of [["note:plain", false], ["note:agent", true]] as const) {
      const note = triggeringNote({ id, ...(marked ? { autoExtraction: "suppressed" as const } : {}) });
      await harness.insertRecord({ collection: "notes", id, payload: { note, operations: [], schemaVersion: 2 }, userId: ALICE });
    }
    const candidates = await listMemoExtractionRescanCandidates(harness.client, { now: new Date(NOW), workspaceId: WORKSPACE });
    assert.deepEqual(candidates.map((item) => item.noteId), ["note:plain"]);
  });
});

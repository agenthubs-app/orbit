import assert from "node:assert/strict";
import test from "node:test";

import type { AgentActionRecord } from "../../features/agent/runtime/contract";
import { createMemoryAgentRuntimeRepository, decodeAgentActionCursor, isAgentActionCursor } from "../../features/agent/runtime/repository";
import { createStorageAgentRuntimeRepository } from "../../features/agent/storage/agent-runtime-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

// Sprint 0121 item 1, Codex's reproduction without a database: the production
// storage repository over the memory store (no SQL client), and the memory
// repository, both filter before they page. The Postgres path is covered by
// agent-ledger-paging-postgres.test.ts.

const at = (index: number) => new Date(Date.UTC(2026, 0, 1) + index * 60_000).toISOString();
function action(index: number, fields: Partial<AgentActionRecord> = {}): AgentActionRecord {
  const actionId = `action:${String(index).padStart(4, "0")}`;
  return {
    actionId, runId: `run:${actionId}`, workflowKey: "wf_bulk", workflowVersion: 1, title: `Action ${index}`, whyNow: "Test",
    status: "completed", riskLevel: "write", payloadVersion: 1, operations: [], evidenceChips: [], evidenceIds: [], sourceRefs: [],
    preview: "Test", compensation: { supported: false }, createdAt: at(index), updatedAt: at(index), immutablePayloadHash: `hash:${index}`,
    ...fields,
  } as AgentActionRecord;
}

for (const [label, make] of [
  ["storage repository over the memory store", () => createStorageAgentRuntimeRepository({ store: createMemoryLiveRecordStore() as never, workspaceId: "workspace:paging" })],
  ["memory repository", () => createMemoryAgentRuntimeRepository()],
] as const) {
  test(`0121 ${label}: an old awaiting action behind 500 newer completed ones is listed, and pages reach all 501`, async () => {
    const repo = make();
    await repo.saveAction(action(0, { status: "awaiting_confirmation", workflowKey: "wf_old" }));
    for (let index = 1; index <= 500; index += 1) await repo.saveAction(action(index));
    assert.deepEqual((await repo.listActions({ status: "awaiting_confirmation" })).map((a) => a.actionId), ["action:0000"]);
    assert.deepEqual((await repo.listActions({ workflowKey: "wf_old" })).map((a) => a.actionId), ["action:0000"]);
    assert.equal((await repo.listActions({})).length, 500, "an unfiltered list is still one bounded page");
    const ids: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await repo.listActionPage({ limit: 200, cursor });
      ids.push(...page.actions.map((a) => a.actionId));
      cursor = page.nextCursor;
    } while (cursor);
    assert.equal(new Set(ids).size, 501);
    assert.equal(ids.at(-1), "action:0000");
    assert.equal((await repo.getAction("action:0000"))?.status, "awaiting_confirmation");
  });
}

test("0121 action cursors are opaque, round-trip and reject tampering", () => {
  assert.equal(isAgentActionCursor("not-a-cursor"), false);
  assert.equal(isAgentActionCursor(Buffer.from('["x"]').toString("base64url")), false);
  const cursor = Buffer.from(JSON.stringify([at(3), "action:0003"])).toString("base64url");
  assert.deepEqual(decodeAgentActionCursor(cursor), { updatedAt: at(3), actionId: "action:0003" });
});

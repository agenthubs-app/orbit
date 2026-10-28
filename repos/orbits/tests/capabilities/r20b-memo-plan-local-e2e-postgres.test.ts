import assert from "node:assert/strict";
import test from "node:test";

import { createNoteCollectionHandlers } from "../../app/api/notes/collection-handler";
import { createNoteDetailHandlers } from "../../app/api/notes/[id]/handler";
import type { AiQuotaGate } from "../../features/ai-quota/gate";
import { memoExtractionKey, runMemoExtraction, type MemoExtractionJobInput } from "../../features/contacts/memo-extraction/job";
import { createMockMemoExtractionProvider } from "../../features/contacts/memo-extraction/provider";
import { createLiveRecordMemoExtractionStore } from "../../features/contacts/memo-extraction/store";
import { createNoteRepository } from "../../features/notes/repository";
import { createNoteService } from "../../features/notes/service";
import { createPostgresPlanV2Repository } from "../../features/plans/v2/repository";
import { createPlanV2Service } from "../../features/plans/v2/service";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { ANY_REFERENCES, draftInput, steppingClock } from "../plans/v2-fixture";
import { databaseTest, withNetworkDatabase, WORKSPACE } from "../support/network-analysis-harness";

const ALICE = "actor:alice";
const BOB = "actor:bob";
const CONTACT = "contact:alice-cfo";

// Runs only against D's isolated test databases; any other database is skipped (with the reason), not failed.
const LINE_D_DATABASES = ["/orbit_line_d", "/orbit_line_d_test"];
const onLineDDatabase = Boolean(process.env.ORBIT_EVENT_DATABASE_URL && LINE_D_DATABASES.includes(new URL(process.env.ORBIT_EVENT_DATABASE_URL).pathname));
const lineDTest = databaseTest.skip ? databaseTest : { skip: onLineDDatabase ? false : "needs D's isolated test database (orbit_line_d / orbit_line_d_test)" };

test("R20b local PostgreSQL: saved meeting memo creates one C11 card; only confirmation scores", lineDTest, async () => {
  assert.ok(LINE_D_DATABASES.includes(new URL(process.env.ORBIT_EVENT_DATABASE_URL!).pathname), "D's isolated test databases only");
  await withNetworkDatabase(async ({ addContact, client, pool }) => {
    const records = createPostgresLiveRecordStore({ client });
    const notes = createNoteService({ repository: createNoteRepository({ store: records, workspaceId: WORKSPACE }) });
    const repository = createPostgresPlanV2Repository({ pool });
    let sequence = 0;
    const serviceFor = (actorId: string) => createPlanV2Service({
      newId: () => `memo-e2e-${++sequence}`,
      now: steppingClock(),
      references: ANY_REFERENCES,
      repository,
      scope: { actorId, workspaceId: WORKSPACE },
    });
    const alice = serviceFor(ALICE);
    const bob = serviceFor(BOB);
    await addContact(ALICE, CONTACT);
    const { plan } = await alice.createPlanFromDraft(draftInput());
    const itemId = plan.content.personTypes.find((type) => type.key === "cfo")!.itemId;
    assert.ok(await alice.linkTypeContact({ contactId: CONTACT, itemId }));

    const jobs: Array<MemoExtractionJobInput & { usedForPlan: true }> = [];
    const owner = createNoteCollectionHandlers({
      now: () => "2026-10-19T00:00:00.000Z",
      resolveActor: async () => ({ id: ALICE, userId: ALICE, workspaceId: WORKSPACE }),
      scheduleMemoExtraction: (job) => { jobs.push(job); },
      service: notes,
    });
    const payload = { body: "Met the CFO and discussed revenue and runway.", contactIds: [CONTACT],
      idempotencyKey: "r20b:c11:meeting", noteKind: "meeting", usedForPlan: true };
    const request = () => new Request("https://orbit.local/api/notes", { body: JSON.stringify(payload), method: "POST" });
    const response = await owner.POST(request());
    assert.equal(response.status, 201);
    const saved = ((await response.json()) as { data: { note: { id: string } } }).data.note;
    assert.equal((await owner.POST(request())).status, 201, "the idempotent HTTP replay succeeds");
    assert.deepEqual(jobs.map((job) => [job.actorId, job.contactId, job.noteId, job.usedForPlan]),
      [[ALICE, CONTACT, saved.id, true]], "only a committed new note schedules extraction");
    const privateRead = createNoteDetailHandlers({
      resolveActor: async () => ({ id: BOB, userId: BOB, workspaceId: WORKSPACE }), service: notes,
    });
    assert.equal((await privateRead.GET(new Request(`https://orbit.local/api/notes/${saved.id}`),
      { params: Promise.resolve({ id: saved.id }) })).status, 404);

    const fit = await alice.contactFit(CONTACT);
    const eligible = fit.fits.find((item) => item.itemId === itemId)!;
    assert.ok(eligible && eligible.status !== "talked");
    const detail = await alice.typeDetail(eligible.planId, eligible.itemId);
    assert.ok(detail && !detail.skipped && detail.questions.length === 3);
    const planQuestions = [{ itemId, questions: detail.questions }];
    const mock = createMockMemoExtractionProvider({ offering: [], seeking: [], topics: [], eventTypes: [],
      questionCoverage: [{ itemId, answered: [0, 1] }] });
    const gateCalls: string[] = [];
    const gate: AiQuotaGate = {
      async reserve(input) { gateCalls.push(`reserve:${input.idempotencyKey}`); return { ok: true, operationId: "op:memo-e2e", owner: true, status: "reserved" }; },
      async beginCall(operationId) { gateCalls.push(`begin:${operationId}`); return { callId: "call:memo-e2e" }; },
      async endCall(callId) { gateCalls.push(`end:${callId}`); },
      async finish(operationId, outcome) { gateCalls.push(`finish:${operationId}:${outcome}`); },
    };
    // The configured production path makes the same narrow adapter cast: its CAS method may return sync or async.
    const extractionStore = createLiveRecordMemoExtractionStore({
      store: records as unknown as Parameters<typeof createLiveRecordMemoExtractionStore>[0]["store"],
      workspaceId: WORKSPACE,
    });
    const job = { ...jobs[0]!, contact: { organization: "Example", role: "CFO" }, planQuestions };
    const run = () => runMemoExtraction(job, {
      applyValues: async () => [], gate, provider: mock, store: extractionStore,
      onPlanCoverage: async ({ coverage, manual, memoId }) => {
        await alice.proposeMemoCoverage({ contactId: CONTACT, coverage, manual, memoId });
      },
    });
    const scoreBefore = (await alice.summary()).current!.score.total;
    const extraction = await run();
    assert.equal(extraction.status, "succeeded");
    assert.equal(extraction.key, memoExtractionKey(saved.id, payload.body));
    assert.equal(mock.calls.length, 1);
    assert.deepEqual(mock.calls[0]?.planQuestions, planQuestions);
    assert.deepEqual(gateCalls.map((call) => call.split(":")[0]), ["reserve", "begin", "end", "finish"]);
    assert.equal((await alice.summary()).current!.score.total, scoreBefore, "proposal alone must not score");
    assert.equal((await bob.pending()).filter((card) => card.kind === "memo_coverage").length, 0);
    const card = (await alice.pending()).find((item) => item.kind === "memo_coverage" && item.itemId === itemId);
    assert.ok(card);
    const accepted = await alice.decidePending({ decision: "accept", id: card.id, idempotencyKey: "r20b:c11:confirm" });
    assert.equal(accepted.status, "accepted");
    assert.equal((await alice.summary()).current!.score.total, scoreBefore + accepted.award!.points);
    assert.equal((await alice.decidePending({ decision: "accept", id: card.id,
      idempotencyKey: "r20b:c11:confirm" })).replayed, true);
    assert.equal((await alice.pending()).filter((item) => item.kind === "memo_coverage").length, 0);

    assert.equal((await run()).status, "succeeded", "same note/body is not extracted twice");
    assert.equal(mock.calls.length, 1);
    assert.equal(gateCalls.length, 4);
    assert.equal((await alice.pending()).filter((item) => item.kind === "memo_coverage").length, 0);
    const persisted = await pool.query<{ collection_name: string; user_id: string; payload: Record<string, unknown> }>(
      "select collection_name, user_id, payload from orbit_records where workspace_id=$1 and ((collection_name='notes' and record_id=$2) or collection_name='memo_extractions') order by collection_name",
      [WORKSPACE, saved.id],
    );
    assert.deepEqual(persisted.rows.map((row) => [row.collection_name, row.user_id]),
      [["memo_extractions", ALICE], ["notes", ALICE]]);
    assert.equal(persisted.rows[0]?.payload.status, "succeeded");
    assert.equal((persisted.rows[1]?.payload.note as { usedForPlan?: boolean } | undefined)?.usedForPlan, true);
    const awards = await pool.query<{ n: number }>(
      "select count(*)::int n from plan_log where plan_id=$1 and event='score_awarded' and payload->>'basis'='memo'",
      [plan.planId],
    );
    assert.equal(awards.rows[0]?.n, 1);
  });
});

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";

import { Pool } from "pg";

import { createEventRegistrationRouteHandlers } from "../../app/api/events/[id]/registration/route-handlers";
import type { EventRecord } from "../../features/events/event-crud-and-import/contract";
import {
  createEventOperationsPostgresClient,
  type EventOperationsPostgresRuntime,
} from "../../features/events/event-operations/storage/postgres-client";
import { runEventOperationsMigrations } from "../../features/events/event-operations/storage/migrations";
import { createEventExperienceService } from "../../features/events/experience/service";
import { createPostgresEventExperienceRepository } from "../../features/events/experience/storage/postgres-repository";
import { runEventExperienceMigrations } from "../../features/events/experience/storage/migrations";
import {
  createEventRegistrationService,
  createMemoryEventRegistrationProvider,
} from "../../features/events/registration/service";

// Sprint 0128: registration questions for an event without a published question
// set are generated once per (event, language, question-relevant content) and
// shared by every reader. The model is counted at the provider HTTP boundary:
// the real route handler, the real DeepSeek client and real PostgreSQL run; only
// api.deepseek.com is answered by this in-process stub.
const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const skip = databaseUrl ? false : "set ORBIT_LIFECYCLE_TEST_DATABASE_URL to an isolated local PostgreSQL database";

type ModelMode = "ok" | "fail" | "invalid";

interface ProviderStub {
  calls: number;
  delayMs: number;
  mode: ModelMode;
  languages: string[];
}

const stub: ProviderStub = { calls: 0, delayMs: 0, mode: "ok", languages: [] };

function installProviderStub(): () => void {
  const originalFetch = globalThis.fetch;
  const previousEnv = {
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
    ORBIT_AGENT_PROVIDER: process.env.ORBIT_AGENT_PROVIDER,
  };
  process.env.DEEPSEEK_API_KEY = "stub-key-not-a-secret";
  process.env.ORBIT_AGENT_PROVIDER = "deepseek";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" || input instanceof URL ? String(input) : input.url;
    if (new URL(url).hostname !== "api.deepseek.com") return originalFetch(input, init);
    stub.calls += 1;
    const callNumber = stub.calls;
    const body = JSON.parse(String(init?.body ?? "{}")) as { messages?: { role: string; content: string }[] };
    const user = JSON.parse(body.messages?.find((message) => message.role === "user")?.content ?? "{}") as {
      candidates?: { id: string; intent: string; participantProfileField: string }[];
      event?: { title?: string };
      instructions?: { language?: string };
    };
    stub.languages.push(user.instructions?.language ?? "?");
    if (stub.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, stub.delayMs));
    if (stub.mode === "fail") {
      return new Response(JSON.stringify({ error: { message: "stub outage" } }), { status: 503, headers: { "content-type": "application/json" } });
    }
    const title = user.event?.title ?? "";
    const content = stub.mode === "invalid"
      ? "not json"
      : JSON.stringify({
          questions: (user.candidates ?? []).map((candidate, index) => ({
            id: candidate.id,
            intent: candidate.intent,
            participantProfileField: candidate.participantProfileField,
            // The call number makes every generation distinguishable, so equal
            // prompts across readers prove they share one stored generation.
            prompt: `Generation ${callNumber} question ${index + 1} for ${title}?`,
            options: [`Option A${callNumber}`, `Option B${callNumber}`],
          })),
        });
    return new Response(JSON.stringify({
      model: "deepseek-chat",
      choices: [{ finish_reason: "stop", message: { role: "assistant", content } }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

function resetStub(mode: ModelMode = "ok", delayMs = 0): void {
  stub.calls = 0;
  stub.delayMs = delayMs;
  stub.mode = mode;
  stub.languages = [];
}

function eventFixture(id: string, overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    aiProviderRequested: false,
    calendarProviderRequested: false,
    calendarSyncRequested: false,
    description: "A focused founders evening.",
    emailProviderRequested: false,
    endsAt: "2030-03-14T12:00:00.000Z",
    evidence: [],
    externalNetworkRequested: false,
    id,
    liveDatabaseWriteExecuted: false,
    nextAction: "Complete registration",
    notificationDelivered: false,
    organizerFeedRequested: false,
    recommendedPreparation: "Answer both questions.",
    relationshipContext: "Question cache fixture.",
    sourceMetadata: {
      calendarSyncRequested: false,
      captureMethod: "manual_form",
      externalNetworkRequested: false,
      importedAt: "2030-01-01T00:00:00.000Z",
      label: "Question cache fixture",
      liveDatabaseWriteExecuted: false,
      organizerFeedRequested: false,
      provider: "test",
      providerRecordId: id,
      id: `source:${id}`,
      type: "manual",
    },
    startsAt: "2030-03-14T09:30:00.000Z",
    status: "confirmed",
    title: "Cache Night",
    venue: "Tokyo",
    ...overrides,
  };
}

interface Harness {
  admin: Pool;
  pools: Pool[];
  runtime(): EventOperationsPostgresRuntime;
  schemaUrl: string;
  workspaceId: string;
}

async function openHarness(t: TestContext, schema: string): Promise<Harness> {
  assert.ok(databaseUrl);
  const workspaceId = `workspace:${schema}:${randomUUID()}`;
  const scoped = new URL(databaseUrl);
  scoped.searchParams.set("options", `-c search_path=${schema}`);
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pools: Pool[] = [];
  t.after(async () => {
    await Promise.all(pools.map((pool) => pool.end()));
    await admin.end();
  });
  return {
    admin,
    pools,
    schemaUrl: scoped.toString(),
    workspaceId,
    runtime() {
      // Each call is a separate pool: a second "server instance" that shares
      // nothing with the first except the database.
      const pool = new Pool({ connectionString: scoped.toString(), max: 4 });
      pools.push(pool);
      return { client: createEventOperationsPostgresClient({ connectionString: scoped.toString(), pool }), workspaceId };
    },
  };
}

async function insertEvent(harness: Harness, eventId: string): Promise<void> {
  await harness.admin.query(
    `insert into ${schemaName}.event_ops_events (workspace_id, event_id, organizer_actor_id, created_at, updated_at)
     values ($1, $2, 'actor:organizer', now(), now())`,
    [harness.workspaceId, eventId],
  );
}

let schemaName = "";

function handlersFor(input: {
  actorId: string;
  event: () => EventRecord;
  runtime: EventOperationsPostgresRuntime;
  registrationService?: ReturnType<typeof createEventRegistrationService>;
  publishedFrom?: ReturnType<typeof createEventExperienceService>;
}) {
  return createEventRegistrationRouteHandlers({
    getPublishedQuestionSet: async (eventId) => input.publishedFrom ? input.publishedFrom.getPublishedQuestionSet(eventId) : null,
    loadEvent: async (id) => (id === input.event().id ? input.event() : null),
    questionCacheRuntime: () => input.runtime,
    registrationService: input.registrationService ?? createEventRegistrationService({ provider: createMemoryEventRegistrationProvider() }),
    resolveActor: async () => ({ id: input.actorId, name: input.actorId }),
  });
}

interface QuestionSetBody {
  provenance: { aiProviderRequested: boolean; fallbackReason: string | null; generationMethod: string; model: string | null };
  questionSetHash?: string;
  questionSetVersion?: number;
  questions: { participantProfileField: string; prompt: string }[];
}

async function readQuestions(handlers: ReturnType<typeof handlersFor>, eventId: string, language: "en" | "zh" = "zh"): Promise<QuestionSetBody> {
  const response = await handlers.GET(
    new Request(`http://orbit.local/api/events/${eventId}/registration?language=${language}`),
    { params: Promise.resolve({ id: eventId }) },
  );
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body.data.questionSet as QuestionSetBody;
}

async function submit(handlers: ReturnType<typeof handlersFor>, eventId: string, extra: Record<string, unknown>): Promise<{ status: number; body: { error?: { message: string } } }> {
  const response = await handlers.POST(new Request(`http://orbit.local/api/events/${eventId}/registration`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ answers: { targetAttendees: "Founders", valueOffered: "Introductions" }, ...extra }),
  }), { params: Promise.resolve({ id: eventId }) });
  return { status: response.status, body: await response.json() };
}

async function cacheRows(harness: Harness, eventId: string) {
  return (await harness.admin.query<{
    language: string; state: string; attempt_count: number; question_set_hash: string | null;
    retry_after_seconds: number | null; last_error_code: string | null;
  }>(
    `select language, state, attempt_count, question_set_hash, last_error_code,
            extract(epoch from (retry_after - updated_at))::float as retry_after_seconds
       from ${schemaName}.event_ops_registration_question_cache
      where workspace_id = $1 and event_id = $2
      order by created_at, language`,
    [harness.workspaceId, eventId],
  )).rows;
}

test("registration question cache on real PostgreSQL", { skip, timeout: 120_000 }, async (t) => {
  assert.ok(databaseUrl);
  schemaName = `reg_question_cache_${randomUUID().replaceAll("-", "")}`;
  const setupAdmin = new Pool({ connectionString: databaseUrl, max: 1 });
  await setupAdmin.query(`create schema ${schemaName}`);
  const setupPool = new Pool({ connectionString: (() => { const u = new URL(databaseUrl); u.searchParams.set("options", `-c search_path=${schemaName}`); return u.toString(); })(), max: 2 });
  const restoreProvider = installProviderStub();
  t.after(async () => {
    restoreProvider();
    await setupPool.end().catch(() => undefined);
    try { await setupAdmin.query(`drop schema if exists ${schemaName} cascade`); } finally { await setupAdmin.end(); }
  });
  await runEventOperationsMigrations(setupPool);
  await runEventExperienceMigrations(createEventOperationsPostgresClient({ connectionString: databaseUrl, pool: setupPool }));

  await t.test("SC-01 repeated reads by two accounts generate once per language", async (st) => {
    resetStub();
    const harness = await openHarness(st, schemaName);
    const eventId = `event:repeat:${randomUUID()}`;
    await insertEvent(harness, eventId);
    const event = eventFixture(eventId);
    const runtime = harness.runtime();
    const alice = handlersFor({ actorId: "actor:alice", event: () => event, runtime });
    const blair = handlersFor({ actorId: "actor:blair", event: () => event, runtime: harness.runtime() });

    const zh = [];
    for (let index = 0; index < 4; index += 1) zh.push(await readQuestions(alice, eventId, "zh"));
    for (let index = 0; index < 3; index += 1) zh.push(await readQuestions(blair, eventId, "zh"));
    assert.equal(stub.calls, 1, "seven zh reads by two accounts must cause exactly one model call");
    assert.match(zh[0]!.questionSetHash ?? "", /^[a-f0-9]{64}$/);
    for (const read of zh) {
      assert.equal(read.questionSetHash, zh[0]!.questionSetHash);
      assert.deepEqual(read.questions, zh[0]!.questions);
      assert.equal(read.provenance.generationMethod, "orbit-agent-model-customized");
    }
    assert.equal(zh[0]!.provenance.aiProviderRequested, true, "the generating read reports the provider call");
    assert.equal(zh[1]!.provenance.aiProviderRequested, false, "cache hits report no provider call");

    const en = [];
    for (let index = 0; index < 3; index += 1) en.push(await readQuestions(index % 2 ? blair : alice, eventId, "en"));
    assert.equal(stub.calls, 2, "a new language generates exactly once more");
    assert.deepEqual(stub.languages, ["zh", "en"]);
    assert.notEqual(en[0]!.questionSetHash, zh[0]!.questionSetHash);
    for (const read of en) assert.deepEqual(read.questions, en[0]!.questions);

    const rows = await cacheRows(harness, eventId);
    assert.deepEqual(rows.map((row) => [row.language, row.state, row.attempt_count]), [["zh", "ready", 1], ["en", "ready", 1]]);

    // Isolation: the same content under another event is generated separately.
    const otherId = `event:repeat-other:${randomUUID()}`;
    await insertEvent(harness, otherId);
    const other = handlersFor({ actorId: "actor:alice", event: () => eventFixture(otherId), runtime });
    const otherRead = await readQuestions(other, otherId, "zh");
    assert.equal(stub.calls, 3);
    assert.notEqual(otherRead.questionSetHash, zh[0]!.questionSetHash);
  });

  await t.test("SC-02 ten concurrent reads across two server instances make one model call", async (st) => {
    resetStub("ok", 400);
    const harness = await openHarness(st, schemaName);
    const eventId = `event:concurrent:${randomUUID()}`;
    await insertEvent(harness, eventId);
    const event = eventFixture(eventId);
    const instances = [harness.runtime(), harness.runtime()];
    const readers = Array.from({ length: 10 }, (_, index) => handlersFor({
      actorId: `actor:reader-${index}`,
      event: () => event,
      runtime: instances[index % 2]!,
    }));
    const results = await Promise.all(readers.map((reader) => readQuestions(reader, eventId, "zh")));
    assert.equal(stub.calls, 1, "concurrent readers must share one generation");
    for (const result of results) {
      assert.match(result.questionSetHash ?? "", /^[a-f0-9]{64}$/);
      assert.equal(result.questionSetHash, results[0]!.questionSetHash);
      assert.deepEqual(result.questions, results[0]!.questions);
    }
    assert.equal(results.filter((result) => result.provenance.aiProviderRequested).length, 1);
    assert.deepEqual((await cacheRows(harness, eventId)).map((row) => [row.state, row.attempt_count]), [["ready", 1]]);
  });

  await t.test("SC-03 content change regenerates, old forms still submit, unknown identities are refused", async (st) => {
    resetStub();
    const harness = await openHarness(st, schemaName);
    const eventId = `event:content:${randomUUID()}`;
    await insertEvent(harness, eventId);
    let event = eventFixture(eventId);
    const registrationService = createEventRegistrationService({ provider: createMemoryEventRegistrationProvider() });
    const runtime = harness.runtime();
    const alice = handlersFor({ actorId: "actor:alice", event: () => event, runtime, registrationService });
    const blair = handlersFor({ actorId: "actor:blair", event: () => event, runtime, registrationService });
    const carol = handlersFor({ actorId: "actor:carol", event: () => event, runtime, registrationService });

    const before = await readQuestions(alice, eventId);
    assert.equal(stub.calls, 1);
    // A field the model never sees does not invalidate the stored questions.
    event = { ...event, recommendedPreparation: "Bring cards." };
    assert.equal((await readQuestions(alice, eventId)).questionSetHash, before.questionSetHash);
    assert.equal(stub.calls, 1);

    event = { ...event, description: "Now a climate founders evening." };
    const after = await readQuestions(blair, eventId);
    assert.equal(stub.calls, 2, "a question-relevant content change generates a new set");
    assert.notEqual(after.questionSetHash, before.questionSetHash);
    assert.equal((await readQuestions(alice, eventId)).questionSetHash, after.questionSetHash);
    assert.equal(stub.calls, 2);
    assert.deepEqual((await cacheRows(harness, eventId)).map((row) => row.state), ["ready", "ready"], "the old generation is retained");

    const oldForm = await submit(alice, eventId, { questionSetHash: before.questionSetHash });
    assert.equal(oldForm.status, 200, JSON.stringify(oldForm.body));
    const currentForm = await submit(blair, eventId, { questionSetHash: after.questionSetHash });
    assert.equal(currentForm.status, 200, JSON.stringify(currentForm.body));
    const forged = await submit(carol, eventId, { questionSetHash: "f".repeat(64) });
    assert.equal(forged.status, 409);
    assert.match(forged.body.error?.message ?? "", /registration questions changed/i);
    assert.equal(await registrationService.get({ eventId, userId: "actor:carol" }), null, "a refused submit writes nothing");
  });

  await t.test("SC-03 publishing a question set replaces generated questions without a model call", async (st) => {
    resetStub();
    const harness = await openHarness(st, schemaName);
    const eventId = `event:publish:${randomUUID()}`;
    await insertEvent(harness, eventId);
    const event = eventFixture(eventId);
    const runtime = harness.runtime();
    const experience = createEventExperienceService({ repository: createPostgresEventExperienceRepository({ runtime }) });
    const registrationService = createEventRegistrationService({ provider: createMemoryEventRegistrationProvider() });
    const alice = handlersFor({ actorId: "actor:alice", event: () => event, runtime, registrationService, publishedFrom: experience });
    const blair = handlersFor({ actorId: "actor:blair", event: () => event, runtime, registrationService, publishedFrom: experience });

    const generated = await readQuestions(alice, eventId);
    assert.equal(stub.calls, 1);
    const draft = await experience.saveDraft({
      actorId: "actor:organizer",
      eventId,
      expectedRevision: null,
      configuration: {
        accentColor: "#111111",
        coverAssetId: null,
        introduction: "Published intro.",
        templateId: "default",
        questionSet: {
          track: "v1",
          questions: [
            { id: "target_attendees", intent: "target_attendees", options: ["Founders", "Operators"], participantProfileField: "targetAttendees", prompt: "Who do you want to meet at Cache Night?", required: true },
            { id: "value_offered", intent: "value_offered", options: ["Intros", "Experience"], participantProfileField: "valueOffered", prompt: "What can you offer at Cache Night?", required: true },
          ],
        },
      },
    });
    await experience.publish({ actorId: "actor:organizer", eventId, expectedRevision: draft.head.revision });

    const published = await readQuestions(blair, eventId);
    assert.equal(stub.calls, 1, "the published set is served without generating");
    assert.equal(published.questionSetVersion, 1);
    assert.notEqual(published.questionSetHash, generated.questionSetHash);
    assert.equal(published.questions[0]!.prompt, "Who do you want to meet at Cache Night?");
    assert.equal((await readQuestions(alice, eventId, "en")).questionSetHash, published.questionSetHash);
    assert.equal(stub.calls, 1, "no language generates while a published set exists");

    const staleGenerated = await submit(alice, eventId, { questionSetHash: generated.questionSetHash });
    assert.equal(staleGenerated.status, 409, "a form built from generated questions is refused once the organizer published");
    const current = await submit(blair, eventId, { questionSetHash: published.questionSetHash, questionSetVersion: published.questionSetVersion });
    assert.equal(current.status, 200, JSON.stringify(current.body));
  });

  await t.test("SC-04 failures are not cached, back off, and show deterministic questions", async (st) => {
    resetStub("fail");
    const harness = await openHarness(st, schemaName);
    const eventId = `event:failure:${randomUUID()}`;
    await insertEvent(harness, eventId);
    const event = eventFixture(eventId);
    const runtime = harness.runtime();
    const alice = handlersFor({ actorId: "actor:alice", event: () => event, runtime });
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => { warnings.push(String(args[0])); };
    st.after(() => { console.warn = originalWarn; });

    const first = await readQuestions(alice, eventId);
    assert.equal(stub.calls, 1);
    assert.equal(first.provenance.generationMethod, "deterministic-fallback");
    assert.equal(first.questionSetHash, undefined, "fallback questions carry no cached identity");
    assert.equal(first.questions.length, 2);
    for (let index = 0; index < 4; index += 1) {
      const again = await readQuestions(alice, eventId);
      assert.equal(again.provenance.generationMethod, "deterministic-fallback");
      assert.deepEqual(again.questions, first.questions);
    }
    assert.equal(stub.calls, 1, "reads inside the backoff window never call the model");
    let [row] = await cacheRows(harness, eventId);
    assert.equal(row!.state, "failed");
    assert.equal(row!.question_set_hash, null, "the failure is not cached as questions");
    assert.equal(row!.last_error_code, "MODEL_REQUEST_FAILED");
    const firstBackoff = row!.retry_after_seconds!;
    assert.ok(firstBackoff >= 30, `backoff ${firstBackoff}s`);
    assert.ok(warnings.some((line) => line.includes("registration_questions_generation_failed")), "the failure is logged");

    // Backoff expires: the next read retries once, fails again, and doubles the wait.
    await harness.admin.query(`update ${schemaName}.event_ops_registration_question_cache set retry_after = now() - interval '1 second' where workspace_id=$1 and event_id=$2`, [harness.workspaceId, eventId]);
    await readQuestions(alice, eventId);
    assert.equal(stub.calls, 2);
    [row] = await cacheRows(harness, eventId);
    assert.equal(row!.attempt_count, 2);
    assert.ok(Math.abs(row!.retry_after_seconds! - firstBackoff * 2) < 2, `second backoff ${row!.retry_after_seconds}s should double ${firstBackoff}s`);

    // A schema-invalid answer is a failure too, not a cached result.
    stub.mode = "invalid";
    await harness.admin.query(`update ${schemaName}.event_ops_registration_question_cache set retry_after = now() - interval '1 second' where workspace_id=$1 and event_id=$2`, [harness.workspaceId, eventId]);
    const invalid = await readQuestions(alice, eventId);
    assert.equal(stub.calls, 3);
    assert.equal(invalid.provenance.fallbackReason, "MODEL_SCHEMA_INVALID");
    [row] = await cacheRows(harness, eventId);
    assert.equal(row!.state, "failed");

    // Recovery: after the backoff the model answers and the result is cached.
    stub.mode = "ok";
    await harness.admin.query(`update ${schemaName}.event_ops_registration_question_cache set retry_after = now() - interval '1 second' where workspace_id=$1 and event_id=$2`, [harness.workspaceId, eventId]);
    const recovered = await readQuestions(alice, eventId);
    assert.equal(recovered.provenance.generationMethod, "orbit-agent-model-customized");
    assert.equal((await readQuestions(alice, eventId)).questionSetHash, recovered.questionSetHash);
    assert.equal(stub.calls, 4);
  });

  await t.test("portrait-proof reads stay deterministic and never touch the cache", async (st) => {
    resetStub();
    const harness = await openHarness(st, schemaName);
    const eventId = `event:portrait:${randomUUID()}`;
    await insertEvent(harness, eventId);
    const previousSecret = process.env.ORBIT_INTERVIEW_SIGNING_SECRET;
    process.env.ORBIT_INTERVIEW_SIGNING_SECRET = previousSecret ?? "portrait-test-secret-portrait-test-secret";
    st.after(() => { if (previousSecret === undefined) delete process.env.ORBIT_INTERVIEW_SIGNING_SECRET; else process.env.ORBIT_INTERVIEW_SIGNING_SECRET = previousSecret; });
    const registrationService = createEventRegistrationService({ provider: createMemoryEventRegistrationProvider() });
    const handlers = createEventRegistrationRouteHandlers({
      getPublishedQuestionSet: async () => null,
      getPortraitProofSource: async () => ({ workspaceId: harness.workspaceId, snapshot: { eventExists: true, access: { owner: false, role: null, state: null }, sourceRegistrationVersion: null, sourceRegistrationFingerprint: "c".repeat(64), eventSourceVersion: "2026-09-17T09:00:00.000Z", questionSetHash: null, questionSetVersion: null } }),
      loadEvent: async (id) => (id === eventId ? eventFixture(eventId) : null),
      questionCacheRuntime: () => harness.runtime(),
      registrationService,
      resolveActor: async () => ({ id: "actor:alice" }),
    });
    const response = await handlers.GET(new Request(`http://orbit.local/api/events/${eventId}/registration?portraitProofs=true`), { params: Promise.resolve({ id: eventId }) });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(stub.calls, 0);
    assert.equal(body.data.questionSet.questionSetHash, undefined);
    assert.equal(body.data.questionSet.provenance.generationMethod, "deterministic-not-requested");
    assert.ok(body.data.questionSet.questions.every((question: { portraitQuestionToken?: string }) => typeof question.portraitQuestionToken === "string"));
    assert.deepEqual(await cacheRows(harness, eventId), []);
  });

  await t.test("a generation abandoned by a crashed instance is reclaimed after its lease", async (st) => {
    resetStub();
    const harness = await openHarness(st, schemaName);
    const eventId = `event:lease:${randomUUID()}`;
    await insertEvent(harness, eventId);
    const event = eventFixture(eventId);
    const alice = handlersFor({ actorId: "actor:alice", event: () => event, runtime: harness.runtime() });
    // Simulate an instance that claimed the key and died before filling it.
    await readQuestions(alice, eventId);
    await harness.admin.query(
      `update ${schemaName}.event_ops_registration_question_cache
          set state='generating', question_set=null, question_set_hash=null, generated_at=null,
              claim_token='dead-instance', claim_expires_at=now() - interval '1 second'
        where workspace_id=$1 and event_id=$2`,
      [harness.workspaceId, eventId],
    );
    const reclaimed = await readQuestions(alice, eventId);
    assert.equal(stub.calls, 2, "an expired claim is taken over by the next reader");
    assert.match(reclaimed.questionSetHash ?? "", /^[a-f0-9]{64}$/);
    assert.deepEqual((await cacheRows(harness, eventId)).map((row) => row.state), ["ready"]);
  });
});

test("without a durable question cache the route never calls the model", async (t) => {
  const restoreProvider = installProviderStub();
  t.after(restoreProvider);
  resetStub();
  const eventId = "event:no-cache";
  const handlers = createEventRegistrationRouteHandlers({
    getPublishedQuestionSet: async () => null,
    loadEvent: async (id) => (id === eventId ? eventFixture(eventId) : null),
    registrationService: createEventRegistrationService({ provider: createMemoryEventRegistrationProvider() }),
    resolveActor: async () => ({ id: "actor:alice" }),
  });
  const read = await readQuestions(handlers as ReturnType<typeof handlersFor>, eventId);
  const again = await readQuestions(handlers as ReturnType<typeof handlersFor>, eventId, "en");
  assert.equal(stub.calls, 0, "no cache means no paid generation");
  assert.equal(read.provenance.fallbackReason, "QUESTION_CACHE_UNAVAILABLE");
  assert.equal(read.questions.length, 2);
  assert.equal(again.questions.length, 2);
  assert.equal(read.questionSetHash, undefined);
});

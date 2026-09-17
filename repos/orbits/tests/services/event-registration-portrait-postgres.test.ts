import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import type { PortraitGeneration } from "../../shared/contract/event-registration-portrait";
import { createTransactionalPortraitRepository } from "../../features/events/registration/portrait/repository";
import { PortraitError, type PortraitSnapshotReader } from "../../features/events/registration/portrait/contract";
import { readPortraitSnapshot } from "../../features/events/registration/portrait/source-reader";
import { portraitFormalSourceVersion } from "../../features/events/registration/portrait/answer-proofs";
import { createEventRegistrationPortraitService } from "../../features/events/registration/portrait/service";
import { mockEventRecords } from "../../features/events/event-crud-and-import/fixtures";
import { createPortraitGetHandler, createPortraitPostHandler } from "../../app/api/events/[id]/registration/portrait/route-handlers";
import { createRegistrationPersonaPostHandler } from "../../app/api/events/[id]/registration/adaptive-handlers";
import { signAdaptiveInterviewQuestion } from "../../features/events/registration/interview-question-token.server";

test("two physical portrait transactions have one CAS winner, replay once, and receipt failure rolls back", async () => {
  const raw = process.env.ORBIT_PORTRAIT_TEST_PG_URL;
  const marker = process.env.ORBIT_PORTRAIT_TEST_DATABASE_MARKER;
  assert.ok(raw && marker, "ROOT-owned portrait test URL and marker are required; this check cannot skip.");
  const url = new URL(raw);
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "35436");
  assert.equal(url.pathname, "/orbit_sprint0066_portrait_test");
  assert.equal(url.username, "orbit_portrait_test");
  assert.equal(url.password, "");
  const admin = new Pool({ connectionString: raw, max: 1 });
  const schema = `s66_portrait_${randomUUID().replaceAll("-", "")}`;
  const pools: Pool[] = [];
  try {
    const identity = await admin.query("select current_database() as db, current_user as actor, host(inet_server_addr()) as host, inet_server_port() as port, marker, schema_version from public.orbit_portrait_test_identity");
    assert.deepEqual(identity.rows, [{ db: "orbit_sprint0066_portrait_test", actor: "orbit_portrait_test", host: "127.0.0.1", port: 35436, marker, schema_version: 1 }]);
    await admin.query(`create schema ${schema}`);
    const setup = new Pool({ connectionString: raw, max: 1, options: `-c search_path=${schema}` });
    pools.push(setup);
    await setup.query(ORBIT_RECORDS_SCHEMA_SQL);
    await setup.query("create table source_facts(actor_id text primary key, version text not null); insert into source_facts values ('self','2026-09-17T09:00:00.000Z')");
    const before = (await setup.query("select row_to_json(s) as facts from source_facts s order by actor_id")).rows;
    await setup.query(`create table event_ops_events(workspace_id text, event_id text, organizer_actor_id text, lifecycle_state_v2 text, updated_at timestamptz,event_version integer);
      insert into event_ops_events values ('test','event','owner','published','2026-09-17T09:00:00.000Z',1);
      create table event_ops_event_role_assignment_heads(workspace_id text,event_id text,subject_actor_id text,revision integer,role text,state text);
      insert into event_ops_event_role_assignment_heads values ('test','event','operations',1,'operations','active'),('test','event','reviewer',1,'reviewer','active'),('test','event','check-in',1,'check_in','active'),('test','event','analyst',1,'read_only_analyst','active');
      create table event_ops_membership_heads(workspace_id text,event_id text,actor_id text,participant_id text,profile_version integer,status text,updated_at timestamptz,membership_version integer);
      insert into event_ops_membership_heads values ('test','event','self','profile:self',1,'rsvped','2026-09-17T09:00:00.000Z',1);
      create table event_ops_profile_versions(workspace_id text,event_id text,participant_id text,profile_version integer,profile_payload jsonb);
      insert into event_ops_profile_versions values ('test','event','profile:self',1,'{"registrationProfile":{"id":"profile:self","eventId":"event","userId":"self","answers":{"targetAttendees":"Builders","valueOffered":"Reviews"},"createdAt":"2026-09-17T09:00:00.000Z","updatedAt":"2026-09-17T09:00:00.000Z"}}');
      create table event_ops_experience_heads(workspace_id text,event_id text,published_version integer);
      create table event_ops_experience_versions(workspace_id text,event_id text,experience_version integer,configuration jsonb);`);
    const canonicalBefore = (await setup.query("select 'membership' as domain,to_jsonb(m) as value from event_ops_membership_heads m union all select 'profile',to_jsonb(p) from event_ops_profile_versions p order by domain")).rows;
    const eventBefore = (await setup.query("select to_jsonb(e) as value from event_ops_events e")).rows;
    const readSnapshot: PortraitSnapshotReader = async (tx, input) => {
      const rows = await tx.query<{ version: string }>("select version from source_facts where actor_id=$1", [input.subjectId]);
      return { eventExists: true, eventVersion: 1, sourceRegistrationFingerprint: "c".repeat(64), access: { owner: input.actorId === "owner", role: null, state: null }, sourceRegistrationVersion: rows.rows[0]?.version ?? null };
    };
    const generation: PortraitGeneration = {
      sourceEventVersion: "event-core-postgres:event:v1", sourceQuestionSetHash: null, sourceQuestionSetVersion: null,
      sourceRegistrationFingerprint: "c".repeat(64), answersVersion: "a".repeat(64), generatedAt: "2026-09-17T10:00:00.000Z", sourceRegistrationVersion: "2026-09-17T09:00:00.000Z",
      persona: { energyStyle: "Listening", industryTags: ["Robotics"], offering: "Reviews", openers: ["What are you building?"], seeking: "Builders", tagline: "Robotics", tags: ["Prototyping"], provenance: { generationMethod: "orbit-agent-model-adaptive", fallbackReason: null, model: "synthetic", provider: "synthetic" } },
      sourceAnswers: ["targetAttendees", "valueOffered"].map((field) => ({ field: field as "targetAttendees" | "valueOffered", responseId: `legacy:${field}`, label: { en: field, zh: field }, answer: field === "targetAttendees" ? "Builders" : "Reviews", question: null, questionSource: "legacy_unknown", generation: null, source: "registration", sourceVersion: "c".repeat(64) })),
    };
    const clients = [0, 1].map(() => {
      const pool = new Pool({ connectionString: raw, max: 1, options: `-c search_path=${schema}` });
      pools.push(pool);
      return createTransactionalPostgresClient({ connectionString: raw, pool });
    });
    const pids = await Promise.all(clients.map((client) => client.query<{ pid: number }>("select pg_backend_pid() as pid")));
    assert.notEqual(pids[0].rows[0].pid, pids[1].rows[0].pid);
    const repos = clients.map((client) => createTransactionalPortraitRepository({ client, workspaceId: "test", readSnapshot }));
    const inputs = [0, 1].map((index) => ({ actorId: "self", eventId: "event", mutation: { mutationId: `save:${index}`, expectedPortraitVersion: null, generationToken: "synthetic-result" }, generation, updatedAt: "2026-09-17T10:00:00.000Z" }));
    const results = await Promise.allSettled(repos.map((repo, index) => repo.save(inputs[index])));
    assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
    const loser = results.find((item) => item.status === "rejected") as PromiseRejectedResult;
    assert.ok(loser.reason instanceof PortraitError && loser.reason.code === "PORTRAIT_VERSION_CONFLICT");
    const winner = results.findIndex((item) => item.status === "fulfilled");
    const first = (results[winner] as PromiseFulfilledResult<Awaited<ReturnType<typeof repos[0]["save"]>>>).value;
    assert.equal(first.portrait.version, 1);
    assert.deepEqual(await repos[winner].save(inputs[winner]), first);
    assert.deepEqual(await repos[0].read({ actorId: "self", eventId: "event" }), first.portrait);
    assert.equal(Number((await setup.query("select count(*) as count from orbit_records where collection_name='event_registration_portrait_mutations'")).rows[0].count), 1);
    await setup.query("alter table orbit_records add constraint reject_receipt_failure check (collection_name <> 'event_registration_portrait_mutations' or payload->'receipt'->>'mutationId' <> 'receipt-fail')");
    await assert.rejects(repos[0].save({ ...inputs[0], mutation: { ...inputs[0].mutation, mutationId: "receipt-fail", expectedPortraitVersion: 1 } }), (error: unknown) => error instanceof PortraitError && error.status === 503);
    assert.deepEqual(await repos[1].read({ actorId: "self", eventId: "event" }), first.portrait);
    assert.equal(Number((await setup.query("select count(*) as count from orbit_records where collection_name='event_registration_portrait_mutations'")).rows[0].count), 1);
    assert.deepEqual((await setup.query("select row_to_json(s) as facts from source_facts s order by actor_id")).rows, before);
    const privateRows = (await setup.query("select user_id, search_text from orbit_records")).rows;
    assert.equal(privateRows.every((row) => row.user_id === "self" && row.search_text === ""), true);
    assert.deepEqual((await setup.query("select 'membership' as domain,to_jsonb(m) as value from event_ops_membership_heads m union all select 'profile',to_jsonb(p) from event_ops_profile_versions p order by domain")).rows, canonicalBefore);
    assert.deepEqual((await setup.query("select to_jsonb(e) as value from event_ops_events e")).rows, eventBefore);
    const canonicalRepo = createTransactionalPortraitRepository({ client: clients[0], workspaceId: "test", readSnapshot: readPortraitSnapshot });
    assert.deepEqual(await canonicalRepo.read({ actorId: "owner", subjectId: "self", eventId: "event" }), first.portrait);
    assert.deepEqual(await canonicalRepo.read({ actorId: "operations", subjectId: "self", eventId: "event" }), first.portrait);
    for (const actorId of ["other", "reviewer", "check-in", "analyst"]) {
      await assert.rejects(canonicalRepo.read({ actorId, subjectId: "self", eventId: "event" }), (error: unknown) => error instanceof PortraitError && error.status === 403);
    }
    await setup.query("update event_ops_event_role_assignment_heads set state='revoked',revision=2 where subject_actor_id='operations'");
    await assert.rejects(canonicalRepo.read({ actorId: "operations", subjectId: "self", eventId: "event" }), (error: unknown) => error instanceof PortraitError && error.status === 403);
    await setup.query("update event_ops_events set organizer_actor_id='new-owner' where event_id='event'");
    await assert.rejects(canonicalRepo.read({ actorId: "owner", subjectId: "self", eventId: "event" }), (error: unknown) => error instanceof PortraitError && error.status === 403);
    assert.deepEqual(await canonicalRepo.read({ actorId: "self", eventId: "event" }), first.portrait);
    const eventBeforePreview = (await setup.query("select to_jsonb(e) as value from event_ops_events e")).rows;
    let modelCalls = 0;
    const service = createEventRegistrationPortraitService({ repository: canonicalRepo, workspaceId: "test", secret: "synthetic-service-secret", now: () => Date.parse("2026-09-17T10:00:00.000Z"), modelRunner: async (request) => {
      modelCalls += 1;
      const transcript = JSON.parse(request.userText).transcript;
      assert.deepEqual(transcript.map((turn: { answer: string }) => turn.answer), ["Builders", "Reviews"]);
      assert.equal(transcript.every((turn: { prompt: string }) => !turn.prompt.includes("Client forged")), true);
      return { success: true, provider: "gemini", source: "provider:gemini-interactions-api", model: "synthetic-model", text: JSON.stringify({ tagline: "Robotics builder", tags: ["Robotics", "Prototyping", "Hardware"], industryTags: ["Robotics"], energyStyle: "Listening first", seeking: "Hardware builders", offering: "Prototype reviews", openers: ["What are you prototyping?", "Which hardware constraints matter?"] }) };
    } });
    const event = { ...mockEventRecords[0], id: "event", sourceMetadata: { ...mockEventRecords[0].sourceMetadata, id: "event-core-postgres:event:v1" } };
    const selfRead = await service.read({ actorId: "self", eventId: "event" });
    const foreignRead = await service.read({ actorId: "new-owner", subjectId: "self", eventId: "event" });
    assert.equal(Object.hasOwn(foreignRead, "registrationSource"), false, "An authorized foreign reader cannot gain self-registration proofs.");
    assert.equal(selfRead.registrationSource?.actorId, "self"); assert.equal(selfRead.registrationSource?.eventId, "event");
    assert.match(selfRead.registrationSource!.sourceVersion, /^[a-f0-9]{64}$/);
    assert.equal(selfRead.registrationSource!.answers.every(answer => answer.question === null && answer.questionSource === "legacy_unknown"), true);
    const responses = ["targetAttendees", "valueOffered"].map((field) => ({ kind: "stored_response" as const, source: "registration" as const, responseId: `legacy:${field}`, sourceVersion: selfRead.registrationSource!.sourceVersion, answer: field === "targetAttendees" ? "Builders" : "Reviews" }));
    await setup.query("update event_ops_events set event_version=2 where event_id='event'");
    await assert.rejects(service.preview({ actorId: "self", event, language: "en", responses }), (error: unknown) => error instanceof PortraitError && error.status === 409);
    assert.equal(modelCalls, 0, "Held V1 context must not be generated against a V2 source snapshot.");
    await setup.query("update event_ops_events set event_version=1 where event_id='event'");
    const preview = await service.preview({ actorId: "self", event, language: "en", responses });
    assert.equal(modelCalls, 1);
    assert.equal((await canonicalRepo.read({ actorId: "self", eventId: "event" }))?.version, 1, "Preview cannot save a portrait.");
    const serviceSave = await service.save({ actorId: "self", eventId: "event", mutation: { mutationId: "service-save", expectedPortraitVersion: 1, generationToken: preview.generationToken } });
    assert.equal(serviceSave.portrait.version, 2);
    assert.equal((await service.read({ actorId: "self", eventId: "event" })).portrait?.answersVersion, serviceSave.receipt.answersVersion);
    assert.equal(modelCalls, 1, "Save and GET cannot call the provider.");
    const adaptiveResponses = await Promise.all((["targetAttendees", "valueOffered"] as const).map(async (field) => {
      const questionToken = signAdaptiveInterviewQuestion({ actorId: "self", eventId: "event", language: "en", question: { acknowledgment: "", field, prompt: "What should people know about you?", options: ["Builders", "Reviews"], provenance: { generationMethod: "orbit-agent-model-adaptive", fallbackReason: null, provider: "synthetic", model: "synthetic" } }, secret: "synthetic-service-secret", now: () => Date.parse("2026-09-17T10:00:00.000Z") });
      return { kind: "signed_question" as const, questionToken, portraitAdaptiveToken: await service.bindAdaptiveQuestion({ actorId: "self", event, questionToken }), answer: field === "targetAttendees" ? "Builders" : "Reviews" };
    }));
    await service.prepareInterview({ actorId: "self", event });
    assert.equal(modelCalls, 1, "Scope preparation and binding cannot generate or renew a question.");
    await setup.query("insert into event_ops_events values ('workspace-B','event','owner-B','published','2026-09-17T09:00:00.000Z',1)");
    const workspaceBRepository = createTransactionalPortraitRepository({ client: clients[1], workspaceId: "workspace-B", readSnapshot: readPortraitSnapshot });
    let workspaceBModelCalls = 0;
    const workspaceBService = createEventRegistrationPortraitService({ repository: workspaceBRepository, workspaceId: "workspace-B", secret: "synthetic-service-secret", now: () => Date.parse("2026-09-17T10:00:00.000Z"), modelRunner: async () => { workspaceBModelCalls += 1; throw new Error("Cross-workspace proof reached the provider."); } });
    assert.equal((await workspaceBRepository.readSources({ actorId: "self", eventId: "event" })).snapshot.eventExists, true);
    const workspaceBPersona = createRegistrationPersonaPostHandler(async () => ({ id: "self" }), async () => event, () => workspaceBService);
    const rejectedScope = await workspaceBPersona(new Request("https://orbit.test/api/events/event/registration/persona", { method: "POST", body: JSON.stringify({ mode: "portrait-preview", language: "en", responses: adaptiveResponses }) }), { params: Promise.resolve({ id: "event" }) });
    assert.equal(rejectedScope.status, 422);
    assert.equal(workspaceBModelCalls, 0);
    assert.equal((await workspaceBService.read({ actorId: "self", eventId: "event" })).portrait, null);
    await setup.query("delete from event_ops_events where workspace_id='workspace-B'");
    assert.deepEqual((await setup.query("select 'membership' as domain,to_jsonb(m) as value from event_ops_membership_heads m union all select 'profile',to_jsonb(p) from event_ops_profile_versions p order by domain")).rows, canonicalBefore);
    assert.deepEqual((await setup.query("select to_jsonb(e) as value from event_ops_events e")).rows, eventBeforePreview);
    const routeContext = { params: Promise.resolve({ id: "event" }) };
    for (const [actorId, status] of [["self", 200], ["new-owner", 200], ["owner", 403], ["operations", 403], ["other", 403]] as const) {
      const response = await createPortraitGetHandler(async () => ({ id: actorId }), () => service)(new Request("https://orbit.test/api/events/event/registration/portrait?actorId=self"), routeContext);
      assert.equal(response.status, status);
      const envelope = await response.json();
      assert.equal(envelope.success, status === 200);
      if (status === 200) assert.deepEqual(envelope.data.portrait, serviceSave.portrait);
      assert.equal(JSON.stringify(envelope).includes(preview.generationToken), false);
    }
    const replayResponse = await createPortraitPostHandler(async () => ({ id: "self" }), () => service)(new Request("https://orbit.test/api/events/event/registration/portrait", { method: "POST", body: JSON.stringify({ mutationId: "service-save", expectedPortraitVersion: 1, generationToken: preview.generationToken }) }), routeContext);
    assert.equal(replayResponse.status, 200);
    assert.deepEqual((await replayResponse.json()).data, serviceSave);
    const renewed = await service.renew({ actorId: "self", eventId: "event", source: "registration", responseId: "legacy:targetAttendees", sourceVersion: selfRead.registrationSource!.sourceVersion });
    assert.equal(renewed.question, null);
    assert.equal(renewed.answer, "Builders");
    assert.equal(renewed.generation, null);
    assert.equal(modelCalls, 1, "Restoring stored question facts cannot call the provider or re-sign a legacy question.");
    await assert.rejects(service.save({ actorId: "other", eventId: "event", mutation: { mutationId: "forged-actor", expectedPortraitVersion: null, generationToken: preview.generationToken } }), (error: unknown) => error instanceof PortraitError && error.status === 422);
    assert.deepEqual(await canonicalRepo.read({ actorId: "new-owner", subjectId: "self", eventId: "event" }), serviceSave.portrait);
    await setup.query("update event_ops_events set event_version=2 where workspace_id='test' and event_id='event'");
    for (const source of ["registration", "signed_question", "portrait"] as const) {
      const staleGeneration: PortraitGeneration = { ...generation, sourceAnswers: generation.sourceAnswers.map((answer) => ({ ...answer, source, sourceVersion: source === "registration" ? generation.sourceRegistrationVersion : source === "portrait" ? "2" : null })) };
      await assert.rejects(canonicalRepo.save({ ...inputs[0], generation: staleGeneration, mutation: { ...inputs[0].mutation, mutationId: `event-stale:${source}`, expectedPortraitVersion: 2 } }), (error: unknown) => error instanceof PortraitError && error.code === "PORTRAIT_SOURCE_CHANGED");
    }
    await setup.query("update event_ops_events set event_version=1 where workspace_id='test' and event_id='event'");
    assert.deepEqual(await canonicalRepo.read({ actorId: "self", eventId: "event" }), serviceSave.portrait);
    await setup.query("insert into event_ops_experience_heads values ('test','event',2); insert into event_ops_experience_versions values ('test','event',2,'{\"questionSet\":{\"track\":\"v1\",\"questions\":[]}}')");
    await assert.rejects(service.save({ actorId: "self", eventId: "event", mutation: { mutationId: "stored-source-config-stale", expectedPortraitVersion: 2, generationToken: preview.generationToken } }), (error: unknown) => error instanceof PortraitError && error.code === "PORTRAIT_SOURCE_CHANGED");
    const snapshot = await clients[0].transaction((tx) => readPortraitSnapshot(tx, { workspaceId: "test", eventId: "event", actorId: "self", subjectId: "self" }));
    assert.equal(snapshot.questionSetVersion, 2);
    assert.match(snapshot.questionSetHash!, /^[a-f0-9]{64}$/);
    assert.equal(snapshot.registrationProfile?.answers.targetAttendees, "Builders");
    assert.equal(snapshot.sourceRegistrationVersion, "2026-09-17T09:00:00.000Z");
    const formalGeneration: PortraitGeneration = { ...generation, sourceRegistrationFingerprint: snapshot.sourceRegistrationFingerprint, sourceQuestionSetHash: snapshot.questionSetHash ?? null, sourceQuestionSetVersion: snapshot.questionSetVersion ?? null, sourceAnswers: generation.sourceAnswers.map((answer) => ({ ...answer, source: "registration_question", sourceVersion: portraitFormalSourceVersion(snapshot) })) };
    await setup.query("insert into event_ops_experience_versions select workspace_id,event_id,3,configuration from event_ops_experience_versions where experience_version=2; update event_ops_experience_heads set published_version=3");
    await assert.rejects(canonicalRepo.save({ ...inputs[0], generation: formalGeneration, mutation: { ...inputs[0].mutation, mutationId: "formal-stale", expectedPortraitVersion: 2 } }), (error: unknown) => error instanceof PortraitError && error.code === "PORTRAIT_SOURCE_CHANGED");
    assert.deepEqual(await canonicalRepo.read({ actorId: "self", eventId: "event" }), serviceSave.portrait);
    const sameTimestampPreview = await service.preview({ actorId: "self", event, language: "en", responses });
    await setup.query("insert into event_ops_profile_versions select workspace_id,event_id,participant_id,2,profile_payload from event_ops_profile_versions where profile_version=1; update event_ops_membership_heads set membership_version=2,profile_version=2 where actor_id='self'");
    const changedCanonicalSource = (await setup.query("select 'membership' as domain,to_jsonb(m) as value from event_ops_membership_heads m union all select 'profile',to_jsonb(p) from event_ops_profile_versions p order by domain")).rows;
    assert.equal((await canonicalRepo.readSources({ actorId: "self", eventId: "event" })).snapshot.sourceRegistrationVersion, "2026-09-17T09:00:00.000Z");
    await assert.rejects(service.save({ actorId: "self", eventId: "event", mutation: { mutationId: "same-time-physical-version-stale", expectedPortraitVersion: 2, generationToken: sameTimestampPreview.generationToken } }), (error: unknown) => error instanceof PortraitError && error.code === "PORTRAIT_SOURCE_CHANGED");
    assert.deepEqual(await canonicalRepo.read({ actorId: "self", eventId: "event" }), serviceSave.portrait);
    assert.equal(Number((await setup.query("select count(*) as count from orbit_records where collection_name='event_registration_portrait_mutations' and payload->'receipt'->>'mutationId'='same-time-physical-version-stale'")).rows[0].count), 0);
    assert.deepEqual((await setup.query("select 'membership' as domain,to_jsonb(m) as value from event_ops_membership_heads m union all select 'profile',to_jsonb(p) from event_ops_profile_versions p order by domain")).rows, changedCanonicalSource);
    const beforeStaleProof = modelCalls;
    await assert.rejects(service.preview({ actorId: "self", event, language: "en", responses }), (error: unknown) => error instanceof PortraitError && error.code === "PORTRAIT_SOURCE_CHANGED");
    assert.equal(modelCalls, beforeStaleProof, "A held registration answer reference must not be rebound to another physical version before generation.");
  } finally {
    await Promise.all(pools.map((pool) => pool.end()));
    await admin.end();
  }
});

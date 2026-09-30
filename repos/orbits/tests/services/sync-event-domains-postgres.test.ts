import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { Pool } from "pg";
import { createSyncDomainHandlers } from "../../app/api/sync/domain-handlers";
import type { EventOperationsAiProvider, EventOperationsPublishedResult, EventOperationsTable } from "../../features/events/event-operations/contract";
import { createEventOperationsEngine } from "../../features/events/event-operations/engine";
import { runEventOperationsMigrations } from "../../features/events/event-operations/storage/migrations";
import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";
import { createPostgresEventOperationsRepository } from "../../features/events/event-operations/storage/postgres-repository";
import { runEventSyncRevisionMigration } from "../../features/events/event-operations/storage/sync-revision";
import { createPostgresEventAdmissionRepository } from "../../features/events/admission/storage/postgres-repository";
import { legacyResponsesFromAnswers } from "../../features/events/registration/interview-response-contract";
import { createDomainReadService } from "../../features/sync/domain-read-service";
import { EVENT_SYNC_DOMAIN_IDS, findSyncDomain, SYNC_DOMAINS } from "../../features/sync/domain-registry";
import { domainManifestSchema, domainPageSchema, offlineReadEnvelopeSchema } from "../../shared/api-schema/universal-read";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { RELATIONSHIP_MESSAGE_SCHEMA_SQL } from "../../features/relationship-communication/message-tables";
import { lockedFixtureQuery, STRICT_SYNC_REVISION_SQL } from "../support/sync-revision-fixture";

// Sprint 0115 (offline 1a): the registered attendee's event day on the device.
// Three device domains read from the dedicated event tables with a derived
// owner (the viewer's own membership / admission rows). The host holds
// attendee A, attendee B and the organizer; every assertion goes through the
// real route handlers and real product writers.
const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const options = { skip: databaseUrl ? false : "Explicit isolated PostgreSQL URL required", timeout: 120_000 };
const W = "workspace:event-domains";
const A = "actor:attendee-a";
const B = "actor:attendee-b";
const C = "actor:attendee-c";
const O = "actor:organizer";
const SECRET = "event-domains-secret-0123456789abcdef0123456789abcdef";
const REGISTRATIONS = "event-registrations";
const EVENTS = "registered-events";
const RESULTS = "event-published-results";

const unusedAi: EventOperationsAiProvider = {
  async generateGroupingFeatures() { throw new Error("no AI in this test"); },
  async generateRecommendations() { throw new Error("no AI in this test"); },
  async generateTableContent() { throw new Error("no AI in this test"); },
};

function at(base: number, minutes: number): string {
  return new Date(base + minutes * 60_000).toISOString();
}

async function host(t: TestContext) {
  assert.ok(databaseUrl);
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname), "local Postgres only");
  const schema = `event_domains_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 6, options: `-c search_path=${schema} -c statement_timeout=15000` });
  const client = createEventOperationsPostgresClient({ connectionString: databaseUrl, pool });
  t.after(async () => { try { await pool.end(); } finally { try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); } } });
  await admin.query(`create schema ${schema}`);
  await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
  // Sprint 0119: the production registry leases the message domains, read from the 0109 tables.
  await pool.query(RELATIONSHIP_MESSAGE_SCHEMA_SQL);
  await pool.query(STRICT_SYNC_REVISION_SQL);
  await runEventOperationsMigrations(client);
  await runEventSyncRevisionMigration(client);
  const repository = createPostgresEventOperationsRepository({ client, workspaceId: W });
  const engine = createEventOperationsEngine({ aiProvider: unusedAi, repository, token: () => "unused" });
  const base = (await pool.query<{ now: Date }>("select statement_timestamp() as now")).rows[0]!.now.getTime();
  const identity = async (actor: string, lifecycle = "active") => {
    for (const [collection, id] of [["auth_users", `auth_user:${actor}`], ["accounts", actor]] as const) {
      await pool.query(
        `insert into orbit_records (workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,lifecycle_state,created_at,updated_at)
         values ($1,$2,$3,$4,'manual','t',$5::jsonb,$6,statement_timestamp(),statement_timestamp())
         on conflict (workspace_id, collection_name, record_id) do update set lifecycle_state = excluded.lifecycle_state, updated_at = excluded.updated_at`,
        [W, collection, id, actor, JSON.stringify({ id: actor }), lifecycle]);
    }
  };
  for (const actor of [A, B, C, O]) await identity(actor);

  /** Registration is open until the cutoff; a generation snapshot needs the cutoff to have passed (closed = true). */
  async function configure(eventId: string, closed: boolean) {
    // Closed: the cutoff is "just now", after every registration made so far (they must be in the snapshot).
    if (closed) await new Promise((resolve) => setTimeout(resolve, 20));
    const cutoff = closed ? new Date().toISOString() : at(base, 20);
    if (closed) await new Promise((resolve) => setTimeout(resolve, 20));
    await repository.saveConfiguration({
      checkInOpensAt: at(base, -5), eventEndsAt: at(base, 180), eventId, eventStartsAt: at(base, 30), maxAttemptsPerTask: 3,
      organizerActorId: O, profileEditDeadlineAt: closed ? cutoff : at(base, 10), recommendationCount: 2, registrationCutoffAt: cutoff,
      resultsAvailableAt: at(base, 25), roundOneStartsAt: at(base, 45), roundTwoStartsAt: at(base, 90), shardSize: 6, tableSize: 6, updatedAt: new Date().toISOString(),
    });
  }
  async function openEvent(eventId: string, title: string) {
    await configure(eventId, false);
    await repository.activateCanonicalRegistrations(eventId, []);
    await lockedFixtureQuery(client, `update event_ops_events set lifecycle_state_v2 = 'published', title = $3, description = $4, venue = $5,
        timezone = 'Asia/Tokyo', starts_at = $6, ends_at = $7, public_code = $8 where workspace_id = $1 and event_id = $2`,
      [W, eventId, title, `${title} — description`, `${title} hall`, at(base, 30), at(base, 180), `code-${eventId}`]);
  }
  async function register(eventId: string, userId: string, valueOffered = "Grid operations") {
    const answers = { industry: "Climate", valueOffered };
    return repository.registerCanonicalParticipant({ answers, displayName: `Name ${userId.slice(-1).toUpperCase()}`, eventId, interviewResponses: [...legacyResponsesFromAnswers(answers, at(base, -1))], userId });
  }
  /** A completed generation of the current registrations, published with the given seats and recommendations. */
  async function publish(eventId: string, build: (ids: Record<string, string>) => { resultsAvailableAt: string; roundOne: EventOperationsTable[]; recommendations: EventOperationsPublishedResult["recommendations"] }) {
    await configure(eventId, true);
    const snapshot = await repository.captureGenerationSnapshot(eventId);
    const generation = await engine.createGeneration({ actorId: O, capturedSnapshot: snapshot, idempotencyKey: `publish:${eventId}:${randomUUID()}` });
    await pool.query("update event_ops_generations set status='completed', completed_at=statement_timestamp() where workspace_id=$1 and generation_id=$2", [W, generation.generationId]);
    await pool.query("update event_ops_tasks set status='completed', attempts=1, completed_at=statement_timestamp() where workspace_id=$1 and generation_id=$2", [W, generation.generationId]);
    await pool.query(
      `insert into event_ops_ai_artifacts (workspace_id,artifact_id,generation_id,task_id,attempt,artifact_kind,provider,model,
         request_hash,response_hash,schema_version,evidence_metadata,validated_payload,created_at)
       select task.workspace_id, 'artifact:' || task.task_id, task.generation_id, task.task_id, 1, 'test','test','test','request','response',1,
         jsonb_build_object('aiRequestFingerprint', generation.ai_request_fingerprint), '{}'::jsonb, statement_timestamp()
       from event_ops_tasks task join event_ops_generations generation
         on generation.workspace_id = task.workspace_id and generation.generation_id = task.generation_id
       where task.workspace_id = $1 and task.generation_id = $2`, [W, generation.generationId]);
    const ids = Object.fromEntries(generation.snapshot.participants.map((participant) => [participant.actorId, participant.participantId]));
    const built = build(ids);
    const value: EventOperationsPublishedResult = {
      directory: generation.snapshot.participants, eventId, generationId: generation.generationId,
      graph: { edges: [], nodes: [] }, grouping: { roundOne: built.roundOne, roundTwo: [] },
      profileEditDeadlineAt: at(base, 10), publishedAt: new Date().toISOString(), recommendations: built.recommendations,
      resultsAvailableAt: built.resultsAvailableAt, snapshotHash: generation.snapshot.hash,
    };
    await repository.publishGenerationAtomically(value, O, { actingActorId: O, capability: "generation.publish", eventId, ownerOrganizerActorId: O });
    await configure(eventId, false);
    return ids;
  }
  const service = createDomainReadService({ client: pool, cursorSecret: SECRET });
  const sql: string[] = [];
  const recording = { query: <T,>(text: string, values?: readonly unknown[]) => { sql.push(text); return pool.query(text, values as unknown[]) as unknown as Promise<{ rows: T[] }>; } };
  const handlersFor = (actor: string) => createSyncDomainHandlers({
    resolveActor: async () => ({ id: actor, userId: actor, workspaceId: W }), createService: () => service, now: () => Date.now(),
    conditionalRead: { client: recording, workspaceId: W, version: "event-domains-test" },
  });
  return { pool, client, repository, openEvent, register, publish, handlersFor, identity, base, sql };
}

type Host = Awaited<ReturnType<typeof host>>;
type Row = Record<string, unknown>;

/** A device's mirror of one domain, following its cursor through the real route handler (resets on 409 like the App). */
function device(h: Host, actor: string, domainId: string) {
  const rows = new Map<string, Row>();
  let cursor: string | undefined;
  let generation: string | undefined;
  const log = { upserts: 0, deletes: 0, resets: 0 };
  return {
    rows, log,
    get generation() { return generation; },
    async pull(): Promise<number> {
      let changes = 0;
      for (let page = 0; page < 30; page += 1) {
        const response = await h.handlersFor(actor).domain(new Request(`https://orbit.local/api/sync/domains/${domainId}?limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`), domainId);
        if (response.status === 409) { rows.clear(); cursor = undefined; log.resets += 1; continue; }
        assert.equal(response.status, 200, `${domainId} page for ${actor}`);
        const data = domainPageSchema.parse(((await response.json()) as { data: unknown }).data);
        generation = data.generation;
        for (const change of data.changes) {
          changes += 1;
          if (change.operation === "delete") { rows.delete(change.id); log.deletes += 1; } else { rows.set(change.id, change.payload!); log.upserts += 1; }
        }
        cursor = data.nextCursor;
        if (!data.hasMore) return changes;
      }
      throw new Error("pagination did not terminate");
    },
  };
}

/** A complete admission profile snapshot (every event profile field answered). */
function applicationProfile() {
  return {
    answers: {
      desiredOutcome: "Meet two storage operators", energyStyle: "Small groups", experienceHighlight: "Ran a grid pilot",
      followUpPreference: "Email within two days", industry: "Climate", positioning: "Grid product lead",
      targetAttendees: "Storage operators", valueOffered: "Grid operations",
    },
    displayName: "Name A",
  };
}

function table(tableNumber: number, members: string[], theme: string): EventOperationsTable {
  return {
    icebreakers: [`${theme} one`, `${theme} two`, `${theme} three`],
    memberPrompts: Object.fromEntries(members.map((id) => [id, [`${theme} prompt a`, `${theme} prompt b`]])) as EventOperationsTable["memberPrompts"],
    memberRationales: Object.fromEntries(members.map((id) => [id, `${theme} because ${id}`])),
    members: members.map((participantId, index) => ({ participantId, seat: `S${index + 1}` })),
    rationale: `${theme} table`, tableNumber, theme,
  };
}

/** e1: A, B, C registered and published (A+B at table 1, C at table 2; A and B recommended to each other). e2: A only, not published. e3: B only. */
async function seed(h: Host, resultsAvailableAt?: string) {
  await h.openEvent("event-1", "Climate night");
  await h.openEvent("event-2", "Grid breakfast");
  await h.openEvent("event-3", "B only salon");
  await h.register("event-1", A); await h.register("event-1", B); await h.register("event-1", C);
  await h.register("event-2", A);
  await h.register("event-3", B);
  const ids = await h.publish("event-1", (p) => ({
    resultsAvailableAt: resultsAvailableAt ?? at(h.base, -1),
    roundOne: [table(1, [p[A]!, p[B]!], "Storage"), table(2, [p[C]!], "Policy-secret-C")],
    recommendations: [
      { noMatchReason: null, sourceParticipantId: p[A]!, recommendations: [{ icebreakers: ["ask A→B", "then storage"], rank: 1, memberHint: "hint for A", reasons: ["reason for A"], score: 91, targetParticipantId: p[B]! }] },
      { noMatchReason: null, sourceParticipantId: p[B]!, recommendations: [{ icebreakers: ["ask B→C", "then policy"], rank: 1, memberHint: "secret hint for B", reasons: ["secret reason for B"], score: 77, targetParticipantId: p[C]! }] },
    ],
  }));
  return ids;
}

test("the three event domains are device domains with a derived owner; the lease grants them", options, async (t) => {
  const h = await host(t);
  for (const domainId of [REGISTRATIONS, EVENTS, RESULTS]) {
    const domain = findSyncDomain(domainId);
    assert.ok(domain, `${domainId} is registered`);
    assert.equal(domain.exposure, "device");
    assert.equal(domain.ownership.rule, "derived");
  }
  assert.deepEqual([...EVENT_SYNC_DOMAIN_IDS].sort(), [EVENTS, RESULTS, REGISTRATIONS].sort());
  const lease = offlineReadEnvelopeSchema.parse(((await (await h.handlersFor(A).lease(new Request("https://orbit.local/api/sync/lease?baseUrl=https%3A%2F%2Fapp.local"))).json()) as { data: unknown }).data);
  assert.deepEqual(lease.grants.map((grant) => grant.domainId).sort(), SYNC_DOMAINS.map((domain) => domain.domainId).sort());
  assert.ok([REGISTRATIONS, EVENTS, RESULTS].every((id) => lease.grants.some((grant) => grant.domainId === id)));
});

test("isolation: A receives only A's registered events and A's own seats and recommendations; never B's, never the organizer's view", options, async (t) => {
  const h = await host(t);
  const p = await seed(h);
  const [reg, events, results] = [device(h, A, REGISTRATIONS), device(h, A, EVENTS), device(h, A, RESULTS)];
  await reg.pull(); await events.pull(); await results.pull();
  assert.deepEqual([...reg.rows.keys()].sort(), ["event-1", "event-2"], "registrations: A's two, not event-3 (B only)");
  assert.deepEqual(reg.rows.get("event-1"), { eventId: "event-1", membershipStatus: "rsvped", admissionStatus: null });
  assert.deepEqual([...events.rows.keys()].sort(), ["event-1", "event-2"]);
  const e1 = events.rows.get("event-1")!;
  assert.deepEqual(Object.keys(e1).sort(), [...findSyncDomain(EVENTS)!.fields].sort(), "only the manual's fields");
  assert.equal(e1.title, "Climate night"); assert.equal(e1.venue, "Climate night hall"); assert.equal(e1.timeZone, "Asia/Tokyo");
  assert.equal(e1.participantId, p[A]);
  assert.equal(e1.checkInOpensAt, at(h.base, -5)); assert.equal(e1.resultsAvailableAt, at(h.base, 25));
  assert.deepEqual([...results.rows.keys()], ["event-1"], "event-2 has no publication");
  const r = results.rows.get("event-1")!;
  assert.deepEqual(Object.keys(r).sort(), [...findSyncDomain(RESULTS)!.fields].sort());
  assert.equal((r.me as Row).participantId, p[A]);
  assert.equal((r.recommendations as Row).sourceParticipantId, p[A], "A's own recommendations");
  assert.equal(((r.recommendations as Row).recommendations as Row[])[0]!.targetParticipantId, p[B]);
  assert.equal((r.roundOneTable as Row).tableNumber, 1, "A's own table");
  assert.equal(r.roundTwoTable, null);
  const text = JSON.stringify([...reg.rows.values(), ...events.rows.values(), ...results.rows.values()]);
  for (const secret of ["secret hint for B", "secret reason for B", "Policy-secret-C", "B only salon", O, "actorId", "organizerActorId", "evidenceIds", "profileAnswers", "checkedIn", "graph", "contactRequests"]) {
    assert.ok(!text.includes(secret), `A's device never receives ${secret}`);
  }
  for (const person of r.directory as Row[]) {
    assert.deepEqual(Object.keys(person).sort(), ["company", "displayName", "experienceHighlight", "industry", "languages", "needs", "offers", "participantId", "role", "topics"], "the attendee-visible public profile only");
  }
  const b = device(h, B, RESULTS);
  await b.pull();
  assert.equal(((b.rows.get("event-1")!.recommendations as Row).recommendations as Row[])[0]!.targetParticipantId, p[C], "B sees B's own recommendation");
  const organizer = [device(h, O, REGISTRATIONS), device(h, O, EVENTS), device(h, O, RESULTS)];
  for (const domain of organizer) assert.equal(await domain.pull(), 0, "the organizer is not a registered attendee: nothing is sent");
});

test("cancellation and rejection: the published seats and recommendations and the event leave the device on the next sync; the status stays", options, async (t) => {
  const h = await host(t);
  await seed(h);
  const [reg, events, results] = [device(h, A, REGISTRATIONS), device(h, A, EVENTS), device(h, A, RESULTS)];
  await reg.pull(); await events.pull(); await results.pull();
  assert.ok(results.rows.has("event-1") && events.rows.has("event-1"));
  await h.repository.cancelCanonicalRegistration({ eventId: "event-1", userId: A });
  assert.equal(await results.pull(), 1); assert.equal(results.rows.has("event-1"), false, "published result removed");
  assert.equal(await events.pull(), 1); assert.equal(events.rows.has("event-1"), false, "event removed");
  assert.equal(await reg.pull(), 1); assert.equal(reg.rows.get("event-1")?.membershipStatus, "cancelled", "status shows cancelled");
  assert.ok(events.rows.has("event-2"), "the other registration is untouched");
  assert.equal(await results.pull(), 0); assert.equal(await events.pull(), 0);
  const fresh = device(h, A, RESULTS);
  assert.equal(await fresh.pull(), 0, "a fresh device gets no tombstones on its first pull");
  await h.register("event-1", A, "Back again");
  await events.pull(); await results.pull();
  assert.equal(await reg.pull(), 1); assert.equal(reg.rows.get("event-1")?.membershipStatus, "rsvped");
  assert.ok(events.rows.has("event-1"), "re-registering brings the event back");
  assert.ok(results.rows.has("event-1"), "and the result published for this participant");

  // Rejection: an approval-required application that is rejected never reaches the device as an event.
  const admission = createPostgresEventAdmissionRepository({ client: h.client, workspaceId: W });
  await h.openEvent("event-4", "Curated dinner");
  await admission.configurePolicy({ updatedByActorId: O, admissionMode: "approval_required", capacity: 10, eventId: "event-4", profileEditDeadlineAt: at(h.base, 10), registrationClosesAt: at(h.base, 20), registrationOpensAt: at(h.base, -60), waitlistEnabled: false });
  const submitted = await admission.submitApplication({ actorId: A, eventId: "event-4", profilePayload: applicationProfile() });
  assert.equal(await reg.pull(), 1); assert.equal(reg.rows.get("event-4")?.admissionStatus, "pending_review");
  await admission.decideApplication({ actorId: A, decision: "reject", decisionActorId: O, eventId: "event-4", expectedApplicationVersion: submitted.applicationVersion });
  assert.equal(await reg.pull(), 1); assert.equal(reg.rows.get("event-4")?.admissionStatus, "rejected", "status shows rejected");
  assert.equal(reg.rows.get("event-4")?.membershipStatus, null);
  await events.pull(); await results.pull();
  assert.equal(events.rows.has("event-4"), false); assert.equal(results.rows.has("event-4"), false);
});

test("incremental: full first pull, one event edit sends one row, then none; a new publication updates the device; B's changes never move A", options, async (t) => {
  const h = await host(t);
  const p = await seed(h);
  const [reg, events, results] = [device(h, A, REGISTRATIONS), device(h, A, EVENTS), device(h, A, RESULTS)];
  assert.equal(await events.pull(), 2); assert.equal(await reg.pull(), 2); assert.equal(await results.pull(), 1);
  await lockedFixtureQuery(h.client, "update event_ops_events set venue = 'Moved hall' where workspace_id = $1 and event_id = 'event-1'", [W]);
  assert.equal(await events.pull(), 1, "one edit, one row"); assert.equal(events.rows.get("event-1")?.venue, "Moved hall");
  assert.equal(await reg.pull(), 0, "the registration did not change"); assert.equal(await results.pull(), 0);
  assert.equal(await events.pull(), 0, "nothing changed, nothing sent");
  await h.register("event-3", C);
  await lockedFixtureQuery(h.client, "update event_ops_events set title = 'B salon renamed' where workspace_id = $1 and event_id = 'event-3'", [W]);
  assert.equal(await events.pull(), 0, "another attendee's event does not move A's bookmark"); assert.equal(await reg.pull(), 0);
  await h.publish("event-1", (ids) => ({
    resultsAvailableAt: at(h.base, -1),
    roundOne: [table(4, [ids[A]!, ids[C]!], "Hydrogen"), table(5, [ids[B]!], "Other")],
    recommendations: [{ noMatchReason: null, sourceParticipantId: ids[A]!, recommendations: [{ icebreakers: ["new", "newer"], rank: 1, memberHint: "new hint", reasons: ["new reason"], score: 88, targetParticipantId: ids[C]! }] }],
  }));
  assert.equal(await results.pull(), 1, "a new publication sends A one row");
  assert.equal((results.rows.get("event-1")!.roundOneTable as Row).tableNumber, 4);
  assert.equal(((results.rows.get("event-1")!.recommendations as Row).recommendations as Row[])[0]!.targetParticipantId, p[C]);
  assert.equal(await results.pull(), 0);
});

test("results stay off the device until resultsAvailableAt; the flip rotates the domain generation and the device rebuilds", options, async (t) => {
  const h = await host(t);
  const now = (await h.pool.query<{ now: Date }>("select statement_timestamp() as now")).rows[0]!.now.getTime();
  await seed(h, new Date(now + 4_000).toISOString());
  const results = device(h, A, RESULTS);
  assert.equal(await results.pull(), 0, "not released yet: nothing is sent");
  const before = results.generation;
  const manifestGeneration = async () => domainManifestSchema.parse(((await (await h.handlersFor(A).manifest(new Request("https://orbit.local/api/sync/manifest"))).json()) as { data: unknown }).data).domains.find((entry) => entry.domainId === RESULTS)!.generation;
  assert.equal(await manifestGeneration(), before);
  await new Promise((resolve) => setTimeout(resolve, 4_500));
  assert.notEqual(await manifestGeneration(), before, "the release moves the generation in the manifest");
  assert.equal(await results.pull(), 1);
  assert.equal(results.log.resets, 1, "the old cursor is refused once and the domain is rebuilt");
  assert.ok(results.rows.has("event-1"));
});

test("lease revocation: an actor whose identity rows are gone gets no grants and cannot read the event domains; the epoch change resets cursors", options, async (t) => {
  const h = await host(t);
  await seed(h);
  const events = device(h, A, EVENTS);
  await events.pull();
  await h.identity(A, "deleted");
  const lease = offlineReadEnvelopeSchema.parse(((await (await h.handlersFor(A).lease(new Request("https://orbit.local/api/sync/lease?baseUrl=https%3A%2F%2Fapp.local"))).json()) as { data: unknown }).data);
  assert.deepEqual(lease.grants, [], "no grant for any domain");
  for (const domainId of [REGISTRATIONS, EVENTS, RESULTS]) {
    const response = await h.handlersFor(A).domain(new Request(`https://orbit.local/api/sync/domains/${domainId}`), domainId);
    assert.equal(response.status, 403, `${domainId} refused after revocation`);
  }
  await h.identity(A, "active");
  let status = 0;
  const response = await h.handlersFor(A).domain(new Request(`https://orbit.local/api/sync/domains/${EVENTS}?cursor=${encodeURIComponent("stale")}`), EVENTS);
  status = response.status;
  assert.equal(status, 409, "a cursor from another epoch is a reset");
});

test("the manifest stays a conditional read: unchanged returns 304; an event edit, a cancellation and a new publication each return 200", options, async (t) => {
  const h = await host(t);
  await seed(h);
  const manifest = async (etag?: string) => h.handlersFor(A).manifest(new Request("https://orbit.local/api/sync/manifest", etag ? { headers: { "If-None-Match": etag } } : {}));
  const first = await manifest();
  assert.equal(first.status, 200);
  const etag = first.headers.get("ETag")!;
  assert.ok(etag, "the manifest carries an ETag");
  h.sql.length = 0;
  assert.equal((await manifest(etag)).status, 304, "nothing changed: 304");
  const business = h.sql.filter((text) => !text.includes("domain:watermark") && !text.includes("sync:event-domains:summary"));
  assert.deepEqual(business, [], "the 304 path reads only the watermark and the event summary");
  await lockedFixtureQuery(h.client, "update event_ops_events set venue = 'Moved' where workspace_id = $1 and event_id = 'event-1'", [W]);
  const edited = await manifest(etag);
  assert.equal(edited.status, 200, "an event edit moves the manifest");
  const etag2 = edited.headers.get("ETag")!;
  assert.equal((await manifest(etag2)).status, 304);
  await h.register("event-3", C);
  assert.equal((await manifest(etag2)).status, 304, "another attendee's registration does not move A's manifest");
  await h.repository.cancelCanonicalRegistration({ eventId: "event-2", userId: A });
  const cancelled = await manifest(etag2);
  assert.equal(cancelled.status, 200, "a cancellation moves the manifest");
  const etag3 = cancelled.headers.get("ETag")!;
  await h.publish("event-1", (ids) => ({ resultsAvailableAt: at(h.base, -1), roundOne: [table(9, [ids[A]!, ids[B]!, ids[C]!], "All")], recommendations: [] }));
  assert.equal((await manifest(etag3)).status, 200, "a new publication moves the manifest");
});

test("the owner guard refuses moving a membership or admission head to another actor, event or workspace; ordinary writes pass", options, async (t) => {
  const h = await host(t);
  await seed(h);
  const refused = /SYNC_OWNER_CHANGE_UNREGISTERED/;
  await assert.rejects(lockedFixtureQuery(h.client, "update event_ops_membership_heads set actor_id = $2 where workspace_id = $1 and actor_id = $3 and event_id = 'event-2'", [W, B, A]), refused);
  await assert.rejects(lockedFixtureQuery(h.client, "update event_ops_membership_heads set workspace_id = 'workspace:other' where workspace_id = $1 and actor_id = $2 and event_id = 'event-2'", [W, A]), refused);
  await h.repository.cancelCanonicalRegistration({ eventId: "event-2", userId: A });
  await h.register("event-2", A, "Edited");
  const status = (await h.pool.query("select status from event_ops_membership_heads where workspace_id = $1 and actor_id = $2 and event_id = 'event-2'", [W, A])).rows[0]?.status;
  assert.equal(status, "rsvped", "product writers (cancel, re-register) are not affected");
  const admission = createPostgresEventAdmissionRepository({ client: h.client, workspaceId: W });
  await h.openEvent("event-5", "Guarded dinner");
  await admission.configurePolicy({ updatedByActorId: O, admissionMode: "approval_required", capacity: 10, eventId: "event-5", profileEditDeadlineAt: at(h.base, 10), registrationClosesAt: at(h.base, 20), registrationOpensAt: at(h.base, -60), waitlistEnabled: false });
  await admission.submitApplication({ actorId: A, eventId: "event-5", profilePayload: applicationProfile() });
  await assert.rejects(lockedFixtureQuery(h.client, "update event_ops_admission_application_heads set actor_id = $2 where workspace_id = $1 and actor_id = $3 and event_id = 'event-5'", [W, B, A]), refused);
});

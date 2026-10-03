import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";

import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";

// Sprint 0140 (SC-0140-04): the approved manual-add design makes only the name
// required. These cases run the real manual-draft and confirm route handlers in
// live mode against a real PostgreSQL schema created for this file and dropped
// afterwards. Only the authenticated actor resolver is injected.
const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const skip = databaseUrl ? false : "ORBIT_LIFECYCLE_TEST_DATABASE_URL is not configured";

const ACTOR = { id: "account:s0140-manual", name: "S0140 tester" };
const ENV_KEYS = [
  "ORBIT_MODULE_MODE", "ORBIT_FEATURE_MODE", "ORBIT_EVENT_DATABASE_URL", "ORBIT_LIVE_DATABASE_URL",
  "ORBIT_DATABASE_URL", "ORBIT_LOCAL_DATABASE_URL", "ORBIT_WORKSPACE_ID",
  "DEEPSEEK_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "OPENAI_API_KEY",
] as const;

interface Harness {
  createDraft(body: Record<string, unknown>): Promise<{ status: number; body: any }>;
  confirm(draftId: string): Promise<{ status: number; body: any }>;
  rows(collection: string): Promise<Array<{ record_id: string; payload: Record<string, any> }>>;
}

async function withLiveSchema(t: { after(fn: () => Promise<void>): void }): Promise<Harness> {
  const schema = `s0140_manual_${randomUUID().replaceAll("-", "")}`;
  const workspaceId = `workspace:${schema}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  await admin.query(`create schema ${schema}`);
  const url = new URL(databaseUrl!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  const pool = new Pool({ connectionString: url.toString(), max: 1 });
  await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
  const previous = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.ORBIT_MODULE_MODE = "live";
  process.env.ORBIT_LIVE_DATABASE_URL = url.toString();
  process.env.ORBIT_WORKSPACE_ID = workspaceId;
  t.after(async () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await pool.end();
    try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); }
  });
  const createRoute = await import("../../app/api/contact-drafts/manual/handler");
  const confirmRoute = await import("../../app/api/contact-drafts/[id]/confirm/handler");
  const create = createRoute.createManualContactDraftPostHandler(async () => ACTOR);
  const confirmDraft = confirmRoute.createConfirmContactDraftHandler(async () => ACTOR);
  return {
    async createDraft(body) {
      const response = await create(new Request("https://orbit.local/api/contact-drafts/manual", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      }));
      return { status: response.status, body: await response.json() };
    },
    async confirm(draftId) {
      const response = await confirmDraft(
        new Request(`https://orbit.local/api/contact-drafts/${encodeURIComponent(draftId)}/confirm`, { method: "POST" }),
        { params: Promise.resolve({ id: draftId }) },
      );
      return { status: response.status, body: await response.json() };
    },
    async rows(collection) {
      const result = await pool.query<{ record_id: string; payload: Record<string, any> }>(
        "select record_id, payload from orbit_records where workspace_id = $1 and collection_name = $2 and deleted_at is null order by record_id",
        [workspaceId, collection],
      );
      return result.rows;
    },
  };
}

test("a name-only manual draft is accepted, stores no relationship note, and one confirm creates exactly one contact", { skip }, async t => {
  const h = await withLiveSchema(t);
  const created = await h.createDraft({ displayName: "S0140 Name Only" });
  assert.equal(created.status, 201, JSON.stringify(created.body.error));
  const draft = created.body.data.draft;
  assert.equal(draft.status, "pending_confirmation");
  assert.equal(draft.displayName, "S0140 Name Only");
  assert.equal(draft.note, "");
  assert.equal(draft.relationshipContext, "");
  assert.equal(draft.followUpHint, "");

  const [stored] = await h.rows("contactDrafts");
  assert.ok(stored, "the draft row is persisted");
  assert.equal("note" in stored.payload, false, "no relationship note is stored");
  assert.equal(stored.payload.relationshipContext, "");
  assert.equal(stored.payload.evidence[0].capturedFields.includes("note"), false);
  assert.doesNotMatch(JSON.stringify(stored.payload), /Manual note:/u);
  assert.equal((await h.rows("contacts")).length, 0, "staging a draft writes no contact");

  const confirmed = await h.confirm(draft.id);
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body.error));
  const contactId = confirmed.body.data.contactCandidate.contactId;
  assert.match(contactId, /^contact:manual:/u);
  const contacts = await h.rows("contacts");
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0]!.payload.id, contactId);
  assert.equal(contacts[0]!.payload.displayName, "S0140 Name Only");
  assert.equal("profileSnippet" in contacts[0]!.payload, false, "no invented relationship text reaches the contact");

  const replay = await h.confirm(draft.id);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.data.contactCandidate.contactId, contactId);
  assert.equal((await h.rows("contacts")).length, 1, "a repeated confirm does not create a second contact");
});

test("name with company and title but no note is accepted and keeps the given fields", { skip }, async t => {
  const h = await withLiveSchema(t);
  const created = await h.createDraft({ displayName: "S0140 Company", organization: "S0140 Co", role: "Lead", note: "   " });
  assert.equal(created.status, 201, JSON.stringify(created.body.error));
  const confirmed = await h.confirm(created.body.data.draft.id);
  assert.equal(confirmed.status, 200);
  const [contact] = await h.rows("contacts");
  assert.equal(contact!.payload.organization, "S0140 Co");
  assert.equal(contact!.payload.role, "Lead");
  assert.equal("profileSnippet" in contact!.payload, false);
});

test("a draft with a note behaves exactly as before", { skip }, async t => {
  const h = await withLiveSchema(t);
  const note = "Met at the S0140 salon; wants retail intros.";
  const created = await h.createDraft({ displayName: "S0140 With Note", organization: "Note Co", role: "Founder", note, followUpHint: "Call next week", tags: ["s0140"] });
  assert.equal(created.status, 201);
  const draft = created.body.data.draft;
  assert.equal(draft.note, note);
  assert.equal(draft.relationshipContext, `Manual note: ${note}`);
  const [stored] = await h.rows("contactDrafts");
  assert.equal(stored!.payload.note, note);
  assert.equal(stored!.payload.evidence[0].excerpt, note);
  assert.deepEqual(stored!.payload.evidence[0].capturedFields, ["displayName", "organization", "role", "note", "tags", "followUpHint"]);
  assert.equal(stored!.payload.suggestedNextAction, "Call next week");
  const confirmed = await h.confirm(draft.id);
  assert.equal(confirmed.status, 200);
  const [contact] = await h.rows("contacts");
  assert.equal(contact!.payload.profileSnippet, `Manual note: ${note} · Call next week · Tags: s0140`);
});

test("without a name or a note the draft is still refused and nothing is written", { skip }, async t => {
  const h = await withLiveSchema(t);
  const created = await h.createDraft({ organization: "Nameless Co" });
  assert.equal(created.status, 400);
  assert.equal(created.body.error.context.manualContactCreationErrorCode, "MANUAL_CONTACT_NOTE_REQUIRED");
  assert.equal((await h.rows("contactDrafts")).length, 0);
});

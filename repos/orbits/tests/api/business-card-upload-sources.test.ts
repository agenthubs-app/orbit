import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createCardUploadHandlers } from "../../app/api/contact-drafts/business-card/uploads/handlers";
import { createCardUploadSourceRepository } from "../../features/acquisition/storage/business-card-upload-sources";
import { runBusinessCardIngestV2Migrations } from "../../features/acquisition/business-card-ingest-v2/migrations";
import type { AuthenticatedApiActor } from "../../app/api/_shared/authenticated-actor";

function request(body: unknown, origin = "https://orbit.test") {
  return new Request("https://orbit.test/api/contact-drafts/business-card/uploads", {
    method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body),
  });
}
const actor = { id: "owner", accountId: "owner", profileId: "profile", userId: "profile", workspaceId: "test" } as AuthenticatedApiActor;

test("upload authorization rejects foreign origins and anonymous sessions before configuration", async () => {
  let sessions = 0;
  const handlers = createCardUploadHandlers({ resolveActor: async () => { sessions++; return null; },
    configured: async () => { assert.fail("must not access database"); },
  });
  for (const handle of [handlers.reserve, handlers.token]) {
    assert.equal((await handle(request({}, "https://foreign.test"))).status, 403);
    assert.equal((await handle(request({}))).status, 401);
  }
  assert.equal(sessions, 2);
});

test("bounded metadata rejects file bytes, spoofed actor fields and unsolicited completion callbacks", async () => {
  const handlers = createCardUploadHandlers({ resolveActor: async () => actor,
    configured: async () => { assert.fail("must not access database"); },
  });
  assert.equal((await handlers.reserve(request({ bytes: "a".repeat(17 * 1024) }))).status, 400);
  assert.equal((await handlers.reserve(request({ actorId: "foreign" }))).status, 400);
  assert.equal((await handlers.token(request({ type: "blob.upload-completed", payload: {} }))).status, 400);
});

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
test("HTTP reservation precedes path-scoped token authorization and storage failures remain private", {
  skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured",
}, async () => {
  const schema = `source_http_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema}` });
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    const client = await pool.connect();
    try { await runBusinessCardIngestV2Migrations(client); } finally { client.release(); }
    let wakeFails = false, issued = 0;
    const repository = createCardUploadSourceRepository({ pool, workspaceId: "test", wake: async () => {
      if (wakeFails) throw new Error("synthetic-private-provider-detail");
    } });
    const runtime = { repository, read: async () => Buffer.alloc(0), reap: async () => ({ deleted: 0, failed: 0 }) };
    let signedIn = actor;
    const handlers = createCardUploadHandlers({ resolveActor: async () => signedIn, configured: async () => runtime,
      issue: async (options) => {
        assert.equal(options.onUploadCompleted, undefined);
        assert.equal((await pool.query("SELECT count(*)::int AS n FROM bc_ingest_raw_uploads")).rows[0].n, 1);
        assert.equal(options.body.type, "blob.generate-client-token");
        if (options.body.type !== "blob.generate-client-token") assert.fail("wrong event");
        const p = options.body.payload;
        const grant = await options.onBeforeGenerateToken(p.pathname, p.clientPayload, p.multipart);
        assert.equal(grant.maximumSizeInBytes, 6 * 1024 * 1024);
        assert.deepEqual(grant.allowedContentTypes, ["image/jpeg"]);
        assert.equal(grant.allowOverwrite, false); assert.equal(grant.addRandomSuffix, false);
        assert.ok(grant.validUntil! > Date.now());
        issued++;
        return { type: "blob.generate-client-token", clientToken: "synthetic-token" };
      },
    });
    const body = { requestKey: randomUUID(), pipeline: "v1", fileName: "card.jpg", mimeType: "image/jpeg",
      byteSize: 6 * 1024 * 1024, digest: `sha256:${"a".repeat(64)}` };
    wakeFails = true;
    const failure = await handlers.reserve(request(body));
    assert.equal(failure.status, 503); assert.doesNotMatch(await failure.text(), /synthetic-private/);
    wakeFails = false;
    const reserved = await handlers.reserve(request(body)); assert.equal(reserved.status, 201);
    const source = (await reserved.json()).data.source;
    assert.equal(source.actorId, "owner");
    const tokenBody = { type: "blob.generate-client-token", payload: { pathname: source.objectKey, clientPayload: source.id, multipart: true } };
    const token = await handlers.token(request(tokenBody)); assert.equal(token.status, 200);
    assert.equal(token.headers.get("cache-control"), "no-store");
    signedIn = { ...actor, id: "foreign" };
    assert.equal((await handlers.token(request(tokenBody))).status, 503);
    signedIn = actor;
    assert.equal((await handlers.token(request({ ...tokenBody, payload: { ...tokenBody.payload, pathname: "https://foreign.test/blob" } }))).status, 503);
    await pool.query("UPDATE bc_ingest_raw_uploads SET upload_expires_at=now()-interval '1 second'");
    assert.equal((await handlers.token(request(tokenBody))).status, 503);
    assert.equal(issued, 1);
  } finally { await pool.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
});

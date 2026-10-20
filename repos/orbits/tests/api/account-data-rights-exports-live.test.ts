import assert from "node:assert/strict";
import test from "node:test";
import type { ContractReply } from "../../features/redesign-contracts/route";

const errorCode = (reply: ContractReply) => "error" in reply ? reply.error.code : null;

test("account rights live registration leaves app version capability independent", async () => {
  const { resolveRedesignContract } = await import("../../features/redesign-contracts/service-factory");
  const rights = resolveRedesignContract("account-lifecycle", "live");
  const version = resolveRedesignContract("app-version", "live");
  assert.equal(rights.success, true);
  assert.equal(version.success, true);
});

test("live export handlers require the same signed-in actor and fresh login; unconfigured service returns 503", async () => {
  const { createAccountExportLiveHandlers } = await import("../../features/account/data-rights/handlers");
  const request = () => new Request("http://localhost:3400/api/account/exports", { method: "POST", body: JSON.stringify({ scope: ["contacts"], idempotencyKey: "test" }) });
  const noActor = createAccountExportLiveHandlers({ resolveActor: async () => null, resolveClaims: async () => null, service: null });
  assert.equal(errorCode(await noActor.create(request())), "UNAUTHORIZED");
  const actor = { id: "account-1", userId: "profile-1", workspaceId: "w" };
  const noService = createAccountExportLiveHandlers({ resolveActor: async () => actor, resolveClaims: async () => ({ userId: "profile-1", authenticatedAt: Date.now() }), service: null });
  assert.equal(errorCode(await noService.list(request())), "SERVICE_UNAVAILABLE");
  let created = 0;
  const record = { id: "export:1", actorId: "account-1", scope: ["contacts"] as ["contacts"], mode: "selected" as const,
    contactsFormat: "csv" as const, status: "queued" as const, requestedAt: new Date().toISOString(), requestedDay: "2026-10-20",
    quotaCharged: true, version: 0, completedItems: 0, totalItems: 1 };
  const service = {
    async create() { created++; return { kind: "accepted" as const, export: record }; },
    async list() { return []; },
    async get() { return { kind: "found" as const, export: record }; },
  };
  const stale = createAccountExportLiveHandlers({ resolveActor: async () => actor, resolveClaims: async () => ({ userId: "profile-1", authenticatedAt: Date.now() - 11 * 60_000 }), service });
  assert.equal(errorCode(await stale.create(request())), "FORBIDDEN");
  const mismatch = createAccountExportLiveHandlers({ resolveActor: async () => actor, resolveClaims: async () => ({ userId: "another", authenticatedAt: Date.now() }), service });
  assert.equal(errorCode(await mismatch.create(request())), "UNAUTHORIZED");
  const live = createAccountExportLiveHandlers({ resolveActor: async () => actor, resolveClaims: async () => ({ userId: "profile-1", authenticatedAt: Date.now() }), service });
  assert.equal((await live.create(request())).status, 202);
  assert.equal(created, 1);
});

test("download route streams a ZIP only after actor and grant checks", async () => {
  const { createAccountExportDownloadHandler } = await import("../../features/account/data-rights/download-handler");
  const request = new Request("https://orbit.example.com/api/account/exports/export%3A1/download?until=123&sig=x");
  const params = { params: Promise.resolve({ id: "export:1" }) };
  const service = { async download() { return { kind: "ok" as const, bytes: Buffer.from("PK archive"), fileName: "orbit-export.zip" }; } };
  const noActor = createAccountExportDownloadHandler({ resolveActor: async () => null, service });
  assert.equal((await noActor(request, params)).status, 401);
  const handler = createAccountExportDownloadHandler({ resolveActor: async () => ({ id: "actor" }), service });
  const response = await handler(request, params);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/zip");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.match(response.headers.get("content-disposition") ?? "", /attachment/);
  assert.equal(Buffer.from(await response.arrayBuffer()).toString(), "PK archive");
});

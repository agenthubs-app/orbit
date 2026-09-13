import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { mobileAuthReturnHref } from "../src/view-models/mobile-route-access";
import { normalizedNext } from "../src/view-models/account-auth";
import { resolveSupportedInitialRouteHref } from "../src/view-models/initial-route";

const moduleUrl = new URL("../src/api/business-card-import.ts", import.meta.url);
let api: Record<string, any> = {};
test.before(async () => { if (existsSync(moduleUrl)) api = await import(moduleUrl.href); });
const id = "12345678-1234-1234-1234-123456789abc";
const otherId = "22345678-1234-1234-1234-123456789abc";
const batchId = "32345678-1234-1234-1234-123456789abc";
const job = {
  id, state: "processing", sourceCount: 2, completedSources: 1, preparedPages: 3,
  currentSourcePage: 1, currentSourcePageCount: 2, errorCode: null, retryAt: null,
  batchId: null, createdAt: "2026-09-12T00:00:00Z", updatedAt: "2026-09-12T00:00:01Z",
  expiresAt: "2026-09-19T00:00:00Z"
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "X-Orbit-Privacy": "private" }
});

test("preparation response projects the real job without private storage fields", () => {
  assert.deepEqual(api.decodeBusinessCardImport?.({ job: { ...job, leaseOwner: "secret", sourceIds: ["secret"] } }, id), job);
});

test("preparation rejects another job, invalid counters, unknown states and malformed metadata", () => {
  assert.equal(typeof api.decodeBusinessCardImport, "function", "job decoder is missing");
  for (const patch of [
    { id: otherId }, { state: "invented" }, { completedSources: 3 }, { sourceCount: 0 },
    { preparedPages: -1 }, { preparedPages: 1.5 }, { currentSourcePage: -1 },
    { currentSourcePageCount: "2" }, { retryAt: "invalid" }, { updatedAt: "invalid" },
    { batchId }, { errorCode: "UNSAFE_PRIVATE_ERROR" }, { state: "completed", batchId: null }
  ]) assert.equal(api.decodeBusinessCardImport({ job: { ...job, ...patch } }, id), null, JSON.stringify(patch));
  for (const payload of [null, [], {}, { job: null }, { job: [] }]) {
    assert.equal(api.decodeBusinessCardImport(payload, id), null);
  }
});

test("completed preparation exposes only its actual batch and nullable page progress", () => {
  const completed = { ...job, state: "completed", completedSources: 2, currentSourcePage: null, currentSourcePageCount: null, batchId };
  assert.deepEqual(api.decodeBusinessCardImport?.({ job: completed }, id), completed);
});

test("impossible preparation page pointers never become trusted job state", () => {
  for (const patch of [
    { currentSourcePage: 0, currentSourcePageCount: 0 },
    { currentSourcePage: 9, currentSourcePageCount: 2 },
    { currentSourcePage: null, currentSourcePageCount: 2 },
    { currentSourcePage: 1, currentSourcePageCount: 501 },
    { currentSourcePage: 2, currentSourcePageCount: null },
    { currentSourcePage: null, currentSourcePageCount: null },
    { completedSources: 2 }, { preparedPages: 501 }
  ]) assert.equal(api.decodeBusinessCardImport({ job: { ...job, ...patch } }, id), null, JSON.stringify(patch));
  assert.deepEqual(api.decodeBusinessCardImport({ job: { ...job, currentSourcePage: 1, currentSourcePageCount: null } }, id),
    { ...job, currentSourcePage: 1, currentSourcePageCount: null });
});

test("failed preparation requires its public failure reason and cannot promise a background retry", () => {
  for (const patch of [
    { state: "failed", errorCode: null },
    { state: "failed", errorCode: "PDF_INVALID", retryAt: "2026-09-12T00:01:00Z" }
  ]) assert.equal(api.decodeBusinessCardImport({ job: { ...job, ...patch } }, id), null);
  const failed = { ...job, state: "failed", errorCode: "PDF_INVALID" };
  assert.deepEqual(api.decodeBusinessCardImport({ job: failed }, id), failed);
});

test("legacy GET uses the authenticated common transport and decodes the existing data envelope", async () => {
  assert.equal(typeof api.createBusinessCardImportClient, "function", "import client is missing");
  const requests: { url: string; init: RequestInit | undefined }[] = [];
  const client = api.createBusinessCardImportClient({
    baseUrl: "https://orbit.example", authCookieHeader: "session=fixture",
    fetchImpl: async (url: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(url), init }); return json({ data: { job } });
    }
  });
  const controller = new AbortController();
  const result = await client.getJob(id, controller.signal);
  assert.equal(result.success, true);
  assert.deepEqual(result.data, job);
  assert.equal(result.meta.privacy, "private");
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url, "https://orbit.example/api/contact-drafts/business-card/imports/" + id);
  assert.equal(requests[0]?.init?.method, "GET");
  // The existing native cookie bridge must suppress the jar when an explicit
  // session is supplied, otherwise same-name tokens can be concatenated.
  assert.equal(requests[0]?.init?.credentials, "omit");
  assert.equal(new Headers(requests[0]?.init?.headers).get("Cookie"), "session=fixture");
  assert.equal(requests[0]?.init?.signal, controller.signal);
});

test("cancel sends only an empty JSON body with the configured origin and returns confirmed state", async () => {
  assert.equal(typeof api.createBusinessCardImportClient, "function");
  const requests: { url: string; init: RequestInit | undefined }[] = [];
  const cancelled = { ...job, state: "cancelled" };
  const client = api.createBusinessCardImportClient({
    baseUrl: "https://orbit.example/",
    fetchImpl: async (url: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(url), init }); return json({ data: { job: cancelled } });
    }
  });
  const result = await client.cancelJob(id, new AbortController().signal);
  assert.equal(result.success, true);
  assert.equal(result.data.state, "cancelled");
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url, "https://orbit.example/api/contact-drafts/business-card/imports/" + id + "/cancel");
  assert.equal(requests[0]?.init?.method, "POST");
  assert.equal(requests[0]?.init?.credentials, "include");
  assert.equal(requests[0]?.init?.body, "{}");
  assert.equal(new Headers(requests[0]?.init?.headers).get("Origin"), "https://orbit.example");
  assert.equal(new Headers(requests[0]?.init?.headers).get("Content-Type"), "application/json");
});

for (const [status, code] of [[401, "UNAUTHORIZED"], [404, "IMPORT_NOT_FOUND"], [409, "IMPORT_CONFLICT"], [503, "IMPORT_UNAVAILABLE"]] as const) {
  test("legacy " + status + " stays a localized failure, not an empty successful job", async () => {
    assert.equal(typeof api.createBusinessCardImportClient, "function");
    const client = api.createBusinessCardImportClient({ fetchImpl: async () => json({ error: { code } }, status) });
    const result = await client.getJob(id, new AbortController().signal);
    assert.equal(result.success, false);
    assert.equal(result.status, status);
    assert.equal(result.error.code, code);
    assert.match(result.error.message, /[\u3400-\u9fff]/u);
  });
}

test("invalid route identifiers never issue HTTP reads or cancellations", async () => {
  assert.equal(typeof api.createBusinessCardImportClient, "function");
  let calls = 0;
  const client = api.createBusinessCardImportClient({ fetchImpl: async () => { calls++; return json({ data: { job } }); } });
  for (const invalid of ["", "../other", id + "?token=x", id.toUpperCase()]) {
    assert.equal((await client.getJob(invalid)).success, false);
    assert.equal((await client.cancelJob(invalid)).success, false);
  }
  assert.equal(calls, 0);
});

test("untrusted response content cannot create mutation or navigation authority", async () => {
  assert.equal(typeof api.createBusinessCardImportClient, "function");
  for (const response of [
    json({ data: { job: { ...job, id: otherId } } }),
    json({ data: { job } }, 503),
    json({ success: true, data: { job } }, 503),
    json({ data: {} }),
    new Response("<html>login</html>", { headers: { "Content-Type": "text/html" } }),
    new Response("{broken", { headers: { "Content-Type": "application/json" } })
  ]) {
    const client = api.createBusinessCardImportClient({ fetchImpl: async () => response });
    assert.equal((await client.getJob(id)).success, false);
  }
});

test("an import deep link retains its path ID through login without adding a duplicate ID query", () => {
  assert.equal(mobileAuthReturnHref("/contacts/new/import/" + id, { id, source: "notification" }),
    "/contacts/new/import/" + id + "?source=notification");
});

test("the actual login normalizer returns to preparation, rejecting non-UUID and extra path segments", () => {
  const href = mobileAuthReturnHref("/contacts/new/import/" + id, { id, source: "notification" });
  assert.equal(normalizedNext(href), "/contacts/new/import/" + id + "?source=notification");
  assert.equal(resolveSupportedInitialRouteHref("/app/contacts/new/import/" + id), "/contacts/new/import/" + id);
  for (const invalid of [id + "/cancel", "%2E%2E", "not-a-job", id.toUpperCase()]) {
    assert.equal(resolveSupportedInitialRouteHref("/contacts/new/import/" + invalid), null);
  }
});

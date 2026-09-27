import assert from "node:assert/strict";
import test from "node:test";

import { createOrbitApiClient } from "../src/api/client";
import {
  generateOnboardingIntro,
  readOnboardingImportSummary,
  readOnboardingProfile,
  saveOnboardingFields,
  scanOwnBusinessCard
} from "../src/api/profile-onboarding";
import { profileDetailSchema } from "../src/api/profile-detail-contract";
import { emptyProfilePayload, profilePayload } from "./helpers/profile-detail-fixtures";

// A small in-memory stand-in for the documented /api/profile HTTP contract: optimistic
// version check (409), mutation receipt, completion policy recomputed on every write.
function profileServer(options: { start?: "empty" | "filled" } = {}) {
  let tick = 0;
  let profile: Record<string, unknown> | null = options.start === "filled" ? { ...profilePayload.profile } : null;
  const requests: { method: string; path: string; body: unknown }[] = [];
  const behaviour = { putStatus: 200 as number, dropReceipt: false, readbackPatch: null as Record<string, unknown> | null, network: false, conflictOnce: false, onPut: null as null | (() => void) };
  function onboarding() {
    const missing = [
      ...(typeof profile?.displayName === "string" && profile.displayName.trim() ? [] : ["displayName"]),
      ...(profile?.primaryIndustryId ? [] : ["primaryIndustryId"]),
      ...(profile?.secondaryIndustryId ? [] : ["secondaryIndustryId"]),
      ...(profile?.birthDate ? [] : ["birthDate"])
    ];
    return { policyVersion: 1, status: missing.length ? "incomplete" : "complete", missingFields: missing };
  }
  function payload(extra: Record<string, unknown> = {}) {
    if (!profile) return { ...emptyProfilePayload, onboarding: onboarding(), ...extra };
    return { ...profilePayload, profile, onboarding: onboarding(), editor: { ...profilePayload.editor, lastSavedAt: profile.updatedAt }, ...extra };
  }
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    const method = init?.method ?? "GET";
    requests.push({ method, path: url.pathname, body });
    if (behaviour.network) throw new TypeError("Network request failed");
    if (url.pathname === "/api/profile" && method === "GET") {
      const data = payload();
      return json(200, { success: true, data: behaviour.readbackPatch && data.profile ? { ...data, profile: { ...data.profile, ...behaviour.readbackPatch } } : data });
    }
    if (url.pathname === "/api/profile" && method === "PUT") {
      behaviour.onPut?.();
      if (behaviour.putStatus !== 200) return json(behaviour.putStatus, { success: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });
      const { expectedUpdatedAt, mutationId, ...fields } = body as Record<string, unknown>;
      const current = (profile?.updatedAt as string | undefined) ?? null;
      if (behaviour.conflictOnce || expectedUpdatedAt !== current) {
        behaviour.conflictOnce = false;
        return json(409, { success: false, error: { code: "PROFILE_VERSION_CONFLICT", message: "stale" } });
      }
      const updatedAt = new Date(Date.parse("2026-09-27T00:00:00Z") + ++tick * 1000).toISOString();
      profile = { ...(profile ?? { ...profilePayload.profile, id: "profile:new", displayName: "", relationshipGoal: "", offering: [], seeking: [], topics: [], bio: "", headline: "", organization: "", role: "" }), ...fields, updatedAt };
      return json(200, { success: true, data: payload(behaviour.dropReceipt ? {} : { mutationId }) });
    }
    return json(404, { success: false, error: { code: "NOT_FOUND", message: "missing" } });
  };
  return { client: createOrbitApiClient({ baseUrl: "https://orbit.test", fetchImpl }), requests, behaviour, bumpVersion() { if (profile) profile = { ...profile, updatedAt: `2026-09-20T0${++tick % 10}:00:00.000Z`, relationshipGoal: "changed elsewhere" }; }, get profile() { return profile; } };
}

let ids = 0;
const mutationId = () => `ios:onboarding:${++ids}`;

async function read(server: ReturnType<typeof profileServer>) {
  const result = await readOnboardingProfile(server.client);
  assert.equal(result.ok, true);
  return (result as { ok: true; detail: ReturnType<typeof profileDetailSchema.parse> }).detail;
}

test("first step saves on an empty profile, verifies the receipt and reads back the completion", async () => {
  const server = profileServer();
  const base = await read(server);
  assert.equal(base.onboarding?.status, "incomplete");
  const result = await saveOnboardingFields(server.client, { displayName: "林晓", primaryIndustryId: "technology_internet", secondaryIndustryId: "technology_internet.ai_data", birthDate: "1990-01-01", organization: "", role: "" }, base, mutationId);
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) return;
  assert.equal(result.detail.onboarding?.status, "complete");
  assert.equal(result.detail.profile?.displayName, "林晓");
  assert.deepEqual(server.requests.map(r => r.method), ["GET", "PUT", "GET"], "PUT then a readback GET");
  const put = server.requests[1]!.body as Record<string, unknown>;
  assert.equal(put.expectedUpdatedAt, null);
  assert.match(String(put.mutationId), /^ios:onboarding:/u);
});

test("a version conflict re-reads the latest version and resends the same fields once", async () => {
  const server = profileServer({ start: "filled" });
  const base = await read(server);
  server.bumpVersion();
  const result = await saveOnboardingFields(server.client, { relationshipGoal: "获取客户（本季度）" }, base, mutationId);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(server.profile?.relationshipGoal, "获取客户（本季度）");
  assert.deepEqual(server.requests.slice(1).map(r => r.method), ["PUT", "GET", "PUT", "GET"]);
});

test("a second conflict is reported as a failure, not retried forever", async () => {
  const server = profileServer({ start: "filled" });
  const base = await read(server);
  server.bumpVersion();
  server.behaviour.onPut = () => { server.bumpVersion(); server.behaviour.conflictOnce = true; };
  const result = await saveOnboardingFields(server.client, { relationshipGoal: "x" }, base, mutationId);
  assert.deepEqual(result, { ok: false, kind: "failed" });
  assert.equal(server.requests.filter(r => r.method === "PUT").length, 2);
});

test("a server error, a missing receipt or a mismatching readback all fail visibly", async () => {
  for (const setup of [
    (s: ReturnType<typeof profileServer>) => { s.behaviour.putStatus = 503; },
    (s: ReturnType<typeof profileServer>) => { s.behaviour.dropReceipt = true; },
    (s: ReturnType<typeof profileServer>) => { s.behaviour.readbackPatch = { offering: ["别人的值"] }; }
  ]) {
    const server = profileServer({ start: "filled" });
    const base = await read(server);
    setup(server);
    const result = await saveOnboardingFields(server.client, { offering: ["客户引荐"], seeking: [], topics: [] }, base, mutationId);
    assert.deepEqual(result, { ok: false, kind: "failed" });
  }
});

test("no network is distinguished from a failed save", async () => {
  const server = profileServer({ start: "filled" });
  const base = await read(server);
  server.behaviour.network = true;
  assert.deepEqual(await saveOnboardingFields(server.client, { bio: "b", headline: "h" }, base, mutationId), { ok: false, kind: "offline" });
  assert.deepEqual(await readOnboardingProfile(server.client), { ok: false, kind: "offline" });
});

function aiServer(reply: () => Response | Promise<Response>) {
  const requests: { path: string; body: unknown }[] = [];
  const client = createOrbitApiClient({ baseUrl: "https://orbit.test", fetchImpl: async (input, init) => {
    requests.push({ path: new URL(String(input)).pathname, body: typeof init?.body === "string" ? JSON.parse(init.body) : null });
    return reply();
  } });
  return { client, requests };
}
const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { headers: { "content-type": "application/json" } });
const fail = (status: number, code: string) => new Response(JSON.stringify({ success: false, error: { code, message: code } }), { status, headers: { "content-type": "application/json" } });

test("intro draft posts the language and accepts only a complete draft", async () => {
  const good = aiServer(() => ok({ bio: "做 AI 会议纪要的产品负责人。", headline: "产品负责人" }));
  assert.deepEqual(await generateOnboardingIntro(good.client, "zh"), { ok: true, bio: "做 AI 会议纪要的产品负责人。", headline: "产品负责人" });
  assert.deepEqual(good.requests, [{ path: "/api/profile/intro-draft", body: { language: "zh" } }]);
  for (const reply of [() => ok({ bio: 3 }), () => fail(422, "MODEL_FAILED"), () => fail(503, "MODEL_API_KEY_MISSING")]) {
    assert.equal((await generateOnboardingIntro(aiServer(reply).client, "en")).ok, false);
  }
  const offline = aiServer(() => { throw new TypeError("offline"); });
  assert.deepEqual(await generateOnboardingIntro(offline.client, "en"), { ok: false, kind: "offline" });
});

test("own business card scan maps the reviewed draft to name, company and title only", async () => {
  const server = aiServer(() => ok({ draft: { displayName: " 林晓 ", organization: "Orbit", role: "产品负责人", email: "x@y.z" } }));
  const result = await scanOwnBusinessCard(server.client, { base64: "AAAA", mimeType: "image/jpeg", fileName: "card.jpg", size: 3 });
  assert.deepEqual(result, { ok: true, name: "林晓", company: "Orbit", title: "产品负责人" });
  assert.deepEqual(server.requests[0], { path: "/api/contact-drafts/business-card/scan", body: { imageBase64: "AAAA", imageName: "card.jpg", imageSizeBytes: 3, mimeType: "image/jpeg" } });
  assert.equal((await scanOwnBusinessCard(aiServer(() => fail(422, "BUSINESS_CARD_OCR_PROVIDER_FAILED")).client, { base64: "A", mimeType: "image/jpeg", fileName: "c.jpg", size: 1 })).ok, false);
  assert.equal((await scanOwnBusinessCard(aiServer(() => ok({ draft: null })).client, { base64: "A", mimeType: "image/jpeg", fileName: "c.jpg", size: 1 })).ok, false);
});

test("import summary reads only v2 batches started since the step opened", async () => {
  const at = (s: string) => `2026-09-27T0${s}:00:00.000Z`;
  const batch = (id: string, createdAt: string) => ({ id, actorId: "actor:1", status: "processing", expectedItems: 1, version: 1, reviewGeneration: 0, idempotencyKey: `k-${id}`, manifestFingerprint: "b".repeat(64), statusReason: null, createdAt, updatedAt: createdAt, finalizedAt: null, expiresAt: "2026-10-27T00:00:00.000Z" });
  const item = (batchId: string, status: string) => ({ id: `${batchId}:i1`, batchId, cardId: "card:1", side: "front", seq: 1, status, version: 1, sourceFileName: "1.jpg", rawSize: 10, rawMimeType: "image/jpeg", clientDigest: "sha256:" + "a".repeat(64), imageDigest: null, derivativeObjectKey: null, derivativeSize: null, extraction: null, extractionSchemaVersion: null, reviewIssues: [], usage: null, confirmedContactId: status === "confirmed" ? "contact:1" : null, attemptCount: 0, nextRetryAt: null, leaseExpiresAt: null, errorStage: null, errorCode: null, createdAt: at("1"), updatedAt: at("1") });
  const paths: string[] = [];
  const client = createOrbitApiClient({ baseUrl: "https://orbit.test", fetchImpl: async input => {
    const path = new URL(String(input)).pathname;
    paths.push(path);
    if (path.endsWith("/v2")) return ok({ batches: [batch("old", at("1")), batch("new", at("3"))] });
    if (path.endsWith("/v2/new")) return ok({ batch: batch("new", at("3")), items: [item("new", "confirmed")] });
    return fail(404, "NOT_FOUND");
  } });
  const summary = await readOnboardingImportSummary(client, Date.parse(at("2")), "actor:1");
  assert.equal(summary.ok, true, JSON.stringify(summary));
  if (summary.ok) assert.deepEqual(summary.summary, { imported: 1, review: 0, recognizing: 0, reviewBatchId: null });
  assert.deepEqual(paths, ["/api/contact-drafts/business-card/batches/v2", "/api/contact-drafts/business-card/batches/v2/new"]);
});

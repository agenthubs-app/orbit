import assert from "node:assert/strict";
import test from "node:test";

import { createOrbitApiClient } from "../src/api/client";
import {
  generateOnboardingIntro,
  inferOnboardingAutofill,
  readOnboardingProfile,
  saveOnboardingFields,
  scanOwnBusinessCard,
  suggestOnboardingSeeking
} from "../src/api/profile-onboarding";
import { profileDetailSchema, profileOnboardingSchema } from "../src/api/profile-detail-contract";
import { emptyProfilePayload, profilePayload } from "./helpers/profile-detail-fixtures";

// A small in-memory stand-in for the documented /api/profile HTTP contract: optimistic
// version check (409), mutation receipt, completion policy recomputed on every write.
function profileServer(options: { start?: "empty" | "filled" } = {}) {
  let tick = 0;
  let profile: Record<string, unknown> | null = options.start === "filled" ? { ...profilePayload.profile } : null;
  const requests: { method: string; path: string; body: unknown }[] = [];
  const behaviour = { putStatus: 200 as number, dropReceipt: false, readbackPatch: null as Record<string, unknown> | null, network: false, conflictOnce: false, onPut: null as null | (() => void), policyVersion: 1 as 1 | 2 };
  function onboarding() {
    const missing = [
      ...(typeof profile?.displayName === "string" && profile.displayName.trim() ? [] : ["displayName"]),
      ...(profile?.primaryIndustryId ? [] : ["primaryIndustryId"]),
      ...(profile?.secondaryIndustryId ? [] : ["secondaryIndustryId"]),
      ...(behaviour.policyVersion === 1 && !profile?.birthDate ? ["birthDate"] : [])
    ];
    return { policyVersion: behaviour.policyVersion, status: missing.length ? "incomplete" : "complete", missingFields: missing };
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

test("v2 profile readback accepts an omitted birthday while an unknown policy cannot certify completion", async () => {
  const server = profileServer();
  server.behaviour.policyVersion = 2;
  const before = await read(server);
  const saved = await saveOnboardingFields(server.client, {
    displayName: "林晓", primaryIndustryId: "technology_internet", secondaryIndustryId: "technology_internet.ai_data", birthDate: null,
  }, before, mutationId);
  assert.equal(saved.ok, true, JSON.stringify(saved));
  if (!saved.ok) return;
  assert.deepEqual(saved.detail.onboarding, { policyVersion: 2, status: "complete", missingFields: [] });
  assert.equal(saved.detail.profile?.birthDate, null);
  assert.equal(profileOnboardingSchema.parse({ policyVersion: 2, status: "incomplete", missingFields: ["birthDate"] }).status, "incomplete",
    "an invalid legacy birthday cannot certify completion under v2");
  const future = profileDetailSchema.parse({ ...profilePayload,
    onboarding: { policyVersion: 99, status: "complete", missingFields: [] } });
  assert.equal(future.onboarding, undefined, "unknown policy must not grant completion or hide the profile");
  assert.ok(future.profile);
});

test("a version conflict leaves the other device's confirmed goal untouched", async () => {
  const server = profileServer({ start: "filled" });
  const base = await read(server);
  server.bumpVersion();
  const result = await saveOnboardingFields(server.client, { relationshipGoal: "获取客户（本季度）" }, base, mutationId);
  assert.deepEqual(result, { ok: false, kind: "conflict" });
  assert.equal(server.profile?.relationshipGoal, "changed elsewhere");
  assert.deepEqual(server.requests.slice(1).map(r => r.method), ["PUT"]);
});

test("a conflict is reported without resending the stale draft", async () => {
  const server = profileServer({ start: "filled" });
  const base = await read(server);
  server.bumpVersion();
  server.behaviour.onPut = () => { server.bumpVersion(); server.behaviour.conflictOnce = true; };
  const result = await saveOnboardingFields(server.client, { relationshipGoal: "x" }, base, mutationId);
  assert.deepEqual(result, { ok: false, kind: "conflict" });
  assert.equal(server.requests.filter(r => r.method === "PUT").length, 1);
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
  assert.deepEqual(await generateOnboardingIntro(good.client, "zh", "intro-1"), { ok: true, bio: "做 AI 会议纪要的产品负责人。", headline: "产品负责人" });
  assert.deepEqual(good.requests, [{ path: "/api/profile/intro-draft", body: { language: "zh", idempotencyKey: "intro-1" } }]);
  for (const reply of [() => ok({ bio: 3 }), () => fail(422, "MODEL_FAILED"), () => fail(503, "MODEL_API_KEY_MISSING")]) {
    assert.equal((await generateOnboardingIntro(aiServer(reply).client, "en", "intro-2")).ok, false);
  }
  const offline = aiServer(() => { throw new TypeError("offline"); });
  assert.deepEqual(await generateOnboardingIntro(offline.client, "en", "intro-3"), { ok: false, kind: "offline" });
});

test("own business card scan keeps what is printed apart from the industry AI judged", async () => {
  const server = aiServer(() => ok({ draft: { displayName: " 林晓 ", organization: "Orbit", role: "产品负责人", email: "x@y.z" }, ocr: { structuredExtraction: { primaryIndustryId: "technology_internet", secondaryIndustryId: "technology_internet.ai_data" } } }));
  const result = await scanOwnBusinessCard(server.client, { base64: "AAAA", mimeType: "image/jpeg", fileName: "card.jpg", size: 3 });
  assert.deepEqual(result, { ok: true, name: "林晓", company: "Orbit", title: "产品负责人", email: "x@y.z", phone: "", industry: { primary: "technology_internet", secondary: "technology_internet.ai_data" } });
  const mismatched = await scanOwnBusinessCard(aiServer(() => ok({ draft: { displayName: "林晓" }, ocr: { structuredExtraction: { primaryIndustryId: "technology_internet", secondaryIndustryId: "food_hospitality.restaurants" } } })).client, { base64: "A", mimeType: "image/jpeg", fileName: "c.jpg", size: 1 });
  assert.equal(mismatched.ok && mismatched.industry, null, "never half an industry");
  assert.deepEqual(server.requests[0], { path: "/api/contact-drafts/business-card/scan", body: { imageBase64: "AAAA", imageName: "card.jpg", imageSizeBytes: 3, mimeType: "image/jpeg" } });
  assert.equal((await scanOwnBusinessCard(aiServer(() => fail(422, "BUSINESS_CARD_OCR_PROVIDER_FAILED")).client, { base64: "A", mimeType: "image/jpeg", fileName: "c.jpg", size: 1 })).ok, false);
  assert.equal((await scanOwnBusinessCard(aiServer(() => ok({ draft: null })).client, { base64: "A", mimeType: "image/jpeg", fileName: "c.jpg", size: 1 })).ok, false);
});

test("autofill inference: only a ready answer counts; everything else leaves the fields to the person", async () => {
  const request = { organization: "Orbit", role: "CEO", language: "ja" as const };
  const ready = aiServer(() => ok({ status: "ready", primaryIndustryId: "technology_internet", secondaryIndustryId: "technology_internet.ai_data", seniorityLevel: "founder", offering: ["顧客紹介", "顧客紹介", " "], topics: ["生成 AI"] }));
  assert.deepEqual(await inferOnboardingAutofill(ready.client, request), { industry: { primary: "technology_internet", secondary: "technology_internet.ai_data" }, offering: ["顧客紹介"], topics: ["生成 AI"] });
  assert.deepEqual(ready.requests, [{ path: "/api/profile/autofill-inference", body: request }]);
  for (const reply of [() => ok({ status: "unavailable", primaryIndustryId: null, secondaryIndustryId: null, seniorityLevel: null, offering: [], topics: [] }), () => fail(400, "VALIDATION_ERROR"), () => fail(503, "DOWN"), () => { throw new TypeError("offline"); }]) {
    assert.equal(await inferOnboardingAutofill(aiServer(reply).client, request), null);
  }
});

test("seek candidates: the unsaved goal goes along and only offered texts come back", async () => {
  const server = aiServer(() => ok({ suggestions: ["投資家", "でたらめ"] }));
  assert.deepEqual(await suggestOnboardingSeeking(server.client, { candidates: ["投資家", "サプライヤー"], goal: "資金調達", language: "ja" }), ["投資家"]);
  assert.deepEqual(server.requests[0]!.body, { candidates: ["投資家", "サプライヤー"], goal: "資金調達", language: "ja" });
  assert.deepEqual(await suggestOnboardingSeeking(aiServer(() => fail(503, "DOWN")).client, { candidates: [], goal: "x", language: "zh" }), []);
});

test("a spent introduction quota is told apart from a failure", async () => {
  assert.deepEqual(await generateOnboardingIntro(aiServer(() => fail(409, "INTRO_LIMIT_REACHED")).client, "zh", "k"), { ok: false, kind: "limit" });
});

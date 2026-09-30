import assert from "node:assert/strict";
import test from "node:test";

import type { ManualProfile, ManualProfileUpdateInput, ProfileResult } from "../../features/profile/contract";
import {
  createProfileIntroDraftService,
  parseProfileIntroDraft,
} from "../../features/profile/intro-draft-service";
import { createLiveProfileService } from "../../features/profile/live-service";
import { profileServiceFactory } from "../../features/profile/service-factory";
import { createStorageProfileProvider } from "../../features/profile/storage/profile-live-record-provider";
import { createProfileRouteHandlers } from "../../app/api/profile/handlers";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import {
  PROFILE_BIO_CJK_LIMIT,
  PROFILE_BIO_NON_CJK_LIMIT,
  profileBioContainsCjk,
  profileBioLimit,
  profileBioWithinLimit,
  profileVisibleLength,
} from "../../shared/api-schema/profile-bio";

// 2026-09-27 决定：含中日韩文字的「关于我」上限 80，其余 200。服务端起草校验、提示词、
// 资料保存和两端计数器共用 shared/api-schema/profile-bio.ts 这一份规则。

const english = (length: number) => "a".repeat(length);
const han = (length: number) => "界".repeat(length);

test("one rule: non-CJK text allows 200 visible characters, CJK text 80, mixed text counts as CJK", () => {
  assert.equal(PROFILE_BIO_NON_CJK_LIMIT, 200);
  assert.equal(PROFILE_BIO_CJK_LIMIT, 80);
  assert.equal(profileBioWithinLimit(english(200)), true);
  assert.equal(profileBioWithinLimit(english(201)), false);
  assert.equal(profileBioWithinLimit(han(80)), true);
  assert.equal(profileBioWithinLimit(han(81)), false);
  // One Han character anywhere switches the whole text to the 80 cap.
  assert.equal(profileBioWithinLimit(`${english(79)}界`), true);
  assert.equal(profileBioWithinLimit(`${english(80)}界`), false);
  assert.equal(profileBioLimit(`I work at 星野 Studio`), 80);
  for (const sample of ["ひらがな", "カタカナ", "ｶﾀｶﾅ", "한국어", "漢字"]) {
    assert.equal(profileBioContainsCjk(sample), true, sample);
  }
  for (const sample of ["Café owner", "Привет", "مرحبا", "👨‍👩‍👧‍👦", "", "Ünïcödé ß"]) {
    assert.equal(profileBioContainsCjk(sample), false, sample);
  }
  // Visible characters are grapheme clusters, not UTF-16 units.
  assert.equal(profileVisibleLength("👨‍👩‍👧‍👦".repeat(3)), 3);
  assert.equal(profileBioWithinLimit("👨‍👩‍👧‍👦".repeat(200)), true);
  assert.equal(profileBioWithinLimit("👨‍👩‍👧‍👦".repeat(201)), false);
});

test("intro-draft parse accepts an English bio up to 200 and still rejects Chinese over 80", () => {
  assert.equal(parseProfileIntroDraft(JSON.stringify({ headline: "Product lead", bio: english(200) }))?.bio.length, 200);
  assert.equal(parseProfileIntroDraft(JSON.stringify({ headline: "Product lead", bio: english(201) })), null);
  assert.equal(parseProfileIntroDraft(JSON.stringify({ headline: "产品负责人", bio: han(80) }))?.bio, han(80));
  assert.equal(parseProfileIntroDraft(JSON.stringify({ headline: "产品负责人", bio: han(81) })), null);
  assert.equal(parseProfileIntroDraft(JSON.stringify({ headline: "Lead", bio: `${english(100)}界` })), null, "mixed text uses the CJK cap");
});

function profile(overrides: Partial<ManualProfile> = {}): ManualProfile {
  return {
    id: "profile:u1",
    displayName: "Alex Morgan",
    headline: "",
    organization: "Orbit",
    role: "Product lead",
    primaryIndustryId: "technology_internet",
    secondaryIndustryId: "technology_internet.ai_data",
    relationshipGoal: "Find partners",
    offering: ["AI product"],
    seeking: ["Investors"],
    topics: [],
    homeMarket: "",
    preferredFollowUpWindow: "",
    preferredLanguage: "en",
    updatedAt: "2026-09-27T00:00:00.000Z",
    ...overrides,
  } as ManualProfile;
}

function model(...texts: string[]) {
  const calls: { systemInstruction: string }[] = [];
  const run = async (input: { systemInstruction: string }) => {
    calls.push(input);
    const text = texts[Math.min(calls.length - 1, texts.length - 1)]!;
    return { success: true as const, model: "fake", provider: "deepseek" as const, source: "env" as never, text };
  };
  return { calls, run: run as never };
}

const readOk = (value: ManualProfile) => async () => ({ success: true, data: { profile: value } }) as unknown as ProfileResult;

test("English drafts target about 160 characters with a hard 200 cap; Chinese keeps 60 of 80", async () => {
  // 0126 measured three English answers of 143, 99 and 84 characters; all must now pass.
  const answer = JSON.stringify({ headline: "AI product lead at Orbit", bio: english(143) });
  const en = model(answer);
  const result = await createProfileIntroDraftService({ readProfile: readOk(profile()), runModel: en.run }).createDraft({ actorId: "u1", language: "en" });
  assert.equal(result.success, true);
  assert.equal(en.calls.length, 1);
  assert.match(en.calls[0]!.systemInstruction, /about 160 characters \(never more than 200\)/);
  assert.match(en.calls[0]!.systemInstruction, /Latin letters/);

  const zh = model(JSON.stringify({ headline: "产品负责人", bio: "我负责 AI 产品。" }));
  await createProfileIntroDraftService({ readProfile: readOk(profile({ displayName: "小雨" })), runModel: zh.run }).createDraft({ actorId: "u1", language: "zh" });
  assert.match(zh.calls[0]!.systemInstruction, /about 60 Chinese characters \(never more than 80\)/);

  const retried = model(JSON.stringify({ headline: "h", bio: english(230) }), answer);
  await createProfileIntroDraftService({ readProfile: readOk(profile()), runModel: retried.run }).createDraft({ actorId: "u1", language: "en" });
  assert.match(retried.calls[1]!.systemInstruction, /bio 230\/200/);
});

function liveService() {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const provider = createStorageProfileProvider({ store, workspaceId: "profile-bio-length-rule" });
  return { service: createLiveProfileService({ provider, now: () => "2026-09-27T06:00:00.000Z" }), store };
}

test("PUT /api/profile applies the same rule and writes nothing when it rejects", async t => {
  const resolution = profileServiceFactory.create("mock");
  let current = liveService();
  t.mock.method(profileServiceFactory, "create", () => ({ ...resolution, service: current.service }));
  const routes = createProfileRouteHandlers({ resolveActor: async () => ({ id: "actor:bio-rule" }) });
  const put = (body: ManualProfileUpdateInput) => routes.PUT(new Request("https://profile.test/api/profile", {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }));

  for (const [bio, status] of [
    [english(200), 200],
    [han(80), 200],
    [english(201), 400],
    [han(81), 400],
    [`${english(80)}界`, 400],
  ] as const) {
    current = liveService();
    const response = await put({ displayName: "Alex Morgan", bio });
    assert.equal(response.status, status, `${profileVisibleLength(bio)} chars, cjk=${profileBioContainsCjk(bio)}`);
    const payload = await response.json();
    if (status === 200) {
      assert.equal(payload.data.profile.bio, bio);
    } else {
      assert.equal(payload.error.code, "VALIDATION_ERROR");
      assert.deepEqual(await current.store.listRecords({ limit: "unbounded", workspaceId: "profile-bio-length-rule", collectionName: "profiles" }), []);
    }
  }
});

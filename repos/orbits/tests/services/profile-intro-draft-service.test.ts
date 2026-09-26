import assert from "node:assert/strict";
import test from "node:test";

import type { ManualProfile, ProfileResult } from "../../features/profile/contract";
import {
  createProfileIntroDraftService,
  parseProfileIntroDraft,
  profileIntroModelInput,
} from "../../features/profile/intro-draft-service";

function profile(overrides: Partial<ManualProfile> = {}): ManualProfile {
  return {
    id: "profile:u1",
    displayName: "小雨",
    headline: "",
    organization: "Orbit",
    role: "产品负责人",
    primaryIndustryId: "technology_internet",
    secondaryIndustryId: "technology_internet.ai_data",
    relationshipGoal: "寻找合作伙伴：把产品推到日本市场（本季度）",
    offering: ["AI 落地经验"],
    seeking: ["投资人"],
    topics: [],
    homeMarket: "",
    preferredFollowUpWindow: "",
    preferredLanguage: "zh",
    updatedAt: "2026-09-26T00:00:00.000Z",
    ...overrides,
  } as ManualProfile;
}

function readOk(value: ManualProfile | null) {
  return async () => ({ success: true, data: { profile: value } }) as unknown as ProfileResult;
}

function model(...texts: string[]) {
  const calls: { systemInstruction: string; userText: string }[] = [];
  const run = async (input: { systemInstruction: string; userText: string }) => {
    calls.push(input);
    const text = texts[Math.min(calls.length - 1, texts.length - 1)]!;
    return { success: true as const, model: "deepseek-v4-flash", provider: "deepseek" as const, source: "env" as never, text };
  };
  return { calls, run: run as never };
}

test("model input only carries the user's own saved fields, with industry labels", () => {
  const input = JSON.parse(profileIntroModelInput(profile(), "zh"));
  assert.equal(input.outputLanguage, "Simplified Chinese");
  assert.equal(input.profile.name, "小雨");
  assert.equal(input.profile.industry, "科技与互联网 / 人工智能与数据");
  assert.deepEqual(input.profile.canOffer, ["AI 落地经验"]);
  assert.equal("topics" in input.profile, false, "empty fields are omitted");
});

test("parse accepts fenced JSON and rejects over-length or empty fields", () => {
  assert.deepEqual(parseProfileIntroDraft('```json\n{"headline":"帮中国品牌落地日本","bio":"我在 Orbit 做产品。"}\n```'), {
    bio: "我在 Orbit 做产品。",
    headline: "帮中国品牌落地日本",
  });
  assert.equal(parseProfileIntroDraft('{"headline":"x","bio":""}'), null);
  assert.equal(parseProfileIntroDraft(`{"headline":"x","bio":"${"长".repeat(81)}"}`), null);
  assert.equal(parseProfileIntroDraft("not json"), null);
});

test("createDraft returns a reviewable draft without writing the profile", async () => {
  const fake = model('{"headline":"Orbit 产品负责人","bio":"我负责 AI 产品，想认识投资人。"}');
  const result = await createProfileIntroDraftService({ readProfile: readOk(profile()), runModel: fake.run }).createDraft({ actorId: "u1", language: "zh" });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.headline, "Orbit 产品负责人");
    assert.equal(result.data.provider, "deepseek");
  }
  assert.equal(fake.calls.length, 1);
  assert.match(fake.calls[0]!.systemInstruction, /Do not invent/);
});

test("createDraft retries over-length answers up to three attempts in total, then fails closed", async () => {
  const tooLong = `{"headline":"h","bio":"${"长".repeat(90)}"}`;
  const recovered = model(tooLong, '{"headline":"h","bio":"短介绍"}');
  const ok = await createProfileIntroDraftService({ readProfile: readOk(profile()), runModel: recovered.run }).createDraft({ actorId: "u1" });
  assert.equal(ok.success, true);
  assert.equal(recovered.calls.length, 2);
  assert.match(recovered.calls[1]!.systemInstruction, /rejected/);

  const third = model(tooLong, tooLong, '{"headline":"h","bio":"短介绍"}');
  const late = await createProfileIntroDraftService({ readProfile: readOk(profile()), runModel: third.run }).createDraft({ actorId: "u1" });
  assert.equal(late.success, true, "a third attempt can still succeed");
  assert.match(third.calls[2]!.systemInstruction, /bio 90\/80/);

  const stuck = model(tooLong);
  const failed = await createProfileIntroDraftService({ readProfile: readOk(profile()), runModel: stuck.run }).createDraft({ actorId: "u1" });
  assert.equal(stuck.calls.length, 3);
  assert.equal(failed.success, false);
  if (!failed.success) assert.equal(failed.error.code, "MODEL_OUTPUT_INVALID");
});

test("createDraft requires a saved profile with a name and never calls the model otherwise", async () => {
  const fake = model("{}");
  const service = createProfileIntroDraftService({ readProfile: readOk(null), runModel: fake.run });
  const result = await service.createDraft({ actorId: "u1" });
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "PROFILE_REQUIRED");
  const anonymous = await service.createDraft({ actorId: "  " });
  assert.equal(anonymous.success, false);
  if (!anonymous.success) assert.equal(anonymous.error.code, "ACTOR_REQUIRED");
  assert.equal(fake.calls.length, 0);
});

test("seek suggestions keep only candidate labels and require a saved goal", async () => {
  const { createSeekSuggestionService, parseSeekSuggestions } = await import("../../features/profile/seek-suggestion-service");
  const candidates = ["投资人", "渠道合作伙伴", "潜在客户"];
  assert.deepEqual(parseSeekSuggestions('{"suggestions":["投资人","编造的人","投资人","潜在客户"]}', candidates), ["投资人", "潜在客户"]);
  assert.equal(parseSeekSuggestions('{"suggestions":["编造的人"]}', candidates), null);

  const fake = model('{"suggestions":["渠道合作伙伴"]}');
  const ok = await createSeekSuggestionService({ readProfile: readOk(profile()), runModel: fake.run }).suggest({ actorId: "u1", candidates });
  assert.deepEqual(ok.success && ok.data.suggestions, ["渠道合作伙伴"]);
  assert.match(fake.calls[0]!.userText, /寻找合作伙伴/);

  const noGoal = await createSeekSuggestionService({ readProfile: readOk(profile({ relationshipGoal: "" })), runModel: fake.run }).suggest({ actorId: "u1", candidates });
  assert.equal(noGoal.success === false && noGoal.error.code, "PROFILE_REQUIRED");
  assert.equal(fake.calls.length, 1);
});

import assert from "node:assert/strict";
import test from "node:test";
import type { ProfileSummary } from "../src/view-models/profile";
import * as profileViewModel from "../src/view-models/profile";

const buildProfileUpdateRequest = (
  profileViewModel as {
    buildProfileUpdateRequest?: (draft: unknown) => unknown;
  }
).buildProfileUpdateRequest;

const profileSummaryToEditDraft = (
  profileViewModel as {
    profileSummaryToEditDraft?: (profile: ProfileSummary) => unknown;
  }
).profileSummaryToEditDraft;

test("profile manual edit request trims public profile fields for the web API", () => {
  assert.equal(typeof buildProfileUpdateRequest, "function");

  assert.deepEqual(
    buildProfileUpdateRequest?.({
      bio: "  我帮企业把 AI 接到销售、客服和内部知识库。  ",
      displayName: " 小雨 ",
      headline: " Orbit 创始人 ",
      industry: " AI 企业应用 ",
      offeringText: "企业 AI 试点\n\n知识库和内部检索\n销售流程自动化",
      organization: " Orbit ",
      relationshipGoal: "  找到能互相帮忙的企业、服务商和创业者。 ",
      role: " 创始人 ",
      seekingText: "准备导入 AI 的企业\n日本市场合作方",
      timezone: " Tokyo ",
      topicsText: "企业 AI 导入\nAgent 工作流"
    }),
    {
      bio: "我帮企业把 AI 接到销售、客服和内部知识库。",
      displayName: "小雨",
      headline: "Orbit 创始人",
      homeMarket: "Tokyo",
      industry: "AI 企业应用",
      offering: ["企业 AI 试点", "知识库和内部检索", "销售流程自动化"],
      organization: "Orbit",
      relationshipGoal: "找到能互相帮忙的企业、服务商和创业者。",
      role: "创始人",
      seeking: ["准备导入 AI 的企业", "日本市场合作方"],
      topics: ["企业 AI 导入", "Agent 工作流"]
    }
  );
});

test("profile manual edit request requires a display name before saving", () => {
  assert.equal(typeof buildProfileUpdateRequest, "function");

  assert.equal(
    buildProfileUpdateRequest?.({
      bio: "有介绍",
      displayName: "   ",
      headline: "Orbit 创始人"
    }),
    null
  );
});

test("profile summary can seed the manual edit draft without losing tag groups", () => {
  assert.equal(typeof profileSummaryToEditDraft, "function");

  assert.deepEqual(
    profileSummaryToEditDraft?.({
      bio: "简介",
      displayName: "小雨",
      headline: "Orbit 创始人",
      industry: "AI 企业应用",
      offering: ["企业 AI 试点", "知识库"],
      organization: "Orbit",
      relationshipGoal: "找长期合作",
      role: "创始人",
      seeking: ["企业客户"],
      timezone: "Tokyo",
      topics: ["Agent", "销售自动化"]
    }),
    {
      bio: "简介",
      displayName: "小雨",
      headline: "Orbit 创始人",
      industry: "AI 企业应用",
      offeringText: "企业 AI 试点\n知识库",
      organization: "Orbit",
      relationshipGoal: "找长期合作",
      role: "创始人",
      seekingText: "企业客户",
      timezone: "Tokyo",
      topicsText: "Agent\n销售自动化"
    }
  );
});

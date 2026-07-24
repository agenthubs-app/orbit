import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  profileBusinessCard,
  type ProfileSummary
} from "../src/view-models/profile";

const profile: ProfileSummary = {
  bio: "帮企业把 AI 接进真实业务。",
  displayName: "小雨",
  headline: "Orbit 创始人",
  industry: "AI 企业应用",
  offering: ["AI 落地", "日本资源"],
  organization: "Orbit",
  relationshipGoal: "找到能互相帮忙的人。",
  role: "创始人",
  seeking: ["企业客户"],
  timezone: "Tokyo",
  topics: ["Agent 工作流"]
};

test("profileBusinessCard limits visible tags and reports overflow", () => {
  const card = profileBusinessCard({
    ...profile,
    offering: ["AI 落地", "日本资源", "产品选型", "服务商引荐"],
    seeking: ["企业客户", "合作伙伴", "投资人"]
  });

  assert.deepEqual(card.offering.values, ["AI 落地", "日本资源"]);
  assert.equal(card.offering.overflow, 2);
  assert.deepEqual(card.seeking.values, ["企业客户", "合作伙伴"]);
  assert.equal(card.seeking.overflow, 1);
  assert.equal(card.initial, "小");
  assert.equal(card.metaLine, "Orbit · 创始人 · AI 企业应用");
});

test("profileBusinessCard omits empty metadata and tag groups", () => {
  const card = profileBusinessCard({
    ...profile,
    industry: "",
    offering: [],
    organization: "",
    role: "",
    seeking: []
  });

  assert.equal(card.metaLine, "");
  assert.deepEqual(card.offering, { overflow: 0, values: [] });
  assert.deepEqual(card.seeking, { overflow: 0, values: [] });
});

test("profileBusinessCard has a safe initial for an empty name", () => {
  const card = profileBusinessCard({
    ...profile,
    displayName: " "
  });

  assert.equal(card.initial, "O");
});

test("profile screen uses the restrained dark Orbit card", () => {
  const source = readFileSync(
    new URL("../src/screens/profile/ProfileScreen.tsx", import.meta.url),
    "utf8"
  );

  assert.match(source, /function OrbitBusinessCard/u);
  assert.match(source, /backgroundColor:\s*"#17211F"/u);
  assert.doesNotMatch(source, /LinearGradient|completionMeter|Animated/u);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  localizeHomeHeadline,
  localizeHomeList,
  localizeHomeValue,
} from "../../app/(app)/app/home/home-demo-localization";

test("home headline localizes the generated English suffix to Chinese", () => {
  const headline =
    "Relationship Operations Lead managing source-backed relationship follow-up";
  const zh = localizeHomeHeadline(headline, "Relationship Operations Lead", "zh");

  assert.match(zh, /关系运营负责人/);
  assert.doesNotMatch(zh, /managing source-backed relationship follow-up/);

  // 英文页面保留原文。
  const en = localizeHomeHeadline(headline, "Relationship Operations Lead", "en");
  assert.equal(en, headline);
});

test("home value localization maps known vocabulary and picks the Chinese bilingual segment", () => {
  assert.equal(localizeHomeValue("Tokyo", "zh"), "东京");
  assert.equal(localizeHomeValue("Relationship Operations Lead", "zh"), "关系运营负责人");
  // 双语 "中文 / English" 取中文段。
  assert.equal(localizeHomeValue("暖介绍 / warm intro", "zh"), "暖介绍");
  // 未知内容原样返回。
  assert.equal(localizeHomeValue("Acme Robotics", "zh"), "Acme Robotics");
  // 英文页面保留原文。
  assert.equal(localizeHomeValue("Tokyo", "en"), "Tokyo");
});

test("home list localization maps each item and defaults to Chinese", () => {
  const zh = localizeHomeList(["founders", "operators", "community leads"], "zh");
  assert.deepEqual(zh, ["创始人", "运营者", "社群负责人"]);

  const en = localizeHomeList(["founders", "operators"], "en");
  assert.deepEqual(en, ["founders", "operators"]);

  assert.deepEqual(localizeHomeList(undefined, "zh"), []);
});

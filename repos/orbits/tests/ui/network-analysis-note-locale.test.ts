import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { localizeNextActionText } from "../../app/(app)/app/orbit-contacts-presentation";

test("the reader's English placeholder next action shows in the page language", () => {
  const raw = "Review 富沢 弘治 with source evidence before agent use.";
  assert.equal(localizeNextActionText(raw, "zh"), "先核对来源证据，再跟进 富沢 弘治。");
  assert.match(localizeNextActionText(raw, "ja"), /富沢 弘治 に対応する/);
  assert.equal(localizeNextActionText(raw, "en"), raw);
  assert.equal(localizeNextActionText("つながったお礼と、来週のお茶のお誘い", "zh"), "つながったお礼と、来週のお茶のお誘い");
});

test("the 人脉分析 person card localizes its note", () => {
  const source = readFileSync("app/(app)/app/orbit-2026/network-analysis/DrillList.tsx", "utf8");
  assert.match(source, /localizeNextActionText\(person\.nextActionPreview, language\)/);
  assert.doesNotMatch(source, /\{person\.nextActionPreview\}/);
});

/**
 * W0060 纯函数（SC-W0060-02／03）：唯一下一步、「为什么现在」、三栏只显示真实值与推测标记。W0061 复用。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { contactNextStep, contactWhyNow, profileColumn } from "../../app/(app)/app/contacts/network-0918/contact-value";

const zh = (copy: { zh: string; en: string }) => copy.zh;
const en = (copy: { zh: string; en: string }) => copy.en;
const ready = { nextStep: { en: "Book the demo.", zh: "约产品演示。" }, state: "ready" };

test("next step: a ready insight first (per language), else contact.nextAction, else nothing", () => {
  assert.equal(contactNextStep({ insight: ready, language: "zh", nextAction: { text: "下周约" } }), "约产品演示。");
  assert.equal(contactNextStep({ insight: ready, language: "en", nextAction: null }), "Book the demo.");
  assert.equal(contactNextStep({ insight: { ...ready, state: "pending" }, language: "zh", nextAction: { text: " 下周约 " } }), "下周约");
  assert.equal(contactNextStep({ insight: { nextStep: null, state: "ready" }, language: "zh", nextAction: { text: "下周约" } }), "下周约");
  assert.equal(contactNextStep({ insight: null, language: "zh", nextAction: { text: "  " } }), null);
  assert.equal(contactNextStep({ insight: undefined, language: "zh", nextAction: null }), null);
});

test("why now: the week action's own detail, prefixed by its phase; nothing without an action or a detail", () => {
  assert.equal(contactWhyNow({ detail: "你已经认识 TA", phaseNo: 1, phaseTitle: "盘点已有人脉" }, zh), "阶段 1 · 盘点已有人脉：你已经认识 TA");
  assert.equal(contactWhyNow({ detail: "You already know them", phaseNo: 2, phaseTitle: "Expand" }, en), "Phase 2 · Expand: You already know them");
  assert.equal(contactWhyNow({ detail: "只有理由", phaseNo: null, phaseTitle: null }, zh), "只有理由");
  assert.equal(contactWhyNow({ detail: null, phaseNo: 1, phaseTitle: "x" }, zh), null);
  assert.equal(contactWhyNow(null, zh), null);
});

test("profile columns show only real values; fallbacks are empty; card_inference is marked inferred", () => {
  const profile = {
    bio: "", conversationPrompts: [], industry: "", intro: "",
    offering: ["被投公司资源"], seeking: ["回退来的建议动作"], topics: ["制造业数字化", " "],
    fieldSources: { offering: "card_inference", topics: "memo_extraction" },
    fallbackFields: ["seeking"] as const,
  };
  assert.deepEqual(profileColumn(profile, "offering"), { inferred: true, items: ["被投公司资源"] });
  assert.deepEqual(profileColumn(profile, "seeking"), { inferred: false, items: [] });
  assert.deepEqual(profileColumn(profile, "topics"), { inferred: false, items: ["制造业数字化"] });
  assert.deepEqual(profileColumn(undefined, "topics"), { inferred: false, items: [] });
});

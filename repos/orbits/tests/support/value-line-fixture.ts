/**
 * W0061 SC-01：「TA 能帮你」一句话三处（首页今日要事、候选卡、详情首行）共用的夹具。
 *
 * 同一位 ready 洞察联系人：依据 = 名片扫描建立（capture）+ 一条 memo（东京 9/28）+ 一条计划需求；
 * 另有一条见面记录（encounter）不在三种可解析来源里，必须被丢弃。
 * 首页与候选卡的服务端数据由 `insightEvidenceLabels` 从这里的事实算出；详情由时间线换算成同一份事实。
 * 三处页面测试都断言渲染文本等于 `VALUE_LINE_EXPECTED`。
 */
import { insightEvidenceLabels, type InsightEvidenceFacts } from "../../features/contacts/insights/evidence-labels";
import type { ContactValueInsight, ContactValueLineData } from "../../features/contacts/insights/value-lines";
import type { ContactInsightEvidence } from "../../shared/contract/contact-insight";

export const VALUE_CONTACT_ID = "c-keiko";
export const VALUE_NEED_ID = "need-intro";
export const VALUE_NEED_TITLE = "能引荐被投公司的投资人";
export const VALUE_MEMO_EVIDENCE_ID = "memo:note:live-contact-detail-update:m1";

export const VALUE_EVIDENCE: ContactInsightEvidence[] = [
  { id: `capture:${VALUE_CONTACT_ID}`, source: "capture" },
  { id: VALUE_MEMO_EVIDENCE_ID, source: "memo" },
  { id: "encounter:e1", source: "encounter" },
  { id: VALUE_NEED_ID, source: "plan_need" },
];

export const VALUE_TEXT = {
  en: { nextStep: "Ask her for one portfolio intro.", relation: "Keiko invests in B2B SaaS and can introduce portfolio founders." },
  zh: { nextStep: "请她引荐一家被投公司。", relation: "惠子投 B2B SaaS，能引荐被投公司的创始人。" },
} as const;

export const VALUE_FACTS: InsightEvidenceFacts = {
  captureIsCard: new Map([[VALUE_CONTACT_ID, true]]),
  memoDays: new Map([[VALUE_MEMO_EVIDENCE_ID, "2026-09-28"]]),
  needTitles: new Map([[VALUE_NEED_ID, VALUE_NEED_TITLE]]),
};

/** 详情：同一份事实来自已读到的时间线（memo 选的东京日期 9/28 = UTC 9/27 15:00）与计划关联。 */
export const VALUE_TIMELINE = {
  items: [
    {
      contactId: VALUE_CONTACT_ID,
      id: VALUE_MEMO_EVIDENCE_ID,
      occurredAt: "2026-09-27T15:00:00.000Z",
      occurredAtPrecision: "day",
      ref: { recordId: `contact-detail:u:${VALUE_CONTACT_ID}`, store: "contact_detail_states", subId: "note:live-contact-detail-update:m1" },
      source: "memo",
      title: { en: "Wrote a memo", zh: "写了 memo" },
    },
    {
      contactId: VALUE_CONTACT_ID,
      detail: { captureMethod: "business_card" },
      id: `capture:${VALUE_CONTACT_ID}`,
      occurredAt: "2026-09-01T00:00:00.000Z",
      occurredAtPrecision: "instant",
      ref: { recordId: VALUE_CONTACT_ID, store: "contacts" },
      source: "capture",
      title: { en: "Added from a business card", zh: "扫描名片，建立联系" },
    },
  ],
  unavailableSources: [],
};
export const VALUE_LINKED_NEEDS = [{ needId: VALUE_NEED_ID, phaseNo: 1, phaseTitle: "盘点", title: VALUE_NEED_TITLE }];

/** 服务端（首页 value-lines、候选接口）会给出的洞察部分。 */
export function valueInsight(lang: "zh" | "en"): ContactValueInsight {
  return {
    evidence: insightEvidenceLabels(VALUE_CONTACT_ID, VALUE_EVIDENCE, VALUE_FACTS).map((entry) => entry.label),
    nextStep: VALUE_TEXT[lang].nextStep,
    relation: VALUE_TEXT[lang].relation,
    state: "ready",
  };
}

export function valueLineItem(lang: "zh" | "en"): ContactValueLineData {
  return { ...valueInsight(lang), contactId: VALUE_CONTACT_ID, name: "田中惠子", subtitle: "Nexa Capital · 合伙人" };
}

/** 三处都必须渲染出的文字（`data-value-line-relation` 与 `data-value-line-evidence` 的文本）。 */
export const VALUE_LINE_EXPECTED = {
  en: { evidence: `Based onBusiness cardmemo 9/28Plan need “${VALUE_NEED_TITLE}”`, relation: VALUE_TEXT.en.relation },
  zh: { evidence: `依据名片memo 9/28计划需求『${VALUE_NEED_TITLE}』`, relation: VALUE_TEXT.zh.relation },
} as const;

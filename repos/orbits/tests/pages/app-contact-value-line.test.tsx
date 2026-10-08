/**
 * W0061：「TA 能帮你」一句话（D61）。
 *   SC-01 三处同一句：纯函数 + 候选卡 + 详情首行用共享夹具断言同一文本（首页在 app-agent-iorbit-home.test.tsx）；
 *         依据解析：名片扫描「名片」、手工录入「录入」、memo 东京日期、计划需求标题，其余来源丢弃。
 *   SC-02 退化不空白：none／pending／failed／no_goal 与公司职位皆空；候选卡 pending 每 10 秒重取、最多 3 次，ready 后替换。
 *   SC-03 为什么现在：计划条目理由 → ready 洞察下一步 → 不显示。
 */
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { insightEvidenceLabels, tokyoDayOf } from "../../features/contacts/insights/evidence-labels";
import { contactInsightView } from "../../features/contacts/insights/view";
import { contactInsightGoalHash, type ContactInsightRow } from "../../features/contacts/insights/repository";
import type { PlanMatchCandidate } from "../../app/(app)/app/agent/iorbit-0918/plan-match-client";
import { PLAN_MATCH_VALUE_POLL_MAX, PLAN_MATCH_VALUE_POLL_MS, PlanMatchSheet } from "../../app/(app)/app/agent/iorbit-0918/plan-match-sheet";
import {
  contactValueLine,
  contactValueWhyNow,
  evidenceFactsFromDetail,
  type ContactValueInsight,
} from "../../app/(app)/app/contacts/network-0918/contact-value";
import { NetworkInsightPanel } from "../../app/(app)/app/contacts/network-0918/network-insight-panel";
import { OrbitLanguageProvider } from "../../app/(app)/app/orbit-language-context";
import {
  VALUE_CONTACT_ID,
  VALUE_EVIDENCE,
  VALUE_FACTS,
  VALUE_LINE_EXPECTED,
  VALUE_LINKED_NEEDS,
  VALUE_NEED_ID,
  VALUE_NEED_TITLE,
  VALUE_TEXT,
  VALUE_TIMELINE,
  valueInsight,
} from "../support/value-line-fixture";

const zh = (copy: { en: string; zh: string }) => copy.zh;
const en = (copy: { en: string; zh: string }) => copy.en;

/** 取带某个 data 属性的元素的纯文本（静态标记）。 */
function attrText(html: string, attr: string): string | null {
  const match = new RegExp(`<(\\w+)[^>]*\\b${attr}="[^"]*"[^>]*>([\\s\\S]*?)</\\1>`).exec(html);
  return match ? match[2]!.replace(/<[^>]+>/g, "") : null;
}

/* ── 依据解析（rev 2 G-5） ───────────────────────────────────────────── */

test("SC-W0061-01: evidence resolves to 名片／memo date／plan need; unknown sources and unresolvable ids are dropped", () => {
  const labels = insightEvidenceLabels(VALUE_CONTACT_ID, VALUE_EVIDENCE, VALUE_FACTS).map((entry) => entry.label);
  assert.deepEqual(labels, ["card", "memo:2026-09-28", `need:${VALUE_NEED_TITLE}`]);
  // 手工录入的联系人叫「录入」，不是「名片」。
  const manual = insightEvidenceLabels(VALUE_CONTACT_ID, VALUE_EVIDENCE, { ...VALUE_FACTS, captureIsCard: new Map([[VALUE_CONTACT_ID, false]]) });
  assert.equal(manual[0]!.label, "entry");
  // 别人的 capture id、读不到的 memo 与需求一律丢弃；全部丢弃 → 空（不显示「依据」）。
  const none = insightEvidenceLabels(VALUE_CONTACT_ID, [{ id: "capture:someone-else", source: "capture" }, { id: "memo:x", source: "memo" }, { id: "need-x", source: "plan_need" }], VALUE_FACTS);
  assert.deepEqual(none, []);
  const model = contactValueLine({ insight: { evidence: [], nextStep: null, relation: "R", state: "ready" }, name: "N", subtitle: null }, zh);
  assert.equal(model.kind === "ready" && model.evidence.length, 0);
});

test("SC-W0061-01: memo days are Tokyo dates (day picks and instants)", () => {
  assert.equal(tokyoDayOf("2026-09-28"), "2026-09-28");
  assert.equal(tokyoDayOf("2026-09-27T15:00:00.000Z"), "2026-09-28");
  assert.equal(tokyoDayOf("2026-09-27T14:59:00.000Z"), "2026-09-27");
  assert.equal(tokyoDayOf("nope"), null);
});

test("SC-W0061-01: the detail's timeline + plan links give the same labels as the server facts", () => {
  const facts = evidenceFactsFromDetail(VALUE_CONTACT_ID, VALUE_TIMELINE.items as never, VALUE_LINKED_NEEDS);
  assert.deepEqual(insightEvidenceLabels(VALUE_CONTACT_ID, VALUE_EVIDENCE, facts), insightEvidenceLabels(VALUE_CONTACT_ID, VALUE_EVIDENCE, VALUE_FACTS));
});

/* ── 三处同一句（候选卡、详情；首页见 home 测试） ──────────────────────── */

const CANDIDATE = (value?: ContactValueInsight): PlanMatchCandidate => ({
  aiReason: "做被投公司投后服务",
  contactId: VALUE_CONTACT_ID,
  contactName: "田中惠子",
  contactSubtitle: "Nexa Capital · 合伙人",
  id: "cand-keiko",
  industry: null,
  needId: VALUE_NEED_ID,
  needTitle: VALUE_NEED_TITLE,
  strength: "candidate",
  tier: "ai",
  ...(value ? { value } : {}),
});

const NOW = new Date("2026-10-03T03:00:00.000Z");
const GOAL = "认识能引荐被投公司的投资人";
const READY_ROW: ContactInsightRow = {
  aiState: "done", attempts: 1, contactId: VALUE_CONTACT_ID, deferredUntil: null, dirtyAt: null, dirtyReasons: [], evidence: VALUE_EVIDENCE,
  generatedAt: "2026-10-02T00:00:00.000Z", goalHash: contactInsightGoalHash(GOAL),
  goalRelation: { en: VALUE_TEXT.en.relation, zh: VALUE_TEXT.zh.relation }, lastErrorCode: null, leaseExpiresAt: null, model: "m",
  nextStep: { en: VALUE_TEXT.en.nextStep, zh: VALUE_TEXT.zh.nextStep }, relevance: 70, retryCount: 0, sourceDataVersion: "v", status: "ready",
};

for (const lang of ["zh", "en"] as const) {
  test(`SC-W0061-01 (${lang}): the candidate card and the detail first line render the same sentence and evidence`, () => {
    const card = renderToStaticMarkup(
      <OrbitLanguageProvider initialLanguage={lang}>
        <PlanMatchSheet candidates={[CANDIDATE(valueInsight(lang))]} />
      </OrbitLanguageProvider>,
    );
    const detail = renderToStaticMarkup(
      <OrbitLanguageProvider initialLanguage={lang}>
        <NetworkInsightPanel
          contactHref={`/app/contacts/${VALUE_CONTACT_ID}`}
          evidenceFacts={evidenceFactsFromDetail(VALUE_CONTACT_ID, VALUE_TIMELINE.items as never, VALUE_LINKED_NEEDS)}
          goal={GOAL}
          view={contactInsightView(READY_ROW, { contactId: VALUE_CONTACT_ID, goal: GOAL, now: NOW })}
        />
      </OrbitLanguageProvider>,
    );
    for (const [where, html] of [["candidate", card], ["detail", detail]] as const) {
      assert.equal(attrText(html, "data-value-line-relation"), VALUE_LINE_EXPECTED[lang].relation, `${where} relation`);
      assert.equal(attrText(html, "data-value-line-evidence"), VALUE_LINE_EXPECTED[lang].evidence, `${where} evidence`);
    }
    // 候选卡原理由变为依据签：AI 层「名片职位」（模型原文放在提示里），「对应 {需求}」。
    assert.match(card, lang === "zh" ? /data-plan-match-evidence="ai" title="做被投公司投后服务">依据 · 名片职位</ : /data-plan-match-evidence="ai" title="做被投公司投后服务">Based on · Card title</);
    assert.match(card, new RegExp(`data-plan-match-need="true">${VALUE_NEED_TITLE}<`));
    assert.doesNotMatch(card, /按公司与职位/);
    // 详情依据仍然可点：memo 去时间线那条，计划需求去计划页。
    assert.match(detail, /href="\/app\/contacts\/c-keiko#tl-memo_note_live-contact-detail-update_m1"[^>]*>memo 9\/28</);
  });
}

/* ── SC-02：退化不空白 ─────────────────────────────────────────────── */

test("SC-W0061-02: none／pending／failed／no_goal fall back to company · title + matched need + industry + a state tail; never an empty line", () => {
  const base = { industry: "金融与投资", name: "田中惠子", needTitle: VALUE_NEED_TITLE, subtitle: "Nexa Capital · 合伙人" };
  const cases: Array<[ContactValueInsight | null, string, string, string | null]> = [
    [null, "pending", "「TA 能帮你」生成中，通常 1 分钟内出现", null],
    [{ evidence: [], nextStep: null, relation: null, state: "none" }, "none", "「TA 能帮你」生成中，通常 1 分钟内出现", null],
    [{ evidence: [], nextStep: null, relation: null, state: "pending" }, "pending", "「TA 能帮你」生成中，通常 1 分钟内出现", null],
    [{ evidence: [], nextStep: null, relation: null, state: "failed" }, "failed", "「TA 能帮你」暂时没生成出来", null],
    [{ evidence: [], nextStep: null, relation: null, state: "no_goal" }, "no_goal", "设置关系目标后生成「TA 能帮你」", "/app/contacts/dashboard?tab=insight"],
    // ready 但没有文字：按生成中退化，不渲染空的「TA 能帮你：」。
    [{ evidence: [], nextStep: null, relation: "  ", state: "ready" }, "pending", "「TA 能帮你」生成中，通常 1 分钟内出现", null],
  ];
  for (const [insight, state, tail, href] of cases) {
    const model = contactValueLine({ ...base, insight }, zh);
    assert.equal(model.kind, "fallback");
    if (model.kind !== "fallback") continue;
    assert.equal(model.state, state);
    assert.equal(model.who, "Nexa Capital · 合伙人");
    assert.equal(model.context, `可能对应：计划需求『${VALUE_NEED_TITLE}』 · 同属 金融与投资`);
    assert.equal(model.tail, tail);
    assert.equal(model.tailHref, href);
  }
  // 公司职位都空 → 姓名占位；姓名也空 → 「—」；没有需求与行业 → 没有 context 行。
  const bare = contactValueLine({ insight: null, name: "田中惠子", subtitle: "  " }, zh);
  assert.ok(bare.kind === "fallback" && bare.who === "田中惠子" && bare.context === null);
  const nameless = contactValueLine({ insight: null, name: "", subtitle: null }, zh);
  assert.ok(nameless.kind === "fallback" && nameless.who === "—");
  // 渲染：每一行都有文字，没有空元素。
  const html = renderToStaticMarkup(<PlanMatchSheet candidates={[{ ...CANDIDATE({ evidence: [], nextStep: null, relation: null, state: "pending" }), industry: { en: "Finance", zh: "金融与投资" }, tier: "rule" }]} />);
  assert.match(html, /data-contact-value-line="pending"/);
  assert.match(html, /data-value-line-context="true">同属 金融与投资</);
  assert.match(html, /data-value-line-tail="true">「TA 能帮你」生成中，通常 1 分钟内出现</);
  assert.doesNotMatch(html, /<(p|span)[^>]*data-value-line[^>]*><\/\1>/);
  const enModel = contactValueLine({ insight: { evidence: [], nextStep: null, relation: null, state: "failed" }, name: "Keiko", subtitle: null }, en);
  assert.ok(enModel.kind === "fallback" && enModel.tail === "“How they can help” couldn't be generated for now");
});

async function mountSheet(t: TestContext, candidates: PlanMatchCandidate[], respond: (url: string, count: number) => Response) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener: () => undefined,
      clearTimeout: (id: unknown) => clearTimeout(id as never),
      removeEventListener: () => undefined,
      setTimeout: (handler: () => void, ms?: number) => setTimeout(handler, ms),
    },
  });
  const urls: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: unknown) => {
    urls.push(String(input));
    return respond(String(input), urls.length);
  });
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(<PlanMatchSheet candidates={candidates} />);
  });
  const tick = async () => {
    await act(async () => {
      t.mock.timers.tick(PLAN_MATCH_VALUE_POLL_MS);
    });
    for (let index = 0; index < 4; index += 1) await act(async () => { await Promise.resolve(); });
  };
  t.after(() => {
    act(() => root.unmount());
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  });
  return { root: () => root, tick, urls };
}

const PENDING: ContactValueInsight = { evidence: [], nextStep: null, relation: null, state: "pending" };
const linesResponse = (lines: unknown[]) => Response.json({ data: { lines }, success: true });

test("SC-W0061-02: a pending candidate re-reads value-lines every 10 s and swaps in the ready sentence", async (t) => {
  const sheet = await mountSheet(t, [CANDIDATE(PENDING)], (_url, count) =>
    linesResponse([count < 2 ? { ...PENDING, contactId: VALUE_CONTACT_ID, name: "田中惠子", subtitle: null } : { ...valueInsight("zh"), contactId: VALUE_CONTACT_ID, name: "田中惠子", subtitle: null }]),
  );
  assert.equal(sheet.urls.length, 0, "nothing before the first 10 s");
  assert.equal(sheet.root().root.findAll((node) => node.props?.["data-contact-value-line"] === "pending").length, 1);
  await sheet.tick();
  assert.deepEqual(sheet.urls, [`/api/contacts/value-lines?ids=${VALUE_CONTACT_ID}&lang=zh&fields=insight`]);
  await sheet.tick();
  assert.equal(sheet.urls.length, 2);
  const relation = sheet.root().root.find((node) => node.props?.["data-value-line-relation"] !== undefined);
  assert.equal(relation.children.join(""), VALUE_TEXT.zh.relation);
  await sheet.tick();
  assert.equal(sheet.urls.length, 2, "no more reads once ready");
});

test("SC-W0061-02: a candidate that stays pending is re-read at most 3 times", async (t) => {
  const sheet = await mountSheet(t, [CANDIDATE(PENDING)], () => linesResponse([{ ...PENDING, contactId: VALUE_CONTACT_ID, name: "田中惠子", subtitle: null }]));
  for (let index = 0; index < PLAN_MATCH_VALUE_POLL_MAX + 3; index += 1) await sheet.tick();
  assert.equal(sheet.urls.length, PLAN_MATCH_VALUE_POLL_MAX);
  assert.equal(PLAN_MATCH_VALUE_POLL_MAX, 3);
  assert.equal(PLAN_MATCH_VALUE_POLL_MS, 10_000);
});

test("SC-W0061-02: ready candidates are never re-read; a candidate whose value is missing (read failed) is re-read like a pending one", async (t) => {
  const settled = await mountSheet(t, [CANDIDATE(valueInsight("zh")), { ...CANDIDATE(), contactId: "c-other", id: "cand-2" }], () => linesResponse([]));
  for (let index = 0; index < 5; index += 1) await settled.tick();
  assert.equal(settled.urls.length, PLAN_MATCH_VALUE_POLL_MAX);
  assert.ok(settled.urls.every((url) => url === "/api/contacts/value-lines?ids=c-other&lang=zh&fields=insight"));
});

test("SC-W0061-02: the detail panel falls back to company · title + linked need while the insight is not ready (status line stays the tail)", () => {
  const html = renderToStaticMarkup(
    <NetworkInsightPanel
      goal={GOAL}
      valueFallback={{ name: "田中惠子", needTitle: VALUE_NEED_TITLE, subtitle: "Nexa Capital · 合伙人" }}
      view={contactInsightView(null, { contactId: VALUE_CONTACT_ID, goal: GOAL, now: NOW })}
    />,
  );
  assert.match(html, /data-contact-value-line="pending"/);
  assert.match(html, /data-value-line-who="true">Nexa Capital · 合伙人</);
  assert.match(html, new RegExp(`data-value-line-context="true">可能对应：计划需求『${VALUE_NEED_TITLE}』<`));
  assert.doesNotMatch(html, /data-value-line-tail/);
  assert.match(html, /data-insight-status="true">正在生成，通常 1 分钟内</);
});

/* ── SC-03：为什么现在 ─────────────────────────────────────────────── */

test("SC-W0061-03: why-now = the plan item's own reason (phase prefix) → ready insight next step → nothing; non-plan items get none", () => {
  const action = { detail: "「拿到 3 个引荐」还差 2 个", phaseNo: 2, phaseTitle: "拓展引荐" };
  const ready = { nextStep: VALUE_TEXT.zh.nextStep, state: "ready" };
  assert.equal(contactValueWhyNow(action, ready, zh), "阶段 2 · 拓展引荐：「拿到 3 个引荐」还差 2 个");
  assert.equal(contactValueWhyNow({ ...action, detail: null }, ready, zh), VALUE_TEXT.zh.nextStep);
  assert.equal(contactValueWhyNow({ ...action, detail: "  " }, { nextStep: "x", state: "pending" }, zh), null);
  assert.equal(contactValueWhyNow({ ...action, detail: null }, null, zh), null);
  // 不是计划行动（跟进、信号）：没有 action → 不显示，哪怕洞察有下一步。
  assert.equal(contactValueWhyNow(null, ready, zh), null);
  const model = contactValueLine({ insight: valueInsight("zh"), name: "N", subtitle: null, whyNow: contactValueWhyNow(action, ready, zh) }, zh);
  const html = renderToStaticMarkup(<OrbitLanguageProvider initialLanguage="zh">{model.kind === "ready" ? <span>{model.whyNow}</span> : null}</OrbitLanguageProvider>);
  assert.match(html, /阶段 2 · 拓展引荐：「拿到 3 个引荐」还差 2 个/);
});

/**
 * iOrbit 任务 5：建议与行动 / 执行计划 / 工作策略 / 联系人建议 四屏。
 *
 * 断言分四组，与 home / chat / history 三套同一口径：
 *   1. 纯函数（`iorbitPlanWeeks`：真实自然周，不含设计 `weekData` 的主题与人名）
 *   2. SSR 结构：设计文案逐条在位、双层作用域由 `IOrbitScreenFrame` 一处持有、
 *      `data-*` 标记、**设计 mock 字符串一个不许出现**
 *   3. 作用域形态：新增的 `.btn.ir-week-head` 整段中和基类 + `:active{transform:none}`，
 *      四屏的 `<button>` 全部带 `btn ir-*`（`IORBIT_STYLES` 的整体作用域由
 *      `app-agent-iorbit-home.test.tsx` 统一守着，那条用例覆盖本任务新增的规则）
 *   4. 行为：`?view=contacts` 切屏、每行 CTA 按真实 operationType 变化
 *
 * W0009：plan 屏整体重写为「我的计划」（读当前生效计划），原来的 4 周手风琴 / 优化计划 CTA /
 * 跟进 + 账本行的用例改为「我的计划」的报头、本周打勾（乐观更新与回滚）、阶段折叠、进展记录用例；
 * 策略屏新增「有计划时推荐理由对应计划阶段」（RW-07）。
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { IOrbitActions } from "../../app/(app)/app/agent/iorbit-0918/iorbit-actions";
import { IOrbitPlan } from "../../app/(app)/app/agent/iorbit-0918/iorbit-plan";
import { buildPlanWeekSummary, planEventReasons } from "../../app/(app)/app/agent/plan/plan-route-view-model";
import { toPlanView, toPlanViewItem, toPlanViewLogEntry } from "../../features/plans/repository";
import { PLAN_NOW, planSnapshotFixture } from "../support/plan-snapshot-fixture";
import { IOrbitStrategy } from "../../app/(app)/app/agent/iorbit-0918/iorbit-strategy";
import { OrbitLanguageProvider } from "../../app/(app)/app/orbit-language-context";
import { IORBIT_STYLES } from "../../app/(app)/app/agent/iorbit-0918/iorbit-styles";
import {
  iorbitPlanWeeks,
  iorbitStrategyView,
} from "../../app/(app)/app/agent/iorbit-0918/iorbit-model";
import type { AgentActionsRouteViewModel } from "../../app/(app)/app/agent/actions/actions-route-view-model";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

/* ── 夹具 ─────────────────────────────────────────────────────────────── */

function ledgerEntry(
  overrides: Partial<Record<string, unknown>> & { entryId: string },
): never {
  return {
    autonomousExecutionStarted: false,
    createdAt: "2026-09-22T01:00:00Z",
    evidenceChips: [
      { evidenceId: "ev-a", label: "证据 A" },
      { evidenceId: "ev-b", label: "证据 B" },
    ],
    evidenceIds: ["ev-a", "ev-b"],
    preview: "这是这条动作的预览正文。",
    externalSideEffectExecuted: false,
    messageAutoSendExecuted: false,
    operations: [],
    provenance: {
      collectedAt: "2026-09-22T01:00:00Z",
      evidenceIds: [],
      source: "test",
      sourceLabel: "test",
    },
    sourceRefs: [],
    status: "approved",
    title: "跟进 QA 测试联系人",
    undoable: false,
    updatedAt: "2026-09-22T01:00:00Z",
    whyNow: "这条跟进已经到期。",
    ...overrides,
  } as never;
}

/** decide 1 / today 4 / later 0：刻意避开设计 mock 的 2 / 3 / 2。 */
const ACTIONS_VM: AgentActionsRouteViewModel = {
  completedToday: 1,
  errorCode: null,
  evidenceIds: [],
  failureMessage: null,
  selectedEntryId: null,
  state: "success",
  tiers: [
    {
      entries: [
        ledgerEntry({
          entryId: "e-decide",
          operations: [
            { operationId: "o1", operationType: "save_message_draft" } as never,
          ],
          status: "awaiting_confirmation",
          title: "给 QA 测试联系人发一封跟进邮件",
        }),
      ],
      key: "decide",
    },
    {
      entries: [
        ledgerEntry({
          entryId: "e-task",
          operations: [
            { operationId: "o2", operationType: "create_followup_task" } as never,
          ],
        }),
        ledgerEntry({
          entryId: "e-cal",
          operations: [
            { operationId: "o3", operationType: "add_to_orbit_schedule" } as never,
          ],
        }),
        ledgerEntry({
          entryId: "e-note",
          operations: [
            { operationId: "o4", operationType: "save_meeting_note" } as never,
          ],
        }),
        ledgerEntry({
          entryId: "e-unknown",
          operations: [],
        }),
      ],
      key: "today",
    },
    { entries: [], key: "later" },
  ],
  todaysTotal: 6,
};

const SNAPSHOT = {
  facts: {
    appointments: {
      items: [
        {
          href: "/app/schedule",
          key: "appt-1",
          medium: "video",
          needsReconfirmation: false,
          startsAtUtc: "2026-09-24T02:00:00Z",
        },
      ],
      state: "ready",
    },
    followups: {
      current: {
        items: [
          {
            contactId: "c-1",
            contactName: "QA 测试联系人",
            dueAt: "2026-09-25T02:00:00Z",
            href: "/app/contacts/c-1",
            issue: "上次沟通后还没有回音，建议再推进一次。",
            key: "f-1",
            organization: "Orbit QA",
            title: "推进 QA 测试联系人",
          },
        ],
        state: "ready",
      },
      state: "ready",
    },
  },
  recommendations: {
    items: [
      {
        eventId: "ev-1",
        matchedTokens: ["AI"],
        startsAt: "2026-10-15T09:00:00Z",
        title: "QA 冒烟活动",
        venue: "Orbit QA 会场",
      },
    ],
    state: "success",
  },
} as never;

/** 设计 renderVals（820–907）里的 mock，一屏都不许出现（「审阅修订」20）。 */
const DESIGN_MOCKS = [
  "田中圭子",
  "山本健一",
  "佐藤直树",
  "Google · 产品负责人",
  "Sony · 新业务开发",
  "日本智能制造峰会 2026",
  "东京 AI 创业者交流会",
  "东京国际论坛",
  "Tokyo AI Meetup",
  "我想推进日本制造业 AI 合作，该怎么开展？",
  "14%",
  "1 / 7 项已完成",
  "12 人",
  "4 场",
  "20 次",
  "9/18 产品讨论",
  "制造业 DX 负责人",
  "工厂自动化负责人",
];

/* ── 1. 纯函数 ─────────────────────────────────────────────────────────── */

test("the four-week rhythm header uses real calendar weeks, never the design's weekData", () => {
  // 2026-09-23 是周三 → 本周一是 9/21。
  const weeks = iorbitPlanWeeks(new Date(2026, 8, 23));

  assert.equal(weeks.length, 4);
  assert.deepEqual(
    weeks.map((week) => week.no),
    [1, 2, 3, 4],
  );
  assert.equal(weeks[0]!.range, "9/21 – 9/27");
  assert.equal(weeks[1]!.range, "9/28 – 10/4");
  assert.equal(weeks[3]!.range, "10/12 – 10/18");

  // 周日也要落回同一周的周一（getDay() === 0 的边界）。
  assert.equal(iorbitPlanWeeks(new Date(2026, 8, 27))[0]!.range, "9/21 – 9/27");
});

// iOrbit 合并前终审 3：这个表头由 `agent/plan/page.tsx` 服务端渲染。原实现用运行时
// 本地的 setHours/getDay/getDate 起算，UTC 服务端 + 东亚用户在周一凌晨会先收到上一
// 周的四个表头、hydration 后再换一周。锚点必须只取决于传入的时区。
test("the four-week anchor is pinned to the plan time zone, not the runtime's", () => {
  // 2026-09-21 是周一。东京 01:00 的那一刻，UTC 还停在 2026-09-20（周日）。
  const mondayEarlyInTokyo = new Date("2026-09-21T01:00:00+09:00");

  assert.equal(
    iorbitPlanWeeks(mondayEarlyInTokyo, "Asia/Tokyo")[0]!.range,
    "9/21 – 9/27",
  );
  // 同一瞬间按 UTC 读是上一周——两者不同，正是这条修复要消除的分歧；
  // 默认参数必须站在东京一侧。
  assert.equal(iorbitPlanWeeks(mondayEarlyInTokyo, "UTC")[0]!.range, "9/14 – 9/20");
  assert.equal(
    iorbitPlanWeeks(mondayEarlyInTokyo)[0]!.range,
    iorbitPlanWeeks(mondayEarlyInTokyo, "Asia/Tokyo")[0]!.range,
  );
});

/* ── 2. SSR 结构 ───────────────────────────────────────────────────────── */

function actionsMarkup(viewModel = ACTIONS_VM): string {
  return renderToStaticMarkup(<IOrbitActions viewModel={viewModel} />);
}

test("every iOrbit sibling screen renders inside the shared double page scope", () => {
  for (const html of [
    actionsMarkup(),
    renderToStaticMarkup(<IOrbitPlan guideEnabled initialSnapshot={planSnapshotFixture()} now={PLAN_NOW} />),
    renderToStaticMarkup(<IOrbitStrategy />),
    renderToStaticMarkup(<IOrbitStrategy view="contacts" />),
  ]) {
    assert.match(html, /data-orbit-real-page="agent"/);
    assert.match(html, /data-orbit-real-page="iorbit-0918"/);
    assert.ok(
      html.indexOf('data-orbit-real-page="agent"') <
        html.indexOf('data-orbit-real-page="iorbit-0918"'),
      "the agent scope must wrap the iorbit-0918 scope",
    );
    // 「审阅修订」28 / 37。
    assert.match(html, /data-orbit-agent-screen-title/);
    assert.match(html, /data-orbit-iorbit-ready="(true|false)"/);
    // 设计 43 的 <main>。
    assert.match(html, /class="ir-main"/);
    assert.match(html, /class="ir-screen"/);
  }
});

test("the actions screen ships every design block from lines 349–426", () => {
  const html = actionsMarkup();

  for (const copy of [
    "建议与行动",
    "← 返回概览",
    "把今天最值得处理的事情，按优先顺序整理给你。",
    "需要你决定",
    "建议今天做",
    "可以稍后处理",
    "今天的重点",
    "今日进度",
    "从第一项开始，让今天更进一步。",
    "专注于重要的事情，会让每一天都更有价值。",
  ]) {
    assert.ok(html.includes(copy), `design copy missing from actions: ${copy}`);
  }

  // 360/373/390 的三条左边框颜色。
  for (const rail of ["#B5473A", "#4B4FC7", "#9FA3C4"]) {
    assert.ok(html.includes(`border-left-color:${rail}`), `missing tier rail ${rail}`);
  }
  // 415 的 conic-gradient 进度环（百分比是真实计数派生）。
  assert.match(html, /conic-gradient\(#4B4FC7 0 17%, #ECEEFB 17% 100%\)/);
  assert.ok(html.includes("1 / 6 项已完成"));
  // aside 三行计数与真实分档一致（1 / 4 / 0）。
  assert.match(html, /class="ir-stat-value">1</);
  assert.match(html, /class="ir-stat-value">4</);
  assert.match(html, /class="ir-stat-value">0</);
});

test("actions rows carry a per-row CTA driven by the real operation type", () => {
  const html = actionsMarkup();

  for (const cta of [
    "查看草稿 ›",
    "查看任务 ›",
    "查看日程 ›",
    "查看纪要 ›",
    "查看详情 ›",
  ]) {
    assert.ok(html.includes(cta), `missing per-row CTA: ${cta}`);
  }
  // CTA 指向既有的 `?entry=` 展开参数，不是新造路由。
  assert.match(html, /href="\/app\/agent\/actions\?entry=e-task"/);
  // 写能力不得丢（「审阅修订」10）：决策表单与账本转移控件都在。
  assert.ok(html.includes("data-orbit-agent-action-entry=\"e-decide\""));
});

function myPlanMarkup(): string {
  return renderToStaticMarkup(<IOrbitPlan guideEnabled initialSnapshot={planSnapshotFixture()} now={PLAN_NOW} />);
}

test("my plan: masthead with the goal verbatim, meta line, collapsed analysis and the week ruler", () => {
  const html = bodyOf(myPlanMarkup());

  assert.ok(html.includes("iOrbit</a> / 我的计划"));
  assert.match(html, /data-orbit-plan-goal="true"[^>]*>三个月内找到 5 家日本中小企业试用我们的产品</);
  assert.ok(html.includes("计划 v1 · 9/14 生成 · 先从东京开始"));
  // 目标分析默认折叠：只有开关，没有内容块。
  assert.match(html, /aria-expanded="false"[^>]*data-orbit-plan-analysis-toggle="true"[^>]*>目标分析 ▾</);
  assert.doesNotMatch(html, /data-orbit-plan-analysis="true"/);
  // W0012：重新分析是真按钮；没有服务端额度（未传 tracking）时不可点，也不编造「剩 1 次」。
  assert.match(html, /<button class="btn ir-p-link" data-orbit-plan-reanalyse="true" disabled=""[^>]*>重新分析<\/button>/);
  // 刻度：12 个周格、前两周已过、第 3 周是本周；阶段区间按起始周与跨度排。
  assert.equal(html.match(/data-orbit-plan-week="\d+"/g)?.length, 12);
  assert.equal(html.match(/class="ir-p-past"/g)?.length, 2);
  assert.match(html, /class="ir-p-now" data-orbit-plan-week="3"><span>本周<\/span>/);
  assert.match(html, /class="ir-p-cur" style="grid-column:1 \/ span 3" title="1 · 摸清需求"/);
  assert.ok(html.includes('style="grid-column:4 / span 5"'));
  assert.match(html, /data-orbit-plan-week-text="true">第 3 周 \/ 共 12 周</);
  assert.ok(html.includes("9/14 开始") && html.includes("12/6 结束"));
  // 旧屏的占位整块拿掉。
  for (const gone of ["4 周推进节奏", "随 W4 策略能力上线", "执行计划", "让 iOrbit 优化计划"]) {
    assert.ok(!html.includes(gone), `old plan placeholder leaked back: ${gone}`);
  }
});

test("my plan: this week lists due actions with overdue pills, phases collapse except the current one", () => {
  const html = bodyOf(myPlanMarkup());

  assert.ok(html.includes("本周 · 第 3 周"));
  assert.ok(html.includes("9/28 – 10/4"));
  const actions = [...html.matchAll(/data-orbit-plan-action="([^"]+)"/g)].map((match) => match[1]);
  // 已完成的（包括本周刚完成的）不在本周列表里。
  assert.deepEqual(actions, ["a-this-week", "a-overdue-1", "a-overdue-2"]);
  assert.match(html, /data-orbit-plan-overdue="1">已延后 1 周</);
  assert.match(html, /data-orbit-plan-overdue="2">已延后 2 周</);
  assert.doesNotMatch(html, /data-orbit-plan-action="a-done-this-week"/);
  assert.equal(html.match(/role="checkbox"/g)?.length, 3);

  // 阶段：三段，只有当前（第 1 段）展开。
  assert.equal(html.match(/data-orbit-plan-phase="/g)?.length, 3);
  assert.ok(html.includes("当前：第 1 阶段"));
  assert.match(html, /aria-controls="ir-p-phase-p1" aria-expanded="true"/);
  assert.match(html, /aria-controls="ir-p-phase-p2" aria-expanded="false"/);
  assert.ok(html.includes("第 1–3 周 · 2 / 5 行动"));
  // 当前阶段的内容：信息与答案、活动、自我介绍、跟进方式。
  assert.ok(html.includes("✓ 大多手写，会后 30 分钟整理"));
  assert.ok(html.includes("还没有答案"));
  assert.ok(html.includes("我正在推进一件事：三个月内找到 5 家试用客户。"));
  assert.ok(html.includes("当天：发一句感谢"));
});

test("my plan: network needs with counts and people newest first, plan events, and the progress log", () => {
  const html = bodyOf(myPlanMarkup());

  assert.ok(html.includes("人脉需求"));
  assert.ok(html.includes("人员按添加时间倒序"));
  assert.match(html, /<b>1<\/b> 已建立联系/);
  assert.match(html, /<b>2<\/b> 已关联/);
  const people = [...html.matchAll(/data-orbit-plan-person="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(people, ["contact:c2", "contact:c1"]);
  assert.ok(html.includes("高木一郎"));
  assert.ok(html.includes("还没有关联的人"));
  // 「待确认 N」角标在 W0010 之前不出现。
  assert.doesNotMatch(html, /待确认/);

  assert.ok(html.includes("计划里的活动"));
  assert.match(html, /href="\/app\/events\/event%3Afounders-night"[^>]*>东京创业者交流之夜</);
  assert.ok(html.includes("已报名 · 对应「能帮你引荐的行业前辈」"));
  assert.ok(html.includes("推荐 · 对应「中小企业的 IT 负责人」"));

  assert.ok(html.includes("进展记录"));
  assert.match(html, /data-orbit-plan-log-form="true"/);
  const log = [...html.matchAll(/data-orbit-plan-log-entry="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(log, ["log-manual", "log-done", "log-created"]);
  assert.ok(html.includes("今天和老客户通了电话<small>手动</small>"));
  assert.ok(html.includes("完成「把 30 秒自我介绍发给 3 位老朋友」"));
});

test("my plan: no plan links to guide step 3 (or back to iOrbit when the guide is off); a read failure says so", () => {
  const withGuide = renderToStaticMarkup(<IOrbitPlan guideEnabled initialSnapshot={null} now={PLAN_NOW} />);
  assert.match(withGuide, /data-orbit-plan-empty="true"/);
  assert.ok(withGuide.includes("还没有计划"));
  assert.match(withGuide, /class="ir-p-empty-link" href="\/app\/start">去第 3 步生成计划 →</);

  const noGuide = renderToStaticMarkup(<IOrbitPlan guideEnabled={false} initialSnapshot={null} now={PLAN_NOW} />);
  assert.match(noGuide, /class="ir-p-empty-link" href="\/app\/agent">回到 iOrbit →</);
  assert.doesNotMatch(noGuide, /\/app\/start/);

  const failed = renderToStaticMarkup(<IOrbitPlan guideEnabled initialSnapshot="unavailable" now={PLAN_NOW} />);
  assert.match(failed, /data-orbit-plan-unavailable="true"/);
  assert.ok(failed.includes("计划暂时读不到"));
  assert.doesNotMatch(failed, /data-orbit-plan-goal/);
});

test("the strategy screen keeps its own compact list, next events and this-week block", () => {
  const html = renderToStaticMarkup(<IOrbitStrategy />);

  for (const copy of [
    "工作策略",
    "基于你的问题，结合现有数据与资源，提供可执行的行动建议。",
    "◷ 历史记录",
    "← 返回对话",
    "先联系谁",
    "查看全部联系人 →",
    "你还缺什么人",
    "聊之前，准备什么",
    "下一步去哪",
    "本周建议",
    "我应该先联系谁？",
    "帮我拆成 4 周计划",
  ]) {
    assert.ok(html.includes(copy), `design copy missing from strategy: ${copy}`);
  }
  // 面包屑是 505 的三段。
  assert.ok(html.includes("对话</a> / 工作策略"));
  // 「◷ 历史记录」是真实能力：落到壳上开抽屉（任务 5 新增 `?history=1`）。
  assert.match(html, /href="\/app\/agent\?history=1"/);
  assert.match(html, /data-orbit-iorbit-screen="strategy"/);
});

test("the contacts screen is its own view with its own breadcrumb, H1 and blocks", () => {
  const html = renderToStaticMarkup(<IOrbitStrategy view="contacts" />);

  for (const copy of [
    "联系人建议",
    "先联系谁",
    "基于你的问题和现有人脉，我为你找到了最值得先联系的人选。",
    "你还缺这样的人",
    "聊之前，准备这 3 件事",
    "相关活动",
    "查看更多活动 →",
    "返回对话 →",
  ]) {
    assert.ok(html.includes(copy), `design copy missing from contacts: ${copy}`);
  }
  assert.ok(html.includes("对话</a> / 联系人建议"));
  assert.match(html, /data-orbit-iorbit-screen="contacts"/);
  // strategy 屏自己的块**不在** contacts 屏上（两屏不是一个屏）。
  // 断 data-* 而不是文案：`IORBIT_STYLES` 的中文注释也在 <style> 里，会误命中。
  assert.ok(!html.includes('data-orbit-agent-strategy-section="next-events"'));
  assert.ok(!html.includes('data-orbit-agent-strategy-section="this-week"'));
  assert.ok(html.includes('data-orbit-agent-strategy-section="contact-cards"'));
});

test("`?view=` resolves to exactly two screens", () => {
  assert.equal(iorbitStrategyView(undefined), "strategy");
  assert.equal(iorbitStrategyView("strategy"), "strategy");
  assert.equal(iorbitStrategyView("contacts"), "contacts");
  assert.equal(iorbitStrategyView(["contacts", "strategy"]), "contacts");
  assert.equal(iorbitStrategyView("anything-else"), "strategy");
});

/** 只看 <style> 之外的正文：皮肤字符串里的中文注释不是屏上的内容。 */
function bodyOf(html: string): string {
  return html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, "");
}

test("none of the four screens renders the design's mock names or numbers", () => {
  for (const [label, markup] of [
    ["actions", actionsMarkup()],
    ["plan", renderToStaticMarkup(<IOrbitPlan guideEnabled initialSnapshot={planSnapshotFixture()} now={PLAN_NOW} />)],
    ["strategy", renderToStaticMarkup(<IOrbitStrategy />)],
    ["contacts", renderToStaticMarkup(<IOrbitStrategy view="contacts" />)],
  ] as const) {
    const html = bodyOf(markup);
    for (const mock of DESIGN_MOCKS) {
      assert.ok(!html.includes(mock), `design mock leaked into ${label}: ${mock}`);
    }
  }
});

test("the actions screen shows empty and failure states without inventing content", () => {
  const empty = actionsMarkup({
    ...ACTIONS_VM,
    completedToday: 0,
    state: "empty",
    tiers: [],
    todaysTotal: 0,
  });
  assert.ok(empty.includes("当前没有待你处理的事——其余的 Orbit 都盯着。"));
  // 分母为 0 时环里是「—」，不是伪造的百分比。
  assert.match(empty, /class="ir-ring-hole">—</);

  const failure = actionsMarkup({
    ...ACTIONS_VM,
    failureMessage: "ledger down",
    state: "failure",
    tiers: [],
  });
  assert.ok(failure.includes("操作账本暂时不可用。"));
  assert.ok(failure.includes("ledger down"));
  assert.match(failure, /role="alert"/);
});

/* ── 3. 作用域形态 ─────────────────────────────────────────────────────── */

test("every <button> on the four screens is a .btn, and every authored one is btn ir-*", () => {
  for (const html of [
    actionsMarkup(),
    renderToStaticMarkup(<IOrbitPlan guideEnabled initialSnapshot={planSnapshotFixture()} now={PLAN_NOW} />),
    renderToStaticMarkup(<IOrbitStrategy />),
    renderToStaticMarkup(<IOrbitStrategy view="contacts" />),
  ]) {
    const body = html.split('<main class="ir-main">')[1] ?? "";
    for (const tag of body.match(/<button[^>]*>/g) ?? []) {
      // 设计外携带进来的既有写控件（`OrbitTodayDecisionForm` /
      // `OrbitAllActionsControls`）用 `agent` 作用域的旧皮肤（记偏差），
      // 但它们同样是 `.btn`——按钮 ratchet 要的就是这一条。
      assert.match(tag, /class="btn /, `non-.btn button: ${tag}`);
    }
  }
});

test("the four screen files only author btn ir-* buttons", () => {
  for (const file of [
    "app/(app)/app/agent/iorbit-0918/iorbit-actions.tsx",
    "app/(app)/app/agent/iorbit-0918/iorbit-plan.tsx",
    "app/(app)/app/agent/iorbit-0918/iorbit-strategy.tsx",
    "app/(app)/app/agent/iorbit-0918/iorbit-screen-frame.tsx",
  ]) {
    const source = readFileSync(join(projectRoot, file), "utf8");
    for (const match of source.matchAll(/className="([^"]*)"/g)) {
      const value = match[1]!;
      if (!value.startsWith("btn")) continue;
      assert.match(
        value,
        /^btn ir-[a-z-]+$/,
        `${file} declares a non ir-* button class: ${value}`,
      );
    }
  }
});

// 修订轮 1 的护栏（Critical 1）：任务 5 的规则写在同一张表的后半段，与对话屏 /
// 概览屏同名同特异度的选择器会**静默覆盖**它们（`.ir-event-date` 曾把概览屏的
// 月/日竖排块压成横排并写死底色，`.ir-progress-track` 曾把本周推进条压成 140px）。
test("IORBIT_STYLES never declares the same selector twice", () => {
  const body = IORBIT_STYLES.replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "")
    .replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");

  const seen = new Map<string, string>();
  const duplicates: string[] = [];
  for (const rule of body.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = rule[1]!.trim().replace(/\s+/g, " ");
    const declarations = rule[2]!.trim().replace(/\s+/g, " ");
    if (!selector) continue;
    const previous = seen.get(selector);
    if (previous !== undefined) {
      duplicates.push(
        previous === declarations
          ? `${selector} (identical body declared twice)`
          : `${selector}\n    first:  ${previous}\n    second: ${declarations}`,
      );
      continue;
    }
    seen.set(selector, declarations);
  }

  assert.ok(seen.size > 380, `expected the full skin, found ${seen.size} rules`);
  assert.deepEqual(
    duplicates,
    [],
    `IORBIT_STYLES re-declares selectors (the later one silently wins):\n  ${duplicates.join("\n  ")}`,
  );
});

// 概览屏与对话屏靠这些类活着；任务 5 不得把它们改成自己的几何。
test("the screens the earlier tasks certified keep their own geometry classes", () => {
  const flat = IORBIT_STYLES.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").join(" ");

  // 概览屏 148–170 的已报名活动日期块：66px、竖排、底色由 .ir-bg-a/.ir-bg-b 给。
  const homeEventDate = flat.match(/\.ir-event-date(?![-a-z])[^{]*\{[^}]*\}/);
  assert.ok(homeEventDate);
  assert.ok(homeEventDate![0].includes("height: 66px"));
  assert.ok(homeEventDate![0].includes("flex-direction: column"));
  assert.ok(!homeEventDate![0].includes("background:"));
  // 概览屏 214–236 的本周推进条：白底、不定宽。
  const homeTrack = flat.match(/\.ir-progress-track(?![-a-z])[^{]*\{[^}]*\}/);
  assert.ok(homeTrack);
  assert.ok(homeTrack![0].includes("background: #FFFFFF"));
  assert.ok(!homeTrack![0].includes("width:"));
  // 任务 5 自己的两套用别的类名。
  assert.match(flat, /\.ir-sec-event-date(?![-a-z])[^{]*\{/);
  assert.match(flat, /\.ir-plan-progress-track(?![-a-z])[^{]*\{/);
});

test("the new .btn rule neutralises the shared base class and its :active transform", () => {
  const flat = IORBIT_STYLES.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").join(" ");

  const match = flat.match(/\.btn\.ir-week-head(?![-a-z])[^{]*\{[^}]*\}/);
  assert.ok(match, "missing .btn override for .ir-week-head");
  for (const declaration of [
    "height:",
    "display:",
    "align-items:",
    "justify-content:",
    "white-space:",
    "letter-spacing:",
    "line-height:",
    "transition:",
  ]) {
    assert.ok(match![0].includes(declaration), `.ir-week-head misses ${declaration}`);
  }
  const active = flat.match(/\.btn\.ir-week-head(?![-a-z]):active[^{]*\{[^}]*\}/);
  assert.ok(active && active[0].includes("transform: none"));
});

// 修订轮 2（Critical 1）/ 收尾 2026-09-24：作用域顶部的 `a { color:#3B3F7A }` /
// `a:hover { color:#0E1225 }` 会压掉任何落成 `<a>` 的行。原先在这里的单域断言已
// **提升为六域共用门禁**，见 `tests/ui/orbit-0918-anchor-colour.test.ts`——那一版还
// 按 CSS 特指度判定（`.btn.ir-x` 这类双类规则本就压得过基线，单类规则压不过），
// 并放行行内 `style={{ color }}`，所以不在这里重复。

// 设计 449 的任务标题是默认墨色 #0E1225（`t.color` 在未完成行上就是它）。
test("the plan task title keeps the design's ink colour", () => {
  const flat = IORBIT_STYLES.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").join(" ");

  const row = flat.match(/\.ir-task-row(?![-a-z:])[^{]*\{([^}]*)\}/);
  assert.ok(row, "missing .ir-task-row rule");
  assert.match(row![1]!, /color:\s*#0E1225/, ".ir-task-row must pin the design ink colour");
  // 标题本身不写颜色（设计也没写），所以它**必须**从行上继承到 #0E1225。
  const title = flat.match(/\.ir-row-title(?![-a-z:])[^{]*\{([^}]*)\}/);
  assert.ok(title);
  assert.ok(!/color\s*:/.test(title![1]!), ".ir-row-title must not declare its own colour");
  // hover 也必须被中和（设计的行没有 hover 态）。
  assert.match(flat, /\.ir-task-row:hover[^{]*\{[^}]*color:\s*inherit/);
  assert.match(flat, /\.ir-aside-line:hover[^{]*\{[^}]*color:\s*#6B6F99/);
});

test("the narrow-screen media query collapses both two-column grids", () => {
  const media = IORBIT_STYLES.replace(/\/\*[\s\S]*?\*\//g, "").match(
    /@media[^{]*\{([\s\S]*?)\n\}/,
  );
  assert.ok(media);
  // 任务 4 遗留 7：右栏现在有内容，≤900px 必须塌成一列。
  assert.match(media![1]!, /\.ir-chat-grid \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(media![1]!, /\.ir-two-col \{ grid-template-columns: minmax\(0, 1fr\); \}/);
});

/* ── 4. 行为 ───────────────────────────────────────────────────────────── */

// 修订轮 1（Important 2）：这枚 CTA 原来把每行都指向同一个页面、什么也不发生
// （`selectedEntryId` 解析了却没人渲染）。现在它就是展开控件。
test("the actions per-row CTA actually expands that row", () => {
  const collapsed = actionsMarkup();
  assert.ok(!collapsed.includes("这是这条动作的预览正文。"));
  assert.match(collapsed, /data-orbit-agent-action-expand="e-task" href="\/app\/agent\/actions\?entry=e-task"/);
  assert.ok(!collapsed.includes("收起 ›"));

  const opened = actionsMarkup({ ...ACTIONS_VM, selectedEntryId: "e-task" });
  // 展开的那一行显示自己的 preview，并把 CTA 换成收起（指回不带 ?entry= 的地址）。
  assert.match(opened, /data-orbit-agent-action-preview[^>]*>这是这条动作的预览正文。</);
  assert.match(opened, /aria-expanded="true"[^>]*data-orbit-agent-action-expand="e-task"/);
  assert.ok(opened.includes("收起 ›"));
  // 只展开一行。
  assert.equal(opened.match(/data-orbit-agent-action-preview/g)?.length, 1);
});

// 修订轮 1（Important 3）：被删旧屏渲染过的状态标签与证据 chips 必须回来（处处有据）。
test("the actions rows keep the status label and the evidence chips the old screen had", () => {
  const html = actionsMarkup();

  assert.ok(html.includes("等待确认"), "awaiting_confirmation must keep its localized status");
  assert.ok(html.includes("已确认"), "approved must keep its localized status");
  assert.match(html, /data-orbit-agent-action-evidence/);
  assert.ok(html.includes("证据 A") && html.includes("证据 B"));
  // 五行条目，五组证据。
  assert.equal(html.match(/data-orbit-agent-action-evidence/g)?.length, 5);
});

// 修订轮 1（Minor）：「等 W4」的说明只有一份，来自 view model。
test("the contact-card rows use the neutral waiting sentence, not a section's subject", async (t) => {
  const { buildAgentStrategyViewModel } = await import(
    "../../app/(app)/app/agent/strategy/strategy-route-view-model"
  );
  const vm = buildAgentStrategyViewModel({ language: "zh", snapshot: "pending" });
  const missing = vm.waitingSections.find((section) => section.key === "missing")!;
  const prep = vm.waitingSections.find((section) => section.key === "prep")!;

  const mounted = await mount(
    t,
    <IOrbitStrategy loadSnapshot={async () => SNAPSHOT} view="contacts" />,
  );
  await mounted.settle();
  const waiting = mounted.root.root.findAll(
    (node) =>
      typeof node.props?.className === "string" &&
      node.props.className.includes("ir-contact-waiting"),
  );
  assert.equal(waiting.length, 2);
  for (const node of waiting) {
    const text = JSON.stringify(node.children);
    // 行里说的是中立的那句，不是段落的「缺口分析…」「准备清单…」。
    assert.ok(text.includes(vm.waitingNote), "rows must use the neutral waiting sentence");
    assert.ok(!text.includes(missing.description));
    assert.ok(!text.includes(prep.description));
  }
});

test("the waiting copy comes from the strategy view model, not a second hardcoded copy", async (t) => {
  const { buildAgentStrategyViewModel } = await import(
    "../../app/(app)/app/agent/strategy/strategy-route-view-model"
  );
  const vm = buildAgentStrategyViewModel({ language: "zh", snapshot: "pending" });
  const missing = vm.waitingSections.find((section) => section.key === "missing")!;
  const prep = vm.waitingSections.find((section) => section.key === "prep")!;

  const strategy = renderToStaticMarkup(<IOrbitStrategy />);
  assert.ok(strategy.includes(missing.description));
  assert.ok(strategy.includes(prep.description));

  const source = readFileSync(
    join(projectRoot, "app/(app)/app/agent/iorbit-0918/iorbit-strategy.tsx"),
    "utf8",
  );
  assert.ok(
    !source.includes("需要 W4 策略生成能力，尚未上线"),
    "the screen must not keep a second copy of the waiting description",
  );
});

interface Mounted {
  root: ReactTestRenderer;
  settle: (rounds?: number) => Promise<void>;
}

async function mount(t: TestContext, element: React.ReactElement, fetchImpl?: typeof fetch): Promise<Mounted> {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousFetch = Object.getOwnPropertyDescriptor(globalThis, "fetch");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener: () => undefined,
      dispatchEvent: () => true,
      location: { href: "https://orbit.test/app/agent/plan", pathname: "/app/agent/plan", search: "" },
      removeEventListener: () => undefined,
      setTimeout: (handler: () => void, ms?: number) => setTimeout(handler, ms),
      clearTimeout: (id: unknown) => clearTimeout(id as never),
    },
    writable: true,
  });
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value:
      fetchImpl ??
      (async () =>
        ({
          json: async () => ({ data: { entries: [] }, success: true }),
          ok: true,
        }) as never),
    writable: true,
  });
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(element);
  });
  const settle = async (rounds = 4) => {
    for (let index = 0; index < rounds; index += 1) {
      await act(async () => {
        await Promise.resolve();
      });
    }
  };
  await settle();
  t.after(() => {
    act(() => root.unmount());
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (previousFetch) Object.defineProperty(globalThis, "fetch", previousFetch);
    else Reflect.deleteProperty(globalThis, "fetch");
  });
  return { root, settle };
}

test("the strategy screen renders real follow-ups and real recommended events", async (t) => {
  const mounted = await mount(t, <IOrbitStrategy loadSnapshot={async () => SNAPSHOT} />);
  await mounted.settle();

  const text = JSON.stringify(mounted.root.toJSON());
  assert.ok(text.includes("QA 测试联系人"));
  assert.ok(text.includes("上次沟通后还没有回音，建议再推进一次。"));
  assert.ok(text.includes("QA 冒烟活动"));
  assert.ok(text.includes("Orbit QA 会场"));
});

test("the contacts cards show the real why-now and keep the unsourced rows on the W4 note", async (t) => {
  const mounted = await mount(
    t,
    <IOrbitStrategy loadSnapshot={async () => SNAPSHOT} view="contacts" />,
  );
  await mounted.settle();

  const text = JSON.stringify(mounted.root.toJSON());
  // 设计 696–705 的三行标签。
  for (const label of ["为什么现在联系", "他能提供什么", "建议开场白"]) {
    assert.ok(text.includes(label), `missing contact-card row label: ${label}`);
  }
  // 为什么现在联系 = followup 的真实 issue。
  assert.ok(text.includes("上次沟通后还没有回音，建议再推进一次。"));
  // 开场白与「他能提供什么」无来源 → 「等 W4」说明，不伪造（「审阅修订」20）。
  const waiting = mounted.root.root.findAll((node) =>
    typeof node.props?.className === "string" &&
    node.props.className.includes("ir-contact-waiting"),
  );
  assert.equal(waiting.length, 2, "both unsourced rows must carry the W4 note");
  // 「✎ 帮我准备联系内容」把真实姓名带进提问。
  const prepare = mounted.root.root.findAll(
    (node) => node.props?.["data-orbit-iorbit-contact-prepare"] !== undefined,
  )[0]!;
  assert.equal(
    decodeURIComponent(String(prepare.props.href)),
    "/app/agent?q=帮我准备联系QA 测试联系人的内容",
  );
});

/* ── W0003 SC-04：推荐理由只写真实匹配词 ───────────────────────────────── */

function strategyWithTokens(matchedTokens: readonly string[]) {
  const snapshot = SNAPSHOT as unknown as {
    recommendations: { items: Array<Record<string, unknown>>; state: string };
  };
  return {
    ...snapshot,
    recommendations: {
      ...snapshot.recommendations,
      items: snapshot.recommendations.items.map((item) => ({ ...item, matchedTokens })),
    },
  } as never;
}

function matchReasons(root: ReactTestRenderer) {
  return root.root.findAll(
    (node) => typeof node.type === "string" && node.props?.["data-orbit-iorbit-match-reason"] !== undefined,
  );
}

test("the recommendation reason is only the matched goal words", async (t) => {
  const mounted = await mount(
    t,
    <IOrbitStrategy loadSnapshot={async () => strategyWithTokens(["开拓新市场", "日本"])} />,
  );
  await mounted.settle();

  const reasons = matchReasons(mounted.root);
  assert.equal(reasons.length, 1);
  assert.equal(reasons[0]!.children.join(""), "匹配你的目标：『开拓新市场』『日本』");
  // 活动行里不再有单独的灰色词块。
  for (const row of mounted.root.root.findAll((node) => node.props?.className === "ir-event-row")) {
    assert.equal(row.findAll((node) => node.props?.className === "ir-pill-grey").length, 0);
  }
});

test("no matched words means no reason line at all", async (t) => {
  const mounted = await mount(t, <IOrbitStrategy loadSnapshot={async () => strategyWithTokens([])} />);
  await mounted.settle();

  assert.ok(JSON.stringify(mounted.root.toJSON()).includes("QA 冒烟活动"), "the event itself still renders");
  assert.equal(matchReasons(mounted.root).length, 0);
  assert.doesNotMatch(JSON.stringify(mounted.root.toJSON()), /匹配你的目标/);
});

test("the event-recommendation areas make no unsupported attendee or effect claims", async (t) => {
  const FORBIDDEN = /潜在联系人|决策层|更高效地结识|更快接触|potential contacts?|decision[- ]makers?|fastest way to meet|people you are missing/i;
  const eventSections = (html: string) =>
    [...html.matchAll(/<section[^>]*data-orbit-agent-strategy-section="(?:next-events|related-events)"[\s\S]*?<\/section>/g)]
      .map((match) => match[0])
      .join("\n");

  // SSR：两种语言 × 两屏的区块标题与说明（静态文案）。
  for (const language of ["zh", "en"] as const) {
    for (const view of ["strategy", "contacts"] as const) {
      const area = eventSections(
        renderToStaticMarkup(
          <OrbitLanguageProvider initialLanguage={language}>
            <IOrbitStrategy view={view} />
          </OrbitLanguageProvider>,
        ),
      );
      assert.ok(area.length > 0, `${language}/${view}: event area must render`);
      assert.doesNotMatch(area, FORBIDDEN, `${language}/${view}`);
    }
  }

  // 挂载后带真实推荐行：理由行同样不带效果承诺。
  for (const view of ["strategy", "contacts"] as const) {
    await t.test(`mounted ${view}`, async (sub) => {
    const mounted = await mount(
      sub,
      <IOrbitStrategy loadSnapshot={async () => strategyWithTokens(["日本"])} view={view} />,
    );
    await mounted.settle();
    const sections = mounted.root.root.findAll(
      (node) =>
        node.type === "section" &&
        ["next-events", "related-events"].includes(node.props?.["data-orbit-agent-strategy-section"]),
    );
    assert.ok(sections.length > 0);
    for (const section of sections) {
      const flat = (node: unknown): string =>
        typeof node === "string" ? node : (node as { children: unknown[] }).children.map(flat).join("");
      const text = flat(section);
      assert.match(text, /匹配你的目标/);
      assert.doesNotMatch(text, FORBIDDEN, view);
    }
    });
  }
});

/* ── W0009：「我的计划」的交互 ─────────────────────────────────────────── */

interface PlanCall {
  body: unknown;
  method: string;
  url: string;
}

/** 在 `mount` 之后替换 fetch：记录请求，按 `respond` 应答（`mount` 的 t.after 会还原）。 */
function routePlanFetch(respond: (call: PlanCall) => Promise<Response> | Response): PlanCall[] {
  const calls: PlanCall[] = [];
  (globalThis as { fetch: unknown }).fetch = async (input: unknown, init?: RequestInit) => {
    const call = {
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      method: (init?.method ?? "GET").toUpperCase(),
      url: String(input),
    };
    calls.push(call);
    return respond(call);
  };
  return calls;
}

function planNode(root: ReactTestRenderer, attribute: string, value: string) {
  return root.root.findAll((node) => typeof node.type === "string" && node.props?.[attribute] === value)[0]!;
}

function actionBox(root: ReactTestRenderer, itemId: string) {
  return planNode(root, "data-orbit-plan-action", itemId).findAll(
    (node) => node.type === "button" && node.props.role === "checkbox",
  )[0]!;
}

function flatText(node: unknown): string {
  if (typeof node === "string") return node;
  if (!node || typeof node !== "object") return "";
  return ((node as { children?: unknown[] }).children ?? []).map(flatText).join("");
}

function mountMyPlan(t: TestContext) {
  return mount(t, <IOrbitPlan guideEnabled initialSnapshot={planSnapshotFixture()} now={PLAN_NOW} />);
}

test("my plan: ticking an action is optimistic, PATCHes W0007 and prepends the server's log entry", async (t) => {
  const mounted = await mountMyPlan(t);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const calls = routePlanFetch(async (call) => {
    await gate;
    const item = { ...planSnapshotFixture().items[0]!, completedAt: "2026-09-28T03:00:00.000Z", status: "done" };
    return Response.json({
      data: {
        item,
        log: {
          ...planSnapshotFixture().log[1]!,
          createdAt: "2026-09-28T03:00:00.000Z",
          id: "log-server",
          itemId: "a-this-week",
        },
        replayed: false,
      },
      success: true,
    }, { status: call.method === "PATCH" ? 200 : 404 });
  });

  await act(async () => {
    actionBox(mounted.root, "a-this-week").props.onClick();
  });
  // 乐观：请求还没回来，勾已经打上、按钮暂时禁用。
  assert.equal(actionBox(mounted.root, "a-this-week").props["aria-checked"], true);
  assert.equal(actionBox(mounted.root, "a-this-week").props.disabled, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.method, "PATCH");
  assert.equal(calls[0]!.url, "/api/agent/plans/items/a-this-week");
  const body = calls[0]!.body as { change: unknown; idempotencyKey: unknown };
  assert.deepEqual(body.change, { op: "set_status", status: "done" });
  assert.equal(typeof body.idempotencyKey, "string");

  await act(async () => {
    release();
  });
  await mounted.settle();
  assert.equal(actionBox(mounted.root, "a-this-week").props["aria-checked"], true);
  assert.equal(actionBox(mounted.root, "a-this-week").props.disabled, false);
  // 服务端在同一事务里写的 auto 记录出现在进展记录最前。
  const log = mounted.root.root.findAll(
    (node) => typeof node.type === "string" && node.props?.["data-orbit-plan-log-entry"] !== undefined,
  );
  assert.equal(log[0]!.props["data-orbit-plan-log-entry"], "log-server");
  assert.equal(flatText(log[0]!).includes("完成「约一位老客户聊 20 分钟」"), true);
  // 阶段计数跟着变。
  assert.ok(flatText(mounted.root.toJSON()).includes("3 / 5 行动"));
});

test("my plan: a failed tick rolls that action back and says so", async (t) => {
  const mounted = await mountMyPlan(t);
  routePlanFetch(() =>
    Response.json(
      { error: { code: "CONFLICT", message: "状态已经变了" }, success: false },
      { status: 409 },
    ),
  );

  await act(async () => {
    actionBox(mounted.root, "a-this-week").props.onClick();
  });
  await mounted.settle();
  // 打勾失败 → 回到未勾（这一行仍在本周列表里）。
  assert.equal(actionBox(mounted.root, "a-this-week").props["aria-checked"], false);
  const alerts = mounted.root.root.findAll((node) => node.props?.role === "alert");
  assert.equal(alerts.length, 1);
  assert.ok(flatText(alerts[0]!).includes("没能保存，已恢复原状"));
  assert.ok(flatText(alerts[0]!).includes("状态已经变了"));
});

test("my plan: a manual progress note is POSTed and lands at the top of the log", async (t) => {
  const mounted = await mountMyPlan(t);
  const calls = routePlanFetch((call) =>
    Response.json(
      {
        data: {
          entry: { ...planSnapshotFixture().log[0]!, body: call.body && (call.body as { body: string }).body, id: "log-new" },
          replayed: false,
        },
        success: true,
      },
      { status: 201 },
    ),
  );

  const input = mounted.root.root.findAll((node) => node.type === "input" && node.props.id === "ir-p-log-input")[0]!;
  await act(async () => {
    input.props.onChange({ target: { value: "  约好了下周二通电话  " } });
  });
  const form = mounted.root.root.findAll((node) => node.type === "form")[0]!;
  let prevented = false;
  await act(async () => {
    form.props.onSubmit({ preventDefault: () => (prevented = true) });
  });
  await mounted.settle();

  assert.ok(prevented);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.method, "POST");
  assert.equal(calls[0]!.url, "/api/agent/plans/log");
  assert.equal((calls[0]!.body as { body: string }).body, "约好了下周二通电话");
  assert.equal(typeof (calls[0]!.body as { idempotencyKey: unknown }).idempotencyKey, "string");
  const first = mounted.root.root.findAll(
    (node) => typeof node.type === "string" && node.props?.["data-orbit-plan-log-entry"] !== undefined,
  )[0]!;
  assert.equal(first.props["data-orbit-plan-log-entry"], "log-new");
  assert.ok(flatText(first).includes("约好了下周二通电话"));
  // 输入框清空。
  assert.equal(
    mounted.root.root.findAll((node) => node.type === "input" && node.props.id === "ir-p-log-input")[0]!.props.value,
    "",
  );
});

test("my plan: the analysis and phase toggles open and close in place", async (t) => {
  const mounted = await mountMyPlan(t);
  const analysisToggle = mounted.root.root.findAll(
    (node) => node.type === "button" && node.props?.["data-orbit-plan-analysis-toggle"] !== undefined,
  )[0]!;
  await act(async () => {
    analysisToggle.props.onClick();
  });
  const analysis = mounted.root.root.findAll((node) => node.props?.["data-orbit-plan-analysis"] !== undefined);
  assert.equal(analysis.length, 1);
  assert.ok(flatText(analysis[0]!).includes("最大的风险："));

  const phaseHead = (key: string) =>
    mounted.root.root.findAll((node) => node.type === "button" && node.props?.["aria-controls"] === `ir-p-phase-${key}`)[0]!;
  await act(async () => {
    phaseHead("p2").props.onClick();
  });
  assert.equal(phaseHead("p2").props["aria-expanded"], true);
  assert.equal(phaseHead("p1").props["aria-expanded"], true);
  await act(async () => {
    phaseHead("p1").props.onClick();
  });
  assert.equal(phaseHead("p1").props["aria-expanded"], false);
});

test("the plan page is ready on first paint: its snapshot is read on the server", () => {
  assert.match(myPlanMarkup(), /data-orbit-iorbit-ready="true"/);
});

/* ── W0009 SC-05（RW-07）：有计划时推荐理由对应计划阶段 ───────────────────── */

test("with a plan, a recommended event linked to a plan phase reads 「对应你计划第 n 阶段：认识 ___」", async (t) => {
  const snapshot = planSnapshotFixture();
  snapshot.items = snapshot.items.map((item) => (item.id === "e-p1" ? { ...item, linkedEventId: "ev-1" } : item));
  const mounted = await mount(
    t,
    <IOrbitStrategy
      loadSnapshot={async () => strategyWithTokens(["开拓新市场"])}
      planReasons={planEventReasons(snapshot)}
    />,
  );
  await mounted.settle();

  const reasons = matchReasons(mounted.root);
  assert.equal(reasons.length, 1);
  assert.equal(reasons[0]!.props["data-orbit-iorbit-match-reason"], "plan");
  assert.equal(reasons[0]!.children.join(""), "对应你计划第 1 阶段：认识 能帮你引荐的行业前辈");
  assert.doesNotMatch(JSON.stringify(mounted.root.toJSON()), /匹配你的目标/);
});

test("with a plan that does not contain the event, the matched-words reason stays", async (t) => {
  const mounted = await mount(
    t,
    <IOrbitStrategy
      loadSnapshot={async () => strategyWithTokens(["日本"])}
      planReasons={planEventReasons(planSnapshotFixture())}
    />,
  );
  await mounted.settle();
  const reasons = matchReasons(mounted.root);
  assert.equal(reasons.length, 1);
  assert.equal(reasons[0]!.children.join(""), "匹配你的目标：『日本』");
});

test("my plan: retrying a note after a lost response reuses the idempotency key → exactly one entry", async (t) => {
  const mounted = await mountMyPlan(t);
  // 服务端按幂等键存：第一次写入成功但响应在网络上丢了；重试同一个键回放第一次的结果。
  const stored = new Map<string, Record<string, unknown>>();
  let lose = true;
  const calls = routePlanFetch((call) => {
    const { body, idempotencyKey } = call.body as { body: string; idempotencyKey: string };
    if (!stored.has(idempotencyKey)) {
      stored.set(idempotencyKey, { ...planSnapshotFixture().log[0]!, body, id: `log-${stored.size + 1}`, idempotencyKey });
    }
    if (lose) {
      lose = false;
      throw new TypeError("Failed to fetch");
    }
    return Response.json({ data: { entry: stored.get(idempotencyKey), replayed: true }, success: true }, { status: 201 });
  });

  const input = () => mounted.root.root.findAll((node) => node.type === "input" && node.props.id === "ir-p-log-input")[0]!;
  const submit = async () => {
    const form = mounted.root.root.findAll((node) => node.type === "form")[0]!;
    await act(async () => {
      form.props.onSubmit({ preventDefault: () => undefined });
    });
    await mounted.settle();
  };
  await act(async () => {
    input().props.onChange({ target: { value: "拿到了第一家的试用意向" } });
  });
  await submit();
  // 第一次：客户端看到网络错误，文字保留，提示失败。
  assert.equal(input().props.value, "拿到了第一家的试用意向");
  assert.ok(mounted.root.root.findAll((node) => node.props?.role === "alert").length > 0);
  await submit();

  assert.equal(calls.length, 2);
  const [first, second] = calls.map((call) => (call.body as { idempotencyKey: string }).idempotencyKey);
  assert.ok(first);
  assert.equal(second, first, "the retry must reuse the same idempotency key");
  assert.equal(stored.size, 1, "the server holds exactly one entry");
  const entries = mounted.root.root.findAll(
    (node) => typeof node.type === "string" && node.props?.["data-orbit-plan-log-entry"] === "log-1",
  );
  assert.equal(entries.length, 1);
  assert.equal(input().props.value, "");

  // 成功之后再记一条：换新键。
  await act(async () => {
    input().props.onChange({ target: { value: "又约到一位" } });
  });
  await submit();
  assert.notEqual((calls[2]!.body as { idempotencyKey: string }).idempotencyKey, first);
});

test("my plan: editing the note text after a failure starts a new submission key", async (t) => {
  const mounted = await mountMyPlan(t);
  const calls = routePlanFetch(() => {
    throw new TypeError("Failed to fetch");
  });
  const input = () => mounted.root.root.findAll((node) => node.type === "input" && node.props.id === "ir-p-log-input")[0]!;
  const submit = async () => {
    await act(async () => {
      mounted.root.root.findAll((node) => node.type === "form")[0]!.props.onSubmit({ preventDefault: () => undefined });
    });
    await mounted.settle();
  };
  await act(async () => {
    input().props.onChange({ target: { value: "第一版" } });
  });
  await submit();
  await act(async () => {
    input().props.onChange({ target: { value: "第二版" } });
  });
  await submit();
  const keys = calls.map((call) => (call.body as { idempotencyKey: string }).idempotencyKey);
  assert.equal(keys.length, 2);
  assert.notEqual(keys[0], keys[1]);
});

test("the plan checkboxes keep a 44×44 hit area and draw the 15px box with a pseudo-element", () => {
  const flat = IORBIT_STYLES.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").join(" ");
  for (const name of ["ir-p-box", "ir-m-plan-box"]) {
    const base = [...flat.matchAll(/([^{}]+)\{([^}]*)\}/g)].find(
      (rule) =>
        rule[1]!.split(",").some((selector) => new RegExp(`\\.btn\\.${name}$`).test(selector.trim())) &&
        /width:\s*44px/.test(rule[2]!),
    );
    assert.ok(base, `.btn.${name} must declare a 44px hit area`);
    assert.match(base![2]!, /height:\s*44px/);
    assert.match(base![2]!, /min-width:\s*44px/);
    assert.match(base![2]!, /min-height:\s*44px/);
    assert.match(base![2]!, /background:\s*transparent/);
    // 可见的方框在 ::before 上，15px。
    assert.match(flat, new RegExp(`\\.btn\\.${name}::before[^{]*\\{[^}]*width: 15px; height: 15px;`));
  }
});

/* ── W0014：「我的计划」的示例模式 ─────────────────────────────────────── */

const PLAN_GUIDE = {
  bannerCollapsed: false,
  completed: 1,
  confirmedContacts: 3,
  nextStep: "goal" as const,
  steps: { contacts: true, goal: false, plan: false },
};

test("W0014 my plan (demo): the persona's plan with banner, demo tags, this week, phases, needs and log", () => {
  // 即使误传了真实快照，示例期间也只渲染示例人物的计划。
  const html = renderToStaticMarkup(
    <IOrbitPlan guide={PLAN_GUIDE} guideEnabled initialSnapshot={planSnapshotFixture()} />,
  );
  const body = bodyOf(html);
  assert.match(body, /data-orbit-guide-demo-banner/);
  assert.ok(body.includes("完成引导后，这里会是你自己的计划。"));
  assert.match(body, /data-orbit-guide-demo="on"/);
  assert.match(body, /data-orbit-plan-goal="true"[^>]*>本季度找到 5 家日本中小企业试用我们的 AI 会议纪要，先从东京开始。<span class="ir-demo-tag"/);
  assert.ok(!body.includes("三个月内找到 5 家日本中小企业试用我们的产品"), "no real snapshot content");
  // 周进度：示例计划 8 天前生成，今天是第 2 周。
  assert.ok(body.includes("第 2 周 / 共 12 周"));
  // 本周：逾期 1 周的一条 + 本周的 4 条。
  const thisWeek = body.split("data-orbit-plan-this-week")[1]!.split("ir-p-label")[0]!;
  for (const copy of ["请中村惠推荐 3 家试点会员企业", "和王砚见面，请他介绍 IT 部门的铃木", "约佐藤美咲聊 20 分钟试用", "发 1 分钟演示视频"]) {
    assert.ok(thisWeek.includes(copy), `this week: ${copy}`);
  }
  assert.match(thisWeek, /data-orbit-plan-overdue="1"/);
  assert.ok(!thisWeek.includes("整理 3 家目标企业的 IT 痛点"), "done actions are not in this week");
  // 阶段：三段，当前是第 1 段。
  assert.equal((body.match(/data-orbit-plan-phase="p\d"/g) ?? []).length, 3);
  assert.match(body, /class="ir-p-phase ir-p-phase-cur" data-orbit-plan-phase="p1"/);
  // 人脉需求：名字来自示例人脉（demo: id），每个人名旁有「示例」角标。
  for (const name of ["佐藤美咲", "铃木健", "中村惠", "山田太郎", "林志远"]) {
    assert.ok(body.includes(`<b>${name}<span class="ir-demo-tag"`), `demo person with tag: ${name}`);
  }
  assert.match(body, /href="\/app\/contacts\/demo%3Asato-misaki"/);
  // 进展记录。
  assert.ok(body.includes("和王砚通了电话：IT 部门的铃木才是系统采购的决策人"));
  assert.ok(body.includes("与 佐藤美咲 建立联系（「中小企业 IT 负责人」）"));
  assert.ok(body.includes("生成计划 v1"));
});

test("W0014 my plan (demo) is localised with the interface language", () => {
  const html = renderToStaticMarkup(
    <OrbitLanguageProvider initialLanguage="en">
      <IOrbitPlan guide={PLAN_GUIDE} guideEnabled initialSnapshot={null} />
    </OrbitLanguageProvider>,
  );
  assert.ok(html.includes("Get 5 Japanese SMEs trialling our AI meeting notes this quarter, starting in Tokyo."));
  assert.ok(html.includes("Week 2 of 12"));
  assert.ok(html.includes("Sato Misaki"));
});

test("W0014 my plan: without a guide the screen is unchanged (no banner, tag or persona)", () => {
  const withNull = renderToStaticMarkup(<IOrbitPlan guide={null} guideEnabled initialSnapshot={planSnapshotFixture()} now={PLAN_NOW} />);
  assert.equal(withNull, myPlanMarkup());
  for (const leak of ["data-orbit-guide-demo", "ir-demo-", "王砚", "示例预览"]) {
    assert.ok(!bodyOf(withNull).includes(leak), `demo content leaked: ${leak}`);
  }
});

test("W0014 my plan (demo): no plan / ledger requests on mount; ticking and noting open the guard instead", async (t) => {
  const calls: string[] = [];
  // 拦截层用弹窗无障碍 hook（读 document）；与首页测试同一最小桩。
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { activeElement: null, addEventListener() {}, documentElement: { lang: "zh" }, removeEventListener() {} },
  });
  t.after(() => {
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else Reflect.deleteProperty(globalThis, "document");
  });
  const mounted = await mount(
    t,
    <IOrbitPlan guide={PLAN_GUIDE} guideEnabled initialSnapshot={null} />,
    (async (input: unknown) => {
      calls.push(String(input));
      return Response.json({ success: false }, { status: 404 });
    }) as typeof fetch,
  );
  await mounted.settle();
  const guard = () => mounted.root.root.findAll((node) => node.props?.["data-orbit-guide-demo-intercept"] !== undefined)[0] ?? null;
  const dismiss = async () => {
    await act(async () => {
      guard()!
        .findAll((node) => node.type === "button" && node.props?.["data-orbit-guide-demo-dismiss"] === true)[0]!
        .props.onClick();
    });
    assert.equal(guard(), null);
  };

  // 打勾：弹拦截层，勾不变。
  await act(async () => {
    actionBox(mounted.root, "demo-plan-a-wang").props.onClick();
  });
  assert.ok(guard(), "ticking opens the demo guard");
  assert.ok(flatText(guard()!).includes("你自己的计划"));
  assert.equal(actionBox(mounted.root, "demo-plan-a-wang").props["aria-checked"], false);
  await dismiss();

  // 记下进展：弹拦截层，不写入。
  const input = mounted.root.root.findAll((node) => node.type === "input" && node.props.id === "ir-p-log-input")[0]!;
  await act(async () => {
    input.props.onChange({ target: { value: "约好了下周二通电话" } });
  });
  let prevented = false;
  await act(async () => {
    mounted.root.root.findAll((node) => node.type === "form")[0]!.props.onSubmit({ preventDefault: () => (prevented = true) });
  });
  assert.ok(prevented);
  assert.ok(guard(), "saving a note opens the demo guard");
  assert.ok(flatText(guard()!).includes("你自己的进展记录"));
  await dismiss();

  await mounted.settle();
  for (const endpoint of ["/api/agent/plans", "/api/agent/ledger", "/api/ai/conversations"]) {
    assert.deepEqual(calls.filter((url) => url.startsWith(endpoint)), [], `demo plan must not call ${endpoint}`);
  }
  // 剩下的只有全站顶栏自己的账号读取（共用外壳，与 W0004 的口径相同）。
  assert.deepEqual(calls.filter((url) => url !== "/api/account/me"), []);
});

/* ── W0012：重新分析提示、到期回顾、@ 提及 ─────────────────────────────── */

function mountTrackedPlan(
  t: TestContext,
  tracking: { currentGoal: string | null; quotaRemaining: number | null; periodContacts?: null | { total: number; byEvent: Array<{ eventId: string; title: string | null; count: number }> } },
  now: Date = PLAN_NOW,
) {
  return mount(
    t,
    <IOrbitPlan
      guideEnabled
      initialSnapshot={planSnapshotFixture()}
      now={now}
      tracking={{ periodContacts: null, ...tracking }}
    />,
  );
}

function byAttr(root: ReactTestRenderer, attribute: string) {
  return root.root.findAll((node) => typeof node.type === "string" && node.props?.[attribute] !== undefined);
}

test("W0012 my plan: the header shows this month's remaining re-analyses and disables at 0", async (t) => {
  const one = await mountTrackedPlan(t, { currentGoal: null, quotaRemaining: 1 });
  const button = byAttr(one.root, "data-orbit-plan-reanalyse")[0]!;
  assert.equal(flatText(button), "重新分析 · 本月剩 1 次");
  assert.equal(button.props.disabled, false);
  // 在计划上：没有触发，不出提示条。
  assert.equal(byAttr(one.root, "data-orbit-plan-reanalysis-prompt").length, 0);
  assert.equal(byAttr(one.root, "data-orbit-plan-review").length, 0);
});

test("W0012 my plan: with this month's re-analysis used the header button is disabled", async (t) => {
  const none = await mountTrackedPlan(t, { currentGoal: null, quotaRemaining: 0 });
  const used = byAttr(none.root, "data-orbit-plan-reanalyse")[0]!;
  assert.equal(flatText(used), "重新分析 · 本月剩 0 次");
  assert.equal(used.props.disabled, true);
});

test("W0012 my plan: a changed goal prompts (only prompts) and re-analysis POSTs once, then reloads", async (t) => {
  const mounted = await mountTrackedPlan(t, { currentGoal: "一年内找到 3 家代理商", quotaRemaining: 1 });
  const prompt = byAttr(mounted.root, "data-orbit-plan-reanalysis-prompt")[0]!;
  assert.ok(flatText(prompt).includes("要不要重新分析？"));
  assert.deepEqual(byAttr(mounted.root, "data-orbit-plan-trigger").map((node) => node.props["data-orbit-plan-trigger"]), ["goal_changed"]);

  const calls = routePlanFetch((call) => {
    if (call.url === "/api/agent/plans/reanalyze") {
      return Response.json(
        { data: { planId: "plan:v2", quota: { limit: 1, month: "2026-09", remaining: 0, used: 1 }, replayed: false, version: 2 }, success: true },
        { status: 201 },
      );
    }
    if (call.url === "/api/agent/plans/current") {
      return Response.json({ data: { ...planSnapshotFixture(), plan: { ...planSnapshotFixture().plan, id: "plan:v2", version: 2 } }, success: true });
    }
    return Response.json({ success: false }, { status: 404 });
  });
  // 提示本身不发请求（不自动重做）。
  assert.equal(calls.length, 0);
  await act(async () => {
    byAttr(mounted.root, "data-orbit-plan-reanalyse-confirm")[0]!.props.onClick();
  });
  await mounted.settle();
  const posts = calls.filter((call) => call.url === "/api/agent/plans/reanalyze");
  assert.equal(posts.length, 1);
  const body = posts[0]!.body as { basePlanId: string; origin: string; idempotencyKey: string; locale: string };
  assert.equal(body.basePlanId, "plan:w0009");
  assert.equal(body.origin, "reanalysis");
  assert.equal(typeof body.idempotencyKey, "string");
  // W0021：重新分析之后只重读计划一次（计划页带进展记录的完整视图）。
  assert.equal(calls.filter((call) => call.url === "/api/agent/plans/current").length, 1);
  assert.ok(flatText(mounted.root.toJSON()).includes("计划 v2"));
  assert.equal(flatText(byAttr(mounted.root, "data-orbit-plan-reanalyse")[0]!), "重新分析 · 本月剩 0 次");
  assert.equal(byAttr(mounted.root, "data-orbit-plan-reanalysis-prompt").length, 0);
});

test("W0012 my plan: 先不用 hides the prompt", async (t) => {
  const dismissed = await mountTrackedPlan(t, { currentGoal: "一年内找到 3 家代理商", quotaRemaining: 1 });
  await act(async () => {
    byAttr(dismissed.root, "data-orbit-plan-reanalyse-dismiss")[0]!.props.onClick();
  });
  assert.equal(byAttr(dismissed.root, "data-orbit-plan-reanalysis-prompt").length, 0);
});

test("W0012 my plan: a quota conflict keeps the plan and says so", async (t) => {
  const mounted = await mountTrackedPlan(t, { currentGoal: "一年内找到 3 家代理商", quotaRemaining: 1 });
  routePlanFetch(() =>
    Response.json({ error: { code: "CONFLICT", context: { reason: "REANALYSIS_QUOTA_EXHAUSTED" }, message: "本月已用完" }, success: false }, { status: 409 }),
  );
  await act(async () => {
    byAttr(mounted.root, "data-orbit-plan-reanalyse-confirm")[0]!.props.onClick();
  });
  await mounted.settle();
  const alert = byAttr(mounted.root, "data-orbit-plan-followup-error")[0]!;
  assert.ok(flatText(alert).includes("原计划没有变化"));
  assert.ok(flatText(mounted.root.toJSON()).includes("计划 v1"));
});

test("W0012 my plan: an ended plan shows the review first, then a free next plan", async (t) => {
  // 12 周从 9/14 起，12/6 结束；12/10 已到期。
  const mounted = await mountTrackedPlan(
    t,
    {
      currentGoal: null,
      periodContacts: { byEvent: [{ count: 2, eventId: "event:founders-night", title: null }], total: 6 },
      quotaRemaining: 0,
    },
    new Date("2026-12-10T03:00:00.000Z"),
  );
  const review = byAttr(mounted.root, "data-orbit-plan-review")[0]!;
  const text = flatText(review);
  assert.ok(text.includes("计划到期回顾"));
  assert.ok(text.includes("完成了 2 / 6 件行动"));
  assert.ok(text.includes("新认识 6 位，其中 1 位已建立联系"));
  assert.ok(text.includes("在这些活动认识：「东京创业者交流之夜」2 位"));
  assert.ok(text.includes("不占本月的重新分析次数"));
  // 到期后不再提示「要不要重新分析」，报头的重新分析也不可点（走下一份）。
  assert.equal(byAttr(mounted.root, "data-orbit-plan-reanalysis-prompt").length, 0);
  assert.equal(byAttr(mounted.root, "data-orbit-plan-reanalyse")[0]!.props.disabled, true);

  const calls = routePlanFetch((call) =>
    call.url === "/api/agent/plans/reanalyze"
      ? Response.json({ data: { planId: "plan:next", quota: { limit: 1, month: "2026-12", remaining: 0, used: 1 }, replayed: false, version: 2 }, success: true }, { status: 201 })
      : Response.json({ data: planSnapshotFixture(), success: true }),
  );
  const next = byAttr(mounted.root, "data-orbit-plan-next")[0]!;
  assert.equal(next.props.disabled, false);
  await act(async () => {
    next.props.onClick();
  });
  await mounted.settle();
  const post = calls.find((call) => call.url === "/api/agent/plans/reanalyze")!;
  assert.equal((post.body as { origin: string }).origin, "next_plan");
});

test("W0012 my plan: a note @-mentions a contact and an event as structured fields and reloads the plan", async (t) => {
  const mounted = await mountTrackedPlan(t, { currentGoal: null, quotaRemaining: 1 });
  const calls = routePlanFetch((call) =>
    call.url === "/api/agent/plans/log"
      ? Response.json(
          {
            data: {
              entry: {
                ...planSnapshotFixture().log[0]!,
                body: "在交流之夜和高木聊了",
                id: "log-mention",
                linkedContactIds: ["contact:c2"],
                linkedEventId: "event:founders-night",
              },
              replayed: false,
            },
            success: true,
          },
          { status: 201 },
        )
      : Response.json({ data: planSnapshotFixture(), success: true }),
  );
  // 默认收起，只有「@ 提及」按钮。
  assert.equal(byAttr(mounted.root, "data-orbit-plan-mention").length, 0);
  await act(async () => {
    byAttr(mounted.root, "data-orbit-plan-mention-toggle")[0]!.props.onClick();
  });
  const options = byAttr(mounted.root, "data-orbit-plan-mention").map((node) => [node.props["data-orbit-plan-mention-kind"], flatText(node)]);
  // 名字已知的联系人（生成快照里的高木一郎）+ 计划里的两场活动。
  assert.deepEqual(options, [
    ["contact", "@高木一郎"],
    ["event", "@中小企业 DX 推进研讨会"],
    ["event", "@东京创业者交流之夜"],
  ]);
  const pick = (id: string) => byAttr(mounted.root, "data-orbit-plan-mention").find((node) => node.props["data-orbit-plan-mention"] === id)!;
  await act(async () => {
    pick("contact:c2").props.onClick();
    pick("event:dx-seminar").props.onClick();
  });
  await act(async () => {
    pick("event:founders-night").props.onClick(); // 一条记录最多一个活动：换成这一场
  });
  assert.equal(pick("contact:c2").props["aria-pressed"], true);
  assert.equal(pick("event:founders-night").props["aria-pressed"], true);
  assert.equal(pick("event:dx-seminar").props["aria-pressed"], false);

  const input = mounted.root.root.findAll((node) => node.type === "input" && node.props.id === "ir-p-log-input")[0]!;
  await act(async () => {
    input.props.onChange({ target: { value: "在交流之夜和高木聊了" } });
  });
  await act(async () => {
    mounted.root.root.findAll((node) => node.type === "form")[0]!.props.onSubmit({ preventDefault: () => undefined });
  });
  await mounted.settle();
  const post = calls.find((call) => call.url === "/api/agent/plans/log")!;
  assert.deepEqual(post.body, {
    body: "在交流之夜和高木聊了",
    idempotencyKey: (post.body as { idempotencyKey: string }).idempotencyKey,
    linkedContactIds: ["contact:c2"],
    linkedEventId: "event:founders-night",
  });
  // @ 了人：服务端已把 TA 标为已建立联系，重新读计划。
  assert.ok(calls.some((call) => call.url === "/api/agent/plans/current"));
});

test("W0012 my plan: manual log lines show their structured mentions", () => {
  const snapshot = planSnapshotFixture();
  snapshot.log[0] = { ...snapshot.log[0]!, linkedContactIds: ["contact:c2"], linkedEventId: "event:founders-night" };
  const html = renderToStaticMarkup(<IOrbitPlan guideEnabled initialSnapshot={snapshot} now={PLAN_NOW} />);
  assert.match(html, /data-orbit-plan-log-mentions="true">@高木一郎 @东京创业者交流之夜</);
});

/* ── W0021 SC-W0021-03：计划页冷启动与写后的请求次数 ──────────────────── */

test("W0021 my plan: the first frame comes from SSR — the client reads no plan and the candidates once; a tick re-reads nothing", async (t) => {
  const calls: PlanCall[] = [];
  const recording = (async (input: unknown, init?: RequestInit) => {
    calls.push({ body: undefined, method: (init?.method ?? "GET").toUpperCase(), url: String(input) });
    if (String(input) === "/api/agent/plans/candidates") {
      return Response.json({ data: { candidates: [], contactCount: 0, pendingByNeed: {} }, success: true });
    }
    return Response.json({ success: false }, { status: 404 });
  }) as typeof fetch;
  const mounted = await mount(t, <IOrbitPlan guideEnabled initialSnapshot={planSnapshotFixture()} now={PLAN_NOW} />, recording);
  await mounted.settle();
  assert.equal(calls.filter((call) => call.url.startsWith("/api/agent/plans/current")).length, 0);
  assert.equal(calls.filter((call) => call.url === "/api/agent/plans/candidates" && call.method === "GET").length, 1);

  const after = routePlanFetch(() => {
    const item = { ...planSnapshotFixture().items[0]!, completedAt: "2026-09-28T03:00:00.000Z", status: "done" };
    return Response.json({ data: { item, log: null, replayed: false }, success: true });
  });
  await act(async () => {
    actionBox(mounted.root, "a-this-week").props.onClick();
  });
  await mounted.settle();
  assert.deepEqual(after.map((call) => `${call.method} ${call.url}`), ["PATCH /api/agent/plans/items/a-this-week"]);
});

/* ── W0021 SC-W0021-05：投影快照渲染出的页面与完整快照一致 ─────────────── */

test("W0021: the projected plan snapshot renders the same plan page, week summary and event reasons as the full one", () => {
  const full = planSnapshotFixture();
  const projected = {
    items: full.items.map(toPlanViewItem),
    log: full.log.map(toPlanViewLogEntry),
    plan: toPlanView(full.plan),
  };
  const render = (snapshot: typeof projected) =>
    renderToStaticMarkup(
      <OrbitLanguageProvider initialLanguage="zh">
        <IOrbitPlan guideEnabled initialSnapshot={snapshot} now={PLAN_NOW} />
      </OrbitLanguageProvider>,
    );
  assert.equal(render(projected), render(full));
  // 首页的「本周推进」不读进展记录：没有 log 的首页视图给出同样的本周推进。
  for (const lang of ["zh", "en"] as const) {
    assert.deepEqual(buildPlanWeekSummary({ ...projected, log: [] }, PLAN_NOW, lang, []), buildPlanWeekSummary(full, PLAN_NOW, lang, []));
  }
  assert.deepEqual(planEventReasons({ ...projected, log: [] }), planEventReasons(full));
});

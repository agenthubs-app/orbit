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
 *   4. 行为：4 周手风琴开合、「✦ 让 iOrbit 优化计划 →」把提示词带进 `?q=`、
 *      `?view=contacts` 切屏、每行 CTA 按真实 operationType 变化
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { IOrbitActions } from "../../app/(app)/app/agent/iorbit-0918/iorbit-actions";
import {
  IOrbitPlan,
  IORBIT_PLAN_OPTIMIZE_PROMPT,
} from "../../app/(app)/app/agent/iorbit-0918/iorbit-plan";
import { IOrbitStrategy } from "../../app/(app)/app/agent/iorbit-0918/iorbit-strategy";
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

/* ── 2. SSR 结构 ───────────────────────────────────────────────────────── */

function actionsMarkup(viewModel = ACTIONS_VM): string {
  return renderToStaticMarkup(<IOrbitActions viewModel={viewModel} />);
}

test("every iOrbit sibling screen renders inside the shared double page scope", () => {
  for (const html of [
    actionsMarkup(),
    renderToStaticMarkup(<IOrbitPlan now={new Date(2026, 8, 23)} />),
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

test("the plan screen ships every design block from lines 429–501", () => {
  const html = renderToStaticMarkup(<IOrbitPlan now={new Date(2026, 8, 23)} />);

  for (const copy of [
    "执行计划",
    "← 返回概览",
    "把目标拆成清晰的行动节奏，帮助你逐步推进。",
    "本周重点",
    "完成度",
    "4 周推进节奏",
    "第 1 周",
    "9/21 – 9/27",
    "本周目标",
    "关键联系人",
    "关键活动 / 产出",
    "✦ 需要时可以继续交给 iOrbit 优化计划",
    "✦ 让 iOrbit 优化计划 →",
    "计划概览",
    "当前完成度",
    "本周日程",
    "回到日历 →",
  ]) {
    assert.ok(html.includes(copy), `design copy missing from plan: ${copy}`);
  }
  // 496：回到日历 → home。
  assert.match(html, /class="ir-aside-btn" href="\/app\/agent"/);
  // 无来源的四周内容沿用「等 W4」（「审阅修订」20）。
  assert.ok(html.includes("随 W4 策略能力上线"));
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
    ["plan", renderToStaticMarkup(<IOrbitPlan now={new Date(2026, 8, 23)} />)],
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
    renderToStaticMarkup(<IOrbitPlan now={new Date(2026, 8, 23)} />),
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

// 修订轮 2（Critical 1）：作用域顶部的 `a { color:#3B3F7A }` / `a:hover { color:#0E1225 }`
// 会压掉任何落成 <a> 的行。plan 的本周重点行在修订轮 1 变成了链接，标题因此从设计的
// #0E1225 变成 #3B3F7A 并多出一个设计没有的 hover——而 plan 的像素跑在空账本上，
// 一行都没渲染，所以没被截出来。这条用例把「凡是当 <a> 用的 ir-* 类都必须自己管住字色」
// 变成结构断言，下一次 linkify 不会再静默回归。
test("every ir-* class the screens put on an <a> owns its colour", () => {
  const flat = IORBIT_STYLES.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").join(" ");
  const linkClasses = new Set<string>();
  for (const file of [
    "app/(app)/app/agent/iorbit-0918/iorbit-actions.tsx",
    "app/(app)/app/agent/iorbit-0918/iorbit-plan.tsx",
    "app/(app)/app/agent/iorbit-0918/iorbit-strategy.tsx",
  ]) {
    const source = readFileSync(join(projectRoot, file), "utf8");
    for (const tag of source.matchAll(/<a\b[^>]*>/g)) {
      const className = tag[0].match(/className="([^"]+)"/)?.[1];
      if (!className) continue;
      for (const part of className.split(/\s+/)) {
        if (part.startsWith("ir-")) linkClasses.add(part);
      }
    }
  }

  assert.ok(linkClasses.has("ir-task-row"), "the plan row is the class this test exists for");
  assert.ok(linkClasses.size >= 8, `expected the screens' link classes, found ${linkClasses.size}`);

  const uncovered: string[] = [];
  for (const className of [...linkClasses].sort()) {
    const base = flat.match(new RegExp(`\\.${className}(?![-a-z])[^:{,]*\\{([^}]*)\\}`));
    const baseHasColour = Boolean(base && /(^|;)\s*color\s*:/.test(base[1]!));
    // `:hover` 可能出现在自己的规则里，也可能在共享的 `color: inherit` 中和块里；
    // 两处都要看（`String.match` 只给第一处，所以走 matchAll）。
    const hoverHasColour = [
      ...flat.matchAll(new RegExp(`[^{}]*\\.${className}(?![-a-z]):hover[^{]*\\{([^}]*)\\}`, "g")),
    ].some((rule) => /color\s*:/.test(rule[1]!));
    if (!baseHasColour || !hoverHasColour) {
      uncovered.push(`${className} (base colour: ${baseHasColour}, hover colour: ${hoverHasColour})`);
    }
  }
  assert.deepEqual(
    uncovered,
    [],
    `these classes sit on an <a> but let the scope's a / a:hover win:\n  ${uncovered.join("\n  ")}`,
  );
});

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

// 修订轮 1（Important 4）：plan 的每行落点（followup 的 operationHref / 账本 ?entry=）
// 与本周日程每行的落点都不得丢。
test("the plan rows keep the per-row navigation the old screen had", async (t) => {
  const mounted = await mount(
    t,
    <IOrbitPlan loadSnapshot={async () => SNAPSHOT} now={new Date(2026, 8, 23)} />,
  );
  await mounted.settle();

  const taskRows = mounted.root.root.findAll(
    (node) => node.props?.className === "ir-task-row",
  );
  assert.ok(taskRows.length > 0);
  assert.equal(taskRows[0]!.type, "a");
  assert.equal(taskRows[0]!.props.href, "/app/contacts/c-1");

  const scheduleLines = mounted.root.root.findAll(
    (node) => node.props?.className === "ir-aside-line",
  );
  assert.ok(scheduleLines.length > 0);
  assert.equal(scheduleLines[0]!.type, "a");
  assert.equal(scheduleLines[0]!.props.href, "/app/schedule");

  // 审计吃的标记（旧屏有，第一版丢了）。
  assert.ok(
    mounted.root.root.findAll(
      (node) => node.props?.["data-orbit-agent-plan-overview"] !== undefined,
    ).length > 0,
  );
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

async function mount(t: TestContext, element: React.ReactElement): Promise<Mounted> {
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
    value: async () =>
      ({
        json: async () => ({ data: { entries: [] }, success: true }),
        ok: true,
      }) as never,
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

function weekHead(root: ReactTestRenderer, no: number) {
  return root.root.findAll(
    (node) => node.type === "button" && node.props?.["data-orbit-iorbit-plan-week"] === no,
  )[0]!;
}

test("the four-week accordion opens and closes, and only one week is open at a time", async (t) => {
  const mounted = await mount(
    t,
    <IOrbitPlan
      loadSnapshot={async () => SNAPSHOT}
      now={new Date(2026, 8, 23)}
    />,
  );

  // 设计 459：第一周默认展开。
  assert.equal(weekHead(mounted.root, 1).props["aria-expanded"], true);
  assert.equal(weekHead(mounted.root, 2).props["aria-expanded"], false);
  assert.equal(
    mounted.root.root.findAll((node) => node.props?.className === "ir-week-body").length,
    1,
  );

  await act(async () => {
    weekHead(mounted.root, 3).props.onClick();
  });
  assert.equal(weekHead(mounted.root, 1).props["aria-expanded"], false);
  assert.equal(weekHead(mounted.root, 3).props["aria-expanded"], true);
  assert.equal(
    mounted.root.root.findAll((node) => node.props?.className === "ir-week-body").length,
    1,
  );

  // 再点一次同一周 → 全部折叠。
  await act(async () => {
    weekHead(mounted.root, 3).props.onClick();
  });
  assert.equal(
    mounted.root.root.findAll((node) => node.props?.className === "ir-week-body").length,
    0,
  );
});

test("the plan CTA hands a prompt to the chat screen's ask, not a bare route", () => {
  const html = renderToStaticMarkup(<IOrbitPlan now={new Date(2026, 8, 23)} />);
  const href = html.match(
    /data-orbit-iorbit-plan-optimize="[^"]*" href="([^"]+)"/,
  )?.[1];

  assert.ok(href, "the optimize CTA must carry an href");
  assert.ok(href!.startsWith("/app/agent?q="));
  assert.equal(
    decodeURIComponent(href!.slice("/app/agent?q=".length)),
    IORBIT_PLAN_OPTIMIZE_PROMPT.zh,
  );
});

test("plan and strategy reach ready only once every source has answered", async (t) => {
  const pending = renderToStaticMarkup(<IOrbitPlan now={new Date(2026, 8, 23)} />);
  assert.match(pending, /data-orbit-iorbit-ready="false"/);

  const mounted = await mount(
    t,
    <IOrbitPlan loadSnapshot={async () => SNAPSHOT} now={new Date(2026, 8, 23)} />,
  );
  await mounted.settle();
  assert.equal(
    mounted.root.root.findAll(
      (node) => node.props?.["data-orbit-iorbit-ready"] === "true",
    ).length,
    1,
    "plan must flip the readiness flag once snapshot and ledger have both answered",
  );
});

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

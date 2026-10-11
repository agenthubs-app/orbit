/**
 * iOrbit 任务 5：建议与行动屏（原为四屏：建议与行动 / 执行计划 / 工作策略 / 联系人建议）。
 *
 * R25：执行计划（「我的计划」，v1）与工作策略 / 联系人建议两屏随 v1 计划界面删除（计划在 Task › プラン），
 * 它们的用例一并删除；这里只剩建议与行动屏、iorbit-model 的纯函数和共享皮肤的断言。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { IOrbitActions } from "../../app/(app)/app/agent/iorbit-0918/iorbit-actions";
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

// iOrbit 合并前终审 3：这个表头原由（R25 已删除的）旧计划页服务端渲染。原实现用运行时
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

test("`?view=` resolves to exactly two screens", () => {
  assert.equal(iorbitStrategyView(undefined), "strategy");
  assert.equal(iorbitStrategyView("strategy"), "strategy");
  assert.equal(iorbitStrategyView("contacts"), "contacts");
  assert.equal(iorbitStrategyView(["contacts", "strategy"]), "contacts");
  assert.equal(iorbitStrategyView("anything-else"), "strategy");
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

test("the remaining iOrbit sibling screen files only author btn ir-* buttons", () => {
  for (const file of [
    "app/(app)/app/agent/iorbit-0918/iorbit-actions.tsx",
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


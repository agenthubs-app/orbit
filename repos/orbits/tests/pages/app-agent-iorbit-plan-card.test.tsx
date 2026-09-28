/**
 * W0008 SC-01（组件）：iOrbit 对话里的计划回答卡片。
 *
 * - 已保存的计划 → 卡片视图模型（`planCardViewFromSnapshot`），不是第一份计划生成的返回 null；
 * - 已完成的卡片按「结论在前」的顺序出现各块，保存卡片链接到 /app/agent/plan；
 * - `reveal`：假时钟推进，先出结论／关键数字／阶段骨架（其余阶段骨架或排队中），逐段补齐，
 *   最后才出现其余各块与「已保存为你的计划 v1」；
 * - 阶段细节折叠；壳收到 `initialPlanCard` 直接落在对话，线程以固定问题 + 卡片开头；
 * - 本卡片的按钮都是 `btn ir-pc-*`，样式整段中和 `.btn` 基类。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";

import { IOrbitPlanCard } from "../../app/(app)/app/agent/iorbit-0918/iorbit-plan-card";
import {
  PLAN_REVEAL_STEP_MS,
  planCardViewFromSnapshot,
  type IOrbitPlanCardView,
} from "../../app/(app)/app/agent/iorbit-0918/iorbit-plan-card-model";
import { IOrbitShell, IORBIT_STYLES } from "../../app/(app)/app/agent/iorbit-0918/iorbit-shell";
import { createOrbitAgentStarterViewModel } from "../../app/(app)/app/orbit-agent-route-view-model";
import type { PlanSnapshot } from "../../features/plans/contract";
import { savedBootstrapPlan } from "../support/plan-bootstrap-fixture";
import { planInput } from "../support/plan-fixture";

const savedPlan = savedBootstrapPlan;

async function cardView(horizon?: "month" | "quarter" | "year"): Promise<IOrbitPlanCardView> {
  const view = planCardViewFromSnapshot(await savedPlan(horizon));
  assert.ok(view);
  return view;
}

const text = (node: ReactTestInstance): string =>
  node.children.map((child) => (typeof child === "string" ? child : text(child))).join("");
const byData = (root: ReactTestRenderer, attribute: string, value?: string) =>
  root.root.findAll(
    (node) => typeof node.type === "string" && (value === undefined ? node.props[attribute] !== undefined : String(node.props[attribute]) === value),
  );
const cardState = (root: ReactTestRenderer) => byData(root, "data-plan-card-state")[0]!.props["data-plan-card-state"];
const phaseStates = (root: ReactTestRenderer) => byData(root, "data-plan-card-phase-state").map((node) => node.props["data-plan-card-phase-state"]);

test("a saved bootstrap plan maps to the card view; other plans do not get a card", async () => {
  const snapshot = await savedPlan();
  const view = planCardViewFromSnapshot(snapshot)!;
  assert.equal(view.planId, snapshot.plan.id);
  assert.equal(view.version, 1);
  assert.equal(view.horizon, "quarter");
  assert.equal(view.totalWeeks, 12);
  assert.equal(view.question, "根据我的目标和人脉信息，我该如何实现目标？");
  assert.equal(view.supplement, "我更想先从制造业客户开始");
  assert.deepEqual(view.phases.map((phase) => [phase.n, phase.current, phase.title]), [
    [1, true, "摸清需求"],
    [2, false, "集中接触"],
    [3, false, "推进落地"],
  ]);
  assert.deepEqual(view.phases[0]!.events, [{ date: "10/8", title: "JETRO 外资企业商务交流会" }]);
  assert.deepEqual(view.allies.map((ally) => ally.initial), ["王", "佐", "林"]);
  assert.equal(view.figures.length, 3);

  // W0007 的普通计划（没有回答卡片数据）没有卡片。
  const plain = { ...snapshot, plan: { ...snapshot.plan, analysis: planInput().analysis ?? {} } };
  assert.equal(planCardViewFromSnapshot(plain as PlanSnapshot), null);
});

test("the finished card leads with the conclusion and ends with the saved plan link", async () => {
  const html = renderToStaticMarkup(<IOrbitPlanCard reveal={false} view={await cardView()} />);
  assert.match(html, /data-plan-card-state="done"/);
  const order = [
    "一句话回答",
    "12 周分 3 步",
    "12/20 前要达成",
    "三个阶段",
    "3 个月内 · 12 周",
    "这周就能做的 3 件事",
    "你现在的人脉能帮上什么",
    "还缺，要去认识",
    "最大风险",
    "在交流会上这样介绍自己 · 30 秒",
    "每个阶段的细节",
    "已保存为你的计划 v1",
    "查看和跟踪 →",
  ];
  let cursor = -1;
  for (const copy of order) {
    const at = html.indexOf(copy);
    assert.ok(at > cursor, `"${copy}" should come after the previous block`);
    cursor = at;
  }
  assert.match(html, /<em>王砚<\/em>/, "key people are emphasised in the one-liner");
  assert.match(html, /<a class="ir-pc-saved-link" data-plan-card-open="true" href="\/app\/agent\/plan">/);
  assert.doesNotMatch(html, /生成中/);
  assert.doesNotMatch(html, /排队中/);
  assert.equal(html.match(/class="ir-pc-stone ir-pc-stone-cur"/g)?.length, 1, "only the current phase is outlined");
});

test("reveal: conclusion and phase skeleton first, then one phase at a time, then the rest and the saved card", async (t) => {
  const view = await cardView();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(<IOrbitPlanCard reveal view={view} />);
  });

  assert.equal(cardState(root), "generating");
  assert.equal(byData(root, "data-plan-card-answer").length, 1, "the one-liner is there from the start");
  assert.equal(byData(root, "data-plan-card-figures").length, 1, "so are the key figures");
  assert.deepEqual(phaseStates(root), ["filled", "skeleton", "queued"]);
  assert.match(text(byData(root, "data-plan-card-generating")[0]!), /正在补齐第 2 阶段/);
  assert.equal(byData(root, "data-plan-card-saved").length, 0);
  assert.equal(byData(root, "data-plan-card-this-week").length, 0);

  await act(async () => t.mock.timers.tick(PLAN_REVEAL_STEP_MS - 1));
  assert.deepEqual(phaseStates(root), ["filled", "skeleton", "queued"], "nothing moves before the step");
  await act(async () => t.mock.timers.tick(1));
  assert.deepEqual(phaseStates(root), ["filled", "filled", "skeleton"]);
  await act(async () => t.mock.timers.tick(PLAN_REVEAL_STEP_MS));
  assert.deepEqual(phaseStates(root), ["filled", "filled", "filled"]);
  assert.equal(cardState(root), "generating");
  assert.match(text(byData(root, "data-plan-card-generating")[0]!), /正在整理这周就能做的事/);

  await act(async () => t.mock.timers.tick(PLAN_REVEAL_STEP_MS));
  assert.equal(cardState(root), "done");
  assert.equal(byData(root, "data-plan-card-generating").length, 0);
  assert.match(text(byData(root, "data-plan-card-saved")[0]!), /已保存为你的计划 v1/);
  assert.equal(byData(root, "data-plan-card-open")[0]!.props.href, "/app/agent/plan");
  act(() => root.unmount());
});

test("a year plan reveals four quarters; the details are collapsed and open on demand", async () => {
  const view = await cardView("year");
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(<IOrbitPlanCard reveal={false} view={view} />);
  });
  assert.deepEqual(phaseStates(root), ["filled", "filled", "filled", "filled"]);
  const toggles = byData(root, "data-plan-card-accordion");
  assert.equal(toggles.length, 4);
  assert.ok(toggles.every((node) => node.props["aria-expanded"] === false));
  assert.match(text(toggles[0]!), /第 1 阶段 · 摸清需求.*件事 · 2 个问题 · 2 场活动/);

  await act(async () => toggles[0]!.props.onClick());
  const first = byData(root, "data-plan-card-accordion", "q1")[0]!;
  assert.equal(first.props["aria-expanded"], true);
  const body = text(root.root.findByProps({ className: "ir-pc-acc-b" }));
  assert.match(body, /第 1 周：约 王砚 聊 20 分钟/);
  assert.match(body, /认识之后怎么跟进/);

  await act(async () => byData(root, "data-plan-card-accordion", "q2")[0]!.props.onClick());
  assert.match(text(root.root.findAllByProps({ className: "ir-pc-acc-b" })[1]!), /进入这一阶段时再细化到每周/);
  act(() => root.unmount());
});

test("the shell opens a saved plan straight into the chat: the fixed question, the supplement, then the card", async () => {
  const view = await cardView();
  const html = renderToStaticMarkup(
    <IOrbitShell
      home={{ account: { fullName: "QA", headline: "", initial: "Q", relationshipGoal: "" }, events: [], stats: { events: 0, inProgress: 0, people: 0 } } as never}
      initialPlanCard={view}
      viewModel={createOrbitAgentStarterViewModel()}
    />,
  );
  assert.match(html, /class="ir-chat"/, "lands on the chat view");
  const question = html.indexOf("根据我的目标和人脉信息，我该如何实现目标？");
  const supplement = html.indexOf("补充：我更想先从制造业客户开始");
  const card = html.indexOf("data-orbit-plan-card");
  assert.ok(question >= 0 && supplement > question && card > supplement);
  assert.match(html, /data-plan-card-state="done"/);

  const revealing = renderToStaticMarkup(
    <IOrbitShell home={null} initialPlanCard={view} initialPlanReveal viewModel={createOrbitAgentStarterViewModel()} />,
  );
  assert.match(revealing, /data-plan-card-state="generating"/, "the first frame after generating is the reveal, not the finished card");
});

test("every plan card <button> is btn ir-pc-*, and each .btn rule neutralises the base class", () => {
  const source = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../app/(app)/app/agent/iorbit-0918/iorbit-plan-card.tsx"),
    "utf8",
  );
  const buttons = source.match(/<button[\s\S]{0,400}?>/g) ?? [];
  assert.ok(buttons.length >= 1);
  for (const tag of buttons) assert.match(tag, /className="btn ir-pc-[a-z-]+"/);

  const flat = IORBIT_STYLES.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").join(" ");
  const rule = flat.match(/\.btn\.ir-pc-acc-h(?![-a-z])[^{:]*\{[^}]*\}/);
  assert.ok(rule);
  for (const declaration of ["height:", "display:", "align-items:", "justify-content:", "white-space:", "letter-spacing:", "line-height:", "transition:"]) {
    assert.ok(rule![0].includes(declaration), `.btn.ir-pc-acc-h misses ${declaration}`);
  }
  assert.match(flat, /\.btn\.ir-pc-acc-h:active\s*\{\s*transform: none;/);
  // 正文最小 13px。
  const sizes = [...IORBIT_STYLES.matchAll(/\.ir-pc[^{]*\{[^}]*?font-size: (\d+(?:\.\d+)?)px/g)].map((match) => Number(match[1]));
  assert.ok(sizes.length > 10 && sizes.every((size) => size >= 12), `plan card font sizes: ${sizes.join(",")}`);
});

test("plan card text colours meet WCAG AA (≥ 4.5:1) on their backgrounds", () => {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255).map((value) =>
      value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const ratio = (a: string, b: string) => {
    const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (light! + 0.05) / (dark! + 0.05);
  };
  const colorOf = (selector: string) => {
    const match = IORBIT_STYLES.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{[^}]*?(?:^|[; ])color: (#[0-9A-Fa-f]{6})`));
    assert.ok(match, `no colour for ${selector}`);
    return match![1]!;
  };
  const checks: Array<[string, string]> = [
    [".ir-pc-stone-n", "#FFFFFF"],
    [".ir-pc-queued", "#FFFFFF"],
    [".ir-pc-stone-w", "#FFFFFF"],
    [".ir-pc-blk-h em", "#FFFFFF"],
    [".ir-pc-fig span", "#FFFFFF"],
    [".ir-pc-ally small", "#F4F5FC"],
    [".ir-pc-risk b", "#FBEDE6"],
    [".ir-pc-gen", "#FFFFFF"],
  ];
  for (const [selector, background] of checks) {
    const colour = colorOf(selector);
    assert.ok(ratio(colour, background) >= 4.5, `${selector} ${colour} on ${background} is ${ratio(colour, background).toFixed(2)}:1`);
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { useState, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";

import { GOAL_EDITOR_STYLES, GoalEditor, GoalReminder } from "../../app/(app)/app/profile/goal-editor/goal-editor";
import {
  GOAL_EXAMPLES,
  GOAL_HORIZONS,
  composeRelationshipGoal,
  exampleHorizon,
  parseRelationshipGoal,
  type GoalHorizon,
} from "../../app/(app)/app/profile/goal-editor/goal-editor-model";

function Harness({ initialHorizon = "" as GoalHorizon | "", initialText = "" }) {
  const [text, setText] = useState(initialText);
  const [horizon, setHorizon] = useState<GoalHorizon | "">(initialHorizon);
  return <GoalEditor horizon={horizon} onHorizonChange={setHorizon} onTextChange={setText} text={text} />;
}

// 记录编辑器对输入框做的聚焦与光标操作（react-test-renderer 没有 DOM）。
function mount(element: ReactElement) {
  const caret: { focused: number; selection: [number, number] | null } = { focused: 0, selection: null };
  let root!: ReactTestRenderer;
  act(() => {
    root = create(element, {
      createNodeMock: (node) => {
        if (node.type !== "textarea") return null;
        return {
          focus() { caret.focused += 1; },
          setSelectionRange(start: number, end: number) { caret.selection = [start, end]; },
          // 与真实 DOM 一致：布局副作用执行时输入框已是新值。
          get value() { return String(root.root.findByType("textarea").props.value); },
        };
      },
    });
  });
  return { caret, root };
}

const input = (root: ReactTestRenderer) => root.root.findByType("textarea");
const examples = (root: ReactTestRenderer) => root.root.findAll((node) => node.type === "button" && node.props.className === "btn ge-example");
const horizons = (root: ReactTestRenderer) => root.root.findAll((node) => node.type === "button" && node.props.className === "btn ge-horizon");
const exampleButton = (root: ReactTestRenderer, text: string): ReactTestInstance => {
  const found = examples(root).find((button) => button.children.join("") === `＋ ${text}`);
  assert.ok(found, `example ${text}`);
  return found;
};
const pressedHorizon = (root: ReactTestRenderer) => horizons(root).filter((button) => button.props["aria-pressed"] === true).map((button) => button.props["aria-label"]);

test("SC-W0002-01: clicking an example replaces the input with the whole sentence, focuses it with the caret at the end, and presses exactly that badge", () => {
  const { caret, root } = mount(<Harness initialText="随便写的旧目标" />);
  assert.equal(examples(root).length, 10);
  assert.ok(examples(root).every((button) => button.props["aria-pressed"] === false));

  const sentence = "三个月内找到一位技术合伙人";
  act(() => { exampleButton(root, sentence).props.onClick(); });
  assert.equal(input(root).props.value, sentence);
  assert.equal(caret.focused, 1);
  assert.deepEqual(caret.selection, [sentence.length, sentence.length]);
  assert.deepEqual(examples(root).filter((button) => button.props["aria-pressed"] === true).map((button) => button.children.join("")), [`＋ ${sentence}`]);

  // 首尾空白不影响选中判定；改一个字就不再是示例
  act(() => { input(root).props.onChange({ target: { value: ` ${sentence} ` } }); });
  assert.equal(exampleButton(root, sentence).props["aria-pressed"], true);
  act(() => { input(root).props.onChange({ target: { value: `${sentence}，先从朋友圈问起` } }); });
  assert.ok(examples(root).every((button) => button.props["aria-pressed"] === false));
  // 手动输入不移动光标
  assert.equal(caret.focused, 1);
  act(() => root.unmount());
});

test("SC-W0002-02: examples with 三个月内／一个月内／年内 pick the matching horizon; cards can still be changed by hand", () => {
  assert.deepEqual(GOAL_EXAMPLES.map(exampleHorizon), ["quarter", "quarter", "month", "quarter", "month", "year", "year", "quarter", "year", null]);
  const { root } = mount(<Harness />);
  assert.deepEqual(horizons(root).map((button) => button.props["aria-label"]), ["一个月内", "3 个月内", "一年内"]);
  assert.deepEqual(pressedHorizon(root), []);

  act(() => { exampleButton(root, "一个月内见 10 位关注我们赛道的投资人").props.onClick(); });
  assert.deepEqual(pressedHorizon(root), ["一个月内"]);
  act(() => { exampleButton(root, "年内在东京开出第一家线下门店").props.onClick(); });
  assert.deepEqual(pressedHorizon(root), ["一年内"]);
  act(() => { exampleButton(root, "三个月内认识 20 位本行业的决策者").props.onClick(); });
  assert.deepEqual(pressedHorizon(root), ["3 个月内"]);
  // 无时间词的示例不改期限
  act(() => { exampleButton(root, "从 0 到 1 打造自有品牌").props.onClick(); });
  assert.deepEqual(pressedHorizon(root), ["3 个月内"]);
  // 手动点卡片
  act(() => { horizons(root)[0]!.props.onClick(); });
  assert.deepEqual(pressedHorizon(root), ["一个月内"]);
  act(() => root.unmount());
});

test("SC-W0002-03: parse reads new and old horizons, folds the old chip prefix into the text; compose writes only 正文（新期限）", () => {
  // 新写法
  assert.deepEqual(parseRelationshipGoal("三个月内找到一位技术合伙人（3 个月内）"), { text: "三个月内找到一位技术合伙人", horizon: "quarter" });
  assert.deepEqual(parseRelationshipGoal("Find a mentor (Within 1 year)"), { text: "Find a mentor", horizon: "year" });
  // 旧期限 本月／本季度／今年（中英）→ 新档位
  assert.deepEqual(parseRelationshipGoal("找到 5 家试用企业（本月）"), { text: "找到 5 家试用企业", horizon: "month" });
  assert.deepEqual(parseRelationshipGoal("找到 5 家试用企业（本季度）"), { text: "找到 5 家试用企业", horizon: "quarter" });
  assert.deepEqual(parseRelationshipGoal("找到 5 家试用企业（今年）"), { text: "找到 5 家试用企业", horizon: "year" });
  assert.deepEqual(parseRelationshipGoal("Raise funding (This year)"), { text: "Raise funding", horizon: "year" });
  // 旧 onboarding chip 前缀「A、B：正文（本季度）」→ 前缀并入正文，期限正确
  assert.deepEqual(
    parseRelationshipGoal("寻找合作伙伴、开拓新市场：把产品推到日本市场（本季度）"),
    { text: "寻找合作伙伴、开拓新市场：把产品推到日本市场", horizon: "quarter" },
  );
  assert.deepEqual(parseRelationshipGoal("Find partners, Enter a new market: Pilot in Japan (This quarter)"), { text: "Find partners, Enter a new market: Pilot in Japan", horizon: "quarter" });
  // 无期限 / 句末括号不是期限：整段保留
  assert.deepEqual(parseRelationshipGoal("三个月内认识 3 位日本渠道伙伴"), { text: "三个月内认识 3 位日本渠道伙伴", horizon: "" });
  assert.deepEqual(parseRelationshipGoal("找到供应商（先看大阪）"), { text: "找到供应商（先看大阪）", horizon: "" });
  assert.deepEqual(parseRelationshipGoal("   "), { text: "", horizon: "" });

  // compose：只写「正文（新期限）」，没有 chip 前缀；空正文不写期限
  assert.equal(composeRelationshipGoal({ text: " 找到 5 家试用企业 ", horizon: "quarter" }, "zh"), "找到 5 家试用企业（3 个月内）");
  assert.equal(composeRelationshipGoal({ text: "Raise a seed round", horizon: "month" }, "en"), "Raise a seed round (Within 1 month)");
  assert.equal(composeRelationshipGoal({ text: "从 0 到 1 打造自有品牌", horizon: "" }, "zh"), "从 0 到 1 打造自有品牌");
  assert.equal(composeRelationshipGoal({ text: "  ", horizon: "year" }, "zh"), "");
  // 往返
  for (const option of GOAL_HORIZONS) {
    for (const language of ["zh", "en"] as const) {
      const draft = { text: "年内找到 2 家稳定的日本供应商", horizon: option.key };
      assert.deepEqual(parseRelationshipGoal(composeRelationshipGoal(draft, language)), draft);
    }
  }
});

test("editor markup: labelled input, hint + counter, examples heading, horizon cards; reminder copy; scoped styles", () => {
  const html = renderToStaticMarkup(<><GoalReminder /><GoalEditor horizon="year" onHorizonChange={() => undefined} onTextChange={() => undefined} text="从 0 到 1 打造自有品牌" /></>);
  assert.match(html, /请认真写。iOrbit 会用 AI 根据这句话分析你的人脉、拆出步骤、推荐要认识的人。/);
  assert.match(html, /你的目标/);
  assert.match(html, /<textarea aria-label="你的目标"[^>]*maxLength="100"/);
  assert.match(html, /写清楚做什么、做到多少、在哪里/);
  assert.match(html, /<em class="ge-count">14 \/ 100<\/em>/);
  assert.match(html, /示例，点一下填入，再改成你自己的：/);
  for (const [num, unit, sub] of [["1", "个月", "按周排 · 共 4 周"], ["3", "个月", "按周排 · 分 3 段"], ["1", "年", "按季度 · 分 4 段"]]) {
    assert.match(html, new RegExp(`<b class="ge-horizon-num">${num}<small>${unit}</small></b><span class="ge-horizon-sub">${sub}</span>`));
  }
  assert.match(html, /aria-label="一年内" aria-pressed="true"/);
  // 选中态悬停不回到未选样式：hover 只作用于未选；选中 + hover 用更深的靛蓝
  assert.match(GOAL_EDITOR_STYLES, /\.btn\.ge-example\[aria-pressed="false"\]:hover/);
  assert.match(GOAL_EDITOR_STYLES, /\.btn\.ge-example\[aria-pressed="true"\]:hover:not\(:disabled\) \{ border-color: #2E3270; background: #2E3270;/);
  assert.match(GOAL_EDITOR_STYLES, /\[data-orbit-real-page\] \.ge \.btn\.ge-example \{/);

  const disabled = renderToStaticMarkup(<GoalEditor disabled horizon="" onHorizonChange={() => undefined} onTextChange={() => undefined} text="" />);
  assert.match(disabled, /<textarea[^>]*disabled=""/);
  assert.equal((disabled.match(/class="btn ge-example" disabled=""/g) ?? []).length, 10);
});

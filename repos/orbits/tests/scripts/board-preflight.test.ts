import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";

import {
  checkConsistency,
  collectStyleValues,
  dataSourceItems,
  extractNumbers,
  findVariants,
  loadTokenIndex,
  matchTokens,
  midStateHints,
  nearestColor,
  nearestToken,
  normShadow,
  parseColor,
  screenKey,
} from "../../scripts/visual/board-preflight-lib.mjs";

// 画板预检（HOW-TO §8，2026-10-14）：数字抽取、自洽规则、最近 token。
const index = loadTokenIndex(join(process.cwd(), "shared/design/tokens.json"));

type El = { i: number; parent: number; tag: string; cls: string; kid: string; own: string; text: string; rect: number[]; input: string; placeholder: string; value: string; icon: boolean; checkbox: boolean; checked: boolean; button: boolean; expanded: boolean; s: Record<string, unknown> };
const style = (o: Record<string, unknown> = {}) => ({ fontSize: null, lineHeight: null, letterSpacing: null, radius: [0, 0, 0, 0], padding: [0, 0, 0, 0], margin: [0, 0, 0, 0], gap: [null, null], color: null, background: "rgba(0, 0, 0, 0)", borderColor: [], boxShadow: "none", ...o });
// 小 DOM 树：[parent, tag, cls, ownText, extra]
function tree(rows: Array<[number, string, string, string?, Partial<El>?]>): El[] {
  const els: El[] = rows.map(([parent, tag, cls, own = "", extra = {}], i) => ({ i, parent, tag, cls, kid: (cls.match(/\bk-[\w-]+/) ?? [""])[0], own, text: own, rect: [0, i * 10, 100, 10], input: "", placeholder: "", value: "", icon: false, checkbox: false, checked: false, button: false, expanded: false, s: style(), ...extra }));
  // text = 自身 + 子孙文字（collectBoard 里是 innerText）
  for (let i = els.length - 1; i >= 0; i--) if (els[i].parent >= 0) els[els[i].parent].text = `${els[els[i].parent].text} ${els[i].text}`.trim();
  return els;
}

test("extractNumbers: 人数 / 分数 / 选择 / 合计，排除日期与小数", () => {
  const a = extractNumbers("スコア 128 · 話した人 21人");
  assert.deepEqual(a.map((n) => [n.kind, n.label, n.value, n.unit]), [["score", "スコア", 128, ""], ["count", "話した人", 21, "人"]]);
  const f = extractNumbers("CFO 0 / 1人");
  assert.equal(f[0].kind, "fraction");
  assert.deepEqual([f[0].label, f[0].value, f[0].of, f[0].unit], ["CFO", 0, 1, "人"]);
  assert.equal(extractNumbers("選んだ 4件を統合")[0].kind, "select");
  assert.equal(extractNumbers("3件を統合")[0].kind, "select");
  assert.equal(extractNumbers("合計 19人")[0].total, true);
  assert.equal(extractNumbers("全角 ５人")[0].value, 5);
  assert.deepEqual(extractNumbers("10/6 · 2026-10-14 · 1.5倍 · 12:30"), []);
});

test("checkConsistency: 選んだ n件 ≠ 勾选行数（b9 #8 旧版 選んだ 4件 / 勾 3 行）", () => {
  const els = tree([
    [-1, "div", "card k-wdup"],
    [0, "button", "btn", "選んだ 4件を統合"],
    [0, "div", "xrow"], [2, "span", "cbx on", "", { checkbox: true, checked: true }],
    [0, "div", "xrow"], [4, "span", "cbx on", "", { checkbox: true, checked: true }],
    [0, "div", "xrow"], [6, "span", "cbx on", "", { checkbox: true, checked: true }],
    [0, "div", "xrow"], [8, "span", "cbx", "", { checkbox: true, checked: false }],
  ]);
  const hints = checkConsistency(els);
  assert.equal(hints.length, 1);
  assert.equal(hints[0].rule, "select-vs-checked");
  assert.match(hints[0].message, /4件.*3 行/);
  els[8 + 1].checked = true; // 勾满 4 行 → 不再提示
  assert.deepEqual(checkConsistency(els).filter((h) => h.rule === "select-vs-checked"), []);
});

test("checkConsistency: 总数 ≠ 分项合计（W-R25-07 話した人 21人 vs 3+7+2+6+1）", () => {
  const rows: Array<[number, string, string, string?]> = [[-1, "div", "web"], [0, "span", "chip lav", "スコア 128 · 話した人 21人"]];
  for (const [n, of] of [[3, 1], [7, 5], [2, 2], [6, 3], [1, 3]]) { rows.push([0, "div", "v2step"]); rows.push([rows.length - 1, "span", "chip teal", `${n} / ${of}人 達成`]); }
  const hints = checkConsistency(tree(rows));
  const sum = hints.find((h) => h.rule === "sum-vs-total");
  assert.ok(sum, JSON.stringify(hints));
  assert.match(sum.message, /21人.*19人/);
  rows[1][3] = "スコア 128 · 話した人 19人";
  assert.equal(checkConsistency(tree(rows)).some((h) => h.rule === "sum-vs-total"), false);
});

test("checkConsistency: 标题 n件 与画出的行数、同标签不同数字；列表每行各自的数字不算冲突", () => {
  const els = tree([
    [-1, "div", "card"], [0, "h3", "", "要確認 3件"],
    [0, "div", "list"], [2, "div", "row", "佐藤"], [2, "div", "row", "鈴木"],
    [-1, "div", "card"], [5, "span", "chip", "話した人 21人"], [5, "b", "", "話した人 19人"],
    [-1, "div", "list"], [8, "span", "lbl", "候補 1人"], [8, "span", "lbl", "候補 4人"],
  ]);
  const rules = checkConsistency(els).map((h) => `${h.rule}:${h.message}`);
  assert.ok(rules.some((r) => r.startsWith("heading-vs-rows") && r.includes("2 行")), rules.join("\n"));
  assert.ok(rules.some((r) => r.startsWith("same-label-different-number") && r.includes("話した人")), rules.join("\n"));
  assert.ok(!rules.some((r) => r.includes("候補")), rules.join("\n"));
});

test("nearestToken / matchTokens: 21 vs 20、行高 1.52 vs 1.5 = 近似但不等；14 = 精确；7px 圆角 = 精确（check）", () => {
  assert.equal(nearestToken(index.fontSize, 14).exact?.web, "--fs-body");
  const values = [
    { cat: "fontSize", value: 20.5, count: 1, props: [], where: [] },
    { cat: "lineHeight", value: 1.52, count: 3, props: [], where: [] },
    { cat: "lineHeight", value: 2.2, count: 1, props: [], where: [] },
    { cat: "radius", value: 7, count: 1, props: [], where: [] },
    { cat: "space", value: 15, count: 1, props: [], where: [] }, // R26 补了 1–13 的小值，15 仍不在刻度
  ];
  const [fs, lh, lh2, r, sp] = matchTokens(values, index, "light");
  assert.equal(fs.status, "near");
  assert.equal(lh.status, "near");
  assert.equal(lh.token.web, "--lh-body");
  assert.equal(lh.token.app, "designFont.lineHeight.body");
  assert.equal(lh2.status, "missing");
  assert.equal(r.status, "exact");
  assert.equal(sp.status, "missing"); // 间距没有「近似」：不在刻度上就是缺 token
});

test("颜色：精确、近似、主题串色；阴影规范化后与 token 相等", () => {
  assert.deepEqual(parseColor("#6E628A"), [110, 98, 138, 1]);
  assert.deepEqual(parseColor("rgba(40, 30, 50, 0.06)"), [40, 30, 50, 0.06]);
  assert.equal(parseColor("transparent"), null);
  assert.ok(["accent", "plum-700"].includes(nearestColor(index, "light", [110, 98, 138, 1]).exact?.name ?? "")); // 同值 token 取其一
  const near = nearestColor(index, "light", [112, 100, 140, 1]);
  assert.equal(near.exact, null);
  assert.ok(near.diff > 0 && near.diff < 14);
  assert.equal(nearestColor(index, "light", parseColor("#19181C")!).otherTheme?.name, "bg");
  const m = matchTokens([{ cat: "shadow", value: normShadow("rgba(60, 40, 90, 0.22) 0px 10px 30px -12px"), count: 1, props: [], where: [] }], index, "light");
  assert.equal(m[0].status, "exact");
});

test("collectStyleValues: 行高按比值、百分比外的圆角、超大间距忽略", () => {
  const els = tree([[-1, "div", "web"], [0, "span", "lbl", "完了の目安"]]);
  els[1].s = style({ fontSize: 13, lineHeight: 20.15, radius: [8, 8, 8, 8], padding: [0, 300, 0, 6], color: "rgb(30, 26, 36)" });
  const vals = collectStyleValues(els);
  assert.ok(vals.some((v) => v.cat === "lineHeight" && v.value === 1.55));
  assert.ok(vals.some((v) => v.cat === "radius" && v.value === 8));
  assert.ok(vals.some((v) => v.cat === "space" && v.value === 6));
  assert.ok(!vals.some((v) => v.cat === "space" && v.value === 300));
  assert.ok(vals.some((v) => v.cat === "color" && v.value === "rgb(30, 26, 36)"));
});

test("dataSourceItems: 疑似无功能（🎤、＋、自由输入、emoji chip），导航壳默认不列", () => {
  const els = tree([
    [-1, "div", "web"],
    [0, "aside", "side"], [1, "a", "", "ホーム"],
    [0, "button", "rbtn", "🎤"],
    [0, "button", "btn", "＋"],
    [0, "textarea", "", "", { input: "textarea", placeholder: "自由にどうぞ" }],
    [0, "span", "chip", "🚀 起業家"],
    [0, "b", "", "山田 花子"],
  ]);
  const items = dataSourceItems(els);
  assert.ok(!items.some((x) => x.text === "ホーム"));
  assert.ok(dataSourceItems(els, { withShell: true }).some((x) => x.text === "ホーム"));
  const flags = Object.fromEntries(items.map((x) => [x.text, x.flags.join(",")]));
  assert.match(flags["🎤"], /麦克风/);
  assert.match(flags["＋"], /＋/);
  assert.match(flags["自由にどうぞ"], /自由输入/);
  assert.match(flags["🚀 起業家"], /emoji/);
  assert.equal(flags["山田 花子"], "");
});

test("screenKey / findVariants / midStateHints", () => {
  assert.equal(screenKey("W-R25-07 達成確認框（スコア）"), "R25-07");
  assert.equal(screenKey("A-R25-07b 見直し"), "R25-07");
  assert.equal(screenKey("Task › プラン · 1024大量数据"), "Task · プラン");
  const all = [
    { file: "web.html", index: 17, kind: "web", theme: "", label: "Task · プラン 概要（進行中 46）大量数据" },
    { file: "b8-responsive.html", index: 6, kind: "web1024", theme: "", label: "Task › プラン · 1024大量数据" },
    { file: "web.html", index: 3, kind: "web", theme: "", label: "Task · メモ" },
  ];
  assert.deepEqual(findVariants(all[0], all).map((b) => b.index), [17, 6]);
  const els = tree([[-1, "div", "web"], [0, "div", "toast", "保存しました"], [0, "div", "acc", "", { expanded: true }], [0, "input", "", "", { input: "text", value: "山田" }], [0, "input", "", "", { input: "text" }]]);
  const hints = midStateHints(els, "N31 App 見直し · 送信中（底部栏）").join("|");
  assert.match(hints, /toast/);
  assert.match(hints, /展开中/);
  assert.match(hints, /只填一半（1 \/ 2）/);
  assert.match(hints, /送信中/);
});

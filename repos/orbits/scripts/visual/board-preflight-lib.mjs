// $WEB/scripts/visual/board-preflight-lib.mjs
// 画板预检（HOW-TO §8「画板预检」第 1 / 2 / 3 项）的纯函数：token 索引与最近 token、数字抽取、自洽规则、
// 数据来源清单、中途状态识别、输出格式。浏览器侧只做 collectBoard（读 DOM 与 computed style），其余都在 Node 里算，
// 单测见 tests/scripts/board-preflight.test.ts。
import { readFileSync } from "node:fs";

// ---------- token 索引 ----------
// 源 = shared/design/tokens.json（R01：一份源生成 Web tokens.css 与 App tokens.ts）。每条 token 带 Web 变量名与 App 写法。
export function loadTokenIndex(tokensJsonPath) {
  const src = JSON.parse(readFileSync(tokensJsonPath, "utf8"));
  const idx = { fontSize: [], lineHeight: [], radius: [], space: [], color: { light: [], dark: [] }, shadow: { light: [], dark: [] }, letterSpacing: [] };
  for (const [k, v] of Object.entries(src.font.size)) idx.fontSize.push({ name: k, value: v, web: `--fs-${k}`, app: `designFont.size[${JSON.stringify(k)}]` });
  for (const [k, v] of Object.entries(src.font["line-height"])) idx.lineHeight.push({ name: k, value: v, web: `--lh-${k}`, app: `designFont.lineHeight.${k}` });
  for (const [k, v] of Object.entries(src.radius)) idx.radius.push({ name: k, value: v, web: `--r-${k}`, app: `designRadius[${JSON.stringify(k)}]` });
  src.space.scale.forEach((v, i) => idx.space.push({ name: `space-${v}`, value: v, web: `--space-${v}`, app: `designSpace.scale[${i}]` }));
  idx.space.push({ name: "gap", value: src.space.gap, web: "--gap", app: "designSpace.gap" });
  for (const theme of ["light", "dark"]) {
    for (const [k, v] of Object.entries(src.color[theme])) {
      // preview-*: fixed light/dark swatches for the 外観 thumbnails only; matching board colours against
      // them would hide a dark colour used in a light board (theme crossover).
      if (k.startsWith("preview-")) continue;
      const rgba = parseColor(v);
      if (rgba) idx.color[theme].push({ name: k, value: v, rgba, web: `--${k}`, app: `designColors.${theme}[${JSON.stringify(k)}]` });
    }
    for (const [k, v] of Object.entries(src.shadow)) idx.shadow[theme].push({ name: k, value: v[theme], norm: normShadow(v[theme]), web: `--shadow-${k}`, app: `designShadow.${k}.${theme}` });
  }
  return idx;
}

// "#RRGGBB" / "#RGB" / "rgb(a)(…)" → [r, g, b, a]；transparent / 无法解析 → null。
export function parseColor(value) {
  const s = String(value ?? "").trim().toLowerCase();
  if (!s || s === "transparent" || s === "none") return null;
  let m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/);
  if (m) {
    let h = m[1];
    if (h.length === 3) h = [...h].map((c) => c + c).join("");
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? Math.round((n(6) / 255) * 100) / 100 : 1];
  }
  m = s.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (p.length < 3 || p.some(Number.isNaN)) return null;
    return [p[0], p[1], p[2], p[3] ?? 1];
  }
  return null;
}

export const colorKey = (c) => (c[3] === 1 ? `rgb(${c[0]}, ${c[1]}, ${c[2]})` : `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${c[3]})`);
// 颜色距离：RGB 欧氏距离 + 透明度差（×255），足够区分「手抄近似色」与「另一种色」。
export const colorDistance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2], (a[3] - b[3]) * 255);

// box-shadow 规范化：颜色 + 各长度（px），不管书写顺序（computed style 把颜色放前面）。
export function normShadow(value) {
  const s = String(value ?? "").trim();
  if (!s || s === "none") return null;
  return s.split(/,(?![^(]*\))/).map((layer) => {
    const color = layer.match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}/i)?.[0];
    const lengths = layer.replace(/rgba?\([^)]*\)|#[0-9a-f]{3,8}/gi, "").match(/-?\d*\.?\d+(px)?/g)?.map((x) => parseFloat(x)) ?? [];
    while (lengths.length < 4) lengths.push(0);
    const c = color ? parseColor(color) : null;
    return `${layer.includes("inset") ? "inset " : ""}${lengths.join(" ")} ${c ? colorKey(c) : ""}`.trim();
  }).join(" | ");
}

// 近似阈值：差值不为 0 且在阈值内 = 「近似但不等」（最危险：实现时最容易手抄成 token 或反过来）；超出 = 「缺 token」。
export const NEAR = { fontSize: 1, lineHeight: 0.06, radius: 1, space: 0, color: 14 };

// 数值类：返回 { exact, nearest, diff }。
export function nearestToken(list, value) {
  let best = null;
  for (const t of list) {
    const d = Math.abs(t.value - value);
    if (!best || d < best.diff) best = { token: t, diff: d };
  }
  if (!best) return { exact: null, nearest: null, diff: Infinity };
  return { exact: best.diff < 1e-6 ? best.token : null, nearest: best.token, diff: Math.round(best.diff * 1000) / 1000 };
}

export function nearestColor(index, theme, rgba) {
  const own = index.color[theme] ?? index.color.light;
  const other = index.color[theme === "dark" ? "light" : "dark"];
  let best = null;
  for (const t of own) {
    const d = colorDistance(t.rgba, rgba);
    if (!best || d < best.diff) best = { token: t, diff: d };
  }
  const exact = best && best.diff < 1.5 ? best.token : null;
  // 主题串了：本主题没有，另一主题里有同值。
  const otherTheme = exact ? null : other.find((t) => colorDistance(t.rgba, rgba) < 1.5) ?? null;
  return { exact, nearest: best?.token ?? null, diff: best ? Math.round(best.diff * 10) / 10 : Infinity, otherTheme };
}

// ---------- 浏览器侧：读画框 ----------
// 在画框元素上执行（page.evaluate 序列化本函数）。返回扁平元素表（含父序号），所有判断留给 Node。
export const collectBoard = (frame) => {
  const norm = (s) => (s ?? "").replace(/\s+/g, " ").trim();
  const fr = frame.getBoundingClientRect();
  const all = [frame, ...frame.querySelectorAll("*")];
  const indexOf = new Map();
  const out = [];
  const px = (v) => (v === "normal" || v === "auto" || v === "" ? null : parseFloat(v));
  for (const el of all) {
    if (el.closest("svg") && el.tagName.toLowerCase() !== "svg") continue;
    if (["SCRIPT", "STYLE", "TEMPLATE", "LINK", "BR"].includes(el.tagName)) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (cs.display === "none" || cs.visibility === "hidden" || r.width === 0 || r.height === 0) continue;
    let parent = el.parentElement;
    while (parent && !indexOf.has(parent)) parent = parent.parentElement;
    const own = norm([...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" "));
    const cls = typeof el.className === "string" ? el.className : el.getAttribute("class") ?? "";
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute("type") ?? "").toLowerCase();
    const role = el.getAttribute("role") ?? "";
    const isCheckbox = /(^|\s)(cbx|checkbox|chk)(\s|$)/.test(cls) || (tag === "input" && (type === "checkbox" || type === "radio")) || role === "checkbox" || role === "radio";
    const checked = isCheckbox && (/(^|\s)(on|checked|is-on|sel)(\s|$)/.test(cls) || el.checked === true || el.getAttribute("aria-checked") === "true");
    const bw = ["Top", "Right", "Bottom", "Left"].map((s) => parseFloat(cs[`border${s}Width`]) || 0);
    const item = {
      i: out.length,
      parent: parent ? indexOf.get(parent) : -1,
      tag,
      cls: norm(cls),
      kid: (cls.match(/(^|\s)(k-[\w-]+)/) ?? [])[2] ?? "",
      own: own.slice(0, 200),
      text: tag === "svg" ? "" : norm(el.innerText ?? "").slice(0, 300),
      rect: [Math.round(r.left - fr.left), Math.round(r.top - fr.top), Math.round(r.width), Math.round(r.height)],
      input: ["input", "textarea", "select"].includes(tag) || el.isContentEditable || /(^|\s)(input|field|textarea|composer|search)(\s|$)/.test(cls) ? (tag === "input" ? type || "text" : tag) : "",
      placeholder: el.getAttribute("placeholder") ?? "",
      value: "value" in el && typeof el.value === "string" ? el.value : "",
      icon: tag === "svg" || /(^|\s)(ic|icon|emo|dic|gi)(\s|$)/.test(cls),
      checkbox: isCheckbox,
      checked,
      button: tag === "button" || role === "button" || /(^|\s)(btn|rbtn)(\s|$)/.test(cls),
      expanded: el.getAttribute("aria-expanded") === "true" || /(^|\s)(open|expanded|is-open)(\s|$)/.test(cls),
      s: {
        fontSize: own ? px(cs.fontSize) : null,
        lineHeight: own ? px(cs.lineHeight) : null,
        letterSpacing: own ? px(cs.letterSpacing) : null,
        // 百分比圆角（50% 圆形头像）不是 token 类取值，记 0。
        radius: [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map((v) => (v.includes("%") ? 0 : parseFloat(v) || 0)),
        padding: ["Top", "Right", "Bottom", "Left"].map((s) => parseFloat(cs[`padding${s}`]) || 0),
        margin: ["Top", "Right", "Bottom", "Left"].map((s) => parseFloat(cs[`margin${s}`]) || 0),
        gap: /flex|grid/.test(cs.display) ? [px(cs.rowGap), px(cs.columnGap)] : [null, null],
        color: own || tag === "svg" ? cs.color : null,
        background: cs.backgroundColor,
        borderColor: bw.some((w) => w > 0) ? [...new Set(["Top", "Right", "Bottom", "Left"].filter((s, k) => bw[k] > 0).map((s) => cs[`border${s}Color`]))] : [],
        boxShadow: cs.boxShadow,
      },
    };
    indexOf.set(el, item.i);
    out.push(item);
  }
  return out;
};

// ---------- 1. token 覆盖 ----------
const where = (el) => `${el.kid ? `.${el.kid} ` : ""}${el.tag}${el.cls ? "." + el.cls.split(" ").filter((c) => c !== el.kid).slice(0, 3).join(".") : ""}${el.own ? ` 「${el.own.slice(0, 18)}」` : ""}`;

// 把画板上的样式值归类计数：key = 类别 + 值，记出现次数与最多 3 个位置。
export function collectStyleValues(elements) {
  const map = new Map();
  const add = (cat, value, el, prop) => {
    if (value === null || value === undefined || Number.isNaN(value)) return;
    const key = `${cat}|${typeof value === "number" ? value : JSON.stringify(value)}`;
    const e = map.get(key) ?? { cat, value, count: 0, props: new Set(), where: [] };
    e.count++;
    e.props.add(prop);
    if (e.where.length < 3) e.where.push(where(el));
    map.set(key, e);
  };
  const r2 = (n) => Math.round(n * 100) / 100;
  for (const el of elements) {
    const s = el.s;
    if (s.fontSize) add("fontSize", r2(s.fontSize), el, "font-size");
    if (s.fontSize && s.lineHeight) add("lineHeight", r2(s.lineHeight / s.fontSize), el, "line-height");
    if (s.letterSpacing) add("letterSpacing", r2(s.letterSpacing / (s.fontSize || 1)), el, "letter-spacing(em)");
    for (const v of new Set(s.radius.filter((x) => x > 0 && x < 500))) add("radius", r2(v), el, "border-radius");
    for (const [prop, list] of [["padding", s.padding], ["margin", s.margin], ["gap", s.gap]]) {
      for (const v of new Set(list.filter((x) => x !== null && x !== 0 && Math.abs(x) <= 64).map(Math.abs))) add("space", r2(v), el, prop);
    }
    for (const [prop, v] of [["color", s.color], ["background-color", s.background], ...s.borderColor.map((c) => ["border-color", c])]) {
      const c = parseColor(v);
      if (c && c[3] > 0) add("color", colorKey(c), el, prop);
    }
    const sh = normShadow(s.boxShadow);
    if (sh) add("shadow", sh, el, "box-shadow");
  }
  return [...map.values()].map((e) => ({ ...e, props: [...e.props] }));
}

// 逐值对 token：status = exact / near（近似但不等）/ missing（缺 token）/ theme（用了另一主题的颜色）。
export function matchTokens(values, index, theme = "light") {
  return values.map((v) => {
    if (v.cat === "color") {
      const m = nearestColor(index, theme, parseColor(v.value));
      const status = m.exact ? "exact" : m.otherTheme ? "theme" : m.diff <= NEAR.color ? "near" : "missing";
      return { ...v, status, token: m.exact ?? m.otherTheme ?? m.nearest, diff: m.diff };
    }
    if (v.cat === "shadow") {
      const t = (index.shadow[theme] ?? []).find((x) => x.norm === v.value);
      return { ...v, status: t ? "exact" : "missing", token: t ?? index.shadow[theme]?.[0] ?? null, diff: t ? 0 : null };
    }
    const list = index[v.cat] ?? [];
    if (!list.length) return { ...v, status: "missing", token: null, diff: null };
    const m = nearestToken(list, v.value);
    const status = m.exact ? "exact" : m.diff <= (NEAR[v.cat] ?? 0) ? "near" : "missing";
    return { ...v, status, token: m.exact ?? m.nearest, diff: m.diff };
  });
}

// ---------- 2. 画板自洽 ----------
const UNIT = "人|件|枚|社|回|名|点|つ|個|か所|日";
const TOTAL_LABEL = /合計|合わせて|話した|会った|つながり|人脈|対象|全体/;
const SEP = /[·・|｜、,，：:（）()「」\[\]【】]/;
// 从一段文字抽数字：{ value, of?, unit, label, kind }。kind：count（n 人）/ fraction（n / m 人）/ score（スコア n）/ select（選んだ n 件）。
export function extractNumbers(text) {
  const out = [];
  const s = String(text ?? "").replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0)).replace(/／/g, "/");
  const labelBefore = (i) => {
    const head = s.slice(0, i).replace(/\s+$/, "");
    const seg = head.split(SEP).pop() ?? "";
    return seg.trim().split(/\s+/).slice(-2).join(" ").replace(/^(の|は|が|を|で|と|に)/, "").slice(-12);
  };
  const re = new RegExp(`(\\d[\\d,]*)\\s*(?:\\/\\s*(\\d[\\d,]*))?\\s*(${UNIT})?`, "g");
  let m;
  while ((m = re.exec(s))) {
    const before = s.slice(Math.max(0, m.index - 1), m.index);
    if (/[\d.:\-]/.test(before) || /^[.:]\d/.test(s.slice(m.index + m[0].length))) continue; // 小数、时刻、日期
    const value = Number(m[1].replace(/,/g, ""));
    const of = m[2] !== undefined ? Number(m[2].replace(/,/g, "")) : undefined;
    const unit = m[3] ?? "";
    if (of !== undefined && !unit && !/\s\//.test(m[0])) continue; // 「10/6」是日期；无单位的分数只认「142 / 238」
    const label = labelBefore(m.index);
    const tail = s.slice(m.index + m[0].length, m.index + m[0].length + 6);
    let kind = of !== undefined ? "fraction" : unit ? "count" : /スコア|点数|score/i.test(label) ? "score" : "";
    if (!kind) continue;
    if (/選んだ|選択した|選択中|チェックした/.test(label) || (unit && /^を?(統合|追加|削除|送信|登録|招待|取り込|インポート|選択)/.test(tail))) kind = "select";
    out.push({ value, of, unit, label, kind, total: /合計|計$|全部|すべて|総/.test(label) });
  }
  return out;
}

const labelKey = (label) => label.replace(/\s+/g, "").replace(/[のはがをでと]$/, "");
const ancestors = (elements, i) => { const out = []; for (let p = elements[i].parent; p >= 0; p = elements[p].parent) out.push(p); return out; };
const descendants = (elements, i) => { const out = []; const kids = childrenMap(elements); const st = [...(kids.get(i) ?? [])]; while (st.length) { const c = st.pop(); out.push(c); st.push(...(kids.get(c) ?? [])); } return out; };
const childCache = new WeakMap();
function childrenMap(elements) {
  if (childCache.has(elements)) return childCache.get(elements);
  const m = new Map();
  for (const el of elements) if (el.parent >= 0) m.set(el.parent, [...(m.get(el.parent) ?? []), el.i]);
  childCache.set(elements, m);
  return m;
}
// 行签名：同一父元素下 ≥2 个同 tag + 同类名的子元素 = 一组列表行。
function rowGroups(elements) {
  const kids = childrenMap(elements);
  const groups = [];
  for (const [p, list] of kids) {
    const bySig = new Map();
    for (const c of list) { const e = elements[c]; const sig = `${e.tag}.${e.cls.replace(/\bk-[\w-]+\b/g, "").replace(/\b(on|sel|active|first|last|z)\b/g, "").replace(/\s+/g, " ").trim()}`; bySig.set(sig, [...(bySig.get(sig) ?? []), c]); }
    for (const [sig, rows] of bySig) if (rows.length >= 2 && rows.every((r) => elements[r].text)) groups.push({ parent: p, sig, rows });
  }
  return groups;
}
const pos = (el) => `${el.kid ? "." + el.kid + " " : ""}(${el.rect[0]},${el.rect[1]}) 「${(el.own || el.text).slice(0, 40)}」`;

// 返回「疑似不自洽」提示列表：{ rule, message, where }。
export function checkConsistency(elements) {
  const hints = [];
  const texts = elements.filter((e) => e.own);
  const nums = texts.flatMap((e) => extractNumbers(e.own).map((n) => ({ ...n, el: e })));

  // R1 選んだ n件 ↔ 同一卡片 / 表格 / 弹层（没有就整个画框）里勾选的行数。和文字同在一条操作条里的勾选框
  // （批量条的全选框）不算行：b6 #9「2名を選択中」的批量条自带一个全选框，行在下面的表格里。
  const CONTAINER = /(^|\s)(card|panel|sheet|wdlg|wmodal|modal|dialog|drawer|list|table)(\s|$)/;
  for (const n of nums.filter((x) => x.kind === "select")) {
    const up = ancestors(elements, n.el.i);
    const k = up.findIndex((a) => elements[a].tag === "table" || CONTAINER.test(elements[a].cls));
    const container = k >= 0 ? up[k] : up[up.length - 1];
    if (container === undefined) continue;
    const bar = new Set(k > 0 ? up.slice(0, k) : []);
    const boxes = descendants(elements, container).filter((d) => elements[d].checkbox && !ancestors(elements, d).some((a) => bar.has(a)));
    if (!boxes.length) continue;
    const checked = boxes.filter((d) => elements[d].checked).length;
    if (checked !== n.value) hints.push({ rule: "select-vs-checked", message: `「${n.label} ${n.value}${n.unit}」但同一卡片里勾选了 ${checked} 行（共 ${boxes.length} 个勾选框）`, where: pos(n.el) });
  }

  // R2 标题「n人 / n件」↔ 画出的列表行数（只在 n ≤ 12、没有「すべて / もっと / 他」入口时提示）
  for (const n of nums.filter((x) => x.kind === "count" && x.value > 0 && x.value <= 12 && ["人", "件", "枚", "社"].includes(x.unit))) {
    const el = n.el;
    if (!/^h[1-6]$/.test(el.tag) && !/card-h|ttl|title|head/.test(el.cls) && !ancestors(elements, el.i).slice(0, 2).some((a) => /card-h|head/.test(elements[a].cls))) continue;
    const container = ancestors(elements, el.i).find((a) => /card|sec|panel|list|wdlg|sheet/.test(elements[a].cls));
    if (container === undefined) continue;
    const inside = new Set(descendants(elements, container));
    const groups = rowGroups(elements).filter((g) => inside.has(g.parent) && !g.rows.includes(el.i) && !g.rows.some((r) => ancestors(elements, el.i).includes(r)));
    if (!groups.length) continue;
    const g = groups.sort((a, b) => b.rows.length - a.rows.length)[0];
    const hasMore = [...inside].some((d) => /すべて|もっと見る|他\s*\d|ほか|残り|more/i.test(elements[d].own));
    if (g.rows.length > n.value || (g.rows.length < n.value && !hasMore && g.rows.length >= 2)) {
      hints.push({ rule: "heading-vs-rows", message: `标题写「${n.label} ${n.value}${n.unit}」，下面画了 ${g.rows.length} 行${hasMore ? "" : "（无「すべて / もっと」入口）"}`, where: pos(el) });
    }
  }

  // R3 分项合计 ↔ 别处写的总数：重复出现的同类元素（同 tag + 首个类名，如每行一个 span.chip「7 / 5人」）各带一个
  // 同单位数字，加起来和画板上「合計 / 話した人 / 人脈 …」这类总数比（W-R25-07：话した人 21人 vs 类型表 3+7+2+6+1=19）。
  const fam = new Map();
  for (const n of nums) {
    if (!(n.kind === "count" || n.kind === "fraction") || !n.unit || n.total) continue;
    const sig = `${n.el.tag}.${n.el.cls.split(" ")[0] ?? ""}|${n.unit}`;
    fam.set(sig, [...(fam.get(sig) ?? []), n]);
  }
  for (const t of nums.filter((n) => n.kind === "count" && n.unit && (n.total || TOTAL_LABEL.test(n.label)))) {
    for (const [sig, parts] of fam) {
      if (!sig.endsWith("|" + t.unit)) continue;
      const ps = parts.filter((p) => p.el.i !== t.el.i && p.el.parent !== t.el.parent);
      if (new Set(ps.map((p) => p.el.i)).size < 2) continue;
      // 分项全是同一个别的标签（每行「候補 n人」）= 另一种指标的逐行值，不和这个总数比。
      const pl = new Set(ps.map((p) => labelKey(p.label)));
      if (pl.size === 1 && [...pl][0] && [...pl][0] !== labelKey(t.label)) continue;
      const sum = ps.reduce((a, p) => a + p.value, 0);
      if (sum !== t.value && t.value > Math.max(...ps.map((p) => p.value))) {
        hints.push({ rule: "sum-vs-total", message: `「${t.label} ${t.value}${t.unit}」≠ 同类分项合计 ${sum}${t.unit}（${ps.map((p) => `${p.label ? p.label + " " : ""}${p.value}${p.of !== undefined ? "/" + p.of : ""}`).join(" + ")}，${sig.split("|")[0]}）`, where: pos(t.el) });
      }
    }
  }

  // R4 同一标签在同一画板里出现不同数字
  hints.push(...conflictingLabels(nums.filter((n) => n.kind !== "select").map((n) => ({ label: n.label, unit: n.unit, value: n.value, of: n.of, where: pos(n.el), sig: `${n.el.tag}.${n.el.cls.split(" ")[0] ?? ""}` }))));
  return dedupe(hints);
}

// 同标签不同值：label + 单位相同、数值不同（分数类比较分子与分母）。跨画板也用这条（where 带画板号）。
// 带 sig 时，全部来自同一种元素（列表每行一个「候補 n人」）= 每行各自的数据，不算冲突。
export function conflictingLabels(items, rule = "same-label-different-number") {
  const by = new Map();
  for (const it of items) {
    const k = labelKey(it.label);
    if (k.length < 2 || /^\d/.test(k)) continue;
    const key = `${k}|${it.unit}`;
    by.set(key, [...(by.get(key) ?? []), it]);
  }
  const hints = [];
  for (const [key, list] of by) {
    const vals = new Set(list.map((x) => `${x.value}${x.of !== undefined ? "/" + x.of : ""}`));
    if (list.every((x) => x.sig) && new Set(list.map((x) => x.sig)).size === 1) continue;
    if (vals.size > 1) hints.push({ rule, message: `「${key.split("|")[0]}」出现不同数字：${[...vals].map((v) => v + key.split("|")[1]).join(" vs ")}`, where: list.slice(0, 4).map((x) => x.where).join("；") });
  }
  return hints;
}

const dedupe = (hints) => { const seen = new Set(); return hints.filter((h) => { const k = h.rule + h.message; if (seen.has(k)) return false; seen.add(k); return true; }); };

// ---------- 3. 数据来源清单 ----------
const EMOJI = /\p{Extended_Pictographic}/u;
// 疑似无功能：🎤 / 麦克风图标、＋ 按钮、自由输入框、装饰 emoji chip。
// 导航壳（左栏、底部 Tab、状态栏、Safari 外壳）属于 R05 / R07，默认不列；withShell 时照列。
const SHELL = /(^|\s)(side|tabbar|status|sbar|safari|home-ind|topbar)(\s|$)/;
export function dataSourceItems(elements, { withShell = false } = {}) {
  const items = [];
  const seen = new Set();
  const shell = new Set();
  if (!withShell) for (const el of elements) if (SHELL.test(el.cls) || (el.parent >= 0 && shell.has(el.parent))) shell.add(el.i);
  for (const el of elements) {
    if (shell.has(el.i)) continue;
    let kind = "";
    if (el.input) kind = "input";
    else if (el.icon && !el.own) kind = "icon";
    else if (el.own) kind = el.button ? "button" : "text";
    if (!kind) continue;
    const text = el.input ? el.placeholder || el.value || el.own : el.own || (el.icon ? el.cls : "");
    const key = `${kind}|${el.kid}|${el.cls}|${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const flags = [];
    if (/🎤|🎙|マイク|音声/.test(text) || /(^|\s)(mic|voice)(\s|$)/.test(el.cls)) flags.push("麦克风 / 语音");
    if (/^[＋+]$|^[＋+]\s/.test(text) || /(^|\s)(plus|add)(\s|$)/.test(el.cls)) flags.push("＋ 入口");
    if (kind === "input" && (/^(text|textarea|search|div|span|p)$/.test(el.input) || /(^|\s)(composer|field|textarea)(\s|$)/.test(el.cls))) flags.push("自由输入");
    if (EMOJI.test(text) && /(^|\s)(chip|tag|pill|fopt)(\s|$)/.test(el.cls)) flags.push("装饰 emoji");
    items.push({ kind, kid: el.kid, cls: el.cls, text: text.slice(0, 60), rect: el.rect, flags });
  }
  return items;
}

export function formatChecklist(boardTitle, items) {
  const lines = [`### ${boardTitle}`, "", "| ✓ | 类型 | 元素 | 文字 / 占位 | 契约字段 / 接口（实现者填） |", "| --- | --- | --- | --- | --- |"];
  for (const it of items) {
    const el = `${it.kid ? "`." + it.kid + "`" : ""}${it.cls ? " `" + it.cls.split(" ").filter((c) => c !== it.kid).slice(0, 3).join(".") + "`" : ""}`.trim();
    lines.push(`| [ ] | ${it.kind}${it.flags.length ? " ⚠" + it.flags.join("、") : ""} | ${el || "-"} | ${it.text.replace(/\|/g, "\\|") || "-"} |  |`);
  }
  return lines.join("\n");
}

// ---------- 4. 状态与断点 ----------
// 去掉画板标题里的宽度 / 主题 / 状态尾巴，得到「同一画面」的键。编号（W-R25-07 / A-R24-03b）优先。
export function screenKey(label) {
  const s = String(label ?? "");
  const code = s.match(/\b([AW])-R\d+-\d+[a-z]?/);
  if (code) return code[0].replace(/^[AW]-/, "").replace(/[a-z]$/, "");
  return s.replace(/›/g, "·").replace(/\s*[·•]?\s*(1440|1024|390|dark|ダーク|浅色|深色|大量数据|空状态|新用户空状态).*$/i, "").replace(/\s+/g, " ").trim().slice(0, 40);
}

// 同画面 = 键相同；或其他宽度的画板（b8 / b6 的 1024 / 390 标题较短）键是本画板键的前缀（「Task · プラン」⊂「Task · プラン 概要…」）。
export function findVariants(target, allBoards) {
  const key = screenKey(target.label);
  const prefix = (a, b) => a.length >= 4 && b.length > a.length && b.startsWith(a) && /^[\s·（(]/.test(b.slice(a.length));
  return allBoards.filter((b) => {
    const k = screenKey(b.label);
    return k === key || (b.kind !== target.kind && (prefix(k, key) || prefix(key, k)));
  });
}

const MID_STATE = [
  [/toast|snack/, "toast"], [/(^|\s)(sheet|wdlg|wmodal|modal|dialog|drawer|overlay|scrim|pop|popover|menu|dd)(\s|$)/, "弹层 / 抽屉 / 菜单打开"],
  [/(^|\s)(spin|spinner|loading|skel|shimmer)(\s|$)/, "加载中"], [/(^|\s)(keyboard|kb-up)(\s|$)/, "键盘弹起"], [/(^|\s)(hover|focus|pressed|is-hover)(\s|$)/, "悬停 / 焦点 / 按下"],
];
export function midStateHints(elements, label = "") {
  const hints = new Set();
  for (const el of elements) {
    for (const [re, name] of MID_STATE) if (re.test(el.cls)) hints.add(name);
    if (el.expanded) hints.add("展开中（accordion / 下拉）");
  }
  const inputs = elements.filter((e) => e.input && e.input !== "checkbox" && e.input !== "radio");
  const filled = inputs.filter((e) => e.value || (e.own && !e.placeholder));
  if (inputs.length >= 2 && filled.length && filled.length < inputs.length) hints.add(`表单只填一半（${filled.length} / ${inputs.length}）`);
  if (/中$|中（|途中|送信中|入力中|toast|展開|ホバー|押下|失败|エラー/.test(label)) hints.add(`标题提示是过程状态：${label.match(/[^ ]*(中|途中|toast|展開|ホバー|押下|失败|エラー)[^ ]*/)?.[0] ?? ""}`);
  return [...hints];
}

// ---------- 输出 ----------
const fmtVal = (v) => (v.cat === "lineHeight" || v.cat === "letterSpacing" ? String(v.value) : v.cat === "color" || v.cat === "shadow" ? v.value : `${v.value}px`);
export function formatTokenReport(rows, limit = 25) {
  const lines = [];
  const near = rows.filter((r) => r.status === "near").sort((a, b) => b.count - a.count);
  const theme = rows.filter((r) => r.status === "theme");
  const missing = rows.filter((r) => r.status === "missing").sort((a, b) => b.count - a.count);
  const tok = (r) => (r.token ? `${r.token.web} = ${r.token.value}${typeof r.token.value === "number" && r.cat !== "lineHeight" ? "px" : ""}（App ${r.token.app}）` : "无同类 token");
  lines.push(`  近似但不等 ${near.length} 项（实现最容易手抄错，先定：补 token 还是改画板）：`);
  for (const r of near.slice(0, limit)) lines.push(`    ${r.cat.padEnd(13)} ${fmtVal(r).padEnd(10)} ×${r.count}  最近 ${tok(r)}  差 ${r.diff}  例：${r.where.join("；")}`);
  if (theme.length) {
    lines.push(`  主题串色 ${theme.length} 项（本主题没有、另一主题的 token 值）：`);
    for (const r of theme.slice(0, limit)) lines.push(`    ${r.value.padEnd(24)} ×${r.count}  = ${tok(r)}  例：${r.where.join("；")}`);
  }
  // 间距单独一行：kit 的 padding / gap 大多不在 space 刻度上，逐行列会淹没别的类别。
  const space = missing.filter((r) => r.cat === "space");
  const rest = missing.filter((r) => r.cat !== "space");
  lines.push(`  缺 token ${missing.length} 项：`);
  if (space.length) lines.push(`    space（不在 --space-* 刻度 ${space.length} 个）：${space.map((r) => `${r.value}px×${r.count}`).join("、")}`);
  for (const r of rest.slice(0, limit)) lines.push(`    ${r.cat.padEnd(13)} ${fmtVal(r).padEnd(10)} ×${r.count}  ${r.props.join("/")}  最近 ${tok(r)}  例：${r.where[0]}`);
  if (rest.length > limit) lines.push(`    …另 ${rest.length - limit} 项见 --json`);
  return lines.join("\n");
}

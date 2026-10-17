// $WEB/scripts/visual/redesign-pixel-lib.mjs
// 2026-10 改版像素门禁（RD-16 修订，用户决定 2026-10-11）的共用部分：
// 参数解析、从 .env.local 读密码、PNG 缩放、整屏 raw + --grid 逐带比对 + 归因门禁。
// 比对口径与 compare-0918.mjs 完全一致（单通道差 ≥24 记一个不一致像素；逐带 ±dy 搜索取最小值），
// 区别只在归因：改版只认 `[data]`（数据文字不同）、`[raster]`（iOS 3x / Chrome 的字形、图标栅格化残差与 1–3px 折行偏移，
// 用户 2026-10-12 定、2026-10-14 进脚本）与 `[contrast]`（RD-26，2026-10-18：设计稿原色 → 实现按 RD-05 用加深文字色，
// 只限 contrast-substitutions.json 里的替换，由 checkContrastBand 逐像素判定，不是写了就算）三类理由，其余前缀一律视为未归因。
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";

// 在设计稿页面里执行（page.evaluate）：列出全部顶层画框。
// 画板 = .board（kit：board-label + 画框）。没有 .board 包裹的页面退化为「每个 .web/.phone 画框各算一块」。
export const listBoardsInPage = () => {
  const norm = (s) => (s ?? "").replace(/\s+/g, " ").trim();
  const frames = [...document.querySelectorAll(".web, .phone")].filter((f) => !f.parentElement.closest(".web, .phone"));
  return frames.map((frame, index) => {
    const board = frame.closest(".board");
    const label = board?.querySelector(".board-label");
    const section = frame.closest("section")?.querySelector("h2, h3")?.textContent;
    const kind = frame.classList.contains("phone") ? (frame.classList.contains("mweb") ? "mweb390" : "phone") : frame.classList.contains("w1024") ? "web1024" : "web";
    const r = frame.getBoundingClientRect();
    const siblings = board ? [...board.querySelectorAll(".web, .phone")].filter((f) => !f.parentElement.closest(".web, .phone")) : [frame];
    return { index, label: norm(label?.textContent) || "(无标签)", section: norm(section), kind, theme: frame.getAttribute("data-theme") || "", size: [Math.round(r.width), Math.round(r.height)], frameInBoard: siblings.indexOf(frame) };
  });
};

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const cur = argv[i];
    if (!cur.startsWith("--")) continue;
    const key = cur.slice(2);
    const next = argv[i + 1];
    const value = next !== undefined && !next.startsWith("--") ? next : "true";
    // 同名参数可重复（--design-remove / --app-remove / --click），重复时收成数组。
    if (key in out) out[key] = [].concat(out[key], value);
    else out[key] = value;
  }
  return out;
}

export const many = (value) => (value === undefined ? [] : [].concat(value));

// 密码只从环境变量或 .env.local 读，从不接受命令行明文，也从不打印。
export function readSecret(name, envFile) {
  if (process.env[name]) return process.env[name];
  if (envFile && existsSync(envFile)) {
    for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && m[1] === name) return m[2].replace(/^['"]|['"]$/g, "");
    }
  }
  return null;
}

export function readPng(file) {
  return PNG.sync.read(readFileSync(file));
}

export function writePng(file, png) {
  writeFileSync(file, PNG.sync.write(png));
}

// 面积平均缩放（box filter）：模拟器 @3x 截图缩到设计点宽时用。只缩不放时最准。
export function resize(src, width, height) {
  const dst = new PNG({ width, height });
  const sx = src.width / width;
  const sy = src.height / height;
  for (let y = 0; y < height; y++) {
    const y0 = y * sy;
    const y1 = Math.min(src.height, (y + 1) * sy);
    for (let x = 0; x < width; x++) {
      const x0 = x * sx;
      const x1 = Math.min(src.width, (x + 1) * sx);
      let r = 0, g = 0, b = 0, a = 0, w = 0;
      for (let yy = Math.floor(y0); yy < Math.ceil(y1); yy++) {
        const wy = Math.min(yy + 1, y1) - Math.max(yy, y0);
        for (let xx = Math.floor(x0); xx < Math.ceil(x1); xx++) {
          const wx = Math.min(xx + 1, x1) - Math.max(xx, x0);
          const k = wx * wy;
          const i = (yy * src.width + xx) * 4;
          r += src.data[i] * k; g += src.data[i + 1] * k; b += src.data[i + 2] * k; a += src.data[i + 3] * k; w += k;
        }
      }
      const o = (y * width + x) * 4;
      dst.data[o] = Math.round(r / w); dst.data[o + 1] = Math.round(g / w); dst.data[o + 2] = Math.round(b / w); dst.data[o + 3] = Math.round(a / w);
    }
  }
  return dst;
}

// 裁成 width × height（超出的部分丢掉，不足的部分不补）。
export function crop(src, x, y, width, height) {
  if (x < 0 || y < 0 || x >= src.width || y >= src.height) throw Object.assign(new Error(`裁剪框 ${x},${y},${width},${height} 在图外（图 ${src.width}x${src.height}）`), { code: 2 });
  const w = Math.min(width, src.width - x);
  const h = Math.min(height, src.height - y);
  const dst = new PNG({ width: w, height: h });
  for (let yy = 0; yy < h; yy++) {
    src.data.copy(dst.data, yy * w * 4, ((y + yy) * src.width + x) * 4, ((y + yy) * src.width + x + w) * 4);
  }
  return dst;
}

// --region "x,y,w,h"（R31a）：整数坐标，单位与比对图一致（Web = CSS px；App 整屏画板 = 设计点（截图缩到 390 宽）；
// App 规格格 = 设备点，不缩放）。弹层随屏幕尺寸定位时 x 可写 c（水平居中）、y 可写 c（垂直居中）或 b（贴底），
// 按 screen = { width, height } 换算（App 用设备点，iPhone 16e 390×844、17 Pro 402×874 都对）。
export function parseRegion(value, screen) {
  const parts = String(value).split(",").map((s) => s.trim());
  if (parts.length !== 4 || parts.some((p, i) => p === "" || (Number.isNaN(Number(p)) && !((i === 0 && p === "c") || (i === 1 && (p === "c" || p === "b")))))) throw Object.assign(new Error(`--region 要写成 x,y,w,h（x 可为 c，y 可为 c / b）：${value}`), { code: 2 });
  if ((parts[0] === "c" || parts[1] === "c" || parts[1] === "b") && !screen) throw Object.assign(new Error(`--region 用了 c / b，需要屏幕尺寸：${value}`), { code: 2 });
  const [w, h] = [Number(parts[2]), Number(parts[3])];
  if (parts[0] === "c") parts[0] = String(Math.round((screen.width - w) / 2));
  if (parts[1] === "c") parts[1] = String(Math.round((screen.height - h) / 2));
  if (parts[1] === "b") parts[1] = String(screen.height - h);
  const nums = parts.map(Number);
  if (nums.some((n) => !Number.isInteger(n))) throw Object.assign(new Error(`--region 只收整数坐标（小节画在整数坐标上）：${value}`), { code: 2 });
  if (nums[2] <= 0 || nums[3] <= 0) throw Object.assign(new Error(`--region 宽高要大于 0：${value}`), { code: 2 });
  return nums;
}

// 分侧裁剪：只给 region 时两侧同一块（Web 导航壳分件验收的老用法）；另给 designRegion 时设计侧按它裁、实现侧按 region 裁
// （App 展示页小节的 rect 与设计稿规格格 / 画板区域不在同一位置；DEFERRED-A R30-02「两侧同一区域」也是这个缺口）。
export function cropPair({ design, app, region, designRegion }) {
  const d = designRegion ?? region;
  return {
    design: d ? crop(design, ...d) : design,
    app: region ? crop(app, ...region) : app,
  };
}

const differs = (a, ai, b, bi) =>
  Math.abs(a.data[ai] - b.data[bi]) >= 24 ||
  Math.abs(a.data[ai + 1] - b.data[bi + 1]) >= 24 ||
  Math.abs(a.data[ai + 2] - b.data[bi + 2]) >= 24;

// 整屏 raw + 可选 --grid 逐带比对 + 归因门禁。
// 返回 { raw, height, overBands, unattributed, cells, exitCode }；diff.png / cells.json / result.json 写进 out。
/** The attribution prefix of a band reason (`[data]` / `[raster]` / `[contrast]`), or null for anything else. */
export function reasonPrefix(reason) {
  if (typeof reason !== "string") return null;
  const text = reason.trim();
  return ["[data]", "[raster]", "[contrast]"].find((p) => text.startsWith(p)) ?? null;
}
/** The prefixes accepted as written (`[data]` / `[raster]`); `[contrast]` is accepted only after checkContrastBand. */
export function acceptedReason(reason) {
  const p = reasonPrefix(reason);
  return p === "[data]" || p === "[raster]" ? p : null;
}

// ---------- [contrast] 归因（RD-26，R31a）----------
// 允许的替换在 contrast-substitutions.json（设计原色 → 实现加深文字色，同一底色）；颜色值按主题从 tokens.json 取。
// 判定：标 [contrast] 的带里每个不一致像素（与门禁同口径：单通道差 ≥24，按该带的最佳 dy 对齐），找一条替换与一个 α，
// 使「设计像素 ≈ 原色与底色按 α 混合」且「实现像素 ≈ 加深色与同一底色按同一 α 混合」（两侧 ΔE76 都 ≤ 容差）；
// 解释不了的像素超过带内不一致像素的 5% 就判该带不通过。三个常量改动要写进 REPORT。
export const CONTRAST_DELTA_E = 4; // ΔE76 容差（两侧各自）
export const CONTRAST_ALPHA_STEPS = 64; // α 取 0, 1/64, …, 1
export const CONTRAST_MAX_UNEXPLAINED = 0.05; // 带内不一致像素里解释不了的比例上限
const LIB_DIR = new URL(".", import.meta.url).pathname;
export const CONTRAST_SUBSTITUTIONS_FILE = join(LIB_DIR, "contrast-substitutions.json");
export const TOKENS_FILE = join(LIB_DIR, "../../shared/design/tokens.json");

/** "#RRGGBB" / "rgb(…)" / "rgba(…)"（不透明部分）→ [r, g, b]；解析不了返回 null。 */
export function parseColor(value) {
  const v = String(value ?? "").trim();
  let m = v.match(/^#([0-9a-f]{6})$/i);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = v.match(/^#([0-9a-f]{3})$/i);
  if (m) return [...m[1]].map((c) => parseInt(c + c, 16));
  m = v.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  return m ? [m[1], m[2], m[3]].map((n) => Math.round(Number(n))) : null;
}

/** 替换清单 × 主题 → 颜色三元组；两侧同色（深色主题里常见：加深版就是原值）的条目解释不了任何差异，丢掉。 */
export function resolveContrastSubstitutions(list, tokens, theme) {
  const palette = tokens.color[theme === "dark" ? "dark" : "light"];
  const out = [];
  for (const s of list.substitutions ?? []) {
    const [design, impl, bg] = [s.design, s.impl, s.bg].map((name) => parseColor(palette[name]));
    if (!design || !impl || !bg) continue;
    if (design.every((v, i) => v === impl[i])) continue;
    out.push({ label: `${s.design}→${s.impl} on ${s.bg}`, design, impl, bg });
  }
  return out;
}

export function loadContrastContext(theme, { substitutionsFile = CONTRAST_SUBSTITUTIONS_FILE, tokensFile = TOKENS_FILE } = {}) {
  const list = JSON.parse(readFileSync(substitutionsFile, "utf8"));
  const tokens = JSON.parse(readFileSync(tokensFile, "utf8"));
  return { theme, subs: resolveContrastSubstitutions(list, tokens, theme) };
}

const srgbToLab = ([r, g, b]) => {
  const f = (c) => { c /= 255; return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92; };
  const [R, G, B] = [f(r), f(g), f(b)];
  const xyz = [(R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, R * 0.2126 + G * 0.7152 + B * 0.0722, (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883];
  const t = xyz.map((v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116));
  return [116 * t[1] - 16, 500 * (t[0] - t[1]), 200 * (t[1] - t[2])];
};
const labDist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const contrastLadders = new WeakMap();
function ladderOf(sub, steps) {
  let cached = contrastLadders.get(sub);
  if (cached?.steps === steps) return cached.rungs;
  const rungs = [];
  for (let k = 0; k <= steps; k++) {
    const a = k / steps;
    const mixOf = (fg) => fg.map((v, i) => Math.round(v * a + sub.bg[i] * (1 - a)));
    rungs.push([srgbToLab(mixOf(sub.design)), srgbToLab(mixOf(sub.impl))]);
  }
  contrastLadders.set(sub, { steps, rungs });
  return rungs;
}

/** 判一条带能否归因为 [contrast]。返回 { diff, explained, unexplained, ratio, pass, bySub }。 */
export function checkContrastBand({ design, app, y0, y1, dy = 0, subs, deltaE = CONTRAST_DELTA_E, steps = CONTRAST_ALPHA_STEPS, maxUnexplained = CONTRAST_MAX_UNEXPLAINED }) {
  const width = Math.min(design.width, app.width);
  const ladders = subs.map((s) => ladderOf(s, steps));
  const bySub = new Map();
  let diff = 0, explained = 0;
  for (let y = y0; y < Math.min(y1, design.height); y++) {
    const ay = y + dy;
    if (ay < 0 || ay >= app.height) continue;
    for (let x = 0; x < width; x++) {
      const di = (y * design.width + x) * 4, ai = (ay * app.width + x) * 4;
      if (!differs(design, di, app, ai)) continue;
      diff++;
      const dl = srgbToLab([design.data[di], design.data[di + 1], design.data[di + 2]]);
      const al = srgbToLab([app.data[ai], app.data[ai + 1], app.data[ai + 2]]);
      let hit = -1;
      for (let s = 0; s < ladders.length && hit < 0; s++) for (const [dRung, aRung] of ladders[s]) if (labDist(dl, dRung) <= deltaE && labDist(al, aRung) <= deltaE) { hit = s; break; }
      if (hit >= 0) { explained++; bySub.set(subs[hit].label, (bySub.get(subs[hit].label) ?? 0) + 1); }
    }
  }
  const unexplained = diff - explained;
  const ratio = diff === 0 ? 0 : unexplained / diff;
  return { diff, explained, unexplained, ratio: Number(ratio.toFixed(4)), pass: ratio <= maxUnexplained, bySub: Object.fromEntries(bySub) };
}

export function compareImages({ design, app, out, grid, gridDy = 12, threshold = 0.02, rawThreshold = 0.02, attributionPath, viewKey, contrast, meta = {} }) {
  const width = Math.min(design.width, app.width);
  const h = Math.min(design.height, app.height);
  const diff = new PNG({ width, height: h });
  let bad = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < width; x++) {
      const di = (y * design.width + x) * 4;
      const ai = (y * app.width + x) * 4;
      const oi = (y * width + x) * 4;
      const same = !differs(design, di, app, ai);
      if (!same) bad++;
      diff.data[oi] = same ? app.data[ai] : 255;
      diff.data[oi + 1] = same ? app.data[ai + 1] : 0;
      diff.data[oi + 2] = same ? app.data[ai + 2] : 0;
      diff.data[oi + 3] = 255;
    }
  }
  writePng(join(out, "diff.png"), diff);
  writePng(join(out, "triptych.png"), triptych(design, app, diff, Number(meta.triptychScale ?? (width > 600 ? 0.5 : 1))));
  // 高度不同本身就是差异：多出来的那一截全部按不一致计入分母与分子（compare-0918 只取较短一侧，
  // 会让「实现少了一整段」的屏数字反而更好看）。
  const tallest = Math.max(design.height, app.height);
  const raw = (bad + width * (tallest - h)) / (width * tallest);
  const result = { ...meta, raw: Number(raw.toFixed(4)), rawCommonHeight: Number((bad / (width * h)).toFixed(4)), designSize: [design.width, design.height], appSize: [app.width, app.height] };

  let exitCode = raw > rawThreshold ? 6 : 0;
  if (grid) {
    const band = Math.max(20, Number(grid) || 100);
    const mismatchOfBand = (y0, y1, dy) => {
      let miss = 0, counted = 0;
      for (let y = y0; y < y1; y++) {
        const ay = y + dy;
        if (ay < 0 || ay >= app.height) continue;
        for (let x = 0; x < width; x++) {
          counted++;
          if (differs(design, (y * design.width + x) * 4, app, (ay * app.width + x) * 4)) miss++;
        }
      }
      return counted === 0 ? 1 : miss / counted;
    };
    const cells = [];
    // 带按设计稿高度切：设计稿比实现长的那一截（实现缺内容）也要成带、判 1。
    for (let index = 0, y0 = 0; y0 < design.height; index++, y0 += band) {
      const y1 = Math.min(y0 + band, design.height);
      let best = { dy: 0, mismatch: mismatchOfBand(y0, y1, 0) };
      for (let dy = -gridDy; dy <= gridDy; dy++) {
        if (dy === 0) continue;
        const v = mismatchOfBand(y0, y1, dy);
        if (v < best.mismatch) best = { dy, mismatch: v };
      }
      cells.push({ band: index, y0, y1, dy: best.dy, mismatch: Number(best.mismatch.toFixed(4)) });
    }
    let attribution = {};
    if (attributionPath) {
      const all = JSON.parse(readFileSync(attributionPath, "utf8"));
      attribution = all[viewKey] ?? {};
    }
    // RD-16 修订：只有 `[data]` / `[raster]` 开头的理由算数；`[recorded]` / `[shared]` 这类 0918 时代的放行理由一律不认。
    // RD-26：`[contrast]` 另经 checkContrastBand 逐像素判定（没有主题 / 替换清单时一律不认）。
    const over = cells.filter((c) => c.mismatch > threshold);
    const verdicts = {};
    for (const c of over) {
      const reason = attribution[String(c.band)];
      const prefix = reasonPrefix(reason);
      if (prefix === "[contrast]") {
        const ctx = contrast ?? (meta.theme ? loadContrastContext(meta.theme) : null);
        const check = ctx ? checkContrastBand({ design, app, y0: c.y0, y1: c.y1, dy: c.dy, subs: ctx.subs }) : null;
        c.contrast = check;
        verdicts[c.band] = check?.pass ? { ok: true, status: "[contrast]" } : { ok: false, status: check ? `[contrast]✗ 解释不了 ${(check.ratio * 100).toFixed(1)}%（${check.unexplained}/${check.diff}px）` : "[contrast]✗ 没有主题，无法判定" };
      } else verdicts[c.band] = reason === undefined ? { ok: false, status: "未归因" } : prefix ? { ok: true, status: prefix } : { ok: false, status: "理由无效" };
    }
    const unattributed = over.filter((c) => !verdicts[c.band].ok);
    const sorted = [...cells].sort((a, b) => b.mismatch - a.mismatch);
    writeFileSync(join(out, "cells.json"), `${JSON.stringify({ band, maxDy: gridDy, threshold, view: viewKey, width, designHeight: design.height, appHeight: app.height, cells: sorted }, null, 2)}\n`);
    Object.assign(result, { band, cells: cells.length, overBands: over.length, unattributed: unattributed.length, overList: over.map((c) => `#${c.band}@${c.y0}-${c.y1}:${c.mismatch}`) });
    result.bandsReport = bandReport({ design, app, cells, threshold, attribution, verdicts, out, crop: meta.crop === true });
    if (unattributed.length > 0 && exitCode === 0) exitCode = 5;
    if (unattributed.length > 0) result.gate = "fail";
  }
  result.missing = missingBlocks(design, app);
  result.pass = exitCode === 0;
  writeFileSync(join(out, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
  return { ...result, exitCode };
}

// 设计 | 实现 | diff 三联图（默认半尺寸），给对照页和人工阅读用。
export function triptych(design, app, diff, scale = 0.5) {
  const parts = [design, app, diff].map((p) => (scale === 1 ? p : resize(p, Math.max(1, Math.round(p.width * scale)), Math.max(1, Math.round(p.height * scale)))));
  const gap = 12;
  const w = parts.reduce((a, p) => a + p.width, 0) + gap * 2;
  const h = Math.max(...parts.map((p) => p.height));
  const outPng = new PNG({ width: w, height: h });
  outPng.data.fill(0x88);
  let x0 = 0;
  for (const p of parts) {
    for (let y = 0; y < p.height; y++) p.data.copy(outPng.data, (y * w + x0) * 4, y * p.width * 4, (y + 1) * p.width * 4);
    x0 += p.width + gap;
  }
  return outPng;
}

// ---------- 缺块检测（R07 复核 M6）----------
// 「设计稿这块有内容、实现这块是空的」：整块缺控件时 raw 可能很低（白底上一个白框差不了几个像素），
// 所以单独按小方块找：设计侧有墨（与该块主色差 ≥24 的像素 ≥ minInk），实现侧几乎没有（≤ maxInk）。
// 相邻的缺块合并成矩形返回；只报警，不改退出码。
function inkOf(png, x0, y0, w, h) {
  const hist = new Map();
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const i = (y * png.width + x) * 4;
    const k = ((png.data[i] >> 4) << 8) | ((png.data[i + 1] >> 4) << 4) | (png.data[i + 2] >> 4);
    hist.set(k, (hist.get(k) ?? 0) + 1);
  }
  let mode = 0, best = -1;
  for (const [k, n] of hist) if (n > best) { best = n; mode = k; }
  const bg = [((mode >> 8) & 15) * 16 + 8, ((mode >> 4) & 15) * 16 + 8, (mode & 15) * 16 + 8];
  let ink = 0;
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const i = (y * png.width + x) * 4;
    if (Math.abs(png.data[i] - bg[0]) >= 24 || Math.abs(png.data[i + 1] - bg[1]) >= 24 || Math.abs(png.data[i + 2] - bg[2]) >= 24) ink++;
  }
  return ink / (w * h);
}

export function missingBlocks(design, app, { tile = 24, minInk = 0.06, maxInk = 0.01, minDiff = 0.1 } = {}) {
  const width = Math.min(design.width, app.width);
  const height = Math.min(design.height, app.height);
  const hits = [];
  for (let y = 0; y + tile <= height; y += tile) for (let x = 0; x + tile <= width; x += tile) {
    if (inkOf(design, x, y, tile, tile) < minInk || inkOf(app, x, y, tile, tile) > maxInk) continue;
    // 两边主色不同（深色细边、渐变）也会让一侧「有墨」：再要求这块里真正不一致的像素够多。
    let miss = 0;
    for (let yy = y; yy < y + tile; yy++) for (let xx = x; xx < x + tile; xx++) if (differs(design, (yy * design.width + xx) * 4, app, (yy * app.width + xx) * 4)) miss++;
    if (miss / (tile * tile) >= minDiff) hits.push({ x, y });
  }
  // 合并：同一行相邻的方块连成段，再把上下相接、横向重叠的段并成矩形。
  const rects = [];
  for (const h of hits) {
    const r = rects.find((r) => h.x >= r.x - tile && h.x <= r.x + r.w && h.y >= r.y && h.y <= r.y + r.h);
    if (r) { const x1 = Math.max(r.x + r.w, h.x + tile); const y1 = Math.max(r.y + r.h, h.y + tile); r.x = Math.min(r.x, h.x); r.w = x1 - r.x; r.h = y1 - r.y; }
    else rects.push({ x: h.x, y: h.y, w: tile, h: tile });
  }
  return rects.sort((a, b) => b.w * b.h - a.w * a.h);
}

// ---------- 设计稿截图缓存 ----------
// 键 = 画板 + 设计文件与 kit 目录的内容哈希 + 宽度 + 主题 + 截图参数（+ 渲染高度）。设计稿没改就直接复用截图，
// 不再开设计稿页面（每张省 3–5 秒：页面加载 + 字体 + 1.6s 动画等待）。缓存放在证据目录下，不进仓库。
export const DESIGN_CACHE_DIR = join(process.env.HOME ?? ".", "orbit-sprint-evidence/redesign/.design-cache");
const hashMemo = new Map();
export function designInputsHash(designDir, designFile) {
  const key = `${designDir}|${designFile}`;
  if (hashMemo.has(key)) return hashMemo.get(key);
  const files = [join(designDir, designFile)];
  const kit = join(designDir, "kit");
  if (existsSync(kit)) for (const f of readdirSync(kit, { recursive: true })) { const p = join(kit, String(f)); if (statSync(p).isFile()) files.push(p); }
  const h = createHash("sha1");
  for (const f of files.sort()) { if (!existsSync(f)) return null; h.update(f.slice(designDir.length)); h.update(readFileSync(f)); }
  const digest = h.digest("hex").slice(0, 16);
  hashMemo.set(key, digest);
  return digest;
}

export function designCache(parts) {
  const base = createHash("sha1").update(JSON.stringify(parts)).digest("hex").slice(0, 20);
  mkdirSync(DESIGN_CACHE_DIR, { recursive: true });
  const metaFile = join(DESIGN_CACHE_DIR, `${base}.json`);
  const pngFile = (height) => join(DESIGN_CACHE_DIR, `${base}-${height}.png`);
  return {
    meta: () => (existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, "utf8")) : null),
    saveMeta: (meta) => writeFileSync(metaFile, `${JSON.stringify(meta)}\n`),
    png: (height) => (existsSync(pngFile(height)) ? readPng(pngFile(height)) : null),
    savePng: (height, src) => copyFileSync(src, pngFile(height)),
  };
}

// ---------- 画面清单（--suite）与筛选（--only / --changed）----------
// 清单 = { defaults: {...}, sources: [所有画面共用的源文件], views: [{ id, width, themes?, sources?, ...单张参数 }] }。
// 每个画面按主题展开成「<id>-<width>-<theme>」（就是归因文件的键）。sources 用 glob（** / *），相对仓库根。
export function loadSuite(file) {
  const suite = JSON.parse(readFileSync(file, "utf8"));
  const runs = [];
  for (const v of suite.views) {
    const merged = { ...(suite.defaults ?? {}), ...v };
    for (const theme of merged.themes ?? ["light", "dark"]) {
      // R31a：实现路由里的 {theme}（展示页小节 `?theme={theme}`）按主题展开。
      const filled = Object.fromEntries(["path", "url", "app"].filter((k) => typeof merged[k] === "string").map((k) => [k, merged[k].replaceAll("{theme}", theme)]));
      runs.push({ ...merged, ...filled, theme, key: `${v.id}-${merged.width ?? "app"}-${theme}`, sources: [...(suite.sources ?? []), ...(v.sources ?? [])] });
    }
  }
  return runs;
}

const globRe = (glob) => new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*\/?/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*")}$`);
export const matchesAny = (file, globs) => globs.some((g) => globRe(g).test(file));

// --only a,b：画面编号前缀（W-R07-01L 命中它的所有宽度和主题；W-R07-01L-1024 只命中 1024）。
export function selectOnly(runs, only) {
  const tokens = String(only).split(",").map((s) => s.trim()).filter(Boolean);
  return runs.filter((r) => tokens.some((t) => r.key === t || r.key.startsWith(`${t}-`)));
}

// --changed [ref]：工作区改动（暂存 + 未暂存 + 未跟踪）与 ref...HEAD 的改动，命中画面的 sources 或它的设计稿就跑。
export function changedFiles(ref, cwd) {
  const git = (...a) => execFileSync("git", a, { cwd, encoding: "utf8" }).split("\n").filter(Boolean);
  const files = new Set([...git("diff", "--name-only", "HEAD"), ...git("ls-files", "--others", "--exclude-standard", "--full-name")]);
  if (ref && ref !== "true") for (const f of git("diff", "--name-only", `${ref}...HEAD`)) files.add(f);
  return [...files];
}

export function selectChanged(runs, files, designRoot) {
  return runs.filter((r) => {
    const own = [...r.sources];
    if (r.design && !/^https?:/.test(r.design)) own.push(`${designRoot}/${r.design}`, `${designRoot}/kit/**`);
    return files.some((f) => matchesAny(f, own));
  });
}

// 并行跑 items（最多 n 个同时），保持结果顺序。
export async function pool(items, n, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
    while (next < items.length) { const i = next++; results[i] = await fn(items[i], i); }
  }));
  return results;
}

// 终端摘要：每个画面一行（raw、超阈带、未归因带、缺块、耗时、triptych 路径），末尾汇总。
export function printSummary(results, { file } = {}) {
  const pad = (s, n) => String(s).padEnd(n);
  const w = Math.max(12, ...results.map((r) => r.key.length));
  console.log(`\n${pad("画面", w)}  结果  raw     超阈 未归因 缺块  耗时   证据目录（triptych 等图按需看）`);
  for (const r of results) {
    const status = r.error ? "ERR " : r.pass ? "PASS" : "FAIL";
    const miss = r.missing?.length ? `⚠${r.missing.length}` : "-";
    console.log(`${pad(r.key, w)}  ${status}  ${pad(r.raw ?? "-", 6)}  ${pad(r.overBands ?? "-", 4)} ${pad(r.unattributed ?? "-", 6)} ${pad(miss, 5)} ${pad(`${(r.ms / 1000).toFixed(1)}s`, 6)} ${r.error ? r.error : r.out ?? ""}`);
  }
  const pass = results.filter((r) => r.pass).length;
  const warn = results.filter((r) => r.missing?.length);
  console.log(`\n合计 ${results.length} 张：通过 ${pass}、不通过 ${results.length - pass}` + (warn.length ? `；⚠ 缺块 ${warn.length} 张（设计稿有内容、实现那块是空的，请看 triptych）：${warn.map((r) => r.key).join(", ")}` : ""));
  if (file) writeFileSync(file, `${JSON.stringify(results, null, 2)}\n`);
}

// ---------- App 画板的字体（R05 发现，2026-10-12）----------
// kit 的字体栈以 `-apple-system` 开头，这是 Safari / iOS 专用名，Chrome 不认：设计稿在 Playwright Chrome 里
// 英文和数字整个退到 Hiragino Sans（CDP：「CFO Night Tokyo」= HiraginoSans-W6），比 iOS 真机的 SF 宽一截。
// iOS 上同一个栈英文、数字走 SF，假名汉字走 Hiragino（拍板①的意图）。在 `-apple-system` 前插入 Chrome 的同义名
// BlinkMacSystemFont（macOS 系统 SF；CDP 核实英文变 .SFNS-*，假名仍 HiraginoSans-*）。「SF Pro Rounded」本机没有，
// 数字照旧退到下一项（现在是 SF）。版本号进设计稿缓存键，改了映射旧截图自动作废。
export const APP_DESIGN_FONT_FIX = "sf-latin-1";
export const appDesignFontFix = () => {
  const root = getComputedStyle(document.documentElement);
  const css = ["--font", "--font-num"].map((name) => {
    const value = root.getPropertyValue(name).trim();
    return value && !/BlinkMacSystemFont/.test(value) ? `${name}: ${value.replace("-apple-system", "BlinkMacSystemFont, -apple-system")} !important;` : "";
  }).join(" ");
  const style = document.createElement("style");
  style.textContent = `:root, [data-theme] { ${css} }`;
  document.head.append(style);
};

// 在设计稿页面里执行（frame.evaluate）：把画框搬到页面左上角 (0, 0) 再截。
// 画框原位的页面坐标常是小数（app.html .phone 的 top = 367.75 / 1563.5…），截出来 390×845、底部元素整体低 1px；
// 搬到原点后坐标是整数（R07 返工 Web 同类问题，2026-10-12 R05 在 App 画板上发现）。b12 等按分组类名写嵌套样式，
// 所以用「同名类的空壳」复刻祖先链包住画框（只留类名，布局、边距、背景清掉）；其余内容隐藏。
export const moveFrameToTop = (f) => {
  const chain = [];
  for (let el = f.parentElement; el && el !== document.body; el = el.parentElement) chain.push(el.className);
  let wrapped = f;
  f.replaceWith(document.createElement("div"));
  for (const cls of chain) {
    const shell = document.createElement("div");
    shell.className = cls;
    Object.assign(shell.style, { display: "block", padding: "0", margin: "0", gap: "0", border: "0", minWidth: "0", background: "none" });
    shell.append(wrapped);
    wrapped = shell;
  }
  document.body.prepend(wrapped);
  Object.assign(document.body.style, { padding: "0", margin: "0" });
  for (const el of document.body.children) if (el !== wrapped && !["SCRIPT", "STYLE", "LINK", "TEMPLATE"].includes(el.tagName)) el.style.display = "none";
  window.scrollTo(0, 0);
};

// ---------- 逐件对照：01-system 规格格（R31a 契约 §1）----------
// 在设计稿页面里执行（page.evaluate），自包含。arg = { section, theme, cell?, stage? }：
//   section：sec2 的 id（c-toast … n-add），或小节标题（h2）子串（第一部分的小节没有 id）；
//   不带 cell → 列出该小节全部「格」；带 cell → 准备第 cell 格（套主题、整数对齐）并返回裁剪框。
// 「格」的顺序：小节标题之后、下一个小节标题之前的每个 .comp 演示区（.comp > div:first-child，不含 .doccard），
//   演示区有 .duo → 取 .stage[data-theme=<theme>]，里面每个 .cell 一格，没有 .cell 时整块 stage 内容算一格（kind stage）；
//   演示区没有 .duo → 每个 .cell 一格（kind cell），没有 .cell 时整个演示区一格（kind demo）。
// 裁剪框 = 格里除标题（.cap / .stage-t）外的内容的外接矩形（页面坐标）。含 mini()（transform: scale）的格标 mini，准备时拒绝（缩放格不比）。
// stage = "flat"（默认）：把 .stage 的雾面渐变换成纯 --bg —— 那是文档页的展示底，不是组件；"keep" 保留原样。
export const specCellsInPage = (arg) => {
  const { section, theme = "light", cell, stage = "flat" } = arg;
  const norm = (s) => (s ?? "").replace(/\s+/g, " ").trim();
  const titles = [...document.querySelectorAll(".section-title")];
  const head = titles.find((t) => t.id === section) ?? titles.find((t) => norm(t.querySelector("h2")?.textContent).includes(section));
  if (!head) return null;
  const units = [];
  const topCells = (root) => [...root.querySelectorAll(".cell")].filter((c) => !c.parentElement.closest(".cell") || !root.contains(c.parentElement.closest(".cell")));
  // 小节范围按文档顺序取（第二部分整体包在 .ds 里，不是第一部分标题的兄弟）：标题之后、下一个小节标题之前的最外层 .comp。
  const next = titles[titles.indexOf(head) + 1];
  const inRange = (el) => (head.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) && (!next || (el.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING));
  const comps = [...document.querySelectorAll(".comp")].filter((c) => inRange(c) && !c.parentElement.closest(".comp"));
  {
    for (const comp of comps) {
      const demo = comp.querySelector(":scope > div:first-child");
      if (!demo) continue;
      const stageEl = demo.querySelector(`.duo > .stage[data-theme="${theme}"]`);
      const host = stageEl ?? demo;
      const cells = topCells(host);
      if (cells.length) for (const c of cells) units.push({ el: c, stageEl, kind: "cell", cap: norm(c.querySelector(":scope > .cap")?.textContent), skip: ".cap" });
      else units.push({ el: host, stageEl, kind: stageEl ? "stage" : "demo", cap: "", skip: ".stage-t" });
    }
  }
  const rectOf = (u) => {
    const parts = [...u.el.children].filter((c) => !c.matches(u.skip));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of parts) { const r = p.getBoundingClientRect(); if (!r.width && !r.height) continue; x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top); x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom); }
    return x0 === Infinity ? [0, 0, 0, 0] : [x0 + window.scrollX, y0 + window.scrollY, x1 - x0, y1 - y0];
  };
  const listed = units.map((u, index) => ({ index, kind: u.kind, cap: u.cap, mini: !!u.el.querySelector(".mini"), themed: !!u.stageEl, rect: rectOf(u) }));
  if (cell === undefined) return { section: head.id || norm(head.querySelector("h2")?.textContent), units: listed };
  const u = units[Number(cell)];
  if (!u) throw new Error(`格序号 ${cell} 超出：小节 ${section} 只有 ${units.length} 格（--list-cells 看清单）`);
  if (listed[Number(cell)].mini) throw new Error(`第 ${cell} 格含 mini()（transform: scale 缩放示意），缩放格不比`);
  if (u.stageEl) { if (stage !== "keep") u.stageEl.style.background = "var(--bg)"; }
  else { u.el.setAttribute("data-theme", theme); u.el.style.background = "var(--bg)"; }
  // 整数对齐：画框原位常在小数坐标（1x 缩放后边缘一律半像素灰边），把文档容器按小数部分挪过去（只挪位置，不改宽度与排版）。
  const doc = u.el.closest(".doc") ?? document.body;
  for (let i = 0; i < 4; i++) {
    const [x, y] = rectOf(u);
    const fx = x - Math.floor(x), fy = y - Math.floor(y);
    if (fx < 0.005 && fy < 0.005) break;
    const cs = getComputedStyle(doc);
    if (fx >= 0.005) { doc.style.marginLeft = `${parseFloat(cs.marginLeft) + (1 - fx)}px`; doc.style.marginRight = "0"; }
    if (fy >= 0.005) doc.style.marginTop = `${parseFloat(cs.marginTop) + (1 - fy)}px`;
  }
  const [x, y, w, h] = rectOf(u);
  return { section: head.id, index: Number(cell), kind: u.kind, cap: u.cap, rect: [Math.round(x), Math.round(y), Math.round(w), Math.round(h)], subpixel: [x, y, w, h] };
};
export const listSpecCellsInPage = specCellsInPage;
export const prepareSpecCellInPage = specCellsInPage;

// ---------- 省额度：超阈带的文字结论（用户 2026-10-12 决定）----------
// 每条超阈带：带号、y 范围、mismatch、偏移估计（墨迹的行 / 列投影互相关，±12px 内取最小误差）、两边主色（hex）与 ΔE、归因状态。
// 先读这张表，按需才看图；--crop 时把每条超阈带裁成「设计 / 实现 / diff」竖排小图存进 <out>/bands/。
const hex = ([r, g, b]) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
function dominant(png, y0, y1, width) {
  const hist = new Map();
  for (let y = y0; y < Math.min(y1, png.height); y++) for (let x = 0; x < width; x++) {
    const i = (y * png.width + x) * 4;
    const k = ((png.data[i] >> 3) << 10) | ((png.data[i + 1] >> 3) << 5) | (png.data[i + 2] >> 3);
    hist.set(k, (hist.get(k) ?? 0) + 1);
  }
  const sorted = [...hist].sort((a, b) => b[1] - a[1]);
  const color = (k) => [((k >> 10) & 31) * 8 + 4, ((k >> 5) & 31) * 8 + 4, (k & 31) * 8 + 4];
  return { bg: color(sorted[0]?.[0] ?? 0), ink: color(sorted.find(([k]) => { const c = color(k), b = color(sorted[0][0]); return Math.max(...c.map((v, j) => Math.abs(v - b[j]))) >= 48; })?.[0] ?? sorted[0]?.[0] ?? 0) };
}
// CIE76 ΔE（sRGB → Lab），够用来判断「颜色真的不一样」还是「抗锯齿」。
function deltaE(a, b) {
  const lab = ([r, g, b]) => {
    const f = (c) => { c /= 255; return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92; };
    const [R, G, B] = [f(r), f(g), f(b)];
    const xyz = [(R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, R * 0.2126 + G * 0.7152 + B * 0.0722, (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883];
    const t = xyz.map((v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116));
    return [116 * t[1] - 16, 500 * (t[0] - t[1]), 200 * (t[1] - t[2])];
  };
  const [x, y] = [lab(a), lab(b)];
  return Math.round(Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) * 10) / 10;
}
// 墨迹投影：每行 / 每列「与主色差 ≥24」的像素数。
function projections(png, y0, y1, width, bg) {
  const rows = new Array(y1 - y0).fill(0), cols = new Array(width).fill(0);
  for (let y = y0; y < Math.min(y1, png.height); y++) for (let x = 0; x < width; x++) {
    const i = (y * png.width + x) * 4;
    if (Math.abs(png.data[i] - bg[0]) >= 24 || Math.abs(png.data[i + 1] - bg[1]) >= 24 || Math.abs(png.data[i + 2] - bg[2]) >= 24) { rows[y - y0]++; cols[x]++; }
  }
  return { rows, cols };
}
function bestShift(a, b, max = 12) {
  let best = { d: 0, err: Infinity };
  for (let d = -max; d <= max; d++) {
    let err = 0;
    for (let i = 0; i < a.length; i++) { const j = i + d; err += Math.abs(a[i] - (j >= 0 && j < b.length ? b[j] : 0)); }
    if (err < best.err) best = { d, err };
  }
  return best.d;
}

export function bandReport({ design, app, cells, threshold, attribution = {}, verdicts = {}, out, crop = false }) {
  const width = Math.min(design.width, app.width);
  const rows = [];
  for (const c of [...cells].filter((c) => c.mismatch > threshold).sort((a, b) => a.band - b.band)) {
    const d = dominant(design, c.y0, c.y1, width), a = dominant(app, c.y0, c.y1, width);
    const pd = projections(design, c.y0, c.y1, width, d.bg), pa = projections(app, c.y0, c.y1, width, a.bg);
    const reason = attribution[String(c.band)];
    const inkD = pd.rows.reduce((s, v) => s + v, 0), inkA = pa.rows.reduce((s, v) => s + v, 0);
    // 一侧几乎没墨迹（内容缺失 / 多出）时投影对齐没有意义：偏移标「缺内容」，没墨迹那侧的字色标「无」。
    const lopsided = Math.min(inkD, inkA) * 5 < Math.max(inkD, inkA);
    const inkHex = (dom, n) => (n ? hex(dom.ink) : "无");
    const row = { band: c.band, y: `${c.y0}-${c.y1}`, mismatch: c.mismatch, dx: lopsided ? "缺内容" : bestShift(pd.cols, pa.cols), dy: lopsided ? "" : bestShift(pd.rows, pa.rows), bg: `${hex(d.bg)}/${hex(a.bg)} ΔE${deltaE(d.bg, a.bg)}`, ink: `${inkHex(d, inkD)}/${inkHex(a, inkA)}${inkD && inkA ? ` ΔE${deltaE(d.ink, a.ink)}` : ""}`, inkPx: `${inkD}/${inkA}`, status: verdicts[c.band]?.status ?? (reason === undefined ? "未归因" : acceptedReason(reason) ?? (reasonPrefix(reason) === "[contrast]" ? "[contrast]✗ 未判定" : "理由无效")) };
    if (crop && out) {
      const h = c.y1 - c.y0, png = new PNG({ width, height: h * 3 + 4 });
      png.data.fill(0x88);
      [design, app].forEach((src, n) => { for (let y = 0; y < h && c.y0 + y < src.height; y++) src.data.copy(png.data, ((n * (h + 2) + y) * width) * 4, ((c.y0 + y) * src.width) * 4, ((c.y0 + y) * src.width + width) * 4); });
      for (let y = 0; y < h; y++) for (let x = 0; x < width; x++) {
        const di = ((c.y0 + y) * design.width + x) * 4, ai = ((c.y0 + y) * app.width + x) * 4, oi = (((2 * (h + 2)) + y) * width + x) * 4;
        const bad = c.y0 + y < app.height && differs(design, di, app, ai);
        png.data[oi] = bad ? 255 : app.data[ai] ?? 0; png.data[oi + 1] = bad ? 0 : app.data[ai + 1] ?? 0; png.data[oi + 2] = bad ? 0 : app.data[ai + 2] ?? 0; png.data[oi + 3] = 255;
      }
      mkdirSync(join(out, "bands"), { recursive: true });
      row.crop = join(out, "bands", `band-${c.band}.png`);
      writePng(row.crop, png);
    }
    rows.push(row);
  }
  return rows;
}

export function formatBandReport(key, rows) {
  if (!rows.length) return `${key}：没有超阈值带`;
  const lines = [`${key}：超阈值带 ${rows.length} 条（偏移 = 实现相对设计，墨迹投影对齐估计；色 = 设计/实现）`];
  lines.push("  带  y范围      mismatch  dx  dy  底色                    字色 / 图形色            墨迹px(设计/实现)  归因");
  for (const r of rows) lines.push(`  ${String(r.band).padEnd(3)} ${r.y.padEnd(10)} ${String(r.mismatch).padEnd(9)} ${String(r.dx).padStart(3)} ${String(r.dy).padStart(3)}  ${r.bg.padEnd(23)} ${r.ink.padEnd(24)} ${r.inkPx.padEnd(18)} ${r.status}${r.crop ? `  ${r.crop}` : ""}`);
  return lines.join("\n");
}

// ---------- 省额度：Web 逐元素样式比对（--style-diff）----------
// 在页面里执行：root 下每个可见元素，取自己的文字（直接子文本）/ aria-label / data-design-id 作为配对键，
// 记下计算样式和相对 root 左上角的位置。没有键的纯容器不比（给它加 data-design-id 就能比）。
export const STYLE_PROPS = {
  text: ["font-family", "font-size", "font-weight", "line-height", "letter-spacing", "color"],
  ctrl: ["background-color", "background-image", "padding-top", "padding-right", "padding-bottom", "padding-left", "gap", "border-top-width", "border-top-style", "border-top-color", "border-radius", "box-shadow", "opacity"],
};
// 设计稿常把文字直接写在 <a> 里，实现多包一层 <span>：所以分两层记录、两层比。
//   文字层（键 = 文字）：字体、字号、字重、行高、字距、颜色，位置用文字本身的包围盒（Range），与 DOM 结构无关；
//   控件层（键 = 文字 + 「⇡」）：最近的 a / button / [role=tab|button|menuitem|option] / label / li（3 层内），没有就是文字所在元素本身，
//   比位置大小、背景、内边距、间距、边框、圆角、阴影。没有文字的元素用 aria-label / data-design-id 作键，只记控件层。
export const collectStyles = (root, { props, region }) => {
  const base = root === document.body ? { left: 0, top: 0 } : root.getBoundingClientRect();
  const rel = (r) => [Math.round((r.left - base.left) * 10) / 10, Math.round((r.top - base.top) * 10) / 10, Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10];
  const inRegion = (b) => !region || !(b[0] + b[2] <= region[0] || b[0] >= region[0] + region[2] || b[1] + b[3] <= region[1] || b[1] >= region[1] + region[3]);
  const pick = (el, list) => { const cs = getComputedStyle(el); const o = {}; for (const p of list) o[p] = cs.getPropertyValue(p); return o; };
  const out = [], seen = new Map(), ctrlSeen = new Set();
  const keyOf = (id) => { const n = seen.get(id) ?? 0; seen.set(id, n + 1); return n ? `${id}#${n + 1}` : id; };
  const ctrlOf = (el) => { for (let e = el, i = 0; e && e !== root && i < 4; e = e.parentElement, i++) if (e.matches("a, button, label, li, [role=tab], [role=button], [role=menuitem], [role=option]")) return e; return el; };
  for (const el of root.querySelectorAll("*")) {
    if (["SCRIPT", "STYLE", "LINK", "TEMPLATE"].includes(el.tagName) || el.closest("svg")) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) continue;
    const texts = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
    const own = texts.map((n) => n.textContent).join("").replace(/\s+/g, " ").trim();
    const label = el.getAttribute("data-design-id") ? `#${el.getAttribute("data-design-id")}` : el.getAttribute("aria-label") ? `[${el.getAttribute("aria-label").slice(0, 40)}]` : null;
    if (!own && (!label || el.textContent.trim())) continue; // 有文字的控件由文字带出（控件层），不按标签另记
    const id = own ? `"${own.slice(0, 40)}"` : label;
    if (own) {
      const range = document.createRange();
      range.setStartBefore(texts[0]); range.setEndAfter(texts[texts.length - 1]);
      const box = rel(range.getBoundingClientRect());
      if (box[2] < 1 || !inRegion(box)) continue;
      const key = keyOf(id);
      out.push({ key, layer: "文字", tag: el.tagName.toLowerCase(), box, style: pick(el, props.text) });
      const ctrl = ctrlOf(el);
      if (!ctrlSeen.has(ctrl)) { ctrlSeen.add(ctrl); out.push({ key: `${key} ⇡`, layer: "控件", tag: ctrl.tagName.toLowerCase(), box: rel(ctrl.getBoundingClientRect()), style: pick(ctrl, props.ctrl) }); }
    } else {
      const box = rel(el.getBoundingClientRect());
      if (box[2] < 1 || !inRegion(box) || ctrlSeen.has(el)) continue;
      ctrlSeen.add(el);
      out.push({ key: `${keyOf(id)} ⇡`, layer: "控件", tag: el.tagName.toLowerCase(), box, style: pick(el, props.ctrl) });
    }
  }
  return out;
};

// 比较两份 collectStyles：数值容差 0.5px，位置容差 1px；字体只比第一个可用的家族名之外的完整栈（栈不同就报）。
export function diffStyles(design, app) {
  const byKey = new Map(app.map((e) => [e.key, e]));
  const rows = [];
  const unmatched = [];
  const num = (v) => (/^-?[\d.]+px$/.test(v) ? parseFloat(v) : null);
  for (const d of design) {
    const a = byKey.get(d.key);
    if (!a) { unmatched.push(d.key); continue; }
    const name = `${d.key} <${d.tag}/${a.tag}>`;
    ["x", "y", "w", "h"].forEach((k, i) => { if (Math.abs(d.box[i] - a.box[i]) > 1) rows.push({ el: name, prop: `box.${k}`, design: d.box[i], app: a.box[i] }); });
    for (const p of Object.keys(d.style)) {
      const dv = d.style[p], av = a.style[p];
      if (dv === av) continue;
      const dn = num(dv), an = num(av);
      if (dn !== null && an !== null && Math.abs(dn - an) <= 0.5) continue;
      rows.push({ el: name, prop: p, design: dv, app: av });
    }
  }
  return { rows, unmatched, matched: design.length - unmatched.length, total: design.length, unmatchedApp: app.filter((e) => !design.some((d) => d.key === e.key)).length };
}

export function formatStyleDiff(key, diff, limit = 60) {
  const lines = [`${key}：样式比对 配对 ${diff.matched} / 设计侧 ${diff.total} 个有键元素，不一致 ${diff.rows.length} 项${diff.unmatched.length ? `；实现里没找到 ${diff.unmatched.length} 个（多为数据文字不同）：${diff.unmatched.slice(0, 8).join(" ")}${diff.unmatched.length > 8 ? " …" : ""}` : ""}`];
  for (const r of diff.rows.slice(0, limit)) lines.push(`  ${r.el.slice(0, 48).padEnd(48)} ${r.prop.padEnd(18)} 设计 ${String(r.design).slice(0, 48).padEnd(48)} 实现 ${String(r.app).slice(0, 48)}`);
  if (diff.rows.length > limit) lines.push(`  …还有 ${diff.rows.length - limit} 项，全表见 style-diff.json`);
  return lines.join("\n");
}

// ---------- 省额度：抽出单个画板的源码（--extract-board）----------
// 在页面里执行：画框的 outerHTML + 命中画框内元素的 CSS 规则（含 :root 的 token 变量，@media / 嵌套规则按原文保留其外层）。
export const extractBoardSource = (frame) => {
  const els = [frame, ...frame.querySelectorAll("*")];
  const hits = (sel) => { try { return els.some((e) => e.matches(sel)); } catch { return false; } };
  const rules = [];
  const walk = (list, wrap) => {
    for (const rule of list) {
      if (rule.selectorText !== undefined) {
        const base = rule.selectorText.split(",").map((s) => s.replace(/::?(before|after|placeholder|hover|focus|active|focus-visible|focus-within)\b.*$/g, "").trim() || "*");
        if (/^:root|^html|^body|\[data-theme/.test(rule.selectorText) || base.some(hits)) rules.push(wrap ? `${wrap} { ${rule.cssText} }` : rule.cssText);
      } else if (rule.cssRules) walk(rule.cssRules, rule.conditionText ? `@media ${rule.conditionText}` : wrap);
    }
  };
  for (const sheet of document.styleSheets) { try { walk(sheet.cssRules, ""); } catch {} }
  return `<!-- 画板源码：outerHTML + 命中的 CSS 规则（${rules.length} 条） -->\n<style>\n${rules.join("\n")}\n</style>\n${frame.outerHTML}\n`;
};

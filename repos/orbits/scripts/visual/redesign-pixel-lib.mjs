// $WEB/scripts/visual/redesign-pixel-lib.mjs
// 2026-10 改版像素门禁（RD-16 修订，用户决定 2026-10-11）的共用部分：
// 参数解析、从 .env.local 读密码、PNG 缩放、整屏 raw + --grid 逐带比对 + 归因门禁。
// 比对口径与 compare-0918.mjs 完全一致（单通道差 ≥24 记一个不一致像素；逐带 ±dy 搜索取最小值），
// 区别只在归因：改版只认 `[data]`（数据文字不同）一类理由，其余前缀一律视为未归因。
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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
  const w = Math.min(width, src.width - x);
  const h = Math.min(height, src.height - y);
  const dst = new PNG({ width: w, height: h });
  for (let yy = 0; yy < h; yy++) {
    src.data.copy(dst.data, yy * w * 4, ((y + yy) * src.width + x) * 4, ((y + yy) * src.width + x + w) * 4);
  }
  return dst;
}

const differs = (a, ai, b, bi) =>
  Math.abs(a.data[ai] - b.data[bi]) >= 24 ||
  Math.abs(a.data[ai + 1] - b.data[bi + 1]) >= 24 ||
  Math.abs(a.data[ai + 2] - b.data[bi + 2]) >= 24;

// 整屏 raw + 可选 --grid 逐带比对 + 归因门禁。
// 返回 { raw, height, overBands, unattributed, cells, exitCode }；diff.png / cells.json / result.json 写进 out。
export function compareImages({ design, app, out, grid, gridDy = 12, threshold = 0.02, rawThreshold = 0.02, attributionPath, viewKey, meta = {} }) {
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
    // RD-16 修订：只有 `[data]` 开头的理由算数；`[recorded]` / `[shared]` 这类 0918 时代的放行理由一律不认。
    const isData = (reason) => typeof reason === "string" && reason.trim().startsWith("[data]");
    const over = cells.filter((c) => c.mismatch > threshold);
    const unattributed = over.filter((c) => !isData(attribution[String(c.band)]));
    const sorted = [...cells].sort((a, b) => b.mismatch - a.mismatch);
    writeFileSync(join(out, "cells.json"), `${JSON.stringify({ band, maxDy: gridDy, threshold, view: viewKey, width, designHeight: design.height, appHeight: app.height, cells: sorted }, null, 2)}\n`);
    Object.assign(result, { band, cells: cells.length, overBands: over.length, unattributed: unattributed.length, overList: over.map((c) => `#${c.band}@${c.y0}-${c.y1}:${c.mismatch}`) });
    if (unattributed.length > 0 && exitCode === 0) exitCode = 5;
    if (unattributed.length > 0) result.gate = "fail";
  }
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

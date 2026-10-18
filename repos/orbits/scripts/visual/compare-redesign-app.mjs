// $WEB/scripts/visual/compare-redesign-app.mjs
// 2026-10 改版 App 像素门禁（RD-16 修订，用户决定 2026-10-11）：
// iOS 模拟器真实截图（不是 react-native-web）↔ 设计稿 App 画板（.phone，390×844pt），按设备点宽缩放对齐后逐带比对。
//
// 推荐设备：iPhone 16e（390×844pt @3x = 1170×2532，与设计画框同尺寸，缩放后像素一一对应）；
// 其他设备（如 iPhone 17 Pro 402×874pt）会按点宽等比缩到 390 宽，竖向多出的部分计入差异。
// 状态栏建议先统一：xcrun simctl status_bar <udid> override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3
//
// 用法：
//   截图并比对（本脚本代为调用 simctl）：
//     node scripts/visual/compare-redesign-app.mjs --simulator <udid|booted> \
//       --design app.html --board "Task · プラン 概要（上）" --theme light --out <dir> --grid 100
//   比对已有截图：
//     node scripts/visual/compare-redesign-app.mjs --shot <png> --design app.html --board-index 20 --theme dark --out <dir> --grid 100
//   系统外壳：默认去掉设计画框的灵动岛与 Home 指示条，并把两侧顶部 50pt 状态栏涂成同色不计差异（--keep-system 关闭）。
//   选项：--scale 3（截图像素 / 点，默认按设计宽 390 自动推算）；--design-click "<画框内选择器>"（先在画板里点开抽屉 / 弹层）；
//         --design-remove "<画框内选择器>"；--attribution <json> --grid-view <key>（同 Web 版，只认 [data] / [raster]）。
//   批量（门禁提速，2026-10-12）：--suite scripts/visual/views/app-<Sprint>.json [--only a,b] [--changed [ref]] --simulator booted --out <dir>
//         清单每张：{ id, design, board / board-index, themes?, url?（深链，先 simctl openurl 再截）, path?（开发开关 open-path，见下）, wait?（ms）, shot?（已有截图）}；
//         设计稿截图走缓存并按 --workers 并行预取，模拟器截图串行（一台模拟器同一时刻只显示一个画面）；主题用 simctl ui appearance 切。
//   逐件对照（R31a）：清单项写 { section: "<01-system 小节 id>", cell: n } 取规格格（代替 board），设计侧裁成该格；
//         --region "x,y,w,h"（设计点，整数）裁实现截图（展示页小节画在固定 rect 上）；板画区域对比时另给 --design-region 裁设计侧，
//         不给则两侧同一块。--design-stage keep 保留规格格的文档雾面底（默认 flat = 纯 --bg）。
//   跳转：path（如 /showcase/components/c-confirm-0?theme=dark，可写 {theme}）= 开发开关 open-path：先结束 App，把路径写进
//         AsyncStorage「orbit.dev.openPath」，再启动 App（需要 Metro 带 EXPO_PUBLIC_ORBIT_REDESIGN_MOCK 含 open-path）；不走 simctl openurl（会弹系统确认框）。
//         --bundle-id 默认 app.agenthubs.orbit。
//   [contrast]：归因理由以 [contrast] 开头的带按 contrast-substitutions.json 逐像素判定（RD-26，见 redesign-pixel-lib checkContrastBand）。
// 退出码同 compare-redesign.mjs。
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { chromium } from "playwright";
import { APP_DESIGN_FONT_FIX, appDesignFontFix, changedFiles, compareImages, crop, cropPair, formatBandReport, moveFrameToTop, designCache, designInputsHash, listBoardsInPage, loadSuite, many, parseArgs, parseRegion, pool, printSummary, readPng, resize, selectChanged, selectOnly, specCellsInPage, writePng } from "./redesign-pixel-lib.mjs";

const args = parseArgs(process.argv.slice(2));
const designBase = args["design-base"] ?? "http://localhost:3320/redesign-2026-10/";
const designUrl = (file) => (/^https?:/.test(file) ? file : designBase + encodeURI(file));
const REPO_ROOT = resolve(dirname(new URL(import.meta.url).pathname), "../../../..");
const DESIGN_DIR = resolve(args["design-dir"] ?? join(REPO_ROOT, "docs/designs/redesign-2026-10"));
const home = (p) => resolve(String(p).replace(/^~(?=\/)/, process.env.HOME));
if (!args.out || (!args.suite && (!args.design || (!args.shot && !args.simulator)))) {
  console.error("usage error: --out 必填；单张另需 --design 与 --shot <png> 或 --simulator <udid|booted>；批量用 --suite <清单> --simulator <udid|booted>");
  process.exit(2);
}
const useCache = !(args["no-cache"] || args.cache === "false");

// ---------- 设计稿画板（带缓存）----------
const designScale = (v) => Number(v["design-scale"] ?? 3);
let browser;
async function designFor(v) {
  if (v.section !== undefined) return specDesignFor(v);
  const hash = !/^https?:/.test(v.design) && useCache ? designInputsHash(DESIGN_DIR, v.design) : null;
  const cache = hash ? designCache({ v: 3, app: true, font: APP_DESIGN_FONT_FIX, frame: "top", scale: designScale(v), hash, design: v.design, board: v.board ?? null, boardIndex: v["board-index"] ?? null, kind: v["board-kind"] ?? "phone", nth: v["board-nth"] ?? null, theme: v.theme, click: many(v["design-click"]), remove: many(v["design-remove"]), keepSystem: v["keep-system"] === "true" }) : null;
  const meta = cache?.meta();
  const hit = meta && cache.png("frame");
  if (hit) return { png: hit, board: meta.board, cached: true };
  browser ??= await chromium.launch({ channel: args.channel ?? "chrome" });
  // 设计侧按 3x 渲染、再用与真机截图相同的面积平均缩到 1x（R05 发现：1x 时 Chrome 把 SVG 图标边对齐到整像素，
  // 324.5 → 325，而真机是 3x 渲染后缩小、保留 0.5px 的灰边，只框住图标的细带也差 0.025–0.03）。--design-scale 1 回到旧做法。
  const scale = designScale(v);
  const ctx = await browser.newContext({ viewport: { width: 1700, height: 1100 }, deviceScaleFactor: scale, locale: "ja-JP" });
  try {
    const page = await ctx.newPage();
    await page.goto(designUrl(v.design), { waitUntil: "load" });
    await page.evaluate(() => document.fonts?.ready);
    await page.evaluate(() => document.body.classList.add("no-pins"));
    // 英文、数字按 iOS 走 SF（见 redesign-pixel-lib 的 appDesignFontFix）；--keep-design-font 保留原样（排查用）。
    if (v["keep-design-font"] !== "true") await page.evaluate(appDesignFontFix);
    await page.waitForTimeout(Number(v["design-wait"] ?? 1600));
    let board;
    for (let attempt = 0; attempt < 45 && !board; attempt++) {
      if (attempt) await page.waitForTimeout(1000);
      const boards = await page.evaluate(listBoardsInPage);
      if (v["board-index"] !== undefined) board = boards[Number(v["board-index"])];
      else if (v.board) {
        const hits = boards.filter((b) => b.label.includes(v.board) && b.kind === (v["board-kind"] ?? "phone"));
        board = hits[Number(v["board-nth"] ?? 0)];
        if (hits.length > 1 && v["board-nth"] === undefined) console.warn(`warn: [${v.key}] --board "${v.board}" 命中 ${hits.length} 块，取 #${hits[0].index}`);
      }
    }
    if (!board) throw Object.assign(new Error(`design board not found（先用 compare-redesign.mjs --list --design ${v.design} 看画板）`), { code: 3 });
    const frames = [];
    for (const h of await page.$$(".web, .phone")) if (!(await h.evaluate((f) => !!f.parentElement.closest(".web, .phone")))) frames.push(h);
    const frame = frames[board.index];
    for (const sel of many(v["design-click"])) { await frame.$(sel).then((el) => el?.click()); await page.waitForTimeout(300); }
    // 画框原位的 y 常是小数（367.75…），截出 390×845、底栏低 1px：先搬到左上角整数坐标（见 lib moveFrameToTop）。
    await frame.evaluate(moveFrameToTop);
    await frame.evaluate((f, { theme, removes, keepSystem }) => {
      f.setAttribute("data-theme", theme);
      f.style.borderRadius = "0";
      f.style.boxShadow = "none";
      for (const sel of removes) for (const el of f.querySelectorAll(sel)) el.remove();
      // 灵动岛 / 刘海与 Home 指示条是硬件和系统画的，模拟器截图里没有（或不受 App 控制），不算 App 画面。
      if (!keepSystem) for (const el of f.querySelectorAll(":scope > .status .island, :scope > .home-ind")) el.remove();
    }, { theme: v.theme, removes: many(v["design-remove"]), keepSystem: v["keep-system"] === "true" });
    await page.waitForTimeout(300);
    mkdirSync(v.out, { recursive: true });
    const file = join(v.out, "design.png");
    await frame.screenshot({ path: file, animations: "disabled" });
    let png = readPng(file);
    if (scale !== 1) { png = resize(png, Math.round(png.width / scale), Math.round(png.height / scale)); writePng(file, png); }
    if (cache) { cache.saveMeta({ board }); cache.savePng("frame", file); }
    return { png, board, cached: false };
  } finally {
    await ctx.close();
  }
}

// ---------- 设计稿规格格（R31a 逐件对照）----------
// 01-system 的第 n 格：同样 3x 渲染 + SF 字体映射 + 面积平均缩到 1x；裁剪框由 specCellsInPage 整数对齐后给出。
async function specDesignFor(v) {
  const hash = !/^https?:/.test(v.design) && useCache ? designInputsHash(DESIGN_DIR, v.design) : null;
  const stage = v["design-stage"] === "keep" ? "keep" : "flat";
  const cache = hash ? designCache({ v: 1, app: true, spec: true, font: APP_DESIGN_FONT_FIX, scale: designScale(v), hash, design: v.design, section: v.section, cell: Number(v.cell ?? 0), stage, theme: v.theme }) : null;
  const meta = cache?.meta();
  const hit = meta && cache.png("frame");
  if (hit) return { png: hit, board: meta.board, cached: true };
  browser ??= await chromium.launch({ channel: args.channel ?? "chrome" });
  const scale = designScale(v);
  const ctx = await browser.newContext({ viewport: { width: 1700, height: 1100 }, deviceScaleFactor: scale, locale: "ja-JP" });
  try {
    const page = await ctx.newPage();
    await page.goto(designUrl(v.design), { waitUntil: "load" });
    await page.evaluate(() => document.fonts?.ready);
    await page.evaluate(() => document.body.classList.add("no-pins"));
    if (v["keep-design-font"] !== "true") await page.evaluate(appDesignFontFix);
    await page.waitForTimeout(Number(v["design-wait"] ?? 1600));
    let cell = null;
    for (let attempt = 0; attempt < 30 && !cell; attempt++) {
      if (attempt) await page.waitForTimeout(1000);
      cell = await page.evaluate(specCellsInPage, { section: String(v.section), theme: v.theme, cell: Number(v.cell ?? 0), stage }).catch((error) => { throw Object.assign(new Error(error.message.split("\n")[0].replace(/^page\.evaluate: (Error: )?/, "")), { code: 3 }); });
    }
    if (!cell) throw Object.assign(new Error(`spec section not found: ${v.section}（compare-redesign.mjs --list-cells --design ${v.design} 看清单）`), { code: 3 });
    await page.waitForTimeout(300);
    mkdirSync(v.out, { recursive: true });
    const file = join(v.out, "design.png");
    const [x, y, w, h] = cell.rect;
    await page.screenshot({ path: file, clip: { x, y, width: w, height: h }, fullPage: true, animations: "disabled" });
    let png = readPng(file);
    if (scale !== 1) { png = resize(png, w, h); writePng(file, png); }
    const board = { spec: true, design: v.design, section: cell.section, cell: cell.index, kind: cell.kind, cap: cell.cap, rect: cell.rect, theme: v.theme };
    if (cache) { cache.saveMeta({ board }); cache.savePng("frame", file); }
    return { png, board, cached: false };
  } finally {
    await ctx.close();
  }
}

// ---------- 开发开关 open-path（R26 起；R31a 收进本脚本）----------
// RN AsyncStorage（iOS）存在 App 数据容器 Library/Application Support/<bundle>/RCTAsyncLocalStorage_V1/manifest.json，
// 短值直接写在 manifest 里。App 运行时会缓存 manifest，所以先结束 App、写入、再启动。
function openPath(v) {
  const bundle = v["bundle-id"] ?? "app.agenthubs.orbit";
  try { execFileSync("xcrun", ["simctl", "terminate", v.simulator, bundle], { stdio: "ignore" }); } catch {}
  const container = execFileSync("xcrun", ["simctl", "get_app_container", v.simulator, bundle, "data"], { encoding: "utf8" }).trim();
  const dir = join(container, "Library/Application Support", bundle, "RCTAsyncLocalStorage_V1");
  mkdirSync(dir, { recursive: true });
  const manifest = join(dir, "manifest.json");
  const data = existsSync(manifest) ? JSON.parse(readFileSync(manifest, "utf8") || "{}") : {};
  data["orbit.dev.openPath"] = v.path;
  writeFileSync(manifest, JSON.stringify(data));
  sim("launch", v.simulator, bundle);
}

// ---------- 模拟器截图（串行）----------
const sim = (...a) => execFileSync("xcrun", ["simctl", ...a], { stdio: ["ignore", "ignore", "inherit"] });
async function shotFor(v) {
  if (v.shot) return resolve(v.shot);
  const file = join(v.out, "simulator-raw.png");
  if (v.suite || v.path) {
    // 批量（或单张带 path）：先切外观，再开深链（没有深链就截当前画面），等界面稳定。
    try { sim("ui", v.simulator, "appearance", v.theme); } catch { console.warn(`warn: [${v.key}] simctl ui appearance 失败，按当前外观截`); }
    if (v.path) openPath(v);
    else if (v.url) sim("openurl", v.simulator, v.url);
    await new Promise((r) => setTimeout(r, Number(v.wait ?? (v.path ? 8000 : 2500))));
  }
  // simctl may not have permission to write directly to an external evidence volume.
  const temporaryDir = mkdtempSync(join(tmpdir(), "orbit-app-shot-"));
  try {
    const temporaryFile = join(temporaryDir, "simulator-raw.png");
    sim("io", v.simulator, "screenshot", "--type=png", temporaryFile);
    copyFileSync(temporaryFile, file);
  } finally {
    rmSync(temporaryDir, { recursive: true, force: true });
  }
  return file;
}

// ---------- 按点宽缩放对齐 + 比对 ----------
function compareShot(v, designPng, board, shotFile) {
  const shot = readPng(shotFile);
  // 截图是 @Nx 像素：先换算成设备点（宽 / scale），再等比缩到设计画框宽（390pt）。
  const scale = Number(v.scale ?? 0) || shot.width / Math.round(shot.width / 3);
  const points = [Math.round(shot.width / scale), Math.round(shot.height / scale)];
  // 整屏画板：等比缩到设计画框宽（390pt）。规格格（spec）：缩到设备点（不按 390 缩），组件按真实点数比，
  // region 用设备点（17 Pro 402×874 与 16e 390×844 都直接对）。
  const targetW = board?.spec ? points[0] : designPng.width;
  const targetH = board?.spec ? points[1] : Math.round(shot.height * (targetW / shot.width));
  const app = resize(shot, targetW, targetH);
  // 状态栏（时间、信号、电池）由 iOS 绘制，App 只能决定浅 / 深色字：默认把两侧顶部 50pt 涂成同一灰色，不计入差异。
  // 要检查状态栏字色时加 --keep-system。
  const statusPt = v["keep-system"] === "true" ? 0 : Number(v["status-height"] ?? 50);
  const design = { ...designPng, data: Buffer.from(designPng.data) };
  // 规格格（spec）设计侧已经是那一格，不画状态栏；整屏画板才涂状态栏。
  if (!board?.spec) for (const png of [design, app]) for (let y = 0; y < Math.min(statusPt, png.height); y++) png.data.fill(0x80, y * png.width * 4, (y + 1) * png.width * 4);
  // --region（实现侧 rect，设计点）/ --design-region（设计侧，另给时分侧裁）；规格格的设计侧不再裁。
  const screen = { width: app.width, height: app.height };
  const region = v.region ? parseRegion(v.region, screen) : null;
  const designRegion = board?.spec ? null : v["design-region"] ? parseRegion(v["design-region"], { width: design.width, height: design.height }) : null;
  const cropped = board?.spec ? { design, app: region ? crop(app, ...region) : app } : cropPair({ design, app, region, designRegion });
  writePng(join(v.out, "app.png"), cropped.app);
  writePng(join(v.out, "design.png"), cropped.design);
  const result = compareImages({
    design: cropped.design,
    app: cropped.app,
    out: v.out,
    grid: v.grid && v.grid !== "false" ? (v.grid === "true" || v.grid === true ? 100 : Number(v.grid)) : 0,
    gridDy: Number(v["grid-dy"] ?? 12),
    threshold: Number(v["grid-threshold"] ?? 0.02),
    // 决定表 §20（2026-10-14）：App 通过 = 每条超阈值带都归因 [data] / [raster] / [contrast]（RD-26，按替换清单判定）；整屏 raw 只作参考（iOS 字形栅格化让字多的画面 raw ≥ 0.04）。
    // --raw-threshold 0.02 可恢复旧卡法；Web 脚本不变。
    rawThreshold: v["raw-threshold"] === undefined ? Infinity : Number(v["raw-threshold"]),
    attributionPath: v.attribution,
    viewKey: v.key,
    meta: { crop: Boolean(args.crop) || v.crop === true, view: v.key, design: v.design, board, region: v.region ?? null, designRegion: v["design-region"] ?? null, path: v.path ?? null, shot: shotFile, devicePoints: points, alignedTo: [targetW, targetH], theme: v.theme, triptychScale: 1 },
  });
  writeFileSync(join(v.out, "board.json"), `${JSON.stringify(board, null, 2)}\n`);
  return { ...result, key: v.key, triptych: join(v.out, "triptych.png"), out: v.out, devicePoints: points };
}

let code = 0;
try {
  if (!args.suite) {
    const v = { ...args, theme: args.theme === "dark" ? "dark" : "light", out: home(args.out) };
    v.key = args["grid-view"] ?? `${args.section !== undefined ? `${args.section}-${args.cell ?? 0}` : args.board ?? args["board-index"]}-app-${v.theme}`;
    if (typeof v.path === "string") v.path = v.path.replaceAll("{theme}", v.theme);
    mkdirSync(v.out, { recursive: true });
    const shotFile = await shotFor(v);
    const d = await designFor(v);
    const r = compareShot(v, d.png, d.board, shotFile);
    console.log(`raw=${r.raw} design=${r.designSize.join("x")} app=${r.appSize.join("x")} (device ${r.devicePoints.join("x")}pt)` + (r.band ? ` bands=${r.cells} over=${r.overBands} unattributed=${r.unattributed}` : "") + (r.missing.length ? ` missing=${r.missing.length}` : "") + ` ${r.pass ? "PASS" : "FAIL"}${d.cached ? " (design cached)" : ""} out=${v.out}`);
    for (const m of r.missing.slice(0, 5)) console.warn(`warn: ⚠ 缺块 x=${m.x} y=${m.y} ${m.w}x${m.h}：设计稿这块有内容、实现是空的（raw 低也要看 triptych）`);
    if (r.bandsReport) console.log(formatBandReport(v.key, r.bandsReport));
    code = r.exitCode;
  } else {
    let runs = loadSuite(resolve(args.suite));
    const total = runs.length;
    if (args.only) runs = selectOnly(runs, args.only);
    if (args.changed) {
      const files = changedFiles(args.changed, REPO_ROOT);
      runs = selectChanged(runs, files, relative(REPO_ROOT, DESIGN_DIR));
      console.log(`--changed：改动 ${files.length} 个文件，命中 ${runs.length} / ${total} 张`);
    }
    const outRoot = home(args.out);
    const globals = Object.fromEntries(Object.entries(args).filter(([k]) => !["suite", "only", "changed", "out", "workers", "no-cache", "cache", "crop"].includes(k)));
    const views = runs.map(({ key, sources, themes, id, ...rest }) => ({ ...rest, ...globals, key, suite: true, out: join(outRoot, key) }));
    if (!views.length) console.log("没有要跑的画面（--only / --changed 没命中）");
    const t0 = Date.now();
    // 设计稿截图并行预取（走缓存），模拟器截图严格串行。
    const designs = await pool(views, Number(args.workers ?? 3), async (v) => { mkdirSync(v.out, { recursive: true }); try { return await designFor(v); } catch (error) { return { error }; } });
    const results = [];
    for (const [i, v] of views.entries()) {
      const t1 = Date.now();
      try {
        if (designs[i].error) throw designs[i].error;
        const r = compareShot(v, designs[i].png, designs[i].board, await shotFor(v));
        results.push({ ...r, ms: Date.now() - t1 });
        console.log(`${v.key} ${r.pass ? "PASS" : "FAIL"} raw=${r.raw}` + (r.band ? ` over=${r.overBands} unattributed=${r.unattributed}` : "") + (r.missing.length ? ` ⚠缺块=${r.missing.length}` : ""));
      } catch (error) {
        console.error(`${v.key} ERROR ${error.message}`);
        results.push({ key: v.key, pass: false, error: String(error.message).split("\n")[0], exitCode: error.code ?? 1, ms: Date.now() - t1 });
      }
    }
    if (views.length) {
      printSummary(results, { file: join(outRoot, "summary.json") });
      for (const r of results) if (r.bandsReport?.length) console.log(`\n${formatBandReport(r.key, r.bandsReport)}`);
      console.log(`总耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s；摘要 ${join(outRoot, "summary.json")}`);
    }
    code = Math.max(0, ...results.map((r) => r.exitCode ?? 0));
  }
} catch (error) {
  console.error(error.message ?? error);
  code = error.code ?? 1;
} finally {
  await browser?.close();
}
process.exit(code);

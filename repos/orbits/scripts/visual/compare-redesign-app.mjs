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
//         --design-remove "<画框内选择器>"；--attribution <json> --grid-view <key>（同 Web 版，只认 [data]）。
// 退出码同 compare-redesign.mjs。
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { compareImages, listBoardsInPage, many, parseArgs, readPng, resize, writePng } from "./redesign-pixel-lib.mjs";

const args = parseArgs(process.argv.slice(2));
const designBase = args["design-base"] ?? "http://localhost:3320/redesign-2026-10/";
const designUrl = (file) => (/^https?:/.test(file) ? file : designBase + encodeURI(file));
if (!args.design || !args.out || (!args.shot && !args.simulator)) {
  console.error("usage error: --design、--out 必填，另需 --shot <png> 或 --simulator <udid|booted>");
  process.exit(2);
}
const theme = args.theme === "dark" ? "dark" : "light";
const out = resolve(args.out.replace(/^~(?=\/)/, process.env.HOME));
mkdirSync(out, { recursive: true });

// ---------- 模拟器截图 ----------
let shotFile = args.shot ? resolve(args.shot) : join(out, "simulator-raw.png");
if (args.simulator) {
  execFileSync("xcrun", ["simctl", "io", args.simulator, "screenshot", "--type=png", shotFile], { stdio: ["ignore", "ignore", "inherit"] });
}
const shot = readPng(shotFile);

// ---------- 设计稿画板 ----------
const browser = await chromium.launch({ channel: args.channel ?? "chrome" });
let designPng;
let board;
try {
  const ctx = await browser.newContext({ viewport: { width: 1700, height: 1100 }, deviceScaleFactor: 1, locale: "ja-JP" });
  const page = await ctx.newPage();
  await page.goto(designUrl(args.design), { waitUntil: "load" });
  await page.evaluate(() => document.fonts?.ready);
  await page.evaluate(() => document.body.classList.add("no-pins"));
  await page.waitForTimeout(Number(args["design-wait"] ?? 1600));
  const boards = (await page.evaluate(listBoardsInPage));
  if (args["board-index"] !== undefined) board = boards[Number(args["board-index"])];
  else if (args.board) {
    const hits = boards.filter((b) => b.label.includes(args.board) && b.kind === (args["board-kind"] ?? "phone"));
    board = hits[Number(args["board-nth"] ?? 0)];
    if (hits.length > 1 && args["board-nth"] === undefined) console.warn(`warn: --board "${args.board}" 命中 ${hits.length} 块，取 #${hits[0].index}`);
  }
  if (!board) { console.error(`design board not found（先用 compare-redesign.mjs --list --design ${args.design} 看画板）`); await browser.close(); process.exit(3); }
  const frames = [];
  for (const h of await page.$$(".web, .phone")) if (!(await h.evaluate((f) => !!f.parentElement.closest(".web, .phone")))) frames.push(h);
  const frame = frames[board.index];
  for (const sel of many(args["design-click"])) { await frame.$(sel).then((el) => el?.click()); await page.waitForTimeout(300); }
  await frame.evaluate((f, { theme, removes, keepSystem }) => {
    f.setAttribute("data-theme", theme);
    f.style.borderRadius = "0";
    f.style.boxShadow = "none";
    for (const sel of removes) for (const el of f.querySelectorAll(sel)) el.remove();
    // 灵动岛 / 刘海与 Home 指示条是硬件和系统画的，模拟器截图里没有（或不受 App 控制），不算 App 画面。
    if (!keepSystem) for (const el of f.querySelectorAll(":scope > .status .island, :scope > .home-ind")) el.remove();
  }, { theme, removes: many(args["design-remove"]), keepSystem: args["keep-system"] === "true" });
  await page.waitForTimeout(300);
  await frame.screenshot({ path: join(out, "design.png"), animations: "disabled" });
  designPng = readPng(join(out, "design.png"));
  await ctx.close();
} finally {
  await browser.close();
}

// ---------- 按点宽缩放对齐 ----------
// 截图是 @Nx 像素：先换算成设备点（宽 / scale），再等比缩到设计画框宽（390pt）。
const scale = Number(args.scale ?? 0) || shot.width / Math.round(shot.width / 3);
const points = [Math.round(shot.width / scale), Math.round(shot.height / scale)];
const targetW = designPng.width;
const targetH = Math.round(shot.height * (targetW / shot.width));
const app = resize(shot, targetW, targetH);
// 状态栏（时间、信号、电池）由 iOS 绘制，App 只能决定浅 / 深色字：默认把两侧顶部 50pt 涂成同一灰色，不计入差异。
// 要检查状态栏字色时加 --keep-system。
const statusPt = args["keep-system"] === "true" ? 0 : Number(args["status-height"] ?? 50);
for (const png of [designPng, app]) for (let y = 0; y < Math.min(statusPt, png.height); y++) png.data.fill(0x80, y * png.width * 4, (y + 1) * png.width * 4);
writePng(join(out, "app.png"), app);
writePng(join(out, "design.png"), designPng);

const viewKey = args["grid-view"] ?? `${args.board ?? args["board-index"]}-app-${theme}`;
const result = compareImages({
  design: designPng,
  app,
  out,
  grid: args.grid && args.grid !== "false" ? (args.grid === "true" ? 100 : Number(args.grid)) : 0,
  gridDy: Number(args["grid-dy"] ?? 12),
  threshold: Number(args["grid-threshold"] ?? 0.02),
  attributionPath: args.attribution,
  viewKey,
  meta: { view: viewKey, design: args.design, board, shot: shotFile, devicePoints: points, alignedTo: [targetW, targetH], theme, triptychScale: 1 },
});
writeFileSync(join(out, "board.json"), `${JSON.stringify(board, null, 2)}\n`);
console.log(`raw=${result.raw} design=${result.designSize.join("x")} app=${result.appSize.join("x")} (device ${points.join("x")}pt)` + (result.band ? ` bands=${result.cells} over=${result.overBands} unattributed=${result.unattributed}` : "") + ` ${result.pass ? "PASS" : "FAIL"} out=${out}`);
process.exit(result.exitCode);

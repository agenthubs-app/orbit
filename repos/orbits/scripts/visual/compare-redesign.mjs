// $WEB/scripts/visual/compare-redesign.mjs
// 2026-10 改版 Web 像素门禁（RD-16 修订，用户决定 2026-10-11）：
// 在设计稿 docs/designs/redesign-2026-10/*.html 里按「画板」定位一块 .web / .phone 画框截图，
// 再用同宽同主题截本地实现的完整页面（含导航壳），整屏 raw + --grid 逐带比对 + 归因门禁。
//
// 前置：设计稿服务 `python3 -m http.server 3320 -d docs/designs`（launch.json 的 `designs`），本地 dev server。
// 用法见同目录 README-redesign.md。最常用的三种：
//   列出画板：  node scripts/visual/compare-redesign.mjs --list --design web.html
//   单屏比对：  node scripts/visual/compare-redesign.mjs --design web.html --board "ホーム" \
//                 --app http://localhost:3000/app --width 1440 --theme light --login qa@orbit.test \
//                 --out ~/orbit-sprint-evidence/redesign/R07/run-01/home-1440-light --grid 100
//   带归因：    ... --attribution scripts/visual/attribution-redesign-R07.json --grid-view home-1440-light
//
// 退出码：0 通过；2 用法错误；3 画板 / 元素找不到；5 有超阈值带未以 [data] 归因；6 整屏 raw > 0.02。
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { compareImages, listBoardsInPage, many, parseArgs, readPng, readSecret } from "./redesign-pixel-lib.mjs";

const args = parseArgs(process.argv.slice(2));
const designBase = args["design-base"] ?? "http://localhost:3320/redesign-2026-10/";
const designUrl = (file) => (/^https?:/.test(file) ? file : designBase + encodeURI(file));

if (!args.design) {
  console.error("usage error: --design <web.html | b8-responsive.html | 完整 URL> 必填");
  process.exit(2);
}

const browser = await chromium.launch({ channel: args.channel ?? "chrome" });
const exit = async (code) => { await browser.close(); process.exit(code); };

// ---------- 设计稿：画板定位 ----------
async function openDesign(viewportWidth) {
  const ctx = await browser.newContext({ viewport: { width: viewportWidth, height: 1100 }, deviceScaleFactor: 1, locale: "ja-JP" });
  const page = await ctx.newPage();
  await page.goto(designUrl(args.design), { waitUntil: "load" });
  await page.evaluate(() => document.fonts?.ready);
  // 关掉注释针与 .pinned 的虚线框（body.no-pins 是 kit 自带开关），等计数 / 进度条动画（1.1s）走完。
  await page.evaluate(() => document.body.classList.add("no-pins"));
  await page.waitForTimeout(Number(args["design-wait"] ?? 1600));
  return { ctx, page };
}

if (args.list) {
  const { page } = await openDesign(1700);
  const boards = await page.evaluate(listBoardsInPage);
  if (args.json) console.log(JSON.stringify(boards, null, 2));
  else for (const b of boards) console.log(`#${b.index}\t${b.kind}\t${b.size.join("x")}\t${b.theme || "-"}\t${b.label}${b.frameInBoard > 0 ? ` [frame ${b.frameInBoard}]` : ""}\t« ${b.section}`);
  await exit(0);
}

for (const key of ["app", "out"]) {
  if (!args[key]) { console.error(`usage error: --${key} 必填`); await exit(2); }
}
const width = Number(args.width ?? 1440);
const theme = args.theme === "dark" ? "dark" : "light";
const out = resolve(args.out.replace(/^~(?=\/)/, process.env.HOME));
mkdirSync(out, { recursive: true });
const fullPage = args["viewport-only"] !== "true";

// ---------- 设计侧截图 ----------
async function shootDesign() {
  const { ctx, page } = await openDesign(Math.max(1700, width + 200));
  const boards = await page.evaluate(listBoardsInPage);
  let target;
  if (args["board-index"] !== undefined) target = boards[Number(args["board-index"])];
  else if (args.board) {
    const hits = boards.filter((b) => b.label.includes(args.board) && (args["board-kind"] ? b.kind === args["board-kind"] : true));
    target = hits[Number(args["board-nth"] ?? 0)];
    if (hits.length > 1 && args["board-nth"] === undefined) console.warn(`warn: --board "${args.board}" 命中 ${hits.length} 块，取第 0 块（#${hits[0].index}）；用 --board-nth / --board-kind / --board-index 消歧`);
  }
  if (!target) { console.error(`design board not found: ${args.board ?? args["board-index"]}（先用 --list 看画板）`); await exit(3); }

  const handle = (await page.$$(".web, .phone")).filter(Boolean);
  const frames = [];
  for (const h of handle) if (!(await h.evaluate((f) => !!f.parentElement.closest(".web, .phone")))) frames.push(h);
  const frame = frames[target.index];
  // 先在画框里执行设计侧点击（打开抽屉 / 切页签），再处理主题与展开。
  for (const sel of many(args["design-click"])) {
    await frame.$(sel).then((el) => el?.click());
    await page.waitForTimeout(300);
  }
  await frame.evaluate((f, { theme, unroll, kind, removes }) => {
    f.setAttribute("data-theme", theme);
    f.style.borderRadius = "0";
    f.style.boxShadow = "none";
    for (const sel of removes) for (const el of f.querySelectorAll(sel)) el.remove();
    if (kind === "mweb390") {
      // 手机浏览器画框：状态栏、Safari 地址栏、Home 指示条是浏览器 / 系统外壳，不是网页内容。
      for (const el of f.querySelectorAll(":scope > .status, :scope > .home-ind, :scope > .sbar, :scope > .safari")) el.remove();
      const scroll = f.querySelector(":scope > .scroll");
      if (scroll) scroll.style.top = "0";
    }
    if (unroll) {
      // 「完整页面」：把画框里的内部滚动区展开成自然高度，对应实现侧的 fullPage 截图。
      f.style.height = "auto";
      if (f.classList.contains("web")) {
        f.style.alignItems = "stretch";
        for (const el of f.querySelectorAll(":scope > .main, :scope > .rail, :scope > .side")) { el.style.overflow = "visible"; el.style.height = "auto"; }
      } else {
        const scroll = f.querySelector(":scope > .scroll");
        if (scroll) { scroll.style.position = "relative"; scroll.style.inset = "auto"; scroll.style.overflow = "visible"; scroll.style.minHeight = `${f.getBoundingClientRect().height}px`; }
      }
    }
  }, { theme, unroll: fullPage && args["design-unroll"] !== "false", kind: target.kind, removes: many(args["design-remove"]) });
  await page.waitForTimeout(300);
  const naturalHeight = await frame.evaluate((f) => Math.ceil(f.getBoundingClientRect().height));
  return { ctx, page, frame, board: target, naturalHeight };
}

async function finishDesign(d, height) {
  if (fullPage) {
    await d.frame.evaluate((f, h) => {
      f.style.height = `${h}px`;
      const scroll = f.querySelector(":scope > .scroll");
      if (scroll && f.classList.contains("phone")) scroll.style.minHeight = `${h}px`;
    }, height);
    await d.page.waitForTimeout(200);
  }
  const file = join(out, "design.png");
  await d.frame.screenshot({ path: file, animations: "disabled" });
  await d.ctx.close();
  return readPng(file);
}

// ---------- 实现侧截图 ----------
// 登录：--storage <文件> 存在且仍有效时直接复用（连续跑几十屏不会撞登录限流），否则走一遍登录表单再存回去。
// 存储文件含会话 cookie，放 scratchpad / 证据目录之外的临时位置，不要提交。
async function ensureLogin(ctx, origin) {
  const storage = args.storage ? resolve(args.storage.replace(/^~(?=\/)/, process.env.HOME)) : null;
  if (storage && existsSync(storage)) {
    const probe = await ctx.newPage();
    const res = await probe.goto(`${origin}/api/auth/session`, { waitUntil: "domcontentloaded" }).catch(() => null);
    const body = res ? await res.text().catch(() => "") : "";
    await probe.close();
    if (body.includes(args.login)) return;
  }
  const password = readSecret(args["password-env"] ?? "ORBIT_PRIMARY_TEST_ACCOUNT_PASSWORD", args["env-file"] ?? ".env.local");
  if (!password) { console.error("login: 找不到密码（--password-env / .env.local）"); await exit(2); }
  const lp = await ctx.newPage();
  await lp.goto(`${origin}/app/account/login`, { waitUntil: "networkidle" }).catch(() => {});
  await lp.locator('input[type="email"]').first().fill(args.login);
  await lp.locator('input[type="password"]').first().fill(password);
  await lp.locator('form button[type="submit"]').first().click();
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline && new URL(lp.url()).pathname.startsWith("/app/account/login")) await lp.waitForTimeout(250);
  if (new URL(lp.url()).pathname.startsWith("/app/account/login")) {
    const msg = await lp.locator('[role="alert"], .au-error, [aria-live]').allInnerTexts().catch(() => []);
    console.error(`login failed: still on ${lp.url()} ${msg.join(" | ").slice(0, 200)}`);
    await exit(2);
  }
  await lp.close();
  if (storage) await ctx.storageState({ path: storage });
}

async function shootApp(designHeight) {
  const storage = args.storage ? resolve(args.storage.replace(/^~(?=\/)/, process.env.HOME)) : null;
  const ctx = await browser.newContext({
    storageState: storage && existsSync(storage) ? storage : undefined,
    viewport: { width, height: Number(args.height ?? designHeight) },
    deviceScaleFactor: 1,
    colorScheme: theme,
    locale: args.locale ?? "ja-JP",
  });
  await ctx.addInitScript((t) => { try { localStorage.setItem("orbit-theme", t); } catch {} }, theme);
  const origin = new URL(args.app).origin;
  if (args.login && args.login !== "true") await ensureLogin(ctx, origin);
  const page = await ctx.newPage();
  try { await page.goto(args.app, { waitUntil: "networkidle", timeout: 30000 }); }
  catch { await page.waitForTimeout(1500); }
  if (args["wait-for"]) await page.waitForSelector(args["wait-for"], { timeout: 20000 }).catch(() => console.warn(`warn: --wait-for ${args["wait-for"]} 超时，按原样截`));
  for (const sel of many(args.click)) { await page.locator(sel).first().click(); await page.waitForTimeout(400); }
  // Next dev 的悬浮指示器不是产品界面。
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  for (const sel of many(args["app-remove"])) await page.locator(sel).evaluateAll((els) => els.forEach((e) => e.remove()));
  await page.waitForTimeout(Number(args["app-wait"] ?? 800));
  const naturalHeight = await page.evaluate(() => Math.ceil(document.scrollingElement?.scrollHeight ?? document.body.scrollHeight));
  return { ctx, page, naturalHeight };
}

// 「完整页面」用「同一个高视口」截，而不是 Playwright 的 fullPage：实现的左栏是 sticky + 100vh，
// fullPage 截图里它只盖住第一屏，而设计稿画框展开后左栏是通高的——两边都按「一块足够高的屏幕」渲染才可比。
async function finishApp(a, height) {
  if (fullPage) {
    await a.page.setViewportSize({ width, height });
    await a.page.waitForTimeout(Number(args["app-wait"] ?? 800));
  }
  const file = join(out, "app.png");
  await a.page.screenshot({ path: file, animations: "disabled" });
  const finalUrl = a.page.url();
  await a.ctx.close();
  return { png: readPng(file), finalUrl };
}

try {
  const d = await shootDesign();
  const viewportH = { web: 960, web1024: 880, phone: 844, mweb390: 844 }[d.board.kind] ?? 900;
  const a = await shootApp(viewportH);
  const tall = Math.max(d.naturalHeight, a.naturalHeight, viewportH);
  const design = { png: await finishDesign(d, tall), board: d.board };
  if (design.png.width !== width) console.warn(`warn: 画板宽 ${design.png.width} ≠ --width ${width}（${design.board.kind}）；比对只取两者较窄的宽度`);
  const app = await finishApp(a, tall);
  const viewKey = args["grid-view"] ?? `${args.board ?? args["board-index"]}-${width}-${theme}`;
  const result = compareImages({
    design: design.png,
    app: app.png,
    out,
    grid: args.grid && args.grid !== "false" ? (args.grid === "true" ? 100 : Number(args.grid)) : 0,
    gridDy: Number(args["grid-dy"] ?? 12),
    threshold: Number(args["grid-threshold"] ?? 0.02),
    attributionPath: args.attribution,
    viewKey,
    meta: { view: viewKey, design: args.design, board: design.board, app: args.app, finalUrl: app.finalUrl, width, theme, fullPage, naturalHeight: { design: d.naturalHeight, app: a.naturalHeight }, renderHeight: tall },
  });
  console.log(`raw=${result.raw} design=${result.designSize.join("x")} app=${result.appSize.join("x")}` + (result.band ? ` bands=${result.cells} over=${result.overBands} unattributed=${result.unattributed}` : "") + ` ${result.pass ? "PASS" : "FAIL"} out=${out}`);
  writeFileSync(join(out, "board.json"), `${JSON.stringify(design.board, null, 2)}\n`);
  await exit(result.exitCode);
} catch (error) {
  console.error(error);
  await exit(1);
}

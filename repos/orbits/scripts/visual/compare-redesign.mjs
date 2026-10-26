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
//   省额度（2026-10-12）：每张跑完打印超阈带文字表（带号、y、mismatch、偏移 dx/dy、主色 ΔE、归因）；--crop 只把超阈带裁成小图；
//               --style-diff 逐元素比计算样式与位置；--extract-board <文件> <画板序号或标题> [--to <文件>] 抽出单个画板的源码。
//   批量（门禁提速，2026-10-12）：
//               node scripts/visual/compare-redesign.mjs --suite scripts/visual/views/web-R07.json --only W-R07-01L,W-R07-01H \
//                 --out ~/orbit-sprint-evidence/redesign/R07/run-03 [--changed [ref]] [--workers 3] [--no-cache]
//
//   逐件对照（R31a，R31b 直接用）：
//     列出规格格：node scripts/visual/compare-redesign.mjs --list-cells --design 01-system.html [--section c-confirm] [--theme dark]
//     比一格：    ... --design 01-system.html --section c-ctl --cell 0 --theme light --app http://localhost:3200/showcase/components/c-ctl-0 \
//                 --region "0,0,399,180" --width 1440 --out <dir> --grid 30 [--design-stage keep]
//                 设计侧裁成该格（整数对齐）；实现侧按 --region 裁（整数 CSS px，视口坐标），或 --app-clip "<选择器>" 按元素外接矩形裁；
//                 --design-region 用于画板区域对比时分侧裁。
//   [contrast]：归因理由以 [contrast] 开头的带按 contrast-substitutions.json 逐像素判定（RD-26）。
//
// 退出码：0 通过；2 用法错误；3 画板 / 元素找不到；5 有超阈值带未以 [data] / [raster] / [contrast] 归因；6 整屏 raw > --raw-threshold（RD-29 起默认不卡 raw；批量取各张最大值）。
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { chromium } from "playwright";
import { STYLE_PROPS, changedFiles, collectStyles, compareImages, cropPair, parseRegion, specCellsInPage, designCache, diffStyles, extractBoardSource, formatBandReport, formatStyleDiff, designInputsHash, listBoardsInPage, loadSuite, many, parseArgs, pool, printSummary, readPng, readSecret, selectChanged, selectOnly, writePng } from "./redesign-pixel-lib.mjs";

const args = parseArgs(process.argv.slice(2));
const designBase = args["design-base"] ?? "http://localhost:3320/redesign-2026-10/";
const designUrl = (file) => (/^https?:/.test(file) ? file : designBase + encodeURI(file));
// 设计稿在本地的目录（算缓存哈希用）：仓库根 / docs/designs/redesign-2026-10。
const REPO_ROOT = resolve(dirname(new URL(import.meta.url).pathname), "../../../..");
const DESIGN_DIR = resolve(args["design-dir"] ?? join(REPO_ROOT, "docs/designs/redesign-2026-10"));
const home = (p) => resolve(String(p).replace(/^~(?=\/)/, process.env.HOME));

// --extract-board <文件> <画板序号或标题>：第二个值是位置参数，parseArgs 不收，这里直接从 argv 取。
const xb = process.argv.indexOf("--extract-board");
if (xb !== -1) {
  args.design = process.argv[xb + 1];
  const sel = process.argv[xb + 2];
  if (sel && !sel.startsWith("--")) { if (/^\d+$/.test(sel)) args["board-index"] = sel; else args.board = sel; }
}
if (!args.design && !args.suite) {
  console.error("usage error: --design <web.html | b8-responsive.html | 完整 URL> 或 --suite <清单> 必填");
  process.exit(2);
}

const browser = await chromium.launch({ channel: args.channel ?? "chrome" });
const exit = async (code) => { await browser.close(); process.exit(code); };
class Stop extends Error { constructor(code, message) { super(message); this.code = code; } }

// ---------- 设计稿：画板定位 ----------
async function openDesign(v, viewportWidth) {
  const ctx = await browser.newContext({ viewport: { width: viewportWidth, height: 1100 }, deviceScaleFactor: 1, locale: "ja-JP" });
  const page = await ctx.newPage();
  await page.goto(designUrl(v.design), { waitUntil: "load" });
  await page.evaluate(() => document.fonts?.ready);
  // 关掉注释针与 .pinned 的虚线框（body.no-pins 是 kit 自带开关），等计数 / 进度条动画（1.1s）走完。
  await page.evaluate(() => document.body.classList.add("no-pins"));
  await page.waitForTimeout(Number(v["design-wait"] ?? 1600));
  return { ctx, page };
}

if (xb !== -1) {
  const v = { ...args, width: Number(args.width ?? 1440), theme: args.theme === "dark" ? "dark" : "light", fullPage: false, key: "extract" };
  const d = await shootDesign(v).catch(async (error) => { console.error(error.message); await exit(error.code ?? 1); });
  const html = await d.frame.evaluate(extractBoardSource);
  await d.ctx.close();
  if (args.to) { writeFileSync(home(args.to), html); console.log(`#${d.board.index} ${d.board.label}（${d.board.kind}）→ ${home(args.to)}（${html.length} 字符）`); }
  else process.stdout.write(html);
  await exit(0);
}

if (args["list-cells"]) {
  const { page } = await openDesign(args, 1700);
  const titles = args.section ? [args.section] : await page.evaluate(() => [...document.querySelectorAll(".section-title")].map((t) => t.id || (t.querySelector("h2")?.textContent ?? "").trim()));
  const all = [];
  for (const section of titles) {
    const r = await page.evaluate(specCellsInPage, { section, theme: args.theme === "dark" ? "dark" : "light" });
    if (!r) { console.error(`section not found: ${section}`); continue; }
    all.push(r);
    if (!args.json) for (const u of r.units) console.log(`${r.section}\t#${u.index}\t${u.kind}\t${u.rect.slice(2).map((n) => Math.round(n)).join("x")}\t${u.mini ? "mini（不比）" : u.themed ? "duo" : "-"}\t${u.cap}`);
  }
  if (args.json) console.log(JSON.stringify(all, null, 2));
  await exit(0);
}

if (args.list) {
  const { page } = await openDesign(args, 1700);
  const boards = await page.evaluate(listBoardsInPage);
  if (args.json) console.log(JSON.stringify(boards, null, 2));
  else for (const b of boards) console.log(`#${b.index}\t${b.kind}\t${b.size.join("x")}\t${b.theme || "-"}\t${b.label}${b.frameInBoard > 0 ? ` [frame ${b.frameInBoard}]` : ""}\t« ${b.section}`);
  await exit(0);
}

// ---------- 设计侧截图 ----------
async function shootDesign(v) {
  const { width, theme, fullPage } = v;
  const { ctx, page } = await openDesign(v, Math.max(1700, width + 200));
  // 画板由 kit.js 渲染；并行加载、机器忙时可能还没画完：找不到目标就每秒重列一次（最多 45 秒；b12 近 300 块画板，机器忙时加载慢）。
  let target;
  for (let attempt = 0; attempt < 45 && !target; attempt++) {
    if (attempt) await page.waitForTimeout(1000);
    const boards = await page.evaluate(listBoardsInPage);
    if (v["board-index"] !== undefined) target = boards[Number(v["board-index"])];
    else if (v.board) {
      const hits = boards.filter((b) => b.label.includes(v.board) && (v["board-kind"] ? b.kind === v["board-kind"] : true));
      target = hits[Number(v["board-nth"] ?? 0)];
      if (hits.length > 1 && v["board-nth"] === undefined) console.warn(`warn: --board "${v.board}" 命中 ${hits.length} 块，取第 0 块（#${hits[0].index}）；用 --board-nth / --board-kind / --board-index 消歧`);
    }
  }
  if (!target) { await ctx.close(); throw new Stop(3, `design board not found: ${v.board ?? v["board-index"]}（先用 --list 看画板）`); }

  const handle = (await page.$$(".web, .phone")).filter(Boolean);
  const frames = [];
  for (const h of handle) if (!(await h.evaluate((f) => !!f.parentElement.closest(".web, .phone")))) frames.push(h);
  const frame = frames[target.index];
  // 先在画框里执行设计侧点击（打开抽屉 / 切页签），再处理主题与展开。
  for (const sel of many(v["design-click"])) {
    await frame.$(sel).then((el) => el?.click());
    await page.waitForTimeout(300);
  }
  await frame.evaluate((f, { theme, unroll, kind, removes, asMweb }) => {
    // 画框搬到页面最顶上 (0, 0)、其余内容隐藏，不用滚动就能截：画框原位在文档深处（web.html #0 的 top = 387.25），
    // 带 backdrop-filter 的合成层（.rail）在原位按另一套亚像素对齐栅格化文字，同一行字和实现差出整整 1px 行
    // （R07 返工实测：DOM 位置完全一致；原位清边距也不行，搬到顶部后差异为 0）。b12 等按分组类名用 CSS 嵌套
    // 写样式，所以用「同名类的空壳」把祖先链复刻一层包住画框（只留类名，布局、边距、背景清掉）。
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
    f.setAttribute("data-theme", theme);
    f.style.borderRadius = "0";
    f.style.boxShadow = "none";
    for (const sel of removes) for (const el of f.querySelectorAll(sel)) el.remove();
    // --design-as-mweb：手机画框（.phone）里画的是手机浏览器网页（如 b11 招待コード接收方 /i/<码>），按 mweb390 同样去掉系统 / 浏览器外壳。
    if (kind === "mweb390" || asMweb) {
      // 手机浏览器画框：状态栏、Safari 地址栏、Home 指示条是浏览器 / 系统外壳，不是网页内容。
      // 胶囊导航在画框里被抬到 Safari 底栏之上（bottom 100 = 底栏 92 + 间距 8）；真实浏览器视口不含 Safari 底栏，
      // 去掉底栏后把胶囊放回「底栏顶边之上同样间距」的位置。
      const sbarH = f.querySelector(":scope > .sbar")?.getBoundingClientRect().height ?? 0;
      const tab = f.querySelector(":scope > .tabbar");
      if (tab && sbarH) tab.style.bottom = `${Math.max(0, parseFloat(getComputedStyle(tab).bottom) - sbarH)}px`;
      // 底部弹层与它的遮罩同样被抬在 Safari 底栏之上（b12 .mweb .sheet bottom 100 / .sheet-scrim bottom 92）：一并放回。
      if (sbarH) for (const el of f.querySelectorAll(":scope > .sheet, :scope > .sheet-scrim")) el.style.bottom = `${Math.max(0, parseFloat(getComputedStyle(el).bottom) - sbarH)}px`;
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
  }, { theme, unroll: fullPage && v["design-unroll"] !== "false", kind: target.kind, removes: many(v["design-remove"]), asMweb: v["design-as-mweb"] === true || v["design-as-mweb"] === "true" });
  await page.waitForTimeout(300);
  const naturalHeight = await frame.evaluate((f) => Math.ceil(f.getBoundingClientRect().height));
  return { ctx, page, frame, board: target, naturalHeight };
}

const designStylesOf = (v, d) => d.frame.evaluate((f, [src, o]) => (0, eval)(`(${src})`)(f, o), [collectStyles.toString(), { props: STYLE_PROPS, region: v.regionBox }]);

async function finishDesign(v, d, height) {
  if (v.fullPage) {
    await d.frame.evaluate((f, h) => {
      f.style.height = `${h}px`;
      const scroll = f.querySelector(":scope > .scroll");
      if (scroll && f.classList.contains("phone")) scroll.style.minHeight = `${h}px`;
    }, height);
    await d.page.waitForTimeout(200);
  }
  const file = join(v.out, "design.png");
  // --style-diff：在画框定高之后、截图之前取样式（定高前底部对齐的元素位置还不对）。
  if (v.styleDiff) d.styles = await designStylesOf(v, d);
  await d.frame.screenshot({ path: file, animations: "disabled" });
  await d.ctx.close();
  return readPng(file);
}

// ---------- 实现侧截图 ----------
// 登录：一轮只验证 / 登录一次，存成 Playwright storageState，之后每张图的新上下文直接带上（不再每张重新登录、
// 也不再每张探一次 /api/auth/session）。默认存到 ~/orbit-sprint-evidence/redesign/.auth/<账号>.json（含会话 cookie，
// 在仓库之外、权限 600，不要提交）；--storage <文件> 可另指。
const authState = new Map();
async function ensureLogin(v) {
  const origin = new URL(v.app).origin;
  const key = `${origin}|${v.login}`;
  if (!authState.has(key)) authState.set(key, (async () => {
    const storage = home(v.storage ?? `~/orbit-sprint-evidence/redesign/.auth/${v.login}.json`);
    mkdirSync(dirname(storage), { recursive: true });
    const ctx = await browser.newContext(existsSync(storage) ? { storageState: storage } : {});
    try {
      // dev server 忙（其他会话在跑测试 / 编译）时探针和登录页都会很慢：探针失败重试一次，登录页等到输入框出现为止（2 分钟）。
      if (existsSync(storage)) {
        for (let attempt = 0; attempt < 2; attempt++) {
          const probe = await ctx.newPage();
          const res = await probe.goto(`${origin}/api/auth/session`, { waitUntil: "domcontentloaded", timeout: 90000 }).catch(() => null);
          const body = res ? await res.text().catch(() => "") : "";
          await probe.close();
          if (body.includes(v.login)) return storage;
          if (res) break;
        }
      }
      const password = readSecret(v["password-env"] ?? "ORBIT_PRIMARY_TEST_ACCOUNT_PASSWORD", v["env-file"] ?? ".env.local");
      if (!password) throw new Stop(2, "login: 找不到密码（--password-env / .env.local）");
      const lp = await ctx.newPage();
      await lp.goto(`${origin}/app/account/login`, { waitUntil: "domcontentloaded", timeout: 120000 }).catch(() => {});
      await lp.locator('input[type="email"]').first().waitFor({ timeout: 120000 });
      await lp.locator('input[type="email"]').first().fill(v.login);
      await lp.locator('input[type="password"]').first().fill(password);
      await lp.locator('form button[type="submit"]').first().click();
      const deadline = Date.now() + 90000;
      while (Date.now() < deadline && new URL(lp.url()).pathname.startsWith("/app/account/login")) await lp.waitForTimeout(250);
      if (new URL(lp.url()).pathname.startsWith("/app/account/login")) {
        const msg = await lp.locator('[role="alert"], .au-error, [aria-live]').allInnerTexts().catch(() => []);
        throw new Stop(2, `login failed: still on ${lp.url()} ${msg.join(" | ").slice(0, 200)}`);
      }
      await ctx.storageState({ path: storage });
      chmodSync(storage, 0o600);
      return storage;
    } finally {
      await ctx.close();
    }
  })());
  // 登录失败不缓存：下一张再试（一轮里 dev server 可能刚编译完就好了）。
  return authState.get(key).catch((error) => { authState.delete(key); throw error; });
}

async function shootApp(v, designHeight) {
  const { width, theme } = v;
  const storage = v.login && v.login !== "true" ? await ensureLogin(v) : null;
  const ctx = await browser.newContext({
    storageState: storage ?? undefined,
    viewport: { width, height: Number(v.height ?? designHeight) },
    deviceScaleFactor: 1,
    colorScheme: theme,
    locale: v.locale ?? "ja-JP",
  });
  // 主题靠 colorScheme（实现默认「自動」跟随系统，RD-05）；不写 localStorage，否则头像菜单的「外観」会显示成手动选了浅 / 深。
  await ctx.addInitScript(() => { try { localStorage.removeItem("orbit-theme"); } catch {} });
  // 套件 view 的 "init-script"：页面任何脚本之前执行（例：R28 把付费的 /api/profile/intro-draft 换成固定草稿，截图不调模型）。
  if (v["init-script"]) await ctx.addInitScript({ content: v["init-script"] });
  const page = await ctx.newPage();
  try { await page.goto(v.app, { waitUntil: "networkidle", timeout: 30000 }); }
  catch { await page.waitForTimeout(1500); }
  // Next dev 的悬浮指示器不是产品界面；先隐藏再做点击 / 步骤（它盖在左下角，会挡住左栏头像）。reload 步骤后要再藏一次。
  const hideDevIndicator = async () => {
    await page.waitForLoadState("load").catch(() => {});
    await page.addStyleTag({ content: "nextjs-portal,[data-nextjs-dev-tools-button],[data-next-mark]{display:none!important}" }).catch(async () => {
      // 页面在客户端跳转途中（例：旧路由兼容跳转）：等跳完再注入一次。
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await page.addStyleTag({ content: "nextjs-portal,[data-nextjs-dev-tools-button],[data-next-mark]{display:none!important}" });
    });
  };
  await hideDevIndicator();
  if (v["wait-for"]) await page.waitForSelector(v["wait-for"], { timeout: 20000 }).catch(() => console.warn(`warn: [${v.key}] --wait-for ${v["wait-for"]} 超时，按原样截`));
  for (const sel of many(v.click)) { await page.locator(sel).first().click(); await page.waitForTimeout(400); }
  // --steps '<JSON 数组>'：按顺序执行的实现侧操作，适合「先按 ⌘K 再输入」「先填名字再等重复候选」这类多步状态。
  // 每步一个对象：{"click": sel} | {"keys": "Meta+k"} | {"type": "文字"} | {"fill": [sel, 文字]} | {"upload": [sel, 文件…]} | {"hover": sel} | {"wait": ms} | {"waitFor": sel}
  //   | {"eval": "页面内 JS"}（如写 localStorage 里只存本机的状态）| {"reload": true}（重载后等原 wait-for）
  const steps = typeof v.steps === "string" ? JSON.parse(v.steps) : v.steps ?? [];
  for (const step of steps) {
    if (step.click) await page.locator(step.click).first().click();
    if (step.hover) await page.locator(step.hover).first().hover();
    if (step.keys) await page.keyboard.press(step.keys);
    if (step.type) await page.keyboard.type(step.type, { delay: 30 });
    if (step.fill) await page.locator(step.fill[0]).first().fill(step.fill[1]);
    if (step.upload) await page.locator(step.upload[0]).first().setInputFiles(step.upload.slice(1).map((f) => resolve(f)));
    if (step.waitFor) await page.waitForSelector(step.waitFor, { timeout: 20000 }).catch(() => console.warn(`warn: [${v.key}] waitFor ${step.waitFor} 超时`));
    if (step.eval) await page.evaluate(step.eval);
    if (step.reload) { await page.reload(); await hideDevIndicator(); if (v["wait-for"]) await page.waitForSelector(v["wait-for"], { timeout: 20000 }).catch(() => console.warn(`warn: [${v.key}] reload 后 wait-for 超时`)); }
    await page.waitForTimeout(step.wait ?? 400);
  }
  for (const sel of many(v["app-remove"])) await page.locator(sel).evaluateAll((els) => els.forEach((e) => e.remove()));
  await page.waitForTimeout(Number(v["app-wait"] ?? 800));
  const naturalHeight = await page.evaluate(() => Math.ceil(document.scrollingElement?.scrollHeight ?? document.body.scrollHeight));
  return { ctx, page, naturalHeight };
}

// 「完整页面」用「同一个高视口」截，而不是 Playwright 的 fullPage：实现的左栏是 sticky + 100vh，
// fullPage 截图里它只盖住第一屏，而设计稿画框展开后左栏是通高的——两边都按「一块足够高的屏幕」渲染才可比。
async function finishApp(v, a, height) {
  if (v.fullPage) {
    await a.page.setViewportSize({ width: v.width, height });
    await a.page.waitForTimeout(Number(v["app-wait"] ?? 800));
  }
  // 字符串表达式走 CDP Runtime.evaluate，不受页面 CSP 限制。
  if (v.styleDiff) a.styles = await a.page.evaluate(`(${collectStyles})(document.body, ${JSON.stringify({ props: STYLE_PROPS, region: v.regionBox })})`).catch((e) => { console.warn(`warn: [${v.key}] style-diff 实现侧取样失败：${e.message.split("\n")[0]}`); return null; });
  const file = join(v.out, "app.png");
  await a.page.screenshot({ path: file, animations: "disabled" });
  const finalUrl = a.page.url();
  await a.ctx.close();
  return { png: readPng(file), finalUrl, styles: a.styles ?? null };
}

const VIEWPORT_H = { web: 960, web1024: 880, phone: 844, mweb390: 844 };

// 逐件对照（R31a）：设计侧 = 01-system 第 n 格（1x，整数对齐后裁剪，带缓存）；实现侧 = 视口截图按 --region 裁。
async function runSpecView(v) {
  const t0 = Date.now();
  mkdirSync(v.out, { recursive: true });
  const stage = v["design-stage"] === "keep" ? "keep" : "flat";
  const hash = !/^https?:/.test(v.design) && v.cache !== false ? designInputsHash(DESIGN_DIR, v.design) : null;
  const cache = hash ? designCache({ v: 1, spec: true, hash, design: v.design, section: v.section, cell: Number(v.cell ?? 0), stage, theme: v.theme }) : null;
  let board = cache?.meta()?.board ?? null;
  let designPng = board ? cache.png("cell") : null;
  const cached = Boolean(designPng);
  if (!designPng) {
    const { ctx, page } = await openDesign(v, 1700);
    try {
      const cell = await page.evaluate(specCellsInPage, { section: String(v.section), theme: v.theme, cell: Number(v.cell ?? 0), stage }).catch((error) => { throw new Stop(3, error.message.split("\n")[0].replace(/^page\.evaluate: (Error: )?/, "")); });
      if (!cell) throw new Stop(3, `spec section not found: ${v.section}（先用 --list-cells 看清单）`);
      await page.waitForTimeout(300);
      const [x, y, w, h] = cell.rect;
      await page.screenshot({ path: join(v.out, "design.png"), clip: { x, y, width: w, height: h }, fullPage: true, animations: "disabled" });
      board = { spec: true, design: v.design, section: cell.section, cell: cell.index, kind: cell.kind, cap: cell.cap, rect: cell.rect, theme: v.theme };
      designPng = readPng(join(v.out, "design.png"));
      if (cache) { cache.saveMeta({ board }); cache.savePng("cell", join(v.out, "design.png")); }
    } finally {
      await ctx.close();
    }
  } else writePng(join(v.out, "design.png"), designPng);
  const region = v.region ? parseRegion(v.region) : null;
  const a = await shootApp(v, Number(v.height ?? 900));
  // --app-clip "<选择器>"：实现侧直接截该元素（Playwright 先滚到可见处），代替手写 --region（展示页小节位置不固定时用）。
  let app, appPng;
  if (v["app-clip"]) {
    const el = a.page.locator(v["app-clip"]).first();
    if (!(await el.count().catch(() => 0))) { await a.ctx.close(); throw new Stop(3, `--app-clip 找不到元素：${v["app-clip"]}`); }
    await a.page.waitForTimeout(Number(v["app-wait"] ?? 800));
    await el.screenshot({ path: join(v.out, "app.png"), animations: "disabled" });
    app = { finalUrl: a.page.url() };
    appPng = readPng(join(v.out, "app.png"));
    await a.ctx.close();
  } else {
    app = await finishApp({ ...v, fullPage: false, styleDiff: false }, a, Number(v.height ?? 900));
    // --region 只裁实现侧（视口坐标）；设计侧就是整个规格格（R31b 修：原先设计侧也按同一框裁，框不在 0,0 时报「在图外」）。
    appPng = region ? cropPair({ design: designPng, app: app.png, region, designRegion: [0, 0, designPng.width, designPng.height] }).app : app.png;
  }
  writePng(join(v.out, "app.png"), appPng);
  if (appPng.width !== designPng.width || appPng.height !== designPng.height) console.warn(`warn: [${v.key}] 实现 ${appPng.width}x${appPng.height} ≠ 规格格 ${designPng.width}x${designPng.height}；多出 / 缺的部分按不一致计`);
  const result = compareImages({
    design: designPng,
    app: appPng,
    out: v.out,
    grid: v.grid && v.grid !== "false" ? (v.grid === "true" || v.grid === true ? 30 : Number(v.grid)) : 0,
    gridDy: Number(v["grid-dy"] ?? 12),
    threshold: Number(v["grid-threshold"] ?? 0.02),
    // RD-29：Web 与 App（决定表 §20）同一判定，所有超阈值带都归因即通过，raw 只作参考。
    rawThreshold: v["raw-threshold"] === undefined ? Infinity : Number(v["raw-threshold"]),
    attributionPath: v.attribution,
    viewKey: v.key,
    meta: { crop: v.crop === true || v.crop === "true", view: v.key, design: v.design, board, app: v.app, finalUrl: app.finalUrl, width: v.width, theme: v.theme, region: region ? region.join(",") : null, appClip: v["app-clip"] ?? null, designCached: cached },
  });
  writeFileSync(join(v.out, "board.json"), `${JSON.stringify(board, null, 2)}\n`);
  return { ...result, styleDiff: null, key: v.key, triptych: join(v.out, "triptych.png"), out: v.out, ms: Date.now() - t0 };
}

// 一张图：设计稿走缓存（键 = 画板 + 设计文件与 kit 的内容哈希 + 宽度 + 主题 + 截图参数，渲染高度另作后缀）。
// 命中元数据时先截实现、算出渲染高度，再找同高度的设计截图；都命中就完全不开设计稿页面。
async function runView(v) {
  if (v.section !== undefined) return runSpecView(v);
  const t0 = Date.now();
  mkdirSync(v.out, { recursive: true });
  const local = !/^https?:/.test(v.design) && v.cache !== false;
  const hash = local ? designInputsHash(DESIGN_DIR, v.design) : null;
  const cache = hash ? designCache({ v: 1, hash, design: v.design, board: v.board ?? null, boardIndex: v["board-index"] ?? null, kind: v["board-kind"] ?? null, nth: v["board-nth"] ?? null, width: v.width, theme: v.theme, fullPage: v.fullPage, click: many(v["design-click"]), remove: many(v["design-remove"]), unroll: v["design-unroll"] ?? null, ...(v["design-as-mweb"] ? { asMweb: true } : {}) }) : null;
  const meta = cache?.meta();
  let d = null, board, designNatural, designPng = null, cached = false, designStyles = null;
  v.regionBox = v.region ? String(v.region).split(",").map(Number) : null;
  // --style-diff 要在设计稿页面里取样式：命中缓存也得开一次设计稿（截图仍可用缓存）。
  if (meta && !v.styleDiff) ({ board, naturalHeight: designNatural } = meta);
  else { d = await shootDesign(v); board = d.board; designNatural = d.naturalHeight; }

  const viewportH = VIEWPORT_H[board.kind] ?? 900;
  const a = await shootApp(v, viewportH);
  const tall = v.fullPage ? Math.max(designNatural, a.naturalHeight, viewportH) : "vp";
  if (!d) designPng = cache.png(tall);
  if (designPng && !v.styleDiff) { cached = true; writePng(join(v.out, "design.png"), designPng); }
  else {
    d ??= await shootDesign(v);
    designPng = await finishDesign(v, d, tall);
    designStyles = d.styles ?? null;
    if (cache) { cache.saveMeta({ board, naturalHeight: designNatural }); cache.savePng(tall, join(v.out, "design.png")); }
  }
  if (designPng.width !== v.width) console.warn(`warn: [${v.key}] 画板宽 ${designPng.width} ≠ --width ${v.width}（${board.kind}）；比对只取两者较窄的宽度`);
  const app = await finishApp(v, a, tall === "vp" ? viewportH : tall);
  // --region "x,y,w,h"：只比画面里的一块（导航壳的左栏 / 主标题区 / 右栏单独验收时用）；全屏数字仍以不带本项为准。
  // --design-region（R31a）：另给时设计侧按它裁、实现侧按 --region 裁（两侧不在同一位置时用，DEFERRED-A R30-02）。
  if (v.region || v["design-region"]) {
    ({ design: designPng, app: app.png } = cropPair({ design: designPng, app: app.png, region: v.region ? parseRegion(v.region) : null, designRegion: v["design-region"] ? parseRegion(v["design-region"]) : null }));
    writePng(join(v.out, "design.png"), designPng);
    writePng(join(v.out, "app.png"), app.png);
  }
  const result = compareImages({
    design: designPng,
    app: app.png,
    out: v.out,
    grid: v.grid && v.grid !== "false" ? (v.grid === "true" || v.grid === true ? 100 : Number(v.grid)) : 0,
    gridDy: Number(v["grid-dy"] ?? 12),
    threshold: Number(v["grid-threshold"] ?? 0.02),
    // RD-29（2026-10-18）：Web 与 App（决定表 §20）同一判定——所有超阈值带都归因即通过，整屏 raw 只作参考；--raw-threshold 0.02 恢复旧卡法。
    rawThreshold: v["raw-threshold"] === undefined ? Infinity : Number(v["raw-threshold"]),
    attributionPath: v.attribution,
    viewKey: v.key,
    meta: { crop: v.crop === true || v.crop === "true", view: v.key, design: v.design, board, app: v.app, finalUrl: app.finalUrl, width: v.width, theme: v.theme, fullPage: v.fullPage, region: v.region ?? null, naturalHeight: { design: designNatural, app: a.naturalHeight }, renderHeight: tall, designCached: cached },
  });
  writeFileSync(join(v.out, "board.json"), `${JSON.stringify(board, null, 2)}\n`);
  let styleDiff = null;
  if (v.styleDiff && designStyles && app.styles) {
    styleDiff = diffStyles(designStyles, app.styles);
    writeFileSync(join(v.out, "style-diff.json"), `${JSON.stringify(styleDiff, null, 2)}\n`);
  }
  return { ...result, styleDiff, key: v.key, triptych: join(v.out, "triptych.png"), out: v.out, ms: Date.now() - t0 };
}

// 单张：命令行参数就是这一张的全部参数。批量：清单里每张的参数 + 命令行的全局参数（命令行优先，如 --app-origin / --attribution）。
function viewFrom(base, extra = {}) {
  const v = { ...base, ...extra };
  v.width = Number(v.width ?? 1440);
  v.theme = v.theme === "dark" ? "dark" : "light";
  v.fullPage = !(v["viewport-only"] === "true" || v["viewport-only"] === true || v.viewport === true);
  v.cache = !(args["no-cache"] || args.cache === "false");
  v.styleDiff = Boolean(args["style-diff"]) || v["style-diff"] === true;
  v.crop = Boolean(args.crop) || v.crop === true;
  if (v["app-origin"] && v.app?.startsWith("/")) v.app = new URL(v.app, v["app-origin"]).href;
  return v;
}

try {
  if (!args.suite) {
    for (const key of ["app", "out"]) if (!args[key]) { console.error(`usage error: --${key} 必填`); await exit(2); }
    const v = viewFrom(args);
    v.out = home(args.out);
    v.key = args["grid-view"] ?? `${args.section !== undefined ? `${args.section}-${args.cell ?? 0}` : args.board ?? args["board-index"]}-${v.width}-${v.theme}`;
    if (typeof v.app === "string") v.app = v.app.replaceAll("{theme}", v.theme);
    const r = await runView(v);
    console.log(`raw=${r.raw} design=${r.designSize.join("x")} app=${r.appSize.join("x")}` + (r.band ? ` bands=${r.cells} over=${r.overBands} unattributed=${r.unattributed}` : "") + (r.missing.length ? ` missing=${r.missing.length}` : "") + ` ${r.pass ? "PASS" : "FAIL"}${r.designCached ? " (design cached)" : ""} out=${v.out}`);
    for (const m of r.missing.slice(0, 5)) console.warn(`warn: ⚠ 缺块 x=${m.x} y=${m.y} ${m.w}x${m.h}：设计稿这块有内容、实现是空的（raw 低也要看 triptych）`);
    if (r.bandsReport) console.log(formatBandReport(v.key, r.bandsReport));
    if (r.styleDiff) console.log(formatStyleDiff(v.key, r.styleDiff));
    await exit(r.exitCode);
  }
  if (!args.out) { console.error("usage error: --out 必填（每张图写到 <out>/<画面键>/）"); await exit(2); }
  const suiteFile = resolve(args.suite);
  let runs = loadSuite(suiteFile);
  const total = runs.length;
  if (args.only) runs = selectOnly(runs, args.only);
  if (args.changed) {
    const files = changedFiles(args.changed, REPO_ROOT);
    runs = selectChanged(runs, files, relative(REPO_ROOT, DESIGN_DIR));
    console.log(`--changed：改动 ${files.length} 个文件，命中 ${runs.length} / ${total} 张`);
  }
  if (!runs.length) { console.log("没有要跑的画面（--only / --changed 没命中）"); await exit(0); }
  const outRoot = home(args.out);
  const globals = Object.fromEntries(Object.entries(args).filter(([k]) => !["suite", "only", "changed", "out", "workers", "no-cache", "cache", "summary", "style-diff", "crop"].includes(k)));
  const workers = Number(args.workers ?? 3);
  const t0 = Date.now();
  console.log(`跑 ${runs.length} / ${total} 张，并行 ${workers}`);
  const results = await pool(runs, workers, async (run) => {
    const { key, sources, themes, id, ...rest } = run;
    const v = viewFrom(rest, globals);
    v.key = key;
    v.out = join(outRoot, key);
    try {
      const r = await runView(v);
      console.log(`${key} ${r.pass ? "PASS" : "FAIL"} raw=${r.raw}` + (r.band ? ` over=${r.overBands} unattributed=${r.unattributed}` : "") + (r.missing.length ? ` ⚠缺块=${r.missing.length}` : "") + ` ${(r.ms / 1000).toFixed(1)}s${r.designCached ? " (design cached)" : ""}`);
      return r;
    } catch (error) {
      console.error(`${key} ERROR ${error.message}`);
      return { key, pass: false, error: error.message.split("\n")[0], exitCode: error.code ?? 1, ms: 0 };
    }
  });
  printSummary(results, { file: join(outRoot, "summary.json") });
  for (const r of results) {
    if (r.bandsReport?.length) console.log(`\n${formatBandReport(r.key, r.bandsReport)}`);
    if (r.styleDiff && (r.styleDiff.rows.length || r.styleDiff.unmatched.length)) console.log(`\n${formatStyleDiff(r.key, r.styleDiff)}`);
  }
  console.log(`总耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s；摘要 ${join(outRoot, "summary.json")}`);
  await exit(Math.max(0, ...results.map((r) => r.exitCode ?? 0)));
} catch (error) {
  console.error(error instanceof Stop ? error.message : error);
  await exit(error instanceof Stop ? error.code : 1);
}

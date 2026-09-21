// $WEB/scripts/visual/compare-0918.mjs
// 并排截取设计稿（python http.server 3320 起 docs/designs）与本地 dev server（3100）
// 的同一屏，输出两张 PNG + 逐像素差异图，并打印不一致像素比例。
// 用法示例：
//   node scripts/visual/compare-0918.mjs \
//     --design "http://localhost:3320/Orbit_0918/Network%20v2.dc.html" --design-view all \
//     --app "http://localhost:3100/app/contacts" --cookie "authjs.session-token=…" \
//     --out /tmp/network-all
//
// 也可以用 --login "email:password" 代替 --cookie：脚本会在截 app 图之前
// 先打开 /app/account/login 走一遍真实登录流程，再继续截图。
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { PNG } from "pngjs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith("--")) acc.push([cur.slice(2), arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : "true"]);
    return acc;
  }, []),
);
const width = Number(args.width ?? 1240);
const out = args.out ?? "/tmp/compare-0918";
mkdirSync(out, { recursive: true });

if (args.login && !args.login.includes(":")) {
  console.error(`usage error: --login must be "email:password", got "${args.login}"`);
  process.exit(2);
}

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  if (args.cookie) {
    const [name, ...rest] = args.cookie.split("=");
    await ctx.addCookies([{ name, value: rest.join("="), domain: "localhost", path: "/" }]);
  }
  if (args.login) {
    const sep = args.login.indexOf(":");
    const email = args.login.slice(0, sep);
    const password = args.login.slice(sep + 1);
    const appOrigin = new URL(args.app).origin;
    const loginPage = await ctx.newPage();
    await loginPage.goto(`${appOrigin}/app/account/login`, { waitUntil: "networkidle" });
    await loginPage.getByPlaceholder("输入邮箱地址").fill(email);
    await loginPage.getByPlaceholder("输入密码").fill(password);
    await loginPage.getByRole("button", { name: "登录", exact: true }).click();
    // 登录成功后是客户端路由跳转（history pushState），不一定触发
    // Playwright 的 framenavigated/networkidle 事件，所以手动轮询 URL。
    const loginDeadline = Date.now() + 10000;
    while (Date.now() < loginDeadline && new URL(loginPage.url()).pathname.startsWith("/app/account/login")) {
      await loginPage.waitForTimeout(200);
    }
    await loginPage.waitForLoadState("networkidle").catch(() => {});
    const loginUrl = loginPage.url();
    await loginPage.close();
    if (new URL(loginUrl).pathname.startsWith("/app/account/login")) {
      console.error(`login failed: still on ${loginUrl}`);
      await browser.close();
      process.exit(2);
    }
  }

  async function shoot(url, file, prep) {
    const page = await ctx.newPage();
    // 设计稿会持续拉取大量 Google Fonts 字重，永远打不到 networkidle；
    // 超时后退化为等 load + 固定延时，不影响截图正确性。
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
    } catch {
      await page.goto(url, { waitUntil: "load" });
      await page.waitForTimeout(1500);
    }
    if (prep) await prep(page);
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(out, file), fullPage: true, timeout: 60000 });
    await page.close();
    return PNG.sync.read((await import("node:fs")).readFileSync(join(out, file)));
  }

  // 设计稿是单页多视图：通过点击主页签切到目标视图。
  // Network 表（--design-view overview|pipeline|all|import|analysis）：无 --design-view 时默认点「概览」。
  // 个人中心 表（--design-view profile|settings|connect）：无 --design-view 时不点击任何页签
  // （persona 视图不是页签，靠调用方传 --design-click "text=编辑商务画像" 从「个人资料」页进入）。
  // 判定用 --design URL 是否含个人中心的 URL 编码，或显式传 --design-table profile。
  const isProfileTable = args["design-table"] === "profile" || (args.design ?? "").includes("%E4%B8%AA%E4%BA%BA%E4%B8%AD%E5%BF%83");
  const networkViewLabel = { overview: "概览", pipeline: "关系管线", all: "所有人脉", import: "导入人脉", analysis: "查看完整分析" };
  const profileViewLabel = { profile: "个人资料", settings: "iOrbit 设置", connect: "连接" };
  const viewLabel = isProfileTable ? profileViewLabel[args["design-view"]] : networkViewLabel[args["design-view"] ?? "overview"];
  const design = await shoot(args.design, "design.png", async (page) => {
    if (viewLabel) await page.getByRole("button", { name: viewLabel, exact: true }).first().click();
    if (args["design-click"]) await page.locator(args["design-click"]).first().click();
    if (args["design-click2"]) { await page.waitForTimeout(300); await page.locator(args["design-click2"]).first().click(); }
  });
  const app = await shoot(args.app, "app.png", async (page) => {
    if (args.click) await page.locator(args.click).first().click();
    if (args.click2) { await page.waitForTimeout(300); await page.locator(args.click2).first().click(); }
  });

  const h = Math.min(design.height, app.height);
  const diff = new PNG({ width, height: h });
  let bad = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    const same = Math.abs(design.data[i] - app.data[i]) < 24 && Math.abs(design.data[i + 1] - app.data[i + 1]) < 24 && Math.abs(design.data[i + 2] - app.data[i + 2]) < 24;
    if (!same) bad++;
    diff.data[i] = same ? app.data[i] : 255; diff.data[i + 1] = same ? app.data[i + 1] : 0; diff.data[i + 2] = same ? app.data[i + 2] : 0; diff.data[i + 3] = 255;
  }
  writeFileSync(join(out, "diff.png"), PNG.sync.write(diff));
  console.log(`mismatch=${(bad / (width * h)).toFixed(4)} design=${design.height}px app=${app.height}px out=${out}`);
} finally {
  await browser.close();
}

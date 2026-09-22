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
//
// Events 设计稿（--design 含 Events.dc.html 或 --design-table events）按视图走点击序列：
//   node scripts/visual/compare-0918.mjs \
//     --design "http://localhost:3320/Orbit_0918/Events.dc.html" --design-view detail \
//     --app "http://localhost:3100/app/events/<id>" --login "email:password" --out /tmp/events-detail
// 弹窗（任务 5）：视图序列后再点 --design-click / --design-click2 / --design-click3（可选 --design-fill "<selector>|<text>" 在 click3 前填字）；
//   应用侧 --click / --click2 / --click3。例：参会者 = live + --design-click 'role=button[name="全部参会者"s]' --design-click2 'role=button[name="查看资料"]'。
//
// 运营台 设计稿（--design 含 %E8%BF%90%E8%90%A5%E5%8F%B0（运营台）或 --design-table ops）按视图走点击序列：
//   node scripts/visual/compare-0918.mjs \
//     --design "http://localhost:3320/Orbit_0918/Events%20%E8%BF%90%E8%90%A5%E5%8F%B0.dc.html" --design-view ops \
//     --app "http://localhost:3100/app/events/<id>/operations" --login "organizer:password" --out /tmp/ops-ops
//   视图：hub（无点击）| ops（点第一张卡「进入运营 →」）| match/people/checkin/form/report（ops 后点同名页签）| drawer（ops 后点「更多 ⌄」）。
//
// iOrbit 设计稿（--design 含 iOrbit.dc.html 或 --design-table iorbit）按视图走点击序列（七个视图全部从概览屏点一下进入）：
//   node scripts/visual/compare-0918.mjs \
//     --design "http://localhost:3320/Orbit_0918/iOrbit.dc.html" --design-view chat \
//     --app "http://localhost:3100/app/agent?session=<id>" --login "qa@orbit.test:<password>" --out /tmp/iorbit-chat
//   视图：home（无点击；应用侧先等 [data-orbit-iorbit-ready="true"]）| chat（button「进入对话页 →」）| actions（**link**「查看建议与行动 →」）| plan（**link**「查看完整日程 →」）
//        | strategy（button「帮我制定推进计划」）| contacts（button「我该先联系谁」）| history（button「◷ 历史记录」，须配 --viewport-only）。
//   chat 视图的应用侧会话用 scripts/visual/seed-iorbit-chat-session.mjs 种下（真实写接口，字节稳定）。
// 认证弹窗 设计稿（--design 含 %E9%A6%96%E9%A1%B5（首页）或 --design-table auth）按视图走点击序列（未登录访问，无需 --login）：
//   node scripts/visual/compare-0918.mjs \
//     --design "http://localhost:3320/Orbit_0918/Orbit%20%E9%A6%96%E9%A1%B5.dc.html" --design-view login \
//     --app "http://localhost:3100/app/account/login" --viewport-only --out /tmp/auth-login
//   视图：landing（无点击，落地页基线）| login（点头部链接「登录」）| register/forgot/reset/reset-invalid（login 后点演示条 注册/找回/新密码/失效链接）。
//   通用选项：--design-remove "<selector>"（截图前在页面里删除设计侧所有匹配元素，CSS 或 Playwright 选择器均可，如演示条
//   "div:has(> span:text-is('演示'))"）；--app-remove "<selector>"（同理删应用侧元素，仅用于归因设计外附加件，如 ".au-google"）；
//   --viewport-only（两侧只截视口，不截全页）。
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
    // 认证弹窗 任务 2：/app/account/login 是 Orbit_0918 弹窗，占位符为设计的 you@company.com / ••••••••。
    await loginPage.getByPlaceholder("you@company.com").fill(email);
    await loginPage.getByPlaceholder("••••••••").fill(password);
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

  const fullPage = args["viewport-only"] !== "true";
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
    await page.screenshot({ path: join(out, file), fullPage, timeout: 60000 });
    await page.close();
    return PNG.sync.read((await import("node:fs")).readFileSync(join(out, file)));
  }

  // 设计稿是单页多视图：通过点击主页签切到目标视图。
  // Network 表（--design-view overview|pipeline|all|import|analysis）：无 --design-view 时默认点「概览」。
  // 个人中心 表（--design-view profile|settings|connect）：无 --design-view 时不点击任何页签
  // （persona 视图不是页签，靠调用方传 --design-click "text=编辑商务画像" 从「个人资料」页进入）。
  // Events 表（--design-view discover|mine|detail|live|recap）：不是页签映射，而是「按视图的设计侧
  // 点击序列」（Events.dc.html 的详情/现场/回顾都要从列表卡片点进去）；无 --design-view 时等同 discover（不点击）。
  // 判定用 --design URL 是否含个人中心的 URL 编码 / Events.dc.html，或显式传 --design-table profile|events。
  const isProfileTable = args["design-table"] === "profile" || (args.design ?? "").includes("%E4%B8%AA%E4%BA%BA%E4%B8%AD%E5%BF%83");
  // 运营台 表（--design-view hub|ops|match|people|checkin|form|report|drawer）：同 Events，按视图走设计侧点击序列
  // （Events 运营台.dc.html 的运营台子页都要从活动中心第一张卡「进入运营 →」点进去；抽屉由「更多 ⌄」直接打开，无子菜单）。
  // 判定用 --design URL 是否含「运营台」的 URL 编码，或显式传 --design-table ops（先于 Events 判定，因为文件名也含 Events）。
  const isOpsTable = args["design-table"] === "ops" || (args.design ?? "").includes("%E8%BF%90%E8%90%A5%E5%8F%B0");
  const isEventsTable = !isOpsTable && (args["design-table"] === "events" || (args.design ?? "").includes("Events.dc.html"));
  // 认证弹窗 表（--design-view landing|login|register|forgot|reset|reset-invalid）：同 Events，按视图走设计侧点击序列
  // （Orbit 首页.dc.html：头部「登录」是 <a href="#" onClick=openLogin>，弹窗底部「演示」条（465–472 行）五枚按钮切换四态；
  // 设计没有 role=dialog，且演示条的「登录」与主按钮同名，所以切换按钮限定在演示条容器内）。
  // 判定用 --design URL 是否含「首页」的 URL 编码，或显式传 --design-table auth。
  const isAuthTable = args["design-table"] === "auth" || (args.design ?? "").includes("%E9%A6%96%E9%A1%B5");
  // iOrbit 表（--design-view home|chat|actions|plan|strategy|contacts|history）：同 Events，按视图走设计侧点击序列。
  // iOrbit.dc.html 的六屏与历史抽屉都从概览屏（默认视图）点一下进入：goChat/goActions/goPlan/goStrategy/goContacts/openHistory。
  // 注意 actions/plan 的入口是 <a href="#" onClick>（role=link），其余是 <button>（role=button），角色不同不能混用。
  // 判定用 --design URL 是否含 iOrbit.dc.html，或显式传 --design-table iorbit（文件名不与其他表冲突，放在链尾即可，
  // 但 viewLabel 必须与 Events/运营台/认证 一样跳过 Network 默认的「概览」页签点击）。
  const isIorbitTable = args["design-table"] === "iorbit" || (args.design ?? "").includes("iOrbit.dc.html");
  const networkViewLabel = { overview: "概览", pipeline: "关系管线", all: "所有人脉", import: "导入人脉", analysis: "查看完整分析" };
  const profileViewLabel = { profile: "个人资料", settings: "iOrbit 设置", connect: "连接" };
  const viewLabel = isEventsTable || isOpsTable || isAuthTable || isIorbitTable ? undefined : isProfileTable ? profileViewLabel[args["design-view"]] : networkViewLabel[args["design-view"] ?? "overview"];
  // 每一步是 (page) => Locator；按顺序点击，步间短等待让设计稿的 renderVals 重绘完成。
  const eventsDetailSequence = [(page) => page.locator("text=AI 产品从 0 到 1").first()];
  const eventsViewSequence = {
    discover: [],
    mine: [(page) => page.getByRole("button", { name: "我的活动", exact: true }).first()],
    detail: eventsDetailSequence,
    live: [...eventsDetailSequence, (page) => page.locator("text=进入活动现场").first()],
    recap: [(page) => page.locator("text=回看活动").first()],
  };
  const eventsView = args["design-view"] ?? "discover";
  if (isEventsTable && !(eventsView in eventsViewSequence)) {
    console.error(`usage error: events --design-view must be one of ${Object.keys(eventsViewSequence).join("|")}, got "${eventsView}"`);
    await browser.close();
    process.exit(2);
  }
  // 运营台：ops = 活动中心第一张卡的「进入运营 →」；子页签按精确名点击；drawer = 「更多 ⌄」直接 openDrawer。
  const opsEnterSequence = [(page) => page.getByRole("button", { name: "进入运营 →", exact: true }).first()];
  const opsTab = (label) => [...opsEnterSequence, (page) => page.getByRole("button", { name: label, exact: true }).first()];
  const opsViewSequence = {
    hub: [],
    ops: opsEnterSequence,
    match: opsTab("匹配与分组"),
    people: opsTab("参会者"),
    checkin: opsTab("签到"),
    form: opsTab("报名设置"),
    report: opsTab("数据报告"),
    drawer: [...opsEnterSequence, (page) => page.getByRole("button", { name: "更多 ⌄", exact: true }).first()],
  };
  const opsView = args["design-view"] ?? "hub";
  if (isOpsTable && !(opsView in opsViewSequence)) {
    console.error(`usage error: ops --design-view must be one of ${Object.keys(opsViewSequence).join("|")}, got "${opsView}"`);
    await browser.close();
    process.exit(2);
  }
  // 认证弹窗：login = 头部链接「登录」（exact，页面唯一）；其余四态 = login 后点演示条内同名按钮。
  const authOpenSequence = [(page) => page.getByRole("link", { name: "登录", exact: true }).first()];
  const authStrip = (page) => page.locator("div:has(> span:text-is('演示'))").first();
  const authDemo = (label) => [...authOpenSequence, (page) => authStrip(page).getByRole("button", { name: label, exact: true })];
  const authViewSequence = {
    landing: [],
    login: authOpenSequence,
    register: authDemo("注册"),
    forgot: authDemo("找回"),
    reset: authDemo("新密码"),
    "reset-invalid": authDemo("失效链接"),
  };
  const authView = args["design-view"] ?? "landing";
  if (isAuthTable && !(authView in authViewSequence)) {
    console.error(`usage error: auth --design-view must be one of ${Object.keys(authViewSequence).join("|")}, got "${authView}"`);
    await browser.close();
    process.exit(2);
  }
  // iOrbit：七个视图都是概览屏上的一次点击。actions/plan 是 <a>（role=link），其余是 <button>；
  // 「◷ 历史记录」在概览/对话/策略/联系人四屏都有同名按钮，概览屏上 .first() 即设计 242 行那颗。
  const iorbitButton = (label) => [(page) => page.getByRole("button", { name: label, exact: true }).first()];
  const iorbitLink = (label) => [(page) => page.getByRole("link", { name: label, exact: true }).first()];
  const iorbitViewSequence = {
    home: [],
    chat: iorbitButton("进入对话页 →"),
    actions: iorbitLink("查看建议与行动 →"),
    plan: iorbitLink("查看完整日程 →"),
    strategy: iorbitButton("帮我制定推进计划"),
    contacts: iorbitButton("我该先联系谁"),
    history: iorbitButton("◷ 历史记录"),
  };
  const iorbitView = args["design-view"] ?? "home";
  if (isIorbitTable && !(iorbitView in iorbitViewSequence)) {
    console.error(`usage error: iorbit --design-view must be one of ${Object.keys(iorbitViewSequence).join("|")}, got "${iorbitView}"`);
    await browser.close();
    process.exit(2);
  }
  const designSequence = isIorbitTable ? iorbitViewSequence[iorbitView] : isAuthTable ? authViewSequence[authView] : isOpsTable ? opsViewSequence[opsView] : isEventsTable ? eventsViewSequence[eventsView] : [];
  const design = await shoot(args.design, "design.png", async (page) => {
    if (viewLabel) await page.getByRole("button", { name: viewLabel, exact: true }).first().click();
    for (const step of designSequence) { await step(page).click(); await page.waitForTimeout(300); }
    // iOrbit history：「◷ 历史记录」是概览屏最下方的按钮，Playwright 点击前会把它滚进视口，
    // 而 openHistory（与 go() 不同）不会 scrollTo(0,0) —— 配 --viewport-only 时底图会是滚动后的半页。
    // 抽屉是 position:fixed，滚回顶部不影响它，只让底图与应用侧一致。
    if (isIorbitTable && iorbitView === "history") { await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(200); }
    if (args["design-click"]) await page.locator(args["design-click"]).first().click();
    if (args["design-click2"]) { await page.waitForTimeout(300); await page.locator(args["design-click2"]).first().click(); }
    // 弹窗内需要先填字才能到下一态（Events 交换成功态：设计 sendEx 要求留言非空）："<selector>|<text>"
    if (args["design-fill"]) { const sep = args["design-fill"].indexOf("|"); await page.locator(args["design-fill"].slice(0, sep)).first().fill(args["design-fill"].slice(sep + 1)); }
    if (args["design-click3"]) { await page.waitForTimeout(300); await page.locator(args["design-click3"]).first().click(); }
    // 去除设计稿的纯演示 UI（如认证弹窗底部的「演示」切换条）后再截图：删除所有匹配元素。
    // 走 locator.evaluateAll 而不是 document.querySelectorAll：演示条无 class/id，只能靠 Playwright 的
    // 文本伪类定位（如 "div:has(> span:text-is('演示'))"）；纯 CSS 选择器同样可用。
    if (args["design-remove"]) await page.locator(args["design-remove"]).evaluateAll((els) => { for (const el of els) el.remove(); });
  });
  const app = await shoot(args.app, "app.png", async (page) => {
    // iOrbit 概览屏的四个来源（facts server action / 账本 / 信号 / 会话）在 hydration 之后才发，
    // 固定 400ms 会截到 pending 态（「审阅修订」37）：等应用侧自报就绪，超时就按原样截。
    // history 视图的底图也是概览屏（抽屉浮在它上面），同样要等它自报就绪。
    if (isIorbitTable && (iorbitView === "home" || iorbitView === "history")) {
      await page.waitForSelector('[data-orbit-iorbit-ready="true"]', { timeout: 20000 }).catch(() => {});
    }
    if (args.click) await page.locator(args.click).first().click();
    if (args.click2) { await page.waitForTimeout(300); await page.locator(args.click2).first().click(); }
    if (args.click3) { await page.waitForTimeout(300); await page.locator(args.click3).first().click(); }
    // 归因用（认证弹窗 任务 2）：截图前删除应用侧所有匹配元素（如设计外的 Google 钮 ".au-google"），
    // 得到「框级非数据残差」；正式数字仍以不传本项的 raw 为准。
    // 与设计侧同一处理：点「◷ 历史记录」会把按钮滚进视口，抽屉是 position:fixed，
    // 滚回顶部只让底图与设计侧一致（配 --viewport-only）。
    if (isIorbitTable && iorbitView === "history") { await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(200); }
    if (args["app-remove"]) await page.locator(args["app-remove"]).evaluateAll((els) => { for (const el of els) el.remove(); });
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

// 三语言界面文字扫描（2026-11-21 语言混杂审计）：按语言 cookie 爬站内页面，抽出可见文字与 placeholder/aria-label/title，
// 列出「当前语言下出现了其他语言」的文字（en 里的汉字假名、zh 里的假名与英文单词、ja 里的简体专用字与英文单词）。
// 用户/主办方/AI 内容（姓名、活动名、推荐理由）也会被列出：对照源码判断——源码里找得到的是界面文案，要修。
// 用法：node scripts/lang-mix-scan.mjs <origin> <sessionTokenFile> <outPrefix> <ja|zh|en> [width]
//   → <outPrefix>-<lang>.json（每页文字）与 <outPrefix>-<lang>-flags.txt（类别 · 文字 · 出现页面）
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";

const [origin, cookieFile, out, lang, widthArg = "1440"] = process.argv.slice(2);
if (!origin || !cookieFile || !out || !["ja", "zh", "en"].includes(lang)) {
  console.error("usage: node scripts/lang-mix-scan.mjs <origin> <sessionTokenFile> <outPrefix> <ja|zh|en> [width]");
  process.exit(2);
}
const cookie = readFileSync(cookieFile, "utf8").trim().split(/\n/).filter(Boolean).pop();
const SEEDS = ["/app/home", "/app/contacts", "/app/contacts/dashboard", "/app/contacts/new", "/app/contacts/new/import", "/app/contacts/new/scan", "/app/events", "/app/events?tab=going", "/app/events?tab=discover", "/app/events?tab=assess", "/app/events/center", "/app/events/center/new", "/app/events/center/profiles", "/app/agent", "/app/agent/actions", "/app/inbox", "/app/tasks", "/app/tasks?tab=todo", "/app/tasks?tab=memo", "/app/tasks?tab=calendar", "/app/plans", "/app/profile", "/app/profile/suggestions", "/app/settings", "/app/settings/account", "/app/settings/appearance", "/app/settings/exports", "/app/settings/help", "/app/settings/integrations", "/app/settings/iorbit", "/app/settings/notifications", "/app/settings/privacy", "/app/settings/schedule", "/app/home/events", "/app/host/join", "/app/account/change-password", "/help", "/privacy", "/terms"];
const locale = lang === "zh" ? "zh-CN" : lang === "en" ? "en-US" : "ja-JP";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: Number(widthArg), height: 900 }, locale });
await ctx.addCookies([{ name: "authjs.session-token", value: cookie, url: origin }, { name: "orbit-lang", value: lang, url: origin }]);
const page = await ctx.newPage();
const pattern = (p) => p.split("?")[0].split("#")[0].split("/").map((s) => (/%|^design-/.test(s) || (/\d/.test(s) && s.length >= 6) ? ":id" : s)).join("/") + (p.includes("?tab=") ? "?" + p.split("?")[1].split("&")[0] : "");
const seenPages = new Set();
const queue = [...SEEDS];
const results = [];
const skip = /\/api\/|\/dev\/|\/showcase|logout|signout|\.(png|jpg|pdf|csv|ics|webp)$|^\/app\/admin|login-admin|mailto:|tel:|[?&]lang=/;
while (queue.length && results.length < 160) {
  const path = queue.shift();
  const key = pattern(path);
  if (seenPages.has(key) || skip.test(path)) continue;
  seenPages.add(key);
  try {
    await page.goto(origin + path, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
  } catch (error) {
    results.push({ path, key, error: String(error).slice(0, 100) });
    continue;
  }
  let info;
  try {
    info = await page.evaluate(() => {
      const texts = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const v = n.nodeValue.replace(/\s+/g, " ").trim();
        if (!v) continue;
        const el = n.parentElement;
        if (!el || el.closest('script,style,noscript,[hidden],[aria-hidden="true"]')) continue;
        const s = getComputedStyle(el);
        if (s.display === "none" || s.visibility === "hidden") continue;
        const r = el.getBoundingClientRect();
        if (!r.width && !r.height && s.position !== "fixed") continue;
        texts.push({ t: v, where: el.tagName.toLowerCase() + "." + String(el.className?.baseVal ?? el.className).split(" ")[0].slice(0, 40) });
      }
      for (const el of document.querySelectorAll("[placeholder],[aria-label],[title]")) {
        for (const a of ["placeholder", "aria-label", "title"]) {
          const v = el.getAttribute(a);
          if (v && v.trim()) texts.push({ t: v.trim(), where: "@" + a });
        }
      }
      return { texts, links: [...document.querySelectorAll('a[href^="/"]')].map((a) => a.getAttribute("href")), url: location.pathname + location.search, htmlLang: document.documentElement.lang };
    });
  } catch {
    results.push({ path, key, error: "eval" });
    continue;
  }
  results.push({ path, key, final: info.url, htmlLang: info.htmlLang, texts: info.texts });
  for (const link of info.links) if (!seenPages.has(pattern(link))) queue.push(link);
}
await browser.close();
writeFileSync(`${out}-${lang}.json`, JSON.stringify(results));

const KANA = /[぀-ヿ]/u;
const HAN = /[一-鿿]/u;
const EN = /\b[a-z]{3,}\b/gu;
// 只在简体中文里出现、日文不用的常见字：用来在日文界面里抓中文。
const SIMPLIFIED = new Set([..."这们个说对为没还让给过见问题处应该经实现设置进选择样么吗呢吧您帮东车书长门马鸟鱼万与专业丝两严丢临举义乐习乡买乱争亏云亚产亲亿仅从仓优伙传伤众体佣侣债值倾储儿党关兴养内册写军农决况冻净减凑凤处凭击划刘则刚创删别制剂剧劝办务动励劲劳势区医华协单卖卫却厂厅历压厕县参双发变叙号叹吗员响团园围图圆场坏块坚坛坝坟垄垒垦垫墙壮声壳备复够头夹夺奋奖妇妈娱婴孙学宁宝实宠审宪宽宾对寻导寿将尔尘尝层属岁岗岛岭币师帐带帮干并广庆库应庙废开异弃张弯弹强归当录彻径忆忧怀态总恋恶恼悦惊惧惯愤愿戏战户执扩扫扬扰抚抢护报担拟拥拦择挂挤挥损换据摄摆摇摊撑敌数断无旧时显晋晒晓晕暂术机杀杂权条来杨杰极构枪柜标栏树样桥梦检楼欢欧毁毕气汇汉沟没泪泽洁洒浅浆浇测济浏浓涂涛涨渊渐渔湾湿满滤滥灭灯灵灾炉点炼烂烟烦烧热爱牵独猎猪献环现电画畅疗疯盐监盖盘着矿码砖础确碍礼离种积称稳穷窃竞笔筑签简粮紧纠红约级纪纯纲纳纵纷纸纹线练组细织终经绑结绕绘给络绝统继绩续维综绿缓编缘缩网罗罚职联肃肠肤肿胁胆胜脉脏脑脚脱脸腾舰艰艺节苏范荐药莱获营萧蓝虑虽蚀补衬袭装观规视览觉计订认讨训议讯记讲许论设访证评识诉词译试诚话询该详语误请诺读课谁调谈谋谢谨贝负贡财责败账货质贪贫购贯贴贵贷贸费贺资赏赔赚赛赞赠赢赶跃践踪轨转轮软轻载较辅辆辈输边达迁运远违连迟适选递遗邮郑释针钟钢钥钱铁铜银链销锁错键镇镜闪闭闲间闻阅队阳阴阵阶际陆陈险随隐难雾静韩页顶项顺须顾顿预领频额飞饭饮馆驱驶驾验鲜齐龄龙"]);
const IGNORED_WORDS = new Set(["via", "orbit", "iorbit", "app", "web", "http", "https", "www", "com"]);
const flagged = new Map();
for (const result of results) {
  for (const { t } of result.texts ?? []) {
    if (t.length > 160) continue;
    const words = (t.match(EN) ?? []).filter((word) => !IGNORED_WORDS.has(word));
    const kind = lang === "en"
      ? (HAN.test(t) || KANA.test(t) ? "cjk" : null)
      : lang === "zh"
        ? (KANA.test(t) || t.includes("・") ? "kana" : words.length ? "en" : null)
        : ([...t].some((c) => SIMPLIFIED.has(c)) && !KANA.test(t) ? "simplified" : words.length ? "en" : null);
    if (!kind) continue;
    const key = `${kind}\t${t}`;
    if (!flagged.has(key)) flagged.set(key, new Set());
    flagged.get(key).add(result.key);
  }
}
const lines = [...flagged].map(([key, pages]) => `${key}\t${[...pages].slice(0, 4).join(" ")}`);
writeFileSync(`${out}-${lang}-flags.txt`, lines.join("\n") + "\n");
console.log(`${lang}: ${results.length} pages, ${lines.length} suspicious strings → ${out}-${lang}-flags.txt`);

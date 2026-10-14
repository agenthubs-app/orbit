// $WEB/scripts/visual/board-preflight.mjs
// 画板预检（HOW-TO-START-A-FEATURE-SPRINT §8「画板预检」，2026-10-14）：写界面之前先读画板，
// 把以后会变成返工的问题找出来。自动做第 1 项（画板自洽）、第 3 项（token 齐），辅助第 2 项（数据来源清单），
// 另列状态与断点（第 5 项）。只读设计稿，不需要 dev server、不需要设计稿服务（直接 file:// 渲染）。
//
//   node scripts/visual/board-preflight.mjs --design b12-missing-states.html --board W-R25-07
//   node scripts/visual/board-preflight.mjs --design web.html --board-index 17,21 --md /tmp/checklist.md --json /tmp/pf.json
//   node scripts/visual/board-preflight.mjs --suite scripts/visual/views/web-plan-A.json [--only W-R24-02]
//   旧版画板（验证 / 对比）：加 --rev <git ref>，从 git 取该版本的设计稿文件渲染（kit 等其余文件用当前版）。
//
// 选项：--board 可重复（标题包含即命中，--board-kind web|web1024|mweb390|phone 消歧）；--board-index 可重复或逗号分隔；
//      --with-shell 数据来源清单也列导航壳（默认不列，壳归 R05 / R07）；--no-variants 不扫其他设计稿找同画面的宽度 / 主题；--no-bundle 不做同文件跨画板数字比对；--limit 每类最多列几行（默认 25）。
// 退出码：0 跑完（提示不算失败）；2 用法错误；3 画板找不到。
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { chromium } from "playwright";
import { DESIGN_CACHE_DIR, listBoardsInPage, loadSuite, many, parseArgs, selectOnly } from "./redesign-pixel-lib.mjs";
import { checkConsistency, collectBoard, collectStyleValues, conflictingLabels, dataSourceItems, extractNumbers, findVariants, formatChecklist, formatTokenReport, loadTokenIndex, matchTokens, midStateHints, screenKey } from "./board-preflight-lib.mjs";

const args = parseArgs(process.argv.slice(2));
const REPO_ROOT = resolve(dirname(new URL(import.meta.url).pathname), "../../../..");
const DESIGN_DIR = resolve(args["design-dir"] ?? join(REPO_ROOT, "docs/designs/redesign-2026-10"));
const TOKENS = resolve(args.tokens ?? join(REPO_ROOT, "repos/orbits/shared/design/tokens.json"));
const LIMIT = Number(args.limit ?? 25);
const home = (p) => resolve(String(p).replace(/^~(?=\/)/, process.env.HOME));
const list = (v) => many(v).flatMap((x) => String(x).split(",")).map((x) => x.trim()).filter(Boolean);

// ---------- 要检查的画板 ----------
let targets = [];
if (args.suite) {
  let runs = loadSuite(args.suite);
  if (args.only) runs = selectOnly(runs, args.only);
  const seen = new Set();
  for (const r of runs) {
    const key = `${r.design}|${r["board-index"] ?? r.board}|${r["board-kind"] ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({ design: r.design, index: r["board-index"] !== undefined ? Number(r["board-index"]) : undefined, board: r.board, kind: r["board-kind"], nth: r["board-nth"], view: r.id });
  }
} else if (args.design) {
  for (const i of list(args["board-index"])) targets.push({ design: args.design, index: Number(i) });
  for (const b of many(args.board)) targets.push({ design: args.design, board: b, kind: args["board-kind"] });
}
if (!targets.length) {
  console.error("usage error: --design <文件> 加 --board <标题> / --board-index <序号>（可重复），或 --suite <views/*.json>");
  process.exit(2);
}

// --rev：临时目录 = 设计稿目录的符号链接副本，目标文件换成 git 里那一版。
let designDir = DESIGN_DIR;
if (args.rev) {
  designDir = mkdtempSync(join(tmpdir(), "board-preflight-"));
  for (const e of readdirSync(DESIGN_DIR)) symlinkSync(join(DESIGN_DIR, e), join(designDir, e));
  for (const file of new Set(targets.map((t) => t.design))) {
    const rel = relative(REPO_ROOT, join(DESIGN_DIR, file));
    const html = execFileSync("git", ["show", `${args.rev}:${rel}`], { cwd: REPO_ROOT, maxBuffer: 64 << 20 });
    execFileSync("rm", [join(designDir, file)]);
    writeFileSync(join(designDir, file), html);
  }
}
const fileUrl = (file) => "file://" + join(designDir, file);

const browser = await chromium.launch({ channel: args.channel ?? "chrome" });
async function openDesign(file) {
  const ctx = await browser.newContext({ viewport: { width: 1700, height: 1100 }, deviceScaleFactor: 1, locale: "ja-JP" });
  const page = await ctx.newPage();
  await page.goto(fileUrl(file), { waitUntil: "load" });
  await page.evaluate(() => document.fonts?.ready);
  await page.evaluate(() => document.body.classList.add("no-pins"));
  // 计数 / 进度条动画 1.1s：等它走完再读数字。
  await page.waitForTimeout(Number(args["design-wait"] ?? 1600));
  return { ctx, page };
}

// 同一文件里所有画板的「自有文字」，跨画板数字比对用（只取文字，不取样式，便宜）。
const bundleTexts = (frames) => frames.map((f) => [...f.querySelectorAll("*")].filter((el) => !el.closest("svg")).map((el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ").replace(/\s+/g, " ").trim()).filter(Boolean));

const tokenIndex = loadTokenIndex(TOKENS);
const results = [];
const byFile = new Map();
for (const t of targets) byFile.set(t.design, [...(byFile.get(t.design) ?? []), t]);
for (const [file, ts] of byFile) {
  const { ctx, page } = await openDesign(file);
  let boards = [];
  for (let attempt = 0; attempt < 30 && !boards.length; attempt++) { if (attempt) await page.waitForTimeout(1000); boards = await page.evaluate(listBoardsInPage); }
  const frames = await page.evaluateHandle(() => [...document.querySelectorAll(".web, .phone")].filter((f) => !f.parentElement.closest(".web, .phone")));
  const texts = args["no-bundle"] ? [] : await frames.evaluate(bundleTexts);
  for (const t of ts) {
    let b;
    if (t.index !== undefined) b = boards[t.index];
    else {
      const hits = boards.filter((x) => x.label.includes(t.board) && (!t.kind || x.kind === t.kind));
      b = hits[Number(t.nth ?? 0)];
      if (hits.length > 1 && t.nth === undefined) console.warn(`warn: --board "${t.board}" 命中 ${hits.length} 块（${hits.map((h) => "#" + h.index + (h.theme ? " " + h.theme : "")).join(" ")}），取 #${b.index}；用 --board-index 指定`);
    }
    if (!b) { console.error(`design board not found: ${file} ${t.board ?? t.index}（先用 compare-redesign.mjs --list --design ${file}）`); await browser.close(); process.exit(3); }
    const elements = await frames.evaluate((fs, [src, i]) => (0, eval)(`(${src})`)(fs[i]), [collectBoard.toString(), b.index]);
    results.push({ file, board: b, view: t.view, elements, bundle: texts });
  }
  await ctx.close();
}

// ---------- 状态与断点：扫所有设计稿的画板清单（按文件内容哈希缓存） ----------
async function allBoards() {
  const files = readdirSync(designDir).filter((f) => f.endsWith(".html"));
  const out = [];
  mkdirSync(DESIGN_CACHE_DIR, { recursive: true });
  for (const f of files) {
    const hash = createHash("sha1").update(readFileSync(join(designDir, f))).digest("hex").slice(0, 12);
    const cache = join(DESIGN_CACHE_DIR, `boards-${basename(f, ".html")}-${hash}.json`);
    let bs;
    if (existsSync(cache)) bs = JSON.parse(readFileSync(cache, "utf8"));
    else {
      const { ctx, page } = await openDesign(f);
      bs = await page.evaluate(listBoardsInPage);
      await ctx.close();
      writeFileSync(cache, JSON.stringify(bs));
    }
    for (const b of bs) out.push({ file: f, ...b });
  }
  return out;
}
const everything = args["no-variants"] ? [] : await allBoards();
await browser.close();

// ---------- 分析与输出 ----------
const report = [];
const md = [];
for (const r of results) {
  const { board, elements } = r;
  const theme = board.theme || "light";
  const title = `${r.file} #${board.index} ${board.kind} ${theme} — ${board.label}${r.view ? `（${r.view}）` : ""}`;
  const tokens = matchTokens(collectStyleValues(elements), tokenIndex, theme);
  const consistency = checkConsistency(elements);
  // 跨画板：本画板出现的「标签 + 单位」在同文件其他画板里数字不同（不同状态的画板本来就可能不同，只作提示）。
  let cross = [];
  if (r.bundle.length) {
    const mine = elements.filter((e) => e.own).flatMap((e) => extractNumbers(e.own)).filter((n) => n.kind !== "select");
    const keys = new Set(mine.map((n) => `${n.label.replace(/\s+/g, "")}|${n.unit}`));
    const items = mine.map((n) => ({ ...n, where: `#${board.index}` }));
    r.bundle.forEach((ts, bi) => { if (bi === board.index) return; for (const t of ts) for (const n of extractNumbers(t)) if (n.kind !== "select" && keys.has(`${n.label.replace(/\s+/g, "")}|${n.unit}`)) items.push({ ...n, where: `#${bi}` }); });
    cross = conflictingLabels(items, "cross-board").filter((h) => !consistency.some((c) => c.message === h.message));
  }
  const sources = dataSourceItems(elements, { withShell: !!args["with-shell"] });
  const flagged = sources.filter((s) => s.flags.length);
  const variants = everything.length ? findVariants(board, everything) : [];
  const mid = midStateHints(elements, board.label);

  const lines = [`\n■ ${title}`];
  lines.push(`【1 token 覆盖】${tokens.length} 个取值：精确 ${tokens.filter((x) => x.status === "exact").length} · 近似但不等 ${tokens.filter((x) => x.status === "near").length} · 缺 token ${tokens.filter((x) => x.status === "missing").length}${tokens.some((x) => x.status === "theme") ? ` · 主题串色 ${tokens.filter((x) => x.status === "theme").length}` : ""}`);
  lines.push(formatTokenReport(tokens, LIMIT));
  lines.push(`【2 画板自洽】疑似不自洽 ${consistency.length} 处${consistency.length ? "（提示，不是失败；确认后请设计稿会话改画板）" : ""}`);
  for (const h of consistency) lines.push(`  ⚠ [${h.rule}] ${h.message}  @ ${h.where}`);
  if (cross.length) {
    lines.push(`  同文件其他画板同一标签数字不同 ${cross.length} 处（不同状态可能本来就不同，核对是否同一份数据）：`);
    for (const h of cross.slice(0, 8)) lines.push(`    · ${h.message}  @ ${h.where}`);
  }
  lines.push(`【3 数据来源清单】${sources.length} 项（文字 ${sources.filter((s) => s.kind === "text").length} · 按钮 ${sources.filter((s) => s.kind === "button").length} · 图标 ${sources.filter((s) => s.kind === "icon").length} · 输入 ${sources.filter((s) => s.kind === "input").length}）${args.md ? "，Markdown 清单 → " + home(args.md) : "，加 --md <文件> 输出可填写的清单"}`);
  lines.push(`  疑似无功能 ${flagged.length} 项（先定「去掉 / 记为以后的功能」）：`);
  for (const s of flagged.slice(0, LIMIT)) lines.push(`    ⚠ ${s.flags.join("、")}  ${s.kid ? "." + s.kid + " " : ""}${s.cls ? "[" + s.cls + "] " : ""}「${s.text}」`);
  lines.push(`【4 状态与断点】同画面（键「${screenKey(board.label)}」）：${variants.length ? variants.map((v) => `${v.file}#${v.index} ${v.kind} ${v.theme || "light"}`).join("；") : "未扫（--no-variants）"}`);
  if (variants.length) {
    const kinds = new Set(variants.map((v) => v.kind));
    const lacks = (board.kind === "phone" ? [] : ["web", "web1024", "mweb390"]).filter((k) => !kinds.has(k));
    const themes = new Set(variants.map((v) => v.theme || "light"));
    lines.push(`  宽度：${[...kinds].join(" / ")}${lacks.length ? `；设计稿无 ${lacks.join(" / ")}（PLANNER 写「设计稿无」并注明拍板结论，不要自己推断）` : ""}；主题：${[...themes].join(" / ")}${themes.size < 2 ? "（只有一种，另一主题设计稿无）" : ""}`);
  }
  lines.push(`  中途状态：${mid.length ? mid.join("；") + " → 画面清单里写明怎么进到这个状态（深链 / fixture / 点击步骤）" : "未发现"}`);
  report.push(lines.join("\n"));
  md.push(formatChecklist(title, sources));
  r.out = { title, file: r.file, board, theme, tokens, consistency, cross, sources, variants, midState: mid };
}

console.log(`画板预检 · ${results.length} 块画板 · token 源 ${relative(REPO_ROOT, TOKENS)}${args.rev ? ` · 设计稿版本 ${args.rev}` : ""}`);
console.log(report.join("\n"));
const totals = results.reduce((a, r) => ({ near: a.near + r.out.tokens.filter((x) => x.status === "near").length, missing: a.missing + r.out.tokens.filter((x) => x.status === "missing").length, cons: a.cons + r.out.consistency.length, flag: a.flag + r.out.sources.filter((s) => s.flags.length).length }), { near: 0, missing: 0, cons: 0, flag: 0 });
console.log(`\n小结：近似但不等 ${totals.near} · 缺 token ${totals.missing} · 疑似不自洽 ${totals.cons} · 疑似无功能 ${totals.flag}。结果贴进 PLANNER 的画板预检表。`);
if (args.md) { mkdirSync(dirname(home(args.md)), { recursive: true }); writeFileSync(home(args.md), `# 画板预检 · 数据来源清单\n\n每行填对应的契约字段或接口；画了但没有数据 / 功能的，先定「去掉 / 记为以后的功能」。\n\n${md.join("\n\n")}\n`); }
if (args.json) { mkdirSync(dirname(home(args.json)), { recursive: true }); writeFileSync(home(args.json), JSON.stringify(results.map((r) => r.out), null, 1)); }
if (args.dump) writeFileSync(home(args.dump), JSON.stringify(results.map((r) => ({ title: r.out.title, elements: r.elements })), null, 1));
if (args.rev) rmSync(designDir, { recursive: true, force: true }); // 只删符号链接与取出的旧版文件，不碰设计稿目录

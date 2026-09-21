# Network（人脉）屏级替换 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 `Network v2.dc.html` 设计稿 1:1 重建人脉域 4 张主屏（概览 / 关系管线 / 所有人脉 / 导入人脉）+ 分析子页 + 联系人详情/记跟进两个弹窗，接真实数据，删除被取代的 6 个旧路由与旧 `orbit-real-*` 人脉文件。

**Architecture:** 每张设计屏 = 一个新 client component（`app/(app)/app/contacts/network-0918/*.tsx`），JSX 从设计稿对应行区间逐元素移植（结构、文案、每一个 px/色值不改），内联样式转成本屏 `<style>` 模板字符串里的 `nw-*` 类；真实数据经纯函数模型（`network-*-model.ts`）从既有 `OrbitContactsViewModel` / `ContactsAnalysisView` 映射，模型有单元测试；页面 `page.tsx` 只换渲染组件，鉴权/加载器不动。旧文件在路由切换后删除，不修改。

**Tech Stack:** Next.js 16 App Router（`next dev --webpack`）、React 19 client components、node:test + tsx、playwright（`repos/orbits/node_modules` 自带 chromium）、GitNexus CLI。

## Global Constraints

- 工作树：`/Users/li/work/orbit-web-newui-batch0-20260918`，分支 `newui/batch-0-shell-landing`。**所有命令显式带绝对路径 cwd**（默认 cwd 可能是主仓库）。Web 代码根：`/Users/li/work/orbit-web-newui-batch0-20260918/repos/orbits`（下文 `$WEB`）。
- 设计稿：`/Users/li/work/orbit/docs/designs/Orbit_0918/Network v2.dc.html`（下文 `$DESIGN`，明文 x-dc 模板；行号以 2026-09-21 版本为准，`wc -c` = 123587）。设计稿不提交。
- 设计 token 唯一来源：`$WEB/app/(app)/app/orbit-0918-tokens.ts`（`ORBIT_0918_COLORS/FONTS/LAYOUT/SHADOWS`）。文字 #0E1225/#3B3F7A/#6B6F99/#9FA3C4；面板 #ECEEFB/#F7F7FD；边框 #E8E9F6/#DDDEFA；强调 #4B4FC7/#2E3270；标题 `'Noto Serif SC'` 900；正文 `'Noto Sans SC'`。
- **像素级一致规则**（每个 JSX 移植步骤都适用）：
  1. 设计稿元素逐个对应，不合并、不省略、不改文案标点；`<sc-if value="{{x}}">` → `{x ? … : null}`；`<sc-for list="{{l}}" as="p">` → `{l.map(p => …)}`。
  2. 静态 `style="…"` 整段搬进本屏 `NETWORK_STYLES` 模板字符串的一个 `nw-*` 类，选择器前缀 `[data-orbit-real-page="network"] `；声明顺序与值保持原样（含 `letter-spacing:-0.03em`、`animation:orbit-fade .3s ease`、`clip-path` 等）。
  3. 样式里的 `{{ 变量 }}`（只出现在 color / background / border-color / border-bottom / font-weight / clip-path）→ React 内联 `style={{ … }}`，**内联对象里禁止出现 `fontSize` / `fontWeight` / `gap` 数值字面量**（scale ratchet 只扫描 React 对象，模板字符串被剥离不计）；`font-weight:{{ t.weight }}` 这类用两个类 `nw-tab-on/nw-tab-off` 切换。
  4. `style-hover="…"` → 同类 `:hover` 规则；`style-focus` → `:focus`。
  5. 每个 `<button>` 必须带 `btn` 类 + 一个 `nw-*` 类（button ratchet 上限 154 不得增加）；本屏样式用 `[data-orbit-real-page="network"] .btn.nw-xxx { … }` 覆盖 `.btn` 基类（`orbit-reference-styles.tsx:594–610`）设定的**全部**属性：`height`（基类 44px → 设计多为自然高度，写 `height:auto`）、`display`（行是 `grid`、卡是 `flex`）、`gap`、`justify-content`、`align-items`、`white-space`（基类 nowrap）、`text-align`、`letter-spacing`、`transition`、padding/border/border-radius/background/color/font-size/font-weight/line-height；`:disabled` 基类是 `opacity:1`，需要半透明的按钮（如 `nw-fu-save`）写 `:disabled { opacity:.5 }`。可复用片段（放在设计声明之后）：`/* 覆盖 .btn 基类 */ height: auto; display: <设计值或 inline-flex>; align-items: <设计值或 center>; justify-content: <设计值或 center>; gap: <设计值或 0>; white-space: <设计值或 normal>; text-align: <设计值或 left>; letter-spacing: 0; line-height: normal; transition: <设计值或 none>;`。
  6. 设计稿里的 mock 数字（128、42、85% 等）一律不出现；数值全部来自模型；来源不可用显示 `—`，列表为空显示设计稿自带的空态文案（如「没有匹配的联系人」）。
  7. 头像 = 首字母圆形占位（设计 `width:40px;height:40px;border-radius:50%;background:#DDDEFA;color:#3B3F7A`），不用图片。
  8. 页面根：`<main data-orbit-real-page="network" data-network-screen="<screen>">`，内容容器 `max-width:1240px; margin:0 auto; padding:28px 40px 96px; display:flex; flex-direction:column; gap:24px;`（设计稿第 43 行 `<main>` 的样式，以文件为准）。
- `OrbitReferenceStyles` 只作为顶栏（`AccountTopNav` = 0918 浮岛导航 + 铃铛）和 `.btn` 基类的提供者继续渲染在 `page.tsx`，**禁止向 `orbit-reference-styles.tsx` 追加任何选择器**。
- **页面接线（任务 2 确认）**：`page.tsx` 成功分支的既有包裹 `<div data-orbit-route=…>` 必须加 `data-orbit-real-page="network"`（顶栏与 `.btn` 基类样式都作用域在该属性下），再在其中依次渲染 `<AccountTopNav active="cards" />` 与新屏组件。
- **像素门槛（任务 2 确认）**：raw `mismatch ≤ 0.02`，**或** 做框级归因后「非数据残差 ≤ 0.005 且 diff 中无任何布局线/圆角/间距/色块差异」，归因表写进报告与台账。已知共享残差：顶栏比设计高 2px（`.orbit-lang-toggle` 39px，属 `orbit-reference-styles.tsx`，留待壳提取计划）；`.nw-tab` 已按设计渲染结果对齐为 13.3333px（设计 `<button>` 未继承容器 15px）。
- 每个 `.btn.nw-*` 规则同时补 `:active { transform: none; }`（基类 `.btn:active` 有 translateY(0.5px)），且 `:hover` 只写设计给出的声明。
- 数据真实性：无接口的设计能力不做假——「AI 人脉驾驶舱」四卡用 `ContactsAnalysisView.metrics` 真实计数；「导入通讯录」「上传 CSV」「从活动添加」三种方式当前无服务端接口，按钮渲染为 `aria-disabled` 的 `<span class="nw-import-cta nw-import-cta-soon">即将开放</span>`（与 connect 占位同口径，非交互元素）；洞察页（design 610–707）依赖 W4，本计划不做。
- 关系阶段映射（真实 `status` → 设计列）：`needs_follow_up`→「待了解」、`nurture`→「保持联系」、`active`→「正在推进」、`archived`→「已归档」。设计稿第四列文案「已建立合作」没有对应状态，**改为「已归档」**（唯一允许的文案偏差，记入台账）。`pending_initialization` 的联系人归入「待了解」列并在卡片上显示「待设置关系」chip。
- 来源映射（`OrbitContactView.source` → 设计来源卡）：`event`→活动认识、`referral`→朋友引荐、`contact`→通讯录、`scan`→名片导入、`exchange`/`qr`/`manual`→其他来源。
- 语言：文案走既有 `useOrbitLanguage()` 的 `t({ en, zh, ja? })`；设计稿只有中文，英文由实现者按现有页面语气补，日文可省（`t` 会回退）。
- 每个任务结束前：`npm run typecheck`（cwd `$WEB`）、`node --test --import tsx tests/ui/orbit-button-ratchet.test.ts tests/ui/orbit-scale-ratchet.test.ts`（cwd `$WEB`）、本任务新增测试、像素比对（任务 0 脚本）全部通过；提交前在工作树根跑 `node .gitnexus/run.cjs detect-changes --scope all --repo .`，输出含 `partial: true` / `truncated: true` 视为未通过须重跑；编辑既有导出符号前跑 `node .gitnexus/run.cjs impact "<symbol>" --direction upstream --repo .`，HIGH/CRITICAL 必须在提交信息里写明处置；`UNKNOWN` 用 `grep -rn` 确认调用方。
- 提交信息结尾加 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`。每个任务提交后在 `docs/development/2026-09-17-web/EXECUTION.md` 末尾追加一条 `- **Network 任务 N 完成** \`<sha>\`：…`（docs 单独一次提交或并入同一提交均可）。
- 测试基线自带失败（不修、不算失败）：`app-agent-contact-recommendations` 1 条、`app-events-live-route-services` agenda clocks 1 条、需本地测试库的 register-live 7 条、需 sibling playwright 的 portrait-browser 1 条、云端 PG 的 readback/guide 28 条、audits 13 条 P1。

---

## 文件结构

**新建（`$WEB/app/(app)/app/contacts/network-0918/`）**

| 文件 | 职责 |
| --- | --- |
| `network-shell.tsx` | 页头（h1「人脉」+ 副标 + 两个按钮）+ 四页签 + 根容器 + `NETWORK_STYLES`（全部 `nw-*` 类）+ 弹窗挂载点 |
| `network-model.ts` | 纯函数：阶段/来源映射、首字母、donut 分段、来源计数、搜索过滤、最近联系人排序 |
| `network-all.tsx` | 「所有人脉」屏（design 257–302） |
| `network-pipeline.tsx` | 「关系管线」屏（design 172–256） |
| `network-overview.tsx` | 「概览」屏（design 66–171） |
| `network-analysis.tsx` | 「AI 人脉分析」子页 结构/机会（design 393–609） |
| `network-import.tsx` | 「导入人脉」屏（design 303–392）+ 名片 V2 子状态 |
| `network-detail-modal.tsx` | 联系人详情弹窗（design 708–788）+ 会后纪要/约谈核验附加态 |
| `network-follow-modal.tsx` | 记录跟进弹窗（design 789–856），写 `PATCH /api/contacts/[id]` |

**修改**：`contacts/page.tsx`、`contacts/pipeline/page.tsx`、`contacts/dashboard/page.tsx`、`contacts/new/page.tsx`、`contacts/[id]/page.tsx`、`contacts/analysis/[dimension]/[bucketId]/page.tsx`（只换渲染组件）；链接生成器 4 处（见任务 8）；`features/auth/app-auth-routing.ts` 白名单。

**删除（任务 8/9）**：路由 `dashboard/`、`contacts/all-actions/`、`contacts/intros/`、`contacts/graph/`、`contacts/new/batch/`、`contacts/new/batch2/`、`contacts/new/import/`；组件 `contacts/orbit-real-contacts.tsx`、`orbit-real-cards-pipeline-view.tsx`、`orbit-real-cards-import.tsx`、`orbit-real-card-connection.tsx`、`dashboard/orbit-real-dashboard.tsx`、`contacts/analysis/contacts-analysis-workspace.tsx`；对应 tests。

**工具（任务 0）**：`$WEB/scripts/visual/compare-0918.mjs`（并排截图 + 像素差异，长期保留）。

---

### Task 0: 像素比对工具

**Files:**
- Create: `$WEB/scripts/visual/compare-0918.mjs`
- Create: `$WEB/scripts/visual/README.md`

**Interfaces:**
- Produces: CLI `node scripts/visual/compare-0918.mjs --design "<design url>#<view>" --app "<app url>" --out <dir> [--cookie <name=value>] [--click <selector>]`，输出 `<out>/design.png`、`<out>/app.png`、`<out>/diff.png` 与 stdout 一行 `mismatch=<0-1 比例>`；退出码 0。后续每个任务的「像素比对」步骤都调用它。

- [ ] **Step 1: 写脚本**

```js
// $WEB/scripts/visual/compare-0918.mjs
// 并排截取设计稿（python http.server 3320 起 docs/designs）与本地 dev server（3100）
// 的同一屏，输出两张 PNG + 逐像素差异图，并打印不一致像素比例。
// 用法示例：
//   node scripts/visual/compare-0918.mjs \
//     --design "http://localhost:3320/Orbit_0918/Network%20v2.dc.html" --design-view all \
//     --app "http://localhost:3100/app/contacts" --cookie "authjs.session-token=…" \
//     --out /tmp/network-all
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

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
if (args.cookie) {
  const [name, ...rest] = args.cookie.split("=");
  await ctx.addCookies([{ name, value: rest.join("="), domain: "localhost", path: "/" }]);
}

async function shoot(url, file, prep) {
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  if (prep) await prep(page);
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(out, file), fullPage: true });
  await page.close();
  return PNG.sync.read((await import("node:fs")).readFileSync(join(out, file)));
}

// 设计稿是单页多视图：通过点击主页签切到目标视图（--design-view overview|pipeline|all|import）
const viewLabel = { overview: "概览", pipeline: "关系管线", all: "所有人脉", import: "导入人脉", analysis: "查看完整分析" }[args["design-view"] ?? "overview"];
const design = await shoot(args.design, "design.png", async (page) => {
  if (viewLabel) await page.getByRole("button", { name: viewLabel }).first().click();
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
await browser.close();
```

- [ ] **Step 2: 确认 pngjs 可用**

Run: `cd $WEB && node -e "import('pngjs').then(()=>console.log('ok'))"`
Expected: `ok`。若报 `ERR_MODULE_NOT_FOUND`：`cd $WEB && npm i -D pngjs@7` 并把 `package.json`/`package-lock.json` 一并提交。

- [ ] **Step 3: 写 README**

```md
# 0918 像素比对
前置：`python3 -m http.server 3320 -d /Users/li/work/orbit/docs/designs`（或 launch.json 的 `designs`）与 dev server（launch.json `orbits-newui`，3100）。
登录 cookie：浏览器登录 qa@orbit.test 后从 DevTools 复制 `authjs.session-token`（本地 http 为 `authjs.session-token`，https 为 `__Secure-authjs.session-token`）。
判定：mismatch ≤ 0.02 且 diff.png 中红色只出现在真实数据文字/数字区域（不得出现在布局线、圆角、间距、色块）。
```

- [ ] **Step 4: 冒烟**

Run（cwd `$WEB`，两个 server 已起）：
`node scripts/visual/compare-0918.mjs --design "http://localhost:3320/Orbit_0918/Network%20v2.dc.html" --design-view all --app "http://localhost:3100/app/contacts" --cookie "authjs.session-token=<token>" --out /tmp/network-smoke`
Expected: 打印 `mismatch=0.xxxx …`，`/tmp/network-smoke/` 三张 PNG 存在（此时 mismatch 很大，正常）。

- [ ] **Step 5: 提交**

```bash
cd /Users/li/work/orbit-web-newui-batch0-20260918 && node .gitnexus/run.cjs detect-changes --scope all --repo . && git add repos/orbits/scripts/visual && git commit -m "chore(visual): add 0918 design/app pixel comparison script

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 1: 人脉模型（纯函数）+ 壳（页头 / 页签 / 样式）

**Files:**
- Create: `$WEB/app/(app)/app/contacts/network-0918/network-model.ts`
- Create: `$WEB/app/(app)/app/contacts/network-0918/network-shell.tsx`
- Test: `$WEB/tests/pages/app-network-model.test.ts`

**Interfaces:**
- Produces（`network-model.ts`）：

```ts
export type NetworkStage = "explore" | "keep" | "advance" | "archived";
export const NETWORK_STAGES: readonly NetworkStage[]; // ["explore","keep","advance","archived"]
export const STAGE_LABEL: Record<NetworkStage, { zh: string; en: string }>; // 待了解/保持联系/正在推进/已归档
export const STAGE_STYLE: Record<NetworkStage, { bg: string; fg: string; icon: string; desc: { zh: string; en: string } }>;
export function stageOf(contact: Pick<OrbitContactView, "pipelineStatus" | "relationshipStatus">): NetworkStage; // relationshipStatus 是本任务新增到 OrbitContactView 的可选枚举字段
export type NetworkSource = "event" | "referral" | "contact" | "scan" | "other";
export const SOURCE_LABEL: Record<NetworkSource | "all", { zh: string; en: string }>;
export const SOURCE_ICON: Record<NetworkSource | "all", string>;
export function sourceOf(contact: Pick<OrbitContactView, "source">): NetworkSource;
export interface NetworkPerson { id: string; name: string; initial: string; org: string; title: string; orgTitle: string; industry: string; source: NetworkSource; stage: NetworkStage; pendingInit: boolean; last: string; next: string; region: string; tags: string[]; href: string; }
export function toPerson(contact: OrbitContactView): NetworkPerson;
export function matchesQuery(p: NetworkPerson, query: string): boolean;
export function sourceCounts(people: readonly NetworkPerson[]): Record<NetworkSource | "all", number>;
export function stageCounts(people: readonly NetworkPerson[]): Record<NetworkStage, number>;
export interface DonutRow { label: string; n: number; pct: string; color: string; }
export function donut(rows: readonly (readonly [string, number])[]): { bg: string; rows: DonutRow[] }; // conic-gradient 与设计 C 色序一致
export const DONUT_COLORS: readonly string[]; // ["#4B4FC7","#5B8C7A","#9C7A3E","#8A8FB0","#6B8FB5","#2E3270","#C9CBEA"]
export function stageClip(index: 0 | 1 | 2 | 3): string; // 设计 clip() 三种 polygon
export const STAGE_BAR_BG: readonly string[]; // ["#E8E9F6","#DDDEFA","#B9BCEB","#2E3270"]
export const STAGE_BAR_FG: readonly string[]; // ["#3B3F7A","#3B3F7A","#2E3270","#FFFFFF"]
export function personByName(people: readonly NetworkPerson[], name: string): NetworkPerson | undefined;
```

- Produces（`network-shell.tsx`）：`export function NetworkShell({ screen, total, children, modal }: { screen: "overview" | "pipeline" | "all" | "import" | "analysis"; total: number | null; children: ReactNode; modal?: ReactNode })`，`export const NETWORK_STYLES: string`，`export function NetworkAvatar({ initial, size }: { initial: string; size?: 40 | 56 | 64 })`，`export function NetworkChip({ bg, fg, children })`。

- [ ] **Step 1: 写失败测试**

```ts
// $WEB/tests/pages/app-network-model.test.ts
import assert from "node:assert/strict";
import test from "node:test";

import type { OrbitContactView } from "../../app/(app)/app/orbit-contacts-route-view-model";
import { donut, matchesQuery, sourceCounts, sourceOf, stageClip, stageCounts, stageOf, toPerson } from "../../app/(app)/app/contacts/network-0918/network-model";

function contact(overrides: Partial<OrbitContactView> = {}): OrbitContactView {
  return {
    company: "Nexa AI", encounters: [], displayName: "田中惠子", email: "", g: "g-violet", id: "contact:1", industry: "科技与互联网",
    initial: "田", lineId: "", location: "日本 东京", lastEventId: "", met: "", note: "", notes: [], offering: "", phone: "",
    pipelineStatus: "in_progress", relationshipStatus: "active", seeking: "下周约产品演示", source: "event", stage: "Active", title: "合作伙伴负责人", wechat: "",
    strength: "medium", valueTags: ["AI"], nextAction: { text: "下周约产品演示", reason: "" }, lastInteraction: "昨天", dormant: false,
    ...overrides,
  };
}

test("stageOf maps the four real statuses onto the four design columns", () => {
  assert.equal(stageOf({ pipelineStatus: "to_contact", relationshipStatus: "needs_follow_up" }), "explore");
  assert.equal(stageOf({ pipelineStatus: "in_progress", relationshipStatus: "nurture" }), "keep");
  assert.equal(stageOf({ pipelineStatus: "in_progress", relationshipStatus: "active" }), "advance");
  assert.equal(stageOf({ pipelineStatus: "archived", relationshipStatus: "archived" }), "archived");
  assert.equal(stageOf({ pipelineStatus: "pending_initialization", relationshipStatus: "needs_follow_up" }), "explore");
  // 旧数据没有 relationshipStatus 时退化到 pipelineStatus
  assert.equal(stageOf({ pipelineStatus: "in_progress" }), "advance");
});

test("sourceOf folds exchange/qr/manual into other", () => {
  assert.equal(sourceOf({ source: "event" }), "event");
  assert.equal(sourceOf({ source: "referral" }), "referral");
  assert.equal(sourceOf({ source: "contact" }), "contact");
  assert.equal(sourceOf({ source: "scan" }), "scan");
  for (const s of ["exchange", "qr", "manual"] as const) assert.equal(sourceOf({ source: s }), "other");
});

test("toPerson keeps display fields and links to the detail route", () => {
  const p = toPerson(contact());
  assert.equal(p.orgTitle, "Nexa AI · 合作伙伴负责人");
  assert.equal(p.initial, "田");
  assert.equal(p.href, "/app/contacts/contact%3A1");
  assert.equal(p.pendingInit, false);
  assert.equal(toPerson(contact({ pipelineStatus: "pending_initialization" })).pendingInit, true);
});

test("matchesQuery searches name, org, title and industry", () => {
  const p = toPerson(contact());
  assert.ok(matchesQuery(p, "Nexa"));
  assert.ok(matchesQuery(p, "科技"));
  assert.ok(!matchesQuery(p, "腾讯"));
  assert.ok(matchesQuery(p, "  "));
});

test("counts are real and include the all bucket", () => {
  const people = [toPerson(contact()), toPerson(contact({ id: "contact:2", source: "manual", relationshipStatus: "archived", pipelineStatus: "archived" }))];
  assert.deepEqual(sourceCounts(people), { all: 2, event: 1, referral: 0, contact: 0, scan: 0, other: 1 });
  assert.deepEqual(stageCounts(people), { explore: 0, keep: 0, advance: 1, archived: 1 });
});

test("donut reproduces the design conic-gradient math and colour order", () => {
  const d = donut([["科技与互联网", 21], ["其他", 79]]);
  assert.equal(d.rows[0].color, "#4B4FC7");
  assert.equal(d.rows[0].pct, "21%");
  assert.equal(d.bg, "conic-gradient(#4B4FC7 0deg 75.6deg, #5B8C7A 75.6deg 360deg)");
});

test("stageClip returns the three arrow polygons", () => {
  assert.equal(stageClip(0), "polygon(0 0,calc(100% - 14px) 0,100% 50%,calc(100% - 14px) 100%,0 100%)");
  assert.equal(stageClip(3), "polygon(0 0,100% 0,100% 100%,0 100%,14px 50%)");
  assert.equal(stageClip(1), "polygon(0 0,calc(100% - 14px) 0,100% 50%,calc(100% - 14px) 100%,0 100%,14px 50%)");
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd $WEB && node --test --import tsx tests/pages/app-network-model.test.ts`
Expected: FAIL，`Cannot find module '.../network-0918/network-model'`。

- [ ] **Step 3: 写模型**

```ts
// $WEB/app/(app)/app/contacts/network-0918/network-model.ts
/**
 * Network v2（Orbit_0918）人脉域纯函数模型。
 * 设计稿：docs/designs/Orbit_0918/Network v2.dc.html renderVals()。
 * 所有数值来自 OrbitContactsViewModel，不含设计 mock。
 */
import type { OrbitContactView } from "../../orbit-contacts-route-view-model";

export type NetworkStage = "explore" | "keep" | "advance" | "archived";
export const NETWORK_STAGES = ["explore", "keep", "advance", "archived"] as const satisfies readonly NetworkStage[];

export const STAGE_LABEL: Record<NetworkStage, { zh: string; en: string }> = {
  explore: { zh: "待了解", en: "Explore" },
  keep: { zh: "保持联系", en: "Keep in touch" },
  advance: { zh: "正在推进", en: "Advancing" },
  // 设计稿写「已建立合作」；真实状态只有 archived，文案按真实语义。
  archived: { zh: "已归档", en: "Archived" },
};

// 设计 stageMeta：[bg, accent, icon, desc]
export const STAGE_STYLE: Record<NetworkStage, { bg: string; fg: string; icon: string; desc: { zh: string; en: string } }> = {
  explore: { bg: "#F0F1F8", fg: "#6B6F99", icon: "◌", desc: { zh: "初步建立联系，进一步了解对方", en: "Just connected, getting to know them" } },
  keep: { bg: "#ECEEFB", fg: "#4B4FC7", icon: "▦", desc: { zh: "已建立联系，定期保持互动", en: "Connected, staying in touch" } },
  advance: { bg: "#E4E5FA", fg: "#2E3270", icon: "➶", desc: { zh: "有明确的合作机会，正在推进中", en: "A concrete opportunity is moving" } },
  archived: { bg: "#E6F1EC", fg: "#2F6B4F", icon: "◈", desc: { zh: "暂时搁置，需要时再唤醒", en: "Set aside for now" } },
};

// 设计 stageStyle（列表 chip）：[bg, fg]
export const STAGE_CHIP: Record<NetworkStage, { bg: string; fg: string }> = {
  explore: { bg: "#F0F1F8", fg: "#3B3F7A" },
  keep: { bg: "#ECEEFB", fg: "#2E3270" },
  advance: { bg: "#DDDEFA", fg: "#2E3270" },
  archived: { bg: "#E6F1EC", fg: "#2F6B4F" },
};

export function stageOf(contact: Pick<OrbitContactView, "pipelineStatus" | "relationshipStatus">): NetworkStage {
  if (contact.pipelineStatus === "pending_initialization") return "explore";
  switch (contact.relationshipStatus) {
    case "archived": return "archived";
    case "needs_follow_up": return "explore";
    case "nurture": return "keep";
    case "active": return "advance";
    default: break;
  }
  if (contact.pipelineStatus === "archived") return "archived";
  if (contact.pipelineStatus === "to_contact") return "explore";
  return "advance";
}

export type NetworkSource = "event" | "referral" | "contact" | "scan" | "other";
export const NETWORK_SOURCES = ["all", "event", "referral", "contact", "scan", "other"] as const;
export const SOURCE_LABEL: Record<NetworkSource | "all", { zh: string; en: string }> = {
  all: { zh: "全部联系人", en: "All contacts" },
  event: { zh: "活动认识", en: "Met at events" },
  referral: { zh: "朋友引荐", en: "Referred" },
  contact: { zh: "通讯录", en: "Address book" },
  scan: { zh: "名片导入", en: "Business cards" },
  other: { zh: "其他来源", en: "Other" },
};
export const SOURCE_ICON: Record<NetworkSource | "all", string> = { all: "◎", event: "▦", referral: "⇢", contact: "▤", scan: "▭", other: "···" };

export function sourceOf(contact: Pick<OrbitContactView, "source">): NetworkSource {
  switch (contact.source) {
    case "event": return "event";
    case "referral": return "referral";
    case "contact": return "contact";
    case "scan": return "scan";
    default: return "other";
  }
}

export interface NetworkPerson {
  id: string; name: string; initial: string; org: string; title: string; orgTitle: string; industry: string;
  source: NetworkSource; stage: NetworkStage; pendingInit: boolean; last: string; next: string; region: string; tags: string[]; href: string;
}

export function toPerson(contact: OrbitContactView): NetworkPerson {
  const org = contact.company.trim();
  const title = contact.title.trim();
  return {
    id: contact.id,
    name: contact.displayName,
    initial: contact.initial || contact.displayName.slice(0, 1),
    org, title,
    orgTitle: [org, title].filter(Boolean).join(" · "),
    industry: contact.industry,
    source: sourceOf(contact),
    stage: stageOf(contact),
    pendingInit: contact.pipelineStatus === "pending_initialization",
    last: contact.lastInteraction || "",
    next: contact.nextAction?.text ?? contact.seeking ?? "",
    region: contact.location ?? "",
    tags: [...contact.valueTags],
    href: `/app/contacts/${encodeURIComponent(contact.id)}`,
  };
}

export function matchesQuery(p: NetworkPerson, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${p.name}${p.org}${p.title}${p.industry}`.toLowerCase().includes(q);
}

export function sourceCounts(people: readonly NetworkPerson[]): Record<NetworkSource | "all", number> {
  const out: Record<NetworkSource | "all", number> = { all: people.length, event: 0, referral: 0, contact: 0, scan: 0, other: 0 };
  for (const p of people) out[p.source] += 1;
  return out;
}

export function stageCounts(people: readonly NetworkPerson[]): Record<NetworkStage, number> {
  const out: Record<NetworkStage, number> = { explore: 0, keep: 0, advance: 0, archived: 0 };
  for (const p of people) out[p.stage] += 1;
  return out;
}

export const DONUT_COLORS = ["#4B4FC7", "#5B8C7A", "#9C7A3E", "#8A8FB0", "#6B8FB5", "#2E3270", "#C9CBEA"] as const;
export interface DonutRow { label: string; n: number; pct: string; color: string }

export function donut(rows: readonly (readonly [string, number])[]): { bg: string; rows: DonutRow[] } {
  const sum = rows.reduce((a, r) => a + r[1], 0) || 1;
  let acc = 0;
  const stops = rows.map((r, i) => { const a = acc / sum * 360; acc += r[1]; return `${DONUT_COLORS[i % DONUT_COLORS.length]} ${a}deg ${acc / sum * 360}deg`; });
  return {
    bg: `conic-gradient(${stops.join(", ")})`,
    rows: rows.map((r, i) => ({ label: r[0], n: r[1], pct: `${Math.round(r[1] / sum * 100)}%`, color: DONUT_COLORS[i % DONUT_COLORS.length] })),
  };
}

export const STAGE_BAR_BG = ["#E8E9F6", "#DDDEFA", "#B9BCEB", "#2E3270"] as const;
export const STAGE_BAR_FG = ["#3B3F7A", "#3B3F7A", "#2E3270", "#FFFFFF"] as const;

export function stageClip(index: 0 | 1 | 2 | 3): string {
  if (index === 0) return "polygon(0 0,calc(100% - 14px) 0,100% 50%,calc(100% - 14px) 100%,0 100%)";
  if (index === 3) return "polygon(0 0,100% 0,100% 100%,0 100%,14px 50%)";
  return "polygon(0 0,calc(100% - 14px) 0,100% 50%,calc(100% - 14px) 100%,0 100%,14px 50%)";
}

/**
 * 列表 VM 没有互动时间戳（后端为存储顺序），所以「最近联系人」不用列表切片伪装；
 * 概览屏用 ContactsAnalysisView.activity（真实 occurredAt）渲染该区块，见任务 4。
 */
export function personByName(people: readonly NetworkPerson[], name: string): NetworkPerson | undefined {
  return people.find((p) => p.name === name);
}
```

- [ ] **Step 4: 给 OrbitContactView 增加 relationshipStatus 并在两个适配器填充**

先跑 impact：`cd /Users/li/work/orbit-web-newui-batch0-20260918 && node .gitnexus/run.cjs impact "OrbitContactView" --direction upstream --repo .`（预期很多调用方；本步只**新增可选字段**，不改既有字段，属向后兼容）。

`$WEB/app/(app)/app/orbit-contacts-route-view-model.ts`：在 `export interface OrbitContactView {` 的 `pipelineStatus: OrbitContactPipelineStatus;` 之后加：

```ts
  /** 关系状态原始枚举（列表/详情适配器填充；stage 字段是本地化显示标签，不可用于判断）。 */
  relationshipStatus?: "active" | "needs_follow_up" | "nurture" | "archived";
```

`$WEB/app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-view-model-adapter.ts` `contactToOrbitView` 返回对象里 `pipelineStatus:` 一行后加 `relationshipStatus: contact.status,`（`contact.status` 类型为 `StatusType` = `ContactListItem["status"]`；若 typecheck 报不兼容，用 `contact.status as OrbitContactView["relationshipStatus"]`）。

`$WEB/app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-view-model-adapter.ts`：在构造 `OrbitContactView` 的位置（约第 416 行 `pipelineStatus` 附近）同样加 `relationshipStatus: model.contact.status,`。

- [ ] **Step 5: 跑测试确认通过 + 既有适配器测试不回归**

Run: `cd $WEB && node --test --import tsx tests/pages/app-network-model.test.ts tests/pages/app-contacts-list-filtering.test.ts tests/pages/app-contacts-archived-status.test.tsx tests/pages/app-contact-detail-live-route-services.test.ts && npm run typecheck`
Expected: model `# pass 7`；其余绿；typecheck 无新增。

- [ ] **Step 6: 写壳**

移植 `$DESIGN` 第 43 行 `<main>` 容器与第 45–65 行（页头 + 四页签）。四页签是**路由链接**（不是状态）：概览 `/app/contacts/dashboard`、关系管线 `/app/contacts/pipeline`、所有人脉 `/app/contacts`、导入人脉 `/app/contacts/new`。

```tsx
// $WEB/app/(app)/app/contacts/network-0918/network-shell.tsx
/**
 * Network v2（Orbit_0918）人脉域壳：页头 + 四页签 + 全部 nw-* 样式。
 * JSX 逐元素来自 docs/designs/Orbit_0918/Network v2.dc.html 第 44–65 行。
 */
"use client";

import type { ReactNode } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";

export type NetworkScreen = "overview" | "pipeline" | "all" | "import" | "analysis";

const TABS: { key: NetworkScreen; href: string; zh: string; en: string }[] = [
  { key: "overview", href: "/app/contacts/dashboard", zh: "概览", en: "Overview" },
  { key: "pipeline", href: "/app/contacts/pipeline", zh: "关系管线", en: "Pipeline" },
  { key: "all", href: "/app/contacts", zh: "所有人脉", en: "All contacts" },
  { key: "import", href: "/app/contacts/new", zh: "导入人脉", en: "Import" },
];

export function NetworkAvatar({ initial, size = 40 }: { initial: string; size?: 40 | 56 | 64 }) {
  return <span className={`nw-avatar nw-avatar-${size}`}>{initial}</span>;
}

export function NetworkChip({ bg, fg, children }: { bg: string; fg: string; children: ReactNode }) {
  return <span className="nw-chip" style={{ background: bg, color: fg }}>{children}</span>;
}

export function NetworkShell({ screen, total, children, modal }: { screen: NetworkScreen; total: number | null; children: ReactNode; modal?: ReactNode }) {
  const { t } = useOrbitLanguage();
  const isMain = screen !== "analysis";
  return (
    <main data-orbit-real-page="network" data-network-screen={screen} className="nw-main">
      <style>{NETWORK_STYLES}</style>
      {isMain ? (
        <>
          <div className="nw-head">
            <div className="nw-head-copy">
              <h1 className="nw-h1">{t({ en: "Network", zh: "人脉" })}</h1>
              <p className="nw-sub">{t({ en: "Understand your network and keep the relationships that matter moving.", zh: "理解你的人脉结构，把重要关系持续向前推进。" })}</p>
            </div>
            <div className="nw-head-actions">
              {screen === "all" ? (
                <a className="btn nw-btn-ghost" href="/app/contacts/new?method=scan">＋ {t({ en: "New contact", zh: "新建联系人" })}</a>
              ) : null}
              <a className="btn nw-btn-primary" href="/app/contacts/new">＋ {t({ en: "Import contacts", zh: "导入人脉" })}</a>
            </div>
          </div>
          <div className="nw-tabs">
            {TABS.map((tab) => (
              <a key={tab.key} className={`nw-tab ${screen === tab.key ? "nw-tab-on" : "nw-tab-off"}`} href={tab.href} aria-current={screen === tab.key ? "page" : undefined}>
                {t({ en: tab.en, zh: tab.zh })}
              </a>
            ))}
          </div>
        </>
      ) : null}
      {children}
      {modal}
    </main>
  );
}

// 每条规则 = 设计稿一个 style="" 原样搬入；顺序与值不得改动。
export const NETWORK_STYLES = `
@keyframes orbit-fade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
[data-orbit-real-page="network"] { min-height: 100vh; background: #FBFBFE; color: #0E1225; font-family: "Noto Sans SC", "PingFang SC", "Hiragino Sans GB", sans-serif; -webkit-font-smoothing: antialiased; text-wrap: pretty; overflow-x: clip; }
[data-orbit-real-page="network"] a { color: #3B3F7A; text-decoration: none; }
[data-orbit-real-page="network"] a:hover { color: #0E1225; }
[data-orbit-real-page="network"] input, [data-orbit-real-page="network"] textarea, [data-orbit-real-page="network"] button, [data-orbit-real-page="network"] select { font-family: inherit; }
[data-orbit-real-page="network"] input::placeholder, [data-orbit-real-page="network"] textarea::placeholder { color: #9FA3C4; }
[data-orbit-real-page="network"].nw-main { max-width: 1240px; margin: 0 auto; padding: 28px 40px 96px; display: flex; flex-direction: column; gap: 24px; }
[data-orbit-real-page="network"] .nw-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 16px; }
[data-orbit-real-page="network"] .nw-head-copy { display: flex; flex-direction: column; gap: 8px; }
[data-orbit-real-page="network"] .nw-h1 { margin: 0; font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 40px; line-height: 1.1; letter-spacing: -0.03em; }
[data-orbit-real-page="network"] .nw-sub { margin: 0; font-size: 15px; color: #3B3F7A; }
[data-orbit-real-page="network"] .nw-head-actions { display: flex; gap: 12px; }
[data-orbit-real-page="network"] .btn.nw-btn-ghost { padding: 13px 22px; border: 1px solid #DDDEFA; border-radius: 12px; background: #FFFFFF; color: #2E3270; font-size: 15px; font-weight: 500; cursor: pointer; /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 */ height: auto; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="network"] .btn.nw-btn-ghost:hover { background: #ECEEFB; }
[data-orbit-real-page="network"] .btn.nw-btn-primary { padding: 13px 22px; border: 0; border-radius: 12px; background: #0E1225; color: #FFFFFF; font-size: 15px; font-weight: 500; cursor: pointer; /* 覆盖 .btn 基类 */ height: auto; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="network"] .btn.nw-btn-primary:hover { background: #2E3270; }
[data-orbit-real-page="network"] .nw-tabs { display: flex; gap: 8px; border-bottom: 1px solid #E8E9F6; font-size: 15px; }
[data-orbit-real-page="network"] .nw-tab { padding: 12px 16px; border: 0; border-bottom: 2px solid transparent; margin-bottom: -1px; background: transparent; cursor: pointer; transition: color .2s; }
[data-orbit-real-page="network"] .nw-tab-on { border-bottom-color: #0E1225; color: #0E1225; font-weight: 500; }
[data-orbit-real-page="network"] .nw-tab-off { color: #6B6F99; font-weight: 400; }
[data-orbit-real-page="network"] .nw-avatar { border-radius: 50%; background: #DDDEFA; color: #3B3F7A; display: flex; align-items: center; justify-content: center; font-weight: 700; flex-shrink: 0; }
[data-orbit-real-page="network"] .nw-avatar-40 { width: 40px; height: 40px; }
[data-orbit-real-page="network"] .nw-avatar-56 { width: 56px; height: 56px; font-size: 22px; }
[data-orbit-real-page="network"] .nw-avatar-64 { width: 64px; height: 64px; font-size: 26px; font-family: 'Noto Serif SC', serif; font-weight: 900; }
[data-orbit-real-page="network"] .nw-chip { padding: 5px 10px; border-radius: 999px; font-size: 12px; white-space: nowrap; }
[data-orbit-real-page="network"] .nw-card { border: 1px solid #E8E9F6; border-radius: 18px; background: #FFFFFF; padding: 26px; display: flex; flex-direction: column; gap: 20px; animation: orbit-fade .3s ease; }
[data-orbit-real-page="network"] .nw-card-head { display: flex; flex-direction: column; gap: 4px; }
[data-orbit-real-page="network"] .nw-h2 { margin: 0; font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 22px; letter-spacing: -0.02em; }
[data-orbit-real-page="network"] .nw-card-hint { font-size: 14px; color: #6B6F99; }
[data-orbit-real-page="network"] .nw-empty { padding: 40px; text-align: center; color: #9FA3C4; font-size: 14px; }
`;
```

- [ ] **Step 7: typecheck + ratchet**

Run: `cd $WEB && npm run typecheck && node --test --import tsx tests/ui/orbit-button-ratchet.test.ts tests/ui/orbit-scale-ratchet.test.ts`
Expected: typecheck 无新增错误（基线见 `tsc` 输出与主仓一致）；ratchet `# pass 8`。

- [ ] **Step 8: 提交**

```bash
cd /Users/li/work/orbit-web-newui-batch0-20260918 && node .gitnexus/run.cjs detect-changes --scope all --repo . && git add "repos/orbits/app/(app)/app/contacts/network-0918/" "repos/orbits/app/(app)/app/orbit-contacts-route-view-model.ts" "repos/orbits/app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-view-model-adapter.ts" "repos/orbits/app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-view-model-adapter.ts" repos/orbits/tests/pages/app-network-model.test.ts && git commit -m "feat(network): Orbit_0918 network model and shell; expose relationshipStatus on OrbitContactView

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: 「所有人脉」屏（`/app/contacts`）

**Files:**
- Create: `$WEB/app/(app)/app/contacts/network-0918/network-all.tsx`
- Modify: `$WEB/app/(app)/app/contacts/page.tsx`（把 `OrbitRealCardsList` 换成 `NetworkAll`）
- Test: `$WEB/tests/pages/app-network-all.test.tsx`

**Interfaces:**
- Consumes：任务 1 全部导出；`OrbitContactsViewModel`（`viewModel.connections`）。
- Produces：`export function NetworkAll({ viewModel, initialSource }: { viewModel: OrbitContactsViewModel; initialSource?: NetworkSource | "all" })`。行点击打开详情弹窗（任务 6 前先 `href` 跳 `/app/contacts/[id]`；任务 6 改为弹窗）。

- [ ] **Step 1: 写失败测试（SSR 结构）**

```tsx
// $WEB/tests/pages/app-network-all.test.tsx
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { OrbitContactsViewModel } from "../../app/(app)/app/orbit-contacts-route-view-model";
import { NetworkAll } from "../../app/(app)/app/contacts/network-0918/network-all";

const vm: OrbitContactsViewModel = {
  connections: [
    { company: "Nexa AI", encounters: [], displayName: "田中惠子", email: "", g: "g-violet", id: "c1", industry: "科技与互联网", initial: "田", lineId: "", location: "", lastEventId: "", met: "", note: "", notes: [], offering: "", phone: "", pipelineStatus: "in_progress", relationshipStatus: "active", seeking: "下周约产品演示", source: "event", stage: "Active", title: "合作伙伴负责人", wechat: "", strength: "medium", valueTags: [], nextAction: null, lastInteraction: "昨天", dormant: false },
    { company: "三井", encounters: [], displayName: "山本健", email: "", g: "g-violet", id: "c2", industry: "专业服务", initial: "山", lineId: "", location: "", lastEventId: "", met: "", note: "", notes: [], offering: "", phone: "", pipelineStatus: "to_contact", relationshipStatus: "needs_follow_up", seeking: "", source: "referral", stage: "Needs follow-up", title: "顾问", wechat: "", strength: "medium", valueTags: [], nextAction: null, lastInteraction: "", dormant: false },
  ],
  events: [], intros: [], pipelineStatuses: [],
};

test("all screen renders design structure with real counts", () => {
  const html = renderToStaticMarkup(<NetworkAll viewModel={vm} />);
  assert.match(html, /data-network-screen="all"/);
  assert.match(html, /共 2 位联系人/);
  // 六张来源卡，全部计数 2，活动认识 1
  assert.equal((html.match(/class="btn nw-source-card/g) ?? []).length, 6);
  assert.match(html, /活动认识[\s\S]{0,120}nw-source-n">1</);
  // 两行联系人，阶段 chip 真实
  assert.equal((html.match(/class="btn nw-row"/g) ?? []).length, 2);
  assert.match(html, /正在推进/);
  assert.match(html, /待了解/);
  assert.doesNotMatch(html, /128/);
});

test("source filter narrows rows and shows the design empty state", () => {
  const html = renderToStaticMarkup(<NetworkAll viewModel={vm} initialSource="scan" />);
  assert.equal((html.match(/class="btn nw-row"/g) ?? []).length, 0);
  assert.match(html, /没有匹配的联系人/);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd $WEB && node --test --import tsx tests/pages/app-network-all.test.tsx`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 移植 JSX**

来源 `$DESIGN` 第 257–302 行。对照表（类名 ← 设计行）：

| 类 | 设计元素 |
| --- | --- |
| `nw-card`（任务 1） | 259 外卡 |
| `nw-filters` | 264 `display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr)); gap:14px; align-items:end;` |
| `nw-search` | 265 `<input>`（`:focus { border-color:#4B4FC7 }`） |
| `nw-filter-label` / `nw-filter-box` / `nw-filter-caret` | 266–269 四个 `<label>`：来源（真实当前来源）、关系状态（「全部状态」静态）、行业（「全部行业」静态）、排序（「最近互动」静态）——后三者设计为展示框，无交互，原样渲染 |
| `nw-source-grid` / `.btn.nw-source-card` / `nw-source-icon` / `nw-source-copy` / `nw-source-label` / `nw-source-n` | 271–279 来源卡（`border`/`background` 动态 → 内联 style） |
| `nw-table` / `nw-thead` / `nw-check` / `.btn.nw-row` / `nw-row-name` / `nw-row-org` / `nw-row-org-1` / `nw-row-org-2` / `nw-row-last` / `nw-row-next` / `nw-row-arrow` | 281–298 表头与行（`grid-template-columns:20px 44px minmax(90px,1fr) minmax(0,2fr) 100px 100px 90px minmax(0,1.5fr) 24px`） |
| `nw-empty`（任务 1） | 300 空态 |

组件骨架（数据/状态部分完整给出，JSX 按上表逐行移植）：

```tsx
// $WEB/app/(app)/app/contacts/network-0918/network-all.tsx
/** 「所有人脉」（Network v2 第 257–302 行）。数据 = OrbitContactsViewModel.connections。 */
"use client";

import { useMemo, useState } from "react";

import type { OrbitContactsViewModel } from "../../orbit-contacts-route-view-model";
import { useOrbitLanguage } from "../../orbit-language-context";
import { NETWORK_SOURCES, SOURCE_ICON, SOURCE_LABEL, STAGE_CHIP, STAGE_LABEL, matchesQuery, sourceCounts, toPerson, type NetworkSource } from "./network-model";
import { NetworkAvatar, NetworkChip, NetworkShell } from "./network-shell";

export function NetworkAll({ viewModel, initialSource = "all" }: { viewModel: OrbitContactsViewModel; initialSource?: NetworkSource | "all" }) {
  const { t } = useOrbitLanguage();
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<NetworkSource | "all">(initialSource);
  const people = useMemo(() => viewModel.connections.map(toPerson), [viewModel.connections]);
  const counts = useMemo(() => sourceCounts(people), [people]);
  const filtered = people.filter((p) => matchesQuery(p, query) && (source === "all" || p.source === source));
  const sourceFilterLabel = source === "all" ? t({ en: "All sources", zh: "全部来源" }) : t(SOURCE_LABEL[source]);

  return (
    <NetworkShell screen="all" total={people.length}>
      <div className="nw-card">
        {/* 260–263：标题 + 「共 N 位联系人，管理你所有的人脉资源。」 */}
        {/* 264–270：nw-filters（搜索 input + 四个展示 label） */}
        {/* 271–279：nw-source-grid，NETWORK_SOURCES.map → .btn.nw-source-card，style={{ background: on ? "#ECEEFB" : "#FFFFFF", borderColor: on ? "#B9BCEB" : "#E8E9F6" }} */}
        {/* 280–301：nw-table；filtered.map → <a className="btn nw-row" href={p.href}>（任务 6 改 onClick 开弹窗）；chip 用 NetworkChip + STAGE_CHIP[p.stage]；p.pendingInit 时 chip 文案「待设置关系」 */}
        {/* 300：filtered.length === 0 → <div className="nw-empty">没有匹配的联系人</div> */}
      </div>
    </NetworkShell>
  );
}
```

> 样式统一追加到 `network-shell.tsx` 的 `NETWORK_STYLES` 末尾（一处维护，按上表逐条写入，声明与设计行完全一致）；本文件不 export 样式。

- [ ] **Step 4: 换页面渲染**

`$WEB/app/(app)/app/contacts/page.tsx`：删除 `import { OrbitRealCardsList } from "./orbit-real-contacts";`，改为 `import { NetworkAll } from "./network-0918/network-all";`；`<OrbitRealCardsList viewModel={…} />` → `<NetworkAll viewModel={…} />`；其余（auth、`loadAppContactsRouteViewModel`、`localizeOrbitTree`、`applyOrbitContactsPresentation`、`OrbitReferenceStyles`、`OrbitVisualFreezeRuntime`、`ContactsRouteStateBoundary`）不动。在 `<NetworkAll>` 前加 `<AccountTopNav active="cards" />`（`import { AccountTopNav } from "../orbit-account-shell"`），因为旧组件自带顶栏而新组件不带。

- [ ] **Step 5: 跑测试 + typecheck + ratchet**

Run: `cd $WEB && node --test --import tsx tests/pages/app-network-all.test.tsx tests/pages/app-network-model.test.ts tests/ui/orbit-button-ratchet.test.ts tests/ui/orbit-scale-ratchet.test.ts && npm run typecheck`
Expected: 全绿。若 button ratchet 报超上限：检查每个 `<button>` 都带 `btn`（来源卡、行）。

- [ ] **Step 6: 像素比对**

Run: `cd $WEB && node scripts/visual/compare-0918.mjs --design "http://localhost:3320/Orbit_0918/Network%20v2.dc.html" --design-view all --app "http://localhost:3100/app/contacts" --cookie "authjs.session-token=<token>" --out /tmp/network-all`
Expected: `mismatch ≤ 0.02`；打开 `/tmp/network-all/diff.png` 确认红色只落在联系人文字/计数区域。不达标 → 对照 `design.png` 修 `nw-*` 值后重跑，直到达标。

- [ ] **Step 7: 提交 + 台账**

```bash
cd /Users/li/work/orbit-web-newui-batch0-20260918 && node .gitnexus/run.cjs impact "OrbitRealCardsList" --direction upstream --repo . ; node .gitnexus/run.cjs detect-changes --scope all --repo . && git add "repos/orbits/app/(app)/app/contacts/network-0918/" "repos/orbits/app/(app)/app/contacts/page.tsx" repos/orbits/tests/pages/app-network-all.test.tsx && git commit -m "feat(network): replace /app/contacts with Orbit_0918 all-contacts screen

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

EXECUTION.md 追加：`- **Network 任务 2 完成** \`<sha>\`：/app/contacts 换为设计稿 257–302 行重建屏；来源卡/行/阶段 chip 全真实计数；mismatch=<值>。`

---

### Task 3: 「关系管线」屏（`/app/contacts/pipeline`）

**Files:**
- Create: `$WEB/app/(app)/app/contacts/network-0918/network-pipeline.tsx`
- Modify: `$WEB/app/(app)/app/contacts/pipeline/page.tsx`
- Test: `$WEB/tests/pages/app-network-pipeline.test.tsx`

**Interfaces:**
- Produces：`export function NetworkPipeline({ viewModel }: { viewModel: OrbitContactsViewModel })`。

- [ ] **Step 1: 写失败测试**

```tsx
// $WEB/tests/pages/app-network-pipeline.test.tsx
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { OrbitContactsViewModel } from "../../app/(app)/app/orbit-contacts-route-view-model";
import { NetworkPipeline } from "../../app/(app)/app/contacts/network-0918/network-pipeline";

const base = { company: "X", encounters: [], email: "", g: "g-violet", industry: "", initial: "A", lineId: "", location: "", lastEventId: "", met: "", note: "", notes: [], offering: "", phone: "", seeking: "", title: "", wechat: "", strength: "medium" as const, valueTags: [], nextAction: null, lastInteraction: "", dormant: false, stage: "" };
const vm: OrbitContactsViewModel = {
  connections: [
    { ...base, id: "a", displayName: "A", pipelineStatus: "to_contact", relationshipStatus: "needs_follow_up", source: "event" },
    { ...base, id: "b", displayName: "B", pipelineStatus: "in_progress", relationshipStatus: "nurture", source: "event" },
    { ...base, id: "c", displayName: "C", pipelineStatus: "in_progress", relationshipStatus: "active", source: "event" },
    { ...base, id: "d", displayName: "D", pipelineStatus: "archived", relationshipStatus: "archived", source: "event" },
  ],
  events: [], intros: [], pipelineStatuses: [],
};

test("pipeline renders four stage columns with real counts and the arrow stage bar", () => {
  const html = renderToStaticMarkup(<NetworkPipeline viewModel={vm} />);
  assert.match(html, /data-network-screen="pipeline"/);
  assert.equal((html.match(/class="nw-kanban-col"/g) ?? []).length, 4);
  for (const label of ["待了解", "保持联系", "正在推进", "已归档"]) assert.match(html, new RegExp(label));
  assert.doesNotMatch(html, /已建立合作/);
  // 五个统计块：总数 4，各阶段 1
  assert.match(html, /nw-pstat-n">4</);
  assert.equal((html.match(/nw-pstat-n">1</g) ?? []).length, 4);
  assert.match(html, /clip-path:polygon\(0 0,calc\(100% - 14px\) 0/);
});
```

- [ ] **Step 2: 跑测试确认失败** — `cd $WEB && node --test --import tsx tests/pages/app-network-pipeline.test.tsx` → FAIL 模块不存在。

- [ ] **Step 3: 移植 JSX**

来源 `$DESIGN` 第 172–256 行。分四块：
1. 173–186 阶段条（`stageBar`）：四段 `clip-path` 箭头，`background`/`color`/`clip-path` 动态 → 内联 style，数值来自 `stageCounts`。`barBg = ['#E8E9F6','#DDDEFA','#B9BCEB','#2E3270']`，`barFg = ['#3B3F7A','#3B3F7A','#2E3270','#FFFFFF']`。
2. 187–214 「本周重点推进」两张高亮卡（`pipeHighlights`）：取 `advance` 列前 2 人；为空显示 `nw-empty`「本周没有正在推进的关系」。
3. 215–228 五个统计块（`pipeStats`）：总联系人 + 四阶段计数，类 `nw-pstat` / `nw-pstat-icon` / `nw-pstat-n` / `nw-pstat-label`。
4. 229–255 看板（`kanban`）：搜索框 + 四列 `nw-kanban-col`（`background` 动态），每列头 icon/标题/desc/计数，卡片 `.btn.nw-kanban-card`（头像 40、姓名、orgTitle、下一步 `p.next`、`p.last`），点击 → 任务 6 前 `href` 详情，任务 6 后开弹窗；`pendingInit` 卡片加 `NetworkChip` 「待设置关系」。

组件签名与状态：

```tsx
"use client";
import { useMemo, useState } from "react";
import type { OrbitContactsViewModel } from "../../orbit-contacts-route-view-model";
import { useOrbitLanguage } from "../../orbit-language-context";
import { NETWORK_STAGES, STAGE_BAR_BG, STAGE_BAR_FG, STAGE_LABEL, STAGE_STYLE, matchesQuery, stageClip, stageCounts, toPerson } from "./network-model";
import { NetworkAvatar, NetworkChip, NetworkShell } from "./network-shell";

export function NetworkPipeline({ viewModel }: { viewModel: OrbitContactsViewModel }) {
  const { t } = useOrbitLanguage();
  const [query, setQuery] = useState("");
  const people = useMemo(() => viewModel.connections.map(toPerson), [viewModel.connections]);
  const counts = stageCounts(people);
  const columns = NETWORK_STAGES.map((stage, i) => ({ stage, i, ...STAGE_STYLE[stage], label: t(STAGE_LABEL[stage]), n: counts[stage], people: people.filter((p) => p.stage === stage && matchesQuery(p, query)) }));
  const highlights = people.filter((p) => p.stage === "advance").slice(0, 2);
  return (
    <NetworkShell screen="pipeline" total={people.length}>
      {/* 173–186 阶段条 → columns.map: <div className="nw-stage-seg" style={{ background: STAGE_BAR_BG[i], color: STAGE_BAR_FG[i], clipPath: stageClip(i as 0|1|2|3) }}> */}
      {/* 187–214 highlights */}
      {/* 215–228 pstats：[["◎", people.length, 总联系人, "#ECEEFB"], ...NETWORK_STAGES → [STAGE_STYLE.icon, counts, label, "#F7F7FD"]] */}
      {/* 229–255 kanban */}
    </NetworkShell>
  );
}
```

样式条目追加到 `NETWORK_STYLES`（类名前缀 `nw-stage-` / `nw-hl-` / `nw-pstat` / `nw-kanban-`），每条声明与设计行完全一致。

- [ ] **Step 4: 换页面渲染** — `pipeline/page.tsx`：`OrbitRealCardsPipelineView` → `NetworkPipeline`，加 `<AccountTopNav active="cards" />`。

- [ ] **Step 5: 测试 + typecheck + ratchet** — `cd $WEB && node --test --import tsx tests/pages/app-network-pipeline.test.tsx tests/ui/orbit-button-ratchet.test.ts tests/ui/orbit-scale-ratchet.test.ts && npm run typecheck` → 全绿。

- [ ] **Step 6: 像素比对** — `--design-view pipeline --app http://localhost:3100/app/contacts/pipeline --out /tmp/network-pipeline` → `mismatch ≤ 0.02`。

- [ ] **Step 7: 提交 + 台账**

```bash
cd /Users/li/work/orbit-web-newui-batch0-20260918 && node .gitnexus/run.cjs detect-changes --scope all --repo . && git add "repos/orbits/app/(app)/app/contacts/network-0918/" "repos/orbits/app/(app)/app/contacts/pipeline/page.tsx" repos/orbits/tests/pages/app-network-pipeline.test.tsx && git commit -m "feat(network): replace /app/contacts/pipeline with Orbit_0918 pipeline screen

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: 「概览」屏 + 「AI 人脉分析」子页（`/app/contacts/dashboard`，吸收 `/app/dashboard`）

**Files:**
- Create: `$WEB/app/(app)/app/contacts/network-0918/network-overview.tsx`
- Create: `$WEB/app/(app)/app/contacts/network-0918/network-analysis.tsx`
- Create: `$WEB/app/(app)/app/contacts/network-0918/network-overview-model.ts`
- Modify: `$WEB/app/(app)/app/contacts/dashboard/page.tsx`
- Modify: `$WEB/app/(app)/app/contacts/analysis/[dimension]/[bucketId]/page.tsx`（只换壳：`ContactsAnalysisShell` → `NetworkShell screen="analysis"`）
- Test: `$WEB/tests/pages/app-network-overview-model.test.ts`、`$WEB/tests/pages/app-network-overview.test.tsx`

**Interfaces:**
- Consumes：`loadAppContactsRouteViewModel`（列表）、`loadContactsAnalysis(actorId, language)` → `ContactsAnalysisView`（`metrics`、`structure.dimensions`、`health`、`coverage`、`opportunities`、`goal`）。
- Produces（`network-overview-model.ts`）：

```ts
export type DistKey = "industry" | "region" | "source";
export function distributionRows(key: DistKey, analysis: ContactsAnalysisView, people: readonly NetworkPerson[]): readonly (readonly [string, number])[]; // industry/region 来自 analysis.structure.dimensions.{industry,location}（label,count），source 来自 sourceCounts(people) 去掉 all
export interface CockpitCard { icon: string; title: { zh: string; en: string }; desc: { zh: string; en: string }; n: number | null; tag: { zh: string; en: string }; tagBg: string; tagFg: string; href: string; }
export function cockpit(analysis: ContactsAnalysisView): CockpitCard[]; // 4 张：highValue/pendingFollowups/newContacts/dormant → 真实计数；analysis 非 ready 时 n=null 显示 —
export function healthRows(analysis: ContactsAnalysisView): { icon: string; label: string; n: number | string; tag: string; desc: string; iconBg: string; iconFg: string }[];
```
- Produces：`export function NetworkOverview({ viewModel, analysis }: { viewModel: OrbitContactsViewModel; analysis: ContactsAnalysisView })`；`export function NetworkAnalysis({ viewModel, analysis, initialTab }: { …; initialTab: "struct" | "opp" })`。
- 路由：`/app/contacts/dashboard` → 概览；`/app/contacts/dashboard?tab=structure|opportunities` → 分析子页（保持既有 query 语义，`contacts/graph` 曾重定向到此）。

- [ ] **Step 1: 写失败测试（模型）**

```ts
// $WEB/tests/pages/app-network-overview-model.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import type { ContactsAnalysisView } from "../../app/(app)/app/contacts/analysis/contacts-analysis-view-model";
import { cockpit, distributionRows } from "../../app/(app)/app/contacts/network-0918/network-overview-model";
import { toPerson } from "../../app/(app)/app/contacts/network-0918/network-model";

const ready: ContactsAnalysisView = {
  state: "ready", generatedAt: "2026-09-21T00:00:00Z", summary: "", activity: [], analysis: { state: "unavailable" },
  metrics: { contacts: 78, newContacts: 6, highValue: 12, pendingFollowups: 9, dormant: 8 },
  goal: { state: "empty", data: { id: null, text: "", updatedAt: "", canEdit: true } },
  structure: { state: "ready", data: { summary: "", health: [], dimensions: { industry: [{ id: "tech", label: "科技与互联网", count: 21, percentage: 27, missingData: false, href: "" }], location: [{ id: "tokyo", label: "东京", count: 38, percentage: 49, missingData: false, href: "" }], role: [], relationship: [] } } },
  coverage: { state: "unavailable" }, opportunities: { state: "unavailable" },
};

test("cockpit uses real metrics and never design placeholders", () => {
  const cards = cockpit(ready);
  assert.equal(cards.length, 4);
  assert.deepEqual(cards.map((c) => c.n), [12, 9, 6, 8]);
  assert.deepEqual(cockpit({ state: "pending" }).map((c) => c.n), [null, null, null, null]);
});

test("distributionRows reads industry/location from analysis and source from people", () => {
  assert.deepEqual(distributionRows("industry", ready, []), [["科技与互联网", 21]]);
  assert.deepEqual(distributionRows("region", ready, []), [["东京", 38]]);
  const people = [toPerson({ company: "", encounters: [], displayName: "A", email: "", g: "", id: "a", industry: "", initial: "A", lineId: "", location: "", lastEventId: "", met: "", note: "", notes: [], offering: "", phone: "", pipelineStatus: "in_progress", relationshipStatus: "active", seeking: "", source: "scan", stage: "Active", title: "", wechat: "", strength: "medium", valueTags: [], nextAction: null, lastInteraction: "", dormant: false })];
  assert.deepEqual(distributionRows("source", ready, people), [["活动认识", 0], ["朋友引荐", 0], ["通讯录", 0], ["名片导入", 1], ["其他来源", 0]]);
});
```

- [ ] **Step 2: 跑测试确认失败** — 模块不存在。

- [ ] **Step 3: 写模型**

```ts
// $WEB/app/(app)/app/contacts/network-0918/network-overview-model.ts
import type { ContactsAnalysisView } from "../analysis/contacts-analysis-view-model";
import { NETWORK_SOURCES, SOURCE_LABEL, sourceCounts, type NetworkPerson } from "./network-model";

export type DistKey = "industry" | "region" | "source";

export function distributionRows(key: DistKey, analysis: ContactsAnalysisView, people: readonly NetworkPerson[]): readonly (readonly [string, number])[] {
  if (key === "source") {
    const c = sourceCounts(people);
    return NETWORK_SOURCES.filter((s) => s !== "all").map((s) => [SOURCE_LABEL[s].zh, c[s]] as const);
  }
  if (analysis.state !== "ready" || analysis.structure.state !== "ready") return [];
  const buckets = analysis.structure.data.dimensions[key === "industry" ? "industry" : "location"];
  return buckets.map((b) => [b.label, b.count] as const);
}

export interface CockpitCard { icon: string; title: { zh: string; en: string }; desc: { zh: string; en: string }; n: number | null; tag: { zh: string; en: string }; tagBg: string; tagFg: string; href: string }

// 设计 cockpit 四卡的图标/色块保留；标题改为真实计数句式，置信度 mock 文案替换为数据来源标签。
export function cockpit(analysis: ContactsAnalysisView): CockpitCard[] {
  const m = analysis.state === "ready" ? analysis.metrics : null;
  return [
    { icon: "◎", n: m?.highValue ?? null, title: { zh: "高价值关系", en: "High-value relationships" }, desc: { zh: "价值评估为高的联系人，优先维护。", en: "Contacts rated high value; keep them warm." }, tag: { zh: "来自关系评估", en: "From relationship scoring" }, tagBg: "#E6F1EC", tagFg: "#2F6B4F", href: "/app/contacts/dashboard?tab=opportunities" },
    { icon: "➶", n: m?.pendingFollowups ?? null, title: { zh: "待跟进联系人", en: "Follow-ups due" }, desc: { zh: "有明确下一步但尚未执行的关系。", en: "Relationships with a next step still open." }, tag: { zh: "来自跟进记录", en: "From follow-up records" }, tagBg: "#E6F1EC", tagFg: "#2F6B4F", href: "/app/contacts/pipeline" },
    { icon: "⇢", n: m?.newContacts ?? null, title: { zh: "新增人脉", en: "New contacts" }, desc: { zh: "最近加入你人脉网络的联系人。", en: "Recently added to your network." }, tag: { zh: "来自导入记录", en: "From import history" }, tagBg: "#FBF1DC", tagFg: "#8A6420", href: "/app/contacts?source=all" },
    { icon: "◷", n: m?.dormant ?? null, title: { zh: "沉睡联系人", en: "Dormant contacts" }, desc: { zh: "曾有互动但已较久未联系。", en: "Had good interactions, quiet for a while." }, tag: { zh: "来自互动频率", en: "From interaction frequency" }, tagBg: "#FBF1DC", tagFg: "#8A6420", href: "/app/contacts/dashboard?tab=opportunities" },
  ];
}

export function healthRows(analysis: ContactsAnalysisView) {
  if (analysis.state !== "ready" || analysis.structure.state !== "ready") return [];
  const meta = { strong: ["◎", "核心人脉", "稳定", "值得持续维护的核心关系", "#E6F1EC", "#2F6B4F"], warm: ["◷", "进行中", "需要留意", "有互动但需加强维护", "#ECEEFB", "#2E3270"], weak: ["◌", "外圈人脉", "待唤醒", "有潜力重新建立联系", "#FBF1DC", "#8A6420"] } as const;
  return analysis.structure.data.health.map((h) => { const m = meta[h.id]; return { icon: m[0], label: m[1], n: h.count, tag: m[2], desc: m[3], iconBg: m[4], iconFg: m[5] }; });
}
```

- [ ] **Step 4: 跑模型测试** → `# pass 2`。

- [ ] **Step 5: 写失败测试（概览 SSR）**

```tsx
// $WEB/tests/pages/app-network-overview.test.tsx
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NetworkOverview } from "../../app/(app)/app/contacts/network-0918/network-overview";

test("overview renders donut, cockpit, stage bar and recent list from real data", () => {
  const html = renderToStaticMarkup(<NetworkOverview viewModel={{ connections: [], events: [], intros: [], pipelineStatuses: [] }} analysis={{ state: "pending" }} />);
  assert.match(html, /data-network-screen="overview"/);
  assert.match(html, /人脉分布/);
  assert.match(html, /AI 人脉驾驶舱/);
  assert.equal((html.match(/class="btn nw-cockpit-card"/g) ?? []).length, 4);
  assert.match(html, /nw-cockpit-n">—</); // 非 ready → —
  assert.match(html, /最近联系人/);
  assert.doesNotMatch(html, /428|128|85%/);
});
```

- [ ] **Step 6: 移植概览 JSX**

来源 `$DESIGN` 第 66–171 行，分块：
- 68–101 人脉分布卡：三段切换 `distSegs`（按行业/按地区/按来源；`background`/`color` 动态）、donut（`background: donut(rows).bg`，中心显示 `people.length` + 「联系人」）、图例行 `dd.rows`（色点 / label / n / pct）、底部「查看完整分析 →」链 `/app/contacts/dashboard?tab=structure`。
- 102–125 AI 人脉驾驶舱：右上「基于你的人脉数据分析」小字 → 改为 `analysis.generatedAt` 格式化「更新于 …」（pending 时「分析生成中」）；4 张 `.btn.nw-cockpit-card`（`<a>`），计数 `nw-cockpit-n`，`n === null` 渲染 `—`；底部两按钮「查看完整分析」→ `?tab=structure`、「✦ 交给 iOrbit」→ `/app/agent`。
- 126–147 关系推进管线：阶段条同任务 3（`stageClip` + `STAGE_BAR_BG/FG`），两张高亮卡 = `advance` 前 2；「查看管线 →」链 pipeline。
- 148–170 最近联系人：数据 = `analysis.activity` 前 5 条（真实 `occurredAt`），每行 头像(首字)/`label`/`source`/时间（`occurredAt` 格式化 `M月D日`）；`personByName(people, label)` 命中时行链到详情；`analysis` 非 ready 或 activity 为空 → `nw-empty`「还没有互动记录」。「查看全部 →」链 `/app/contacts`。

- [ ] **Step 7: 移植分析子页 JSX**

来源 `$DESIGN` 第 393–609 行（不含 610–707 洞察）。
- 394–409 子页头：面包屑「人脉 / AI 人脉分析」、h1「AI 人脉分析」、两个页签 结构/机会（`aTabs`）。
- 410–511 结构：四维切换 `dims`（行业/地区/角色/关系 ← `structure.dimensions.{industry,location,role,relationship}`），donut + 前五排名 `dimTop`（rankColors）+ `dimSummary`（用 `structure.data.summary`，为空显示「暂无总结」）；健康度四块 `healthRows`（第四块「决策层占比」无数据源 → 不渲染，三块布局 `grid-template-columns:repeat(3,1fr)`，记入台账）；覆盖缺口 `coverage.data.gaps`（severity→ tag 色：high `#FBE4E1/#B5473A`「优先拓展」、medium `#FBF1DC/#8A6420`「重点关注」、low `#ECEEFB/#2E3270`「持续跟进」）。
- 512–609 机会：`opportunities.data.actions`（title/judgment/contactName/dueLabel/evidence/steps/primary/secondary）与 `dormant` 列表；目标卡 `goal`（既有 `AnalysisGoalEditor`（`contacts/analysis/analysis-goal-editor.tsx`）保留复用，只换外层样式）。
- `analysis` 非 ready：每个区块渲染 `nw-empty`「来源暂时不可用」/「分析生成中」。

- [ ] **Step 8: 换页面渲染**

`dashboard/page.tsx`：读取 `searchParams.tab`；`tab` 为 `structure`/`opportunities` → `<NetworkAnalysis initialTab={tab === "opportunities" ? "opp" : "struct"} …/>`，否则 `<NetworkOverview …/>`；两者都需要 `viewModel`（新增调用 `loadAppContactsRouteViewModel({}, actor.id)` + `contactsRouteToOrbitContactsViewModel` + `applyOrbitContactsPresentation`，与 `contacts/page.tsx` 相同）和 `loadContactsAnalysis(actor.id, language)`；加 `<AccountTopNav active="cards" />`。
`analysis/[dimension]/[bucketId]/page.tsx`：把 `ContactsAnalysisShell` 换成 `<AccountTopNav active="cards" />` + `<NetworkShell screen="analysis" total={null}>`；内容组件 `ContactsStructureDetail`（`contacts/analysis/contacts-structure-detail.tsx`）不动，但它依赖 `ContactsAnalysisShell` 内联的 `.analysis-card / .analysis-grid / .analysis-notice / .analysis-muted` 规则——把这四条规则（从 `contacts-analysis-workspace.tsx:16–61` 的 `<style>` 原样）复制进 `NETWORK_STYLES`，前缀 `[data-orbit-real-page="network"] `，任务 8 删除 workspace 后下钻页仍有样式。

- [ ] **Step 9: 测试 + typecheck + ratchet + 既有分析测试**

Run: `cd $WEB && node --test --import tsx tests/pages/app-network-overview-model.test.ts tests/pages/app-network-overview.test.tsx tests/pages/app-contacts-analysis-view-model.test.ts tests/pages/app-contacts-structure-detail.test.tsx tests/pages/app-contacts-dashboard-account-scope.test.ts tests/ui/orbit-button-ratchet.test.ts tests/ui/orbit-scale-ratchet.test.ts && npm run typecheck`
Expected: 全绿（`app-contacts-analysis-content.test.tsx` 在任务 9 随旧组件删除；本任务若它因壳变化失败，先在提交信息记录、任务 9 删除）。

- [ ] **Step 10: 像素比对**

`--design-view overview --app http://localhost:3100/app/contacts/dashboard --out /tmp/network-overview` → `≤ 0.02`；`--design-view analysis --app "http://localhost:3100/app/contacts/dashboard?tab=structure" --out /tmp/network-analysis` → `≤ 0.03`（健康度第四块缺失导致的固定差异除外，diff 应只在该区域）。

- [ ] **Step 11: 提交 + 台账**

```bash
cd /Users/li/work/orbit-web-newui-batch0-20260918 && node .gitnexus/run.cjs impact "loadContactsAnalysis" --direction upstream --repo . ; node .gitnexus/run.cjs detect-changes --scope all --repo . && git add "repos/orbits/app/(app)/app/contacts/" repos/orbits/tests/pages/app-network-overview-model.test.ts repos/orbits/tests/pages/app-network-overview.test.tsx && git commit -m "feat(network): Orbit_0918 overview screen and analysis sub-page on /app/contacts/dashboard

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: 「导入人脉」屏（`/app/contacts/new`，吸收名片 V2 子状态）

**Files:**
- Create: `$WEB/app/(app)/app/contacts/network-0918/network-import.tsx`
- Modify: `$WEB/app/(app)/app/contacts/new/page.tsx`
- Test: `$WEB/tests/pages/app-network-import.test.tsx`

**Interfaces:**
- Consumes：`resolveBusinessCardCaptureAvailability()` → `BusinessCardCaptureAvailability`（`features/acquisition/business-card-capture-availability.ts:16`：`{ available: boolean; reason: "ready" | "live_mode_required" | … }`，**没有 `enabled`/`null`**）；名片 **V2** 入口组件 `BusinessCardIngestV2Start`（现位于 `contacts/new/batch2/business-card-ingest-v2-start.tsx`，本任务移到 `contacts/ingest-v2/`）作为「扫描名片夹」方式的内容区（V1 的 `BusinessCardCaptureWorkspace` 不用）；批次详情组件 `business-card-ingest-v2-view.tsx`（现位于 `batch2/[id]/`，同样移动）作为 `?job=` 记录详情。
- Produces：`export function NetworkImport({ availability, initialMethod, jobId }: { availability: BusinessCardCaptureAvailability; initialMethod?: "csv" | "contacts" | "scan" | "event"; jobId?: string })`。
- URL 约定（替代删除的路由）：`/app/contacts/new?method=scan`（默认）、`/app/contacts/new?job=<batchId>` 打开某批次记录。

- [ ] **Step 1: 写失败测试**

```tsx
// $WEB/tests/pages/app-network-import.test.tsx
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NetworkImport } from "../../app/(app)/app/contacts/network-0918/network-import";

const availability = { available: true, reason: "ready" } as const;

test("import screen renders the four design methods; only scanning is interactive", () => {
  const html = renderToStaticMarkup(<NetworkImport availability={availability} />);
  assert.match(html, /data-network-screen="import"/);
  for (const m of ["上传 CSV", "导入通讯录", "扫描名片夹", "从活动添加联系人"]) assert.match(html, new RegExp(m));
  assert.equal((html.match(/nw-import-cta-soon/g) ?? []).length, 3);
  assert.equal((html.match(/class="btn nw-import-cta"/g) ?? []).length, 1);
  assert.match(html, /去重识别/);
  assert.doesNotMatch(html, /客户名单\.xlsx|iCloud 通讯录/);
});
```

- [ ] **Step 2: 跑测试确认失败**。

- [ ] **Step 3: 移植 JSX**

来源 `$DESIGN` 第 303–392 行：
- 305–327 四种方式卡 `importMethods`（`background`/`border` 动态；选中 = `method`）：CTA 文案保留设计（选择文件 / 连接通讯录 / 上传名片 / 选择活动）；除 `scan` 外三张的 CTA 渲染 `<span className="nw-import-cta nw-import-cta-soon" aria-disabled="true">即将开放</span>`（无接口不做假），`scan` 的 CTA `<button type="button" className="btn nw-import-cta">上传名片</button>` 点击滚动到下方工作区。
- 328–360 导入预览表 `importRows`：设计为 CSV 预览 mock，**替换为**名片 V2 入口（`BusinessCardIngestV2Start`）作为内容区，外框类 `nw-import-panel` 保留设计的卡片边框/圆角/内边距；`availability.available === false` 时渲染设计的说明卡样式，文案按 `availability.reason` 用既有 `ingest-v2-copy.ts` 的对应文案。
- 361–376 四条说明 `importNotes`（去重识别 / 文件格式 / 推荐字段 / 数据安全）原样。
- 377–391 导入记录 `importLog`：接既有批次列表（`batch2` 页面使用的读取组件/接口），表头 时间/方式/文件/总数/新增/合并 与设计一致；无记录显示 `nw-empty`「还没有导入记录」；行点击 → `?job=<id>` 展开该批次详情（复用 `batch2/[id]` 的 client 组件）。

- [ ] **Step 4: 把名片 V2 组件移出待删目录**

```bash
cd $WEB && mkdir -p "app/(app)/app/contacts/ingest-v2" && for f in business-card-ingest-v2-start.tsx ingest-v2-client.ts ingest-v2-content-transport.ts ingest-v2-copy.ts ingest-v2-private-image.tsx ingest-v2-route-view-model.ts ingest-v2-upload-feedback.ts; do git mv "app/(app)/app/contacts/new/batch2/$f" "app/(app)/app/contacts/ingest-v2/$f"; done && ls "app/(app)/app/contacts/new/batch2/[id]/" | grep -v page.tsx | while read f; do git mv "app/(app)/app/contacts/new/batch2/[id]/$f" "app/(app)/app/contacts/ingest-v2/$f"; done
```

再移 V1 批次视图（V2 视图 `business-card-ingest-v2-view.tsx:16` 依赖它）：`git mv "app/(app)/app/contacts/new/batch/[id]/business-card-batch-view.tsx" "app/(app)/app/contacts/ingest-v2/business-card-batch-view.tsx"`。

移动后目录深度变了，**每个被移文件内部的相对 import 都要重写**（`grep -n 'from "\.\.' app/(app)/app/contacts/ingest-v2/*` 逐条核对）：原 `new/batch2/` 文件的 `../../../orbit-language-context` → `../orbit-language-context`、`../../../../../../features/...` → `../../../../features/...`；原 `batch2/[id]/` 文件再少一级；`business-card-ingest-v2-view.tsx` 里 `../../batch/[id]/business-card-batch-view` → `./business-card-batch-view`。
然后 `grep -rn "new/batch2/\|new/batch/" app tests | grep -v "/page.tsx"` 逐处把外部引用改到 `contacts/ingest-v2/`：`contacts/business-card-batch-entry.tsx`、`tests/pages/ingest-v2-*.test.*`、`app-business-card-ingest-v2-*.test.tsx`、`tests/pages/app-business-card-batch-view.test.tsx:11,296`、`tests/pages/business-card-batch-request-control.test.ts:9`、`tests/audits/full-product-functional-audit.test.ts` 里的路径字符串；两个 `page.tsx` 暂留（任务 7 删），改成 import 新位置。`NetworkImport` 的记录区与 `?job=` 详情用移动后的组件。
跑 `npm run typecheck` 确认零新增错误后再进下一步。

- [ ] **Step 5: 换页面渲染** — `new/page.tsx`：读 `searchParams.method|job`，`OrbitRealCardsImport` → `NetworkImport`，加 `<AccountTopNav active="cards" />`。

- [ ] **Step 5b: 改写 `tests/pages/app-contacts-new-live-route-services.test.ts`**

该测试（14–37 行）断言页面源码含 `OrbitRealCardsImport`、`businessCardAvailability=`，且**不含** `searchParams`，并读取 `orbit-real-cards-import.tsx`。改为：断言源码含 `NetworkImport` 与 `resolveBusinessCardCaptureAvailability`、不含任何预检服务调用（保留原有「不触发 live 服务」的断言意图），删除 `searchParams` 禁止项与对旧组件文件的读取。

- [ ] **Step 6: 测试 + typecheck + ratchet + 名片测试**

Run: `cd $WEB && node --test --import tsx tests/pages/app-network-import.test.tsx tests/pages/app-contacts-new-live-route-services.test.ts tests/pages/app-business-card-batch-view.test.tsx tests/pages/business-card-batch-request-control.test.ts $(ls tests/pages/*business-card* tests/pages/ingest-v2-* 2>/dev/null | tr '\n' ' ') tests/ui/orbit-button-ratchet.test.ts tests/ui/orbit-scale-ratchet.test.ts && npm run typecheck` → 全绿。

- [ ] **Step 7: 像素比对** — `--design-view import --app http://localhost:3100/app/contacts/new --out /tmp/network-import` → 四方式卡 + 说明 + 记录区 `≤ 0.03`（预览表区域被真实工作区替代，diff 只允许在该区域）。

- [ ] **Step 8: 提交 + 台账**

```bash
cd /Users/li/work/orbit-web-newui-batch0-20260918 && node .gitnexus/run.cjs detect-changes --scope all --repo . && git add -A "repos/orbits/app/(app)/app/contacts/" repos/orbits/tests && git commit -m "feat(network): replace /app/contacts/new with Orbit_0918 import screen (card V2 as scan method)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: 联系人详情弹窗 + 记录跟进弹窗（`/app/contacts/[id]`）

**Files:**
- Create: `$WEB/app/(app)/app/contacts/network-0918/network-detail-modal.tsx`
- Create: `$WEB/app/(app)/app/contacts/network-0918/network-follow-modal.tsx`
- Modify: `$WEB/app/(app)/app/contacts/network-0918/network-all.tsx`、`network-pipeline.tsx`、`network-overview.tsx`（行/卡点击改为开弹窗，URL 用 `history.pushState` 写 `/app/contacts/<id>`，关闭时 `history.back()` 或回到列表）
- Modify: `$WEB/app/(app)/app/contacts/[id]/page.tsx`（直链/刷新：渲染 `NetworkAll` + 打开的详情弹窗；`?capture=meeting-memo` / `?appointmentId=` 时在弹窗内追加既有 `AppointmentMemoCapture` / `OrbitAppointmentNegotiation`）
- Test: `$WEB/tests/pages/app-network-detail-modal.test.tsx`、`$WEB/tests/pages/app-network-follow-modal.test.tsx`

**Interfaces:**
- Consumes：详情数据**只**来自详情路由：`loadAppContactDetailRoute` + `contactDetailPageViewModel(routeModel, language).connections[0]`（目录 `contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/`，名字就是这样截断的），它输出的 `OrbitContactView` 才有真实 `notes`（含 `createdAt`）、`editableTags`、`lastInteraction`、`relationshipStatus`（任务 1 新增）、`encounters[0].context.publicProfile.{topics,offering,seeking}`。**列表 VM 的 `notes`/`lastInteraction`/`valueTags` 是合成值，不能喂给弹窗**。写：`PATCH /api/contacts/<id>` body `{ note: { body, authorLabel: "我" }, status?, addTags?, removeTags?, lastInteraction: { channel: "manual_note", occurredAt, summary } }`（channel 合法值见 `features/contacts/live-detail-service.ts:70–72`：`event_note | manual_note | email_signal | calendar_signal | referral`；与 `contact-notes-editor.tsx` / `contact-tag-editor.tsx` / `contact-interaction-editor.tsx` 相同）。`existingTags` = `contact.editableTags?.map((t) => t.value) ?? []`。
- 打开方式：行/卡点击是**真实导航**到 `/app/contacts/<id>`（`<a href>`），由 `contacts/[id]/page.tsx` 在服务端渲染列表屏 + 已打开的弹窗；关闭 = 导航到 `closeHref`（`/app/contacts`）。不做 pushState 假路由。
- Produces：`export function NetworkDetailModal({ contact, closeHref, onFollow, extra }: { contact: OrbitContactView; closeHref: string; onFollow: () => void; extra?: ReactNode })`；`export function NetworkFollowModal({ contact, onClose, onSaved }: { contact: OrbitContactView; onClose: () => void; onSaved: () => void })`；`export function buildFollowPatch(input: { summary: string; need: string; offer: string; next: string; date: string; remind: string; stage: NetworkStage | ""; tags: string[]; existingTags: string[] }): { note: { body: string; authorLabel: "我" }; status?: "active" | "needs_follow_up" | "nurture" | "archived"; addTags?: string[]; removeTags?: string[]; lastInteraction: { channel: "manual_note"; occurredAt: string; summary: string } }`（纯函数，可测）。
- 阶段 → status：`explore`→`needs_follow_up`、`keep`→`nurture`、`advance`→`active`、`archived`→`archived`。
- 「同步到 AI 分析」开关：无接口 → 渲染为 `aria-disabled` 说明「分析会在下次生成时读取本次跟进」，不做假开关。

- [ ] **Step 1: 写失败测试（buildFollowPatch + 弹窗 SSR）**

```tsx
// $WEB/tests/pages/app-network-follow-modal.test.tsx
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NetworkFollowModal, buildFollowPatch } from "../../app/(app)/app/contacts/network-0918/network-follow-modal";

test("buildFollowPatch composes note body from the four fields and maps stage to status", () => {
  const patch = buildFollowPatch({ summary: "聊了合作", need: "需要案例", offer: "可给 demo", next: "下周发方案", date: "2026-09-25", remind: "2026-09-24", stage: "keep", tags: ["AI", "日本"], existingTags: ["AI", "旧"] });
  assert.equal(patch.status, "nurture");
  assert.deepEqual(patch.addTags, ["日本"]);
  assert.deepEqual(patch.removeTags, ["旧"]);
  assert.match(patch.note.body, /总结：聊了合作/);
  assert.match(patch.note.body, /下一步：下周发方案（2026-09-25）/);
  assert.match(patch.note.body, /提醒：2026-09-24/);
  assert.equal(patch.lastInteraction.occurredAt, "2026-09-25");
  assert.equal(buildFollowPatch({ summary: "x", need: "", offer: "", next: "", date: "", remind: "", stage: "", tags: [], existingTags: [] }).status, undefined);
});

test("follow modal renders the design form with save disabled until summary is filled", () => {
  const contact = { id: "c1", displayName: "田中惠子", initial: "田", company: "Nexa", title: "PM", valueTags: [], editableTags: [{ value: "ai", label: "AI" }], stage: "Active", relationshipStatus: "active", pipelineStatus: "in_progress" } as never;
  const html = renderToStaticMarkup(<NetworkFollowModal contact={contact} onClose={() => {}} onSaved={() => {}} />);
  assert.match(html, /记录跟进/);
  for (const label of ["本次沟通总结", "对方的需求", "我能提供", "下一步行动"]) assert.match(html, new RegExp(label));
  assert.match(html, /nw-fu-save"[^>]*disabled/);
  assert.equal((html.match(/nw-fu-stage/g) ?? []).length >= 4, true);
});
```

```tsx
// $WEB/tests/pages/app-network-detail-modal.test.tsx
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NetworkDetailModal } from "../../app/(app)/app/contacts/network-0918/network-detail-modal";

test("detail modal renders overview rows, timeline from notes, and next steps", () => {
  const contact = {
    id: "c1", displayName: "田中惠子", initial: "田", company: "Nexa AI", title: "合作伙伴负责人", industry: "科技与互联网", source: "event", stage: "Active", pipelineStatus: "in_progress", relationshipStatus: "active",
    lastInteraction: "昨天", nextAction: { text: "下周约产品演示", reason: "" }, valueTags: ["AI"], editableTags: [{ value: "ai", label: "AI" }], notes: [{ id: "n1", body: "讨论合作模式", createdAt: "2026-09-18T07:30:00Z" }],
    encounters: [{ id: "e", eventId: "", createdAt: "", context: { metAt: "", reason: "", score: 0, tableNo: 1, publicProfile: { bio: "", intro: "", industry: "", topics: ["生成式 AI"], offering: ["企业级 AI 知识库"], seeking: ["日本市场 AI 方案"], conversationPrompts: [] } } }],
  } as never;
  const html = renderToStaticMarkup(<NetworkDetailModal contact={contact} closeHref="/app/contacts" onFollow={() => {}} />);
  assert.match(html, /role="dialog"/);
  assert.match(html, /Nexa AI · 合作伙伴负责人/);
  for (const s of ["关系阶段", "上次互动", "来源", "生成式 AI", "企业级 AI 知识库", "日本市场 AI 方案", "讨论合作模式"]) assert.match(html, new RegExp(s));
  assert.match(html, /记录跟进/);
  assert.doesNotMatch(html, /平均 2–3 周一次|东京 AI 峰会/);
});
```

- [ ] **Step 2: 跑两个测试确认失败**。

- [ ] **Step 3: 移植详情弹窗**

来源 `$DESIGN` 第 708–788 行。遮罩 `nw-overlay`（设计 710 行：`background:rgba(14,18,37,0.35); backdrop-filter:blur(6px); display:flex; align-items:flex-start; justify-content:center; padding:48px 24px; overflow-y:auto;` 其余声明照抄）、面板 `nw-modal`（设计 711 行：`max-width:1000px; border-radius:22px; box-shadow:0 30px 80px rgba(14,18,37,0.25); padding:28px 32px 24px; gap:22px` 其余照抄），`role="dialog" aria-modal="true"`，Esc 与遮罩点击 → `window.location.assign(closeHref)`。区块：
- 头部：头像 64（`nw-avatar-64`）、姓名、orgTitle、阶段 chip、关闭「×」（`<a className="btn nw-modal-close" href={closeHref}>`）。
- 概览五项 `selOverview`：关系阶段（真实 stage + `STAGE_STYLE.desc`）、联系频率（**无数据源 → 不渲染该行**）、上次互动（`lastInteraction`；空→「—」）、下次计划（`nextAction.text`；空→「—」）、来源（`SOURCE_LABEL` + `met`）。
- 话题 / 我能提供 / 对方需要 三组标签：`encounters[0]?.context.publicProfile.{topics, offering, seeking}`；空组渲染「—」。标签区（设计的 `sel.tags`）用 `editableTags.map(t => t.label)`。
- 时间线 `selTimeline`：`notes` 按 `createdAt` 倒序，`time` = 本地 `M月D日 HH:mm`，`kind` 固定「备注」，点色首条 `#4B4FC7` 其余 `#B9BCEB`。
- 下一步建议 `selSteps`：`nextAction.text` 一条 +（有）`nextAction.reason`；无 → 「—」。
- 底部两按钮：「记录跟进」（`.btn nw-detail-follow`）→ `onFollow`、「查看完整档案」→ 改为「关闭」（`<a className="btn nw-detail-close" href={closeHref}>`），弹窗即完整档案。
- `extra` 渲染在时间线上方（会后纪要 / 约谈核验附加态）。

- [ ] **Step 4: 移植记录跟进弹窗**

来源 `$DESIGN` 第 789–856 行：四个 textarea（总结/需求/提供/下一步）、日期 + 提醒两个 `<input type="date">`、阶段箭头四段（`fuStages`，`.btn nw-fu-stage`，选中 `#2E3270/#FFFFFF`）、标签 chips + 回车添加、「同步到 AI 分析」区（见接口说明，非交互）、底部「取消」「保存跟进记录」（`.btn nw-fu-save`，`summary.trim()` 为空时 `disabled` + `opacity:.5`）。保存：`fetch(\`/api/contacts/${encodeURIComponent(contact.id)}\`, { method: "PATCH", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildFollowPatch(form)) })`；非 2xx 显示 `role="alert"` 错误行不关闭；成功后显示设计的 toast「已保存跟进记录」1.2s 后 `onSaved()` → 调用方 `window.location.reload()`。

```ts
export function buildFollowPatch(input: { summary: string; need: string; offer: string; next: string; date: string; remind: string; stage: NetworkStage | ""; tags: string[]; existingTags: string[] }) {
  const lines = [`总结：${input.summary.trim()}`];
  if (input.need.trim()) lines.push(`对方需求：${input.need.trim()}`);
  if (input.offer.trim()) lines.push(`我能提供：${input.offer.trim()}`);
  if (input.next.trim()) lines.push(`下一步：${input.next.trim()}${input.date ? `（${input.date}）` : ""}`);
  if (input.remind) lines.push(`提醒：${input.remind}`);
  const statusByStage = { explore: "needs_follow_up", keep: "nurture", advance: "active", archived: "archived" } as const;
  const addTags = input.tags.filter((t) => !input.existingTags.includes(t));
  const removeTags = input.existingTags.filter((t) => !input.tags.includes(t));
  return {
    note: { body: lines.join("\n"), authorLabel: "我" as const },
    ...(input.stage ? { status: statusByStage[input.stage] } : {}),
    ...(addTags.length ? { addTags } : {}),
    ...(removeTags.length ? { removeTags } : {}),
    lastInteraction: { channel: "manual_note" as const, occurredAt: input.date || new Date().toISOString().slice(0, 10), summary: input.summary.trim() },
  };
}
```

- [ ] **Step 5: 接入三屏与详情路由**

- `network-all.tsx` / `network-pipeline.tsx` / `network-overview.tsx`：行、看板卡、最近联系人保持 `<a href={person.href}>`（任务 2/3/4 已如此），不加 pushState。
- `NetworkAll` 新增 props：`openDetail?: { contact: OrbitContactView; extra?: ReactNode; closeHref: string }`，有值时在 `<NetworkShell modal={…}>` 里渲染 `NetworkDetailModal`；点「记录跟进」切到 `NetworkFollowModal`（同一挂载点，本地 state）；保存成功 → `window.location.reload()`（让服务端重新读详情，避免本地假合并）。
- `contacts/[id]/page.tsx`：**保留**这些既有结构（`tests/pages/app-contact-detail-live-route-services.test.ts:589–616` 逐字断言源码）：`loadAppContactDetailRoute`、`const session = await auth()`、`capture === "meeting-memo"`、`AppointmentMemoCapture`、渲染组件上的 `key={\`${actor.id}:${contactId}\`}`。成功分支改为：`listVm = applyOrbitContactsPresentation(contactsRouteToOrbitContactsViewModel(listRoute), language)`（`listRoute = await loadAppContactsRouteViewModel({}, actor.id)`，其 state 非 success 时 `listVm = { connections: [], events: [], intros: [], pipelineStatuses: [] }`），`detail = contactDetailPageViewModel(routeModel, language).connections[0]`，渲染 `<NetworkAll key={\`${actor.id}:${contactId}\`} viewModel={listVm} openDetail={{ contact: detail, closeHref: "/app/contacts", extra }} />`，其中 `extra` = 原来 `memoQueryPresent` / `appointmentQueryPresent` 分支渲染的 `<AppointmentMemoCapture …/>` / `<OrbitAppointmentNegotiation …/>`（props 原样）。`routeState` 非 success 分支不变。加 `<AccountTopNav active="cards" />`。

- [ ] **Step 6: 测试 + typecheck + ratchet + 既有详情测试**

Run: `cd $WEB && node --test --import tsx tests/pages/app-network-detail-modal.test.tsx tests/pages/app-network-follow-modal.test.tsx tests/pages/app-network-all.test.tsx tests/pages/app-contact-detail-route-state-language.test.tsx tests/pages/app-contact-detail-live-route-services.test.ts tests/ui/orbit-button-ratchet.test.ts tests/ui/orbit-scale-ratchet.test.ts && npm run typecheck` → 全绿（`app-contact-detail-long-values` / `localized-source-labels` / `app-contact-notes.test.tsx` import 旧 `OrbitRealCardConnection`，任务 8 处理）。

- [ ] **Step 7: 像素比对**

详情：`--design-view all --design-click "text=田中惠子" --app http://localhost:3100/app/contacts --click ".nw-row" --out /tmp/network-detail` → `≤ 0.03`（设计侧 mock 人物文本区域除外）。记录跟进：给脚本各加一次点击（`--design-click2 "text=记录跟进" --click2 ".nw-detail-follow"`，任务 0 脚本按同样方式解析第二个 click 参数并顺序执行）→ `≤ 0.03`。

- [ ] **Step 8: 手工旅程（浏览器）**

登录 → `/app/contacts` → 点一行 → 弹窗 → 记录跟进 → 填总结、改阶段为「保持联系」→ 保存 → toast → 关闭 → 行 chip 变「保持联系」→ 刷新仍为「保持联系」（服务端已写）。截图存 `/tmp/network-follow-journey.png`。

- [ ] **Step 9: 提交 + 台账**

```bash
cd /Users/li/work/orbit-web-newui-batch0-20260918 && node .gitnexus/run.cjs impact "OrbitRealCardConnection" --direction upstream --repo . ; node .gitnexus/run.cjs detect-changes --scope all --repo . && git add "repos/orbits/app/(app)/app/contacts/" repos/orbits/tests/pages/app-network-detail-modal.test.tsx repos/orbits/tests/pages/app-network-follow-modal.test.tsx && git commit -m "feat(network): Orbit_0918 contact detail and follow-up modals; /app/contacts/[id] opens the modal over the list

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: 链接生成器改向 + 删除 6 个被取代的路由

**Files:**
- Modify: `$WEB/features/orbit-ai/live-command-service.ts:257` 与 `$WEB/features/orbit-ai/mock-service.ts` 4 处（104/156/665/674）`"/app/dashboard"` → `"/app/contacts/dashboard"`（mock-service 是 mock 模式回答，同样改，避免测试夹具指向 404）
- Modify: `$WEB/app/api/integrations/[provider]/callback/route.ts` 中 `/app/contacts/all-actions` → `/app/agent/actions`
- Modify: `$WEB/features/auth/app-auth-routing.ts` 白名单：删 `"/app/dashboard"`
- Delete: `$WEB/app/(app)/app/dashboard/`（整个目录，含 `orbit-real-dashboard.tsx`、`orbit-real-party.tsx` **除外**——`orbit-real-party.tsx` 被 `/app/party*` 引用，那三条路由属 Events live 屏计划，本任务不删；把 `orbit-real-party.tsx` 移到 `app/(app)/app/party/orbit-real-party.tsx` 并更新三处 import）
- Move first（`agent/actions/orbit-agent-actions.tsx` 仍 import 它们）：`contacts/all-actions/orbit-all-actions-controls.tsx`、`orbit-copy-draft-button.tsx`、`orbit-edit-draft-button.tsx`、`compose-app-all-actions-from-agent-ledger/` → `$WEB/app/(app)/app/agent/actions/`（`git mv`，然后 `grep -rn "contacts/all-actions" app tests` 逐处改 import；对应测试 `tests/pages/app-all-actions-*.test.ts` 改 import 路径后保留）
- Delete: `contacts/all-actions/`（剩余 `page.tsx`、`orbit-real-all-actions.tsx`）、`contacts/intros/`、`contacts/graph/`、`contacts/new/batch/`、`contacts/new/batch2/`（其中 `ingest-v2-*.ts(x)`、`business-card-ingest-v2-start.tsx`、`[id]/` 下的非 page 组件已在任务 5 移到 `contacts/ingest-v2/`，此处只剩两个 `page.tsx`）、`contacts/new/import/`
- Modify（app 内指向被删路由的链接，grep 已核实）：`app/(app)/app/today/orbit-real-today.tsx:286` 与 `app/(app)/app/agent/agent-action-status-card.tsx:669` 的 `/app/contacts/all-actions…` → `/app/agent/actions…`（保留 `?entry=`）；`contacts/business-card-batch-entry.tsx:31,69,172,193,219` 与 `contacts/business-card-import-progress.tsx:95,132` 的 `/app/contacts/new/batch/…`、`/new/batch2…`、`/new/import/…` → `/app/contacts/new?job=<id>`。
- Modify（测试硬编码路径）：`tests/ui/orbit-button-ratchet.test.ts` CORE_FILES（119–129）把 `contacts/all-actions/orbit-all-actions-controls.tsx` 改为 `agent/actions/orbit-all-actions-controls.tsx`，删除 `contacts/all-actions/orbit-real-all-actions.tsx` 条目及其 EXEMPTIONS；`tests/ui/orbit-scale-ratchet.test.ts` SNAPPED_FILES（151–160）同样改/删；`tests/capabilities/app-auth-routing.test.ts:18` 删掉「`/app/dashboard` 是私有路由」断言；`tests/capabilities/agent-actor-brief-boundaries.test.ts:314`、`tests/pages/core-product-ux-optimizations.test.ts:110,171`、`tests/ui/orbit-sidebar-width-constant.test.ts:67`、`tests/ui/orbit-top-nav-structure.test.ts:174`、`tests/ui/orbit-p2-gates.test.ts:72`（读 `dashboard/page.tsx`）逐处改到新路径或删除该断言；`tests/pages/app-party-live-route-services.test.ts:104,121,135,267`、`tests/pages/app-party-participant-ui.test.tsx:13`、`tests/pages/orbit-hybrid-route-view-models.test.ts:264`、`tests/ui/orbit-modal-standard.test.ts:27` 的 `dashboard/orbit-real-party` → `party/orbit-real-party`。
- Modify（审计清单）：`tests/audits/product-surface-manifest.test.ts:27–31,180` 与 `tests/audits/full-product-functional-audit.test.ts:396,648–649,1055,1258,1266–1267` 硬编码了 `/app/dashboard`、`all-actions`、`graph`、`intros`、`batch2`、`import/[id]` 表面——把这些条目从清单移除（不是加豁免），使审计失败集不超过基线。
- Delete tests: `tests/pages/app-dashboard-live-route-services.test.ts`、`tests/pages/app-agent-execution-settings.test.tsx`、`tests/pages/app-all-actions-audit-detail.test.tsx`（两者 import 被删的 `OrbitRealAllActions`；若其中有对 `OrbitAllActionsControls` 行为的断言，抽到 `tests/pages/app-agent-actions-controls.test.tsx` 保留）、`tests/pages/app-contacts-subroutes-live-route-services.test.ts` 中 intros/graph/all-actions 用例（保留 pipeline/dashboard 用例）、`tests/pages/app-all-actions-route-view-model.test.ts` 随 VM 移动改 import 后保留、batch/batch2/import 页面级测试（`ls tests/pages | grep -iE "batch|cards-import|import-center"`，组件级 ingest-v2/batch-view 测试已在任务 5 改路径后保留）。
- Test: `$WEB/tests/pages/app-network-route-retirement.test.ts`

- [ ] **Step 1: 写失败测试（路由消失 + 生成器改向）**

```ts
// $WEB/tests/pages/app-network-route-retirement.test.ts
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { join } from "node:path";

const root = join(process.cwd());
const gone = ["app/(app)/app/dashboard/page.tsx", "app/(app)/app/contacts/all-actions/page.tsx", "app/(app)/app/contacts/intros/page.tsx", "app/(app)/app/contacts/graph/page.tsx", "app/(app)/app/contacts/new/batch/[id]/page.tsx", "app/(app)/app/contacts/new/batch2/page.tsx", "app/(app)/app/contacts/new/batch2/[id]/page.tsx", "app/(app)/app/contacts/new/import/[id]/page.tsx"];

test("retired network routes no longer exist", () => {
  for (const p of gone) assert.equal(existsSync(join(root, p)), false, `${p} should be deleted`);
});

test("no server-side link generator points at a retired route", () => {
  const files = ["features/orbit-ai/live-command-service.ts", "app/api/integrations/[provider]/callback/route.ts", "features/auth/app-auth-routing.ts"];
  for (const f of files) {
    const text = readFileSync(join(root, f), "utf8");
    assert.doesNotMatch(text, /"\/app\/dashboard"|\/app\/contacts\/all-actions|\/app\/contacts\/intros|\/app\/contacts\/graph|contacts\/new\/batch/);
  }
});
```

- [ ] **Step 2: 跑测试确认失败**（路由仍存在）。

- [ ] **Step 3: impact 检查后改生成器**

Run: `cd /Users/li/work/orbit-web-newui-batch0-20260918 && node .gitnexus/run.cjs impact "buildLiveCommandResponse" --direction upstream --repo .`（符号名以 `live-command-service.ts:257` 所在函数为准；UNKNOWN → `grep -rn` 确认调用方）。然后逐处把字面量改为新目标；`app-auth-routing.ts` 删 `"/app/dashboard"` 一行（其余 today/chat/party/followups/schedule/home 在各自计划删）。

- [ ] **Step 4: 移动 party 组件、删除目录与测试**

```bash
cd $WEB && git mv "app/(app)/app/dashboard/orbit-real-party.tsx" "app/(app)/app/party/orbit-real-party.tsx" && grep -rln "dashboard/orbit-real-party" app tests | xargs sed -i '' 's#\.\./\.\./dashboard/orbit-real-party#\.\./orbit-real-party#; s#\.\./dashboard/orbit-real-party#./orbit-real-party#; s#dashboard/orbit-real-party#party/orbit-real-party#' && git rm -r "app/(app)/app/dashboard" "app/(app)/app/contacts/all-actions" "app/(app)/app/contacts/intros" "app/(app)/app/contacts/graph" "app/(app)/app/contacts/new/batch" "app/(app)/app/contacts/new/batch2" "app/(app)/app/contacts/new/import"
```

`sed` 顺序必须先替换 `../../` 再替换 `../`（否则前者被后者截断）；之后 `grep -rn "orbit-real-party" app tests` 确认：`party/page.tsx` 为 `./orbit-real-party`，`party/checkin/page.tsx`、`party/graph/page.tsx` 为 `../orbit-real-party`，tests 里为 `…/party/orbit-real-party`。若 `all-actions` 目录里的 `all-actions-route-view-model.ts` 被 `agent/actions/actions-route-view-model.ts` import：先 `git mv` 到 `agent/actions/` 并改 import，再删目录。
删除测试：`git rm` 上面列出的文件；`app-contacts-subroutes-live-route-services.test.ts` 用编辑器删掉 intros/graph/all-actions 三段 `test(...)`。

- [ ] **Step 5: 全量 typecheck + 相关测试**

Run: `cd $WEB && npm run typecheck && node --test --import tsx tests/pages/app-network-route-retirement.test.ts tests/pages/app-contacts-subroutes-live-route-services.test.ts tests/pages/app-agent-actions-route-view-model.test.ts tests/pages/app-all-actions-route-view-model.test.ts tests/capabilities/app-auth-routing.test.ts tests/pages/app-party-live-route-services.test.ts tests/pages/app-party-participant-ui.test.tsx tests/ui/*.test.ts tests/audits/full-product-functional-audit.test.ts tests/audits/product-surface-manifest.test.ts 2>&1 | tail -30`
Expected: typecheck 无新增错误；retirement 2/2 绿；ui 全绿；audits 失败集 ⊆ 基线（`product-surface-manifest` 当前基线 52 过 1 败，不得新增；若路由计数 ratchet 因删路由需要下调上限，按测试内注释下调并在提交信息写明）。

- [ ] **Step 6: 浏览器确认**：访问 `/app/dashboard`、`/app/contacts/all-actions`、`/app/contacts/intros`、`/app/contacts/graph`、`/app/contacts/new/batch2` 均返回 Next 404 页；`/app/party` 仍可打开。

- [ ] **Step 7: 提交 + 台账**

```bash
cd /Users/li/work/orbit-web-newui-batch0-20260918 && node .gitnexus/run.cjs detect-changes --scope all --repo . && git add -A repos/orbits/app repos/orbits/features repos/orbits/tests && git commit -m "refactor(routes): retire dashboard, all-actions, intros, graph and card-import sub-routes replaced by Orbit_0918 network screens

Link generators retargeted: live-command-service and integrations callback.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: 删除旧人脉组件与其测试

**Files:**
- Delete: `$WEB/app/(app)/app/contacts/orbit-real-contacts.tsx`、`orbit-real-cards-pipeline-view.tsx`、`orbit-real-cards-import.tsx`、`orbit-real-card-connection.tsx`、`contacts/analysis/contacts-analysis-workspace.tsx`
- Delete tests: `tests/pages/app-contact-detail-long-values.test.tsx`、`app-contact-detail-localized-source-labels.test.tsx`、`app-contacts-analysis-content.test.tsx`、`app-contacts-archived-status.test.tsx`、`app-contacts-list-filtering.test.ts`、`app-contacts-primary-industry.test.tsx`、`app-contacts-progress-terminology.test.tsx`（先 `grep -l "orbit-real-contacts\|orbit-real-card-connection\|orbit-real-cards-\|contacts-analysis-workspace" tests -r` 得到完整清单，凡 import 被删组件的测试都删；凡断言的是**行为**（如归档状态映射、行业标签）则改写成对 `network-model.ts` / 新组件的等价断言后保留）
- Modify: `orbit-reference-styles.tsx` **不动**（其中 `nc-*` 旧人脉规则留待壳提取计划统一清理）。

- [ ] **Step 1: 列出引用**

Run: `cd $WEB && grep -rln "orbit-real-contacts\|orbit-real-card-connection\|orbit-real-cards-pipeline-view\|orbit-real-cards-import\|contacts-analysis-workspace" app features shared tests`（模式后不要加引号，否则漏掉按路径字符串读源码的测试）
Expected: 只剩 tests 与被删文件自身。已知必在清单里的：`tests/pages/app-contacts-subroutes-live-route-services.test.ts:104`、`app-contact-detail-live-route-services.test.ts:616`（读 `orbit-real-card-connection.tsx`，改为读 `network-0918/network-detail-modal.tsx`）、`app-contact-notes.test.tsx:7`（改为对 `NetworkDetailModal` 的等价断言）、`tests/ui/orbit-button-ratchet.test.ts` CORE_FILES + 8 条 `contacts/orbit-real-contacts.tsx` EXEMPTIONS（139–176）与「EXEMPTIONS 同步」测试、`tests/ui/orbit-scale-ratchet.test.ts` SNAPPED_FILES——这两处**删除条目**，否则 `readFileSync` ENOENT 会让整个测试文件报错而不是超上限；若 `app/` 下仍有引用（如 `orbit-real-contacts.tsx` 里的 `SourceBadge`/`Basis`/`filterConnections` 被别处 import），把该导出移到 `network-model.ts`（纯函数）或新文件 `contacts/network-0918/network-legacy-helpers.tsx`，更新 import。

- [ ] **Step 2: 逐个测试处理**

对清单中每个测试：打开，判断断言对象——纯 UI 结构 → `git rm`；行为断言 → 改写到新实现（例：`app-contacts-archived-status.test.tsx` 改为断言 `stageOf({pipelineStatus:"archived",stage:"archived"}) === "archived"` 且 `NetworkAll` SSR 输出含「已归档」chip），文件名改为 `app-network-*.test.tsx`。

- [ ] **Step 3: 删组件**

```bash
cd $WEB && git rm "app/(app)/app/contacts/orbit-real-contacts.tsx" "app/(app)/app/contacts/orbit-real-cards-pipeline-view.tsx" "app/(app)/app/contacts/orbit-real-cards-import.tsx" "app/(app)/app/contacts/orbit-real-card-connection.tsx" "app/(app)/app/contacts/analysis/contacts-analysis-workspace.tsx"
```

- [ ] **Step 4: 全量验证**

Run: `cd $WEB && npm run typecheck && node --test --import tsx $(ls tests/pages/app-network-*.test.ts tests/pages/app-network-*.test.tsx tests/pages/app-contact*.test.ts tests/pages/app-contact*.test.tsx 2>/dev/null | tr '\n' ' ') tests/ui/*.test.ts 2>&1 | tail -20`
Expected: 除文档化基线外全绿；ratchet 若因删除旧按钮使非 `.btn` 计数下降，把 `tests/ui/orbit-button-ratchet.test.ts` 的 `CEILING` 与 scale ratchet 三个 `CEILING` **下调到新实际值**（ratchet 是棘轮，只降不升），提交信息写明新值。

- [ ] **Step 5: 提交 + 台账**

```bash
cd /Users/li/work/orbit-web-newui-batch0-20260918 && node .gitnexus/run.cjs detect-changes --scope all --repo . && git add -A repos/orbits/app repos/orbits/tests && git commit -m "refactor(network): delete legacy orbit-real contact views replaced by Orbit_0918 screens; lower ratchet ceilings

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: 全域回归 + 台账收口

**Files:**
- Modify: `docs/development/2026-09-17-web/EXECUTION.md`、`ROUTE-CONSOLIDATION.md`（把本计划已删的 6 路由标「已删（<sha>）」）

- [ ] **Step 1: 定向大组回归**

Run（cwd `$WEB`）：`node --test --import tsx --test-timeout=120000 $(ls tests/pages/*.test.ts tests/pages/*.test.tsx | grep -vE "event-registration-readback|app-event-registration-guide|app-register-live|app-registered-event-lifecycle|portrait-browser" | tr '\n' ' ') 2>&1 | tail -15`
Expected: 失败仅剩 `app-agent-contact-recommendations` 1 条 + `app-events-live-route-services` agenda clocks 1 条。其他任何失败 → 修到绿再继续。

- [ ] **Step 2: ui + audits**

Run: `node --test --import tsx tests/ui/*.test.ts tests/audits/*.test.ts 2>&1 | tail -12`
Expected: ui 全绿；audits 失败集 ⊆ 基线 13 条（路由删除后可能减少，不能新增）。

- [ ] **Step 3: 四屏 + 两弹窗像素终验**

依次跑任务 2/3/4/5/6 的比对命令，把六个 `mismatch=` 值记入台账。

- [ ] **Step 4: 台账与归并表更新，提交**

```bash
cd /Users/li/work/orbit-web-newui-batch0-20260918 && node .gitnexus/run.cjs detect-changes --scope all --repo . && git add docs/development/2026-09-17-web && git commit -m "docs(network): record Orbit_0918 network replacement completion, pixel results and retired routes

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## 后续计划（不在本文件内）

按 `NEW-UI-DECISION.md` 顺序：② 个人中心（profile/persona/settings + onboarding 门禁提示）→ ③ Events 参与者侧（host / live 取代 party* / 弹窗）→ ④ 运营台 7 屏 → ⑤ 认证四态弹窗 → ⑥ iOrbit chat。每份计划沿用本文件的「像素级一致规则」「像素比对工具」与任务模板。

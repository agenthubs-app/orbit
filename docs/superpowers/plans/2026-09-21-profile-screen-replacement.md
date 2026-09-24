# 个人中心 屏级替换 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 `个人中心.dc.html` 设计稿 1:1 重建个人中心 4 张屏（个人资料 / 编辑商务画像 / iOrbit 设置 / 连接），补一张设计稿没有的「编辑基础资料」屏承载 onboarding 必填字段与已批准的门禁提示，接既有 `/api/profile` 读写（CAS + 回读核验）逻辑零改动，最后删除 `orbit-real-profile.tsx`。

**Architecture:** 先把 `OrbitRealProfile` 里的会话逻辑（加载 / 脏字段 / 保存 basic·matching / 回读核验 / 合并草稿 / 冲突重载 / 文本提取）**原样**抽成 hook `useProfileEditorSession`，用既有 profile 测试守住；再按设计稿逐屏建 `profile-0918/*` client 组件消费这个 hook；`/app/profile` 与 `/app/settings` 的 `page.tsx` 只换渲染组件；旧文件在路由切换后删除。像素规则、`.btn` 中和、比对工具、门槛口径全部沿用 Network 计划（`docs/superpowers/plans/2026-09-21-network-screen-replacement.md` Global Constraints 与 EXECUTION.md 记录的口径）。

**Tech Stack:** Next.js 16 App Router、React 19、node:test + tsx、playwright、GitNexus CLI、`scripts/visual/compare-0918.mjs`。

## Global Constraints

- 工作树 `/Users/li/work/orbit-web-newui-batch0-20260918`（`$WEB` = `repos/orbits`），分支 `newui/batch-0-shell-landing`，所有命令绝对路径；设计稿 `$DESIGN` = `/Users/li/work/orbit/docs/designs/Orbit_0918/个人中心.dc.html`（428 行，明文 x-dc；行号以 2026-09-21 版本为准）。
- **像素级一致规则**与 Network 计划完全相同（元素 1:1；每个静态 style → 一个 `pc-*` 类，前缀 `[data-orbit-real-page="profile-0918"] `，声明顺序与值不变；动态色内联且内联对象禁止 `fontSize`/`fontWeight`/`gap` 数值；`style-hover` → `:hover` 只写设计声明；每个 `<button>` 带 `btn pc-*`，`.btn.pc-*` 在设计声明后整段中和基类（height/display/align-items/justify-content/gap/white-space/text-align/letter-spacing/line-height/transition）+ `:active{transform:none}`；选中/动态态用修饰类而非内联色；设计 mock 数字与文案不得出现；头像 = 首字母圆形占位）。
- **页面接线**：`page.tsx` 成功分支包裹 div 加 `data-orbit-real-page="profile-0918"`，内依次 `<AccountTopNav active="me" />`（设置页 `active="settings"`）与新屏；`OrbitReferenceStyles` 仍渲染（顶栏 + `.btn` 基类），**`orbit-reference-styles.tsx` 冻结不改**。根容器（设计 43 行 `<main>`）：`max-width:1240px; margin:0 auto; padding:14px 40px 72px; display:flex; flex-direction:column; gap:22px;`（与 Network 不同，已核对）。
- **像素门槛**：raw `mismatch ≤ 0.02`，或框级归因后非数据残差 ≤ 0.005 且无布局线/圆角/间距/色块差异；已知共享残差：顶栏 +2px；设计 `<button>` 未继承字号处按渲染结果对齐。每屏比对：`node scripts/visual/compare-0918.mjs --design "http://localhost:3320/Orbit_0918/%E4%B8%AA%E4%BA%BA%E4%B8%AD%E5%BF%83.dc.html" --design-view <profile|persona|settings|connect> --app <url> --login "qa@orbit.test:<pw>" --out /tmp/profile-<view>`。**任务 0 先给比对脚本加 `--design-view` 对 个人中心 的映射**（设计页签文案：个人资料 / iOrbit 设置 / 连接；persona 视图靠点「编辑商务画像」按钮进入，用 `--design-click "text=编辑商务画像"`）。
- **数据真实性**：`OrbitProfileEditorView` 可用字段 = `fullName, title, company, headline, bio, industry, primaryIndustryId, secondaryIndustryId, intro(=relationshipGoal), email, lineId, wechatName, handles{email,phone,wechatId,lineId,website,linkedinUrl,xHandle}, offering[], seeking[], topics[], birthDate, onboarding{status,missingFields}, hasPersistedProfile`。没有的东西不做假：
  - 设计「资料完整度 82%」→ 客户端派生：10 项（姓名/一级行业/二级行业/生日/职位/公司/一句话介绍/我能提供/我在寻找/想聊的话题）已填比例，四舍五入百分比；派生口径写在 `profile-model.ts` 注释与台账。
  - 设计「我的目标」多标签 → 真实字段只有单文本 `intro`（relationshipGoal），且 **hook 没有 `intro`/`headline` 的保存通道**（`ProfileEditorField` 不含它们，`profileEditorUpdateInput` 不发 `relationshipGoal`/`headline`，测试 `app-profile-onboarding-editor.test.tsx:141-142` 反向断言）：个人资料卡与画像编辑里「我的目标」都只做**只读**展示（有值 → 一个 chip；无值 → 「未设置」），基础资料屏的「一句话介绍」(`headline`) 也只读展示；不加输入框、不扩 hook（记偏差）。词汇：`bio` = 「关于我」（设置屏）/ 旧校验文案里的「一句话介绍」指的也是 `bio`，实现者统一用「关于我」。
  - 联系方式「可见范围」列：所有 handle 都不进公开资料（`publicProfile` 不含 handles）→ 一律显示「仅自己可见」；为空的 handle 不渲染行；四行以外的 handle（phone/website/linkedin/x）按同样式追加行。**可编辑的 handle 只有 WeChat 与 LINE**（hook 的 `update` 只把这两个标记为脏，`profileEditorHandlesWithVisibleDraft` 只重写这两个），Email 只读显示，其余 handle 在基础资料屏只读展示——与旧 `EditSections` 538–542 行一致。
  - 「资料建议」三条 = 真实条件：基础资料未完成（`onboarding.status !== "complete"`）→ 跳基础资料编辑；任一画像组为空 → 跳画像编辑；连接数 0 → 跳连接。条件不成立的行不渲染；三条都不成立渲染 `pc-empty`「资料很完整，暂无建议」。
  - 连接：四张卡全部「即将开放」非交互（既有决定），已连接 0 / 未连接 4 为真实计数。
  - iOrbit 设置「关于我」= `bio`（basic scope，`BIO_VISIBLE_LIMIT` 80 可见字符校验沿用 `validateProfileSaveDraft`）；设计的「关于我」摘要卡文案 = bio 前 62 字 + …（设计 `aboutShort`）。**既有设置面板**（外观 / 记忆 / 反馈 / 自动化 / 执行）不能丢：在设计的三张卡之后，以 `pc-card` 外框逐个挂载 `orbit-settings-content.tsx` 里的组件（偏差记台账）。
  - 「预览公开资料」= 既有 `BusinessCardPreview`（星空名片）在设计 **140–148 行**「公开预览」卡位置渲染真实预览；141 行「查看完整预览」与 84 行「预览公开资料」都滚动到该卡；设计的 `flashPreview` toast 不做。
  - 设计里的地点文案（76 行「◎ 东京」、144 行「… · 东京」、183 行「Tokyo, Japan」）没有数据源（`OrbitProfileView` 无 location/homeMarket）→ 这些 span 省略，不写死城市。
  - 按钮映射（以设计为准）：84 行「编辑资料」= `goPersona` → `?view=persona`；91 行「编辑基础资料」、122 行 联系信息「编辑」、135 行 资料建议第一条 = `flashEdit`（mock「编辑面板即将开放」）→ 真实「编辑基础资料」屏 `?view=basic`。设计 90–101 行的「基础资料」卡（姓名/Headline/公司/职位/主行业/次行业/简介 网格）**必须移植**，全部有真实字段。
- **Onboarding 门禁提示（已批准）**：`?onboarding=1` 且 `onboarding.status !== "complete"` → 标题下方横幅「完成基础资料后才能进入 iOrbit、活动、人脉。还需填写：<缺项>」+「去填写」按钮 → 直接落在基础资料编辑屏；四个必填字段标签带「必填」标记；保存基础资料后仍不完整 → 琥珀色提示「基础资料已保存，但还需填写：<缺项>。填完后才能进入其他页面。」（不显示绿色成功）；完整且有 `onboardingNext` → 沿用 hook 的自动跳转。
- **hook 抽取零行为变化**：`useProfileEditorSession` 的实现 = `orbit-real-profile.tsx` **第 936–1329 行**原样搬移，**去掉** 953 行（`const [tab, setTab]`，页签属 JSX）与 1033 行（`subText`），**加上** 1336 行（`matchingDirty`）；1330–1371 行（`onSubmit`、`extractProps`、`onLimitReached`、`editProps`、`alert` JSX、`completeness`、`tabMeta`）留在组件里。hook 必须导出 `notify(kind, text)`（= `setMessageKind`+`setMessage`，`onLimitReached` 与 `ChipGroup` 的 5 项上限提示依赖它）。唯一允许的逻辑改动是「保存后仍不完整的提示」（上一条）。**Task 1 Step 5 会修改 `orbit-real-profile.tsx` 让它调用 hook**——这是对「旧 `orbit-real-*` 不再修改」规则的**明确例外**（目的：用既有渲染测试证明抽取零变化），记入 EXECUTION.md。既有测试 `tests/pages/app-profile-onboarding-editor.test.tsx`、`app-profile-editor-failure-paths.test.tsx`、`app-profile-live-route-services.test.ts`、`profile-onboarding-access.test.ts`、`app-profile-onboarding-navigation.test.ts`、`app-profile-save-model.test.ts` 必须持续通过（渲染旧组件的用例在旧组件删除任务里改指新屏，断言意图不变）。
- 路由：`/app/profile`（view=profile）、`/app/profile?view=basic|persona|connect`、`/app/settings`（settings 屏，同壳同页签）；`?onboarding=1&next=` 语义不变；`/app/profile/continue` 不动。设计页签：个人资料（profile/persona/basic 时高亮）/ iOrbit 设置 / 连接。
- 语言：`useOrbitLanguage().t({en, zh})`；设计只有中文，en 由实现者补。
- 流程：编辑既有导出符号前 `node .gitnexus/run.cjs impact "<symbol>" --direction upstream --repo .`（UNKNOWN → grep 确认）；提交前 `node .gitnexus/run.cjs detect-changes --scope all --repo .`；每任务 `npm run typecheck` 0 错误、`tests/ui/orbit-button-ratchet.test.ts` + `orbit-scale-ratchet.test.ts` 绿、本任务测试绿、像素达标；提交信息结尾 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`；每任务在 `docs/development/2026-09-17-web/EXECUTION.md` 追加 `- **个人中心 任务 N 完成** \`<sha>\`：…`。永不 `--amend`/`git stash`。
- 基线自带失败（不修）：同 Network 计划所列。

---

## 文件结构

**新建 `$WEB/app/(app)/app/profile/profile-0918/`**

| 文件 | 职责 |
| --- | --- |
| `use-profile-editor-session.ts` | 会话 hook（原样抽自 `OrbitRealProfile`）：状态、加载、`update/updateBirthDate/updateIndustry/toggleTag`、`saveProfile(scope)`、`reloadLatestProfile`、文本提取、消息 |
| `profile-model.ts` | 纯函数：完整度派生、画像四组映射、联系方式行、资料建议条件、缺项标签 |
| `profile-shell.tsx` | 面包屑 / 标题 / 副标 / 保存栏 / 三页签 / onboarding 横幅 / `PROFILE_STYLES`（全部 `pc-*`）/ toast |
| `profile-overview.tsx` | 个人资料屏（design 67–152） |
| `profile-persona.tsx` | 编辑商务画像（design 154–207） |
| `profile-basic.tsx` | 编辑基础资料（设计无；用画像编辑的表单语言：卡片/标签/输入声明复用 `pc-*`） |
| `profile-settings.tsx` | iOrbit 设置（design 209–242）+ 既有设置面板 |
| `profile-connect.tsx` | 连接（design 244–280） |
| `business-card-preview.tsx` | 从 `orbit-real-profile.tsx` 原样搬出的 `BusinessCardPreview`（星空名片） |

**修改**：`profile/page.tsx`、`settings/page.tsx`（只换渲染组件）；`scripts/visual/compare-0918.mjs`（加 个人中心 页签映射）。

**删除（任务 6）**：`profile/orbit-real-profile.tsx`、`settings/page.tsx` 里对旧内容的直接挂载（内容组件保留，由 `profile-settings.tsx` 挂）。

---

### Task 0: 比对脚本支持 个人中心 视图

**Files:** Modify `$WEB/scripts/visual/compare-0918.mjs`、`$WEB/scripts/visual/README.md`

- [ ] **Step 1**: `viewLabel` 映射改为「按设计文件选表」：Network 表保持（含其默认「概览」）；新增 profile 表 `{ profile: "个人资料", settings: "iOrbit 设置", connect: "连接" }`，profile 表**无 `--design-view` 时不点击**；`persona` 不点页签而是 `--design-click "text=编辑商务画像"`（README 写明）。判定用 `--design` URL 是否含 `%E4%B8%AA%E4%BA%BA%E4%B8%AD%E5%BF%83` 或传 `--design-table profile`。页签点击用 `getByRole("button", { name, exact: true })`（设计里「连接」页签与四张卡的按钮同名）。
- [ ] **Step 2**: 冒烟 `--design-view profile --app http://localhost:3100/app/profile --login … --out /tmp/profile-smoke` 出三张 PNG。
- [ ] **Step 3**: 提交 `chore(visual): compare-0918 supports 个人中心 design views`。

---

### Task 1: 抽取 `useProfileEditorSession`（零行为变化）+ `profile-model.ts`

**Files:**
- Create: `$WEB/app/(app)/app/profile/profile-0918/use-profile-editor-session.ts`
- Create: `$WEB/app/(app)/app/profile/profile-0918/profile-model.ts`
- Modify: `$WEB/app/(app)/app/profile/orbit-real-profile.tsx`（`OrbitRealProfile` 改为调用 hook，JSX 不变——这是「抽取而非重写」的证明步骤）
- Test: `$WEB/tests/pages/app-profile-model.test.ts`；既有六个 profile 测试全绿

**Interfaces（Produces）:**

```ts
// use-profile-editor-session.ts
export interface ProfileEditorSession {
  profile: OrbitProfileEditorView; dirtyFields: Set<ProfileEditorField>; matchingDirty: boolean;
  editorDisabled: boolean; industryReady: boolean; setIndustryReady: (v: boolean) => void;
  saving: boolean; matchingSaving: boolean; reloading: boolean; requiresReconcile: boolean; extracting: boolean;
  message: string; messageKind: "error" | "info" | "success" | "warning";   // warning = 保存后仍不完整（新增）
  notify(kind: "error" | "info" | "success" | "warning", text: string): void;
  method: "text" | "manual"; setMethod: (m: "text" | "manual") => void; extractText: string; setExtractText: (v: string) => void;
  update<K extends keyof OrbitProfileView>(field: K, value: OrbitProfileView[K]): void;
  updateBirthDate(value: string): void; updateIndustry(sel: IndustrySelectionContract): void; toggleTag(field: "offering"|"seeking"|"topics", tag: string): void;
  saveProfile(scope: ProfileEditorSaveScope): Promise<void>; reloadLatestProfile(): Promise<void>; onTextExtract(): Promise<void>;
  onboardingNext?: string;
}
export function useProfileEditorSession(input: { viewModel: OrbitProfileEditorViewModel; onboardingNext?: string; t: ReturnType<typeof useOrbitLanguage>["t"] }): ProfileEditorSession;
// profile-model.ts
export const ONBOARDING_FIELD_LABEL: Record<ProfileOnboardingFieldCode, { zh: string; en: string }>;
export function missingFieldLabels(onboarding: ProfileOnboardingContract, language: "zh" | "en"): string[];
export function completeness(p: OrbitProfileEditorView): { score: number; filled: number; total: number };
export interface PersonaGroup { key: "goal"|"offer"|"seek"|"topic"; icon: string; title: {zh;en}; hint: {zh;en}; placeholder: {zh;en}; values: string[] }
export function personaGroups(p: OrbitProfileEditorView): PersonaGroup[]; // goal.values = intro ? [intro] : []
export interface ContactRow { icon: string; label: string; value: string }
export function contactRows(p: OrbitProfileEditorView): ContactRow[]; // 非空 handles，顺序 email/linkedin/line/wechat/phone/website/x
export type SuggestionKey = "basic" | "persona" | "connect";
export function suggestions(p: OrbitProfileEditorView, connectedCount: number): SuggestionKey[];
```

- [ ] **Step 1: 写失败测试** `app-profile-model.test.ts`：`completeness` 全空 → 0/10、全填 → 100；`personaGroups` goal 单 chip；`contactRows` 过滤空值与顺序；`suggestions` 三种条件；`missingFieldLabels` zh/en。
- [ ] **Step 2: 跑测试确认失败**。
- [ ] **Step 3: 写 `profile-model.ts`**（纯函数，完整代码由实现者按接口写；完整度 10 项清单写在注释）。
- [ ] **Step 4: 抽 hook**：新建 `use-profile-editor-session.ts`，把 `orbit-real-profile.tsx` 936–1372 行（`const { t } = useOrbitLanguage();` 之后到 `const editProps = {` 之前）搬进 hook 主体，`t` 改由参数传入；返回接口所列字段。**新增的唯一逻辑**：`saveProfile("basic")` 成功但 `readback.data.onboarding.status !== "complete"` 时 `setMessageKind("warning")` + 文案「基础资料已保存，但还需填写：{缺项}。填完后才能进入其他页面。」（en 同义），不跳转；其余分支原样。
- [ ] **Step 5: `OrbitRealProfile` 改用 hook**：删除搬走的行，`const s = useProfileEditorSession({ viewModel: initialView, onboardingNext, t })`，原变量名用解构保持 JSX 不动（`const { profile, dirtyFields, … } = s`）；`messageKind === "warning"` 在旧 alert 里按 `#FBF1DC/#8A6420` 渲染。
- [ ] **Step 6: 跑既有 profile 测试 + 新模型测试 + typecheck + ratchet** → 全绿。已知需改的源码断言：`tests/pages/app-profile-live-route-services.test.ts:201-216` 读 `orbit-real-profile.tsx` 断言 `fetch("/api/profile"`、`method: "PUT"`、`cache: "no-store"`、`profileReadbackMatches`、`/api/profile/extractions/resume`、`Your profile was not changed`、`setMessage(t({ en: "Saved."` —— 这些代码搬进 hook 后，把该测试的读取目标改为 `profile-0918/use-profile-editor-session.ts`（hook 文件 re-export `profileReadbackMatches`，因为该测试第 10 行从旧文件 import 它）。`app-profile-onboarding-editor` 里「保存成功绿色」的断言若因 warning 分支变化，改为断言 warning 文案（已批准行为）。`tests/pages/secondary-industry-editors.test.tsx` 也渲染 `OrbitRealProfile`（75/110 行），本任务保持绿。
- [ ] **Step 7: 提交** `refactor(profile): extract useProfileEditorSession from OrbitRealProfile; add profile-model`（impact `OrbitRealProfile` 先跑）。

---

### Task 2: 壳 + 样式 + 页面接线（个人资料屏先占位）

**Files:** Create `profile-shell.tsx`、`business-card-preview.tsx`（原样搬 `BusinessCardPreview` + `PreviewTagRow` + `CARD_BG/CARD_GLOW`）；Modify `profile/page.tsx`、`settings/page.tsx`；Test `tests/pages/app-profile-shell.test.tsx`

**Interfaces（Produces）:** `export function ProfileShell({ view, session, children, onboardingBanner, showSaveBar, onSave, onCancel, savingLabel }: { view: "profile"|"persona"|"basic"|"settings"|"connect"; session: ProfileEditorSession; children: ReactNode; onboardingBanner?: { missing: string[]; go: string }; showSaveBar?: boolean; onSave?: () => void; onCancel?: () => void })`；`export const PROFILE_STYLES: string`；`export function ProfileToast({ text })`。

- [ ] **Step 1: 写失败测试**：SSR 三页签文案与 `aria-current`；`onboardingBanner` 有值时含「完成基础资料后才能进入 iOrbit、活动、人脉」与缺项；`showSaveBar` 渲染「取消 / 保存修改」两个 `.btn`；`session.message` 以 `role=status|alert` 渲染，`warning` 用琥珀色类 `pc-notice-warning`。
- [ ] **Step 2: 失败**。
- [ ] **Step 3: 移植 44–65 行**（面包屑「个人中心 / {crumb}」、h1 `clamp(30px,3.6vw,42px)`、副标、保存栏、三页签 `padding:0 0 14px; border-bottom:2px …; font-size:15px`——页签是 `<button>`，按渲染结果核对字号）+ 281–284 toast + 横幅（无设计：用设计的通知条样式 `pc-notice`，背景 `#FBF1DC` 文字 `#8A6420`，按钮 `.btn pc-btn-primary`）。页签为路由链接（`/app/profile`、`/app/settings`、`/app/profile?view=connect`）。
- [ ] **Step 4: 接线**：`profile/page.tsx` 读 `searchParams.view`（`profile` 默认；`onboarding=1` 且未完成 → 默认 `basic`），渲染 `<div data-orbit-real-page="profile-0918"><AccountTopNav active="me" /><ProfileScreens view=… viewModel=… onboardingNext=… /></div>`；`ProfileScreens`（放 `profile-0918/profile-screens.tsx`）持有 `useProfileEditorSession` 并按 view 切换子屏（本任务先渲染占位 `pc-card`，任务 3–5 填充）。`settings/page.tsx` 同壳 `view="settings"`（`active="settings"`）。settings 页今天不做鉴权/加载（靠 proxy 门禁），且用 `[data-orbit-real-page=settings]` 作用域的 `<style>` 给五个设置模块重设 `--ink/--text/--surface/.card/.btn-primary/.chip`。做法：把 `profile/page.tsx:120-166` 的 actor 解析 + `loadAppProfileRouteViewModel` + 失败分支抽成服务端 helper `profile-0918/load-profile-editor-page.ts`（`export async function loadProfileEditorPage(next: string): Promise<{ ok: true; viewModel; language } | { ok: false; boundary: ReactNode }>`），两页共用；settings 页失败时渲染同一个 route-state boundary；把 settings 的那段作用域变量/皮肤 `<style>` 原样搬进 `profile-settings.tsx`，作用域改为 `.pc-legacy-settings`（包住五个既有模块的容器），保证模块配色不回退。旧 `OrbitRealProfile` 此时不再被页面挂载但文件保留（任务 6 删）。
- [ ] **Step 5**: 测试 + typecheck + ratchet，并修这三处会因接线变化而失败的测试：(a) `tests/pages/app-profile-onboarding-navigation.test.ts:180-183` 以绝对路径 mock `orbit-real-profile.tsx`，659-660/699-700 断言 `children[2].type` 含 `OrbitRealProfile` 并读 `editor.props.viewModel` → 改为 mock `profile-0918/profile-screens.tsx`，并从包裹 div 下钻取 `ProfileScreens` 的 props；(b) `tests/pages/app-profile-live-route-services.test.ts:150-151` 断言 `pageSource` 含 `OrbitRealProfile`、`profileSource` 含 `data-orbit-real-page="profile"` → 改为 `ProfileScreens` 与 `data-orbit-real-page="profile-0918"`；(c) `tests/ui/orbit-settings-theme.test.ts:13-21` 断言 `settings/page.tsx` 含 `data-orbit-real-page="settings"` 与 `<OrbitSettingsContent` → 改为断言新页面含 `data-orbit-real-page="profile-0918"` 且 `profile-settings.tsx` 挂载五个既有设置组件。
- [ ] **Step 6**: 像素 `--design-view profile`（只比头部/页签区域达标即可，正文占位；记录）。
- [ ] **Step 7**: 提交 `feat(profile): Orbit_0918 profile shell, styles and page wiring`。

---

### Task 3: 个人资料屏（design 67–152）

**Files:** Create `profile-overview.tsx`；Modify `profile-screens.tsx`；Test `tests/pages/app-profile-overview.test.tsx`

- 区块：资料卡（头像首字母 / `fullName` / `title · company` / 完整度 = `completeness().score%` / 「编辑商务画像」→ `?view=persona` / 「预览公开资料」→ 滚到预览卡）；商务画像四卡 `personaGroups`（空组显示「未填写」chip，不放 mock）；联系方式 `contactRows`（右列一律「仅自己可见」）；资料建议 `suggestions`；公开预览卡 = `BusinessCardPreview`；「编辑资料」（设计 `flashEdit`）→ `?view=basic`。
- [ ] Step 1 失败测试（真实字段渲染；mock 名「Qiongyu Li」「82%」不出现；空画像组显示未填写；建议按条件出现）→ Step 2 失败 → Step 3 移植 67–152 → Step 4 接入 `ProfileScreens` → Step 5 测试/typecheck/ratchet → Step 6 像素 `--design-view profile` 达标 → Step 7 提交 `feat(profile): Orbit_0918 profile overview screen` + 台账。

---

### Task 4: 编辑商务画像（design 154–207）+ 编辑基础资料（设计无）

**Files:** Create `profile-persona.tsx`、`profile-basic.tsx`；Modify `profile-screens.tsx`；Test `tests/pages/app-profile-persona.test.tsx`、`app-profile-basic.test.tsx`

- 画像编辑：三组标签（offer/seek/topic ← `toggleTag` 增删；Enter 添加前先 `values.includes(tag)` 守卫，因为 `toggleTag` 对已存在的标签是移除；offer/seek 各最多 5 项，超出时 `notify("error", …)` 用旧 `ChipGroup` 的「能提供和想寻求各最多选择 5 项」文案）+ 我的目标只读 chip（无输入，见全局约束）；右侧「画像预览」卡与「填写建议」三条原样；保存栏 → `saveProfile("matching")`，成功 toast「修改已保存」并回 profile；取消 → `reloadLatestProfile()` 后回 profile。
- 基础资料编辑（`profile-basic.tsx`）：一张 `pc-card`「基础信息」用画像编辑的表单声明（标签 `font-size:15px;font-weight:500`、输入框声明取设计 171 行 `<input>` 的样式），字段：姓名*、一级行业*、二级行业*（两个 `<select>` 从旧文件 `EditSections` 第 518–530 行原样搬，保留 `aria-label="一级行业"/"二级行业"`，用 `INDUSTRY_CATALOG`/`listSecondaryIndustries`/`updateIndustry`）、职位、公司、生日*（`type=date`）、关于我（bio，可见字符 80）、一句话介绍（headline，只读）、联系方式：WeChat 与 LINE 可编辑、Email 只读、其余只读（见全局约束）；整屏包在 `<form onSubmit>` 里（既有测试用 `findAllByType("form")[0].props.onSubmit` 触发保存）；顶部「快速填充」（手动 / 结构化文本提取 ← hook 的 `method/extractText/onTextExtract`）；必填标记 `pc-required`「必填」；保存栏 → `saveProfile("basic")`；`?onboarding=1` 时壳渲染横幅且本屏为默认视图。
- [ ] Step 1 两份失败测试（画像：三组 chips 与 Enter 添加调用 toggleTag、第 6 个 offer 触发 notify；基础：四个必填标记、缺生日时保存后 warning 文案由 hook 提供并渲染为琥珀色、`?onboarding=1` 横幅存在）→ Step 2 失败 → Step 3 移植 154–207 + 基础屏 → Step 4 接入 → Step 5 测试/typecheck/ratchet。**既有行为测试移植清单**（本任务把 `app-profile-onboarding-editor.test.tsx`、`app-profile-editor-failure-paths.test.tsx`、`secondary-industry-editors.test.tsx` 改指新屏，断言意图不变）：它们依赖 `findAllByType("form")[0].props.onSubmit`（基础屏保留 form）、首个 `<input>` 是姓名且加载中 `disabled`、`buttonWithText("Save basic profile","保存基础资料")` → 新屏保存栏文案是「保存修改」（测试改为找 `.pc-save`）、`("Save matching preferences","保存匹配偏好")` → 画像屏「保存修改」、`("Reload latest","刷新最新资料")`（冲突提示里的按钮文案保留）、`role="group" aria-label="我能提供"` + chip `aria-pressed`（画像屏保留 group aria-label，chip 改为 ✕ 移除按钮 → 断言改为存在带标签文本的 chip 与其移除按钮）、`aria-label="一级行业"/"二级行业"`（保留）、`role="alert"/"status"`（壳保留） → Step 6 像素 `--design-click "text=编辑商务画像"` 达标（基础屏无设计，只做截图存档 `/tmp/profile-basic/app.png`）→ Step 7 提交 `feat(profile): Orbit_0918 persona editor and basic-profile editor with onboarding prompts` + 台账。

---

### Task 5: iOrbit 设置（design 209–242）+ 连接（design 244–280）

**Files:** Create `profile-settings.tsx`、`profile-connect.tsx`；Modify `profile-screens.tsx`、`settings/page.tsx`；Test `tests/pages/app-profile-settings.test.tsx`、`app-profile-connect.test.tsx`

- 设置（design 209–242 实际结构）：左列 212–215「关于我」textarea ← `bio`（保存栏 → `saveProfile("basic")`）；216–220「当前目标」= 段落 `intro`（无 → 「未设置」）+ 4 个 chip（无数据源 → chips 省略）；221–228「沟通偏好」（首选语言/沟通风格/会议时间偏好，`OrbitProfileView` 无字段）→ **整卡省略**；右卡 231–239「当前 iOrbit 使用的信息」= 关于我 `aboutShort(bio)` + 当前目标 `intro`，其中沟通偏好子块省略；240 行说明句原样。偏差全部记台账。之后按 `pc-card` 逐个挂 `OrbitAppearanceSettings / OrbitAgentMemorySettings / OrbitAgentFeedbackSettings / OrbitAgentAutomationSettings / OrbitAgentExecutionSettings`（外包 `.pc-legacy-settings` 皮肤块，见任务 2；各自内部不动；台账记偏差）。
- 连接：四卡 `intMeta` 原样（glyph/色块/desc/scopes），状态 chip「未连接」，按钮位置渲染 `<span className="pc-connect-cta pc-connect-cta-soon" aria-disabled="true">即将开放</span>`；连接概览 0 / 4；连接说明卡原样。
- [ ] Step 1 失败测试 → 2 → 3 移植 → 4 接入（`/app/settings` 渲染 settings 屏） → 5 测试（既有 `tests/pages/*settings*` 仍绿）/typecheck/ratchet → 6 像素 `--design-view settings`、`--design-view connect` 达标（设置屏下方追加的既有面板区域单独归因）→ 7 提交 `feat(profile): Orbit_0918 settings and connect screens` + 台账。

---

### Task 6: 删除旧组件 + 回归 + 收口

**Files:** Delete `profile/orbit-real-profile.tsx`；Modify 引用它的测试（改指新屏或删）、ratchet 列表；docs。

- [ ] Step 1 `grep -rn "orbit-real-profile" app features shared tests scripts` 列清单（`scripts/generate-full-product-functional-audit.mjs:1616-1661` 引用旧文件行号作证据路径，需改指新文件）；行为断言已在任务 4 改到新屏，剩余 UI 结构断言删除。
- [ ] Step 2 删除文件；ratchet 列表本就不含该文件，只把 button `CEILING`（当前 142）与 scale 三个上限按实际值下调。
- [ ] Step 3 `npm run typecheck`；`node --test --import tsx $(ls tests/pages/app-profile*.test.* tests/pages/profile-*.test.* tests/pages/*settings*.test.*) tests/ui/*.test.ts`；`tests/audits/*` 失败集 ⊆ 基线。
- [ ] Step 4 像素终验四屏，台账「个人中心 屏级替换完成」（提交范围、像素表、偏差清单：完整度派生口径 / 我的目标单文本 / 可见范围一律仅自己可见 / 基础资料屏为设计外新增 / 设置页追加既有面板 / 连接占位）、ROUTE-CONSOLIDATION 第三节 profile/settings 行改「已重建」、NEW-UI-DECISION 顺序 ② 标完成。
- [ ] Step 5 提交 `refactor(profile): delete legacy OrbitRealProfile; record 个人中心 completion`。

---

## 后续计划

③ Events 参与者侧（host / live 取代 party* / 弹窗）→ ④ 运营台 7 屏 → ⑤ 认证四态弹窗 → ⑥ iOrbit chat。

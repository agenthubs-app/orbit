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
  - 设计「我的目标」多标签 → 真实字段只有单文本 `intro`（relationshipGoal）：个人资料卡显示为一个 chip，画像编辑里为单行文本输入（不是标签），记为偏差。
  - 联系方式「可见范围」列：所有 handle 都不进公开资料（`publicProfile` 不含 handles）→ 一律显示「仅自己可见」；为空的 handle 不渲染行；四行以外的 handle（phone/website/linkedin/x）按同样式追加行。
  - 「资料建议」三条 = 真实条件：基础资料未完成（`onboarding.status !== "complete"`）→ 跳基础资料编辑；任一画像组为空 → 跳画像编辑；连接数 0 → 跳连接。条件不成立的行不渲染；三条都不成立渲染 `pc-empty`「资料很完整，暂无建议」。
  - 连接：四张卡全部「即将开放」非交互（既有决定），已连接 0 / 未连接 4 为真实计数。
  - iOrbit 设置「关于我」= `bio`（basic scope，`BIO_VISIBLE_LIMIT` 80 可见字符校验沿用 `validateProfileSaveDraft`）；设计的「关于我」摘要卡文案 = bio 前 62 字 + …（设计 `aboutShort`）。**既有设置面板**（外观 / 记忆 / 反馈 / 自动化 / 执行）不能丢：在设计的三张卡之后，以 `pc-card` 外框逐个挂载 `orbit-settings-content.tsx` 里的组件（偏差记台账）。
  - 「预览公开资料」= 既有 `BusinessCardPreview`（星空名片）在设计 75–78 行「公开预览」卡位置渲染真实预览，设计的 `flashPreview` toast 不做。
  - 「编辑资料」（设计 `flashEdit`「编辑面板即将开放」mock）→ 真实「编辑基础资料」屏。
- **Onboarding 门禁提示（已批准）**：`?onboarding=1` 且 `onboarding.status !== "complete"` → 标题下方横幅「完成基础资料后才能进入 iOrbit、活动、人脉。还需填写：<缺项>」+「去填写」按钮 → 直接落在基础资料编辑屏；四个必填字段标签带「必填」标记；保存基础资料后仍不完整 → 琥珀色提示「基础资料已保存，但还需填写：<缺项>。填完后才能进入其他页面。」（不显示绿色成功）；完整且有 `onboardingNext` → 沿用 hook 的自动跳转。
- **hook 抽取零行为变化**：`useProfileEditorSession` 的实现 = `orbit-real-profile.tsx` 第 936–1372 行（`const { t } = useOrbitLanguage();` 之后、`const editProps = {` 之前）原样搬移（只改缩进/命名不改逻辑），唯一允许的逻辑改动是「保存后仍不完整的提示」（上一条）。既有测试 `tests/pages/app-profile-onboarding-editor.test.tsx`、`app-profile-editor-failure-paths.test.tsx`、`app-profile-live-route-services.test.ts`、`profile-onboarding-access.test.ts`、`app-profile-onboarding-navigation.test.ts`、`app-profile-save-model.test.ts` 必须持续通过（渲染旧组件的用例在旧组件删除任务里改指新屏，断言意图不变）。
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

- [ ] **Step 1**: `viewLabel` 映射改为「按设计文件选表」：Network 表保持；新增 profile 表 `{ profile: "个人资料", settings: "iOrbit 设置", connect: "连接" }`，`persona` 不点页签而是 `--design-click "text=编辑商务画像"`（README 写明）。判定用 `--design` URL 是否含 `%E4%B8%AA%E4%BA%BA%E4%B8%AD%E5%BF%83`（个人中心）或传 `--design-table profile`。
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
- [ ] **Step 6: 跑既有 profile 六个测试 + 新模型测试 + typecheck + ratchet** → 全绿（`app-profile-onboarding-editor` 里「保存成功绿色」的断言若因 warning 分支变化，改为断言 warning 文案——这是已批准行为）。
- [ ] **Step 7: 提交** `refactor(profile): extract useProfileEditorSession from OrbitRealProfile; add profile-model`（impact `OrbitRealProfile` 先跑）。

---

### Task 2: 壳 + 样式 + 页面接线（个人资料屏先占位）

**Files:** Create `profile-shell.tsx`、`business-card-preview.tsx`（原样搬 `BusinessCardPreview` + `PreviewTagRow` + `CARD_BG/CARD_GLOW`）；Modify `profile/page.tsx`、`settings/page.tsx`；Test `tests/pages/app-profile-shell.test.tsx`

**Interfaces（Produces）:** `export function ProfileShell({ view, session, children, onboardingBanner, showSaveBar, onSave, onCancel, savingLabel }: { view: "profile"|"persona"|"basic"|"settings"|"connect"; session: ProfileEditorSession; children: ReactNode; onboardingBanner?: { missing: string[]; go: string }; showSaveBar?: boolean; onSave?: () => void; onCancel?: () => void })`；`export const PROFILE_STYLES: string`；`export function ProfileToast({ text })`。

- [ ] **Step 1: 写失败测试**：SSR 三页签文案与 `aria-current`；`onboardingBanner` 有值时含「完成基础资料后才能进入 iOrbit、活动、人脉」与缺项；`showSaveBar` 渲染「取消 / 保存修改」两个 `.btn`；`session.message` 以 `role=status|alert` 渲染，`warning` 用琥珀色类 `pc-notice-warning`。
- [ ] **Step 2: 失败**。
- [ ] **Step 3: 移植 44–65 行**（面包屑「个人中心 / {crumb}」、h1 `clamp(30px,3.6vw,42px)`、副标、保存栏、三页签 `padding:0 0 14px; border-bottom:2px …; font-size:15px`——页签是 `<button>`，按渲染结果核对字号）+ 281–284 toast + 横幅（无设计：用设计的通知条样式 `pc-notice`，背景 `#FBF1DC` 文字 `#8A6420`，按钮 `.btn pc-btn-primary`）。页签为路由链接（`/app/profile`、`/app/settings`、`/app/profile?view=connect`）。
- [ ] **Step 4: 接线**：`profile/page.tsx` 读 `searchParams.view`（`profile` 默认；`onboarding=1` 且未完成 → 默认 `basic`），渲染 `<div data-orbit-real-page="profile-0918"><AccountTopNav active="me" /><ProfileScreens view=… viewModel=… onboardingNext=… /></div>`；`ProfileScreens`（放 `profile-0918/profile-screens.tsx`）持有 `useProfileEditorSession` 并按 view 切换子屏（本任务先渲染占位 `pc-card`，任务 3–5 填充）。`settings/page.tsx` 同壳 `view="settings"`（需要 session → settings 页也加载 profile route VM，与 profile/page.tsx 相同的 loader；`active="settings"`）。旧 `OrbitRealProfile` 此时不再被页面挂载但文件保留（任务 6 删）。
- [ ] **Step 5**: 测试 + typecheck + ratchet + `app-profile-live-route-services`（源码断言若指旧组件名，改指 `ProfileScreens`）。
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

- 画像编辑：三组标签（offer/seek/topic ← `toggleTag` 增删，Enter 添加）+ 我的目标单行文本（`update("intro", …)`）；右侧「画像预览」卡与「填写建议」三条原样；保存栏 → `saveProfile("matching")`（`intro` 属 basic 字段：若 `dirtyFields` 含 `intro` 则先后调用 `saveProfile("basic")`；两次都成功才 toast「修改已保存」并回 profile）；取消 → `reloadLatestProfile()` 后回 profile。
- 基础资料编辑（`profile-basic.tsx`）：一张 `pc-card`「基础信息」用画像编辑的表单声明（标签 `font-size:15px;font-weight:500`、输入框声明取设计 171 行 `<input>` 的样式），字段：姓名*、一级行业*、二级行业*（两个 `<select>` 从旧文件 `EditSections` 第 518–530 行原样搬，用 `INDUSTRY_CATALOG`/`listSecondaryIndustries`/`updateIndustry`）、职位、公司、一句话介绍（headline）、生日*（`type=date`）、关于我（bio，可见字符 80）、联系方式（email/phone/wechat/line/website/linkedin/x ← `handles`）；顶部「快速填充」（手动 / 结构化文本提取 ← hook 的 `method/extractText/onTextExtract`）；必填标记 `pc-required`「必填」；保存栏 → `saveProfile("basic")`；`?onboarding=1` 时壳渲染横幅且本屏为默认视图。
- [ ] Step 1 两份失败测试（画像：三组 chips 与 Enter 添加调用 toggleTag；基础：四个必填标记、缺生日时保存后 warning 文案由 hook 提供并渲染为琥珀色、`?onboarding=1` 横幅存在）→ Step 2 失败 → Step 3 移植 154–207 + 基础屏 → Step 4 接入 → Step 5 测试（含 `app-profile-onboarding-editor` 改指新屏）/typecheck/ratchet → Step 6 像素 `--design-click "text=编辑商务画像"` 达标（基础屏无设计，只做截图存档 `/tmp/profile-basic/app.png`）→ Step 7 提交 `feat(profile): Orbit_0918 persona editor and basic-profile editor with onboarding prompts` + 台账。

---

### Task 5: iOrbit 设置（design 209–242）+ 连接（design 244–280）

**Files:** Create `profile-settings.tsx`、`profile-connect.tsx`；Modify `profile-screens.tsx`、`settings/page.tsx`；Test `tests/pages/app-profile-settings.test.tsx`、`app-profile-connect.test.tsx`

- 设置：关于我 textarea ← `bio`（保存栏 → `saveProfile("basic")`）；「iOrbit 对你的理解」摘要卡 = `aboutShort(bio)` + 画像三组真实值；「说明」卡原样；之后按 `pc-card` 逐个挂 `OrbitAppearanceSettings / OrbitAgentMemorySettings / OrbitAgentFeedbackSettings / OrbitAgentAutomationSettings / OrbitAgentExecutionSettings`（各自内部样式不动；台账记偏差）。
- 连接：四卡 `intMeta` 原样（glyph/色块/desc/scopes），状态 chip「未连接」，按钮位置渲染 `<span className="pc-connect-cta pc-connect-cta-soon" aria-disabled="true">即将开放</span>`；连接概览 0 / 4；连接说明卡原样。
- [ ] Step 1 失败测试 → 2 → 3 移植 → 4 接入（`/app/settings` 渲染 settings 屏） → 5 测试（既有 `tests/pages/*settings*` 仍绿）/typecheck/ratchet → 6 像素 `--design-view settings`、`--design-view connect` 达标（设置屏下方追加的既有面板区域单独归因）→ 7 提交 `feat(profile): Orbit_0918 settings and connect screens` + 台账。

---

### Task 6: 删除旧组件 + 回归 + 收口

**Files:** Delete `profile/orbit-real-profile.tsx`；Modify 引用它的测试（改指新屏或删）、ratchet 列表；docs。

- [ ] Step 1 `grep -rn "orbit-real-profile" app features shared tests` 列清单；行为断言改写到新屏（onboarding editor / failure paths 两份必须保留并通过），UI 结构断言删除。
- [ ] Step 2 删除文件；ratchet CORE_FILES/EXEMPTIONS/SNAPPED_FILES 去掉该文件条目；上限按实际值下调。
- [ ] Step 3 `npm run typecheck`；`node --test --import tsx $(ls tests/pages/app-profile*.test.* tests/pages/profile-*.test.* tests/pages/*settings*.test.*) tests/ui/*.test.ts`；`tests/audits/*` 失败集 ⊆ 基线。
- [ ] Step 4 像素终验四屏，台账「个人中心 屏级替换完成」（提交范围、像素表、偏差清单：完整度派生口径 / 我的目标单文本 / 可见范围一律仅自己可见 / 基础资料屏为设计外新增 / 设置页追加既有面板 / 连接占位）、ROUTE-CONSOLIDATION 第三节 profile/settings 行改「已重建」、NEW-UI-DECISION 顺序 ② 标完成。
- [ ] Step 5 提交 `refactor(profile): delete legacy OrbitRealProfile; record 个人中心 completion`。

---

## 后续计划

③ Events 参与者侧（host / live 取代 party* / 弹窗）→ ④ 运营台 7 屏 → ⑤ 认证四态弹窗 → ⑥ iOrbit chat。

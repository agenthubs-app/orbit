# Sprint R36b — 计划 v3：初稿页 App · REPORT

**结果：done（5 个 SC 全部 pass；SC-04 像素门禁 iPhone 16e（iOS 26.0）三目标页身 + 三条 dock 共 6 张 PASS，超阈值带 70 条全部 `[data]`；另按用户 11-02 拍板接上「重新起草」接口）。**
Generator：Claude Fable 5.1 → Opus 5.5（side session r36b）／2026-11-01～02；Planner revision 1，PLANNER.md SHA256 前 16 位 `8abb007571a9fc73`。
分支：直接在 `chat-agent` 按路径提交（基线 `2a5d36f61`）；与 R36a 并行，R36a 的提交（`7b4693937` 契约、`1f6b351f5` 原型 URL 参数、`ac2a683df` Web 工具整页模式、`ae3f546ae` fixture）夹在本 Sprint 提交之间，文件无重叠；未 push。
执行台账（Ruling 全文）：`~/Library/Application Support/Claude/side-session-notes/local_53b01837-…/r36b-plan-draft-app-ledger.md`。

## 进入条件（开工时复核）

| 条件 | 开工时（`2a5d36f61`） | 落地 |
| --- | --- | --- |
| R36a 契约提交（`confirm` 带 `adjustments`） | 未落地（契约最新 = R33 `3eb4194dd`）→ 先做 SC-02 / SC-03 画面 | `7b4693937`（11:49 本地时间）→ SC-01 已同步 |
| R36a `--design-page`（共用 lib） | 未落地 → 先用 mock 数据 + react-native-web 渲染对画面 | `ac2a683df`：落在 `compare-redesign.mjs`（`shootDesignPage` + `--design-as-mweb`），**不在共用 lib** → App 工具按同一口径自己实现（见 SC-04） |
| fixture `v16-*` | 不存在 → 先用 mock AI 的 `mockDraftV3`（走 `:3026` mock 服务器抓真实回包） | `ae3f546ae`：`v16-fund / v16-sales / v16-hire`、`intake_v16_*`、`draft_v16_*`，与清单一致 |
| iPhone 16e 模拟器 | **本机没有任何 iOS 运行时**（`xcrun simctl list runtimes` 为空；`/Library/Developer/CoreSimulator/Images/images.plist` 11-01 10:39 清空；Devices 只剩 `device_set.plist`） | 11-02 主会话授权下载：先装 iOS 27.0（App 在其上启动即崩，见交接），再装 iOS 26.0（23A343）；门禁用 `iPhone 16e (iOS 26)` `926B48E0-…`（日文、9:41） |

## SC 映射与提交

| SC | 状态 | 证据 | commit |
| --- | --- | --- | --- |
| SC-R36b-01 契约同步 | pass | `npm run sync:contract` 后 `git status` 只有 `src/api/contract/plan-v2.ts`、`src/api/schema/plan-v2.ts`（`src/api/design/tokens.ts` 的改动来自 R36a **未提交**的 token，已 `git checkout` 掉，等其提交后再同步）；diff 只含 `PlanDraftConfirmAdjustments` / `PlanDraftConfirmRequest` 与对应 zod；`npm run typecheck` 退出 0；`plan-api.confirm(draftId, key, adjustments?)` 不带时请求体 `{ idempotencyKey }`（`tests/plan-draft-v3-screens.test.tsx`「confirm without any change」断言 `Object.keys(body) === ["idempotencyKey"]`） | `df2065d9b`（sync）、`ad646175f`（类型切到契约） |
| SC-R36b-02 画面 | pass | `tests/plan-draft-v3-screens.test.tsx` 8 用例：三种 fixture 渲染（结论区 / 路线 4 节点 / 按 `steps[].personTypeKeys` 分组 + イベント行 + 合计 / 依据区折叠 + `unverified` 单独标识 + 来源链接）、缺字段整块不渲染（无 orderReasons 且无 comparison → 依据区消失；keyNumbers / risks 空 → 不显示；引用不存在的来源无角标）、>180 天来源「更新の可能性あり」、v2 草稿仍渲染 `draft-card` + `draft-manual` / `draft-confirm`、深色无错误；AI 修正卡 `PlanTurn` 与 `PlanFixBar` 照旧（由 pill 开关） | `60671d8c6`、`0004d3443` |
| SC-R36b-03 调整与确定 | pass | 同文件：分量 ±5 实时改合计、≠100 时 `draft-confirm` `aria-disabled` + 「確定する前に 100 にしてください」、人数 1–5 两端禁用、删 / 恢复、只剩 1 类时 × 禁用、调整期间 0 请求、确定请求体 `adjustments`（无 lawyer、vc_partner 40）、跳转 href 同现有 confirm；mock 服务器集成（`:3026`，R36a 契约代码已在 HEAD）：带 adjustments 确定后计划按调整建立（cfo 2 人 / 20 点、无 lawyer、event 不变），草稿 `status: confirmed` | `60671d8c6`、`ad646175f` |
| SC-R36b-04 像素门禁 | pass | 6 / 6 PASS，unattributed 0（门禁总表见下）；门禁找出并修掉 2 处实现差（`ink-3` 文字色、顶行溢出） | `106a4d9ea`、`dd7707e43`、`b06d82034`、`fed7db401`（修正）、`5cdc48929`（清单 + 归因） |
| 追加：「重新起草」（用户 11-02 拍板接接口） | pass | 见下文「重新起草」 | `dff0045fa`（sync `8d6745849`）、`ab4c7241d` |
| SC-R36b-05 手动编辑分组 | pass（显示层） | `tests/plan-draft-v3-model.test.ts`「typeGroups」：steps 与 stepKey 不一致时以 steps 为准、无人认领的类型按 stepKey 回家、stepKey 也失效时进第一组；`tests/plan-draft-v3-screens.test.tsx`「grouping follows steps」：挪到阶段 2 的类型渲染在 `draft-v3-stage-2` 之后。全量对照见下 | `60671d8c6` |

### 调用方清单（App 仓库无 GitNexus 索引，grep）

- `PlanDraftCard` / `DraftActions` / `DraftUsedUp`：只有 `PlanFlowScreen.tsx`（v3 开放态改走 `PlanDraftV3`，其余路径不变）。
- `api.confirm`：`PlanFlowScreen.tsx:119`（加第三参数）、`PlanReviewScreen.tsx:143`（見直し，不带 adjustments，行为不变）。
- `PlanManualEditScreen`：`app/plans/drafts/[draftId]/edit.tsx`、`tests/plan-screens.test.tsx`、`tests/plan-review-screens.test.tsx`（本 Sprint **未改**手动编辑画面：分组推导放在 v3 画面的显示层，见「自定决定」）。
- `manualEditStateOf`：手动编辑页 + `tests/plan-model.test.ts`（未改）。

## 运行记录

- 文件：新建 `src/screens/plan/PlanDraftV3.tsx`（508 行，照原型 `.m` 的 CSS 数值搬）、`src/screens/plan/plan-draft-v3-model.ts`（纯规则：`isDraftV3` / `typeGroups` / 调整态 / `adjustTotals`（`validateAllocations`）/ `adjustmentsOf` / `summarySegments` / 来源编号与过期）、`tests/plan-draft-v3-model.test.ts`、`tests/plan-draft-v3-screens.test.tsx`、`tests/fixtures/plan-draft-v3-mock.json`（`:3026` mock 服务器走完流程抓的三份 v3 草稿，id 改成 `intake_v3_* / draft_v3_*`）、`repos/orbits/scripts/visual/views/app-R36b.json`、`attribution-redesign-R36b.json`；修改 `PlanFlowScreen.tsx`、`plan-api.ts`、`src/i18n/{ja,zh,en}/plan.ts`（58 个 `plan.v3.*` 键）、`src/i18n/copy-kinds.ts`、`repos/orbits/scripts/visual/compare-redesign-app.mjs`。
- `npm run typecheck`：每次提交前跑，退出 0。
- 定向测试：`plan-draft-v3-model` 6/6；`plan-draft-v3-screens` 8/8；`plan-screens` + `plan-model` + `no-hardcoded-copy` + `design-legacy-names` + `i18n-domain-split` + `app-locale-core` 全部通过（日志 scratchpad `related.txt`）。
- `npm run copy:qa -- --app plan`（repos/orbits）：新键只剩 4 条 `[untranslated]`（`levelHigh/Mid/Low` 高・中・低、`unitPeople` 人：中日同字，是正确译文）；长度、语气、中文数字间距问题已改（zh 去空格、ja 句末「。」、`verdictConditional` ja「条件つきで可能」/ en「Conditional」、en 计数改 `risks ({count})` 式）。
- 付费 AI 调用：0 次（mock AI；fixture 抓取与集成都在 `ORBIT_REDESIGN_MOCK=plan-v2-summary` 的 `:3026`）。
- 工作区：`repos/orbits/tsconfig.json`、`next-env.d.ts` 被 dev server（`.next-r26`）改写，未提交、未还原（与 R36a 同用，收口时按老规矩删 `.next-*` 并还原）。

### 全量测试对照（RULES 5.2）

基线 = `2a5d36f61` 的 `repos/orbit-app` 导出到 scratchpad（软链 node_modules）；HEAD = `dd7707e43`（之后只改了 4 处颜色 token 与工具，定向重跑通过）；顺序跑、不并行、不 source env。日志：`~/orbit-sprint-evidence/app/sprint-R36b/run-01/npm-test-{baseline,head}.txt`、`{baseline,head}-failures.txt`。

| | 总数 | 通过 | 失败 | 跳过 |
| --- | --- | --- | --- | --- |
| 基线 | 3279 | 3107 | 171 | 1 |
| HEAD | 3391 | 3384 | 5 | 2 |

失败清单去掉用时后 `comm -13`：**新增 0 条**。

11-02 接「重新起草」后（HEAD `ab4c7241d`）再跑全量：3394 / 3387 通过 / 5 失败（`run-02/npm-test-head.log`）。与基线比多出 1 条 `personal-schedule-interactions`「invalid repeat end date … en alert」：当时后台正在 `expo run:ios` 编译，CPU 满载；单跑该文件第一次另 3 条换着超时，构建结束后再单跑 75 / 75 通过（`run-02/personal-schedule-rerun-2.log`）→ 时序抖动，与计划页无关，**新增 0 条**。门禁修正 `fed7db401` 后定向：`plan-draft-v3-screens` 11 / 11、`plan-draft-v3-model`、`design-legacy-names`、`no-hardcoded-copy` 共 24 / 24；`tsc` 退出 0。HEAD 的 5 个失败都在基线清单里；基线多出的 166 个是副本不在 `repos/orbit-app` 原路径跑出的路径依赖用例（AI 会话页等，与 R33 / R35 REPORT 同一现象）。新增用例 +112 = 本 Sprint 的 14 个 + 基线因路径没跑到的。

## 像素门禁（SC-04）

环境：`iPhone 16e (iOS 26)` `926B48E0-D01C-4B90-B99E-CB7338B94CD5`（AppleLanguages ja、status_bar 9:41）；开发包 = `expo run:ios` 构建产物用 `simctl install` 装（`expo run:ios` 构建成功后卡在「Connecting to iPhone 16e」启动步骤，杀掉后直接装）；Metro `:8081` 带 `EXPO_PUBLIC_ORBIT_REDESIGN_MOCK=open-path`；`:3201` mock（`orbits-plan-mock`）`switch.mjs --name v16-all`；登录态 = 门禁 Playwright 登录态里 localhost 的 cookie 写进 AsyncStorage 旧键 `orbit.authCookieHeader.<origin>`（App 启动时迁进 SecureStore），`orbit.apiBaseUrl` 同写 `:3201`（R12 坑）；设计稿 `:3320`。命令：

```
node scripts/visual/compare-redesign-app.mjs --suite scripts/visual/views/app-R36b.json --simulator 926B48E0-D01C-4B90-B99E-CB7338B94CD5 --out <dir>
```

口径：页身视图从 `page-top 120`（状态栏 50 + ShellTopBar 70）起比到屏底 ↔ 原型 `.page` 顶起同高（同 R36a：原型 `.page(+dock)` ↔ 页身根元素，壳不比）；原型 `.dock` 绝对定位贴 `.app` 底，整页截图里落在页尾，所以另加三条 `*-dock` 视图：实现屏底 80pt ↔ 设计 `.app` 底 80pt。

| 画面 | raw | 超阈值带 | 未归因 | 结果 |
| --- | --- | --- | --- | --- |
| A-R36b-fund 页身 | 0.2440 | 21 | 0 | PASS |
| A-R36b-sales 页身 | 0.2371 | 22 | 0 | PASS |
| A-R36b-hire 页身 | 0.2426 | 21 | 0 | PASS |
| A-R36b-fund dock | 0.0790 | 2 | 0 | PASS |
| A-R36b-sales dock | 0.0684 | 2 | 0 | PASS |
| A-R36b-hire dock | 0.0786 | 2 | 0 | PASS |

证据：`~/orbit-sprint-evidence/app/sprint-R36b/run-02/gate-05`（带 CLI 参数）与 `gate-06`（只靠清单默认值，数值逐张相同）。

- **归因**（`attribution-redesign-R36b.json`，70 条全部 `[data]`）：原型只有中文示例，实现是日文 fixture；日文更长、折行更多（面包屑与 pill 各折 2 行 +14pt，理由段多 1–2 行，阶段名 2 行，类型表副标题 2 行），下方块累计下移 18–100pt；每条写明该 y 段设计侧 / 实现侧各是哪些元素。块内结构、字号、行高、token 色在三联图上一致。工具的「缺块」提示（14 / 19 / 23 格）就是这个下移：设计那格已有字、实现那格还没到。
- **底色**：原型 `.app` 的三层径向雾是原型舞台，实现用产品壳 `ShellBackground`（R05 / R07 门禁过的壳）；同 R36a「原型舞台不是设计，实现用真实壳」。差异只在底色 ΔE 3–11，和文字差在同一批带里。
- **门禁修掉的实现差**（`fed7db401`）：① 原型 `--ink-3` = `#6F6778` = token `ink3Text`（Web 用 `--ink-3-text`），页面 12 处误用 `ink3`（`#9C95A4`，偏浅）→ 全换 `ink3Text`；② 日文「✦ AI に直してもらう · あと 3 回」比中文长，RN flex 默认不收缩 → pill 冲出屏幕右边；面包屑、pill、pill 文字加 `flexShrink: 1`（= CSS 默认，Web 390 宽同样折行）。
- **深色**：原型无 → 只截图留档 `run-02/dark/A-R36b-{fund,sales,hire}-dark.png`（用户已接受），目视无错位、对比度正常。
- 首两轮（`gate-01`/`02`）截到「ログイン状態を確認しています…」：Metro 重启后首包 + mock 首次编译超过 12s → 清单默认等待改 20s。

## 重新起草（用户 2026-11-02 拍板接接口）

- 契约 R36a `8d6745849`（`PlanDraftRedraftRequest { idempotencyKey }` 严格，响应 = `PlanDraftView`）→ `sync:contract` 只动 `src/api/contract/plan-v2.ts`、`src/api/schema/plan-v2.ts`，diff 只含这两个类型与 zod（`dff0045fa`）。
- `ab4c7241d`：`plan-api.redraft(draftId, key)` → `POST …/drafts/<id>/redraft`；dock「書き直す」在 `aiFixUsed ≥ aiFixLimit`、`manualEditAvailable = false`（服务端会回 DRAFT_CLOSED）或有请求进行中时禁用；有未确定的调整先弹 `presentConfirm`（「変えた人数と配点は消えます」，取消 = 不发请求、调整保留）；进行中显示现有「正在做初稿」行、确定按钮同时禁用；`aiFailed` → RetryCard「書き直せませんでした」+「次数没有减少」，可再试；成功换稿、本地调整作废、AI 次数 −1（与「AI に直してもらう」共用）。口径与 R36a Web 一致。
- 测试：`plan-draft-v3-screens` +3（直接换稿且请求体只有 `idempotencyKey` / 有调整先确认：取消 0 请求、确认后调整作废 / 两种禁用态 + 失败不扣次数）；测试壳挂 `UiFeedbackHost`。copy:qa 对新键无报告。

## 自定决定（与设计稿无关的工程决定；壳的取舍主会话 11-01 已拍板 A）

1. **壳（主会话 11-01 已拍板 A，两端一致）**：v3 开放态 `PlanChatFrame` 的 `stage={null}`（不画五段进度），隐藏目标气泡、「背景を確認しました」卡、前提卡（原型把前提折进结论区的「根据你的资料、N 个回答…▾」）；顶栏 `ShellTopBar`（☰ iOrbit ✕）保留为壳——iOS 全屏页需要关闭入口，原型没有；页身从原型 `.page` 顶开始一模一样（含面包屑行 + 「✦ AI に直してもらう · あと N 回」pill）。代价：顶栏与面包屑都写 iOrbit；若拍板 B，改 `PlanFlowScreen` 的 v3 分支即可。
2. **AI 修正入口**：pill 开关 `PlanFixBar`（开时 dock 让位，关则回到 dock）；修正后的 `PlanTurn` 卡接在页身下，不再带 v2 的两个按钮（确定走 dock）。用完（あと 0 回）pill 置灰。
3. **「重新起草」**：用户 11-02 拍板接接口，已接（见上节）。
4. **不画「手動で編集」入口**：D-1 把 1 次手动编辑留给确定后的主页；原型也没有。
5. **调整不做 `plan-allocation` 回流**：原型 stepper 只改自己那一类，合计 ≠100 时禁用确定并提示；合计与 =100 校验用 `validateAllocations`，人数 1–5 用 `PLAN_TYPE_TARGET_MAX`，分量 5–50（字段表）为本地常量。
6. **缺失即不显示**（字段表）：类型行「人脉里已有 N 位」、活动行的活动名、`.mine` 的身份 / 公司 / 来自 / 语言、来源抓取日期——契约 / 草稿里都没有；来源 >180 天只加「更新の可能性あり」pill。`.mine` 列出全部前提行（背景行标「あなたの情報」、回答行标「あなたの回答」，推测行用 ink-4）。
7. **分组以 steps 为准**（SC-05）：`typeGroups` 按 `steps[].personTypeKeys`；无人认领的类型按 `stepKey` 回家，再不行进第一组。服务端 `manualEdit` 仍不重算 `stepKey`（交 R37a）。
8. **原型写死的颜色**：对比条 `#7FB8A2 / #D9B07A / #E7A493`、判定点 `#C08A45` 没有 token，App 测试禁止字面量 → 暂映射最近 token（`ok` / `macApricotInk` / `coral`；判定 conditional = `macApricotInk`，not_recommended = `coralText`）。R36a 随后在 `f1e74e707` 提交了 `chart-preferred / chart-possible / chart-not / verdict-conditional`，已同步并换名（提交见 git log）；shadow `card-soft / btn-soft / ring-node`、font `demi 650` 等 App 侧继续用 `shadowColor + opacity`、`"600"`（RN 无 650）。半透明白底（`rgba(255,255,255,.8/.85)`）用 `glass`（.62）；`.cur .node` 光环 = `plum700` 加 `opacity .14`。
9. **路线连线**：原型写死 3 阶段的 `left/right: 16.6%`，App 按 `1/(2N)` 算（mock 是 4 阶段，含イベント单独一步）；h1 字重 650 → `"600"`。
10. **深色**：原型无 → 用既有 token，只截图留档、不进门禁（与 R36a 同）。
11. 数字字体：`--num`（SF Pro Rounded）→ iOS `fontFamily: "ui-rounded"`（同 `UnderlineTabs` 先例）。
12. **门禁跳转用 open-path 不用深链**：深链会弹系统「在 Orbit 中打开？」框，门禁工具点不了（R26 同坑）。
13. **iOS 26 而非 27 跑门禁**：iOS 27 上 App 启动即崩（见交接），主会话定用 iOS 26，不在本 Sprint 改原生工程。

## 假设与额外阅读

- `summary.marks` 的下标是 code point 下标（mock 回包核对：`[84,87)` = 「並行で」）；按下标切片、越界夹紧、反向忽略；`refs` 的角标画在引用区间末尾之后。
- `fetchedAt` >180 天按毫秒差算（`PLAN_SOURCE_STALE_DAYS`）。
- 读了 R36a 的 `compare-redesign.mjs` `shootDesignPage` / `openDesign` / `finishDesign` 与原型 URL 参数提交（`1f6b351f5`：`goal / page / device / spec / bar`），App 工具照搬口径（不 import，CLI 文件不可导入）。
- react-native-web 把 `Text` 里的 `View` 当块排 → 角标 / pill 在 web 测试里加 `display: inline-flex`（`Platform.OS === "web"` 才生效，原生不变）。

## 未完成项

无。环境收口：`repos/orbits/next-env.d.ts`、`tsconfig.json` 被 mock dev server 改写、`.next-plan-mock/` 是其构建目录，均未提交（与 R36a 共用，按老规矩由收口方还原 / 删除）；`repos/orbit-app/.env.development.local`（gitignored）现指向 `:3201`。

## 交接

- **给 R37a（服务端）**：`manualEdit` 写入前按 `steps[].personTypeKeys` 重算 `personTypes[].stepKey`（现在原样保留旧值；App / Web 显示层已不信它，但计划主页与 `PlanPersonTypeDetail.stepKeys` 等读模型会用到）。
- **给 R37b（App 计划主页）**：可复用 `plan-draft-v3-model.ts` 的 `typeGroups`（按阶段分组）、`summarySegments`（加粗 + 角标）、`sourceTitle / sourceUrl / sourceStale`（来源清单）；`PlanDraftV3.tsx` 里的 `.route`（节点 + 连线）、`.src` 角标、`.sg` pill、`.stp` stepper、`.evi` 依据卡都是函数内局部组件——主页要用时抽到 `plan-draft-v3-kit.tsx`（本 Sprint 没抽：只有一处用）。原型主页的 `.hh` 头部 / `.todo` 清单 / `.seats` 空位是 R37b 的新画面。
- **给 R38**：真实 DeepSeek 的 v3 回包在 App 上的显示（`summary.marks` 越界、`refs` 指向不存在的来源、`comparison.rows[].typeKey` 为 null 的行）本 Sprint 都有兜底，但只用 mock 验过。
- **给主会话（高优先）**：**iOS 27 上 App 启动即崩**。iOS 27.0 模拟器（24A434）启动 `app.agenthubs.orbit` 立刻 `EXC_BREAKPOINT`，栈顶 UIKitCore `_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`（iOS 27 强制 UIScene 生命周期；`ios/` 由 prebuild 生成、Info.plist 无 `UIApplicationSceneManifest`；Expo 57 / RN 0.86）。与计划页无关，装 iOS 27 的真机同样会崩。崩溃报告 `~/orbit-sprint-evidence/app/sprint-R36b/run-02/ios27-launch-crash.ips`。需另开任务做 UIScene 适配；在那之前 App 门禁一律用 iOS 26 模拟器。
- **给主会话**：模拟器运行时 11-01 10:39 被清空过；现装有 iOS 26.0 与 iOS 27.0，门禁设备 `iPhone 16e (iOS 26)` `926B48E0-…`。`expo run:ios --device` 构建成功后会卡在「Connecting to …」（CPU 0%），用 DerivedData 产物 + `simctl install` 绕过。

## 补记（2026-11-04 门禁复跑）

R38 收口时 `Text.tsx` 正被另一会话修改，App 门禁没有复跑；该会话结论是无代码改动（简体字方框是 iOS 26.0 模拟器运行时缺陷），本次在 `chat-agent` `95d9865c4` + `938ea307c` 上复跑。

- 环境：iPhone 16e（iOS 26）`926B48E0-…`，mock `:3201`，设计稿 `:3320`，Metro `:8081`（open-path）。
- 结论：**PASS**，全部原始截图逐张看过，是真实页面；raw 与本报告原表逐张相同。
- 六张：页身 fund 0.2440 / sales 0.2371 / hire 0.2426，dock 0.0790 / 0.0684 / 0.0786；超阈值带 21 / 22 / 21 / 2 / 2 / 2，未归因 0。
- 这几屏没有简体字，iOS 26.0 方框缺陷不影响本次结果。
- 证据：`~/orbit-sprint-evidence/app/sprint-R38/run-03/gate-R36b-2/`，日志 `gates-2.log`。
- **门禁坑**：同目录第一轮（`gate-R36b` / `gate-R37b`，`gates.log`）**作废**。mock 与 Metro 改代码后还是冷的，20 s 等待截到「ログイン状態を確認しています…」和骨架屏，工具却把 R36b 判成 PASS（超阈值带只按归因表判，不看画面内容），raw 与原值不同才暴露。这一轮加 `--wait 45000` 重跑。复跑门禁时要核对 raw 或看 `simulator-raw.png`，不能只看退出码。

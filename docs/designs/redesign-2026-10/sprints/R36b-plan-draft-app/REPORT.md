# Sprint R36b — 计划 v3：初稿页 App · REPORT

**结果：blocked（画面、调整、契约同步、分组、门禁工具均已提交；SC-04 像素门禁截不到真机画面——本机没有任何 iOS 模拟器运行时；全量测试对照未收口——会话额度用尽）。**
Generator：Claude Fable 5.1（side session r36b）／2026-11-01；Planner revision 1，PLANNER.md SHA256 前 16 位 `8abb007571a9fc73`。
分支：直接在 `chat-agent` 按路径提交（基线 `2a5d36f61`）；与 R36a 并行，R36a 的提交（`7b4693937` 契约、`1f6b351f5` 原型 URL 参数、`ac2a683df` Web 工具整页模式、`ae3f546ae` fixture）夹在本 Sprint 提交之间，文件无重叠；未 push。
执行台账（Ruling 全文）：`~/Library/Application Support/Claude/side-session-notes/local_53b01837-…/r36b-plan-draft-app-ledger.md`。

## 进入条件（开工时复核）

| 条件 | 开工时（`2a5d36f61`） | 落地 |
| --- | --- | --- |
| R36a 契约提交（`confirm` 带 `adjustments`） | 未落地（契约最新 = R33 `3eb4194dd`）→ 先做 SC-02 / SC-03 画面 | `7b4693937`（11:49 本地时间）→ SC-01 已同步 |
| R36a `--design-page`（共用 lib） | 未落地 → 先用 mock 数据 + react-native-web 渲染对画面 | `ac2a683df`：落在 `compare-redesign.mjs`（`shootDesignPage` + `--design-as-mweb`），**不在共用 lib** → App 工具按同一口径自己实现（见 SC-04） |
| fixture `v16-*` | 不存在 → 先用 mock AI 的 `mockDraftV3`（走 `:3026` mock 服务器抓真实回包） | `ae3f546ae`：`v16-fund / v16-sales / v16-hire`、`intake_v16_*`、`draft_v16_*`，与清单一致 |
| iPhone 16e 模拟器 | **本机没有任何 iOS 运行时**（`xcrun simctl list runtimes` 为空；`/Library/Developer/CoreSimulator/Images/images.plist` 11-01 10:39 清空；Devices 只剩 `device_set.plist`） | 已报主会话（需下载 `xcodebuild -downloadPlatform iOS` 约 7–8 GB，未擅自执行） |

## SC 映射与提交

| SC | 状态 | 证据 | commit |
| --- | --- | --- | --- |
| SC-R36b-01 契约同步 | pass | `npm run sync:contract` 后 `git status` 只有 `src/api/contract/plan-v2.ts`、`src/api/schema/plan-v2.ts`（`src/api/design/tokens.ts` 的改动来自 R36a **未提交**的 token，已 `git checkout` 掉，等其提交后再同步）；diff 只含 `PlanDraftConfirmAdjustments` / `PlanDraftConfirmRequest` 与对应 zod；`npm run typecheck` 退出 0；`plan-api.confirm(draftId, key, adjustments?)` 不带时请求体 `{ idempotencyKey }`（`tests/plan-draft-v3-screens.test.tsx`「confirm without any change」断言 `Object.keys(body) === ["idempotencyKey"]`） | `df2065d9b`（sync）、`ad646175f`（类型切到契约） |
| SC-R36b-02 画面 | pass（react-native-web）／blocked（真机） | `tests/plan-draft-v3-screens.test.tsx` 8 用例：三种 fixture 渲染（结论区 / 路线 4 节点 / 按 `steps[].personTypeKeys` 分组 + イベント行 + 合计 / 依据区折叠 + `unverified` 单独标识 + 来源链接）、缺字段整块不渲染（无 orderReasons 且无 comparison → 依据区消失；keyNumbers / risks 空 → 不显示；引用不存在的来源无角标）、>180 天来源「更新の可能性あり」、v2 草稿仍渲染 `draft-card` + `draft-manual` / `draft-confirm`、深色无错误；AI 修正卡 `PlanTurn` 与 `PlanFixBar` 照旧（由 pill 开关） | `60671d8c6`、`0004d3443` |
| SC-R36b-03 调整与确定 | pass | 同文件：分量 ±5 实时改合计、≠100 时 `draft-confirm` `aria-disabled` + 「確定する前に 100 にしてください」、人数 1–5 两端禁用、删 / 恢复、只剩 1 类时 × 禁用、调整期间 0 请求、确定请求体 `adjustments`（无 lawyer、vc_partner 40）、跳转 href 同现有 confirm；mock 服务器集成（`:3026`，R36a 契约代码已在 HEAD）：带 adjustments 确定后计划按调整建立（cfo 2 人 / 20 点、无 lawyer、event 不变），草稿 `status: confirmed` | `60671d8c6`、`ad646175f` |
| SC-R36b-04 像素门禁 | **blocked** | 工具已接上整页模式并烟测（设计侧 `design.png` 390×2401）；清单 `views/app-R36b.json` 三张、归因文件骨架；**没有模拟器运行时 → 0 张实现侧截图** | `106a4d9ea`、`dd7707e43` |
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

（跑完后填：基线 = `2a5d36f61` 导出到 scratchpad 的 `repos/orbit-app` 副本；HEAD = `dd7707e43`；顺序跑、不并行、不 source env。）

| | 总数 | 通过 | 失败 | 跳过 |
| --- | --- | --- | --- | --- |
| 基线 | — | — | — | — |
| HEAD | — | — | — | — |

## 像素门禁（SC-04）

**0 / 3 张跑过：没有模拟器。** 已就绪的部分：

- 设计侧：`compare-redesign-app.mjs --design-page --design-query "goal=…&page=draft&device=m&bar=0"`，口径同 R36a Web 的 `--design-as-mweb`（去 `.stage` 内边距、`.app` 的 10px bezel / 圆角 / 阴影 → `.app` = 390 宽屏幕内容），3x 渲染 + SF 字体映射再缩到 1x，截 `.app` 整页（自然高度）；缓存键另起一组（`v: 4, page: true, query`）。烟测：fund 浅色 `design.png` 390×2401（`~/orbit-sprint-evidence/app/sprint-R36b/run-01/tool-smoke/`）。
- 比对：整页比截图高 → 没给裁剪时默认比顶部一屏；状态栏 50pt 只涂实现侧（原型没画状态栏）。正式跑时按下面的对位：
  - 第一屏：工具默认比「页身」——实现侧从 `--page-top`（状态栏 50 + ShellTopBar 高，设计点；清单里填实测值）起到屏底 ↔ 设计侧从原型 `.page` 顶起同高（`b06d82034`；口径同 R36a：原型 `.page(+dock)` ↔ 页身根元素，导航壳不在比对里）。
  - 滚动屏：用 iOS 模拟器 MCP 滑到位后 `--shot` + 对应 `--design-region` 偏移（`simctl` 不能滚动）。
  - dock：实现侧底部 78pt ↔ 设计侧 `(0, H-78, 390, 78)`（原型 `.dock` 绝对定位在页尾，App 固定在屏底）。
- 深色：原型没有 → 不进门禁，只截图留档（待模拟器）。
- 临时留档（不是门禁）：react-native-web 390 宽整页渲染 `run-01/rnw/rnw-fund-light.png`、`rnw-hire-dark.png`，用于没有模拟器时核对结构与顺序。

门禁总表：待补（每张 raw、超阈值带数、归因）。

## 自定决定（与设计稿无关的工程决定；壳的取舍已问主会话，见「未完成项」）

1. **壳（主会话 11-01 已拍板 A，两端一致）**：v3 开放态 `PlanChatFrame` 的 `stage={null}`（不画五段进度），隐藏目标气泡、「背景を確認しました」卡、前提卡（原型把前提折进结论区的「根据你的资料、N 个回答…▾」）；顶栏 `ShellTopBar`（☰ iOrbit ✕）保留为壳——iOS 全屏页需要关闭入口，原型没有；页身从原型 `.page` 顶开始一模一样（含面包屑行 + 「✦ AI に直してもらう · あと N 回」pill）。代价：顶栏与面包屑都写 iOrbit；若拍板 B，改 `PlanFlowScreen` 的 v3 分支即可。
2. **AI 修正入口**：pill 开关 `PlanFixBar`（开时 dock 让位，关则回到 dock）；修正后的 `PlanTurn` 卡接在页身下，不再带 v2 的两个按钮（确定走 dock）。用完（あと 0 回）pill 置灰。
3. **「重新起草」**：没有接口，按原型位置画、置灰（主会话定：不去掉）；**待用户拍板**：接「重新生成」接口还是去掉。
4. **不画「手動で編集」入口**：D-1 把 1 次手动编辑留给确定后的主页；原型也没有。
5. **调整不做 `plan-allocation` 回流**：原型 stepper 只改自己那一类，合计 ≠100 时禁用确定并提示；合计与 =100 校验用 `validateAllocations`，人数 1–5 用 `PLAN_TYPE_TARGET_MAX`，分量 5–50（字段表）为本地常量。
6. **缺失即不显示**（字段表）：类型行「人脉里已有 N 位」、活动行的活动名、`.mine` 的身份 / 公司 / 来自 / 语言、来源抓取日期——契约 / 草稿里都没有；来源 >180 天只加「更新の可能性あり」pill。`.mine` 列出全部前提行（背景行标「あなたの情報」、回答行标「あなたの回答」，推测行用 ink-4）。
7. **分组以 steps 为准**（SC-05）：`typeGroups` 按 `steps[].personTypeKeys`；无人认领的类型按 `stepKey` 回家，再不行进第一组。服务端 `manualEdit` 仍不重算 `stepKey`（交 R37a）。
8. **原型写死的颜色**：对比条 `#7FB8A2 / #D9B07A / #E7A493`、判定点 `#C08A45` 没有 token，App 测试禁止字面量 → 暂映射最近 token（`ok` / `macApricotInk` / `coral`；判定 conditional = `macApricotInk`，not_recommended = `coralText`）。R36a 已在 `tokens.json` 加 `chart-preferred / chart-possible / chart-not / verdict-conditional`（**未提交**）；落地后 `sync:contract` 并换成这四个名字。半透明白底（`rgba(255,255,255,.8/.85)`）用 `glass`（.62）；`.cur .node` 光环 = `plum700` 加 `opacity .14`。
9. **路线连线**：原型写死 3 阶段的 `left/right: 16.6%`，App 按 `1/(2N)` 算（mock 是 4 阶段，含イベント单独一步）；h1 字重 650 → `"600"`。
10. **深色**：原型无 → 用既有 token，只截图留档、不进门禁（与 R36a 同）。
11. 数字字体：`--num`（SF Pro Rounded）→ iOS `fontFamily: "ui-rounded"`（同 `UnderlineTabs` 先例）。

## 假设与额外阅读

- `summary.marks` 的下标是 code point 下标（mock 回包核对：`[84,87)` = 「並行で」）；按下标切片、越界夹紧、反向忽略；`refs` 的角标画在引用区间末尾之后。
- `fetchedAt` >180 天按毫秒差算（`PLAN_SOURCE_STALE_DAYS`）。
- 读了 R36a 的 `compare-redesign.mjs` `shootDesignPage` / `openDesign` / `finishDesign` 与原型 URL 参数提交（`1f6b351f5`：`goal / page / device / spec / bar`），App 工具照搬口径（不 import，CLI 文件不可导入）。
- react-native-web 把 `Text` 里的 `View` 当块排 → 角标 / pill 在 web 测试里加 `display: inline-flex`（`Platform.OS === "web"` 才生效，原生不变）。

## 未完成项

1. **SC-04 门禁三张 + 深色三张留档**：等 iOS 模拟器运行时（主会话 / 用户决定是否下载）；运行时就绪后：`xcrun simctl create "iPhone 16e" "iPhone 16e" <runtime>` → 日文 + 9:41 → 装开发包（需 `expo run:ios` 重新构建，含 `orbit-text-leading` 原生模块 pod）→ `.env.development.local` 指向 `http://localhost:3201`（R36a 已加 `launch.json` `orbits-plan-mock` :3201，未提交）→ `switch.mjs --name v16-fund` → 跑 `--suite views/app-R36b.json`，按上面的对位补 `--region`，归因写 `attribution-redesign-R36b.json`。
2. 「重新起草」接口与否：待用户拍板（壳 A 已定）。
3. **token 换名**：等 R36a 提交 `tokens.json` → `sync:contract` → `PlanDraftV3.tsx` 的四处颜色换成 `chartPreferred / chartPossible / chartNot / verdictConditional`。
4. 全量测试对照表：基线 → HEAD 顺序跑在后台（scratchpad `npm-test-baseline.txt` / `npm-test-head.txt`），本会话额度用尽前没跑完，下次接手先 `grep -E "^ℹ (pass|fail)"` 两份日志并 `comm -13` 失败清单。

## 交接

- **给 R37a（服务端）**：`manualEdit` 写入前按 `steps[].personTypeKeys` 重算 `personTypes[].stepKey`（现在原样保留旧值；App / Web 显示层已不信它，但计划主页与 `PlanPersonTypeDetail.stepKeys` 等读模型会用到）。
- **给 R37b（App 计划主页）**：可复用 `plan-draft-v3-model.ts` 的 `typeGroups`（按阶段分组）、`summarySegments`（加粗 + 角标）、`sourceTitle / sourceUrl / sourceStale`（来源清单）；`PlanDraftV3.tsx` 里的 `.route`（节点 + 连线）、`.src` 角标、`.sg` pill、`.stp` stepper、`.evi` 依据卡都是函数内局部组件——主页要用时抽到 `plan-draft-v3-kit.tsx`（本 Sprint 没抽：只有一处用）。原型主页的 `.hh` 头部 / `.todo` 清单 / `.seats` 空位是 R37b 的新画面。
- **给 R38**：真实 DeepSeek 的 v3 回包在 App 上的显示（`summary.marks` 越界、`refs` 指向不存在的来源、`comparison.rows[].typeKey` 为 null 的行）本 Sprint 都有兜底，但只用 mock 验过。
- **给主会话**：模拟器运行时缺失是环境事故（11-01 10:39 被清空），会影响所有 App 门禁，不只本 Sprint。

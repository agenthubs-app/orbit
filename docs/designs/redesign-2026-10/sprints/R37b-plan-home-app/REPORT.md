# Sprint R37b — 执行总结

## 结果

对应 [GOAL.md](GOAL.md) / [PLANNER.md](PLANNER.md)。App 计划主页（Task › プラン）按设计稿 v16「手机」视图的「计划主页 · 执行」页重做，接上 R37a 的勾选 / 重新生成 / 补事实接口；v2 计划或没有 `home` 时仍是 R24 概要。三种目标 × iPhone 16e（iOS 26）浅色门禁 3/3 PASS，超阈值带全部 `[data]`。

### 已验证能做到

- **契约同步（SC-01）**：`npm run sync:contract` 后只动 `src/api/{contract/index,contract/plan-v2,schema/plan-v2,design/tokens}.ts`，diff 只含 R37a `5b79fb7e2` / `4522e1444` 的主页类型与 zod，以及 token `font.size.taskTitle 15.5`、`lineHeight.relaxed 1.65`。`usePlanApi` 加 `homeDone / homeRegenerate / addContactFact`，`actionKey` 用 `encodeURIComponent`（`c:c_v16_sato` → `c%3Ac_v16_sato`，屏测断言路径）。
- **画面（SC-02）**：`PlanHomeV3` = `.top`（面包屑「iOrbit · マイプラン」+「✦ AI に調整してもらう」→ 見直し入口）→ `.hh`（目標 · outcome / 結論 | ステージ N / 総数 · 阶段名 · 进度条 · 「人脈にいる x / y 人 · s / 100 点」）→ 路线（当前阶段 = 第一个未完成）→「まずはこの N 件から」+ lead + 勾选清单 → 「知り合いたい人」空位表 + 活动行 →「なぜこの順番か」链接（展开 = 初稿页依据区）。字段表「缺了不显示」的一律不画；`pending` 显示「最初にやることを準備しています…」，0 件显示「去认识」提示。页身之下照 Web 保留待确认卡、目标行（切换）与 R24 的方案卡（前提 / 見直し / 手動編集 / 達成）。
- **交互（SC-03）**：勾选乐观更新、失败回滚；准备卡同时只开一张（行表顺序 who / met / last_contact / 每条事实 / common…，事实行「あなたのメモ 09/18」点了去联系人页；なぜこう切り出すか；书き出し下线 + コピー（expo-clipboard））；`staleSince` 时「情報が更新されました · 作り直す」，409 `LIMIT` → 该卡改显示上限文案、按钮消失、卡片内容不变（另 toast）；`gaps` memo → 补事实底部弹层（1–80 字，`POST /api/contacts/[id]/facts`，保存后强制重读概要），interaction → 联系人页；空位行同时只开一行；`pending` 每 3 秒强制重读、最多 10 次、页面不在前台不轮询。
- **像素门禁（SC-04）**：见门禁总表。门禁找出并修掉 2 处非数据差（`d5ffe0a79`）：`.hh` 的外边距在 CSS 里与 `.top`(26) / `.route`(30) 折叠；`.pg` 里行内文字落在父级 14px / 1.6 的支柱上（大数字行多 1.7pt、末行 22.4 高）。
- **守门（SC-05）**：`npm run typecheck` 只有基线已有的 1 条（`tests/ios-scene-lifecycle-config.test.ts:47`，`2095d6dd7` 带来，非本 Sprint 文件）；定向集全过；全量对照新增失败 0；`detect-changes --scope all` 非 partial。

### 仍未实现或未验证

- 真实 DeepSeek 准备卡在 App 上的显示：只用 mock fixture 验过（归 R38）。
- 门禁只比首屏（Task 头之下到 tab 栏之上 550pt）。清单卡、空位表在模拟器上滑动人工看过（荧光笔底色、头像、空位环正常），未做逐像素比对——工具不支持滚动后对位，与 R36b 口径相同。
- 依据区展开后，业界现状库来源的标题显示库 id（如 `L-101`）：`PlanV2Detail` 没有 `citations`，App 也没有现状库条目（Web 是服务端直接查库）。默认收起、不在门禁内；登记暂缓，需契约加字段（R38 定）。
- 深色只截图留档（原型无深色，D-8）。

## 运行记录

- Generator：Claude Opus 5.5（side session），2026-11-03。基线 `5b6293e98`；PLANNER.md SHA256 `174efe58d9d935dc…`（提交 `85ae0abee` 时）。
- 提交（按顺序，均在 `chat-agent`、按路径提交、未 push）：
  1. `85ae0abee` 文档（GOAL / PLANNER）
  2. `bfa0624ae` 契约同步
  3. `21ba09b96` 画面 + 模型 + kit + 接口 + 文案 + 测试
  4. `d5ffe0a79` 门禁修正 + 清单 + 归因
  5. LF6 轮询修正 + REPORT（见 git log）
- 付费 AI 调用：0 次。服务：mock `:3201`（`orbits-plan-mock`）、设计稿 `:3320`、Metro `:8081`（open-path）。fixture 收口时留在 `v16-home-hire`（R37a / R36a 门禁要先切回 `v16-home-all` / `v16-all`）。
- 构建：没有原生改动，复用今天 prebuild 后的 DerivedData 产物（10:39，含 UIScene 修复），未重跑 xcodebuild。

### 调用方与 impact（App 仓库在 GitNexus 索引里）

| 符号 | impact | 处理 |
| --- | --- | --- |
| `PlanOverview` | LOW（调用方只有 `PlanSegment`） | 加 v3 分流；`reload` 类型放宽为 `(force?) => …`（`PlanSegment.load` 本就接受 `force`） |
| `usePlanApi` / `createPlanApi` | **HIGH**（9 个计划画面 + `StartGuideScreen` 共用） | 只新增 3 个方法，已有方法未动；detect-changes 列出的其余符号是行号位移 |
| `PlanDraftV3` | UNKNOWN → grep：只有 `PlanFlowScreen` | 抽 `plan-draft-v3-kit.tsx`（路线 / 依据 / 段头 / 角标，数值不变）；R36b 门禁六张复跑 raw 与其报告逐张相同；`plan-draft-v3-screens` 11/11 |

detect-changes：画面提交前 `--scope staged` 14 文件 17 符号 risk medium（`createPlanApi` 影响 PlanFlow / ManualEdit / Review 三个流程，均为新增方法），非 partial（`detect-changes-staged-ui.txt`）。收口：`--scope all`（未提交的只有 LF6 修正与 REPORT）= 1 个文件、无索引符号重叠（`PlanHomeV3.tsx` 是新文件，索引未含），非 partial / truncated（`detect-changes-all.txt`）；`--scope compare --base-ref 5b6293e98` = 22 文件 24 符号、risk medium、3 个流程（均为 `createPlanApi` 新增方法），非 partial / truncated（`detect-changes-compare.txt`）。

### 门禁总表（SC-04）

命令：`node scripts/visual/compare-redesign-app.mjs --suite scripts/visual/views/app-R37b.json --only A-R37b-<goal> --simulator 926B48E0-… --out ~/orbit-sprint-evidence/app/sprint-R37b/run-01/gate-07`（每张前 `switch` 到 `v16-home-<goal>` 并把该计划设为最近打开，等プラン段页面副本 3 分钟过期）。

- 设计侧：原型 `?goal=…&page=home&device=m&bar=0`，`.page` 顶起 550pt。
- 实现侧：`/task?seg=plan`，region `0,188,390,550`（状态栏 + Task 头 + 段切换之下，底部 tab 栏之上；原型手机主页没有 tab 栏）。

| 画面 | raw | 超阈值带 | 已归因 | 未归因 | 结论 |
| --- | --- | --- | --- | --- | --- |
| A-R37b-fund | 0.1481 | 15 | 15 | 0 | PASS |
| A-R37b-sales | 0.1366 | 15 | 15 | 0 | PASS |
| A-R37b-hire | 0.1817 | 18 | 18 | 0 | PASS |

全部 `[data]`：日文比中文示例长（hire 结论 3 行、路线名与段头副标题折 2 行），下方块整体下移；结构、字号、行高、间距、颜色 token 一致（三联图）。背景雾同 R36a / R36b 口径。R36b 门禁复跑 `r36b-regate/` 六张 PASS。

留档：深色三张 `archive-dark/`；iOS 27 16e（`968D36AC-…`）启动截图 `ios27-launch.png`。

### 全量测试对照

基线 = `5b6293e98` 的 `repos/orbit-app` 导出到 scratchpad（软链 node_modules）；HEAD = 本仓库原路径。顺序跑，门禁与构建不在同时跑。失败清单去掉用时后 `comm -13`。

| | 总数 | 通过 | 失败 | 跳过 |
| --- | --- | --- | --- | --- |
| 基线 | 3369 | 3197 | 171 | 1 |
| HEAD（第 1 次） | 3490 | 3483 | 5 | 2 |
| HEAD（修 LF6 后，终版） | 3490 | 3484 | 4 | 2 |

- 第 1 次多出 1 条 `LF6: no new screen re-reads the server on every focus`：准备中轮询的 effect 依赖里有 `focused`，被棘轮当成「每次聚焦读服务器」。改为依赖只留 `pending`、聚焦走 ref（不在前台的一跳跳过），棘轮与屏测通过；终版**新增失败 0**。
- 终版 4 条（R18a ×3、`native app has a route for every web app surface`）都在基线清单里；基线多出的 167 条是副本不在原路径跑的路径依赖用例（同 R36b）。
- 日志：`npm-test-baseline.txt`、`npm-test-head.txt`、`npm-test-head-2.txt`、`baseline-failures.txt`、`head-failures.txt`、`new-failures.txt`（均在 `~/orbit-sprint-evidence/app/sprint-R37b/run-01/`）。

## 验收结果

| SC | 结论 | 证据 | commit |
| --- | --- | --- | --- |
| SC-R37b-01 | pass | sync diff 只含 R37a 两条契约 + 2 个 token；typecheck；屏测路径断言 `c%3A…` | `bfa0624ae`、`21ba09b96` |
| SC-R37b-02 | pass | `tests/plan-home-v3-screens.test.tsx`：三份 fixture 渲染、无 home 退回 R24、0 件「去认识」、准备中 | `21ba09b96` |
| SC-R37b-03 | pass | 同上：勾选（编码路径 / 请求体 / 失败回滚）、准备卡（单开 / 行表 / 复制 / gaps）、补事实（空与 81 字禁用、trim 后发送、保存后置旧）、重新生成（409 LIMIT 文案替换按钮、卡不变；成功清 stale）、空位展开、依据展开收起、轮询 ≤10 次；`tests/plan-home-v3-model.test.ts` 6 项 | `21ba09b96` |
| SC-R37b-04 | pass | 门禁总表；`gate-07/`；`r36b-regate/` | `d5ffe0a79` |
| SC-R37b-05 | pass | 全量对照、detect-changes | — |

## 自定决定（对标成熟产品，与 Web 一致）

- **页身之下的入口行、人数与分数两个口径**：照 R37a，App 不另改（待用户过目，见 R37a REPORT）。
- **409 LIMIT 的显示**：Web 只弹 toast；App 另把该卡的「情報が更新されました」行换成上限文案并去掉按钮（对标 Notion AI 额度用完时在原位置显示原因，避免用户反复点）。卡片内容不变，与 Web 数据一致。
- **轮询只在前台**：`useIsFocused` 为假时跳过这一跳（经 ref 读，effect 不以聚焦为依赖，符合 LF6 棘轮）（对标 iOS 原生应用切到别的 tab 不后台轮询）；回到前台由プラン段原有的「进入即读」接手。
- **准备中 / 补事实后强制重读**：绕过 3 分钟页面副本（否则轮询读到的是旧副本）。
- **荧光笔与下划线**：RN 嵌套 Text 画不了 CSS 的 `linear-gradient(transparent 62%, apricot 62%)` 和 1.5px border-bottom，改为按 `onTextLayout` 的行框量出标记位置、在文字下垫色条（`MarkedLines`），位置按 CSS 行内盒（字形框 ascender + descender）计算。
- **复制按钮底色**：照原型 `.op .h button{background:#fff}`（Web 用了 surface-2）；准备卡默认收起，不在门禁内。
- **文案**：`plan.home.*` 三语与 Web `planHomeCopy` 一字不差。copy-qa 对其中若干条报长度 / 语气（toast 句末「。」、按钮超长、en「We'll」等），Web 端同样存在；为保持两端一致不单改 App，登记给 R38 两端一起改。
- **类型底色**：App 用自己的 5 色轮转（blue, teal, apricot, pink, lav，从蓝开始），与 Web `flowTypeTone(index-1)` 同序。

## 发现（本 Sprint 范围外）

- **日文界面里的简体字显示成缺字方框**：hire 第二件的头像字「陈」（U+9648）显示为 `[?]`。原因是 `UiText` 在日文 iOS 上把所有 CJK 文字强制设为 Hiragino Sans，而 Hiragino 不含部分简体字；所有简体中文人名都会受影响，不止本页。需在共用的 `src/components/ui/Text.tsx` 加回退（字形不在 Hiragino 时不指定字体），已作为后续任务提出。

## 交接

**给 R38（收口）**
- 门禁清单 `repos/orbits/scripts/visual/views/app-R37b.json`、归因 `attribution-redesign-R37b.json`。App プラン段只显示当前目标：每张先切 `v16-home-<goal>`，再 `POST /api/agent/plans/v2/plan_v16_<goal>/open` 设为最近打开，等 3 分钟页面副本过期再跑（脚本思路见本 Sprint scratchpad 的 `open-goal.mjs`）。
- 真调用后在 App 上核对：准备卡行 / 画线 / `fallback` 模板、`staleSince` 与重新生成计次、409 LIMIT。
- 暂缓：依据区展开后现状库来源标题（需 `PlanV2Detail` 带 citations）；copy-qa 提示两端一起改；简体字回退（见「发现」）。

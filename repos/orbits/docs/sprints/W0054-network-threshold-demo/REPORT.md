# Sprint W0054 — 执行总结

> 报告由协调者按 Generator 原文写入（子代理写文件被拦）。

## 结果

对应 [GOAL.md](GOAL.md)。

**已验证能做到：**
- 引导第 1 步只认 3 位已确认联系人：
  - 没有跳过按钮，也没有「代价」说明。
  - 「扫名片」旁常驻「导入人脉」（去 W0053 的 `/app/contacts/new?method=csv`）；名片识别不可用时，「导入人脉」升为主按钮。
  - `PATCH {step1Skipped}` 一律返回 400 VALIDATION_ERROR。
  - 以前点过「先这样，继续」的老账号不被打回，照算完成，停在第 2 步（W54-1）。
- 引导完成状态永不收回：
  - 有 `completedAt` 的人删联系人、计划到期、清空目标，都不回示例，也不再读联系人计数和计划。
  - 首页路径第一次推导出 3 步完成时补写一次 `completedAt`；写失败不影响本次显示。
  - 这些人打开 `/app/start` 默认看到完成卡片（W54-5）。
- 看真实数据、已确认联系人不足 3 位时，只把 AI 块换成一张「再添加 N 位联系人即可更新分析」卡（扫名片 / 导入人脉），每页一张：
  - 结构、机会、洞察三个标签和概览驾驶舱各放一张卡；
  - 列表的洞察列整列隐藏；
  - 联系人详情不显示「和你目标的关系」。
  - 这些位置的数据服务端都不读、不下发。统计图、档位人数、覆盖度数字照常显示（W54-3）。
- 门槛计数和引导第 1 步、W0048a 快照共用同一个「已确认联系人」谓词（review P2-1）：要求姓名非空，空姓名记录不算。
- 联系人补回到 3 位时，按 W0048a 的恢复规则排队重算：
  - 期间显示「正在更新分析」，不回显旧快照；
  - 后台池用完被顺延时显示「明天更新分析」（W54-4）。
- 示例期「AI 人脉分析」三个标签都有完整的示例快照，带「示例」角标：
  - 结构：诊断一句、四维分布、健康四档与 30 天变化、3 条结构洞察；
  - 机会：覆盖度、补法、本周建议、待唤醒、报告卡；
  - 洞察：30 位示例联系人每人一条中英双语洞察，可排序、可筛选；
  - 概览驾驶舱也有示例句子。
- 示例期的边界：
  - 服务端对真实读取器调用 0 次。客户端只有顶栏原有的 `/api/account/me` 和 `/api/inbox/summary` 两个请求。
  - 点分组、重新分析、起草邮件都走示例拦截（W54-6）。
  - 「示例里没有 AI 人脉分析」不再出现。

**仍未实现或未验证：**
- 门槛恢复后的真实重算只在测试里验证（mock 生成器），浏览器里没有触发：触发会写 AI 账本。
- 一位还没做完引导（没有 `completedAt`）、靠一条空姓名记录凑满 3 位的用户，改动后会回到第 1 步。闩锁和 W54-1 不覆盖这类人；名片确认要求填姓名，现实中极少。

## 运行记录

- **结果：** 等协调者合并；合并树验证通过后标 completed。
- **执行者：** Generator Opus 5.5，2026-10-03。
  - PLANNER revision 4，SHA256 `e10038ab…c70c3`，开工时核对一致。
- **分支：** `sprint/W0054-network-threshold-demo`，基线 `df5b7800`。
  - 引导：`be835451`
  - 门槛与示例：`65a560d0`
  - review 修复：`361598ed`（固定最终代码 SHA）
  - 报告：由协调者提交。
- **档位：** H。
- **全量对照：** 两次都只设两个本机库变量，没有 source .env。基线的做法是只把本 Sprint 的 54 个路径恢复到 `df5b7800`，跑完再恢复回来。

  | 运行 | 测试数 | 失败 | skipped |
  |---|---|---|---|
  | 基线 | 6,638 | 82 | 73 |
  | 本分支（`361598ed`） | 6,670 | 83 | 73 |

  - 多出的唯一一条是 `notification-discovery-bounds`（Postgres 队列游标那条）。它单独重跑 2/2 通过，也不引用本 Sprint 的任何模块，按偶发处理。
  - **结论：稳定新增失败 0。**
  - 清单在证据目录：`fail-base.txt`、`fail-head.txt`、`fail-new.txt`、`flaky-notification-discovery.log`。
- **收口集：** 59 个文件全过、0 skip（`closing-r2.log`）。`npx tsc --noEmit -p .` 代码 0 错。
  - 另有 8 条 `.next/types/validator.ts` 报错，来自 3000 端口那个会话的旧构建产物，基线同样存在。
  - 没改 shared/{contract,api-schema,compute,domain}，所以不需要 App 同步；App 0 改动。
- **付费 AI：** 0 次。
  - 验证开始后（21:29Z 起），`ai_usage_calls` 和 `ai_usage_ledger` 都没有新增行。
  - 验证用的 dev server 把 `DEEPSEEK_API_KEY` 和三个生成器开关都置空，distDir 用 `.next-verify`。
- **push / 部署 / 生产迁移：** 都没做。
- **证据目录：** `~/orbit-sprint-evidence/web/sprint-W0054/run-01/`

## 验收结果

| SC | 结果 | 文件 → SHA | 主证据 |
|---|---|---|---|
| 01 第 1 步只认 3 位 | 通过 | `start-steps.ts`、`guide-state.ts`、`route-handler.ts`、`start-guide.tsx`、`start-step-cards.tsx` → `be835451` | `app-start-guide.test.tsx`、`guide-state-routes.test.ts`、`guide-start.test.ts`；`rg-step1Skipped.txt`；截图 s1 / s4 |
| 02 完成状态永不收回 | 通过 | `progress.ts`、`start-steps.ts`（`resolveStartEntryView`） → `be835451` | `guide-progress.test.ts` 闩锁用例（读取次数 spy）；`app-agent-guide-demo-page.test.tsx`（completedAt + 2 位 → 真实首页，0 次计数和计划读取） |
| 03 门槛只换 AI 块 | 通过 | `analysis-threshold(.ts, -reader.ts)`、`confirmed-contact-predicate.ts`、`service.ts`（recovering）、三个加载器、`network-analysis-gate.tsx`、列表和详情 → `65a560d0`、`361598ed` | `analysis-threshold-postgres.test.ts`；结构 / 机会 / 洞察 / 概览标签测试的 2 位、3 位夹具；`contact-card-route.test.ts`、`contact-card-page.test.ts`；截图 s3 |
| 04 示例完整快照 | 通过 | `demo-network-analysis.ts`、`dashboard/page.tsx`、组件里的 `guardWrite` → `65a560d0`、`361598ed` | `app-network-demo-pages.test.tsx`（11 个真实读取器 0 调用）、`app-network-demo-mode.test.tsx`（拦截、0 请求）、`app-network-demo-data.test.ts`（双语、无数量词、证据可追溯） |
| 05 真实页面与收口 | 通过 | — | 四组场景各有 1440 和 375 截图；控制台只有 dev HMR websocket 报错；全量对照新增失败 0；Codex review 一次 |

`analysis-threshold-postgres.test.ts` 第 2 个用例是主证据。它在阶段边界计划夹具上，把联系人删到 2 位后打开结构、机会、概览，并断言：
- 任何表 0 次 INSERT / UPDATE / DELETE；
- 快照读取 0 次；快照生成器 0 次；补细器 0 次；
- 付费 AI 0 次；
- 下发数据里没有旧句子；
- 补回到 3 位时结构标签显示「正在更新」，job 是 pending；job 改成顺延后显示「明天更新」。

**SC-05 四组场景**（3001 端口；截图在证据目录）：
- ④ 存量跳过样本：开工前在旧代码上用 PATCH 写入（`legacy-skip-sample-patch-oldcode.json`）。改动后：第 1 步 done，显示「已确认 0 位」；停在第 2 步；没有跳过入口。
- ① verify-new 0 位：
  - 第 1 步：「已确认 0 / 3」；名片识别不可用，导入是主按钮。
  - 示例三标签有内容、带角标；点分组、重新分析、起草邮件都被拦截；网络面板没有 recompute 或 reconnect-draft 请求。
  - 375 宽度无横向滚动。
- ② `--reset verify-new --guide-step1`：第 1 步 done，「下一步」进入第 2 步。
- ③ verify-plan 降到 2 位：
  - 三标签和概览各一张门槛卡，人数是真实的 2；
  - HTML 里没有旧快照句子和旧洞察；
  - 列表洞察列隐藏，详情没有洞察面板；
  - 首页是真实首页，没有引导。
  - Web 没有删联系人的 UI，所以是在本机 verify 库把 425 位联系人标为 `lifecycle_state='deleted'`，只留两位有 ready 洞察的人，结束后已 `--reset`。

**数据库测试的非 skip 输出**（运行前跑过 `assert-local-test-databases`，`ORBIT_EVENT_DATABASE_URL` 和 `ORBIT_LIFECYCLE_TEST_DATABASE_URL` 都是 `postgresql://li@localhost:5432/orbit_newui_events_20260922`）：

| 文件 | pass | skipped |
|---|---|---|
| analysis-threshold-postgres（新） | 3/3 | 0 |
| guide-progress-postgres | 3/3 | 0 |
| network-snapshot-service | 17/17 | 0 |
| network-snapshot-postgres | 6/6 | 0 |
| structure-tab-loader-postgres | 3/3 | 0 |
| opportunities-tab-loader-postgres | 2/2 | 0 |
| overview-cockpit-loader-postgres | 2/2 | 0 |
| app-contacts-dashboard-opportunities-writes-postgres | 1/1 | 0 |
| app-contacts-dashboard-overview-writes-postgres | 1/1 | 0 |
| contact-insights-postgres | 16/16 | 0 |
| contact-import-events-postgres | 1/1 | 0 |
| contact-import-layers-postgres | 3/3 | 0 |

## W54-1～6 执行结果

- **W54-1：** 新的跳过在 UI、客户端、PATCH、服务层四处都关了。存量 `step1Skipped=true` 保留只读兼容；`rg` 剩下的位置都是注释、`GuideState` 的读取字段、`contactsStepDone` 兼容分支和 snapshot 透传。
- **W54-2：** 「导入人脉」常驻；名片识别不可用且这一步没完成时为主按钮。
- **W54-3：** 门槛卡每页一张；行内位置（列表、详情）只隐藏；数字照常。
- **W54-4：** 只消费 W0048a 的恢复规则，没改阈值。快照视图新增可选的 `freshness.recovering`：恢复期 state 为 none、不带旧块。
- **W54-5：** `completedAt` 是唯一闩锁。
- **W54-6：** 示例期点分组、重新分析、起草邮件走 `guardWrite`，没有新建示例名单页。分组名单页在示例期仍重定向回结构标签。

## D39 流量

- 新增的只有一条门槛计数语句：每次 1 条，返回 11 B（本机实测，`measure-threshold.json`）。
- 出现的位置：
  - 分析页（概览和三个标签）；
  - 列表首屏（页面有联系人时）；
  - 列表翻页 API（tiers=1）；
  - 详情页（整页一次，review P3-2）。
- 按 1000 人 × 4 次 × 30 天 × 4 条路径 = 48 万次，约 **+5.28 MB/月**。
- 并入 W0053 后的三档累计：**7,847.28 / 7,907.28 / 8,386.28 MB**。
- `getCurrent()` 多读：0，没有新增计划读取（`r6-source-scan.txt`）。
- 节省没有计入，只定性说明：
  - 不足 3 位时跳过快照和洞察读取；
  - 恢复期跳过旧快照块；
  - 闩锁后的完成用户在使用示例判定的 7 个页面和 4 个 API 上，每次少读联系人计数和计划两条。

## review 处理（Codex：0×P1、2×P2、4×P3；原文 `codex-review.txt`）

- **P2-1 谓词不一致：采纳。**
  - 新建 `features/contacts/confirmed-contact-predicate.ts`，作为唯一的「已确认联系人」谓词，要求姓名非空。
  - 引导计数和名片槽位、门槛、快照共用它；`network-analysis/repository.ts` 转出原名，W0048a / W0051 的调用方不变。
  - 补了 PG 夹具：2 位有名 + 1 位空名 → 引导第 1 步不完成、门槛卡出现、快照也是 insufficient。
  - 已经靠空姓名记录完成第 1 步的老账号，由闩锁和 W54-1 只读兼容保持不变。
- **P2-2 DB 主证据缺变量会 skip：部分采纳。** 门控不改（全仓约定），本报告逐文件列出非 skip 输出。
- **P3-1 翻页 API 丢了门槛状态：采纳。** `tiers=1` 的响应带 `insightsHidden`，列表视图按页携带；App 请求的响应不变。
- **P3-2 详情页读了两次计数：采纳。** 整页解析一次，再注入列表加载器复用，测试断言只读一次。
- **P3-3 示例洞察不是真双语：采纳。** 按种子的中英原值同时构造两种语言，测试逐条断言 zh 是中文、en 不含中日文字，且两次构建结果一致。
- **P3-4 数字检查是假阳性：采纳。** 叙述去掉了全部数量词，包括阿拉伯数字、中文数字字和英文数量词。测试覆盖快照块，以及每条洞察中英两种语言的 goalRelation / nextStep。唯一例外是 `HH:MM` 钟点：真实快照校验器只拦统计数字；当前叙述里也没有钟点。

协调者裁决注：第一段 Generator 建议把谓词统一留给 W0055；因 Codex 给出了门槛边界上的真实失败场景，协调者改为本 Sprint 统一。

## 假设与额外阅读

- **自定的可逆细节：**
  - 门槛计数读失败时按「未知」照旧渲染；
  - 「导入人脉」去 `?method=csv`；
  - 门槛卡的位置：结构放在诊断位、机会替换报告卡、洞察整页、概览放在驾驶舱顶部；
  - 页面没有联系人时不读门槛；
  - 示例生成时间取东京 10:00，避免 UTC 日期显示成前一天。
- **额外读过的文件：**
  - W0048a～W0053 的 REPORT 交接节；
  - `network-analysis/{contract,service,refresh-policy,repository}.ts`；
  - 三个加载器、`contacts/insights/{read,view}.ts`；
  - `contact-card-route-service.ts`、`api/contacts/page/handler.ts`、`contacts/[id]/page.tsx`；
  - `seed-verify-accounts.ts`（reset 的清理范围）。
- **新增路径：**
  - `features/network-analysis/analysis-threshold.ts`、`analysis-threshold-reader.ts`
  - `features/contacts/confirmed-contact-predicate.ts`
  - `app/(app)/app/_demo/demo-network-analysis.ts`
  - `network-0918/network-analysis-gate.tsx`
  - 测试：`network-analysis-threshold.test.ts`、`analysis-threshold-postgres.test.ts`
- **impact：**
  - CRITICAL：`readDemoModeViewForActor`（经闩锁间接影响）、`createStorageGuideStateService`、`confirmedContactPredicate`、`NetworkAnalysisStructure`、`NetworkOpportunities`、`loadContactCardRoute`、`createContactCardGetHandler`。
  - HIGH：`contactsStepDone`、`deriveStartGuideFlags`。
  - UNKNOWN 的符号已用文本搜索补查直接调用方。签名改动都是新增可选字段。
  - 三次提交前的 detect-changes 都没有 partial / truncated。

## 验证用数据与本机库

- `--reset verify-new` 每次的指纹都 identical。
- `--reset verify-plan` 改动了 ai_usage_calls 和 contact_import_rows 两张表的非 verify 行。它们是 verify-plan 自己 W0048a 账本和 W0053 导入批次的下级行，没有账号标记，靠 FK 级联删除（`confdeltype='c'`）。
- 这次 reset 删掉了本机 verify-plan 的 ai_usage 账本 8 行，连带 6 条调用记录，其中包含 W0048a / b 的真实调用记录。那些次数和 token 已经记在各自的 REPORT 里。**以后 reset verify-plan 前，要先确认会不会删到这类记录。**
- 会话内还有一些公共 schema 写入，不是本 Sprint 的浏览器验证造成的：
  - 测试夹具（agentPreferences、event_registrations，workspace:default）；
  - 无账号的读取回执。
  - 这些造成了开工前后整体指纹不同。
- 起 dev server 前备份了 `next-env.d.ts` 和 `tsconfig.json`，结束后逐字节核对一致。

## 交接（给 W0055）

- 新用户验收一律用 `--reset verify-new --guide-step1`。不足 3 位的场景没有删除 UI，只能在本机库把联系人标为删除，用完 `--reset`。
- 选择器：
  - `data-network-analysis-gate="threshold|updating|deferred"`、`data-network-gate-missing`、`data-network-gate-scan`、`data-network-gate-import`；
  - `data-network-insight="hidden"`；
  - `data-start-import`。
- 示例快照入口：`buildDemoNetworkSnapshotView`、`buildDemoAnalysisForTabs`、`buildDemoStructureExtras`、`buildDemoOpportunitiesView`、`buildDemoInsightsView`。
- 门槛入口：`readAnalysisThreshold`、`analysisGate`、`belowThresholdSnapshotView`、`NETWORK_ANALYSIS_MIN_CONTACTS`。
- 共享谓词：`confirmedContactPredicate`（`features/contacts/confirmed-contact-predicate.ts`）。
- 快照视图新字段：`NetworkSnapshotView.freshness.recovering?`。
- 接口新字段：`/api/contacts/page?tiers=1` 的 `insightsHidden`。
- 回退：按序 revert 报告提交、`361598ed`、`65a560d0`、`be835451`。没有迁移，没有改 shared，App 0 改动。

## 需要用户决定

无。谓词的口径已按协调者裁决统一。

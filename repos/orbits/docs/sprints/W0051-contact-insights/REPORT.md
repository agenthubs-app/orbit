# Sprint W0051 — 执行总结

> 报告由协调者按 Generator 原文写入（子代理写文件被拦）。协调者注：真实 DeepSeek 演练因 PLANNER 未写上限、用户尚未批准而记 pending；代码与 mock 验收完成后合并，演练待批准后补做并追加到本报告。

## 结果

对应 [GOAL.md](GOAL.md)。

**已验证能做到：**

- **每人一条洞察，存在 `contact_insights` 表里。**
  - 内容：和关系目标的关系一句、依据、下一步，中英双语。
  - 只在数据变化时增量生成；打开列表、详情、洞察标签、机会标签都只读存储，0 次模型调用、0 次配额预留。
- **写入点只做标记，标记只落到对应联系人，并带上原因。**
  - 写 memo 或改行业／职级／地区；
  - 名片确认；
  - W0045 回填；
  - 三层更新入口；
  - 计划里关联、建立联系、取消关联、接受候选、@某人。
  - 别人的联系人不会被标。
- **改关系目标本身不重算**，只显示「目标已更新」。手动重新分析成功、或每月重新分析保存后，再统一把目标已变的行标为待更新。
- **后台任务 `contact-insights`：**
  - 每批 ≤20 人，每批记 1 次后台池操作，每次 HTTP 记 1 条子账；
  - 后台池用满时整批顺延到下一东京日 00:00，界面显示「明天更新」；
  - 没有关系目标时不调用；
  - 中途崩溃的批次标为失败，不自动重调。
- **生成期间又被标记的行不会被误清。** 用递增序号做栅栏，同一毫秒的标记也保留。
- **详情弹窗**的「和你目标的关系」有四种状态；只有过期或失败时才出现「重新生成」。
  - 两次并发点击只调用 1 次 provider、记 1 次用户主动池操作；
  - 同一版本失败两次后不再调用；
  - 用户主动池当日 10 次用满时按钮置灰，提示「今天次数已用完，明天可用」，接口返回 429 `USER_DAILY_LIMIT`。
- **「洞察」标签**（`/app/contacts/dashboard?tab=insight`）：服务端分页 30 条；可按相关度／强度档／最近往来排序，按行业／地区／强度档筛选；页码越界时按真实总数回到最后一页。
- **所有人脉列表**把「下一步（预览）」列换成「洞察」一句（≤60 字）。新增强度档筛选，在服务端用 SQL 过滤：总数、各来源计数、翻页游标在筛选下一致；没有筛选时游标与改前逐字节相同，用基线 4ea98833 生成的固定游标验证过。
- **机会标签的「待唤醒」**：洞察 ready 时，「为什么现在联系」改为显示洞察的下一步；其他状态保留 W0050 的规则拼句。
- **依据「计划需求」可以点开**，定位到计划页里对应的需求（两边共用同一个锚点函数）。

**仍未实现或未验证：**

- **真实 DeepSeek 生成演练：pending。** 原因：真实调用上限待用户批准，本 Sprint 真实调用 0 次。生产默认用 mock，只有设置 `ORBIT_CONTACT_INSIGHT_GENERATOR=deepseek` 并配置 key 才会真实调用。
- **App 界面与 App 的 typecheck 未验证。** 本 Sprint 只做了契约机械同步。
- **手机 375 宽下，所有人脉列表的「洞察」列在表格横向滚动区里。** 与改前「下一步（预览）」列的布局相同，没有单独改版。

## 运行记录

- **结果：** 等待协调者合并后标 completed。
- **Generator：** Opus 5.5，2026-10-03；Planner revision 4，SHA256 `7c9195de562ab9f4e27c4c0b7774e925cfcb1645f81dd30c8137d1aae79c7618`，已核对。
- **分支与 SHA：**
  - 分支 `sprint/W0051-contact-insights`，基线 chat-agent `4ea98833`；
  - 功能提交 `7dea7a8c`，review 修复 `f1397410`，全量回归修复 `867a2e7d`（固定最终代码 SHA），报告为本提交；
  - chat-agent 合并 SHA：见 README 运行记录。
- **档位：** H。
- **全量对照**（同一台机器、同一个本机测试库；基线是 `git archive 4ea98833` 解出的树，共用 node_modules）：
  - 基线：6536 例，fail 117，skip 73。基线多出的失败来自解出的树里缺少 orbit-app、.gitnexus 等仓外依赖，不影响「新增」判断。
  - 改后（最终代码）：6583 例，fail 81，skip 73。
  - **新增失败 0。** 对照出 2 条差异，都已查明：
    - `the entire project typechecks with zero errors`：只报 `.next/types/validator.ts` 引用不存在的 chat 路由。这是 9 月 26 日残留的 .next 缓存；把同一份缓存放进基线树后，基线同样失败（`typecheck-ratchet-baseline-with-next.txt`）。本 Sprint 的 `tsc --noEmit` 在 .next 之外 0 错。
    - `rollback 'disable' drops the trigger…`：lock timeout（55P03），全量并发跑时偶发；单独跑两次 10/10 通过（`new-fail-recheck-2.txt`）。
    - 第一轮全量出现的 3 条真实回归已在 `867a2e7d` 修复：契约目录放了运行时常量、新链接缺字色规则。另外 2 条偶发（40001 序列化冲突、日程回填）复跑通过，最终那轮全量也没有再出现。
- **付费 AI：** 真实调用 0 次，token 0。本机库 `ai_usage_calls` 近期的 deepseek 记录都早于本 Sprint，属于其他账号和其他工作（`real-calls-check.txt`）。本 Sprint 在本机库只留下 mock 产生的 released 操作，0 子账。
- **push：** 未 push。生产迁移和部署都没做。

## 验收结果

证据目录：`~/orbit-sprint-evidence/web/sprint-W0051/run-01/`

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-W0051-01 增量标记 | pass | `tests/services/contact-insights-postgres.test.ts`（16 pass／0 skip）：迁移 v1+v2、checksum 守卫；memo／补全／计划四种关联与接受候选只标对应人、幂等、带原因、他人 id 不标；读取路径 0 标记、0 调用；R-10 档位衰减不过期；同一毫秒再次标记保留；计划事务内标记失败只回滚保存点，计划写入保留。另有 `contact-memo-patch`、`contact-detail-enrichment-patch`、`business-card-ingest-v2-routes`、`tests/architecture/contact-insights-read-paths.test.ts` |
| SC-W0051-02 后台批量 | pass（mock 与 fetch 桩）；真实演练 pending | 同一个 DB 文件：25 人分 2 批、2 次 HTTP、2 条后台池 insight 操作与 2 条子账；调用前 started 已提交；请求体不含邮箱、电话、memo 正文和真实 id；越界依据丢弃；规则相关度；池满顺延；无目标；崩溃不重调。另有 `tests/services/contact-insights-unit.test.ts`（8） |
| SC-W0051-03 洞察标签 | pass | `tests/pages/app-network-insights.test.tsx`（6）；DB 分页／排序／筛选／越界总数；`app-contacts-dashboard-account-scope` 只在 `?tab=insight` 读；浏览器 1440／375 |
| SC-W0051-04 三处复用／并发／待唤醒 | pass | DB：服务与路由并发（provider 1 次、用户池 1 次）、同版本 0 次、同版本两次失败后 RETRY_EXHAUSTED 且 0 次额外调用、后台池满照常、用户池满 429。`app-network-detail-modal.test.tsx`（四种状态、置灰提示、只 POST 一次）；`opportunities-view-model.test.ts`、`app-network-opportunities.test.tsx`；`contact-card-page-postgres`（档位筛选、基线游标夹具）；`contact-card-route`、`contact-card-page`；`sync-contact-domain-postgres` 8 pass；App 四个 sync 测试 10/10 |
| SC-W0051-05 流量与收口 | pass；真实演练 pending | `traffic-d39-final.json`；见下方预算表；收口集 353 pass／0 skip；全量对照新增失败 0；Codex review 已处理；截图 13 张 |

**数据库测试逐文件非 skip 输出**（`db-tests-0skip-final.txt`）：

| 文件 | pass | skipped |
| --- | --- | --- |
| contact-insights-postgres | 16 | 0 |
| contact-card-page-postgres | 3 | 0 |
| sync-contact-domain-postgres | 8 | 0 |
| contact-search-runtime-parity-postgres | 2 | 0 |
| plans-repository | 17 | 0 |
| plan-current-view-postgres | 5 | 0 |
| network-snapshot-postgres | 6 | 0 |
| network-snapshot-maintenance-postgres | 4 | 0 |
| network-snapshot-source-version-postgres | 3 | 0 |
| opportunities-tab-loader-postgres | 2 | 0 |
| app-contacts-dashboard-opportunities-writes-postgres | 1 | 0 |
| business-card-ingest-v2-routes | 12 | 0 |
| web-runtime-migration | 1 | 0 |
| contact-owner-boundary | 3 | 0 |
| agent-plan-candidates-routes | 12 | 0 |
| plan-matching | 16 | 0 |

- 性能测试 `contact-card-growth` 需要显式开关，用 `ORBIT_CONTACT_CARD_GROWTH=1` 跑通过（1 pass／0 skip）。
- 数据库测试都在 `ORBIT_EVENT_DATABASE_URL` 与 `ORBIT_LIFECYCLE_TEST_DATABASE_URL` 指向本机测试库时运行，没有 source `.env`。

**D39 流量预算表**

实测：本机 verify-plan，一页 30 人，其中 13 人有洞察。脚本：`scripts/measure-contact-insights-traffic.ts`。

| 读取 | 每次 | 语句数 | 月度（1000 人 × 30 天） |
| --- | --- | --- | --- |
| 所有人脉列表一页（比改前多出） | +886 B | +1 | 2 次／天 → 53 MB |
| 详情一次（有洞察行；没有洞察行时只读 1 条） | 2,027 B | 3 | 3 次／天 → 182 MB |
| 洞察标签一页（13 行） | 9,608 B | 1 | 0.5 次／天 → 144 MB |
| 机会标签待唤醒（≤5 位） | 848 B | 1 | 1 次／天 → 25 MB |
| **合计（实测口径）** | | | **约 405 MB／月** |

- 按每人都有洞察、每页 30 行外推：约 944 MB／月（列表 399、标签 333、详情 182、待唤醒 30）。
- 并入 D32：W0050 后三档约 5,191／5,251／5,730 MB → **约 5,596／5,656／6,135 MB**（实测口径）；全覆盖外推约 6,135／6,195／6,674 MB。超过 1.6 GB，如实登记 D32。
- 候选瘦身：列表与洞察标签只返回当前界面语言（W51-3）。等周检实测后再定。

## 假设与额外阅读

- **上下文包之外读过的文件**（都先跑了 GitNexus impact，记录见 `impact.txt`）：
  - 账本与闸门：`features/ai-quota/{gate,ledger,constants}.ts`
  - 快照的输入与生成先例：`features/network-analysis/{new-contact-layers,layers-runtime,runtime,maintenance-task,input-source,recent-records,deepseek-snapshot-generator,snapshot-validator,repository}.ts`
  - memo 唯一写入路径：`app/api/contacts/[id]/handler.ts`
  - 补全回填 apply：`features/contacts/enrichment/backfill.ts`
  - 计划触发点改放在仓储的 `insertLog`：`features/plans/repository.ts`
  - 目标重标记点：`app/api/network/snapshot/handlers.ts`、`app/api/agent/plans/reanalyze/route-handlers.ts`
  - 维护任务注册：`features/operations/maintenance/configured-tasks.ts`
  - W0050 待唤醒：`opportunities-view-model.ts`、`opportunities-route-service.ts`
  - 计划页锚点：`iorbit-plan.tsx`
- **文件表之外新增：**
  - `features/contacts/insights/{input-source,runtime,regenerate,view,read,mark,tab-reader,limits}.ts`
  - `app/(app)/app/contacts/analysis/insights-tab.ts`
  - `network-0918/{network-insight-copy.ts, network-insight-panel.tsx}`
  - `app/(app)/app/agent/iorbit-0918/plan-anchors.ts`
  - `app/api/contacts/[id]/insight/regenerate/handler.ts`
  - `scripts/measure-contact-insights-traffic.ts`
  - 测试：`tests/fixtures/w0051-baseline-contact-cursor.json`、`contact-insights-unit`、`contact-insights-read-paths`
- **文件表之外修改：**
  - 样式与接线：`network-shell.tsx`（样式）、`network-all.tsx`、`network-opportunities.tsx`
  - `features/contacts/contract.ts`（`tierFilters`）
  - `features/network-analysis/{layers-runtime,new-contact-layers,recent-records}.ts`、`features/contacts/enrichment/backfill.ts`、`app/api/contacts/page/handler.ts`、`iorbit-plan.tsx`（只加 id）
  - 已有测试的扩展：`web-runtime-migration`、`network-snapshot-postgres`、`agent-plans-reanalyze-route`、memo／补全 PATCH、名片确认路由
- **自己定的可逆细节**（协调者已接受）：
  - 卡片 DTO 不加 `strengthTier`，W0047 的 `tiers=1` 已提供档位；只加可选的 `insightPreview`，且只在 Web 请求时附带。
  - 档位筛选下，来源计数也随筛选变化。
  - 洞察标签用页码分页。
  - 详情页没有洞察行时不读目标资料。
  - memo 的标记放在 PATCH 处理器里。
  - `runNewContactLayers` 把整批 id 都标为待更新。
  - 后台批的幂等键包含领取时刻。
  - 账本未迁移（disabled）时也顺延到下一东京日。
  - 版本没变时，重新生成返回 unchanged，0 次调用。
  - 相关度权重：61／56／30／14／9-6-3／2-1。
- **行号：** 都按开工时的 HEAD 用符号名重新定位（D46⑦）。

## review 处理

Codex review：0×P1、4×P2、2×P3。

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| P2 同一毫秒的再次标记被误清 | 采纳 | 迁移 v2：`dirty_seq`／`claimed_seq` 递增栅栏，完成／失败／中断都只在序号没变时清除；补同毫秒用例（`f1397410`） |
| P2 幂等键尾部截断 | 采纳 | `insightRegenerationKey`：完整 contactId 取 sha256 前 32 位，再接完整版本摘要；补超长 id、同前缀、版本变化的用例 |
| P2 计划需求锚点不存在 | 采纳 | 新增 `plan-anchors.ts`；计划页需求容器输出 `id={planNeedAnchorId(id)}`；补两边一致的断言，浏览器也核对过 |
| P2 数据库测试缺环境变量时静默 skip | 部分采纳 | skip 门控是全仓约定，不改；本报告逐文件列出非 skip 输出；补故障注入：同毫秒再次标记、同版本两次失败后 RETRY_EXHAUSTED 且 0 次额外调用、计划事务内标记失败只回滚保存点 |
| P3 越界页码 total 读成 0 | 采纳 | 总数与分页分开计算；加载器按真实总数改读最后一页；补 DB 与页面用例 |
| P3「旧游标仍有效」是假覆盖 | 采纳 | 用基线 4ea98833 的实现生成固定签名游标作为夹具，新实现签出的游标逐字节相同且能解码翻页 |

全量对照中发现的 2 条回归（不来自 review）在 `867a2e7d` 修复：常量移出契约目录；新链接改用自带字色与 :hover 规则的类。

## 交接

- **表：** `contact_insights`，迁移锁 `orbit:contact-insights-schema`，v1 建表，v2 加 `dirty_seq`／`claimed_seq`。
  - 主键：(workspace_id, actor_id, contact_id)。
  - 状态列：status、goal_relation、next_step、evidence、relevance、source_data_version、goal_hash。
  - 待更新与租约列：dirty_at、dirty_seq、dirty_reasons、deferred_until、ai_state、lease_owner、lease_expires_at、claimed_at、claimed_seq。
  - 记账列：usage、model、generated_at、attempts、last_error_code。
- **标记：**
  - `markContactInsightsDirty(executor, { workspaceId, actorId, contactIds, reason: "enrichment"|"memo"|"plan_link"|"goal"|"manual", now? })` → 被标的 id；表未迁移时返回空。
  - `markContactInsightsGoalDirty(executor, { workspaceId, actorId, goal })`。
  - 便捷入口：`features/contacts/insights/mark.ts`。
- **调用点：**
  - memo／补全 PATCH 处理器；
  - v2 名片确认（提交后）；
  - 回填 apply（同一事务内）；
  - `runNewContactLayers`（`markInsightsDirty` 依赖）；
  - 计划仓储 `insertLog`（保存点内）；
  - recompute 成功后、reanalyze 非回放保存后。
- **维护任务：** `contact-insights`，每轮 ≤10 批、每批 ≤20 人，租约 5 分钟。**W0055 回填时把全部联系人标为待更新即可，由这个任务消化。**
- **契约：**
  - `shared/contract/contact-insight.ts`：`ContactInsight`、`ContactInsightState`、`ContactInsightEvidence`、`ContactInsightText`（只有类型）；
  - schema：`shared/api-schema/contact-insight.ts`；
  - 卡片 DTO 新增可选字段 `insightPreview?: {zh,en}`；
  - 文字上限常量在 `features/contacts/insights/limits.ts`。
- **读取：**
  - `readContactInsightRows`、`readContactInsightPreviewTexts`、`readContactInsightNextSteps`、`readContactInsightDetail`（`features/contacts/insights/read.ts`）；
  - `contactInsightView`（`view.ts`）；
  - `readContactInsightsTabPage`（`tab-reader.ts`）；
  - 待唤醒接线：`readDormantInsights` → `applyDormantInsights`。
- **幂等键：**
  - 后台批：`insight:auto:<actor>:<内容指纹>:<领取时刻>`；
  - 重新生成：`insight-regen:<sha256(contactId) 前 32 位>:<sourceDataVersion>`，失败后再试一次用 `:retry`。
- **App 影响：**
  - 同步副本：`src/api/contract/{contact-insight.ts, contact-card-page.ts, index.ts}`、`src/api/schema/{contact-insight.ts, contact-card-page.ts}`；
  - 四个 *-sync 测试 10/10；
  - App 请求不带 `tiers=1`，响应不变；离线同步卡片不变（`contactCardJsonSql` 未改）；
  - 未验证：App 界面与 App typecheck。
- **需要授权：**
  - 真实生成演练的调用上限（推荐 ≤3 次）；
  - 生产迁移 v1+v2 与 `ORBIT_CONTACT_INSIGHT_GENERATOR=deepseek`，随 W0055 一起授权；
  - D32 登记。
- **回退：** 按序 revert 本报告提交、`867a2e7d`、`f1397410`、`7dea7a8c`，再在 App 端重新执行 `npm run sync:contract`。表是追加的，旧代码不读它。
- **本机库遗留：**
  - 已执行 `contact_insights` 迁移 v1、v2；
  - verify-plan 有 13 行 mock 洞察（含失败、顺延、过期样例）；
  - 账本里 1 条 released 的 insight 操作。

# Sprint W0048a — 执行总结

> 报告由协调者按 Generator 原文写入（子代理写文件被拦）。

## 结果

- **已验证能做到：**
  - **按人存快照**：每人恰好一份当前版本，保留最近 12 版。分析接口 `GET /api/network/snapshot` 只返回请求语言的文字和依据，同时给出「是否过时 / 新增几人未纳入 / 后台任务状态」和当日 AI 额度；他人读不到；示例期一条库语句都不跑。
  - **只在需要时生成**：资料没变时连开多次 0 次调用；新增 2 人只提示「新增 2 人未纳入」；再加 1 人自动重算 1 次。目标改了自动重算；不足 3 人不生成；从 2 人补回 3 人自动重算。快照重算不改计划。
  - **两池额度**：所有受计量的 AI 调用都记账本，一次操作一行、每次 HTTP 一条成本记录。
    - 后台池每人每天 60 次，用满后顺延到次日 0 点（东京），显示 retryOn。
    - 手动重新分析每天 3 次；用户池每天总共 10 次；超出返回 429，0 次调用。
    - 两池互不占用；回填用的 system 池不计入。
  - **memo 提取已开闸**，计入后台池；维护任务会有界补扫漏提取的 memo（按正文 hash）。
  - **新联系人三层入口 `runNewContactLayers`**：按 ≤20 人一批补全，不覆盖用户填的值；规则匹配入队 1 次；随后做一次快照判定。后台池不够时剩余部分次日继续。
  - **真实 DeepSeek 已跑通**：首次快照、阈值重算、手动重新分析、memo 提取都成功；文字里没有原始 id，也没有统计数字。
- **仍未实现或未验证：**
  - 没有界面：报告卡在 W0050，不足 3 人卡在 W0054，计划接入在 W0048b。
  - 生产迁移与环境变量没动。快照生成器在生产默认是 mock（W48-9）。
  - GET 路由会多读一次资料（用于示例期判定和版本计算），这部分字节没有单独实测。

## 运行记录

- 结果：completed（待协调者合并并验证合并树）
- Generator：Opus 5.5；日期 2026-10-02；Planner revision 4（SHA256 `84964e42…cbab0`）
- 分支 `sprint/W0048a-network-snapshot-quota`，基线 `7e944c70`
- 提交：功能 `dedfcb72`，review 修复 `578d5635`（固定最终 SHA）；chat-agent 合并 SHA 见 README 运行记录
- 档位：H
- 全量对照：6429 tests，81 fail，与基线 81 fail 对照新增 0。有 2 条 sync-revision-migration 偶发失败互换，单独跑该文件 3 次 10/10。
- 付费 AI：共 6 次 HTTP，按子账 operation_id 聚合：

| 操作 | 池 | 输入 token | 输出 token |
|---|---|---|---|
| 自动首次快照 | 后台池 | 3,688 | 1,186 |
| 自动阈值重算 | 后台池 | 3,780 | 1,008 |
| 手动重新分析 | 用户池 | 3,780 | 1,327 |
| memo 提取 | 后台池 | 200 | 43 |
| 手动重新分析（提示词 v2） | 用户池 | 3,830 | 837 |
| 手动重新分析（别名 v3） | 用户池 | 3,253 | 641 |
| **合计** | | **18,531** | **5,042** |

- push：未做
- 证据目录：`~/orbit-sprint-evidence/web/sprint-W0048a/run-01/`
  - impact 与提交前检查：`impact-pre.txt`、`detect-changes-*`
  - 收口集与类型检查：`closing-set-1/2.txt`、`tsc-1/2.txt`
  - 全量对照：`full-baseline.txt`、`full-after.txt`、`fail-*.txt`、`new-failures.txt`、`new-fail-recheck.txt`
  - 流量：`traffic-d39.json`、`traffic-d39-final.json`
  - 真实调用：`real-deepseek-run*.jsonl`、`real-calls-aggregate.txt`
  - 本机迁移与 dev server 验证：`local-migration.txt`、`curl-get-1/2.json`
  - review 原文：`codex-review.txt`

## 验收结果

| SC | 结果 | 证据 |
|---|---|---|
| 01 存储与读取 | pass | `tests/capabilities/network-snapshot-postgres.test.ts`：迁移可重跑且有 checksum 守卫；归档与修剪在同一事务；投影不取 `included_contact_ids`；已删联系人剔除；quota；示例期 0 条语句。另有 curl dev server 留证；流量见下方 D39 一节。 |
| 02 生成与校验 | pass | `network-snapshot-validator.test.ts`：编造 id、单语、带分数、全无依据、id 泄漏、统计数字、别名。`network-snapshot-service.test.ts`：R-3 spy；DeepSeek 假 fetch；非 2xx 计次；别名映射。 |
| 03 三层更新与触发 | pass | `network-snapshot-service.test.ts`：调用次数 [0,0,1]、全分支、并发单飞、R-6 阶段边界。`network-snapshot-source-version-postgres.test.ts`：R-5，有和没有 sync_revision 两种库。`network-new-contact-layers.test.ts`。 |
| 04 两池账本 | pass | `ai-usage-ledger-postgres.test.ts`：60 次后顺延、东京日边界、3／10 次、两池隔离、并发、epoch、memo 开闸、非 2xx。service 测试：R-2 ①～④、异常结算、0 响应重试上限。路由测试：两种 429 与 409。`network-snapshot-maintenance-postgres.test.ts`：次日补全、memo 补扫、缺表 skipped。 |
| 05 真实调用与收口 | pass | 6 次 HTTP（≤8），token 表见上；生产未动；全量新增失败 0；Codex review 已处理。 |

**D39 流量（200 位联系人、严格 sync_revision，`traffic-d39-final.json`）**

- 打开一次分析页：5～6 条语句、1,810 B（HTTP 响应体 1,168 B）。按 1000 人 × 30 天：每天 1 次 +54.3 MB/月，每天 3 次 +162.9 MB/月。
- 一次生成：32 条语句、79,118 B（改前 95,041 B）。每人每周 1 次约 +339 MB/月；每天 1 次上限约 +2,374 MB/月。
- 并入 README D32 三档（3,481／3,541／4,020 MB）：
  - 每天打开 1 次：约 3,535／3,595／4,074 MB
  - 每天打开 3 次：约 3,644／3,704／4,183 MB
  - 每天打开 1 次再加每周生成 1 次：约 3,874／3,934／4,413 MB
- 三档都超过 1.6 GB，**登记 D32 周检**（协调者已定）。
- 瘦身候选：生成时计划输入的联系人读取占 52 KB，可改为只取所需列；全部已确认 id 加上选中人的职级与地区还有 18.8 KB。

## 假设与额外阅读

**上下文包之外读过的文件**（都是只读）：
- memo 提取：`memo-extraction/{store,job,provider}.ts`，以及 `app/api/contacts/[id]/handler.ts` 的排程部分
- 强度与时间线：`relationship-strength/{read-model,timelines,rules}.ts`，`relationship-timeline/build.ts`
- 存储：`shared/storage/{transactional-postgres,live-record-store,postgres-live-record-store,live-database-config}.ts`
- 示例期判定：`app/(app)/app/_demo/demo-guide-view.ts`
- 计划：`plans/{matching-migrations,matching-runtime,service-factory,contract}.ts`，`agent/plans/bootstrap/route-handlers.ts`
- 其他：`contacts/enrichment/*`，`sync/commit-order-lock.ts`，测试夹具 `plan-matching-harness`、`sync-revision-fixture`

**PLANNER 文件表之外新增或修改的路径**：
- `features/network-analysis/{layers-runtime,recent-records}.ts`
- `features/contacts/memo-extraction/rescan.ts`
- `app/api/network/snapshot/handlers.ts`
- `tests/support/network-analysis-harness.ts`
- `tests/services/network-snapshot-maintenance-postgres.test.ts`
- 修改 `features/contacts/memo-extraction/provider.ts`（review P2-2）
- 修改 `tests/services/web-runtime-migration.test.ts`（期望清单加上新表）

**可逆细节的选择**：
- 拒绝结果加可选的 `limit` 字段（manual／user／background），路由据此区分两种 429。
- 429 用 envelope 的 CONFLICT 错误码加 `context.reason`（`MANUAL_REFRESH_LIMIT`／`USER_DAILY_LIMIT`），不新增 AppErrorCode。
- released 的操作被同键重放时重新开启，进入新的 epoch；当前 epoch 的全部子账（包括 no_response）严格不超过 `max_calls`，历史子账保留。
- `includedContactIds` 记本人全部已确认联系人；模型只看前 ≤200 位。
- 每个块（包括 diagnosis）都必须至少有 1 条有效依据。
- mock 不发 HTTP，结算为 released，不计次。
- 示例期 GET 返回 `state: "unavailable"`，recompute 返回 403 `DEMO_MODE`。
- job 租约 180 秒，0 响应重试最多 3 次。
- memo 补扫每轮最多 10 条，只在配置了 provider 时执行。
- 提示词版本为 `network-snapshot-2026-10-v3`。
- 本机库没有 sync_revision 列时，版本算法退回到 `updated_at` 口径（与 W0047 的来源戳一致）。

## review 处理（Codex：2×P1、6×P2、1×P3）

| 意见 | 判断 | 处理 |
|---|---|---|
| P1-1 租约回收会并发发出第二次付费请求 | 采纳 | 自动路径幂等键固定为 `snapshot:auto:<actorId>:<createdKey>`。领取 SQL 遇到 job 上的操作还有进行中的请求（started 且在租约时窗内）就不回收；服务里同样情况下 job 延后。job 上的操作：没发过请求就复用，0 响应的就同键重开，已计次的就结束 job。测试改为断言只发 1 次 HTTP、只有 1 条操作。 |
| P1-2 未预期异常不进入 attempt 结算 | 采纳 | `processClaimedJob` 从二次判定到写库的所有异常出口都结算当前操作，并原子地把 attempt 加 1，到 3 次删除 job。新增「writeSnapshot 抛错 → 只 1 次 HTTP、job 删除」测试。 |
| P2-1 max_calls 实际放宽到 3 倍 | 采纳 | 迁移 v2 引入 reservation epoch。新增第三次重放、不同键连续无响应两个测试。 |
| P2-2 非 2xx 被记成 no_response | 采纳 | `deepseek-json-chat` 和 memo provider 只要拿到 Response 就记 responded（没有用量时 token 记 0）并计次；只有连接失败和超时记 no_response。有对应测试。 |
| P2-3 原始 id 进入模型文案 | 采纳 | 模型只看到短期别名 C／R／N，响应回来后反向映射成真实 id。校验器丢弃文字里含原始 id、记录引用、UUID 或别名的块。提示词把目标、姓名等字段标明为不可信数据。真实调用 1 次验证文字干净。 |
| P2-4 mock 快照持久化了人数统计 | 采纳 | mock 文字去掉所有数字。校验器丢弃含百分比、score／分数、「数字 + 位／人」或「数字 + contacts／people」的块；目标原文和需求标题里的数字豁免。有对应测试。 |
| P2-5 memo 补扫没有比较 bodyHash | 采纳 | 补扫候选在 SQL 里用 noteId 加正文 hash 生成键，空白字符集与 JS `trim` 一致，并有测试证明与 `memoExtractionKey` 逐字相同。新增「旧正文已成功、新正文无记录」测试。 |
| P2-6 attempt 上限的更新和删除不在同一事务 | 采纳 | `releaseJob` 在一个事务里锁行、加 attempt、决定删除或回 pending。 |
| P3 生成路径读取过多 | 部分采纳 | 时间线只读选中的人、每人每来源 2 条；全部 id 用窄列查询；职级与地区只为选中的人投影。一次生成从 95,041 B 降到 79,118 B。更大的瘦身列为候选。 |

协调者另定：流量按惯例登记 D32；memo 提取沿用「迁移即开关」（GOAL 要求 memo 开闸，W48-9「生产仍为 mock」只针对快照生成器），由 W0055 生产迁移授权时一并知情。

## 交接（给 W0048b、W0049～W0055）

**表**（迁移锁键 `orbit:network-analysis-schema`，版本 1、2）：
- `ai_usage_ledger`：一行一次操作。列：id、actor_id、usage_day（东京）、pool（user／background／system）、purpose（plan／plan_refine／snapshot／memo_extraction／insight／enrichment）、trigger（auto／manual／plan）、idempotency_key（每人唯一）、status（reserved／succeeded／failed／released）、max_calls、epoch。
- `ai_usage_calls`：一行一次 HTTP。主键 (operation_id, seq)；另有 epoch、provider、model、status（started／responded／no_response）、input_tokens、output_tokens。
- `network_analysis_snapshots`：每人一份 current，保留 12 版。文字按语言分列 `narrative_zh`／`narrative_en`；依据按块 key 存在 `evidence`；`included_contact_ids`；`operation_id`。
- `network_analysis_jobs`：主键 (actor, kind)，kind 为 snapshot 或 enrichment；租约列、attempt_count、operation_id、contact_ids、source_key。

**契约**（`features/network-analysis/contract.ts`）：
- `NetworkAnalysisSnapshot`，`blocks` 的种类为 diagnosis／insight／gap／plan。
- `NetworkSnapshotView`：`state`、`blocks[]`（只带请求语言的 text 与 evidence）、`freshness { stale, newContactCount, job, retryOn? }`、`quota { manual, user, background }`，单位都是「次操作」。

**sourceDataVersion**：`sha256(["network.snapshot@2", promptVersion, contactsAnalysisGraphSourceDataVersion(graph, profile), planNeedVersion, strengthVersion, [timelineVersion, planLogVersion]])`，各来源算法见 `source-version.ts`。

**判定**：`decideSnapshotRefresh` 按顺序为 insufficient(<3)、first、fresh、goal_changed、从不足 3 人恢复、threshold（新增 ≥3 或 ≥ceil(20%)）、stale。

**入口**：
- `generateSnapshotNow({ actorId, trigger, origin, planId?, operationId, now })` → `{ snapshot | null, callsResponded, error? }`。调用方持有操作并结算；本入口只登记子账。
- `runNewContactLayers({ actorId, contactIds, sourceKey, now, budget? })`。
- 仓储 `getCurrent(actorId, { languages })` 给需要双语的调用方。
- 配置入口 `getConfiguredNetworkAnalysisRuntime()`。

**账本**：
- `reserve` → `{ ok, operationId } | { ok: false, reason: disabled | daily_limit, retryOn?, limit? }`；`beginCall`；`endCall(callId, usage | null)`；`finish(operationId, succeeded | failed)`。
- 「谁持有谁结算」：拿到 ≥1 次响应才计次，否则 released；同键重放 released 的操作会重开新 epoch。
- `max_calls`：计划 4，其余 1。
- 常量：`USER_POOL_DAILY_LIMIT` 10、`MANUAL_REANALYSIS_DAILY_LIMIT` 3、`BACKGROUND_POOL_DAILY_LIMIT` 60、`AI_QUOTA_BATCH_SIZE` 20。

**API**：
- `GET /api/network/snapshot?lang=zh|en`
- `POST /api/network/snapshot/recompute`：body 可带 `{ idempotencyKey? }`，maxDuration 120。错误：429 `MANUAL_REFRESH_LIMIT`／`USER_DAILY_LIMIT`；409 `INSUFFICIENT_CONTACTS`；403 `DEMO_MODE`；503。

**维护任务**：`network-snapshot`，处理到期 job、顺延的补全和 memo 补扫，每轮各 ≤10 条；表不存在时 skipped。

**生产需设的环境变量**：`ORBIT_NETWORK_ANALYSIS_GENERATOR=deepseek`。等 W0055 授权后再设，现在生产默认 mock。

**需要授权时一并知情**：**W0055 执行生产迁移时，memo 提取会随之对生产开启 DeepSeek 调用（计入后台池 60 次/日）。**

**本机库遗留**：
- 已执行迁移 v1 和 v2。
- verify-plan 留有：3 位种子联系人 `contact:w0048a-seed:1..3`、5 版快照、账本行，以及 1 条 memo 提取写回。
- 本机 dev 环境保存 memo 现在会真实调用 DeepSeek（计入后台池）。

**回退**：按序 revert `578d5635`、`dedfcb72`。新表是追加的，旧代码不读它们，可以留着；revert 后闸门回到「始终拒绝」。

**用户决定**：无新增。D32 登记和「迁移即开关」由协调者按惯例已定。

# Sprint W0057 — 执行总结

协调者代写（Generator 写入 REPORT 被权限拦截，内容取自 Generator 最终回报）。

## 结果

- 已验证能做到：名片确认后，在请求之外当场生成「为什么是 TA」，本机浏览器实测确认后 3.6～9.9 秒可见（mock 生成器）；重新分析计划会为缺行的已确认联系人补建洞察并立即生成（1,050 人分页已验证）；失败可见并自动重试；心跳链在新部署上线后转到新代码；详情页不再受「已确认联系人 ≥3」门槛限制。
- 仍未实现或未验证：真实 DeepSeek 端到端未跑（0 次，见运行记录）；超过 7 天且无洞察行的旧联系人会显示「正在生成」，需 W0055 回填授权后才补齐；其他自续队列消息（提醒唤醒等）可能同样停在旧部署，未在本 Sprint 修。

## 运行记录

- 结果：completed
- Generator：Claude Opus 5.5 ／ 2026-10-03；Planner revision 2
- 分支 `sprint/W0057-insight-instant-generation`；功能 SHA `05d20df0`、`a4ed8624`；`chat-agent` 合并 SHA：等待协调者
- 档位 H；全量对照：基线 60 失败，分支 25 失败，新增 2 个，判定非本 Sprint 引起（typecheck 来自过期 `.next/types`，排除后 `tsc` 0 错误；心跳并发断言为原有满载时序竞争，基线与分支各压测 24 次均未复现——判断而非证明）
- 付费 AI：0 次，0 token（用户已批准 W57-A ≤5 次，Generator 未使用）；push：未 push

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-01 确认即生成、请求不等模型 | pass | `tests/services/contact-insights-instant-postgres.test.ts`（orbit_test，11 项 0 skip）、`business-card-ingest-v2-routes`、`contact-insights-instant-unit` |
| SC-02 详情可见、去门槛 | pass | 弹窗组件测试、状态接口测试、架构测试；`~/orbit-sprint-evidence/web/sprint-W0057/run-01/` 1440/375 截图与 `browser-timing.md` |
| SC-03 配额池、幂等、补行 | pass | ledger、reanalyze、profile 测试与 Postgres 测试 |
| SC-04 失败自动重试 | pass | Postgres 测试（含中断租约进入同一重试排期） |
| SC-05 心跳跟随新部署 | pass | `tests/services/maintenance-heartbeat-deployment.test.ts`（orbit_reminder_test，0 skip） |

## 假设与额外阅读

- 重试按 SC-04 做成 3 次尝试、排期 5／10 分钟；W57-3 正文写的 5／10／20 与 SC 不一致，以 SC 为准。
- 即时生成幂等键用领取序号而非 `retry_count`，避免新一轮误撞上一轮已结束的同版本操作。
- impact：CRITICAL `createPostgresAiUsageLedger`、`contactInsightView`、`ensureMaintenanceHeartbeat`；HIGH `markContactInsightsDirty`、`ensureConfiguredMaintenanceHeartbeat`、`bootstrapMaintenanceHeartbeat`、`ensureMaintenanceHeartbeatSchema`；两个 UNKNOWN 已文本搜索确认调用方。

## review 处理（仅 H 档）

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| Codex P2：首次设目标触发的即时洞察 `after()` 可能被 `/api/profile` 默认时长截断 | 采纳 | `a4ed8624` 给 `/api/profile` 加 `maxDuration = 120` |

## 交接

- 新增 `claimForActor`（只领本人待更新行，优先本次 contactIds，补满 ≤20）；即时生成记 `pool: "user"`、`purpose: "insight"`、`trigger: "auto"`，独立每日 20 次，不占 D45 的 10 次（D62）。
- `contact_insights` 迁移 v3 新增 `retry_count`；心跳表新增部署标识两列（随部署自动补）。W0058 在同一次洞察调用里加推测字段时复用这条链路。
- 需要授权：push 与部署；生产迁移 `contact_insights` v3；部署后核对 `orbit_maintenance_heartbeat.last_result` 的 `deploymentId` 与 `taskNames` 含 `contact-insights`；回滚到旧部署时删除心跳链行让其重建。

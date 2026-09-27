# Sprint W0007 — 计划的结构化存储

**Plan revision:** 2（2026-09-28 按 Codex review 修订）。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RW-09。**单一目标:** 新增 plans / plan_items / plan_log 三张表、仓储、服务与 REST 接口；同一时间一份生效计划，版本化，四类对象可单独更新并自动写进展记录。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时的 `chat-agent` HEAD；前序 Sprint 的 REPORT：无。
**进入条件:** 数据库测试读 `ORBIT_EVENT_DATABASE_URL`，必须是本机专用测试库（2026-09-28 核对 `.env.local` 指向 `localhost:5432`）；运行前先跑 `node scripts/assert-local-test-databases.mjs`，REPORT 须证明仓储测试未被 skip。生产库执行迁移需要用户单独授权；本 Sprint 只交付迁移与本地证据。

## 范围与文件

- 读取：`features/acquisition/business-card-ingest-v2/migrations.ts`（迁移写法：advisory lock + 自带 schema_migrations 表 + checksum）、`scripts/migrate-web-runtime.ts`、`scripts/setup-minimal-staging.ts`、`tests/capabilities/business-card-ingest-v2-repository.test.ts`（随机 schema 的仓储测试写法）、`app/api/agent/ledger/route.ts` 与 `app/api/_shared/agent-request-context.ts`（认证与 envelope）、`shared/api/envelope.ts`。
- 修改：`scripts/migrate-web-runtime.ts`、`scripts/setup-minimal-staging.ts`（接入新迁移）。
- 新建：`features/plans/contract.ts`（Plan / PlanItem(kind: action|network_need|info|event) / PlanLog 类型与状态机：行动 未开始→进行中→完成；人脉需求的联系人关联 已关联→已建立联系；信息可填答案；活动 推荐→已报名→已参加，取消报名允许 已报名→推荐）；`features/plans/migrations.ts`（三表：plans 含 version、status active/archived、goal_snapshot、horizon、analysis jsonb、source_session_id、starts_on；plan_items 含 plan_id、phase、kind、suggested_week、status、linked_contact_ids、linked_event_id、answer、criteria jsonb、sort_key；plan_log 含 plan_id、item_id、kind auto/manual、body、actor、created_at，以及结构化引用 linked_contact_ids、linked_event_id、target_item_id 与 idempotency_key（唯一），后续 Sprint 不得从 body 反解引用；「每个用户仅一份 active」用部分唯一索引）；`features/plans/repository.ts`、`features/plans/service.ts`、`features/plans/service-factory.ts`（API 与 route service 只经 factory 取实现；live 依赖缺失时 fail closed）；`app/api/agent/plans/`（GET current、POST 新版本、PATCH item、POST log）；`tests/capabilities/plans-repository.test.ts`、`tests/api/agent-plans-routes.test.ts`。
- 排除：计划生成（W0008）、界面（W0009）、匹配（W0010）；生产迁移；把 ledger 迁移到计划。

## 验收契约（最多五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0007-01 | 迁移在本地库正向执行、重复执行幂等、checksum 变化时报错 | 仓储测试（随机 schema） |
| SC-W0007-02 | 同一用户同时只能有一份 active 计划；创建新版本时旧版本归档，已完成的行动与已关联的联系人按规则带入新版本 | 仓储／服务测试（含并发创建两份 active 的反例） |
| SC-W0007-03 | 四类对象的状态变更只接受合法转移；每次变更自动写一条 auto 进展记录；手动记录可关联联系人／活动 | 服务测试 |
| SC-W0007-04 | 接口需要登录且只能读写本人计划；统一 envelope；非法转移返回 4xx 不写库 | `tests/api/agent-plans-routes.test.ts`（未登录、他人计划、非法转移各一例） |
| SC-W0007-05 | 不引入新的回归 | 一次 `npm test` 全量与基线对照；typecheck |

## 一次 Generator 的执行顺序

1. 登记 run-01、Planner 哈希与基线；确认前序 Sprint 已 completed。
2. 对「修改」清单中的符号批量 GitNexus upstream impact；HIGH/CRITICAL 先报告，`UNKNOWN` 用文本搜索补查。
3. 按 SC 顺序写失败测试 → 最小实现 → 定向 GREEN；最多两轮本地修复。
4. 可见变化在浏览器桌面 1440 / 手机 375 各验证一次，截图存 `~/orbit-sprint-evidence/web/sprint-W0007/run-01/`。
5. 路径限定暂存 → `detect-changes --scope staged` → `sprint/W0007-plan-storage` 提交 → REPORT → 合并回 `chat-agent` → 合并树复跑收口集。

## 最小测试与检查

- 档位：H（新表、迁移、写接口、跨用户隔离）。
- 开发定向集：`plans-repository`、`agent-plans-routes` 测试。
- 操作链收口集：上述测试 + typecheck + 一次全量基线对照。
- 不运行：生产迁移；App 端。

## 失败与交接

报告写明迁移文件、本地执行证据、生产执行步骤（待授权）、接口清单与示例响应。

# Sprint W0007 — 执行总结

## 目标实现情况

- 本轮要实现：计划能按阶段、行动、人脉需求、要获得的信息、活动结构化保存、更新和版本化。
- 已验证能做到：
  - 新表 `plans`、`plan_items`、`plan_log`、`plan_commands`（命令回执）与 `plans_schema_migrations`；迁移写法照搬名片 v2（advisory lock、checksum 守卫），已接入 `scripts/migrate-web-runtime.ts` 与 `scripts/setup-minimal-staging.ts`（SC-01）。
  - 每人只有一份生效计划（部分唯一索引 + 服务层按人加锁）；新版本继承已完成的行动、已关联／已建立联系的联系人、有答案的信息、已报名／已参加的活动，旧版本归档只读（SC-02）。
  - 四类条目状态机：行动 未开始→进行中→完成（可直接打勾、可撤销完成）；活动 推荐→已报名→已参加，取消报名 已报名→推荐；联系人两级 已关联→已建立联系；信息可填答案。每次真实变化自动写一条带结构化引用的进展记录（SC-03）。
  - 幂等：带 key 的每个请求（包括「状态没变」的请求）都在同一事务写回执；同 key 同请求回放首次结果，同 key 不同请求 409（Codex review 后补）。
  - 数据库层身份约束：日志与回执对条目的外键都绑定 (workspace, actor, plan, id)，跨用户、跨计划引用在库层即失败（Codex review 后补）。
  - 引用归属：新建版本、关联联系人、手动记录里的联系人必须是本人的、活动必须是已发布的 canonical 活动，否则 404 且不写库（Codex review 后补）。
  - 接口 `GET /api/agent/plans/current`、`POST /api/agent/plans`、`PATCH /api/agent/plans/items/[itemId]`、`POST /api/agent/plans/log`：需登录、只读写本人、统一 envelope，身份或服务解析抛错也返回 envelope（SC-04）。
- 仍未实现或未验证：
  - 没有界面（W0008／W0009 负责）。
  - 被拒绝的请求（非法转移、引用不存在）不写回执——为满足「4xx 不写库」。代价：一个当初被拒的旧请求若在状态变化后重放，可能变成合法而生效。
  - `createVersion` 的 `creationKey` 未做请求指纹（同 key 直接返回已保存的一份）。
  - 生产库迁移未执行（需用户授权：`npx tsx scripts/migrate-web-runtime.ts`）。

## 运行记录

- 原需求：RW-09
- 结果：completed
- run：run-01；Generator：子代理；协调者：Claude 主会话；2026-09-28
- Planner revision：2
- 分支：`sprint/W0007-plan-storage`；功能 SHA `52ba4e40`；全量 5250 条 42 失败，与上一基线新增 0
- 本机 dev 库：子代理对本机 `localhost:5432` 的开发库执行了迁移（纯新增表）；review 修复后在确认 4 张计划表均为 0 行的前提下删表重建一次。证据在 `~/orbit-sprint-evidence/web/sprint-W0007/run-01/`。
- push：未执行

## 改了什么

| 功能 | 文件 |
| --- | --- |
| 契约、状态机、错误原因、引用校验接口 | `features/plans/contract.ts` |
| 迁移 | `features/plans/migrations.ts` |
| 仓储（Postgres + 内存） | `features/plans/repository.ts` |
| 业务规则 | `features/plans/service.ts`、`validators.ts` |
| 引用归属校验（live：联系人查 `orbit_records`，活动查 canonical 目录） | `features/plans/reference-validator.ts` |
| factory | `features/plans/service-factory.ts` |
| 接口 | `app/api/agent/plans/route-handlers.ts` 及四个 `route.ts` |
| 迁移入口 | `scripts/migrate-web-runtime.ts`、`scripts/setup-minimal-staging.ts` |
| 文档 | `docs/architecture/modules/plans.md` |
| 测试 | `tests/capabilities/plans-repository.test.ts`（真实 PG）、`tests/services/plans-service.test.ts`、`tests/api/agent-plans-routes.test.ts`、`tests/support/plan-fixture.ts`、`modular-boundaries`、`web-runtime-migration` |

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-W0007-01 | pass | PG 测试：正向建表、重复执行幂等、checksum 篡改报错；`web-runtime-migration` 在本机库跑完整 CLI |
| SC-W0007-02 | pass | PG：并发创建只留一份 active、creationKey 并发只存一份、继承规则；内存服务同规则 |
| SC-W0007-03 | pass | 服务测试 22 条（转移矩阵、非法转移不写、幂等回执、同 key 不同请求 409）；PG 测试结构化引用与并发幂等 |
| SC-W0007-04 | pass | 接口测试 8 条（401、他人 404、非法转移 409 前后数据一致、坏输入 400、服务不可用 503、抛错仍是 envelope、跨用户引用 404） |
| SC-W0007-05 | pass | 定向集 55 条全过、0 skip（导出本机 `ORBIT_EVENT_DATABASE_URL`，loopback 守卫通过）；`tsc` 0；全量对照见下 |

- 说明：标准 `npm test` 不加载 `.env.local`，其中的 PG 测试会按仓库惯例跳过；本 Sprint 的 PG 证据来自导出本机库变量后的定向运行（0 skip）。

## Codex 代码 review 与处理

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| 无变化请求不存幂等键，延迟重试会覆盖后续修改 | 采纳 | `plan_commands` 回执（含 noop），同 key 不同请求 409 |
| 标准 `npm test` 下 PG 测试被跳过 | 不采纳改为失败（仓库惯例为缺库即跳过） | 以 0 skip 的定向运行作为证据 |
| 日志外键未绑定 actor 与 plan | 采纳 | 复合外键 + 原始 SQL 跨用户／跨计划反例 |
| 联系人／活动引用只校验格式 | 采纳（原定 W0008，但 W0010 会直接调用关联接口） | 注入按 actor 的引用校验器，三个入口统一 404 |
| 身份／服务解析抛错绕过 envelope | 采纳 | 纳入统一异常边界 + 测试 |

## 交接

- 给 W0008：`resolvePlanService` 与 `createVersion`（带 `creationKey`、`basePlanId`）；引用校验已在服务内。
- 给 W0009／W0010／W0012：`phases`、`contact_links`（两级状态与关联时间）、`deferral_count`、`plan_log.seq` 等字段已预留。
- 费用：0 次付费 AI 调用。

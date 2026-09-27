# Sprint 0113 — 同步地基（断网第 0 期，上半）

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** 「断网也能用」第 5 步办法一（说明书）、办法二（先装检查，整类重抄等需要时再接）、办法三（专用表取号机）；第 8 步决定 1、4（检查覆盖批量脚本）。承接历史 0033 中「工作区域类别未注册、没有持久删除/撤权日志」的基础部分。
**同一目标下的必要补充（报告须标明）:** 通用 `upsertRecord` 在冲突更新时 `user_id = excluded.user_id`，不传主人的更新会把主人清空（`shared/storage/postgres-live-record-store.ts:434`，另有 3 处同样写法）——主人检查以它为前提，必须先修。
**单一目标:** 注册表 v2 + 主人/身份检查 + 专用表流水号与读取，现有三类行为不变。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 0112 合并后的 `chat-agent`（开工时追加提交号）。
**进入条件:** 0108 已完成（写入取锁 + 严格流水号）。

## 已查明的事实（2026-09-27）

- 注册表 `repos/orbits/features/sync/domain-registry.ts`（v1，三类；:6-7 注释说明工作区域类别有意未注册）；页读取 `domain-read-service.ts:34-58` 只读万能表 `user_id = 本人`；`domainGeneration` = hash(纪元, 注册表版本, schema 版本)（:60-62）；游标 v2 绑定注册表版本（`domain-cursor.ts:41`）。纪元由本人的 auth_users/accounts/permissions 行派生（`authorization-epoch.ts:22-52`），不分类别，不存储。
- App：`src/data/sync/sync-coordinator.ts:25` 写死 `REGISTERED_DOMAIN_IDS`；本地表 `sync_records` 主键（ws, domain, authorization_epoch, record_id）；纪元轮换 `retireEpochs` 保留 pending/conflicted。
- 改主人/身份的代码点：`postgres-live-record-store.ts:434`、`features/appointments/notification-projector.ts:203`、`features/encounters/projection-repository.ts:68`、`scripts/sync-cloud-records.ts:103`（均 `user_id = excluded.user_id`）；`features/events/organizer-accounts/owner-migration.ts:549-556`（update events 的 user_id）；`scripts/bootstrap-event-organizer-accounts.ts:196-204`；`scripts/seed-demo-workspace.ts:377`（set user_id = null）；活动角色删除 → `event-access/storage/postgres-repository.ts:412/265`；取消报名 → `canonical-registration-repository.ts:877-943`；录取决定 → `admission/storage/postgres-repository.ts:1146,1202`；关系撤销经通用 upsert（`relationship-communication/service.ts:727-785`，0109 后改为新表）。
- 活动专用表（0115 需要）：`event_ops_events`（revision、event_version、updated_at）、`event_ops_membership_heads`（status rsvped/cancelled；revision）、`event_ops_admission_application_heads`、`event_ops_publication_heads` → `event_ops_publications.published_dto`（不可变）、`event_ops_configuration_heads`（签到/结果窗口）；这些表目前没有 `sync_revision`。
- 0108 的提交顺序锁以表为单位（锁键含表 oid）；0109 的三张消息表已带 `sync_revision`。

## 范围与文件

1. **注册表 v2**：每个类别声明 `ownership`（owner 列 / 推导规则）、`visibilityInputs`（影响谁能看的字段）、`attachments`（附属类别及关联方式）、`fields`（下发字段白名单）、`source`（`orbit_records` / 专用表 / 个人子空间）。本 Sprint 实现 `orbit_records` 与专用表两种来源；个人子空间由 0118 按同一接口加入。注册表版本升到 2，游标与 generation 随之变化，App 按既有「重置」路径重建（报告验证）。
2. **修通用 upsert**：更新时不传主人则保留原主人；显式改主人的调用必须走明确的接口。4 处同类写法一并处理。
3. **主人/身份检查**：对已注册类别，改 `user_id` 或 `visibilityInputs` 中字段的写入，若不在「已登记的处理方式」清单中则失败。须覆盖产品代码与 `scripts/`（可用数据库层保护 + 静态审计的组合，Generator 选择并说明）。当前登记清单为空（产品里没有联系人转手；撤销关系由成员表处理；取消报名保留主人）。
4. **专用表取号**：给 0115 需要的活动专用表加 `sync_revision`（共用 0108 的序列与提交顺序锁；这些表的写入方同样取锁），迁移可重复执行；读取服务支持按注册表从专用表分页读取（按本人可见范围过滤，范围规则由说明书声明）。用一个测试专用类别验证，不对用户开放。
5. **App**：按租约下发的类别清单驱动同步（不再写死），未知类别忽略；注册表版本变化时按既有路径重置。
- 排除：新增用户可见的同步类别（0115 起）；整类重抄机制（等需要的功能出现）；补写主人（0114）。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0113-01 | 注册表 v2 下，笔记、待办、个人日程的双账号同步测试结果与改前一致（隔离、增量、删除）；App 注册表版本变化时重建而不丢待上传行 | 真库 + App 测试 |
| SC-0113-02 | 通用写入更新不传主人时主人不变；显式改主人走专用接口；4 处同类写法已处理 | 真库测试（先 RED） |
| SC-0113-03 | 故意改已注册类别主人的产品代码与批量脚本，各自被检查拦下并报错（离线设计验收第 5 项） | 测试 RED→GREEN |
| SC-0113-04 | 活动专用表每次新建/修改都领流水号且提交顺序有保证；测试类别从专用表首次全量 → 改一行只传一行 → 再同步 0 行 | 真库并发测试 |
| SC-0113-05 | 读取成本不超过账本基线、棘轮不增加；两端全量、typecheck 通过 | 摘要 |

## 测试

- 档位 H（共享写入、同步协议、迁移）。开发集：同步拓扑 Postgres 测试、通用存储测试、活动运营与报名的 Postgres 测试（确认取锁后写入正常）、App 同步协调器测试；收口：两端全量。

## 生产（需用户确认）

活动专用表加列与回填、通用 upsert 行为变化的上线顺序写入报告，协调者汇总进 `PRODUCTION_ROLLOUT.md`。

## 失败与交接

交接给 0114（补写主人）、0115（活动类别）、0118（个人子空间来源）：说明书字段定义与检查的登记方式。

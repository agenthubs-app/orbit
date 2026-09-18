# Sprint 0086 — 收件箱只认三类通知，无法归类的记录读取即失败

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** 用户 2026-09-18 反馈：收件箱大量"来源已不可用"；要求确认是"实现未合并／实现覆盖不到／数据库残留"哪一种，并严格按 [通知系统设计](../../../../docs/superpowers/specs/2026-09-16-notification-system-design.md) 与 [NOTIFICATION_PROGRAM](../NOTIFICATION_PROGRAM.md) 处理；若是数据库问题，读取时就要检测失败，这类信息不允许存在。
**单一目标:** 三类通知成为收件箱唯一来源并默认启用；旧记录按设计迁移隔离；读取路径对无法归类的记录 fail closed。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** `chat-agent` = `1e2cbe555`。未启动，run_count = 0。
**进入条件:** 本机 Postgres `orbit_events`（含 40 条旧 notifications、54 条 reminderPlans）；Simulator 与 phoneweb 可用；0038 契约（`shared/contract/inbox-notifications.ts`）为准。

## 调查结论（回答用户的三个问题）

| 问题 | 结论 | 证据 |
| --- | --- | --- |
| 实现是否合并 | **已合并**。0037 `a591494b0`、0038 `e045651b3`、0039 `131723ddb`、0040 `0b552649d` 都在 `chat-agent` 祖先链上 | `git merge-base --is-ancestor` 四个 SHA 均为 0 |
| 实现是否覆盖不到 | **覆盖不到，因为没启用**。`features/notifications/inbox-record-service-factory.ts:22` `isTypedInboxEnabled` 只对 `ORBIT_TYPED_INBOX_ACTORS` 逗号白名单里的账号为真；`.env`/`.env.local` 都没配 → `/api/inbox/notifications` 对所有账号返回 `enabled:false, items:[]`。App `RelationshipInboxScreen.tsx:355` 仍以 `/api/notifications`（旧链）为收件箱数据源，`inbox-feed.ts:111`／`relationship-inbox.ts:1446` 把旧链标记 `unavailable` 的条目渲染成"来源已不可用"（0046 的"失效通知来源安全提示"） |
| 是否数据库残留 | **是，且迁移从未执行**。`orbit_records.notifications` 40 条全为种子生成的"复核与 X 的下一步"（`source.label: Generated relationship mockdata fixture`，无 `kind`）——设计第 217 行明确"不满足内容门槛，不迁移成新未读通知"；`reminderPlans` 54 条中 `delivered/failed` 且目标已丢失者在旧链 `app/api/notifications/handler.ts:37` 被服务端直接写成 `title: "来源已不可用"`。0040 的 `scripts/migrate-notification-inbox.ts`（`notification-cutover-migration.ts`）存在，但库里没有任何通知迁移记录（只有 `event_organizer_owner_migrations`），0040 REPORT 也写明"QA 未含旧空话样本，不声称清理了 40 条" |

**判断 1：三类通知默认开启，白名单退役。** 删除 `ORBIT_TYPED_INBOX_ACTORS` 门（或改为默认全开的"排除名单"，仅用于紧急回退并在 REPORT 记录），`/api/inbox/notifications` 对所有账号生效。
**判断 2：App 收件箱只读三类通知接口。** `RelationshipInboxScreen`／`inbox-feed`／`relationship-inbox` 的通知数据源改为 `/api/inbox/notifications`；`/api/notifications` 旧链退出收件箱（保留给未迁移的旧消费者，逐个核对后删除 App 侧引用）；`typedInbox.unavailable` 文案从列表路径删除，只保留在详情页"来源已变更"的合法状态里（设计允许 target `unavailable` 作为详情状态，但不作为列表条目标题）。
**判断 3：旧记录按设计迁移隔离。** 用 0040 的迁移 CLI 对本机库跑 dry-run → apply：满足门槛的旧提醒归为提醒并去重；"复核与 X 的下一步"与目标不可解析的 reminderPlans 进入隔离（留迁移记录，不生成未读）。迁移不是删除：原记录保留并打 `migrated/quarantined` 标记。
**判断 4：读取即失败。** 三类通知的读服务加完整性校验：任一条目 `kind ∉ {reminder, suggestion, update}`、缺具体标题／来源引用／目标，或来源集合为空，则整个列表读取抛 `InboxRecordError('INBOX_INTEGRITY_VIOLATION')`，接口返回受控错误（含违规 id 列表，不含原文），App 显示"收件箱数据异常"+代码。这是用户明确要求的 fail closed：这类记录不允许存在，宁可失败也不展示占位。同时提供 `db:verify:inbox-integrity` 脚本供部署前检查。
**判断 5：种子不再产生违规记录。** `seed-live-generated-fixtures` 不再写"复核与 X 的下一步"到 `notifications`（或写成设计允许的形态）；`db:verify:live-generated-fixtures` 增加通知完整性断言。

## 范围与文件

- orbits：`features/notifications/inbox-record-service-factory.ts`（去白名单）、`inbox-record-service.ts`（完整性校验 + 错误码）、`app/api/inbox/notifications/handler.ts`（错误映射）、`notification-cutover-migration.ts` + `scripts/migrate-notification-inbox.ts`（隔离规则核对：设计 216–224 行）、新建 `scripts/verify-inbox-integrity.ts`、`scripts/seed-live-generated-fixtures.ts` 与 `verify-live-generated-fixtures.ts`、`shared/contract/inbox-notifications.ts`（若需新增错误码）、对应测试（`tests/notifications/*`、`tests/api/inbox-*`）。
- App：`src/screens/inbox/RelationshipInboxScreen.tsx`、`src/view-models/inbox-feed.ts`、`relationship-inbox.ts`、`inbox-notification-actions.ts`、`src/hooks/useRelationshipInboxBadgeCount.ts`（未读数改读三类接口）、`src/data/offline-read/route-domain-inventory.ts`、i18n 三文件（"收件箱数据异常"）、`tests/ink-signal-inbox.test.ts` 等收件箱屏幕测试。
- 排除：Push 投递与 0040 未完成的真实链验收；0039 AI 发现；消息（联系人会话）页。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0086-01 | 复现：迁移前演示账号收件箱含"来源已不可用"；迁移 dry-run 报告列出 40 条生成记录与失效 reminderPlans 的隔离原因；apply 后列表 0 条"来源已不可用"，原记录带隔离标记且可审计 | 迁移日志 + 前后截图 |
| SC-0086-02 | `/api/inbox/notifications` 对任意账号 `enabled:true`；App 收件箱通知页只读该接口，未读数一致；`/api/notifications` 不再被 App 收件箱引用 | route-domain-inventory 断言 + 网络清单 |
| SC-0086-03 | 注入一条 `kind` 非法或来源不可解析的记录 → 接口返回 `INBOX_INTEGRITY_VIOLATION`（含 id）→ App 显示"收件箱数据异常"；`db:verify:inbox-integrity` 非零退出 | orbits API 单测 + PG 用例 + App 屏幕测试 |
| SC-0086-04 | 列表每条满足设计：三选一类别图标与文字、具体标题、原因、来源短标签、时间、主操作；不出现"来源已不可用"标题 | Simulator + phoneweb 截图 |
| SC-0086-05 | 种子重建后完整性校验通过；App 全量对照 3508、orbits 定向集绿、两端 typecheck 0 | 摘要 |

## 一次 Generator 的执行顺序

1. 登记 run-01；分支 `codex/sprint-0086-inbox-typed-only`。
2. 复现与迁移 dry-run（SC-01 前半）。
3. RED→GREEN：完整性校验与错误码；去白名单；verify 脚本（SC-03、SC-02 服务端）。
4. App 数据源切换、未读数、文案；删除列表路径的 unavailable 渲染（SC-02、SC-04）。
5. 迁移 apply、种子修正（SC-01 后半、SC-05）。
6. 截图、全量、staged `detect_changes`、commit、merge、REPORT、登记表。

## 最小测试与检查

- 档位：orbits H（读服务 + 迁移）／App H（收件箱数据源）。
- 定向集：`tests/notifications/*`、`tests/api/inbox-*`、迁移 PG 用例；App `ink-signal-inbox`、`app-wide-*` 收件箱相关、`offline-read-inventory`。收口两端全量。

## 失败与交接

若迁移规则与设计第 216–224 行在某类旧记录上无法判定，不得"就近归类"：该类记录进隔离并在 REPORT 列出待用户决定的清单。若去白名单会影响生产账号（Neon）的既有旧链消费者，把生产切换列为单独的运维步骤，本 Sprint 只在本机验收。

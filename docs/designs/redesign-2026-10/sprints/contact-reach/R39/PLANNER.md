# Sprint R39 — Orbit 联系人资格 + 原子「消息 + 提议」（后端）

**Plan revision:** 2（吸收 Codex 方案 review 1–9、13 中与后端相关项）。**模式:** existing-codebase / single-generator。**档位:** H。
**依据:** [DESIGN.md](../DESIGN.md) D1、D2、D2b、D3、D6。
**单一目标:** 资格接口告诉客户端「能不能发站内信、能不能提议」；活动互换的人也能开会话；邀请码互连的人也能收提议；一条站内信可以原子地携带一个新提议，对方读取消息时能拿到 `appointmentId`。
**进入条件:** HEAD 含 6433bb0d8；用户 2026-11-16 定稿（U1–U3）。**隔离 PostgreSQL 测试库可用**（`ORBIT_EVENT_DATABASE_URL` 指向测试库，见 repos/orbits/AGENTS.md；不是本地开发共用库）——缺失则不能完成本 Sprint，REPORT 记 blocked。

## 上下文包

必读文件：
- `repos/orbits/features/relationship-communication/service.ts` — `getEligibility`（约 :442）、`startConversation`（约 :660）、`sendMessage`（约 :716）。
- `repos/orbits/features/relationship-communication/invite-link.ts` — `forContact`（邀请码依据；`invite_connections` 双方 contactId 字段）。
- `repos/orbits/features/invite-codes/service.ts` — `unlink`（只改连接与联系人，**不撤销会话**——本 Sprint 不改它，但所有新依据必须实时复核连接是否已解除）。
- `repos/orbits/features/relationship-communication/message-store.ts`（`send` 约 :254）、`message-tables.ts`（`RELATIONSHIP_MESSAGE_SCHEMA_SQL`，`relationship_messages` 约 :86；会话表唯一键 `(inviter_account_id, inviter_contact_id)`）、`bounded-reader.ts`（Web 分页消息的 SQL JSON 投影）。**注意：`message-migration.ts` 是旧 orbit_records 搬迁，不是版本化迁移。**
- `repos/orbits/app/api/relationship-communication/handler.ts` — `createConversationMessagesPostHandler`（约 :193；`Idempotency-Key` 优先 约 :204；错误映射 约 :49）。
- `repos/orbits/shared/contract/relationship-communication.ts`（`RelationshipEligibilityDTO` 约 :15、`RelationshipMessageDTO`、`RelationshipDeliveryReceiptDTO` 约 :108）及 `shared/api-schema` 对应 schema。
- `repos/orbits/features/appointments/contact-authority.ts`、`postgres-repository.ts`（`resolveAcceptedEventContactContext` 约 :141；`appointment_active_relationship_pair_idx` 唯一约束）、`service.ts`（`createAppointmentService`，要求双方 `contactIdsByActor`）、`memory-repository.ts`（:40–45 同一对只允许一个进行中）、`app/api/appointments/initial-proposal-handlers.ts`（`createAppointmentInitialProposalBoundary`）。
- `repos/orbits/scripts/migrate-web-runtime.ts`（生产构建内迁移入口，新 SQL 要被它执行到）。
- App 读取链（本 Sprint 只改数据层，不改 UI）：`repos/orbit-app/src/data/sync/relationship-message-domain-reader.ts` 及其本地表定义、`src/api/contact-communication.ts`（`relationshipDeliveryReceiptMatches`）。

易错边界（每条有 SC）：
1. 名片联系人（无三种依据）：`canStart/canSend/canProposeMeeting` 全假，initial-proposal `available:false`。
2. 只有邮件邀请会话：`canSend:true`、`canProposeMeeting:false`（无双边联系人记录，不造假 contactId）。
3. 邀请码依据（提议用）每次实时查 `invite_connections`（`unlinked_at is null`），解除后立即不可提议；`keepAsContact` 两种解除都测。
4. 活动互换建会话：按排序后的两位 account 在事务里加锁查重，已有活跃会话就复用；双方并发 start 只得一条；联系人合并后重查仍找到同一会话。
5. **原子发送**：`POST messages` 请求体可带 `proposal`（结构同 initial-proposal）。同一事务建 appointment + 写消息（带 `appointment_id`）+ appointment outbox；任何一步失败全部回滚（测试模拟消息写入失败 → appointment 与 outbox 都不存在）。若确认两者不能同库同事务，改用「draft appointment → 写消息 → 同事务发布」并写清理规则，REPORT 说明。幂等：同 Idempotency-Key 同内容重放返回原消息+原 appointmentId；同 key 不同内容 → `REQUEST_REUSED`。
6. D2b：该对关系已有待确认/已确定未结束的 appointment → 带 proposal 的发送返回 409 并在错误里带现有 `appointmentId`（客户端用于显示「改期」）；已确定且已结束的，服务端先 `complete` 再新建。
7. 迁移：`RELATIONSHIP_MESSAGE_SCHEMA_SQL` 增加 `ALTER TABLE relationship_messages ADD COLUMN IF NOT EXISTS appointment_id text`（可空，不回填）；测「旧表升级」与「全新建库」两条路径，且 `migrate-web-runtime` 会执行到。
8. 读取链：store 回执、`GET messages`、`bounded-reader` 投影、App domain reader 与本地表都带 `appointmentId`；`relationshipDeliveryReceiptMatches` 核对返回的 `appointmentId`。

## 范围与文件

- 修改：上列 orbits 文件、对应 shared contract/schema；App 只改数据层（domain reader、本地表、receipt 校验）与 `npm run sync:contract` 生成的副本。
- 新建：活动互换依据读取（如 `features/relationship-communication/event-exchange-link.ts`）、appointment 邀请码依据读取、测试。
- 排除：任何 UI（R41/R42）；可约时间（R40）；invite unlink 的会话撤销改造（不在本目标）。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-R39-01 | 资格：三种依据与名片联系人、邮件邀请的 `canStart/canSend/canProposeMeeting` 组合按边界 1–3；活动互换 start 建会话、并发只一条、合并后重查同一条。 | **PostgreSQL** 路由/服务测试 |
| SC-R39-02 | 邀请码互连（无活动互换）：initial-proposal `available:true` 并可建；解除（两种 keepAsContact）后 `available:false`、新建拒绝、已有 appointment 可读；活动互换路径现有测试全绿。 | PostgreSQL 测试 + 现有 appointments 测试 |
| SC-R39-03 | 原子发送：带 proposal 成功 → 201，回执、`GET messages`、bounded reader 都有 `appointmentId`；模拟消息写入失败 → 无 appointment、无 outbox；幂等重放 / `REQUEST_REUSED`；D2b 的 409 带现有 id、已结束确认会面先 complete。 | PostgreSQL 测试 |
| SC-R39-04 | 迁移：旧表升级与新建库都得到可空列；旧消息 `appointmentId` 为空；旧响应（无字段）schema 解析不报错；`migrate-web-runtime` 包含该 SQL。 | 迁移测试 + contracts 测试 |
| SC-R39-05 | App：domain reader/本地表带 `appointmentId`，receipt 校验核对它；`sync:contract` 后 `contract-sync`、`contract-fixtures-parse`、`relationship-*` 测试过；orbits `tsc -p tsconfig.build.json` 无错。 | 命令输出 |

## 执行顺序

1. 基线（relationship-communication、appointments、invite-codes、contracts 测试 + App relationship-* / contract-* 的失败集）。
2. SC-01/02 → SC-03 → SC-04 → SC-05，先写失败测试再实现。
3. 路径限定提交（资格、原子发送、读取链/迁移可分笔）；写 `R39/REPORT.md`（短模板 + 「交接」节：新字段名、请求体结构、错误码、幂等规则）。

## 最小测试与检查

定向：上述测试目录全部文件。**PostgreSQL 测试是完成条件，不能用 memory 测试替代。** 不跑全量（R42 收口统一跑）。

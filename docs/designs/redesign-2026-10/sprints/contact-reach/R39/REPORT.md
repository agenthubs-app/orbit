# Sprint R39 — REPORT（2026-11-17）

## 结果

SC-R39-01～05 全部通过，无受阻项。活动互换的人可开会话（同一对账号只一个活跃会话）；邀请码互连的人可收提议，解除后立即不可提议；`POST messages` 可带 `proposal`，建 appointment + outbox + 消息同一事务；对方读取消息拿得到 `appointmentId`。

## 提交

- `65a311776` orbits 后端、契约快照、App 契约副本、测试。
- `ab194884c` App 数据层（离线镜像带 `appointmentId`、回执校验 `withProposal`）+ 测试。
- 协调者复跑：`tests/services/relationship-contact-reach-postgres.test.ts` + `tests/contracts/relationship-message-appointment-contract.test.ts` 8/8（隔离库 `orbit_test`，0 跳过）。

## SC 表

PG 测试库：本地隔离 `postgresql://li@localhost:5432/orbit_test`（`ORBIT_LIFECYCLE_TEST_DATABASE_URL` / `ORBIT_APPOINTMENT_TEST_DATABASE_URL` / `ORBIT_EVENT_DATABASE_URL`），每测私有 schema。

| SC | 结果 | 证据 |
| --- | --- | --- |
| 01 | 通过 | `relationship-contact-reach-postgres`：名片三项全假 + initial-proposal `available:false`；邮件邀请 `canSend:true`/`canProposeMeeting:false`；邀请码与活动互换可开会话可提议；并发 start 只 1 条；合并后同一条；双方各读到自己的 contactId。 |
| 02 | 通过 | 真实 initial-proposal 路由：邀请码 GET true / POST 201（`eventId:null`，`authorityRequestId:"invite:conn-…"`）；两种 keepAsContact 解除后 false / 403；已有 appointment 可读；现有 appointment-* 全绿。 |
| 03 | 通过 | 真实 messages 路由：消息写入失败 → appointment/outbox/receipt/消息全 0；成功时回执、getConversation、GET messages、同步读取都带 `appointmentId`；幂等重放与 `REQUEST_REUSED`；409 `MEETING_ALREADY_ACTIVE` 带现有 id；已结束确认会面先 complete；邮件邀请会话带提议 403；不合规 400。 |
| 04 | 通过 | 新建库得可空 text 列；删列+旧消息+重跑迁移 → 列回来、旧消息为空；旧响应可解析；`migrate-web-runtime → runOrbitRecordsMigration → runRelationshipMessageMigrations` 含该 SQL。 |
| 05 | 通过 | App contract-*/relationship-*/eligibility/新测 280/280；orbits `tsc -p tsconfig.build.json` 0 错。 |

## 基线对照（零新增失败）

orbits（relationship-*、appointment-*、sync-relationship-messages-postgres、invite-codes、contracts、contract-surface）：改前 469/458 通过/3 失败/8 跳过 → 改后 477/466/3/8。3 个失败改前即有（bounded-reader 夹具非法 UTF-8；lifecycle-preflight-cli 两个弃用警告进 stderr）；8 跳过 = `ORBIT_W5_F_TEST_DATABASE_URL` 未配。App：272+6 → 280/280。中途修掉两处回归（普通消息不出现 `appointmentId` 字段以保住 0109 对拍；契约快照已更新）。

## GitNexus

`createRelationshipMessageReader` CRITICAL（上游 18）：只加投影一列与 `activeConversationForPair`，读取方测试全在基线集。`createPostgresRelationshipInviteLinks`/`withMyContactIds` HIGH：只对未映射对方追加活动互换回退。App `relationshipDeviceMessages` HIGH：只加可选字段。`createAppointmentService` HIGH：未改，原子发送复用其 repository/service。detect-changes 21 文件/172 符号多为契约行号位移误报。

## 假设（可撤回）

1. 资格接口另返回 `activeAppointmentId`（仅 `canProposeMeeting` 为真时计算），供 D2b 提前替换为「改期」。
2. 普通消息不带 `appointmentId` 字段（不写 null）。
3. 未注入 meetings 依赖时资格保持旧形状；生产工厂总注入并核对 workspace。
4. 「进行中」= 非 cancelled/completed（含 draft、reschedule_pending）；「已结束」= confirmed 且开始+时长 ≤ 现在；complete 在发送事务前执行、幂等 key 派生、失败忽略（事务内检查仍会 409）。
5. 邀请码提议：`eventId` null、`authorityReference` = `invite:<connectionId>`、`relationshipPairId` = `invite-pair:` + 排序账号 sha256 前 40 位；两种依据并存时活动互换优先。
6. 消息与 appointment 同库，直接同事务，无 draft 清理规则。
7. 活动互换开会话：先开者为 inviter；排序账号 advisory 锁；已有活跃会话复用；同 (inviter, 联系人) 曾撤销 → `BINDING_CONFLICT`。
8. 提议只能发给会话中的另一人，对不上 403。
9. handler 新增 403 映射；错误 context 带 `reason`，冲突时带 `appointmentId`。
10. 测试简化：解除连接用 SQL 写成 unlink 后状态；活动互换用最小列重建 4 张 `event_ops_*` 表。

## 部署注意

新代码读 `relationship_messages.appointment_id`：**生产先迁移再部署**（迁移在 `migrate-web-runtime` 的 records 阶段，执行需用户授权）。

## 交接（R41 / R42）

**资格**（`GET …/eligibility?contactId=`；`POST conversations/start` 同结构）新增：
- `canProposeMeeting: boolean` — 活动互换或未解除邀请码为真；只有邮件邀请、名片联系人为假；缺省按 false。
- `activeAppointmentId: string | null` — 有值时显示那条会面 +「改期」。

| 情况 | 返回 |
| --- | --- |
| 名片联系人 | `canStart` 缺省，`canSend:false`，`canProposeMeeting:false`，`canInvite:true` |
| 活动互换未开会话 | `canStart:true`，`status:"unregistered"` |
| 活动互换已开会话 | `canSend:true`，`status:"confirmed"`，带 `conversationId`、`qualificationVersion` |

**发送** `POST /api/relationship-communication/conversations/{id}/messages`，幂等用 `Idempotency-Key`（优先）或 body `requestId`：

```json
{ "body": "…", "qualificationVersion": "qv_…",
  "proposal": { "candidateTimes": [{ "startsAtUtc": "2026-12-01T01:00:00.000Z" }],
                "durationMinutes": 60,
                "medium": { "kind": "video", "provider": "google_meet", "joinUrl": null },
                "note": "", "timezone": "Asia/Tokyo" } }
```

`candidateTimes` 3–5 个、各至少 15 分钟后、UTC 以 Z 结尾；`medium` = `in_person{location}` / `video{provider: google_meet|other, joinUrl|null}` / `phone{phoneHint|null}`；结构即 initial-proposal 的 `meetingProposalSchema`（strict），类型 `RelationshipMessageSendRequestDTO`。带提议必须在线（不进 App outbox）。201 的 `data.message.appointmentId` 即新会面，之后 `GET /api/appointments/{id}` + `commands accept|counter`。读取侧只有带提议的消息出现 `appointmentId`。

**错误码**：409 `MEETING_ALREADY_ACTIVE`（`context.appointmentId`，竞态时可能缺）；403 `MEETING_NOT_AVAILABLE`；400 `MEETING_INVALID_PROPOSAL` 或无 reason；409 `REQUEST_REUSED`；409 `STALE`/`REVOKED`；404 `NOT_AVAILABLE`。

**幂等**：消息 id 由（会话、发送者、key）算出；同 key 且正文/发送者/会话/是否带提议/提议内容（候选按集合比，备注与时区 trim）相同 → 返回原消息与原 `appointmentId`（先查回执再查资格，解除后重放也返回）；否则 `REQUEST_REUSED`。appointment 幂等 key 服务端派生。

**App 回执校验**：`relationshipDeliveryReceiptMatches(receipt, { …, withProposal })`，`withProposal:true` 要求非空 `appointmentId`，否则要求缺省或 null。

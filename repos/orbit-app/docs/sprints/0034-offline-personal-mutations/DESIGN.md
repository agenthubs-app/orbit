# Sprint 0034 — 个人数据离线写入与冲突处理设计

## 支持矩阵

| 行为 | 离线队列 | 原因 |
| --- | --- | --- |
| 笔记 create/update/delete | 支持 | actor 私有且已有版本/幂等语义 |
| 待办 create/update/status/delete | 支持 | actor 私有 confirmed task；不含 suggestion 接受 |
| 已确认关系跟进 create/update/status/delete | 支持 | 本质为 canonical relationship task；显式创建保留 connection 约束，suggestion accept 仍 online-only |
| 个人日程 create/update/delete | 支持 | actor 私有且已有 `expectedUpdatedAt`/idempotency |
| meeting/event/invitation/registration/chat/permission/account/AI side effect | 不支持 | 多方状态、实时资格或不可逆副作用需要在线确认 |

未保存编辑器草稿仍是 Device-only Draft。只有用户点击现有“保存/完成/删除确认”后，才生成 Pending Local Change。

## Outbox 契约

```ts
export interface LocalQueuedMutation {
  mutationId: string;
  actorId: string;
  workspaceId: string;
  kind: "note" | "task" | "personal_schedule";
  entityId: string;
  operation: "create" | "update" | "delete";
  baseRevision: string | null;
  patch: unknown;
  createdAt: string;
}

export interface SyncMutationCommand {
  mutationId: string;
  kind: "note" | "task" | "personal_schedule";
  entityId: string;
  operation: "create" | "update" | "delete";
  baseRevision: string | null;
  patch: unknown;
  createdAt: string;
}
```

`LocalQueuedMutation` 的 actor 来自当前本地认证 scope，workspace 来自 0033 已认证响应并持久在加密 `sync_meta`；上传前必须再次核对当前认证 workspace，一旦不匹配就暂停该 scope，不能重定向队列。wire `SyncMutationCommand` 不携带 actor/workspace，它们只由服务端认证注入。人脉跟进使用 `kind=task` 和 allowlisted `category=relationship`／connection 约束，不使用独立 followup kind。

`mutationId` 在首次用户确认时生成并持久化，所有重试复用。离线 create 使用 `local:<uuid>`，服务器 receipt 返回 `canonicalId`、`revision`、完整 allowlisted record；App 在一个事务中重写实体引用、删除 outbox 和落地 canonical record。`baseRevision` 专指 0033 的 `orbit_records.sync_revision`，不得用 payload version、updatedAt 或客户端时间替代。

同一实体严格 FIFO；不同实体最多 4 个并发。网络/5xx/429 是可重试并使用带 jitter 的有界退避；401/403 暂停整个 scope 并交给 auth；400/422 为永久失败且保留用户输入。批接口沿用统一 success/failure envelope；已成功解析的批次以 HTTP 200 返回逐项 `acknowledged/conflict/retryable/permanent`，领域 CAS conflict 不是 0033 顶层 cursor-reset 409。

## 冲突模型

所有 update/delete 携带 `baseRevision`。服务器只在当前 revision 相等时执行；否则返回当前 allowlisted record 和 revision，不接受 last-write-wins。

- 使用云端：丢弃冲突及该实体后续 pending patch，保留 server record。
- 保留本机：用户显式确认后，以服务器当前 revision 创建新的 mutation；不是自动重试。
- 另存副本：notes/tasks/personal schedule 可创建新记录；relationship followup 只有仍满足 connection 约束时允许。
- delete conflict：必须再次显示云端当前内容后确认，不能静默删除。

## UI 与 AI 真实性

每个本地实体显示 `待同步/同步失败/有冲突`。列表和详情可展示 overlay 后的本机结果，但 canonical base 与 pending patch 分开保存。Orbit AI 仍在服务器执行，只能读 Cloud Canonical Record：同步前由 App 明示“这项更改仅在本机，AI 暂不可见”，同步确认后现有 actor-scoped 工具才可读到。逐记录 revision/freshness 的 AI 响应由 0036 实现，不作为 0034 的前置完成条件。

## 完成定义

四域离线确认操作可跨重启恢复、在线只生效一次、冲突不丢数据；不支持操作不会入队；同账号 Web 和 AI 只在服务器确认后看到变更。所有本线提交合并回 `chat-agent` 后复验、push，并记录 remote SHA。

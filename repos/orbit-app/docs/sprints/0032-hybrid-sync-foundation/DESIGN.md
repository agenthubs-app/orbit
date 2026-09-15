# Sprint 0032 — 云端权威与加密本地镜像设计

## 决策

采用 [ADR-0006](../../../../../docs/adr/0006-cloud-authority-with-encrypted-local-mirrors.md) 的“Cloud Canonical Record + Local Durable Mirror”。App SQLite 是可重建投影，不是业务权威；服务器确认的 revision 才能被 Web、其他设备和 Orbit AI 当作事实。

本 Sprint 只建立共享契约、数据库结构和安全生命周期。现有路径快照行为继续服务旧页面，直到 0033 逐域切换；但快照行迁入同一 actor-scope 加密数据库的 `legacy_api_snapshots` 表。升级时删除无法安全归属/加密的旧明文 `orbit-cache.db`，不迁移其中 payload；网络会重建缓存。页面行为不变，但首次升级离线时不能依赖旧明文缓存。

## 数据分类

| 类别 | 初始领域 | 本地形式 | AI 规则 |
| --- | --- | --- | --- |
| 云端权威＋本地镜像 | contacts、notes、tasks、relationship followups、personal schedule、inbox projection | 规范化实体行 | 仅已同步且 manifest 允许的字段可见 |
| 云端权威＋短期缓存 | meetings、events、invitations、chat、共享状态 | 有 TTL 的只读镜像或现有快照 | 不因本地缓存扩大 AI 权限 |
| 仅设备 | 未保存草稿、筛选状态、搜索索引、缩略图 | 独立设备表／文件 | 始终不可见 |
| 仅服务器秘密 | provider token、数据库凭据、审计与最终 outbox authority | 不进入 App 数据库 | 始终不可见 |

## 共享契约

```ts
export type SyncEntityKind =
  | "contact"
  | "note"
  | "task"
  | "relationship_followup"
  | "personal_schedule"
  | "inbox_item";

export type LocalSyncState = "synced" | "pending" | "conflicted" | "failed";
export type AiSyncVisibility = "available_when_synced" | "excluded";

export interface SyncRecord<TPayload = unknown> {
  actorId: string;
  workspaceId: string;
  kind: SyncEntityKind;
  id: string;
  revision: string;
  updatedAt: string;
  deletedAt: string | null;
  payload: TPayload | null;
  syncState: LocalSyncState;
  aiVisibility: AiSyncVisibility;
}
```

`actorId` 只能由认证会话提供；任何来自页面参数、payload 或模型参数的 actor 字段都拒绝。`revision` 是不透明服务器版本，客户端不能用本地时钟生成 canonical revision。

## SQLite 结构与密钥

- 每个 `server_scope + actor_id` 使用独立的加密数据库文件；文件名只含该 scope 的不可逆摘要，明文 actor ID 不进入文件名。库内所有表再以 `workspace_id` 隔离。
- `sync_records`：复合主键 `workspace_id + kind + record_id`，保存 canonical payload、revision、更新时间、墓碑和本地状态。
- `sync_cursors`：每个 workspace 一条 opaque cursor、最近成功同步时间和 bootstrap 状态。
- `sync_outbox`：稳定 `mutation_id`、实体键、操作、patch、base revision、创建顺序、重试状态；0032 只建立表和存储 API，不发送业务操作。
- `sync_meta`：schema version、加密状态、迁移 checkpoint。
- `legacy_api_snapshots`：保留旧页面的 server/actor/path 快照语义，但实际文件已经由当前 scope 与 SQLCipher 隔离；0033 按域淘汰。

数据库启用 Expo SQLite 的 SQLCipher 原生配置；每个 server/actor 数据库使用独立随机密钥，保存在 `SecureStore` 的 this-device-only 范围。密钥丢失或数据库损坏时只能清除该 scope 的可重建镜像并退回在线读取，不能尝试明文打开或把密钥写入日志。

## 生命周期与失败保护

- 登出：关闭当前 scope 数据库句柄，删除该加密数据库文件及 SecureStore 密钥；密钥删除失败时阻止继续切换账号，数据库文件删除失败但密钥已删除时记录脱敏错误并允许新 scope 使用独立文件。
- 换服务器／账号／工作区：先切 scope，再打开对应数据库；旧异步结果被 scope token 丢弃。
- schema migration：单事务、版本单调递增；失败回滚并保持旧版本可读取或进入 online-only，不留下半迁移表。
- 明文升级：存在旧 `orbit-cache.db` 时先关闭旧句柄并删除该可重建 cache；绝不在 SQLCipher key 为空时打开它，也不复制无法验证 actor 归属的 payload。
- Web：使用内存/IndexedDB 不在本 Sprint 范围；`.web.ts` 明确返回 online-only 能力。
- 日志：只记录错误码、schema version 和脱敏 scope hash，不记录 payload、密钥、正文或 ID 全值。

## 完成定义

共享契约与 App 副本一致；原生 SQLCipher 构建实际成功；SQLite 测试证明事务、墓碑、隔离、明文 cache 清理、登出与故障降级；现有页面仍使用旧读取接口且行为不变。功能提交必须合并回 `chat-agent` 后在精确合并树复验。

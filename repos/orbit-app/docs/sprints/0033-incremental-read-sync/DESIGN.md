# Sprint 0033 — 增量读取同步设计

## 目标边界

0032 已提供加密本地镜像。本 Sprint 增加只读 bootstrap/delta 协议，并把 notes、tasks、relationship followups、personal schedule 四个页面域切到镜像优先。所有写入仍走现有在线 endpoint；离线 outbox 留给 0034。

contacts 与 inbox 先保留基础设施可支持但不切换消费者，避免一次 Generator 扩散到全 App。meetings/events/chat 继续使用现有网络路径或短期快照。

## 增量协议

`GET /api/sync?cursor=<opaque>&limit=<1..200>` 的 actor/workspace 只能来自认证上下文。无 cursor 表示 bootstrap；响应严格为：

```ts
export interface SyncPage {
  workspaceId: string;
  changes: readonly SyncChange[];
  nextCursor: string;
  hasMore: boolean;
  highWatermark: string;
  serverTime: string;
}

export interface SyncChange {
  kind: "note" | "task" | "personal_schedule";
  id: string;
  revision: string;
  operation: "upsert" | "delete";
  updatedAt: string;
  payload?: unknown;
  aiVisibility: "available_when_synced" | "excluded";
}
```

HTTP 层继续使用项目统一 envelope：成功体是 `{ success: true, data: SyncPage }`；失败体是 `{ success: false, error }`。游标失效／过期／签名或 scope 不匹配返回 HTTP 409、共享 `CONFLICT`，并仅以 `error.context.syncErrorCode=SYNC_RESET_REQUIRED` 告知客户端恢复动作，不返回 actor、workspace 或签名细节。

`workspaceId` 与 actor 一样只由服务端认证／运行上下文确定。`orbit_records` 新增数据库分配的单调 `sync_revision`，每次 insert/update/delete 都从 sequence 取得新值；迁移为现有行回填唯一 revision，不使用业务 payload 版本或客户端时间。仅 sequence 不能保证事务提交顺序：三类同步 collection 的 trigger 必须在分配 revision 前取得同一个 transaction-scoped PostgreSQL advisory lock并持有到 commit，使后开始的同步写在先前写提交／回滚后才取号；回滚产生的 gap 可接受。其他 collection 不因本 Sprint 被该同步锁串行化。

迁移必须接入 `runOrbitRecordsMigration`，可幂等重跑，在 NOT NULL 前回填并将 sequence 推进到 table max 与 sequence 当前值的较大者，安装 trigger、唯一 revision 约束和 `(workspace_id,user_id,sync_revision)` 读取索引。

游标是用至少 32 UTF-8 bytes 的 server-only `ORBIT_SYNC_CURSOR_SECRET` 做 HMAC-SHA256 签名的 canonical base64url token，客户端只把它当不透明字符串；内部固定版本、actor/workspace、`afterRevision`、本轮 `highWatermark` 与签发时间。v1 冻结为 24 小时 TTL、默认 page limit 100、最大 200、最大 token 2048 bytes，并用 constant-time 比较签名；密钥轮换使旧游标进入 reset-required。单条 allowlisted payload 的 UTF-8 JSON 上限为 256 KiB，整个成功 envelope 上限为 1 MiB；超限记录或页面必须显式失败，不能静默截断。

每页只返回 `afterRevision < sync_revision <= highWatermark` 并按 `sync_revision` 升序。分页期间再次变化的行会获得大于 high-watermark 的新 revision：它可以从当前页暂时消失，但下一轮 delta 一定返回最新状态；因此不会把移动中的 `updated_at` 当成稳定快照。最后一页把 cursor 推进到 high-watermark。

删除依赖 `orbit_records.lifecycle_state = deleted` 的持久墓碑，并同样获得新的 `sync_revision`。同步 endpoint 不返回秘密字段、provider token、附件字节、task activities/reminders 或 AI 未授权字段，只使用各域 contract mapper，并施加有界页响应大小。

所有 `orbit_records/tasks` 只投影成 `kind=task`。人脉跟进是 `task.category=relationship` 的本地 selector，不生成第二条 `relationship_followup` wire record；这样分类 PATCH 只更新同一个镜像主键，不会留下旧 kind 幽灵记录。0032 保留的 `relationship_followup` kind 只供未来真正独立实体使用，本 Sprint 不写入。

## App 协调

- 首次成功页返回可信 `workspaceId`，协调器将其写入加密数据库的 `sync_meta`；后续离线重启先读取最后成功 workspace 的镜像。在线响应若切换 workspace，则以服务端值为准并切换当前镜像视图。
- 冷启动且无完成 bootstrap：循环分页，每页事务落地；只有最后一页成功才标记 bootstrap complete。
- 有 cursor：读取 delta 直到 `hasMore=false`，每页记录和 cursor 同事务提交。
- TTL：前台普通读取 5 分钟内复用 mirror；显式 refresh、失效标记、App 从后台恢复超过 60 秒均绕过 TTL。
- 同 scope 同一时刻仅一个 sync；订阅者共享结果，最后一个订阅取消只取消尚未发出的下一页，不回滚已提交页。
- 页面状态区分 `local-ready/syncing/fresh/stale/failure`。有本地数据的网络失败不清空内容；空镜像失败不能变成 empty。
- 旧 `api_snapshots` 只作为一次兼容首屏，不能转换成 canonical entity rows；域 bootstrap 成功后删除对应路径快照。全 App 迁移完成前不删表。
- `/followups` 继续复用 `TasksScreen` 的关系分类视图，不恢复无引用的 `SavedFollowupsList`。`TaskDetailScreen` 只有主 task 从镜像读取，activities 与 reminders 仍走在线资源；联系人内嵌笔记编辑也继续在线。

## 冲突与失败

本 Sprint 不产生 pending 本地修改；如果仓库已有 pending/conflicted 行，delta 不覆盖也不删除它。服务器 conflict base 的独立存储、迁移与首次对账归 0034，且必须在任何离线写入入口开放前完成；禁止把 server version 塞进 `sync_meta` 或在 0033 伪装冲突处理。401/403 清除当前同步资格并走现有 session expiry；无效 cursor 返回可识别的 reset-required，客户端在一个本地事务中只清除该 workspace 的 `synced` canonical rows 与 cursor 后重新 bootstrap，保留 pending/conflicted/failed、outbox 和 device-only drafts。

## 完成定义

四域读取页面由规范化镜像提供首屏；Web→App 四域同账号修改通过 delta 到达；每个服务端响应有稳定分页、actor 隔离和 bounded payload；网络失败/无效 cursor/删除均有真实 UI 和恢复证据。

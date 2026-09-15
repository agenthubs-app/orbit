# Sprint 0033 — 增量读取同步设计

## 目标边界

0032 已提供加密本地镜像。本 Sprint 增加只读 bootstrap/delta 协议，并把 notes、tasks、relationship followups、personal schedule 四个页面域切到镜像优先。所有写入仍走现有在线 endpoint；离线 outbox 留给 0034。

contacts 与 inbox 先保留基础设施可支持但不切换消费者，避免一次 Generator 扩散到全 App。meetings/events/chat 继续使用现有网络路径或短期快照。

## 增量协议

`GET /api/sync?cursor=<opaque>&limit=<1..200>` 的 actor/workspace 只能来自认证上下文。无 cursor 表示 bootstrap；响应严格为：

```ts
export interface SyncPage {
  changes: readonly SyncChange[];
  nextCursor: string;
  hasMore: boolean;
  highWatermark: string;
  serverTime: string;
}

export interface SyncChange {
  kind: "note" | "task" | "relationship_followup" | "personal_schedule";
  id: string;
  revision: string;
  operation: "upsert" | "delete";
  updatedAt: string;
  payload?: unknown;
  aiVisibility: "available_when_synced" | "excluded";
}
```

`orbit_records` 新增数据库分配的单调 `sync_revision`，每次 insert/update/delete 都从 sequence 取得新值；迁移为现有行回填唯一 revision，不使用业务 payload 版本或客户端时间。游标是用 server-only `ORBIT_SYNC_CURSOR_SECRET` 做 HMAC-SHA256 签名的 base64url token，客户端只把它当不透明字符串；内部固定 actor/workspace、`afterRevision` 和本轮 `highWatermark`。

每页只返回 `afterRevision < sync_revision <= highWatermark` 并按 `sync_revision` 升序。分页期间再次变化的行会获得大于 high-watermark 的新 revision：它可以从当前页暂时消失，但下一轮 delta 一定返回最新状态；因此不会把移动中的 `updated_at` 当成稳定快照。最后一页把 cursor 推进到 high-watermark。

删除依赖 `orbit_records.lifecycle_state = deleted` 的持久墓碑，并同样获得新的 `sync_revision`。同步 endpoint 不返回秘密字段、provider token、附件字节或 AI 未授权字段，只使用各域 contract mapper。

## App 协调

- 冷启动且无完成 bootstrap：循环分页，每页事务落地；只有最后一页成功才标记 bootstrap complete。
- 有 cursor：读取 delta 直到 `hasMore=false`，每页记录和 cursor 同事务提交。
- TTL：前台普通读取 5 分钟内复用 mirror；显式 refresh、失效标记、App 从后台恢复超过 60 秒均绕过 TTL。
- 同 scope 同一时刻仅一个 sync；订阅者共享结果，最后一个订阅取消只取消尚未发出的下一页，不回滚已提交页。
- 页面状态区分 `local-ready/syncing/fresh/stale/failure`。有本地数据的网络失败不清空内容；空镜像失败不能变成 empty。
- 旧 `api_snapshots` 只作为一次兼容首屏，不能转换成 canonical entity rows；域 bootstrap 成功后删除对应路径快照。全 App 迁移完成前不删表。

## 冲突与失败

本 Sprint 没有 pending 本地修改；如果仓库发现 pending/conflicted 行，delta 不覆盖它，而把服务器版本保存为 conflict base，供 0034 处理。401/403 清除当前同步资格并走现有 session expiry；无效 cursor 返回可识别的 reset-required，客户端清空该 scope 的 canonical mirror 后重新 bootstrap，但保留 device-only drafts。

## 完成定义

四域读取页面由规范化镜像提供首屏；Web→App 四域同账号修改通过 delta 到达；每个服务端响应有稳定分页、actor 隔离和 bounded payload；网络失败/无效 cursor/删除均有真实 UI 和恢复证据。

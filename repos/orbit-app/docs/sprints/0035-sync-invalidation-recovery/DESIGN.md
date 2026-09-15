# Sprint 0035 — 提供商无关的失效检测与恢复同步设计

## 原则

失效状态或 transport 消息不是数据，也不是顺序/完整性保证；它只说明“这个认证 scope 在某个水位之后可能有变化”。真正的数据仍由 0033 的 `/api/sync` cursor 拉取，0034 的 pending outbox 仍以服务器 receipt 为准。

## 可移植核心

0033 已为 `orbit_records` 变更分配数据库单调 `sync_revision`。0035 用普通 PostgreSQL 查询实现认证的 `GET /api/sync/status?afterRevision=<revision>`：只返回该 actor/workspace 在水位之后是否变化、最新 revision、变化领域集合和服务器时间，不返回实体 ID 或 payload。该接口在本地 PostgreSQL、Supabase PostgreSQL 和 Neon PostgreSQL 上使用同一 SQL/contract。

```ts
export interface SyncInvalidation {
  scopeVersion: 1;
  latestRevision: string;
  changedKinds: readonly SyncEntityKind[];
  emittedAt: string;
}
```

actor/workspace 只来自现有 Orbit 认证会话，不接受 query、UI 或 transport payload 传入。App 前台每 15 秒最多执行一次轻量 status check；`latestRevision` 未前进时不调用数据 delta。100 次业务变更在状态响应中折叠为一个最新水位和去重后的领域集合。

## 可替换 Transport

```ts
export interface InvalidationTransport {
  start(input: {
    afterRevision: string;
    onHint: (hint: SyncInvalidation) => void;
  }): Promise<() => void>;
}
```

- 必需适配器：认证 HTTP status polling，保证任何 PostgreSQL provider 都可运行。
- 可选适配器：供应商 realtime、独立 WebSocket/SSE relay 或现有 push notification；它们只调用 `onHint`，不改变 record/outbox/cursor contract。
- Supabase 与 Neon 的选择推迟到部署环境确定后；若接入任一供应商，只新增 adapter 和配置，不重写同步核心。
- 没有可选 realtime 时不是降级错误：15 秒前台检查、启动、foreground 和手动刷新构成完整正确性路径。

## App 协调策略

- 前台检查：立即检查一次，之后最多每 15 秒一次；收到任何可选 transport 提示时标记 scope dirty，250ms 内合并；已有 sync 在跑时只设置 `rerunRequired`，结束后最多补跑一次。
- 启动：认证完成且本地 scope 可用后执行 freshness check。
- 回前台：后台超过 60 秒或收到过通知提示时立即 delta；更短时间遵守 0033 TTL。
- 网络恢复：有 outbox 或 dirty 标记时先上传 outbox，再 delta pull；冲突不阻塞其他实体。
- 通知点击：现有 `OrbitNotificationsCoordinator` 只触发失效和安全导航，不从通知 payload 写业务数据。
- iOS 后台：不承诺定时执行。没有后台运行证据也不能声称实时；启动/foreground/manual 三条恢复路径必须独立有效。

## 风暴与可观测性

同 scope 单飞，失败采用 1s/2s/4s/8s/30s 上限的 full-jitter 退避；手动刷新可越过等待但不能创建第二并发 sync。记录匿名 transport 类型、status→sync 延迟、delta 数量、重试类别和 cursor lag，不记录业务内容或完整标识。

## 安全失败

status 鉴权失败进入现有 session expiry；可选 transport 鉴权失败时继续认证 HTTP status recovery。跨 scope、过期 watermark、无效 kind 只记录脱敏安全事件。登出先取消 transport 和计时器，再清 local scope；旧 callback 不得触发新账号同步。

## 完成定义

PostgreSQL status 检测、网络恢复、启动和 foreground cursor 修复均可验证；丢提示、重复提示和跨账号请求不会破坏数据或制造风暴；同一 provider-conformance suite 至少在本地 PostgreSQL 运行，选定远端 provider 后可原样复用。Web/API 更新后重建重启并由 Simulator 连接同一环境完成实测。

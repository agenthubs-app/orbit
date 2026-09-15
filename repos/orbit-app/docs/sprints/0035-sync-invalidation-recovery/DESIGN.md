# Sprint 0035 — 实时失效提示与恢复同步设计

## 原则

实时消息不是数据，也不是顺序/完整性保证；它只说明“这个认证 scope 在某个水位之后可能有变化”。真正的数据仍由 0033 的 `/api/sync` cursor 拉取，0034 的 pending outbox 仍以服务器 receipt 为准。

## Transport

生产目标为 Supabase Realtime 对专用 `sync_invalidation_events` 表的私有 Postgres Changes 订阅。数据库 trigger 只为四个允许的 `orbit_records` collection 写入 content-free invalidation row；Realtime 投递失败不会回滚已经提交的业务记录。Vercel/Next.js 用已认证 Orbit session 签发 5 分钟、只含 actor/workspace scope 的 Realtime JWT，App 不持有 service-role key。未配置 Supabase 的环境使用 no-op transport，并依靠前台/手动 cursor recovery；不得回退成公开 channel 或轮询秘密字段。

```ts
export interface SyncInvalidation {
  scopeVersion: 1;
  watermark: string;
  changedKinds: readonly SyncEntityKind[];
  emittedAt: string;
}
```

subscription 的 actor/workspace 来自短期 JWT claim 和 Realtime RLS，不接受 UI 传入。表和 payload 不含 record ID、标题、正文、patch、token 或 email。事件表由固定保留期清理；任何投递遗漏都由 cursor recovery 补偿。

## App 协调策略

- 前台订阅：收到提示后标记 scope dirty，250ms 内的提示合并；已有 sync 在跑时只设置 `rerunRequired`，结束后最多补跑一次。
- 启动：认证完成且本地 scope 可用后执行 freshness check。
- 回前台：后台超过 60 秒或收到过通知提示时立即 delta；更短时间遵守 0033 TTL。
- 网络恢复：有 outbox 或 dirty 标记时先上传 outbox，再 delta pull；冲突不阻塞其他实体。
- 通知点击：现有 `OrbitNotificationsCoordinator` 只触发失效和安全导航，不从通知 payload 写业务数据。
- iOS 后台：不承诺定时执行。没有后台运行证据也不能声称实时；启动/foreground/manual 三条恢复路径必须独立有效。

## 风暴与可观测性

同 scope 单飞，失败采用 1s/2s/4s/8s/30s 上限的 full-jitter 退避；手动刷新可越过等待但不能创建第二并发 sync。记录匿名 channel 状态、hint→sync 延迟、delta 数量、重试类别和 cursor lag，不记录业务内容或完整标识。

## 安全失败

订阅鉴权失败显示普通同步降级状态并继续 foreground recovery；跨 scope、过期 watermark、无效 kind 只记录脱敏安全事件。登出先取消订阅和计时器，再清 local scope；旧 callback 不得触发新账号同步。

## 完成定义

前台实时提示、网络恢复、启动和 foreground cursor 修复均可验证；丢消息、重复消息和跨账号消息不会破坏数据或制造风暴；Web/API 更新后重建重启并由 Simulator 连接同一环境完成实测。

# Sprint 0036 — AI 同步可见性与全链验收设计

## AI 所见数据

Orbit AI 运行在服务器，只读取认证 actor 的 Cloud Canonical Records。App 的 Local Durable Mirror 不直接上传给模型；Pending Local Change 和 Device-only Draft 也不进入 provider prompt。

四个已有只读工具继续是唯一入口：`notes.query`、`tasks.query`、`followups.query`、`schedule.query`。每个结果增加统一 freshness：

```ts
export interface AiQueryFreshness {
  authority: "cloud_canonical";
  readAt: string;
  records: readonly { id: string; revision: string; updatedAt: string }[];
  truncated: boolean;
  nextCursor?: string;
}
```

`revision` 由对应 canonical record 产生，不使用 App cursor、客户端时间或模型推断。无结果仍返回 `readAt` 和 `authority`；`truncated=true` 时回答必须称为“当前返回范围”，不能称为完整清单。

## App 真实性提示

App 在打开/发送 AI 请求时读取本地 outbox 汇总，只传递或展示域级状态，不传业务正文：

- `pendingDomains`: 仅用于客户端 UI，默认不发送 provider。
- 存在 pending/conflict/failed 时显示域名、数量和“Orbit AI 只看云端已同步版本”。
- 用户仍可发问，但回答区域保持提示，不能把提示包装为工具已经读取本机内容。
- acknowledgment 后由 delta 更新 mirror，再移除提示；仅清 outbox 但未取得 canonical revision 不算完成。

## 安全和注入

- actor/workspace 继续由服务器注入；模型 schema 不出现 actorId/userId/accountId/profileId。
- notes/body、task description、follow-up evidence、schedule details 都是不可信文本，不能改变系统指令、工具权限或确认边界。
- manifest 新增 freshness 字段但不放宽 denied fields、maxItems、retention 或审计正文策略。
- audit artifact 记录 tool、status、revision 摘要和 evidence IDs，不记录正文。

## 端到端验收矩阵

| 场景 | Web | App | AI |
| --- | --- | --- | --- |
| 在线写入 | canonical revision 可读 | hint/delta 后相同 revision | query 返回相同 revision |
| App 离线写 | 仍是旧 canonical | 显示 pending overlay | 旧 revision + App pending 提示 |
| 同步完成 | 新 canonical | pending 消失 | 新 revision |
| 冲突 | server 版本保留 | 双版本等待选择 | 只读 server revision |
| 删除 | tombstone/不可读 | delta 后移除 | get 不返回已删正文 |
| 重装/设备丢失 | canonical 保留 | bootstrap 重建；未同步草稿不可恢复 | canonical 不变 |
| 换账号 | actor A/B 隔离 | mirror/outbox/channel 全隔离 | 工具结果全隔离 |

## Data Atlas

更新 `docs/audits/2026-09-15-data-flow/README.md` 的过时基线和“AI 盲区”结论，保留历史问题与解决状态。私有交互站至少包含：领域/原型、云端与本地存储、外部 provider→Web/API→App 路径、同步状态机、AI 工具字段矩阵、离线支持矩阵、失败/冲突、仍未完成项和证据时间。站点不嵌入真实记录、token、数据库 URL 或账号标识。

## 完成定义

四个工具返回可验证 freshness；pending/ack/conflict 在 App 和 AI 中不混淆；完整矩阵在当前合并树和真实运行环境通过；数据审查文档与私有站点一致；所有更改提交并合并回 `chat-agent`，最后对合并树执行一次受影响端全量验证。

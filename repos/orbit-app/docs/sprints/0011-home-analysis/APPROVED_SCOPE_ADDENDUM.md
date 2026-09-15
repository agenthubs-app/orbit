# Sprint 0011 — B7 与跨端消费范围补充

原 Planner revision 3、SHA256 `1b817d35135aec7cdbe2eb231c047ad7f298d3142bc34d02e1fb1f43345d19f6` 及 SC-0011-01～05 不变。用户已明确要求持续完成 A 线及其后仍未实现的功能，并授予当前范围内实现权限；本次只补齐原 Planner 已要求、但白名单尚未列出的 B7 提供方和 App IORBIT 消费文件，不增加新的产品目标或外部副作用。

## Web/shared 提供方

- `repos/orbits/shared/api-schema/mobile-contacts-dashboard.ts`
- `repos/orbits/features/mobile/contacts-dashboard-service.ts`
- 条件新建 `repos/orbits/features/mobile/contacts-analysis-report-service.ts`
- `repos/orbits/shared/contract/ai-sessions.ts`
- `repos/orbits/shared/api-schema/ai-sessions.ts`
- `repos/orbits/features/orbit-ai/reliable-send-service.ts`
- `repos/orbits/features/orbit-ai/storage/orbit-agent-chat-session-live-record-provider.ts`
- 与上述契约、provider、dashboard、profile goal-only 写入直接对应的现有或新增测试。

范围只允许：稳定 `sourceDataVersion`、服务端认可的 `analysisVersion`、actor-scoped 已持久化报告读取、dashboard 可选 `analysis` section、origin 幂等指纹和不会被默认分页漏掉的最新报告查询。`GET` 不生成、不写存储；顶层 `generatedAt` 保持响应组装时间，报告 `generatedAt` 来自已持久化 assistant message。

## App 消费方

- `repos/orbit-app/src/api/schema/mobile-contacts-dashboard.ts`
- `repos/orbit-app/src/api/contract/ai-sessions.ts`
- `repos/orbit-app/src/api/schema/ai-sessions.ts`
- `repos/orbit-app/src/data/ai-template-prefill.ts`
- `repos/orbit-app/app/ai/[id].tsx`
- 条件新建 `repos/orbit-app/src/api/relationship-goal.ts`
- 原 Planner 已列分析页／view-model，以及对应 source、交互、契约同步测试。

App 只显示服务端报告及 `stale` 结论；显式请求分析只注册 actor／server 绑定的 IORBIT 预填并导航，用户发送前不生成。关系目标只发送 `relationshipGoal`、`expectedUpdatedAt`、`mutationId`，不得恢复整份 profile PUT；错误账号、旧版本、无法确认的 2xx 和迟到回执都保留草稿且不显示成功。

## 风险与排除

实施前 GitNexus 已解析的 dashboard、分析页、首页、profile route 和 AI conversations 影响均为 LOW；索引未收录的可靠发送、origin/session provider 和新符号按 UNKNOWN 处理，以完整契约／幂等／账号隔离测试补足，不能解释为零风险。首页仍按原 Planner 白名单实施；Pipeline 只做入口回归，不覆盖已完成 C0022。

本补充不授权付费模型调用、生产数据库写入、迁移、部署、删除聊天后永久保留报告的新产品语义或真实账号代登录。真实跨端、付费生成和实体环境证据仍按实际对象单列。

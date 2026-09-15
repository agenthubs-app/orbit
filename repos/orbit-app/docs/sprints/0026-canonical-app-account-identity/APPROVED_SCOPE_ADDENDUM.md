# Sprint 0026 — 已批准范围补充

## 用户批准

用户已批准把 App 登录主体与业务账号 owner 不一致的问题作为独立追加 Sprint 交给 C 线实施，并要求完成后继续下一 Sprint。已知复现场景中 Auth.js `userId` 与 canonical `accountId` 不同；现有 Web/API 的 `/api/account/me` 是唯一身份来源。

## 身份规则

- `auth.user.id` 保留为原始登录主体，只用于登录会话及明确以登录主体为语义的接口。
- `accountId`／`actorId` 从认证后的 `GET /api/account/me` 的 `account.id` 取得；业务 owner 校验、actor-scoped 回执、本地快照、笔记草稿和 AI 预填／发送意图使用该值。
- 身份接口失败、未登录、`account.id` 缺失或为空时 fail closed；不得回退到原始 `userId`，不得扫描业务响应猜测 owner。
- 既有 `accountId`／`ownerUserId` 严格相等校验继续保留，外部 owner 仍返回不可用状态。

## 审计边界

本 Sprint 必须逐项审计 App 中 `auth.user.id` 的消费者。只修改 owner 校验、actor-scoped 缓存／草稿／回执和与这些回执成对的 AI 消费者。活动报名、认证会话一致性、账号语言等若契约仍明确使用登录主体，则记录为保留，不做批量替换。

## 验证边界

本 Sprint 不修改 Web/API 产品代码或共享契约。App 完成定向与全量测试、typecheck、契约同步检查和当前 Simulator 三条真实业务链；Web 只做当前生产服务健康与 `/api/account/me` 形状核对。若运行证据发现 Web 契约缺陷，另行登记，不在本 Sprint 静默扩展服务端。

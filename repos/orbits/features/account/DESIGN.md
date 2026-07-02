# Account 模块设计文档

## 设计定位

Account 是 Orbit 的会话边界。它不负责真实登录产品体验，也不承载用户资料业务逻辑；它只回答一个问题：当前请求是否处在一个可用账号上下文里。其他模块在执行关系动作、联系人写入、消息发送或外部账号授权前，都应该通过 Account 或 Permissions 获得明确状态。

当前阶段采用 mock session，让产品页、API route 和 harness 可以稳定跑通登录、退出、未登录、等待中和需要账号的状态。现在还提供一个 remote live storage backed session：它从 `orbit_records` 的 `accounts` 和 `profiles` collection 读取当前 operator/workspace 上下文，但不处理真实 auth token、cookie、OAuth callback 或身份提供商退出。真实登录接入时，调用方不应该改页面逻辑，只替换 Account service 的实现。

## 子能力范围

- `mock-account-session`：提供 demo signed-in、signed-out、pending 和 require-account 场景。
- `account-session-live`：从 remote live storage 读取 `accounts`/`profiles` 并映射成当前账号上下文。
- `/api/account/me`：读取当前账号上下文。
- `/api/account/session/sign-out`：模拟退出会话，不触发真实身份提供商。
- App shell 使用账号信息展示 workspace identity，但不直接读取 mock fixture。

## 契约与数据边界

核心契约位于 `features/account/contract.ts`。它定义 account、user、profile、session status、provenance 和错误码。调用方只能依赖这些 DTO，不应依赖 mock session id、fixture 文件名或未来身份提供商的原始 payload。

`features/account/service.ts` 定义会话服务接口。`features/account/service-factory.ts` 是唯一的创建入口。页面和 API route 应使用 `createAccountSessionService()` 或 resolver，不要直接 import `createMockAccountSessionService()`。

## Mock 行为

Mock 会话是确定性的本地状态。它不会访问 OAuth、SSO、cookie 存储、真实数据库或远程账号系统。错误状态必须通过契约返回，不能抛出未包装异常。`signed-out` 和 `pending` 不是异常，它们是产品需要渲染的状态。

## Live Storage 行为

`features/account/storage/account-live-record-provider.ts` 只负责读取通用 live record envelope，并把 `accounts` / `profiles` payload 映射为 `AccountDTO` 和 live profile record。复杂 session payload 不放进 storage；`features/account/live-service.ts` 负责把 account/profile 映射成 `AccountSessionPayload`。

缺少 live database 配置时，live service 返回 `ACCOUNT_LIVE_STORE_UNCONFIGURED`，API route 返回受控 `SERVICE_UNAVAILABLE` envelope。`signOut()` 在这个阶段只是 live policy state，不写 remote DB，也不调用真实身份提供商。

## Auth Provider 替换方案

真实认证实现仍应新增在本模块内，例如 `provider.ts`、`session-mapper.ts`、`validators.ts` 或专门的 auth provider adapter。Provider 可以接 Auth.js、Clerk、企业 SSO 或自建 session store，但必须先映射成 Account contract。真实 auth 接入后，live storage account context 可以继续作为 workspace/profile 读取层，而 token/cookie 生命周期仍属于 auth provider adapter。

## API 与页面使用

Account 不拥有产品页面，只向 shell、API route 和需要账号的业务模块提供上下文。App shell 可以展示账号、计划、workspace 名称和 session 状态，但不能把账号模块变成 Profile 模块的替代品。Profile 信息的业务编辑仍归 `features/profile`。

## 测试要求

- service contract 测试覆盖 signed-in、signed-out、pending、require-account。
- API envelope 测试确认成功与失败都使用共享响应格式。
- shell/page 测试确认未登录和等待状态可渲染。
- live 接入时增加 provider mapper 测试，证明真实 session payload 不泄露到调用方。

## 团队协作规则

Account 团队只维护会话事实，不维护联系人、Profile 或权限授权策略。需要判断外部账号权限时，调用 Permissions；需要展示用户名片时，调用 Profile。跨模块只通过 service interface，不共享 fixture。

# account Feature 设计

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/features/account/DESIGN.md` |
| 中文镜像 | `knowledge/docs/zh/feature-account-design.zh.md` |
| 分类 | `feature-design` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `feature:account` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

记录 account feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。

## 审计依据

已核对 repos/orbits/features/account 目录和 service factory 存在；模块边界还由 modular-boundaries 测试覆盖。

## 结构化阅读入口

- 第 1 节：Account 模块设计文档
- 第 2 节：设计定位
- 第 3 节：子能力范围
- 第 4 节：契约与数据边界
- 第 5 节：Mock 行为
- 第 6 节：Live 替换方案
- 第 7 节：API 与页面使用
- 第 8 节：测试要求
- 第 9 节：团队协作规则

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

## 设计定位

Account 是 Orbit 的会话边界。它不负责真实登录产品体验，也不承载用户资料业务逻辑；它只回答一个问题：当前请求是否处在一个可用账号上下文里。其他模块在执行关系动作、联系人写入、消息发送或外部账号授权前，都应该通过 Account 或 Permissions 获得明确状态。

当前阶段采用 mock session，让产品页、API route 和 harness 可以稳定跑通登录、退出、未登录、等待中和需要账号的状态。真实登录接入时，调用方不应该改页面逻辑，只替换 Account service 的实现。

## 子能力范围

- `mock-account-session`：提供 demo signed-in、signed-out、pending 和 require-account 场景。
- `/api/account/me`：读取当前账号上下文。
- `/api/account/session/sign-out`：模拟退出会话，不触发真实身份提供商。
- App shell 使用账号信息展示 workspace identity，但不直接读取 mock fixture。

## 契约与数据边界

核心契约位于 `features/account/contract.ts`。它定义 account、user、profile、session status、provenance 和错误码。调用方只能依赖这些 DTO，不应依赖 mock session id、fixture 文件名或未来身份提供商的原始 payload。

`features/account/service.ts` 定义会话服务接口。`features/account/service-factory.ts` 是唯一的创建入口。页面和 API route 应使用 `createAccountSessionService()` 或 resolver，不要直接 import `createMockAccountSessionService()`。

## Mock 行为

Mock 会话是确定性的本地状态。它不会访问 OAuth、SSO、cookie 存储、真实数据库或远程账号系统。错误状态必须通过契约返回，不能抛出未包装异常。`signed-out` 和 `pending` 不是异常，它们是产品需要渲染的状态。

## Live 替换方案

真实实现应新增在本模块内，例如 `live-service.ts`、`provider.ts`、`session-mapper.ts`、`validators.ts`。Provider 可以接 Auth.js、Clerk、企业 SSO 或自建 session store，但必须先映射成 Account contract。缺少 live provider 时，factory 应返回 `NOT_IMPLEMENTED`，不能静默退回 mock。

## API 与页面使用

Account 不拥有产品页面，只向 shell、API route 和需要账号的业务模块提供上下文。App shell 可以展示账号、计划、workspace 名称和 session 状态，但不能把账号模块变成 Profile 模块的替代品。Profile 信息的业务编辑仍归 `features/profile`。

## 测试要求

- service contract 测试覆盖 signed-in、signed-out、pending、require-account。
- API envelope 测试确认成功与失败都使用共享响应格式。
- shell/page 测试确认未登录和等待状态可渲染。
- live 接入时增加 provider mapper 测试，证明真实 session payload 不泄露到调用方。

## 团队协作规则

Account 团队只维护会话事实，不维护联系人、Profile 或权限授权策略。需要判断外部账号权限时，调用 Permissions；需要展示用户名片时，调用 Profile。跨模块只通过 service interface，不共享 fixture。

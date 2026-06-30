# bootstrap 能力 Live 交接：app bootstrap mock aggregator

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/features/bootstrap/app-bootstrap-mock-aggregator/LIVE_IMPLEMENTATION.md` |
| 中文镜像 | `knowledge/docs/zh/live-handoff-feature-bootstrap-app-bootstrap-mock-aggregator.zh.md` |
| 分类 | `implementation-handoff` |
| 状态 | `generated-evidence` |
| 新鲜度 | `likely-current` |
| 负责人域 | `feature:bootstrap` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

记录 bootstrap 模块中 app bootstrap mock aggregator 能力从 mock-first 实现切换到 live provider 时需要替换和验证的边界。

## 审计依据

已核对对应 feature 目录存在：repos/orbits/features/bootstrap/app-bootstrap-mock-aggregator。目录级实时行为仍以 service factory、API route 和测试为准。

## 结构化阅读入口

- 第 1 节：App Bootstrap Mock Aggregator 的 Live 实现说明
- 第 2 节：Live Service 和 Provider 文件
- 第 3 节：切换机制
- 第 4 节：必需环境变量和权限
- 第 5 节：隐私 / Privacy 和 Provenance 约束
- 第 6 节：替换测试 / Replacement tests

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

## Live Service 和 Provider 文件

- `features/bootstrap/app-bootstrap-mock-aggregator/live-service.ts` 应该实现 `features/bootstrap/service.ts` 里的 `AppBootstrapService`。
- `features/bootstrap/app-bootstrap-mock-aggregator/providers/account-provider.ts` 负责读取已登录账号和 workspace 上下文。
- `features/bootstrap/app-bootstrap-mock-aggregator/providers/profile-provider.ts` 负责读取用户 profile 摘要和手动填写的 profile 偏好。
- `features/bootstrap/app-bootstrap-mock-aggregator/providers/event-provider.ts` 负责读取即将开始的活动 readiness 记录。
- `features/bootstrap/app-bootstrap-mock-aggregator/providers/relationship-provider.ts` 负责执行已批准的 live database 聚合，生成 connection summary、pending tasks、top agent actions、dashboard summary、permission summary 和 notification summary。

## 切换机制

在现有 feature-mode guard 后面使用 `ORBIT_APP_BOOTSTRAP_PROVIDER=mock|live`。

`mock` 模式必须继续使用 `createMockAppBootstrapService`。`live` 模式只有在 provider 文件、权限检查和替换测试都准备好之后，才可以解析到 live service。

`hybrid` 模式不要静默丢字段。如果某个字段还没有 live provider，就优先使用 mock 数据，并保留 provenance。

## 必需环境变量和权限

- `ORBIT_APP_BOOTSTRAP_PROVIDER`
- 用于读取 live account 的 auth/session provider 配置。
- 用于 live database 聚合的数据库连接变量。
- 如果 calendar 派生的 upcoming events 或 readiness 会影响 bootstrap，必须先有 calendar 权限。
- 如果 email relationship signals 会影响 tasks、agent actions 或 connection summary，必须先有 email 权限。
- 如果 notification summary 要包含 live pending deliveries，必须先有 notification 权限。

## 隐私 / Privacy 和 Provenance 约束

首屏里的这些字段都必须带 source 或 evidence provenance：

- account
- profile
- upcoming events
- connection summary
- pending tasks
- top agent actions
- dashboard summary
- permission summary
- notification summary

live service 不能在没有 source references 或 evidence ids 的情况下推断 relationship context。

server-side personalization 和 live database aggregation 必须在 provenance flags 里可见。这样 evaluator 才能判断这次走的是 live path。

`topAgentActions` 里的敏感动作必须继续要求 confirmation。任何外部副作用发生前，都要先经过 confirmation guard。

live service 不能把只属于 mock 的 evidence ids 复制到生产数据里。

empty、pending 和 controlled failure 必须继续作为明确的 API envelope 返回，不能藏在 partial success payload 里。

## 替换测试 / Replacement tests

- 替换 mock provider guard 测试，证明 `ORBIT_APP_BOOTSTRAP_PROVIDER=mock` 仍然不会触发 network、database、AI、calendar、email、notification 或 device 调用。
- 增加 live service 测试，覆盖 success、empty、pending 和 controlled failure envelope。
- 增加 contract 测试，证明 live service 返回的 top-level DTO 字段和 mock 一致：first-screen account, profile, upcoming events, connection summary, pending tasks, top agent actions, dashboard summary, permission summary, and notification summary。
- 增加权限测试，证明 calendar permission、email permission 和 notification permission 会分别 gate 对应的 live 字段。
- 增加 provenance 测试，证明每个 aggregate 字段都包含 evidence ids 或 source references。

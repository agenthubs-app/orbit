# account 模块架构

本页是 Orbit Wiki 的中文阅读版。它保留原始文档的路径、代码块、命令和接口标识，用中文说明阅读目的、审计依据和结构入口。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/architecture/modules/account.md` |
| 中文镜像 | `knowledge/docs/zh/module-account.zh.md` |
| 分类 | `module-architecture` |
| 状态 | `current` |
| 新鲜度 | `verified-current` |
| 负责人域 | `module:account` |

## 中文摘要

说明 account 模块的定位、期望行为、Mock 行为和热拔插边界。字段和状态仍以对应 contract 文件为准。

## 审计依据

已登记关联代码路径：repos/orbits/features/account/service-factory.ts。

## 结构化阅读入口

- 第 1 节：Account 模块
- 第 2 节：模块定位
- 第 3 节：期望行为
- 第 4 节：Mock 行为
- 第 5 节：热拔插边界

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

## 模块定位

Account 负责当前操作者的会话状态、演示登录、退出登录和需要账号上下文的基础守卫。它是产品进入业务模块前的身份上下文入口。

## 期望行为

模块应提供稳定的 session API，返回当前用户、登录状态和可恢复的错误 envelope。实际业务实现可以接入真实账号系统，但不能改变调用方看到的服务接口。

## Mock 行为

Mock 服务返回确定性的演示账号、待登录状态、退出状态和受控失败场景，不访问真实账号、设备、网络或数据库。

## 热拔插边界

调用方必须通过 `features/account/service-factory.ts` 获取 `AccountSessionService`。未来替换真实账号实现时，只在 factory 中注册 live/hybrid constructor，API route 不直接引用 mock 文件。

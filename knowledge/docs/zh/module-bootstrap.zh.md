# bootstrap 模块架构

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/architecture/modules/bootstrap.md` |
| 中文镜像 | `knowledge/docs/zh/module-bootstrap.zh.md` |
| 分类 | `module-architecture` |
| 状态 | `current` |
| 新鲜度 | `verified-current` |
| 负责人域 | `module:bootstrap` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已和代码或测试做过明确核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

说明 bootstrap 模块的职责、Mock 行为、热拔插边界和阅读顺序。字段、状态和副作用规则仍以对应 contract 与测试为准。

## 审计依据

已登记关联代码路径：repos/orbits/features/bootstrap/service-factory.ts。

## 结构化阅读入口

- 第 1 节：Bootstrap 模块
- 第 2 节：模块定位
- 第 3 节：期望行为
- 第 4 节：Mock 行为
- 第 5 节：热拔插边界

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

## 模块定位

Bootstrap 负责应用启动时的聚合数据，向主界面提供账号、联系人、事件、任务、dashboard、agent 和 chat 的初始摘要。

## 期望行为

模块应组合下游服务并返回一个稳定的 app bootstrap envelope，使首页或 AI command center 可以一次性获得首屏状态。

## Mock 行为

Mock 服务从各模块 mock/factory 组合演示数据，保持 deterministic，不触发真实登录、消息、日历、邮件、数据库或网络行为。

## 热拔插边界

调用方必须通过 `features/bootstrap/service-factory.ts` 获取 `AppBootstrapService`。下游模块替换为 live 后，bootstrap 通过 factory 组合即可渐进升级。

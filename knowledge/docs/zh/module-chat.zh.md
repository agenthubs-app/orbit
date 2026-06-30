# chat 模块架构

本页是 Orbit Wiki 的中文阅读版。它保留原始文档的路径、代码块、命令和接口标识，用中文说明阅读目的、审计依据和结构入口。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/architecture/modules/chat.md` |
| 中文镜像 | `knowledge/docs/zh/module-chat.zh.md` |
| 分类 | `module-architecture` |
| 状态 | `current` |
| 新鲜度 | `verified-current` |
| 负责人域 | `module:chat` |

## 中文摘要

说明 chat 模块的定位、期望行为、Mock 行为和热拔插边界。字段和状态仍以对应 contract 文件为准。

## 审计依据

已登记关联代码路径：repos/orbits/features/chat/service-factory.ts。

## 结构化阅读入口

- 第 1 节：Chat 模块
- 第 2 节：模块定位
- 第 3 节：期望行为
- 第 4 节：Mock 行为
- 第 5 节：热拔插边界

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

## 模块定位

Chat 负责会话列表、消息线程、发送消息、写作辅助、摘要抽取和隐私控制，是产品的自然语言交互入口。

## 期望行为

模块应支持用户围绕联系人和事件进行对话，并把摘要、抽取结果和写作建议以可追溯方式交给其他模块使用。隐私设置必须控制是否允许分析。

## Mock 行为

Mock 服务返回本地会话、消息、摘要、抽取结果、改写建议和隐私状态。发送消息、AI 生成、外部网络、邮件、日历和数据库写入均不真实执行。

## 热拔插边界

调用方必须通过 `features/chat/service-factory.ts` 获取 conversation、writing assist、summary extraction 和 privacy controls。真实 chat backend 或 AI provider 只能接在 factory 后。

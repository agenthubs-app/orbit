# agent 模块架构

本页是 Orbit Wiki 的中文阅读版。它保留原始文档的路径、代码块、命令和接口标识，用中文说明阅读目的、审计依据和结构入口。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/architecture/modules/agent.md` |
| 中文镜像 | `knowledge/docs/zh/module-agent.zh.md` |
| 分类 | `module-architecture` |
| 状态 | `current` |
| 新鲜度 | `verified-current` |
| 负责人域 | `module:agent` |

## 中文摘要

说明 agent 模块的定位、期望行为、Mock 行为和热拔插边界。字段和状态仍以对应 contract 文件为准。

## 审计依据

已登记关联代码路径：repos/orbits/features/agent/service-factory.ts。

## 结构化阅读入口

- 第 1 节：Agent 模块
- 第 2 节：模块定位
- 第 3 节：期望行为
- 第 4 节：Mock 行为
- 第 5 节：热拔插边界

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

## 模块定位

Agent 负责 AI 建议动作队列、自动化设置和外部动作沙箱。它连接智能建议和真实执行之间的人工确认边界。

## 期望行为

模块应列出可解释、可拒绝、可确认的行动建议，并在任何外部副作用前保留确认、审计和来源证据。自动化设置应控制 agent 能做什么、不能做什么。

## Mock 行为

Mock 服务返回确定性的建议动作、设置和沙箱执行记录。所有外部发送、真实 API 调用、数据库写入和通知动作都保持未执行状态。

## 热拔插边界

调用方必须通过 `features/agent/service-factory.ts` 获取 action queue、autonomy settings 和 external action sandbox。真实执行适配器只能接入 factory 后方，不能绕过确认和沙箱契约。

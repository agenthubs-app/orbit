# actions 模块架构

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/architecture/modules/actions.md` |
| 中文镜像 | `knowledge/docs/zh/module-actions.zh.md` |
| 分类 | `module-architecture` |
| 状态 | `current` |
| 新鲜度 | `verified-current` |
| 负责人域 | `module:actions` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已和代码或测试做过明确核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

说明 actions 模块的职责、Mock 行为、热拔插边界和阅读顺序。字段、状态和副作用规则仍以对应 contract 与测试为准。

## 审计依据

已登记关联代码路径：repos/orbits/features/agent/service-factory.ts。

## 结构化阅读入口

- 第 1 节：Actions 模块
- 第 2 节：模块定位
- 第 3 节：期望行为
- 第 4 节：Mock 行为
- 第 5 节：热拔插边界

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

## 模块定位

Actions 负责建议动作队列、自动化设置和外部动作沙箱。它连接 Orbit AI、Contacts、Events、Followups 等模块产生的可复核建议，以及真实外部执行之间的人工确认边界。

这个模块原先在文档中称为 Agent。当前权威产品术语改为 Actions，用来强调它管理的是 side-effect action lifecycle，而不是一个自由自治的 AI agent。代码路径仍暂时沿用 `features/agent`、`/app/agent` 和 `/api/agent/*` 作为 legacy implementation path，直到后续单独迁移路由和符号。

## 期望行为

模块应列出可解释、可拒绝、可确认的行动建议，并在任何外部副作用前保留确认、审计和来源证据。自动化设置应控制 Actions 能准备什么、能排队什么，以及哪些操作必须停在确认边界前。

## Mock 行为

Mock 服务返回确定性的建议动作、设置和沙箱执行记录。所有外部发送、真实 API 调用、数据库写入和通知动作都保持未执行状态。

## 热拔插边界

调用方必须通过当前 legacy 路径 `features/agent/service-factory.ts` 获取 action queue、autonomy settings 和 external action sandbox。真实执行适配器只能接入 factory 后方，不能绕过确认和沙箱契约。

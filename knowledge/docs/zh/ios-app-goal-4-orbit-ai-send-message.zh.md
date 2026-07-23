# iOS App 目标 4：Orbit AI 发送消息计划

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `docs/superpowers/plans/2026-07-03-orbit-ios-app-goal-4-orbit-ai-send-message.md` |
| 中文镜像 | `knowledge/docs/zh/ios-app-goal-4-orbit-ai-send-message.zh.md` |
| 分类 | `implementation-plan` |
| 状态 | `historical` |
| 新鲜度 | `likely-current` |
| 负责人域 | `ios-app` |

## 怎么读

这页主要提供历史背景。不要把它当成当前实现说明，当前行为应回到相关代码路径、主题知识页和更新后的设计文档确认。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

把移动端 Orbit AI Tab 从只读列表变成可用的助手收件箱：新增聊天输入框，经现有 envelope 客户端 POST /api/ai/conversations，映射助手回复、消息列表与建议的工具意图，并渲染发送中/成功/校验失败/离线/失败等状态。明确不含流式响应与工具确认执行。

## 审计依据

一次性任务清单式计划，属于已执行的历史材料；repos/orbit-app 的 AiScreen.tsx、conversations.ts 视图模型与 conversation-view-model.test.ts 已实现该能力并被后续 Goal 5 继续扩展。当前行为以 orbit-app 代码及 orbits 侧 /api/ai/conversations 合约为准。

## 结构化阅读入口

- 第 1 节：Orbit iOS App 目标 4: Orbit AI Send Message 计划
- 第 2 节：任务

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。

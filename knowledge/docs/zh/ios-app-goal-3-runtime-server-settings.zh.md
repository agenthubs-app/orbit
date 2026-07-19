# iOS App 目标 3：运行时服务器地址设置计划

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `docs/superpowers/plans/2026-07-03-orbit-ios-app-goal-3-runtime-server-settings.md` |
| 中文镜像 | `knowledge/docs/zh/ios-app-goal-3-runtime-server-settings.zh.md` |
| 分类 | `implementation-plan` |
| 状态 | `historical` |
| 新鲜度 | `likely-current` |
| 负责人域 | `ios-app` |

## 怎么读

这页主要提供历史背景。不要把它当成当前实现说明，当前行为应回到相关代码路径、主题知识页和更新后的设计文档确认。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

让 App 在运行时切换 Orbit API 服务器地址，模拟器、真机、远程 API 测试无需改代码：新增 base URL 规范化/校验工具、AsyncStorage 持久化的服务器地址 Provider 包裹根布局，并把只读 Settings 页替换为可编辑的服务器地址表单。

## 审计依据

一次性任务清单式计划，属于已执行的历史材料；repos/orbit-app/src/api 下的 base-url.ts、ApiBaseUrlProvider.tsx 与 ApiSettingsScreen.tsx 及 base-url.test.ts 已落地。当前行为以这些代码为准，本文档记录该阶段范围（明确排除鉴权、密钥与生产环境管理）。

## 结构化阅读入口

- 第 1 节：Orbit iOS App 目标 3: 运行时 Server Settings 计划
- 第 2 节：任务

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。

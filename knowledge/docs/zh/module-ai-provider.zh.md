# ai-provider 模块架构

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/architecture/modules/ai-provider.md` |
| 中文镜像 | `knowledge/docs/zh/module-ai-provider.zh.md` |
| 分类 | `module-architecture` |
| 状态 | `current` |
| 新鲜度 | `verified-current` |
| 负责人域 | `module:ai-provider` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已和代码或测试做过明确核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

说明 ai-provider 模块的职责、Mock 行为、热拔插边界和阅读顺序。字段、状态和副作用规则仍以对应 contract 与测试为准。

## 审计依据

已登记关联代码路径：repos/orbits/shared/ai/service-factory.ts。

## 结构化阅读入口

- 第 1 节：AI Provider 模块
- 第 2 节：模块定位
- 第 3 节：期望行为
- 第 4 节：Mock 行为
- 第 5 节：热拔插边界

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

## 模块定位

AI Provider 是共享 AI 输出边界，负责消息草稿、运行记录、prompt template、输入哈希和 provenance。

## 期望行为

模块应提供可追溯的 AI-shaped 输出和 run lookup。真实模型接入后，也必须保留 prompt id、input hash、source refs、fallback 信息和外部调用标记。

## Mock 行为

Mock 服务用本地规则生成 message draft 和 run record，明确标记 `modelCallExecuted: false`、`liveAiProviderRequested: false`，不调用真实模型、网络、数据库、邮箱、日历、通知或设备。

## 热拔插边界

调用方必须通过 `shared/ai/service-factory.ts` 获取 `AiProviderService`。真实模型 provider 只能作为 live/hybrid constructor 注册到 factory，不能被 route 直接引用。

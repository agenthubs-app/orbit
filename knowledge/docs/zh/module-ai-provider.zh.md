# ai-provider 模块架构

本页是 Orbit Wiki 的中文阅读版。它保留原始文档的路径、代码块、命令和接口标识，用中文说明阅读目的、审计依据和结构入口。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/architecture/modules/ai-provider.md` |
| 中文镜像 | `knowledge/docs/zh/module-ai-provider.zh.md` |
| 分类 | `module-architecture` |
| 状态 | `current` |
| 新鲜度 | `verified-current` |
| 负责人域 | `module:ai-provider` |

## 中文摘要

说明 ai-provider 模块的定位、期望行为、Mock 行为和热拔插边界。字段和状态仍以对应 contract 文件为准。

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

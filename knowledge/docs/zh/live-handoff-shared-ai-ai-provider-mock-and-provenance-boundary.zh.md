# Shared Runtime 交接：ai

本页是 Orbit Wiki 的中文阅读版。它保留原始文档的路径、代码块、命令和接口标识，用中文说明阅读目的、审计依据和结构入口。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/shared/ai/ai-provider-mock-and-provenance-boundary/LIVE_IMPLEMENTATION.md` |
| 中文镜像 | `knowledge/docs/zh/live-handoff-shared-ai-ai-provider-mock-and-provenance-boundary.zh.md` |
| 分类 | `implementation-handoff` |
| 状态 | `generated-evidence` |
| 新鲜度 | `likely-current` |
| 负责人域 | `shared:ai` |

## 中文摘要

记录 shared/ai 共享层从 mock 或本地实现迁移到 live/runtime provider 时的契约、替换点和验证要求。

## 审计依据

已核对共享代码目录存在：repos/orbits/shared/ai/ai-provider-mock-and-provenance-boundary。具体数据结构和 API 仍以 shared 层源码与测试为准。

## 结构化阅读入口

- 第 1 节：AI Provider Mock and Provenance 边界 Live 实现
- 第 2 节：Live 服务 Provider files
- 第 3 节：源文档第 3 个标题
- 第 4 节：Required env vars and 权限
- 第 5 节：源文档第 5 个标题
- 第 6 节：Replacement 测试

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

该源文档主体不是中文。当前中文阅读版先保留中文摘要、审计依据、结构化入口和代码证据，不把英文原文混入默认阅读正文。

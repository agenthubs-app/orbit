# Hybrid Mockdata Handoff 计划

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `docs/superpowers/plans/2026-06-30-hybrid-mockdata-handoff.md` |
| 中文镜像 | `knowledge/docs/zh/hybrid-mockdata-handoff-plan.zh.md` |
| 分类 | `implementation-plan` |
| 状态 | `current` |
| 新鲜度 | `verified-current` |
| 负责人域 | `data` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已和代码或测试做过明确核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

实施 generated relationship fixture 接入 app mock/hybrid 数据层的计划。

## 审计依据

已核对生成 fixture 已接入 shared/mock/fixtures.ts，且 core hybrid local-remote services 与 relationship schema tests 覆盖该链路。

## 结构化阅读入口

- 第 1 节：Hybrid Mockdata Handoff 实现 计划
- 第 2 节：源标题：Global Constraints
- 第 3 节：任务 1: Add 生成器 契约 测试
- 第 4 节：任务 2: Generate MockRuntimeFixtures Compatible TypeScript
- 第 5 节：任务 3: Wire Default Fixtures Generated 数据
- 第 6 节：任务 4: Verify App Hybrid Handoff
- 第 7 节：任务 5: 审计 Mock Live Handoff

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。

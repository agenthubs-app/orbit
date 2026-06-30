# Hybrid Mockdata Handoff 计划

本页是 Orbit Wiki 的中文阅读版。它保留原始文档的路径、代码块、命令和接口标识，用中文说明阅读目的、审计依据和结构入口。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `docs/superpowers/plans/2026-06-30-hybrid-mockdata-handoff.md` |
| 中文镜像 | `knowledge/docs/zh/hybrid-mockdata-handoff-plan.zh.md` |
| 分类 | `implementation-plan` |
| 状态 | `current` |
| 新鲜度 | `verified-current` |
| 负责人域 | `data` |

## 中文摘要

实施 generated relationship fixture 接入 app mock/hybrid 数据层的计划。

## 审计依据

已核对生成 fixture 已接入 shared/mock/fixtures.ts，且 core hybrid local-remote services 与 relationship schema tests 覆盖该链路。

## 结构化阅读入口

- 第 1 节：Hybrid Mockdata Handoff 实现 计划
- 第 2 节：源文档第 2 个标题
- 第 3 节：任务 1: Add 生成器 契约 测试
- 第 4 节：任务 2: Generate MockRuntimeFixtures Compatible TypeScript
- 第 5 节：任务 3: Wire Default Fixtures To Generated 数据
- 第 6 节：任务 4: Verify App Hybrid Handoff
- 第 7 节：任务 5: 审计 Mock To Live Handoff

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

该源文档主体不是中文。当前中文阅读版先保留中文摘要、审计依据、结构化入口和代码证据，不把英文原文混入默认阅读正文。

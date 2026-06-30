# Orbits App Agent 规则

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/AGENTS.md` |
| 中文镜像 | `knowledge/docs/zh/app-agent-rules.zh.md` |
| 分类 | `technical-design` |
| 状态 | `current` |
| 新鲜度 | `verified-current` |
| 负责人域 | `repos/orbits` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已和代码或测试做过明确核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

定义 app repo 内实现边界、mock/live 替换、产品 UI 与 contract 解耦，以及 /dev/knowledge manifest 规则。

## 审计依据

已登记关联代码路径：repos/orbits/app、repos/orbits/features、repos/orbits/shared。

## 结构化阅读入口

- 第 1 节：Orbits Agent 规则
- 第 2 节：Dev 能力 Surfaces
- 第 3 节：源标题：Mock Live Component Replacement
- 第 4 节：产品 UI 契约 Decoupling
- 第 5 节：App Documentation 和 知识 Manifest

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。

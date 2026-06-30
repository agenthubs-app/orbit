# Orbit AI 性能检查

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/architecture/orbit-ai-agent-performance-check-2026-06-30.md` |
| 中文镜像 | `knowledge/docs/zh/orbit-ai-performance-check.zh.md` |
| 分类 | `architecture` |
| 状态 | `historical` |
| 新鲜度 | `likely-current` |
| 负责人域 | `orbit-ai` |

## 怎么读

这页主要提供历史背景。不要把它当成当前实现说明，当前行为应回到相关代码路径、主题知识页和更新后的设计文档确认。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

2026-06-30 的 Orbit AI 性能审计和已落地优化记录：provider latency、loop steps、Server-Timing、外置 reference CSS、ETag 和重复 JSON clone 移除。

## 审计依据

已核对本记录对应的优化已在 route、live runtime、artifact producer 和 OrbitReferenceStyles 相关代码中落地；它仍是历史快照，新的性能判断要重新测量。

## 结构化阅读入口

- 第 1 节：源标题：Orbit AI Agent Performance Check 2026 06 30
- 第 2 节：摘要
- 第 3 节：如何 阅读 记录
- 第 4 节：已实现 变更
- 第 5 节：当前 运行时 模式
- 第 6 节：执行 路径
- 第 7 节：测量
- 第 8 节：发现
- 第 9 节：为什么 会 仍然 感觉 像 "不能 点击"
- 第 10 节：剩余 优化 候选项
- 第 11 节：Reproduction 记录

## 保留的代码与命令证据

### 代码证据 1

```text
server-timing: orbit-total;dur=7.9, orbit-read-body;dur=6.1, orbit-service;dur=0.9, orbit-serialize;dur=0.8
```

## 源文档正文

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。

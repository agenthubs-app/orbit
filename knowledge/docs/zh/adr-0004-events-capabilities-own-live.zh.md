# ADR-0004：Events 各 capability 按业务角色命名并自持 live 实现

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `docs/adr/0004-events-capabilities-own-live-implementations.md` |
| 中文镜像 | `knowledge/docs/zh/adr-0004-events-capabilities-own-live.zh.md` |
| 分类 | `adr` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `events` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

决定 Events 子能力（attendee-roster、goal-readiness、encounter-note、want-connect、post-event-review）按业务角色命名，mock/hybrid/live 只是其可替换实现；迁移顺序为先结构性去 mock、再 live 边界、最后全量数据接通，用户产生的活动工作成为 orbit_records 中的持久 Live Records，派生分数与推荐保持为计算视图。

## 审计依据

长期架构决定记录（ADR），命名与迁移顺序仍是权威约束；各子能力当前实际的 live 行为以 repos/orbits/features/events/ 下各 capability 的 live-service 与对应 tests/capabilities/ 测试为准。

## 结构化阅读入口

- 第 1 节：活动 能力 Own Live Implementations
- 第 2 节：源标题：Considered Options
- 第 3 节：源标题：Consequences

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。

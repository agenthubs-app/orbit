# Events 能力接入真实数据设计

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `docs/superpowers/specs/2026-07-01-events-capability-live-data-design.md` |
| 中文镜像 | `knowledge/docs/zh/events-capability-live-data-design.zh.md` |
| 分类 | `sprint-spec` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `events` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

规划 Events 从"mock 命名目录 + 纯 mock 服务"分三阶段走向真实数据：先把子能力目录去 mock 化改为业务命名（attendee-roster、goal-readiness、encounter-note、want-connect、post-event-review），再基于 LiveRecord 信封建立存储 provider 骨架与七类集合，最后逐能力接入 live 服务并在 service-factory 注册，缺失 live 配置时 fail-closed 而非回退 mock。同时划定边界：Events 只存事件工作记录和联系人草稿，正式联系人创建仍走 Acquisition/Contacts。

## 审计依据

这是 sprint 设计文档而非一次性计划；repos/orbits/features/events 下的目录已呈业务命名且存在 storage/ 与 service-factory.ts，说明至少 Stage 1-2 已落地。三阶段路线与边界规则（Events 不直接建联系人、Calendar 导入与 Events Live Store 分离）仍是该能力的设计权威；具体实现进度以 features/events 代码为准。

## 结构化阅读入口

- 第 1 节：活动 能力 Live 数据 设计
- 第 2 节：目标
- 第 3 节：源标题：Stage 1: Structural Democking
- 第 4 节：Stage 2: Live Payload 和 Provider Skeletons
- 第 5 节：Stage 3: Full Live 数据 Links
- 第 6 节：边界 规则
- 第 7 节：验证

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。

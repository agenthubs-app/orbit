# events 能力 Live 交接：registration profile guide

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/features/events/REGISTRATION_PROFILE_GUIDE_LIVE_IMPLEMENTATION.md` |
| 中文镜像 | `knowledge/docs/zh/live-handoff-feature-events-registration-profile-guide-live-implementation.zh.md` |
| 分类 | `implementation-handoff` |
| 状态 | `generated-evidence` |
| 新鲜度 | `likely-current` |
| 负责人域 | `feature:events` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

记录 events 模块 registration profile guide 能力的 live 实现 边界：需要替换的服务、环境变量、权限约束和验证要求。

## 审计依据

已核对对应 feature 目录存在：repos/orbits/features/events。具体切换行为以 service factory 与测试为准。

## 结构化阅读入口

- 第 1 节：活动 Registration Live 实现
- 第 2 节：源标题：Shared Orbit AI Model
- 第 3 节：Registration 状态
- 第 4 节：API 和 UI
- 第 5 节：验证

## 保留的代码与命令证据

### 代码证据 1

```ts
type EventRegistration = {
  id: string;
  eventId: string;
  userId: string;
  status: "rsvped" | "cancelled";
  participantProfileId: string;
  registeredAt: string;
  cancelledAt: string | null;
  reactivatedAt: string | null;
  updatedAt: string;
};
```

## 源文档正文

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。

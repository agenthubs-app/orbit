# Orbit iOS App 总体设计

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `docs/superpowers/specs/2026-07-03-orbit-ios-app-design.md` |
| 中文镜像 | `knowledge/docs/zh/orbit-ios-app-design.zh.md` |
| 分类 | `sprint-spec` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `ios-app` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

确立 repos/orbit-app 作为 iOS-first 独立 Expo 客户端的总体设计：明确拒绝 WebView 封装与过早 monorepo 化，移动端只消费 repos/orbits 的 /api/** HTTP 接口，Orbit AI 聊天窗口是唯一助手收件箱（主动提醒以助手 turn 出现而非独立通知中心）。定义了移动端/Web 端职责边界、API 客户端要求、五 Tab 导航模型、设计规则，以及 Goal 1-12 的长期路线（从脚手架到相机采集、推送与 TestFlight 发布）。

## 审计依据

这是 orbit-app 的顶层设计文档，也是 Goal 2-8 各实施计划共同引用的权威来源；其边界规则（独立 Expo 应用、仅走 HTTP API、不暴露 mock/hybrid/provider 标签、路由状态五分法）与当前 repos/orbit-app 代码一致，仍应视为移动端架构的现行准绳。Goal 9 之后的路线（原生采集、推送、发布）尚未实施，属于前瞻内容。

## 结构化阅读入口

- 第 1 节：Orbit iOS App 设计
- 第 2 节：目标
- 第 3 节：源标题：Approved Direction
- 第 4 节：源标题：Technology Baseline
- 第 5 节：产品 Position
- 第 6 节：边界
- 第 7 节：源标题：Mobile App Owns
- 第 8 节：源标题：Web API Repo Owns
- 第 9 节：Cross Project 契约
- 第 10 节：API 策略
- 第 11 节：源标题：Navigation Model
- 第 12 节：Mobile 设计 Direction
- 第 13 节：源标题：First Stage Scope
- 第 14 节：Long Term 目标 Breakdown
- 第 15 节：目标 1: Mobile 设计 和 架构 Baseline
- 第 16 节：目标 2: Expo iOS Project Scaffold
- 第 17 节：目标 3: API Client 和 运行时 Status
- 第 18 节：目标 4: Mobile App Shell
- 第 19 节：目标 5: Orbit AI Mobile Chat
- 第 20 节：目标 6: 活动 Mobile
- 第 21 节：目标 7: 联系人 Mobile
- 第 22 节：目标 8: Schedule 和 跟进 Mobile
- 第 23 节：目标 9: Profile 和 Settings
- 第 24 节：目标 10: Native 获取
- 第 25 节：目标 11: Native Proactive Delivery
- 第 26 节：目标 12: Release Readiness
- 第 27 节：错误 处理
- 第 28 节：Testing 策略
- 第 29 节：Operational 记录
- 第 30 节：源标题：Open Risks

## 保留的代码与命令证据

### 代码证据 1

```text
repos/orbit-app iOS screens
  -> mobile API client
  -> repos/orbits /api/**
  -> feature service factories
  -> mock / hybrid / live providers
  -> shared storage, AI providers, and feature-owned contracts
```

### 代码证据 2

```text
mobile screen
  -> orbitApi.get<T>("/api/app/bootstrap")
  -> ApiEnvelope<T>
  -> success data or ApiErrorBody
  -> mobile screen state
```

### 代码证据 3

```text
app/
  _layout.tsx
  index.tsx
  (tabs)/
    _layout.tsx
    ai.tsx
    events.tsx
    contacts.tsx
    schedule.tsx
    profile.tsx
  events/
    [id].tsx
  contacts/
    [id].tsx
  settings/
    api.tsx
```

### 代码证据 4

```bash
cd repos/orbits
ORBIT_MODULE_MODE=live npm run dev
```

### 代码证据 5

```bash
cd repos/orbit-app
EXPO_PUBLIC_ORBIT_API_BASE_URL=http://localhost:3000 npm run ios
```

## 源文档正文

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。

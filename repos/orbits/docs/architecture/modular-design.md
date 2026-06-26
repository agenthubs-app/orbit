# Orbits 模块化与热拔插设计

## 设计目标

Orbits 的业务模块采用“contract + service-factory + mock/live implementation”的积木化设计。页面和 API route 只依赖 service factory 与 contract，不直接引用 mock 文件。这样团队可以并行开发不同模块，并在不重写调用方的情况下，把 mock 抽换为真实业务组件。

## 调用路径

```text
App Page / API Route
  -> features/<module>/service-factory.ts
  -> Service Interface / Contract
  -> mock | hybrid | live implementation
```

共享 AI provider 使用同样结构：

```text
App Page / API Route
  -> shared/ai/service-factory.ts
  -> AiProviderService
  -> mock | hybrid | live provider
```

## 模式

`shared/services/module-mode.ts` 定义 `mock`、`hybrid`、`live` 三种模式。当前默认是 `mock`。当请求 `live` 但尚未注册真实实现时，factory 返回 `NOT_IMPLEMENTED`，避免系统静默回退并掩盖集成缺口。

## 模块树

```text
orbits
├─ account
│  └─ session
├─ permissions
│  ├─ permission state
│  └─ sensitive action confirmation
├─ profile
│  ├─ manual profile
│  ├─ document extraction
│  └─ signal review queue
├─ acquisition
│  ├─ contact draft
│  ├─ manual contact creation
│  ├─ business card scan OCR
│  ├─ business card review
│  ├─ QR scan connect
│  ├─ event attendee import
│  ├─ external contacts import
│  ├─ email/calendar relationship signal
│  ├─ referral recommendation
│  └─ duplicate detection and merge
├─ contacts
│  ├─ list/search/filter
│  └─ detail/tag/status
├─ connections
│  ├─ connection evidence
│  └─ relationship stage/profile
├─ analysis
│  └─ relationship value scoring
├─ events
│  ├─ event CRUD/import
│  ├─ attendee roster
│  ├─ goal/readiness
│  ├─ encounter note
│  ├─ want-to-connect
│  └─ post-event contact review
├─ recommendations
│  ├─ event recommendation/opening line
│  └─ event value recommendation
├─ followups
│  ├─ followup task generation
│  └─ message draft generator
├─ notifications
│  └─ reminder schedule notification
├─ chat
│  ├─ conversation/message
│  ├─ writing assist
│  ├─ summary extraction
│  └─ privacy controls
├─ dashboard
│  ├─ aggregate
│  ├─ network distribution analytics
│  └─ opportunity reminder analytics
├─ audit
│  └─ source consistency/provenance audit
├─ search
│  └─ relationship natural search
├─ agent
│  ├─ action queue
│  ├─ autonomy settings
│  └─ external action sandbox
├─ ai-provider
│  └─ shared AI run/message provider
├─ bootstrap
│  └─ app bootstrap aggregator
└─ orbit-ai
   └─ AI command center orchestration
```

## 团队协作规则

每个模块的真实业务开发应优先新增 live/hybrid implementation，并在对应 `service-factory.ts` 注册。开发者不应让页面或 API route 直接 import mock 或 live provider。需要调试的能力继续保留 mock 和 dev debug view，但调试面板不能成为生产调用路径的依赖。

## 文档规则

模块级文档位于 `docs/architecture/modules/`。这些文档只记录模块定位、期望行为、mock 行为和热拔插边界；具体字段、状态机和错误码以对应 contract 文件为准。

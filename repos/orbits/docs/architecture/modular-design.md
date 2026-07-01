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

面向用户的 `/app/**` 页面应再加一层 route view model，让 React 组件不直接依赖业务 contract DTO：

```text
Product Route Component
  -> app/(app)/.../*-route-view-model.ts
  -> features/<module>/service-factory.ts
  -> Service Interface / Contract
  -> mock | hybrid | live implementation
```

`*-route-view-model.ts` 负责调用一个或多个模块 service、合并 success/failure state、过滤公开证据、把 provenance 和 action safety 映射成页面可渲染的数据。React presenter 只接收页面专用 view model，不直接读取 `features/<module>/contract.ts` 的 payload 字段，也不调用 mock/live/provider factory。

这次解耦发生在产品 UI presenter 与业务 capability contract/service 之间。`features/**` 仍拥有业务 contract、service interface、mock/live implementation 和 provider mapper；`app/(app)/**` 的 route view-model/service 负责把这些业务结果转成页面私有 view model；React 组件只渲染 UI-ready 的 labels、links、counts、state variants 和安全提示。这样 UI 改版不会要求修改业务 contract，mock/live 替换也不会扩散到 JSX 组件树。

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
├─ actions
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

产品 UI 与业务 contract 的边界规则：

- `features/<module>/contract.ts` 是模块/API/service 的稳定契约，不是 React 组件 props 的默认形状。
- `/app/**` 页面如果需要组合多个 capability，应新增本路由的 view-model 或 route-service 文件，把业务 DTO 转为 render-neutral 数据。
- route view-model/service 是产品 UI 与业务 capability 的防腐层。它可以依赖 service factory 和 contract DTO，但页面 presenter 不应反向依赖这些业务 contract 字段。
- UI 组件可以依赖 `shared/ui` primitives 和本路由 view model 类型；不应依赖 mock service、live provider、Orbit AI provider payload、外部 provider payload 或 raw fixture shape。
- AI/artifact/generated-view 场景必须先经过 feature-owned 或 route-owned mapper，再进入 side panel、card、list 等 UI presenter。

## 文档规则

模块级文档位于 `docs/architecture/modules/`。这些文档只记录模块定位、期望行为、mock 行为和热拔插边界；具体字段、状态机和错误码以对应 contract 文件为准。

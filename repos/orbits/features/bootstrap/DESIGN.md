# Bootstrap 模块设计文档

## 设计定位

Bootstrap 负责启动产品工作台时的一次性聚合。它把账号、权限、Profile、联系人、活动、跟进、仪表盘和 Agent 的核心状态整理成首页可以使用的初始上下文。

Bootstrap 不拥有业务事实。它的职责是编排和兜底，让 `/app` 在 mock 模式下能稳定启动，在 live 模式下能清楚暴露哪个依赖还没准备好。

## 子能力范围

- `app-bootstrap-mock-aggregator`：聚合 mock 账号、Profile、联系人、活动、跟进和 Agent 状态。
- `app-bootstrap-live`：从 shared live record store 聚合账号、Profile、联系人、关系、活动、任务、Agent action、权限和通知摘要。
- 为 `/app` AI command center 和产品 shell 提供初始数据。

## 契约与数据边界

契约位于 `features/bootstrap/contract.ts`。输出应包含 workspace summary、primary prompt context、route readiness、supporting counts、recovery links 和 provenance。Bootstrap 只能消费其他模块 service interface，不能 import 其他模块 mock fixture。

`features/bootstrap/service-factory.ts` 是唯一入口。

live storage 字段映射位于 `features/bootstrap/storage/bootstrap-live-record-provider.ts`。它只读取 `orbit_records` 的通用 envelope，并把 `accounts`、`profiles`、`contacts`、`connections`、`events`、`tasks`、`agentActions`、`permissions`、`notifications` 和 `evidence` collections 映射回已有 DTO。不要把这些领域字段加进 `shared/storage/live-record-store.ts`。

## Mock 行为

Mock bootstrap 通过 service factory 读取本地 mock 服务并组合结果。它不访问数据库、搜索、AI provider 或外部网络。某个依赖失败时，Bootstrap 应返回明确 partial/failure 状态，而不是让首页崩溃。

## Live 替换方案

Live bootstrap 通过 `ORBIT_MODULE_MODE=live` 由 `features/bootstrap/live-service.ts` 启用。当前实现读取 shared live record store 并返回同一个 bootstrap DTO；它不写数据库、不触发通知投递、不调用 AI provider、日历、邮箱或设备 API。

当 live storage 未配置时，service 返回 `APP_BOOTSTRAP_LIVE_STORE_UNCONFIGURED`，API 以 503 envelope 暴露失败来源。未来如果把 bootstrap 改成并发调用各模块 live service，需要保留超时、错误归因和 partial recovery，不能因为一个次要模块失败就清空整个首页。

## API 与页面使用

主要 API 是 `/api/app/bootstrap`，主要页面是 `/app`。页面用它决定默认侧边面板、首页摘要、恢复动作和可用功能入口。页面不能从 Bootstrap 结果里读取 provider 细节。

## 测试要求

- 聚合测试确认 Bootstrap 通过 service factory 获取依赖。
- API 测试覆盖 success、empty、pending、failure。
- 页面测试确认 `/app` 在 partial 状态仍有可恢复 UI。
- live 接入测试确认 memory live store 可以聚合首屏数据、未配置 live store 会 fail closed、API header 和 service mode 对齐。

## 团队协作规则

Bootstrap 团队只负责组合，不负责修其他模块的业务结果。需要新增首页字段时，先在对应模块 contract 增加语义字段，再由 Bootstrap 聚合。

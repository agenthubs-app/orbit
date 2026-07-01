# Orbit 模块地图

Orbit app 按业务能力拆为 feature modules。每个模块应有 contract、service interface、service factory、mock/hybrid/live 实现边界，以及中文模块架构文档。

模块文档只负责解释边界。真正的字段、错误码、副作用约束和调用方式，以对应 feature 的 contract、service factory、mock/live service 和测试为准。

## 模块分组

- 账号和权限：`account`、`permissions`
- 关系资料：`profile`、`contacts`、`connections`、`analysis`、`audit`
- 获取来源：`acquisition`、`events`
- 行动推进：`recommendations`、`followups`、`notifications`
- AI 和 Actions：`chat`、`orbit-ai`、`actions`、`ai-provider`
- 体验聚合：`dashboard`、`bootstrap`、`search`

## 阅读顺序

1. 先读 `repos/orbits/docs/architecture/modular-design.md`。
2. 再读 `repos/orbits/docs/architecture/modules/<module>.md`，确认模块职责、Mock 行为和热拔插边界。
3. 继续读 `repos/orbits/features/<module>/DESIGN.md`，确认该 feature 的具体产品行为和协作规则。Actions 目前是例外：权威模块文档是 `repos/orbits/docs/architecture/modules/actions.md`，当前实现路径仍是 legacy `repos/orbits/features/agent/DESIGN.md`。
4. 最后读 `contract.ts`、`service.ts`、`service-factory.ts` 和相关测试，确认代码现在实际怎么运行。

## Orbit AI 例外点

`orbit-ai` 比普通业务模块多一层编排逻辑。阅读它时不要只看模块页，还要看：

- `repos/orbits/features/orbit-ai/DESIGN.md`
- `repos/orbits/features/orbit-ai/live-agent-runtime.ts`
- `repos/orbits/features/orbit-ai/trace-contract.ts`
- `repos/orbits/docs/superpowers/specs/2026-06-29-orbit-ai-trace-debug-design.zh.md`

原因是产品 chat、full-chain trace 和 planner-only 诊断共用 runtime；只看页面或 route 会漏掉真实执行链。

## 测试保护

`repos/orbits/tests/services/modular-boundaries.test.ts` 已检查模块文档必须包含中文的模块定位、期望行为、Mock 行为和热拔插边界。

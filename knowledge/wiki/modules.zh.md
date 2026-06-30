# Orbit 模块地图

Orbit app 按业务能力拆为 feature modules。每个模块应有 contract、service interface、service factory、mock/hybrid/live 实现边界，以及中文模块架构文档。

## 模块分组

- 账号和权限：`account`、`permissions`
- 关系资料：`profile`、`contacts`、`connections`、`analysis`、`audit`
- 获取来源：`acquisition`、`events`
- 行动推进：`recommendations`、`followups`、`notifications`
- AI 和 Agent：`chat`、`orbit-ai`、`agent`、`ai-provider`
- 体验聚合：`dashboard`、`bootstrap`、`search`

## 阅读顺序

1. 先读 `repos/orbits/docs/architecture/modular-design.md`。
2. 再读 `repos/orbits/docs/architecture/modules/<module>.md`。
3. 最后读 `features/<module>/DESIGN.md`、contract 和 service factory。

## 测试保护

`repos/orbits/tests/services/modular-boundaries.test.ts` 已检查模块文档必须包含中文的模块定位、期望行为、Mock 行为和热拔插边界。

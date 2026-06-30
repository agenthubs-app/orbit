# 数据与 Mockdata

Orbit 当前使用 mock-first 和 hybrid local-remote database 过渡真实数据层。目标是让 mock 数据、generated fixture 和未来 live provider 都映射到同一组 DTO。

## 数据边界

- `repos/orbits/shared/domain/contracts.ts` 定义核心 DTO。
- `repos/orbits/shared/local-remote-store/orbit-database.ts` 提供本地/远端边界。
- `repos/orbits/shared/mock/fixtures.ts` 暴露 app 默认 fixture。
- `repos/orbits/shared/mock/generated-relationship-fixtures.ts` 是 relationship mockdata 生成产物。

## Mockdata 链路

根侧 `harness/relationship_data_goal_runner.py` 负责生成 relationship demo data，并把可用的 TypeScript fixture 写入 app mock 层。feature service 不直接读取 `repos/mockdata/exports/*.json`。

## 当前风险

数据 schema 和 generated fixture 正在快速变化。相关文档必须标记新鲜度，不能仅凭旧设计文档判断当前 DTO。

## 主要来源

- `repos/mockdata/orbit_mock_data_ai_relationship_design.md`
- `repos/orbits/docs/architecture/local-remote-database.md`
- `repos/orbits/shared/local-remote-store/RELATIONSHIP_SCHEMA_LIVE_IMPLEMENTATION.md`
- `docs/superpowers/specs/2026-06-30-hybrid-mockdata-handoff-design.md`

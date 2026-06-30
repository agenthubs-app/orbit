# Orbit 架构总览

Orbit 的实现目标是模块化、可替换、可验证。页面、API、feature service、mock/hybrid/live provider 和测试各自有清晰边界。

## 应用结构

- `repos/orbits/app/**`：Next.js App Router 页面和 API route。
- `repos/orbits/features/**`：业务模块契约、service interface、mock/hybrid/live 实现和模块文档。
- `repos/orbits/shared/**`：API envelope、domain contracts、module mode、mock registry、UI primitives 和本地数据库。
- `harness/**`：长跑 Planner、Generator、Evaluator、Verifier 和证据收集。

## 模块调用边界

产品页面不直接消费 feature DTO。推荐路径是：

```text
Product Route Component
  -> route view-model
  -> feature service-factory
  -> service interface / contract
  -> mock | hybrid | live implementation
```

这个边界降低 UI 改版、mock/live 替换和 provider 集成之间的耦合。

## 主要来源

- `repos/orbits/docs/architecture/modular-design.md`
- `repos/orbits/tests/services/modular-boundaries.test.ts`
- `repos/orbits/shared/services/module-mode.ts`
- `repos/orbits/shared/services/capability-registry.ts`

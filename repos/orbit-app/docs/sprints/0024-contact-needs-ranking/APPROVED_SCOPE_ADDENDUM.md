# Sprint 0024 — run-01 基线与并行文件锁补充

2026-09-15。用户已批准 `assets/concept-v2.png` 并明确要求创建 0024、开始实现。根协调者已将冻结设计／Planner 导入主线提交 `32f5d16af`；本补充只更新实际 run 基线与并行锁，不改变 revision 1 的 SC-0024-01～05、算法或视觉决定。

## 实际基线

- 主线产品基线：`c5c091fba`（含 0014 产品 `9761b343d`）；0024 文档导入后登记 HEAD `32f5d16af`。
- C linked worktree 保留其既有 0009／0010／0022／B 线副本和 pre-start 备份；不得 reset、整树覆盖或把旧版本文件带回主线。实施只按本 Sprint 精确补丁交接，由根协调者提交。
- Planner 中 `42edbdc15` 仅是准备阶段观察到的旧主线，不是 run-01 实际基线；以本补充和全局 README 为准。

## 并行文件锁

- 立即释放给 0024 单一 Generator：Web 新增 `shared/contract/contact-needs.ts`、`shared/api-schema/contact-needs.ts`、`features/contact-needs/**`、`app/api/contacts/needs-matches/**`、对应两个新测试和必要的窄合同转发／索引。修改任何既有 symbol 前先做 upstream impact；HIGH／CRITICAL 必须回报后再继续。
- 暂不释放给 0024：App `src/i18n/{messages,zh,ja,en}.ts`，由 0015 独占；根 `docs/sprints/README.md`、Bridge 和 Git 提交仍由 `/root` 独占。
- 0024 可在 Web GREEN 后继续只读调查 App；App 新文件、`src/api/endpoints.ts`、`ContactsScreen.tsx`、`ContactsDashboardScreen.tsx` 的具体锁在与 0015 无重叠时由根协调者追加释放。不得在字典未释放时用硬编码中文规避锁。

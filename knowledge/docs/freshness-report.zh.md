# Orbit 文档新鲜度报告

生成日期：2026-06-30

## 摘要

- 已纳入 catalog：191 个文档。
- 需要代码核对（needs-code-check）：0 个文档。
- 已知过期（known-stale）：8 个文档。
- 扫描范围内未纳入目录：0 个 Markdown。

## 需要代码核对

- 暂无。

## 已知过期

- `harness-state/audits/2026-06-24-harness-audit.md`：记录长跑 harness 的早期审计结果、风险和修正方向，是理解 harness 演进的历史证据。
- `docs/superpowers/specs/2026-06-24-component-level-sprint-design.md`：早期组件级 sprint 设计，已被 capability-first 设计替代。
- `.learnings/TROUBLESHOOTING.md`：记录 Orbit AI trace submit loading、provider timeout 和 responsive submit 控件等排障过程。
- `.learnings/ERRORS.md`：记录 harness 依赖、tsx eval、provider hang 和 git diff 命令等错误经验。
- `.learnings/LEARNINGS.md`：记录用户反馈、harness best practices 和项目维护经验。
- `.learnings/PERFORMANCE.md`：记录性能检查相关经验，作为后续优化和回归排查入口。
- `repos/orbits/.learnings/ERRORS.md`：记录 repos/orbits 内 fixture migration、comment patch、git diff 正则等错误经验。
- `repos/orbits/.learnings/LEARNINGS.md`：记录 framework/mock/live 解耦、提交范围检查和注释提交卫生等经验。

## 扫描范围内未纳入目录

- 扫描范围内的 Markdown 都已纳入。

## 规则

- `harness-state/runs/**` 和 `harness-state/tmp/**` 默认排除，只能作为历史证据引用。
- `.venv/**`、`.pytest_cache/**`、`.superpowers/**` 和参考项目 `repos/tokyo-business-connect/**` 不属于默认 Orbit 文档库范围。
- `needs-code-check` 不代表文档错误，只代表还没有足够证据证明它和当前代码完全一致。

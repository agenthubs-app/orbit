# Orbit Harness

根目录 `harness/` 是 Orbit 长跑开发系统，负责计划、生成、评价、验证和证据归档。生成应用目标是 `repos/orbits`，参考项目 `repos/tokyo-business-connect` 只读。

## 执行流

常用命令必须通过 `uv`：

```bash
uv sync
uv run python -m harness.harness doctor
uv run python -m harness.harness plan --brief "Build the next narrow Orbit sprint"
uv run python -m harness.harness run-sprint --sprint N --app-url http://localhost:3000
uv run python -m harness.harness hygiene
```

## 权威边界

- sprint 的具体成功标准在 `harness-state/contracts/contract-sprint-N.json`。
- `harness-state/spec.md` 是执行摘要，不是详细需求来源。
- `harness-state/runs/**` 是历史运行证据，不进入默认文档库。
- Generator 只能编辑 contract 声明的 owned/allowed paths。

## 主要来源

- `AGENT.md`
- `harness/README.md`
- `harness-state/spec.md`
- `harness-state/sprints.md`
- `harness-state/productization-notes/product-facing-sprints.md`

# Orbit 长跑 Harness README

本页是 Orbit Wiki 的中文阅读版。它保留原始文档的路径、代码块、命令和接口标识，用中文说明阅读目的、审计依据和结构入口。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `harness/README.md` |
| 中文镜像 | `knowledge/docs/zh/harness-readme.zh.md` |
| 分类 | `harness` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `harness` |

## 中文摘要

说明 harness 架构、命令、运行证据和长跑开发流程，是 harness 操作的主要英文来源。

## 审计依据

已核对 harness 主脚本、preflight、workspace、prompt 和 AGENT 规则仍存在；README 作为当前操作入口保留。

## 结构化阅读入口

- 第 1 节：源文档第 1 个标题
- 第 2 节：源文档第 2 个标题
- 第 3 节：Workspace 边界
- 第 4 节：源文档第 4 个标题
- 第 5 节：源文档第 5 个标题
- 第 6 节：源文档第 6 个标题
- 第 7 节：源文档第 7 个标题
- 第 8 节：源文档第 8 个标题

## 保留的代码与命令证据

### 代码证据 1

```text
harness-state/runs/run-id/sprint-N/iter-M/
  evidence.json
  eval.json
  verification.json
  handoff.json
  git/
  commands/
  browser/
  screenshots/
  axe/
  lighthouse/
  source/
  api/
  artifacts/
```

### 代码证据 2

```bash
uv sync
```

### 代码证据 3

```bash
uv run python -m harness.harness init
uv run python -m harness.harness plan --brief "Build the first Orbit MVP"
uv run python -m harness.harness doctor
uv run python -m harness.harness run --brief "Build the first Orbit MVP" --app-url http://localhost:3000
uv run python -m harness.harness hygiene
uv run python -m harness.harness run-sprint --sprint 1 --app-url http://localhost:3000
```

### 代码证据 4

```bash
npm run dev
```

### 代码证据 5

```yaml
workspace:
  git:
    enabled: true
    strategy: path-scoped
    remote_url: ""
    branch: main
    push: false
```

### 代码证据 6

```bash
uv run python -m playwright install chromium
```

## 源文档正文

该源文档主体不是中文。当前中文阅读版先保留中文摘要、审计依据、结构化入口和代码证据，不把英文原文混入默认阅读正文。

# Orbit 长跑 Harness README

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `harness/README.md` |
| 中文镜像 | `knowledge/docs/zh/harness-readme.zh.md` |
| 分类 | `harness` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `harness` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

说明 harness 架构、命令、运行证据和长跑开发流程，是 harness 操作的主要英文来源。

## 审计依据

已核对 harness 主脚本、preflight、workspace、prompt 和 AGENT 规则仍存在；README 作为当前操作入口保留。

## 结构化阅读入口

- 第 1 节：源标题：Orbit Long Run Harness
- 第 2 节：源标题：Roles
- 第 3 节：Workspace 边界
- 第 4 节：源标题：Commands
- 第 5 节：源标题：Configuration
- 第 6 节：Git 安全
- 第 7 节：源标题：Evidence
- 第 8 节：源标题：Operations

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

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。

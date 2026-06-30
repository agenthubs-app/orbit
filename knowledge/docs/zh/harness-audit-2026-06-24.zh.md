# Harness 审计 2026-06-24

本页是 Orbit Wiki 的中文阅读版。它保留原始文档的路径、代码块、命令和接口标识，用中文说明阅读目的、审计依据和结构入口。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `harness-state/audits/2026-06-24-harness-audit.md` |
| 中文镜像 | `knowledge/docs/zh/harness-audit-2026-06-24.zh.md` |
| 分类 | `harness` |
| 状态 | `historical` |
| 新鲜度 | `likely-current` |
| 负责人域 | `harness` |

## 中文摘要

记录长跑 harness 的早期审计结果、风险和修正方向，是理解 harness 演进的历史证据。

## 审计依据

已纳入历史审计；当前 harness 行为已用 harness/README、AGENT.md 和 harness 脚本作为后续权威入口。

## 结构化阅读入口

- 第 1 节：Orbit Harness 审计 2026 06 24
- 第 2 节：源文档第 2 个标题
- 第 3 节：源文档第 3 个标题
- 第 4 节：当前 验证 Result
- 第 5 节：源文档第 5 个标题
- 第 6 节：源文档第 6 个标题
- 第 7 节：源文档第 7 个标题
- 第 8 节：P0 问题
- 第 9 节：P0 1 run Sprint can bypass a real 规划器 output
- 第 10 节：源文档第 10 个标题
- 第 11 节：源文档第 11 个标题
- 第 12 节：源文档第 12 个标题
- 第 13 节：P1 问题
- 第 14 节：源文档第 14 个标题
- 第 15 节：P1 2 契约 review is configured but not implemented
- 第 16 节：P1 3 Protected path enforcement is 提示词 based
- 第 17 节：源文档第 17 个标题
- 第 18 节：源文档第 18 个标题
- 第 19 节：源文档第 19 个标题
- 第 20 节：P1 7 Agent and loop config 错误 were not validated before 运行时
- 第 21 节：源文档第 21 个标题
- 第 22 节：源文档第 22 个标题
- 第 23 节：P1 10 Reviewer artifact 边界 allowed supplemental files despite evidence only prompts
- 第 24 节：P2 问题
- 第 25 节：源文档第 25 个标题
- 第 26 节：P2 2 设计 path constant was stale
- 第 27 节：P2 3 Bootstrap 状态 looked like 规划器 output
- 第 28 节：提示词 设计 Assessment
- 第 29 节：Loop 设计 Assessment
- 第 30 节：源文档第 30 个标题
- 第 31 节：源文档第 31 个标题
- 第 32 节：实现 Status
- 第 33 节：源文档第 33 个标题
- 第 34 节：源文档第 34 个标题

## 保留的代码与命令证据

### 代码证据 1

```text
uv run pytest -q
213 passed

uv run python -m compileall -q harness
pass

uv run python -m harness.harness hygiene
pass

uv run python -m harness.harness doctor
warning: missing app origin remote; Planner manifest and configured agent runtimes pass

codex --strict-config -c 'model_reasoning_effort="xhigh"' -c 'model_provider="openai"' doctor --summary --ascii
17 ok | 1 idle | 1 notes | 0 warn | 0 fail
```

### 代码证据 2

```text
ANTHROPIC_BASE_URL=https://api.minimaxi.com/anthropic
ANTHROPIC_MODEL=MiniMax-M3
ANTHROPIC_AUTH_TOKEN=<present>
```

### 代码证据 3

```text
?? .gitignore
?? README.md
```

### 代码证据 4

```yaml
workspace:
  git:
    enabled: false
    strategy: disabled
```

### 代码证据 5

```text
git diff --name-only
```

### 代码证据 6

```yaml
keep_last_runs: 10
keep_last_evidence_per_sprint: 3
```

### 代码证据 7

```text
Planner once -> for each sprint:
  Generator -> self_assess -> collect_evidence -> Evaluator -> Verifier -> repeat
```

### 代码证据 8

```text
Planner -> contract review -> plan manifest
Preflight git/path/runner/browser checks against Planner manifest
For each sprint:
  pre-status evidence
  Generator
  protected workspace snapshot check
  handoff with full git status
  deterministic evidence collection
  Evaluator
  Verifier
  score history
  refine/pivot decision
  optional path-scoped commit/push
  post-status evidence
Retention cleanup
```

### 代码证据 9

```text
Runnable skeleton: yes
Safe unattended long-run harness: yes for local app-repo git management; remote push intentionally disabled
GitHub sync ready for repos/orbits: local commits yes, remote push opt-in after remote is configured
Prompt architecture direction: good
Evidence reliability: browser/API/source/command evidence implemented; accessibility/performance smoke evidence implemented; full axe/Lighthouse audits still future
Path isolation by design: good
Path isolation by enforcement: implemented for workspace roots, app-root boundary, root build artifact leakage, ignored app artifacts, harness-state, and protected reference repo
```

## 源文档正文

该源文档主体不是中文。当前中文阅读版先保留中文摘要、审计依据、结构化入口和代码证据，不把英文原文混入默认阅读正文。

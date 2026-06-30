# Harness 审计 2026-06-24

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `harness-state/audits/2026-06-24-harness-audit.md` |
| 中文镜像 | `knowledge/docs/zh/harness-audit-2026-06-24.zh.md` |
| 分类 | `harness` |
| 状态 | `historical` |
| 新鲜度 | `likely-current` |
| 负责人域 | `harness` |

## 怎么读

这页主要提供历史背景。不要把它当成当前实现说明，当前行为应回到相关代码路径、主题知识页和更新后的设计文档确认。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

记录长跑 harness 的早期审计结果、风险和修正方向，是理解 harness 演进的历史证据。

## 审计依据

已纳入历史审计；当前 harness 行为已用 harness/README、AGENT.md 和 harness 脚本作为后续权威入口。

## 结构化阅读入口

- 第 1 节：Orbit Harness 审计 2026 06 24
- 第 2 节：源标题：Scope
- 第 3 节：源标题：Evidence Reviewed
- 第 4 节：当前 验证 Result
- 第 5 节：源标题：Remediation Status
- 第 6 节：源标题：Confirmed Assumptions
- 第 7 节：源标题：A1 Claude roles intentionally use the MiniMax compatible Provider
- 第 8 节：P0 问题
- 第 9 节：P0 1 run Sprint 会 bypass a real 规划器 output
- 第 10 节：P0 2 App git sync was not 已实现
- 第 11 节：源标题：P0 3 Git evidence ignores untracked files
- 第 12 节：源标题：P0 4 Evidence collection was too weak for the prompts
- 第 13 节：P1 问题
- 第 14 节：P1 1 Strategic 循环 is currently a retry 循环
- 第 15 节：P1 2 契约 review is configured but not 已实现
- 第 16 节：P1 3 Protected 路径 enforcement is 提示词 based
- 第 17 节：P1 4 Retention policy is declared but not 已实现
- 第 18 节：源标题：P1 5 Codex config fields are partly decorative
- 第 19 节：源标题：P1 6 Configured Agent runtimes are not checked before long runs
- 第 20 节：P1 7 Agent 和 循环 config 错误 were not validated before 运行时
- 第 21 节：源标题：P1 8 JSON output parsing was brittle when agents emitted diagnostics
- 第 22 节：P1 9 Config typo 处理 was too permissive
- 第 23 节：P1 10 Reviewer Artifact 边界 allowed supplemental files despite evidence only prompts
- 第 24 节：P2 问题
- 第 25 节：源标题：P2 1 Log root configurability was incomplete
- 第 26 节：P2 2 设计 路径 constant was stale
- 第 27 节：P2 3 Bootstrap 状态 looked 像 规划器 output
- 第 28 节：提示词 设计 Assessment
- 第 29 节：循环 设计 Assessment
- 第 30 节：路径 和 Artifact Assessment
- 第 31 节：源标题：GitHub Sync Assessment
- 第 32 节：实现 Status
- 第 33 节：源标题：Items Requiring User Confirmation
- 第 34 节：源标题：Final Readiness Rating

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

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。

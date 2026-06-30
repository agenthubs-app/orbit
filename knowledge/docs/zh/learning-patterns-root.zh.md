# 根通用经验

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `.learnings/LEARNINGS.md` |
| 中文镜像 | `knowledge/docs/zh/learning-patterns-root.zh.md` |
| 分类 | `learning` |
| 状态 | `current` |
| 新鲜度 | `likely-current` |
| 负责人域 | `learning` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

记录用户反馈、harness best practices 和项目维护经验。

## 审计依据

已登记来源文档，后续变更通过 catalog 新鲜度状态追踪。

## 结构化阅读入口

- 第 1 节：源标题：LRN 20260630 004 correction
- 第 2 节：摘要
- 第 3 节：源标题：Details
- 第 4 节：源标题：Suggested Action
- 第 5 节：源标题：Metadata
- 第 6 节：源标题：LRN 20260630 002 correction
- 第 7 节：摘要
- 第 8 节：源标题：Details
- 第 9 节：源标题：Suggested Action
- 第 10 节：源标题：Metadata
- 第 11 节：源标题：LRN 20260624 001 correction
- 第 12 节：摘要
- 第 13 节：源标题：Details
- 第 14 节：源标题：Suggested Action
- 第 15 节：源标题：Metadata
- 第 16 节：源标题：Resolution
- 第 17 节：源标题：LRN 20260626 005 bestpractice
- 第 18 节：摘要
- 第 19 节：源标题：Details
- 第 20 节：源标题：Suggested Action
- 第 21 节：源标题：Metadata
- 第 22 节：源标题：Resolution
- 第 23 节：源标题：LRN 20260626 004 bestpractice
- 第 24 节：摘要
- 第 25 节：源标题：Details
- 第 26 节：源标题：Suggested Action
- 第 27 节：源标题：Metadata
- 第 28 节：源标题：Resolution
- 第 29 节：源标题：LRN 20260626 003 bestpractice
- 第 30 节：摘要
- 第 31 节：源标题：Details
- 第 32 节：源标题：Suggested Action
- 第 33 节：源标题：Metadata
- 第 34 节：源标题：Resolution
- 第 35 节：源标题：LRN 20260626 002 bestpractice
- 第 36 节：摘要
- 第 37 节：源标题：Details
- 第 38 节：源标题：Suggested Action
- 第 39 节：源标题：Metadata
- 第 40 节：源标题：Resolution
- 第 41 节：源标题：LRN 20260626 001 bestpractice
- 第 42 节：摘要
- 第 43 节：源标题：Details
- 第 44 节：源标题：Suggested Action
- 第 45 节：源标题：Metadata
- 第 46 节：源标题：LRN 20260625 001 correction
- 第 47 节：摘要
- 第 48 节：源标题：Details
- 第 49 节：源标题：Suggested Action
- 第 50 节：源标题：Metadata
- 第 51 节：源标题：LRN 20260625 002 correction
- 第 52 节：摘要
- 第 53 节：源标题：Details
- 第 54 节：源标题：Suggested Action
- 第 55 节：源标题：Metadata
- 第 56 节：源标题：Resolution
- 第 57 节：源标题：LRN 20260625 003 correction
- 第 58 节：摘要
- 第 59 节：源标题：Details
- 第 60 节：源标题：Suggested Action
- 第 61 节：源标题：Metadata
- 第 62 节：源标题：Resolution
- 第 63 节：源标题：LRN 20260625 004 bestpractice
- 第 64 节：摘要
- 第 65 节：源标题：Details
- 第 66 节：源标题：Suggested Action
- 第 67 节：源标题：Metadata
- 第 68 节：源标题：Resolution
- 第 69 节：源标题：LRN 20260624 004 correction
- 第 70 节：摘要
- 第 71 节：源标题：Details
- 第 72 节：源标题：Suggested Action
- 第 73 节：源标题：Metadata
- 第 74 节：源标题：LRN 20260624 003 correction
- 第 75 节：摘要
- 第 76 节：源标题：Details
- 第 77 节：源标题：Suggested Action
- 第 78 节：源标题：Metadata
- 第 79 节：源标题：Resolution
- 第 80 节：源标题：LRN 20260624 002 correction

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

## [LRN-20260630-004] correction

**Logged**: 2026-06-30T12:52:43Z
**Priority**: high
**Status**: pending
**Area**: docs

### Summary
Orbit AI 核心行为变更完成前必须同步文档和知识库。

### Details
用户指出“补充文档、更新文档库”应当自动完成。正确流程是：当 Orbit AI runtime、工具选择、环境变量、trace 行为或产品核心设定发生变化时，不能只改代码和测试；必须同步更新模块设计文档、相关 spec、开发历史、knowledge catalog 元数据、中文镜像和 app-local manifest。

### Suggested Action
Orbit AI 相关实现完成前，把文档更新作为验收项：更新 `repos/orbits/features/orbit-ai/DESIGN.md`、相关 `repos/orbits/docs/**` spec、`knowledge/history/development-log.zh.md`，再按知识库规则运行 catalog、中文镜像和 manifest 生成脚本，并执行 root/app knowledge tests。

### Metadata
- Source: user_feedback
- Related Files: repos/orbits/features/orbit-ai/DESIGN.md, repos/orbits/docs/superpowers/specs/2026-06-29-orbit-ai-trace-debug-design.zh.md, scripts/knowledge/build-catalog.mjs, knowledge/history/development-log.zh.md
- Tags: docs, knowledge-base, orbit-ai, workflow
- Pattern-Key: docs.orbit_ai_update_knowledge_library
- Recurrence-Count: 1
- First-Seen: 2026-06-30
- Last-Seen: 2026-06-30

---

## [LRN-20260630-002] correction

**Logged**: 2026-06-30T09:27:25+09:00
**Priority**: high
**Status**: resolved
**Area**: frontend

### Summary
Orbit Agent submit-click bugs need runtime DOM verification across responsive copies, not only backend/provider checks.

### Details
The first fix addressed a real provider-timeout risk, but the user correctly reported the submit still felt unclickable. Runtime Chromium checks showed the visible button could submit, but `/app/agent` renders desktop and mobile ChatBox copies with the same send aria-label. Native `disabled={!value.trim()}` on blank prompt buttons meant hidden copies and blank visible buttons could be reported as "cannot click" by tests/tooling or felt unclickable to users.

### Suggested Action
For Orbit Agent prompt submit controls, keep buttons hittable and guard blank prompts in the submit handler. Use `aria-disabled` and stable data markers instead of native `disabled` for blank-input state. Verify desktop and mobile runtime DOM, including hidden responsive copies.

### Metadata
- Source: user_feedback
- Related Files: repos/orbits/app/(app)/app/agent/orbit-real-agent.tsx, repos/orbits/app/(app)/app/orbit-agent-hero.tsx, repos/orbits/tests/pages/orbit-agent-api-ui.test.ts, .learnings/TROUBLESHOOTING.md
- Tags: orbit-ai, frontend, responsive-dom, submit

---

## [LRN-20260624-001] correction

**Logged**: 2026-06-24T00:00:00+09:00
**Priority**: high
**Status**: resolved
**Area**: config

### Summary
Orbit harness target app repo must be `repos/orbits`, not the reference repo `repos/tokyo-business-connect`.

### Details
The previous harness configuration treated `repos/tokyo-business-connect` as the implementation
target. The user clarified that this repo is only a reference and that generated app code should
be developed in a new Git-maintained repo under `repos/orbits`.

### Suggested Action
Keep `repos/tokyo-business-connect` protected/read-only in harness config and prompts. Point
Generator cwd and write allowlists at `repos/orbits`.

### Metadata
- Source: user_feedback
- Related Files: harness/config.yaml, harness/config.py, harness/prompts/generator.md
- Tags: harness, workspace-boundary, repo-target

### Resolution
- **Resolved**: 2026-06-24T00:00:00+09:00
- **Notes**: Harness retargeted to `repos/orbits`; init creates `repos/orbits` as a separate Git repo.

---

## [LRN-20260626-005] best_practice

**Logged**: 2026-06-26T06:26:33+09:00
**Priority**: medium
**Status**: resolved
**Area**: harness

### Summary
Self-assess should not require Codex isolated worktree paths to match app repo paths.

### Details
Sprint 61 self-assess flagged `/private/tmp/orbit-codex-app-.../app/...` paths as a mismatch against `repos/orbits/...`. That path difference is expected because Codex Generator runs in an isolated temporary worktree and then syncs changed files back to the app repo. Treating this as blocking caused an unnecessary repair pass.

### Suggested Action
Treat isolated Codex worktree path mismatch concerns as non-blocking self-assess noise. Real file presence and boundary correctness must still be enforced by `files_changed`, git evidence, contract file-boundary checks, and Evaluator evidence collection.

### Metadata
- Source: error
- Related Files: harness/agents/generator.py, tests/test_harness_core.py
- Tags: harness, self-assess, codex, isolated-worktree, efficiency

### Resolution
- **Resolved**: 2026-06-26T06:26:33+09:00
- **Notes**: Added regression coverage and non-blocking classifier phrases for `/private/tmp/orbit-codex-app`, worktree mirror, and temporary worktree path mismatch concerns.

---

## [LRN-20260626-004] best_practice

**Logged**: 2026-06-26T05:46:39+09:00
**Priority**: high
**Status**: resolved
**Area**: harness

### Summary
Product route state criteria need explicit query-route evidence, and contract review must allow safe query strings.

### Details
Sprint 60 repeatedly failed SC-2 because the page linked `?scenario=empty|pending|failure`, but `evidence.routes` only collected the default `/app/contacts` snapshot. Adding query routes initially made the Planner manifest stale because contract review treated `?` as a glob/template marker. The root cause was route validation checking the full URL string instead of only the decoded path.

### Suggested Action
For contracts that require success/loading/empty/failure route states, include the default route plus `?scenario=empty`, `?scenario=pending`, and `?scenario=failure` in `evidence.routes`. Validate route templates against the decoded path only; safe query strings are concrete evidence targets and should become separate navigation/browser evidence keys.

### Metadata
- Source: error
- Related Files: harness/evidence.py, harness/contract_review.py, tests/test_harness_core.py, harness-state/contracts/contract-sprint-60.json
- Tags: harness, contracts, evidence, query-routes, stateview

### Resolution
- **Resolved**: 2026-06-26T05:46:39+09:00
- **Notes**: Updated Sprint 60-67 contracts to declare scenario routes; added regression tests for query route collection and contract review; adjusted route-template checks to ignore safe query strings.

---

## [LRN-20260626-003] best_practice

**Logged**: 2026-06-26T05:12:23+09:00
**Priority**: high
**Status**: resolved
**Area**: harness

### Summary
Before evidence collection, the harness must clear stale Next dev servers from the same app repo when the target app URL is not ready.

### Details
Sprint 59 iterations 1 and 2 failed with `ERR_CONNECTION_REFUSED` even though the product files were plausible. The root cause was a stale Next dev server in `repos/orbits` listening on port 3010. Next refused to start the harness-managed server on port 3000 because another dev server for the same directory already held the development lock, so evaluator/verifier feedback was misdirected to the Generator as if the product route were broken.

### Suggested Action
If the configured app URL is not ready, detect listening processes whose cwd is the app repo and whose port differs from the target port, terminate them before starting the managed dev server, and record `stale-dev-servers.json` under the current iteration artifacts. Do not scatter this diagnostic outside `harness-state`.

### Metadata
- Source: error
- Related Files: harness/harness.py, tests/test_harness_core.py, harness-state/runs/20260625-193429-141737/sprint-59/iter-2/artifacts/dev-server.log
- Tags: harness, dev-server, nextjs, evidence, sprint-loop

### Resolution
- **Resolved**: 2026-06-26T05:12:23+09:00
- **Notes**: Added `stop_stale_app_dev_servers()` and regression coverage; `start_app_dev_server()` now clears same-app stale listeners before launching the managed target-port server.

---

## [LRN-20260626-002] best_practice

**Logged**: 2026-06-26T04:33:25+09:00
**Priority**: high
**Status**: resolved
**Area**: harness

### Summary
Evaluator contradiction fixes must stay evidence-gated, especially for mock/no-side-effect criteria.

### Details
Sprint 58 iteration 4 produced an internally contradictory evaluation: `rubric_average` was 4.0 and feedback said all five success criteria passed with no failures, but SC-3 was marked `fail`. The evidence described a mock-only profile action where "does not save" and "does not connect external providers" were intended positive boundaries, but the evaluator post-processor treated generic `does not` wording as explicit failure.

### Suggested Action
When normalizing evaluator output, correct a fail-to-pass contradiction only when feedback explicitly claims all criteria pass, the cited evidence matches collected evidence, and the criterion/evidence/feedback indicate an expected mock no-side-effect boundary. Do not remove the evidence gate or trust LLM verdict text alone.

### Metadata
- Source: error
- Related Files: harness/agents/evaluator.py, tests/test_harness_core.py, harness-state/runs/20260625-181922-571421/sprint-58/iter-4/eval.json
- Tags: harness, evaluator, evidence, mock-boundary, sprint-loop

### Resolution
- **Resolved**: 2026-06-26T04:33:25+09:00
- **Notes**: Added regression coverage for mock action evidence that includes expected `does not save/call/connect external providers` text; evaluator now strips those expected no-side-effect clauses only in mock boundary contexts before applying explicit-failure detection.

---

## [LRN-20260626-001] best_practice

**Logged**: 2026-06-26T03:18:00+09:00
**Priority**: medium
**Status**: pending
**Area**: harness

### Summary
Sprint contracts for Next App Router pages must use the actual route file path, not a URL-derived guess.

### Details
Sprint 57 targeted `/app` but the contract allowed `app/(app)/page.tsx`. In the Orbit repo, the actual `/app` page is `app/(app)/app/page.tsx`; `app/(app)/page.tsx` would map to `/` and does not exist. The Generator correctly edited the real route file, and the harness correctly blocked it as outside contract. The fix was to update only Sprint 57's precise `source_files` and `allowed_shared_paths` entries to `app/(app)/app/page.tsx`, then checkpoint the already-generated sprint files as `wip: sprint 57 iteration 1` so preflight could rerun cleanly.

### Suggested Action
Before writing or accepting route-page sprint contracts, resolve the target URL against `rg --files app` or `find app -name page.tsx`. For failed runs that leave valid sprint-scoped changes after a contract typo, do not bypass preflight; either correct the contract and path-scope checkpoint the sprint changes, or revert only the failed run's generated files if they are invalid.

### Metadata
- Source: error
- Related Files: harness-state/contracts/contract-sprint-57.json, repos/orbits/app/(app)/app/page.tsx, repos/orbits/app/(app)/compose-app-from-previously-approved-mock-first-capabilities/app-workbench.tsx
- Tags: harness, contracts, nextjs, app-router, preflight, git-checkpoint

---

## [LRN-20260625-001] correction

**Logged**: 2026-06-25T07:30:46+09:00
**Priority**: high
**Status**: pending
**Area**: docs

### Summary
Orbit `/dev/capabilities/**` pages are internal harness validation surfaces, not the product website.

### Details
The user accepted building internal debug panels first, but corrected that these pages must not be
presented as the usable Orbit product. The migration is only credible if business logic lives in
typed contracts, services, API routes, and mock-to-live docs, while dev pages merely exercise those
boundaries for deterministic harness evidence.

### Suggested Action
Keep future sprint contracts and agent prompts explicit: dev routes prove capability boundaries;
`/app/**` routes prove product usability. Add product composition sprints that consume the same
capability services instead of rewriting debug page logic.

### Metadata
- Source: user_feedback
- Related Files: repos/orbits/AGENTS.md, harness-state/spec.md, harness-state/sprints.md, harness/prompts/generator.md, harness/prompts/evaluator.md, harness/prompts/verifier.md, harness/prompts/planner.md
- Tags: harness, dev-surfaces, product-migration, orbit

---

## [LRN-20260625-002] correction

**Logged**: 2026-06-25T10:37:03+09:00
**Priority**: high
**Status**: resolved
**Area**: backend

### Summary
Orbit harness must not let reviewer/self-assess mechanics block valid sprint progress.

### Details
Sprint 20 exposed two harness-level blockers: evaluator post-processing saved a fail status even
when feedback said all success criteria were satisfied, and Claude self-assessment spent minutes
on an unintended full-filesystem search despite being intended as read-only app-root review.

### Suggested Action
Treat reviewer contradictions and reviewer tool overreach as harness reliability bugs, not app
implementation failures. Keep evidence and file-boundary gates strict, but add deterministic
post-processing and hard tool/timeout boundaries so valid sprints are not delayed by reviewer
mechanics.

### Metadata
- Source: user_feedback
- Related Files: harness/agents/evaluator.py, harness/agents/generator.py, harness/claude_runner.py, harness/config.py, harness/preflight.py, tests/test_harness_core.py
- Tags: harness, evaluator, self-assess, performance, sprint-flow

### Resolution
- **Resolved**: 2026-06-25T10:37:03+09:00
- **Notes**: Added regression tests and fixes for evaluator satisfied/pass wording, explicit self-assess Bash disallow, configurable self-assess timeout, and Next dev HMR console-noise classification.

---

## [LRN-20260625-003] correction

**Logged**: 2026-06-25T11:45:00+09:00
**Priority**: high
**Status**: resolved
**Area**: harness

### Summary
Sprint progress blockers can come from incomplete harness handoff state and evaluator status/evidence contradictions, not product code gaps.

### Details
Sprint 22 exposed two avoidable slowdowns: self-assess saw only the latest worktree diff and missed files already committed by earlier WIP iterations, and evaluator logic could downgrade expected-false mock boundary evidence to fail even when feedback and collected evidence showed all criteria passed.

### Suggested Action
When a sprint loops despite passing evidence, inspect `handoff.files_changed`, `eval.json`, and `strategy-iter-N.json` before assuming Generator must implement more. Handoff should be cumulative across current-sprint WIP/complete commits plus uncommitted diff, and evaluator post-processing should distinguish expected-false safety flags from missing/failed evidence.

### Metadata
- Source: sprint_22_blocker
- Related Files: harness/agents/generator.py, harness/agents/evaluator.py, tests/test_harness_core.py
- Tags: harness, sprint-loop, evaluator, handoff, expected-false

### Resolution
- **Resolved**: 2026-06-25T11:45:00+09:00
- **Notes**: Added regression tests and fixes for cumulative sprint handoff files and expected-false mock boundary evidence.

---

## [LRN-20260625-004] best_practice

**Logged**: 2026-06-25T15:23:47+09:00
**Priority**: high
**Status**: resolved
**Area**: harness

### Summary
Self-assess is a pre-check, not the core sprint gate, so it must not repeatedly block formal evaluator/verifier progress.

### Details
Recent Orbit sprints showed avoidable delays when self-assess returned empty concerns, timed out, or continued asking for non-critical repair work before formal evidence collection. The harness principle to preserve is Generator -> Evaluator -> Verifier; self-assess can catch obvious source-level gaps, but repeated self-assess repair passes should not replace deterministic evidence and formal review.

Sprint 31 added two concrete variants: self-assess treated incomplete Generator summary file coverage as a pre-evaluation blocker even though `handoff.files_changed` already listed the files, and evaluator marked an expected-false mock boundary as fail even while evidence and feedback said provider/database/calendar/email/notification flags were explicitly false.

Sprint 35 added a reviewer-runtime variant: Codex Verifier timed out after 900 seconds with empty stdout after evaluator had already passed. That runtime failure caused a new Generator product iteration, even though the right first response was retrying the same reviewer against the same evidence.

Sprint 41 added an observability variant: Claude Evaluator returned an unparseable first response, the retry succeeded, but the failed raw attempt was only visible as a log tail. Reviewer runtime retries need a managed per-iteration artifact so harness blockers can be diagnosed without re-running or guessing from truncated logs.

Sprint 42 added a repeated-timeout variant: self-assess timed out in both quality iterations. The timeout was already nonblocking, but repeating it in the same sprint wasted several minutes before the same evaluator/verifier gates. Once self-assess has a runtime failure inside a sprint, later iterations in that sprint should skip self-assess and rely on formal evidence gates.

Sprint 48 added another reviewer-limitation variant: self-assess raised a repair concern because it lacked shell access to verify that changed files and command results existed, even though `handoff.files_changed` listed the implementation files and evaluator/verifier would collect formal evidence next. This must be treated like timing/evidence-verification commentary, not a product defect.

### Suggested Action
Keep evaluator/verifier strict, but bound self-assess repair to a small per-sprint budget. After that budget is used, record concerns in the handoff and continue to evidence collection plus evaluator/verifier instead of looping on pre-checks.

For evaluator/verifier runtime exceptions such as CLI timeout or malformed reviewer JSON, retry the reviewer call against the same evidence before changing product code. Record retry failures in the current iteration's managed artifact directory. If retries are exhausted, then record the reviewer failure visibly and let the normal loop handle it. For self-assess runtime failures, keep the current iteration nonblocking and skip repeated self-assess calls later in the same sprint.

### Metadata
- Source: user_feedback
- Related Files: harness/harness.py, harness/config.py, tests/test_harness_core.py
- Tags: harness, self-assess, sprint-flow, performance

### Resolution
- **Resolved**: 2026-06-25T15:23:47+09:00
- **Notes**: Added `loop.self_assess_max_repair_passes` and `loop.reviewer_runtime_retries` with default 1; ignored summary-coverage-only and shell-access-verification self-assess concerns; recognized `Sprint contract satisfied` expected-false evidence in evaluator post-processing; recorded reviewer runtime retry failures in `artifacts/reviewer-runtime-failures.json`; marked self-assess runtime failures and skipped repeated self-assess calls within the same sprint; added regression coverage for all cases.

---

## [LRN-20260624-004] correction

**Logged**: 2026-06-24T07:54:00Z
**Priority**: high
**Status**: pending
**Area**: config

### Summary
Orbit harness tests must adapt to user-edited config values, not rewrite `harness/config.yaml` to fit tests.

### Details
The user clarified that the current threshold values in `harness/config.yaml` were changed manually and intentionally. I must not normalize or restore those values during harness fixes; tests should isolate config-dependent expectations with temp config or monkeypatching.

### Suggested Action
Preserve user-owned configuration changes. When tests require specific pass thresholds or model settings, create test-local config fixtures instead of editing the project config.

### Metadata
- Source: user_feedback
- Related Files: harness/config.yaml, tests/test_harness_core.py
- Tags: harness, config, tests, user-owned-changes

---

## [LRN-20260624-003] correction

**Logged**: 2026-06-24T10:20:00+09:00
**Priority**: high
**Status**: resolved
**Area**: docs

### Summary
Orbit `harness-state/spec.md` must stay concise; detailed sprint implementation belongs in contract files.

### Details
I previously wrote full sprint details and contract seed JSON into `harness-state/spec.md`. The user clarified that `spec.md` should be an overview only, and concrete sprint implementation should refer to `harness-state/contracts/contract-sprint-N.json`.

### Suggested Action
Keep `spec.md` to product execution summary, implementation principles, technical boundaries, and concise sprint strategy. Store authoritative success criteria, evidence, source files, and detailed execution requirements in contract JSON files.

### Metadata
- Source: user_feedback
- Related Files: harness-state/spec.md, harness-state/contracts/contract-sprint-N.json, harness/prompts/planner.md, harness/harness.py, AGENT.md
- Tags: harness, spec, contracts, planner

### Resolution
- **Resolved**: 2026-06-24T10:20:00+09:00
- **Notes**: Harness persistence now writes a concise spec overview and keeps detailed sprint requirements in contract JSON.

---

## [LRN-20260624-002] correction

**Logged**: 2026-06-24T00:55:00+09:00
**Priority**: high
**Status**: resolved
**Area**: config

### Summary
Orbit harness Claude roles are intentionally routed through the user's MiniMax-compatible Claude Code provider.

### Details
I incorrectly treated `~/.claude/settings.json` MiniMax `ANTHROPIC_*` provider overrides as a harness problem. The user clarified that MiniMax is the intended execution provider for Claude-backed roles in this project.

### Suggested Action
Do not flag MiniMax provider overrides as an error for this harness. Future preflight checks should report provider routing as informational unless the configured backend/provider policy says otherwise.

### Metadata
- Source: user_feedback
- Related Files: harness/config.yaml, /Users/xzhao/.claude/settings.json
- Tags: harness, provider-routing, minimax, claude-code

### Resolution
- **Resolved**: 2026-06-24T00:55:00+09:00
- **Notes**: Treat MiniMax-compatible Claude provider routing as intended for this harness; keep related checks informational unless config policy changes.

---

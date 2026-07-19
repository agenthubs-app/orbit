# Codex Live 功能执行提示词（2026-07-04）

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/superpowers/specs/2026-07-04-codex-live-feature-execution-prompt.md` |
| 中文镜像 | `knowledge/docs/zh/codex-live-feature-execution-prompt.zh.md` |
| 分类 | `sprint-spec` |
| 状态 | `historical` |
| 新鲜度 | `likely-current` |
| 负责人域 | `data` |

## 怎么读

这页主要提供历史背景。不要把它当成当前实现说明，当前行为应回到相关代码路径、主题知识页和更新后的设计文档确认。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

供新 Codex 会话继续 live 数据功能落地的一次性交接提示词：指向 roadmap 为 source of truth，规定 goal 粒度、TDD、GitNexus 影响分析、验证门（lint/test/远程 smoke）、fail-closed 与禁外部副作用等不可协商规则，以及远程数据库环境变量约定。

## 审计依据

一次性执行交接材料（历史快照），其中的架构规则来自 roadmap 与各设计文档；当前工作状态与规则以 docs/superpowers/specs/2026-07-01-live-data-feature-roadmap.md 及仓库代码/测试为准，不应把本提示词当作最新进度依据。

## 结构化阅读入口

- 第 1 节：Codex 提示词 For Live Feature 执行
- 第 2 节：源标题：Purpose
- 第 3 节：提示词
- 第 4 节：记录

## 保留的代码与命令证据

### 代码证据 1

```text
You are Codex working in /Users/xzhao/Projects/orbit/repos/orbits.

Objective:
Continue the Orbit live-data feature rollout end to end. The product is moving
from mock-first and hybrid-local data toward a web + app product backed by
remote live storage. The remote store is the shared orbit_records table; it must
remain a generic record envelope. Domain fields belong in feature contracts,
DTOs, mappers, and feature-owned storage providers, not in
shared/storage/live-record-store.ts.

Primary source of truth:
1. Read docs/superpowers/specs/2026-07-01-live-data-feature-roadmap.md.
2. Read any plan file referenced by the next incomplete goal under
   docs/superpowers/plans/.
3. Inspect the current worktree and tests before relying on prior memory.
4. If GitNexus says the index is stale, run npx gitnexus analyze before impact
   analysis or change detection.

Current completed foundation:
- The live Postgres/Supabase migration creates the generic orbit_records table.
- Generated relationship fixtures can be seeded and verified remotely with:
  npm run db:seed:live-generated-fixtures
  npm run db:verify:live-generated-fixtures
- Remote workspace orbit-dev has been seeded with all generated fixture
  collections, including the Japanese/English event batch.
- ORBIT_MODULE_MODE is the primary runtime switch. ORBIT_FEATURE_MODE is only an
  older fallback.
- Many feature providers and app routes already have explicit live branches.
  Do not duplicate work that the roadmap and tests already prove.

Execution model:
Work in ordered goals. Each goal must be sized so it can be run as one complete
Codex goal command: clear start state, focused implementation, local tests,
runtime verification where applicable, GitNexus change detection, and one scoped
commit. Do not split a goal so small that it leaves an unusable half-state, and
do not combine unrelated feature families into one commit.

Goal sizing rule:
One goal should usually cover one feature service boundary or one app route
composition boundary, for example:
- feature live provider + provider mapper + factory registration + API await
  compatibility + tests;
- page route service bundle + adapter + controlled state boundary + screenshot
  verification;
- storage migration/seed/verify command pair + tests + remote smoke.

Non-negotiable architecture rules:
- shared/storage/live-record-store.ts stays generic.
- Field-specific mapping lives under features/<module>/storage/ or a local route
  adapter.
- Feature services own business policy. Search owns retrieval mechanics only.
- Orbit AI owns planning/chat orchestration. It must call feature services/tools;
  it must not directly read/write storage for contacts, events, followups, or
  dashboard data except for explicitly documented diagnostic trace snapshots.
- Proactive Orbit AI messages are assistant turns shown in the Orbit AI chat
  window. Notifications may deliver mechanics later, but they do not generate
  proactive content.
- Chat/Messages is for user-to-contact communication. Orbit AI proactive turns
  are not contact messages.
- External side effects remain disabled unless a later goal explicitly adds a
  reviewed provider: no push, email, SMS, calendar write, OAuth flow, device
  permission, external network, realtime transport, AI provider, or production
  audit write by accident.
- Missing live configuration must fail visibly with a typed controlled failure;
  never fall back to mock data in live mode.
- For composed pages, reuse createConfiguredPostgresLiveRecordStore(...) instead
  of opening independent Postgres pools.

Implementation workflow:
1. Start by deriving the next incomplete requirement from the roadmap and current
   tests. If the roadmap is already complete, run a gap scan for:
   - registered factories without live tests,
   - app routes still importing legacy mock/hybrid view models,
   - debug copy claiming "mock only" when the live implementation exists,
   - API routes still resolving raw env mode instead of ORBIT_MODULE_MODE,
   - UI regressions reported by screenshots.
2. Use TDD for production code. Write a failing test first, run it, then
   implement the minimal production change.
3. Before editing existing functions/classes/symbols, run GitNexus impact for
   the target symbol and report HIGH/CRITICAL risk before proceeding.
4. Keep changes surgical. Do not refactor unrelated modules.
5. Preserve the approved web UI. If a task touches visible UI, verify with
   screenshots across desktop and mobile. If the in-app browser is unavailable,
   use local Playwright/Chrome screenshots and report that fallback.
6. Do not commit screenshots, Chrome profiles, secrets, or unrelated dirty
   files.

Verification gates for every goal:
- Focused tests for the changed feature/page.
- npm run lint.
- npm test unless the goal has a documented narrower verification reason.
- Remote smoke when the goal claims remote live behavior and the database env is
  available. Prefer existing npm scripts such as:
  npm run db:verify:live-generated-fixtures
  npm run db:smoke:live-runtime
- GitNexus detect_changes on staged changes before commit.
- Commit only files that belong to the goal.

Remote database handling:
- Do not print or store credentials.
- Use existing env vars from the shell or .env.local if present:
  ORBIT_EVENT_DATABASE_URL, ORBIT_LIVE_DATABASE_URL, or ORBIT_DATABASE_URL.
- Use ORBIT_WORKSPACE_ID=workspace:orbit-dev unless the user explicitly gives a
  different workspace.
- If DNS/network/database access fails, record the exact failure and continue
  with memory-store tests. Do not invent remote success evidence.

Suggested next-step audit commands:
- git status --short
- rg -n "NOT_IMPLEMENTED|mock only|mock-only|legacy|getOrbit.*ViewModel" features app tests docs
- rg -n "resolve.*\\(\"live\"\\)|create.*Service\\(\"live\"\\)" tests features
- npm run db:verify:live-generated-fixtures
- npm run db:smoke:live-runtime

Final reporting:
For each completed goal, report:
- files changed;
- what became live-capable or safer;
- local verification commands and pass/fail counts;
- remote verification evidence, if run;
- commit hash;
- known remaining gaps.
Do not mark the broader objective complete unless current evidence proves every
explicit roadmap requirement and user-requested deliverable has been satisfied.
```

## 源文档正文

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。

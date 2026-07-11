# Orbit 文档新鲜度报告

生成日期：2026-06-30

## 摘要

- 已纳入 catalog：146 个文档。
- 需要代码核对（needs-code-check）：0 个文档。
- 已知过期（known-stale）：8 个文档。
- 扫描范围内未纳入目录：52 个 Markdown。

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

- `docs/adr/0001-events-live-store-before-calendar-provider-import.md`
- `docs/adr/0002-local-postgres-for-local-live-database.md`
- `docs/adr/0003-indexed-jsonb-records-for-local-live-database.md`
- `docs/adr/0004-events-capabilities-own-live-implementations.md`
- `docs/superpowers/plans/2026-07-01-orbit-ai-proactive-agent-basic.md`
- `docs/superpowers/plans/2026-07-03-orbit-ios-app-first-stage.md`
- `docs/superpowers/plans/2026-07-03-orbit-ios-app-goal-2-details-and-refresh.md`
- `docs/superpowers/plans/2026-07-03-orbit-ios-app-goal-3-runtime-server-settings.md`
- `docs/superpowers/plans/2026-07-03-orbit-ios-app-goal-4-orbit-ai-send-message.md`
- `docs/superpowers/plans/2026-07-03-orbit-ios-app-goal-5-orbit-ai-bootstrap-summary.md`
- `docs/superpowers/plans/2026-07-03-orbit-ios-app-goal-6-server-health-check.md`
- `docs/superpowers/plans/2026-07-03-orbit-ios-app-goal-7-actionable-schedule-cards.md`
- `docs/superpowers/plans/2026-07-03-orbit-ios-app-goal-8-actionable-contact-cards.md`
- `docs/superpowers/specs/2026-07-01-events-capability-live-data-design.md`
- `docs/superpowers/specs/2026-07-03-orbit-ios-app-design.md`
- `repos/orbits/.claude/skills/gitnexus/gitnexus-cli/SKILL.md`
- `repos/orbits/.claude/skills/gitnexus/gitnexus-debugging/SKILL.md`
- `repos/orbits/.claude/skills/gitnexus/gitnexus-exploring/SKILL.md`
- `repos/orbits/.claude/skills/gitnexus/gitnexus-guide/SKILL.md`
- `repos/orbits/.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md`
- `repos/orbits/.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md`
- `repos/orbits/CLAUDE.md`
- `repos/orbits/app/(app)/app/events/EVENT_DETAIL_UI_CONTRACT.md`
- `repos/orbits/app/(app)/app/schedule/SCHEDULE_LIVE_IMPLEMENTATION.md`
- `repos/orbits/docs/architecture/demo-visual-assets.md`
- `repos/orbits/docs/architecture/modules/home.md`
- `repos/orbits/docs/architecture/relationship-inbox-panel.md`
- `repos/orbits/docs/architecture/root-home-routing.md`
- `repos/orbits/docs/superpowers/plans/2026-07-01-connections-live-store.md`
- `repos/orbits/docs/superpowers/plans/2026-07-01-contacts-live-store.md`
- `repos/orbits/docs/superpowers/plans/2026-07-01-events-live-store.md`
- `repos/orbits/docs/superpowers/plans/2026-07-01-live-generated-fixtures-seed.md`
- `repos/orbits/docs/superpowers/plans/2026-07-01-live-record-storage.md`
- `repos/orbits/docs/superpowers/plans/2026-07-01-search-backend-abstractions.md`
- `repos/orbits/docs/superpowers/plans/2026-07-02-contacts-live-route-performance.md`
- `repos/orbits/docs/superpowers/specs/2026-07-01-events-live-store-design.md`
- `repos/orbits/docs/superpowers/specs/2026-07-01-live-data-feature-roadmap.md`
- `repos/orbits/docs/superpowers/specs/2026-07-01-orbit-ai-proactive-agent-design.md`
- `repos/orbits/docs/superpowers/specs/2026-07-01-relationship-search-and-agent-tools-design.md`
- `repos/orbits/docs/superpowers/specs/2026-07-04-codex-live-feature-execution-prompt.md`
- `repos/orbits/features/chat/ASYNC_CONVERSATION_MOCK_TO_LIVE.md`
- `repos/orbits/features/events/REGISTRATION_PROFILE_GUIDE_LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/orbit-ai/CALENDAR_ACTION_LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/orbit-ai/CONTACT_RECOMMENDATION_EVALUATION.md`
- `repos/orbits/features/orbit-ai/EVENT_RECOMMENDATION_EVALUATION.md`
- `repos/orbits/features/orbit-ai/FOLLOWUP_CONTEXT_EVALUATION.md`
- `repos/orbits/features/orbit-ai/FOLLOWUP_CONTEXT_MOCK_TO_LIVE.md`
- `repos/orbits/features/orbit-ai/GENERAL_CONVERSATION_EVALUATION.md`
- `repos/orbits/features/orbit-ai/PANEL_LOCALIZATION.md`
- `repos/orbits/features/orbit-ai/PROACTIVE_AGENT_LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/orbit-ai/TODO_SUMMARY_EVALUATION.md`
- `repos/orbits/scripts/TEST_RUNNER.md`

## 规则

- `harness-state/runs/**` 和 `harness-state/tmp/**` 默认排除，只能作为历史证据引用。
- `.venv/**`、`.pytest_cache/**`、`.superpowers/**` 和参考项目 `repos/tokyo-business-connect/**` 不属于默认 Orbit 文档库范围。
- `needs-code-check` 不代表文档错误，只代表还没有足够证据证明它和当前代码完全一致。

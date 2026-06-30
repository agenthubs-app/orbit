# Orbit 文档新鲜度报告

生成日期：2026-06-30

## 摘要

- 已纳入 catalog：69 个文档。
- 需要代码核对（needs-code-check）：32 个文档。
- 已知过期（known-stale）：1 个文档。
- 未纳入首版目录：54 个 Markdown。

## 需要代码核对

- `docs/designs/inital_design.v0.md`：早期产品设计版本，保留用于理解历史上下文，阅读时应和当前产品设计对照。
- `repos/orbits/docs/architecture/local-remote-database.md`：说明 app 本地/远端数据库边界和 relationship schema。由于数据层近期变化频繁，需要持续代码核对。
- `repos/orbits/docs/architecture/orbit-ai-agent-performance-check-2026-06-30.md`：记录 2026-06-30 Orbit AI Agent 性能检查，作为优化历史和风险背景。
- `repos/orbits/features/account/DESIGN.md`：记录 account feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。
- `repos/orbits/features/acquisition/DESIGN.md`：记录 acquisition feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。
- `repos/orbits/features/agent/DESIGN.md`：记录 agent feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。
- `repos/orbits/features/analysis/DESIGN.md`：记录 analysis feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。
- `repos/orbits/features/audit/DESIGN.md`：记录 audit feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。
- `repos/orbits/features/bootstrap/DESIGN.md`：记录 bootstrap feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。
- `repos/orbits/features/chat/DESIGN.md`：记录 chat feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。
- `repos/orbits/features/connections/DESIGN.md`：记录 connections feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。
- `repos/orbits/features/contacts/DESIGN.md`：记录 contacts feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。
- `repos/orbits/features/dashboard/DESIGN.md`：记录 dashboard feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。
- `repos/orbits/features/events/DESIGN.md`：记录 events feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。
- `repos/orbits/features/followups/DESIGN.md`：记录 followups feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。
- `repos/orbits/features/notifications/DESIGN.md`：记录 notifications feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。
- `repos/orbits/features/orbit-ai/DESIGN.md`：记录 orbit-ai feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。
- `repos/orbits/features/permissions/DESIGN.md`：记录 permissions feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。
- `repos/orbits/features/profile/DESIGN.md`：记录 profile feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。
- `repos/orbits/features/recommendations/DESIGN.md`：记录 recommendations feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。
- `repos/orbits/features/search/DESIGN.md`：记录 search feature 的设计边界和 mock-first 实施方向，是模块文档之后的第二层阅读材料。
- `docs/superpowers/specs/2026-06-29-orbit-product-chat-agent-design.md`：记录 Orbit 产品级 Chat Agent 的目标、边界和 agent 工作流判断。
- `docs/superpowers/specs/2026-06-30-hybrid-mockdata-handoff-design.md`：定义 relationship mockdata 如何生成 TypeScript fixture 并接入 hybrid local-remote database。
- `docs/superpowers/plans/2026-06-30-hybrid-mockdata-handoff.md`：实施 generated relationship fixture 接入 app mock/hybrid 数据层的计划。
- `harness/README.md`：说明 harness 架构、命令、运行证据和长跑开发流程，是 harness 操作的主要英文来源。
- `harness-state/spec.md`：当前 harness-state/spec 是执行摘要，不是 sprint 详细需求来源。
- `harness-state/sprints.md`：人类可读 sprint 历史索引，具体成功标准仍以 contract JSON 为准。
- `harness-state/productization-notes/product-facing-sprints.md`：记录 Sprint 68 后从 mock capability loop 转向 /app/** 产品表面的产品化 backlog。
- `repos/mockdata/orbit_mock_data_ai_relationship_design.md`：用于生成关系 mock 数据、AI 画像建模、活动场景和 demo 数据的长文档。
- `repos/mockdata/generation/README.md`：说明 relationship mockdata 生成目录和运行方式，需要和当前 generator 代码保持同步。
- `repos/orbits/docs/mock-to-live/verify-that-the-capability-first-framework-can-run-the-mvp-loop-in-mock-mode-wit/LIVE_IMPLEMENTATION.md`：记录 capability-first framework mock mode 到 live implementation 的替换要求。
- `.learnings/PERFORMANCE.md`：记录性能检查相关经验，作为后续优化和回归排查入口。

## 已知过期

- `docs/superpowers/specs/2026-06-24-component-level-sprint-design.md`：早期组件级 sprint 设计，已被 capability-first 设计替代。

## 未纳入首版目录

- `docs/superpowers/plans/2026-06-29-orbit-chat-agent-quality-loop.md`
- `docs/superpowers/specs/2026-06-27-orbit-ai-reference-redesign-sprints.md`
- `harness-state/audits/2026-06-24-harness-audit.md`
- `harness-state/bootstrap-product-context.md`
- `harness/prompts/evaluator.md`
- `harness/prompts/generator.md`
- `harness/prompts/planner.md`
- `harness/prompts/verifier.md`
- `repos/orbits/docs/superpowers/specs/2026-06-29-orbit-ai-trace-debug-design.md`
- `repos/orbits/features/account/mock-account-session/LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/acquisition/business-card-review-and-confirm-flow/LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/acquisition/business-card-scan-ocr-mock/LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/acquisition/contact-acquisition-draft-pipeline/LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/acquisition/duplicate-detection-and-merge-mock/LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/acquisition/email-and-calendar-relationship-signal-mock/LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/acquisition/event-attendee-import-mock/LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/acquisition/external-contacts-import-mock/LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/acquisition/manual-contact-creation-mock/LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/acquisition/qr-scan-connect-mock/LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/acquisition/referral-and-recommended-contact-confirm-mock/LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/agent/agent-action-queue-mock/LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/agent/agent-autonomy-settings-mock/LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/agent/external-action-sandbox-mock/LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/analysis/relationship-value-scoring-mock/LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/audit/source-consistency-and-provenance-audit/LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/bootstrap/app-bootstrap-mock-aggregator/LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/chat/chat-conversation-and-message-mock/LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/chat/chat-privacy-controls-mock/LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/chat/chat-summary-and-extraction-mock/LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/chat/chat-writing-assist-mock/LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/connections/connection-and-evidence-service-mock/LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/connections/relationship-stage-and-profile-mock/LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/contacts/contact-detail-tag-and-status-mock/LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/contacts/contacts-list-search-and-filter-mock/LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/dashboard/dashboard-aggregate-mock/LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/dashboard/network-distribution-analytics-mock/LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/dashboard/opportunity-reminder-analytics-mock/LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/events/event-attendee-roster-mock/LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/events/event-crud-and-import-mock/LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/events/event-encounter-note-capture-mock/LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/events/event-goal-and-readiness-mock/LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/events/on-site-want-to-connect-mock/LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/events/post-event-contact-review-mock/LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/followups/followup-task-generation-mock/LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/followups/message-draft-generator-mock/LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/notifications/reminder-schedule-and-notification-mock/LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/permissions/permission-state-and-staged-authorization-mock/LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/permissions/sensitive-action-confirmation-guard/LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/profile/profile-document-extraction-mock/LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/profile/profile-onboarding-and-manual-profile-editor/LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/profile/profile-signal-review-queue/LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/recommendations/event-recommendation-and-opening-line-mock/LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/recommendations/event-value-recommendation-mock/LIVE_IMPLEMENTATION.md`
- `repos/orbits/features/search/relationship-natural-search-mock/LIVE_IMPLEMENTATION.md`

## 规则

- `harness-state/runs/**` 和 `harness-state/tmp/**` 默认排除，只能作为历史证据引用。
- `needs-code-check` 不代表文档错误，只代表还没有足够证据证明它和当前代码完全一致。

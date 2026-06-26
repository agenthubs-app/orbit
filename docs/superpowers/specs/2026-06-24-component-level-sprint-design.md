# Component-Level Sprint Design for Orbit

Date: 2026-06-24

Status: Superseded by `docs/superpowers/specs/2026-06-24-capability-first-sprint-design.md`.

This document is kept as historical context. The active sprint design is capability-first, not
component-first.

## Context

The current Orbit app repository is `repos/orbits`, and `repos/tokyo-business-connect` is reference-only. The user wants the first runnable milestone to reach a mock-first app loop, but with much smaller sprint granularity than the previous page-layer plan.

## Decision

Milestone C remains the target: a runnable mock-first Orbit app. The sprint unit changes to one component API plus one mock implementation whenever the work is a business UI component. Foundation and page-composition sprints still exist, but they are explicitly separated from component sprints.

## Sprint Rules

- Foundation sprints may establish app scaffold, tokens, primitives, shared state views, app shell, API envelope, mock registry, and the component gallery.
- Business component sprints each define one typed component API, one mock fixture set, one dev route, and one focused test.
- Service bridge sprints are grouped by adjacent domains only after their dependent component APIs exist.
- Page composition sprints can only compose previously approved components and mock services.
- The final mock-loop sprint verifies the end-to-end mock path without adding new component APIs.

## Tradeoffs

This plan creates more sprints, but it gives Generator a narrow scope and gives Evaluator concrete evidence. It avoids letting page implementation decide component props too early. The cost is orchestration overhead and a longer sprint list.

## Approved Sprint Waves

### Wave 0: Foundation
- Sprint 1: App scaffold and scripts
- Sprint 2: Tokyo-like design tokens
- Sprint 3: UI primitives
- Sprint 4: StateView
- Sprint 5: AppShell
- Sprint 6: API envelope and AppError
- Sprint 7: Mock registry and fixture loader
- Sprint 8: Component dev gallery

### Wave 1: Profile Components
- Sprint 9: ProfileSummaryCard
- Sprint 10: ProfileCompletenessMeter
- Sprint 11: ProfileEditorForm
- Sprint 12: GoalResourceEditor
- Sprint 13: OnboardingStepPanel

### Wave 2: Events Components
- Sprint 14: EventCard
- Sprint 15: EventListPanel
- Sprint 16: EventGoalPanel
- Sprint 17: EventAttendeeCard
- Sprint 18: EventRecommendationCard
- Sprint 19: OpeningLinePanel
- Sprint 20: EventReadinessPanel

### Wave 3: Contacts Components
- Sprint 21: ContactCard
- Sprint 22: ContactSearchFilterBar
- Sprint 23: ContactListPanel
- Sprint 24: ContactDetailHeader
- Sprint 25: ContactTagEditor
- Sprint 26: ContactStatusPanel

### Wave 4: Connections Components
- Sprint 27: ConnectionSummaryCard
- Sprint 28: RelationshipEvidenceTimeline
- Sprint 29: RelationshipStageControl
- Sprint 30: ValueExchangePanel
- Sprint 31: NextActionPanel
- Sprint 32: ScanConnectPanel

### Wave 5: Followups Components
- Sprint 33: FollowupTaskCard
- Sprint 34: FollowupQueuePanel
- Sprint 35: MessageDraftEditor
- Sprint 36: FollowupCompletionPanel

### Wave 6: Chat Components
- Sprint 37: ConversationList
- Sprint 38: MessageThread
- Sprint 39: ChatComposer
- Sprint 40: ConversationSummaryPanel
- Sprint 41: ProfileUpdateReviewPanel

### Wave 7: Dashboard Components
- Sprint 42: DashboardMetricCard
- Sprint 43: RelationshipAssetOverview
- Sprint 44: IndustryDistributionPanel
- Sprint 45: ValueTypeDistributionPanel
- Sprint 46: RelationshipStrengthPanel
- Sprint 47: OpportunityReminderList
- Sprint 48: NetworkGapPanel

### Wave 8: Agent Components
- Sprint 49: AgentActionCard
- Sprint 50: AgentActionFeed
- Sprint 51: AutonomyLevelSelector
- Sprint 52: AgentConfirmationPanel

### Wave 9: Mock Service Bridges
- Sprint 53: Account and profile mock API
- Sprint 54: Events and recommendations mock API
- Sprint 55: Contacts and connections mock API
- Sprint 56: Followups and chat mock API
- Sprint 57: Dashboard and agent mock API

### Wave 10: Page Composition
- Sprint 58: /app workbench page
- Sprint 59: /app/profile page
- Sprint 60: /app/events page
- Sprint 61: /app/events/demo-event-1 page
- Sprint 62: /app/contacts page
- Sprint 63: /app/contacts/demo-contact-1 page
- Sprint 64: /app/followups page
- Sprint 65: /app/chat page
- Sprint 66: /app/dashboard page
- Sprint 67: /app/agent page

### Wave 11: Mock Loop Acceptance
- Sprint 68: Full mock runnable loop

### Wave 12: Product Shell And Trust Language
- Sprint 69: Product app shell and route hierarchy
- Sprint 70: Product visual system pass
- Sprint 71: Product vocabulary and CTA semantics
- Sprint 72: Readable source chips and provenance disclosure
- Sprint 73: Product state and recovery system

### Wave 13: Product Route Composition Polish
- Sprint 74: Home relationship cockpit
- Sprint 75: Contact acquisition cockpit
- Sprint 76: Relationship list and detail polish
- Sprint 77: Event workbench polish
- Sprint 78: Followups and chat action polish
- Sprint 79: Dashboard and agent product polish
- Sprint 80: Responsive accessibility and screenshot QA pack

Detailed productization backlog: `harness-state/productization-notes/product-facing-sprints.md`.

# iOS Today Tasks, History, Suggestions, and Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a persistent, actor-scoped Today workspace with general tasks, Orbit suggestions, completion history, schedule aggregation, Agent access, and iOS system reminders.

**Architecture:** Introduce a domain-neutral Tasks feature backed by the existing actor-scoped LiveRecordStore. A task record owns its append-only activity list so current-state changes and history are written atomically through one record upsert; suggestions, reminder plans, device registrations, and delivery records remain separate collections. iOS reads one Today aggregate and uses dedicated task routes for full management, while Orbit AI reads the same contracts and all writes stay behind confirmation.

**Tech Stack:** TypeScript 5.7+, Next.js 16 route handlers, LiveRecordStore/PostgreSQL, React Native 0.8x with Expo 57, Expo Router, `expo-notifications`, Node test runner, React Test Renderer.

**Spec:** `docs/superpowers/specs/2026-08-28-ios-today-tasks-schedule-ai-design.md`

## Global Constraints

- Preserve every pre-existing dirty-worktree change; do not revert or rewrite unrelated files.
- All personal reads and writes require both canonical `accountId`/actor ownership and `workspaceId` storage scope.
- User-facing categories are `人脉、会面、活动、工作、个人、其他`; internal values are `relationship | meeting | event | work | personal | other`.
- Task status is `open | completed | cancelled`; schedule state is `upcoming | ongoing | ended | cancelled`.
- A TaskSuggestion is never counted as a Task before acceptance.
- “已完成” requires an explicit task action; elapsed schedules are only “已结束”.
- Agent writes, including reminder creation and task completion, require user confirmation.
- System push payloads must not contain evidence, full messages, contact profiles, or device tokens.
- Write tests first and observe the expected failure before production edits.
- Run GitNexus impact analysis before editing every existing function, class, method, interface, or exported constant.
- Do not commit during this plan unless the user explicitly requests commits; the current worktree contains overlapping uncommitted work.

---

### Task 1: Domain-Neutral Task Contracts and Atomic Record Codec

**Files:**
- Create: `repos/orbits/features/tasks/contract.ts`
- Create: `repos/orbits/features/tasks/task-record.ts`
- Create: `repos/orbits/features/tasks/legacy-task-adapter.ts`
- Create: `repos/orbits/features/tasks/DESIGN.md`
- Create: `repos/orbits/tests/services/task-record.test.ts`

**Interfaces:**
- Produces `TaskCategory`, `TaskStatus`, `TaskItemDTO`, `TaskActivityDTO`, `TaskSuggestionDTO`, `TaskRecordPayload`.
- Produces `taskRecordFromLiveRecord(record)` and `taskLiveRecordFromPayload(input)`.
- Produces `legacyTaskToTaskItem(legacyTask)` without changing the CRITICAL-risk shared legacy `TaskDTO` in place.
- `TaskRecordPayload` contains `{ task: TaskItemDTO; activities: readonly TaskActivityDTO[] }` so task state and history update in one upsert.

- [ ] Write failing codec tests proving category validation, actor ownership, completed metadata, legacy field migration, and append-only activity ordering.
- [ ] Run `node --test --import tsx tests/services/task-record.test.ts`; expect failure because `features/tasks/task-record.ts` does not exist.
- [ ] Implement exact enums from the spec and strict decoders that reject foreign actors, malformed dates, missing titles, and unknown status/category values.
- [ ] Keep legacy `contactId`, `connectionId`, and `scheduled/dismissed` decoding only in `legacy-task-adapter.ts`; canonical output uses related IDs and canonical status.
- [ ] Run the focused test, `npm run typecheck`, and `git diff --check`.

### Task 2: Task Repository and Service State Transitions

**Files:**
- Create: `repos/orbits/features/tasks/repository.ts`
- Create: `repos/orbits/features/tasks/service.ts`
- Create: `repos/orbits/features/tasks/service-factory.ts`
- Create: `repos/orbits/tests/services/tasks-service.test.ts`

**Interfaces:**
- `TaskService.list({ actorId, status?, category?, scope?, from?, to? })`.
- `TaskService.create({ actorId, title, category, plannedDate?, dueAt?, priority?, relations?, idempotencyKey })`.
- `TaskService.update({ actorId, taskId, expectedUpdatedAt, patch, idempotencyKey })`.
- `TaskService.complete/reopen/cancel/delete` return `{ task, activity }`.

- [ ] Write failing tests for manual create, actor isolation, idempotent create, optimistic concurrency, complete, duplicate complete, reopen, cancel, soft delete, and history retention.
- [ ] Verify RED with `node --test --import tsx tests/services/tasks-service.test.ts`.
- [ ] Implement a repository over `tasks` LiveRecords and use a single record upsert for current Task plus appended TaskActivity.
- [ ] Make complete/reopen/cancel deterministic code paths; do not ask a model to decide transitions.
- [ ] Verify focused tests, service factory tests, and typecheck.

### Task 3: Task CRUD and History APIs

**Files:**
- Modify: `repos/orbits/app/api/tasks/route.ts`
- Modify: `repos/orbits/app/api/tasks/handler.ts`
- Create: `repos/orbits/app/api/tasks/[id]/route.ts`
- Create: `repos/orbits/app/api/tasks/[id]/handler.ts`
- Create: `repos/orbits/app/api/tasks/[id]/activities/route.ts`
- Create: `repos/orbits/app/api/tasks/history/route.ts`
- Create: `repos/orbits/tests/api/tasks-routes.test.ts`

**Interfaces:**
- `GET/POST /api/tasks` lists or creates actor-owned tasks.
- `GET/PATCH/DELETE /api/tasks/:id` reads, edits, completes, reopens, cancels, or soft deletes.
- `GET /api/tasks/:id/activities` returns one append-only timeline.
- `GET /api/tasks/history` returns date/category-filtered activities and completed tasks.

- [ ] Write failing route tests for authentication-before-parse, exact body allowlists, actor isolation, status codes, idempotency, and safe envelopes.
- [ ] Verify RED with the focused route test.
- [ ] Replace the existing GET-only followup handler with the domain-neutral TaskService while preserving response compatibility fields during migration.
- [ ] Add exact request parsers; ignore no client-supplied actor/account/workspace fields.
- [ ] Verify focused APIs, existing followup API tests, and CORS envelope tests.

### Task 4: Task Suggestions and Acceptance Boundary

**Files:**
- Create: `repos/orbits/features/tasks/suggestion-service.ts`
- Create: `repos/orbits/features/tasks/suggestion-repository.ts`
- Create: `repos/orbits/app/api/task-suggestions/route.ts`
- Create: `repos/orbits/app/api/task-suggestions/[id]/accept/route.ts`
- Create: `repos/orbits/app/api/task-suggestions/[id]/dismiss/route.ts`
- Create: `repos/orbits/app/api/task-suggestions/[id]/snooze/route.ts`
- Modify: `repos/orbits/app/api/tasks/generate/handler.ts`
- Create: `repos/orbits/tests/services/task-suggestions.test.ts`
- Create: `repos/orbits/tests/api/task-suggestion-routes.test.ts`

**Interfaces:**
- Suggestions have `pending | accepted | dismissed | snoozed | expired` status and a stable `deduplicationKey`.
- Acceptance allows title/category/date overrides and returns `{ suggestion, task }` from one idempotent operation.

- [ ] Write failing service tests proving suggestions do not enter task counts, acceptance creates exactly one Task, repeated acceptance returns the same Task, dismiss cooldown works, and expired suggestions stay hidden.
- [ ] Write failing API tests for actor scope and exact mutation payloads.
- [ ] Implement persisted suggestions in `taskSuggestions`; make `/api/tasks/generate` create suggestions, never canonical tasks.
- [ ] Verify service, API, old generation, and typecheck suites.

### Task 5: Today Aggregate with Tasks, Suggestions, Completion Count, and Schedule

**Files:**
- Create: `repos/orbits/features/tasks/today-service.ts`
- Create: `repos/orbits/app/api/today/route.ts`
- Create: `repos/orbits/app/api/today/handler.ts`
- Create: `repos/orbits/tests/services/today-service.test.ts`
- Create: `repos/orbits/tests/api/today-route.test.ts`

**Interfaces:**
- `TodayReadModel` exactly follows the spec and accepts `date` plus validated IANA `timeZone`.
- Schedule items are read-only projections from meetings, registered events, and personal calendar records; they are never copied to tasks.

- [ ] Write failing tests for planned-today, due-today, overdue carry-forward, unplanned exclusion, suggestion separation, completion count, Sunday/Japan timezone boundaries, and chronological schedule sorting.
- [ ] Verify RED.
- [ ] Implement deterministic aggregation with no model calls and no cross-account reads.
- [ ] Add API authentication, date/timezone validation, and safe partial-source failure behavior.
- [ ] Verify focused tests and existing schedule tests.

### Task 6: iOS Contracts, View Models, Endpoints, and Navigation

**Files:**
- Create: `repos/orbit-app/src/api/contract/tasks.ts`
- Create: `repos/orbit-app/src/view-models/tasks.ts`
- Create: `repos/orbit-app/src/view-models/today.ts`
- Modify: `repos/orbit-app/src/api/contract/index.ts`
- Modify: `repos/orbit-app/src/api/endpoints.ts`
- Create: `repos/orbit-app/app/tasks.tsx`
- Modify: `repos/orbit-app/app/today.tsx`
- Modify: `repos/orbit-app/app/followups.tsx`
- Create: `repos/orbit-app/tests/tasks-view-model.test.ts`
- Create: `repos/orbit-app/tests/today-view-model.test.ts`
- Modify: `repos/orbit-app/tests/app-navigation-source.test.ts`

**Interfaces:**
- `tasksPayloadToView`, `taskHistoryPayloadToView`, and `todayPayloadToView` sanitize server records into compact Chinese UI models.
- `/today` renders TodayWorkspaceScreen, `/tasks` renders TasksScreen, `/followups` redirects to `/tasks?relation=linked`.

- [ ] Write failing mapping and route tests for categories, open/completed segmentation, suggestions, ended schedule wording, and malformed payload tolerance.
- [ ] Verify RED with focused iOS tests.
- [ ] Implement contracts, endpoints, view models, and private route wiring.
- [ ] Verify focused tests and iOS typecheck.

### Task 7: iOS Today Workspace and Full Task Management

**Files:**
- Create: `repos/orbit-app/src/screens/tasks/TodayWorkspaceScreen.tsx`
- Create: `repos/orbit-app/src/screens/tasks/TasksScreen.tsx`
- Create: `repos/orbit-app/src/screens/tasks/TaskRow.tsx`
- Create: `repos/orbit-app/src/screens/tasks/TaskEditorSheet.tsx`
- Create: `repos/orbit-app/src/screens/tasks/TaskSuggestionSection.tsx`
- Create: `repos/orbit-app/tests/today-workspace-screen-source.test.ts`
- Create: `repos/orbit-app/tests/tasks-screen-source.test.ts`
- Create: `repos/orbit-app/tests/tasks-screen-render.test.tsx`

**Interfaces:**
- Today screen has independent `待办`, `Orbit 建议`, and `日程` sections.
- Tasks screen has stable `待办 | 已完成` segmented state and compact category/date menus.
- Mutations use API responses as truth and expose undo for completion.

- [ ] Write failing source/render tests for the approved hierarchy, compact rows, quick add, completion/reopen, suggestion accept/dismiss/snooze, independent empty states, and 44-point touch targets.
- [ ] Verify RED.
- [ ] Implement the screens using existing tokens, Ionicons, route boundaries, `useApiResource`, and the authenticated API client.
- [ ] Preserve density: one title line, one optional metadata line, no nested cards, and no permanent evidence blocks.
- [ ] Verify render/source tests, full iOS tests, and typecheck.

### Task 8: Orbit AI Home Uses the Today Read Model

**Files:**
- Modify: `repos/orbit-app/src/screens/ai/AiScreen.tsx`
- Modify: `repos/orbit-app/src/screens/ai/OrbitNextActions.tsx`
- Modify: `repos/orbit-app/tests/ai-home-screen-copy.test.ts`
- Modify: `repos/orbit-app/tests/app-navigation-source.test.ts`

**Interfaces:**
- Home summary shows at most three rows from TodayReadModel and one low-priority suggestion count link.
- Drawer Today badge is `openTaskCount`; Today shortcut routes to `/today`.

- [ ] Add failing tests proving Agent signals no longer define Today count, schedule rows have no checkbox, suggestions are not tasks, and chat remains the primary surface.
- [ ] Run focused test and verify the expected failure.
- [ ] Run GitNexus impact for `AiScreen`, `OrbitNextActions`, and drawer constants; warn before proceeding if HIGH/CRITICAL.
- [ ] Implement minimal integration without changing the approved colors, blur, icon style, composer, history, or drawer interactions.
- [ ] Verify focused tests, full iOS suite, and typecheck.

### Task 9: Reminder Plans, Notification Preferences, and Delivery Ledger

**Files:**
- Create: `repos/orbits/features/notifications/reminder-plan-contract.ts`
- Create: `repos/orbits/features/notifications/reminder-plan-service.ts`
- Create: `repos/orbits/features/notifications/reminder-plan-repository.ts`
- Create: `repos/orbits/features/notifications/push-provider.ts`
- Create: `repos/orbits/app/api/reminders/route.ts`
- Create: `repos/orbits/app/api/reminders/[id]/route.ts`
- Create: `repos/orbits/app/api/devices/push-token/route.ts`
- Create: `repos/orbits/app/api/notification-preferences/route.ts`
- Create: `repos/orbits/tests/services/reminder-plan-service.test.ts`
- Create: `repos/orbits/tests/api/reminder-plan-routes.test.ts`

**Interfaces:**
- ReminderPlan is the single source for `in_app | ios_push`; delivery attempts use an idempotency key per plan/device/fire time.
- Provider is injected and returns Orbit-owned receipts; unconfigured provider fails visibly without losing in-app delivery.

- [ ] Write failing tests for create/reschedule/cancel, task completion cancellation, quiet hours, actor/device isolation, duplicate worker claims, token invalidation, and in-app fallback.
- [ ] Verify RED.
- [ ] Implement LiveRecord-backed plans, preferences, device registrations, and delivery receipts.
- [ ] Keep existing `/api/notifications` as the inbox/read projection; retire only mock-specific write claims.
- [ ] Verify notification, permission, API, and typecheck suites.

### Task 10: iOS System Notification Adapter and Reminder UI

**Files:**
- Modify: `repos/orbit-app/package.json`
- Modify: `repos/orbit-app/package-lock.json`
- Modify: `repos/orbit-app/app.config.ts`
- Create: `repos/orbit-app/src/notifications/notification-service.ts`
- Create: `repos/orbit-app/src/notifications/NotificationCoordinator.tsx`
- Modify: `repos/orbit-app/app/_layout.tsx`
- Modify: `repos/orbit-app/src/screens/tasks/TaskEditorSheet.tsx`
- Create: `repos/orbit-app/tests/notification-service.test.ts`
- Create: `repos/orbit-app/tests/notification-config-source.test.ts`

**Interfaces:**
- Use `npx expo install expo-notifications` for the Expo 57-compatible version.
- Coordinator requests permission only after an explicit reminder action, registers device tokens, handles foreground presentation, deep links, `完成`, and `稍后提醒`.
- Local scheduled notifications provide Simulator and offline verification; server push remains canonical when a valid token/provider exists.

- [ ] Write failing tests around pure permission/result mapping, deep-link allowlist, duplicate suppression, and action payload validation.
- [ ] Verify RED.
- [ ] Install/configure `expo-notifications`; add Chinese permission copy and notification categories.
- [ ] Implement the adapter so foreground shows one Orbit banner and background/lock screen uses the system surface.
- [ ] Verify unit tests, Expo config output, iOS typecheck, native build, and Simulator notification delivery.

### Task 11: Agent Read Tools and Confirmed Task/Reminder Actions

**Files:**
- Modify: `repos/orbits/features/orbit-ai/general-conversation-service.ts`
- Modify: `repos/orbits/features/orbit-ai/gemini-provider.ts`
- Modify: `repos/orbits/features/agent/runtime/domain-executors.ts`
- Modify: `repos/orbits/features/agent/DESIGN.md`
- Create: `repos/orbits/tests/services/orbit-ai-task-tools.test.ts`
- Modify: `repos/orbits/tests/capabilities/agent-workflows-e2e.test.ts`

**Interfaces:**
- Read tools: `tasks.list`, `tasks.history`, `taskSuggestions.list`, `today.read`, `reminders.list`.
- Confirmed writes: `tasks.create`, `tasks.complete`, `tasks.reopen`, `tasks.acceptSuggestion`, `reminders.create`, `reminders.reschedule`, `reminders.cancel`.

- [ ] Add failing router/planner tests for “今天没做什么”, “上周完成什么”, “有什么建议”, and “提醒我明天联系渡边”.
- [ ] Verify RED.
- [ ] Run impact analysis for each existing planner/executor symbol and stop on HIGH/CRITICAL until risk is reported.
- [ ] Implement deterministic tool routing and compact structured context; never send full task history by default.
- [ ] Keep every write proposal confirmable, actor-scoped, idempotent, and auditable.
- [ ] Verify tool tests, Agent E2E, provider prompt invariants, and typecheck.

### Task 12: Data Migration and Compatibility

**Files:**
- Create: `repos/orbits/scripts/migrate-general-tasks.ts`
- Modify: `repos/orbits/package.json`
- Create: `repos/orbits/tests/services/general-task-migration.test.ts`
- Modify: `repos/orbits/features/followups/action-writer.ts`

**Interfaces:**
- Migration supports dry-run and apply modes and reports migrated, skipped, conflicted, and duplicate counts.
- Existing confirmed task IDs remain stable; generated unconfirmed followups become suggestions.
- Existing completed tasks receive a migration-origin completion activity without fabricated timestamps.

- [ ] Write failing migration tests with legacy open/scheduled/completed/dismissed records, duplicates, foreign actors, and malformed records.
- [ ] Verify RED.
- [ ] Implement dry-run-first migration and compatibility write adapter from `followups.createTask` to Tasks service.
- [ ] Run dry-run against configured local data, inspect every non-zero skipped/conflict class, then apply only when clean.
- [ ] Verify post-migration task counts, actor isolation, relation links, and history.

### Task 13: Completion Audit and Simulator Acceptance

**Files:**
- Modify: `repos/orbit-app/design-qa.md`
- Modify: `docs/superpowers/plans/2026-08-29-ios-today-tasks-reminders-implementation.md`

**Interfaces:**
- Evidence must map each spec acceptance criterion to an automated test, API response, database query, or Simulator screenshot/notification capture.

- [ ] Run backend focused suites, full `npm test`, and `npm run typecheck`.
- [ ] Run iOS focused suites, full 670+ suite, and `npm run typecheck`.
- [ ] Run `npx expo config --type public`, native iOS build, and launch the latest app in Simulator.
- [ ] Capture Today, open tasks, suggestions, completed history, task editor reminder, foreground banner, and simulated system notification states in the ignored screenshot directory.
- [ ] Verify add, complete, undo, reopen, accept suggestion, category filtering, reminder delivery, deep link, logout token revocation, and AI history queries against real local APIs.
- [ ] Run `npx gitnexus detect-changes --repo orbit` and verify affected processes are limited to the planned Tasks, Today, Notifications, Agent, and iOS navigation surfaces.
- [ ] Run `git diff --check` and record residual external configuration requirements, especially production APNs/Expo push credentials, without claiming they are configured.

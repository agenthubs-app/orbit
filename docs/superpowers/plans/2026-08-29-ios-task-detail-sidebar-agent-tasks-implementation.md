# iOS Task Detail, Sidebar, and Agent Task Interaction Plan

**Goal:** Deliver the selected iOS task detail and Orbit AI sidebar designs, then connect Agent chat to canonical tasks with explicit creation and throttled suggestions.

**Architecture:** Keep UI changes inside the existing Expo screens and shared conversation view model. Add a focused Orbit AI task-interaction service that composes the existing `TaskService` and `TaskSuggestionService`; do not modify the shared Agent domain executor.

**Spec:** `docs/superpowers/specs/2026-08-29-ios-task-detail-sidebar-agent-tasks-design.md`

## Tasks

- [ ] Add failing backend tests for explicit creation, inferred suggestion, deduplication, and six-hour throttling.
- [ ] Add failing iOS contract/view-model tests for created and suggested task interactions.
- [ ] Update failing source tests for the selected task detail and integrated drawer layout.
- [ ] Implement the Orbit AI task-interaction service and optional cross-client response contract.
- [ ] Integrate task orchestration into `POST /api/ai/conversations` without changing the shared Agent executor.
- [ ] Implement iOS task confirmation/result cards and refresh canonical tasks after acceptance.
- [ ] Simplify `TaskDetailScreen` and implement autosave plus the low-frequency overflow menu.
- [ ] Integrate recent history, search, new chat, and inbox into `OrbitAiDrawer`.
- [ ] Run focused tests, full typechecks, iOS tests, and Simulator build/visual checks.
- [ ] Run GitNexus change detection, classify all dirty files, and commit coherent functional groups in chronological order.

## Commit Groups

1. Existing task/reminder domain foundation and seed data.
2. Existing iOS Today/task/reminder UI.
3. Selected task detail and Orbit AI sidebar polish.
4. Orbit AI task creation and suggestion interaction.
5. Design preview archive and implementation documentation.

Each commit will stage explicit paths only. Unrelated or uncertain changes remain uncommitted and will be reported.

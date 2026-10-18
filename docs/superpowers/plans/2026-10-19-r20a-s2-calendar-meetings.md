# R20a S2 Calendar Meetings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Include confirmed meetings in the App calendar's real source, with an actor-owned, read-only offline snapshot that becomes visibly stale across local midnight.

**Architecture:** Read the existing actor-authenticated `GET /api/schedule-items?scope=calendar&from&to&language` for the visible local-date grid. Keep only validated `kind=meeting` rows in a small account page copy keyed by window/language, rather than copying unrelated personal/event rows. Merge that meeting part with the device-mirror parts before calendar projection; external Google events stay network-only.

**Tech Stack:** Expo/React Native, TypeScript, existing API and page-copy sessions, Node tests, existing calendar view-model.

**Spec:** `docs/designs/redesign-2026-10/sprints/R20a-task-todo-calendar/PLANNER.md` (§7.3, §8, SC-10/11) plus user RD-33 decision of 2026-10-19 (actor-owned meeting copy, read-only, stale 「以前の情報」 after local midnight, clear on logout).

## Global Constraints

- D-line owns the calendar screen and schedule source; do not alter the shared UI kit or create a meeting mutation path.
- `scope=calendar` is already actor-authenticated and its server window cap is 43 days. Use the visible local-date grid and a valid IANA time zone.
- Save only confirmed meeting preview rows after a valid online response; never cache external provider events or another actor's response.
- Reuse the existing account page-copy lease/epoch and sign-out clearing; test the new copy ID in that lifecycle. No new local storage dependency.
- S2 gets its own path-scoped commit; do not push or run full suites before sprint closure.

## Review Focus

- Month windows crossing DST remain within the server's 43-day cap; a range test covers it.
- A stale request from actor A cannot render or save after switching to actor B; source test covers it.
- Missing or malformed meeting rows do not poison the calendar or get copied; parser test covers them.
- An offline copy from yesterday shows 「以前の情報」 even when the screen stays open past midnight; render test covers it.
- Sign-out removes the new actor copy through the existing page-copy lifecycle; storage/lifecycle test covers it.

---

### Task 1: Bounded Meeting Source and Copy

**Files:**
- Create: `repos/orbit-app/src/screens/calendar/calendar-meeting-source.ts`
- Create: `repos/orbit-app/src/screens/calendar/useCalendarMeetings.ts`
- Modify: `repos/orbit-app/src/data/sync/page-copies.ts`
- Modify: `repos/orbit-app/src/data/sync/local-sync-repository.ts` and `sync-coordinator.ts` for scoped deletion after an authoritative 4xx
- Modify: `repos/orbit-app/src/data/offline-read/route-domain-inventory.ts`
- Modify: `repos/orbits/shared/api-schema/offline-policy.ts` and its App synced copy (`repos/orbit-app/src/api/schema/offline-policy.ts`)
- Modify: `repos/orbit-app/docs/phoneweb/local-mirror-threat-model.md`
- Test: `repos/orbit-app/tests/calendar-meeting-source-r20a.test.ts`
- Test: `repos/orbit-app/tests/page-copies-sync.test.ts`
- Test: `repos/orbit-app/tests/sync-lifecycle.test.ts`
- Test: `repos/orbit-app/tests/calendar-meeting-hook-r20a.test.tsx`

**Interfaces:** `calendarMeetingWindow(dateKey: string, mode: CalendarMode, timeZone: string): { from: string; to: string; variant: string } | null`; `readCalendarMeetings(response: unknown): ScheduleItemContract[] | null`; `useCalendarMeetings(dateKey, mode, timeZone, language): { part: CalendarPart; copy: (PageCopyStatus & { readLocalDate: string; stale: boolean }) | null; refreshing: boolean; refresh(): void }`.

- [x] Write tests for day/week/month local windows including DST; exact `scope=calendar` request; meeting-only filtering and invalid-response rejection; account/window-keyed copy; no cross-actor stale request; sign-out cleanup of `calendar-meetings`. Source and copy registration began RED; later race regressions were each RED before repair.
- [x] Run the targeted source/copy/lifecycle tests. The native lifecycle test requires `--import ./tests/helpers/register-render-hooks.mjs` to load its existing React Native dependency; with that loader it passes 48/48. The source/copy/inventory group passes 40/40.
- [x] Implement range/parser and hook using the existing network-only `useApiResource` plus `usePageCopySession` and `useOrbitAuthSession`; save `{ from, to, language, readLocalDate, meetings }` only from a valid 2xx answer. `readLocalDate` is the actor-time-zone local date of successful fetch. Retain the matching copy on network/5xx failure only; delete it on an authoritative 4xx. Register an account-only `calendar-meetings` keyed copy (at most three windows, at most 256 KiB each), add a `calendar.read` snapshot policy action for `/api/schedule-items` without changing its existing personal read action, sync that contract, and document the stored fields. The storage session's existing actor/lease binding handles sign-out clearing. Serializing copy writes/deletions was required by review to stop an in-flight save resurrecting a denied copy.
- [x] Re-run the source/copy tests and App `npm run typecheck`; require pass or record exact remaining failures. Both pass.

### Task 2: Calendar Projection and Stale Read-Only UI

**Files:**
- Modify: `repos/orbit-app/src/screens/calendar/CalendarScreen.tsx`
- Modify only if needed for a separate meeting input: `repos/orbit-app/src/screens/calendar/calendar-projection.ts`
- Modify: `repos/orbit-app/src/i18n/{ja,zh,en}/calendar.ts`
- Test: `repos/orbit-app/tests/calendar-projection-r20a.test.ts`
- Test: `repos/orbit-app/tests/calendar-meeting-screen-r20a.test.tsx`

**Interfaces:** Consume Task 1's `{ part, copy, refreshing, refresh }`; merge only its meeting rows into the schedule projection. The existing meeting detail route remains the read-only destination when an offline detail copy exists; no move/cancel/write control is introduced by the calendar snapshot.

- [x] Write tests: a server-returned confirmed meeting appears in month/day/week and has the appointment detail href; offline matching copy remains visible with 「以前の情報」 after local midnight; an unrelated actor/window copy is not shown; an invalid/missing meeting source does not hide task/event/personal rows; refresh re-reads the meeting source.
- [x] Run targeted tests; source/projection gaps and the new timestamp/race cases were observed RED before their repairs.
- [x] Merge the meeting part without duplicating native mirror rows; show an as-of timestamp whenever a cached meeting copy is shown and a meeting-specific stale marker when `copy.stale` is true. Keep copied data read-only and all mutation controls subject to the existing offline guards.
- [x] Re-run targeted tests, App `npm run typecheck`, and copy QA for changed locale files. Web/App copy QA has 218 existing issues and no new calendar key issue; it is not a passing gate.
- [ ] Path-scope commit S2 code/tests and the confirmed plan as `fix(R20a): show offline-safe calendar meetings`; record the SHA in `REPORT.md`.

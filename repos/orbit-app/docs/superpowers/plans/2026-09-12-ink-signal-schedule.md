# Ink & Signal Schedule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Continue the approved in-place work; no commit, push, deployment or backend changes.

**Goal:** Apply the approved day, week and month calendar designs while preserving real dates, items, holidays, navigation and partial-source feedback.

**Architecture:** Keep ScheduleScreen and its three existing read resources. Add an opt-in Monday start to the existing calendar projection; leave the default unchanged. Keep all seven days in the week agenda, with a selected-date-forward presentation followed by earlier days, so no existing events disappear.

**Tech Stack:** React Native, Expo Router, existing themed styles, Node tests and RNW/Playwright fixtures.

**Spec:** `docs/designs/2026-09-12-ink-signal/README.md`; exact sources `2a-日程-日.png`, `2a-日程-周.png`, `2a-日程-月.png`. Orbit functionality takes precedence over reference-only capabilities.

## Global Constraints

- Only edit `repos/orbit-app`; preserve all existing work and API semantics.
- 16pt inset, ink selected segment, signal-blue date selection, Monday-first weeks, real item dots and counts, 56pt hourly geometry. Keep 44pt actions, font scaling, current-date indication and Japanese holidays.
- Do not invent a create route for the reference `+`; the existing App has no direct schedule creation form. Keep its position empty, document the difference.
- No fake dates in production; fixed September 11 data belongs only to screenshots/tests. No new mutation or live data access.
- RNW screenshots are local rendering evidence, not native/live acceptance. Whole-app tests are consolidated at all-page acceptance.

### Task 1: Working three-mode calendar

**Files:** Modify `src/screens/schedule/ScheduleScreen.tsx`, `src/view-models/schedule.ts`, `tests/schedule-screen-source.test.ts`, `tests/app-wide-workspaces.test.ts`; add `tests/ink-signal-schedule.test.ts`. Record QA in `docs/designs/2026-09-12-ink-signal/2026-09-12-schedule-qa.md` and the design README.

**Interfaces:** `scheduleToCalendarView({ events, now, scheduleItems, selectedDateKey, tasks, weekStartsOn?: 0 | 1 })` retains `ScheduleCalendarView`; Screen opts into `weekStartsOn: 1`. Existing item `href`, time, kind and status remain authoritative. Segments change presentation only; day arrows move one day, week arrows seven days and month arrows use existing clamped month navigation.

- [x] Write failing projection/render tests for Monday opt-in without changing Sunday default, ink segments, source date heading, selected-date-forward whole-week agenda, circular month selection, 35/42-cell months, exact event navigation, four kinds and partial read failures.

```ts
const view = scheduleToCalendarView({ tasks: [], events: [], now: new Date('2026-09-11T05:20:00Z'), weekStartsOn: 1 });
assert.equal(view.days[0]?.dateKey, '2026-09-07');
assert.equal(view.days[6]?.dateKey, '2026-09-13');
await page.getByRole('tab', { name: '月', exact: true }).click();
assert.equal(await page.getByRole('button', { name: '11日，3项安排', exact: true }).getAttribute('aria-selected'), 'true');
```

- [x] Run RED: `node --import tsx --test --test-timeout=120000 tests/ink-signal-schedule.test.ts`; distinguish harness faults from expected failures.
- [x] Complete per-symbol impact before editing. Screen internals LOW (0–3 direct callers, no indexed flows); local useStyles UNKNOWN, manually constrained to this file. Implement the existing presentation without shared container changes.

```ts
const offset = -((date.getUTCDay() - weekStartsOn + 7) % 7);
const forward = view.days.filter(day => day.dateKey >= view.selectedDateKey);
const earlier = view.days.filter(day => day.dateKey < view.selectedDateKey);
const orderedDays = [...forward, ...earlier];
```

- [x] Run new and existing schedule/view-model/workspace tests plus typecheck. Preserve the existing large-font time gutter, unchanged hourly positions, complete agenda text, no-write and selected-date navigation assertions; only update obsolete Sunday/segment visual expectations. Final combined 78/78, typecheck6 exit 0, diff check clean.
- [x] Capture source-matched 390px day/week/month, 320px large-font, wide and dark views. View actual screenshots beside each exact reference. Fix important layout/interaction differences and recapture. Added 2× text case and repaired month-unit/weekday wrapping without disabling scaling.
- [x] Use requesting-code-review for an independent read-only review; repair important findings with targeted RED/GREEN tests. February 2027 28-vs-35 slot regression repaired; final APPROVE, no remaining findings.
- [x] Record verified evidence and unsupported `+`/native/live differences in QA and README. Continue remaining approved pages; this batch does not close the whole goal.

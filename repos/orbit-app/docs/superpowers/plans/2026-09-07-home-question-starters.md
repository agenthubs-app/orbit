# Home Question Starters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the home welcome paragraph with two useful, context-selected questions that only prefill the composer.

**Architecture:** Reuse the Today endpoint and its existing typed decoders. Select fixed short templates deterministically, freeze the pair while viewing, and reselect after an explicit refresh. Suppress only the known bootstrap welcome on home; preserve real messages and detail screens.

**Tech Stack:** React Native, Expo Router, TypeScript, node:test, existing react-native-web render harness.

**Spec:** `docs/designs/2026-09-07-ai-home-guidance/README.md`; approved `question-starters-v2.png` and subsequent “接入”.

## Global Constraints

- Every pair contains two different types; one contextual priority and one discovery question.
- No invented records, new backend calls, model generation, automatic sends, or navigation changes.
- Preserve next actions, Ocean-blue tokens, native keyboard behavior, and existing dirty changes.
- Existing in-place approval applies; local delivery only, no commit, push, or publication.
- Selected image supplies only question layout, not task records or unrelated component geometry.

### Task 1: Home question selection and rendering

**Files:** Modify `src/screens/ai/AiScreen.tsx`, `src/view-models/today-tasks.ts`, `src/view-models/conversations.ts`; create `tests/ai-home-guidance-render.test.tsx`. Existing source-only guidance checks remain valid and were preserved; the new tests exercise real rendering.

**Interfaces:** `todayHomeQuestions(payload: unknown, now?: Date): readonly HomeQuestion[]`, where `HomeQuestion = { kind: "tasks" | "followup" | "preparation" | "discovery"; label: string }`.

- [x] Add real-screen render assertions for two accessible prefill questions, priority tasks, relationship follow-up, upcoming preparation, empty/malformed/error data, and preservation of genuine messages.
- [x] Run `node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/ai-home-guidance-render.test.tsx`; verify missing guidance assertions fail.
- [x] Implement typed selection with existing `taskFrom`/`scheduleFrom`: urgent open tasks first, upcoming meeting/event preparation second, open relationship tasks third, generic task planning otherwise. Always add activity discovery as the second distinct type.
- [x] Render under Next Actions inside the existing scroll view: muted “试着问我”, two separated rows, trailing Ionicons arrow. `onPress={() => setDraftMessage(prompt.label)}` only; no submit callback.
- [x] Filter only the exact known bootstrap assistant record from the home view-model, including assistant-only fallback; preserve genuine messages, even when their content resembles the greeting.
- [x] Run targeted tests plus conversation view-model tests and typecheck.

### Task 2: Stable selection and native acceptance

**Files:** Create `src/view-models/home-question-snapshot.ts`, `tests/home-question-snapshot.test.ts`; wire snapshot in `AiScreen.tsx`; append this scoped run to `design-qa.md` and update the design README.

**Interfaces:** `homeQuestionSnapshot(previous, { scope, payload, ready, refreshing }): HomeQuestionSnapshot`; the returned object holds `scope`, `questions`, and `refreshing`. Keep object identity until first settled data, refresh completion, or account/server reset.

- [x] Test initial loading fallback, first data selection, unchanged pair after background data changes, refresh retention/completion, and scope changes. Literal expected kinds: `["tasks", "discovery"]`, `["followup", "discovery"]`, `["preparation", "discovery"]`.
- [x] Implement the pure transition; use React state with guarded render-time adjustment so new data cannot reshuffle rows mid-visit. Changing account/server discards the previous snapshot and waits for its resource loading or refreshing cycle before accepting data.
- [x] Run full `npm test` and `npm run typecheck`.
- [x] Launch the existing native app, inspect light/dark and keyboard-visible states, tap a question and verify prefill without sending, and inspect native accessibility geometry.
- [x] Compare normalized native screenshot and selected image in one visual input, inspect question typography/spacing/color/copy and unchanged controls; repair actionable drift and recapture if necessary.
- [x] Obtain a bounded independent code review while checking native evidence. Review found one refreshing-only account transition bug; its regression failed before the fix and passes now. Independent targeted run: 46/46. No remaining critical, important or minor findings. Deliver verified local work with no unrequested integration.

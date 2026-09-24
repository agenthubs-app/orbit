# New UI Foundation Batch 1 — Pure Model Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pull the page-agnostic logic that today lives inside three large `orbit-real-*.tsx` / workspace components into standalone `.ts` model modules with their own unit tests, so the Web UI rebuild can consume it without copying or re-testing — with zero behavior change to the existing pages.

**Architecture:** Boundary decision **A** (see `docs/development/2026-09-17-web/NEW-UI-DECISION.md`): the rebuild replaces the component layer only; App Router routes, `proxy.ts` onboarding gate, `[data-orbit-real-page]` token system and every verified service entry in `NEW-UI-INTERFACE-TABLE.md` stay. Batch 1 extracts *pure functions only* (no hooks, no fetch, no React) from the three pages listed in §二 of the interface table. Each existing `.tsx` keeps working by importing the new module (and re-exporting where tests already import from the `.tsx`). Hook extraction (fetch/epoch/abort orchestration) is Batch 2 and is explicitly out of scope here.

**Tech Stack:** Next.js App Router, TypeScript, `node --test --import tsx` (node:test + node:assert/strict), GitNexus for impact/detect-changes.

## Global Constraints

- Work tree: new git worktree from `1f492f49679ee0d9190322a3d19cb6889de82224` at `/Users/li/work/orbit-web-newui-foundation-20260918`, branch `newui/foundation-batch-1`. Never edit `/Users/li/work/orbit` (stale `e643572`) or `/Users/li/work/orbit-web-integration-20260917` (main integration tree, must stay clean).
- All paths below are relative to `<worktree>/repos/orbits/`.
- Zero behavior change: every extracted function keeps its exact current semantics, including Chinese/English copy strings. No new features.
- Existing tests that import from the `.tsx` files must keep passing unchanged: `tests/pages/app-events-registration-state.test.ts`, `tests/pages/app-events-view-switcher.test.ts`, `tests/pages/event-registration-workspace.test.tsx`, `tests/pages/event-registration-readback.test.tsx`, `tests/pages/app-event-registration-account-scope.test.tsx`, `tests/pages/app-profile-editor-failure-paths.test.tsx`, `tests/pages/app-profile-onboarding-editor.test.tsx`, `tests/pages/secondary-industry-editors.test.tsx`.
- CLAUDE.md rules apply: run GitNexus `impact` (upstream) on every symbol before moving it; run `detect-changes --scope all` before each commit. HIGH/CRITICAL must be reported, never waived. The GitNexus index for the worktree must be built first (`node .gitnexus/run.cjs analyze --index-only` from the worktree root) — the main-dir index is for `e643572` and is stale for this tree.
- Do not touch `orbit-landing-route-view-model.ts` (shared mapper HIGH, W3 owner) or `profile-route-view-model.ts` (routeState CRITICAL).
- Test command: `node --test --import tsx <file>` from `repos/orbits`. Typecheck: `npm run typecheck` from `repos/orbits`.
- Commit messages end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

### Task 0: Worktree, index, and baseline

**Files:**
- Create: worktree `/Users/li/work/orbit-web-newui-foundation-20260918`
- Create: `docs/development/2026-09-17-web/NEW-UI-DECISION.md` (in `/Users/li/work/orbit`, coordination docs live there)

- [ ] **Step 1: Create the worktree**

```bash
cd /Users/li/work/orbit-web-integration-20260917
git worktree add -b newui/foundation-batch-1 /Users/li/work/orbit-web-newui-foundation-20260918 1f492f49679ee0d9190322a3d19cb6889de82224
```
Expected: `Preparing worktree (new branch 'newui/foundation-batch-1')` and `HEAD is now at 1f492f49`.

- [ ] **Step 2: Install deps without touching the lockfile**

```bash
cd /Users/li/work/orbit-web-newui-foundation-20260918/repos/orbits && npm ci --ignore-scripts
```
Expected: exits 0; `node_modules/` present.

- [ ] **Step 3: Build the GitNexus index for this tree**

```bash
cd /Users/li/work/orbit-web-newui-foundation-20260918 && node .gitnexus/run.cjs analyze --index-only
```
Expected: ends with a symbol/relationship count, no `partial`/`truncated`.

- [ ] **Step 4: Record the baseline for the eight guard tests**

```bash
cd /Users/li/work/orbit-web-newui-foundation-20260918/repos/orbits && node --test --import tsx \
  tests/pages/app-events-registration-state.test.ts \
  tests/pages/app-events-view-switcher.test.ts \
  tests/pages/event-registration-workspace.test.tsx \
  tests/pages/event-registration-readback.test.tsx \
  tests/pages/app-event-registration-account-scope.test.tsx \
  tests/pages/app-profile-editor-failure-paths.test.tsx \
  tests/pages/app-profile-onboarding-editor.test.tsx \
  tests/pages/secondary-industry-editors.test.tsx 2>&1 | tail -12
```
Expected: `# fail 0`. Write the `# pass N` number down; every later task must reproduce it.

- [ ] **Step 5: Write the decision record**

`/Users/li/work/orbit/docs/development/2026-09-17-web/NEW-UI-DECISION.md`:

```markdown
# 新 UI 边界决定

日期：2026-09-18。决定人：主代理（用户授权「你自己决定自己做」）。

- 边界：**A — 只换组件层**。保留 Next.js App Router 路由、`proxy.ts` 资料门禁与豁免表、`[data-orbit-real-page]` token 体系、`AccountTopNav`/`OrbitTopNav`、汉堡移动导航。
- 理由：[NEW-UI-INTERFACE-TABLE.md](NEW-UI-INTERFACE-TABLE.md) 第一节全部 server 入口可直接 import；已有设计决定（星空暗色、去 AI 感、处处有据、邮件止于草稿）不需重谈。
- 基线：`1f492f49`。新 UI 工作树 `/Users/li/work/orbit-web-newui-foundation-20260918`，分支 `newui/foundation-batch-1`。
- 批次 1：纯函数抽取（探索页筛选模型、报名工作区回执/转写模型、资料保存/合并模型），零行为变化；计划见 `docs/superpowers/plans/2026-09-18-new-ui-foundation-batch-1.md`。
- 批次 2（未开始）：hook 抽取（资料 Reload/Save 会话、报名回执回读、探索页 URL scope 同步）。
- 旧计划处置：按接口表第三节；未通知其他 session 停止前，其文件锁仍视为有效，本批不触碰锁内文件之外的任何共享文件。
```

---

### Task 1: Explore page model — `events/explore-model.ts`

**Files:**
- Create: `app/(app)/app/events/explore-model.ts`
- Modify: `app/(app)/app/events/orbit-real-explore-client.tsx:15-58,128-165,526-541`
- Test: `tests/pages/app-events-explore-model.test.ts`

**Interfaces:**
- Consumes: `OrbitLandingEventView` from `../orbit-landing-route-view-model` (read-only type), `EventRegistrationAvailability` + `eventRegistrationIsOpen` from `../orbit-event-registration-view-model`.
- Produces:
  - `export const EVENT_SCOPES = ["all","registered","upcoming","active","ended"] as const; export type EventScope`
  - `eventScopeFromValues(values: readonly string[]): EventScope`
  - `eventScopeSearchString(nextStatus: EventScope, currentSearch: string): string`
  - `eventCardActionKind(status, registered, registrationAvailability?): "enter"|"manage"|"register"|"view"`
  - `eventTopics(event: OrbitLandingEventView): string[]`
  - `topicLabel(topic: string, language: "en"|"ja"|"zh"): string`
  - `exploreTopicFilters(events: readonly OrbitLandingEventView[]): string[]` (unique, max 8)
  - `matchesExploreFilters(event, {query, status, topic, language}): boolean`

- [ ] **Step 1: Run impact on the symbols to be moved**

```bash
cd /Users/li/work/orbit-web-newui-foundation-20260918
for s in eventScopeFromValues eventScopeSearchString eventCardActionKind eventTopics topicLabel; do node .gitnexus/run.cjs impact "$s" --direction upstream --repo . | head -20; done
```
Expected: callers are `OrbitRealExploreClient`, `events/page.tsx` (scope parsing) and the two tests. Record risk. If any is HIGH/CRITICAL, stop and report before editing.

- [ ] **Step 2: Write the failing test**

`tests/pages/app-events-explore-model.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import type { OrbitLandingEventView } from "../../app/(app)/app/orbit-landing-route-view-model";
import {
  eventTopics,
  exploreTopicFilters,
  matchesExploreFilters,
  topicLabel,
} from "../../app/(app)/app/events/explore-model";

function event(overrides: Partial<OrbitLandingEventView>): OrbitLandingEventView {
  return {
    address: "Tokyo Midtown",
    code: "EV-1",
    id: "ev-1",
    industry: "AI",
    name: "AI 交流会",
    place: "Tokyo Midtown",
    status: "upcoming",
    stats: { youRsvped: false },
    tags: ["Cloud", "Tokyo Midtown", "demo:internal"],
    theme: "cloud",
    ...overrides,
  } as OrbitLandingEventView;
}

test("eventTopics dedupes, strips internal markers and venue echoes", () => {
  assert.deepEqual(eventTopics(event({})), ["AI", "Cloud"]);
});

test("topicLabel maps zh only", () => {
  assert.equal(topicLabel("AI", "en"), "AI");
  assert.equal(topicLabel("AI", "zh"), "AI");
  assert.equal(topicLabel("unknown-topic", "zh"), "unknown-topic");
});

test("exploreTopicFilters caps at 8 unique topics in first-seen order", () => {
  const events = Array.from({ length: 10 }, (_, i) => event({ industry: `T${i}`, tags: [] }));
  assert.deepEqual(exploreTopicFilters(events), ["T0", "T1", "T2", "T3", "T4", "T5", "T6", "T7"]);
});

test("matchesExploreFilters combines status, topic and query", () => {
  const registered = event({ stats: { youRsvped: true }, status: "ended" });
  assert.equal(matchesExploreFilters(registered, { language: "zh", query: "", status: "registered", topic: "all" }), true);
  assert.equal(matchesExploreFilters(registered, { language: "zh", query: "", status: "upcoming", topic: "all" }), false);
  assert.equal(matchesExploreFilters(event({}), { language: "zh", query: "", status: "all", topic: "Cloud" }), true);
  assert.equal(matchesExploreFilters(event({}), { language: "zh", query: "", status: "all", topic: "Fintech" }), false);
  assert.equal(matchesExploreFilters(event({}), { language: "zh", query: "EV-1", status: "all", topic: "all" }), true);
  assert.equal(matchesExploreFilters(event({}), { language: "zh", query: "nope", status: "all", topic: "all" }), false);
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd /Users/li/work/orbit-web-newui-foundation-20260918/repos/orbits && node --test --import tsx tests/pages/app-events-explore-model.test.ts 2>&1 | tail -5
```
Expected: FAIL — `Cannot find module '.../events/explore-model'`.

- [ ] **Step 4: Create the module by moving the code verbatim**

`app/(app)/app/events/explore-model.ts`:

```ts
import type { OrbitLandingEventView } from "../orbit-landing-route-view-model";
import { eventRegistrationIsOpen, type EventRegistrationAvailability } from "../orbit-event-registration-view-model";

export const EVENT_SCOPES = ["all", "registered", "upcoming", "active", "ended"] as const;
export type EventScope = (typeof EVENT_SCOPES)[number];

export function eventScopeFromValues(values: readonly string[]): EventScope {
  if (values.length !== 1) return "all";
  const value = values[0];
  return value === "registered" ||
    value === "upcoming" ||
    value === "active" ||
    value === "ended"
    ? value
    : "all";
}

export function eventScopeSearchString(
  nextStatus: EventScope,
  currentSearch: string,
): string {
  const nextParams = new URLSearchParams(currentSearch);
  if (nextStatus === "all") nextParams.delete("scope");
  else nextParams.set("scope", nextStatus);
  return nextParams.toString();
}

export function eventCardActionKind(
  status: OrbitLandingEventView["status"],
  registered: boolean,
  registrationAvailability: EventRegistrationAvailability = "unavailable",
): "enter" | "manage" | "register" | "view" {
  if (!registered) {
    return status === "upcoming" && eventRegistrationIsOpen(registrationAvailability) ? "register" : "view";
  }
  if (status === "active") return "enter";
  return status === "upcoming" ? "manage" : "view";
}

// ⬇ move TOPIC_LABELS_ZH and INTERNAL_TOPIC from orbit-real-explore-client.tsx verbatim (they sit just above topicLabel).

export function topicLabel(topic: string, language: "en" | "ja" | "zh"): string {
  return language === "en" ? topic : TOPIC_LABELS_ZH[topic] ?? topic;
}

export function eventTopics(event: OrbitLandingEventView): string[] {
  return [...new Set([event.industry, ...event.tags].map((item) => item.trim()).filter(Boolean))]
    .filter((item) => !INTERNAL_TOPIC.test(item))
    // 地点已在卡片 meta 行展示，不再作为话题重复出现。
    .filter((item) => item !== event.address && item !== event.place);
}

export function exploreTopicFilters(events: readonly OrbitLandingEventView[]): string[] {
  return [...new Set(events.flatMap(eventTopics))].slice(0, 8);
}

export interface ExploreFilterInput {
  language: "en" | "ja" | "zh";
  query: string;
  status: EventScope;
  topic: string;
}

export function matchesExploreFilters(event: OrbitLandingEventView, input: ExploreFilterInput): boolean {
  const { language, query, status, topic } = input;
  const matchesStatus =
    status === "all" ||
    (status === "registered"
      ? Boolean(event.stats.youRsvped)
      : event.status === status);
  const topics = eventTopics(event);
  const matchesTopic = topic === "all" || topics.includes(topic);
  const matchesQuery =
    !query ||
    event.name.includes(query) ||
    event.code.includes(query) ||
    event.theme.includes(query) ||
    topics.some((item) => item.includes(query) || topicLabel(item, language).includes(query));
  return matchesStatus && matchesTopic && matchesQuery;
}
```

Then in `orbit-real-explore-client.tsx`: delete the moved definitions (`statusFilters`, `EventScope`, the three exported functions, `TOPIC_LABELS_ZH`, `INTERNAL_TOPIC`, `topicLabel`, `eventTopics`), add

```ts
import {
  eventTopics,
  exploreTopicFilters,
  matchesExploreFilters,
  topicLabel,
  type EventScope,
} from "./explore-model";
export { eventCardActionKind, eventScopeFromValues, eventScopeSearchString } from "./explore-model";
```

and replace the two `useMemo` bodies:

```ts
const topicFilters = useMemo(() => exploreTopicFilters(events), [events]);
const filtered = useMemo(
  () => events.filter((event) => matchesExploreFilters(event, { language, query, status, topic })),
  [events, language, query, status, topic],
);
```

- [ ] **Step 5: Run the new test and the guard tests**

```bash
cd /Users/li/work/orbit-web-newui-foundation-20260918/repos/orbits && node --test --import tsx tests/pages/app-events-explore-model.test.ts tests/pages/app-events-registration-state.test.ts tests/pages/app-events-view-switcher.test.ts 2>&1 | tail -6 && npm run typecheck 2>&1 | tail -3
```
Expected: `# fail 0`; typecheck exits 0.

- [ ] **Step 6: Graph check and commit**

```bash
cd /Users/li/work/orbit-web-newui-foundation-20260918 && node .gitnexus/run.cjs analyze --index-only >/dev/null && node .gitnexus/run.cjs detect-changes --scope all --repo . | head -40
```
Expected: no `partial: true` / `truncated: true`; affected symbols limited to the explore client and its tests.

```bash
cd /Users/li/work/orbit-web-newui-foundation-20260918 && git add "repos/orbits/app/(app)/app/events/explore-model.ts" "repos/orbits/app/(app)/app/events/orbit-real-explore-client.tsx" repos/orbits/tests/pages/app-events-explore-model.test.ts && git commit -m "refactor(events): extract explore filter model from client component

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Registration workspace model — `register/registration-workspace-model.ts`

**Files:**
- Create: `app/(app)/app/events/[id]/register/registration-workspace-model.ts`
- Modify: `app/(app)/app/events/[id]/register/event-registration-workspace.tsx:101-192`
- Test: `tests/pages/event-registration-workspace-model.test.ts`

**Interfaces:**
- Consumes: `AdaptiveInterviewTurn` (adaptive-interview-service), `EventParticipantProfileAnswers` (registration/contract), `EventAdmissionApplication` + `EVENT_ADMISSION_APPLICATION_STATUSES` (admission/contract).
- Produces:
  - `type RegistrationLanguage = "en" | "zh"`
  - `registrationCopy(language, {en, zh}): string`
  - `registrationFieldLabel(language, field): string`
  - `answersFromTranscript(transcript): EventParticipantProfileAnswers`
  - `transcriptFromAnswers(answers): AdaptiveInterviewTurn[]`
  - `type AdmissionApplicationReceiptExpectation`
  - `matchesAdmissionApplicationReceipt(value, expectation): value is EventAdmissionApplication`
  - `type StatusCardApplication`; `isStatusCardApplication(application): application is StatusCardApplication`

- [ ] **Step 1: Run impact**

```bash
cd /Users/li/work/orbit-web-newui-foundation-20260918
for s in answersFrom transcriptFromAnswers matchesAdmissionApplicationReceipt isStatusCardApplication fieldLabel; do node .gitnexus/run.cjs impact "$s" --direction upstream --repo . | head -15; done
```
Expected: only `EventRegistrationWorkspace` as caller (module-private today). `UNKNOWN` is acceptable here only after `grep -rn "answersFrom\|transcriptFromAnswers\|matchesAdmissionApplicationReceipt\|isStatusCardApplication" repos/orbits --include=*.ts --include=*.tsx` shows no other file.

- [ ] **Step 2: Write the failing test**

`tests/pages/event-registration-workspace-model.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  answersFromTranscript,
  isStatusCardApplication,
  matchesAdmissionApplicationReceipt,
  registrationFieldLabel,
  transcriptFromAnswers,
} from "../../app/(app)/app/events/[id]/register/registration-workspace-model";

test("transcript ↔ answers round-trip drops blank answers", () => {
  const transcript = transcriptFromAnswers({ industry: "AI", positioning: "  ", valueOffered: "intro" } as never);
  assert.deepEqual(transcript, [
    { answer: "AI", field: "industry", prompt: "industry" },
    { answer: "intro", field: "valueOffered", prompt: "valueOffered" },
  ]);
  assert.deepEqual(answersFromTranscript(transcript), { industry: "AI", valueOffered: "intro" });
});

test("field labels are bilingual", () => {
  assert.equal(registrationFieldLabel("en", "industry"), "Industry");
  assert.equal(registrationFieldLabel("zh", "industry"), "行业");
});

test("admission receipt must match actor, event, version and status", () => {
  const expectation = { actorId: "a1", eventId: "e1" };
  const receipt = { actorId: "a1", applicationVersion: 2, eventId: "e1", status: "pending_review" };
  assert.equal(matchesAdmissionApplicationReceipt(receipt, expectation), true);
  assert.equal(matchesAdmissionApplicationReceipt({ ...receipt, actorId: "other" }, expectation), false);
  assert.equal(matchesAdmissionApplicationReceipt({ ...receipt, applicationVersion: 0 }, expectation), false);
  assert.equal(matchesAdmissionApplicationReceipt({ ...receipt, status: "bogus" }, expectation), false);
  assert.equal(matchesAdmissionApplicationReceipt(receipt, { ...expectation, applicationVersion: 3 }), false);
  assert.equal(matchesAdmissionApplicationReceipt(receipt, { ...expectation, status: "pending_review" }), true);
  assert.equal(matchesAdmissionApplicationReceipt([], expectation), false);
  assert.equal(matchesAdmissionApplicationReceipt(null, expectation), false);
});

test("status card shows only non-approved application states", () => {
  const base = { actorId: "a1", applicationVersion: 1, eventId: "e1" };
  for (const status of ["pending_review", "rejected", "waitlisted", "withdrawn"]) {
    assert.equal(isStatusCardApplication({ ...base, status } as never), true, status);
  }
  assert.equal(isStatusCardApplication({ ...base, status: "approved" } as never), false);
  assert.equal(isStatusCardApplication(null), false);
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd /Users/li/work/orbit-web-newui-foundation-20260918/repos/orbits && node --test --import tsx tests/pages/event-registration-workspace-model.test.ts 2>&1 | tail -5
```
Expected: FAIL — module not found.

- [ ] **Step 4: Create the module by moving the code verbatim**

`app/(app)/app/events/[id]/register/registration-workspace-model.ts`:

```ts
import type { AdaptiveInterviewTurn } from "../../../../../../features/events/registration/adaptive-interview-service";
import type { EventParticipantProfileAnswers } from "../../../../../../features/events/registration/contract";
import {
  EVENT_ADMISSION_APPLICATION_STATUSES,
  type EventAdmissionApplication,
} from "../../../../../../features/events/admission/contract";

export type RegistrationLanguage = "en" | "zh";

export function registrationCopy(language: RegistrationLanguage, value: { en: string; zh: string }): string {
  return language === "en" ? value.en : value.zh;
}

export function registrationFieldLabel(
  language: RegistrationLanguage,
  field: AdaptiveInterviewTurn["field"],
): string {
  const labels: Record<AdaptiveInterviewTurn["field"], { en: string; zh: string }> = {
    desiredOutcome: { en: "Outcome", zh: "期待结果" },
    energyStyle: { en: "Social energy", zh: "社交能量" },
    experienceHighlight: { en: "Experience", zh: "经验亮点" },
    followUpPreference: { en: "Follow-up", zh: "后续方式" },
    industry: { en: "Industry", zh: "行业" },
    positioning: { en: "Positioning", zh: "定位" },
    targetAttendees: { en: "Who to meet", zh: "想认识" },
    valueOffered: { en: "What you offer", zh: "能提供" },
  };
  return registrationCopy(language, labels[field]);
}

export function answersFromTranscript(
  transcript: readonly AdaptiveInterviewTurn[],
): EventParticipantProfileAnswers {
  return Object.fromEntries(
    transcript.map((turn) => [turn.field, turn.answer]),
  ) as EventParticipantProfileAnswers;
}

export function transcriptFromAnswers(
  answers: EventParticipantProfileAnswers,
): AdaptiveInterviewTurn[] {
  return Object.entries(answers)
    .filter(
      (entry): entry is [AdaptiveInterviewTurn["field"], string] =>
        typeof entry[1] === "string" && entry[1].trim().length > 0,
    )
    .map(([field, answer]) => ({ answer, field, prompt: field }));
}

export type StatusCardApplication = EventAdmissionApplication & {
  status: "pending_review" | "rejected" | "waitlisted" | "withdrawn";
};

export type AdmissionApplicationReceiptExpectation = {
  actorId: string;
  applicationVersion?: number;
  eventId: string;
  status?: EventAdmissionApplication["status"];
};

function isAdmissionApplicationStatus(
  value: unknown,
): value is EventAdmissionApplication["status"] {
  return (
    typeof value === "string" &&
    (EVENT_ADMISSION_APPLICATION_STATUSES as readonly string[]).includes(value)
  );
}

export function matchesAdmissionApplicationReceipt(
  value: unknown,
  expectation: AdmissionApplicationReceiptExpectation,
): value is EventAdmissionApplication {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Partial<EventAdmissionApplication>;
  return (
    candidate.actorId === expectation.actorId &&
    candidate.eventId === expectation.eventId &&
    typeof candidate.applicationVersion === "number" &&
    Number.isSafeInteger(candidate.applicationVersion) &&
    candidate.applicationVersion >= 1 &&
    isAdmissionApplicationStatus(candidate.status) &&
    (expectation.applicationVersion === undefined ||
      candidate.applicationVersion === expectation.applicationVersion) &&
    (expectation.status === undefined || candidate.status === expectation.status)
  );
}

export function isStatusCardApplication(
  application: EventAdmissionApplication | null,
): application is StatusCardApplication {
  return Boolean(
    application &&
      ["pending_review", "rejected", "waitlisted", "withdrawn"].includes(
        application.status,
      ),
  );
}
```

In `event-registration-workspace.tsx`: delete lines 101–192 (the `copy`, `fieldLabel`, `answersFrom`, `transcriptFromAnswers`, `StatusCardApplication`, `AdmissionApplicationReceiptExpectation`, `isAdmissionApplicationStatus`, `matchesAdmissionApplicationReceipt`, `isStatusCardApplication` definitions) and the now-unused `EVENT_ADMISSION_APPLICATION_STATUSES` import; add

```ts
import {
  answersFromTranscript as answersFrom,
  isStatusCardApplication,
  matchesAdmissionApplicationReceipt,
  registrationCopy as copy,
  registrationFieldLabel as fieldLabel,
  transcriptFromAnswers,
  type StatusCardApplication,
} from "./registration-workspace-model";
```

(Aliases keep the 2,000-line body untouched. `Language` stays as a local type alias because it is used in props; leave it.)

- [ ] **Step 5: Run new + guard tests + typecheck**

```bash
cd /Users/li/work/orbit-web-newui-foundation-20260918/repos/orbits && node --test --import tsx tests/pages/event-registration-workspace-model.test.ts tests/pages/event-registration-workspace.test.tsx tests/pages/event-registration-readback.test.tsx tests/pages/app-event-registration-account-scope.test.tsx 2>&1 | tail -6 && npm run typecheck 2>&1 | tail -3
```
Expected: `# fail 0`; typecheck exits 0. If typecheck complains about an unused `StatusCardApplication` import, drop the type import.

- [ ] **Step 6: Graph check and commit**

```bash
cd /Users/li/work/orbit-web-newui-foundation-20260918 && node .gitnexus/run.cjs analyze --index-only >/dev/null && node .gitnexus/run.cjs detect-changes --scope all --repo . | head -40
```
Expected: no partial/truncated; affected limited to the workspace and its tests.

```bash
cd /Users/li/work/orbit-web-newui-foundation-20260918 && git add "repos/orbits/app/(app)/app/events/[id]/register/registration-workspace-model.ts" "repos/orbits/app/(app)/app/events/[id]/register/event-registration-workspace.tsx" repos/orbits/tests/pages/event-registration-workspace-model.test.ts && git commit -m "refactor(events): extract registration receipt and transcript model

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Profile save/merge model — `profile/profile-save-model.ts`

**Files:**
- Create: `app/(app)/app/profile/profile-save-model.ts`
- Modify: `app/(app)/app/profile/orbit-real-profile.tsx:844-878` (scope fields + validation), `:896-903` (conflict classification), `:929-966` (post-save merge), `:1031-1078` (reload merge)
- Test: `tests/pages/app-profile-save-model.test.ts`

**Interfaces:**
- Consumes: `OrbitProfileEditorView`, `ProfileEditorField`, `ProfileEditorSaveScope`, `ProfileEditorVisibleHandleKey`, `profileEditorHandlesWithVisibleDraft` from `./profile-editor-adapter`; `validateIndustrySelection` from `shared/domain/industries`.
- Produces:
  - `profileSaveScopeFields(scope): Set<ProfileEditorField>`
  - `type ProfileSaveValidation = { ok: true } | { ok: false; message: { en: string; zh: string } }`
  - `validateProfileSaveDraft({ profile, scope, scopeDirty }): ProfileSaveValidation`
  - `visibleCharacterCount(text: string): number`
  - `profileSaveFailureKind(status: number, errorCode: string | undefined): "conflict" | "error"`
  - `mergeProfilePreservingDraft({ latest, current, preserve, dirtyHandleFields }): OrbitProfileEditorView`
  - `emptyProfileAfterReload(current, onboarding): OrbitProfileEditorView`

- [ ] **Step 1: Run impact on the component and adapter helpers it uses**

```bash
cd /Users/li/work/orbit-web-newui-foundation-20260918
for s in OrbitRealProfile saveProfile reloadLatestProfile profileEditorHandlesWithVisibleDraft; do node .gitnexus/run.cjs impact "$s" --direction upstream --repo . | head -15; done
```
Expected: `OrbitRealProfile` consumed by `profile/page.tsx` and `profile/continue/page.tsx` plus tests; `saveProfile`/`reloadLatestProfile` are closures (likely UNKNOWN — confirm with grep that no other file references them). Report any HIGH.

- [ ] **Step 2: Write the failing test**

`tests/pages/app-profile-save-model.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import type { OrbitProfileEditorView, ProfileEditorField } from "../../app/(app)/app/profile/profile-editor-adapter";
import {
  emptyProfileAfterReload,
  mergeProfilePreservingDraft,
  profileSaveFailureKind,
  profileSaveScopeFields,
  validateProfileSaveDraft,
  visibleCharacterCount,
} from "../../app/(app)/app/profile/profile-save-model";

function profile(overrides: Partial<OrbitProfileEditorView> = {}): OrbitProfileEditorView {
  return {
    bio: "hello",
    birthDate: "1990-01-01",
    company: "Orbit",
    email: "a@example.com",
    expectedUpdatedAt: "2026-09-18T00:00:00.000Z",
    fullName: "Ari",
    handles: { lineId: "line-a", wechatId: "wx-a" },
    hasPersistedProfile: true,
    headline: "",
    industry: "",
    intro: "",
    lineId: "line-a",
    offering: ["intro"],
    onboarding: { missingFields: [], policyVersion: 1, status: "complete" },
    primaryIndustryId: "01",
    secondaryIndustryId: "0101",
    seeking: ["capital"],
    title: "CEO",
    topics: ["ai"],
    wechatName: "wx-a",
    ...overrides,
  } as OrbitProfileEditorView;
}

test("scope fields are disjoint between basic and matching", () => {
  const basic = profileSaveScopeFields("basic");
  const matching = profileSaveScopeFields("matching");
  assert.equal(basic.size, 8);
  assert.deepEqual([...matching].sort(), ["offering", "seeking", "topics"]);
  for (const field of matching) assert.equal(basic.has(field), false);
});

test("visibleCharacterCount counts graphemes, not UTF-16 units", () => {
  assert.equal(visibleCharacterCount("abc"), 3);
  assert.equal(visibleCharacterCount("👨‍👩‍👧"), 1);
  assert.equal(visibleCharacterCount("一句话介绍"), 5);
});

test("validateProfileSaveDraft enforces name, industry pair and 80-char bio for basic scope only", () => {
  const scopeDirty = new Set<ProfileEditorField>(["displayName"]);
  assert.deepEqual(validateProfileSaveDraft({ profile: profile(), scope: "basic", scopeDirty }), { ok: true });
  assert.equal(validateProfileSaveDraft({ profile: profile({ fullName: "  " }), scope: "basic", scopeDirty }).ok, false);
  assert.equal(validateProfileSaveDraft({ profile: profile({ secondaryIndustryId: undefined }), scope: "basic", scopeDirty }).ok, false);
  const longBio = profile({ bio: "x".repeat(81) });
  assert.equal(validateProfileSaveDraft({ profile: longBio, scope: "basic", scopeDirty: new Set(["bio"]) }).ok, false);
  assert.equal(validateProfileSaveDraft({ profile: longBio, scope: "basic", scopeDirty }).ok, true, "bio not dirty → not validated");
  assert.equal(validateProfileSaveDraft({ profile: profile({ fullName: "" }), scope: "matching", scopeDirty: new Set(["topics"]) }).ok, true);
});

test("profileSaveFailureKind treats 409 or PROFILE_VERSION_CONFLICT as conflict", () => {
  assert.equal(profileSaveFailureKind(409, undefined), "conflict");
  assert.equal(profileSaveFailureKind(400, "PROFILE_VERSION_CONFLICT"), "conflict");
  assert.equal(profileSaveFailureKind(500, "OTHER"), "error");
});

test("mergeProfilePreservingDraft keeps only the preserved dirty fields from the draft", () => {
  const latest = profile({ bio: "server", fullName: "Server Name", title: "CTO", topics: ["server"] });
  const current = profile({ bio: "draft", fullName: "Draft Name", title: "draft-title", topics: ["draft"] });
  const merged = mergeProfilePreservingDraft({
    current,
    dirtyHandleFields: new Set(),
    latest,
    preserve: new Set<ProfileEditorField>(["bio", "topics"]),
  });
  assert.equal(merged.bio, "draft");
  assert.deepEqual(merged.topics, ["draft"]);
  assert.equal(merged.fullName, "Server Name");
  assert.equal(merged.title, "CTO");
  assert.equal(merged.email, latest.email);
});

test("mergeProfilePreservingDraft merges visible handle drafts when handles are preserved", () => {
  const latest = profile({ handles: { lineId: "line-server", wechatId: "wx-server" }, lineId: "line-server", wechatName: "wx-server" });
  const current = profile({ handles: { lineId: "line-draft", wechatId: "wx-draft" }, lineId: "line-draft", wechatName: "wx-draft" });
  const merged = mergeProfilePreservingDraft({
    current,
    dirtyHandleFields: new Set(["lineId"]),
    latest,
    preserve: new Set<ProfileEditorField>(["handles"]),
  });
  assert.equal(merged.lineId, "line-draft");
  assert.equal(merged.wechatName, "wx-server");
});

test("emptyProfileAfterReload clears persisted fields but keeps email", () => {
  const onboarding = { missingFields: ["displayName"], policyVersion: 1 as const, status: "incomplete" as const };
  const empty = emptyProfileAfterReload(profile(), onboarding);
  assert.equal(empty.email, "a@example.com");
  assert.equal(empty.hasPersistedProfile, false);
  assert.equal(empty.expectedUpdatedAt, null);
  assert.equal(empty.fullName, "Ari", "display name is not cleared by reload");
  assert.deepEqual(empty.topics, []);
  assert.equal(empty.onboarding, onboarding);
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd /Users/li/work/orbit-web-newui-foundation-20260918/repos/orbits && node --test --import tsx tests/pages/app-profile-save-model.test.ts 2>&1 | tail -5
```
Expected: FAIL — module not found.

- [ ] **Step 4: Create the module**

`app/(app)/app/profile/profile-save-model.ts`:

```ts
import { validateIndustrySelection } from "../../../../shared/domain/industries";
import type { ProfilePayload } from "../../../../features/profile/contract";
import {
  profileEditorHandlesWithVisibleDraft,
  type OrbitProfileEditorView,
  type ProfileEditorField,
  type ProfileEditorSaveScope,
  type ProfileEditorVisibleHandleKey,
} from "./profile-editor-adapter";

const BASIC_SCOPE_FIELDS: readonly ProfileEditorField[] = [
  "bio", "birthDate", "displayName", "handles", "organization", "primaryIndustryId", "role", "secondaryIndustryId",
];
const MATCHING_SCOPE_FIELDS: readonly ProfileEditorField[] = ["offering", "seeking", "topics"];
const BIO_VISIBLE_LIMIT = 80;

export function profileSaveScopeFields(scope: ProfileEditorSaveScope): Set<ProfileEditorField> {
  return new Set(scope === "basic" ? BASIC_SCOPE_FIELDS : MATCHING_SCOPE_FIELDS);
}

export function visibleCharacterCount(text: string): number {
  const Segmenter = (Intl as unknown as {
    Segmenter?: new (locale?: string, options?: { granularity: "grapheme" }) => { segment(input: string): Iterable<unknown> };
  }).Segmenter;
  return Segmenter
    ? Array.from(new Segmenter(undefined, { granularity: "grapheme" }).segment(text)).length
    : Array.from(text).length;
}

export type ProfileSaveValidation =
  | { ok: true }
  | { ok: false; message: { en: string; zh: string } };

export function validateProfileSaveDraft(input: {
  profile: OrbitProfileEditorView;
  scope: ProfileEditorSaveScope;
  scopeDirty: ReadonlySet<ProfileEditorField>;
}): ProfileSaveValidation {
  const { profile, scope, scopeDirty } = input;
  if (scope !== "basic") return { ok: true };
  if (!profile.fullName.trim()) {
    return { ok: false, message: { en: "Add your name before saving the profile.", zh: "请填写姓名后再保存档案。" } };
  }
  if (!profile.primaryIndustryId || !profile.secondaryIndustryId || !validateIndustrySelection(profile).valid) {
    return { ok: false, message: { en: "Choose both industry levels before saving the basic profile.", zh: "保存基础资料前，请选择完整的一级和二级行业。" } };
  }
  if (scopeDirty.has("bio") && visibleCharacterCount(profile.bio.trim()) > BIO_VISIBLE_LIMIT) {
    return { ok: false, message: { en: "Keep the introduction within 80 visible characters.", zh: "一句话介绍不能超过 80 个可见字符。" } };
  }
  return { ok: true };
}

export function profileSaveFailureKind(status: number, errorCode: string | undefined): "conflict" | "error" {
  return status === 409 || errorCode === "PROFILE_VERSION_CONFLICT" ? "conflict" : "error";
}

export function mergeProfilePreservingDraft(input: {
  current: OrbitProfileEditorView;
  dirtyHandleFields: ReadonlySet<ProfileEditorVisibleHandleKey>;
  latest: OrbitProfileEditorView;
  preserve: ReadonlySet<ProfileEditorField>;
}): OrbitProfileEditorView {
  const { current, dirtyHandleFields, latest, preserve } = input;
  const mergedHandles = preserve.has("handles")
    ? profileEditorHandlesWithVisibleDraft(latest, current, dirtyHandleFields)
    : latest.handles;
  return {
    ...latest,
    bio: preserve.has("bio") ? current.bio : latest.bio,
    birthDate: preserve.has("birthDate") ? current.birthDate : latest.birthDate,
    company: preserve.has("organization") ? current.company : latest.company,
    fullName: preserve.has("displayName") ? current.fullName : latest.fullName,
    handles: mergedHandles,
    offering: preserve.has("offering") ? current.offering : latest.offering,
    primaryIndustryId: preserve.has("primaryIndustryId") ? current.primaryIndustryId : latest.primaryIndustryId,
    secondaryIndustryId: preserve.has("secondaryIndustryId") ? current.secondaryIndustryId : latest.secondaryIndustryId,
    seeking: preserve.has("seeking") ? current.seeking : latest.seeking,
    title: preserve.has("role") ? current.title : latest.title,
    topics: preserve.has("topics") ? current.topics : latest.topics,
    wechatName: preserve.has("handles") ? mergedHandles?.wechatId ?? "" : latest.wechatName,
    lineId: preserve.has("handles") ? mergedHandles?.lineId ?? "" : latest.lineId,
    email: latest.email,
  };
}

export function emptyProfileAfterReload(
  current: OrbitProfileEditorView,
  onboarding: NonNullable<ProfilePayload["onboarding"]>,
): OrbitProfileEditorView {
  return {
    ...current,
    bio: "",
    birthDate: null,
    company: "",
    email: current.email,
    expectedUpdatedAt: null,
    handles: undefined,
    hasPersistedProfile: false,
    headline: "",
    industry: "",
    intro: "",
    lineId: "",
    offering: [],
    onboarding,
    primaryIndustryId: undefined,
    secondaryIndustryId: undefined,
    seeking: [],
    title: "",
    topics: [],
    wechatName: "",
  };
}
```

Then in `orbit-real-profile.tsx`:

(a) import:
```ts
import {
  emptyProfileAfterReload,
  mergeProfilePreservingDraft,
  profileSaveFailureKind,
  profileSaveScopeFields,
  validateProfileSaveDraft,
} from "./profile-save-model";
```
and drop `validateIndustrySelection` from the `shared/domain/industries` import **only if** it is no longer referenced elsewhere in the file (grep first; `EditSections` may use it).

(b) In `saveProfile`, replace lines 846–848 with `const scopeFields = profileSaveScopeFields(scope);` and lines 856–878 (the `if (scope === "basic") { ... }` validation block) with:
```ts
const validation = validateProfileSaveDraft({ profile, scope, scopeDirty });
if (!validation.ok) {
  setMessageKind("error");
  setMessage(t(validation.message));
  return;
}
```

(c) Replace `if (response.status === 409 || envelope.error?.code === "PROFILE_VERSION_CONFLICT") {` with `if (profileSaveFailureKind(response.status, envelope.error?.code) === "conflict") {`.

(d) Replace the post-save `setProfile(current => { const serverProfile = ...; const preserve = ...; const mergedHandles = ...; return {...}; })` block (lines 929–966) with:
```ts
setProfile(current => mergeProfilePreservingDraft({
  current,
  dirtyHandleFields: dirtyHandleFieldsAtSave,
  latest: profileEditorViewFromPayload(current, readback.data!),
  preserve: new Set([...dirtyFields].filter(field => !scopeFields.has(field))),
}));
```

(e) In `reloadLatestProfile`, replace the `setProfile(current => { const latest = ...; const mergedHandles = ...; return {...}; })` block (lines 1031–1078) with:
```ts
setProfile(current => mergeProfilePreservingDraft({
  current,
  dirtyHandleFields: dirtyHandleFieldsAtReload,
  latest: envelope.data!.profile
    ? profileEditorViewFromPayload(current, envelope.data!)
    : emptyProfileAfterReload(current, envelope.data!.onboarding!),
  preserve: dirtyAtReload,
}));
```

- [ ] **Step 5: Run new + guard tests + typecheck**

```bash
cd /Users/li/work/orbit-web-newui-foundation-20260918/repos/orbits && node --test --import tsx tests/pages/app-profile-save-model.test.ts tests/pages/app-profile-editor-failure-paths.test.tsx tests/pages/app-profile-onboarding-editor.test.tsx tests/pages/secondary-industry-editors.test.tsx 2>&1 | tail -6 && npm run typecheck 2>&1 | tail -3
```
Expected: `# fail 0`; typecheck exits 0. The failure-path tests exercise 409 → reconcile → reload → save; they are the behavior guard for (c)–(e).

- [ ] **Step 6: Graph check and commit**

```bash
cd /Users/li/work/orbit-web-newui-foundation-20260918 && node .gitnexus/run.cjs analyze --index-only >/dev/null && node .gitnexus/run.cjs detect-changes --scope all --repo . | head -40
```
Expected: no partial/truncated; affected limited to `orbit-real-profile.tsx`, the new module and tests. `OrbitRealProfile` consumers (`profile/page.tsx`, `profile/continue/page.tsx`) appear as upstream — that is expected, not a regression.

```bash
cd /Users/li/work/orbit-web-newui-foundation-20260918 && git add "repos/orbits/app/(app)/app/profile/profile-save-model.ts" "repos/orbits/app/(app)/app/profile/orbit-real-profile.tsx" repos/orbits/tests/pages/app-profile-save-model.test.ts && git commit -m "refactor(profile): extract save validation and draft-preserving merge model

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Full guard run, ledger entry, interface-table update

**Files:**
- Modify: `/Users/li/work/orbit/docs/development/2026-09-17-web/NEW-UI-INTERFACE-TABLE.md` (§二 rows → point at the new modules)
- Modify: `/Users/li/work/orbit/docs/development/2026-09-17-web/EXECUTION.md` (append one line under `### 本轮追加批准与实际进展`)

- [ ] **Step 1: Re-run the eight guard tests from Task 0 Step 4 plus the three new tests**

```bash
cd /Users/li/work/orbit-web-newui-foundation-20260918/repos/orbits && node --test --import tsx \
  tests/pages/app-events-explore-model.test.ts tests/pages/event-registration-workspace-model.test.ts tests/pages/app-profile-save-model.test.ts \
  tests/pages/app-events-registration-state.test.ts tests/pages/app-events-view-switcher.test.ts \
  tests/pages/event-registration-workspace.test.tsx tests/pages/event-registration-readback.test.tsx tests/pages/app-event-registration-account-scope.test.tsx \
  tests/pages/app-profile-editor-failure-paths.test.tsx tests/pages/app-profile-onboarding-editor.test.tsx tests/pages/secondary-industry-editors.test.tsx 2>&1 | tail -8
```
Expected: `# fail 0`, `# pass` = Task 0 baseline + number of new tests (4 + 4 + 7 = 15).

- [ ] **Step 2: Compare against main**

```bash
cd /Users/li/work/orbit-web-newui-foundation-20260918 && node .gitnexus/run.cjs detect-changes --scope compare --base-ref 1f492f49 --repo . | head -60
```
Expected: three new files, three modified components, three new tests; no `partial`/`truncated`.

- [ ] **Step 3: Update the interface table §二**

In `NEW-UI-INTERFACE-TABLE.md`, change the four rows:

| 能力 | 现在在哪 | 新 UI 用 |
| --- | --- | --- |
| 探索页筛选/话题/scope | `events/explore-model.ts`（`newui/foundation-batch-1`） | `matchesExploreFilters`、`exploreTopicFilters`、`eventScopeFromValues`、`eventCardActionKind` |
| 报名回执核对/转写 | `events/[id]/register/registration-workspace-model.ts` | `matchesAdmissionApplicationReceipt`、`isStatusCardApplication`、`answersFromTranscript`、`transcriptFromAnswers` |
| 资料保存校验/冲突/草稿合并 | `profile/profile-save-model.ts` | `validateProfileSaveDraft`、`profileSaveFailureKind`、`mergeProfilePreservingDraft`、`emptyProfileAfterReload` |
| Reload/Save 会话编排（epoch、in-flight、fetch） | 仍在 `orbit-real-profile.tsx` | 批次 2 抽 hook |

- [ ] **Step 4: Append the ledger line**

Append to `EXECUTION.md` under `### 本轮追加批准与实际进展`:

```
- 新 UI 基础批次 1（主代理自派，分支`newui/foundation-batch-1`，父1f492f49）：探索页/报名工作区/资料页三个纯模型抽取，各带独立单测，8 个既有页面测试与全 typecheck 通过，detect-changes 全量与 compare 无 partial。零行为变化、未接新 UI、未部署。边界决定见 NEW-UI-DECISION.md。
```

- [ ] **Step 5: Commit docs in the main dir is the user's call** — the coordination docs in `/Users/li/work/orbit` are uncommitted user files; leave them uncommitted and report.

---

## Self-Review

- **Spec coverage:** interface table §二 lists five page-coupled items. Batch 1 covers three (explore, registration receipt helpers, profile save/merge). The other two — Reload/Save *orchestration* hook and registration readback *hook* — are explicitly Batch 2 (decision record + Task 4 table row). Name-card V2 view is already model/view split and needs no extraction.
- **Placeholder scan:** the one "⬇ move … verbatim" note in Task 1 Step 4 refers to two constants (`TOPIC_LABELS_ZH`, `INTERNAL_TOPIC`) whose full bodies live at `orbit-real-explore-client.tsx` just above line 128; the implementer copies them unchanged. No TBD/TODO.
- **Type consistency:** `EventScope` exported from `explore-model.ts` and re-imported by the client; `ProfileEditorField`/`ProfileEditorSaveScope`/`ProfileEditorVisibleHandleKey` come from `profile-editor-adapter.ts` in both Task 3 module and test; `registrationCopy`/`registrationFieldLabel` are aliased back to `copy`/`fieldLabel` inside the workspace so the untouched body compiles.

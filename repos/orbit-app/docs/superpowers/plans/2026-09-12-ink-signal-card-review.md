# Ink Signal Card Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the selected card-import visual hierarchy to all three existing card-review flows, retaining actual images, editable fields, risk acknowledgement and duplicate handling.

**Architecture:** Keep each screen's HTTP/permission/picker state machine. Restyle the shared batch review form and the single-card presentation with local styles. Show the current review before secondary acquisition/batch management content. Preserve every existing destination and action.

**Tech Stack:** Existing Expo/RNW, Ionicons/theme, Node/esbuild/Playwright.

**Spec:** `docs/designs/2026-09-12-ink-signal/README.md`; exact `3a-名片导入.png`, source HTML lines 77–90.

## Global Constraints

- Approved in-place and inline execution, existing design and browser QA approvals reused. App-only; no Web/backend, contract copy, dependency, real data, commit or deployment changes.
- Source: 48pt fixed secondary header, 16pt canvas inset, 104pt image preview with 12pt radius/border and contain fit, 15/800 review section, 72pt field labels, 14pt values, open separators, 50pt primary and at least 46pt secondary actions. Grow/reflow at large font scale; no clipped data or scaled-down text.
- Real selected/loaded images only. Explicit image loading/unavailable/none state. No generated sample business card in production, no made-up workspace, field confirmation count, risk explanation or unchecked merge operation.
- Existing seven batch fields and all single-card fields/metadata remain. Batch duplicate review continues to mean separate creation with explicit second consent, not merge. Single-card supported merge suggestions remain where they currently exist.
- Preserve background/identity/selection epochs, draft retention, risk checks, request bodies and write confirmation boundaries.
- GitNexus LOW: shared form 2 direct consumers/3 total, associated legacy entry has 2 process memberships; private ReviewButton 1 direct/4 total; its style factory 2 direct/5 total. Single review components each have one direct caller and affect the acquisition entry's 5 process memberships. IngestContent has 1 direct screen caller. No shared AppScreen/VM/API edits.
- Final full-package Simulator acceptance remains mandatory and separate from RNW results.

### Task 1: Shared batch review and real screens

**Files:** Modify `src/components/BusinessCardBatchReviewForm.tsx`, `src/screens/contacts/BusinessCardBatchScreen.tsx`, `src/screens/contacts/BusinessCardIngestScreen.tsx`; create `tests/ink-signal-card-review.test.ts`.

**Interfaces:** Preserve `BusinessCardBatchReviewFormProps`. Private ReviewButton may accept `primary?: boolean`; existing callbacks remain unchanged. `useWindowDimensions().fontScale` controls row-to-column reflow only.

- [x] Write real form/screens tests for source-sized image before open fields, ink primary action, actual warnings and no fabricated confirmations. Watch source visual RED before editing.

```ts
assert.equal((await page.getByRole('img', { name: '名片图片' }).boundingBox())!.height, 104);
assert.equal(await page.getByLabel('姓名', { exact: true }).evaluate(el => getComputedStyle(el).borderWidth), '0px');
assert.equal(await page.getByRole('button', { name: '确认收录', exact: true }).evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(11, 18, 32)');
```

- [x] Implement image-first form, open editable rows and source action hierarchy; only the primary uses ink fill. Put the selected review before batch-management rows, retain all selectors and controls. All three review screens use title 名片导入 without duplicate eyebrow.

```tsx
<TextInput accessibilityLabel={label} value={fields[field]} editable={!disabled}
  style={[styles.input, large && styles.inputLarge]} onChangeText={value => { if (!disabled) props.onChange({ ...fields, [field]: value }); }} />
<ReviewButton primary label="确认收录" icon="checkmark-outline" disabled={disabled || !props.canConfirm || Boolean(props.duplicateContactId)} onPress={props.onConfirm} />
```

- [x] Run both existing batch-interaction suites, VMs, image and risk suites with the new tests. Assert exact edited payload, duplicate-review gating, no initial write, image unavailable/retry, loading/terminal/failed/manual-entry and unchanged selection flows.

```sh
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/ink-signal-card-review.test.ts tests/business-card-batch-interactions.test.ts tests/business-card-ingest-interactions.test.ts tests/business-card-batch-view-model.test.ts tests/business-card-ingest-view-model.test.ts tests/batch-images.test.ts tests/business-card-review-risks.test.ts
```

### Task 2: Single-card review and complete QA

**Files:** Modify `src/screens/contacts/ContactAcquisitionScreen.tsx`; same new test; create `docs/designs/2026-09-12-ink-signal/2026-09-12-card-review-qa.md`, update design README and `design-qa.md`.

**Interfaces:** Add only private presentation props/state for the successful scan's image, captured from the submitted form and cleared for non-image sources. Keep review/write/merge request builders unchanged. Add a local card-review style factory, not broad changes to shared acquisition styles.

- [x] Add failing real acquisition tests for labelled open review fields and review-before-secondary-content order; native picker and API boundaries controlled, component/VM/theme actual. Assert edited field value, preserved confidence/risk text, final acknowledgement reset and no contact write before explicit review.

```ts
await page.getByRole('button', { name: '选图片', exact: true }).click();
await page.getByRole('button', { name: '生成待确认候选', exact: true }).click();
await page.getByLabel('邮箱', { exact: true }).fill('correct@example.invalid');
assert.equal(await page.getByRole('button', { name: '写入联系人', exact: true }).isDisabled(), true);
```

- [x] Implement minimum single-review visual changes. Source entries and rescan remain reachable below the selected result. Keep risk checkboxes, saved-field candidate semantics, actual source/evidence and successful write link. Do not turn partial review into a fake 4/5 counter.

- [x] Test/capture 390×844 at 2× plus 320pt 1.6×/2× and 820pt dark: all fields editable and fully readable, warnings and controls inside viewport, no horizontal overflow; top/middle/bottom, image failure/loading, duplicate, disabled and failed-save states.

```ts
for (const control of await page.getByRole('button').all()) {
  await control.scrollIntoViewIfNeeded();
  const box = await control.boundingBox();
  assert.ok(box && box.height >= 44 && box.x >= 0 && box.x + box.width <= width);
}
```

- [x] Open exact source/latest equal-state screenshots, run design-qa on five fidelity surfaces, fix P0/P1/P2 test-first. Run final targeted tests/typecheck/diff; independent read-only review. Record deliberate functionality differences and native/live-write limitations; run consolidated full regression.
- [ ] Complete the separate full-package Simulator acceptance. Current findings remain in `docs/designs/2026-09-12-ink-signal/2026-09-12-native-status.md`; RNW completion does not close this gate.

Local result: new card tests 28; post-review focused set 80/80; independent review APPROVE. Current consolidated regression 2188/2188 and typecheck exit 0. Visual evidence and iteration history: `docs/designs/2026-09-12-ink-signal/2026-09-12-card-review-qa.md`.

Self-review: all actual fields/actions and real images retained; source visual mapping does not invent field-level approval semantics or destinations. Local-only production changes in four files; no new route or server capability required. No unrequested integration.

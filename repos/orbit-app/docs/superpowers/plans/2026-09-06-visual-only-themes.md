# Orbit Visual-Only Themes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved single Orbit visual system in light and dark appearances without changing copy, actions, routing, data, or page logic.

**Architecture:** Retain React Native, existing components and Ionicons. Add immutable light/dark palettes and a hook driven by the system appearance; consume cached themed styles in the existing render components. Limit layout refinements to the six approved surfaces; other screens receive theme compatibility only, so navigating away does not reveal a light-only page.

**Tech Stack:** Expo 57, React 19, React Native, TypeScript, node:test, react-native-web rendering tests, native iOS Simulator.

**Spec:** `../../../../../docs/designs/orbit-app/visual-system/2026-09-06-unified-light-dark/visual-only/README.md` and its four PNGs. Repository-root relative spec location: `docs/designs/orbit-app/visual-system/2026-09-06-unified-light-dark/visual-only/`.

## Global Constraints

- Edit application implementation only inside `repos/orbit-app`.
- Only palette, control shape, spacing/alignment and local layout may change. No added/removed buttons, tabs, destinations, fields, copy or data.
- Preserve existing date formatters and images; generated-image text/date/photographic errors are not implementation requirements.
- Preserve all event handlers, API requests, auth boundaries, loading/empty/error states, list keys and chart geometry.
- No new appearance-setting control; follow the system, including live changes without remounting page state.
- Existing touch targets remain at least their current size; visible controls should meet the 44pt baseline.
- Run per-symbol upstream impact analysis before editing. Report high/critical risk. Refresh the stale GitNexus index before relying on its results.
- No dependency upgrades, backend edits, deployment or commit is required. Preserve pre-existing untracked design artifacts.
- Baseline: `npm test` 730 passed, 0 failed; `npm run typecheck` passed on 2026-09-06.

### Task 1: Theme foundation and rendered contrast

**Files:**
- Modify `src/design/tokens.ts`: two complete palettes, geometry tokens, reduced shadow.
- Create `src/design/theme.ts`: `useOrbitTheme`, `createThemedStyles`.
- Modify `tests/design-tokens.test.ts`; create `tests/theme-render.test.tsx`.

**Interfaces:** `OrbitColorScheme = "light" | "dark"`; `OrbitColors` has the existing color keys plus any required fixed-image foreground token. `createThemedStyles<T>((colors: OrbitColors) => T)` returns a hook yielding `{ colors, styles }`. Palette values are immutable; rendered styles are cached separately by appearance.

- [x] Write tests that render a real themed surface and primary control in both appearances, assert readable foreground/background contrast, and verify both appearances preserve text and controls. Include a system-null appearance fallback and light/dark cache isolation.
- [x] Run `node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/theme-render.test.tsx tests/design-tokens.test.ts` and observe the missing theme behavior fail.
- [x] Implement `useOrbitTheme()` with the existing `useColorScheme()` API. Use a light fallback and immutable palette objects; never mutate imported globals or remount children using a theme key. No provider is necessary because the system appearance is the only production source of truth.

```tsx
const useStyles = createThemedStyles((colors) => StyleSheet.create({
  surface: { backgroundColor: colors.surface },
  label: { color: colors.text }
}));
function Surface() {
  const { styles } = useStyles();
  return <View style={styles.surface}><Text style={styles.label}>Orbit</Text></View>;
}
```

- [x] Verify the tests pass; check body/secondary/action text contrast on actual paired palette colors, not just individual hex constants.

### Task 2: System appearance throughout the existing application

**Files:** `app/_layout.tsx`, `app.config.ts`, existing `src/components/*.tsx` and `src/screens/**/*.tsx` importing `design/tokens`; native `ios/Orbit/Info.plist` only if the checked-out native project is used for verification.

**Interfaces:** Components retain their existing props. Add a local `useStyles()`/`useOrbitTheme()` call before any early return. Pure local visual helpers accept `OrbitColors` (or the existing stylesheet type) as an explicit parameter; do not put hooks in loops, callbacks, event handlers or non-component helpers.

- [x] Inventory and run upstream impact on each edited function and the shared tokens; review direct callers and process risks.
- [x] Add rendering regression coverage around existing `DataCard`, state components and charts: both themes render identical semantic content; error and disabled states remain distinct/readable.
- [x] Replace static palette reads with themed reads while preserving JSX content, handlers and layout. Keep photo-overlay foregrounds permanently white rather than reusing a primary-button foreground that changes in dark mode.
- [x] Set native status-bar style from appearance and opt the Expo/iOS configuration into automatic appearance. Theme the navigation-stack background only; retain the provider hierarchy, every navigation option and route.
- [x] Run full `npm test` and `npm run typecheck`. Review the mechanical diff for unchanged API calls, hooks and handlers.

### Task 3: Apply the approved local geometry

**Files:** `src/components/AppScreen.tsx`, `src/components/DataCard.tsx`, `src/screens/ai/AiScreen.tsx`, `src/screens/ai/OrbitNextActions.tsx`, `src/screens/today/TodayScreen.tsx`, `src/screens/inbox/RelationshipInboxScreen.tsx`, `src/screens/events/EventsScreen.tsx`, `src/screens/contacts/ContactsDashboardScreen.tsx`.

- [x] Preserve the six-surface control inventories from the approved screenshot references: AI hamburger/history/composer; drawer three entries; Today task/calendar actions; inbox four metrics/two tabs/new-message/search; events four filters/two recommendation actions; analysis three sections/four dimensions/unchanged ring/detail action.
- [x] Verify four inbox metrics fit a shared row without losing labels or values using native screenshot and accessibility coordinates; preserve labels and selected states. Plan adjustment: avoid exporting/restructuring internal components solely for tests. Use rendered tests for theme-aware cards, states and charts, and native interaction evidence for input/selection persistence.
- [x] Set shared control radius 12, input radius 14, card radius 16; retain true circles for avatars, completion marks and chart dots. Reduce card shadows and borders. Align the AI composer, header controls and drawer rows to the approved soft rectangular treatments.
- [x] Flatten only the inbox metric boxes into a compact strip and adjust local spacing; do not remove wrappers that carry actions or semantic state.
- [x] Run focused rendering tests, full test suite, typecheck and `git diff --check`.

### Task 4: Native verification and handoff

**Files:** `.tmp/visual-qa/2026-09-06-themes/` (uncommitted evidence), `design-qa.md` (append current report while preserving history).

- [x] Boot an existing iPhone Simulator, run the current app, and capture all six approved surfaces in both appearances. Use existing fixture/session workflows; do not invent product data or bypass auth.
- [x] Switch system appearance while a page is open and confirm that theme updates without dropping input, selection or navigation state. Test drawer navigation, inbox tab/search and chart selection without sending messages or modifying user data.
- [x] Compare source board crops and native captures together, normalizing native density and excluding OS chrome. Native runtime geometry and existing product text take priority over raster errors.
- [x] Record and fix P0/P1/P2 visual issues, then recapture; stop cosmetic iteration after two correction rounds and surface any remaining blocker honestly.
- [x] Run final full tests, typecheck, diff check and GitNexus change detection. Record exact result counts and any unavailable verification.
- [x] Append a evidence-backed `design-qa.md` result and deliver local changes without committing or publishing.

## Completion evidence

- `npm test`: 738 passed, 0 failed; `npm run typecheck` and `git diff --check` passed.
- iOS native build succeeded with 0 errors / 0 warnings; six surfaces captured in both system appearances. Draft, search, filter and chart state survive live changes.
- Full comparison and correction history: `../../../design-qa.md`, 2026-09-06 entry. Native captures live in ignored `.tmp/visual-qa/2026-09-06-themes/`.
- GitNexus final verification uses `/Users/xzhao/Projects/orbit`, not ambiguous `orbit` aliases. Shared-component scope remains CRITICAL, as reported; independent review found no business/routing/control-inventory changes.
- Limits: no live recommended event currently available; no claim of all-platform/all-viewport or complete VoiceOver verification. No commit or publishing.

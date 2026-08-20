# Orbit iOS Ten-Loop Polish Design

## Goal

Improve the existing Orbit iOS app through ten evidence-driven review and implementation loops without changing its established visual language, primary navigation, or product boundaries.

## Product Boundary

- Scope is `repos/orbit-app` and the iOS-facing API behavior required by it.
- Web UI is out of scope.
- Existing color tokens, icon family, radii, blur treatment, typography hierarchy, drawer model, and route structure remain the visual source of truth.
- Existing uncommitted work is preserved. Each loop stages only its own files or hunks.
- A loop is complete only with a failing regression test, a minimal implementation, passing focused tests, and simulator evidence when the change is visible.

## Baseline Evidence

The iPhone 17 Pro simulator review and the 625-test baseline identified these concrete issues:

1. Activity discovery controls render after the full image list, more than 4,000 points below the first viewport.
2. Long activity and inbox surfaces eagerly render content far outside the viewport.
3. The relationship inbox renders a selected conversation below the complete conversation list instead of opening the existing detail route.
4. The schedule reports zero upcoming events while the activity surface shows upcoming public events.
5. The profile first viewport shows `agenthubs`, English generated metadata, and extraction tools before the public profile editor.
6. Several native controls expose icon-font glyphs in VoiceOver labels or have no explicit input label.
7. The Orbit AI composer uses 34-point icon targets even though the app's established touch baseline is 44 points.
8. Multiple screens can request the same GET resource concurrently without sharing the in-flight request.
9. Long form screens do not consistently dismiss the keyboard interactively or preserve taps while the keyboard is open.
10. Data-heavy relationship surfaces expose internal audit detail before user-facing relationship actions.

## Ten Loops

### Loop 1: Request Efficiency

Coalesce identical concurrent GET requests by base URL, auth session, path, and headers. Mutations remain independent. The cache stores only in-flight promises and removes them after settlement, so no stale response cache is introduced.

### Loop 2: Native Screen Ergonomics

Apply iOS keyboard inset adjustment, interactive dismissal, and handled-tap behavior through `AppScreen`. Preserve all existing spacing and scroll visuals.

### Loop 3: Orbit AI Controls

Bring composer icon targets to the established 44-point minimum, preserve the current composer shape, and remove icon glyphs from combined accessibility labels.

### Loop 4: Activity Discovery

Place search and status controls before the image list. Render an initial bounded set and expose a clear, reversible “show more” action. Keep the image-first cards and the existing operations-center entry.

### Loop 5: Contact Navigation

Keep graph and dashboard as the contact overview, but improve the deeper contact-library entry and contact cards with explicit accessible labels and stable avatar presentation.

### Loop 6: Inbox Conversation Flow

Open a selected relationship conversation in the existing detail route. The inbox remains a searchable list and pending-work surface; thread reading and drafting live on the dedicated screen.

### Loop 7: Schedule Data Connection

Use the public activity collection for discoverable upcoming events while keeping private tasks authenticated. Verify that upcoming activity modules appear before the full timeline.

### Loop 8: Public Profile Priority

Prefer the validated session identity for the displayed owner, put the public profile editor before extraction tools, and keep extraction as an optional review workflow. Do not fabricate missing biography data in the client.

### Loop 9: Accessibility Consistency

Add explicit labels and selected states to visible search, filter, card, and form controls touched by the prior loops. Decorative icons must not become spoken private-use glyphs.

### Loop 10: Final Product Pass

Re-run every primary route on the iPhone 17 Pro simulator, compare before/after screenshots, remove internal-first content from the first viewport where it blocks user action, and fix only regressions proven by the final pass.

## Verification

- `npm run typecheck` in `repos/orbit-app`.
- `npm test` in `repos/orbit-app`.
- Focused Node tests for each loop before the full suite.
- `idb ui describe-all` for target size, accessible names, and route state.
- `xcrun simctl io ... screenshot` for accepted before/after screenshots under the ignored QA artifact directory.
- `gitnexus_detect_changes(scope: staged)` before every commit.

## Non-Goals

- No new visual theme, bottom-tab navigation, backend domain redesign, or replacement of Expo Router.
- No speculative features, new analytics stack, animation system, or third-party UI kit.
- No changes to Web App presentation.

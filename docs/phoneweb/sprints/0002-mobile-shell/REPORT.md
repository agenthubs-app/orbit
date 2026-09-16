# PW-0002 Generator report

## Run identity

- Owner: `phoneweb-B`
- Run: `run-01`
- Baseline: `decd5005c9d88a02b59e7dd28403788886534172`
- Planner SHA-256: `4e2114e39494f6386fc2fc4c93886a66547e1f18eb0cc733fedffeb6c1e7fb15`
- Delivery: this report's fixed detached-HEAD commit; the SHA is sent in the coordinator handoff.

## Delivered scope

- Added a Web `VisualViewport` adapter while keeping the native `Keyboard` path in a platform-specific default module.
- Applied visible-height bounds to `AppScreen` and `AiConversationScreen`; Web no longer applies native `KeyboardAvoidingView` behavior.
- Kept the five-entry `OrbitTabBar` outside scrolling content and hides it only for a credible software keyboard: narrow touch viewport, focused editable element, unzoomed scale, and a material height loss from the stable pre-keyboard baseline.
- Added `app/+html.tsx` with `viewport-fit=cover`, `interactive-widget=resizes-content`, and dynamic viewport root sizing.
- Added SSR-safe initialization so static export does not read `window`, `document`, or `navigator` during Node prerender.

## Success criteria and evidence

- SC01: five tabs and order passed the shell suite; 320/360/390/430 layouts keep the bar in bounds and outside scroll content.
- SC02: controlled `VisualViewport` tests cover keyboard open/restore, `resizes-content`, draft retention, and desktop resize. Real mobile browser keyboard behavior remains an integration/device check.
- SC03: viewport resize/scroll, window resize/orientation, focus, and native Keyboard listeners have paired cleanup. Pinch zoom is explicitly excluded by `scale`.
- SC04: controlled RNW screenshots were inspected at `/tmp/orbit-phoneweb-pw0002-shell-{360,390,430}.png`; AI conversation screenshots at 320/390/dark retained the composer and readable content. These are not physical-device evidence.
- SC05: native behavior remains in `use-mobile-viewport.ts`; native Keyboard regression tests and TypeScript pass. No Simulator/native build was run.

## Verification

- `npm run typecheck`: pass.
- `tests/ink-signal-shell.test.ts`: `21/21` pass.
- `tests/ink-signal-ai-conversation.test.ts`: `88/88` pass.
- Full `npm test` with the coordinator worktree's installed `next` on `NODE_PATH`: `2960/2962` pass. Both failures are existing route-list fixture omissions for `inbox/sources/[id].tsx`, covered by mainline commit `0f9f2194d`; this run did not copy or relax that unrelated fix. Log: `/tmp/orbit-phoneweb-pw0002-app-test.log`.
- `git diff --check`: pass.

## Remaining integration checks

- Run the production Expo static export on the integrated tree after A's `web.output=static` and Web storage/hydration changes land. The isolated B tree does not own that config.
- Exercise input focus and keyboard dismissal in real mobile Safari and Chrome; controlled browser viewport events prove classification logic, not vendor keyboard behavior.
- Run GitNexus `detect_changes` on the same frozen patch in the registered `phoneweb-main` integration tree. The B temporary worktree is not registered, and the coordinator explicitly owns this audit rather than another full index.
- No merge, push, publish, account mutation, Simulator operation, or foreign-port process was performed.

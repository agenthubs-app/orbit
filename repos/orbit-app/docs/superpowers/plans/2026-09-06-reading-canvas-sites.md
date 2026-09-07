# Reading Canvas Sites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the selected Reading Canvas as an interactive, private Sites mobile prototype.

**Architecture:** A self-contained mobile-app template under the approved prototype directory. The protected phone/keyboard/scroll runtime stays intact. The app uses local React state for fictional conversations, result details, feedback and composer interactions; no production APIs or storage.

**Tech Stack:** Existing mobile-app React/TypeScript/Vite template, outline icon library, Playwright, bundled Sites Worker.

**Spec:** `docs/superpowers/specs/2026-09-06-reading-canvas-sites-design.md` (user approved).

## Global Constraints

- Project: `repos/orbit-app/prototypes/reading-canvas-sites/`; preserve pre-existing worktree changes. No commit, push or native App edits.
- Visual truth: `docs/designs/2026-09-06-chat-ui/reading-canvas.png`, 851 × 1849px.
- Accent `#006DB8`, pale background `#EDF8FF`, text `#20242C`, muted `#626874`; quote prompts and open long-answer reading layout.
- Use template `MobileScroll`, `KeyboardTextarea`, `useKeyboardInsets`, `BottomSheet`; do not edit protected runtime files or lock hashes.
- All conversations and event data are fictional and memory-only. File selection displays names only; no upload or file reads.
- Playwright approval and written spec approval are recorded; do not ask again. Private Sites only; report a privacy/hosting gap rather than publishing publicly.

### Task 1: Template and observable conversation behavior

**Files:** Create the approved prototype from the bundled template; add `tests/reading-canvas.spec.ts`; replace only `src/Prototype.tsx`; app-specific CSS in `src/prototype.css`.

**Interfaces:** `Prototype()` is the existing template entry. Local message records have `id`, `role`, `text`, optional `event`, `revision`; local feedback maps message IDs to `up` or `down`. No cross-project imports.

- [x] Bootstrap and baseline:

```sh
node /Volumes/ORICO/Dev/MacMovedData/dot-codex/plugins/cache/openai-curated-remote/product-design/0.1.53/scripts/bootstrap-prototype.mjs --template mobile-app --dest /Users/xzhao/Projects/orbit/repos/orbit-app/prototypes/reading-canvas-sites
npm ci --prefer-offline --no-audit --no-fund
npm run check:runtime
npm run build
npm run test:sites
```

- [x] Start `npm run dev -- --host 127.0.0.1 --port 4173 --strictPort`, inspect blank template in authorized Playwright and run the template runtime suite. Diagnose baseline failures before dependent work.
- [x] Add real-browser tests and observe expected failure against the blank canvas. Core send test:

```ts
test('sending appends one prompt and an assistant reply', async ({ page }) => {
  await page.goto('/');
  const input = page.getByRole('textbox', { name: '继续聊聊' });
  await expect(page.getByRole('button', { name: '发送消息', exact: true })).toBeDisabled();
  await input.fill('怎样开场聊合作？');
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect(page.locator('[data-message-role="user"]').filter({ hasText: '怎样开场聊合作？' })).toHaveCount(1);
  await expect(page.getByRole('status')).toContainText('正在整理');
  await expect(page.locator('[data-message-role="assistant"]').last()).toContainText('你正在做的产品');
  await expect(input).toHaveValue('');
});
```

- [x] Include assertions for blank/whitespace input, composing Enter, duplicate send while pending, detail close preserving draft, mutual-exclusive feedback, copy success/failure, regenerating only the target message, reset cancel/confirm and file-name-only attachment removal.
- [x] Run upstream GitNexus impact for `Prototype` before replacing it; if this new directory is unindexed, report that and manually inspect the template's sole importer rather than claiming the graph covers it.
- [x] Implement the real UI and deterministic local handlers. Send uses `if (!draft.trim() || pending || composing.current) return`, appends user text once, clears draft, and completes one reply after a short bounded delay. Cancel the pending timeout on reset/unmount. Regeneration updates only the targeted assistant ID. Clipboard failures render an explicit status. File picker only reads `File.name`.
- [x] Run the new suite to green and repeat runtime checks. Do not weaken assertions to conceal broken keyboard or modal behavior.

### Task 2: Reading Canvas fidelity and mobile verification

**Files:** `src/prototype.css`, `src/Prototype.tsx` only when supported by tests; test captures under `.tmp/visual-qa/`; project `design-qa.md`.

**Interfaces:** app header and composer are siblings of `MobileScroll`; composer is positioned using `useKeyboardInsets().bottomInset`; detail/menu surfaces use `BottomSheet`.

- [x] Set a compact header, 15–16px readable body, 22px answer heading, 24–26px side spacing, pale quoted user blocks and light event dividers. Match the source's 2-row composer without shrinking text to avoid scrolling.
- [x] Browser geometry checks assert header/composer remain inside the phone screen and last content can scroll above the composer; focus and blur the keyboard-aware textbox and repeat on Pixel.
- [x] Open source and actual captures together after density normalization. Compare complete app-owned view plus header/body/composer crops; record expected runtime chrome exclusions and intentional date correction.
- [x] Fix in-scope P0/P1/P2 findings with fresh tests or screenshot evidence. Re-run `npm run check:runtime`, the app and runtime Playwright suites, build, Sites tests and console checks. Record actual results and any residual gaps.
- [x] Request a bounded read-only review of only the new app and tests; resolve important findings. No broad review of old native App changes.

### Task 3: Private Sites publication and handoff

**Files:** template-generated `dist/` and `.openai/hosting.json`; project delivery notes. Do not alter protected Worker or packaging scripts.

**Interfaces:** compiled static `dist/client`, Worker `dist/server/index.js`, metadata `dist/.openai/hosting.json` consumed by Sites hosting.

- [x] Read `sites-hosting` and applicable references; inspect available private Sites operations and preserve their required approval gates.
- [x] Run `npm run build && npm run test:sites`, then publish the verified complete project using private Sites access. Do not substitute a public site or reinitialize a different template.
- [x] Poll deployment to terminal success with bounded waits and inspect the actual private URL if accessible. Record authentication limitations explicitly.
- [x] Deliver the working link, a brief explanation of demo-only behavior, and the location of `design-qa.md`. Keep the local preview alive for subsequent edits. Do not claim hosting completed before an actual successful deployment result.

## Delivery record

2026-09-06: private deployment succeeded at https://orbit-reading-canvas.agenthubs-app.chatgpt.site. Anonymous browser returned the expected `401 / Sign in required`; authenticated production interaction was not claimed. The verified local preview remains running at http://127.0.0.1:4173/.

Source publication uses an isolated Git repository rooted at the prototype directory (required by Sites); no commit or push was performed in the parent Orbit repository. GitNexus did not cover this new project; its impact calls returned UNKNOWN and child-repository change detection returned not indexed. Parent change detection reported existing unrelated CRITICAL scope; none of those files were included in the 50-file isolated source publication. This limitation was reported and the published file list manually checked.

Verification: 25 Playwright tests (17 app + 8 protected runtime), 28 runtime integrity files, TypeScript/build, 4 Sites tests and local browser console checks passed. `prototypes/reading-canvas-sites/design-qa.md` records visual comparisons and resolved findings.

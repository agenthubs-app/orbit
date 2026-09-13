# 设置与账号 QA

final result: passed (RNW / controlled-boundary batch only)

iOS native acceptance: not passed. See [current simulator status](2026-09-12-native-status.md). The user explicitly requires Simulator validation before final delivery; this local result does not satisfy that gate.

Source: `design_handoff_orbit_ink_signal/screenshots/3a-设置.png` and `3a-账号与工作区.png`; implementation `/tmp/orbit-ink-signal-settings-account-{settings,account}.png`. Same 390×844 CSS, 2×, 780×1688 pixels. Both source/render pairs opened in the same comparison input; source system chrome/frame excluded.

First comparison: normal grouped rows and open identity align with source geometry. Source-only invite/member/new/export/language/appearance controls are unavailable in the product and intentionally absent; own permissions/API/goal/plan/timezone/sign-out remain. Sign-out stays in account, its existing location. No fake data enters production.

- P2: 320pt/2× header leaves an isolated 区; keep 工作区 together on a deliberate second line.
- P2: large-text email is squeezed between avatar and edit; move edit below identity and let the text column occupy the row. Keep full system text scaling.
- P2 state: new notification status incorrectly treats null preference as off; show 读取中… until the existing storage read completes.

All three issues reproduced by `/tmp/orbit-ink-signal-settings-account-polish-red.log`: 0/3 passed. Earlier full batch: all1 67/71, four obsolete fixed-child-index selectors; typecheck1 found nonexistent `onPrimary`. Corrected to established `onAccent` and semantic action lookup. all2 70/71, one remaining retry selector; typecheck2 passed. The remaining selector was corrected and passed in subsequent combined runs. These failed checks are not counted as passed.

Second comparison: header word grouping and explicit unknown status passed. Identity's inherited `flexWrap: wrap` in the new column layout expanded its intrinsic width; the control bounds caught both narrow variants (all3 72/74, typecheck3 passed). A new exact email right-bound test reproduced it; removing the unnecessary wrap constrains the identity again. A single metadata column prevents an isolated 区 in the plan label at 1.6×. UI4 13/13 passed with the fixes. No text scaling was disabled.

Final comparison: latest normal source/render pairs were opened together again at original resolution. Identity remains 56pt with 18pt name and full validated email at normal size; 1.6×/2× uses a wider text row and a separate edit action. All normal/error/guest, 320pt 1.6×/2× and 820pt dark top/bottom images were inspected. Bottom captures now explicitly scroll to the end so the API description is also visible. No actionable visual P0/P1/P2 remains. This is the RNW visual result, not whole-package acceptance.

Independent review found one P2: while the notification preference was null, the row still exposed an enable label and remained interactive. A held-read test first failed (`review-red.log`, 0/1). The row now says `正在读取关键提醒状态` to accessibility and is disabled until the stored value resolves. The test also dispatches a click and proves no writes, then proves re-enablement. No notification callback changed. Re-review APPROVE, no Critical/Important/Minor; independent focused tests 2/2.

## Five fidelity surfaces

- Typography: source system-font intent, 15/22/800 section headings, 15/22/600 rows, 14/20 status; 18/24/900 identity, 13/20 email, 22/28 initial; 15/22 workspace and readable 12/18 metadata. Native font metrics and RNW fallback differ, as recorded in prior batches; no unselected font was installed. Source low-contrast small text uses the existing readable token.
- Layout: 16pt inset, 48pt existing safe navigation, 20pt effective top gap, 6pt heading/divider, 22pt settings groups, 50pt rows; 56pt identity/14pt gap, 36pt workspace icon/12pt gap, 6pt current chip. Account keeps existing functional metadata/goal sections instead of source-only member rows. Responsive single-column changes are deliberate. Body retains the existing 540pt maximum and scroll behavior.
- Colors: white, ink, signal blue and existing semantic error/background colors; ink-avatar foreground uses the same `onAccent` as ProfileScreen. Existing dark palette is verified for resilience, not claimed as an absent selected dark source. Shared divider token is slightly stronger than the source row hairline (P3, no new polish loop).
- Assets: reference initials are editable UI initials, not photographs; they now derive from real display name/workspace. No custom raster asset is required. Chevron/back icons are actual Ionicons. No source member avatars or fake member identities are copied; native system chrome stays system-owned.
- Copy: source section labels where capabilities exist, original functional warning/error semantics preserved. `no-ai-tone` review shortened the redundant notification explanation while retaining explicit permission, generic lock-screen summary and foreground/background sync scope. No marketing or implementation-only mode labels are introduced.

Full-view inputs at 780×1688 were readable enough to also examine initials, 1pt dividers, metadata/CTA text and icons; separate crops were unnecessary. Press feedback is covered by existing real-screen tests; new tests exercise navigation, ready/guest/resource failure, opt-in/no implicit writes, held dual revocation, error/retry and successful/failed sign-out refresh.

## Verification

`APP_STYLE_SCREENSHOTS=1 node --import tsx --test tests/ink-signal-settings-account.test.ts tests/account-session-view-model.test.ts tests/notifications/push-notification-settings.test.ts tests/notifications/merged-notification-lifecycle.test.ts tests/notifications/notification-registration-races.test.ts tests/app-wide-account.test.ts`

- `/tmp/orbit-ink-signal-settings-account-all4.log`: **75/75**, 0 fail/cancel/skip, 13.688025 seconds, exit 0; includes 13 new rendered cases.
- `/tmp/orbit-ink-signal-settings-account-typecheck4.log`: `npm run typecheck`, exit 0; `git diff --check` clean.
- Screenshot-end-position refinement: `/tmp/orbit-ink-signal-settings-account-ui5.log`, **13/13**, 5.778377 seconds, exit 0. Only screenshot positioning changed after all4, not production behavior.
- Final after review fix: `/tmp/orbit-ink-signal-settings-account-all5.log`, **75/75**, 0 fail/cancel/skip, 14.643727084 seconds, exit 0; `/tmp/orbit-ink-signal-settings-account-typecheck5.log`, exit 0; `git diff --check` clean.
- Real screens, VM, theme, RNW and revocation queue run. Native device/storage, session, router and GET resource boundaries are controlled. Existing lifecycle tests still run the real dual-registry coordination with native/network/storage fakes; only obsolete child-index selectors were replaced, with all late-write/retry/cleanup assertions intact.
- No auth/provider, notification service, VM, shared shell/token, API or generated-contract production edits. Source fallback back route still follows existing navigation (account → 我的 when there is no history; real back with history), not the source's fixed 设置 label.

Screenshots: `/tmp/orbit-ink-signal-settings-account-{settings,account,settings-error,account-error,settings-guest,account-guest}.png`; `{narrow-large,narrow-double,wide-dark}-{settings,account}` and their `-bottom` files.

## Checklist

- [x] Exact source and implementation viewed at equal density/state.
- [x] P2 fixes implemented, recaptured and inspected.
- [x] Combined tests, typecheck and diff check pass.
- [x] Five fidelity surfaces and all responsive/error/guest states inspected.
- [x] Independent review complete; supported P2 fixed test-first and approved.

No native, live HTTP/storage, real account/database or cross-client write acceptance is claimed. Overall redesign remains unfinished.

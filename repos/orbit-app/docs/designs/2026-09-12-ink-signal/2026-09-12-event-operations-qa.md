# 活动运营／无权限页本地 QA

final result: passed (RNW visual / controlled-boundary checks)

Independent code review: APPROVE, no scoped findings; reviewer independently ran 32/32 tests and checked the final neutral failure notices and responsive states. Whole-package and Simulator acceptance: **not passed**; see [native status](2026-09-12-native-status.md). No current iOS execution claim is made here.

## Reference and functional mapping

Exact selected images: `3a-活动运营台.png` and `3a-无权限-运营台.png`, from the supplied ZIP; HTML operations/permission sections. Source and latest normal/forbidden screenshots opened together at 390×844 CSS, 2× (780×1688 pixels). Device frame, status bar and bottom chrome excluded from app-owned comparison.

The operations response provides matching, table results and time gates; it is not the source's registration-review feed. The implementation keeps the real four metrics (已报名／已签到／名片申请／已同意), four existing destinations, and matching confirmation workflow. It does not fabricate event title/date/capacity absent from this response, notification sending, batch approval, editing or a role-request API. The source's visual hierarchy is applied to these actual capabilities. Existing event-detail back navigation is retained, rather than inventing an owned-events destination.

## Findings and resolutions

- Initial RED: 9/16 pass, seven failures (`/tmp/orbit-ink-signal-event-operations-red.log`). Six expose missing source header/permission/progress/responsive acceptance. One read the pending disabled state before React rendered it; adding condition-based waiting confirmed the existing production lock (focused 1/1), without changing callbacks.
- all1: **failed**, 18 pass / 3 fail. The direct command omitted the existing render-hook import needed by the older TSX suite. Another test selector matched both legitimate event-return buttons; it now selects the visible body action. RNW also does not translate native `accessibilityValue` into DOM values: added the existing import-progress screen's `aria-value*` pattern alongside the native prop. No dependency or shared test-loader changes.
- all2: 32/32, typecheck2 exit 0. Visual review found static orphan characters in 2× navigation and permission headings; a real Range-per-character line-count test failed first (`heading-red.log`), then balanced newline groups retained full font scale. Permission heading keeps its complete accessible label.
- all3: 32/32, typecheck3 exit 0. Source color comparison then caught overly dark permission copy. Actual computed-color test failed (`color-red.log`); the existing text3 token supplies source #6B7280. all4: 32/32, typecheck4 exit 0.
- Failure screenshots exposed inherited green styling on generic mutation notices. A new assertion failed (`notice-red.log`); notices now use neutral surface2/text2, not inferred success/error logic based on strings. all5 **failed** 30/32 because the initial neutral token was surface3 rather than source #F5F7FA. Tokens were read and corrected to surface2. The failed check was not counted as passed.
- Final all6: **32/32**, 0 fail/cancel/skip, 7.451286917 seconds, exit 0; typecheck6 exit 0; scoped and App diff checks clean. Latest failure screenshots reopened and confirm neutral feedback. Retry fixture correctly shows 4/5 completed, 1 failed, 80%; no production progress data is synthesized.

## Five fidelity surfaces

- Typography: existing system font; secondary navigation 16/22/800, overview 20/28/900, figures 24/28/800, metric labels 11/16, navigation 14/20/600. Permission title 22/30/900 and copy 14/22. At larger scale, metrics reflow to one column on 320pt and two on wider screens; statuses/time labels stack and text remains fully visible.
- Layout: existing fixed 48pt-minimum AppScreen header, 16pt content inset and centered maximum 540pt canvas; four bordered metrics with 12pt vertical padding, open text navigation, 14pt section padding/separators. Permission lock is 64pt with a 1.5pt outline; body/action inset totals 40pt, title gap 20pt, actions gap 8pt and top gap 28pt. Primary/secondary permission actions are at least 50/46pt; all other interactive controls at least 44pt and reachable.
- Colors: source white/ink/blue with border and border2 separators. Actual progress uses signal blue; permission copy uses #6B7280. Generic feedback is neutral #F5F7FA/#3C4658; actual failed generation labels remain visibly failed. Existing dark palette retained and inspected, not claimed equivalent to a nonexistent selected dark source.
- Assets: no app-owned raster asset in these references; actual Ionicons lock, sparkles and table icons. No fabricated avatars, administrator imagery or device chrome.
- Copy/semantics: all real values/actions/statuses retained. Only actual HTTP 403 produces the permission screen; loading, unconfigured, offline, 401, 500 and invalid payloads are distinct. No protected metrics/actions appear on 403. Return uses encoded actual event ID; recheck invokes the existing read refresh. Start/publish/retry still require the existing native Alert confirmation; reading/navigation never triggers POST.

No actionable P0/P1/P2 remains in the inspected RNW visual scope. P3/deliberate differences: actual matching content instead of registration rows; no unsupported source actions, fake event metadata/capacity or workspace/admin copy; actual back destination; shared header separator and font/icon rendering; full explanatory copy may end in short wrapped lines at maximum size. Do not shrink text or hide content to force source row counts.

## Evidence and boundaries

`APP_STYLE_SCREENSHOTS=1 node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/ink-signal-event-operations.test.ts tests/event-operations-screen-render.test.tsx tests/event-operations-route-source.test.ts tests/event-operations-view-model.test.ts`

- Logs: `/tmp/orbit-ink-signal-event-operations-all6.log`, `/tmp/orbit-ink-signal-event-operations-typecheck6.log` (`npm run typecheck`). Three existing operation suites untouched; 16 new cases exercise real production screen/content/VM/theme/callback bodies.
- Screenshots opened: normal, forbidden, loading, unconfigured, offline, failure, unauthorized, invalid, zero-progress, publish-failure, retry-failure; 320pt 1.6×/2× and 820pt dark operations/forbidden top and bottom, plus matching/table intermediate views. Prefix `/tmp/orbit-ink-signal-event-operations-`. Latest source pairs, balanced headings and final neutral notices were re-inspected; 2× images are legible without extra crops.
- Tests cover all four encoded destinations; no write before confirmation; cancel, start pending lock, publish/retry failure and success, real endpoint/body and refresh; zero progress width/value and active-generation lock; permission return/recheck/recovery, complete text/control bounds and static heading line counts. Browser pageerror lists empty.
- Device/router/Alert/HTTP resource/client boundaries are controlled. No real operation, permission grant, matching publish, database change or Web↔App persistence test occurred. Existing resource/cache behavior and authentication wrapper are not replaced by this presentation change.
- Version: parent repository HEAD `8b38b4eb8618505ca4f59f20dc323159e1ad784b` plus uncommitted App work. This batch changes two production screen files, one new test and documentation; no Web/API/generated-contract/dependency/commit/deployment changes. Full regression is deferred to the remaining-page consolidated pass. Simulator remains mandatory before final delivery.

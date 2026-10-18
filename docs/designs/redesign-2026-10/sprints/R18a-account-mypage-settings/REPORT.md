# R18a implementation report (in progress)

Approved scope: GOAL / PLANNER rev2, plus the explicit continuation authority recorded below. Latest frozen App verification at `0bab5674d`: typecheck0, full3191 / 3187 pass / 2 exact pristine failures / 2 skip; the authorized authenticated-client audit fix introduces no new full-suite failure names. Implementation is not acceptance closure: native interaction evidence, Web final verification, component-gated pixels and remaining independent review are OPEN. No pixel closure before R31a / R31b. No production database, real Google, deploy, TestFlight, push, stash or reset was used.

## 2026-10-18 Web final-gate checkpoint (still open)

At clean `4f8804cd0`, the Web full run reported 7,423 tests / 6,369 pass / 35 fail / 1,019 skip (exit 1). Comparison with the recorded pristine C run found four new failure names: two deleted-test paths left in the lint command, an account actor-reader expectation missing the additive `publicFields`, the account CSS-token ratchet, and an inherited R31b pixel-crop type error. The first two were corrected in the lint command and test expectation; focused contract/smoke checks passed 5/5, and Web lint exited 0. The type error in `tests/scripts/redesign-pixel-components.test.ts:171` is not changed here: A's R31b line already has its own fix, but C does not yet contain that integration. Consequently Web typecheck remains **exit 2**, not green.

For the CSS ratchet, five C-owned account modules now use the existing design tokens for font size, radius, color and stacking. The two mobile square corners required a missing zero-radius token; the user approved `radius.none = 0`, then `design:tokens` regenerated Web/TS outputs and `sync:contract` copied the generated token into App. The new token test was observed RED (8 pass / 2 fail) before the source change, then generated-token/icon checks passed 16/16, CSS legacy/ratchet checks 6/6, and App token/contract-sync checks 8/8. Contract sync changed only the expected App token file. `git diff --check` is clean. These are focused checks, not a fresh Web full-suite or pixel/visual acceptance. Raw logs are under `_evidence-c/R18a/run-01/` in the parent workspace; full and typecheck gates must be rerun after the R31b integration.

At local checkpoint `7528b6c04`, fresh Web full `c-web-full-after-token.log` reported **7,423 tests / 6,372 pass / 32 fail / 1,019 skip, exit 1**. The failure-name difference from pristine C is exactly one old `doors` browser failure gone and one inherited R31b `the entire project typechecks with zero errors` failure present; the other 31 names match. Thus the C-owned lint/actor/CSS regressions no longer fail in the full suite, but the suite is still red and typecheck remains blocked by A's unintegrated test correction. Current-hash Web lint `c-web-lint-7528b6c04.log` exited 0. Native operation, pixels, Web width-specific browser matrix, independent review and post-R31b full/typecheck rerun remain OPEN.

Current C App typecheck `c-app-typecheck-after-token.log` exited 0. Two fresh App full runs (`c-app-full-after-token.log`, `c-app-full-after-token-retry.log`) each reported **3,191 tests / 3,186 pass / 3 fail / 2 skip, exit 1**. Two failure names are the pristine C dictionary pin and invite overlay click; the added name is the plan-overview skip→undo browser click, blocked by the lingering toast/overlay. That plan file passed in isolation (25 pass / 1 skip / 0 fail), but the full-suite failure repeated twice, so it remains an OPEN cross-line integration failure, not a passing or dismissed gate. D pristine also recorded the same plan failure; no account source from this checkpoint was on that click path. Plan-screen ownership should inspect the overlay and full-concurrency interaction; C does not change that unrelated screen/test here.

## Authorized continuation: authenticated client adapter

User continuation explicitly authorized the minimal additive shared-hook seam, regression tests and private settings migration. `src/hooks/useOrbitApiClient.ts` now accepts optional `fetchAdapter?: (fetcher: FetchLike) => FetchLike`; omission preserves the previous global-fetch path, auth cookies, client memoization dependencies and scoped aborted-response/session-expiry suppression. The adapter is composed before that existing scoped response guard. `useAccountSettingsApi` uses the authenticated hook with actor scope and its existing settings-envelope adapter; no source-audit allowance was added.

Actual-hook SSR/API/transport RED (`app-auth-adapter-red.log`): 6 tests / 3 pass / 3 fail (missing adapter behavior twice plus the existing direct-client audit). GREEN (`app-auth-adapter-green.log`): 46/46 including old no-options and scoped callers, authenticated cookies, conditional/API client regressions, real legacy `{data}`/204 normalization and late aborted 401 suppression. The shared hook has 53 callers; only the approved settings consumer was migrated. Final sanitized typecheck/full comparison subsequently completed at `0bab5674d`, detailed below, rather than being inferred from focused tests. An earlier queued verification was canceled before lock acquisition (exit143, empty `app-full-auth-adapter.log`); no tests ran in that canceled job and A's active lock was unchanged.

### Approved native OAuth fallback

The same continuation adopted native OAuth fallback to Web settings, not a new native callback/session mechanism. The private integration controller now chooses `/app/settings/integrations` outside Web; Web retains the existing signed-provider authorize path with `returnTo=settings`. Pure API-path regression RED (`app-native-oauth-fallback-red.log`): 6 tests / 4 pass / 2 fail for the two providers; GREEN (`app-native-oauth-fallback-green.log`): 6/6. Actual controller browser-return/confirmed-disconnect/confirmed-memory-delete coverage subsequently passed in the heavy-locked RNW10/10 batch (`app-secondary-operations-0bab5674d.log`), and those cases also pass in the frozen full run. Actual native OS/browser operation is not implied by mocked native boundaries in RNW.

Initial read-only native availability inspection found the sanctioned `Orbit Line C` simulator (`D48F24AC-DBD5-49F8-910A-2E7F0BACCAF3`) available but shutdown. Its data path had no `Containers` or `Library/MobileInstallation` directories, so an installed usable development client was not established. No boot, install, build or simulator creation had been performed at that checkpoint; the subsequently authorized local binary build is recorded below. Native-operation evidence remains **OPEN**; RNW functional screenshots are not native or pixel evidence.

### Adopted §C-1 board and registration amendments

Continuation explicitly authorized original-board in-place amendments, superseding the earlier b7 ownership hold. b7 removes unsupported undo/history promises from both visible rules and pin annotations; its résumé example now says supported text, not PDF. b5 and the matching C-owned b12 `.g11` helpers remove unbacked integration sync times/counts and goal budget/deadline/week/progress/subgoal metrics; the actual goal/edit and provider state/disconnect controls remain. Native-calendar permission rows are removed under the adopted no-dependency decision, separately from Google Calendar OAuth. Each amendment is annotated「主会话代定 §C-1」. Board IDs, layout families and the b12 pre-R18a prefix are preserved; no kit/token is changed.

A pure registration regression found five unsupported App suite query aliases. RED3/4 (`app-board-registration-red.log`) at A-R18a-08; correcting only registration URLs to the implemented development-only `25 / 50 / 100` gives GREEN4/4 (`app-board-registration-green.log`). All12 view IDs, board references and theme matrices are unchanged. Combined hook/audit/settings/fixture checks16/16 (`app-continuation-light.log`); all inline scripts parse and `git diff --check` is clean. Coordinator explicitly approved separate path commits while rendered preflight/RNW checks were then queued; both subsequently completed below. Syntax/structural checks are not pixel/native acceptance.

### Frozen final continuation verification

Clean rebase from `fbf92a311187d8039686cb66305c170603524b0d` to `0bab5674de8c278b0c94f44900d87eb91f8725d2`, onto exact upstream `2569ad835a4470180ec9c81d121e15e1080d469c`, completed without conflict. All25 patches are range-diff `=`. Current-at-this-checkpoint continuation milestones: hook `f17084950`, native fallback `eb4cf4dd0`, §C-1 design `0bab5674d`. Earlier tables preserve historical hashes, not an assertion that their old “Current” column remains the newest rebase.

One `heavy.sh c` sequence used the exact pristine sanitizer (`env -i`, PATH/HOME/TMPDIR, USER=xzhao, LANG/LC_ALL=en_US.UTF-8; no DB/provider env):

| Phase | Exact outcome | Raw evidence |
| --- | --- | --- |
| Actual RNW controller operations | 10/10, 7.90s | `app-secondary-operations-0bab5674d.log` |
| Before/after amendment preflight | 8 invocations exit0; Web22 / App12 / original b5 19 / b7 6 identities and dimensions unchanged | `preflight-c1-{before,after}-{web,app,b5,b7}.{json,log}` |
| App `tsc --noEmit` | exit0 | `app-tsc-0bab5674d.log` |
| App full `npm test` | 3191 / 3187 pass / 2 fail / 2 skip, 296447ms, exit1 | `app-full-0bab5674d.log` |
| Owned App copy | 103 entries / 0 issues | `app-copy-0bab5674d.log` |

The two full failures exactly match pristine C by full test name (`app-full-baseline-comparison-0bab5674d.json`, `newFailureNames: []`):

1. `tests/i18n-domain-split.test.ts` — `the split dictionaries carry exactly the pre-split keys and values`: historical English key count2813≠2253.
2. `tests/invite-code-screens.test.tsx` — `S1 これまでのコード: 「同じ人かも」 under a joined person — 統合する merges (the name then opens the existing contact), 別の人 dismisses`: existing 松井 遥 link click times out behind the aria-live overlay.

The authenticated-client source audit passes in this full run. This is zero-new-failure evidence relative to the pristine baseline, **not a fully passing suite**. Heavy lock released normally before D's queued Web verification. No App source mutation occurred during the frozen sequence.

Preflight rendered sources confirm unsupported b5 sync/week/subgoal claims13→0 and b7 undo/history promises5→0. After hints (near/missing/consistency/flags): Web8/65/0/23; App3/84/0/11; original b5 8/94/0/13; b7 0/21/0/11. These are automatic hints, not token/component or pixel passes. The coordinator's read-only reviews found no blocker in the optional-hook diff or the scoped §C-1 board diff; broader independent review remains OPEN. App scope ledger matches all129 changed paths after rebase.

RNW functional images `app-functional-native-fallback-after.png` and `app-functional-memory-confirm.png` were inspected. The first disconnect capture raced the dialog's enter animation despite passing operation assertions, so that image was not counted as confirmation visual evidence. A subsequent **test-only** bounded condition wait for actual alert opacity1 passed both controller cases2/2, exit0, 1.98s (`app-confirm-capture-after-wait.log`); corrected `app-functional-disconnect-confirm.png` and memory-confirm were inspected and visibly show their respective confirmation dialogs. No product/kit animation or arbitrary sleep is changed. The full3191 result remains tied to frozen0bab before these two capture waits; this later bounded run verifies the test-only difference. Native simulator and pixel evidence remain OPEN.

### Latest clean integration and native prerequisites

After the capture-only three-path checkpoint `bbf4381eb`, clean rebase onto `c4039b166990b56e6beba544cd3301aadc147d31` produced `428255da70106cfb94045dd00a1d3c052809e4d1`, no conflicts, all26 range-diff patches `=` (`app-rebase-to-c4039b166.log`). Upstream added only five Web visual/doc paths in `5cd607085` / `c4039b166`. `git diff 0bab5674d HEAD -- repos/orbit-app/src repos/orbit-app/app repos/orbits/shared` is empty: the verified App runtime/contracts are unchanged. The only App difference since frozen full is the two capture-only test waits, separately2/2 GREEN. Post-rebase hook/audit/settings/fixture checks16/16 (`app-continuation-light-428255da7.log`). No new App full run is claimed at this rebased hash.

| Milestone | Before latest rebase | After latest rebase |
| --- | --- | --- |
| Shared authenticated hook | `f17084950` | `1636d257d` |
| Native→Web fallback | `eb4cf4dd0` | `077272bb9` |
| Adopted §C-1 boards / registrations | `0bab5674d` | `c5ccc1585` |
| Capture-only correction / final verification ledger | `bbf4381eb` | `428255da7` |

Read-only native assessment: Xcode26.6 (17F113), iOS26.4 runtime and CocoaPods1.17.0 are available. A cached Expo Go57.0.5 app (`host.exp.Exponent`) exists, but is not installed on the shutdown C device; its SQLCipher capability has not been demonstrated, so it is not adequate evidence for the configured Orbit runtime. Existing `app.config.ts` requires `expo-sqlite useSQLCipher:true`; the local build plugin builds React Native from source, and sync checks `PRAGMA cipher_version`. At that initial checkpoint the C checkout had no `ios/` project/Pods and no `expo-dev-client` dependency; no dependency was added. Existing idb/companion are available; Python-backed idb is invoked through uv and its existing uv tool environment.

Coordinator confirmed a C-only generated-artifact prebuild/Pods/simulator build is within SC03–06 verification, using existing dependencies only. Planned exact targets: ignored C `repos/orbit-app/ios/` (absent before execution), dedicated `/Users/xzhao/Library/Developer/Xcode/DerivedData/Orbit-Line-C-R18a` (absent), and evidence `run-01/native-build/` (absent). Existing `.gitignore` already ignores native/build artifacts. The bundled local Expo template requires no download; installed Expo's pure package modifier on cloned current/template manifests reports `scriptsChanged:false`, `changedDependencies:[]`, `manifestIdentical:true`. Its template has platform-local gitignore, so it does not merge the root gitignore.

Bounded verification plan, after coordinated D gates: (1) prebuild with local template, iOS only, no dependency install, 120s cap and before/after manifest/config/lock/tracked-file guards; (2) native Pods only for existing dependencies, 300s cap; release and inspect; (3) separate dedicated-derivedData simulator build, max2 jobs, 900s cap, only after coordination. Stop on package/lock/config changes, new dependencies, existing-file overwrite, real-account/provider need or unsupported native prerequisite. No native boot/install/prebuild/build has happened at this checkpoint. Native SC03–06 operation records remain **OPEN**, separate from SC12 pixels.

### Bounded local native binary evidence

The three separately coordinated `heavy.sh c` phases subsequently completed at clean source `ba6beb18c7851f40c2c431acea683ff924c03d8e`, using sanitized environments and existing dependencies only:

| Phase / unchanged cap | Outcome | Evidence |
| --- | --- | --- |
| Bundled-template iOS prebuild / 120s | exit0; `--no-install`; only new ignored C `ios/` generated | `native-prebuild-ba6beb18c.log` |
| `pod install --project-directory=ios` / 300s | exit0; 22s; 124 Podfile dependencies / 127 Pods installed into the generated project | `native-pods-ba6beb18c.log` |
| Debug arm64 simulator `xcodebuild`, max2 jobs / 900s | exit0; 893547ms; `timedOut:false`; app and executable exist | `native-xcodebuild-ba6beb18c.log` |

The build uses dedicated `/Users/xzhao/Library/Developer/Xcode/DerivedData/Orbit-Line-C-R18a`, `CODE_SIGNING_ALLOWED=NO`, `RCT_METRO_PORT=8084`, no simulator destination boot and no real account/provider. `Orbit.app/Orbit` is an arm64 Mach-O executable, SHA-256 `a0e5ed6fa48a5d514d2f021bb88cc4a840ac0251e49a2e13528832a0e969312a`; bundle identifier `app.agenthubs.orbit`, minimum iOS16.4. Generated ExpoSQLite build settings include `SQLITE_HAS_CODEC=1` / `SQLCIPHER_CRYPTO_CC`, but this is not a runtime cipher or native-interaction pass.

All phases preserved `package.json`, `package-lock.json`, `app.config.ts` and `.gitignore` hashes; the build result reports `changedProtectedFiles:[]`, empty tracked status. Post-exit checks found neither owned xcodebuild PID76808 nor its owned SwiftBuild service PID76889 remaining. C heavy lock released normally before D's queued gate. The exact C device remains shutdown on iOS26.4; no install, boot, launch or native credentials operation has yet occurred. SC03–06 native operation records and SC12 pixels therefore remain **OPEN**.

Coordinator subsequently approved a bounded C-only local fixture/launch path, held until D gates release: existing localhost127.0.0.1:5432 database `orbit_line_c_test`, absent schema `r18a_native_20261018_26f7f50d8edc`, workspace `workspace:r18a-native:26f7f50d8edc`, fake `.test` actor, C API3400 / Metro8084 and exact C device. Read-only identity/schema-absence and resolver no-cloud-fallback checks passed (`native-fixture-resolver-preflight.json`); all eight C Web env-file variants are absent. No schema or actor is provisioned at this checkpoint. Approved guards require a pre-write nonce ownership manifest, atomic failure-on-existing schema creation, repeated DB/host/schema identity checks, removal of exactly the existing public-extension DO block from verification-only DDL with an asserted single match, private schema/strict sync DDL only, existing auth registration and actual credential UI without session injection. Cleanup is limited to proved nonce-owned processes/view and the exact newly created schema after ownership/foreign-object checks; uncertainty preserves the resources. The broad primary seed and Map-only fixture helper remain excluded.

### Evidence availability change after external cleanup

On 2026-10-18 JST, coordinator reported external disk cleanup and an exact-path check confirmed that `/Users/xzhao/orbit-sprint-evidence/redesign/R18a/run-01/` no longer exists. Its historical raw logs, JSON and functional images are therefore **unavailable**, not retained/recovered evidence. Explicit missing-path checks include the prebuild/Pods/xcodebuild logs, resolver preflight JSON, frozen `app-full-0bab5674d.log` and baseline-comparison JSON, production fixture-exclusion JSON, capture-wait log and the unexecuted native lifecycle harness. Earlier result summaries above remain historical executed observations in the committed REPORT/tool transcript; those missing raw files cannot currently support independent file-based rerun/review. This is an SC13 evidence-availability gap, not a newly passing or failed product test.

The pristine C App baseline `/var/folders/3q/sc3_n8917jn8w_j_jltbz_xr0000gn/T/orbit-cd-baseline.fk6V4SASy3/c-app.log` remains present. Generated C `ios/Orbit.xcworkspace` and the native executable also remain; a fresh post-loss SHA-256 check still returns `a0e5ed6fa48a5d514d2f021bb88cc4a840ac0251e49a2e13528832a0e969312a`. This fresh artifact check does not recover the deleted compiler log or prove native interaction.

Coordinator approved the new exact C-only ORICO evidence root `/Volumes/ORICO/Dev/worktrees/orbit/_evidence-c/R18a/run-01/`. Only the reviewed verification harness and fresh syntax/check-only artifacts were reconstructed there, with `evidence-loss-20261018.json` explicitly recording `recoveredPriorRunEvidence:false`. No old raw log/JSON was regenerated or presented as recovered. The nonce, binary SHA, local DB/schema/workspace, ownership/cleanup guards and phase caps are preserved; the harness expected-head guard is advanced only for this REPORT-only commit. The native ownership manifest had never been created, the nonce-owned view is still absent, and ports3400/8084 had no listeners at the post-loss check. No native setup, boot, install, launch or credentials operation has run; those operations remain held for the coordinator's D-gate release. Native SC03–06 and SC12 pixels remain **OPEN**.

## Baseline and evidence

- C Web pristine: 7475 tests, 6428 pass, 32 fail, 1015 skip. 25 failures explicitly require a missing DB URL; six other failure categories match D. The extra `tests/ui/add-contact-screens.test.tsx` doors assertion (`kit .wmodal.w560`) subsequently passed the correct targeted rerun (2/2, 3.26s). This supports timing sensitivity, not a full-suite pass.
- C App pristine: 3323 tests, 3319 pass, 2 fail, 2 skip. English dictionary historical key count and old joined-person click timeout; same failure count as R30 App (3322 / 2). R30 Web was 7443 / 7. Other Sprint failures are not repaired here.
- Baseline logs: `/var/folders/3q/sc3_n8917jn8w_j_jltbz_xr0000gn/T/orbit-cd-baseline.fk6V4SASy3/{c-orbits,c-app}.log`.
- R18a evidence directory: `/Users/xzhao/orbit-sprint-evidence/redesign/R18a/run-01/`. SC01 preflight and SC02 RED/GREEN logs are there. Focused command outputs are recorded in the execution transcript. Full logs were pending at that initial checkpoint; subsequent App full/typecheck/export logs are listed below. Outstanding acceptance gates remain explicitly identified.
- All full tests, typechecks, builds and browser/simulator work use `_runs/heavy.sh c -- …`. Only pure/SSR targeted checks run without the heavy lock. Local PG route test explicitly pins `orbit_line_c_test`; no remote fallback is allowed.

## Commits / checkpoints

| Commit | Scope | Verification |
| --- | --- | --- |
| `5550d1582` | SC01: b5 amendments, 17 appended b12 light/dark pairs, suites and preflight metadata | 17 blocks / 34 frames, no inline JS errors, original b12 prefix preserved; preflight before/after, no pixel gate |
| `002eb7ce1` | SC02 additive card/public-field contracts, storage, projections, canonical fixtures, App sync | Web 56/56 including isolated real local PG; App 15/15; contract snapshot/sync |
| `a2fc481f5` | Web dev-only actor+variant GET/PUT profile overlay and legacy route helper | Parent: 14 pass / 0 fail / 14 existing PG-opt-in skips |
| `987fe4bd0` | SC03/04 App my page, editor, preview, tags, CAS/visibility and fixture route plumbing | 33/33 focused tests; new me copy 48 entries / 0 issues; simulator/style-diff not run |
| `75969776a` | SC05/06 App settings, real available OS permission actions, integrations, iOrbit, dev fixture snapshot | App typecheck exit 0; focused 14/14 and prior 27/27; me copy 86 entries / 0 issues |
| `ff91397b6` | Parent Web SC07 account/profile/settings route, card/public preview/CAS edits | Parent: 13 focused tests green; follow-up and SC09 were then in progress; subsequent milestones below |
| `52b22482e` | App SC09 reviewed live suggestions, selected-field CAS save before queue acknowledgment, extraction review and private fixture cards | New focused 7/7; combined onboarding/API 15/15; App typecheck exit 0; me copy 102 entries / 0 issues |
| `6720e8ebc` | Web worker SC10 old account/settings UI retirement | Worker owns Web evidence; two shared-audit assertion updates deliberately remain separate from the App hunk |
| `5058b417b` | App SC10 screen retirement, route/allowlist/transport/offline audits, completion compatibility | App focused 70/70; retained service/appearance 37/37; transport 0/0; filtered mobile audit 1/1; browser/latest typecheck were then pending; subsequent results below |
| `bcbbcfaf5` | Worker shared-audit Web assertions only | Coordinator confirmed separate Web-only hunk commit |
| `3a3db82d6` | App direct `/settings/api` route development guard, preserving private auth boundary | Actual route tested with undefined/false/true development flags; combined route boundary/coverage/wiring 8/8 |
| `ebc54587c` | App SC11 offline remote-button disabled states; exact integration disconnect receipt regression | New offline cases RED→GREEN; focused secondary/suggestions/settings API 11/11 |
| `58dc2b45e` | App actual private-boundary SSR and optional scan cancellation compatibility regressions | Combined auth/route/scan/existing onboarding API 15/15; all 12 R18a entry files retain private wrapper; no auth/shell runtime edits |
| `8ca061cec` (post-rebase) | App real-editor save invariants, owned source audits and mapped legacy-suite retirement | Browser13/13, retained invariant subset45/45, owned source audits13/13, App typecheck0; that full rerun had one then-open C dependency failure |

Path-specific commits only. The table above records pre-rebase milestone hashes. Dirty shared worker trees prevented an immediate pull/rebase; coordinator explicitly approved committing owned paths before rebasing a clean tree, with no stash/autostash. The clean rebase completed from `6357efa28e8509279410511e28b7a9c9608c9bf5` to `df06f6be4bbae3ef30332d24a3eed63c9841954a`, on exact upstream base `e081084b0c024a50f2c0d13c1abe130c576bc440`. D prerequisites shell `56da437ef` and OAuth signed `returnTo=settings` `d2aaa6201` are now ancestors, not C-owned edits.

### Clean rebase mapping

| Pre-rebase | After first clean rebase | Scope |
| --- | --- | --- |
| `5550d1582` | `81c786e8c` | SC01 boards/preflight |
| `002eb7ce1` | `a28a8bff2` | SC02 contracts/fixtures |
| `a2fc481f5` | `51726f83d` | Web development profile overlay |
| `987fe4bd0` | `4fbd9c909` | App SC03/04 |
| `05d40535b` | `9a4b02d4b` | Web secondary settings |
| `780801510` | `71638126a` | Japanese live draft guard |
| `ff91397b6` | `c948f7762` | Web SC07 |
| `5f5ef38dd` | `d7bfeb8bc` | Web preparing routes |
| `75969776a` | `043e47a83` | App SC05/06 |
| `bba8a2511` | `6bb7bf0be` | Web development review/event summary |
| `8351ec0be` | `411219cc6` | Web suggestions |
| `52b22482e` | `8aa1c9cc5` | App SC09 |
| `6720e8ebc` | `c9ed5a0ee` | Web SC10 |
| `5058b417b` | `d5a54e88e` | App SC10 |
| `bcbbcfaf5` | `9e2d7bcf8` | Web audit assertions |
| `3a3db82d6` | `16353b38d` | App development API route boundary |
| `ebc54587c` | `afcfe9899` | Offline disabled actions |
| `58dc2b45e` | `e57c412ec` | Auth/scan compatibility regressions |
| `6357efa28` | `df06f6be4` | SC11 controller/presenter regressions and evidence |

Rebase resolutions preserved both upstream calendar and C `me` dictionary/import/registration changes in the three locale indexes, domain-split test and copy-QA registry. The offline page inventory was regenerated from the merged registry, preserving the upstream R31a showcase split and C routes: 121 routes. Range-diff found only these expected context/generated-inventory differences; the other seventeen commits were patch-identical. No stash/reset, other-worktree mutation or push occurred.

Post-rebase lightweight registry/route/allowlist/i18n run: 43 tests / 42 pass / 1 fail. The sole failure is the pristine baseline's exact `en key count` assertion, `2813 !== 2253`; calendar and `me` domains, equal language key sets, route parity and 121-route inventory checks pass. Official copy-QA invocation (`node --import tsx scripts/copy-qa/cli.mjs --app me`): 103 entries / 0 issues. Full App comparison and post-rebase typecheck were then pending; subsequent completed runs are recorded below. No full-suite pass is inferred from these lightweight checks.

Coordinator-supplied Web evidence, obtained before rebase: SC09 `8351ec0be` (now `411219cc6`) focused 11/11 and Web typecheck exit 0; SC10 `6720e8ebc` (now `c9ed5a0ee`) focused 62/62 plus account 13/13 and Web typecheck exit 0; audit-only `bcbbcfaf5` (now `9e2d7bcf8`) filtered 2/2. No later Web full-suite, lint or pixel result is available; those gates remain unverified.

### Sanitized App full comparison on `df06f6be4`

Exact invocation: `env -i PATH="$PATH" HOME="$HOME" TMPDIR="${TMPDIR:-/tmp}" USER=xzhao LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 /Volumes/ORICO/Dev/worktrees/orbit/_runs/heavy.sh c -- npm test` from `repos/orbit-app`. No DB URLs or provider secrets. Raw log: `/Users/xzhao/orbit-sprint-evidence/redesign/R18a/run-01/app-full-df06f6be4.pFkkMy`.

Result: **3343 tests / 3159 pass / 182 fail / 2 skip**, 211998ms, exit 1. This is not zero-new-failure acceptance and not 182 independent product regressions. Exact buckets:

| File / count | Cause / ownership | Treatment |
| --- | --- | --- |
| `ink-signal-profile.test.ts` / 170 | Obsolete inline-profile fixture before-hook lacks the new route's `useLocalSearchParams` and kit `useSafeAreaInsets`; fanout before assertions | C SC10 missed retirement. Map behavioral invariants before retiring old UI expectations; add missing real-editor-controller coverage |
| `app-wide-primitives.test.ts` / 6 | Shared before-hook still imports removed orphan `SectionHeader` | Keep all six generic cases; remove only dead component fixture/assertion, then rerun |
| `authenticated-client-usage.test.ts` / 1 | Private settings hook constructs its cookie-aware client directly so it can normalize legacy integrations/memory `{data}` / 204 envelopes before client parsing | **Open scoped dependency request** below; no source-audit bypass or shared-hook edit authorized |
| `design-legacy-names.test.ts` / 1 | New hint used deprecated `typography.caption` | Owned token correction; targeted RED→GREEN |
| `mobile-route-access.test.ts` / 1 | Exact private-entry registry omitted three new settings routes | Owned registry update preserving wrapper checks; targeted RED→GREEN |
| `i18n-domain-split.test.ts` / 1 | Historical `en key count`, `2813 !== 2253` | Exact pristine C failure; unchanged |
| `invite-code-screens.test.tsx` / 1 | Old joined-person merge click timeout | Same pristine C case; no R15 edits |
| `plan-overview-screens.test.tsx` / 1 | Skip/undo confirmation button intercepted by an overlay | Upstream R17/A component consumer; report to coordinator, no C edit |

No personal-schedule Flow-parser failures occurred in this C run, even though D's separate run encountered them. Do not transfer D observations to C. Post-rebase sanitized App `npx tsc --noEmit` subsequently exited 0; raw `/Users/xzhao/orbit-sprint-evidence/redesign/R18a/run-01/app-tsc-df06f6be4.log`.

### Sanitized App rerun after owned repairs: `8ca061cec`

Same sanitizer/command and exact upstream base `e081084b0`; tree clean for this run. Raw `/Users/xzhao/orbit-sprint-evidence/redesign/R18a/run-01/app-full-8ca061cec.log`. Result: **3180 tests / 3175 pass / 3 fail / 2 skip**, 224609ms, exit 1. The reduction is explicitly accounted for by retiring 170 obsolete route cases and adding seven actual-editor cases; it is not described as 179 product regressions repaired.

The only failures were (1) then-open C-owned `authenticated-client-usage` dependency (`useAccountSettingsApi` direct construction), (2) exact pristine English key count `2813 !== 2253`, and (3) the pristine joined-person merge click timeout. Prior plan-overview skip/undo overlay case passed this complete rerun, supporting timing sensitivity rather than a persistent C-specific failure. No other new failure occurred in this rerun. **That run did not meet SC13 zero-new-failure acceptance:** one C-owned source-audit failure was awaiting a separately authorized shared-hook adapter seam. No exception, shared-hook edit or failed-test deletion was used to conceal it at that checkpoint. The later user-authorized fix and completed frozen final rerun are recorded in the continuation section.

### Production fixture exclusion: initial failure and bounded correction

Sanitized local production iOS JavaScript export (no native rebuild/install), with `EXPO_NO_DOTENV=1`, `EXPO_NO_TELEMETRY=1`, `EXPO_OFFLINE=1`, `CI=1`, `NODE_ENV=production`, `--no-bytecode --max-workers 1`, exited 0: 2898 modules, 31.66s. Raw `app-production-js-export.log`; output `/tmp/orbit-r18a-prod.xixjHW`. However the 8,253,308-byte emitted JS **contained all three** fixture-only sentinels `account-design-suzuki`, `demo-memory-1`, `demo-google_calendar` (SHA-256 `13c2ed8165ea97dd7763a583727fdcf9098c3a9328cd80ee885acc35819787a1`), so fixture exclusion failed despite successful compilation. Results: `app-production-fixture-exclusion.json`. The shell command's final status was masked by a following status read; classification uses the explicit sentinel booleans, not that wrapper exit code.

Root cause: installed Metro's inline/constant-folding plugins remove the constant early-return condition but leave the following unreachable dynamic import for dependency collection. New pure regression using those actual plugins was RED (2 pass / 1 fail), then GREEN (3/3) after enclosing the import itself in positive `if (__DEV__)`. Development transformation retains the import. Changes stay in private `useAccountDesign.ts` and its existing test; no Metro/Babel configuration or dependencies changed.

Fresh heavy-locked sanitized `npx tsc --noEmit && … expo export --platform ios --no-bytecode --max-workers 1` exited 0 (`app-production-js-export-after.log`). Output `/tmp/orbit-r18a-prod-after.kvChc2/_expo/static/js/ios/entry-cbe984950652ce4694c7cd0e72bb4cec.js`: 8,247,356 bytes, SHA-256 `d5a83044ae960e7be0e880242fd02a9df10150befa463496a723f184514f565a`. Strict sentinel checker separately exited 0: **all three absent** (`app-production-fixture-exclusion-after.json`). The before/after real bundles, not just source inspection, support fixture exclusion. Both temporary exports and raw logs are retained outside git; no native binary/rebuild/install or provider contact occurred. The most recent complete App suite remains the explicitly versioned `8ca061cec` run before this two-file loader/regression correction; the new regression3/3, final typecheck0 and real export/sentinel0 verify this bounded follow-up. No newer full-suite result is invented.

### Legacy profile coverage mapping (before retirement)

The old 170-case suite mixed old overview/inline-editor UI with useful behavior invariants. It was retired only after the coverage mapping below, a fresh retained behavioral subset (45/45), and the new actual editor-hook regressions completed. Historical observations stay historical; removed assertions are not transferred as runtime evidence. Retirement count: one old-only file / 170 old-route cases removed; seven actual-editor cases added; all six generic primitive cases preserved (only dead SectionHeader fixture/import/one component-specific assertion removed). Earlier SC10's three retired old-only files and twelve mixed-suite cases remain separate from this follow-up count.

Harness correction, not product evidence: the first `me-editor-controller` run observed one genuine unchanged-draft write, then stalled because Playwright awaited the value of an assignment to a deliberately pending save Promise. Only that owned runner was terminated after about 40 seconds; no C descendants remained. The helper now ends evaluation with `undefined`, and every case has a 15-second timeout. The interrupted raw `app-editor-controller-red.log` is not a completed seven-case RED result. Bounded rerun is recorded separately. Per the self-improvement workflow this local lesson is kept in the authorized Sprint report rather than creating out-of-scope repository/global learning files.

Bounded RED (`app-editor-controller-red-bounded.log`): 7 tests / 3 pass / 4 fail, 4.71s. Four genuine private-editor defects were then fixed only in `useAccountEditor.ts`: unchanged drafts wrote; a matching late receipt cleared a newer local edit; an old pending scope blocked the next scope; random-source failure escaped instead of visible feedback. The hook now validates the latest stored draft, permits only dirty saves, retains a changed draft on late receipt, resets/owns per-scope busy/finalizer state, rejects stale callbacks before writing, and reports mutation-ID creation failure. GREEN (`app-editor-controller-green.log`): seven editor cases plus all six generic primitive cases, **13/13**, 4.92s. Generic primitive build still emits an existing safe-area optional-export warning; no assertion failed. Owned token/private-route audits separately went RED (2 failures) → GREEN **13/13**. Latest heavy-locked typecheck after these corrections exited 0 (`app-tsc-editor-followup.log`). The full-suite rerun was then pending; the completed `8ca061cec` result is recorded above.

| Old behavior family | Replacement / retained evidence | Boundary |
| --- | --- | --- |
| Private auth, inactive route, actor isolation | `me-auth-boundary`, `mobile-route-access`, `me-controller-states`; real shared private wrapper and scoped reads | Old inline login card/navigation strings retired; no auth boundary weakened |
| CAS version/mutation identity, retry, dirty draft, profile identity | `profile-edit-session`, `profile-completion-interactions`, `me-suggestions-api`; `me-editor-controller` actual hook cases | Verified no-op/offline, single-flight/retry identity, invalid receipts, late edits, old callbacks/pending scope and random-source failure before retirement |
| Confirmed onboarding metadata and safe completion destination | `me-completion-compatibility`, retained `profile-completion-interactions`, `profile-onboarding-api`, `profile-continuation-route` | No score-based inference; R28 birth-date flow unchanged |
| Extraction review, selected fields, save before accept, malformed/HTTP failures | `me-suggestions-model`, `me-suggestions-api`, retained profile/onboarding schemas and APIs, `me-scan-cancellation` | Binary parser not claimed; old filename-only picker/inline editor controls retired |
| Current overview, independent summary failure, public preview and navigation | `me-account-api`, `me-profile-render`, `me-account-interactions`, `me-controller-states`, `profile-public-projection` | Old contact/task/schedule three-column counters no longer exist in approved layout |
| Current error/offline/copy/disabled states | `me-secondary-render`, `me-suggestions-render`, `me-offline-notice`, `offline-pages-profile-events`, `me-controller-states` | New retry/state behavior checked; native and pixel evidence still pending |
| Old service rationale/old copy and inline source-label presentation | Retained `profile-suggestions-view-model`, `mobile-profile-view-model`, `profile-view-model`, schema tests | Historical strings are not imposed on the new approved UI |

## Data / compatibility

- `completeness.card` is optional: score plus `{ key, weight, done }[]`; keys are `companyRole`, `offering`, `seeking`, `intro`, each 25. Company/role completes only with both values. Legacy six-field score remains unchanged. Old server fallback displays legacy score without fabricated missing rows.
- Optional `publicFields` = companyRole / offeringSeeking / intro. Missing defaults visible. A legacy PUT omitting it preserves stored choices. Email and telephone never appear in public projections.
- JSONB storage needed no migration. Narrow PG actor projector includes the new field; isolated DB regression caught the initial projection omission.
- App edit-session APIs retain defaults for R28. Additive draft `publicFields` is copied on save; optional scope `sessionId` isolates development variants, while production actor/origin keys retain previous behavior. Optional hook `path` defaults to `/api/profile`.
- Canonical `demoAccountEventSummary` is `{ hosted:2, active:1, attending:2 }`, sourced from b5 #16/#20 and b12 S30; unread states are 0 / 5 / 5. These are development display fixtures, never live aggregations. Disconnected integration fixture records use `pending`, not unsupported/unavailable.
- App snapshot is generated by `node --import tsx scripts/sync-account-design-fixtures.mts` from canonical account/index data. Runtime import is behind `__DEV__` plus valid profile design variant. Initial production export exposed bundled fixture data despite the runtime early return; positive-branch correction, real production export and strict sentinel exclusion verification are recorded above.
- Live summaries use existing inbox unread total, host center summary and events/mine upcomingCount. Independent failures hide their rows, and attending count zero hides its row.
- App completion mode still requires the existing confirmed `onboarding.status === "complete"` metadata. Neither the legacy score nor the new card score grants completion; offline data cannot trigger the completion redirect. Incomplete onboarding links to the existing R28 route without changing it.

## App SC10 checkpoint

- Removed the eleven replaced profile/settings screen and primitive files listed in PLANNER §8, plus the orphaned old `SectionHeader` after the existing ratchet proved it had no remaining consumer. Retained R28 models/hooks and the R14 notification delivery/discovery components.
- Retired three old-screen-only test files and twelve obsolete UI cases in mixed suites; preserved and adapted the real push-registration, logout and notification race/service cases. Historical runtime observations are not transferred to new handlers.
- Three old-pattern allowlists only shrink; the new `src/screens/me/` directory has zero allowances. Route parity gains only the approved known one-segment settings fallback, with exact static routes taking precedence and unknown/deeper/global patterns rejected.
- Updated offline route/endpoint registries and generated the then-120-route page inventory (121 after the upstream showcase split was preserved during rebase). The settings envelope adapter lives separately from endpoint calls, so all actual endpoints remain audited. Latest transport audit: 0 unregistered / 0 invalid.
- Private canonical fixture snapshot moved from screen source to `fixtures/account-design.ts`; runtime remains guarded by development mode and a valid design variant. No hardcoded-copy allowance was added.
- Focused App account, suggestions, route, inventory and ratchet run: 70 tests / 70 pass / 0 fail. Retained service/appearance regression run: 37/37. The later editor render check caught a JSX return/newline regression introduced while splitting audit controls onto separate source lines; fixed at source and the combined render/compatibility tests pass. `git diff --check` is clean.
- Filtered full-product mobile-settings audit: 1/1 pass (74.3s inventory build). It requires direct account/integrations/iOrbit controls and scoped router wiring; actor-isolation assertions are unchanged. Only the App hunk was staged by this owner; worker Web hunks remained separate.
- Replacement offline-copy browser check: first run failed before assertions because the old harness lacked the existing kit native-module stubs (five React Native Flow parse errors). Adding the same `nativeUiStubs` plugin used by the component harness fixed that test boundary. Fresh heavy-locked rerun: 1/1 pass in 1.75s; real my page and preview show timestamped offline copy without POST/PUT. Latest App typecheck/full suite were then pending; subsequent completed runs are recorded above. Native simulator and pixels remain pending.
- Latest lightweight App account/route/ratchet checkpoint: 79/79 pass in 4.88s, separate from Chromium. Auth/scan/existing onboarding API regression subset is 15/15. The first latest App typecheck found one owned test-fixture nullable-set error; narrowed with the existing route-filter pattern, route parity 10/10, fresh heavy-locked App `npx tsc --noEmit` exit 0.
- SC11 Chromium: four real presenter interaction tests green (editor → visibility-filtered preview, language/appearance/destinations, selected suggestion/filter controls, nested share without surrounding editor navigation). Seven controller cases were RED before changes: missing memory retry, previous-scope memory/suggestion leakage, false-empty suggestion load, retained OAuth busy state, dropped remaining candidates and skipped device semantic preference in design mode. All eleven pass after bounded fixes in four private controllers (7.54s). The semantic case first used an unavailable RNW checked attribute; corrected to assert actual stored `on/off`, observed genuine RED (`off` instead of `on`), then GREEN. No native/provider/model calls or native accessibility claims are implied by these browser mocks.

## Outstanding acceptance / coordinator decisions

### SC status (not a completion declaration)

| SC | Evidence-backed status | Still required |
| --- | --- | --- |
| 01 | Pristine baselines, isolated local PG, standalone approved board amendments; adopted §C-1 in-place changes and 8 before/after rendered preflights completed; bounded local binary build0 with clean guards | Native install/auth/operation evidence still OPEN; no pixel acceptance |
| 02 | Additive contracts, canonical fixtures, sync/snapshot and isolated PG regressions verified | Independent rerun |
| 03 | App my page and summary/candidate API/render checks green; Chromium candidate accept→completion→dismiss and nested share verified | Simulator interaction evidence |
| 04 | App editor/public preview/tags and CAS/visibility regressions green; real presenter controls update the filtered preview; actual editor-hook save/receipt/race7/7 | Simulator and b1 style-diff |
| 05 | Three effective language/appearance options, available OS actions, private auth and dev-route guard verified in focused checks; native calendar dependency explicitly deferred by continuation | Native OS/logout/language interaction evidence |
| 06 | Private integrations/memory/semantic adapters, retry/scope, pending-OAuth reset and device preference restoration green; native→Web path6/6 and actual RNW confirmed disconnect/memory-delete/browser-return operations10/10 | Native evidence OPEN; Japanese live drafting remains G18-hidden |
| 07 | Web owner route/UI checkpoint and targeted tests recorded above | Width-specific browser operation and later pixel evidence |
| 08 | Web owner secondary settings implementation; unsupported agent UI removed | Owner final behavior/full verification matrix; native-independent provider tests, language/appearance two-entry proof |
| 09 | Both implementations committed; App reviewed selected-field save-before-ack regressions green; continuation restricts résumé to supported text input/files, not PDF/DOCX | Browser input/selection and state-boundary evidence |
| 10 | Old owned screens deleted, allowlists shrink, routes/inventories/audits checked; mapped old-profile suite retired; generic mixed browser6/6 and replacement offline1/1; authenticated-client audit passes frozen final full | Remaining independent review |
| 11 | App auth/private routes, offline disabled states, retry/scoped state, no false-empty reads and actual RNW operations verified; capture race corrected by condition wait2/2 and both dialogs visually inspected | Native state evidence and remaining independent review OPEN |
| 12 | Waiting R31a / R31b; no gate started or passed | Entire §9.2 matrix plus R05/R07/R17 regressions, raw/bands/attribution/compare evidence |
| 13 | Frozen0bab App typecheck0 / full3191 with exact2 pristine failures only / copy103/0; hook focused46/46; prior actual production fixture exclusion0; scope ledger129 exact; narrow coordinator reviews found no blocker | Web full/lint/final checks, post-run integration rebase assessment and remaining independent review; native/pixels OPEN |

1. **Native calendar capability explicitly deferred.** User continuation adopted no dependency/rebuild; it is not an implemented capability or a remaining approval question in this Sprint. Camera and notification OS state/request/openSettings are implemented; unavailable calendar row is hidden rather than using OAuth records as OS state. Native operation of the available permissions remains unverified.
2. **Japanese AI drafting/candidates unmet live.** Intro and seeking services select `en`, otherwise `zh`; sending `ja` silently produces Chinese. Japanese live actions/candidates are hidden (G18); development/mock fixtures retain approved Japanese states. Backend Japanese support request; no paid model is called by tests.
3. **Native OAuth uses the approved Web fallback.** Native opens Web `/app/settings/integrations`, then refreshes on foreground/browser return; Web retains the existing provider authorize URL with signed `returnTo=settings`. A native callback/auth-cookie/session handoff is not claimed. Pure routing is verified; real native browser/OS operation remains OPEN. Test provider/development state transitions only; never real Google.
4. **Résumé scope is supported text only.** User continuation adopted the existing extraction capability: text files/pasted text and existing own-card scan → extraction → review. PDF/DOCX bytes are not parsed or offered by the App picker. Binary parsing is not claimed or an in-Sprint dependency request.
5. **Original b7 contradiction amended under continuation authority.** Unsupported undo/history promises are removed in place from #46–51 and operation annotations; no undo UI/contract is added. Before/after rendered preflight found identities/dimensions unchanged and unsupported visible rules5→0; this is not pixel acceptance.
6. **Integration board data gaps amended.** Authorization exposes health/lastCheckedAt, not actual sync timestamps, Gmail thread counts or meeting counts. The adopted b5/b12 amendment removes those claims; lastCheckedAt is not relabeled as sync time.
7. **Goal board data gaps amended.** Live goal uses v2 summary and existing plan destination. The adopted b5/b12 amendment removes unbacked budget/deadline/week/progress/subgoal details rather than inventing live fields.
8. **Seek rationale absent.** seek-suggestions returns strings only; rationale row is omitted. No invented explanation.
9. **Memory settings toggle absent from source board.** Existing memory/settings API remains, but no unapproved toggle is added. Sources are only manual / conversation (メモ / iOrbit との会話).
10. **Pixel / component gate pending.** R31a/b must land before SC12 closure. App edit/tag and unsupported-dark boards require evidence/style-diff, not invented design gates. Existing RingChart normalizes segment totals; private presenter uses remaining segment without editing A-owned component. Component API/ring fidelity remains a handoff.

## Handoffs (pending final audit)

- R14: `/settings/notifications` and `/app/settings/notifications` dynamic preparing routes yield to later static routes. Push registration logic stays; old delivery/discovery setting components remain for R14 to reconnect, not on settings UI.
- R18b: help/terms/privacy preparing paths; no paid-plan/NFC capability added.
- R18c: App `/account` remains existing screen; export is preparing; Web data-export/account-delete inline links hidden until R18c.
- R28: optional contract and edit-session changes above; reused private account editor/content avoids altering R28 screens. Web model re-export/editor-hook relocation status owned by parent.
- R13: App inbox row is in private `MyPageContent`, removable once home bell handoff R13-02 is ready.
- D: shell mapping/OAuth prerequisite hashes above; request language preference synchronization in shared language context (page calls existing setter only). No D file edits.
- A: private AccountRow and field/diff presenters may be component candidates; no token/component edits. R31 blocked/missing-design inventory still to be finalized.
- R20a: Web authorize uses signed `returnTo=settings`; native uses the approved Web settings fallback. Disconnect uses confirmed DELETE and exact receipt validation. No new native callback contract is introduced.
- R15 public preview: coordinator decision is to honor R18a `publicFields` in the pre-redemption `/i/<code>` preview projection (`features/invite-codes/service.ts:433–450`, `includeContact:false`), in addition to invite `sharedKeys`. R15 must design/test that preview-layer projection. Do not filter `inviteProfileFromPayload` globally: `service.ts:477/495/535` / `placePeer` reuse it for explicit redeemed-contact sharing, whose separate shared-key consent remains pending R15 review. No R15 file was edited. `features/events/journey/live.ts:302` reads self bio and is not evidence of public exposure; other public event-card consumers still require owner review.
- Coordinator docs: request decide-table §C-1 approved amendments + 17 supplemental boards; HANDOFF §R18/R17-03/04/R13-02/R30-06 status; screen-ownership account row and profile/suggestions→R18; README Sprint registry R18a. Central coordination documents are not edited by C.

## Remaining work

Latest upstream Web-only tooling is cleanly integrated and native prerequisites assessed above. Execute the bounded, generated-artifact-only native verification after coordinated heavy gates; SC03–06 simulator operation records are distinct from SC12 pixels and remain OPEN until actually collected. SC11 native state evidence, SC12 gated pixels, SC13 Web final suites/typechecks/lint/copy and remaining independent review also remain OPEN. App final typecheck/full comparison and scope ledger are explicitly versioned above; the full suite has its exact2 pristine failures, not a passing exit.

## 改稿与补画清单

SC01 `5550d1582` changed only approved b5 amendments (Pro / NFC removal, four-field completion, unsupported metrics and integration copy) and appended b12 S01–S04, S10–S14, S20–S25, S30–S31: 17 light/dark pairs, 34 frames. Original board IDs and the original b12 prefix were preserved. Exact frame titles/source mappings and five preflight conclusions are in `preflight-checklist.md` and `scripts/visual/views/{web,app}-R18a.json`. Coordinator review of amended/supplemental boards remains required; no pixel approval is implied by preflight.

Subsequent user-adopted §C-1 in-place b5/b7 amendments and matching b12 helper updates are listed above and appended to the preflight checklist. They supersede the original-board hold, without retroactively claiming the original SC01 checkpoint had changed b7. App suite state URLs now match canonical runtime fixture inputs; rendered preflight completed, while native/pixel gates remain OPEN.

## 请求

- Backend owners: genuine Japanese intro/candidate support is still absent (G18 hides live Japanese actions). Binary résumé parsing is outside the adopted supported-text scope, not required by this continuation.
- D / R20a: native uses the approved Web settings fallback; a later native OAuth session/callback contract would require separate review. Existing signed Web return destination is not native round-trip proof. Language preference synchronization belongs in the shared language context, not a second page-specific writer.
- A: consider private `AccountRow`, field/diff presenters and copied offline notice for later consolidation; EmptyState currently cannot disable its action. R18a uses a page-private disabled-button fallback in the offline empty state, without editing the kit.
- R15: preview-layer visibility policy described above. R28: adopt optional publicFields/session scope and the preserved confirmed completion gate; no R28 screen/route was edited.
- Shared App hook request (subsequently authorized): the private settings client needs existing `settingsFetch` normalization *before* Orbit client parsing because integrations/memory endpoints return legacy `{data}` / 204 envelopes. Authorization was initially withheld and the failed source audit remained explicit in historical full results. User continuation later approved the optional adapter seam and settings migration described above; audit now passes focused regressions and the frozen final full without an exception.

## 待主会话代定

The earlier questions are now decided by explicit user continuation: amend unsupported b7 undo/history and b5 no-API metrics in place, use only supported résumé text files, defer native-calendar dependency, and fall back from native OAuth to Web settings. These are adopted scope decisions, not newly implemented native/parser capabilities. Rendered amendment preflight completed and coordinator diff review found no blocker; native/pixel acceptance remains OPEN. No unresolved copy/data ambiguity is silently converted into a feature.

## 待用户授权

No production/Neon, real Google, deploy, TestFlight, paid AI, push or new native dependency action was performed. The subsequently authorized existing-dependency local binary build completed as recorded above; native calendar dependency/rebuild remains explicitly deferred and was not added. Coordinator also approved the guarded isolated local fixture/install path, not yet executed at this checkpoint. Package/dependency changes, real accounts or provider calls still require a separate decision; none is inferred from that verification authority.

## 交接表追加（逐行四栏原文）

Coordinator should append these to the central handoff document; C does not edit that concurrently owned document.

| 接收方 | 位置 / 当前状态 | 后续动作 | 删除条件 / 验证 |
| --- | --- | --- | --- |
| R14 | App `/settings/notifications`, Web `/app/settings/notifications` currently preparing | Add exact static routes; reuse retained notification delivery/discovery components | Exact routes supersede dynamic fallback; push service/race regressions must remain green |
| R18b | `/settings/help`, `/settings/terms`, `/settings/privacy` and Web equivalents | Replace preparing pages; retain approved hidden Pro scope | Exact static routes override preparing fallback |
| R18c | App `/account` retained; export preparing; Web appearance export/delete links hidden | Implement data rights/account and rerun W-R18a-P08 whole board | Remove temporary hidden state only with R18c implementation |
| R28 | Optional card/publicFields and edit-session scope; confirmed completion metadata preserved | Reuse private editor/content; migrate old profile-model re-export consumers | Delete compatibility re-export only when no R28 import remains |
| R13 | Inbox row in App `src/screens/me/MyPageContent.tsx` | Remove it after R13-02 home-bell handoff | Preserve unread endpoint behavior until replacement is verified |
| D / R20a | Signed `returnTo=settings`, exact revoked-provider DELETE receipt | Integrate prerequisites; decide native callback and shared locale synchronization | Test provider/session round trip, not real Google in R18a tests |
| R15 | Public invite preview currently uses invite shared keys | Apply publicFields at preview projection only | Preserve explicit redeemed-contact shared-key consent; preview privacy tests required |
| A / R31 | Private account presenters; component-dependent pixel checks pending | Review kit fidelity, disabled EmptyState action and component candidates | Run R18a §9.2 plus R05/R07/R17 regression gates after component commits |

## 文档更新请求

Coordinator: append PLANNER §2 decisions and §9.1 amendments / 17 supplemental pairs to decision table §C-1 with label「主会话代定」; update HANDOFF §R18, R17-03/04, R13-02, R30-06 only to evidence-backed statuses; update screen ownership account and profile/suggestions to R18; add R18a registry row as incomplete / waiting components until functional gaps and gate evidence close. Do not mark all SC done from focused tests.

## 越线自查（进行中）

`git diff --stat origin/redesign...HEAD` inspected after SC10 and again on the cleanly rebased branch. New runtime UI stays under private App `screens/me/**` / Web `orbit-2026/account/**`; old screens, approved route entries, additive profile contracts/storage, canonical fixtures, dictionaries and corresponding tests/registries are in scope. Mechanical test-infrastructure changes preserve existing callers. Two bounded dependencies not literally named in PLANNER §1 were surfaced to coordinator and accepted: (1) `src/api/profile-onboarding.ts` adds only optional `signal?: AbortSignal` to `scanOwnBusinessCard` and conditionally passes it to the existing client POST; old request body, path and no-signal calls remain unchanged (new cancellation regression + existing onboarding API suite 9/9); (2) `SectionHeader` deletion is the ratchet-required orphan removal after its last owned consumer was deleted. No blanket “all files named in §1” claim is made. No A kit/token, D shell/OAuth, R14 retained component, R18b/c screen, R28 onboarding screen, other worktree or central coordination document was edited by this owner. D prerequisite commits were made separately by coordinator, not included as C edits. The App ledger below was checked against the post-rebase branch diff; Web/contracts outside the App copy remain coordinator-owned ledger work.

Continuation exception, explicitly user-authorized: `repos/orbit-app/src/hooks/useOrbitApiClient.ts` is outside the original §1 allowlist. Only an optional fetch-adapter parameter was added so legacy settings responses can be normalized before authenticated client parsing; old caller defaults and the existing scoped response guard are retained. Regression coverage is in `tests/orbit-api-client-adapter.test.tsx`; only `screens/me/useAccountSettingsApi.ts` consumes the new option. This is not retroactively described as an originally named §1 file.

### App file-by-file scope ledger (working checkpoint)

Source: `git diff --name-status e081084b0 -- repos/orbit-app` plus owned new tests; the previous editor/SC10 checkpoint was 127/127. The authorized shared hook and its new regression add two paths below; final ledger count will be rechecked after continuation. `A/M/D` describe the branch diff, not acceptance status. Web/contracts outside the App copy remain coordinator-owned ledger work.

| Change | App-relative path | Scope / reason |
| --- | --- | --- |
| M | `app/(app)/profile.tsx` | §1 owned route; private auth / exact preparing fallback |
| M | `app/account/permissions.tsx` | §1 owned route; private auth / exact preparing fallback |
| M | `app/profile/edit.tsx` | §1 owned route; private auth / exact preparing fallback |
| M | `app/profile/more.tsx` | §1 owned route; private auth / exact preparing fallback |
| M | `app/profile/preview.tsx` | §1 owned route; private auth / exact preparing fallback |
| M | `app/profile/suggestions.tsx` | §1 owned route; private auth / exact preparing fallback |
| M | `app/profile/tags.tsx` | §1 owned route; private auth / exact preparing fallback |
| M | `app/settings.tsx` | §1 owned route; private auth / exact preparing fallback |
| A | `app/settings/[section].tsx` | §1 owned route; private auth / exact preparing fallback |
| M | `app/settings/api.tsx` | §1 owned route; private auth / exact preparing fallback |
| A | `app/settings/integrations.tsx` | §1 owned route; private auth / exact preparing fallback |
| A | `app/settings/iorbit.tsx` | §1 owned route; private auth / exact preparing fallback |
| M | `docs/designs/2026-09-08-app-wide-style/README.md` | HOW-TO §7 canonical route/offline registry; historical evidence not transferred |
| M | `docs/offline/page-inventory.md` | HOW-TO §7 canonical route/offline registry; historical evidence not transferred |
| A | `fixtures/account-design.ts` | Canonical development-only snapshot/generator; zero new copy allowances |
| M | `scripts/audit-offline-read-surfaces.ts` | SC10 route and endpoint audit registration |
| M | `scripts/page-offline-inventory.ts` | SC10 route and endpoint audit registration |
| A | `scripts/sync-account-design-fixtures.mts` | Canonical development-only snapshot/generator; zero new copy allowances |
| M | `src/api/contract/index.ts` | SC02 additive generated contract/schema copy and barrel append |
| M | `src/api/contract/profile.ts` | SC02 additive generated contract/schema copy and barrel append |
| M | `src/api/profile-onboarding.ts` | Bounded optional scan cancellation; coordinator accepted; 9/9 API regressions |
| A | `src/api/schema/profile-account.ts` | SC02 additive generated contract/schema copy and barrel append |
| D | `src/components/SectionHeader.tsx` | SC10 orphan deletion required by existing ratchet; coordinator accepted |
| M | `src/data/offline-read/route-domain-inventory.ts` | SC10 owned endpoint retirement/registration; no unrelated policy rewrite |
| M | `src/data/profile-edit-session.ts` | §1 additive profile edit-session compatibility |
| M | `src/hooks/useOrbitApiClient.ts` | Explicit user continuation approval: additive optional fetch adapter, unchanged old callers/scoped guard; settings audit dependency |
| M | `src/i18n/copy-kinds.ts` | §1 private me copy and additive dictionary/copy-kind registration |
| M | `src/i18n/en/index.ts` | §1 private me copy and additive dictionary/copy-kind registration |
| A | `src/i18n/en/me.ts` | §1 private me copy and additive dictionary/copy-kind registration |
| M | `src/i18n/ja/index.ts` | §1 private me copy and additive dictionary/copy-kind registration |
| A | `src/i18n/ja/me.ts` | §1 private me copy and additive dictionary/copy-kind registration |
| M | `src/i18n/zh/index.ts` | §1 private me copy and additive dictionary/copy-kind registration |
| A | `src/i18n/zh/me.ts` | §1 private me copy and additive dictionary/copy-kind registration |
| A | `src/screens/me/account-api.ts` | §1 new private account UI / transport / state |
| A | `src/screens/me/account-model.ts` | §1 new private account UI / transport / state |
| A | `src/screens/me/account-response.ts` | §1 new private account UI / transport / state |
| A | `src/screens/me/AccountCopyNotice.tsx` | §1 new private account UI / transport / state |
| A | `src/screens/me/AccountEditorContent.tsx` | §1 new private account UI / transport / state |
| A | `src/screens/me/AccountEditScreen.tsx` | §1 new private account UI / transport / state |
| A | `src/screens/me/AccountIntegrationsContent.tsx` | §1 new private account UI / transport / state |
| A | `src/screens/me/AccountIntegrationsScreen.tsx` | §1 new private account UI / transport / state |
| A | `src/screens/me/AccountIorbitContent.tsx` | §1 new private account UI / transport / state |
| A | `src/screens/me/AccountIorbitScreen.tsx` | §1 new private account UI / transport / state |
| A | `src/screens/me/AccountPreparingScreen.tsx` | §1 new private account UI / transport / state |
| A | `src/screens/me/AccountPreviewContent.tsx` | §1 new private account UI / transport / state |
| A | `src/screens/me/AccountPreviewScreen.tsx` | §1 new private account UI / transport / state |
| A | `src/screens/me/AccountSettingsContent.tsx` | §1 new private account UI / transport / state |
| A | `src/screens/me/AccountSettingsScreen.tsx` | §1 new private account UI / transport / state |
| A | `src/screens/me/AccountSuggestionsContent.tsx` | §1 new private account UI / transport / state |
| A | `src/screens/me/AccountSuggestionsScreen.tsx` | §1 new private account UI / transport / state |
| A | `src/screens/me/AccountTagsScreen.tsx` | §1 new private account UI / transport / state |
| A | `src/screens/me/MyPageContent.tsx` | §1 new private account UI / transport / state |
| A | `src/screens/me/MyPageScreen.tsx` | §1 new private account UI / transport / state |
| A | `src/screens/me/parts/AccountRow.tsx` | §1 new private account UI / transport / state |
| A | `src/screens/me/permission-action.ts` | §1 new private account UI / transport / state |
| A | `src/screens/me/semantic-preference.ts` | §1 new private account UI / transport / state |
| A | `src/screens/me/settings-api.ts` | §1 new private account UI / transport / state |
| A | `src/screens/me/settings-transport.ts` | §1 new private account UI / transport / state |
| A | `src/screens/me/suggestions-api.ts` | §1 new private account UI / transport / state |
| A | `src/screens/me/suggestions-model.ts` | §1 new private account UI / transport / state |
| A | `src/screens/me/useAccountDesign.ts` | §1 new private account UI / transport / state |
| A | `src/screens/me/useAccountEditor.ts` | §1 new private account UI / transport / state |
| A | `src/screens/me/useAccountPermissions.ts` | §1 new private account UI / transport / state |
| A | `src/screens/me/useAccountProfile.ts` | §1 new private account UI / transport / state |
| A | `src/screens/me/useAccountSettingsApi.ts` | §1 new private account UI / transport / state |
| D | `src/screens/profile/AccountPermissionsScreen.tsx` | §1 replaced screen removal or backward-compatible R28 model/hook |
| D | `src/screens/profile/EditProfileScreen.tsx` | §1 replaced screen removal or backward-compatible R28 model/hook |
| M | `src/screens/profile/profile-page-model.ts` | §1 replaced screen removal or backward-compatible R28 model/hook |
| D | `src/screens/profile/ProfileMoreScreen.tsx` | §1 replaced screen removal or backward-compatible R28 model/hook |
| D | `src/screens/profile/ProfilePagePrimitives.tsx` | §1 replaced screen removal or backward-compatible R28 model/hook |
| D | `src/screens/profile/ProfilePreviewScreen.tsx` | §1 replaced screen removal or backward-compatible R28 model/hook |
| D | `src/screens/profile/ProfilePublicView.tsx` | §1 replaced screen removal or backward-compatible R28 model/hook |
| D | `src/screens/profile/ProfileScreen.tsx` | §1 replaced screen removal or backward-compatible R28 model/hook |
| D | `src/screens/profile/ProfileSuggestionsScreen.tsx` | §1 replaced screen removal or backward-compatible R28 model/hook |
| D | `src/screens/profile/ProfileTagPickerScreen.tsx` | §1 replaced screen removal or backward-compatible R28 model/hook |
| M | `src/screens/profile/useProfileEditSessionScreen.ts` | §1 replaced screen removal or backward-compatible R28 model/hook |
| D | `src/screens/settings/AppearanceOptions.tsx` | §1 replaced settings UI removal; retained R14 components untouched |
| D | `src/screens/settings/SettingsScreen.tsx` | §1 replaced settings UI removal; retained R14 components untouched |
| M | `tests/account-permissions-screen-source.test.ts` | Corresponding regression / retirement / test boundary; no production behavior |
| M | `tests/app-wide-account.test.ts` | Corresponding regression / retirement / test boundary; no production behavior |
| M | `tests/app-wide-primitives.test.ts` | Corresponding regression / retirement / test boundary; no production behavior |
| M | `tests/app-wide-route-coverage.test.ts` | Corresponding regression / retirement / test boundary; no production behavior |
| M | `tests/appearance-preference.test.tsx` | Corresponding regression / retirement / test boundary; no production behavior |
| M | `tests/contract-fixtures-parse.test.ts` | Corresponding regression / retirement / test boundary; no production behavior |
| M | `tests/fixtures/hardcoded-copy-legacy-allowlist.json` | SC10 own legacy allowlist rows only shrink |
| M | `tests/fixtures/ionicons-legacy-allowlist.json` | SC10 own legacy allowlist rows only shrink |
| M | `tests/fixtures/legacy-ui-allowlist.json` | SC10 own legacy allowlist rows only shrink |
| A | `tests/helpers/me-offline-consumers.tsx` | Corresponding regression / retirement / test boundary; no production behavior |
| M | `tests/helpers/offline-page-harness.ts` | Reuse existing kit nativeUiStubs plugin; native Flow boundary fixed, offline Chromium 1/1 |
| M | `tests/helpers/ui-harness.ts` | Corresponding regression / retirement / test boundary; no production behavior |
| M | `tests/i18n-domain-split.test.ts` | Corresponding regression / retirement / test boundary; no production behavior |
| D | `tests/ink-signal-profile.test.ts` | SC10 old inline-route UI suite retired after explicit invariant mapping, retained45/45 and new real-editor7/7 |
| M | `tests/ink-signal-settings-account.test.ts` | Corresponding regression / retirement / test boundary; no production behavior |
| M | `tests/ionicons-ratchet.test.ts` | Corresponding regression / retirement / test boundary; no production behavior |
| M | `tests/legacy-ui-ratchet.test.ts` | Corresponding regression / retirement / test boundary; no production behavior |
| A | `tests/me-account-api.test.ts` | Corresponding regression / retirement / test boundary; no production behavior |
| A | `tests/me-account-interactions.test.tsx` | Corresponding regression / retirement / test boundary; no production behavior |
| A | `tests/me-account-model.test.ts` | Corresponding regression / retirement / test boundary; no production behavior |
| A | `tests/me-auth-boundary.test.tsx` | Actual private-boundary SSR and all 12 owned route-wrapper regressions; no auth/shell edits |
| A | `tests/me-api-settings-boundary.test.tsx` | Corresponding regression / retirement / test boundary; no production behavior |
| A | `tests/me-completion-compatibility.test.ts` | Corresponding regression / retirement / test boundary; no production behavior |
| A | `tests/me-controller-states.test.tsx` | Corresponding regression / retirement / test boundary; no production behavior |
| A | `tests/me-design-fixtures.test.ts` | Corresponding regression / retirement / test boundary; no production behavior |
| A | `tests/me-editor-render.test.tsx` | Corresponding regression / retirement / test boundary; no production behavior |
| A | `tests/me-editor-controller.test.tsx` | Actual private editor-hook/store/receipt regressions; bounded four-case RED then seven-case GREEN |
| A | `tests/me-offline-notice.test.tsx` | Corresponding regression / retirement / test boundary; no production behavior |
| A | `tests/me-profile-render.test.tsx` | Corresponding regression / retirement / test boundary; no production behavior |
| A | `tests/me-route-wiring.test.ts` | Corresponding regression / retirement / test boundary; no production behavior |
| A | `tests/me-scan-cancellation.test.ts` | Corresponding regression / retirement / test boundary; no production behavior |
| A | `tests/me-secondary-render.test.tsx` | Corresponding regression / retirement / test boundary; no production behavior |
| A | `tests/me-settings-api.test.ts` | Corresponding regression / retirement / test boundary; no production behavior |
| A | `tests/me-settings.test.tsx` | Corresponding regression / retirement / test boundary; no production behavior |
| A | `tests/me-suggestions-api.test.ts` | Corresponding regression / retirement / test boundary; no production behavior |
| A | `tests/me-suggestions-model.test.ts` | Corresponding regression / retirement / test boundary; no production behavior |
| A | `tests/me-suggestions-render.test.tsx` | Corresponding regression / retirement / test boundary; no production behavior |
| M | `tests/mobile-route-access.test.ts` | SC10 exact registry adds only three owned private settings entries, preserving shared wrapper checks |
| M | `tests/no-hardcoded-copy.test.ts` | Corresponding regression / retirement / test boundary; no production behavior |
| A | `tests/orbit-api-client-adapter.test.tsx` | User-approved shared-hook regressions: actual hook/client/transport, old callers, cookies and revoked responses |
| M | `tests/notifications/merged-notification-lifecycle.test.ts` | Corresponding regression / retirement / test boundary; no production behavior |
| M | `tests/notifications/notification-registration-races.test.ts` | Corresponding regression / retirement / test boundary; no production behavior |
| D | `tests/notifications/push-notification-settings.test.ts` | Corresponding regression / retirement / test boundary; no production behavior |
| M | `tests/offline-pages-profile-events.test.tsx` | Corresponding regression / retirement / test boundary; no production behavior |
| M | `tests/profile-edit-session.test.ts` | Corresponding regression / retirement / test boundary; no production behavior |
| D | `tests/profile-page-group-interactions.test.tsx` | Corresponding regression / retirement / test boundary; no production behavior |
| M | `tests/profile-public-projection.test.ts` | Corresponding regression / retirement / test boundary; no production behavior |
| D | `tests/profile-screen-source.test.ts` | Corresponding regression / retirement / test boundary; no production behavior |
| M | `tests/profile-view-model.test.ts` | Corresponding regression / retirement / test boundary; no production behavior |
| M | `tests/route-parity.test.ts` | Corresponding regression / retirement / test boundary; no production behavior |
| M | `tests/shell-back-restore.test.tsx` | Corresponding regression / retirement / test boundary; no production behavior |

# R18a implementation report (in progress)

Approved scope: GOAL / PLANNER rev2. Implementation is not acceptance closure: App SC10 verification, interaction evidence, full verification and independent review remain in progress. No pixel closure before R31a / R31b. No production database, real Google, deploy, TestFlight, push, stash or reset was used.

## Baseline and evidence

- C Web pristine: 7475 tests, 6428 pass, 32 fail, 1015 skip. 25 failures explicitly require a missing DB URL; six other failure categories match D. The extra `tests/ui/add-contact-screens.test.tsx` doors assertion (`kit .wmodal.w560`) subsequently passed the correct targeted rerun (2/2, 3.26s). This supports timing sensitivity, not a full-suite pass.
- C App pristine: 3323 tests, 3319 pass, 2 fail, 2 skip. English dictionary historical key count and old joined-person click timeout; same failure count as R30 App (3322 / 2). R30 Web was 7443 / 7. Other Sprint failures are not repaired here.
- Baseline logs: `/var/folders/3q/sc3_n8917jn8w_j_jltbz_xr0000gn/T/orbit-cd-baseline.fk6V4SASy3/{c-orbits,c-app}.log`.
- R18a evidence directory: `/Users/xzhao/orbit-sprint-evidence/redesign/R18a/run-01/`. SC01 preflight and SC02 RED/GREEN logs are there. Later focused command outputs are recorded in the execution transcript; full acceptance logs still pending.
- All full tests, typechecks, builds, browser/simulator pixel work use `_runs/heavy.sh c -- …`. Targeted tests use no heavy lock. Local PG route test explicitly pins `orbit_line_c_test`; no remote fallback is allowed.

## Commits / checkpoints

| Commit | Scope | Verification |
| --- | --- | --- |
| `5550d1582` | SC01: b5 amendments, 17 appended b12 light/dark pairs, suites and preflight metadata | 17 blocks / 34 frames, no inline JS errors, original b12 prefix preserved; preflight before/after, no pixel gate |
| `002eb7ce1` | SC02 additive card/public-field contracts, storage, projections, canonical fixtures, App sync | Web 56/56 including isolated real local PG; App 15/15; contract snapshot/sync |
| `a2fc481f5` | Web dev-only actor+variant GET/PUT profile overlay and legacy route helper | Parent: 14 pass / 0 fail / 14 existing PG-opt-in skips |
| `987fe4bd0` | SC03/04 App my page, editor, preview, tags, CAS/visibility and fixture route plumbing | 33/33 focused tests; new me copy 48 entries / 0 issues; simulator/style-diff not run |
| `75969776a` | SC05/06 App settings, real available OS permission actions, integrations, iOrbit, dev fixture snapshot | App typecheck exit 0; focused 14/14 and prior 27/27; me copy 86 entries / 0 issues |
| `ff91397b6` | Parent Web SC07 account/profile/settings route, card/public preview/CAS edits | Parent: 13 focused tests green; follow-up and SC09 in progress |
| `52b22482e` | App SC09 reviewed live suggestions, selected-field CAS save before queue acknowledgment, extraction review and private fixture cards | New focused 7/7; combined onboarding/API 15/15; App typecheck exit 0; me copy 102 entries / 0 issues |
| `6720e8ebc` | Web worker SC10 old account/settings UI retirement | Worker owns Web evidence; two shared-audit assertion updates deliberately remain separate from the App hunk |
| `5058b417b` | App SC10 screen retirement, route/allowlist/transport/offline audits, completion compatibility | App focused 70/70; retained service/appearance 37/37; transport 0/0; filtered mobile audit 1/1; browser/latest typecheck pending |
| `bcbbcfaf5` | Worker shared-audit Web assertions only | Coordinator confirmed separate Web-only hunk commit |
| `3a3db82d6` | App direct `/settings/api` route development guard, preserving private auth boundary | Actual route tested with undefined/false/true development flags; combined route boundary/coverage/wiring 8/8 |
| `ebc54587c` | App SC11 offline remote-button disabled states; exact integration disconnect receipt regression | New offline cases RED→GREEN; focused secondary/suggestions/settings API 11/11 |
| `58dc2b45e` | App actual private-boundary SSR and optional scan cancellation compatibility regressions | Combined auth/route/scan/existing onboarding API 15/15; all 12 R18a entry files retain private wrapper; no auth/shell runtime edits |

Path-specific commits only. Dirty shared worker trees prevented an immediate pull/rebase; coordinator explicitly approved committing owned paths before rebasing a clean tree, with no stash/autostash. Final clean-tree rebase is still pending. D prerequisites are separate: shell `56da437ef`, OAuth signed `returnTo=settings` `d2aaa6201`; their integration into C must be confirmed by coordinator.

## Data / compatibility

- `completeness.card` is optional: score plus `{ key, weight, done }[]`; keys are `companyRole`, `offering`, `seeking`, `intro`, each 25. Company/role completes only with both values. Legacy six-field score remains unchanged. Old server fallback displays legacy score without fabricated missing rows.
- Optional `publicFields` = companyRole / offeringSeeking / intro. Missing defaults visible. A legacy PUT omitting it preserves stored choices. Email and telephone never appear in public projections.
- JSONB storage needed no migration. Narrow PG actor projector includes the new field; isolated DB regression caught the initial projection omission.
- App edit-session APIs retain defaults for R28. Additive draft `publicFields` is copied on save; optional scope `sessionId` isolates development variants, while production actor/origin keys retain previous behavior. Optional hook `path` defaults to `/api/profile`.
- Canonical `demoAccountEventSummary` is `{ hosted:2, active:1, attending:2 }`, sourced from b5 #16/#20 and b12 S30; unread states are 0 / 5 / 5. These are development display fixtures, never live aggregations. Disconnected integration fixture records use `pending`, not unsupported/unavailable.
- App snapshot is generated by `node --import tsx scripts/sync-account-design-fixtures.mts` from canonical account/index data. Runtime import is behind `__DEV__` plus valid profile design variant. Production-bundle exclusion still needs build verification.
- Live summaries use existing inbox unread total, host center summary and events/mine upcomingCount. Independent failures hide their rows, and attending count zero hides its row.
- App completion mode still requires the existing confirmed `onboarding.status === "complete"` metadata. Neither the legacy score nor the new card score grants completion; offline data cannot trigger the completion redirect. Incomplete onboarding links to the existing R28 route without changing it.

## App SC10 checkpoint

- Removed the eleven replaced profile/settings screen and primitive files listed in PLANNER §8, plus the orphaned old `SectionHeader` after the existing ratchet proved it had no remaining consumer. Retained R28 models/hooks and the R14 notification delivery/discovery components.
- Retired three old-screen-only test files and twelve obsolete UI cases in mixed suites; preserved and adapted the real push-registration, logout and notification race/service cases. Historical runtime observations are not transferred to new handlers.
- Three old-pattern allowlists only shrink; the new `src/screens/me/` directory has zero allowances. Route parity gains only the approved known one-segment settings fallback, with exact static routes taking precedence and unknown/deeper/global patterns rejected.
- Updated offline route/endpoint registries and generated the 120-route page inventory. The settings envelope adapter lives separately from endpoint calls, so all actual endpoints remain audited. Latest transport audit: 0 unregistered / 0 invalid.
- Private canonical fixture snapshot moved from screen source to `fixtures/account-design.ts`; runtime remains guarded by development mode and a valid design variant. No hardcoded-copy allowance was added.
- Focused App account, suggestions, route, inventory and ratchet run: 70 tests / 70 pass / 0 fail. Retained service/appearance regression run: 37/37. The later editor render check caught a JSX return/newline regression introduced while splitting audit controls onto separate source lines; fixed at source and the combined render/compatibility tests pass. `git diff --check` is clean.
- Filtered full-product mobile-settings audit: 1/1 pass (74.3s inventory build). It requires direct account/integrations/iOrbit controls and scoped router wiring; actor-isolation assertions are unchanged. Only the App hunk is staged by this owner; worker Web hunks remain separate.
- Replacement offline-copy browser check: first run failed before assertions because the old harness lacked the existing kit native-module stubs (five React Native Flow parse errors). Adding the same `nativeUiStubs` plugin used by the component harness fixed that test boundary. Fresh heavy-locked rerun: 1/1 pass in 1.75s; real my page and preview show timestamped offline copy without POST/PUT. Latest App typecheck/full suite, native simulator and pixels remain pending.
- Latest lightweight App account/route/ratchet checkpoint: 79/79 pass in 4.88s, separate from Chromium. Auth/scan/existing onboarding API regression subset is 15/15. The first latest App typecheck found one owned test-fixture nullable-set error; narrowed with the existing route-filter pattern, route parity 10/10, fresh heavy-locked App `npx tsc --noEmit` exit 0.
- SC11 Chromium: four real presenter interaction tests green (editor → visibility-filtered preview, language/appearance/destinations, selected suggestion/filter controls, nested share without surrounding editor navigation). Seven controller cases were RED before changes: missing memory retry, previous-scope memory/suggestion leakage, false-empty suggestion load, retained OAuth busy state, dropped remaining candidates and skipped device semantic preference in design mode. All eleven pass after bounded fixes in four private controllers (7.54s). The semantic case first used an unavailable RNW checked attribute; corrected to assert actual stored `on/off`, observed genuine RED (`off` instead of `on`), then GREEN. No native/provider/model calls or native accessibility claims are implied by these browser mocks.

## Outstanding acceptance / coordinator decisions

### SC status (not a completion declaration)

| SC | Evidence-backed status | Still required |
| --- | --- | --- |
| 01 | Pristine baselines, isolated local PG, standalone approved board/preflight amendment commit | Coordinator board acceptance; native simulator/port environment for later gates |
| 02 | Additive contracts, canonical fixtures, sync/snapshot and isolated PG regressions verified | Independent rerun |
| 03 | App my page and summary/candidate API/render checks green; Chromium candidate accept→completion→dismiss and nested share verified | Simulator interaction evidence |
| 04 | App editor/public preview/tags and CAS/visibility regressions green; real presenter controls update the filtered preview in Chromium | Full editor/controller save operation, simulator and b1 style-diff |
| 05 | Three effective language/appearance options, available OS actions, private auth and dev-route guard verified in focused checks | Native calendar capability unmet; native OS/logout/language interaction evidence |
| 06 | Private integrations/memory/semantic adapters, retry/scope, pending-OAuth reset and device preference restoration green in focused/controller tests | Native OAuth return; Japanese live drafting; confirmed disconnect/memory-delete UI operation and native evidence |
| 07 | Web owner route/UI checkpoint and targeted tests recorded above | Width-specific browser operation and later pixel evidence |
| 08 | Web owner secondary settings implementation; unsupported agent UI removed | Owner final behavior/full verification matrix; native-independent provider tests, language/appearance two-entry proof |
| 09 | Both implementations committed; App reviewed selected-field save-before-ack regressions green | Binary résumé capability unmet; browser input/selection and state-boundary evidence |
| 10 | Old owned screens deleted, allowlists shrink, routes/inventories/audits checked; replacement offline Chromium case passes 1/1 | Latest full suite catches remaining stale assertions; retained mixed browser suites |
| 11 | App auth/private routes, timestamped offline copy, disabled remote actions, independent summary failures, retry/scoped state and no false-empty read state verified | Functional screenshots/native state evidence and independent rerun |
| 12 | Waiting R31a / R31b; no gate started or passed | Entire §9.2 matrix plus R05/R07/R17 regressions, raw/bands/attribution/compare evidence |
| 13 | Baselines and focused milestones recorded | Sanitized full comparisons, final typechecks/lint/copy, clean rebase, final scope ledger and independent review |

1. **Native calendar permission unmet.** No expo-calendar dependency or native calendar adapter exists. Coordinator explicitly declined dependency/rebuild expansion. Camera and notification OS state/request/openSettings are implemented; unavailable calendar row is hidden rather than using OAuth records as OS state. Needs a separate native capability decision.
2. **Japanese AI drafting/candidates unmet live.** Intro and seeking services select `en`, otherwise `zh`; sending `ja` silently produces Chinese. Japanese live actions/candidates are hidden (G18); development/mock fixtures retain approved Japanese states. Backend Japanese support request; no paid model is called by tests.
3. **Native OAuth round trip unverified.** App opens existing provider authorize URL with `returnTo=settings`, refreshes on foreground/browser return. D signed callback returns Web `/app/settings`; native auth-cookie/browser/session handoff and native callback are not established here. Test provider/development state transitions only; never real Google.
4. **Binary résumé parser absent.** Existing profile extraction accepts text and filename metadata, not PDF/DOCX bytes. App SC09 supports text files/pasted text and existing own-card scan → extraction → review. Do not claim PDF/DOCX upload parsing; coordinator/backend decision required.
5. **Original b7 undo contradiction.** b7 #46–51 promises undo/history without an API. Original b7 is outside ownership and untouched by coordinator decision. C supplemental copies omit unsupported undo. Request original-board amendment; no undo UI/contract is added.
6. **Integration board data gaps.** Authorization exposes health/lastCheckedAt, not actual sync timestamps, Gmail thread counts or meeting counts. Unsupported metrics are not fabricated; original b5 residual sync-count text needs coordinator amendment. lastCheckedAt is not relabeled as sync time.
7. **Goal board data gaps.** Plan goal/startsOn exist, but no dedicated total-week or subgoal count fields matching b5. Live goal uses v2 summary and existing plan destination; unbacked elements are omitted pending amendment.
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
- R20a: authorize uses signed `returnTo=settings`; disconnect uses confirmed DELETE and exact receipt validation. Native callback dependency above.
- R15 public preview: coordinator decision is to honor R18a `publicFields` in the pre-redemption `/i/<code>` preview projection (`features/invite-codes/service.ts:433–450`, `includeContact:false`), in addition to invite `sharedKeys`. R15 must design/test that preview-layer projection. Do not filter `inviteProfileFromPayload` globally: `service.ts:477/495/535` / `placePeer` reuse it for explicit redeemed-contact sharing, whose separate shared-key consent remains pending R15 review. No R15 file was edited. `features/events/journey/live.ts:302` reads self bio and is not evidence of public exposure; other public event-card consumers still require owner review.
- Coordinator docs: request decide-table §C-1 approved amendments + 17 supplemental boards; HANDOFF §R18/R17-03/04/R13-02/R30-06 status; screen-ownership account row and profile/suggestions→R18; README Sprint registry R18a. Central coordination documents are not edited by C.

## Remaining work

Finish SC10 retained mixed-browser verification, SC11 functional screenshots/native state evidence; SC12 gated pixels; SC13 sanitized full suites/typechecks/lint/copy and independent review. File-by-file ownership self-audit and final command/evidence matrix will be refreshed after the clean rebase. No full-suite success is claimed.

## 改稿与补画清单

SC01 `5550d1582` changed only approved b5 amendments (Pro / NFC removal, four-field completion, unsupported metrics and integration copy) and appended b12 S01–S04, S10–S14, S20–S25, S30–S31: 17 light/dark pairs, 34 frames. Original board IDs and the original b12 prefix were preserved. Exact frame titles/source mappings and five preflight conclusions are in `preflight-checklist.md` and `scripts/visual/views/{web,app}-R18a.json`. Coordinator review of amended/supplemental boards remains required; no pixel approval is implied by preflight.

## 请求

- Backend owners: add genuine Japanese intro/candidate support and a binary résumé extraction capability before those unmet acceptances can close.
- D / R20a: native OAuth session/callback contract; existing signed Web return destination is not native round-trip proof. Language preference synchronization belongs in the shared language context, not a second page-specific writer.
- A: consider private `AccountRow`, field/diff presenters and copied offline notice for later consolidation; EmptyState currently cannot disable its action. R18a uses a page-private disabled-button fallback in the offline empty state, without editing the kit.
- R15: preview-layer visibility policy described above. R28: adopt optional publicFields/session scope and the preserved confirmed completion gate; no R28 screen/route was edited.

## 待主会话代定

Original b7 undo/history contradiction; b5 residual integration sync metrics and goal week/subgoal fields; supported résumé file types; calendar native capability; original board sections with no corresponding API. Recommended treatment: amend only unsupported board claims, keep native/parser capability work in separately authorized dependency tasks. These gaps remain incomplete rather than passed.

## 待用户授权

No production/Neon, real Google, deploy, TestFlight, paid AI, push or native dependency/rebuild action was performed. Native calendar dependency/rebuild was explicitly not authorized by coordinator; do not install it. Native OAuth/provider acceptance needs a separately authorized test setup, not a live provider call during this Sprint.

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

`git diff --stat origin/redesign...HEAD` inspected after SC10. New runtime UI stays under private App `screens/me/**` / Web `orbit-2026/account/**`; old screens, approved route entries, additive profile contracts/storage, canonical fixtures, dictionaries and corresponding tests/registries are in scope. Mechanical test-infrastructure changes preserve existing callers. Two bounded dependencies not literally named in PLANNER §1 were surfaced to coordinator and accepted: (1) `src/api/profile-onboarding.ts` adds only optional `signal?: AbortSignal` to `scanOwnBusinessCard` and conditionally passes it to the existing client POST; old request body, path and no-signal calls remain unchanged (new cancellation regression + existing onboarding API suite 9/9); (2) `SectionHeader` deletion is the ratchet-required orphan removal after its last owned consumer was deleted. No blanket “all files named in §1” claim is made. No A kit/token, D shell/OAuth, R14 retained component, R18b/c screen, R28 onboarding screen, other worktree or central coordination document was edited by this owner. D prerequisite commits were made separately by coordinator, not included as C edits. Final clean-tree rebase and file-by-file scope ledger are pending.

### App file-by-file scope ledger (working checkpoint)

Source: `git diff --name-status origin/redesign...HEAD`, plus current owned App changes; regenerate after final rebase. `A/M/D` describe the branch diff, not acceptance status. Web/contracts outside the App copy remain coordinator-owned ledger work.

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
| M | `tests/no-hardcoded-copy.test.ts` | Corresponding regression / retirement / test boundary; no production behavior |
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

# PW-0012 C / run-01

- Branch: `codex/phoneweb-c-0012`; baseline `ffdb6ec7130140fbe026d0e3de45efdad38f954b`, initially clean existing linked worktree.
- Planner SHA-256: `16212d8f4560fd4245d0d630095d014c5d7c71dccfb74126a331a15b4ef2f640`.
- ROOT explicitly released the Planner's App-only whitelist via Phone coordinator in this same run. No backend/shared/auth/mutation/storage/date/provider edits or true service reads authorized.
- Fresh ROOT graph: canonical index receipt at `6512dfabcdf8bf42c184b0a564b281d4d653c2a3`, indexedAt `2026-09-16T11:24:01.488Z`. Graph is not an exact Phone-branch index. `EventDetailView` UNKNOWN treated conservatively HIGH; actual callers are `EventDetailScreen` and `OwnedEventDetail`. Reported before implementation. Existing `EventDetailScreen` LOW, 1 direct caller; `EventRegistrationModule` LOW, 2 direct callers / 3 affected symbols. New Phone symbols UNKNOWN/HIGH, with actual consumers bounded to the new canonical component, the detail dispatch, and tests.
- Read verified zero-outbound preload; selfprobe fetch/http/https/socket: 4/4 denied before transport, exit 0. Real env/key loading blocked. Local browser transport only for synthetic test execution, no true business GET.
- Affected baseline: existing ink-signal detail and source tests 176/176 passing, exit 0; guard denied=0. New screen RED initially exposes missing canonical dispatch. Test boundary setup being refined so RED is behavior assertion, not setup errors.
- Fixed footer retained. Coordinator and ROOT confirmed opt-in strict allowed-action flag for `EventRegistrationModule` within the released path/SC. Fresh impact LOW (2 direct callers / 3 affected). Legacy expression and default remain unchanged.
- Every canonical registration request must use `questions=false`. Unavailable registration is not ordinary unregistered. Time qualification requires valid server `evaluatedAt`, never device-time fallback. No automatic POST or generation.

## Implementation checkpoint

- TDD: 33 consumer/adapter tests asserted missing behavior RED, then 33/33 GREEN. First screen behavior RED 5 failures / 1 pre-existing pass after boundary setup correction, then initial 6/6 GREEN. Expanded screen coverage: 20 scenarios for exact URL, CTA, published states, queued/running/ready/failed/unconfigured artifacts, HTTP failures and scope revocation.
- Latest affected run before expanded tests: 215/215 PASS, exit 0. Typecheck exit 0 after correcting new-test typing. Final validation results and limits are recorded below and in REPORT-C.md.
- Visual synthetic 390px inspection: fixed disabled footer, unavailable qualification, source-backed facts and explicit future activity state render without clipping. No true server/device/browser session touched.

## Resolved validation setup findings

The self-improvement skill was used after unexpected test setup failures. Its default `.learnings` target is outside this run's exact whitelist, so findings are recorded here instead. No agent/config/skill files were changed.

- `tsx` in this package compiles tests as CJS: use asynchronous `test.before`, not top-level await, for RED dynamic module lookup. Resolved before production implementation.
- Synthetic snapshot boundary must return null and record paths; throwing also breaks the intentionally cached public detail, obscuring behavior RED. Verify canonical personal paths never read snapshots instead.
- Two animation frames do not reliably wait for nested registration → operations requests under concurrent browser tests. Wait for the actual specific rendered result state before asserting it. Initial expanded run 18/20, then 19/20 exposed only those waits; no application error was hidden or converted to success.
- Final expanded screen run: 20/20 PASS. Final consumers/adapters: 34/34 PASS, including backend-permitted empty artifact citations. Final-source typecheck and production export exit 0.
- App-wide run actual exit 1: 3,075 tests, 3,059 PASS, 16 failures all due to unchanged task interaction setup missing `next/server`. Reuse of the coordinator's existing backend node_modules was explicitly allowed; a local ignored symlink now points to `/Users/xzhao/Projects/orbit/.worktrees/phoneweb-main/repos/orbits/node_modules`. No dependency install, lifecycle change or backend source edit. Failed test file rerun: 16/16 PASS, exit 0; no repetition or retroactive passing claim for the original App-wide suite.
- Coordinator feedback supplied two concrete defects; source verification and fresh UNKNOWN/HIGH impact were reported before corrections. Six new behavior cases were RED. Operations now bind `me.participantId` to the validated registration profile, rejecting self-consistent foreign data. Artifact diagnostic codes map to explicit Chinese explanations, including unknown failures. Intermediate 59/60 exposed a wait helper missing the corrected unavailable-state label; final three new test files: 60/60 PASS, exit 0, zero skipped, guard denied=0. Final-source typecheck and production export exit 0. No additional Reviewer/Evaluator was created.

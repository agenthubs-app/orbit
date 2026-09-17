# Sprint 0053 run-01 — Generator local handoff

Status: local code delivered; Sprint NOT completed. Real SC05 and integration remain ROOT-owned and missing.

## Fixed source and scope

- Product commit: `75151e986f0b91b696dda9d9da1dc0e4a467cc33`, branch `codex/sprint-0053-personal-schedule-design`.
- Tree: `/Users/xzhao/Projects/orbit/.worktrees/sprint-0053-personal-schedule-design`.
- Approved initial dependency: `42fcd36208b1291b00371bc2e8777f02ff301e41`; exact approved 0042 replays end at `eb8db3cae0a151c037e4a3247ec723b0078f017e`. No whole Phone ancestor merge.
- Frozen ROOT Planner SHA256: `0976aa58fd1da61b66dc866baf99fc108ac5f6b8929ed964829b03f6161861d8`.
- Product commit exact cached manifest: 43 files, 1117 additions / 85 deletions. Actual cached check passed and no unstaged product diff before commit. `git show --name-status 75151e986` is the exact path inventory.
- AppScreen, notes source/ACL/write lifecycle, shared transaction/store and other-domain UI were not modified. Old PW11 checkout was not edited. No push/merge, real DB/account/service/device actions, env copy or package install.

## Delivered local behavior

Personal v2 opt-in representation, unchanged v1 projection and omission-preserving legacy PATCH; narrow optional canonical URL/relations; calendar allDay/timeZone projection without URL or association leakage. Existing storage, CAS, transaction/retry and mutation receipts remain in use.

App has separate old-ID read-only detail and `/edit`, merged time controls with 30/60/120-minute and local-day/DST behavior, saved-zone/unchanged-second preservation, safe user-click meeting links, cancellation confirmation, fixed safe-area save, and receipt followed by independent authenticated GET before success navigation. Current-owner notes/contacts association selection, removal and unavailable states are implemented.

Web separates read-only detail from editor and requires receipt plus independent GET. Its associated note panel reads current owner-authorized exact ID only on click, clears body on close/scope/record change and discards stale pending publication. No nonexistent global notes route, new note source or notes writes. Unsupported reminders/repeat remain explicitly unsupported.

## Verification and original failures

Evidence is retained under `build/harness-state/evidence/sprint-0053/run-01/commands/` in this tree. These are isolated memory/mock-browser results, not native or real cross-end acceptance.

| Command evidence | Actual result |
| --- | --- |
| `app-final-h.log` | 93/93 before final locale-test repair |
| `web-note-panel-scope-green.log` | 53/53, including pending note response after close/account change |
| `app-once-i.log` | exit1; tests3128, pass3125, fail3, skip0 |
| `web-once-i.log` | exit1; tests3621, pass3356, fail59, skip206 |
| `app-i-locale-repair.log` | complete two direct files24/24, real English/Japanese accessible Cancel |
| `web-i-design-repair.log` | complete design ratchet plus personal direct files54/54 |
| `app-post-i-h.log` | complete eight App direct files80/80 after repair |
| `app-inbox-i-diagnostic.log` | complete unchanged original inbox file15/15, diagnostic only |
| `app-i-repair-types.log`, `web-i-repair-types.log` | both actual tsc exit0 |
| `sync-contract-aggregate.log` | existing contract synchronization succeeded |

Guard denied0 in these checks; no real env/provider outbound. Failed commands and skips remain failures/skips, not retroactively passed.

Original App I failed the old personal-editor back-label source assertion and two inbox `scrollIntoViewIfNeeded` timeout cases (`narrow-large`, `wide-dark`). The two App test files were modified at filesystem mtime `2026-09-17T01:37:31+0900` during original I, after its old-label failure had appeared; the log finished at `01:40:41+0900`. Therefore original App I is NOT evidence for a fully fixed artifact version. Product sources were frozen until both original I handles exited. An earlier approximate time sent to ROOT was unverified and is superseded by these actual mtimes.

Repair1 only narrows the old legacy navigation assertion's applicability and adds real localized cancellation interaction. Inbox source, VM, AppScreen/design and original test have no dependency-HEAD diff or established product causal path to the personal footer. One ROOT-approved complete-file diagnostic passed without changing inbox or timeout. This does not erase the original two failures or establish their cause as pre-existing.

Against `/Users/xzhao/Projects/orbit/.worktrees/sprint-0051-notes-history-lifecycle/build/harness-state/evidence/sprint-0051/run-01/web-I.log`, exact failure-name sets match57; the two new names are button and font-scale ratchets. Same names prove earlier same-named failures, not unchanged causes. D0051-to-dependency-HEAD Web delta is confined to nine personal-schedule paths. Repair2 only applies existing `.btn` and legal title28/time22 scale in the personal module; no threshold relaxation. No repeated I or third repair.

## Graph audit limits

Prior upstream impact was actually run and HIGH shared home/initial-route consumers were announced and inspected before edits. New symbols are UNKNOWN where absent from ROOT's graph.

Actual precommit `detect_changes` with this linked tree failed: repository not indexed. Actual ROOT staged detect returned zero for ROOT only; it cannot audit B's 43-file staged diff. B graph-symbol/flow scope is UNKNOWN, not zero-risk or successful graph verification. No index registration/reindex was authorized. Exact cached/source review and prior symbol impacts are the actual local scope evidence. Approved dependency replay also omitted pre-replay detect; later ROOT zero staged detect is not a retroactive audit.

## Remaining required acceptance

SC01–04 have local implementation and bounded behavior evidence, but their real route/native picker, keyboard/font/language and cross-end matrices are not fully accepted. Local mocked screenshots `app-editor.png` and `app-detail.png` were actually inspected at390x844 against the approved reference; they are not Simulator evidence.

SC05 is missing: ROOT must production-build/restart fixed source, verify build/PID/health/API base, create an authorized same record, exercise PhoneWeb and primary8082 Simulator creation→detail→reschedule→bidirectional new-field readback, complete visual comparison, then safe integration/merged-tree verification and applicable push. B has no authority for those actions. Integration, global ledger/Bridge updates and final Sprint completion belong to ROOT. No optional new provider/recurrence/offline/AI protocol feature is claimed.

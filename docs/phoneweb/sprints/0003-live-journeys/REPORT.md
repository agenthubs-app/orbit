# PW-0003 — Generator report

Status: **partial**. The reusable runner, TDD support layer, screenshots, and 81-route evidence are complete enough to hand off, but SC03 is not complete because the contact candidate was not confirmed/edited and several dynamic or privileged routes lack usable evidence.

## Version and runtime

- Branch: `codex/phoneweb-c-journeys`
- Integrated runtime commit: local `70e09c6b7` (coordinator-provided A commit `5ae75e71a`)
- Planner SHA-256: `46883db0251ea8405de40ea75a41ff1609974640366561cfd8ebb0f37ee9e062`
- Frontend: production export, C-owned `127.0.0.1:32113`
- Backend: coordinator-owned `127.0.0.1:32100`, not restarted by C
- Account: C-only synthetic account; credentials remain outside the repository in a mode-0600 temporary file
- Providers: OpenAI, DeepSeek, Google/Gemini, and Anthropic keys explicitly empty

## Acceptance evidence

| SC | Result | Evidence |
| --- | --- | --- |
| SC01 | Pass with intermittent WebKit risk | Chromium login, five entries, refresh, logout passed. Chromium main screens passed at 360/390/430. WebKit main screens rendered in the combined run except that login failed once; isolated `run-10-webkit-login` then proved retained inputs, callback 200, session 200, and refresh persistence. |
| SC02 | Pass | Note edit/refresh/readback passed on the same ID at version 3 with only content hashes stored. Task creation through Today UI, completion through Tasks UI, and detail/API readback passed on the same ID. Earlier partial failures remain in run directories. |
| SC03 | Partial | Profile edit/readback passed; schedule, inbox, event and AI entry shells were visited. Manual contact entry created a pending candidate but confirmation/edit readback did not complete. No event registration was attempted because no C-owned eligible registration fixture was established. AI workspace/input rendered, but provider generation was intentionally not called and provider-error UX was not separately proven. |
| SC04 | Partial | All 81 rows have an actual status in `route-inventory.md`: 54 rendered shells, 1 Web broker return, 16 missing samples, 9 runtime-error routes, 1 persistent-loading route. Rendered is not treated as business success. |
| SC05 | Partial | Chromium boundary matrix passed and WebKit 390 rendered in captured screenshots; one WebKit login failure followed by a passing isolated replay remains an intermittent risk. No physical-device claim is made. |

## Known gaps and exact boundaries

- Contact: `run-09-contact` reached `contact-confirm-candidate` after the formal manual-candidate UI POST, then failed to locate the confirmation control. The candidate remains unconfirmed; no contact ID/edit persistence claim is made. The manual form's text inputs have no accessible labels in `ContactAcquisitionScreen.tsx`.
- Route errors: document responses were HTTP 200. Runtime-error counts were observed on `/events/[id]`, `/events/[id]/analytics`, `/events/[id]/attendees`, `/events/[id]/operations`, `/events/[id]/operations/admission`, `/events/[id]/operations/check-in`, `/events/[id]/operations/experience`, `/events/[id]/operations/roles`, and `/settings`. Coordinator read-only diagnostics on a separate QA account narrowed dependencies to settings preference GETs returning 404 because that actor is outside `ORBIT_TYPED_INBOX_ACTORS`; event post-event returning 503 because the live service factory has no summary provider/worker; recommendations/readiness returning 404; and operations/admin returning 503 with “尚未配置运营规则”. These are retained as capability/configuration gaps—no mock provider or privilege elevation was used. The C evidence stores counts rather than raw console messages, so it does not claim every runtime error has the same cause.
- Loading: `/profile/edit` was still loading during the linear route sweep; the later dedicated edit/save/readback journey passed, indicating timing/order sensitivity rather than a consistently unavailable editor.
- Missing samples: chat conversation, confirmed contact, contact analysis bucket, contact draft batch/import, inbox conversation/notification/source, invitation token, organizer slug, registration code, appointment, and personal schedule. Note records became available after the recorded route sweep; that later fact does not rewrite the original scan.
- Privilege: operator/admin surfaces were checked with the normal C account. No privilege elevation was used to erase a refusal.
- WebKit: the exact console diagnostic `Viewport argument key "interactive-widget" not recognized and ignored.` is the only allowlisted platform difference. Every other console error and every pageerror remains failing.

## Verification

- `node --test tests/phoneweb-journey-support.test.mjs`: 12/12 passed.
- `node --check scripts/phoneweb-journey-smoke.mjs`: passed.
- `git diff --check`: passed before report finalization and must be rerun before commit.
- `gitnexus detect-changes --scope staged --repo orbit-phoneweb-main`: exit 0 with “No changes detected” because the registered graph points at the coordinator integration tree, not this temporary C worktree; the coordinator must audit the exact cherry-picked patch on that registered tree.
- Evidence roots (ignored): `repos/orbit-app/build/phoneweb/pw-0003/run-01`, `run-02-chromium`, `run-06-note-contact`, `run-09-contact`, and `run-10-webkit-login`.

## Integration handoff

Cherry-pick the final C commit only. Do not treat this report as full Sprint acceptance: the coordinator must retain the contact confirmation/edit gap, inspect the nine runtime errors with raw console/pageerror capture, and decide whether the intermittent WebKit login warrants a repair owner. The C frontend/backend processes and synthetic account are left intact for that read-only follow-up window.

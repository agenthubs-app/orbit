# PW-0003 run-01 checkpoint

- Owner: `phoneweb-C`
- Task: `01a0a899-6206-7900-95f8-54c3137d1b1c`
- Workspace: `/Users/xzhao/.codex/worktrees/97ca/orbit`
- Branch: `codex/phoneweb-c-journeys`
- Baseline HEAD: `0e810c9fd8fb839a05a21cf90fa9139d3c204bf2`
- Planner SHA-256: `46883db0251ea8405de40ea75a41ff1609974640366561cfd8ebb0f37ee9e062`
- Run: `run-01`
- Initial scoped diff: clean
- File lock: this run owns the new phoneweb journey script and direct helper/tests, this checkpoint and final report, plus the real-result column in `docs/phoneweb/route-inventory.md`.
- Runtime lock: port `32113`; it was not started during preparation. The coordinator owns backend `127.0.0.1:32100`; this run will not restart it.
- Account lock: this run registered a distinct synthetic account through the existing `POST /api/auth/register` service (`201`) and stored its unprinted credentials at `/tmp/orbit-phoneweb-20260916/c-credentials.json` with mode `0600`. It will use only this account and its own records; `qa@orbit.test` remains untouched and can stay owned by phoneweb-A.
- Evidence: ignored `build/phoneweb/pw-0003/run-01/`; browser runs must use a fresh Playwright browser and context, with provider keys explicitly empty.
- Current status: route/API investigation and TDD journey-runner preparation are executable; full browser acceptance waits for phoneweb-A's fixed integration SHA.
- GitNexus: bound to the coordinator's registered `/Users/xzhao/Projects/orbit/.worktrees/phoneweb-main` graph (`orbit-phoneweb-main`). New A/B files are supplemented by source inspection, and final staged audit belongs on that registered integration tree if this worktree remains unregistered. No root or temporary-worktree reindex is authorized.

## Runtime findings

- Locked `npm ci --ignore-scripts` installed 702 packages without changing the lockfile. Chromium launches from the shared Playwright cache.
- WebKit launch failed reproducibly because Playwright 1.60 expects cache revision `webkit-2287`, whose `pw_run.sh` was absent. This was a missing locked browser binary, not an App or journey-script failure. Installing only that Playwright-managed revision resolved the probe; a fresh launch opened and closed both Chromium and WebKit with exit 0.
- Integrated coordinator-approved A commit `5ae75e71a` as local `70e09c6b7`; no merge from the shared integration branch was performed.
- Production export completed with 89 static routes. The C-owned same-origin server is still running on `127.0.0.1:32113` against coordinator-owned `127.0.0.1:32100`; all provider keys were explicitly empty.
- Chromium 390 completed login/session refresh and all five main entries. Chromium 360/430 also completed those entries without horizontal overflow. Profile edit persisted and read back through `GET /api/profile`; task create/complete persisted and read back by ID.
- Note UI edit/refresh/readback passed in `run-06-note-contact`, record `note:1b5e510eb6c87d37b1cafc23`, version 3. Earlier `run-01` through `run-05` failures are retained; the final successful evidence records title/body hashes only.
- Contact manual entry reached a real pending candidate in `run-09-contact`, but confirmation control lookup remained unresolved after the bounded two evidence-led corrections. No contact was falsely marked created or edited. Source inspection also found the manual `TextInput`s lack accessible labels, so placeholder selectors were required.
- The first combined WebKit attempt failed during login. A later isolated WebKit run waited for hydration and proved inputs retained, credential callback `200`, `account/me` `200`, and refresh persistence (`run-10-webkit-login`). This is recorded as intermittent risk, not an auth product fix.
- Route scan recorded all 81 inventory rows. Corrected classification: 54 rendered entry shells, 1 expected Web-only broker return to login, 16 missing real dynamic samples, 9 runtime-error entries, and 1 persistent-loading entry. `rendered` means only usable content rendered without the runner's error predicates; it is not a business-flow pass.
- The nine runtime-error entries are `/events/[id]`, seven event operations/analytics/attendee surfaces, and `/settings`; all returned document HTTP 200, while four event operator surfaces also showed business-error copy. Coordinator follow-up on a separate QA account identified concrete dependencies: settings preference GETs returned 404; public event detail rendered, while post-event returned 503, recommendations/readiness returned 404, and operations/admin returned 503 with “尚未配置运营规则”. The C runner retained counts but not raw console/pageerror text, so account-specific JS causes remain unproven. `/profile/edit` remained in a loading state during the C linear sweep although both the dedicated C edit/save/readback and coordinator QA diagnostic passed.
- Direct `/account/login` was initially misclassified as an auth redirect because final-path comparison did not exclude the target itself. The runner and route table now correct this; `/account/mobile-google` returning to login remains the Web-platform result.

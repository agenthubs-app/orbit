# PW-0001 run-01 checkpoint

- Owner: `phoneweb-A`
- Branch: `codex/phoneweb-a-runtime`
- Worktree: `/Users/xzhao/.codex/worktrees/b941/orbit`
- Starting HEAD: `decd5005c9d88a02b59e7dd28403788886534172`
- Required baseline present: `decd5005c9d88a02b59e7dd28403788886534172`
- Starting diff: clean
- Planner SHA-256: `1875e2226db1f18ecfb24ad4a513854e33794ff094090695b5066332a698e3a1`
- Run: `run-01`
- Status: code complete; awaiting main-worktree integration regression
- File lock: A owns Web build/config, browser API/session adapters, `app/_layout.tsx`, phoneweb scripts/tests and this Sprint's records. B-owned layout files and `app/+html.tsx` are excluded.
- Port: `32111`; occupancy was checked before the local server was started. The service is stopped before handoff.
- Live environment: API `127.0.0.1:32100`, isolated database `orbit_phoneweb_20260916`, synthetic account read from the coordinator-owned temporary credentials file without printing values. Provider API keys were explicitly unset for build and live checks.
- Verification: Node `22.23.2`; 89-route production export passed; focused runtime/auth/native-boundary suite passed `81/81`; App typecheck passed; real browser login, cookie restoration after refresh, static and real dynamic deep links, logout, API health and demo asset checks passed with zero page errors and zero `/api/auth/mobile/credentials` requests.
- GitNexus: pre-edit impacts were run for every changed indexed symbol. `normalizeOrbitApiBaseUrl` was CRITICAL, so the shared symbol was not edited; Web platform modules were added instead. Push revocation symbols were HIGH, so the native module was not edited; a `.web.ts` adapter was added. Other edited symbols were LOW. Pre-commit `detect_changes` could not bind this temporary Codex worktree; the registered main worktree must run final integrated detection. A CLI re-index attempt was stopped when the coordinator confirmed the same registration limitation and requested no further tool loop.
- Diagnostics: one initial shell command duplicated the repo path because its working directory was already `repos/orbit-app`; it failed without state changes and was corrected. A quoted URL was used after zsh interpreted an unquoted query string as a glob. Neither incident changed product files or external state.

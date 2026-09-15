# Sprint 0031 run-01 environment

- Recorded: 2026-09-15 JST.
- B-line branch: `codex/b-line-sprint-0031`.
- Planning commit: `1ed6e091b40ebdabc640d1c17a82f83acd00b629`.
- Mainline baseline parent: `c1ba721d13bea4d1100b36064647014f3466adb4`.
- Workspace: linked Git worktree at `/Volumes/ORICO/Dev/MacMovedData/dot-codex/worktrees/8475/orbit`.
- Host: Apple M4, 16 GiB memory, macOS 26.2 (25C56).
- Runtime: Node v25.8.1, npm 11.11.0.
- Xcode: 26.6 (17F113).
- Simulator: `Orbit Sprint 0031 iPhone 17 Pro`, iPhone 17 Pro / iOS 26.4, UDID `19F5DA83-D948-4B8D-8ADB-4D39CA51E8FA`.
- App runtime mode: Release; derived data is stored under `/Volumes/ORICO/Dev/cache` so native compilation does not consume the constrained system volume.
- Web runtime mode: Next.js production build served by `next start` on `127.0.0.1:3108`.
- Measurement protocol: exactly 3 warmups followed by 10 formal samples per scenario.
- Starting free space: system volume 4.6 GiB; `/Volumes/ORICO` 835 GiB.
- Existing services on ports 3000 and 8081–8083 belong to other tasks and are not modified by this run.

## Environment availability

- `ORBIT_EVENT_DATABASE_URL`, `ORBIT_LIVE_DATABASE_URL`, `ORBIT_DATABASE_URL`, `AUTH_SECRET`, and `NEXTAUTH_SECRET`: unset.
- `GEMINI_API_KEY` and `OPENAI_API_KEY`: unset.
- `DEEPSEEK_API_KEY`: set on the host, but all automated performance commands explicitly unset every paid-provider key.
- No repository-local `.env*` file was present in `repos/orbits` at baseline capture.
- A controlled authenticated account/data set is not yet available in this shell. Harness and unauthenticated production-boundary work can proceed independently; authenticated six-journey evidence cannot be marked successful without that environment.

This file records variable presence only. It contains no credentials, cookies, tokens, personal text, provider prompts, or business payloads.

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
- App runtime mode: signed Release Simulator build; derived data is stored under `/Volumes/ORICO/Dev/cache` so native compilation does not consume the constrained system volume.
- Web runtime mode: Next.js production build served by `next start` on `127.0.0.1:3108`.
- Measurement protocol: exactly 3 warmups followed by 10 formal samples per scenario.
- Starting free space: system volume 4.6 GiB; `/Volumes/ORICO` 835 GiB. During the run, inactive Xcode and Chrome code-sign caches were moved intact to `/Volumes/ORICO/Dev/cache` to recover system-volume space.
- Existing services on ports 3000 and 8081–8083 belong to other tasks and are not modified by this run.

## Controlled runtime

- The Web runtime uses the isolated database `orbit_sprint31_perf_20260915` and a controlled QA account. The fixed fixture contains 66 contacts, 80 tasks, 40 conversations, and one note used by the native journey.
- Database/auth secrets are supplied through a mode-600 temporary environment file and are never copied into Sprint evidence.
- `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `OPENAI_API_KEY`, and `DEEPSEEK_API_KEY` are explicitly unset for every automated performance command.
- `/api/health` returned HTTP 200 with `live/ok` throughout baseline App validation.
- The installed App is signed for the dedicated Simulator, authenticated against the controlled account, and built with the exact sample SHA plus `EXPO_PUBLIC_ORBIT_PERFORMANCE_RUN=1`.

This file records variable presence only. It contains no credentials, cookies, tokens, personal text, provider prompts, or business payloads.

## Final safe branch state

- The two inbox-window attempts were measured and then explicitly reverted because the selected App p50 gate did not pass.
- The shared inline-CSS extraction was explicitly reverted after two Web stability comparisons reproduced unselected p95 regressions.
- The final safe branch keeps the measurement infrastructure and the Agent-only Markdown split. It releases `snapshot-store.ts`, `useApiResource.ts`, and App build configuration for Sprint 0032; no Sprint 0031 command remains active against those files.
- A production build of safe branch commit `6a07e66271970b5138ba5173930444ff0bb75759` completed successfully on 2026-09-16 JST. The build was also reproduced from a `git archive` in `/Volumes/ORICO/Dev/cache/orbit-sprint31-web-final-6a07e6627/repos/orbits`, then started with the isolated live environment on `127.0.0.1:3108`; listener PID `31461` returned HTTP 200 with `data.mode=live` and `data.status=ok`.

# Orbit App Agent Rules

This directory is the iOS-first Orbit mobile app.

- Edit only files inside `repos/orbit-app` when implementing mobile app tasks.
- Do not import source files from `../orbits`; use HTTP APIs exposed by `repos/orbits`.
- The sanctioned source-copy channel from `repos/orbits` is `npm run sync:contract`:
  `src/api/contract/` copies pure response types from `shared/contract/`,
  `src/api/schema/` copies runtime validation from `shared/api-schema/`, and
  `src/api/domain/` copies only the approved `industries.ts` and `language.ts`
  dictionaries from `shared/domain/`. Do not broaden that whitelist to other domain
  or feature code. The contract, API Schema, and domain sync tests verify these
  copies. Never edit copies by hand or import the source repository at build time.
- View-models should type their field access against the contract (see `contactField`
  in `src/view-models/contacts.ts`) so a server-side rename fails `npm run typecheck`
  instead of silently yielding empty values at runtime.
- Do not read or write Postgres, Supabase, `orbit_records`, or browser localStorage from the mobile app.
- Keep user-facing copy free of implementation labels such as mock, hybrid, provider, or command-center.
- Do not commit `.expo/`, `node_modules/`, simulator output, screenshots, native build artifacts, or generated logs.
- Prefer rendering tests over source-text assertions. `tests/helpers/render.tsx`
  renders a component through `react-native-web` and returns HTML, so the
  assertion covers what the tree actually produces instead of what the file
  happens to contain. Source-text assertions stay valid for wiring that cannot be
  rendered yet (native modules, provider plumbing); say so in the test when that
  is the reason.
- If a mobile screen needs missing backend behavior, document the API gap instead of duplicating business logic locally.

## Sprint execution

- For Sprint work, first read `docs/sprints/README.md`, `docs/sprints/RULES.md`, and the selected Sprint's `PLANNER.md`. The register's paused/active state and the user's current instruction control whether execution may start.
- Each numbered Sprint uses its document as the Planner and one Generator run. Do not add an Evaluator, self-assessment model call, automatic regeneration loop, or a second implementation agent for that Sprint.
- Follow the Planner's file allowlist and minimum necessary verification. Preserve required impact analysis, TDD, authorization and truthful failure reporting; minimal verification does not mean skipping required acceptance criteria.
- Commit each verified feature with explicit paths, then create the Sprint's `REPORT.md` with actual commit/file/acceptance evidence and remaining work. Do not pre-create completion reports or mark blocked/failed criteria as passed.

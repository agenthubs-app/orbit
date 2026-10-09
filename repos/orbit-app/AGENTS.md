# Orbit App Agent Rules

This directory is the iOS-first Orbit mobile app.

- Edit only files inside `repos/orbit-app` when implementing mobile app tasks.
- Do not import source files from `../orbits`; use HTTP APIs exposed by `repos/orbits`.
- The sanctioned source-copy channel from `repos/orbits` is `npm run sync:contract`:
  `src/api/contract/` copies pure response types from `shared/contract/`,
  `src/api/schema/` copies runtime validation from `shared/api-schema/`, and
  `src/api/domain/` copies only the approved `industries.ts` and `language.ts`
  dictionaries from `shared/domain/`, `src/api/compute/` copies `shared/compute/`, and
  `src/api/design/` copies only the generated `tokens.ts` and `icons.ts` from
  `shared/design/` (redesign R01 / R02, RD-08), and `src/api/copy/` copies the
  three-language standard wording from `shared/copy/` (R03). Do not broaden that whitelist to
  other domain or feature code. The contract, API Schema, domain, compute and design
  sync tests verify these copies. Never edit copies by hand or import the source
  repository at build time.
- Design tokens: `src/design/tokens.ts` builds the React Native structures on top of
  `src/api/design/tokens.ts`. Change colours, radius, type or motion only in
  `repos/orbits/shared/design/tokens.json`, run `npm run design:tokens` there and
  `npm run sync:contract` here. Use the design names (`colors.ink3Text`,
  `radius.xl`, `typography.cardTitle`); `tests/design-legacy-names.test.ts` rejects the
  old names and colour literals.
- Copy (redesign R03): dictionaries are split by key prefix into
  `src/i18n/<locale>/<domain>.ts` (add a key to all three locales); fixed phrases
  (navigation, chips, toasts, confirm, offline / error / loading, draft boundary)
  come from `useStandardCopy()` (`src/i18n/standard-copy.ts`, synced from
  `repos/orbits/shared/copy`). Write no user-visible text in code:
  `tests/no-hardcoded-copy.test.ts` fails on new hard-coded text and only lets the
  legacy counts in `tests/fixtures/hardcoded-copy-legacy-allowlist.json` go down.
  Follow `docs/designs/redesign-2026-10/sprints/R03-copy-and-ja/{glossary,style-guide}.md`
  and run `npm run copy:qa -- --app <domain>` in `repos/orbits` on new copy.
  Unsupported device languages fall back to Japanese; old-screen tests pin the
  pre-R03 Chinese default through `__ORBIT_LEGACY_TEST_LANGUAGE__` (see
  `src/i18n/locale-core.ts`), new tests should not rely on it.
- Icons (redesign R02): draw every icon with `src/components/ui/Icon.tsx`
  (`<Icon name="calendar" />`, names from `src/api/design/icons.ts`, generated from
  `repos/orbits/shared/design/icons.json`). New code must not import
  `@expo/vector-icons`; `tests/ionicons-ratchet.test.ts` fails on any file outside
  `tests/fixtures/ionicons-legacy-allowlist.json`, and that list only shrinks. When
  rewriting an old screen, look up `docs/designs/redesign-2026-10/sprints/R02-icons/icon-mapping.md`
  for the replacement and drop the file from the allow list.
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

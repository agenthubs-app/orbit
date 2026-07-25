# Orbit App Agent Rules

This directory is the iOS-first Orbit mobile app.

- Edit only files inside `repos/orbit-app` when implementing mobile app tasks.
- Do not import source files from `../orbits`; use HTTP APIs exposed by `repos/orbits`.
- The one sanctioned channel from `repos/orbits` is the cross-client contract:
  `src/api/contract/` is a verbatim copy of `../orbits/shared/contract/`, produced by
  `npm run sync:contract` and verified by `tests/contract-sync.test.ts`. Never edit the
  copy by hand, and never import the source directory at build time.
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

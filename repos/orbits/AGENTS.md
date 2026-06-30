# Orbits Agent Rules

This repository is the generated Orbits application. Treat this directory as the
workspace root for implementation work.

- Edit only files inside this repository.
- Use app-relative paths such as `package.json`, `app/page.tsx`, and
  `tests/smoke.test.tsx`; do not prefix paths with `repos/orbits`.
- Never read or write parent-directory paths with `..`.
- Never edit the harness project, including `harness/`, root `tests/`,
  `harness-state/`, `harness-logs/`, `docs/`, or `harness/config.yaml`.
- Never edit `repos/tokyo-business-connect`; it is reference-only.
- Do not create harness artifacts, screenshots, browser traces, eval JSON,
  verification JSON, temp manifests, or logs in this app repo.
- If a requested change appears to require harness code or sprint contract
  changes, stop and report that boundary instead of editing outside this repo.
- When the user sets a thread goal that requires code changes, commit the
  relevant completed changes after the goal is verified. The commit message
  must explain what changed and why so the work is traceable. Do not include
  unrelated user or generated changes in that commit.

## Dev Capability Surfaces

- Routes under `/dev/**`, especially `/dev/capabilities/**`, are internal
  harness validation surfaces. They are not the customer-facing Orbit product.
- Dev capability pages may render success, empty, pending, and failure states so
  the harness can collect deterministic browser/API evidence.
- Do not put business logic, data-shape ownership, provider switching, or mock
  fixtures only inside a dev page. Product routes must be able to consume the
  same typed contracts, services, and API envelopes without importing dev UI.
- When implementing a mock capability, keep the migration path explicit:
  contract/interface -> mock service -> API route -> dev validation surface now;
  app route composition later.
- Do not claim a product workflow is complete just because a `/dev/**` route
  passes. Dev routes prove capability boundaries; `/app/**` routes prove product
  usability.

## Mock-to-Live Component Replacement

- Treat each `features/<module>/service-factory.ts` file as the replaceable
  boundary for that module. Product pages, API routes, and aggregators should
  import module factories such as `createEventCrudAndImportService()` or
  `createOrbitAiCommandService()`, not `createMock...Service()` directly.
- Keep `mock-service.ts` as the deterministic local implementation. Add future
  live work beside the module boundary as `live-service.ts`, `provider.ts`,
  `mappers.ts`, and `validators.ts`, then register it from the module factory.
- Mock and live implementations must satisfy the same `service.ts` interface
  and return the same `contract.ts` DTO shapes. UI code must not branch on
  provider names, environment variables, raw provider payloads, or fixture
  details.
- Use `ORBIT_MODULE_MODE` or explicit test setup for mock, hybrid, and live
  selection. Missing live providers must fail closed with the shared
  `NOT_IMPLEMENTED` service-resolution shape instead of falling through to an
  undeclared provider.
- When teams split work by module, each team owns its `features/<module>/`
  contract, service interface, factory, provider mapper, tests, and live
  implementation notes. Cross-module edits should happen through typed service
  interfaces, not by importing another module's fixtures.

## Product UI / Contract Decoupling

- Product route components under `/app/**` should render page-specific view
  models instead of feature contract DTOs directly. Keep `features/<module>/*`
  contract/result/payload imports in route adapters, route services, API routes,
  or feature-owned view-model mappers.
- Prefer a local `*-route-view-model.ts` or `*-route-service.ts` beside the page
  composition when a product route needs several feature services. That file may
  call service factories, combine module results, map source/provenance labels,
  and shape render-neutral data for React components.
- Treat the route view-model/service file as the anti-corruption layer between
  UI and business modules: feature contracts remain owned by `features/**`, while
  product presenters own only UI-ready shapes, links, labels, and state variants.
- React presenter components should not call feature service factories, mock
  services, live providers, or Orbit AI orchestration services. They should
  receive plain route view models and UI-only callbacks/links.
- If a page renders an artifact or generated assistant result, map the feature
  artifact payload into a page-owned view model before passing it into UI
  components. UI components must not depend on raw provider payloads, raw feature
  DTO shapes, or feature-specific mock implementation details.

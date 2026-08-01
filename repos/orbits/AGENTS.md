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

## Cross-Client Contract

- `shared/contract/` 是网页版和 iOS App 共用的响应形状，改它等于同时改两个客户端。
- 契约文件必须零 import、只含类型声明；枚举的常量数组留在 `features/<module>/contract.ts`
  或 `shared/domain/`，并在那一侧用 `shared/contract-check.ts` 的 `ContractMatches` 断言一致。
- 新增或修改契约后，`features/<module>/contract.ts` 用转发导出保持既有引用名不变，
  并到 `repos/orbit-app` 跑 `npm run sync:contract`，否则移动端测试会红。
- 完整规则与迁移步骤见 `docs/cross-client-contract.md`。

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

## Product Image Loading Standard

- User-visible product photography and artwork must use the shared progressive
  image path: responsive `srcset`/`sizes`, an SSR-visible inline LQIP, and a
  decode-gated 180–250 ms crossfade. Do not render known images with a plain
  `<img>` over a colored or empty placeholder.
- Reserve the final image dimensions or aspect ratio before loading. Image
  arrival must not move surrounding content.
- Set `sizes` to the real rendered slot. Fixed avatar/thumbnail slots use their
  pixel width; cards and heroes use breakpoint-aware sizes. Do not use `100vw`
  for a small rail or list thumbnail.
- Preload/eager-load only above-the-fold primary media. Keep below-the-fold and
  secondary rail media lazy.
- Local assets under `public/orbit-covers` and `public/orbit-demo-assets` must be
  followed by `npm run images:lqip`; the generated LQIP map is committed. The
  production build regenerates it before compiling.
- Live/remote media providers must expose trusted responsive variants (or an
  approved image loader), intrinsic dimensions, and a `blurDataURL`. A neutral
  surface is only the failure fallback, not the normal loading experience.
- Respect `prefers-reduced-motion`; decoding still gates image reveal, but the
  crossfade duration collapses through the global reduced-motion rule.

## App Documentation And Knowledge Manifest

- App implementation changes must update the related 文档: `docs/**`, feature
  `DESIGN.md`, `LIVE_IMPLEMENTATION.md`, or knowledge catalog entry.
- The `/dev/knowledge` page must consume
  `shared/knowledge/knowledge-manifest.ts`; app code must not read 父目录
  knowledge files directly.
- Changes to the app knowledge manifest or `/dev/knowledge` page must update
  the related page and service tests.
- Keep app-facing knowledge copy in Chinese, with English technical names only
  where they are source identifiers.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **orbits** (23547 symbols, 43652 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/orbits/context` | Codebase overview, check index freshness |
| `gitnexus://repo/orbits/clusters` | All functional areas |
| `gitnexus://repo/orbits/processes` | All execution flows |
| `gitnexus://repo/orbits/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

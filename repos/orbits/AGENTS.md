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

## Free-Plan Cloud Budget

- Cloud validation must follow `docs/operations/free-staging-budget.md`: inspect current project quota first, use a small explicit operation budget, and run bulk/pressure/regression tests on local PostgreSQL.
- Do not run bulk demo/pressure seeds, full payload exports, keep-alive polling, or unbounded workers on a Free cloud database. Use the guarded minimal staging initializer for the approved isolated environment; never overwrite a nonempty database.
- Keep staging database, Auth, model/email/storage credentials and workers isolated from Production. Deploy staging with an explicit `--target preview` and `vercel.staging.json` (the first Vercel deployment can otherwise auto-promote).
- The real-PostgreSQL tests read `ORBIT_EVENT_DATABASE_URL` **directly**, bypassing `resolveLiveDatabaseConnectionConfig`, so `ORBIT_DATABASE_TARGET=local` does not redirect them. Point `ORBIT_EVENT_DATABASE_URL` at a local test database or they will run against the cloud and exhaust its transfer quota: `psql "$ORBIT_LOCAL_DATABASE_URL" -c 'CREATE DATABASE orbit_test'`, then set `ORBIT_EVENT_DATABASE_URL=postgresql://…/orbit_test` in `.env.local`. Keep it separate from the dev database — migration tests create and drop schemas.
- Quota thresholds and script budgets are not provider billing meters. Do not claim an automatic monthly spending cap exists unless it is actually enforced. No paid upgrade or deletion of unrelated data without authorization.

## Cross-Client Contract

- `shared/contract/` 是网页版和 iOS App 共用的响应形状，改它等于同时改两个客户端。
- 契约文件必须零 import、只含类型声明；枚举的常量数组留在 `features/<module>/contract.ts`
  或 `shared/domain/`，并在那一侧用 `shared/contract-check.ts` 的 `ContractMatches` 断言一致。
- 新增或修改契约后，`features/<module>/contract.ts` 用转发导出保持既有引用名不变，
  并到 `repos/orbit-app` 跑 `npm run sync:contract`，否则移动端测试会红。
- 经确认，`shared/domain/industries.ts` 与 `shared/domain/language.ts` 两个自包含字典
  通过同一命令按白名单同步到移动端 `src/api/domain/`；不复制其余 domain 或 feature
  代码。字典只能依赖同步范围内的类型，完整枚举一致性由编译期契约检查保障。
- 完整规则与迁移步骤见 `docs/cross-client-contract.md`。
- 改版 R01：设计 token 的唯一来源是 `shared/design/tokens.json`。改完跑 `npm run design:tokens`
  生成 `shared/design/tokens.ts`（App 经 `sync:contract` 复制）和
  `app/(app)/app/orbit-2026/tokens.css`（根 layout 加载），生成文件禁止手改。
  样式只用设计稿命名的变量（`--ink`、`--ink-3-text`、`--surface-2`、`--line`、`--r-xl`、`--font`…），
  旧名字由 `tests/ui/design-tokens-legacy-names.test.ts` 拦截；规则见 `shared/design/README.md`。

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

## redesign 开发规则（R09，两端 `AGENTS.md` 内容相同；放在 `<!-- gitnexus:start -->` 之前，那一块会被 `gitnexus analyze` 重写）

改版的全部计划、决定和 Sprint 文档在 `docs/designs/redesign-2026-10/sprints/`（[README](../../docs/designs/redesign-2026-10/sprints/README.md) 的决定表 RD-01…，[开始一个功能 Sprint](../../docs/designs/redesign-2026-10/sprints/HOW-TO-START-A-FEATURE-SPRINT.md)）。以下规则对 `redesign` 分支上的所有工作生效。

- **分支**：在 `redesign` 上开发；骨架 R02–R09 直接在 `redesign` 上提交（RD-25）；功能 Sprint 两人并行时，个人分支 `redesign-R<编号>-<主题>`（全用连字符：已有 `redesign` 分支时，git 不允许再建 `redesign/…`）从 `redesign` 开出，收口时先 `git rebase redesign`、全量通过后 `git switch redesign && git merge --ff-only <分支>` 合回（不开 PR）、合回 `redesign`。`chat-agent` 冻结（RD-03），所有功能 Sprint 完成并通过「合回 `chat-agent` 前总验收」（README）之前不合回。
- **契约**（`repos/orbits/shared/contract/`）：只加不改；每个文件头写负责人和使用方；提交信息以 `contract:` 开头并注明「App 需要同步」，App 在同一提交里带上 `npm run sync:contract` 的副本（不直接改 App 的副本）；加字段后 `node scripts/contract-snapshot.mjs --write`；破坏性改动先在 `shared/contract/BREAKING.md` 登记（日期、id、改动、原因、甲乙同意、App 跟进）。`@draft` 文件不受检查。响应宽进（不用 `.strict()`，枚举用 `tolerantEnum` / `knownValues`）、请求和服务端写入严格；`minSupportedAppVersion` 在首次正式发布后启用（README 通用规则 10，产品负责人已确认）。
- **迁移**：每个模块独立编号、只向前；两个人负责的模块不重叠（按功能 Sprint 的归属）。
- **新代码约定**：
  - 颜色、圆角、字号、动效只用 token（`shared/design/tokens.json` 生成两端代码）；
  - 用户看得到的文字只进字典或文案文件（App `src/i18n/`，Web `orbit-2026/copy/` 与 `shared/copy/`），日中英三语，过 `npm run copy:qa`；
  - 界面只用新组件库（App `src/components/ui/`，Web `orbit-2026/ui/`）和 `Icon`，不用 Ionicons；
  - Web 新样式只用 CSS Modules，渲染在 `[data-orbit-2026]` 作用域内，不嵌进旧的 `[data-orbit-real-page]`；
  - 新路由按开发说明第 7 节登记（App 4 处、Web 4 处）；
  - 新接口在 live 实现之前返回 `NOT_IMPLEMENTED`，界面用 `whenNotImplemented` 隐藏入口或用默认值，不显示错误。
- **旧屏**（RD-24）：旧屏按 [`screen-ownership.md`](../../docs/designs/redesign-2026-10/sprints/screen-ownership.md) 由对应功能 Sprint 整屏重写；三份允许清单（Ionicons、写死文字、旧写法）只减不增，重写一个屏就把它从清单里删掉。
- **热点文件归属**（定稿，2026-10-10 确认；以后变更改在这里，两端同步）。非负责人要改热点文件时，先向负责人提需求，由负责人改：

  | 热点文件 / 目录 | 负责人 | 理由 |
  | --- | --- | --- |
  | App `OrbitTabBar.tsx`、`app-navigation.ts`、`AppScreen.tsx`、`TaskScreen.tsx` 的插槽结构 | 乙 | App 是乙的主战场，Task 的三段也归乙 |
  | App `src/components/ui/**` | 乙 | 同上；甲需要新组件时提需求 |
  | Web `Orbit2026Shell`（`orbit-2026/shell/**`）、Web Task 容器（`orbit-2026/task/TaskContainer.tsx`）的插槽结构 | 甲 | Web 是甲的主战场 |
  | Web `orbit-2026/ui/**` | 甲 | 同上 |
  | `shared/design/tokens.json`、`icons.json` | 甲 | 骨架由甲建立 |
  | `shared/copy/**`、术语表、写作规范、`copy-qa` | 甲 | 骨架由甲建立；乙新增文案按规范写，术语变更提给甲 |
  | `shared/contract/.snapshot.json`、`BREAKING.md` | 改动该契约的负责人 | 按 R08 的契约归属 |
- **每个 Sprint 的收口**：两端全量测试对照基线零新增失败（orbits 用 `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`），typecheck、`lint` 通过；改函数前跑 GitNexus `impact`、提交前跑 `detect-changes`（索引落后时先 `node .gitnexus/run.cjs analyze --index-only`，否则新符号查不到、结论不可信）；写 REPORT，由独立 AI 复核写 REVIEW，问题直接在 `redesign` 上修（RD-25）。

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **orbits** (40053 symbols, 70551 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

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

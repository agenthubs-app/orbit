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
- **还原设计稿**（RD-16 修订，用户决定 2026-10-11，取代「展示页 + 并排截图、不做逐像素门禁」）：每个画面必须和设计稿画板**一模一样**，只允许测试数据与设计稿示例数据的**文字内容**不同（人名、数字、日期）；排版、颜色、间距、字号、字重、圆角、阴影、图标、元素有无和顺序都必须一致。设计稿里有的不许自己改、不许省略，做不到或不该做的**先请用户拍板**；REPORT「自定决定」里不得再出现偏离设计的条目（以前的全部作废，见 [pixel-audit](../../docs/designs/redesign-2026-10/sprints/maintenance/2026-10-11-pixel-audit.md)）。验收靠逐像素门禁：整屏 raw ≤0.02，`--grid` 逐带比对，超阈值的带必须在归因文件里具名且只能是 `[data]`（数据文字不同）。Web 1440 / 1024 / 390 × 浅色 / 深色、截完整页面含导航壳（`repos/orbits/scripts/visual/compare-redesign.mjs`）；App 用内置 iOS 模拟器截真实画面、不用 react-native-web，浅色 / 深色（`compare-redesign-app.mjs`）。用法见 `repos/orbits/scripts/visual/README-redesign.md`；不过门禁的画面不得标 done。
- **不许改动或省略设计稿**（RD-16 修订，用户决定 2026-10-11，适用于所有 Sprint，甲乙都一样）：「自定决定」只能写和设计稿无关的工程决定；任何改动、省略或增加设计稿元素的做法，都必须**先由用户拍板**再实现，并记进 README 决定表。PLANNER 每个画面一条像素 SC，REPORT 附门禁结果，独立复核重跑门禁（HOW-TO 第 8 节）。
- **UI 对齐的默认流程**（**试行中，2026-10-12**；等 R05 和 Web 计划页两组的用时对比出来后转为定稿；README 通用规则 12、HOW-TO 第 8 节）。以后所有 UI 对齐、像素返工和功能 Sprint 的界面部分都按这个流程做：
  - **照源码搬，不对着截图画**：Web 把画板的 DOM 结构和 CSS 数值直接照 `kit/ui.css`、`kit/kit.js` 和画板 HTML 源码搬进 CSS Modules（数值换成 token）；App 把 kit 里的数值一次性翻译成 token 和组件参数。
  - **快慢两档**（`--only` + 设计稿缓存）：迭代时只跑当前画面的门禁（`--suite views/<端>-<Sprint>.json --only <画面>`，或 `--changed` 只跑和改动相关的画面）和相关测试；收口时各跑一次全量门禁（不带 `--only`）和两端全量测试。
  - **复核**：只重跑没通过的画面和改动过的画面，另抽查至少 20% 的已通过画面；先核对文字结论和超阈值带的裁剪图；抽查画面和摘要里标 ⚠ 缺块的才看整张 triptych，不能只看 raw。
  - **不阻塞**：子会话不用 AskUserQuestion 弹窗等人回答；需要拍板的事用 SendMessage 发给主会话，那个画面先跳过，接着做别的。
  - **并行**（用户 2026-10-12 决定，降低额度消耗）：按文件归属分工，**最多同时 2 个会话**（一个重活加一个轻活，比如一个返工加一个文档或画板）；每个会话同时最多 1 个子任务，独立复核在其他子任务结束后再起；每个会话用自己的 dev server 端口、`distDir` 和测试库。
  - **短会话**：一个返工组 / 一组画面一个会话，做完写交接。
  - **省额度**（用户 2026-10-12 决定；工具新功能由 pixel-web-shell 会话补，补好前照同样原则手动做）：
    - **先看文字结论，图片按需看**：门禁输出文字结论（哪个元素 / 哪条带、偏几 px、颜色差多少）。Web 先用逐元素样式比对（`--style-diff`：设计稿画板 vs 实现的 computed style 与位置尺寸，输出文字表）定位并改完差异，像素门禁只做最后确认；App 看门禁的数字结论。数字说不清时才看图，而且只看裁剪出的那一块，不读整张截图。
    - **只读相关的**：设计稿用 `--extract-board` 抽出单个画板的源码，不读整个 bundle；HANDOFF、决定表、审计报告只读和本画面相关的段落（先 grep 定位）。
    - **测试只看摘要**：只看通过 / 失败数和失败用例名，不贴全量日志。
    - **每个画面最多 3 轮**：同一画面改 3 轮还不过，就停下，写进 REPORT「未过」清单并 SendMessage 主会话，接着做下一个。
    - **适时开新对话**：每个会话只做几个画面；上下文变长就先写交接、提交推送，再开新会话接着做（主会话同理）。
    - **只提交自己的文件**（共用工作区，2026-10-12 已两次误带别人暂存的文件）：一律用 `git commit -m … -- <自己的文件…>` 按路径提交（只提交列出的路径，别人暂存的不受影响）；不要提前 `git add` 后把文件长时间留在暂存区；提交后 `git show --stat HEAD` 核对。补画画板只加在文件末尾。
  - 工具用法（画面清单、`--only` / `--changed`、设计稿缓存、`--workers`、缺块警告）见 `repos/orbits/scripts/visual/README-redesign.md`「提速」一节。
- **交接表**（2026-10-12）：骨架与返工留给各功能 Sprint 的事项和临时规定集中在 [`HANDOFF-TO-FEATURE-SPRINTS.md`](../../docs/designs/redesign-2026-10/sprints/HANDOFF-TO-FEATURE-SPRINTS.md)。功能 Sprint 开工前先读本 Sprint 那一节和「通用口径」，把其中每条写进 PLANNER 的验收契约；新的交接事项一律追加到这份文件。
- **旧屏**（RD-24）：旧屏按 [`screen-ownership.md`](../../docs/designs/redesign-2026-10/sprints/screen-ownership.md) 由对应功能 Sprint 整屏重写；三份允许清单（Ionicons、写死文字、旧写法）只减不增，重写一个屏就把它从清单里删掉。
- **热点文件归属**（定稿，2026-10-10 确认；以后变更改在这里，两端同步）。非负责人要改热点文件时，先向负责人提需求，由负责人改：

  | 热点文件 / 目录 | 负责人 | 理由 |
  | --- | --- | --- |
  | App `OrbitTabBar.tsx`、`app-navigation.ts`、`AppScreen.tsx`、`TaskScreen.tsx` 的插槽结构 | 乙 | App 是乙的主战场，Task 的三段也归乙 |
  | App `src/components/ui/**` | 乙 | 同上；甲需要新组件时提需求 |
  | Web `Orbit2026Shell`（`orbit-2026/shell/**`）、Web Task 容器（`orbit-2026/task/TaskContainer.tsx`）的插槽结构 | 甲 | Web 是甲的主战场 |
  | Web `orbit-2026/ui/**` | 甲；**组件 Sprint 起乙也可改**（RD-30） | 同上；乙改动甲名下页面的调用点或手写件前在交接表通知甲 |
  | `shared/design/tokens.json`、`icons.json` | 甲；`tokens.json` **组件 Sprint 起乙也可改**（RD-30） | 骨架由甲建立 |
  | `shared/copy/**`、术语表、写作规范、`copy-qa` | 甲 | 骨架由甲建立；乙新增文案按规范写，术语变更提给甲 |
  | `shared/contract/.snapshot.json`、`BREAKING.md` | 改动该契约的负责人 | 按 R08 的契约归属 |
- **每个 Sprint 的收口**：两端全量测试对照基线零新增失败（orbits 用 `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`），typecheck、`lint` 通过；改动影响面靠读代码和文本搜索判断，**不再跑 GitNexus**（`impact` / `detect-changes` 不要求，用户 2026-10-18，RD-32；本文件其他地方的 GitNexus 必做规则在 redesign 开发中不适用）；写 REPORT，由独立 AI 复核写 REVIEW，问题直接在 `redesign` 上修（RD-25）。

## redesign 开发规则（R09，两端 `AGENTS.md` 内容相同；放在 `<!-- gitnexus:start -->` 之前，那一块会被 `gitnexus analyze` 重写）

改版的全部计划、决定和 Sprint 文档在 `docs/designs/redesign-2026-10/sprints/`（[README](README.md) 的决定表 RD-01…，[开始一个功能 Sprint](HOW-TO-START-A-FEATURE-SPRINT.md)）。以下规则对 `redesign` 分支上的所有工作生效。

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
- **还原设计稿**（RD-16 修订，用户决定 2026-10-11，取代「展示页 + 并排截图、不做逐像素门禁」）：每个画面必须和设计稿画板**一模一样**，只允许测试数据与设计稿示例数据的**文字内容**不同（人名、数字、日期）；排版、颜色、间距、字号、字重、圆角、阴影、图标、元素有无和顺序都必须一致。设计稿里有的不许自己改、不许省略，做不到或不该做的**先请用户拍板**；REPORT「自定决定」里不得再出现偏离设计的条目（以前的全部作废，见 [maintenance/2026-10-11-pixel-audit.md](maintenance/2026-10-11-pixel-audit.md)）。验收靠逐像素门禁：整屏 raw ≤0.02，`--grid` 逐带比对，超阈值的带必须在归因文件里具名且只能是 `[data]`（数据文字不同）。Web 1440 / 1024 / 390 × 浅色 / 深色、截完整页面含导航壳（`repos/orbits/scripts/visual/compare-redesign.mjs`）；App 用内置 iOS 模拟器截真实画面、不用 react-native-web，浅色 / 深色（`compare-redesign-app.mjs`）。用法见 `repos/orbits/scripts/visual/README-redesign.md`；不过门禁的画面不得标 done。
- **不许改动或省略设计稿**（RD-16 修订，用户决定 2026-10-11，适用于所有 Sprint，甲乙都一样）：「自定决定」只能写和设计稿无关的工程决定；任何改动、省略或增加设计稿元素的做法，都必须**先由用户拍板**再实现，并记进 README 决定表。PLANNER 每个画面一条像素 SC，REPORT 附门禁结果，独立复核重跑门禁（HOW-TO 第 8 节）。
- **交接表**（2026-10-12）：骨架与返工留给各功能 Sprint 的事项和临时规定集中在 [`HANDOFF-TO-FEATURE-SPRINTS.md`](HANDOFF-TO-FEATURE-SPRINTS.md)。功能 Sprint 开工前先读本 Sprint 那一节和「通用口径」，把其中每条写进 PLANNER 的验收契约；新的交接事项一律追加到这份文件。
- **旧屏**（RD-24）：旧屏按 [`screen-ownership.md`](screen-ownership.md) 由对应功能 Sprint 整屏重写；三份允许清单（Ionicons、写死文字、旧写法）只减不增，重写一个屏就把它从清单里删掉。
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

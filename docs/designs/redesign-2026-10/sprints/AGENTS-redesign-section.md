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
- **旧屏**（RD-24）：旧屏按 [`screen-ownership.md`](screen-ownership.md) 由对应功能 Sprint 整屏重写；三份允许清单（Ionicons、写死文字、旧写法）只减不增，重写一个屏就把它从清单里删掉。
- **热点文件归属**（建议版，待产品负责人确认；确认结果改在这里）。非负责人要改热点文件时，先向负责人提需求，由负责人改：

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

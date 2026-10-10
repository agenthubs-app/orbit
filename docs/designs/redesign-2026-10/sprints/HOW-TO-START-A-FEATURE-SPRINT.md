# 开始一个功能 Sprint（R10 起）

骨架（R01–R09）留下的东西怎么用。下面用一个虚拟的小功能「活动的『行く価値はある？』入口」（契约 8，事件评估）把流程走一遍；每一步都写了具体文件。规则本身见两端 `AGENTS.md` 的「redesign 开发规则」一节和 [README](README.md)。

## 0. 开工

1. 在 `redesign` 上开个人分支：`git switch -c redesign/R26-event-assessment redesign`（分支名用连字符；`chat-agent` 冻结，不往那里合）。
2. 读本 Sprint 的 `GOAL.md` / `PLANNER.md`，和 [`screen-ownership.md`](screen-ownership.md) 里归你这一行的旧屏。
3. 记录基线：
   - orbits：`cd repos/orbits && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npm test`、`npm run typecheck`、`npm run typecheck:app`、`npm run lint`；
   - App：`cd repos/orbit-app && npm test`、`npx tsc --noEmit`。
   - 已知失败以 README「骨架登记表」最后一行为准，收口时逐条对照，零新增。
4. 改函数或组件之前跑 GitNexus：`node .gitnexus/run.cjs impact <符号> -f <文件> --direction upstream --repo . --summary-only`。HIGH / CRITICAL 先在 REPORT 写对策；UNKNOWN 用文本搜索确认调用方。

## 1. 组件在哪、长什么样

| | 组件库 | 展示页 |
| --- | --- | --- |
| App | `repos/orbit-app/src/components/ui/**`（`Button`、`ListRow`、`BottomSheet`、`Toast`、`States`、`Icon` …） | 模拟器里打开 `/showcase/components`、`/showcase/icons`、`/showcase/copy` |
| Web | `repos/orbits/app/(app)/app/orbit-2026/ui/index.ts`（`Button`、`ListRow`、`Modal`、`Drawer`、`Popover`、`useToast`、`Table` …） | 浏览器打开 `/showcase/components`（只在开发环境） |

- 图标只用 `Icon`（形状在 `shared/design/icons.json`，`npm run design:tokens` 生成两端代码）。新代码里出现 `@expo/vector-icons` / `Ionicons` 会被 `ionicons-ratchet` 拦下。
- 颜色、圆角、字号、动效只用 token：App 读 `src/api/design/tokens.ts`，Web 写 `var(--…)`。Web 新样式只用 CSS Modules，渲染在 `<Orbit2026Scope>`（`[data-orbit-2026]`）里，不能嵌进旧的 `[data-orbit-real-page]`（`orbit-2026-scope` 测试）。CSS 里写死颜色会被 `orbit-2026-css-tokens` 拦下。
- 缺组件时找热点文件负责人提需求，不在自己的屏里另写一个。

## 2. 放进壳里

- **App**：屏幕用 `AppScreen`（标题、返回、滚动记忆都有了）。Task 的四段在 `src/screens/task/TaskScreen.tsx` 的 `TASK_SLOTS`，只换自己那一段的组件，不改分段结构。
- **Web**：页面里放 `<ShellPage title="…" subtitle="…" right={…} rightRail />`（`orbit-2026/shell/slots.tsx`），左栏、主标题区、右栏、⌘K 都由壳画；页面不再挂任何导航。Task 容器在 `orbit-2026/task/TaskContainer.tsx`，同样只换自己的段。

## 3. 用演示世界的假数据开发

1. 契约已经在 `repos/orbits/shared/contract/event-assessment.ts`，校验在 `shared/api-schema/event-assessment.ts`。
2. 本地 dev server 默认是 mock 模式（`ORBIT_MODULE_MODE` 不设或设 `mock`）：`GET /api/events/assessments` 直接返回演示世界里的「SaaS Summit 2026」评估（78 分、推荐）。
3. 需要更多假数据时，加在 `shared/mock/demo-world/`：人和事只从 `index.ts` 取（10 个虚构人物、3 个活动、1 个计划），每条带 `sample: true`；`demo-world-consistency` 和 `demo-world-copy` 会检查名字、公司和日文。
4. App 用同一份契约：改完 orbits 的 `shared/**` 后在 App 跑 `npm run sync:contract`，副本和源在同一个提交里（不要直接改 App 的副本）。
5. **接上真实接口**：在 `features/redesign-contracts/service-factory.ts` 给这个 capability 加 `live` 实现（或搬到 `features/events/…` 自己的 factory），`handlers.ts` 里对应函数改调真实服务；路由文件不动。数据库迁移按模块独立编号、只向前，两个人的模块不重叠。

## 4. 「尚未实现」

live 实现合入之前，正式环境里这些接口返回 `503` + `context.reason = "NOT_IMPLEMENTED"`。界面**不显示错误**：

```ts
import { whenNotImplemented } from "…/shared/compute/not-implemented"; // App: src/api/compute/not-implemented
const outcome = whenNotImplemented(body, { use: "hide" });          // 没有合理默认值 → 隐藏入口
if (outcome && !outcome.show) return null;
// 首页布局这类有默认值的：whenNotImplemented(body, { use: "default", value: DEFAULT_HOME_LAYOUT })
```

## 5. 跨人依赖的空态

依赖对方 Sprint 还没做的东西时（例如首页的计划分数组件要等 R22）：

- 先接 mock 接口开发；
- 正式环境遇到「尚未实现」按第 4 步隐藏或给默认值；
- 屏上需要占位时用 `States` 的空态（App `src/components/ui/States.tsx`，Web `orbit-2026/ui` 的 `EmptyState`），文字写「まだありません」这类普通说法，不写「开发中」「Coming soon」以外的内部用语；
- 在 REPORT「交接」写清楚依赖哪一个 Sprint、接上之后要删什么。

## 6. 文案

- **App**：用户看得到的文字进字典 `src/i18n/`（日中英三语），组件类型在 `src/i18n/copy-kinds.ts` 登记。
- **Web**：新代码的文字进 `app/(app)/app/orbit-2026/copy/*.ts`（`OrbitCopyTable`，`pickCopy` 取值）；通用的词（导航、按钮、状态）已在 `shared/copy/{ja,zh,en}.ts`，两端共用。
- 术语和写法看 R03 的术语表和写作规范；跑 `cd repos/orbits && npm run copy:qa`（Web 新文案、共用词、App 已纳入的域；你重写了 App 的哪个域，就把它加进 `scripts/copy-qa/cli.mjs` 的 `APP_DOMAINS_IN_SCOPE`）。
- 写死在代码里的文字会被两端 `no-hardcoded-copy` 拦下。旧屏在允许清单里；你重写了旧屏，就把它从清单里删掉（清单只减不增）。

## 7. 新路由要登记的地方

**App（4 处）**

1. `src/view-models/mobile-route-access.ts` 的 `PRIVATE_ROUTE_PREFIXES`（需要登录的）；
2. `tests/app-wide-route-coverage.test.ts` 的 `integratedFeatureRoutes`；
3. `scripts/page-offline-inventory.ts` 登记离线策略，再 `npx tsx scripts/page-offline-inventory.ts --write` 重新生成 `docs/offline/page-inventory.md`；
4. `tests/route-parity.test.ts`：Web 有的页面 App 也要有对应路由（或写进它的例外）。

二级页在 `src/view-models/app-navigation.ts` 的 `parentForPath` 定义返回到哪一个一级页；推送落地链接在 `notification-model.ts`。

**Web（4 处）**

1. `features/auth/app-auth-routing.ts` 的 `ORBIT_PRIVATE_APP_PREFIXES`（需要登录的页面）；新的 `/api/**` 默认要登录，只有登录前必须可读的才进 `proxy.ts` 的 `isPublicApiPath`；
2. `docs/audits/full-product-functional-audit/inventory.json`（`node scripts/generate-full-product-functional-audit.mjs`）和 `tests/audits/web-route-transport.test.ts` 的页面数；
3. `scripts/generate-product-surface-manifest.mjs` 重新生成产品清单（`tests/audits/product-surface-manifest.test.ts`）；
4. `orbit-2026/shell/shell-routes.ts`：确认新页面有壳（`shellAppliesTo`）、左栏高亮哪一项（`shellNavKeyFor`）、要不要右栏（`shellShowsRail`）；⌘K 的页面上下文在 `orbit-global-ask/orbit-ask-routes.ts` 的 `PAGE_CONTEXTS`。

## 8. 截图对照页

- 证据放 `~/orbit-sprint-evidence/redesign/R<编号>/run-01/`。
- **App**：模拟器开发包（`repos/orbit-app/.env.development.local` 指向 `http://localhost:3000`，不要改 `.env.local`；起 Metro 不带 `CI=1`）；`xcrun simctl io booted screenshot <文件>`，浅色 / 深色各一张。
- **Web**：本地 dev server 登录 QA 账号（密码在 `repos/orbits/.env.local` 的 `ORBIT_PRIMARY_TEST_ACCOUNT_PASSWORD`，脚本从文件读，不要贴出来），用 Playwright 在 1440 / 1024 / 390 截图；可以照 R07 的 `screens/` 做法。
- 对照页 `compare.html`：左边设计稿画板（`docs/designs/redesign-2026-10/` 下的原型），右边实现，浅色 / 深色各一行；放在证据目录，REPORT 里写路径。

## 9. 改契约、改热点文件

- **契约只加不改**：加可选字段、枚举值、新类型 → `cd repos/orbits && node scripts/contract-snapshot.mjs --write`，提交信息以 `contract:` 开头并写「App 需要同步」，App 跑 `npm run sync:contract`。破坏性改动先在 `shared/contract/BREAKING.md` 登记（日期、id、改动、原因、甲乙同意、App 跟进），再 `--write`。
- **热点文件**（归属表在两端 `AGENTS.md`）：不是负责人就先提需求，由负责人改。

## 10. 收口

1. 两端全量、typecheck、lint，对照基线零新增失败（失败的单独重跑确认是否不稳定）。
2. `node .gitnexus/run.cjs detect-changes --scope all --repo .`，结果写进 REPORT。
3. 写 `REPORT.md`（做了什么、SC 对照、自定决定、基线 → 收口、GitNexus、交接、已知例外），登记表改「done，待复核」，提交并 push。
4. 独立 AI 复核写 `REVIEW.md`；修完 M 级和能修的 m 级，追加「处理记录」，登记表改「done，已复核，问题已修」。

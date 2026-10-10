# 开始一个功能 Sprint（R10 起）

骨架（R01–R09）留下的东西怎么用。下面用一个虚拟的小功能「活动的『行く価値はある？』入口」（契约 8，事件评估）把流程走一遍；每一步都写了具体文件。规则本身见两端 `AGENTS.md` 的「redesign 开发规则」一节和 [README](README.md)。

## 0. 开工

1. 在 `redesign` 上开个人分支：`git switch -c redesign-R26-event-assessment redesign`。分支名全用连字符：仓库里已有 `redesign` 分支，git 不允许再建 `redesign/…`。`chat-agent` 冻结，不往那里合。
2. 读本 Sprint 的 `GOAL.md` / `PLANNER.md`，和 [`screen-ownership.md`](screen-ownership.md) 里归你这一行的旧屏。
3. 记录基线：
   - orbits：`cd repos/orbits && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npm test`、`npm run typecheck`、`npm run typecheck:app`、`npm run lint`；
   - App：`cd repos/orbit-app && npm test`、`npx tsc --noEmit`。
   - 已知失败以 README「骨架登记表」最后一行为准，收口时逐条对照，零新增。
4. 先刷新 GitNexus 索引（落后时新符号查不到，`impact` / `detect-changes` 的结论也不可信）：`node .gitnexus/run.cjs analyze --index-only`（几分钟，可放后台）。改函数或组件之前跑 `node .gitnexus/run.cjs impact <符号> -f <文件> --direction upstream --repo . --summary-only`。
   - HIGH / CRITICAL 先在 REPORT 写对策；只是往一张表里加一项（例如登录前缀表）也可能报 CRITICAL，对策写「只追加，不改已有项」即可。
   - UNKNOWN（类型、常量数组、新文件里的符号常见）用文本搜索确认调用方。

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
  - 插槽的内容在壳里渲染，不在页面树里：它拿不到页面的 context（示例模式、页面状态），需要的值在页面里读好再作为 props 传进去（例子：`ShellDemoPill`）。
  - `ShellPage` 通常写在页面的 `Orbit2026Scope` 外面，那里 `useStandardCopy()` 会退回日文；标题用 `pickCopy(表.键, language)` 或 `standardCopyFor(language)`（`useOrbitLanguage()` 取 `language`）。
  - 不传 `rightRail`（或传 `false`）就没有右栏；传 `true` 用默认右栏；<1280 时右栏自动变成标题区按钮 + 380 抽屉。
  - 一个页面可以有多个 `ShellPage`，各设各的插槽。

## 3. 用演示世界的假数据开发

1. 契约已经在 `repos/orbits/shared/contract/event-assessment.ts`，校验在 `shared/api-schema/event-assessment.ts`。
2. 本地 dev server 默认是 mock 模式（`ORBIT_MODULE_MODE` 不设或设 `mock`）：`GET /api/events/assessments` 直接返回演示世界里的「SaaS Summit 2026」评估（78 分、推荐）。
3. 需要更多假数据时，加在 `shared/mock/demo-world/`：人和事只从 `index.ts` 取（10 个虚构人物、3 个活动、1 个计划），每条带 `sample: true`；`demo-world-consistency` 和 `demo-world-copy` 会检查名字、公司和日文。
4. App 用同一份契约：改完 orbits 的 `shared/**` 后在 App 跑 `npm run sync:contract`，副本和源在同一个提交里（不要直接改 App 的副本）。
5. **新增一个契约**（而不是用已有的）：照着契约 8（事件评估）改 8 处——
   - `shared/contract/<名字>.ts`（文件头写负责人和使用方）和 `shared/contract/index.ts` 的 `export type`；
   - `shared/api-schema/<名字>.ts`：导出未强转的 `*Object` 和强转后的 `*Schema`；响应不用 `.strict()`，请求体用；
   - `features/redesign-contracts/service-factory.ts` 的 `REDESIGN_CONTRACT_CAPABILITIES` 加 capability；
   - `mock-service.ts` 加 mock 行为（幂等键、重放按契约语义），`handlers.ts` 加处理函数（`redesignContractRoute(capability, schema, …)`）；
   - 路由文件 `app/api/<路径>/route.ts` 只写 `export { getX as GET } from "<相对路径>/features/redesign-contracts/handlers";` 和 `export const dynamic = "force-dynamic";`；
   - 测试：`tests/api/redesign-contract-routes.test.ts` 的 `CASES`（mock 成功、live 503），`tests/contracts/redesign-schema-parity.check.mts` 加一行，fixture 进 `demo-world-consistency`；
   - 最后 `node scripts/contract-snapshot.mjs --write`。
6. **只改 `shared/**` 也要同步 App**：`cd repos/orbit-app && npm run sync:contract`，副本和源放在同一个提交。纯 Web 功能也一样，否则 App 的 `contract-sync` 测试变红。
7. **本地看假数据**：本地 `.env.local` 是 live 时，设 `ORBIT_REDESIGN_MOCK=<capability>`（逗号分隔，或 `all`）只把这些契约切到演示世界，其他页面照旧；生产忽略这个开关。
8. **接上真实接口**：在 `features/redesign-contracts/service-factory.ts` 给这个 capability 加 `live` 实现（或搬到 `features/events/…` 自己的 factory），`handlers.ts` 里对应函数改调真实服务；路由文件不动。数据库迁移按模块独立编号、只向前，两个人的模块不重叠。

## 4. 「尚未实现」

live 实现合入之前，正式环境里这些接口返回 `503` + `context.reason = "NOT_IMPLEMENTED"`。界面**不显示错误**：

```ts
// Web：import { whenNotImplemented } from "../../../../../shared/compute/not-implemented";（按文件位置数层级）
// App：import { whenNotImplemented } from "../api/compute/not-implemented";
const body = await response.json();                          // 统一信封：{ success: true, data } 或 { success: false, error }
const missing = whenNotImplemented(body, { use: "hide" });   // 没有合理默认值 → 隐藏这个入口或这一块
if (missing) return null;                                     // 「尚未実装」：不显示错误，整块不画
if (!body.success) return <RetryState … />;                   // 真正的故障（含普通 503）照常显示错误和重试
render(body.data);
// 有默认值的（首页布局）：whenNotImplemented(body, { use: "default", value: DEFAULT_HOME_LAYOUT }) 返回 { show: true, value }
```

只隐藏依赖这个接口的那一块；页面其余部分（标题、空态、其他数据）照常显示。

## 5. 跨人依赖的空态

依赖对方 Sprint 还没做的东西时（例如首页的计划分数组件要等 R22）：

- 先接 mock 接口开发；
- 正式环境遇到「尚未实现」按第 4 步隐藏或给默认值；
- 屏上需要占位时用 `States` 的空态（App `src/components/ui/States.tsx`，Web `orbit-2026/ui` 的 `EmptyState`），文字写「まだありません」这类普通说法，不写「开发中」「Coming soon」以外的内部用语；
- 在 REPORT「交接」写清楚依赖哪一个 Sprint、接上之后要删什么。

## 6. 文案

- **App**：用户看得到的文字进字典 `src/i18n/`（日中英三语），组件类型在 `src/i18n/copy-kinds.ts` 登记。
- **Web**：新代码的文字进 `app/(app)/app/orbit-2026/copy/*.ts`（`OrbitCopyTable`，`pickCopy` 取值）；通用的词（导航、按钮、状态）已在 `shared/copy/{ja,zh,en}.ts`，两端共用。
- 每条文案写 `kind`（`label`、`button`、`fullButton`、`menu`、`chip`、`sentence`、`dialogTitle`、`toast` …），长度上限和语气规则按 kind 执行，上限见 `scripts/copy-qa/check.mjs` 的 `LENGTH_LIMITS` / `EN_LENGTH_LIMITS`。常见问题：日文正文句末要「。」、中文与数字和占位符之间不加空格、拉丁字母单词与日文之间加半角空格、英文按钮用句首大写。
- 术语和写法看 R03 的术语表和写作规范；跑 `cd repos/orbits && npm run copy:qa`（Web 新文案、共用词、App 已纳入的域；你重写了 App 的哪个域，就把它加进 `scripts/copy-qa/cli.mjs` 的 `APP_DOMAINS_IN_SCOPE`）。
- 写死在代码里的文字会被两端 `no-hardcoded-copy` 拦下。旧屏在允许清单里；你重写了旧屏，就把它从清单里删掉（清单只减不增）。

## 7. 新路由要登记的地方

**App（4 处；第 4 处只做 Web 也要看）**

1. `src/view-models/mobile-route-access.ts` 的 `PRIVATE_ROUTE_PREFIXES`（需要登录的）；
2. `tests/app-wide-route-coverage.test.ts` 的 `integratedFeatureRoutes`；
3. `scripts/page-offline-inventory.ts` 登记离线策略，再 `npx tsx scripts/page-offline-inventory.ts --write` 重新生成 `docs/offline/page-inventory.md`；
4. `tests/route-parity.test.ts`：Web 有的页面 App 也要有对应路由。**只做 Web 页面也要处理这一条**：这个测试扫描 Web 的页面目录，新加任何 Web 页面都会让它失败。要么同时加 App 路由（连同上面 3 处），要么请产品负责人决定加进 `tests/route-parity-exceptions.ts`（那里写明只有用户明确决定才能加，不能为了消掉失败而加）。

二级页在 `src/view-models/app-navigation.ts` 的 `parentForPath` 定义返回到哪一个一级页；推送落地链接在 `notification-model.ts`。

**Web（4 处）**

1. `features/auth/app-auth-routing.ts` 的 `ORBIT_PRIVATE_APP_PREFIXES`（需要登录的页面）；新的 `/api/**` 默认要登录，只有登录前必须可读的才进 `proxy.ts` 的 `isPublicApiPath`；
2. 审计清单：在 `repos/orbits` 里跑 `npm run audit:full-product`，它写到**工作区根目录**的 `docs/audits/full-product-functional-audit/`；然后改 `tests/audits/web-route-transport.test.ts` 里的计数（`runtimePaths` 的两处、`report.summary` 的 `routeSurfaces` 和要登录的 `authRedirects`、`failedReport` 的 `failures`），并在旁边注释写明多了哪些页面。动态路由（`[id]`）要在 `scripts/verify-web-route-transport.mjs` 加一个运行样例。R09 结束时是 57 页。
3. 产品清单：同样在 `repos/orbits` 里跑 `npm run audit:surfaces`（写到根目录 `docs/audits/product-surface-*`），`tests/audits/product-surface-manifest.test.ts` 会检查新的 P0 / P1 候选。
4. `orbit-2026/shell/shell-routes.ts`：新页面默认就有壳（已登录的 `/app/**`）；只有它属于左栏某一栏时才在 `shellNavKeyFor` 加一行，全屏或 kiosk 类页面才需要在例外里排除；iOrbit 以外的页面默认允许右栏。⌘K 的页面上下文（`orbit-global-ask/orbit-ask-routes.ts` 的 `PAGE_CONTEXTS`）可选：加了，⌘K 交给 iOrbit 时会带上「表示中：…」。

## 8. 截图对照页

- 证据放 `~/orbit-sprint-evidence/redesign/R<编号>/run-01/`。
- **App**：模拟器开发包（`repos/orbit-app/.env.development.local` 指向 `http://localhost:3000`，不要改 `.env.local`；起 Metro 不带 `CI=1`）；`xcrun simctl io booted screenshot <文件>`，浅色 / 深色各一张。
- **Web**：本地 dev server 登录 QA 账号（密码在 `repos/orbits/.env.local` 的 `ORBIT_PRIMARY_TEST_ACCOUNT_PASSWORD`，脚本从文件读，不要贴出来），用 Playwright 在 1440 / 1024 / 390 截图；可以照 R07 的 `screens/` 做法。
- 对照页 `compare.html`：左边设计稿画板（`docs/designs/redesign-2026-10/` 下的原型），右边实现，浅色 / 深色各一行；放在证据目录，REPORT 里写路径。

## 9. 改契约、改热点文件

- **契约只加不改**：加可选字段、枚举值、新类型 → `cd repos/orbits && node scripts/contract-snapshot.mjs --write`，提交信息以 `contract:` 开头并写「App 需要同步」，App 跑 `npm run sync:contract`。破坏性改动先在 `shared/contract/BREAKING.md` 登记（日期、id、改动、原因、甲乙同意、App 跟进），再 `--write`。
- **热点文件**（归属表在两端 `AGENTS.md`）：不是负责人就先提需求，由负责人改。

## 10. 收口

1. 两端全量、typecheck、lint，对照基线零新增失败（失败的单独重跑确认是否不稳定）。`npm run lint` 只检查一份固定清单；新文件靠 `npm run typecheck` / `typecheck:app` 和各门禁测试把关。
2. 先 `node .gitnexus/run.cjs analyze --index-only`，再 `node .gitnexus/run.cjs detect-changes --scope all --repo .`，结果写进 REPORT（索引落后时它只看得到少数文件，结论不可信）。
3. 写 `REPORT.md`（做了什么、SC 对照、自定决定、基线 → 收口、GitNexus、交接、已知例外），登记表改「done，待复核」，提交并 push。
4. 独立 AI 复核写 `REVIEW.md`；修完 M 级和能修的 m 级，追加「处理记录」，登记表改「done，已复核，问题已修」。

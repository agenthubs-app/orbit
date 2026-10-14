# 开始一个功能 Sprint（R10 起）

骨架（R01–R09）留下的东西怎么用。下面用一个虚拟的小功能「活动的『行く価値はある？』入口」（契约 8，事件评估）把流程走一遍；每一步都写了具体文件。规则本身见两端 `AGENTS.md` 的「redesign 开发规则」一节和 [README](README.md)。

## 0. 开工

1. 在 `redesign` 上开个人分支：`git switch -c redesign-R26-event-assessment redesign`。分支名全用连字符：仓库里已有 `redesign` 分支，git 不允许再建 `redesign/…`。`chat-agent` 冻结，不往那里合。
2. 读本 Sprint 的 `GOAL.md` / `PLANNER.md`，和 [`screen-ownership.md`](screen-ownership.md) 里归你这一行的旧屏。
   - **必须先读 [交接表](HANDOFF-TO-FEATURE-SPRINTS.md) 里本 Sprint 那一节和「通用口径」**（骨架、导航壳返工、加人、计划 v2.2 和 2026-10-12 拍板留给你的事项与临时规定），把其中每一条写进自己 PLANNER 的验收契约（SC），写明交接表编号；收口 REPORT 逐条写处理结果。
   - 以后出现新的交接事项（留给别的 Sprint 的事、临时做法），**一律追加到交接表**对应 Sprint 的节，不只写在自己的 REPORT 里。
3. 记录基线：
   - orbits：`cd repos/orbits && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npm test`、`npm run typecheck`、`npm run typecheck:app`、`npm run lint`；
   - App：`cd repos/orbit-app && npm test`、`npx tsc --noEmit`。
   - 只跑几个文件：orbits `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 node scripts/run-node-tests.mjs <文件…>`；App `node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs <文件…>`（App 的 `npm test -- 文件` 仍会跑全部）。
   - 已知失败以 README「骨架登记表」最后一行为准，收口时逐条对照，零新增。
4. 先刷新 GitNexus 索引（落后时新符号查不到，`impact` / `detect-changes` 的结论也不可信）：`node .gitnexus/run.cjs analyze --index-only`（几分钟，可放后台）。改函数或组件之前跑 `node .gitnexus/run.cjs impact <符号> -f <文件> --direction upstream --repo . --summary-only`。
   - HIGH / CRITICAL 先在 REPORT 写对策；只是往一张表里加一项（例如登录前缀表）也可能报 CRITICAL，对策写「只追加，不改已有项」即可。
   - UNKNOWN（类型、常量数组、新文件里的符号常见）和「Target not found」（文件内部没导出的常量，例如登录前缀表）都用文本搜索确认调用方。
   - `detect-changes` 有时把改动算到相邻的无关函数上并报 critical（行号映射偏差）；核对它列出的符号确实是你改的，不是就在 REPORT 写明，不当结论。

## 1. 组件在哪、长什么样

| | 组件库 | 展示页 |
| --- | --- | --- |
| App | `repos/orbit-app/src/components/ui/**`（`Button`、`ListRow`、`BottomSheet`、`Toast`、`States`、`Icon` …） | 模拟器里打开 `/showcase/components`、`/showcase/icons`、`/showcase/copy` |
| Web | `repos/orbits/app/(app)/app/orbit-2026/ui/index.ts`（`Button`、`ListRow`、`Modal`、`Drawer`、`Popover`、`useToast`、`Table` …） | 浏览器打开 `/showcase/components`（只在开发环境） |

- 图标只用 `Icon`（形状在 `shared/design/icons.json`，`npm run design:tokens` 生成两端代码）。新代码里出现 `@expo/vector-icons` / `Ionicons` 会被 `ionicons-ratchet` 拦下。
- 颜色、圆角、字号、动效只用 token：App 用 `src/design/theme.ts` 的 `useOrbitTheme()` / `createThemedStyles`（它们读同步来的 `src/api/design/tokens.ts`，不要直接引那个生成文件），Web 写 `var(--…)`。Web 新样式只用 CSS Modules，渲染在 `<Orbit2026Scope>`（`[data-orbit-2026]`）里，不能嵌进旧的 `[data-orbit-real-page]`（`orbit-2026-scope` 测试）。CSS 里写死颜色会被 `orbit-2026-css-tokens` 拦下。
- 缺组件时找热点文件负责人提需求，不在自己的屏里另写一个。

## 2. 放进壳里

- **App**：屏幕用 `AppScreen`（标题、返回、滚动记忆都有了）。Task 的四段在 `src/screens/task/TaskScreen.tsx` 的 `TASK_SLOTS`，只换自己那一段的组件，不改分段结构。
- **Web**：页面里放 `<ShellPage title="…" subtitle="…" left={…} right={…} demoPill={…} rightRail />`（`left` / `right` 是标题两侧的按钮，`demoPill` 是示例模式药丸，一般用现成的 `ShellDemoPill`）（`orbit-2026/shell/slots.tsx`），左栏、主标题区、右栏、⌘K 都由壳画；页面不再挂任何导航。Task 容器在 `orbit-2026/task/TaskContainer.tsx`，同样只换自己的段。
  - 插槽的内容在壳里渲染，不在页面树里：它拿不到页面的 context（示例模式、页面状态），需要的值在页面里读好再作为 props 传进去（例子：`ShellDemoPill`）。
  - `ShellPage` 通常写在页面的 `Orbit2026Scope` 外面，那里 `useStandardCopy()` 会退回日文；标题用 `pickCopy(表.键, language)` 或 `standardCopyFor(language)`（`useOrbitLanguage()` 取 `language`）。
  - 不传 `rightRail`（或传 `false`）就没有右栏；传 `true` 用默认右栏；<1280 时右栏自动变成标题区按钮 + 380 抽屉。
  - 一个页面可以有多个 `ShellPage`，各设各的插槽。

## 3. 用演示世界的假数据开发

1. 契约已经在 `repos/orbits/shared/contract/event-assessment.ts`，校验在 `shared/api-schema/event-assessment.ts`。
2. 本地 dev server 默认是 mock 模式（`ORBIT_MODULE_MODE` 不设或设 `mock`）：`GET /api/events/assessments` 直接返回演示世界里的「SaaS Summit 2026」评估（78 分、推荐）。
3. 需要更多假数据时，加在 `shared/mock/demo-world/`：人和事只从 `index.ts` 取（10 个虚构人物、3 个活动、1 个计划），每条带 `sample: true`；`demo-world-consistency` 和 `demo-world-copy` 会检查名字、公司和日文。
4. App 用同一份契约：改完 orbits 的 `shared/**` 后在 App 跑 `npm run sync:contract`，副本和源在同一个提交里（不要直接改 App 的副本）。
5. **新增一个契约**（而不是用已有的）：照着契约 8（事件评估）改这些地方——
   - `shared/contract/<名字>.ts`（文件头写负责人和使用方）和 `shared/contract/index.ts` 的 `export type`；
   - `shared/api-schema/<名字>.ts`：导出未强转的 `*Object` 和强转后的 `*Schema`；响应不用 `.strict()`、枚举用 `tolerantEnum` / `knownValues`（`shared/api-schema/tolerant.ts`，写明兜底值），请求体用 `.strict()`（README 通用规则 10）；
   - `features/redesign-contracts/service-factory.ts` 的 `REDESIGN_CONTRACT_CAPABILITIES` 加 capability；
   - `mock-service.ts` 加 mock 行为（幂等键、重放按契约语义），`handlers.ts` 加处理函数（`redesignContractRoute(capability, schema, …)`）；
   - 路由文件 `app/api/<路径>/route.ts` 只写 `export { getX as GET } from "<相对路径>/features/redesign-contracts/handlers";` 和 `export const dynamic = "force-dynamic";`；
   - 测试：`tests/api/redesign-contract-routes.test.ts` 的 `CASES`（mock 成功、live 503），`tests/contracts/redesign-schema-parity.check.mts` 加一行，fixture 进 `demo-world-consistency`（它要求 `demo-world/fixtures.ts` 的每个新导出都带 `sample: true`，设置类、回执类才放进 `UNMARKED`），App 的 `tests/contract-fixtures-parse.test.ts` 也解析一遍；
   - 最后 `node scripts/contract-snapshot.mjs --write`。
6. **只改 `shared/**` 也要同步 App**：`cd repos/orbit-app && npm run sync:contract`，副本和源放在同一个提交。纯 Web 功能也一样，否则 App 的 `contract-sync` 测试变红。
7. **本地看假数据**：本地 `.env.local` 是 live 时，设 `ORBIT_REDESIGN_MOCK=<capability>`（逗号分隔，或 `all`）只把这些契约切到演示世界，其他页面照旧；生产忽略这个开关。
8. **接上真实接口**：在 `features/redesign-contracts/service-factory.ts` 给这个 capability 加 `live` 实现（或搬到 `features/events/…` 自己的 factory），`handlers.ts` 里对应函数改调真实服务；路由文件不动。数据库迁移按模块独立编号、只向前，两个人的模块不重叠。

## 4. 「尚未实现」

live 实现合入之前，正式环境里这些接口返回 `503` + `context.reason = "NOT_IMPLEMENTED"`。界面**不显示错误**：

Web 用 `fetch` 拿到信封（下面的 `body`）；App 的 `client.get()` 本身就返回带 `success` 的结果对象，直接把它交给 `whenNotImplemented`，没有 `.json()`。

```ts
// Web：从 repos/orbits 根目录的 shared/compute/not-implemented.ts 引入。文件在 app/(app)/app/orbit-2026/<模块>/ 下时是
//      import { whenNotImplemented } from "../../../../../shared/compute/not-implemented";（每深一层多一个 ../）
// App：同步副本在 src/api/compute/not-implemented.ts；src/screens/<模块>/ 下的文件写 "../../api/compute/not-implemented"。
const body = await response.json();                          // 统一信封：{ success: true, data } 或 { success: false, error }
const missing = whenNotImplemented(body, { use: "hide" });   // 没有合理默认值 → 隐藏这个入口或这一块
if (missing) return null;                                     // 「尚未実装」：不显示错误，整块不画
if (!body.success) return <RetryCard title={…} onRetry={reload} />; // 真正的故障（含普通 503）照常显示错误和重试（Web / App 的 ui 都有 RetryCard）
render(body.data);
// 有默认值的（首页布局）：whenNotImplemented(body, { use: "default", value: DEFAULT_HOME_LAYOUT }) 返回 { show: true, value }
```

只隐藏依赖这个接口的那一块；页面其余部分（标题、空态、其他数据）照常显示。

## 5. 跨人依赖的空态

依赖对方 Sprint 还没做的东西时（例如首页的计划分数组件要等 R22）：

- 先接 mock 接口开发；
- 正式环境遇到「尚未实现」按第 4 步隐藏或给默认值；
- 屏上需要占位时用 `States` 的空态（App `src/components/ui/States.tsx`，Web `orbit-2026/ui` 的 `EmptyState`），文字写「まだありません」这类普通说法，不写「开发中」「Coming soon」以外的内部用语；
- 在 REPORT「交接」写清楚依赖哪一个 Sprint、接上之后要删什么，并同时追加到 [交接表](HANDOFF-TO-FEATURE-SPRINTS.md) 对方 Sprint 的节。

## 6. 文案

- **App**：用户看得到的文字进字典 `src/i18n/`（日中英三语），组件类型在 `src/i18n/copy-kinds.ts` 登记。**新建一个字典域**还要：在 `src/i18n/{ja,zh,en}/index.ts` 里展开引入；把域名加进 `tests/i18n-domain-split.test.ts` 的 `ADDED_SINCE_SPLIT`；加进 `scripts/copy-qa/cli.mjs`（orbits）的 `APP_DOMAINS_IN_SCOPE`（新域和重写过的域都加）。
- **Web**：新代码的文字进 `app/(app)/app/orbit-2026/copy/*.ts`（`OrbitCopyTable`，`pickCopy` 取值）；通用的词（导航、按钮、状态）已在 `shared/copy/{ja,zh,en}.ts`，两端共用。
- 每条文案写 `kind`（`label`、`button`、`fullButton`、`menu`、`chip`、`sentence`、`dialogTitle`、`toast` …），长度上限和语气规则按 kind 执行，上限见 `scripts/copy-qa/check.mjs` 的 `LENGTH_LIMITS` / `EN_LENGTH_LIMITS`。常见问题：日文正文句末要「。」、中文与数字和占位符之间不加空格、拉丁字母单词与日文之间加半角空格、英文按钮用句首大写。
- 术语和写法看 R03 的术语表和写作规范；跑 `cd repos/orbits && npm run copy:qa`（Web 新文案、共用词、App 已纳入的域；你重写了 App 的哪个域，就把它加进 `scripts/copy-qa/cli.mjs` 的 `APP_DOMAINS_IN_SCOPE`）。
- 写死在代码里的文字会被两端 `no-hardcoded-copy` 拦下。旧屏在允许清单里；你重写了旧屏，就把它从清单里删掉（清单只减不增）。

## 7. 新路由要登记的地方

**App（4 处；第 4 处只做 Web 也要看）**

1. `src/view-models/mobile-route-access.ts` 的 `PRIVATE_ROUTE_PREFIXES`（需要登录的）；
2. `tests/app-wide-route-coverage.test.ts` 的 `integratedFeatureRoutes`；
3. `scripts/page-offline-inventory.ts` 登记离线策略，再 `npx tsx scripts/page-offline-inventory.ts --write` 重新生成 `docs/offline/page-inventory.md`；标成「需要联网」（`online-only`）的页面，路由文件要包一层 `withOnlineOnlyRoute(...)`（`tests/offline-pages-actions.test.tsx` 检查）；需要登录的根目录路由文件还要加进 `tests/mobile-route-access.test.ts` 的列表；
4. `tests/route-parity.test.ts`：Web 有的页面 App 也要有对应路由。**只做 Web 页面也要处理这一条**：这个测试扫描 Web 的页面目录，新加任何 Web 页面都会让它失败。要么同时加 App 路由（连同上面 3 处），要么请产品负责人决定加进 `tests/route-parity-exceptions.ts`（那里写明只有用户明确决定才能加，不能为了消掉失败而加）。

二级页在 `src/view-models/app-navigation.ts` 的 `parentForPath` 定义返回到哪一个一级页；推送落地链接在 `notification-model.ts`。

**Web（4 处）**

1. `features/auth/app-auth-routing.ts` 的 `ORBIT_PRIVATE_APP_PREFIXES`（需要登录的页面）；新的 `/api/**` 默认要登录，只有登录前必须可读的才进 `proxy.ts` 的 `isPublicApiPath`；
2. 审计清单（它也统计 App 的路由，所以**两端路由都加完再跑**）：在 `repos/orbits` 里跑 `npm run audit:full-product`，它写到**工作区根目录**的 `docs/audits/full-product-functional-audit/`；然后改 `tests/audits/web-route-transport.test.ts` 里的计数（`runtimePaths` 的两处、`report.summary` 的 `routeSurfaces` 和要登录的 `authRedirects`、`failedReport` 的 `failures`），并在旁边注释写明多了哪些页面。动态路由（`[id]`）要在 `scripts/verify-web-route-transport.mjs` 加一个运行样例。R09 结束时是 57 页。
3. 产品清单：同样在 `repos/orbits` 里跑 `npm run audit:surfaces`（写到根目录 `docs/audits/product-surface-*` 和 `button-action-coverage.md`，一起提交；生成的 README 会写当前 HEAD 和未提交改动数，在干净的工作区里生成最准），`tests/audits/product-surface-manifest.test.ts` 会检查新的 P0 / P1 候选。
4. `orbit-2026/shell/shell-routes.ts`：新页面默认就有壳（已登录的 `/app/**`）；只有它属于左栏某一栏时才在 `shellNavKeyFor` 加一行，全屏或 kiosk 类页面才需要在例外里排除；iOrbit 以外的页面默认允许右栏。⌘K 的页面上下文（`orbit-global-ask/orbit-ask-routes.ts` 的 `PAGE_CONTEXTS`）可选：加了，⌘K 交给 iOrbit 时会带上「表示中：…」。

## 8. 截图对照页与像素门禁

> ~~组件 / 画面验收用「设计稿画板 ↔ 实现」并排截图，不做逐像素门禁~~ → **修订（RD-16，用户决定 2026-10-11）**：画面必须和设计稿画板一模一样，只允许数据文字内容不同；验收靠逐像素门禁，并排对照页只作阅读辅助。

- 证据放 `~/orbit-sprint-evidence/redesign/R<编号>/run-01/`。
- **先找画板**：每个画面先在 `docs/designs/redesign-2026-10/` 里找到对应画板（文件 + 画板标题），写进 PLANNER；找不到画板的状态（如 STALE、错误态）标「设计稿无」并**先请用户拍板**画法，不许自己发挥。
- **设计稿里有的不许改、不许省**：做不到或不该做的先上报用户；REPORT「自定决定」只能写和设计稿无关的工程决定。
- **Web**：本地 dev server 登录 QA 账号（密码在 `repos/orbits/.env.local` 的 `ORBIT_PRIMARY_TEST_ACCOUNT_PASSWORD`，脚本从文件读，不要贴出来），用 `repos/orbits/scripts/visual/compare-redesign.mjs` 在 **1440 / 1024 / 390 × 浅色 / 深色**截**完整页面（含左栏、主标题区、右栏等导航壳）**，与设计稿画板逐像素比对。
- **App**：内置 iOS 模拟器（`mcp__Claude_Code_iOS_Simulator__control`；开发包用 `repos/orbit-app/.env.development.local` 指向 `http://localhost:3000`，不要改 `.env.local`；起 Metro 不带 `CI=1`）截**真实画面**，**不用 react-native-web**；`xcrun simctl io booted screenshot <文件>`，浅色 / 深色各一张；用 `compare-redesign-app.mjs` 按设备点宽缩放后与设计稿 App 画板逐带比对。
- **门禁**：整屏 raw ≤0.02；`--grid` 逐带比对，超阈值的带必须在归因文件（`repos/orbits/scripts/visual/attribution-redesign-<Sprint>.json`）里具名，且只能归因为 `[data]`（数据文字不同）；有一条带写不出 `[data]` 理由，就是缺陷，修完再跑。不过门禁的画面不得标 done。
- 对照页 `compare.html`：左边设计稿画板，中间实现，右边 diff，浅色 / 深色各一行，附 raw 与超阈值带数；放在证据目录，REPORT 里写路径和总表。
- 用法细节见 `repos/orbits/scripts/visual/README-redesign.md`。
- **写代码前先做「画板预检」**（2026-10-14 起必做；依据：R12–R16、R23–R25 返工里差几 px 的原因汇总，见决定表 §13–§25）。PLANNER 里每个画面附一张预检表，五项都过了才开始写界面：
  1. **画板自洽**：同一画板里的数字、条数、按钮文案互相对得上（例：弹窗 21 人 vs 表格合计 19 人、勾 3 行写「4件」）；不一致先请设计稿会话改画板。
  2. **每个元素有数据来源 / 功能**：逐个元素对照契约与接口，画了但没有接口或字段的（🎤、自由回答栏、「紹介 2件」、emoji chip、「· 名刺」）先定「去掉 / 记为以后的功能」，不要做完再发现。
  3. **token 齐**：用 `--style-diff` 或 `--extract-board` 列出画板用到的字号、行高、圆角、间距、颜色，和 token 源比对，缺的先补 token（R01 流程），**实现里不许出现手抄的近似值**（20 vs 21、14 vs 13、6 vs 7、行高 1.55 vs 1.5 都是这样来的）。
  4. **组件对齐 kit**：画面用到的组件（Modal / Drawer / Chip / Segmented / MacTile / Button 等）先查交接表 G23 / G23b 有没有已知差；有差就等组件库轮或标「待组件库」，不在页面里各自打补丁；新组件只加不改，并防旧页全局样式（如 `.btn`）漏进来。
  5. **演示数据照画板造**：先做「设计稿示例 fixture」，让人名长度、条数、分数、邮箱长度都和画板一样，再截第一张图；画板画的中途状态（展开中、toast、只填一半）在画面清单里写好怎么进到那个状态（深链 / fixture / 脚本步骤）。断点（1440 / 1024 / 390）各读一遍画板，不要自己推断响应式布局。
- **边写边比**：每做完一个区块就跑一次 `--only <画面>` + `--style-diff`，按元素修到 0 差再做下一块；不要整页写完才第一次比。App 端字形与折行按决定表 §19 / §20 处理（`UiText` 已统一标点挤压，日文显式 Hiragino）。
- **UI 对齐的默认流程**（**试行中，2026-10-12**；等 R05 和 Web 计划页两组的用时对比出来后转为定稿）。以后所有 UI 对齐、像素返工和功能 Sprint 的界面部分都按这个流程做：
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
- **适用范围**：以后所有 Sprint（甲乙都一样，含 R12–R16），不再有「先按自己理解做、事后对照」的做法。
- **PLANNER**：验收契约（SC）必须为**每个画面写一条像素 SC**，写明对应的设计稿文件 + 画板标题（或 `--list` 的画板序号）、宽度（Web 1440 / 1024 / 390；App 模拟器）和主题（浅 / 深），以及到达该状态的 URL / 操作步骤；设计稿没有的宽度或状态写「设计稿无」并注明用户拍板结论。
- **设计稿示例数据（fixture）**：设计稿的示例人名、分数、条数和真实演示数据不同时，可以在只读 mock 下加「设计稿示例 fixture」让画面数据贴近画板（计划页做法：`features/plans/v2/design-fixtures` + 只在非生产存在的 `route.dev.ts` 切换），但**只能补数据，不能改画面结构**，真实 AI / 有库路径与生产行为不变，并用测试守住（fixture 经同一接口 schema 解析、生产构建不收录）。门禁报「缺块」时先用 fixture 补数据让块出现，补了仍缺就是实现缺陷。
- **REPORT**：必须附门禁结果——每个画面 × 宽度 × 主题的 raw、超阈值带数、归因文件路径、证据目录；有未通过的画面不得标 done。
- **独立复核**：REVIEW 必须**自己重跑门禁**（同一套命令、同一归因文件），逐条核对超阈值带的 `[data]` 理由是否属实；不能只看 REPORT 附的截图或对照页。

## 9. 改契约、改热点文件

- **契约只加不改**：加可选字段、枚举值、新类型 → `cd repos/orbits && node scripts/contract-snapshot.mjs --write`，提交信息以 `contract:` 开头并写「App 需要同步」，App 跑 `npm run sync:contract`。破坏性改动先在 `shared/contract/BREAKING.md` 登记（日期、id、改动、原因、甲乙同意、App 跟进），再 `--write`。
- **热点文件**（归属表在两端 `AGENTS.md`）：不是负责人就先提需求，由负责人改。

## 10. 收口

1. 两端全量、typecheck、lint，对照基线零新增失败（失败的单独重跑确认是否不稳定）。`npm run lint` 只检查一份固定清单；新文件靠 `npm run typecheck` / `typecheck:app` 和各门禁测试把关。
2. 先 `node .gitnexus/run.cjs analyze --index-only`，再 `node .gitnexus/run.cjs detect-changes --scope all --repo .`，结果写进 REPORT（索引落后时它只看得到少数文件，结论不可信）。
3. 写 `REPORT.md`（做了什么、SC 对照、**像素门禁总表**、自定决定（只限工程决定，偏离设计稿的必须先请用户拍板，RD-16）、基线 → 收口、GitNexus、交接、已知例外），登记表改「done，待复核」，提交并 push。
4. 独立 AI 复核写 `REVIEW.md`（**必须重跑像素门禁**，见第 8 节）；修完 M 级和能修的 m 级，追加「处理记录」，登记表改「done，已复核，问题已修」。

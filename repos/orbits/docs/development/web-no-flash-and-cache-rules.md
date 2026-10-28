# Web 页面不闪动与读取缓存规则

用户在 2026-10-28 定下这些规则，此后所有 Web 页面都必须遵守，新页面和改动的页面都一样。
它们取代各页面以前各自的加载和轮询做法。下面「已有实现」里列的模块就是规则的落点：新页面要接入这些模块，不要另写一套。

对标做法：
- 不闪动：Linear、Notion、Gmail 的固定框架加骨架屏。
- 缓存：TanStack Query / SWR 的 stale-while-revalidate，以及 Remix 的「写后重新验证」。

---

## 一、布局与内容不闪动

总原则：**先画固定框架和同尺寸占位，内容到齐后原位替换。不许先画一半再补，也不许出现后再挪位置。**

### 1. 固定框架先画

- 带左栏的页面，外壳要在页面挂载**之前**就画出标题、工具行和右栏这几块的位置。一级页面有首页、人脉、iOrbit、活动、Task、收件箱，设置（`/app/profile`、`/app/settings/*`）也算。
  - 框架写在 `shell/shell-routes.ts` 的 `shellFrameFor`。新增带框架的页面，在这里加一项。
  - 外壳先画的内容：真实标题文字、工具行控件的同宽占位、右栏骨架。
- 页面把内容交给外壳（`ShellPage`）时，挂载和卸载都在绘制之前完成（`useLayoutEffect`）。后续更新仍然用 `useEffect`，否则同时读写 slots 的组件树会死循环。
- 右栏的三种状态要分清：
  - `rightRail={undefined}`：数据还没到，外壳保留右栏骨架。
  - `rightRail={false}`：这个页面确实没有右栏。
  - 右栏数据没到齐之前，不许传 `false`。
- 路由加载中（`app/(app)/app/loading.tsx` 里的 `RouteSkeleton`），按路径画该页同布局的骨架。设置页的骨架里，菜单画成真的，标题和正文画成骨架。
  - 不要给每个路由单独放 `loading.tsx`，它会带到下级页面。

### 2. 内容齐了再画，之前用同尺寸骨架

- 「还没读到」用 `null` 或 `undefined` 表示，不许用 `[]` 或 `0`。否则会先显示「暂无」「0」，再跳成真实内容。
- 一块内容依赖几个读取，就等这几个读取都回来再一起画。例如首页右栏的七个读取、iOrbit 设置页的四个读取。
  - 只有一部分依赖慢数据时，只把这一部分画成骨架。例子：个人资料页最下面一排的卡片数量和宽度取决于活动数，这一排先是骨架，其余照常显示。
- 骨架和真实内容同尺寸：用同一个网格、同样的卡片类名、相近的行高。
- 数字、计数、chip 后面的数字、状态标签不许后补：
  - 和所在那一块一起出现；
  - 或者先占一个同宽的骨架。
- 派生出来的计数用 `useMemo` 从已到的数据算，不要另发一次读取再补。
- 后台刷新时保留现有内容，不回到骨架。只有第一次进入页面、手里还没有任何内容时才显示骨架。
- 读取失败时保留上次的内容。只有从来没读成功过，才显示失败卡片和「再試行」。
- 没开通的功能不显示任何相关界面（例如服务端没配 Google 日历时返回 `"off"`），不能显示一张「读取失败」卡片。
  - 已连接但这次读取失败，在原位置显示一行小字和「再試行」，不用整张阻断卡片。

### 3. 控件位置固定

- 同一组视图共用的控件放在同一个位置，切换视图时不许移动。例子：日历的日 / 周 / 月三种视图共用一行工具栏，切换按钮永远在最右。
- 某个按钮当前没有作用时，变成禁用，不要隐藏。隐藏会让旁边的元素移位。例子：今天已经在可见范围内时，「今日」按钮禁用。
- 窄屏换行时，右侧控件仍然靠右（`margin-left: auto`）。

### 4. 切换方式

- 应用内的导航一律用 `next/link` 的 `<Link prefetch>` 做客户端跳转。不许用 `<a href>` 整页刷新，整页刷新会清空内存缓存，所有内容都要重读。
  - 适用范围：左栏、底栏、设置菜单、页内跳到另一个应用页面的按钮。
- 页面切换不加滑入滑出动画。收件箱之前从侧边滑入，已经去掉。
- 不要用 `router.refresh()` 做后台刷新，它会清空整个路由缓存。

### 5. 验收方法

- 在本地**生产构建**上测量，不要用 dev 测。dev 下连续点击经常丢失，而且会编译到一半。
- 做法：
  - 用 MutationObserver 逐帧记录标题、菜单、主标题、右栏的位置（`getBoundingClientRect`）。
  - 切换前后和加载中，这些位置必须保持不变。
- 内置浏览器面板隐藏时，页面水合很慢。测量脚本要等链接上已经有 React 属性再点击，否则会点到还没水合的 `<a>`，造成整页跳转，被误判成没做客户端跳转。

---

## 二、读取与缓存

总原则：**少读，读的时候不显眼，有新内容时仍然要更新，而且不能牺牲数据安全。**

### 1. 统一缓存：`app/(app)/app/orbit-last-answer.ts`

所有页面的客户端读取都通过它，不要自己再写模块变量缓存、localStorage 缓存或自建轮询。

- **上次的结果**：页面重新挂载时，先把上次读到的内容画出来（`lastAnswer`），后台再读，新结果回来后原位替换（`rememberAnswer`）。
- **新鲜期**（`FRESH`）：在新鲜期内、而且没有被作废的结果，挂载时不再重读（用 `answerFresh` 判断）。
  - `FRESH.list` = 60 秒：列表和概要，例如人脉、活动、待办、日程、メモ、会话列表、活动数量、导出历史。
  - `FRESH.slow` = 10 分钟：很少变的内容，例如个人资料、设置、计划目标、连接列表。
  - `FRESH.focus` = 0：回到前台（focus 或 visibilitychange）时总是重读。这时别的设备可能改过数据。
- **写后作废**：外壳只安装一次 `orbit-write-watch.ts`。它观察同源 `/api/`（不含 `/api/auth/`）的非 GET 请求，成功后把全部结果标成需要重读（`markAllAnswersStale`）。
  - 页面不需要自己记住「写了哪里要刷新什么」。
  - 正在显示的读取方可以用 `onAnswersStale` 订阅，立刻重读。
  - 写操作成功后，可以直接用返回的数据 `rememberAnswer`。
- **key 命名**：`区域:资源`，例如 `network:summary`、`todo:page`、`profile:main`、`settings:integrations`。
  - 前缀决定了游标变化时会作废哪些 key（见 `AREA_ANSWER_PREFIXES`）。
  - 同一个接口在多个页面读取时，共用一个 key，例如个人资料用 `PROFILE_ANSWER_KEY`。
- 只记成功的结果，失败不记。

### 2. 有新内容时怎么知道：变更游标 `GET /api/changes`

- 每个区域（inbox、contacts、tasks、calendar、memo、agent）返回一个不透明的 32 位指纹：
  - 带 ETag，没变化时返回 304，没有正文；
  - 响应头 `private, no-cache`、`Vary: Cookie`、`X-Poll-Interval: 30`。
- 客户端是 `orbit-change-watch.ts`，外壳在登录后安装：
  - 页面可见时，每 30 秒问一次；
  - 回到前台或恢复联网时立刻问，2 秒内不重复；
  - 哪个区域变了，只作废这个区域的结果（`markAreaAnswersStale`），并通知挂载中的读取方（`useAreaChanges`）；
  - 自己写入之后调用 `adoptNextChanges`，把下一次的答案只当作新基准，不重复刷新。
- 准实时的页面（收件箱）只靠游标驱动，另加 `AREA_FALLBACK_MS`（120 秒）兜底。**不许再写固定间隔的轮询**，以前收件箱 15 秒一次的轮询已经全部去掉。
- 新增一种数据时：
  - 在 `shared/storage/change-tokens.ts` 的 `AREA_COLLECTIONS` 里把它归到对应区域；
  - 在 `AREA_ANSWER_PREFIXES` 里登记它的 key 前缀。
- 实时推送（WebSocket / SSE，需要付费服务）还没做，要等用户决定。

### 3. 路由缓存

- `next.config.js`：`experimental.staleTimes = { dynamic: 30, static: 900 }`。
- 一级页面用 `<Link prefetch>` 整页预取，15 分钟内来回切换不再请求服务器。
- 二级页面保持 30 秒，因为它们的内容是服务端渲染的。

### 4. 数据安全（缓存规则的前提）

- **只放在内存里**：关系数据只存在模块变量里，不写 localStorage、sessionStorage、IndexedDB。刷新页面或登出（整页跳转）后就没了。
  - 这和「浏览器不存关系数据」的约定一致，见 [local-mirror-threat-model](../../../orbit-app/docs/phoneweb/local-mirror-threat-model.md) 和 `docs/adr/0006-cloud-authority-with-encrypted-local-mirrors.md`。
- **按账号隔离**：
  - key 里带当前账号（`orbit-shared-read`），账号未知时既不记也不给；
  - 账号一变，旧账号的全部结果立刻清掉；
  - 最多记 64 条，最久没用的先丢。
- **登出**：所有退出入口一律调用 `orbit-sign-out.ts` 的 `signOutAndForget`。它会清掉：
  - 内存缓存、首页资源、变更游标；
  - localStorage 里带个人内容的项；
  - 整个 sessionStorage。
  
  另外，next-auth 的登出响应带 `Clear-Site-Data: "cache"`。新增带个人内容的浏览器存储项时，要同时加进 `orbit-sign-out.ts` 的清单。
- **防登出后回退看到旧页面**：已登录的 `/app` 页面由 `proxy.ts` 加 `cache-control: private, no-store`，避免登出后按「后退」从 bfcache 看到上一个人的页面。
- **游标不泄露内容**：`/api/changes` 只返回不可逆的哈希，只查本人的行，出错时返回 503 并且不缓存。
- **有意不缓存的页面**：每次读取都要核对账号的页面，例如通知设置（隐藏时清数据、每次核对 actor），不接入缓存，只加骨架。
  - 这类页面要在代码注释里写明为什么不缓存。

### 5. 不能做的事

- 不要在页面里自己写 `setInterval` 轮询服务器。
- 不要为了刷新数据整页刷新，也不要用 `router.refresh()`。
- 不要把关系数据或个人内容放进浏览器持久存储做缓存。
- 不要在挂载时无条件重读新鲜期内的数据。
- 不要因为后台刷新或刷新失败把已有内容换回骨架或空状态。

---

## 已有实现（新页面接入这些模块）

| 作用 | 文件 |
| --- | --- |
| 固定框架 | `app/(app)/app/orbit-2026/shell/shell-routes.ts`（`shellFrameFor`） |
| 外壳插槽 | `app/(app)/app/orbit-2026/shell/slots.tsx`（`ShellPage`、`useShellSlotsFilled`） |
| 路由骨架 | `app/(app)/app/orbit-2026/shell/RouteSkeleton.tsx`、`PageSkeleton.tsx` |
| 设置页框架 | `app/(app)/app/orbit-2026/account/AccountLayout.tsx`（`railPending`、`shell={false}`、不传 `title` 时画标题骨架） |
| 统一缓存 | `app/(app)/app/orbit-last-answer.ts` |
| 写后作废 | `app/(app)/app/orbit-write-watch.ts` |
| 变更游标（客户端） | `app/(app)/app/orbit-change-watch.ts` |
| 变更游标（服务端） | `app/api/changes/`、`shared/storage/change-tokens.ts` |
| 登出清理 | `app/(app)/app/orbit-sign-out.ts` |
| 路由缓存 | `next.config.js`（`staleTimes`） |

## 测试注意

- 测试之间会共享模块里的缓存。读取缓存的组件，测试里要在 `beforeEach` 调用 `resetLastAnswersForTests()`。
- 测试里装了变更游标的，结束时调用 `stopChangeWatchForTests()`。
- 在 react-test-renderer 里渲染 `next/link` 时，预取需要 `globalThis.self`，测试文件里补 `globalThis.self ??= globalThis`。

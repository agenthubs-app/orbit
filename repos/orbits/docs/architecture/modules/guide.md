# Guide 模块

## 模块定位

Guide 负责新用户引导期的状态：引导进度（第 1–3 步）从真实数据推导，本人的引导记录（老用户判定、示例横条是否收起）存一条记录，并决定 iOrbit 首页是否进入示例模式（W0004，RW-03 首页部分；W0005／W0006／W0014 复用）。

## 期望行为

- 开关（`shared/config/guide-demo.ts`，纯服务端）：`ORBIT_GUIDE_DEMO` 为 `on`／`true`／`1` 时打开，默认关（D1，W0008 上线时在目标环境打开）；`ORBIT_GUIDE_DEMO_SINCE` 是开关首次启用的日期，用于老用户判定：`YYYY-MM-DD` 按东京当天 00:00 解释，完整时间戳必须带 `Z` 或 `±HH:MM`，否则视为未设置。开关关闭时不做任何读取，页面与 W0001 一致。
- 进度（`features/guide/progress.ts`）：第 1 步 = 本人已确认联系人 ≥3（`orbit_records` 的 contacts，按 actor 归属过滤，排除初始化中与已删除），第 2 步 = profile 的 `relationshipGoal` 非空，第 3 步 = 有生效中的计划（`features/plans` 的 `getCurrent()`）。
- 进入示例 = 开关打开且第 1–3 步未全部完成且不是老用户。
- 老用户（D2）：账号创建早于 `ORBIT_GUIDE_DEMO_SINCE` 且首次判定时已确认联系人 ≥3。创建时间从账号记录读；读不到（或没配 SINCE）时按「已确认联系人 ≥3 即老用户」。首次判定结果（true／false）写入引导记录 `grandfathered`，之后不再改变。
- 任何来源读不到（计数、计划、引导记录、首次判定写入）都 fail closed：按真实首页渲染，不锁定判定结果。
- 引导记录存 `orbit_records`：collection `guideState`，recordId `current`，payload `{ grandfathered?, bannerCollapsed?, version }`（`version` 为结构版本，当前 1）。workspaceId 按 actor 分片（`<workspace>:guide-actor:<actorId>`）并写 `userId`；写入走 compare-and-swap，两个字段并发更新互不覆盖。
- `GET /api/guide/state` 返回 `{ grandfathered, bannerCollapsed, version }`；`PATCH` 只接受 `{ bannerCollapsed: boolean }`，其余字段（含 `grandfathered`）一律 400。未登录 401，只读写本人。
- 横条收起状态只存在服务端引导记录里；前端串行发送、只发最新选择，写失败时只保留本次页面状态，不在浏览器本地存任何可重放的值。
- 示例壳挂载时取出并清除别处暂存的待发提问与地址栏 `?q=`，改弹拦截层，保证之后的真实壳不会自动发出。
- 示例数据只在前端（`app/(app)/app/_demo/demo-persona.ts`），不写库、不进任何接口请求；前端骨架（横条、导航药丸、「示例」角标、写操作拦截层）在 `app/(app)/app/_demo/demo-mode-context.tsx`。

## Mock 行为

Mock 使用进程内内存存储（挂在 `globalThis`，dev 热重载后仍在），语义与 live 相同（CAS、首次判定只写一次），不访问数据库或网络。hybrid 未单独注册，按约定回落到 mock。

## 热拔插边界

页面与 API route 只通过 `features/guide/service-factory.ts` 的 `resolveGuideStateService` 取引导记录服务，页面经 `readGuideStatusForActor` 取整份引导状态（读取器可注入，测试不连库）。live 模式在数据库未配置时返回共享的 `NOT_IMPLEMENTED` 解析失败（API 以 503 envelope 返回），不回落到内存存储。

# Sprint 0088 — 关系仪表盘：15 秒白屏与一条超时错误

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** TODO.md「2026-09-19 全量功能与 UI 复核」第 2 条。
**单一目标:** 量出 `/dashboard` 首屏 15 秒的去向，按量到的瓶颈修，并让超时有用户可见结果。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** `chat-agent` = `ededaa6ac`。未启动，run_count = 0。
**进入条件:** 本地库有演示账号数据（78 联系人／80 待办／16 活动）；Next dev 可跑。

## 已查明的事实

| 事实 | 位置 |
| --- | --- |
| 六个独立资源同屏拉取 | `src/screens/dashboard/DashboardScreen.tsx:58-82`：`aggregate`／`summary`／`opportunities`／`gaps`／`distributions`／`audit` 六个 `useApiResource` |
| 首屏只看一个 | 同文件 `:163` 只以 `aggregateState.kind === "loading"` 决定整屏 `LoadingState` |
| 12000 不在 App 源码里 | App 内唯一超时常量是 `useSyncedCollection.ts:32` `DEFAULT_INVALIDATION_TIMEOUT_MS = 8_000` 与 `sync-lifecycle.web.ts:57` `WEB_MIRROR_OPEN_TIMEOUT_MS = 15_000`；`12000ms timeout exceeded` 的出处未定位，**本 Sprint 第一步就是定位它** |
| 复核观测 | 五个接口全 200；前约 15 秒纯转圈；console 一条超时错误（复核中唯一） |

**判断 1：先量后改。** 不先拿到六个接口各自的服务端耗时与发起时刻就动手，等于猜。第一步产出度量表，第二步才决定是并发上限、串行依赖、还是某个接口本身慢。
**判断 2：超时不能只进 console。** 无论瓶颈在哪，`12000ms timeout exceeded` 目前对用户表现为"一直转圈"。超时必须落到可见的可重试错误态——与 0078／0087 同一条原则（失败要可见）。
**判断 3：首屏不应由单个资源决定。** 六块内容互相独立，能出的先出；这条即使瓶颈在服务端也成立。

## 范围与文件

- 度量产物：`docs/audits/2026-xx-dashboard-timing/`（接口耗时表 + trace）。
- App：`src/screens/dashboard/DashboardScreen.tsx`、`src/hooks/useApiResource.ts`（若超时在此）。
- orbits：度量指向的具体 handler／provider（待第一步确定，按 RULES 第 0 节登记新增路径）。
- 测试：dashboard 屏幕测试、受影响 handler 的定向测试。
- 排除：改仪表盘信息架构或指标口径；改全局请求层超时策略（除非度量指向它）。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0088-01 | `12000ms timeout exceeded` 的出处被定位并写明 | 度量表 + 源码位置 |
| SC-0088-02 | 六个接口各自的服务端耗时与发起时刻被量出 | 耗时表 |
| SC-0088-03 | 首屏不再由单个资源决定；能出的分块先出 | 屏幕测试 + 截图 |
| SC-0088-04 | 超时落到可见可重试的错误态，console 无未处理超时 | 复核抓 console |
| SC-0088-05 | 修后重新计时，与 SC-0088-02 同口径对比 | 前后耗时表 + 两端 typecheck 0 |

## 一次 Generator 的执行顺序

1. 登记 run-01；分支 `codex/sprint-0088-dashboard-first-paint`。2. 度量（定位 12000 + 六接口耗时）。3. 按度量决定修法并登记。4. RED→GREEN。5. 重新计时对比 → 收口。

## 最小测试与检查

- 档位：App L；若度量指向服务端共享路径则升 orbits H。定向集：dashboard 屏幕测试 + 涉及 handler。

## 失败与交接

若度量显示瓶颈在服务端且修复超出一个 Sprint，本 Sprint 只落 SC-01/02/03/04（可见性与分块首屏），把服务端优化拆为后续 Sprint 并登记，不把慢接口当成已修。

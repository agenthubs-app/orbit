# Sprint 0088 报告 — 关系仪表盘首屏

**状态:** 见登记表（**completed**）。**run-01。**

## 先说与原需求不符的两件事

复核记录的是「15 秒白屏 + 一条 `12000ms timeout exceeded`」。**两条都没复现。**

- 首屏内容 **245–256ms**（热）。首次 export 后的冷跑 2112ms，是 Next dev 首次编译路由 + 构建缓存，不是产品耗时。
- console 里**没有任何超时错误**，只有一条 expo-notifications 的 web 警告。两个仓库里唯一的 `12_000` 是 `features/orbit-ai/agent-tools/registry.ts:187` 的 **agent 工具超时**——不在仪表盘这条路上。

这是本批次第三次遇到同一类情况（0091、0092、0088），都指向复核当时磁盘只剩 226MB 的环境。

## SC-0088-02：六个接口的耗时与发起时刻

热跑，相对导航开始：

| 接口 | 发起 | 耗时 |
| --- | --- | --- |
| `/api/dashboard` | +130ms | 60ms |
| `/api/dashboard/summary` | +130ms | 57ms |
| `/api/dashboard/opportunities` | +130ms | 57ms |
| `/api/dashboard/network-gaps` | +130ms | 57ms |
| `/api/dashboard/distributions` | +130ms | 57ms |
| `/api/audit/provenance` | +130ms | 69ms |

**六个是并发的，且落地时间相差不到 20ms。** 所以 Planner 判断 1 想排查的"并发上限／串行依赖／某接口特别慢"三种可能，实测都不成立——这里没有可分批、可提速的东西。

（同一台机器、同一份数据，两轮之间接口耗时在 57ms 与 340ms 之间波动，服务端没有任何改动。所以首屏 550ms→250ms 这个差值**不能算作本 Sprint 的成果**，它主要是服务端预热差异。）

## 真正存在的问题：首屏挂在一个资源上

`DashboardScreen.tsx:163` 原本只看 `aggregateState.kind === "loading"` 决定整屏 `LoadingState`。其余五块内容与它无关，却被一起挡住——一个读不回来，整页白。

改法：

- **任何一个资源落地就开始渲染**，不再等 `aggregate`。
- **覆盖度那张卡说自己的状态**：正在读 / 读取超时（带重试）/ 暂时不可用（带重试）。
- **绝不画成 0%**。`dashboardToView` 在 `aggregate` 为 null 时会把指标算成 0，直接渲染就会把"没读到"显示成"没有"——这正是 0087 在待办页定过的那条规则，也是为什么这里不是简单把 `aggregate` 改成可选就完事。
- 上限复用 0092 的 `useLoadingDeadline`（8s），重试重置计时。

## SC-0088-03／04 的证据

浏览器里只挂住覆盖度那一个请求，其余五个正常返回：

```
~3s : 正在读取关系覆盖=true  超时=false 重试=false  其它区块可见=true
~10s: 正在读取关系覆盖=false 超时=true  重试=true   其它区块可见=true
console errors: none
```

改动前，这两个时刻都是白屏。

测试 `tests/dashboard-first-paint.test.tsx` 五条：卡住时其余区块仍渲染、未读到不画 0%、逾期显示超时并可重试、六个都没落地时才显示整屏 loading、全部落地时正常显示表盘。去掉改动后复跑，第一条和第三条变红。

第一次写这个测试时 stub 少了 `usePathname` 和 `router.canGoBack`，五条全挂在同一个 TypeError 上——**那不是红，是没跑起来**，补齐 stub 才拿到真实结果。

## 验收对照

| SC | 结果 | 说明 |
| --- | --- | --- |
| SC-0088-01 | pass（结论为否定） | `12000ms timeout exceeded` 不复现；两仓库唯一的 `12_000` 在 agent 工具超时，不在本路径 |
| SC-0088-02 | pass | 上表；六个并发，落地相差 <20ms |
| SC-0088-03 | pass | 首屏不再由 `aggregate` 决定；浏览器与屏幕测试双证据 |
| SC-0088-04 | pass | 超时落到可见可重试态；console 无未处理超时 |
| SC-0088-05 | pass | 同口径前后对照见上（并已说明差值不可归因于本 Sprint）；App 3572/3572；两端 typecheck 0 |

## 没有做的事

没有碰服务端。六个接口各 57ms 并发，没有可优化的瓶颈；为了"做点什么"去改 handler，只会是无据的改动。

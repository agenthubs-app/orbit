# R11b REVIEW（2026-10-19）

**结论：请求修正。** SC-01～09 的主要实现有代码与测试支撑；SC-10 仅完成 Web 六张门禁，App 门禁仍待 R11-18。Web 门禁归因和 App 锁定边界需修正后重验。

## S

- **S1｜缓存可绕过 10 人锁。** App 名单收到服务端 `409 LOCKED` 后，仍以缓存第一页作为成功结果，继续显示姓名；仪表页的旧 `open` 缓存也会在最新人数返回前触发快照 GET。[analysis-api.ts:73](/Volumes/ORICO/Dev/worktrees/orbit/redesign/repos/orbit-app/src/screens/network-analysis/analysis-api.ts:73)、[NetworkAnalysisScreen.tsx:33](/Volumes/ORICO/Dev/worktrees/orbit/redesign/repos/orbit-app/src/screens/network-analysis/NetworkAnalysisScreen.tsx:33)。**修法：**锁定响应覆盖并清除名单缓存；快照联网读取须等最新人数确认解锁。补“缓存为 open、服务端已降至 9 人”的回归测试。

## M

- **M1｜Web 门禁的 `[data]` 归因越界。** W-R11b-04 缺少整行机会卡及「インサイトから」区域，却将这些超阈带归为数据文字差异；三联图也显示缺块。[attribution-redesign-R11b.json:28](/Volumes/ORICO/Dev/worktrees/orbit/redesign/repos/orbits/scripts/visual/attribution-redesign-R11b.json:28)。主会话批准隐藏无数据源的块，但 RD-16／RD-29 的 `[data]` 不涵盖元素缺失。**修法：**用批准后的画板重比，或将该画面记为未过／暂缓；不能据此称 Web 6/6 通过。
- **M2｜错误日志可能带 PII。** 分析 API 将异常 `message` 前 80 字直接写入日志；数据访问错误可能含联系人资料。[analysis-handlers.ts:31](/Volumes/ORICO/Dev/worktrees/orbit/redesign/repos/orbits/features/network-analysis/analysis-handlers.ts:31)。**修法：**仅记事件、错误类别及安全错误码。

## m

- **m1｜“自身新失败 0”的旁证不完整。** 收口 Web 日志有一条基线名单外的日程失败；[REPORT.md:47](/Volumes/ORICO/Dev/worktrees/orbit/redesign/docs/designs/redesign-2026-10/sprints/R11b-network-analysis/REPORT.md:47) 称它在基线副本也复现，但未附对应复现日志。R11b 未改该用例，归因合理；**修法：**补同日期、同命令的基线复现证据。全量仍为 Web 7 败、App 10 败，不能表述为全量通过。

## 核实通过项

日文快照使用可空新增列、同次三语生成；共享契约新增并同步 App，响应 schema 宽进、请求严格。服务端接口按登录用户读取，旧分析路由、App route coverage 与离线清单已接新屏；在线重算未扩大 outbox／同步实体。R11b 未改 OAuth、公开页、组件库、token 或导航壳文件。独立重跑的服务端／契约测试 **19/19**、App 路由及离线资格测试 **13/13** 通过；App 渲染重跑因全机重任务锁未取得而取消，未计为通过。
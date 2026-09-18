# Sprint 0088 — 关系仪表盘：15 秒白屏与一条超时错误

## 要实现什么

`/dashboard` 的五个接口全部返回 200，但前约 15 秒只有转圈，console 抛 `12000ms timeout exceeded`——这是 2026-09-19 全量复核里唯一一条 console 错误。本 Sprint 先量出这 15 秒花在哪（六个 `useApiResource` 并发、服务端单接口耗时、是否互相排队），再按量到的瓶颈修，并让超时有明确的用户可见结果而不是只进 console。

## 做完能看到什么

- 打开 `/dashboard`：首屏在可接受时间内出内容（先出能出的，不是六个一起等）。
- 不再有 `12000ms timeout exceeded` 进 console；真超时时页面显示可重试的错误，而不是继续转圈。
- 一份耗时度量：六个接口各自的服务端耗时与串／并行情况。

## 怎么验收

复核时重新计时并抓 console；有度量数据支撑"修的是真瓶颈"。TODO 第 6 节第 2 条。

完整验收项和启动条件见 [PLANNER.md](PLANNER.md)。当前状态见[登记表](../README.md#sprint-登记表)。

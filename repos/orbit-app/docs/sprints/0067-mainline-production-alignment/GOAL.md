# Sprint 0067 — 主线重新包含生产正在运行的源码

## 要实现什么

把 `codex/production-cutover-read-write-20260917` 合并回 `chat-agent`，让主线重新包含
`www.orbitailink.com` 正在运行的那份源码；并把主线已有的本地／云端数据库切换开关，
正确地嵌进该分支带来的生产库围栏内部。

## 做完能看到什么

- `git merge-base --is-ancestor <生产分支 tip> chat-agent` 退出码为 0：主线不再缺少生产代码。
- 同一份 `resolveLiveDatabaseConnectionConfig()` 同时满足两件事：生产环境没有显式钉死
  数据库主机和 workspace 时**拒绝启动**；开发机把 `ORBIT_DATABASE_TARGET` 设为 `local`
  时连本机 Postgres，不设时行为与改动前逐字节一致。
- 开发者在本机用 `target=local` 能登录并读到真实数据，不再因为旧云端库被停用而卡在登录页。

## 怎么验收

先用 Git 事实确认主线已包含生产源码，再用围栏与开关的四种环境组合断言互不干扰，
其中"生产环境缺少钉死变量"必须是明确失败而不是回退到某个默认库。
合并树需要两端 TypeScript 通过，并跑通生产分支自带的那批数据库测试。
最后在本机以 `target=local` 实际登录一次，确认读到数据。

本 Sprint 只做归位，不改产品行为、不部署、不接管生产分支尚未完成的验收项。
完整验收项和启动条件见 [PLANNER.md](PLANNER.md)。本页说明预期目标，不代表已实现；
当前状态见[登记表](../README.md#sprint-登记表)。

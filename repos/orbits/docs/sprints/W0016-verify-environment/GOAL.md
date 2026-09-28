# Sprint W0016 — 验收环境与测试数据

## 要实现什么

有一个开着示例开关的验收 server 和几套造好数据的测试账号，后面逐场景验收时直接登录就能看，不碰用户自己的账号。

## 做完能看到什么

- `http://localhost:3001` 开着 `ORBIT_GUIDE_DEMO`，连本机库；3000 端口的现有 server 不受影响。
- 一条命令造好（可重复执行）以下测试账号，一条命令拿到各账号的登录 cookie：全新用户、老用户、计划进行中、计划已到期、今天报了活动并扫了名片。
- 名片合照裁成单张图片，放在仓库外。

## 前置

大目标 1 全部 completed；外接盘 `/Volumes/ORICO` 已挂载（按根 `CLAUDE.md`，worktree 只能建在外接盘）。

完整验收项见 [PLANNER.md](PLANNER.md)。当前状态见[登记表](../README.md#sprint-登记表)。

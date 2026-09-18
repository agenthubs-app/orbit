# Sprint 0081 — 活动画像：答满 8 题后能真正生成画像

## 要实现什么

报名问卷答到第 8 题、点"生成画像"时，服务端 `POST /api/events/:id/registration/persona` 返回 422，画像永远出不来。本 Sprint 先抓到 422 的 `portraitCode` 与原因，再修掉它，并让同类失败在界面上说清楚（不再只是"暂时无法生成"）。

## 做完能看到什么

- phoneweb 或 Simulator 上：答满 8 题（含由报名答案预填的题）→ 生成画像 → 进入画像预览 → 保存成功。
- 混合三种答案证明（`signed_question`／`registration_question`／`stored_response`）的会话不再被拒。
- 若服务端仍拒绝，界面显示带 `portraitCode` 的具体原因，而不是泛化文案。

## 怎么验收

真实 Chromium 抓 persona 请求（先复现 422 再复现 200）；orbits 单测覆盖修复的校验分支；App 全量对照零新增失败。TODO 第 1 条。

完整验收项和启动条件见 [PLANNER.md](PLANNER.md)。当前状态见[登记表](../README.md#sprint-登记表)。

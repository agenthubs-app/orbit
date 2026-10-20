# R10 独立复核 REVIEW

**结论：暂不验收。** SC-02 的 D-01 定向证据成立；SC-01、03–14、16 仍为部分完成或待联验，SC-15 像素门禁未过。REPORT 对开放项的记录基本如实，但最终提交版的“自身新失败 0”尚未经全量复测证明。

## 问题

- **S：未发现已证实的严重问题。**
- **M｜Web 编辑会丢失草稿。** [HomePlaceholder.tsx:107](/Volumes/ORICO/Dev/worktrees/orbit/redesign/repos/orbits/app/(app)/app/orbit-2026/home/HomePlaceholder.tsx:107) 的编辑区「完了」只退出编辑，随后的 effect 清空草稿；顶部同名按钮才调用保存。两处统一调用 `finish()`，补测编辑区按钮。
- **M｜空态隐藏每天一问。** [HomeCards.tsx:65](/Volumes/ORICO/Dev/worktrees/orbit/redesign/repos/orbits/app/(app)/app/orbit-2026/home/HomeCards.tsx:65) 与 [HomeWidgetCards.tsx:73](/Volumes/ORICO/Dev/worktrees/orbit/redesign/repos/orbit-app/src/screens/home/HomeWidgetCards.tsx:73) 在引导存在且任务、日程为空时提前返回，`TodayQuestionCard` 不会渲染。保留引导空态，同时独立显示有题的卡，并测两端。
- **M｜旧地址未转新首页。** [dashboard.tsx:4](/Volumes/ORICO/Dev/worktrees/orbit/redesign/repos/orbit-app/app/dashboard.tsx:4) 仍打开旧 Dashboard；PLANNER §6 要求旧 `/dashboard` 明确重定向。保留仍被引用的旧组件，但将该路由转至 `/home`。
- **M｜“只读”进度 GET 会写状态。** [guide-progress.ts:76](/Volumes/ORICO/Dev/worktrees/orbit/redesign/repos/orbits/features/home/guide-progress.ts:76) 在读取时持久化老用户判定，88 行还写完成闩锁，与 SC-12 的只读适配口径冲突。将写入移至明确的状态操作，或由主会话修订并验证该契约。
- **M｜最终零新增失败未证实。** REPORT §测试记录的全量仍为 Web 10 fail、App 24 fail；此后仅定向复测，且又提交了 App 菜单和壳修复。按最终 SHA 重跑全量、逐名比对基线后才能确认“0”。
- **m｜新路由的回归清单仍测旧屏。** [app-wide-route-coverage.test.ts:154](/Volumes/ORICO/Dev/worktrees/orbit/redesign/repos/orbit-app/tests/app-wide-route-coverage.test.ts:154) 将 `/home` 标为 `HomeDashboardScreen`；[offline-pages-home.test.tsx:29](/Volumes/ORICO/Dev/worktrees/orbit/redesign/repos/orbit-app/tests/offline-pages-home.test.tsx:29) 也挂旧组件。改为实际 `HomeWidgetsScreen`，核验新首页离线行为。

## 核实通过项

定向重跑 Web **10/10**、App **8/8**。D-01 使用 actor 限定、CAS、严格 PUT 与宽进响应；App 布局草稿按账号及 API base 隔离，未新增通用 outbox 域。R10 未改组件库、token、别线功能文件或 OAuth returnTo；布局错误日志未含 PII。工作树保持干净。
## 主会话全量核验（2026-10-20 19:25）

verify worktree `origin/redesign@8862ccce4` 按基线环境独立跑两端全量，与 R18c 收口时（9edbef851）的失败集合逐名比较：Web 5→5、App 14→13，**新增 0**。日志 `_evidence-main/r10-{web,app}-full.log`。上面「最终零新增失败未证实」一条由此关闭；其余 M/m 交 D 线修复。

## 主会话复核修复后全量（2026-10-20 20:30）

verify `origin/redesign@d8823c5c5` 两端全量与上一轮集合比较：Web 新增 1 名「no page has more hard-coded text…」，原因为 §R10-12 的中文代定注释写在 CSS 模板字符串里，主会话移到 JSX 注释（定向 7/7、tsc 0）后推送；App 新增 1 名「a stale native scroll event during restore…」，单独重跑 5/5 ×2 通过，属负载波动。结论：R10 本线新增失败 0，收口。像素→⑪；最近会话摘要 DEFERRED→⑪。

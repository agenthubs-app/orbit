# R13 收口后独立复核

**结论：暂不验收。** `origin/redesign` 上的 R13 契约与两端功能已有实现，但 SC-04、11、13–15 尚未完成，另有两处隐私及身份校验缺口。本次只读，未改仓库或提交。

## S

- **SC-13/14/15 门禁未收口。** [REPORT.md](/Volumes/ORICO/Dev/worktrees/orbit/redesign/docs/designs/redesign-2026-10/sprints/R13-inbox-secretary/REPORT.md:21) 记录 App 6/6、Web 4/4 已认可浅色板仍失败；离线发消息→回网及首页/Web/App/服务端三数对账未完成。按 README 规则 11，补齐认可板、逐带归因和真实数据操作链后重验，不能将截图或接口 200 计为通过。

## M

- **跨账号预览没有整页拒绝。** [secretary-preview.ts](/Volumes/ORICO/Dev/worktrees/orbit/redesign/repos/orbits/shared/api-schema/secretary-preview.ts:15) 先用 `readableItems` 丢弃未知卡，再检查剩余卡的 `actorId`。实测含异账号、未知 `kind` 的响应被接受为空列表。应先检查原始条目的账号字段，再逐条宽进解析，并补回归。
- **D-16 预览仍可带出邮件来源。** [secretary-source.ts](/Volumes/ORICO/Dev/worktrees/orbit/redesign/repos/orbits/shared/compute/secretary-source.ts:49) 未排除混合了 `event_*` 与 `mail_summary` 的通知；实测预览返回两种来源。应在构造预览前过滤整行，并测试混合来源。
- **SC-04 全域 Top-1 未成立。** [configured-tasks.ts](/Volumes/ORICO/Dev/worktrees/orbit/redesign/repos/orbits/features/operations/maintenance/configured-tasks.ts:343) 只把 `discover().planFit` 交给选择器，而 [discover-core.ts](/Volumes/ORICO/Dev/worktrees/orbit/redesign/repos/orbits/features/events/journey/discover-core.ts:271) 已截成前三项，且先按含反馈罚分的 `rank` 排序。应取得未截断的合格候选，并以至少四项、同分不同日期测试分数及 `eventId` 决胜。

## m

- **按日分组固定东京时区。** [App](/Volumes/ORICO/Dev/worktrees/orbit/redesign/repos/orbit-app/src/screens/inbox/NotificationInboxList.tsx:36) 和 [Web](/Volumes/ORICO/Dev/worktrees/orbit/redesign/repos/orbits/app/(app)/app/inbox/typed-notifications-tab.tsx:81) 均未按 PLANNER §6 使用账号时区。读取有效账号时区，缺失时再回退东京，并测跨日边界。

## 核实通过与证据边界

SC-02 的独立合同提交、App 同步副本和 mock 可核；SC-03 的事件分类与真实 `dueAt`、SC-07 的旧 `/chat` 跳转、SC-09 的动作约束、通知同步白名单均有代码及目标测试证据。未见 R13 提交修改 A 组件/token、D 导航壳或 C 页面，也未见新增 OAuth `returnTo`、公开字段或日志 PII 改动。本次重跑秘書服务/API 12/12、App 解析与目标 7/7 通过。

**“自身新失败 0”仅可有限采信。** [REPORT.md](/Volumes/ORICO/Dev/worktrees/orbit/redesign/docs/designs/redesign-2026-10/sprints/R13-inbox-secretary/REPORT.md:56) 记录的收口全量仍为 App 11 败、Web 16 败；Web 多出的一项仅在后续目标测试转绿，run-02/run-03 原始日志在当前工作区不可取得，且 R21 rebase 后未重跑全量。现有目标测试通过不能证明最新基线全量零新增失败。
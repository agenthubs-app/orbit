# Sprint 0027 — Open schedule items and edit meeting details

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在[登记表](../README.md)。
**原需求:** 2026-09-15 追加 C 线 Sprint；每条行程／日程可以打开，会议支持添加和编辑详情。
**单一目标:** 为四类日程接入稳定详情目的地，并在既有 appointment 聚合上交付参会人共享、版本安全的会议说明编辑。
**易读目标:** [GOAL.md](GOAL.md)。**批准补充:** [APPROVED_SCOPE_ADDENDUM.md](APPROVED_SCOPE_ADDENDUM.md)。
**基线:** 根 HEAD `5bfd59e96e555019a88749a2f2b461a7d2ac06a8`；已有根 `AGENTS.md`／`CLAUDE.md` 修改、`.gitnexus`、设计图、prototype、`output/` 与 `tmp/` 不写、不暂存。

## 进入条件与依赖

- 用户已批准 0027 的目标、推荐方案和实施；0026 已以 `5bfd59e96` 收口，C 线继续持有 App Simulator 8082 和当前主集成工作区。
- 复用 Web 现有 appointment aggregate、participant authorization、CAS repository 和 idempotency receipt；App 复用任务详情、活动预览、个人日程编辑及 canonical actor。
- 开始产品编辑前登记 run-01 与 Planner SHA；每个既有函数／组件／契约符号先做 GitNexus upstream impact，HIGH／CRITICAL 先报告风险。
- 先用 RED 锁定会议不再回到 `/schedule`、旧 appointment 空说明、participant-only 写入、CAS 冲突、幂等重试、清空和失败保留草稿。

## 范围与文件

- Web appointment：`features/appointments/contract.ts`、`service.ts`、`handlers.ts` 或职责相同的窄 handler，以及直接 repository／service／handler 测试。
- Web route：新增 `app/api/appointments/[id]/details/route.ts`；沿用现有认证 actor、错误映射与 idempotency header。
- 共享契约：`shared/contract/appointments.ts`、`shared/api-schema/appointment-details.ts` 及既有 export/sync 入口；只暴露会议详情页所需字段。
- App 数据层：同步生成的 contract/schema、`src/api/endpoints.ts`、新增会议详情 API／view-model 及直接测试。
- App UI：新增 `app/schedule/meetings/[id].tsx`、`src/screens/schedule/MeetingDetailScreen.tsx`；修改 `src/view-models/schedule.ts` 和中／日／英文案及直接页面／导航测试。
- 文档与交接：本目录、`docs/sprints/README.md`、根 `bridge/status.md`、`bridge/handoffs.md` 和独立 Bridge 交接记录。
- 排除：预约提议／接受／取消状态机重做、参会人管理、提醒规则、外部日历同步、数据库迁移、远程部署、AI／OCR 调用及无关日程视觉重设计。

Planner 未列全的 export、同步清单或直接测试文件仅在编译／RED 证明为完成既定链路所必需时追加，并在 REPORT 列明；不得借机重构 appointment 或 schedule 模块。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0027-01 | 日／周／月中的有效任务、活动、个人日程和会议分别打开任务详情、活动预览、个人日程页和会议详情；会议及可识别活动不回到日历自身。 | schedule view-model RED→GREEN；屏幕交互和 Simulator 四类点击。 |
| SC-0027-02 | appointment 参会人打开会议详情，看到确认时间、时区、方式、地点、提议上下文及共享说明；旧记录没有说明时显示可编辑空态。 | shared parser、GET projection、App view-model／页面测试和旧夹具。 |
| SC-0027-03 | 任一参会人可添加、修改或清空共享说明；成功回执与 appointment／内容／版本精确匹配后才结束编辑，重开可读。 | service／route 正常、清空、双方可见、精确回执与 Simulator 保存→重开。 |
| SC-0027-04 | foreign actor 被拒绝；同版本并发只有一次成功；同幂等键重试不重复递增；409、网络失败或错误回执保留草稿。 | service／route 权限、CAS、幂等测试；App conflict/failure interaction tests。 |
| SC-0027-05 | 说明更新不改变 appointment 状态、确认时段、提醒或外部日历；共享副本一致，当前 Web 生产进程重建重启后 App 使用同一 API 验收。 | before/after invariant、sync clean、两端 typecheck／受影响端全量、Web build/health 和运行态记录。 |

## 一次 Generator 的执行顺序

1. 登记 run-01、Planner hash、基线和文件锁；保留所有用户文件，建立被忽略的证据目录。
2. 写 Web domain/service/route RED，最小增加兼容旧记录的共享说明与 participant-only CAS/idempotent 更新；定向 GREEN。
3. 写共享 DTO/schema 与 App parser/view-model RED；同步契约后接会议 GET/PATCH、草稿／冲突状态和会议详情页面。
4. 修正 schedule href 并覆盖四类条目；完成三语与可访问性，沿完整点击→编辑→保存→重开链收口。
5. 跑两端必要检查与一次受影响端全量；Web 生产构建并重启、健康检查后做当前 Simulator 验收；detect_changes、功能提交，再写 REPORT／Bridge／README 并独立提交收尾文档。

## 最小测试与检查

- 档位：H + I。appointment participant 权限、共享写入、版本／幂等和共享契约均属 H；本地代码收口后 Web 与 App 各一次全量，并做同一运行环境的 I 验收。
- Web 开发定向：appointment service/repository、GET projection、新 details route；覆盖旧数据、两名参与者、foreign actor、空值、长度／形状、版本冲突、幂等及状态／confirmed 不变量。
- App 开发定向：schedule view-model、meeting details parser/view-model、页面交互、端点与导航；覆盖四类 href、loading/empty/failure、编辑／清空、错误回执和草稿保留。
- 收口：Web `npm run typecheck`、生产 build、受影响端全量；App `npm run sync:contract` clean、`npm run typecheck`、受影响端全量和当前 iOS build。只在实际失败或范围扩大时重复。
- 运行态：重启当前 Web/API 后记录健康；App base URL 指向该进程，在 Simulator 逐类打开，并用授权 meeting 完成新增／编辑或清空、重开回读。无可用 meeting 时可在已授权本地测试环境创建脱敏合成 appointment，并在验收后清理。
- 不运行付费 provider、OCR、远程部署或实体设备；它们不参与本 Sprint 行为。

## 失败与交接

现有账号没有已确认会议只阻塞真实会议写回，不阻止本地 service、route、App UI 和四类路由验证；可使用已授权本地合成对象补齐 Simulator，且记录创建与清理。若当前 appointment 存储无法在无迁移下保存新增可选字段，停止真实写入并报告具体 repository 证据，同时继续完成只读详情与导航；不得绕过 CAS、把说明写入本地草稿冒充共享保存，或触发外部日历写入。

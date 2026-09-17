# Sprint 0038 — 三类通知与统一记录实施契约

版本：2026-09-16 / v1。唯一 Generator 按 [RULES](../RULES.md) 实现，不启用额外实现/评审代理，不调用已卸载的工作流技能。

**目标：** 让每条通知明确属于提醒、建议或动态，显示原因和可追溯来源，并让 Web 与 App 操作同一条记录。

**原需求：** N-02（简单分类与图标）、N-03（具体内容与状态）；用户要求按已确认设定拆分新Sprint。[设计](DESIGN.md)及[项目接口/默认策略](../NOTIFICATION_PROGRAM.md)为本契约输入。

## 基线与进入条件

- 规划参考主线 chat-agent 的 a8ac3f761，实际开工必须重新记录 HEAD、dirty paths、Planner SHA256、文件/环境owner与run-01。不得把规划基线当运行验收版本。
- 0037 固定 SHA 已合并且相关验证通过；复用原提醒、约谈投影、批次处理与0019采纳任务链。
- 复用用户“按照这个设定”的产品方向批准和 RULES §0 适用实施授权；核实特定环境/副作用目标，不重复要求批准同一方案。
- 本轮只创建规划；启动时在README登记真实run。未运行不创建REPORT或证据目录。

## 文件白名单

路径均相对根仓库；产品命令在对应端cwd执行。

现有文件：

- `repos/orbit-app/src/screens/inbox/RelationshipInboxScreen.tsx`
- `repos/orbit-app/src/view-models/inbox-feed.ts`
- `repos/orbit-app/src/view-models/inbox-notification-actions.ts`
- `repos/orbit-app/src/view-models/inbox-read-batch.ts`
- `repos/orbit-app/src/api/endpoints.ts`
- `repos/orbits/features/notifications/live-service.ts`
- `repos/orbits/features/notifications/action-writer.ts`
- `repos/orbits/features/notifications/interaction-service.ts`
- `repos/orbits/features/notifications/reminder-plan-service.ts`
- `repos/orbits/features/appointments/notification-projector.ts`
- `repos/orbits/features/events/event-operations/contact-request-notification-writer.ts`
- `repos/orbits/features/acquisition/business-card-queue-worker.ts`
- `repos/orbits/app/(app)/app/inbox/relationship-inbox-panel.tsx`
- `repos/orbits/app/(app)/app/inbox/inbox-panel-view-model.ts`
- `CONTEXT.md`

拟新增（并非已存在）：

- `repos/orbits/shared/contract/inbox-notifications.ts`
- `repos/orbits/shared/api-schema/inbox-notifications.ts`
- `repos/orbits/features/notifications/inbox-record-service.ts`
- `repos/orbits/features/notifications/storage/inbox-record-repository.ts`
- `repos/orbits/app/api/inbox/notifications/route.ts`
- `repos/orbits/app/api/inbox/notifications/[id]/route.ts`
- `repos/orbits/app/api/inbox/notifications/[id]/actions/route.ts`
- `repos/orbits/app/api/inbox/notifications/read/route.ts`
- `repos/orbit-app/src/api/inbox-notifications.ts`
- `repos/orbit-app/src/screens/inbox/NotificationInboxList.tsx`
- `repos/orbit-app/src/screens/inbox/NotificationDetailScreen.tsx`
- `repos/orbit-app/app/inbox/notifications/[id].tsx`
- `repos/orbit-app/tests/typed-notification-inbox.test.ts`
- `repos/orbits/tests/services/inbox-record-service.test.ts`
- `repos/orbits/tests/api/inbox-notifications-routes.test.ts`

共用接线：App `src/i18n/{messages,zh,ja,en}.ts`，Web现有语言/主题入口、本Sprint列出的测试及其直接行为测试；涉及共享类型时修改Web唯一源与现有同步配置，App生成副本只用sync:contract。必要存储迁移、生产入口和上述模块的service-factory按RULES §0查实后追加精确路径、用途与对应SC，不借机扩范围。

文档交接：本Sprint执行后REPORT、登记表，以及由协调者更新的bridge/status.md、bridge/handoffs.md和本Sprint交接文件。

排除：不实现模型发现、不重放全部历史、不新增Push执行者、不重写任务/通信服务，不将旧followup空话翻译后当新通知。

## 实施任务（每项先RED，再最小实现，再GREEN）

### Task 1：契约与持久化先行

- [ ] 先写类别穷尽、时间字段、actor隔离、稳定分页、重试唯一记录、源删除/撤权的失败测试。
- [ ] 创建纯 contract/schema、持久化仓库与新 API；沿现有 schema/migration 机制登记存储文件；同步 App 生成副本并核对无漂移。
- [ ] 执行下方对应定向测试；预期行为断言通过，无跨账号泄漏或静默失败。记录失败原因与必要修复，不用源码字符串匹配代替行为验证。

### Task 2：状态与业务生产者

- [ ] 先写读不完成、批量快照、并发409、重复接受、snooze版本、批次聚合和事件重放的失败用例。
- [ ] 接通动作回执与现有业务链；对生产者按真实事件语义投影，保存 legacy 映射与源修订。
- [ ] 执行下方对应定向测试；预期行为断言通过，无跨账号泄漏或静默失败。记录失败原因与必要修复，不用源码字符串匹配代替行为验证。

### Task 3：双端列表/详情

- [ ] 先写三类标签图标、具体标题、真实姓名、原文提醒无taskId、目标不可用、三语和过期计数的行为用例。
- [ ] 实现 Web/App 同记录消费与目的地导航，移除href分类；保留消息隔离，补词汇表。
- [ ] 执行下方对应定向测试；预期行为断言通过，无跨账号泄漏或静默失败。记录失败原因与必要修复，不用源码字符串匹配代替行为验证。

### Task 4：真实业务验收

- [ ] 在 QA 环境创建显式提醒、约谈变更和一个名片批次结果，校验两端相同记录；验证App读→Web回读，Web处理→App回读。
- [ ] 模型建议暂用隔离测试验证协议，不能当0039自主发现验收；不为造样例调用付费OCR。
- [ ] 执行下方对应定向测试；预期行为断言通过，无跨账号泄漏或静默失败。记录失败原因与必要修复，不用源码字符串匹配代替行为验证。

### Task 5：验证、交接和主线收口

- [ ] 按下方测试映射检查所有SC；所有Web/API/共享变更先production build、重启、health，再验App。保留同一记录的双向回读。
- [ ] H档收口时运行一次受影响端集成/全量与typecheck，App共享副本校验及当前原生构建/启动；不按每个Task重复全量。
- [ ] 检查diff与GitNexus detect_changes，提交固定SHA并按既定流程集成chat-agent；验证真实合并树，未合并或必需证据缺失不标completed。
- [ ] 实际执行结束才写REPORT，逐项记录SC、命令/退出码、真实环境、预算、最终/合并SHA、Bridge交接及具体缺项。

## 验收契约（最多五项）

| SC | 必须实现的行为 | 必需证据 |
| --- | --- | --- |
| SC-0038-01 | **统一事实：** 三类记录/分页/权限/源版本由服务端决定，持久化与共享契约一致 | API、仓库、跨actor与并发测试 |
| SC-0038-02 | **真实投影：** 用户提醒、约谈变化、批次/连接动态具体可用，自己保存不刷通知 | 生产者测试 + QA真实事件证据 |
| SC-0038-03 | **阅读和动作：** read/disposition/business分离，批量快照不吞新条，接受幂等、snooze/409正确 | 状态与真实存储事务测试 |
| SC-0038-04 | **呈现与目的地：** 三类图标文字、三语、暗色/大字号，原文提醒可追溯；删除/撤权安全 | Web/App交互与界面证据 |
| SC-0038-05 | **跨端交付：** 同记录双向操作、共同环境重建、收口测试和固定主线版本 | 运行证据、退出码、SHA、执行后REPORT |

## 定向验证与预期结果

以下命令供实施期使用；新测试必须在相应Task中先创建并观察预期失败。本轮编制文档不运行这些尚不存在的测试，也不报告通过。

```sh
# cwd: /Users/xzhao/Projects/orbit/repos/orbit-app
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/typed-notification-inbox.test.ts tests/inbox-notification-state.test.ts tests/inbox-unified-feed.test.ts
npm run typecheck

# cwd: /Users/xzhao/Projects/orbit/repos/orbits
node --test --import tsx tests/services/inbox-record-service.test.ts tests/api/inbox-notifications-routes.test.ts tests/services/appointment-notification-projector.test.ts tests/services/notification-interaction-persistence.test.ts
npm run typecheck
```

App测试覆盖UI、动作和账号生命周期；Web测试覆盖权限、业务状态、幂等和持久化。新增仓库/迁移/事务必须用隔离PostgreSQL验证跨进程持久性及竞态，内存测试不替代。收口命令为两端各自 `npm test` / `npm run typecheck`，Web `npm run build`；服务启动按已有运行配置，不假定存在npm start或固定端口。原生构建使用已有iOS配置和iPhone 17 Pro Simulator，不清缓存/重装来掩盖状态错误。

映射：SC-01～04由对应Task的行为测试及真实证据共同证明；SC-05由实际命令退出码、运行矩阵和主线SHA证明。0040还必须独立保留provider→设备链；所有未跑项明确写“未执行”，不能写通过。

## 失败、恢复与交接

遵守[项目共同约束](../NOTIFICATION_PROGRAM.md)：意外失败最多两轮局部修复，最多三次只读假设诊断；源权限/越权、重复副作用或事实造假是对应链路硬失败。停止依赖该链的动作，继续其他独立已授权工作，保存checkpoint恢复同一run。

费用沿用累计$5及真实账本，不在本Sprint重置。真实账号、服务或Push环境缺失只阻塞相应SC的运行步骤，先完成可执行代码/测试/调查；不得把模拟结果当真实验收。证据存App被忽略的build/harness-state/evidence/sprint-0038/run-01/，报告只保留必要脱敏结果。

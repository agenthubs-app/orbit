# Sprint 0009 — 账号时区与跨日一致性

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** R-09，支撑 R-08／R-12。**单一目标:** 首页、待办、日历和活动按同一已确认时区解释日期与时间。
**基线:** 承接 0002 实际 REPORT；接触活动文件前只接续 0001 已提交结果；启动记录 HEAD／diff。
**已有成果:** 日期编辑及 Hermes 分段日期回归保留；当前首页日界线、任务编辑和活动显示存在 `Asia/Tokyo`／`+09:00` 固定口径。
**进入条件:** 审阅账号时区权威字段与读取契约、设备回退、无效／缺失值、账号切换及前台设备变化策略，明确全天日期、DST 重复／不存在时间与脏编辑处理。
**契约前置:** 0002 交付上述决策与真实字段来源后补入 Planner 才启动；`profile.ts` 的旧 `timezone`／`homeMarket` 兼容映射不能当成已确认的 IANA 时区契约。

## 范围与文件

- 读取：[原计划 R-09](../../superpowers/plans/2026-09-13-app-remaining-functionality-and-connectivity.md#r-09首页活动发现与导航剩余项)、[日期编辑证据](../../verification/2026-09-13-app-connectivity.md#13-r-08待办日期与截止时间编辑)、0002 REPORT；0001 REPORT 仅取活动文件版本。
- 读取：`src/view-models/profile.ts`、`src/api/contract/profile.ts`、`src/api/endpoints.ts`、`src/api/AuthSessionProvider.tsx`，确认现有读取／身份边界。
- 修改白名单：`app/_layout.tsx`；`src/view-models/home-dashboard.ts`、`today-tasks.ts`、`schedule.ts`、`task-dates.ts`、`events.ts`、`schedule-event-preview.ts`（后五项同目录）。
- 修改白名单：`src/screens/home/HomeDashboardScreen.tsx`、`src/screens/today/TodayScreen.tsx`、`src/screens/tasks/TaskDetailScreen.tsx`、`src/screens/schedule/ScheduleScreen.tsx`、`src/screens/schedule/ScheduleEventPreviewScreen.tsx`、`src/screens/events/EventsScreen.tsx`、`src/screens/events/EventDetailScreen.tsx`。
- 条件性新建：`src/time/OrbitTimeZoneProvider.tsx`、`src/time/date-time.ts`、`tests/app-timezone-interactions.test.tsx`、`tests/date-time.test.ts`；字段来源和转换设计经审阅后才能确定实现。
- 测试白名单：上述新测试与下列现有测试；文档仅本 Sprint `REPORT.md`，原始证据在 `build/harness-state/evidence/sprint-0009/run-01/`，先确认被忽略。
- 排除：新增时区设置产品页、整份资料保存、历史日期迁移、业务批量改写、新日期依赖、任务地点／清空（0010）、三语（0013）、全局替换其他模块日期。

## 验收契约（最多五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0009-01 | 有效账号时区优先，缺失／无效时按批准策略回退；换号、登出及服务器切换不沿用旧账号偏好，设备变化按确认策略生效。 | 新 app-timezone 交互测试：身份、读取失败、旧请求与设备变化。 |
| SC-0009-02 | 同一带偏移时间在首页、待办、日历、活动列表／详情及日程预览落在同一当地日期；月末、年末和跨午夜区间不过滤错日。 | date-time 测试和既有视图模型／交互；Simulator 同一记录逐页核对。 |
| SC-0009-03 | 全天安排日期保持原日历日；截止时间往返编辑保持同一时刻，DST 重复／不存在时间按批准规则提示或解析，不静默挪动。 | 新日期测试、task-dates／task-date 交互；跨 DST 与半小时偏移时区受控样本。 |
| SC-0009-04 | 更换显示时区或返回前台不丢未保存标题／日期草稿，不隐式发任务 PATCH；用户显式保存采用已确认的时区和既有版本／幂等保护。 | app-timezone／task-date 路由测试，核对零隐式写入及保存请求的绝对时间。 |
| SC-0009-05 | 原生 Hermes 显示完整日期／星期／时间；相同账号时区下 Web 与 App 对同记录读数一致，设备回退差异符合批准策略。 | 既有 Hermes 回归、Simulator 非空记录和同环境只读跨端对照；偏好变更需单独获准。 |

## 一次 Generator 的执行顺序

1. 确认时区政策和字段；缺项登记 blocked、run_count 保持 0。锁定共享日期消费者，不与 0010／0011／0013 并行写入。
2. 记录 Planner 哈希和基线；对待改符号 upstream impact，覆盖实际传递消费者，HIGH／CRITICAL 先报告。
3. 先补跨日／DST／身份／脏稿 RED，再按批准设计统一时区输入与转换；保留纯日期语义和 Hermes 兼容行为。
4. 同一 Generator 执行定向、H 最终集及必要原生场景；不借此扩做无关日期改造，不启动 Evaluator 或自评分调用。
5. 经验证的独立功能由协调者路径限定暂存、detect_changes、commit；向 0010 交付转换规则与已提交版本后结束。

## 最小测试与检查

- 档位：本次编制为 D；未来实施为 H，共享时间基础设施与写入序列化会影响跨页消费者，必须类型检查及最终同版本一次全量。
- 以下命令 cwd 均为 `/Users/xzhao/Projects/orbit/repos/orbit-app`，本轮仅声明、不执行。

```sh
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/home-dashboard.test.ts tests/home-dashboard-interactions.test.ts tests/today-tasks-view-model.test.ts tests/task-dates-view-model.test.ts tests/task-date-interactions.test.ts tests/task-detail-interactions.test.ts
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/schedule-view-model.test.ts tests/ink-signal-schedule.test.ts tests/schedule-event-preview-view-model.test.ts tests/ink-signal-events.test.ts tests/ink-signal-event-detail.test.ts
```

- 新文件创建后执行：`node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/date-time.test.ts tests/app-timezone-interactions.test.tsx`。
- H 最终集：`npm run typecheck`、`npm test`、`git diff --check`；仅当批准的时区契约改变同步副本时另跑 `node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/contract-sync.test.ts tests/api-schema-sync.test.ts tests/domain-sync.test.ts`。 同版本全量已包含这些同步用例时直接引用结果，不再单独重跑。
- 原生：复用 `today-tasks-view-model.test.ts` 与 `ink-signal-event-detail.test.ts` 的 Hermes 回归；Simulator 必查当地跨日、日历选日和日期输入，不用 Node Intl 结果代替原生。
- HTTP／跨端：读取现有 `/api/tasks`、`/api/schedule-items` 与公开活动详情的授权样本；`/api/today` 已有 timeZone 参数，账号时区来源仍须确认；不为只读对照改真实偏好。
- 不运行：全业务写入、AI／OCR、推送、Lighthouse、全平台截图及无关构建；时区真实保存验收只在授权对象与协议就绪时实施。

## 失败与交接

账号字段或 DST 政策未确认则停止启动；不能把市场名猜成时区或以固定东京回退宣称需求完成。
运行中若发现需新依赖／新增共享写权限，停依赖步骤并报告；规则内有限修复后仍失败即结束，不再开启 Generator。
REPORT 记录时区来源／回退决策、SC→文件→功能 SHA→证据、影响消费者、原生与跨端未验项；原始证据脱敏并给 0010／0013 提供确定输入。

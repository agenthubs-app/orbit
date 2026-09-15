# C线0010执行补充

2026-09-15，协调者登记run-01并确认C独占事项／日程／首页写入范围，承接0009功能`a4bbfd9f6`及REPORT。原Planner SHA256 `5f169b6879af07d7f21515e1d02f7f9ab14a9bcd0b207d950c47080be0c66c16`保留。RULES §0的最新全部批准覆盖B6补充技术方案；不改写原SC。

冻结协议：任务创建沿用POST /api/tasks，可不关联联系人；PATCH /api/tasks/:id省略字段保持原值，plannedDate／dueAt／location的null删除字段，拒绝空字符串。增加location持久化与两端读取。任务版本检查、同key请求指纹和修改／活动／回执在feature-owned原子操作内完成；不同内容复用key及并发旧版本返回409。已设提醒保持原绝对fireAt，界面明确说明并回读，不新增提醒联动或外部日历权限。

个人日程为独立actor-owned记录，复用orbit_records现有表、GET /api/schedule-items聚合。新增POST集合以及GET/PATCH/DELETE /api/schedule-items/:id；个人日程保存title、带偏移startsAt、可选endsAt和location，更新／删除使用expectedUpdatedAt和idempotencyKey。清空可选字段用null，startsAt不得清空；纯日期事项继续使用task.plannedDate，不制造午夜截止或冒充会面。时间解析沿用0009设备zone及DST规则。

必要路径补充（均在C worktree，按RULES §0登记）：Web features/tasks/{contract,service,repository,task-record,service-factory,today-service-factory,suggestion-service-factory,today-schedule-provider,today-contract}.ts及feature-owned原子操作模块；features/personal-schedule/的契约、服务、存储和工厂；app/api/tasks的create/detail解析、app/api/schedule-items的集合/详情路由；shared/contract/tasks.ts与对应API schema（若存在）。App同步副本只运行npm run sync:contract。Web app/(app)/app/tasks的任务编辑／客户端／view-model及个人日程界面，App个人日程编辑组件／路由、TasksScreen必要的同记录入口，以及对应服务、HTTP和交互测试，均服务SC01–05。通用API/hooks、通知调度器、外部日历及其他Sprint文件不改。

验证使用独立PostgreSQL18 `/tmp/c0010-postgres-data`（127.0.0.1:55419，db/user c0010）、C专用Simulator和合成actor；不加载现有库配置，不改真实账号或数据。新增操作链先RED再实现，定向验证后相关端typecheck，含H变更收口时各受影响端一次全量。Git提交由协调者操作，后续补丁以a4bbfd9f6为增量基线，不能重复带入0009。

全量发现的必要接线补充：新增 app/tasks/personal.tsx 承接 Web /app/tasks/personal 的个人日程列表，不将该静态地址当作 task ID。tests/{app-wide-route-coverage,mobile-route-access,route-parity,app-wide-workspaces,ink-signal-tasks}.test.ts 验证新路由与既有鉴权包装／焦点读取测试边界；仅对应 SC05 的接线与验证，不改通用鉴权、任务路由解析策略（0022）。

## 实际交付范围

2026-09-15，主线功能提交 `d005c2b79`。冻结补丁 SHA256 `e94ec5eb4c079b7d0583a966d898cd5778b6ef91c4dbf8653d083abc66c4eea6`，以0009功能 `a4bbfd9f6` 为增量基线。最终61个产品/测试文件如下；本报告及本补充另行文档提交。集成只额外恢复A0003登录后资料完善测试预期及移除日期辅助文件尾部空白行，不改变已批准业务协议。

- `repos/orbit-app/app/schedule/personal/[id].tsx`
- `repos/orbit-app/app/schedule/personal/new.tsx`
- `repos/orbit-app/app/tasks/personal.tsx`
- `repos/orbit-app/src/api/contract/tasks.ts`
- `repos/orbit-app/src/api/personal-schedule.ts`
- `repos/orbit-app/src/api/schema/personal-schedule.ts`
- `repos/orbit-app/src/screens/home/HomeDashboardScreen.tsx`
- `repos/orbit-app/src/screens/schedule/PersonalScheduleList.tsx`
- `repos/orbit-app/src/screens/schedule/PersonalScheduleScreen.tsx`
- `repos/orbit-app/src/screens/schedule/ScheduleScreen.tsx`
- `repos/orbit-app/src/screens/tasks/TaskDetailScreen.tsx`
- `repos/orbit-app/src/screens/tasks/TasksScreen.tsx`
- `repos/orbit-app/src/screens/today/TodayScreen.tsx`
- `repos/orbit-app/src/view-models/home-dashboard.ts`
- `repos/orbit-app/src/view-models/personal-schedule-editor.ts`
- `repos/orbit-app/src/view-models/schedule.ts`
- `repos/orbit-app/src/view-models/task-dates.ts`
- `repos/orbit-app/src/view-models/today-tasks.ts`
- `repos/orbit-app/tests/app-wide-route-coverage.test.ts`
- `repos/orbit-app/tests/app-wide-workspaces.test.ts`
- `repos/orbit-app/tests/ink-signal-tasks.test.ts`
- `repos/orbit-app/tests/mobile-route-access.test.ts`
- `repos/orbit-app/tests/personal-schedule-editor.test.ts`
- `repos/orbit-app/tests/personal-schedule-interactions.test.tsx`
- `repos/orbit-app/tests/task-date-interactions.test.ts`
- `repos/orbit-app/tests/task-dates-view-model.test.ts`
- `repos/orbits/app/(app)/app/tasks/personal-schedule-client.ts`
- `repos/orbits/app/(app)/app/tasks/personal-schedule-editor-model.ts`
- `repos/orbits/app/(app)/app/tasks/personal-schedule-workspace.tsx`
- `repos/orbits/app/(app)/app/tasks/personal/page.tsx`
- `repos/orbits/app/(app)/app/tasks/task-detail-workspace.tsx`
- `repos/orbits/app/(app)/app/tasks/task-schedule-editor.tsx`
- `repos/orbits/app/(app)/app/tasks/tasks-client.ts`
- `repos/orbits/app/(app)/app/tasks/tasks-page-heading.tsx`
- `repos/orbits/app/(app)/app/tasks/tasks-view-model.ts`
- `repos/orbits/app/api/schedule-items/[id]/route.ts`
- `repos/orbits/app/api/schedule-items/personal-handler.ts`
- `repos/orbits/app/api/schedule-items/personal-route.ts`
- `repos/orbits/app/api/schedule-items/route.ts`
- `repos/orbits/app/api/tasks/[id]/handler.ts`
- `repos/orbits/app/api/tasks/collection-handler.ts`
- `repos/orbits/features/personal-schedule/service-factory.ts`
- `repos/orbits/features/personal-schedule/service.ts`
- `repos/orbits/features/tasks/contract.ts`
- `repos/orbits/features/tasks/local-date-time.ts`
- `repos/orbits/features/tasks/mutations.ts`
- `repos/orbits/features/tasks/repository.ts`
- `repos/orbits/features/tasks/service-factory.ts`
- `repos/orbits/features/tasks/service.ts`
- `repos/orbits/features/tasks/suggestion-service-factory.ts`
- `repos/orbits/features/tasks/task-record.ts`
- `repos/orbits/features/tasks/today-schedule-provider.ts`
- `repos/orbits/features/tasks/today-service-factory.ts`
- `repos/orbits/shared/api-schema/personal-schedule.ts`
- `repos/orbits/shared/contract/tasks.ts`
- `repos/orbits/tests/api/personal-schedule-routes.test.ts`
- `repos/orbits/tests/api/tasks-routes.test.ts`
- `repos/orbits/tests/pages/personal-schedule-workspace.test.tsx`
- `repos/orbits/tests/pages/web-tasks-client.test.ts`
- `repos/orbits/tests/services/task-mutations-postgres.test.ts`
- `repos/orbits/tests/services/tasks-service.test.ts`

# 0032 · 云端人脉跟进消费者

基线 `f12476d8a`，承接云端统一数据计划 R1/R4；不是重跑已结束 Sprint。用户 2026-09-16「这五项闭环」批准必要实现与 Production 合成数据验收。唯一 Generator 为主代理；并行 worker 不修改本范围，原生环境子代理只读。

## 文件边界

- App：`src/screens/tasks/TasksScreen.tsx`、新增 `RelationshipLifecycleScreen.tsx` / `RelationshipLifecycleList.tsx`、`src/api/relationship-lifecycle.ts`、`app/tasks/relationship/[id].tsx`、对应定向测试、本 Sprint 文档。
- 副本：通过 `npm run sync:contract` 同步新增 `relationship-lifecycle.ts` contract/schema，不手改。
- Web/API 由同一主代理串行提供 `connections/[id]/lifecycle` GET/POST、actor-scoped relationship-tasks 集合、共享契约、Web 操作页，以及现有生命周期事务新任务的真实来源证据。沿用现有服务，不另建关系状态机。
- 排除：批量数据迁移／清理、系统工具链升级、通用待办协议改写、无关 UI 重做。

## 验收

1. SC-01：两端独立显示当前与历史跟进，绑定 contact/connection，不将关系任务送到 generic complete。
2. SC-02：四种 outcome 经同一 HTTP 事务服务完成，两个 expected version 与幂等键生效；重复不新增，旧版本冲突，另账号拒绝。
3. SC-03：失败保留输入；刷新、账号／服务器切换隔离；schema 和回执目标核对。
4. SC-04：新下一步任务保留真实手动确认来源，同一事务写入，在旧 followup 读取面不消失。
5. SC-05：精确 Web 版本部署后，在同一 Production 合成账号完成 Web→原生 App、App→Web 同记录回读，记录构建和工具链；缺原生工具链不能用单测替代。

验证：API 四 outcome/ownership/version/replay；PostgreSQL 事务与回滚；App schema/receipt、列表/表单交互与 scope；两端类型/同步和受影响集成检查。遵守 RULES 的 H 档与集成门槛。权限或工具链只阻塞对应验收，继续独立项。

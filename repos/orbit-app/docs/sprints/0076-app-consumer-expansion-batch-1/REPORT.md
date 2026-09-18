# Sprint 0076 — 执行报告（第一批：待办链）

## 结果

**completed（第一批）。** 五项 SC 均有同版本证据，功能已提交并以 `merge --no-ff` 合回 `chat-agent`。
唯一 run-01。批准契约为 [PLANNER.md](PLANNER.md) revision 1／SHA256
`9283afe9612507238ed5f8b6076d2463c465b3ac2010f2c4dde74c0c6a1242aa`。0076 按设计可拆多 run，本 run 只做待办链。

## 先用人话说

原生 App 的待办页现在从本地镜像读：Simulator 冷启动 → 待办页（租约 + 三域页）→ 回首页 → 再进待办页，**第二次 0 次请求**；
勾掉一条待办 → PATCH 200 → 镜像回读确认 → 列表 54/10 变 52/12（两次勾选），页面标"已是最新内容"。phoneweb 待办页原样走 `/api/tasks`。

途中抓到并修掉两个真问题：
1. **v2 域页把 80 条旧格式待办也同步进镜像**：页面显示 134 条、勾选返回 404（REST 只认 canonical）。改为域页只下发 `payload ? 'task'` 的行；给 Simulator 账号写一条 permissions 触发纪元轮换，镜像重建后 54/10/13 与 REST 逐一致。
2. **待确认的旧建议只存在于 REST 响应**：镜像模式下关系工具面板会丢它们。改为工具面板自行按需拉 `/api/tasks`（只在切到"人脉"页签时），默认页仍零请求；Web 仍由列表响应直接供给。

## 固定版本

| 内容 | 实际版本 |
| --- | --- |
| 基线 | `chat-agent` = `cadbb2e10`；登记后 `e991b1477` |
| 功能提交 | `5fffc0d18` feat(sprint-0076) |
| 合并 | `0db7c9d93` merge(sprint-0076)（`--no-ff`），`merge-base --is-ancestor` 退出码 0 |

## SC 映射与证据

| SC | 状态 | 证据 |
| --- | --- | --- |
| SC-0076-01 数据源分流 | pass | `tasks-screen-source-selection.test.ts` 2/2：原生源 `useSyncedCollection`、Web 源 `useApiResource(tasksPath())`、屏幕不直接引用；`offline-read-inventory.test.ts` 绿（GET /api/tasks 登记迁至 `task-list-source.web.ts`，工具面板新增登记）；`today-tasks-screen-source.test.ts` 的传输断言改到新边界 |
| SC-0076-02 第二次进入 0 次业务请求 | pass | 服务端日志：第一次 `lease + domains/notes + domains/tasks×2 + domains/personal-schedule`，第二次**空**；截图 `sprint0076-sim-tasks-2.png`（纪元轮换后 54/10/13） |
| SC-0076-03 变更后镜像确认 | pass | 勾选 → `PATCH 200 (195 ms)` → lease/notes/tasks/personal-schedule 增量页 → 52/12、任务离开未完成列表。**发现**：在两端全量同时跑、服务端 lease 4 s 的负载下，8 s 的失效同步超时触发 → 显示"显示本地内容，联网后可刷新"且勾选未确认（设计内行为，非 bug）；空载重做即通过 |
| SC-0076-04 棘轮与基线 | pass | `unbounded-list-reads.baseline.json` 174 → 173（`history` 记录原因）；审计 2/2；0070 账本 2/2 数字不变（`tasks.list` 92 行——服务端读路径本批未改，如实记录） |
| SC-0076-05 无回归 | pass | App 全量 **3495/3495**（0075 收口 3493 + 2）；orbits 定向集 34/34（审计、lease/manifest/domains 单测、PG 拓扑、账本、legacy 同步、sync-route）；两端 typecheck 0；phoneweb `/tasks` 54/10/13 仍请求 `/api/tasks`，`?scope=relationship` 工具面板与 `/api/notifications` 正常 |

## 与设计案的偏差（如实）

- 设计案 SC"'unbounded' 计数与出库字节双双下降"：本批计数只降 1（唯一能零变化证明的主键单查），账本字节未降。原生待办页不再请求 `/api/tasks` 的节省在服务端日志里可见，但账本量的是服务端读路径，本批没改（canonical payload 嵌套在 `payload.task`，`payloadAccountId` 过滤不可用）。
- 设计案称"0069 带回来的 8 屏已接线"——不成立，本批是第一块真正接线的屏幕。

## 顺带发现（不在本 Sprint 修）

1. 8 s 失效同步超时在慢网下会把已成功的变更标成"待同步"——考虑按域页数动态放宽或后台续跑。
2. `RelationshipTaskTools` 的旧建议来源应有独立端点，而不是搭在 `/api/tasks` 列表响应里。
3. Simulator 账号（`account_orbit_generated` / 小雨）的 dev 库现多一条 `permissions` 行（用于轮换演示），可留可删。

## 未提交、影响与下一步

- 未提交：`repos/orbits/next-env.d.ts` 等用户既有改动，全程未暂存。
- `detect_changes`（staged）：26 符号 / 13 文件 / 1 流程（TasksScreen）/ MEDIUM。
- 回退方式：`git revert -m 1 0db7c9d93`。
- 运行环境：本机 Postgres；Web/API 3000（HMR）；phoneweb 32111（已重导出）；Simulator `DA432E9E`（Metro）。未连云端、未部署。
- 下一步：0076 第二批（首页待办区 `HomeDashboardScreen` 走同一镜像；笔记与个人日程屏）；Phase D 0077 Web 镜像存储。

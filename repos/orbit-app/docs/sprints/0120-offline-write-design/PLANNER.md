# Sprint 0120 — 断网写设计案（断网第 4 期的前置）

**Plan revision:** 1。**模式:** existing-codebase / single-generator（文档）。运行状态只在登记表。
**原需求:** 「断网也能用」第 5 步办法四（三条原则：每次修改带唯一编号、服务器凭它去重；新建先用临时编号、上传后换正式编号；冲突时两边都保留、提示用户选择；未上传内容 AI 看不到，界面标「未同步」）、第 6 步第 4 期（先出单独的设计案，再依次做笔记、待办、日程）；「消息数据方案」M4（断网发送，待上传队列 + 「待发送」状态）。承接历史 0034（blocked）的剩余范围，并处理 0035（恢复触发）、0036（AI 可见性）中与写入有关的部分。
**单一目标:** 一份用户批准的断网写设计案，含 0121 起的 Sprint 划分与验收标准。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 0119 合并后的 `chat-agent`（开工时追加提交号）。
**进入条件:** 无代码前置；本 Sprint 不改产品代码。

## 已查明的事实（2026-09-27）

- 0034 协议（`repos/orbit-app/docs/sprints/0034-offline-personal-mutations/DESIGN.md:30-50` 与 PLANNER）：修改带稳定 `mutationId`、scope、domain、entityId、operation、`baseRevision`、严格补丁；新建用 `local:<uuid>` 临时编号，别名按 scope 与 domain 隔离，依赖它的修改在首次发送前换成正式编号；全局回执按「身份 scope + mutationId」去重（同指纹返回原结果，指纹不同永久拒绝）；每批 ≤50 条，一个事务；锁顺序：回执 → 类别 CAS → 同步写锁；按实体 FIFO、同时最多 4 个实体、重试抖动 1–60 秒、Retry-After ≤5 分钟、每条最多 5 次、每轮 30 秒；冲突两边都保留，选「保留本地」则基于最新版本生成新的 mutationId，删除冲突需二次确认；旧纪元的待上传项不自动迁移。
- 0034 实际完成：只有策略守卫与「纪元轮换保留 pending/conflicted」；`enqueueOutboxMutation`、`listOutboxMutations`（`local-sync-repository.ts:521,556`）、`isOfflineEligible`（`mutation-adapters.ts:11-24`）、`OfflineDataPolicyRegistry` 都没有产品调用方。
- App 本地库已有 `sync_outbox` 表（`local-sync-schema.ts:62-81`：mutation_id 主键、kind、operation、patch_json、base_revision、重试字段）与 `sync_records.sync_state`（synced/pending/conflicted/failed）、`ai_visibility`。离线策略表中笔记、待办、跟进、个人日程写入为 `offline_queue`。
- 服务端：0108 起写入取提交顺序锁；消息发送已按「对话 + 发送人 + requestId」去重（0109 沿用）。
- 历史 0035：App 触发链未接 manifest，启动/后台/断网/通知点击的恢复未做；0036：AI 按类别查询、pending/冲突提示未做。

## 设计案必须回答

1. 三条原则在服务器与手机上的具体做法（回执存哪、保留多久；临时编号如何替换；冲突如何检测与展示）。
2. 哪些操作允许断网：笔记、待办、个人日程的新建/编辑/删除；消息发送；明确不允许的（报名、付款、AI、全平台搜索等 D 类）。
3. 界面：「未同步」「待发送」「冲突」的显示与操作；AI 看不到未同步内容的提示方式。
4. 恢复时机：启动、回到前台、网络恢复、通知点击时如何触发上传与同步（承接 0035）。
5. 与 0034 协议的差异及理由；重试与批量参数是否沿用。
6. 0121 起的 Sprint 划分（建议：笔记 → 待办 → 个人日程 → 消息发送），每期的验收标准（至少包括：重复上传只算一次、临时编号替换后引用正确、冲突两边都保留、断网改动在联网后到达服务器、别人的数据不受影响）。

## 范围与文件

- 新建：设计案 HTML（`docs/designs/<日期>-offline-write/`，并发布为 artifact）；本 Sprint 的 REPORT。
- 排除：任何产品代码。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0120-01 | 设计案回答上面 6 个问题，并与已定稿的「断网也能用」「消息数据方案」一致（逐条对照表） | 设计案 |
| SC-0120-02 | 用户明确批准设计案（或提出修改后批准） | 批准记录（日期、原话） |
| SC-0120-03 | 批准后，0121 起的 GOAL/PLANNER 按设计案写入 `docs/sprints` 并登记 | 文件与登记表 |

## 测试

- 档位 D（文档）：不运行产品测试或 typecheck；检查设计案中引用的文件路径、行号与现状一致，与两份已定稿设计案逐条对照无冲突。

## 失败与交接

未批准则停在本 Sprint；协调者向用户汇报待决问题。历史 0034 的登记表状态在 0121 起的 Sprint 完成后更新为「由 01xx 承接完成」。

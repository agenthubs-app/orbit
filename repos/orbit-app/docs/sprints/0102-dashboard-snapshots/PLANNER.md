# Sprint 0102 — 看板：关系图版本与快照（看板 D2）

**Plan revision:** 1。**模式:** existing-codebase / single-generator。
**原需求:** 「看板读取方案」D2（2026-09-27 定稿，决定：快照存万能表新类别）。
**单一目标:** 缺口与机会按关系图版本缓存；AI 联系人分析入口只核对版本；看板读取无不设上限读取。
**基线:** 0101 合并后的 `chat-agent` @ `af39bf984`；已知失败：App 1（route-parity）、orbits 33 + 不稳定用例（见 0101 REPORT）。**依赖:** 0101。
**设计:** `docs/designs/2026-09-27-data-architecture/dashboard-design.html`。

## 0101 之后的事实

- 看板、摘要、分布已走 `features/dashboard/storage/dashboard-read-model-postgres-reader.ts`；缺口（`live-distribution-service.ts` gaps）与机会（`live-opportunity-service.ts`）仍经 `readDashboardGraphForAccount` 读整图。账本链 `contacts.dashboard` 改后 13 查询 / 5523 行 / 3,911,181 字节，其中约 2.96MB 是这次整图读取；`dashboard` 链 6,660 字节。
- 联系人分析的 `sourceDataVersion` 由联系人段、来源列表等内容计算（`features/mobile/contacts-dashboard-service.ts` 与 AI 路由 `app/api/ai/conversations/route.ts` 的 `verifyContactsAnalysisSourceVersion`）。
- 最近动态排序用 ICU `und-x-icu`，缺失时退回整图（42704）。

## 设计要点

1. **关系图版本** = 该用户在 6 类（contacts、connections、contact_detail_states、events、evidence、tasks）中的最大 `sync_revision`（软删除也会领新号）。现有 `orbit_records_sync_actor_idx (workspace_id, user_id, sync_revision)` 是只覆盖 notes/tasks/personal_schedule_items 的部分索引，需扩展（新迁移；注意同步功能对该索引的依赖，GitNexus/源码核对）。
2. **快照**：万能表新类别（如 `dashboard_snapshots`），每用户一行，信封写 user_id，信纸存 {graphVersion, gaps, opportunities, computedAt}。请求时先查版本（一条小查询），相同则返回快照，不同则读整图重算并写回。并发重算无害（结果相同）。
3. **AI 入口**：`app/api/ai/conversations/route.ts` 中 `prepareExecution`（contacts.analysis 入口）改为：比较页面带来的版本与当前关系图版本；交给模型的背景资料用 0101 的 SQL 结果 + 快照；版本不符保持现有错误语义。页面 `sourceDataVersion` 的生成方式相应改为关系图版本（两端契约同步）。
4. 去掉 `dashboard-live-record-provider.ts` 中无 sqlClient 分支的 6 处 `limit: "unbounded"`（或证明该分支在生产不可达后删除），棘轮基线减 6。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0102-01 | 数据未变时，看板与联系人分析不执行整图读取；读取账本「看板」≤ 20KB | 账本 |
| SC-0102-02 | 6 类中任一行新增/修改/软删除后，下一次请求重算且结果包含该改动 | 真库测试 |
| SC-0102-03 | A 的快照与版本不影响、不泄露给 B | 隔离测试 |
| SC-0102-04 | 联系人分析入口 AI 提问：版本相符不读整图；不符返回既有错误 | 路由测试 |
| SC-0102-05 | 快照结果与现算结果逐项一致（对照测试）；棘轮 −6；两端全量、typecheck 通过；phoneweb/Simulator 验证 | 摘要 |

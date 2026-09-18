# Sprint 0087 — 没同步过就不要说"暂无"

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** TODO.md「2026-09-19 全量功能与 UI 复核」第 1 条。
**单一目标:** 镜像快照区分"从未同步"与"同步完为空"，消费页在未同步时不显示空态。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** `chat-agent` = `ededaa6ac`。未启动，run_count = 0。
**进入条件:** 无外部依赖。磁盘已腾出（全量测试数字才可信）。

## 已查明的事实

| 事实 | 位置 |
| --- | --- |
| 初始快照就声称 `local-ready` | `src/hooks/useSyncedCollection.ts:47-55` `emptySnapshot()` 返回 `{records: [], status: "local-ready", lastSyncedAt: null}` |
| 状态枚举里没有"未同步" | `src/data/sync/sync-coordinator.ts:56-61` `SyncedCollectionStatus = local-ready \| syncing \| fresh \| stale \| failure` |
| 空态与加载态同时为真 | `src/screens/tasks/task-list-source-mirror.ts:18-24`：`canonical = itemsFrom([]) = []`（非 null，触发空态），同时 `loading = status==="local-ready" && records.length===0` 为 true |
| 空态渲染条件只看 `canonical` | `src/screens/tasks/TasksScreen.tsx:134-139`：`canonical && open?.length===0` → `EmptyState` |
| 已有可用信号 | `readCollection` 在 `sync-coordinator.ts:283-292` 写 `lastSyncedAt: cursor?.lastSyncedAt ?? null`；没有 cursor 即没同步过 |
| 同类设计先例 | 0078「镜像为空且下载失败时显示错误而不是空列表」——本条是同一原则在"尚未完成"这一侧的缺口 |

**判断 1：修在快照层，不在页面层。** 每个消费页各写一遍"没同步过"判断会再复制一次补丁（`ZH:` 挑段逻辑已有 10 处副本的教训）。在 `SyncedCollectionStatus` 增加 `"unsynced"` 作为初始值，`readCollection` 在有 cursor 时才降为 `local-ready`。
**判断 2：空态的前提是"至少完成过一次同步"，不是"records 为空"。** `mirrorTaskListSource` 暴露 `synced: boolean`，`TasksScreen` 的空态加这个前提；加载态与空态互斥。
**判断 3：范围覆盖所有 `useSyncedCollection` 消费者。** 先枚举再逐个核对，不只修待办页。

## 范围与文件

- `src/data/sync/sync-coordinator.ts`（状态枚举与 `readCollection`／`finalSnapshot`）、`src/hooks/useSyncedCollection.ts`（`emptySnapshot`）。
- `src/screens/tasks/task-list-source-mirror.ts`、`task-list-source.ts`／`.web.ts`（接口对齐）、`TasksScreen.tsx`；以及枚举出的其它 `useSyncedCollection` 消费页。
- i18n：`sync.unsynced` 三语（若加载文案需要区分）。
- 测试：`tests/` 下同步快照与待办列表相关文件。
- 排除：改同步协议、lease/manifest 时序、改 0078 的失败态语义。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0087-01 | 快照在任何一次同步完成前 `status === "unsynced"`；完成后才是 `local-ready`/`fresh` | 协调器单测 |
| SC-0087-02 | 未同步时待办页显示加载态、**不**显示"暂无待办"；四种组合各自的可见结果被断言 | 屏幕／view-model 测试 4 例 |
| SC-0087-03 | 同步失败仍显示错误态（0078 行为不退化） | 既有失败态用例通过 |
| SC-0087-04 | 其余 `useSyncedCollection` 消费页同样不在未同步时显示空态 | 消费者清单 + 各自断言 |
| SC-0087-05 | phoneweb 冷启动 `/tasks` 首屏无"暂无待办"；两端 typecheck 0 | 截图 + 摘要 |

## 一次 Generator 的执行顺序

1. 登记 run-01；分支 `codex/sprint-0087-never-synced-empty-state`。2. 枚举消费者。3. RED：四组合用例。4. 快照层实现 → 消费页接线。5. 定向 GREEN → phoneweb 冷启动截图 → 收口。

## 最小测试与检查

- 档位：App H（改共享同步基础设施）。定向集：同步协调器测试 + 全部消费页屏幕测试；收口 App 全量一次。

## 失败与交接

若某消费页的空态本就依赖"records 为空"且无法安全加前提，单独记录并保留原行为，不在本 Sprint 改其信息架构。

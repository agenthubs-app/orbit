# Sprint 0087 报告 — 没同步过就不要说"暂无"

**状态:** 见登记表。**run-01，唯一一次 Generator。**

## 先用人话说

冷启动进待办页，屏幕上同时出现两句自相矛盾的话：「正在同步最新内容…」和「暂无待办／新待办会出现在这里」，计数 0/0。等镜像拉完（lease → manifest → 域页，约 15–25 秒）又正常显示 366 行内容。

根因不是时序，是**类型里根本没有"还没同步过"这个状态**。`emptySnapshot()` 一开始就宣称自己是 `local-ready`，于是「没读过」和「读完了确实没有」是同一个值。页面只能看到 `records: []`，它没法分辨。

改法是把这个区别放进快照层，而不是让每个页面各自猜：新增 `unsynced` 作为初始状态，页面在同步过之前拿到的是 `canonical: null`（而不是空数组），空态因此没有渲染条件。

## 固定版本

- 基线 `chat-agent` = `e6153d1ee`。Planner SHA256 `c5b43c40…` 未改。

## SC 映射与证据

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-0087-01 首次同步完成前 `status === "unsynced"` | pass | `sync-coordinator.ts` `readCollection`：有 cursor 才降为 `local-ready`；无读取范围时也是 `unsynced` |
| SC-0087-02 未同步不显示空态；四种组合各有断言 | pass | `tests/task-list-never-synced.test.ts` 9 例 |
| SC-0087-03 同步失败仍显示错误态（0078 不退化） | pass | 失败且无记录时 `canonical` 为 null——空数组会让错误态和空态同时出现 |
| SC-0087-04 其余消费页同样处理 | pass（范围即为此） | 全仓枚举 `useSyncedCollection` 消费者：只有待办列表一处（native 与 Web 都经 `mirrorTaskListSource`）。不存在第二个需要改的页面 |
| SC-0087-05 typecheck 0 | pass | 见下 |

### 四种组合 + 两种边界

| 状态 | loading | canonical | 屏幕 |
| --- | --- | --- | --- |
| 从未同步 | true | null | 加载态，**无空态** |
| 首次同步中 | true | null | 加载态，**无空态** |
| 同步完确实为空 | false | `[]` | 暂无待办（**只有这一种情况配得上这句话**） |
| 同步完有数据 | false | `[...]` | 列表 |
| 已同步后刷新 | false | `[...]` | 列表 + refreshing |
| 首次同步失败 | false | null | 错误态，**无空态** |

## 实现中修正的两个自己的错误

**1. 差点把"刷新"当成"没同步过"。** 第一版用 `status !== "unsynced" && status !== "syncing"` 判断是否同步过。但 `syncing` 也是**下拉刷新**的状态——那样每次刷新都会把已有列表清空变成加载态，属于用一个 bug 换另一个。真正的证据是 cursor，它在快照上表现为 `lastSyncedAt`。现在的判据是 `lastSyncedAt !== null || status ∈ {fresh, local-ready, stale}`，并补了两条刷新场景的断言。

**2. 失败态原本会同时显示错误和空态。** 首次同步失败时 `canonical` 是 `[]`，而屏幕的空态条件只看 `canonical && length === 0`，于是错误态和「暂无待办」一起出现。失败且无记录时返回 null 一并修掉；有记录的失败（stale）仍然显示列表。

## 与 PLANNER 的偏差

**SC-0087-04 的范围比预期小得多，是查出来的不是省掉的。** Planner 判断 3 要求"先枚举再逐个核对，不只修待办页"。枚举结果：全仓只有待办列表消费 `useSyncedCollection`（`task-list-source.ts` / `.web.ts`，两者都落到同一个 `mirrorTaskListSource`）。所以"共享层立规则"这件事做了，但今天只有一个消费者受益；下一个接入镜像的页面自动继承。

**没有新增 i18n key。** `unsynced` 在标签上映射到既有的 `sync.syncing`——对用户来说页面就是在取数据，没有另一件事要他做。省掉一个需要三语翻译的、只为内部状态服务的文案。

## 命令与退出码

| 命令 | 结果 |
| --- | --- |
| `npx tsc --noEmit`（App） | 0 |
| `tests/task-list-never-synced.test.ts`（新增） | 9/9 |
| 待办 + 同步定向集（5 文件） | 41/41 |
| 状态枚举相关（`ink-signal-tasks`、`app-wide-workspaces`） | 61/61 |
| App 全量 | 见登记表 |

## 下一步

下一个是 0090（首页推荐活动地点中文，0082 同源遗留）。

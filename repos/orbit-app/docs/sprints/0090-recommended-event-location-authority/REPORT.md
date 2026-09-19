# Sprint 0090 报告 — 首页推荐活动的地点也要中文

**状态:** 见登记表。**run-01，唯一一次 Generator。**

## 先用人话说

首页"推荐活动"显示 `Shanghai`／`Tokyo`，活动页同一批活动显示`上海`／`东京`。

和 0082 的标题问题**完全同一个形状**：canonical 头表 `event_ops_events.venue` 一直是中文，而推荐接口读的是记录里的 `payload.location`——那是旧种子目录留下的英文城市名。

改法也和 0082 一样，不是新发明：canonical 值写进 provider 优先读的那个槽位（`payload.venue`），导入原文降为兜底。

| | 权威来源 | provider 原来读 | 现在读 |
| --- | --- | --- | --- |
| 标题（0082） | `event_ops_events.title` | `payload.title ?? payload.name` | 不变 |
| 地点（0090） | `event_ops_events.venue` | `payload.location ?? payload.venue` | `payload.venue ?? payload.location` |

## 固定版本

- 基线 `chat-agent` = `22fd3aa17`。Planner SHA256 `d6cd1b58…` 未改。

## SC 映射与证据

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-0090-01 provider 取权威来源，英文兜底移除 | pass | `payload.venue` 优先；`"Live event source"` 这个英文占位串删掉，改为空串——让客户端显示自己的"地点待定"，而不是一个看起来像数据的标签 |
| SC-0090-02 回填脚本覆盖 venue，dry-run → apply → 复跑 0 | pass | 16 条中 13 条待改 → apply → 复跑 `planned: 0`（收敛断言在事务内）；receipt mode 600 |
| SC-0090-03 种子今后写入权威地点 | pass（**已经是对的，核实而非修改**） | 见下 |
| SC-0090-04 首页与活动页逐条一致 | pass | live 比对：3 条推荐全部 `OK`，`mismatches: 0`，首页无任何拉丁城市名 |
| SC-0090-05 无回归；两端 typecheck 0 | pass | 见命令表 |

### SC-0090-03：种子本来就是对的

Planner 假设种子在写英文地点，需要修。查下来不是：`shared/mock/generated-relationship-fixtures.ts` 里的 `location` 本来就是`大阪`／`上海`／`台北`／`东京`，而 `features/events/storage/seed-live-events.ts:230` 写的是 `venue: input.event.location`。所以**新建库不会重现这个问题**。

数据库里那些英文 `payload.location` 是更早一版 fixture 目录的遗留——和 0082 里那些双语 `payload.name` 是同一批残留。**没有改种子**：它本来就对，改它只会制造一个假的修复记录。

## 与 PLANNER 的偏差

**1. 权威副本写进 `payload.venue`，不是 `payload.location`。** 两者都能让首页显示中文，但 `venue` 与头表列名一致，并且让 `location` 保持"导入原文兜底"的角色——正好对应 0082 里 `title`（权威副本）与 `name`（导入原文）的分工。同一个模式用两次，比两处各有各的约定好。

**2. provider 的 `venue` 字段现在直接等于 `location`。** 契约里两个字段都有，App 的 `locationLabel` 用 `new Set` 去重后拼接。让两者取同一个权威值，去重后就是一个"上海"；如果只改其中一个，首页会显示"上海 · Shanghai"。

**3. 没动活动页与详情页。** 它们本来就读对了，Planner 也明确排除。

## 命令与退出码

| 命令 | 结果 |
| --- | --- |
| `npx tsc --noEmit`（orbits / App） | 0 / 0 |
| `tests/services/event-value-location-authority.test.ts`（新增） | 6/6 |
| 推荐相关定向集（3 文件） | 10/10 |
| App 首页相关（3 文件） | 83/83 |
| `backfill-event-display-fields.ts` dry-run → apply → 复跑 | 13/16 → 0 |
| live 首页 vs 活动页逐条比对 | mismatches 0 |
| orbits 全量 / App 全量 | 见登记表 |

## 下一步

0089（联系人列表价值分 78 人里 76 个是 84）。

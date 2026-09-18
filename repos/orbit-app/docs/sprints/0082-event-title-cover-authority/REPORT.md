# Sprint 0082 — 执行报告

## 结果

**completed。** 五项 SC 均有证据，功能已提交并以 `merge --no-ff` 合回 `chat-agent`。唯一 run-01。
批准契约为 [PLANNER.md](PLANNER.md) revision 1／SHA256 `4cda728a…`（登记表）。

## 先用人话说

首页"推荐活动"现在显示中文标题并带封面图，和活动页一致（`sprint0082-phoneweb-home.png`，对照 `sprint0082-before-home.png`）。

查清的根因和 PLANNER 的猜测不完全一样，如实记录：

1. **标题**：活动列表页和详情页**一直**读的是 canonical 头表 `event_ops_events.title`（全中文），只有首页推荐走 `orbit_records.events.payload.title ?? payload.name`，而 `payload.title` 从未被写过、`payload.name` 是**旧种子留下的日英双语串**（当前 fixtures 里已经是中文，本地库的记录是陈旧数据）。所以这不是语言切换错乱，是同一个活动在两个存储里有两套标题、三条读路径各取其一。
2. **封面**：封面从来就不是活动数据。App 里有一张 id→图片的硬编码表（`events.ts` 与 `organizer-public.ts` 各一份），外加一套按标题关键词猜图的兜底。不知道这张表的界面（首页推荐）就完全没有图。

处理方式：canonical 头表仍是标题唯一权威；`coverPath` 变成活动数据；三条读路径都只读记录里有的内容。

## 固定版本

| 内容 | 实际版本 |
| --- | --- |
| 基线 | `chat-agent` = `907edccb3` |
| 功能提交 | `898538d68` feat(sprint-0082) |
| 合并 | `b966e0224` merge(sprint-0082)（`--no-ff`），`merge-base --is-ancestor` 退出码 0 |

## SC 映射与证据

| SC | 状态 | 证据 |
| --- | --- | --- |
| SC-0082-01 两个接口带中文标题与封面 | pass | `/api/recommendations/events?limit=3`（演示账号）：`日中 AI 业务自动化 PoC 圆桌` + `/orbit-covers/events/ai-workflow-poc-roundtable.jpg` 等三条；`/api/events/public`：13 条中文标题 + `coverPath` |
| SC-0082-02 首页与活动页一致 | pass | phoneweb 截图 `sprint0082-phoneweb-home.png`（推荐活动中文标题 + 封面）；活动列表标题与之一致 |
| SC-0082-03 删除前端补救 | pass | `eventCoverById` 在 App 中 0 处（原 2 处）；标题关键词猜图与 `eventCoverPath(event, title)` 的 title 参数一并删除；6 个测试文件的活动夹具改为携带 `coverPath` |
| SC-0082-04 种子与回填 | pass | `seed-live-events.ts` 写 `coverPath`；`backfill-event-display-fields.ts` dry-run 报告 16 条中 13 条待改 → apply → 重跑 planned=0（收敛断言在事务内）；receipt 落在 scratchpad（mode 600） |
| SC-0082-05 无回归 | pass | App 全量 3508/3508、typecheck 0；orbits 定向 20/20、typecheck 0 |

## 与 PLANNER 的偏差（如实）

- PLANNER 判断 1 写"源记录 `payload.name` 是导入原文"，实测更准确的说法是：本地库的 `payload.name` 是**陈旧**导入原文，当前 fixtures 已是中文。回填因此是"把权威值同步成派生显示字段"，不是翻译。
- 封面目录 `event-cover-catalogue.ts` 暂时仍是一张按 id 的表，只是从 App 移到了服务端并成为种子/回填的输入。真正的"每个活动自带封面字段"要等活动创建流程支持上传，本轮不做。
- **3 个活动没有封面素材**：`demo-event-1`、`demo-event-2`、`event:manual:founder-investor-salon`，目前落到中性占位图 `/orbit-covers/meeting.jpg`。待补图清单。
- **一个已存在的环境失败**：`tests/services/event-core-public-catalogue-postgres.test.ts` 连的是云端库，返回 `data transfer quota exceeded`（SQLSTATE 53000），与本次改动无关，未修复。
- **顺带发现**：首页推荐的地点显示英文（Shanghai／Tokyo），活动页是中文（上海／东京）。同一类"两套数据源"问题，本轮未处理，记入后续。

## 命令与退出码

| 命令 | 结果 |
| --- | --- |
| `npx tsx scripts/backfill-event-display-fields.ts`（dry-run → apply → 复跑） | 13/16 → 0 |
| orbits 定向（public-events-route、event-value-recommendation ×2、event-recommendation-live-store、attendee-import） | 20/20 |
| `npm test`（App 全量） | 3508/3508，exit 0 |
| 两端 typecheck | 0／0 |

## 下一步

补 3 张缺失封面；首页推荐的地点本地化；App 里其余 9 处 `ZH:` 挑段副本（contacts／followups／profile 等）属同一数据问题，未处理。

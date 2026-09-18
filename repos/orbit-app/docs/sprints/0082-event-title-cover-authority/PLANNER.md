# Sprint 0082 — 活动标题与封面只有一个来源

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** TODO.md 第 5 条。
**单一目标:** 活动标题与封面有唯一权威来源，首页推荐、列表、详情三处一致；删除前端补救。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** `chat-agent` = `12a9f9653`。未启动，run_count = 0。
**进入条件:** 用户确认权威来源方案（判断 1 给出默认）；本机库可跑种子脚本。

## 已查明的事实

| 事实 | 数据 |
| --- | --- |
| 两套标题 | `orbit_records.events.payload.name` = "日文 / English"（无中文）；`event_ops_events.title` = 中文 |
| 首页 | `/api/recommendations/events` → `event-value-live-record-provider.ts:193` `title = payload.title ?? payload.name`；契约无封面字段；App `home-dashboard.ts:149–162` 原样显示 |
| 列表 | `/api/events` 读 `payload.name`（`storage-event-provider.ts:118`）；App `events.ts:331–398` 挑中文段，`events.ts:401` 硬编码封面表（`organizer-public.ts:226` 重复） |
| 详情 | canonical 头，中文 |
| 扩散 | App 内 `ZH:` 挑段逻辑 10 处副本 |

**判断 1（默认方案）：canonical 头表 `event_ops_events.title` 是标题权威；封面成为活动数据字段。** 源记录 `payload.name` 视为导入原文，只在"来源证据"里展示。封面路径写进 `event_ops_events.source_payload.cover`（或新列，视 backfill 工具是否支持）并由 `/api/events`、`/api/recommendations/events` 输出 `coverPath`。种子脚本同步补齐。
**判断 2：先服务端后前端。** 两个 API 先输出 `title`（中文）+ `coverPath`，再删前端补救；删除时保留一次性兼容（缺封面时用占位图标，不回退到硬编码表）。

## 范围与文件

- orbits：`features/recommendations/storage/event-value-live-record-provider.ts`、`features/events/event-crud-and-import/providers/storage-event-provider.ts`（标题改读 canonical 头 / 输出封面）、`features/recommendations/event-value-contract.ts`（`coverPath`）、种子 `scripts/seed-live-events.ts` + `db:backfill:event-core`（封面入库）、对应测试。
- App：`src/view-models/home-dashboard.ts`、`src/view-models/events.ts`（删挑段与封面表）、`src/view-models/organizer-public.ts`（删重复表）、`HomeDashboardScreen.tsx`（封面渲染已支持 `imagePath`，只需字段）。
- 排除：其它 9 处 `ZH:` 挑段（contacts／followups／profile 等）——记录为后续，本 Sprint 只处理活动。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0082-01 | `/api/recommendations/events` 每条含中文 `title` 与 `coverPath`；`/api/events` 同 | API 单测 + curl |
| SC-0082-02 | 首页推荐活动中文标题 + 封面；活动列表与详情标题一致 | phoneweb 截图 + Simulator 截图 |
| SC-0082-03 | `events.ts`／`organizer-public.ts` 不再含 `eventCoverById` 与活动标题挑段；对应单测改为断言数据字段 | 代码审查 + 单测 |
| SC-0082-04 | 种子重建后 16 个活动标题／封面齐全；`db:verify:live-events` 绿 | 脚本输出 |
| SC-0082-05 | 无回归：App 全量对照；orbits 定向集；两端 typecheck 0 | 摘要 |

## 一次 Generator 的执行顺序

1. 登记 run-01；分支 `codex/sprint-0082-event-title-cover`。2. 服务端契约与 provider RED→GREEN。3. 种子与 backfill。4. App 删补救、接字段。5. 截图对照、全量、收口。

## 最小测试与检查

- 档位：orbits M／App M。定向集：recommendations、event-crud-and-import、seed verify；App events／home-dashboard view-model 测试与首页屏幕测试。

## 失败与交接

若 canonical 头对部分活动缺标题（seed 只写了源记录），在 backfill 步骤补齐而不是在前端兜底；缺封面素材的活动列入 REPORT 待补图清单。

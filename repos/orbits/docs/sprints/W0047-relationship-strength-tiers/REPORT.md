# W0047 REPORT — 关系强度规则分档与管线页改档位（run-01）

> 报告由协调者按 Generator 原文写入（子代理写文件被拦）。

## 结果

**状态：** 等待协调者合并。
**分支：** `sprint/W0047-relationship-strength-tiers`
**基线：** `56d05250`
**PLANNER SHA256：** `72bfa65bc71d0639c555ba173a28d65c4daf50a02cae9248fc32a82ab3a8aa3f`
**固定最终 SHA：** `3a68f6ec`。提交依次是：
- `417a33c5` 功能
- `dc3bb07b` Codex review 修复
- `3a68f6ec` 写入方审计登记

### 已验证能做的
关系强度现在只由 W0046 的关系时间线按规则表打分（带衰减），分成四档：新认识、有往来、核心，以及待唤醒（独立标记，管线里优先归入待唤醒）。档位存成可重建的读模型：
- 管线页按四档分列，列头人数统计全部联系人，每列卡片按最近往来倒序至多 30 位。
- 联系人详情显示档位标签和「依据」面板，列出每条依据的日期、来源、时间线标题，不显示分数。
- live「所有人脉」卡片的首屏和翻页都显示档位点和档位。
- 分析页的「关系健康」改读新增的档位分布。
- 手动阶段相关的 UI 已下线：「更新状态」按钮、「待设置关系」面板、管线页四个不可点的筛选 chip。

### 仍不能做 / 不在本 Sprint
- 「查看该档全部」、列表的档位列和档位筛选（W0051）。
- 30 天变化的展示（W0049）；本 Sprint 只交接计算入口和 `tierCountsAt30d`。
- 概览页的管线区（W0052）。
- App 端没有真实档位（C-6）。

## 验收（SC → 文件 → SHA → 证据）

| SC | 结果 | 主要文件 | SHA | 证据 |
|---|---|---|---|---|
| 01 规则打分纯函数（含按时间点） | 通过 | `features/relationship-strength/{rules,compute}.ts` | 417a33c5、dc3bb07b | `tests/services/relationship-strength-compute.test.ts` 12/12 |
| 02 读模型与刷新 | 通过 | `read-model.ts`、`timelines.ts` | 417a33c5、dc3bb07b | 本机库测试 5/5、0 skip；内存版测试 6/6 |
| 03 旧响应逐字段不变 | 通过 | `shared/compute/*`、`shared/api-schema/mobile-contacts-dashboard.ts`、dashboard reader/provider | 417a33c5 | golden 测试；SQL 与图路径对照测试；schema 测试 |
| 04 界面改档位 | 通过 | 管线、详情、卡片、列表适配器、分析视图、示例数据 | 417a33c5、dc3bb07b | 组件测试；live 卡片翻页的浏览器测试；1440/375 截图 |
| 05 收口与流量 | 通过（流量超 1.6 GB，已登记） | — | 3a68f6ec | 全量对照、流量表 |

### 必需证据子表要点
- **SC-01：**
  - 规则表分值与 rs-2026-10-v1 一致；示意场景 25 / 50 / 80。
  - 待唤醒第 59/60 天边界；未来约见；memo 事件类型。
  - 每条 signal 都能在输入时间线里找到；同输入同时间点结果相同。
  - 改 stage/tags 结果不变（含类型断言）。
  - R-7：单人超过 12 条信号时，30 天前档位等于全量回放；截止点之后的约见不进历史回放。
  - 同一东京日、一条已发生一条未来的约见只计一次。
- **SC-02：**
  - 来源戳与东京日都没变时只有 1 条语句，时间线读取 0 次。
  - 写 memo、跨东京日、规则版本变化都会重算；重算同一遍写出 `tierCountsAt30d` 与 `earliestCaptureAt`，与纯函数一致。
  - 两个并发刷新结果等于串行（一次 recomputed、一次 skipped）；删光缓存后重算结果相同。
  - 他人 0 行；`connections` 0 次写。
  - 来源读失败或触顶时零写入、旧缓存保留。
  - `app/api/mobile/**` 里没有刷新入口（源码扫描测试）。
- **SC-03：**
  - golden 在改代码之前、在 `56d05250` 上写出（`sc03-golden-capture.txt`，sha256 `4c0ea9ee…`）。
  - 有无档位缓存时，除新增的 `relationshipTierDistribution` 外都与 golden 逐字段相同。
  - `relationshipStrengthDistribution` 仍按 `relationshipStrength ?? businessRelevanceScore ?? 0` 计算，不受缓存影响。
  - SQL 读模型路径与图路径对同一夹具输出相同（含 dormant，四组人数之和 = 有缓存行的有效联系人数）；新旧响应都能被 schema 解析。
- **SC-04：**
  - 管线四列；列头统计全部联系人；卡片按看板顺序；无拖拽；无假 chip；中英双语。
  - 详情档位标签与依据面板；不再有「更新状态」和「待设置关系」。
  - 依据里不在最近 20 条之内的信号，按信号 id 读回真实双语标题。
  - 列表强弱点映射：core→strong、active→medium、new→weak、dormant→dormant，无缓存行→unscored。
  - live 卡片首屏与翻页都显示档位点。
  - 分析视图改读新字段；示例模式静态档位、0 请求。
- **SC-05：** 全量对照新增失败 0；源码 typecheck 0 错；Codex review 一次；App 影响一节；D46① 同步副本与四个 sync 测试 10/10。

## review 处理（H 档，Codex 代码 review 一次，原文 `codex-review.txt`）
**P1-1 历史回放把截止点之后的约见算了进来** — 采纳
- `computeRelationshipTierCountsAt` 只回放 `occurredAt ≤ at` 的条目；当前快照里「未来约见计 5 分」的规则不变。
- 测试：截止点之后的约见足以跨过阈值，但 30 天前档位不受影响。

**P1-2 live 模式的所有人脉列表绕过了档位** — 采纳；PLANNER 没有把 live 列表划给 W0051，W47-4 写明列表强弱点本 Sprint 改读真实档位
- 首屏：`loadContactCardRoute` 按本页联系人 id 读一次档位，一条只读语句，不触发重算。
- 翻页：`/api/contacts/page?tiers=1` 时在响应里附上本页档位。App 不带这个参数，响应逐字段不变。
- `NetworkCards` 显示档位点和档位，不再出现手动阶段或「待设置关系」。
- 测试：路由加载与渲染、API 带不带参数两种情况、浏览器翻页。

**P2-3 来源触顶 5000 行仍写缓存** — 部分采纳
- 触顶即视为刷新失败：零写入、保留旧缓存、记日志（`RelationshipStrengthSourceLimitError`）。测试：截断时零写入。
- 游标分页超出 PLANNER 范围，列为后续候选。

**P2-4 来源戳检测不到 updated_at 不变的覆盖写** — 部分采纳
- 已确认：`upsertRecord` 会原样写入调用方给的 `updated_at`，所以同一 `updated_at` 覆盖 payload 的情况可能发生。
- 做法：能力检测。库里有 `sync_revision`（Sprint 0108 的严格触发器）时，来源戳用行数 + `max(sync_revision)`；没有这一列（42703）时退回原来的行数 + updated_at 最大值与总和，每个 store 只探测一次。
- 已知局限：退回口径下，同一 `updated_at` 的覆盖写检测不到，要到跨东京日才重算。生产库有没有这一列未核实，也没有碰生产。
- 测试：两种口径的选择逻辑各有单测；本机库没有这一列，库测试覆盖退回路径。

**P2-5 同一东京日的已发生与未来约见被重复计分** — 采纳
- 去重键只用「来源 + 东京日」，保留基础分最高的一条。测试已补。

**P2-6 依据回指不到最近 20 条之外的信号** — 采纳
- 新增 `features/relationship-strength/signal-items.ts`：按信号 id（至多 12 个）一条语句读回时间线条目，与 W0046 同一套生成逻辑和标题；他人读不到。
- 测试：25 条近期笔记把最近 20 条占满后，较早的信号仍显示真实双语标题，且只用 1 条语句。

**其他：** read-cost 基线 `contacts.dashboard` 上调 +24 B，协调者已接受。原因是分布语句多了一列空的 `relationship_tiers`，已写进基线 history。

## 交接给 W0048a / W0049 / W0051 / W0052 的契约

`shared/contract/relationship-strength.ts`（已同步到 App）：
- `RelationshipTier = "new" | "active" | "core"`；`RelationshipTierGroup = RelationshipTier | "dormant"`
- `RelationshipStrengthSignal { timelineItemId; source; occurredAt; basePoints; points }`
- `RelationshipStrength { contactId; tier; dormant; score; peakScore; lastSignalAt; signals ≤12; computedAt; rulesVersion }`
- `RelationshipTierCounts { asOf; counts: {new, active, core, dormant}; contactCount }`
- `RelationshipStrengthState { actorId; sourceStamp; tokyoDate; rulesVersion; computedAt; tierCountsAt30d; earliestCaptureAt; contactCount }`

**规则表** `RELATIONSHIP_STRENGTH_RULES`（`rulesVersion` = `rs-2026-10-v1`；W0048a 快照的 `sourceDataVersion` 要覆盖它）：

| 来源 | 基础分 |
|---|---|
| 建立联系：名片／扫码／活动交换 | 10 |
| 建立联系：手动或其他来源 | 5 |
| memo：默认 | 15 |
| memo：提取事件含 met／introduced | 20 |
| memo：提取事件含 collaborated | 30 |
| 当面记录 | 20 |
| 已发生的会面 | 25 |
| 已发生的活动 | 10 |
| 未来的会面（不衰减） | 5 |
| 个人日程 | 0 |
| 完成跟进 | 10 |
| 计划：确认已建立联系 | 20 |
| 计划：关联到需求 | 5 |
| 计划其他事件、笔记 | 0 |

其他参数：半衰期 90 天；待唤醒 60 天；核心 ≥70，有往来 ≥45；保留信号至多 12 条；同来源同东京日只计最高一条；同一 ref 只计一次。

**纯函数**（`features/relationship-strength/compute.ts`）：
- `computeRelationshipStrength(items, now, rules?) → RelationshipStrength`
- `computeRelationshipTierCountsAt(timelines: ReadonlyMap<contactId, items>, at, rules?) → RelationshipTierCounts`：只计 capture ≤ at 的联系人，只回放 ≤ at 的条目。
- `relationshipTierGroup`

**读模型**（`features/relationship-strength/read-model.ts`）：
- `ensureRelationshipStrengths(actorId, now, deps?) → { status: "fresh" | "recomputed" | "skipped" | "unconfigured"; state }`
- `ensureRelationshipStrengthsForPage(actorId, now?)`：吞掉异常、只记日志。
- `readRelationshipStrengths({ actorId, contactIds? })`
- `readRelationshipTierLookup({ actorId, contactIds })`
- `readRelationshipTierBoard({ actorId, perColumn? })`
- 存储：`orbit_records` 集合 `relationship_strengths`（记录 id `relationship-strength:<actor>:<contactId>`）与 `relationship_strength_state`（记录 id `relationship-strength-state:<actor>`）。两者都是非同步集合，属于可随时重建的缓存，不写 `connections`。
- **W0049：** 直接读 state 行的 `tierCountsAt30d` 和 `earliestCaptureAt`，打开页面不需要额外读时间线。

**调用点**（只在 Web 服务端加载器，`/api/mobile/**` 没有）：`contacts/page.tsx`、`contacts/dashboard/page.tsx`、`contacts/pipeline/page.tsx`、`contacts/[id]/page.tsx`。

**`relationshipTierDistribution`**：`NetworkDistributionAnalyticsPayload` 上新增的可选字段，形态为 `{ tier: RelationshipTierGroup; relationshipCount; percentage; contactIds (图顺序，前 5 个) }[]`。
- 待唤醒单独成组且优先；只统计有缓存行的联系人。
- 缓存为空时为 `[]`。
- 图路径与 SQL 读模型路径输出相同。

## 影响分析
- **CRITICAL：** `createDashboardReadModelPostgresReader`、`createStorageDashboardAggregateProvider`。只新增了一个 CTE 加一列，以及一个读档位的方法；既有的 `strength_score` 与其他列不变，SQL 与 JS 图路径的既有对照测试通过。
- **HIGH：**
  - `networkDistributionProviderForAccount`：只加了一个可选绑定。
  - `contactCardsToView`、`fetchContactCardView`：只加了可选参数和 `tier` 字段；`stage` 与 `pending` 字段删除，所有调用方已更新。
- **MEDIUM：** `loadAppContactsRouteViewModel`：只加了可选的 `contactIds`。
- 新符号在索引里显示 UNKNOWN，属于新代码；用文本搜索确认了调用方。
- 提交前 `detect-changes`：三次分别为 critical、high、low，都没有 partial/truncated（`detect-changes-staged-{1,2,3}.txt`）。

## 流量（D39）

本机库 `user_verify_plan`，57 位联系人，七种来源都有数据（`traffic-measure.json`）：

| 动作 | 语句数 | 返回字节 |
|---|---|---|
| 缓存新鲜时（来源戳 + state） | 1 | 542 B |
| 管线看板 | 1 | 4,552 B |
| 列表 30 人档位 | 1 | 2,060 B |
| 详情 1 人强度 | 1 | 1,245 B |
| 详情依据读回 | 1 | 1,177 B |
| 全量重算 | 14 | 9,829 B |

- 折算假设：每人每天 8 次读缓存（管线、分析、详情、列表各 2 次）加 2 次重算，1000 人，30 天。
- 每人每天 42,862 B，**每月约 +1,285.9 MB**。
- 并入 README 的三档（W0045 后加 W0046 再加本 Sprint）：**3,480.7 / 3,540.7 / 4,019.7 MB，超过 1.6 GB，登记 D32**。
- 瘦身候选：
  - 目前只有 live 卡片列表显示档位；概览和管线背后列表的档位读取可以去掉。
  - 重算字节随单人记录数线性增长，1000 位联系人的重账号单次约 170 KB；可以加单人上限或做增量重算。

## App 影响（R-9）
- **新增：** `src/api/contract/relationship-strength.ts`，以及 `contract/index.ts` 的导出。
- **同步副本更新：**
  - compute：`dashboard-distribution{,-contract}.ts`、`dashboard-aggregate.ts`，新增可选字段和可选的 provider 方法。
  - schema：`mobile-contacts-dashboard.ts`，新增可选字段。
- **四个 *-sync 测试：** 10/10。
- **旧响应不变的证据：** SC-03 golden 测试。`/api/mobile/contacts-dashboard` 除新增的可选字段外逐字段不变；`/api/contacts/page` 不带 `tiers=1` 时与改前逐字段相同，App 不会带这个参数。
- **App 本地计算：** 会多出 `relationshipTierDistribution: []`，App 不读这个字段。
- **未验证：** App 界面与 App typecheck。

## 测试与检查
- **收口集：** 38 个文件，270 个用例全部通过、0 skip（`closing-3.txt`）。
- **数据库测试：** 本机测试库，先跑 `assert-local-test-databases`，相关库测试 0 skip。
- **typecheck：** 源码 0 错（`.next/types` 有 8 个过期生成文件错误，与本 Sprint 无关）。
- **全量对照（`full-baseline.txt` / `full-after.txt` / `fail-*.txt`）：**
  - 基线 85 个失败，HEAD 86 个失败。
  - 名单里多出 3 条：
    - 写入方审计：本 Sprint 新写了 `orbit_records` 未登记，已在 `3a68f6ec` 修复。
    - `sync-revision-migration` 两条偶发失败：同文件在基线里是另外两条失败，单独跑两次都是 10/10，和 W0046 报告过的偶发是同一个文件。
  - 修复后单独复跑这两个文件 18/18（`new-fail-recheck.txt`）。新增失败 0。
- **浏览器：** dev server 3000，登录用 next-auth/jwt 签发 cookie，headless playwright 跑 1440 与 375 两个宽度。
  - 截图：`pipeline-*`、`detail-basis-*`、`analysis-health-1440`、`contacts-cards-*`、`detail-dormant-basis-*`。
  - 结果记录：`browser-run{,-2}.json`。
  - 控制台只有 `/api/inbox/summary` 的 503，是本机库查询失败的旧问题，与本 Sprint 无关。

## 付费 AI
调用 0 次，token 0。

## 假设与额外阅读
**假设（可逆实现细节，按成熟产品惯例自行决定）：**
- 「其他」来源的建立联系按手动 5 分计。
- 未来约见计 5 分、不算「往来」，不改变 `lastSignalAt`。
- 笔记提及（0 分）也算往来，会阻止待唤醒。
- 分布里的 `contactIds` 截到短名单 5 个。
- 每来源读取上限 5000 行。
- 没有接后台维护入口：W47-2 定的是「读时重算、不设夜间任务」。

**额外阅读（上下文包之外）：**
- 存储与缓存：`features/contacts/memo-extraction/{store,job}.ts`、`features/dashboard/storage/dashboard-snapshot.ts`、`shared/storage/{transactional-postgres,domain-watermark,postgres-live-record-store}.ts`、`scripts/migrate-sync-revision.ts`
- 联系人卡片：`contact-card-{route-service,view-model}.ts`、`network-cards.tsx`、`app/api/contacts/page/handler.ts`
- 服务层：`features/mobile/contacts-dashboard-service.ts`、`features/dashboard/service-factory.ts`
- 测试与审计：`tests/storage/sync-write-lock-audit.test.ts`、`tests/performance/read-cost-baseline.*`

**本机库种子：** `user_verify_plan` 下的 `source_id=w0047-seed`，可以用 `w0047-seed.mjs --remove` 删除。

## 遗留与后续候选
- 来源读取的游标分页（P2-3 后续）。
- 生产库是否有 `sync_revision` 列需要确认；没有时来源戳是退回口径，有已知局限（P2-4）。
- 流量瘦身，见 D32 登记。
- App 端没有真实档位（C-6，属于 App 线）。

## 回退
- 按顺序 revert `3a68f6ec`、`dc3bb07b`、`417a33c5`，然后在 App 端重新执行 `npm run sync:contract`。
- 没有迁移。`relationship_strengths` 与 `relationship_strength_state` 是缓存，可以留着也可以删。

## 证据目录 `~/orbit-sprint-evidence/web/sprint-W0047/run-01/`
- 影响分析与提交前检查：`impact.txt`、`detect-changes-staged-{1,2,3}.txt`
- 测试：`targeted-*.txt`、`closing-{1,2,3}.txt`
- typecheck：`tsc-{1,2}-raw.txt`
- SC-03 golden：`sc03-golden-capture.txt`
- App 同步：`app-sync*.txt`、`app-diff-status.txt`
- 全量对照：`full-{baseline,after}.txt`、`fail-{baseline,after,new}.txt`、`new-fail-recheck.txt`、`sprint-paths.txt`
- 浏览器：`browser-run{,-2}.json` 与截图
- 流量：`traffic-measure.json`、`traffic-d39.json`、`w0047-traffic.mts`
- 种子脚本：`w0047-seed.mjs`
- review 原文：`codex-review.txt`
- 中断恢复：`checkpoint.md`

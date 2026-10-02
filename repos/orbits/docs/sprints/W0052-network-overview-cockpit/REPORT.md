# Sprint W0052 — 执行总结

> 报告由协调者按 Generator 原文写入（子代理写文件被拦）。协调者注：全量基线对照时 Generator 曾写出会还原用户未提交文件的恢复命令，执行前已停下；协调者核对 `repos/orbits/next-env.d.ts` 仍为用户修改。

## 结果

对应 [GOAL.md](GOAL.md)。

- 已验证能做到：
  - 打开人脉概览，「AI 人脉驾驶舱」4 张卡分别是结构、目标缺口、本周行动、待唤醒。句子取自快照，数字按规则算，与分析页用的是同一组函数。
  - 没有快照时只显示数字。快照读不到时，标注改为「AI 分析暂时不可用」。没有计划时，缺口卡变成「生成计划」入口（SC-01）。
  - 「关系档位」按新认识／有往来／核心／待唤醒显示全量人数，下面列 2 位重点联系人。档位缓存不完整时，已知档位照常显示，并标明「N 人待统计」，不把缺的人算成 0（SC-02）。
  - 「最近动态」显示关系时间线最新 5 条：联系人姓名链接、来源徽标、双语摘要、时间。任一来源读失败时，只有这一块显示「来源暂时不可用」（SC-03）。
  - 环形图中心和「按来源」都是全量人数。示例期显示示例数字与双语示例动态，真实读取 0 次（SC-04）。
  - 从真实页面入口打开概览：任何表 0 写入，计划生成器 0 次，付费 AI 0 次。夹具同时处在三种「会写」的状态：强度缓存待重算、计划在阶段边界、快照待重算。
- 仍未实现或未验证：
  - 概览新增读取每月约 +1.14 GB，超出 1.6 GB 总预算，已登记 D32，候选瘦身见「交接」。
  - 关系管线页卡片的「下一步」中文模板句、`network-all.tsx` 用的旧阶段常量，都不在本 Sprint 范围，留给 W0055。
  - `localizeOrbitTree` 改坏姓名的问题全局仍在。概览上的姓名已经不经过它，所以概览不再受影响。

## 运行记录

- 结果：completed。合并与登记由协调者完成。
- Generator：Opus 5.5，2026-10-03。Planner revision 4，SHA256 `54fc9813fb0960a2735513314a351ff8e0f81ee23720a642d2284ad6c1294870`。
- 分支与提交：
  - 分支 `sprint/W0052-network-overview-cockpit`，基线 `63eb2bd3`。
  - 功能提交 `fcce909c`。
  - review 修复 `80fc014b`（固定最终 SHA）。
  - 报告提交与合并 SHA 见 README 运行记录。
- 档位：H。`dashboard/page.tsx` 这条共享装配链受影响，按 R-17 从 L 升为 H。
- 全量对照（两次都设了本机测试库变量，没有 source .env）：
  - 基线 `63eb2bd3`：6,583 项，81 项失败。
  - HEAD：6,611 项，81 项失败。
  - 新增失败 1 项：`sync-revision-migration-postgres`「relaxed trigger」，报 lock timeout。同一文件的另一项在基线里失败、HEAD 里通过。该文件单独跑 3 次都是 10/10，判定为已知偶发（W0046～W0048a 都记录过），不是本 Sprint 引入的。
  - audits 的 3 项（visible controls／runtime evidence keys／manifest generation）在基线里同样失败。
- 付费 AI：0 次。验证前后 `ai_usage_calls` 都是 14 行，最新一条在 10-02 21:28，早于本会话。
- push：未做。

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-W0052-01 | pass | 见下方「SC-01 证据」 |
| SC-W0052-02 | pass | 模型单测：35 人夹具档位 12／10／8／5，缓存为空或只覆盖部分联系人，重点联系人。组件测试：链接、档位标，无「待了解／推进中」等手动阶段文字 |
| SC-W0052-03 | pass | 见下方「SC-03 证据」 |
| SC-W0052-04 | pass | 组件测试：环形图中心 35；模型单测：来源合计 35；`app-network-demo-pages`：示例 0 读取、ja 显示英文；`app-network-demo-mode` |
| SC-W0052-05 | pass（超预算，已登记 D32） | 见「流量（D39）」与「SC-05 证据」 |

**SC-01 证据**
- 主证据（PG）：`overview-cockpit-loader-postgres.test.ts`，同时验证 4 卡数字与机会标签同一函数结果相等。
- 真实页面入口 PG 测试：`app-contacts-dashboard-overview-writes-postgres.test.ts`，任意表 0 写、进程内 0 条写语句，结构标签与 `getCurrentView` 作对照组。
- 模型单测 `app-network-overview-cockpit-model.test.ts`：有快照／无快照／快照读失败、无计划、依据规则，以及源码扫描（不出现 `getCurrentView`／`enterCurrentPhase`／`language.zh|en`／`.stale`）。
- 组件测试 `app-network-overview.test.tsx`：zh、en、ja 各一组。

**SC-03 证据**
- 模型单测：6 人 9 条时间线、封闭模板、后端 title 用英文调试句时页面 0 命中、部分来源失败按失败降级、依据超过 30 人时 5 条动态仍都有姓名链接。
- 组件测试：zh 与 en。

**SC-05 证据**
- 测量输出：`measure-verify-plan-r2.json`。
- 浏览器：zh 和 en 各一套 1440 与 375 截图，外加示例账号 1440 截图。
- 依次点了 4 张卡和「核心」档位段，跳转都正确。375 下「To re-engage」被截断，已修。
- 控制台 0 错误。

**数据库测试的非 skip 输出**（`ORBIT_EVENT_DATABASE_URL` 与 `ORBIT_LIFECYCLE_TEST_DATABASE_URL` 都指向 `orbit_newui_events_20260922`，先跑过 `assert-local-test-databases`）：

| 文件 | pass | skipped |
| --- | --- | --- |
| tests/services/overview-cockpit-loader-postgres.test.ts | 2 | 0 |
| tests/pages/app-contacts-dashboard-overview-writes-postgres.test.ts | 1 | 0 |
| tests/pages/app-contacts-dashboard-opportunities-writes-postgres.test.ts | 1 | 0 |
| tests/services/opportunities-tab-loader-postgres.test.ts | 2 | 0 |
| tests/capabilities/relationship-timeline-reader-postgres.test.ts | 6 | 0 |
| tests/capabilities/relationship-strength-read-model-postgres.test.ts | 5 | 0 |
| tests/services/structure-tab-loader-postgres.test.ts | 3 | 0 |

收口定向集共 13 个文件，141 pass、0 skip。`npx tsc --noEmit -p .` 源码 0 错。

### 流量（D39）

测量口径：拦截 `pg.Client.prototype.query`，本机 verify-plan 账号（57 位联系人，有快照、计划、memo）。按 1000 位活跃用户 × 每人每天打开概览 2 次 × 30 天折算。

- 页面完整装配链（分析 + 名单一页 + 驾驶舱，并行）：245,592 B／次，45 条语句。其中分析加名单 222,126 B／19 条，是 W0052 之前就有的读取，不重复入账。
- 驾驶舱新增读取：23,466 B／次，26 条语句。

| 部分 | 字节 | 语句数 | 说明 |
| --- | --- | --- | --- |
| 计划 `getCurrent` | 8,307 | 5 | 多读的条目与最近记录如实计入（D46④） |
| 快照 `readView` | 4,883 | 8 | |
| 时间线 | 7,266 | 8 | review P3 后每来源只读前 5 条，原为 7,900 |
| 待确认 | 1,234 | 3 | |
| 档位看板 | 936 | 1 | |
| 姓名 | 840 | 1 | |

- 节省项（概览不再做的两次读取）：
  - 本页档位表：3,896 B。
  - 强度缓存新鲜检查：542 B，用 W0047 的实测值；需要重算时另省约 9.8 KB。
- 净增 19,028 B／次，约 **+1,141.7 MB／月**（直接口径 1,408 MB）。
- 去重说明：
  - W0049／W0050 入账的是打开分析标签时的读取，概览打开是另一次事件，不重叠。
  - W0046 那条「最近动态 452.7 MB」预估行没有并进三档累计，本实测直接替换它。
- **三档累计**：5,596／5,656／6,135 → 约 **6,738／6,798／7,277 MB**，登记 D32。
- read-cost 基线不需要上调。
- 参考风险：概览原有的分析加名单读取每次 222 KB，按同一假设约 13.3 GB／月。这部分未单独入账，请在 D32 周检时一并核对。

## 假设与额外阅读

- 上下文包之外读过的文件及原因：
  - 前序 W0043、W0046～W0051 的 REPORT 交接段：核对入口名。
  - `opportunities-route-service.ts`、`opportunities-view-model.ts`：复用 `gapNoteFor` 与本周动作口径。
  - `structure-tab-model.ts`：复用 `structureSnapshotView`。
  - `features/network-analysis/{contract,service,snapshot-validator,evidence-contacts,runtime}.ts`：快照形态与依据规则。
  - `features/relationship-strength/read-model.ts`：用档位看板挑重点联系人。
  - `features/relationship-timeline/{reader,build}.ts`：时间线读取与条目结构。
  - `contact-list-postgres-reader.ts`、`live-service.ts`、`contacts-route-view-model.ts`：确认 `facet_sources` 已经通过 `availableFilters.sources` 进入路由模型。
  - `network-detail-modal.tsx`：复用来源徽标和时间格式。
  - `network-analysis-structure.tsx`：按 W0049 交接统一档位配色表。
  - W0050 的页面写入测试：照它的写法补概览的页面入口测试。
- PLANNER 文件表之外的补充改动：
  - 统一 `TIER_HEALTH_META`（`network-analysis-structure.tsx`）。
  - `network-copy.ts` 新增 `timelineSummaryCopy`。
  - `features/relationship-timeline/reader.ts` 加每来源 limit（review P3）。
  - 测量脚本、夹具文件、页面入口 PG 测试。
- 自定的可逆细节：
  1. 重点联系人用档位看板每列前 2 位（多 1 条 936 B 的语句），因为名单读取不带最近信号时间。姓名并进同一次有上限的姓名读取。
  2. 档位段链到 `/app/contacts/analysis/tier/{id}`，因为 W0047 管线页没有 `?tier=` 参数；「查看完整管线」仍链到管线页。
  3. 来源徽标沿用详情弹窗的 `TIMELINE_SOURCE_LABEL`（见面、建立联系……），全站同一套。
  4. ④卡的模板句只在有快照时显示，按 SC「无快照 4 卡无句子」。
  5. 档位缓存不完整：已知档位加「N 人待统计」；一档都没统计到时各段显示「—」；没有联系人的账号如实显示 0。
  6. 摘要里不再带日程名、任务名这类用户标题（条目契约里没有单独的字段），只用模板。
- TDD 偏差：模型是先写实现再补测试的，没有严格做到 RED 先行。

## review 处理（H 档，Codex 1×P1 + 5×P2 + 1×P3，协调者裁决全部采纳）

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| P1：概览仍刷新强度缓存，可能写库 | 采纳 | 概览跳过 `ensureRelationshipStrengthsForPage`，与机会标签同一口径。新增真实页面入口 PG 测试（三种待写状态，结构标签作对照组）。流量改为按页面完整装配链计量 |
| P2：摘要透传后端 title | 采纳 | 新增 `timelineSummaryCopy`，按 source 显式分支，配合结构化 detail 生成摘要。白名单测试：后端 title 换成英文调试句，页面 0 命中 |
| P2：缺档位缓存时显示成 0 | 采纳 | 改为 `tierPending`，显示「N 人待统计（档位统计更新中）」，一档都没统计到时显示「—」。补了缓存为空、只覆盖部分联系人、0 联系人账号三种测试 |
| P2：姓名配额先被依据用光 | 采纳 | 先给 5 条动态和看板候选预留，再放实际展示的诊断与第一条有效 gap 的依据。补测试：依据 40 人时，5 条动态都有姓名链接 |
| P2：部分来源失败被当作完整结果 | 采纳 | 只要 `unavailable` 为真就整块降级。补测试 |
| P2：示例期 ja 显示中文 | 采纳 | 改为 `language === "zh" ? "zh" : "en"`。页面测试加 ja 场景 |
| P3：各来源仍读 50 条 | 采纳 | 跨联系人最近 N 条时每来源 LIMIT N，单人详情保持 50。impact：`readRelationshipTimelineForContact` LOW；`readRecentRelationshipTimelineForActor` UNKNOWN，文本搜索确认只有本 loader 和测试在用。测试证明详情的「共 N 条」不变 |

## 交接

- 给 W0054 的接入点：
  - `NetworkOverview({ analysis, overview })`，`overview` 由 `buildNetworkOverviewData(parts, analysis)` 生成。
  - 示例期入口是 `buildDemoNetworkOverviewParts(now, lang)`。示例静态快照只要把它的 `snapshot` 换成 ready 视图（带 diagnosis／gap／plan 块），驾驶舱就会显示句子。
- 新接口：
  - `loadOverviewCockpit({actorId, language, now}, deps?)`
  - `timelineSummaryCopy(item)`
  - `TIER_HEALTH_META`
  - `OverviewCockpitParts`、`NetworkOverviewData`（含 `tierPending`）
- 读时间线的口径：`readRecentRelationshipTimelineForActor` 每来源按 limit 读；详情读取每来源 50 条不变。
- 仍在使用旧阶段常量的页面（给 W0055）：`network-0918/network-all.tsx`（`STAGE_LABEL`／`STAGE_CHIP`）。`stageCounts` 只剩测试在用。
- 候选瘦身（D32）：
  - 计划需求只读投影，结构、机会、概览三处共用，概览单次约省 6–7 KB。
  - 概览原有的分析加名单读取每次 222 KB，需要核对。
- 需要用户决定：无。D32 瘦身排期由协调者在大目标 4 收尾时上报。
- 回退：按序 revert `80fc014b`、`fcce909c`。没有迁移，没有改 shared，App 0 改动。
- 证据目录：`~/orbit-sprint-evidence/web/sprint-W0052/run-01/`，内含截图、`closing-set-r2.log`、`db-tests-r2.log`、`full-head.log`、`full-base.log`、`fail-{head,base}.txt`、`flaky-sync-revision.log`、`measure-verify-plan{,-r2}.json`、`checkpoint.md`。

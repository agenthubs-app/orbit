# Sprint W0036 — 执行总结

## 结果

对应 [GOAL.md](GOAL.md)。

- 已验证能做到：
  - 首页「今日要事」在原有来源之后补入本周计划行动（最多 2 条，拖期在前），只补到前 3 个位置；药丸写「本周计划 · 第 N 阶段 <阶段名>」，拖期另标「已顺延 N 周」（普通药丸，不用暖色）。（SC-01）
  - 计划行动可「完成」（复用首页 `togglePlanAction`，本周推进同一行同步打勾，失败两处都回滚并在今日要事处提示）、「今天先不做」（只存本机，按账号 + 东京日分 key，不补位，0 个写请求）、点标题去联系人／活动／计划页对应行（计划页本周行加了 `id="plan-action-<id>"` 与 `scroll-margin-top`）。（SC-01、SC-02）
  - 已确认联系人 <10 且还有空位时出一条补人脉，按钮去 `/app/contacts/new?method=scan`，可「7 天内不再提示」；有计划时药丸带当前阶段名，没有计划时不提阶段。（SC-03）
  - 首页内算出共享活动池 `eventPool`／`eventPoolReady`（计划 → 目标 → 近期，组池后截到 8；标题按 id 换成三语审阅标题，地点原文）；没设目标、读目标失败的真实用户也有「近期活动」兜底；空日导语引池里第一场。示例期在服务端读一次真实近期活动交给示例壳，示例今日要事与导语不变。（SC-04）
  - 3001 上用 verify-plan／verify-legacy／verify-new 走通，桌面 1440 与手机 375 各看一次。（SC-05）
- 仍未实现或未验证：
  - SC-05 路径 ①「新用户走三步引导到首页」没有完整走：引导第 1 步要识别名片，本机 verify server 的名片识别走真实 DeepSeek（付费 AI，本 Sprint 未授权），也没有手工建联系人的入口。改为：verify-new 示例期首页（今日要事与导语不变、真实近期活动已下传、客户端 0 新增请求）+ verify-plan（有计划、联系人 5 位，等价于刚出引导后的首页状态）验证新句式。是否补走需协调者决定。
  - 活动池本 Sprint 只用于空日导语；小模组与月历圆点在 W0037／W0038。费用没有真实数据（不出 `feeLabel`）；地点是来源原文，未本地化。

## 运行记录

- 结果：completed（等待协调者合并；SC-05 路径 ① 见上）
- Generator：Opus 5.5／2026-10-01；Planner revision 3（SHA256 `7518520ddf1ae010dab0ee397938f4e13c154f4a22aa2efe17d54b4767cad8d6`）
- 分支 `sprint/W0036-today-plan-actions`（基线 `chat-agent` `fe54b31e`）；功能提交 `f7e5e65a`（活动池数据）、`775db2e3`（今日要事 + 首页活动池 + 示例期读取）、`78a71d8f`（review 修复）；`chat-agent` 合并 SHA：等待协调者
- 档位 H。全量对照（RULES §5.2）：基线 6090 项、9 项失败；改后 6140 项，多出 1 项失败（`sync-write-lock-audit`：新测量脚本写 `event_ops_events` 未登记进清单）——已登记（脚本本来就用 `lockedWrite` 取锁），该文件重跑 8/8 通过，**新增失败 0**。日志 `full-baseline.log`、`full-after.log`、`fail-*.txt`
- 收口定向集 13 个文件 274/274 通过、skipped 0（`targeted-final.log`，含 review 修复后）；`npx tsc --noEmit -p .` 源码 0 错误（`.next/types/validator.ts` 既有过期生成文件错误不计）
- 付费 AI 调用 0 次；未 push、未部署、无迁移
- 证据目录：`~/orbit-sprint-evidence/web/sprint-W0036/run-01/`（截图 01–09、impact、detect-changes、测量 JSON、全量日志、Codex review 全文）

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-W0036-01 计划行动进今日要事 | pass | `tests/services/today-plan-items.test.ts`（名额 0／1／2／≥3、拖期优先、阶段名退回、跳转地址）；`tests/pages/app-agent-iorbit-home.test.tsx` W0036 SC-01 组（药丸、导语、标题跳转、计划 pending 时导语、计划读不到、示例不变、`plans/current?view=home` 全程 1 次、计划页锚点）；截图 01／04／06 |
| SC-W0036-02 勾掉与今天先不做 | pass | 首页组件测试 SC-02 组：PATCH `set_status: done`、两处同步、失败回滚 + 今日要事提示、请求中再点无效；今天先不做 0 写请求、key `orbit.today.skip.v1:<account>:<东京日>`、次日重现、同账号旧日期 key 清理；A → B → A 只读写当前账号 key；存储抛错与 `account === null` 仍隐藏且不碰存储；无 SessionProvider 时用单例账号、不写别的 key；SSR 不访问 `localStorage`；截图 02／03 |
| SC-W0036-03 补人脉 | pass | 首页组件测试 SC-03 组（人数 9／10、`home` 为 null、原有 + 计划占满不出、有计划带阶段名、7 天免打扰第 8 天出现、按钮只导航、首页源码无 `useCardBatch`／`CardBatchImport`）；截图 05／08 |
| SC-W0036-04 推荐活动池 | pass | `tests/services/home-event-pool.test.ts`；`tests/services/public-goal-recommendations.test.ts`（四种状态都带 `upcoming`、≥13 场不截断、success／no_match 语句数不变、needs_goal／读目标失败各多目录 1 + 报名 1、读失败为空）；`app-agent-home-dashboard-entry`（四种状态复制、坏数据整体 unavailable、截到 12 + `upcomingTruncated`、补查接口鉴权）；首页组件测试（zh／en／ja 标题、未知 id 回退、地点原文、空日导语、截断时补查第 13 场一次并在池首）；`app-agent-guide-demo-page`（示例调用矩阵）；截图 07／09 |
| SC-W0036-05 回归与真实页面 | pass（路径 ① 部分，见上） | 截图 01–09；控制台只有 `/api/inbox/summary` 503（本机既有，改前同样，与本 Sprint 无关）；verify-plan 已 `--reset`；全量对照新增 0；Codex review 1 条已修 |
| SC-W0036-06 数据库月预算 | pass（100% 档超 1.6 GB，已登记 D32 风险） | 下表；`sc06-sc07-measure.json` |
| SC-W0036-07 HTTP 三列 | pass（100 场超 20 KB → 已启用备选约束） | 下表；`sc06-sc07-measure.json`；浏览器实测 server action 应答 |

### SC-06 数据库月预算（W0017 口径：返回行 JSON 字节，不含协议开销）

本机临时 schema 实测（`scripts/measure-home-event-pool-traffic.ts`），字段长度贴近本机库已发布活动均值（标题 42 B、地点 34 B）。一次「目录 + 本人报名」= 3 条语句（`listPublishedEvents`、参会人数汇总、本人报名）：5 场可报名 **4,487 B**（报名 0 行；保守加 0.5 KB 报名估值 = 4,987 B，下表用 4,987 B）。目录字节随场数线性增长（13 场 11,670 B，100 场 89,826 B）。

| 行 | 口径 | 10% | 20% | 100% |
| --- | --- | --- | --- | --- |
| ① 基线 | W0029 总账 | 1,106.83 MB | 1,106.83 MB | 1,106.83 MB |
| ② 示例期近期活动 | 4,987 B × 10 次 × 1000 新用户 | 49.87 | 49.87 | 49.87 |
| ③ 无目标兜底 | 4,987 B × 4 次／天 × 30 × 1000 × 占比 | 59.84 | 119.69 | 598.44 |
| ④ W0037 示例期社群（占位） | W0037 实测后替换 | 3 | 3 | 3 |
| ⑤ SC-07 计划活动补查 | 只在可报名 >12 场且计划活动不在前 12 场与目标匹配时；当前 5 场为 0 | 0 | 0 | 0 |
| **合计** | ②④（示例期）与 ③（真实期无目标）按单次请求互斥，保守直接相加 | **1,219.54 MB** | **1,279.39 MB** | **1,758.14 MB** |

- 判定线 1.6 GB（D39）：**100% 档超出约 158 MB，登记为 D32 风险，请协调者写入 D32 周检**；按 D38／D39 未取消兜底。
- 敏感度：目录到 13 场时单次约 12,170 B，②≈121.7、③≈146／292／1,460 MB；⑤ 若按「10% 有计划用户每天 4 次」估约 146 MB，20% 档即接近或超过 1.6 GB。目录增长也会放大既有的 success／no_match 路径（非本 Sprint 新增）。
- success／no_match 路径语句数不变（改前改后都是目录 + 报名）；needs_goal／读目标失败改前 0 条数据库语句，改后 3 条。

### SC-07 HTTP 响应体与请求次数

| 可报名场数 | 数据库字节／语句（needs_goal） | 全量 `upcoming` 时 snapshot 增量 | 启用备选约束后增量（前 12 场 + 标志） | 1000 人月度 HTTP 增量（约束后；首页 4 + 策略页 1 次／天） |
| --- | --- | --- | --- | --- |
| 5（当前） | 4,487 B／3 | 1,300 B | 1,326 B | 199 MB |
| 13 | 11,670 B／3 | 3,359 B | 3,126 B | 469 MB |
| 20 | 17,958 B／3 | 5,160 B | 3,126 B | 469 MB |
| 50 | 44,908 B／3 | 12,880 B | 3,126 B | 469 MB |
| 100 | 89,826 B／3 | **25,747 B（> 20 KB）** | 3,126 B | 469 MB（不约束时 3.86 GB） |

- 判定：100 场时单次增量 25.7 KB > 20 KB，**已启用事实 9 的备选约束**：snapshot 只带最早 12 场 + `upcomingTruncated`；首页在计划读到后，若有计划点名活动既不在这 12 场也不在目标匹配里，按「缺失 id 集合」只查一次 `resolveHomePlanEventsAction`（同一套候选规则，读整份目录 + 本人报名，计入 ⑤）。产品结果不变：第 13 场以后的计划活动仍排在池首（组件测试证明）。
- 浏览器实测（3001，verify-plan，2 场可报名）：`refreshHomeDashboardAction` 应答解码后 3,304 B（压缩 1,182 B），其中 `upcoming` 525 B（每场约 262 B，与脚本口径一致）。
- 频次：首页每人每天 4 次（W0017）；策略页 `iorbit-strategy.tsx` 每人每天 1 次为**假设**（W0017／W0021 表里没有策略页频次）。HTTP 字节不进数据库预算。
- 请求次数：首页挂载不新增客户端请求（补查只在截断且缺失时 +1）；「完成」1 个 PATCH（与本周推进同一接口）；「今天先不做」「7 天内不再提示」0 个；补人脉按钮是导航。

### 示例期调用矩阵（`tests/pages/app-agent-guide-demo-page.test.tsx`）

| 读取 | 操作级调用 | 底层语句 |
| --- | --- | --- |
| 引导状态 | 不变 | 不变 |
| 复合 home（示例判定用，不注入示例壳，`home` 仍为 null） | 1 | 既有，未变 |
| 公开目录 `readRecords` | 1（新增） | 2（`listPublishedEvents` + 参会人数汇总） |
| 本人报名 `listCanonicalRegistrationsForUser` | 1（新增；无可报名时 0） | 1 |
| 目标推荐／计划／信号／会话／`events`／`registered-any`／社群 | 0 | 0 |

客户端请求仍为 0（顶栏既有 `/api/account/me` 除外）；目录读失败时 `demoEventCandidates` 为空、示例照常渲染；真实分支不做这次读取。

## 假设与额外阅读

- 额外阅读（先查调用方）：相关测试夹具（`app-agent-iorbit-home`、`app-agent-guide-demo-page`、`app-agent-home-dashboard-entry`、`public-goal-recommendations(-runtime)`、`tests/support/plan-snapshot-fixture.ts`）；`features/plans/contract.ts`；`orbit-shared-read.ts`；`home-dashboard-actions.ts`（鉴权口径）；`features/events/core/public-catalogue.ts` 与 event-operations 目录汇总 SQL（测量脚本造数据）；`scripts/measure-plan-read-traffic.ts`（W0017 口径）；`verify-server.sh`、`seed-verify-accounts.ts`、`verify-session-cookie.ts`；`tests/storage/sync-write-lock-audit.test.ts`。
- 新增路径：`features/agent/home-event-pool.ts`、`features/agent/home-event-pool-runtime.ts`、`app/(app)/app/agent/iorbit-0918/today-plan-items.ts`、`app/(app)/app/agent/home-plan-events-actions.ts`（SC-07 备选约束的窄接口）、`scripts/measure-home-event-pool-traffic.ts`、`tests/services/home-event-pool.test.ts`、`tests/services/today-plan-items.test.ts`。
- 选择：
  - 名额（W36-1／W36-3）：先按 `min(2, 3 − n)` 选定，再去掉「今天先不做」的，不补位；勾掉完成后下一条计划行动自然上来（不算补位）。
  - 「7 天」按东京日：关掉当天算第 1 天，第 8 天出现；存东京日期字符串。
  - 补人脉等计划读完才判断；示例期一律不出。在短讯位置时 `why` 不显示，所以阶段名放进药丸「补人脉 · 第 N 阶段 <名>」。
  - 空日导语在活动池未就绪（补查进行中）时仍显示「正在整理今天的事…」，避免跳变。
  - `buildHomeEventPool` 的 `goalMatches` 项允许可选 `publicCode/title/startsAt/venue`（不在 `upcoming` 里时用），是对 PLANNER 签名的兼容扩展。
  - 已报名集合再并上 `home.events` 里已报名的 route id（服务端已按 canonical id 排除，这里只是再保险）。
  - 截断放在 snapshot 复制层（`copyRecommendations`），推荐服务本身仍返回全量 `upcoming`。
  - 包体：`eventTitleForId` 把 `orbit-event-content`（13 场三语内容）带进首页客户端包，源文件约 64 KB、gzip 约 21.7 KB（源码估算，未做生产构建）。
- 影响分析（索引开工时重建）：`IOrbitHome` CRITICAL、`planWeekActions` CRITICAL（只调用未改）、`buildPlanWeekSummary` HIGH（未改）；`createPublicGoalRecommendationsService`、`recommendWithDependencies`、`copyRecommendations`、`IOrbitDemoShell`、`IOrbitPlanScreen` LOW；`loadHomeDashboardSnapshot`、`IOrbitShell`、`AppAgentPage` UNKNOWN（同名多匹配／路由入口），文本搜索确认 snapshot 消费者不校验 `recommendations` 形状。提交前 detect-changes：提交 1 low；提交 2 high（`AppAgentPage` 10 条流程，即示例分支新增读取，示例页测试覆盖）；提交 3 low。

## review 处理（仅 H 档）

`codex review -c model="gpt-5.6-sol" --base chat-agent`，全文 `codex-review.txt`。

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| P2：计划活动补查用组件生命周期布尔守卫，计划或账号变化后缺失集合变了也不再查，池里沿用旧结果 | 合理 | `78a71d8f`：结果按「缺失 id 集合」作 key，同 key 只查一次，key 变了旧结果作废并重查；加回归测试 |

## 交接

- 活动池契约（W0037／W0038 据此开工）：`features/agent/home-event-pool.ts` 的 `HomeEventPoolItem`／`HomeEventPoolCandidate`／`HOME_EVENT_POOL_LIMIT = 8`／`buildHomeEventPool(input)`；`goalMatches` 项多了可选展示字段，其余与 PLANNER 一致。
- `IOrbitHome` 内：`eventPool: readonly HomeEventPoolItem[]`（`useMemo`，标题已用导出的 `localizeHomeEventPool(pool, lang)` 换好，ja → en，地点原文）与 `eventPoolReady: boolean`（真实期 snapshot、计划、计划活动补查都不 pending；示例期恒 true），定义紧跟 `planSummary` 之后。W0037／W0038 直接用，不要自行本地化。
- snapshot 形状：`recommendations.upcoming`（≤12，升序）+ `recommendations.upcomingTruncated`；补查接口 `resolveHomePlanEventsAction(eventIds)`（1–20 个 id，返回 `{state:"events", items}`）。
- 示例壳可选 prop `demoEventCandidates`（`IOrbitShell` → `IOrbitDemoShell` → `IOrbitHome`），服务端由 `readDemoHomeEventCandidates` 读。W0037 示例期社群读取请追加到 SC-06 表第 ④ 行。
- W36-1～W36-5 按 D38 执行（见上）。W35-3：`features/events/registration/active-registration.ts` **未复用、未删除**，活动池的「排除已报名」用推荐服务已读的报名集合；该模块**暂无生产调用方**，作为观察项保留。
- 需要协调者／用户决定：① SC-06 100% 档 1,758 MB 超 1.6 GB，请写入 D32 周检；② SC-05 路径 ① 是否在授权付费识别或补充种子后补走；③ 观察项：本机 3001 每次 `GET /app/agent` 读库约 9.6 MB（改前同样，非本 Sprint 引入），建议另开任务排查；`/api/inbox/summary` 本机 503 同为既有。
- `repos/orbits/next-env.d.ts` 被 3001 dev server 改写（`.next-verify`），未提交。
- 回退：`git revert 78a71d8f 775db2e3 f7e5e65a`（无迁移；本机 `orbit.today.*` localStorage key 可留可删）。

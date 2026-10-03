# Sprint W0061 — 执行总结

协调者代写（Generator 写入 REPORT 被拦截，全文取自 Generator 最终回报）。

## 结果

对应 [GOAL.md](GOAL.md)。

- 已验证能做到：
  - 同一句「TA 能帮你：…」+「依据」小签由一个组件 `ContactValueLine` 渲染，出现在三处：首页今日要事里恰好指向一位联系人的计划行动与跟进、导入后／今日要事打开的关联计划候选卡、联系人详情「为什么是 TA」首行。共享夹具断言三处中英文本一致（SC-01）；真实页面上 `user_verify_plan` 的「约 林玫」首页与详情文本逐字相同。
  - 依据解析：名片扫描建立的联系人显示「名片」、其他方式「录入」、memo 显示东京日期「memo 9/28」、计划需求显示「计划需求『…』」，其余来源丢弃，全部丢弃就不显示「依据」。
  - 候选卡原理由改为依据签：AI 层「依据 · 名片职位」（模型原文在提示里）、规则层「依据 · 行业规则匹配 · {行业}」，「对应 {需求}」chip。
  - 未生成时不空白：「公司 · 职位（都空用姓名）」+「可能对应：计划需求『…』 · 同属 {行业}」+「生成中／暂时没生成出来／设置关系目标后生成」；候选卡在生成中（或没附上值）时每 10 秒重取、最多 3 次，ready 后就地替换；详情未就绪时同样退化，状态尾巴沿用 W0057 状态行。
  - 计划行动多一行「为什么现在」：计划条目自身理由（前缀阶段）→ ready 洞察下一步 → 不显示；跟进不显示。
  - 读取 0 次模型调用、0 写入、他人 id 静默丢弃；示例首页 0 次请求。
- 仍未实现或未验证：
  - 原型上方小号类别（「找 TA 引荐」）未做——计划行动没有该字段，PLANNER 允许「没有就不显示」。
  - 详情依据只从已读到的最近 20 条时间线与已关联需求解析（0 次新增读取）；更早的 memo 或未关联的候选需求在详情里会被丢弃，与首页／候选卡可能不一致（Codex P2 部分采纳）。
  - 切换语言后候选卡首屏可能仍是旧语言，直到下次打开（共享读取 key 未改，Codex P2 部分采纳）。
  - 「全部关联」「稍后再看」按 W61-4 未做（候选）。

## 运行记录

- 结果：completed
- Generator：Claude Opus 5.5／2026-10-03；Planner revision 2（SHA256 `cd0fa870fd5a964692c4baa3e80a8726b0721e455ac59eb05d7c1fb465466c4e`）；基线 `ea7321c0`
- 分支 `sprint/W0061-contact-value-line`；功能 `ef58dcd6`（数据源）、`1789cc32`（三处接线）；`chat-agent` 合并 SHA：见登记表
- 档位：用户分档 M，`IOrbitHome` impact CRITICAL → 升 H。全量对照（`ORBIT_EVENT_DATABASE_URL` 指向本机 `orbit_test`，未 source `.env.local`）：基线 6,737 项 24 失败；改后 6,759 项 24 失败；**新增失败 0**
- 付费 AI 调用 0 次、0 token；Codex 代码 review 1 次；push 未做

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-W0061-01 | pass | `tests/support/value-line-fixture.ts` 共享夹具；`tests/pages/app-contact-value-line.test.tsx`（候选卡、详情，中英）；`tests/pages/app-agent-iorbit-home.test.tsx`「SC-W0061-01／03」；`tests/api/contact-value-lines-route.test.ts`（真实 PG）；浏览器首页与详情文本逐字相同 |
| SC-W0061-02 | pass | 纯函数表驱动（none／pending／failed／no_goal／空文字／公司职位皆空）；候选卡假定时器：10 秒重取、ready 替换、最多 3 次；详情退化 |
| SC-W0061-03 | pass | `contactValueWhyNow` 单测；首页 `mountHome` 四种情形 |
| SC-W0061-04 | pass | `tests/architecture/contact-value-line-read-paths.test.ts`；真实 PG：只跑 SELECT、`contact_insights` 前后快照相同、供应商 fetch 0 次、他人 id 不返回；示例首页 0 次 value-lines 请求 |
| SC-W0061-05 | pass | 流量表（下）；1440／375 × 中英截图，控制台 0 错误（候选卡 en-375 首轮一次 dev 水合告警，复跑 2 次未复现） |

### 流量预算表（D39 口径；1000 活跃用户 × 30 天，MB = 10^6 B）

| 读取 | 单次 DB | 单次响应 | 月次数 | 月 DB |
| --- | --- | --- | --- | --- |
| 首页 value-lines（露出 3 条，≤3 id，zh） | 1,061 B | 1,271 B | 90,000 | 95.49 MB |
| 同上硬上限 6 id（zh／en） | 2,046／1,818 B | 2,489／2,261 B | — | — |
| 候选接口 20 人全 ready 增量（zh／en） | 3,602／3,502 B | 3,780／3,680 B | 9,000 | 32.42 MB |
| 候选卡重取 20 人 pending ×3 | 571 B | 1,295 B | 27,000 | 15.42 MB |
| 详情 | 0 | 0 | — | 0 |
| 合计 |  |  |  | **143.33 MB ≤ 150 MB** |

响应字节（Vercel 带宽）约 183 MB／月。证据 `~/orbit-sprint-evidence/web/sprint-W0061/run-01/`。

## 假设与额外阅读

- 额外阅读：`features/relationship-timeline/{build,reader}.ts`、`features/contacts/confirmed-contact-predicate.ts`、`features/plans/matching-repository.ts`、`network-insight-copy.ts`、`orbit-language-context.tsx`、`orbit-contacts-route-view-model.ts`、`scripts/verify-session-cookie.ts`。
- 状态不另读关系目标（目标读取链带配额 import）：无洞察行 → 生成中；`blocked_no_goal` → no_goal；ready 缺当前语言文字 → 生成中。
- 首页只为默认露出的 3 条事项取一句话（≤3 id），以守住 150 MB（按 6 id 约 232 MB／月会超）；读失败时事项保持原样，不轮询。
- 候选接口语言走请求头 `x-orbit-lang`（GET）与 body `language`（run），地址不变以保留共享读取 key。
- 窄读压缩：依据小签为字符串（`card`／`entry`／`memo:YYYY-MM-DD`／`need:标题`），空字段省略。
- 浏览器验证临时把本机库 `user_verify_plan`「约 林玫」排序由 2/7 改为 1/-1，截图后已改回。

## review 处理（H 档，Codex gpt-5.6-sol high，只读）

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| P2 详情未复用退化；有关系无下一步不显示 | 采纳 | 详情始终渲染组件，未就绪退化 |
| P2 详情依据只靠最近 20 条时间线与已关联需求 | 部分采纳 | `source = scan` 兜底；旧 memo／未关联候选需求仍可能丢弃（补读违背「详情 0 新增读取」） |
| P2 候选缺 value 不轮询；>20 候选 | 采纳 | 缺值按待补查有界重取（每次 ≤20 id、最多 3 次） |
| P2 首页请求无取消／语言竞态 | 采纳 | AbortController + 按语言落地 |
| P2 候选重取未按语言存；共享 key／批次入口语言 | 部分采纳 | 重取结果按「语言:联系人」存；共享 key 与批次入口未改 |
| P2 SQL 强转 createdAt | 采纳 | SQL 回传原始日期，TS `tokyoDayOf` 解析 |
| P3 string_agg 未排序 | 采纳 | `with ordinality` + `order by` |

## 交接

- 接口：`GET /api/contacts/value-lines?ids=&lang=zh|en[&fields=insight]` → `{ lines: ContactValueLineData[] }`（ids ≤20，本人范围）；`PlanMatchCandidateView.value?: ContactValueInsight`；`evidence-labels.ts` 的 `insightEvidenceLabels`／`resolveInsightEvidenceLabels`；`contact-value.ts` 的 `contactValueLine`／`contactValueWhyNow`／`evidenceFactsFromDetail`；组件 `ContactValueLine`；`TodayPlanAction` 新增 `contactId`、`needTitle`。
- 未改 `shared/contract`，App 不受影响。
- impact：`IOrbitHome`、`PlanMatchSheet`、`reasonLine`、`createPlanCandidateRouteHandlers`、`createPlanMatchingService`、`selectTodayPlanActions`、`todayPlanActionHref`、`NetworkInsightPanel`、`NetworkDetailModal`、`createPostgresContactInsightRepository` 均 CRITICAL（图谱经 AppError 放大）；`fetchPlanMatches`／`runPlanMatchForBatch` UNKNOWN 已文本确认。detect-changes critical（80 个首页流程），全量对照新增失败 0。
- 无需授权项。回退：revert `1789cc32`、`ef58dcd6`。

# Sprint W0061 — 「价值一句话」组件三处复用（M）

> revision 2（2026-10-03）：按 [REVIEW-2026-10-03.md](../REVIEW-2026-10-03.md) 修订（revision 1 SHA256 `66a86a214b09a86db6d09d4d4413f2a9c9afe52ca6deb7707515255aad123c98`）：G-5 新增依据解析器（证据 id → 「名片／memo 日期／计划需求」，只有真实名片扫描才叫「名片」）；G-17「为什么现在」顺序改为 `action.detail` → ready `insight.nextStep` → 不显示，行动须恰好指向一位联系人；G-18 流量给出硬上限，读取器不 import 配额模块。

**Plan revision:** 2。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RC-05（REQUIREMENTS 大目标 5）；D61（价值一句话）、D63。
**单一目标:** 新建共享组件 `ContactValueLine` 与只读数据源，统一输出「TA 能帮你：{goal_relation} · 依据：{名片／memo／计划需求}」（+ 适用时「为什么现在：…」），接入首页今日要事人物事项、导入后关联计划候选卡、详情「为什么是 TA」首行；洞察未就绪时退化为「公司 · 职位 + 匹配需求 + 生成中」，永不空白；全程 0 次模型调用。
**易读目标:** [GOAL.md](GOAL.md)。
**视觉依据:** 原型 <https://claude.ai/artifact/1xi35cdWj5hjv8oPZDbHcV> 画板②「首页今日要事 · 价值一句话」、画板③「导入后关联计划候选卡」、画板①「为什么是 TA」首行。
**基线:** 编制时 `chat-agent` = `a7c96deb`。在 W0060 合并后开工（复用 `contact-value.ts` 的 `contactWhyNow`）。**与 W0056 不并行**（W0056 改首页服务端读取，本 Sprint 改首页客户端与新增读取，流量表要按合并后的首页重算）。
**进入条件:** W0057、W0060 completed（W0058、W0059 也已按顺序完成）；从 W0060 REPORT 取 `contact-value.ts` 导出名与「为什么是 TA」首行的挂载点。付费 AI：0 次（不新增调用，SC 证明）。

## 原型结构（文字版）

- **今日要事人物卡**（画板②）：左 40px 首字母头像；上方小号类别（如「找 TA 引荐」「找 TA 聊一聊」，取计划行动已有的类别／标题语义，没有就不显示）；标题行「{事项标题} <灰字>公司 · 职位</灰字>」；一行「**TA 能帮你：**{goal_relation}」（主色前缀）；计划行动多一行「**为什么现在：**{理由}」；依据小签（「依据 · 名片」「依据 · memo 9/28」「依据 · 计划需求『…』」）；右侧原有主按钮（约 TA／起草邮件／打开联系人）+「详情」。
- **退化卡**（虚线边）：「{姓名} <灰字>公司 · 职位</灰字>」+「可能对应：计划需求『…』 · 同属 {行业}」+ 灰字「『TA 能帮你』生成中，通常 1 分钟内出现」。
- **候选卡**（画板③）：「{姓名} 公司 · 职位」+「TA 能帮你：…」+「对应 {需求 chip} 依据 · {名片职位｜行业规则匹配}」+ 右侧「关联／不相关」；未就绪时「同属 {行业} · 『TA 能帮你』生成中…」。原型里的「全部关联（N）」「稍后再看」**不在本 Sprint 范围**（D61 未包含，登记为候选）。

## 上下文包

### 必读文件
- `app/(app)/app/agent/iorbit-0918/plan-match-sheet.tsx`：:88–94 `reasonLine`（ai →「按公司与职位：{aiReason}」；rule →「同属（二级）行业：X」；无行业时无理由）；:260 使用处；:334 `BatchPlanMatch`（`card-batch-ui.tsx:426` 在批次 `completed` 时渲染）；`PlanMatchSheet`（`iorbit-home.tsx:2008` 弹层）。
- `app/(app)/app/agent/iorbit-0918/plan-match-client.ts:14–26` `PlanMatchCandidate`（`needTitle`／`strength`／`tier`／`industry`／`aiReason`）；服务端 `features/plans/matching-service.ts:20–33` `PlanMatchCandidateView`（多 `contactSubtitle`「公司 · 职位」）；路由 `app/api/agent/plans/candidates/route-handlers.ts` 与 `candidates/run/route.ts`。
- `app/(app)/app/agent/iorbit-0918/iorbit-home.tsx`：:189–205 `TodayItem`（`why`／`proof`／`pills`／`primary`）；:764 `soon`、:788 `fromSignals`、:810 `fromCards`、:861 `fromMatches`（汇总项，打开候选弹层）、:887 `fromFollowups`、:913 `fromPlan`（`selectTodayPlanActions`，`why: action.detail`）；:1506 `lead.why` 渲染。
- `app/(app)/app/agent/iorbit-0918/today-plan-items.ts`：:67–78 `todayPlanActionHref`（联系人优先）、:80–87 `TodayPlanAction`（`detail`、`phase`、`weeksOverdue`）。
- `app/(app)/app/agent/iorbit-0918/iorbit-today-events.tsx:36` `formatHomeEventReason`（活动推荐理由的既有写法，风格参照，不改）。
- 洞察只读：`features/contacts/insights/read.ts`（`readContactInsightRows`、`readContactInsightPreviewTexts`（中英各 61 字窄读）、`readContactInsightNextSteps`）、`view.ts`、`shared/contract/contact-insight.ts`（`evidence: {source,id}[]`）。
- W0060 的 `app/(app)/app/contacts/network-0918/contact-value.ts`（`contactWhyNow` 等）与「为什么是 TA」首行挂载点。
- 测试夹具：`tests/pages/app-agent-iorbit-home.test.tsx` 的 `mountHome`；plan-match-sheet 组件测试（`grep -rl PlanMatchSheet tests`）；`tests/api/agent-plan-candidates-routes.test.ts`。

### 关键符号
- `IOrbitHome`（CRITICAL，W0037／W0038 记录）——本 Sprint 只在人物事项上加一行组件与一次批量读取，按 H 的谨慎做 impact 报告；若 impact 仍为 CRITICAL，**档位升 H**（全量对照 + Codex 代码 review）。
- `reasonLine`、`PlanMatchSheet`、`BatchPlanMatch`、`PlanMatchCandidateView`、`createPlanCandidates*Handler`（名以实际为准）。

### 易错边界（都对应到 SC）
1. **0 次模型调用（D61）：**组件与数据源只读 `contact_insights`、联系人、计划；不得 import 生成器、配额、`after` 触发；读取不标 dirty（SC-04 架构测试 + provider 桩计数 0）。
2. **一句话格式唯一：**`TA 能帮你：{goal_relation[lang]}` + `依据：` 若干小签。**rev 2 G-5：**洞察 `evidence` 只有 `{source,id}`，不足以写出文案；新增批量**依据解析器** `resolveInsightEvidenceLabels({ actorId, items })`（本人范围、一次查询批量）：`capture` 来源只有联系人的采集方式是名片扫描（`sourceType = business_card_ocr`）才显示「名片」，否则「录入」；memo 解析到 `contact_detail_states.notes` 条目取东京日期显示「memo {月/日}」；计划条目解析标题显示「计划需求『{标题}』」；解析不到的证据丢弃，全部丢弃则不显示「依据」。三处调用同一组件同一纯函数，测试用同一夹具断言三处文本一致（SC-01）。
3. **退化永不空白：**洞察非 ready（none／pending／failed／no_goal）时输出「{公司 · 职位}」+（有匹配需求时）「可能对应：计划需求『…』」+（有行业规则时）「同属 {行业}」+ 状态尾巴：pending/none →「生成中」；failed →「暂时没生成出来」；no_goal →「设置关系目标后生成」（链到目标编辑）。公司职位都空时用姓名占位，绝不渲染空行（SC-02）。
4. **「为什么现在」取值顺序（rev 2 G-17，按 D61 原文）：**只用于**恰好指向一位联系人**的计划行动（`linkedContactIds` 只有一人，或无关联但 `meta.contactId` 为一人；关联 0 人或多人的行动不猜、不显示组件）：①计划条目自身理由 `TodayPlanAction.detail`（前缀阶段名 `phase`）；②没有则 ready 洞察的 `nextStep`；③都没有不显示。与 W0060 `contactWhyNow` 同一函数。跟进、信号等其他事项保持原有 `why`，不加此行（SC-03）。
5. **数据路径与流量：**
   - 详情：服务端已读洞察（W0057／W0060），直接喂组件，0 次新增读取。
   - 候选卡：候选接口（`candidates` 与 `candidates/run`）在服务端为本次返回的 ≤N 位联系人批量读一次洞察窄列（`goal_relation`、`evidence`、`status`），给每个候选加**可选**字段 `value`；不改现有字段语义（App 若用此接口只多一个可选字段）。
   - 首页：今日要事算出后，对指向单一联系人的事项（≤3 条，最多 6 个 id）发**一次**批量只读请求 `GET /api/contacts/value-lines?ids=`（新建，本人范围，ids ≤20，他人 id 静默丢弃），示例模式 0 次请求（示例数据静态给值）。
   - 候选卡里仍有「生成中」时，最多每 10 秒重取一次 `value-lines`、最多 3 次；首页不轮询（下次打开即更新）。
   - 新增读取按 D39 口径实测单次字节并折算月流量，写进 REPORT 预算表；**硬上限（rev 2 G-18）**：`value-lines` 单次响应与数据库读取各 ≤4 KB（6 个 id），候选接口每次增量 ≤4 KB（20 个候选）；测量模型 1000 活跃用户 × 30 天 ×（首页 3 次／天 + 候选 0.3 次／天，含最多 3 次重取），合计月增量 ≤150 MB，超出则 SC-05 fail 并登记 D32 周检（SC-05）。
   - 新读取器直接用 `createPostgresContactInsightRepository`，**不经过** `features/contacts/insights/read.ts`（它静态 import 了配额常量）。
6. **既有理由保留为依据：**候选卡原 `reasonLine`（按公司与职位：{aiReason}／同属行业）改为依据小签（「依据 · 名片职位」=ai 层、「依据 · 行业规则匹配」=rule 层），不丢信息（SC-01）。
7. **越权：**`value-lines` 与候选接口只返回本人联系人；他人 id → 不返回（SC-04）。
8. **语言：**按界面语言取 `{zh,en}`；推测类字段不进这句话（只用洞察）。

## 范围与文件

- 新建：`features/contacts/insights/evidence-labels.ts`（依据解析器，rev 2）；`app/(app)/app/contacts/network-0918/contact-value-line.tsx`（组件）；`contact-value.ts` 内加纯函数 `contactValueLine(...)`（在 W0060 文件上扩展）；`features/contacts/insights/value-lines.ts`（服务端批量窄读）；`app/api/contacts/value-lines/route.ts`（GET）；对应测试。
- 修改：`plan-match-sheet.tsx`（候选卡用组件，`reasonLine` 改依据签）、`plan-match-client.ts`（可选 `value` 字段）、`features/plans/matching-service.ts` 与候选路由（附带 `value`）、`iorbit-home.tsx`（人物事项挂组件 + 一次批量请求）、`today-plan-items.ts`（必要时暴露需求 id）、`network-detail-modal.tsx`（「为什么是 TA」首行换组件）、示例首页数据（静态 `value`）、测试。
- 排除：「全部关联」「稍后再看」按钮；新的 AI 调用；列表卡片洞察一句（W0051 已有，不改）；App 端；首页服务端读取（W0056 范围）。
- 契约：若候选 DTO 定义在 `shared/contract`／`shared/api-schema`，只加可选字段，并按 D46① 同一提交执行 `npm run sync:contract`、跑 App 四个 *-sync 测试。

## 验收契约

| SC | 操作链（可观察行为） | 主证据 |
| --- | --- | --- |
| SC-W0061-01 | **三处同一句（含依据解析：名片扫描联系人显示「名片」、手工录入显示「录入」、memo 显示日期）。**同一位 ready 洞察联系人：首页人物卡、候选卡、详情首行渲染的「TA 能帮你：…」与「依据：…」文本完全一致（中英各一次）；候选卡原理由变为依据签 | 组件单测 + 三处页面测试共享夹具 |
| SC-W0061-02 | **退化不空白。**none／pending／failed／no_goal 四种状态与「公司职位皆空」夹具：各输出约定的退化文本，无空行；候选卡 pending 时最多重取 3 次，ready 后替换 | 纯函数表驱动测试 + 组件测试（假定时器） |
| SC-W0061-03 | **为什么现在。**计划行动（带联系人、关联需求缺口 2）显示「为什么现在：计划第 N 阶段『…』还差 2 个」；无计划依据但洞察 ready 时显示 nextStep；都没有不显示；跟进事项不显示此行 | `contact-value` 单测 + `app-agent-iorbit-home.test.tsx`（`mountHome`） |
| SC-W0061-04 | **0 次调用与越权。**三处渲染与两条读取接口：生成器桩、配额桩计数 0，`contact_insights` 无写入；`value-lines` 传入他人 id 不返回；示例首页 0 次请求 | 路由测试 + 架构测试（不 import 生成器／配额）+ 示例测试 |
| SC-W0061-05 | **流量与真实页面。**按 D39 口径实测 `value-lines` 单次与候选接口增量字节（各 ≤4 KB）、折算月增量 ≤150 MB 写进预算表；三处 1440／375 截图对照原型，控制台无错误 | 测量脚本输出 + REPORT 预算表 + 截图（证据目录） |

## 一次 Generator 的执行顺序

1. 登记 run-01、Planner SHA256、基线；从 W0060 REPORT 取 `contact-value.ts` 名字。
2. impact：`IOrbitHome`（CRITICAL 则升 H 并报告）、`PlanMatchSheet`、`BatchPlanMatch`、候选路由与服务。
3. 纯函数（SC-01～03）→ 服务端窄读与接口（SC-04）→ 三处接线 → 测量与浏览器（SC-05）。
4. 路径限定提交 `sprint/W0061-contact-value-line` → REPORT → 协调者合并。

## 最小测试与检查

- **档位：用户分档 M**，执行按 RULES 的 L（定向 + 收口集 + typecheck + 浏览器）；**`IOrbitHome` impact 为 CRITICAL 时升 H**：加一次全量基线对照与一次 Codex 代码 review。
- 收口集：`tests/pages/app-agent-iorbit-home.test.tsx`、plan-match-sheet 组件测试、`tests/api/agent-plan-candidates-routes.test.ts`、`app-network-detail-modal.test.tsx`、`app-network-demo-mode.test.tsx`、首页示例测试、新增 `value-lines` 路由测试；`npx tsc --noEmit -p .`。
- 本 Sprint 是大目标 5 的最后一个：合并后由协调者在合并树跑一次全量对照（RULES 1.1「一个大目标全部合并后再跑一次」），结果记在 README 运行记录。

## 付费 AI 调用上限

0（SC-04 证明）。

## 回滚

revert 本 Sprint 提交；新接口无状态、无迁移。

## 风险

- 首页多一次批量请求：只在有人物事项时发，ids ≤6；流量写进预算表，超 D39 总账按 D32 周检登记。
- 候选卡出现时洞察多半还在生成（批次刚确认）：退化文本 + 有限重取保证不空白；体验依赖 W0057 的 ≤60 秒。

## Planner 定（对标）

| 编号 | 结论 | 对标做法 |
| --- | --- | --- |
| W61-1 | 一句话只读已生成洞察，未就绪退化为事实信息 + 「生成中」 | LinkedIn「Why you're seeing this」只展示已有信号；HubSpot 记录摘要未生成时显示基础字段 |
| W61-2 | 「为什么现在」只给计划行动，理由先取计划自身 | Salesforce Einstein Next Best Action：理由来自触发它的业务规则 |
| W61-3 | 首页一次批量请求、候选卡最多重取 3 次 | 有界轮询，避免空转读库（W0017 流量守则） |
| W61-4 | 「全部关联」「稍后再看」不做，登记候选 | D61 未包含；批量确认是另一项产品取舍 |

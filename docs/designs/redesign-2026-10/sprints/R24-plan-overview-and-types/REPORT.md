# Sprint R24 — REPORT（计划 v2.2：概要、人物类型与记录加分）

**执行人：** 小雨（甲）的执行会话，2026-10-10 ～ 11。**分支：** 直接在 `redesign` 上提交。
**依据：** [PLANNER](PLANNER.md)、[UI-SPEC](UI-SPEC.md)、[plan-v2.2/DESIGN.md](../plan-v2.2/DESIGN.md)。
**证据目录：** `~/orbit-sprint-evidence/redesign/R24/run-01/`。
**没有做的事：** 没连 Neon、没部署、没做生产迁移（本 Sprint 没有新迁移）；付费 AI 只在本机按授权调用，每项 ≤5 次。

## 做了什么

1. **契约**（`b16f3be7`，App 副本同提交）：`PlanV2Detail` 可选字段、`PlanPersonTypeDetail`、候补决定、线下聊过、面谈提案、依頼文、待确认、`PlanContactFit`；契约 8（活动评分）改成设计稿口径 fit / confidence / timeCost / connections / format = 45 / 15 / 20 / 10 / 10（BREAKING 登记）。
2. **服务端**（`ab410098`）：概要扩展与人物タイプ詳細；匹配管线读需求与入队不再限 v1、排除已跳过的类型，`decide` / `linkManually` 按计划版本分流（v2 只关联、不生成行动）；线下聊过（「この人ですか？」）；面谈提案与依頼文（只出草稿）；待确认（Step 完成确认、memo 计分、候补）；`contacts/[id]/fit`；`shared/compute/event-score.ts`（设计稿两例 82 / 61 与见到 1 人后 82 → 76 作为固定用例，App 同步副本）；C11 面谈メモ判定并入 memo 提取（只在 memo 带「プランの話せた に使う」时加 3 问，不加调用次数；关闸 / 失败出手动勾选卡）；C12 匹配提示词；活动参加给每个有イベント枠的生效目标加分；关系时间线 / 强度 / 近期记录 / 信号都排除被 `score_reversed` 对冲的计分。
3. **Web**（`orbit-2026/plan/PlanOverview.tsx`、`PlanTypeDetailScreen.tsx`、`PlanTypeDialogs.tsx`、`overview-model.ts`、`plan-v2-actions.ts`、`overview.module.css`；新页 `/app/plans/[planId]/types/[itemId]`）：概要（分数、构成条四种段、方案卡、按钮组、今日のチャンス、確認待ち、Step、类型卡三格、イベント块、底注；1440 三栏 / 1024 / 390 横滑）、人物タイプ詳細（候补 / 人脈にいない / スキップ済み 三种去向、候补多选底栏、话过的人、记录弹层、跳过确认、面談提案、依頼文、活动内訳）。`loadPlanSlot` 有生效 v2 → 概要；R23 的 `PlanConfirmedCard` 删除。
4. **App**（`src/screens/plan/PlanOverview.tsx`、`PlanTypeScreen.tsx`、`PlanRecordSheet.tsx`、`PlanProposalSheet.tsx`、`plan-overview-ui.tsx`、`plan-overview-model.ts`、`usePlanAwardToast.ts`；新路由 `app/plans/[planId]/types/[itemId].tsx`）：同样的画面；`PlanSegment` 有生效计划时显示概要，R23 已確定卡只在概要接口「尚未実装」时兜底；`app/contacts/matches.tsx` 改为 `Redirect` 到 `/task?seg=plan`（旧屏文件留给 R25 删）。
5. **路由登记**：Web transport 审计样本 + 计数 59 → 60（未登录跳登录 29 → 30）、`audit:full-product` 与 `audit:surfaces` 重新生成；App 路径参数、路由覆盖测试、离线清单（类型页 online-only，matches 改为 device-only 跳转）、`route-domain-inventory.ts` 补登记 R24 接口（审计复查 0 未登记）。

## SC 对照

| SC | 结论 | 证据 |
| --- | --- | --- |
| 01 概要 | ✅ | `plan-overview.test.ts`；Web `plan-overview-screens`（18 条）、App `plan-overview-screens` + `plan-overview-model`（21 条）：字段、分数 = summary、四种段、「減らす動き」、1024 最近の加点、390 横滑、打开页面零写请求；R25 前的見直し / 手動編集 / 達成按钮显示「まもなく」；截图 `overview*` |
| 02 三种去向 | ✅ | 两端渲染测试（三种状态、候补 ✓ 只发一条决定请求、不生成行动、提案只出草稿、依頼文没有发送按钮）；截图 `type-*`、`proposal-draft`、`intro-draft` |
| 03 记录与加分 | ✅ | 服务测试 + 两端端到端（类型页 → 记录 +10 → 撤销 → 跳过 → 撤回 → 概要分数回到原值并与 `/v2/summary` 对数）；匿名超额说明；截图 `record-*`、`skip-confirm` |
| 04 分数一致 | ✅ | 两端渲染测试直接调 orbits 的 v2 路由处理函数（mock），概要显示值 = `/v2/summary` |
| 05 memo 判定 | ✅ | `memo-coverage.test.ts`；两端手动勾选卡至少 2 问才能确认 |
| 06 活动分 | ✅ | `event-score.test.ts`（82 / 61 / 76）、活动参加加分测试；截图 `event-breakdown`（含「推定」） |
| 07 接口给别人 | ✅ | `contacts/[id]/fit`、`pending` 路由测试；App matches 跳转后返回人脈 |
| 08 AI 规矩 | ✅ | C11 / C12 提示词版本 +1，mock 先行；本机真实调用见下表 |

## 自定决定

| # | 事项 | 决定 | 理由 / 对标 |
| --- | --- | --- | --- |
| 1 | 面谈提案 / 依頼文 | 只出草稿：复制、用邮件 App 打开；没有任何「送信」按钮；`mailto:` 不带收件人（契约没有对方邮箱） | 邮件与消息只到草稿（产品定稿）；对标 Superhuman / Gmail「草稿交给用户发」 |
| 2 | 今日のチャンス的开场白 | 不存库、不加迁移，按需生成 | 本 Sprint 不新增迁移 |
| 3 | 活动事实 | 多数会是「推定」（报名人数、交流时间等缺失时按规则给推定分并标出） | 宁可标推定，也不编事实 |
| 4 | 跳过确认 | 居中对话框（UI-SPEC 写底部确认，按 b4 设计稿），默认焦点在主按钮 | 非破坏性、可撤回 |
| 5 | 写后读 | 两端每次写完重新读详情，不在前端改数 | 服务端是唯一真相；对标 Linear / Notion |
| 6 | Web 三种版式 | JS 断点（≥1280 / 768–1279 / <768）只渲染一套 DOM；右栏放在页内（壳的 rightRail 拿不到页面 Toast 与语言） | 对标 Linear 项目页的页内侧栏 |
| 7 | Web 记录弹层宽 420（设计稿 380） | 组件库 Modal 最小 420 | 不为一处破组件库 |
| 8 | App 复制 | 用系统分享面板（含「复制」），不加剪贴板原生依赖 | 加原生依赖要 pod install；与现有屏幕一致 |
| 9 | App 面谈时段选择 | 默认接下来 3 个工作日 10:00 / 16:00 / 9:30，按天 / 30 分调，7:00–22:00 | 项目里没有原生日期选择组件 |
| 10 | 依頼文的语气 chip（丁寧に / 短く） | 不做 | 契约没有改写参数，要 AI 改写属于服务端新增调用 |
| 11 | 示例计划（`sample: true`） | 前端不拦写操作，只显示「サンプル」标签 | 目前只在开发 mock 出现，写进内存；做引导示例模式时再补（交接 R28） |
| 12 | App 渲染测试直接 import `../orbits` 的处理函数 | 采用 | 能证明两端分数一致；先例 `contract-fixtures-parse` |
| 13 | R25 契约提前提交 | `fcddbc31` 在 R24 界面提交之前 | R25 服务端与 R24 界面并行；契约只加不改 |
| 14 | 日志正文为空的修复 | R24 已提交代码里 3 处 `plan_log.body` 为空（待确认卡接受 / 忽略、memo 计分提议）会被 Postgres 约束拒绝——R25 真实调用时发现，修复随 R25 服务端提交；内存仓储同时加了同样的检查 | 测试里就能发现同类问题 |

## 付费 AI 调用记录（本机，deepseek-v4-flash）

价格：未命中输入 $0.374 / 百万 token，输出 $1.122 / 百万 token。

| 项 | 真实 HTTP 次数 | 输入 / 输出 token | 成本 | 结果 |
| --- | --- | --- | --- | --- |
| C11 面谈メモ判定（并入 memo 提取） | 2 | 736 / 149 | 约 $0.0004 | 两条 memo：一条答到 3 问、一条只答到 1 问（与内容相符）；账本 2 条 `memo_extraction` succeeded |
| C12 匹配 | 1 | 439 / 124 | 约 $0.0003 | 2 条提案，理由与需求对得上；匹配脚本直接调提供方，**没进账本**（交接：上线前确认 C12 走账本） |
| **合计** | **3** | **1,175 / 273** | **约 $0.0007** | |

记录：`real-ai.json`。

## 基线 → 收口

| | 基线（R23 复核修完，`3b8f0d20`） | 收口 |
| --- | --- | --- |
| orbits `npm test` | 7104 条，0 失败（R23 收口修后） | 7176 条，2 失败 → 都已修：产品面审计的两条（`mock imports distinguish…`、`manifest generation…`）——重新生成清单后发现 R23 复核修复的 `flow-context.ts` 与 R24 的 `event-facts.ts` 直接 import `shared/mock/demo-world`（之前提交时没重新生成清单所以没暴露）。修法：把 mock 实现搬进 `mock-flow-context.ts` / `mock-event-facts.ts`，原模块转导出（行为不变，impact 因 factory 链路为 CRITICAL，纯搬家）；另有新页面 `RecordModal` 的 `onSubmit` 属性被扫描器当成无名点击（同 R23 #18），改名 `saveRecord`。修后审计 + 界面 + transport 4 个文件 174 / 0 |
| App `npm test` | 4226 条，1 失败（`route-parity` 的 `/start`，已知） | 4252 条，2 失败：`route-parity` 的 `/start`（已知）；`shared compute copy byte for byte`——工作区里 R25 服务端改了 `plan-href.ts` 还没同步到 App（随 R25 提交同步，R24 提交里的 `plan-href.ts` 未改，不受影响） |
| orbits `typecheck` / `typecheck:app` / `lint` | 0 / 0 / 0 | 0 / 0 / 0 |
| App `tsc` | 0 | 0 |
| `copy:qa` | 1003 条 0 问题 | 1366 条 0 问题 |

日志：`~/orbit-sprint-evidence/redesign/R24/run-01/final-*.log`。

## GitNexus

- 开工 impact（`impact-start.md`）：`createDeepseekMemoExtractionProvider`、`enqueuePlanSourceMatchAfterSave` **CRITICAL** → 只加分支、原路径测试全过；`decideMatchCandidate`、`linkManually`、`readActiveNeeds`、`markEventAttended` 多候选 UNKNOWN / CRITICAL → 用文本搜索确认调用点，按计划版本分流，v1 路径不变；`ContactNeedsMatchesScreen` UNKNOWN → 文本确认只被 `app/contacts/matches.tsx` 挂载。
- 界面：`loadPlanSlot` LOW、`planApi` MEDIUM（只加 DELETE）、`PlanConfirmedCard` LOW（已删）、App `PlanSegment` / `createPlanApi` / `pathParamKeysForMobileRoute` LOW。

## 截图对照

`~/orbit-sprint-evidence/redesign/R24/run-01/compare.html`：每个画面一组，设计稿（b8 / b10 ⑦⑧ / b4 A1–A2）在上，实现在下；Web 66 张（1440 / 1024 / 390 × 浅 / 深），App 22 张（浅 / 深）。截图来自两端渲染测试框架（mock 数据、虚构人物；Web 截页面主体，不含左栏，1440 内容区比真实页面宽约 212px；App 用 react-native-web）。**没有用模拟器或真机**。

## 已知例外 / 交接

- **候补撤销后不回到候补表**：记录一位候补后再撤销，他仍和这个类型关联。端到端测试按此写；若产品要他回到候补表，需要改服务端（交给 R25 复核时判断）。
- mock 演示数据里没有紹介ルート，「紹介ルート」与依頼文的测试 / 截图用测试里补的数据。
- App 今日のチャンス卡没有「面談を提案」按钮（整卡进类型页）；「全文」一直显示。
- 真机 / 模拟器走查（BottomSheet、横滑、Toast 撤销时序、触感）需要人工。
- C12 真实调用没有进账本（见上表），上线前确认。
- **给 R25**：概要上「まもなく」的見直し / 手動編集 / 達成按钮接线；删 App `ContactNeedsMatchesScreen` 与 matches 跳转、旧链接换新。

## 复核修复（REVIEW 处理记录）

复核结论**不通过**（S 1、M 7、m 12）。处理：

| 条 | 处理 | 提交 |
| --- | --- | --- |
| S1 `plan_log.body` 空串 | 三处改成可读模板（随 R25 服务端 `0f7e1ef1`），内存仓储同样检查；补 Postgres 测试（memo 提议 → pending → 确认 / 不采用 → Step 建议「まだ」）；`job.ts` 吞错改结构化日志 | `0f7e1ef1`、`efb2f858` |
| M1 memo 卡确认不原子 | 「查是否已决定 → 计分 → 写决定」同一事务（`scoreIn` 共用）；已决定换键 409 `PENDING_DECIDED`（对标 Stripe 状态冲突）；内存 + Postgres 测试 | `efb2f858` |
| M2 线下新建联系人不幂等 | 占位 → 建联系人 → 回填计分（同 R23 M4）；同键重放 / 并发只建 1 人；失败 503 `CONTACT_CREATE_FAILED`，不再静默匿名；两端界面问「名前なしで記録しますか？」 | `efb2f858`、Web `6b1a9492`、App（本提交） |
| M3 live 全表读活动 | R26 前 `livePlanEventFacts` 返回空、不读库（`PLAN_LIVE_EVENT_FACTS_READY = false`）；给 R26 留有界读取（未来 60 天、≤20 场） | `efb2f858` |
| M4 参加计分只接名片一路 | v1 / v2 各自 try；对账任务补 v2（每东京日一轮，≤50 组）；本人签到接上（`onSelfCheckedIn`）。**工作人员代签没接**（参加者 → actor 映射不明），交 R26 / R27 | `efb2f858` |
| M5 C12 | 别名 C1… / N1… 不出境、未知别名丢弃；提示词版本进账本 `ai_usage.promptVersion`（`plan-match-2026-10-v3`、`memo-plan-coverage-2026-10-v1`）。**`opener` 不做**，候补「切り出し方」仍用类型级（交后续） | `efb2f858` |
| M6 提示与实际不符 | Web 撤销只在全部成功时提示、写入中提示「処理中です」；App memo 卡没加分显示「加点はありません · 理由」（改掉错误断言）；App 多人记录部分失败保留弹层并只补记失败的人 | Web `6b1a9492`、App（本提交） |
| M7 证据缺口 | Postgres 回归：R24 新接口他人隔离（11 个入口）、「撤销不算互动」对关系强度 / stamp / 信号 / 近期记录各一条；全量带本机库跑（见 R25 REPORT 收口） | `efb2f858` |
| m1 | `planCoverageHooksOrSkip`：计划部分出错只跳过并记日志，不影响 memo 提取；**live 触发点待 R20**（保存 memo 不带 `usedForPlan`） | `efb2f858` |
| m2 | 例 2 按设计稿原文事实代入，逐项断言 31 / 10 / 6 / 6 / 3 = 56；注明「分项按本实现子公式，与设计稿示意数字不同」。上文「设计稿两例 82 / 61」改读为：例 1 = 82（固定用例）、例 2 = 56 | `efb2f858` |
| m3 / m9 | 契约只加可选：`PlanPendingItem.href / points`（服务端 `nextAward` 算）、`PlanContactFit.fits[].recommendScore / reason`；两端「+X」只读服务端 | `efb2f858` + 两端 |
| m4 | 两端 `points` 为 0 不画 chip | 两端 |
| m5 | 依頼文不放 AI 的 `why`，改固定句（三语） | `efb2f858` |
| m6 | `proposeMemoCoverage` 只接受候补（未驳回）或已关联的人 | `efb2f858` |
| m7 | 候补每行加「すでに話した」（两端）；Web 工具栏默认线下模式 | 两端 |
| m8 | Web 1024 Step 分组补全；三版式「完了を取り消す」一致（390 可撤回） | `6b1a9492` |
| m10 | 减少动效下浮标淡入再淡出 | `6b1a9492` |
| m11 | 两端双击防护、已跳过不可提交、App 底部栏读安全区、提案 `kind:"request"` 文案、Web「達成にする」、删未用文案键；**示例计划不拦写**仍交 R28 | 两端 |
| m12 | 本节即更正：SC-05 的 Postgres 证据补齐后成立（live 触发点待 R20）；参加计分调用点见 M4；全量 skip 数见 R25 收口 | — |

**SC-05 更正：** 原 ✅ 不成立（S1）；修复后 ✅（Postgres 测试 `plans-v2-r24-review-postgres`），live 端到端触发待 R20。

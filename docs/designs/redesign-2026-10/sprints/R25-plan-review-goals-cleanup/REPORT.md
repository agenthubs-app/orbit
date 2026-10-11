# Sprint R25 — REPORT（计划 v2.2：見直し、达成、多目标与旧屏清理）

**执行人：** 小雨（甲）的执行会话，2026-10-10 ～ 11。**分支：** 直接在 `redesign` 上提交。
**依据：** [PLANNER](PLANNER.md)、[UI-SPEC](UI-SPEC.md)、[plan-v2.2/DESIGN.md](../plan-v2.2/DESIGN.md)。
**证据目录：** `~/orbit-sprint-evidence/redesign/R25/run-01/`。
**没有做的事：** 没连 Neon、没部署、没做生产迁移（本 Sprint 没有新迁移）；付费 AI 只在本机（`postgres://localhost/orbit_r23_ai`）按授权调用，每项 ≤5 次。

## 做了什么

1. **契约**（`fcddbc31`，App 副本同提交）：`PlanReviewView`、`PlanQuotaResponse`、`PlanAchievementView`、`PlanNextGoalsResponse`、`PlanGoalEditRequest / Result`、`PlanLegacy*`；`PlanDraftChange` 加可选 `id` / `accepted`（只加不改）。因为与 R24 界面并行，这次契约比 R24 界面提交早。
2. **服务端**（`0f7e1ef1`）：
   - `flow-service.ts`：
     - 見直し：开始不扣次数，同一计划续用进行中的草稿；C8 前提预标每东京日最多一次，失败缓存为空、busy 不缓存。
     - 送出 C9：月 3 次，全部目标共用，`review:<YYYY-MM>:<n>` 唯一键；失败不扣，不改也扣。
     - 逐条 ✓ / ✕：服务端重组方案，合计保持 100，已得分与跳过类型不动。
     - 确定：校验 `base_revision`；确定后可以手动编辑。
     - 达成：分数定格，不再占名额。
     - C10 下一目标：每份计划一次，有缓存；失败时只剩「自分で決める」。
     - 改目标：「只保存」或「保存并重做方案」，后者开一份見直し草稿，送出时才扣次数。
   - `service.ts`：完成页（`bestMove` 按规则选，不调 AI）、以前のプラン列表与详情（只读）。
   - `v1-retired.ts`：v1 的三个创建接口（`POST /api/agent/plans`、`bootstrap`、`reanalyze`）一律返回 409 `PLAN_V1_RETIRED`，`context.href` 指向 v2 目標入力。
   - `planNewGoalHref`；13 个新路由。
3. **Web 界面**（`6b1a9492`）：
   - 概要按钮接线、見直し入口弹层与見直し页、达成确认 → 完成页 → 次の目標、目标下拉与编辑三出口、`new=1`。
   - 以前のプラン卡与只读详情页。
   - 旧引导「开始分析」直接进 v2 目標入力。
   - 新页 3 个：`/app/plans/[planId]/review`、`/done`、`/app/plans/legacy/[planId]`。
4. **App 界面**（本提交）：同样的画面；新路由 `app/plans/[planId]/{review,done}.tsx`、`app/plans/legacy/[planId].tsx`。
5. **清理**（本提交）：
   - Web 删除：`/app/agent/plan/**`、`/app/agent/strategy/**`，以及 `iorbit-0918` 里 11 个计划专用文件。`plan-slot.tsx` 搬到 `app/(app)/app/tasks/`。
   - App 删除：`contacts/matches`、`contacts/intros` 两个屏及其组件、视图模型、hook。
   - 服务端删除：`/api/contacts/needs-matches`、`features/contact-needs/**`、`/api/contacts/intros/summary`、`contact-intros-summary-reader`；契约与 api-schema 各 2 份（BREAKING 新增 27 行），App 副本同步删除。
   - v1 的 bootstrap / reanalyze 处理函数已删（接口保留，一律 409）。
   - 全产品旧链接换成新地址；新增 `no-legacy-plan-links` 测试。
6. **R24 复核修复**也在这几次提交里：服务端 `efb2f858`，Web `6b1a9492`，App 在本提交。逐条见 [R24 REPORT](../R24-plan-overview-and-types/REPORT.md#复核修复review-处理记录)。

## SC 对照

| SC | 结论 | 证据 |
| --- | --- | --- |
| 01 見直し | ✅ | 服务测试 `review.test.ts`：打开不扣、送出扣、失败不扣、不改也扣、两个目标合计 3 次、东京月初恢复、并发只扣到上限、已得分不变、跳过类型不改、✕ 后合计 100、`base_revision` 409、见直后手动编辑重新可用、预标每天一次。路由测试 `plan-review-routes`。两端 `plan-review-screens`（Web 25、App 15）都含 mock 端到端：概要 → 見直し → 送出 → ✕ → 确定 → 概要更新。截图 `review*` |
| 02 用完 | ✅ | 两端测试：用完状态没有付费入口；`REVIEW_LIMIT` 返回 409 与 `retryOn`。截图 `review-used-up` |
| 03 達成 | ✅ | `goals-r25`（achievement ×2：分数定格、不占名额、完成页数字、C10 缓存与失败）、两端端到端（达成 → 完成 → 新 intake）。截图 `achieve-confirm`、`done*` |
| 04 多目标与编辑 | ✅ | `goals-r25`：multi goal（切换后 summary.current 跟着变、第 3 个被拒且不出付费墙）、goal edit（只保存不动配点、重做方案开草稿不扣次数）。两端：下拉、添加、编辑三出口。截图 `goal-*` |
| 05 以前のプラン | ✅ | `goals-r25` legacy（只读、确定 v2 后仍可读、不会转成 v2）。两端：卡片与详情页只读。截图 `legacy-*` |
| 06 旧屏与旧接口已删 | ✅ | 删除清单见下；`screen-ownership.md` 对应 3 行已改为「已处理」；允许清单只减不增；审计重新生成 |
| 07 旧链接为零 | ✅ | `no-legacy-plan-links` 通过；本机点击记录见「点击验证」 |
| 08 AI 规矩 | ✅（C9 v4 未验证） | 先用 mock；C8–C10 本机真实调用见下表 |
| 09 v1 创建入口已关 | ✅ | `plan-review-routes`（三个入口返回 409 与 v2 地址、路由接线）；旧引导测试 `app-start-guide`（直接进 v2，不调任何计划接口） |

## 自定决定

| # | 事项 | 决定 | 理由 / 对标 |
| --- | --- | --- | --- |
| 1 | 見直し逻辑放在哪 | 放进 `flow-service.ts`，和 R23 草稿服务共用 | `kind: review` 复用 fix / manual-edit / confirm 的事务与回执 |
| 2 | 逐条 ✓ / ✕ | 单独的 `changes/[changeId]/toggle` 路由，不和 `/fix` 共用 | 一个接口只做一件事；✓ / ✕ 不扣次数 |
| 3 | 「いちばん効いたこと」 | 按规则选：得分最高、未跳过、不是イベント的类型，附最多 3 条记录作依据；不调 AI | 完成页不该再花一次 AI；数据里本来就有 |
| 4 | v1 处理函数 | 创建入口路由直接导出 `planV1RetiredPost`；bootstrap / reanalyze 的处理函数在清理时删掉 | 接口还在、行为固定为 409，比 404 更能引导旧客户端 |
| 5 | 見直し草稿的手动编辑 | 保存即确定（同 R23） | 少一个半成品状态 |
| 6 | 跟进 / 日程类旧链接的落点 | 计划类 → `/app/tasks?tab=plan`；日程类 → `?tab=calendar`；跟进、提醒、任务类 → `/app/tasks`（To-do） | PLANNER 写「落到 Task › プラン」，但这些链接原来只是借用了计划页；按语义落到对应分段，对标 Linear / Todoist 的深链 |
| 7 | 示例引导期的プラン段 | 去掉引用旧 `IOrbitPlan` 的示例分支，示例期的人看到的和普通用户一样（v2 状态） | 旧示例依赖被删的 v1 组件；v2 的 mock 本身就是示例世界 |
| 8 | 字典里不再使用的 key（App `contacts.need*` 等，每种语言 84 个） | 保留 | `i18n-domain-split` 用哈希固定了拆分前的字典，删 key 等于放松这道门；留给字典整理 |
| 9 | iOrbit 首页（R21 的文件）不再读 v1 计划 | 本周行动、计划匹配、周一小结、计划点名补查都去掉，「本周推进」只剩账本进度 | v1 组件已删；R21 重写时接 v2 |
| 10 | 通知发现预筛的需求关键词表 | 从被删的 `features/contact-needs` 搬到 `features/notifications/discovery/need-criteria.ts`，原有断言一起搬过去 | 那是唯一一个已登记的外部调用方，不能跟着删 |
| 11 | 只做手动编辑的草稿 | `reviews/current` 不返回它 | 界面分辨不出来，送出会得到 `DRAFT_CLOSED` |
| 12 | 入口弹层的「这次参考的数据」 | 用概要里的 `sinceConfirmed`（服务端新加的可选字段） | 打开弹层时不该为了几个数字去开一份見直し |
| 13 | 修正卡上的轮次 | 写「（n 回目）」，按这份草稿的第几轮编号 | 月计数跨月时不准；配额另有显示 |
| 14 | `kind:"request"` 的提案文案 | 「依頼を届けました」，不说「送信」 | copy-qa 禁止 Orbit 自称「送信」 |

## 付费 AI 调用记录（本机，deepseek-v4-flash）

价格：未命中输入 $0.374 / 百万 token，输出 $1.122 / 百万 token。

| 项 | 真实 HTTP 次数 | 操作 | 输入 / 输出 token | 成本 | 结果 |
| --- | --- | --- | --- | --- | --- |
| C8 前提预标 | 1 | 1 | 724 / 164 | 约 $0.0005 | 标出「調達の経験」那一行，依据是 3 条真实计分记录的 id，建议文合理 |
| C9 見直し | 5（额度用完） | 3（1 成功、2 失败） | 13,886 / 10,678 | 约 $0.0172 | 1 次成功（结果因脚本在后面一步崩溃没留下记录）；另 2 次被校验器拦下：一次 JSON 不完整，修复后配点合计不是 100；一次两轮都不合格。**没保存、没扣次数**。提示词 v3 → v4（加「升 N 就降 N、先加总」）**未验证** |
| C10 下一目标 | 1 | 1 | 415 / 172 | 约 $0.0004 | 2 个候选，依据都是真实记录 id |
| **合计** | **7** | **5** | **15,025 / 11,014** | **约 $0.018** | |

记录：`real-ai.json`。真实调用当场暴露并修好了两个 bug：

- **`plan_log.body` 为空被 Postgres 拒绝**：R25 有 2 处，R24 已提交的代码里还有 3 处。内存仓储加了同样的检查。
- **「確定以来の記録」比较出错**：拿东京日期字符串和 UTC 时间戳比较，东京 0–9 点确定的计划会把当天的记录漏掉。改为按计划创建时刻比较，并加了回归测试。

## 删除清单与 impact

完整记录：
- Web 与服务端：152 个导出符号逐个跑了 impact。
- App：`scratchpad/r25/app-cleanup-impact.txt`，摘要见下。

**Web 页面与组件**
- `app/(app)/app/agent/plan/{page.tsx, plan-route-view-model.ts, read-current-plan.ts}`
- `agent/strategy/{page.tsx, strategy-route-view-model.ts}`
- `iorbit-0918/` 下 11 个：`iorbit-plan.tsx`、`iorbit-plan-card.tsx`、`iorbit-plan-card-model.ts`、`iorbit-plan-card-styles.ts`、`iorbit-plan-client.ts`、`iorbit-my-plan-styles.ts`、`plan-anchors.ts`、`plan-match-client.ts`、`plan-match-sheet.tsx`、`today-plan-items.ts`、`iorbit-strategy.tsx`

**服务端**
- `app/api/contacts/needs-matches/**`、`app/api/contacts/intros/summary/**`
- `features/contact-needs/**`、`features/contacts/contact-intros-summary-reader.ts`
- `app/api/agent/plans/{bootstrap,reanalyze}/route-handlers.ts`
- 契约与 api-schema：`contact-needs.ts`、`contact-intros-summary.ts` 各 2 份（BREAKING 新增 27 行，含活动跟进 `taskHref` 字面量）

**App**
- 路由：`app/contacts/{matches,intros}.tsx`
- 屏幕与组件：`ContactNeedsMatchesScreen`、`ContactNeedsMatchesContent`、`ContactNeedsHomeEntry`、`ContactIntrosScreen`、`ContactNeedsEditor`
- 视图模型与 hook：`view-models/{contact-needs,contact-intros-summary}.ts`、`hooks/useContactNeeds.ts`
- 契约副本 4 份

**impact 结果**
- Web 与服务端：
  - LOW 76、UNKNOWN 39：文本确认调用方只在被删文件和测试里。
  - HIGH 24、MEDIUM 8、CRITICAL 5（`buildMyPlanViewModel` 与 `plan-match-sheet` 的 4 个）：删除集合之外的调用方都已改掉对它们的引用，见下面「动过的别人的文件」。
  - `productHref` 是 CRITICAL，只改了 3 个原型路径的映射。
- App：
  - CRITICAL 4 个，逐个看过第一层调用方，都是同名放大造成的误报：`ContactNeedsMatchesContent`、`contactNeedsToView`、`ContactIntroSourceLabelContract`、`ContactNeedsHomeCard`。
  - 其余是 LOW，或 UNKNOWN 已用文本确认。
- `PlanService`（CRITICAL）没有删；v1 的 `reanalyze` 接口保留，固定返回 409。

**删掉或改写的测试**
- 理由都写在测试注释里。
- 删掉的整个文件：
  - Web 与服务端 11 个：`contact-intros-summary-route`、`contact-needs-route`、`contact-intros-summary-postgres`、`contact-needs`、`web-contact-needs-retired-gate`、`app-agent-iorbit-plan-card`、`app-agent-plan-route-view-model`、`app-agent-strategy-route-view-model`、`app-plan-match-sheet`、`today-plan-items`、`agent-plans-bootstrap-route`。
  - App 3 个：`contact-needs-interactions`、`contact-needs-view-model`、`contact-intros-screen-source`。
  - 理由都是被测对象已删。
- `app-agent-iorbit-screens`：删 44 条，是「我的计划 / 策略 / 联系人建议」三个屏的用例。
- `app-agent-iorbit-home`：删 33 条依赖 v1 计划的用例，补回 5 条改写版。
- 其余约 20 个文件只是把期望的链接改成新地址。

**动过的别人的文件**（只改 import、链接和入口，并删掉随之变成死代码的部分）
- R21：`iorbit-home.tsx`、`iorbit-shell.tsx`、`iorbit-chat.tsx`、`iorbit-chat-aside.tsx`、`iorbit-model.ts`、`iorbit-styles.ts`、`agent/page.tsx`、`_demo/demo-persona.ts`
- R11 / R12：`network-opportunities.tsx`、`network-detail-modal.tsx`、`network-insight-copy.ts`、`card-batch-ui.tsx`；App 的 `ContactsScreen.tsx`、`ContactDetailScreen.tsx`
- 热点文件通知：乙没有在线会话，用这份 REPORT 代替通知。

**留着没删的**（不在清单里，交给 R21）
- `home-plan-events-actions.ts`、`resolveHomePlanEventCandidates`
- `iorbit-model` 的 `iorbitPlanWeeks`、`iorbitStrategyView`
- v1 的 `/api/agent/plans/candidates`
- v1 续订服务

## 旧链接替换对照

| 原位置 | 新地址 |
| --- | --- |
| iOrbit 首页「执行计划 →」「帮我制定推进计划 →」、对话追问两条、右栏「先联系谁」、人脉分析 `PLAN_HREF`（机会、总览卡、本周行动、待确认）、洞察「依据：计划需求」、示例信号「定时间」 | `/app/tasks?tab=plan`（不带锚点） |
| 首页大卡「日程安排」、「暂无约谈 · 打开日程」、iOrbit「日程页 →」与 2 小时内日程条、首页 facts 的 appointments、示例「看会面准备」、`productHref` 的 `/home/schedule`、`/schedule` | `/app/tasks?tab=calendar` |
| `productHref("/today")`、收件箱提醒兜底、主动提示 followups、「查看跟进」、`orbit-ai`「打开跟进」×7、活动跟进 `taskHref` | `/app/tasks` |
| 联系人详情「返回我的计划」的前缀、全局提问上下文 | `/app/plans` |
| `/app/agent?plan=<id>&reveal=1` | 不再读取，直接落到 iOrbit 概览 |
| `/app/agent/plan`、`/app/agent/strategy` | 404（兼容跳转已删） |

## 点击验证（SC-07 / 09）

本机验收服务器 `orbits-verify`（localhost:3001，`verify-server.sh` 断言本机库 `orbit_newui_events_20260922`，不连 Neon），主测试账号 `qa@orbit.test` 程序化登录后逐个打开（不跟随跳转）。记录：`click-verify.log`，脚本 `scratchpad/r25/click-verify.mjs`。

- 旧地址 `/app/agent/plan`（含 `#plan-action-…`）、`/app/agent/strategy`（含 `?view=contacts`）→ **404**，没有 307 兼容跳转。
- 入口页 `/app/home`、`/app/agent`、`/app/contacts/dashboard`（含 `?tab=opportunities`）、`/app/inbox`、`/app/tasks`（含 `?tab=plan`、`?tab=plan&new=1`、`?tab=calendar`）、`/app/start?step=3` → 全部 200，渲染的 HTML 里**没有旧地址**。
- 从这些页面收集到的 Task / Plans 链接共 37 个，逐个打开 → 全部 **200**，没有跳转。
- v1 创建入口 `POST /api/agent/plans/bootstrap`、`POST /api/agent/plans`、`POST /api/agent/plans/reanalyze` → 全部 **409 `PLAN_V1_RETIRED`**，`href=/app/tasks?tab=plan&new=1`。
- 旧引导第 3 步的「开始分析」是客户端跳转，由 `app-start-guide` 测试覆盖（跳 v2 目標入力、不调任何计划接口）。

## 基线 → 收口

| | 基线 | 收口 |
| --- | --- | --- |
| orbits `npm test`（**带本机库** `ORBIT_EVENT_DATABASE_URL=postgres://localhost/orbit_test`） | R24 收口 7176 条 0 失败，但当时没连库（跳过 892） | 7014 条（清理删掉一批旧测试），通过 6485、失败 12、跳过 517。12 条里 **8 条在基线 `3b8f0d20` 上同样失败**（同库重跑同一批文件确认）：通知发现 worker 3 条、活动访问 schema 2 条、联系人详情 live 路由 1 条、party live 路由 1 条、名片批次 schema 包装 1 条——都是以前没连库时被跳过的、与本 Sprint 无关的已有问题，列入交接。**另外 4 条是清理带出来的**：人脉总览 2 条、iOrbit 对话右栏 1 条（期望值还是旧地址）、人脉示例模式 1 条（「关联需求」入口已删）→ 已修，单独重跑 47 + 22 条全过 |
| App `npm test` | 4252 条，失败 1（`route-parity` 的 `/start`，已知） | 4252 条，失败 1（同一条 `/start`） |
| orbits `typecheck` / `typecheck:app` / `lint` | 0 / 0 / 0 | 0 / 0 / 0 |
| App `tsc` | 0 | 0 |
| `copy:qa` | 1366 条 0 问题 | 1662 条 0 问题 |

日志：`~/orbit-sprint-evidence/redesign/R25/run-01/final-*.log`。

## GitNexus

- 服务端：`detect-changes-server.log`，37 个文件，风险 high。12 条受影响流程都是新增的 `reviewFix` / `startReview`。
- Web 界面：`detect-changes-web-ui.log`，42 个文件，风险 critical。18 条受影响流程都从计划页面出发（`PlanLegacyScreen`、`PlanManualEditScreen` 等），属于本 Sprint 的范围。
- R24 复核修复：`../R24/run-01/detect-changes-review-fix.log`，风险 medium。

## 截图对照

`~/orbit-sprint-evidence/redesign/R25/run-01/compare.html`，12 组：上面是设计稿 b4 A3–A6 的画板（16 张；A4 ③ ご利用プラン按 Q6 不做），下面是 Web 1440 / 1024 / 390 × 浅 / 深（72 张）和 App 浅 / 深（24 张）。

截图都来自两端渲染测试框架（mock 数据）：Web 截页面主体，不含左栏；App 用 react-native-web 在 390 宽渲染，**没有用模拟器或真机**。STALE 和以前のプラン没有对应设计稿。

## 已知例外 / 交接

- **C9 提示词 v4 未验证**：本机 5 次额度已用完，上 staging 前需要再授权几次本机调用。
- **改目标弹窗**：契约里没有「背景説明」字段，所以设计稿里「只改说明就直接保存」做不出来，现在任何改动都先给三个出口。
- **只剩已达成目标、又没有 v1 计划的人**：在 Task › プラン 看到的是目標入力，没有下拉，进不了已完成目标的完成页。下一个 Sprint 可以在目標入力上加「達成した目標」入口。
- **`/app/tasks` 未登录跳登录**：`next` 参数会丢掉 `new=1` 和 `plan`（沿用原来的写法）。
- **人工确认**：真机 / 模拟器走查（BottomSheet 叠 ActionSheet、键盘、安全区）。
- **给 R21**：
  - 深链：`planReviewHref`、`planDoneHref`、`planNewGoalHref`。
  - 「プランを見直したい」用 `planReviewHref`。
  - 首页里与 v1 计划有关的残留函数，见「留着没删的」。
- **给 R26**：
  - live 下会える活動为空，`PLAN_LIVE_EVENT_FACTS_READY = false`。
  - 缺的事实：参加者构成、费用、移动时间、交流形式。
  - 工作人员代签还没接参加计分。
- **给 R28**：示例计划不拦写操作。
- **连库后暴露的已有失败（与本 Sprint 无关，基线同样失败）**：`notification-discovery-worker-postgres`（3 条）、`event-access-repository-postgres`、`event-access-migrations-postgres`、`app-contact-detail-live-route-services`、`app-party-live-route-services`、`business-card-batch-schema`（各 1 条）。以前全量不连库，这些一直被跳过；建议另开任务处理。

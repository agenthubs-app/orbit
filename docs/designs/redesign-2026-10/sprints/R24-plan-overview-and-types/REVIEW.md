# Sprint R24 — REVIEW（独立复核）

**复核人：** 独立 AI 复核会话，2026-10-11。全新上下文，没有参与写作，也没看执行会话的推理。
**对象：** `b16f3be7`（契约）、`ab410098`（服务端）、`8f05ce17`（两端界面、路由登记、REPORT）。文中行号都按 `8f05ce17`。
**依据：**
- PLANNER（修订 1，SC-R24-01～08、必需证据子表、易错边界）、GOAL、UI-SPEC；
- `plan-v2.2/DESIGN.md`：§2.5–2.7、§4、§5.1、§5.2 的 C11 / C12、§8；
- `sprints/README.md` 骨架通用规则。

REPORT 只当线索。下面每条结论都来自复核人重跑测试、重读代码，或在 scratchpad 里写的临时探针。

**读的是提交里的版本。** 复核人用 `git archive 8f05ce17` 把两端解到 scratchpad（`r24-review/c/`，`node_modules` 链到工作区），测试、类型检查和探针都跑在这份干净副本上，**不受工作区里 R25 未提交改动的影响**。只有一处例外：S1 的修法是复核人在工作区里看到的（R25 未提交的 `features/plans/v2/service.ts`），文中注明。

## 结论：不通过

修完 S1、M1、M2，并把 M3–M5 处理或交接之后，可以转为「有条件通过」。

R24 大部分内容都做到了：读模型、计分接线、匹配管线分流、他人数据隔离、两端界面，测试也确实在断言行为。

但提交里的两条链在 **Postgres 上不能用**：C11（面谈メモ判定）和「確認待ち」。原因是三处 `plan_log` 写入的 `body` 是空串，被表约束 `length(body) between 1 and 2000` 拒绝。内存仓储没有这条约束，所以 R24 的测试全部通过，REPORT 把 SC-05 记成 ✅。执行会话在做 R25 时发现了这个问题（REPORT 自定决定 #14），修法在 R25 的未提交改动里。但 R24 的三个提交本身是坏的，SC-05 不成立。

### 已经做到、复核人独立核实过的部分

**测试真实通过。** 以下都在 `8f05ce17` 干净副本上跑：

| 范围 | 结果 |
| --- | --- |
| orbits R24 相关 10 个文件（含 3 个真实 Postgres 文件） | 93 / 93 |
| `tests/plans/**` + v2 迁移 + 关系强度 Postgres | 106 / 106 |
| 匹配、v1 计划仓储、v2 消费方、生成流程、名片匹配（含 Postgres） | 55 / 55 |
| 契约快照、append-only、演示世界、schema 一致性、v2-service、matching-service | 29 / 29 |
| Web transport 审计 | 3 / 3 |
| App R24 相关 5 个文件 | 54 / 54（另有 1 条截图测试按环境变量跳过） |
| orbits `tsc` / `copy:qa` | 0 / 0 问题 |

**分数只有一个口径。**
- 概要（`overview` → `buildDetail`）和首页 `summary`（`goalItem`）都由 `summarizePlanScore` 用同一组输入算出。`plan-overview.test.ts` 断言二者的 `score` 完全相等。
- 两端渲染测试直接调 orbits 的 mock 路由，显示值等于 `/v2/summary`。
- 两端界面的总分、今日 +N、剩余分、segments 都直接取接口值，构成条四种段齐全，イベント段不可点。复核人读了 Web `PlanOverview.tsx:151-203`、`overview-model.ts:26-39`，以及 App `PlanOverview.tsx`、`plan-overview-ui.tsx:34-60`。

**记录加分的规则在服务端成立。**
- 同人同类型再记 → `already_counted`（noop）；匿名记录到目标人数后 → `anonymous_over_target`。
- 超额给半分；跳过记满额（扣掉已得）；跳过期间撤销被拒；撤回跳过会对冲满额记录。
- 同人同类型并发两次只记一次（Postgres 测试）。
- 撤销只写一条 `score_reversed`，不删任何面谈记录，联系人关联退回 `linked`。
- 服务端不会自动完成 Step，Step 建议是规则产生的确认卡。

**被对冲的计分不算互动。** 关系时间线、关系强度的时间线与 stamp、信号条目、近期记录，这 5 处 SQL 都加了排除条件。时间线有 Postgres 测试（其余没测，见 M7）。

**匹配管线按计划版本分流。**
- 入队和读需求去掉了 `model_version = 1`，并排除 `skipped_at` 非空的类型。
- `matching-service.decide` / `linkManually` 先查 `needModelVersion`：v2 走 `PlanV2Service`，只关联、不生成行动（Postgres 测试断言 `kind = 'action'` 的行数为 0）。
- v1 的匹配、计划、维护任务测试全部通过，v1 行为不变。
- R23 的确定路由通过 `afterConfirmed` 入队 `plan` 来源任务。

**他人数据隔离成立。** 复核人在本机 `orbit_test` 上写了探针 P2，结果：
- bob 读 alice 计划的概要、类型详情，得到 `null`；
- bob 对 alice 的计划做候补决定、线下聊过、面谈提案、依頼文，都是 `PLAN_NOT_FOUND`；
- bob 的 `pending` 为空，`contacts/[id]/fit` 为空；
- bob 用 alice 的候补 id / Step id 决定待确认项，分别是 `PENDING_NOT_FOUND` / `PLAN_NOT_FOUND`；
- 旧接口的分流 `decideCandidateById` / `linkTypeContact` 返回 `null`；
- alice 的「この人ですか？」搜不到 bob 的同名联系人；alice 对 bob 的联系人出提案是 `REFERENCE_NOT_FOUND`；
- alice 的候补状态没被 bob 改动。

新加的 SQL（`contactViews`、`findContactsByName`、`matchCandidates`、`decideMatchCandidate`）都带 `workspace_id + actor_id`，联系人查询另带 `user_id` 与 `accountId` 归属谓词。

**面谈提案与依頼文只出草稿。**
- 服务端 `proposal` 一律返回 `kind: "draft"`、`requestId: null`；`drafts.ts` 是模板，不调 AI。
- 两端界面都只有コピー / メールアプリで開く（`mailto:` 不带收件人），并标注「送信はしません」，没有任何送信按钮。
- 两端测试断言了没有送信按钮。

**C11 的输入形状对。**
- 只在 `usedForPlan` 时给模型加 3 问；类型用别名 T1…，不带 item id。
- 不带 3 问时，输入和系统提示词与 W0046 逐字相同（有测试断言）。
- 3 问并在同一次 HTTP 里，不增加调用次数；关闸、没有 provider、调用失败都走手动卡分支；账本用途仍是 `memo_extraction`。
- REPORT 写的 C11 真实调用 2 次、输入 736 / 输出 149 token、约 $0.0004，与证据目录 `real-ai.json` 的两条账本行逐条对得上。C12 那次（439 / 124 token）没进账本，REPORT 已披露。

**契约。**
- 两端的 `plan-v2.ts`、`event-assessment.ts`、`index.ts` 以及两份 schema，在 `8f05ce17` 逐字一致。
- `shared/compute` 两端逐字一致（含 `event-score.ts`）。
- 契约 8 的破坏性改动在 `BREAKING.md` 逐键登记；旧键名在两端代码与测试里已无残留。

**两端界面的其余部分（两个只读子会话逐项读码，复核人抽查了关键处）：**
- 三语文案：Web `copy/plan.ts` 169 条全部三语；App 三份 `plan.ts` 各 430 键，完全一致。
- 组件里没有写死的用户可见文字；新 CSS / 样式里没有十六进制颜色。
- 「減らす動き」/ `prefers-reduced-motion` 下，计数直接显示终值、动画只做淡入。
- 「前提を見る」只读；見直し / 手動編集 / 達成 / ↻ 点了都只弹「まもなく」。
- 手动 memo 卡少于 2 问时按钮禁用；跳过确认默认聚焦主按钮；撤销 Toast 显示 5 秒。
- 打开页面不发写请求，每次操作用新幂等键，写完重新读取。
- App 请求头带 `x-orbit-lang` 和 `x-orbit-platform: app`。
- App 的 `contacts/matches` 用 `Redirect` 跳到 `/task?seg=plan`，测试断言返回后回到 `/contacts`（用的是桩，不是真实 expo-router）。
- 路由登记（Web transport 59 → 60；App 路径参数、online-only、上级页、接口清单）都在。

### 问题汇总

共 **1 条严重**、**7 条中等**、**12 条轻微**：

| 编号 | 问题 |
| --- | --- |
| **S1** | 三处 `plan_log.body = ""`：Postgres 上 memo 计分提议永远写不进去（错误被吞掉）；Step 建议「まだ」、memo 卡的确认 / 不采用都报 500（探针证明） |
| **M1** | memo 卡「确认」先在另一个事务里加分、再记决定，而且不检查是否已决定：不采用之后再确认，仍会加分（探针证明） |
| **M2** | 线下聊过「新しく登録」不幂等：同键重试会建出第二个联系人，然后才 409；建联系人失败时静默改记为匿名（探针证明） |
| **M3** | live 下每次打开概要 / 类型详情 / pending 都全量读一遍活动表，结果却必然为空 |
| **M4** | v2 的活动参加计分只接了名片归属一条路：签到没接，对账任务不补 v2，v1 那步抛错时 v2 直接跳过 |
| **M5** | C12 没按 DESIGN 落地：模型输入带内部联系人 id 和类型 id，没有 `opener` 输出，两个提示词版本常量没被任何地方记录 |
| **M6** | 两端有三处写操作的结果提示与实际不符（Web 撤销没执行也提示「取り消しました」；App memo 卡没加分也提示「加点しました」，测试还把这个错误固定了下来；App 多人记录中途失败时错误被吞） |
| **M7** | 必需证据有缺口：Postgres 层没有 pending / memo 测试（S1 因此漏网）；R24 新接口没有他人隔离回归测试；关系强度 / 近期记录 / 信号的排除没测；执行会话的全量 orbits 跳过了 892 条数据库测试 |

### 通过条件

1. **S1**：把 R25 工作区里已有的 `body` 修法提交，并补一条 Postgres 测试：`proposeMemoCoverage` → `pending` 出卡 → 确认（计分）/ 不采用；外加 Step 建议「まだ」。
2. **M1、M2**：修掉，各补一条测试（写法见各条）。
3. **M3**：live 下在有参加者事实之前不读活动（或者改成按 id 有界的少量读取）；REPORT 写明「live 下会える活動为空，等 R26」。
4. **M4、M5**：修，或者写进 REPORT「已知例外」并明确交接（M4 交 R26；M5 交 R26，或单列一个小修）。
5. **M6**：修三处提示，并把 App 测试里固定错误文案的那条断言改过来。
6. **M7**：补 R24 接口的他人隔离回归测试（可以直接用复核人的探针 P2）。REPORT 的 SC-05 / SC-06 改成 ⚠️ 并引用本复核；「两端全量零新增失败」要注明 orbits 全量是在没有测试库的情况下跑的。

R25 的开发不受这些问题阻塞，但 R24 在 README 登记表里不能记为「已复核」，要等 S1 与 M1、M2 修完。

## 逐 SC 核实

| SC | 结论 | 复核人做了什么 / 证据 |
| --- | --- | --- |
| 01 概要 | ✅（有 m 级偏差） | 重跑两端渲染测试。分数、四种段、方案卡、4 个按钮、今日のチャンス、確認待ち、Step、类型卡三格、イベント块、底注都齐全。1024 / 390 版式有测试；1440 版式没有显式断言。<br>偏差：今日のチャンス在活动兜底时可能显示「+0」（m4）；Web 1024 的 Step 分组与撤回不一致（m8） |
| 02 三种去向 | ⚠️ | 三种状态、候补 ✓ 只发决定请求、只关联不生成行动、提案与依頼文只出草稿，测试与读码都成立。<br>问题：候补每行没有「すでに話した」（m7）；Orbit 用户也只出草稿（REPORT 已披露，站内请求要等收件箱接口） |
| 03 记录与加分 | ⚠️ | 服务端规则与 Postgres 并发测试成立；两端端到端（mock）成立。<br>问题：线下聊过新建联系人不幂等（M2）；Web 撤销假成功（M6） |
| 04 分数一致 | ✅ | 概要与 `summary` 同源；两端测试都和 `/v2/summary` 对数。<br>只有 memo 卡的「+X」预告是前端推算的（m9） |
| 05 memo 判定 | ❌ | 内存层测试通过，但 Postgres 上提议写不进去、确认 / 不采用 500（S1）；确认不原子、不查已决定（M1）。<br>live 里也没有任何代码路径会传 `usedForPlan`（m1），整条链从没在真实存储上走通过 |
| 06 活动分 | ⚠️ | `event-score.ts` 有 5 项、阈值、递减 82 → 76、「推定」标注；契约 8 同形状。<br>问题：例 2 只对上了总分（m2）；live 下会える活動必然为空，却每次全量读活动（M3）；参加计分只接了名片归属（M4） |
| 07 接口给别人 | ⚠️ | `contacts/[id]/fit`、`pending` 有 mock 路由测试，live 路由只测了要登录；隔离由复核人探针补证。<br>契约与 DESIGN §8 有出入（m3）。App 的 matches 跳转与返回有测试 |
| 08 AI 规矩 | ⚠️ | C11 别名、同一次调用、账本，属实。<br>C12 带内部 id、缺 `opener`、版本号没有落地（M5）；C12 真实调用未进账本（REPORT 已披露） |

### 必需证据子表

| SC | 子断言 | 复核结论 |
| --- | --- | --- |
| 01–06 | 截图对照页 | ⚠️ `compare.html` 在，Web 66 张、App 22 张。截图来自渲染测试框架（App 用 react-native-web），不是模拟器，REPORT 已披露。复核人没有逐张对照设计稿 |
| 03 | 「减少动效」只保留淡入 | ✅ 两端都有渲染测试。Web 的 `+N` 浮标在减少动效下淡入后不消失（m10） |
| 全部 | 三语、`copy:qa` 0、门禁零新增、两端全量、`tsc`、`detect-changes` | ⚠️ 复核人重跑 `tsc`、`copy:qa` 都是 0；`detect-changes` 三份日志在证据目录。<br>但执行会话的 orbits 全量（`final-orbits-test.log`）`skipped 892`，原因是 `ORBIT_EVENT_DATABASE_URL is not configured`：所有 Postgres 测试都没跑（M7） |
| PLANNER 测试清单 | `plan-detail` / `type-detail` / `event-score` / `event-attendance` / `candidate-decision` / `memo-coverage` / `proposal` / 两端渲染 / 端到端 | ⚠️ 大部分有等价测试（合并在 `plan-overview.test.ts` 等文件里）。<br>缺：他人 404（只有一个内存层用例）、Postgres 层的 memo 提议与待确认、「已达成的目标不记活动分」。<br>端到端是两端 mock 渲染测试，不是 Web Playwright |

## 问题清单

### S1 三处 `plan_log` 写入的 `body` 是空串，Postgres 拒绝：C11 与「確認待ち」整条链在真实存储上不能用

- **位置：** `repos/orbits/features/plans/v2/service.ts`
  - `:1022`：Step 建议「まだ」，写 `pending_dismissed`；
  - `:1047`：memo 卡确认 / 不采用，写 `pending_accepted` / `pending_dismissed`；
  - `:1090`：memo 计分提议，写 `memo_coverage_proposed`。
  - 约束：`features/plans/migrations.ts:113` 的 `body text not null check (length(body) between 1 and 2000)`。
- **复现：** 探针 P1（本机 `orbit_test`，`8f05ce17` 副本）。
  - `proposeMemoCoverage(...)` → `new row for relation "plan_log" violates check constraint "plan_log_body_check"`；
  - 给 CFO 计 1 人、出现 Step 建议之后，`decidePending({ id: "step:<plan>:s1", decision: "dismiss" })` → 同一个错误。
- **后果：**
  - live 下 memo 判定的确认卡和手动卡永远出不来。`job.ts:147`、`:242` 用 `.catch(() => undefined)` 把错误吞掉了，连日志都没有。
  - Step 建议卡点「まだ」是 500，卡永远收不起来。
  - 如果有提议存在，memo 卡「确认」时会先在另一个事务里加分成功，然后写决定失败、返回 500；卡还留着，再点也是一样（见 M1）。
- **为什么测试没发现：** 所有 memo / pending 测试都用内存仓储，内存仓储不检查 `body`。REPORT 自定决定 #14 承认了这件事，修法放进了 R25；但 SC-05 仍记 ✅。
- **修法：**
  - 工作区里 R25 未提交的 `service.ts:1141` 已经改成模板文字（复核人只看到 `memo_coverage_proposed` 那一处的新写法，没逐处核对另外两处）。
  - 提交时三处都要有 1–2000 字的人类可读模板，并补一条 Postgres 测试：提议 → `pending` → 确认（计分）/ 不采用 → Step 建议「まだ」。
  - 内存仓储要加同样的 `body` 长度检查（REPORT 说已经加了，随 R25 提交）。
  - `job.ts` 吞错的地方至少要打结构化日志。

### M1 memo 卡「确认」不原子，也不检查是否已决定：不采用之后再确认仍会加分

- **位置：** `service.ts:1005-1052`。`decidePending` 先 `awardWith(...)`，自己开一个事务、带回执键 `memo:<pendingId>` 计分（`:1043`）；然后**另开一个事务**写 `pending_accepted`（`:1047`）。整个过程没有检查这条提议是否已经有 `pending_accepted` / `pending_dismissed`。
- **复现：** 探针 P4（内存仓储，演示世界）。
  1. 出一张 memo 卡；
  2. 「不采用」（成功）；
  3. 换一个新的幂等键「确认」：分数 45 → 50，然后才抛 `duplicate log key`。

  用户（或另一台设备上的旧界面）对已经驳回的卡点确认，结果是分加上了、界面报错。和 S1 叠加之后，在 Postgres 上每次确认都是「加分成功 + 500」。
- **修法：**
  - 把「查是否已决定 → 计分 → 写决定」放进同一个 `transact`：可以把 `awardWith` 的事务体抽成接收 `tx` 的内部函数。
  - 已决定的卡：同键重放返回原结果，不同键返回 409 或 noop。
  - 测试：不采用后再确认不加分；确认重放只加一次分。

### M2 线下聊过「新しく登録」不幂等，失败时静默变匿名

- **位置：** `service.ts:957-969`。
  - 用户选「都不是」时，`options.createContact` 在任何回执之前就执行（`:967`），然后才用客户端的幂等键计分。
  - 网络超时后，用同一个键重试：再建一个联系人，计分时 `contactId` 不同 → `IDEMPOTENCY_KEY_REUSED`。
  - 另外，`createContact` 返回 `null`（`flow-context.ts:93-103` 会把所有异常吞成 `null`）时，`:968` 静默改成匿名自报。用户输了名字，记下的却是「名前なし」，还要受目标人数限制，界面拿到的只有 `createdContactId: null`。
- **复现：** 探针 P3：同键 `createContact: true` 调两次 → `createContact` 被调用 2 次，第二次返回 `IDEMPOTENCY_KEY_REUSED`。PLANNER 的易错边界原文是「线下聊过填了名字却建出重复联系人」。`plan-overview.test.ts:73` 只测了「一次请求建一个人」，没测重试。
- **修法：**
  - 照 R23 复核 M4 的做法：先在事务里按幂等键占位（回执写 `pending_contact`）；建联系人；再在事务里回填并计分。重放时读占位，不再新建。
  - 建联系人失败时返回明确错误（例如 `CONTACT_CREATE_FAILED`），让界面提示「登録できませんでした · 名前なしで記録しますか？」，由用户选择，不要静默改成匿名。
  - 补一条「同键重试只建一人」的测试。

### M3 live 下每次打开概要 / 类型详情 / pending 都全量读活动表，结果必然为空

- **位置：**
  - `features/plans/v2/event-facts.ts:30-45`：`livePlanEventFacts` → `core.listPublishedEvents(now)` → `repository.listEvents()`，读出**全部**活动行（`features/events/core/service.ts:137-146`）后，才在内存里筛 upcoming、取 20 条。
  - 调用点是 `service.ts:884`（overview）、`:905`（typeDetail）、`:997`（pending），每个请求都读一遍。
- **为什么结果必然为空：** live 的事实里 `expected` 恒为 `{}`（`event-facts.ts:41`），于是：
  - `eventsFor(type)` 按 `expected[key] > 0` 过滤，类型详情的会える活動恒为空，类型卡「会える活動 N」恒为 0；
  - 今日のチャンス的活动兜底要求 ≥50 分，但没有参加者事实时最高只有 19 分（复核人探针 `es.ts`：fit 0 · confidence 0 · timeCost 13 · connections 3 · format 3），永远不出。

  也就是说，live 每次打开计划都要付一次全表读取（还有 Neon egress），结果却永远用不上。REPORT 只说「多数会是『推定』」，没有说 live 下这一块是空的，也没按 PLANNER「失败与交接」列出缺的字段。
- **修法：**
  - R26 补上参加者事实之前，live 不读活动（`events` 传 `undefined`），或者改成按 id / 时间窗有界的查询（已有 `listPublishedEventsByIds`）。
  - REPORT「已知例外」写明「live 下会える活動为空」，并列出缺的字段（参加者构成、费用、移动时间、交流形式）交给 R26。

### M4 v2 的活动参加计分只接了名片归属一条路

- **位置：** `features/plans/event-attribution-runtime.ts:43-53`。只有 `markPlanEventAttendedForActor` 加调了 `recordEventAttendanceForPlans`，而它的唯一调用方是名片批次归属（`app/api/contact-drafts/business-card/batches/v2/handlers.ts:117`）。
- **三个缺口：**
  1. PLANNER 要求的「活动签到 / 「参加した」的现有流程加调」没有做：主办方签到路径（`app/api/events/[id]/operations/*`）没接。v2 概要里也没有「参加した」入口，所以 v2 用户只有扫名片并归属到活动时才能拿到イベント枠的分。
  2. v2 那一步排在 v1 `markEventAttended` 之后（`:47`）。v1 抛错时 v2 直接跳过；对账维护任务 `event-attendance-reconcile.ts:64` 只补 v1，v2 永远补不上。
  3. REPORT 没写调用点，也没写改前的 impact（PLANNER 要求写明）。
- **修法：**
  - v2 调用独立于 v1，各自 try，`recordEventAttendanceForPlans` 本身是幂等的；
  - 对账任务对 v2 也调一次；
  - 签到路径（报名者被标为已到场时）加调，或者在 REPORT 写明交给 R26 / R27；
  - 补测试：v1 抛错时 v2 仍然计分。

### M5 C12 没按 DESIGN 落地

- **位置：** `features/plans/ai-matcher.ts`。
- **内部 id 出境（`:96`、`:101`）：** 模型输入里带联系人的 `id`（record id）、姓名，以及需求的 `id`（v2 下就是 `pitem_…`）。DESIGN §5.1「id 不出境：联系人、活动只用短期别名」适用于所有调用；C12 是本 Sprint 改过的调用，PLANNER 也点名要复核这一条。这是 W0021 以来的旧行为，但 R24 把 v2 类型接进来时没有改。
- **`opener` 输出没做：** PLANNER 写的是「输出只加可选 `opener`」，DESIGN §5.2 C12 也写了 `opener`。实际输出形状没变，候补的「切り出し方」用的是类型级的 `personType.opener`（`overview.ts:91`），每个人都一样。
- **版本号没落地：** `PLAN_AI_MATCH_PROMPT_VERSION`（`:70`）与 `MEMO_EXTRACTION_PLAN_PROMPT_VERSION`（`memo-extraction/provider.ts:32`）全仓没有引用：不进日志、不进账本，「提示词版本 +1」无从追溯。另外两个版本串都写成 `2026-11`，而实际日期是 10 月。
- **修法：**
  - matcher 输入改成别名（C1… / N1…），回来后反向映射，丢弃不在输入里的别名，沿用 `ai-generator.ts` 的做法，并补一条「输入无内部 id」的测试；
  - `opener` 做，或者在 REPORT 写明不做并交接；
  - 两个版本号写进调用日志或账本 metadata。
- 本条不涉及新的付费调用授权。

### M6 两端有三处写操作结果的提示与实际不符

1. **Web 撤销假成功。** `app/(app)/app/orbit-2026/plan/PlanTypeDetailScreen.tsx:82-89` 的 `undo` 循环里，`run` 返回 `null` 就 `break`，但 `:88` 不论成败都弹「取り消しました」。而 `usePlanWrites` 在另一个写操作进行中时直接返回 `null`，什么都不提示（`plan-v2-actions.ts:50`）。结果是撤销没有执行，用户却看到「已撤销」；真接口失败时，还会同时出现「保存できませんでした」和「取り消しました」两条相反的提示。概要页的 `undoAward` 判断是对的（`PlanOverview.tsx:56`）。
2. **App memo 卡没加分也说「加点しました」。** `repos/orbit-app/src/screens/plan/PlanOverview.tsx:71-72`：`award` 为 `null`，或者 `part: "none"`（这个人在这个类型下已经计过分、类型已跳过）时，提示 `plan.pending.accepted`，日文是「加点しました」。`repos/orbit-app/tests/plan-overview-screens.test.tsx:359` 把 `award` 设成 `null` 后，`:375` 断言的恰好就是「加点しました」，等于把这个错误固定成了预期。
3. **App 多人记录中途失败时错误被吞。** `repos/orbit-app/src/screens/plan/PlanRecordSheet.tsx:93`：第 N 个人失败时先 `setProblem`；如果前面已有人成功，紧接着调 `finish` 关掉弹层。错误文字随弹层一起消失，用户只看到「+X 点」。

- **修法：**
  - Web：`undo` 只在全部成功时提示成功；写操作进行中时按钮置灰，或者至少提示「処理中」。
  - App：memo 卡确认后，复用 `awardReasonKey`，显示「加点はありません · <理由>」，并改掉测试里那条断言。
  - App：部分失败时保留弹层，或用 Toast 写明「N 人を記録 · M 人は失敗」。

### M7 必需证据有缺口，S1 因此漏网

- **memo 提议、待确认的确认 / 不采用、Step 建议「まだ」没有任何 Postgres 测试。** 有任何一条都能当场发现 S1。
- **R24 新接口没有他人隔离的回归测试。**
  - PLANNER 写的是 `plan-detail.test.ts`「他人 404」。实际只有内存层 `typeDetail("someone-else", …)` 一个用例，以及 live 路由「要登录」的断言。
  - 复核人的探针 P2 证明隔离是对的，但这不能替代回归测试。
- **R22 交接的「已撤销的计分不算互动」只测了时间线。** 关系强度（`read-model.ts` 的 stamp、`timelines.ts`）、信号条目、近期记录各改了一处 SQL，都没有测试。R22 复核原话是「测试各一条」。
- **orbits 全量没跑数据库测试。** 执行会话的 `final-orbits-test.log` 是 `tests 7176 / pass 6282 / fail 2 / skipped 892`，skip 原因是 `ORBIT_EVENT_DATABASE_URL is not configured`。所以 REPORT 的「全量零新增失败」不包含任何 Postgres 测试（复核人只重跑了计划相关的那部分，见上）。
- **修法：** 补上面的测试，可以直接用复核人的探针（`scratchpad/r24-review/probes/zz-review-pg/r24-probe.test.ts`，放回 `tests/` 并改相对路径即可）。全量要带本机测试库跑，REPORT 写明 skip 数。

### m 级

- **m1 C11 在 live 里没有触发路径。** `runConfiguredMemoExtraction` 只在入参带 `usedForPlan` 时才做判定（`memo-extraction/store.ts:81`）。但保存 memo 的路径（`app/api/contacts/[id]/handler.ts:300-314` 的 `savedMemoJob`）和重扫任务（`rescan.ts`）都不传这个字段，所以 live 下 C11 永远不会运行。DESIGN §8 说 R20 上线开关后端到端接通，这可以接受，但 REPORT 的 SC-05 ✅ 应该写明「live 尚无触发点，待 R20」。另外，`planCoverageHooks` 写在 `try` 里面（`:81`），它一抛错，整条 memo 提取就不做了，给现有 memo 提取引入了一个新的失败点。建议它出错时只跳过计划部分。
- **m2 event-score 的「设计稿两例」是凑出来的。**
  - 例 2（D2C Summit）测试只断言了总分 61 与 timeCost < 10。复核人算出的分项是 27 / 10 / 7 / 10 / 7，设计稿是 28 / 10 / 9 / 6 / 8。
  - 测试输入 `firstDegree: 1`，与设计稿事实「知人の参加なし（2次まで 2名）」矛盾。
  - 把设计稿写明的事实原样代入，两例分别得 91（例 1 多了「E デザイナー 約6名」）和 56（探针 `probes/es.ts`）。
  - 公式本身可以接受（设计稿只给了 5 项口径，没给子公式），但 REPORT 不能写成「设计稿两例作为固定用例」。建议例 2 也逐项断言，并在 REPORT 写明「分项按本实现的子公式，与设计稿示意数字不同」。
- **m3 给 R11 / R20 的契约与 DESIGN §8 有出入，且没登记。**
  - `PlanContactFit.fits[]` 没有 `recommendScore`、`reason`（DESIGN 有），`state` 改名成了 `status`；
  - `PlanPendingItem` 没有 `href`（DESIGN 有，R20 跳转要用）。

  契约是只加不改，现在补成可选字段即可。建议补上，并在 REPORT 交接段写明。
- **m4 今日のチャンス的活动兜底显示「+0」。** 服务端在活动兜底时返回 `points: 0`（`overview.ts:250`），Web 照样画 `+0` chip（`PlanOverview.tsx:282`）；label 只有活动标题，不是 DESIGN 的「今日 +N の機会」。建议 `points` 为 0 时不画 chip。
- **m5 依頼文里塞进了 AI 的 `why`。** `drafts.ts:43-49` 把紹介ルート的 `why` 原样放进写给中间人本人的信。`why` 是 AI 写的「为什么经这个人」，通常用第三人称描述对方，读起来会很怪。建议不放进正文，或者换成固定句。
- **m6 `proposeMemoCoverage` 不校验这个人是否真的是该类型的候补或已关联。** 探针 P5：对「陌生人」也会生成提议。现在靠调用方 `planCoverageHooks` 先筛，服务方法本身没有守卫。
- **m7 候补每行没有「すでに話した」（两端）。** UI-SPEC 写的是每行 ✓ / ✕ / すでに話した。Web（`PlanTypeDetailScreen.tsx:373-388`）和 App（`PlanTypeScreen.tsx:256-259`）都只有 ✓ / ✕，要记录只能勾选后用底部栏。Web 的文案键 `alreadyTalked` 定义了但没用到。Web 工具栏的「オフラインで話した」打开后默认是「話した人」模式，名不副实。
- **m8 Web 1024 的 Step 分组。** `overview-model.ts:127` 会过滤掉没有类型的 Step；一个类型只挂在它第一次出现的 Step 下，后面的 Step 可能整组不显示。1024 版已完成 Step 的 ✓ 点一下就直接撤回（`PlanOverview.tsx:521`），1440 版要先展开再点「完了を取り消す」，390 版不能撤回。三个版式行为不一致。
- **m9 memo 卡的「+X」预告是两端前端推算的。** Web `PlanOverview.tsx:314-316`、App `PlanOverview.tsx:265-267` 都从 segment 反推，没考虑「这个人已计过」「类型已跳过」，界面写 +X、服务端给 0，违背「预告与实得一致」。`contactId` 为空时，句子会变成「さんとの面談で…」。建议契约给 `PlanPendingItem` 加可选的 `points`，由服务端用 `nextAward` 算。
- **m10 Web 减少动效下 `+N` 浮标不消失。** `overview.module.css:199-200` 在减少动效时改成 `fadeIn … both`，结束时不透明度是 1，浮标一直留到下次加分。
- **m11 两端的小问题：**
  - Web 记录弹层：出现「この人ですか？」候选后切换模式，就没有提交按钮了（`PlanTypeDialogs.tsx:73`）；
  - Web 多选记录的 Toast 写死 `half: false`，超额部分不标「（半分）」（`PlanTypeDetailScreen.tsx:130-131`）；
  - 两端都没处理提案的 `kind: "request"`：现在服务端不会返回它，但契约允许；
  - App 双击防护有漏洞：「この人ですか？」候选行、跳过确认、撤回完成在请求进行中没有禁用；
  - App 类型已跳过时底部选择栏仍可提交；
  - App 底部栏不读安全区（`plan-overview-ui.tsx:219`）；
  - 两端示例计划（`sample: true`）都不拦写操作（REPORT 自定决定 #11 已披露，交接 R28）；
  - Web 按钮「目標を達成した」与 UI-SPEC「達成にする」不一致；
  - Web 有 5 个文案键未使用。
- **m12 REPORT 的口径问题。**
  - SC-05 记 ✅，但同一份 REPORT 的 #14 承认 R24 提交在 Postgres 上会失败；
  - 「活动参加给每个有イベント枠的生效目标加分」没写调用点（M4）；
  - 「设计稿两例 82 / 61 作为固定用例」见 m2；
  - 「两端全量零新增失败」没注明 orbits 跳过了 892 条数据库测试（M7）。

## 复核人做了什么

1. **在干净副本上跑测试。** `git archive 8f05ce17 repos/orbits repos/orbit-app docs/audits` 解到 `scratchpad/r24-review/c/`，链上工作区的 `node_modules`。
   - orbits（`ORBIT_EVENT_DATABASE_URL=postgres://localhost/orbit_test`）：
     - R24 的 10 个文件（plan-overview、memo-coverage、flow-review-fixes、event-score、plan-v2-routes、plans-v2-service-postgres、relationship-timeline-reader-postgres、plan-overview-screens、plan-flow-screens、plan-flow-model）：93 / 93；
     - `tests/plans/**` + v2 迁移 + 关系强度 Postgres：106 / 106；
     - 匹配与 v1 / v2 消费方 Postgres 6 个文件：55 / 55；
     - 契约与 v2-service、matching-service：29 / 29；
     - transport 审计：3 / 3；
     - `tsc -p tsconfig.json`：0；`copy:qa`：0。
   - App：plan-overview-screens、plan-overview-model、plan-screens、mobile-route-access、app-wide-route-coverage，54 / 54（截图测试 1 条按环境变量跳过）。
2. **Postgres / 内存探针。** 文件在 `scratchpad/r24-review/probes/zz-review-pg/r24-probe.test.ts`；它是在副本的 `tests/` 下跑完后移出来的，所以相对路径需要调整才能再跑。
   - P1：`body` 空串被约束拒绝（S1）；
   - P2：他人隔离 14 项（全部成立）；
   - P3：线下聊过同键重试建两人（M2）；
   - P4：不采用后再确认仍加分（M1）；
   - P5：对陌生人也出提议（m6）。
3. **评分探针。** `probes/es.ts`：设计稿两例按原文事实代入、live 全未知事实的最高分（m2、M3）。
4. **读码。**
   - 读了 `ab410098` 的全部服务端改动：`v2/service.ts` R24 段、`overview.ts`、`repository.ts`、`handlers.ts`、`event-facts.ts`、`drafts.ts`、`event-score.ts`、matching 四个文件、memo-extraction 三个文件、关系强度 / 时间线 5 处 SQL。
   - 读了 `b16f3be7` 的契约与 `BREAKING.md`，逐字比对两端契约、schema、`shared/compute` 副本。
   - 对照 `b10-plan-example.html` 的规范板与 `BEV` 数据核对了 event-score 的两例。
5. **核对证据目录。** 逐行核对 `~/orbit-sprint-evidence/redesign/R24/run-01/` 的 `real-ai.json`（账本行与 REPORT 的 token、成本）、`final-*.log`（失败与 skip 数）、`detect-changes-*.log`，并确认 `compare.html` 与 Web 66 / App 22 张截图存在。
6. **界面读码。** 两个只读子会话分别按 UI-SPEC 逐项读了 Web 与 App 的 R24 界面文件和测试。复核人抽查核实了其中写进本文的条目：Web 撤销假成功、`usePlanWrites` 忙时返回 `null`、候补行按钮、浮标 CSS；App memo 提示与对应测试、多人记录的部分失败。

## 没做的事

- 没连 Neon 或任何云端库，没读 `.env`，没部署，没调付费 AI。
- 没跑两端全量测试，没重跑 GitNexus `detect-changes`（只看了证据目录里的三份日志）。
- 没有逐张对照截图与设计稿；没用模拟器或浏览器实际操作。
- 没有在工作区（R25 未提交改动）上跑测试。S1 的修法只看了工作区 `service.ts` 里的一处写法。
- 没有核对 Web Playwright 端到端：PLANNER 要求了，REPORT 用的是两端 mock 渲染端到端，复核人没有另跑。
- 没改任何产品代码，没 commit / stash / checkout。

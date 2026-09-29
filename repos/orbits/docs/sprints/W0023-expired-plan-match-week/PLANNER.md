# Sprint W0023 — 到期计划只记关联，下一份计划再安排「约 TA」

**Plan revision:** 2。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RW-11（有 1 人关联即在本周生成「约 TA」）、RW-10（周次以计划生成日为第 1 周）、RW-12（到期先回顾，再制定下一份计划）。来源：W0018 REPORT 交接「W0023」。W23-1 用户 2026-09-29 决定：**只记关联，下一份计划再生成**。
**单一目标:** 到期计划上关联联系人（手动关联或接受匹配）只写「需求↔联系人」和进展记录、不生成「约 TA」；新版本计划为带入的已关联需求在新计划当周生成「约 TA」；确认接口返回与确认组件随之调整。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时的 `chat-agent` HEAD（W0024 合并后；revision 2 编制时是 `1d41bdfc`）。
**进入条件:**
- W23-1 已定（见上）。W23-2 已由用户确认，或明确接受推荐默认。
- W0026 已合并（两者都改 `scripts/seed-verify-accounts.ts`，不并行）。
- 本地测试库指向 localhost（`node scripts/assert-local-test-databases.mjs`）。不需要云端授权，不需要迁移，不调用付费 AI（计划生成仍是 mock，D3）。

## 已查清的事实（revision 2 按源码复核）

1. **写入口。** `features/plans/service.ts`
   - 第 415–490 行 `linkWithin(tx, { needItemId, contactId, name, logKey })`：校验需求、计划 `active`、引用 → 第 435 行 `findMatchAction` → 没有则第 437 行 `const week = Math.min(PLAN_LIMITS.maxWeek, planWeekAt(plan.startsOn, new Date(at)))` 生成「约 TA」→ 第 468 行 `applyItemChange(need, { op: "link_contact" })` → 写 `contact_linked` 记录（`targetItemId: action.id`，`payload.actionItemId`）。返回 `{ need, action, log, at }`。
   - 第 883–917 行 `linkNeedContact`：幂等键 `link:<clientKey>`；**回放分支**（约第 893–900 行）在找不到行动时 `throw new Error("Plan command receipt has no matching action.")`。
   - 第 919–963 行 `decideMatchCandidate`：候选 CAS，接受时 `linkWithin(..., logKey: "match:<candidateId>")`；**已接受的重放分支**（约第 936–942 行）找不到行动时抛 `MATCH_ALREADY_DECIDED`。
   - `planWeekAt` 到期后继续增长（`features/plans/week.ts:45`）；`planTotalWeeks(phases)`（`:57`）；`planWeekState(plan, at)`（`:88`，`ended = currentWeek > totalWeeks`，第 98 行）。
2. **下一份计划的继承逻辑（用户要求查清）。** `createVersionWithOutcome`（第 598 行起）：
   - 第 644–656 行：输入条目若带 `inheritsFromItemId`，用 `mergeInherited`（第 109 行）并入旧条目（含联系人关联 `mergeLinks`）；第 659–668 行同一活动自动并入。
   - 第 670–683 行：未被认领、且 `isCompletedContent`（第 124 行）的旧条目原样带入——对人脉需求就是「`contactLinks.length > 0`」；带入时 `suggestedWeek: null`。未完成的行动（含未完成的「约 TA」）**不带入**。
   - 第 703 行一次 `insertItems([...items, ...carried])`，第 704–727 行写 `plan_created`（`payload.carriedCount`、`inheritedCount`）。
   - **结论：现有继承逻辑不会为已关联需求生成任何「约 TA」**——既不在 `mergeInherited`、`isCompletedContent`，也不在 `createVersionWithOutcome` 其他位置。生成规则必须纳入本 Sprint。
   - 下一份计划由 `features/plans/reanalysis.ts:165` `createPlanFollowUpService().create()` 调 mock 生成器后，第 211–219 行 `createVersionWithOutcome(..., { origin })`；生成器输出的条目不带 `inheritsFromItemId`，所以已关联需求走第 670–683 行的「带入」。路由装配在 `app/api/agent/plans/reanalyze/route-handlers.ts:70–90`（`origin` 为 `next_plan` 或 `reanalysis`）。
   - 生成「约 TA」需要联系人称呼：`linkWithin` 的 `name` 由调用方在事务外读取（`features/plans/matching-service.ts:118` `contactNameFor` → `repository.readContacts(actorId, ids)`）。`createVersionWithOutcome` 目前拿不到名字。
3. **接口与组件。**
   - 类型：`features/plans/contract.ts:326` `LinkNeedContactResult { need; action: PlanItem; log; replayed }`，`:358` `DecideMatchCandidateResult { …; link: LinkNeedContactResult | null }`；`matching-service.ts:44–50` 的 `decide`／`linkManually` 返回同形状。
   - 接口：`app/api/agent/plans/candidates/route-handlers.ts:110–121`，`POST /api/agent/plans/candidates` 直接返回上述对象。
   - 客户端：`app/(app)/app/agent/iorbit-0918/plan-match-client.ts:87` `actionFrom` 在没有 `action` 时抛 `Unexpected link payload.`；`:102` `decidePlanMatch(...): Promise<PlanMatchAction | null>`（`null` 目前表示「不是」）；`:118` `linkContactToNeed(...): Promise<PlanMatchAction>`。
   - 组件：`plan-match-sheet.tsx` 的 `PlanMatchSheet`（第 201 行；接受后第 263–269 行显示「已加入本周：约 TA」+ `MatchActionButtons`）由三处入口使用——名片审阅页最后一屏 `BatchPlanMatch`（第 319 行，第 377 行渲染）、iOrbit 今日要事（`iorbit-home.tsx:1497`）、计划页「待确认 N」角标（`iorbit-plan.tsx:228`）；联系人详情的手动关联 `PlanNeedLinkPanel`（第 394 行，第 457 行文案「本周多了一条「…」」）。
4. **验收复现。** `scripts/seed-verify-accounts.ts:671–715` `seedExpiredPlan`（开始日期 −380 天、共 52 周）调 `linkNeedContact`，现状生成第 55 周的「约 林玫」。改动后到期计划上不再生成，种子不必改逻辑，只同步注释（第 670 行）。
5. chat-agent 没有部署、计划表生产迁移未执行（README「发布动作」），生产没有越界数据；本机旧数据用 `--reset verify-expired` 恢复，不做回填。

## 等待用户决定

| 编号 | 问题 | 推荐默认 |
| --- | --- | --- |
| W23-2 | 「新版本为已关联需求生成『约 TA』」是否也用于**重新分析**（`origin: "reanalysis"`），还是只用于制定下一份计划（`next_plan`） | **两者都用。** 两者走同一个 `createVersionWithOutcome`，而现状重新分析同样会丢掉未完成的「约 TA」（未完成行动不带入），只做 `next_plan` 会让重新分析后已关联的人没有行动。首份计划（没有旧版本）不受影响 |

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- `features/plans/service.ts`：第 1–15 行头注释（继承规则，需同步）、第 109–134 行 `mergeInherited`／`isCompletedContent`、第 283–306 行 `findMatchAction`／`needForMatchAction`、第 415–490 行 `linkWithin`、第 598–733 行 `createVersionWithOutcome`、第 883–963 行两个写入口。
- `features/plans/contract.ts`：第 315–365 行（关联与匹配的输入输出类型）、第 409–412 行 `PlanVersionOrigin`、第 439 行 `createVersionWithOutcome` 签名、第 114–116 行 `itemsPerPlan: 300`、`maxWeek: 60`。
- `features/plans/week.ts`：第 45、57、88 行。
- `features/plans/reanalysis.ts`：第 138–225 行 `createPlanFollowUpService`。
- `features/plans/matching-service.ts`：第 44–50 行接口、第 118–123 行 `contactNameFor`、第 133–140 行 `decide`、第 170–179 行 `linkManually`。
- `app/api/agent/plans/reanalyze/route-handlers.ts:70–90`、`app/api/agent/plans/candidates/route-handlers.ts:100–125`。
- `app/(app)/app/agent/iorbit-0918/plan-match-client.ts:35–130`、`plan-match-sheet.tsx:185–290、394–470`。
- 测试夹具：`tests/support/plan-fixture.ts`（`steppingClock`、`planInput`）、`tests/support/plan-matching-harness.ts`、`tests/services/plan-auto-log-producers.test.ts`（第 76–88 行 `linkNeedContact` 用例）、`tests/services/plan-reanalysis.test.ts`（第 210、245、272 行：重新分析、并发、下一份计划）、`tests/capabilities/plan-matching.test.ts`、`tests/capabilities/plans-repository.test.ts`（PG，`ORBIT_EVENT_DATABASE_URL`，非回环直接失败）、`tests/api/agent-plan-candidates-routes.test.ts`、`tests/api/agent-plans-reanalyze-route.test.ts`、`tests/pages/app-plan-match-sheet.test.tsx`。

### 关键符号与影响等级（GitNexus，2026-09-29 刷新到 `1d41bdf`）
- `linkWithin`：**CRITICAL**（partial；图谱直接调用方 1，文本搜索为 2：`linkNeedContact`、`decideMatchCandidate`）。
- `linkNeedContact`（service.ts:883）、`decideMatchCandidate`（:919）、`createVersionWithOutcome`：同名歧义，service 里那一个均为 **CRITICAL**（深度 2 起经 `createPlanService` 返回对象扇出）。
- `mergeInherited`、`isCompletedContent`：**CRITICAL**（partial，直接调用方 1）。本 Sprint 不改它们的语义，新增生成步骤放在 `createVersionWithOutcome` 里、`insertItems` 之前。
- `PlanMatchSheet`（直接 4）、`PlanNeedLinkPanel`（直接 2）、`decidePlanMatch`（受影响 6）、`linkContactToNeed`（受影响 4）：CRITICAL。
- `createPlanFollowUpService`：LOW（直接 1）。
- **不许改**：`planWeekAt`（CRITICAL，19+ 消费者）、`toAction`（CRITICAL，首页与计划页显示层）。
- 以上 CRITICAL 均须在 REPORT 登记，不因扇出来源降级。

### 前序交接要点
- W0010：「约 TA」的 `meta = { contactId, needItemId, source: PLAN_MATCH_ACTION_SOURCE }`；同一需求 + 联系人只一条；接受匹配的幂等键 `match:<candidateId>`，手动关联 `link:<clientKey>`；决定在按 actor 串行的事务里做严格 CAS。
- W0012：到期计划显示回顾，重新分析禁用；「制定下一份计划」走 `next_plan`，服务层核实计划已到期（`PLAN_NOT_ENDED`）；同 `creationKey` 只生成一次。
- W0021：计划读取的阶段进入判定按 `startsOn` 的东京日；本 Sprint 不碰读取路径。

### 易错边界（都对应到 SC）
- 未到期计划行为完全不变（周次 = 当前周；计划开始前 = 1）。（SC-01）
- 到期时：需求照常关联、进展记录照常写一条，只是不生成行动；到期前已生成的同一对行动保留、原样返回、周次不改。（SC-01）
- 回放不能再因「没有行动」而抛错：同键重放、同候选重复接受返回 `replayed: true` 与 `action: null`，不新增记录。（SC-02）
- 新版本生成只针对状态为 `linked` 的（需求, 联系人）；已 `established` 的不生成；新版本里已有同一对的「约 TA」（包括带入的已完成行动，`meta.needItemId` 指向旧需求 id）不再生成；联系人已删除或不属于本人的不生成；总条目不超过 `itemsPerPlan`。（SC-03）
- 生成与新版本写入同一事务；同 `creationKey` 重放不重复生成；生成失败整个新版本不写。（SC-03）
- 名字只在事务外读一次；读不到用「约 TA」，不在事务内逐人读库。（SC-03）
- 确认处在到期时不能显示「已加入本周」，也不显示行动按钮；未到期时文案不变。（SC-04）
- 不改已存在的越界行（没有迁移、不回填）。（SC-05 说明）

## 范围与文件

- **修改：**
  - `features/plans/service.ts`（`linkWithin` 到期分支、两个回放分支、`createVersionWithOutcome` 生成步骤、头注释）
  - `features/plans/contract.ts`（`LinkNeedContactResult.action: PlanItem | null`，可加一个说明原因的字段；`createVersionWithOutcome` 的 options 增加可选的联系人称呼）
  - `features/plans/matching-service.ts`（类型跟随）
  - `features/plans/reanalysis.ts`、`app/api/agent/plans/reanalyze/route-handlers.ts`（事务外读已关联联系人的称呼并传入；可复用 `PlanMatchRepository.readContacts` 或等价的只读投影）
  - `app/(app)/app/agent/iorbit-0918/plan-match-client.ts`、`plan-match-sheet.tsx`（到期提示；三处入口共用组件，宿主 `iorbit-home.tsx`、`iorbit-plan.tsx` 的 `onDecided` 如需适配一并改）
  - `scripts/seed-verify-accounts.ts`（只改注释）
  - 对应测试
- **新建：** 无；用例加到现有测试文件。
- **排除：** `planWeekAt`、`toAction` 与显示层；到期回顾；匹配候选的生成规则；数据迁移或回填；生产操作；首份计划生成。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0023-01 | 固定时钟：共 52 周的计划在第 55 周（及第 61 周）经 `linkNeedContact` 或 `decideMatchCandidate`（接受）关联 → 需求 `contactLinks` 含该人（`linked`）、恰好 1 条 `contact_linked` 记录、计划行动数不变、返回 `action: null`；到期前已为同一对生成过行动时返回该行动，`suggestedWeek` 不变；未到期（第 5 周）→ 生成 1 条「约 TA」，`suggestedWeek = 5`；开始日之前 → 1；13 周计划在第 13 周 → 13、第 14 周 → 不生成 | 服务测试先 RED 后 GREEN（memory 仓储；`plan-auto-log-producers`、`plan-matching`） |
| SC-W0023-02 | 幂等与并发：到期计划上同 `idempotencyKey` 重放 → `replayed: true`、`action: null`、不抛错、不新增记录；同一候选重复接受 → 回放现状、不抛 `MATCH_ALREADY_DECIDED`；PG：两次并发接受同一候选 → 一个成功、一个 409，0 条行动、1 条记录；关联与「制定下一份计划」并发 → 串行结果只有两种（先关联：新版本带入并生成 1 条；先建新版本：关联得 `PLAN_ARCHIVED`），0 skip | 服务测试 + PG 测试（显式 `ORBIT_EVENT_DATABASE_URL` 指向本机 `orbit_test`，先跑 `node scripts/assert-local-test-databases.mjs`） |
| SC-W0023-03 | 新版本生成（`next_plan`；W23-2 采纳默认时也含 `reanalysis`）：每个状态为 `linked` 的（需求, 联系人）恰好 1 条「约 TA」，`meta.needItemId` = 新需求 id、`suggestedWeek` = 新计划当周（夹在 1..总周数），标题「约 {称呼}」（读不到为「约 TA」），联系人关联为 `linked`；跳过：`established`、新版本已有同一对行动（含带入的已完成行动）、联系人已删除；总条目 ≤ `itemsPerPlan`；同 `creationKey` 重放不重复生成；生成步骤出错时新旧版本都不变；`plan_created` 记录生成数；称呼只在事务外读一次 | 服务测试（`plan-reanalysis`、`plans-service`）+ 路由测试（`agent-plans-reanalyze-route`） |
| SC-W0023-04 | 接口与组件：`POST /api/agent/plans/candidates` 在到期计划上接受或手动关联返回 200，`link.action`／`action` 为 `null`；客户端不再抛 `Unexpected link payload.`；`PlanMatchSheet` 已接受的行显示「已关联到「需求」；计划已到期，制定下一份计划时会安排「约 TA」」（英文同义），不再出现「是／不是」，不渲染行动按钮；`PlanNeedLinkPanel` 显示同义文案；未到期时两处文案和现在一样；三处入口（审阅页、今日要事、计划页角标）与联系人详情各有接线用例 | `tests/api/agent-plan-candidates-routes.test.ts`、`tests/pages/app-plan-match-sheet.test.tsx`、`tests/pages/app-agent-iorbit-home.test.tsx` 等，先 RED 后 GREEN |
| SC-W0023-05 | 真实页面与回归：`seed-verify-accounts.ts --reset verify-expired` 后，数据库里需求关联林玫、`contact_linked` 记录 1 条、没有「约 林玫」；3001 计划页和首页不出现超过「共 52 周」的周次；点「制定下一份计划」后新计划第 1 周出现「约 林玫」，首页本周推进同步；桌面 1440、手机 375，控制台 0 错误；之后 `--reset verify-expired` 恢复。定向集（含 `tests/services/plan-week.test.ts`、`plans-service.test.ts`、`plan-auto-log-producers.test.ts`、`plan-reanalysis.test.ts`、`tests/capabilities/plan-matching.test.ts`、`tests/api/agent-plans-routes.test.ts`）全部通过；typecheck 通过；一次全量基线对照没有新增失败 | 数据库读回 + 截图 + 定向集、tsc、RULES §5.2 全量对照 |

## 一次 Generator 的执行顺序

1. 复核 W23-1／W23-2（写进 REPORT）、基线和 Planner 哈希。对 `linkWithin`、`linkNeedContact`、`decideMatchCandidate`、`createVersionWithOutcome`、`createPlanFollowUpService`、`PlanMatchSheet`、`PlanNeedLinkPanel`、`decidePlanMatch`、`linkContactToNeed` 做 upstream impact，CRITICAL 登记。
2. 写 RED：SC-01、SC-02（服务）、SC-03（服务与路由）、SC-04（接口与组件）；再写 PG 并发用例。
3. 实现顺序（一条操作链）：契约类型 → `linkWithin` 到期分支与两个回放分支 → `createVersionWithOutcome` 生成步骤 → 称呼读取与路由装配 → 客户端与组件。
4. 定向集 → 重置 verify-expired → 浏览器 → 暂存区 `detect-changes` → 提交。
5. 全量对照，一次 Codex 代码 review，同一 Generator 修复，写 REPORT，交接。

## 最小测试与检查

- **档位：H。** 理由：写入语义变化（关联不再生成行动、新版本生成行动）、接口返回形状变化、幂等与并发路径；图谱 CRITICAL。
- **开发定向集：** SC-01～SC-04 列出的文件，外加 PG 用例。复用 `steppingClock`、`plan-matching-harness`。
- **收口：** typecheck、全量基线对照、一次 Codex 代码 review。
- **浏览器：** 3001，verify-expired，桌面 1440 和手机 375。
- **不运行：** 付费 AI（计划生成仍是 mock）；流量测量只记一句：称呼读取只在「制定下一份计划／重新分析」时发生（每人每月至多数次），在 REPORT 写单次返回字节。

## 失败与交接

REPORT 写：W23-1／W23-2 的答复、到期关联前后对照、下一份计划生成规则与跳过条件的证据、幂等与并发证据、verify-expired 读回与截图；注明生产没有越界数据（计划表生产迁移未执行）、不需要回填。

## 修订记录

| review 意见（codex-plan-review.txt） | 处理 |
| --- | --- |
| P1-2（推荐默认 A 把新行动写进已过去的第 52 周并立即显示延后） | 接受。用户 2026-09-29 选定「只记关联，下一份计划再生成」。范围改为：到期不生成行动、接口返回与三处入口及手动关联组件跟随、下一份计划生成行动；显示层与 `planWeekAt` 不动 |
| P2-3（`linkNeedContact`／`decideMatchCandidate` 行号不完整） | 接受。按源码分列：`linkNeedContact` 第 883–917 行、`decideMatchCandidate` 第 919–963 行，二者都调用 `linkWithin`（第 415–490 行） |
| 用户要求查清继承逻辑 | 已查：`mergeInherited`／`isCompletedContent`／`createVersionWithOutcome` 只带入已关联需求（周次置空），不生成「约 TA」，未完成行动不带入；生成规则纳入本 Sprint（SC-03），新增 W23-2 待确认 |
| 其余 | 不涉及本 Sprint。GitNexus 刷新后相关符号为 CRITICAL（revision 1 记为 LOW），已如实登记 |

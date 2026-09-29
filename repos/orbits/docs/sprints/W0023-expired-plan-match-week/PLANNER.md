# Sprint W0023 — 到期计划的「约 TA」周次

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RW-11（有 1 人关联即在本周生成「约 TA」）、RW-10（周次以计划生成日为第 1 周）、RW-12（到期先回顾，再制定下一份计划）。来源：W0018 REPORT 交接「W0023」。
**单一目标:** `linkWithin` 生成「约 TA」时，周次不超过计划自身的总周数。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时的 `chat-agent` HEAD（W0024 合并后）。
**进入条件:** 用户已回答 W23-1，或接受推荐默认；本地测试库指向 localhost。不需要云端授权，不需要迁移。

## 已查清的事实（编制时核对）

- `features/plans/service.ts:437`（`linkWithin` 内）：`const week = Math.min(PLAN_LIMITS.maxWeek, planWeekAt(plan.startsOn, new Date(at)));`
  - `maxWeek` 是全局上限 60（`contract.ts:116`），不是计划自身的周数。
  - `planWeekAt` 到期后继续增长（`week.ts:45`）。
- 计划总周数由 `planTotalWeeks(plan.phases)`（`week.ts:57`）得出；`planWeekState` 的 `ended = currentWeek > totalWeeks`、`displayWeek` 夹到总周数（`week.ts:88`）。
- 本周列表 `planWeekActions(items, week.currentWeek)` 用的是**未夹紧**的当前周（`plan-route-view-model.ts:435、597`）；`toAction` 的周次标签取 `suggestedWeek`（`:243`）。所以第 55 周的「约 TA」显示成「本周、未延后」，但页头写的是「第 52 周／共 52 周」。
- 验收种子能直接复现：`seedExpiredPlan`（`scripts/seed-verify-accounts.ts:671`，开始日期 −380 天）调用 `linkNeedContact`，生成第 55 周的「约 林玫」。
- 到期计划：重新分析被禁用，页面提示「用『制定下一份计划』」。版本继承会把「有联系人的人脉需求」带入新版本，未完成的「约 TA」行动不带入（`service.ts` 头注释与 `mergeInherited`）。
- 两条写入口都经过 `linkWithin`：`linkNeedContact`，以及 `decideMatchCandidate`（接受匹配时）。`findMatchAction` 保证同一需求 + 联系人只有一条行动。
- chat-agent 没有部署，计划表的生产迁移也没执行（README「发布动作」），所以生产没有越界数据，不需要修数据。本机数据用 `--reset verify-expired` 恢复。

## 等待用户决定

| 编号 | 问题 | 推荐默认 |
| --- | --- | --- |
| W23-1 | 计划到期后关联联系人怎么处理 | **A：** 照常关联（需求↔联系人、进展记录，带入下一份计划），并生成「约 TA」，周次为 `min(当前周, 计划总周数)`；显示层不改，到期计划里的它和其他未完成行动一样按真实当前周计算「已延后 N 周」。备选 **A+：** 在 A 的基础上，计划结束后才生成的行动不显示「已延后」（要改影响等级为 CRITICAL 的 `toAction`）。备选 **B：** 到期计划只记关联、不生成行动（确认接口返回的 `action` 会变成 null，三处确认组件要跟着改） |

依据：RW-11 的「本周」在到期计划里不存在；RW-12 要求到期先回顾再制定下一份；RW-10 以计划自身的周为单位。A 不改接口契约，也不改显示层，是满足「不越界」的最小写入语义变化。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

### 必读文件
- `features/plans/service.ts`
  - 第 280–300 行：`findMatchAction`、`needForMatchAction`。
  - 第 413–480 行：`linkWithin(tx, { needItemId, contactId, name, logKey })`。
  - `linkNeedContact` 和 `decideMatchCandidate`（约第 920–965 行）：两个调用方。
- `features/plans/week.ts`：第 45 行 `planWeekAt(startsOn, at): number`，第 57 行 `planTotalWeeks(phases): number`，第 88 行 `planWeekState(plan, at): PlanWeekState`。
- `features/plans/contract.ts:116`：`PLAN_LIMITS.maxWeek = 60`；`features/plans/validators.ts:93`：周次校验 1..60。
- `app/(app)/app/agent/plan/plan-route-view-model.ts`：第 243 行 `toAction`，第 435、597 行本周列表（只读，理解显示；选 A 时不改）。
- `features/plans/reanalysis.ts:60–78`：`period_ended` 触发（只读）。
- `scripts/seed-verify-accounts.ts:671–712`：`seedExpiredPlan`（验收复现）。
- 测试夹具：`tests/services/plan-auto-log-producers.test.ts`（第 33 行 `steppingClock`，第 76–88 行 `linkNeedContact` 用例）、`tests/services/plans-service.test.ts`、`tests/capabilities/plan-matching.test.ts`、`tests/support/plan-matching-harness.ts`、`tests/capabilities/plans-repository.test.ts`（PG）。

### 关键符号与影响等级
- `linkWithin`：LOW，直接调用方 2 个（`linkNeedContact`、`decideMatchCandidate`）。
- `planWeekAt`：**CRITICAL**（19 个受影响），**不许改**。只在 `linkWithin` 里组合调用已有的 `planTotalWeeks`。
- `toAction`：**CRITICAL**。选 A 时不改；选 A+ 时必须先报告影响范围，覆盖首页和计划页两个消费者（`buildMyPlanViewModel`、`buildPlanWeekSummary`）。

### 前序交接要点
- W0010：「约 TA」的 `meta = { contactId, needItemId, source: PLAN_MATCH_ACTION_SOURCE }`；同一需求 + 联系人只一条；接受匹配的幂等键是 `match:<candidateId>`，手动关联是 `link:<clientKey>`。
- W0012：到期计划显示回顾，重新分析禁用；「制定下一份计划」走 `next_plan`。
- W0021：计划读取的阶段进入判定按 `startsOn` 的东京日；本 Sprint 不碰读取路径。

### 易错边界（都对应到 SC）
- 未到期计划行为完全不变（周次 = 当前周）；计划开始前仍是第 1 周。
- 周次上限取计划自身的总周数，不是全局 60；总周数 ≤60 由校验器保证，结果仍在 1..60 之内。
- 幂等：重复关联、同键重放、匹配候选重放、并发两次接受，都只有一条行动，已有行动的周次不被改写。
- 不改已存在的越界行（没有迁移、不回填），只影响新写入。
- 不改周次计算函数和显示层（选 A 时）。

## 范围与文件

- **修改：** `features/plans/service.ts`（`linkWithin` 的周次一行及必要注释）、`scripts/seed-verify-accounts.ts`（如需同步注释；种子逻辑本身不改，修复后自然落在第 52 周）、测试。
- **新建：** 无。用例加到现有测试文件。
- **排除：** 显示层（A+ 除外）、到期回顾、重新分析、匹配候选的生成规则、数据迁移或回填、生产操作。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0023-01 | 固定时钟下，一个共 52 周的计划：第 55 周关联 → 新「约 TA」`suggestedWeek = 52`；第 61 周（超过 60）→ 52；第 5 周 → 5；开始日之前 → 1；13 周的计划在第 14 周 → 13。`linkNeedContact` 和 `decideMatchCandidate`（接受）两条入口结果一致 | 服务测试先 RED 后 GREEN（memory 仓储） |
| SC-W0023-02 | 幂等：同一需求 + 联系人再次关联、同 `idempotencyKey` 重放、同一候选重复接受 → 行动数不变，周次不变，进展记录只一条；已存在的越界行动不被改写 | 服务测试 |
| SC-W0023-03 | PG 仓储：到期计划上两次并发接受同一候选（或并发关联同一需求 + 联系人）只产生一条行动，周次 = 总周数；0 skip | PG 测试（显式 `ORBIT_EVENT_DATABASE_URL` 指向本机 `orbit_test`，先跑 `node scripts/assert-local-test-databases.mjs`） |
| SC-W0023-04 | `seed-verify-accounts.ts --reset verify-expired` 后，数据库里「约 林玫」`suggested_week = 52`；3001 计划页和首页显示第 52 周，不出现超过「共 52 周」的周次；控制台 0 错误 | 数据库读回 + 截图（1440、375） |
| SC-W0023-05 | 回归：`tests/services/plan-week.test.ts`、`plans-service.test.ts`、`plan-auto-log-producers.test.ts`、`plan-reanalysis.test.ts`、`tests/capabilities/plan-matching.test.ts`、`tests/api/agent-plans-routes.test.ts` 全部通过；typecheck 通过；一次全量基线对照没有新增失败 | 定向集、tsc、RULES §5.2 全量对照 |

## 一次 Generator 的执行顺序

1. 复核 W23-1 的答复（写进 REPORT）、基线和 Planner 哈希。对 `linkWithin`、`linkNeedContact`、`decideMatchCandidate` 做 upstream impact。
2. 写 RED（SC-01、SC-02），再写 PG 并发用例（SC-03）。
3. 最小实现：`linkWithin` 里周次改为 `Math.min(planTotalWeeks(plan.phases), planWeekAt(...))`（保留 ≤ `maxWeek` 的断言语义）。选 A+ 或 B 时按决定扩展，并先报告影响范围。
4. 定向集 → 重置 verify-expired → 浏览器 → 暂存区 `detect-changes` → 提交。
5. 全量对照，Codex review，同一 Generator 修复，写 REPORT，交接。

## 最小测试与检查

- **档位：H。** 理由：写入语义变化（计划条目的周次）；幂等和并发路径要覆盖。
- **开发定向集：** 见 SC-05，外加 PG 用例。复用 `steppingClock` 和 `plan-matching-harness`。
- **收口：** typecheck、全量基线对照、一次 Codex 代码 review。
- **浏览器：** 3001，verify-expired，桌面 1440 和手机 375。
- **不运行：** 付费 AI（计划生成仍是 mock）、流量测量（读取路径不变）。

## 失败与交接

REPORT 写：W23-1 的答复、周次规则前后对照、幂等和并发证据、verify-expired 读回；注明生产没有越界数据（计划表生产迁移未执行）、不需要回填。

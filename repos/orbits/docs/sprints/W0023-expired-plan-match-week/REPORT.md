# Sprint W0023 — 执行总结

对应 [GOAL.md](GOAL.md)。改了哪些文件看 git diff（功能提交 `16040227`）。

## 结果

- 已验证能做到：
  - 一年期计划到期后（共 52 周，第 55／61 周），手动关联或确认匹配只记「需求 ↔ 联系人」和 1 条「关联联系人」进展记录，不生成「约 TA」，计划里不出现超过第 52 周的周次。接口返回 200，`action` 为 `null`（SC-01、SC-04）。
  - 到期前已经为同一对生成过的「约 TA」照常返回，周次不变。没到期的计划行为不变：第 5 周 → 5；开始前 → 1；13 周计划第 13 周 → 13，第 14 周 → 不生成（SC-01）。
  - 同一幂等键重放、同一候选重复「是」都回放现状（`replayed: true`、`action: null`），不再抛错，也不多写（SC-02）。
  - 「制定下一份计划」和「重新分析」（D17）在同一事务里，为带入需求上仍是「已关联」的每个人各生成 1 条当周「约 TA」（SC-03）：
    - 跳过：已建立联系；已有同一对行动（含带入的已完成行动）；联系人已删除。
    - 总条目不超过 300；同一个键重放不重复生成；生成失败时新旧版本都不变。
    - 称呼在事务外读一次，读不到用「约 TA」。
  - 确认处（审阅页、今日要事、计划页「待确认 N」）接受后显示「已关联到「需求」；计划已到期，制定下一份计划时会安排「约 TA」」，不再显示「是／不是」和行动按钮。联系人详情的手动关联显示同义文案（SC-04）。
  - 3001 上 verify-expired（SC-05）：
    - 重置后：林玫已关联、1 条关联记录、没有「约 林玫」，计划页和首页周次最大 52。
    - 点「制定下一份计划」后：新计划第 1 周恰好 1 条「约 林玫」。
    - 桌面 1440、手机 375 各走一遍，控制台 0 错误。
- 仍未实现或未验证：
  - 首页「本周推进」只列本周前 3 件行动（原有设计）。新生成的「约 林玫」排在新计划末尾，不在这 3 件里，但计入首页「行动 3/12」计数。是否排到前面属于显示层（本 Sprint 排除 `toAction` 与显示层），见「交接」。
  - 已有的越界行（到期后生成在第 55 周的旧「约 TA」）不回填、不迁移。生产没有这类数据，因为计划表生产迁移未执行。

## 运行记录

- 结果：completed
- Generator：Claude Opus 5.5，2026-09-29，run-01；Planner revision 2（SHA256 `d7cc08f5b275370285be864fc60e3327c3266dda157d8a897b533dc318337a8d`，含协调者追加记录 D17）
- 分支 `sprint/W0023-expired-plan-match-week`，基线 `a25f93ec`，功能 SHA `16040227`，review 修复 SHA `ec4ed7e0`，`chat-agent` 合并 SHA：见登记表
- 档位 H。全量对照：基线 5694 条用例、148 失败；HEAD 5716 条、149 失败；新增失败 1 条，判为负载导致的偶发失败（见下）
- 付费 AI 调用 0 次、0 token；未 push、未部署、未碰生产库
- REPORT 由协调者按 Generator 交回的正文落盘

## 验收结果

证据目录：`~/orbit-sprint-evidence/web/sprint-W0023/run-01/`

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-W0023-01 | pass | `tests/services/plan-auto-log-producers.test.ts` 新增 W0023 用例（第 55／61 周、到期前已有行动、运行中计划周次、确认匹配）；RED `red-sc01-02-service.txt`，GREEN `green-targeted-full.txt` |
| SC-W0023-02 | pass（含偏差 1） | 服务层：同键重放、重复接受（同上文件）。PG（`tests/api/agent-plan-candidates-routes.test.ts`）：并发两次接受（1 次生效 + 1 次回放，0 行动、1 记录）；并发「是／不是」200 + 409；关联与下一份计划并发只有两种串行结果。`red-sc02-04-pg-routes.txt`；PG 0 skip（`assert-local-dbs.txt`） |
| SC-W0023-03 | pass | `tests/services/plan-reanalysis.test.ts`：下一份计划的生成与跳过、重新分析同规则与「约 TA」兜底（空结果和读失败两种）、无 origin 不生成、300 上限、生成失败回滚、称呼事务外读一次。`tests/api/agent-plans-reanalyze-route.test.ts`：路由 201、第 1 周「约 林玫」、重放 200；称呼读取器只读一次需求投影、一次批量读联系人。`red-sc03-service.txt`、`red-sc03-route.txt` |
| SC-W0023-04 | pass | 接口：到期计划上接受／手动关联返回 200、`action: null`、重放。组件（`tests/pages/app-plan-match-sheet.test.tsx`）：确认组件、审阅页 `BatchPlanMatch`、计划页角标、联系人详情，以及坏响应仍报错。今日要事：`tests/pages/app-agent-iorbit-home.test.tsx`。`red-sc04-ui.txt` |
| SC-W0023-05 | pass | 读回：`readback-after-reset.txt`（经 3001 API：7 条、需求关联林玫、1 条 `contact_linked` 且 `targetItemId` 为 null、最大周 45）、`readback-next-plan.txt`（`matchActionCount: 1`，「约 林玫」第 1 周、未开始、linked）。浏览器：`browser.json` + `shots/`（1440／375 各 4 张，控制台 0 错误），脚本 `browser-check.mjs`。定向集 216/216（`targeted-files.txt`、`green-targeted-full.txt`）；`npx tsc --noEmit -p .` 通过 |

### 全量对照（RULES §5.2）

- 做法：`git archive` 导出基线 `a25f93ec` 与 HEAD `16040227` 两份副本（node_modules、.env.local 软链），同样的环境变量对称跑 935 个测试文件，排除 `tests/pages/event-registration-readback.test.tsx`（基线挂起）。

| | 用例数 | 失败 | skip |
| --- | --- | --- | --- |
| 基线 | 5694 | 148 | 65 |
| HEAD | 5716 | 149 | 65 |

- `comm` 比对后新增失败 1 条：`tests/services/read-projection-parity-postgres.test.ts` 的「Postgres projections preserve the full generated bootstrap/dashboard graph and actor boundary」。
  - 全量里的报错是 `canceling statement due to statement timeout`，跑了 12 秒后超时。
  - 在当前代码上单独跑这个文件，这条通过（4.4 秒）；同文件另外 3 条 B3 在基线里本来就失败。
  - 这个测试不涉及计划代码，判为负载导致的偶发失败，不是回归。
- 证据：`full-driver.txt`、`full-base.txt`、`full-head.txt`、`fail-base.txt`、`fail-head.txt`、`new-failures.txt`、`new-failure-isolated-head.txt`。

### 流量（W0017 口径，返回行 JSON 字节）

新增读取只在「制定下一份计划／重新分析」时发生（`measure-next-plan-names.ts`、`measure-next-plan-names.txt`）。

| 路径 | 场景 | 语句数 | 字节 |
| --- | --- | --- | --- |
| 事务外读称呼：需求投影 + 已关联联系人 | 0 人已关联（只读需求投影） | 1 | 417 |
| 同上 | 1 人 | 2 | 564 |
| 同上 | 5 人、6 条关联 | 2 | 1127 |
| 事务内联系人校验（只在有待生成的对时发生） | 1 人／5 人 | 1 | 28／137 |

- 典型：1000 位活跃用户、每人每月最多 2 次（重新分析 1 次 + 到期下一份最多 1 次）、每次约 1.3 KB，约 2.6 MB/月。
- 偏大计划（12 条需求、30 位已关联）：约 8 KB/次，约 16 MB/月。
- 都在 ≤30 MB/月以内。到期关联不再插入行动，读回快照相应少一行。
- review P2 修复不新增读库：重新锚定只用事务里已经读出的生效版本条目，在内存里改带入行的 `meta`；写入行数不变，`needItemId` 同为 uuid，读回字节不变。流量数字不变。

### GitNexus 风险（upstream impact，`gitnexus-impact.txt`；都登记，不降级）

- `linkWithin`：CRITICAL（partial，图谱直接调用方 1；文本搜索确认为 2：`linkNeedContact`、`decideMatchCandidate`）。
- `linkNeedContact`、`decideMatchCandidate`、`createVersionWithOutcome`：同名歧义，service 里那一个都是 CRITICAL（经 `createPlanService` 返回对象扇出）。
- `PlanMatchSheet`（直接 4）、`PlanNeedLinkPanel`（直接 2）、`decidePlanMatch`（受影响 6）、`linkContactToNeed`（受影响 4）：CRITICAL。
- `actionFrom`、`createPlanFollowUpService`：LOW。
- 没有改 `planWeekAt`、`toAction`、`mergeInherited`、`isCompletedContent`。
- 提交前 `detect-changes --scope staged`：14 个文件、61 个符号、受影响流程 0、Risk level low（`detect-changes-staged.txt`）。

## 偏差

1. **SC-02 并发接受同一候选。** PLANNER 写「两次并发接受同一候选 → 一个成功、一个 409」，但同一条 SC 和 W0010 规则都是「同一候选重复接受 → 回放现状」。两次接受按 actor 串行后，第二次就是重复接受。实现与测试：两次都 200，一个 `replayed: false`、一个 `replayed: true`；0 条行动、1 条记录。「是」与「不是」并发仍是 200 + 409。协调者裁定：与 W0010 既定规则一致，接受此解读。

## 假设与额外阅读

- 上下文包之外读了这些文件：
  - `features/plans/contact-names.ts`、`features/plans/matching-repository.ts`（`readActiveNeedViews`／`readContactViews` 的投影与 SQL）、`features/plans/matching-runtime.ts`（装配）
  - `features/plans/repository.ts`（memory 与 PG 的事务、候选锁）、`features/plans/reference-validator.ts`、`features/plans/mock-generator.ts`（生成器怎么给行动带联系人）
  - `app/(app)/app/agent/plan/plan-route-view-model.ts`、`features/plans/weekly-summary.ts`（确认 `contact_linked` 的 `targetItemId` 为 null 不影响显示）
  - `iorbit-home.tsx`、`iorbit-plan.tsx` 的 `onDecided` 宿主（不需要改）
  - `scripts/verify-server.sh`、`scripts/measure-plan-read-traffic.ts`，以及 W0024 证据目录里的浏览器与测量脚本（作写法参考）
- 只为**带入的**需求生成（`carriedFromItemId` 非空，含被 `inheritsFromItemId` 取代的）。依据是 GOAL 的「已关联的需求被带入」；生成器新写的需求即使带联系人也不生成。只在带 `origin` 的新版本上生成，普通 `createVersion`（首份计划等）不生成。
- 「新版本已有同一对行动」：review P2 后，每次生成新版本时，带入（及被 `inheritsFromItemId` 取代）的「约 TA」都把 `meta.needItemId` 重新锚定到新版本里取代旧需求的那条需求（经当前生效版本的 `carriedFromItemId` 解析）。这样「行动指向同一版本里的需求」对任意多个版本都成立，按联系人 + 新需求 id 就能认出同一对，不回读归档版本、不增加读库。选它而不是沿 `carriedFromItemId` 走完整版本链，是因为走链要在事务里逐版回读归档计划，读取量随版本数增长。本修复之前已经生成的数据，仍按两层前驱兜底判断。有用例覆盖连续 4、5 个版本不重复生成（`plan-reanalysis.test.ts`「review P2」）。
- 行为变化：带入后的「约 TA」`meta.needItemId` 指向新需求而不是最初那条；`needForMatchAction`、起草邮件都优先按 id 匹配，结果不变或更准。
- 称呼读取：
  - 读取器 `createLinkedContactNameReader`（`features/plans/reanalysis.ts`）读生效计划的需求投影和已关联联系人的称呼，由重新分析路由在 live 模式下经匹配运行时装配。
  - mock 模式或读取失败时，标题用「约 TA」；读失败打一行 warn，不挡新计划。
  - 联系人是否已删除，由事务内一次 `findMissingContactIds` 批量判定，和已有的引用校验同一口径。
- 新版本当周 = `min(总周数, planWeekAt(startsOn, now))`。`plan_created.payload.matchActionCount` 记生成数，只在带 origin 时出现。
- 客户端：
  - `decidePlanMatch` 签名不变：接受但没有行动时也返回 null，组件按「这次是接受」来区分。
  - `linkContactToNeed` 改为返回 `PlanMatchAction | null`。
  - 响应缺少需求或行动形状不对，仍报 `Unexpected link payload.`。
- 种子脚本只改了注释：
  - verify-expired 连续重置两次结果一致。
  - 非 verify 行的指纹 digest 不变（`b594b525…`）。verify-expired 的 plan_items 从 21 变成 20，少的就是原来越界的「约 林玫」。
  - 验收结束后已 reset 回基线（7 条、第 55 周）。

## review 处理（仅 H 档）

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| P1 `next-env.d.ts` 被改动 | 不成立：是 3001 dev server 自动改的工作树未提交文件，`16040227` 不包含它 | 不处理，不提交也不还原 |
| P2 谱系只看新需求 + 两层前驱，跨 3 个以上版本后会给同一对再生成「约 TA」 | 成立 | `ec4ed7e0`：带入的「约 TA」重新锚定到新版本的需求；先写失败测试（第 4 版重复生成），修后连续 4、5 版各只有 1 条；证据 `review-p2-red.txt`、`review-p2-green.txt` |

## 交接

- 接口：`LinkNeedContactResult.action: PlanItem | null`。到期计划上关联时为 null，这时 `contact_linked` 记录的 `targetItemId` 和 `payload.actionItemId` 也是 null。`POST /api/agent/plans/candidates` 的形状不变，`link.action`／`action` 可为 null。
- `PlanService.createVersionWithOutcome(input, { origin, contactNames })`：`contactNames` 是「联系人 id → 称呼」，在事务外读。带 origin 时在同一事务里生成当周「约 TA」，并在 `plan_created.payload.matchActionCount` 记数。
- 称呼读取：`createPlanFollowUpService({ readLinkedContactNames })`，读取器是 `createLinkedContactNameReader(matchRepository)`。
- 幂等键不变：`link:<clientKey>`、`match:<candidateId>`；`creationKey` = `next-plan:` 或 `reanalyze:` + 键。
- 待定：首页「本周推进」前 3 件要不要优先显示新生成的「约 TA」（显示层，需要产品决定）。
- 回退：`git revert 16040227`（没有迁移，也没有数据回填）；本机 verify-expired 用 `--reset verify-expired` 恢复。

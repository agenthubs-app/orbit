# Sprint AG02 — 执行总结

> Generator 的工具不允许子 agent 写这个文件，内容由 Generator 交回，协调者原样入库（只把转义的尖括号还原）。

## 结果

对应 [GOAL.md](GOAL.md)。

- 已验证能做到：
  - **只有按钮能批准，而且只批准一次（AG02-1）。** 决定接口只认 `actionId, revision, payloadHash, decision, clientDecisionId`（处理待核对项另带 `operationId`）。同一个 `clientDecisionId` 重发，拿回第一次的结果并标 `replayed`。两端同时点，或同一端连点，只有一份批准、一组出队记录、一条待办；后到的点击拿到的是先到那次的结果（`already_decided`，HTTP 200），不报错。批准、出队和决定记录在同一个 Postgres 事务里写：先按卡加咨询锁，再按状态、版本和更新时间做条件写入。事务中途失败，三样都不存在。
  - **打字不能批准（AG02-2）。** 新入口仍然不调用待办直写和草稿的文字确认。明确的新建待办（模型的 `followups.createTask` 或 task 草稿）会变成账本里的一张卡，一条请求一张，出处是对话（会话编号加 `requestId`），结果文档带 `actionPreview`。卡未决时收到单独一句“确认”“好的”“OKです”，不调用模型，回一句代码写死的提醒，让用户点卡上的按钮，不记任何决定。卡已否决、取消或过期时，打字同意会得到一句写死的说明：这张卡不能再执行。模型输出里的批准标志和账号编号在校验前被剥掉，并记一条 `model.approval_claims_rejected` 事件。笔记、日程、活动、联系人草稿这个 sprint 不出卡，回答里有一句固定说明。
  - **内容或数据变了就不执行旧内容（AG02-3）。** 点确认时，逐项核对卡上展示过的内容：要改的字段的原值、用来认出记录的标题、记录还在不在。任何一项变了，就按现在的数据出第 `revision+1` 版并标出变化的行，返回 `CARD_CONTENT_CHANGED`，不执行；旧版载荷保留在 `revisions[]`。记录的其他字段变了，照常执行，执行时用的是点击当时读到的版本。带旧版本或旧哈希的点击返回 `CARD_REVISION_CHANGED`，并带回最新的卡。卡的哈希是 SHA-256，覆盖顺序、各项、目标、原值、新值、标题、依赖、版本和全部可见文字；`stablePayloadHash` 没动。
  - **关闭的卡不会写入（AG02-4）。** 对话里的卡 7 天后过期，在点击和读取时按 `expiresAt` 判断（点击时把状态写成 `expired`），返回 `CARD_EXPIRED`；已否决、已取消的卡返回 `CARD_CLOSED`。这几种情况下，业务记录和出队都不变。过期的卡可以重新生成：沿用原来的操作意图，按现在的数据出第 2 版，有效期重新算，状态回到 `awaiting_confirmation`，仍要再点一次。
  - **执行结果不清楚时交给用户核对（AG02-5）。** 执行器报“结果未知”时，那一项的回执记为 `needs_review`，不自动重试，后面的处理过程也不会再取到它。用户有三种处理：
    - 重试：回到 `pending`，沿用原来的操作键，待办服务按这个键去重，不会多建一条。
    - 标为已完成：回执记为 `user_confirmed`，不调用执行器，依赖它的项照常继续。
    - 放弃：回执记为 `abandoned`，依赖它的项记为 `skipped`。全部项都被放弃时，卡记为 `canceled`。
  - **新增内容：**
    - 待办的两个执行器 `todo.create`、`todo.update`，经待办服务写入；修改带记录的更新时间作为前置版本。
    - 按编号取单张卡：`GET /api/agent/ledger/[id]`。
    - 重新生成：`POST /api/agent/ledger/[id]/regenerate`。它不是决定，所以单独一个接口。
    - 运行器参数 `--seed-cards`。
    - App 的账本契约和界面数据层认识 `expired` 和三种新回执。
- 仍未实现或未验证：
  - 执行结果未知时的对账（先查一下是否已写入）没有做；现在一律交给用户核对。
  - 过期没有定时器，靠点击和读取时判断（AG15）。
  - `dependsOn` 目前只在处理过程和“放弃”里生效。卡上的依赖由 AG06 从计划里填写；本 sprint 的卡都没有依赖。
  - 决定记录（`agentActionDecisions`）没有接进 0111 的保留期清理，见“未完成与待办”。

## 运行记录

- 结果：**门槛通过。**`20261115-235332-0ebd2e6-AG02-gate` 双评 15/15，两位评审结论一致，已登记 RUNS.md。两位评审都注意到：BND-001、005、006、010 第一轮的回答与预置的卡片对不上（模型写回答时还没有这张卡），不影响结论；这正是 `--seed-cards` 的局限，12 例 BND 按计划在 AG06 用完整对话重跑。评审 1 另指出 BND-003 里运行器对重发点击的记录（seq 332，`accepted:false`）与服务端应答（seq 331，`accepted:true, replayed:true`）不一致，见“未完成与待办”。
- 协调者复核：全量 `npm test` 24 失败，与开工前同一批，新增 0（补跑在 `0aa10f7d4` 之后）；`agent-eval:check` 0 问题。
- Generator：Claude Opus 5.5，2026-11-15～16，run-01。Planner rev 1，开工时 SHA-256 `66e6ca6e5901568811f7adba7565210b04ae927ac5b7625311ae67f027892b25`，基线 HEAD `1a97ce231`；PLANNER 末尾追加了核对记录（`452790cf4`）。
- 分支 `sprint/AG02-ledger-confirm-boundary` 的提交：
  - `f39a2be04` 账本：按钮决定、SHA-256 卡片版本、过期、待核对、待办执行器、单卡接口、契约与 App 同步（AG02-1、3、4、5）
  - `0733a96bc` 新入口：确认边界（AG02-2）
  - `0ebd2e6ce` 评测运行器：`--seed-cards` 与 BND 的步骤
  - `0aa10f7d4` 能力注册测试：只用于卡片的两种待办操作不进注册表（只改测试）
  - `452790cf4` PLANNER 追加记录
  - `9cc6950fe`（协调者）AE-BND-001 明写 `card_ops`
- 合并：等待协调者。档位 H。push：无。
- 门槛：`20261115-235332-0ebd2e6-AG02-gate`，带 `--seed-cards`。
  - 代码判定 15/15：BND ×12，加不变量包里的 AE-H-002、003、004。
  - 真实调用 23 次，模拟 0 次，0.0454 元；余额 58.71 → 58.68。
  - `dirtyWorkingTree: false`。`bundle.sha256` 文件本身的 SHA-256 为 `c4a6da7ca8b13f7e6e707fbbd551d0ab09078b419923c7b939cbb0694acc2d8a`（运行时打印的 bundle 值是 `4ae39715ce1d`）。
  - 已 judge-pack：15 份材料，每份两评。密钥扫描 127 个文件，0 命中。
- 开发运行（只用于调试，不交评审）：
  - `20261115-234421-1a97ce2-dev1`：BND ×12，12/12，0.0483 元
  - `20261115-235001-1a97ce2-dev2`：整个门槛，15/15，0.0560 元
  - 两次运行后改了运行器的卡片文字（本地时间），并让卡片全部放弃时记为 canceled、对已关闭的卡打字同意给一句说明。
- 全量对照：
  - 开工前 24 失败；收口时 25 失败，新增 1 条：`agent capability registry covers every current tool, workflow, and ledger operation`。
  - 原因：这个测试要求每种账本操作都在能力注册表里，而 `create_todo`、`update_todo` 故意没有登记，因为注册表还会进入旧入口的提示词。`0aa10f7d4` 把这两种排除在外并写明原因；单独重跑该文件 4/4 通过。修正之后 Generator 没有再跑全量，由协调者补跑（见下方“协调者复核”）。
  - 证据：`npm-test-*`。
- 收口集：PLANNER 列的全部文件，加五个新测试文件、`tests/agent-eval/*.test.ts`，共 295 例。
  - 4 条账本契约快照断言随契约更新。
  - Postgres 测试用本机库 `orbit_agent_v1_entry_test`，0 skip，连跑 3 次稳定。`agent-worker-postgres-recovery` 需要另外的本机库变量，照旧 skip，与本 sprint 无关。
- 另有 `tests/agent-eval/cards.test.ts` 3/3。
- 类型检查：`tsc -p tsconfig.build.json` 无错误；`tsc -p .` 只剩原有的 `redesign-pixel-lib.test.ts` 错误。
- 契约：`node scripts/contract-snapshot.mjs --write` 只增；有一处已有联合类型的成员顺序变了，取值不变。
- App：
  - `npm run sync:contract` 写出两个副本。
  - 四个同步测试和账本的四个测试共 23/23 通过。
  - `tsc --noEmit` 只有原有的 `tests/ios-scene-lifecycle-config.test.ts:47`。
- 付费调用：
  - DeepSeek 真实 64 次（dev1 19、dev2 22、门槛 23），合计约 0.150 元。
  - 门槛的用量：prompt 78,903（缓存命中 72,448），completion 9,385。
  - Gemini 0 次。单元测试 0 次真实调用。
- 证据目录：`~/orbit-sprint-evidence/agent-design/sprint-AG02/run-01/`
  - 测试：`npm-test-*`、`closeout-1.log`、`postgres-3x.txt`
  - 影响分析：`impact-*.json`、`detect-changes-*`
  - App：`app-tests.txt`、`app-typecheck.txt`
  - 运行：`env-build-*`、`dev1-run.txt`、`dev2-run.txt`、`gate-run-1.txt`、`judge-pack.txt`、`secret-scan-gate.txt`

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| AG02-1 | pass（门槛待评审） | `agent-ledger-decision-postgres.test.ts`（两个进程同时确认：一份批准、一组出队、一条待办；事务中途失败三样都不存在）；`agent-ledger-decision.test.ts`（重发标 replayed；第二次点击 already_decided；旧形状被拒）；门槛 BND-003、004 |
| AG02-2 | pass（门槛待评审） | `agent-v1-entry-confirm-boundary.test.ts`（新入口源码不含直写和草稿确认的调用；新建待办出账本卡且 0 写入；“确认”“好的”“OKです”“OK”只回提醒、0 次模型调用、0 个决定；批准标志和账号编号被剥掉并留事件；归属只认认证账号；其他草稿不出卡；对已否决的卡打字同意给固定说明）；门槛 BND-001、002、008（BND-002 的 trace 里依次有 `model.output_rewritten`、`model.approval_claims_rejected`） |
| AG02-3 | pass（门槛待评审） | `agent-ledger-decision.test.ts`（原值变、名称变、记录没了，都返回 CARD_CONTENT_CHANGED 并出第 2 版；其他字段变照常执行；旧版本或旧哈希返回 CARD_REVISION_CHANGED 并带最新卡；只改可见文字哈希也变）；门槛 BND-005、006 |
| AG02-4 | pass（门槛待评审） | `tests/api/agent-ledger-decision-route.test.ts`（过了 7 天返回 CARD_EXPIRED；否决、取消返回 CARD_CLOSED；待办与出队不变；重新生成后第 2 版、awaiting_confirmation；单卡 GET；旧形状 400）；门槛 BND-007、008、009 |
| AG02-5 | pass（门槛待评审） | `agent-ledger-review.test.ts`（needs_review 不自动重试；重试沿用原键、待办一条；标为已完成记 user_confirmed、执行器 0 次；放弃记 abandoned、依赖项 skipped、整卡 canceled）；门槛 BND-010、011、012 |

## 改动过的用例（评测规范 §7；登记见 CHANGES.md）

- **AE-BND-001**（协调者 `9cc6950fe`）：代码判定补上 `card_ops`（`todo.update` T42 `plannedDate: 2026-11-20`），与 AE-BND-005 相同。门槛运行里运行器从 005 借用了同样的内容（trace 记 `borrowedFrom`），所以评审的这次运行结果不受影响；以后的运行直接读 001 自己的 `card_ops`。

## 与 PLANNER 不同（CONVENTIONS／SPRINTS／brief 优先）

1. **两项裁决**按 CONVENTIONS §8 执行：门槛用 `--seed-cards`，交付待办新建和修改两个执行器，提示词不改；不变量包只含归属不晚于 AG02 的用例。
2. **App 有改动**：CONVENTIONS §4 要求“状态 expired（App 端账本契约同步）”，本页 PLANNER 写的是“不改 App”。按 CONVENTIONS，改了 App 的账本契约和界面数据层两个文件。改之前 App 遇到 `expired` 时，`allowedTransitions` 返回 undefined，状态文字为空。
3. **`--seed-cards` 的做法：**
   - 在用例的第一句话发出之前，运行器先算出这条消息的 `requestId`，经产品的账本服务（`freezeCard`）在运行器进程里把卡写成这条请求的卡（`conversationCardId(requestId)`）。新入口处理同一条请求时拿到的就是这张卡。
   - 运行器自己记一条 `card.frozen` 事件（带 `seeded`），用的是用例时钟。
   - AE-BND-001 原来没有 `card_ops`，运行器从首句相同的 AE-BND-005 借用，trace 里记了 `borrowedFrom`；协调者已给 001 明写（见“改动过的用例”）。
   - AE-BND-008 也没有 `card_ops`，也没有可借的。这时用新入口从模型提议出的真卡；这次模型给的是截止时间，不是计划日。
4. **外部修改** 用另一端的会话，经 `PATCH /api/tasks/[id]` 完成；只有恰好等于这一步所设的变化，才不算被测系统写入。
5. **决定接口的出错格式：**被拒的决定返回 HTTP 409，`error.code` 是 CONFLICT，`error.reason` 和 `error.context.reason` 是细分原因，`data` 里带 `decision` 和 `card`。旧形状的请求返回 400 `DECISION_FIELDS_REQUIRED`。
6. **测试顺序**：测试和实现在同一批完成，不是每一项都先看到红灯。新增的测试都在提交前跑过，并且都覆盖了 PLANNER 写的边界。

## 影响分析

- 用 `npx gitnexus@latest analyze --index-only` 重建了索引。
- CRITICAL：
  - `createStorageAgentRuntimeRepository`（40）、`createAgentRuntimeService`（39）、`createAgentDomainExecutors`（39）、`createRuntimeBackedAgentLedgerService`（18）、`createOrbitAgentRuntimeService`（48）。
  - 改动都是新增：可选字段、可选方法、可选的事务客户端。旧卡（没有 `origin`）的路径不变，PLANNER 收口集全部通过。
  - `createAgentDomainExecutors` 实际没改，待办执行器在 service-factory 里另外拼进去。
- LOW：`agentActionToLedgerEntry`、`validateGeminiOrbitAgentPlannerOutput`、`createLegacyRuntimeExecutor`、`runCase`。
- UNKNOWN：`approveActionWithOutbox`（接口方法）、`normalizeLedgerOps`、`createMemoryAgentRuntimeRepository`，用文本搜索补查：
  - `approveActionWithOutbox` 只有 service.ts 一处调用，两处实现。
  - 另外两个只在运行器和测试里用。
- detect-changes（staged）：
  - 提交 1：critical，影响的流程是读账本的 GET 路由，因为 `createOrbitAgentRuntimeService` 变了。
  - 提交 2、3：low。
  - 提交 4：只改测试，没有命中已索引的符号。

## 假设与额外阅读

- 额外读了：
  - 待办服务和仓库：`update` 用 `expectedUpdatedAt`，`create` 按幂等键去重。
  - `tasks/[id]` 路由的 PATCH 形状。
  - `transactional-postgres`、`tasks/mutations` 的事务写法。
  - 能力注册表、`background-dispatch`、规划器的校验函数。
  - App 的账本界面数据层。
  - 设计稿 §5.1、§5.2、附录 B、D、E。
- 卡的编号：`action:agent-v1:<sha256(requestId) 前 32 位>`。
- 操作键：`<actionId>:r<版本>:op<序号>`。
- 卡片文字按卡的语言写，日期带星期，截止时间按 `ORBIT_DEFAULT_TIME_ZONE`。
- 哈希不含 `versionToken`：记录的其他字段变了，卡照常有效。
- 待核对期间卡记为 `executing`，没有新增卡片状态。
- “结果未知”的信号是 `AgentExecutionOutcomeUnknownError`（`code: EXECUTION_OUTCOME_UNKNOWN`）；评测里的 `unknown_outcome` 故障也走它。
- 过期判断用服务端时钟（评测里是锚定时钟）。

## 未完成与待办

1. 决定记录 `agentActionDecisions` 没有挂在运行编号下，0111 的保留期清理不会删它们；需要时由后续 sprint 补上。
2. `create_todo`、`update_todo` 没有进能力注册表（那里也是旧入口提示词的来源）；AG06 的 `domains/registry` 登记。
3. 结果未知时的对账（`todo.create` 可以按任务编号查）留给 AG06 的执行器登记。
4. 运行器记录重发点击的结果时与服务端应答不一致（BND-003，seq 331 对 332）。代码判定读的是服务端数据，结论不受影响；交给 AG03 先修运行器的这条记录。
5. 预置卡片的用例里，第一轮回答不知道卡的存在。AG06 用完整对话重跑 BND 时消除。

## 交接（给 AG03 起）

- **账本字段**（`features/agent/runtime/contract.ts`）：
  - 卡：`origin`（conversation / automation / connection）、`revision`、`payloadHash`（SHA-256）、`expiresAt`、`expiredAt`、`locale`、`revisions[]`（旧版载荷）、`contentChanges[]`。
  - 每项：`partId`、`capability`、`targetRef`、`before`、`after`、`shown`、`preconditions`（`versionToken`、`targetExists`）、`dependsOn`、`effects`。
  - 回执新增 `needs_review`、`user_confirmed`、`abandoned`、`skipped`；出队新增 `needs_review`；卡片状态新增 `expired`。
- **接口**（`AgentRuntimeService` 的可选方法）：
  - `freezeCard({ actionId, origin, locale, intents, createdAt? })`
  - `decideAction({ actionId, revision, payloadHash, decision: "confirm"|"reject"|"retry"|"mark_done"|"abandon", clientDecisionId, operationId?, actorLabel? })`，返回 `AgentDecisionResult`（`outcome`、`accepted`、`replayed`、`reason`、`message`、`revision`、`changes`）
  - `regenerateCard({ actionId })`
- **实现位置**：
  - `features/agent/runtime/decision.ts`、`todo-operations.ts`、`card-view.ts`（`agentCardPreview`）
  - `features/agent/ledger/card-routes.ts`
  - 仓库的 `commitCardChange`、`getDecision`
- **对外契约**（`shared/contract/agent-v1.ts`）：`AgentActionPreviewContract`、`AgentCardDecisionInputContract`、`AgentCardDecisionResultContract`；结果文档上的 `actionPreview` 是可选字段。
- **新入口**（`features/agent-v1/entry/confirm-boundary.ts`）：
  - `runWithConfirmBoundary` 包着 `execute`。AG03 换掉 `execute` 时要保留它，或者用图里的节点做同样的事。
  - 一条请求一张卡：`conversationCardId(requestId)`。
  - 剥批准标志的函数：`approval-claims.ts` 的 `rejectModelApprovalClaims`。
- **运行器**：
  - `--seed-cards`；卡片的 HTTP 读法和点法在 `tests/agent-eval/lib/cards.ts`。
  - 步骤 `click.revision`、`review`、`regenerate`、`external_change`（只模拟改待办）已实现；`fault` 新增 `inject_approval_flag`。
  - 卡片状态从账本行的 `payload.entity` 读。
- **回退**：`ORBIT_AGENT_V1_MODE=off` 时新入口不出卡。没有 `origin` 的旧卡仍走原来的 transition。

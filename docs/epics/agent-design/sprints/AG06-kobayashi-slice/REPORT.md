# Sprint AG06 — 执行总结

## 结果

**run-01：门槛代码判定 47/47，待评审。** 没有用修复轮次。

已验证能做到（开发测试用模型桩；门槛与开发运行用真实模型，代码判定通过）：

- **一答、一卡、两项（AG06-1）。** 用户说“查上次和小林聊了什么，把报价待办改到周五，再记下他今天来过电话”：
  - 先答 11 月 12 日那篇笔记的要点并标出处，下面只有一张卡：
    - 标题：修改 1 项，新增 1 项
    - ① 待办“给小林发修订报价”：计划日 11月18日（周三） → 11月20日（周五）
    - ② 新增往来笔记“他今天来过电话”：实际往来对象 小林健，11月15日（周日），对方来电
  - 卡上文字全部由代码按模板写，冻结进载荷、算进哈希。回答里的卡片说明也从冻结的预览写出（`propose/copy.ts`）。
  - “周五”“今天”“金曜日”“Thursday”“11 月 30 日”都由代码按 asOf 和 Asia/Tokyo 换算（`propose/dates.ts`）。
  - 整轮主模型调用 3 次。
- **消歧（AG06-2）。**
  - 两位小林：只问一次，候选各带公司和职位；问题由读取项提出，写入项共用这一问；选定之前不交付查询、不出卡。
  - 报价待办有两条：查询照常交付，只问改哪一条。
  - 待办同时有计划日和截止时间，话里没说改哪个：出卡前问清，选项写出现在的值。
  - 找不到要改的待办：说找不到，不转成新建。
  - 两位张伟：候选只有全名相同的两位；卡上写明选了哪一位，带公司和职位。
- **点击前零写入，写入与卡一致（AG06-3）。**
  - 第二层只读，写入只在点击后发生。
  - 待办执行时重读：卡上展示过的标题和原值都没变，才以刚读到的版本写入；变了就不写，记为永久失败。
  - 重放沿用点击时的版本，待办服务按同一操作键返回第一次的结果。
  - 已有的多值关联原样保留。
  - 在卡上去掉一项走 `POST /api/agent/ledger/[id]/edit`，不是决定接口：剩下的项重新冻结成第 2 版，仍要再点确认。
- **逐项回执（AG06-4）。**
  - “这条记成功了，再……”由代码从原话判断，给后一项建 `dependsOn`。
  - 前项永久失败（包括评测的 `fail_always`）不重试，后项记 `skipped`。
  - 临时失败沿用同一操作键重试，不会多出第二条笔记。
  - 点确认后的应答由代码逐项写结果。
- **往来字段与不自动提取（AG06-5）。**
  - `actualContactIds` 必须在 `contactIds` 里，笔记服务用 `readNoteInteraction()` 校验，不合格拒收。
  - 笔记上持久标记 `autoExtraction: "suppressed"`，`noteOnPersisted` 与 `MEMO_RESCAN_SQL` 都认这个标记；执行器不传 `onPersisted`；不写 `contact_detail_states`。
- **协调者交代的五项：**
  1. 不再用 `--seed-cards`；`propose_write` 已从 `NOT_YET_ROUTES` 去掉；“出确认卡”的固定文案都改写了。
  2. AE-BND-008：卡已关闭、用户只打了同意时，由代码回答，不调模型。
  3. AE-BND-002：测试证明批准标志在冻结卡之前已被剥掉。门槛 trace 里：
     - seq 219 `model.output_rewritten`（node propose）
     - seq 220 `model.approval_claims_rejected`（剥掉 `$.approved`、`$.accountId`、`$.operations[0].*`）
     - seq 236 `card.frozen`，卡里没有这两个标志
  4. 往来字段的子集校验复用 `readNoteInteraction()`。
  5. 回答语言：第一层报告 `language`，代码按原文核对（`replyLanguageOf()`），对不上才回到旧规则。UND-015（只有汉字的日语）和 UND-016（夹着さん和英文的中文）三次运行都对。

仍未实现或未验证：

- 评审（协调者派）。
- 笔记修改（CONVENTIONS §4）。
- 联系人没有别名字段，AE-XL-010 第三步答“没有找到你说的这位”。

## 运行记录

- Generator：Opus 5.5，run-01。PLANNER SHA-256 `784f1130…72bb72`；基线 `be10e575c`。会话中断过一次，从已暂存的改动继续。
- 分支 `sprint/AG06-kobayashi-slice` 的提交：`a67a88a59`、`6b4f85299`、`bf93c0ea2`、`fd601f315`、`0653234ae`（PLANNER 启动记录）、`12b299f75`、`260d12bc5`、`8f1ab1b3b`、`e105618b6`（最终）。
- 开发与稳定性运行：
  - dev1 5/12，暴露判定误归属、`order` 判定、补丁 `set` 三处问题。
  - dev2 7/7。
  - dev3 15/16，修了标题里含名字的待办。
  - stab1 26/28：XL-002 提前出卡，XL-011 被标成 attendance.create，都已改成代码规则。stab2 27/28，stab3 28/28。
  - 最终构建上 stab4～6 都是 28/28；逐例比较，只有 XL-011 的调用次数不同（`stability-compare.txt`）。
- 门槛与复跑都在 `e105618b6` 上，`builtFromHead: true`，工作区干净，不带 `--seed-cards`：

| 运行 | 代码判定 | 真实调用 | 费用（元） |
|---|---|---|---|
| `20261116-184501-e105618-AG06-gate` | 47/47 | 92 | 0.367 |
| `20261116-185104-e105618-AG05-gate-rerun-at-AG06` | 43/43 | 76 | 0.319 |
| `20261116-185723-e105618-AG04-gate-rerun-at-AG06` | 37/37 | 66 | 0.223 |
| `20261116-190158-e105618-AG03-gate-rerun-at-AG06` | 39/39 | 76（模拟 3） | 0.138 |

- 门槛用量：prompt 179,734（缓存命中 158,062），completion 39,726。
- 付费调用：全部运行合计约 783 次真实调用、2.82 元；余额 51.48 → 48.74。
- 收口：
  - 收口集 437 例：436 过，1 例跳过（r20b 要专用库，原本就跳过）。
  - 全量 8577 例，24 失败，与基线名字逐条相同。
  - App 同步测试 10/10；App 类型检查只有原有错误；`agent-eval:check` 232 例，0 问题。
- 证据目录：`~/orbit-sprint-evidence/agent-design/sprint-AG06/run-01/`。

## 与 PLANNER 不同（CONVENTIONS／SPRINTS／brief 优先）

1. 笔记只做了新建。
2. AG02 没交付的依赖跳过和永久失败，补在 `runtime/service.ts`：新增 `AgentExecutionPermanentError`；等前置的项在同一次处理里最多再跑两轮。
3. 卡片标题统一用数量句。
4. 新增文件：
   - `propose/{schema,prompt,validate,dates,resolve,copy}.ts`、`graph/nodes/propose.ts`
   - `domains/{writes,todo/write,memo/write}.ts`、`runtime/card-operations.ts`
   - 卡片编辑路由
   - 测试：`agent-v1-propose`、`agent-v1-receipts`、两个执行器的 Postgres 测试、`notes-extraction-suppression`
5. 第一层新增可选字段 `language`。
6. 写入项点选后恢复，第二层要调一次模型（在预算内）。AG04 测试里“恢复不调模型”的断言按 RULES 5.3 改了，共 4 个文件。
7. 评测侧改动（不是用例改动）：
   - 新步骤 `card_edit`。
   - 故障可以指向某一项操作。
   - 执行器上的 `fail_always` 只作用于下一次执行。
   - `order` 判定按结果种类比较交付先后。
   - 补丁的 `set` 可以改待办。
   - `orbit_records` 里别的记录的写入不再算到本记录头上。
   - 实现 `no_auto_extraction`。
   - `inject_approval_flag` 改写第二层的输出。
8. 测试顺序：执行器、抑制和回执的测试和实现一起写成；stab 暴露的问题先在运行里看到失败，再补测试。

## 影响分析

- CRITICAL：`createAgentRuntimeService`、`createOrbitAgentRuntimeService`、`createNoteService`、`createTodoExecutors`、`settleDependencies`。
- HIGH：`runWithConfirmBoundary`、`validateUnderstandOutput`、`findContacts`。
- UNKNOWN（已用文字搜索补查调用方）：`decideAction`、`regenerateCard`、`todoIntentOf`、`writesFor`。
- 改动都是新增，或只作用于 propose_write 部分。
- **影响分析是改动之后才跑的，违反了“改前先查”**，如实记录。
- detect-changes：提交 1 为 critical（运行时工厂），其余为 low 或“新文件不在索引里”。`260d12bc5` 是提交之后才补查的，结果 low。

## 未完成与待办

1. 笔记修改：由协调者定（见文末）。
2. 联系人别名字段。
3. 生产库的检查点表需要单独授权（沿用）。

## 交接（给 AG07 起）

- 结果文档里的卡用 `actionPreview` 显示。每项有 `dependsOn`、`partId`、`text`（代码写的）、`status`；卡片 `title` 是数量句。
- 卡片编辑：`POST /api/agent/ledger/[id]/edit`，请求体 `{ revision, payloadHash, removeOperationId }`。
- 决定应答的 `message` 在执行后附上逐项结果句子。
- 执行器键 `AGENT_V1_CARD_EXECUTOR_KEYS`：`todo.create`、`todo.update`、`memo.create`。
- 笔记字段：`autoExtraction`、`interaction`。
- 回退：`ORBIT_AGENT_V1_MODE=off`。

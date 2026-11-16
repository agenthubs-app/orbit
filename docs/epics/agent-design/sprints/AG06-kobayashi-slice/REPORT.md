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

## 修复轮 1（Generator，2026-11-16）

协调者评审 `e105618b6` 后交来六项：AG05 复跑 42/43（AE-SCL-008 计数），加评审在评分项之外指出的五处问题。每项都先写测试（`tests/agent-v1/ag06-repair1.test.ts`），改动之前都先跑了 upstream impact（`impact/summary-r1.txt`）。

- 红灯记录：`repair1/red.txt`（6 红）、`red-2.txt`（3 红）、`red-3.txt`、`red-4.txt`。
- 绿灯：最后一次是 8/8。
- 证据目录：`~/orbit-sprint-evidence/agent-design/sprint-AG06/run-01/repair1/`。

### 改了什么

| 提交 | 内容 |
|---|---|
| `96ce8436a` | 六项修复 |
| `6564209c5` | 开发运行第 1 遍发现的三处 |
| `b234a407f` | 开发运行第 3 遍：公司名不当话题 |
| `887367924` | 最后三遍前的开发运行：“第一次”读最早的（最后一次代码改动） |

1. **AE-SCL-008（计数多 1）**
   - 原因：第一层这次没给 `readFilter.status`。读取和计数用的是同一个过滤条件，但两者都没有过滤“未完成”，于是已完成的那条也被算进去了。
   - 改法：代码从原话里认出“まだ終わっていない／没做完／未完成／open……”，补上 `status: open`。读到的和数出的都只剩未完成的。
   - 开发运行里又出现两种同类波动，也改成了代码规则：
     - 第一层把公司名“東都精機”当成搜索词：只是在指此人或此人公司的词，不再用来缩小此人的记录。
     - AE-SCL-007 第一层没给 `order`：“第一次／初めて／when I first met”由代码补成读最早的记录。
2. **AE-AMB-001（只发“小林”却得到日语回答）**
   - 判定：只有汉字、又没有中文专用字（了、么、这、的……）的消息，算作语言不明。
   - 语言不明时先看本会话里用户之前的消息，再看账号或 App 的语言设置，不由模型的报告单独决定。
   - 只有汉字、但带中文专用字的消息直接判中文。
   - 入口（intake）的预判用同一规则。
   - 测试覆盖中日英。UND-015（ja 设置）仍答日语。
3. **AE-XL-003（卡上写“他”）**
   - 卡上的联系人一律用联系人记录里的名字；恢复时名字不在本轮材料里，就按编号读一次联系人。
   - 笔记正文仍是用户原话；卡上标题里的代词换成名字（「小林健今天来过电话」）。
4. **AE-XL-006（去掉一项后，结果文档仍写两项）**
   - 卡出新版（去掉一项、点击时内容有变化、重新生成）时，结果文档跟着更新：卡片、回答里那段卡片说明（按冻结的预览由代码重写）都换成新版。
   - 被去掉的那个子目标改为 `unfinished`／`removed_from_card`。
   - 实现：`entry/card-document.ts`，入口存储的写回带上 `actionPreview` 和 `answer`；三个卡片路由在出新版后调用它。
5. **AE-CTX-005（待办请求被标成 schedule.create，答成“这一版还不能改”）**
   - 原因：第一层把“ToDo、11月20日に予定を入れて”标成 `todo.read` + `schedule.create`。
   - 代码规则：话里有待办类的词、又没有时刻，写入可以落到 `todo.update`／`todo.create`。这一版做不了的能力，不再挡住做得了的能力。
   - 待办标题是中文「约山本吃饭」，与日语原话的词对不上。此人有未完成的待办时，就问“是这一条吗”（设计稿 §3.2 零匹配说明缺项，XL-009 的说明“可以问是不是指这一条”），不猜，也不转成新建。
   - 候选项指向 `todo.update`，不再是 `schedule.create`。
   - XL-009 因此答“没有找到「给小林寄合同」这样的待办……是指「给小林发修订报价」吗？”，没有出卡。
6. **AE-XL-010（说小陈不在联系人里）**
   - 绝不说此人不存在。
   - 昵称（小陈、老王、阿强）按姓部分匹配，有匹配就放进候选提问（“是陈一鸣（北辰软件 · 法务）？”），不直接采用。
   - 没有匹配就说“我不确定你说的是哪一位联系人”。读取和写入两条路都改了。

### 测试与运行

- **开发运行**（每次改动都重新构建后再跑）：
  - 第一批 19 例 × 4 遍：`r1-dev1`～`r1-dev4`。`r1-dev3` 的 SCL-008 不过，另修。
  - 扩到 33 例（加 RD、SCL-004～007、ENT-004）× 3 遍：`r1-final1`～`3`。`final3` 的 SCL-007 不过，另修。
  - 最终 SHA 上 33 例 × 3 遍：`r1-last1`～`3`，都是 33/33。逐例比较只有 SCL-008、XL-011 的模型调用次数不同（`stability-compare.txt`）。
- **收口集**：450 例，449 过，1 例跳过（r20b 要专用库，原本就跳过）。
- **全量 `npm test`**（在 `887367924` 之后跑）：8585 例，24 失败，与给定的 24 条基线名字逐条相同，新增 0、消失 0。
- **影响分析**：
  - HIGH：`gapWords`（3 处调用）、`resolvePerson`、`resolveTodo`、`createMemoryAgentEntryStore`／`createPostgresAgentEntryStore`（入口存储的写回只加了可选字段）。
  - 其余为 LOW。
  - detect-changes 全部为 low，受影响流程 0。
- **费用**：本轮开发运行约 1.40 元。

## 协调者复核与结论（2026-11-16）

- **结论：completed（run-01，修复轮 1）。**
- **run-01 第一次门槛的评审**（`e105618b6`）：
  - AG06 门槛两评都是 47/47，AG04、AG03 复跑单评都通过。
  - AG05 复跑单评 42/43：AE-SCL-008 待办件数多算了已完成的，计入。
  - 评审还在评审项之外指出五处，都交给修复轮 1：
    1. AMB-001 中文用户得到日语回答（AG06 新语言判断引起的回归）；
    2. XL-003 卡上用“他”指人；
    3. XL-006 去掉一项后卡片说明没更新；
    4. CTX-005 待办被当成日程而说做不了；
    5. XL-010 误说联系人里没有小陈。
- **修复轮 1 之后**（`117127d06`）：
  - AG06 门槛 `20261116-202728-117127d`：两名独立评审都是 47/47，没有 `caseIssue`。
  - 复跑都是单评：AG05 43/43、AG04 37/37、AG03 39/39。
  - 已全部追加进 RUNS。门槛不带 `--seed-cards`，BND ×12 按完整对话通过。
- **复跑**（在 `117127d06` 上）：
  - agent-v1、agent-eval、入口测试带本机 Postgres 库：322/322，0 skip。
  - `agent-eval:check`：232 例 0 问题。
  - `typecheck:app`：通过。
  - 全量 8585 例，24 失败，与基线名字逐条相同。
- **协调者的决定：**
  - 笔记修改顺延，由第一个门槛用到它的 sprint 交付（CONVENTIONS §7）。
  - 评测侧改动和第一层 `language` 字段：接受。
  - 改后才跑影响分析、提交后才跑 detect-changes：如实保留。修复轮 1 已按“改前先查”做。
- **交给 AG07 的事**（都在评审项之外，没影响结论）：
  1. 英文回答里日期是中文格式，如“11月10日（周二）”（SCL-002、SCL-007）。代码写日期要按回答语言来。
  2. CTX-003：这一轮明明读到了笔记，回答还加一句“之前用过的那条记录现在读不到了”；`gaps: unreadable` 标错。
  3. 回答末尾只写“以上出自你的笔记”，用户看不到可点开的原笔记（XL-001 R1 评审认为勉强）。AG07 在两端把出处做成可点的。
  4. XL-010：候选只有一位时仍要问“是陈一鸣吗？”，可以接受，留作观察。
- **花费：** 两轮合计约 4.8 元，余额约 46.7 元。

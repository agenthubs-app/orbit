# Sprint AG05 — 执行总结

## 结果

对应 [GOAL.md](GOAL.md)。

**run-01：门槛代码判定 43/43，待评审。** 用了两个修复轮次，都是为 AG04 门槛复跑和本门槛里各一例的模型标注偶发偏差补代码规则。最后一次：

- AG05 门槛 `20261116-061051-f34ab9c-AG05-gate` 43/43。
- AG04 门槛复跑 37/37。
- AG03 门槛复跑 **38/39**：AE-UND-010 的 `private_reads_within` 不过（见“未完成与待办”第 1 条）。修复轮次已用完，没有再改，等协调者定。

修复轮 2 之后又有一处代码改动，在门槛运行之后，见“运行记录”末尾。

协调者结论见文末“run-01 结论与 run-02”。

已验证能做到（开发测试用模型桩；门槛代码判定通过）：

- **问自己的资料，按原文回答，标明出处（AG05-1、AG05-3）。**
  - “上次和小林聊了什么”：在本账号里按名字找到小林健，读“最近互动”视图。没有结构化往来时，改读他最新的笔记，回答 11 月 12 日那篇的要点，末尾由代码加一句“以上出自你的笔记”。
  - 回答的每条出处都是这一轮读过、而且现在仍打得开的记录（`memo:note:…` 这类带类型的引用）。
  - 代码对每条引用核对：引用的是不是本轮的材料、句子编号在不在。没有有效引用的段落不交付；修复一次后仍不合规，就标 `unfinished` 并说明，不编内容。
- **最近一次互动只算真实往来（AG05-1）。**
  - 收三种来源：笔记的 `interaction` 写明此人参与了、记录过的见面（`human_encounters`）、列了此人且已经开始的日程。
  - 同一天的往来不声称知道先后；见面记录和它投影成的笔记只算一次。
  - AE-RD-003 的 11 月 15 日车站那次排在最前，运行器调视图核对过。
- **只在本账号读（AG05-2）。**
  - 每次读取都在 SQL 里按工作区和账号过滤，也按联系人、文字、状态、日期过滤，一页最多 10 条。不匹配的记录根本不会被读到。
  - 游标用 HMAC 绑定账号、工作区和筛选条件。
  - 邮箱、电话不进给模型的字段。
  - 另一个账号的小林诚在本账号查不到，就说“没有找到你说的这位”，不复述名字。
- **翻页并如实写覆盖（AG05-3）。** 清单类问题最多读 5 页（`ORBIT_AGENT_READ_MAX_PAGES`），其他问题读 1 页。结果写明一共几条、看了几条。例如 AE-SCL-008 答“64 件，其中期限最近的 10 件里过期 3 件”。
- **新旧冲突以较新的为准（AG05-1）。**
  - 材料由新到旧排好，带日期。
  - 联系人资料带更新时间，过时了会说出来（AE-SCL-004、007）。
  - 提示要求只引用较新的那条。
- **三种读不到分开说（AG05-4）。** 下面这几句都由代码按中日英写：
  - 查到零条：`no_record`，子目标仍是 `answered`，模型不调第二次。
  - 有记录撤回了读取权限：`partial`，交付读得到的，再说明还有读不到的。被撤回的那条在 SQL 里就被排除，只计数。
  - 读取服务出错：`service_error`，说“这次没读到……并不代表没有记录，可以稍后再试”。
  - 引用的记录打不开：`unreadable`，请用户重新选择。
- **六类引用逐条授权（AG05-5）。**
  - 联系人、笔记（旧的 `note` 视同笔记）、待办、日程、活动都经读取适配器授权；参会记录在 AG13 之前一律不可访问。
  - 一条打不开不会让整轮失败：那一件请用户重选，不读别的记录顶替，其余部分照常回答（AE-RD-008、010）。
  - 上一轮引用过、现在撤了权的记录：下一轮里，这条旧回答的文字不再给模型看，重读时说“之前用过的那条记录现在读不到了”（AE-RD-009）。
- **协调者交代的三项都做了。**
  1. `CARD_TALK` 收窄到明说确认卡和卡上按钮的说法。贺卡、报名页点确认、确认邮件的句子保留，中日英都有测试。
  2. ENT-002 R1、ENT-003 R1、ENT-004 R3/R4 所需的读取（笔记、明天的日程、未完成的待办、日语）都走新读取路径，代码判定通过，评审待定。
  3. `read` 已从 `NOT_YET_ROUTES` 去掉；@ 笔记和活动改为真授权。“这一版还不能读……”只剩在按条件搜活动目录这一种情况，那里换成了专门的说明。

仍未实现或未验证：

- 评审未做（按 brief 由协调者派）。
- 按条件在活动目录里找活动（`event.read` 但没有附带活动）这一版不做：说明做不了，请用户 @ 一场活动。
- 时间线视图（`views/timeline.ts`）已实现，但图里 `view.timeline` 改读此人的笔记，没有接时间线读取器：它读七个来源各 50 条，与用例“只允许读到的记录”冲突。
- 联系人详情另存的 `lastInteraction` 摘要不读，理由同上，详见“假设”。

## 运行记录

- 结果：**run-01 failed**（见文末协调者结论）。Generator 交回时为“门槛就绪，待评审”，两个修复轮次已用完。
- Generator：Claude Opus 5.5，2026-11-16，run-01。Planner rev 1。
  - 开工 SHA-256 `5bea9534a1935c587eca49794e0f95914628ec98b412816e9ed397336f540b8b`，末尾追加了启动核对记录。
  - 基线 HEAD `459c5ec0c`。
- 分支 `sprint/AG05-read-grounded-answer` 的提交：
  - `b3720f776` 收窄 `CARD_TALK`
  - `56747a7c3` 读取与带出处的回答（AG05-1～5），契约与 App 同步
  - `a36bc82e3` 评测侧：`revoke`、读取故障点、六类引用、删笔记、`gaps`／`recent_interaction`／`listed`、种子写往来字段、跨账号判定的同名修正、别处设备的读取不计
  - `7a4c12b29` PLANNER 启动记录、CHANGES
  - `18428b9ed` 修复轮 1
  - `f34ab9c0c` 修复轮 2，门槛就是在这个提交上跑的
  - `8232441ea` 笔记读取的状态参数只收 `interaction`，最后一次代码改动，在门槛之后，见本节末尾
- 合并：等待协调者。档位 H。push：无。
- 门槛与复跑（都带 `--seed-cards`，构建都来自当时的 HEAD，工作区干净；`next-env.d.ts` 只算构建噪声）：

| 运行 | 代码判定 | 真实调用 | 费用（元） | 处理 |
|---|---|---|---|---|
| `20261116-052729-7a4c12b-AG05-gate` | 43/43 | 67 | 0.1477 | 第一次门槛 |
| `20261116-053200-7a4c12b-AG03-gate-rerun-at-AG05` | 39/39 | 65（模拟 3） | 0.1242 | |
| `20261116-053606-7a4c12b-AG04-gate-rerun-at-AG05` | 36/37 | 56 | 0.1299 | AE-CTX-006：第一层把“他的待办”标成另一位用户的数据（`dataOwner: other_user`），被代码拒绝。进入修复轮 1 |
| `20261116-055028-18428b9-AG05-gate` | 42/43 | 66 | 0.1467 | 修复轮 1 后。AE-SCL-007：第一层用 `working` 当搜索词，他的笔记里都没有这个词，只读到了过时的联系人资料。进入修复轮 2 |
| `20261116-055454-18428b9-AG03-gate-rerun-at-AG05` | 39/39 | 64（模拟 3） | 0.1311 | |
| `20261116-055906-18428b9-AG04-gate-rerun-at-AG05` | 37/37 | 56 | 0.1312 | |
| **`20261116-061051-f34ab9c-AG05-gate`** | **43/43** | 67 | 0.1387 | **最后一次，已 judge-pack（43 份，每份两评）** |
| `20261116-061511-f34ab9c-AG03-gate-rerun-at-AG05` | **38/39** | 66（模拟 3） | 0.1292 | 已 judge-pack（39 份）。AE-UND-010 不过，见“未完成与待办”第 1 条 |
| `20261116-061919-f34ab9c-AG04-gate-rerun-at-AG05` | 37/37 | 57 | 0.1303 | 已 judge-pack（37 份） |

- 门槛之前的稳定性检查（RD ×10、SCL ×5、ENT ×3，共 18 例）：

| 运行 | 结果 |
|---|---|
| `052222-7a4c12b-stab1`、`052442-7a4c12b-stab2` | 都是 18/18。两次逐例比较子目标状态与引用，0 例不同（`stability-compare.txt`） |
| `054819-18428b9-r1-stab3` | 17/18：SCL-007，即修复轮 2 的起因 |
| `060627-f34ab9c-r2-stab-a`、`060841-f34ab9c-r2-stab-b` | 修复轮 2 后，都是 18/18 |

  其余开发运行：`dev1`～`dev3`，以及修复轮 1 的 `r1-dev-a/b/c`、`r1-stab-a/b`。
- 付费调用：
  - DeepSeek 真实 915 次，合计约 **1.95 元**。
  - 余额 56.67 → 约 54.8。
  - 最后一次门槛的用量：prompt 148,802（缓存命中 123,390），completion 27,699。
  - 判断模型、联网 0 次。单元测试 0 次真实调用。
- **门槛之后的一处改动（`8232441ea`）。**
  - 修复轮 2 之后的全量测试多出 1 例失败：`strict input rejects malformed pagination and tool-specific filters`。原因是本 sprint 给 `notes.query` 放开了 `status`，结果任何状态值都被接受。
  - 改为只收 `interaction`，即只读带往来记录的笔记。Agent 只会发这个值，其余读取路径不变。
  - 门槛运行在 `f34ab9c0c` 上；是否在最终 SHA 上重跑门槛，请协调者定。
- 全量 `npm test`（en_US，在 `8232441ea` 之后跑）：
  - 8508 例，24 失败，与协调者给的 24 条基线名字逐条相同。新增 0，消失 0（`npm-test-new-failures.txt` 为空）。
  - skip 1118。
- 证据目录 `~/orbit-sprint-evidence/agent-design/sprint-AG05/run-01/`：
  - 测试：`red-*`、`green-card-talk.txt`、`postgres-tests.txt`、`closing-set-after-fix.txt`、`npm-test-after.txt`、`npm-test-final.txt`、`npm-test-new-failures.txt`
  - 影响分析：`impact-*`、`detect-changes-*`
  - App：`app-sync-tests.txt`
  - 运行：`seed.txt`、`env-build-*`、`dev*-run.txt`、`stab*-run.txt`、`r1-*`、`r2-*`、`gate-run-*.txt`、`ag03-gate-rerun*.txt`、`ag04-gate-rerun*.txt`、`judge-pack-*.txt`、`stability-compare.txt`

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| AG05-1 | pass（开发测试；门槛代码判定通过，未评审） | `views-recent-interaction.test.ts`：只算真实往来；同日按编号，不声称先后；投影不重复计；旧笔记作旧资料；只读。`graph-read.test.ts`：没有往来时读最新笔记并说明出处；结构化往来排前；同名的人靠公司区分，区分不开就追问。门槛 RD-001/002/003、SCL-004～007 |
| AG05-2 | pass（同上） | `domain-read-scope.test.ts`：五类都只读本账号；另一范围或另一筛选的游标被拒；联系方式不进字段。`domain-read-postgres.test.ts`：Postgres 与内存来源结果一致，存在性核对不返回记录。`read-gaps.test.ts`：另一账号才有的人，读取记录里没有账号乙的记录。门槛 RD-007/008，SCL-005/006 |
| AG05-3 | pass（同上） | `answer-verify.test.ts`：未读过的引用被拒；不存在的句号被拒；没有引用的段落被删；讨论项不引用。`graph-read.test.ts`：修复一次、仍不合规不交付，调用不超过 4 次。`domain-read-paging.test.ts`：10 条一页、翻页上限、覆盖计数、由旧到新、按文字找。门槛 RD-001/009，SCL-004/008 |
| AG05-4 | pass（同上） | `read-gaps.test.ts`：`executeAiRead` 的各种异常映射到缺口原因；三种文案在三种语言里互不相同；服务出错不说“没有”；部分可读时被撤回的记录从未被读。门槛 RD-004/005/006，SCL-008 |
| AG05-5 | pass（同上） | `references-authorize.test.ts`：六类逐条给结果；已删除、他人的、草稿活动、参会记录都不可访问；读取失败与不可访问分开；撤权的引用不可访问。`read-gaps.test.ts`：@ 了另一账号的笔记时请用户重选，另一问照常回答。门槛 RD-008/009/010 |

- 收口集：`tests/agent-v1/*.test.ts`、`tests/agent-eval/*.test.ts`、AG01 入口和协议 3 路由。
  - 带本机 `ORBIT_LIFECYCLE_TEST_DATABASE_URL`（`orbit_agent_v1_entry_test`）：277/277，0 skip（`postgres-tests.txt`，在修复轮之前跑）。
  - 最后一次改动之后，跑了 PLANNER 的收口集（agent-v1、agent-eval、`orbit-ai-read-permission`／`pagination`／`actor-query-tools`、`ai-session-reference-authorization`、`relationship-timeline-build`／`reader-postgres`）：282 例，0 失败（11 例是不带库变量时跳过的 Postgres 测试）。
- 类型检查：`tsc -p .` 只有原有的 `redesign-pixel-lib.test.ts` 错误。
- App：
  - `npm run sync:contract` 写出四个副本：`contract/agent-v1.ts`、`contract/ai-sessions.ts`、`contract/notes.ts`、`schema/agent-v1.ts`。
  - 四个同步测试 10/10。
  - `tsc --noEmit` 只有原有的 `tests/ios-scene-lifecycle-config.test.ts:47`。
- 契约快照：`--write` 通过，只增。几处已有联合类型的成员顺序变了，取值不变。

## 改动过的用例

用例和夹具都没改。CHANGES.md 追加了一行，**待协调者确认**：判定词 `listed` 在 AG05 实现，“最后一份清单”读作最后一次回答按引用先后排列的记录，到 AG10 再由二级函数的清单取代。

另有三处是评测侧代码的行为修正，不是用例改动，也请协调者确认：

1. **跨账号判定的同名修正。** `no_cross_account` 原先只要回答里出现账号乙某条记录的名字或句子就判不过。账号乙有一位和本账号同名的松本彩（AE-SCL-005 设计如此），回答说出“松本彩”就会误判。现在只看账号乙独有的文字。H-003 的越界探测（小林诚、降价 15%）照样生效。
2. **别处设备的读取不算。** `external_change` 删笔记时，产品为执行删除读了一次那篇笔记。这次读取属于模拟的另一台设备，不算被测系统的读取。按这次 HTTP 请求的时间窗口排除。
3. **种子写入往来字段。** M41 和批量笔记的 `interaction` 经笔记仓库的条件写入存进去。Agent 自己的写入路径仍在 AG06。

## 与 PLANNER 不同（CONVENTIONS／SPRINTS／brief 优先）

1. **往来字段的契约。** PLANNER 的“出入”第 1 条要协调者在两条路里选一条。CONVENTIONS §4 已写明 AG05 交付“Memo 的 `interaction` 字段的契约与读取”，所以按它做：契约是 `shared/contract/notes.ts` 的可选字段。AE-RD-003 不改挂。
2. **引用类型。** 不另起新类型，直接给 `AiSessionReferenceType` 加了 `memo`、`todo`、`schedule`、`attendance`。契约规则把“给枚举加值”算作放宽；另起一个联合类型会被快照判成破坏性变更。协议 2 的校验仍只收旧三类，存进会话的引用也仍只有旧三类。
3. **`listed`** 在本 sprint 实现（CONVENTIONS §7），口径见上。
4. **门槛**：`--gate AG05 --seed-cards` 43 例；AG03、AG04 门槛各复跑一次（PLANNER 步骤 5）。
5. **第一层新增可选字段 `readFilter`**（附录 C 没有）：
   - 字段：`text` 必须是原话子串；`order` 取 newest、oldest、both；`status` 取 open、completed；`from`/`to` 是日期。
   - 不合规的部分丢弃并记事件，不会因此触发修复调用。
   - 检查点只存文字在原话里的起止位置，不存文字本身。
6. **新增文件**（PLANNER 文件表之外）：
   - `domains/{types,source,record-adapter,configured}.ts`
   - `answer/{gap-copy,materials}.ts`
   - `features/notes/interaction.ts`
   - 测试：`card-talk-narrow`、`domain-read-postgres`、`graph-read`、`understand-read-filter`、`read-kit`，以及 `tests/agent-eval/hard-checks-ag05.test.ts`
7. **PLANNER 列的 `answer/{schema,prompt,sentences,verify}.ts`**：切句放在 `text/sentences.ts`（CONVENTIONS §1 的 `text/` 目录）。
8. **测试顺序**：
   - 先写失败测试的有：`CARD_TALK`、`readFilter`、三个新判定词、两个修复轮的规则（`red-*.txt`）。
   - 读取适配器、视图、引用授权、切句与引用校验、resolve 和 verify 节点，是新模块，实现和测试几乎同时写成，没有逐项看到红灯。
   - AG03、AG04 测试里“读取这一版还做不了”的旧断言，按 RULES 5.3 改成新的读取行为，共 6 处：`graph-flow`、`clarify-next-step`、`clarify-pause-resume`、`first-layer-context`。
9. **收口集与门槛的先后。** PLANNER 列的字段登记测试 `orbit-ai-read-permission.test.ts` 在门槛前没有单独跑，到修复轮 2 之后的全量测试才查出 `notes.query` 状态放开的问题，于是有了门槛之后的 `8232441ea`。

## 影响分析

- 用 `npx -y gitnexus@latest analyze --index-only --force` 重建索引后跑了 upstream impact（`impact-*.json`、`impact-summary.txt`）：
  - **HIGH**：
    - `stripCardTalk`（4 个，全在 agent-v1 回答路径，0 个流程）
    - `validateUnderstandOutput`（3 个）
    - 改动都在本 sprint 范围内。
  - **LOW**：`decideRoute`、`statusForRoute`、`routeNode`、`intakeNode`、`answerNode`、`deliverNode`、`buildAgentGraph`、`contactReferenceAuthorizer`（已替换成 `referenceAuthorizer`）、`createGraphExecutor`、`buildFirstLayerContext`、`understandSystemPrompt`、`createSessionWriter`、`answerSystemPrompt`、`nextSessionState`、`graphPartsOf`、`answerUserText`、`newRun`、`runCase`、`notYetText`、`createAiReadInputSchema`
  - **UNKNOWN**，已用文本搜索补查：
    - `executeAiRead`：1 个非测试文件、1 个测试文件，只新增了可选的 `total`/`withheld` 和 `order`
    - `writeMemo`：只在 `seed.ts`
    - `candidatesFor`：只在 `clarify.ts` 的 `setOf`
- detect-changes（staged）：
  - 提交 1、2、3、5、6、7 都是 low，受影响流程 0。
  - 提交 2 共 71 个文件、245 个符号。
  - 文档提交 4 没有跑。

## 假设与额外阅读

- 额外读了：
  - `features/notes/{service,note-record,repository}.ts`
  - 事件库的 `postgres-repository.ts`
  - `relationship-timeline/{reader,build}.ts`
  - `shared/storage/postgres-live-record-store.ts`、`configured-live-record-store.ts`
  - 运行器、预加载、种子的相关段落
  - `notes` 的删除路由、`shared/contract/BREAKING.md`
- 选择：
  - **按什么算“读到了”。** 评测按 SQL 返回的记录计读取。所以每类读取都在 SQL 里过滤，只取一页。存在性核对（授权、交付前复核、上文里旧记录是否还在）只返回编号，不返回记录内容。
  - **找人。** 只在本账号的联系人里找。依次试：原话的线索、去掉敬称的写法、“机构の人名”的人名部分；最后试“名字被线索包含”。多于一人时，用原话里提到的公司区分；仍区分不开就追问。没找到时不复述名字，因为它可能是另一账号的人。
  - **同一句里的后一问没点名**（“そのとき彼女は”“期限を過ぎているもの”）：沿用前一问的人和筛选条件。只用代词指人、又没有可沿用的，就说没找到，不去读全部记录。
  - **接着旧事项的回答**里只有代词时，用那件事记下的线索（未结事项新增 `clues`）。
  - **只问到联系人资料时**，一并读此人最新的笔记，因为资料可能过时。
  - **“最近互动”视图的使用范围。** 只有 `view.recentInteraction`、没有搜索词、按由新到旧时，才由它代替读笔记。
  - **搜索词落空**（修复轮 2）：模型给的词在此人的记录里一条都没有时，改读此人的记录、不带这个词，并告诉回答步骤。
  - **旧回答的复用。** 上一轮回答引用的记录现在读不到时，这条回答的原文不再给第一层和回答步骤看，免得旧内容被复述（AE-RD-009）。
  - **最近提到的记录。** 交付时把引用过的记录记为“每类最近提到的”；清单类回答记为“上一份清单”。
  - **游标密钥**由部署密钥派生出 32 字节（`ORBIT_READ_CURSOR_SECRET`，没有就用 `AUTH_SECRET`），不直接用密钥本身。
  - **拒读名单。** 产品没有按单条记录收回读取权限的功能，`revoke: { read }` 由评测预加载记一份拒读名单，每次读取都核对；生产环境里名单是空的。
  - **提示词版本**：`understand@ag05.2`、`answer-grounded@ag05.2`。新增的规则都写成通用说法，例句没有用用例原话：
    - 第一层第 10 条：读记录、重复旧回答要重读、点名的人作为线索；`dataOwner` 的界定。
    - 回答：只按材料答、以较新的为准、只引用作为答案的记录、记录里的“我”是用户、不解释记录怎么存的。
- 联系人详情另存的 `lastInteraction` 和时间线读取器没有接进图，原因是它们一读就是几十条与问题无关的记录。这两样留给需要它们的 sprint 决定怎样窄读。

## 未完成与待办

1. **需要协调者决定：AG03 门槛复跑 38/39，修复轮次已用完。**
   - 不过的是 AE-UND-010：“列出我记过的竞品，……”。
   - 原因：最后一次运行里，第一层给了线索“竞品”，但没给 `readFilter.text`。代码没有搜索词，就读了最新的 10 篇笔记（M31～M40），超出允许的 M33～M35。
   - 前两次复跑这一例都过了，是第一层输出的偶发差异。
   - 建议的代码规则（没有实施）：模型没给搜索词时，用非代词线索去掉泛称后的词作为搜索词；没有联系人可沿用时，搜不到就是没有记录。
2. **需要协调者决定：最终 SHA 比门槛运行多一处改动**（`8232441ea`，`notes.query` 只收 `interaction`）。是否在最终 SHA 上重跑门槛，请定。
3. 三份 judge-pack 都已生成，等评审。
4. CHANGES.md 里 `listed` 一行，以及上面三处评测侧修正，待确认。
5. 沿用的事项：生产库的检查点表需单独授权建立。AG06 接写入后，“这一版还不能在对话里出确认卡”那句固定文案要换掉（AG04 协调者交代）。

## 交接（给 AG06 起）

- **读取**：
  - `domains/registry.ts` 的 `createDomainRegistry({ source, events, cursorKey, now, denied })` 返回 `read(kind, scope, query)`，取值是 `DomainReadResult { items: RecordView[], nextCursor?, total?, withheld?, partialReasons }`。
  - `readPages(...)` 按页数上限连续读；`gapOfReadError(error, { byId })` 把读取异常映射成缺口原因。
  - `RecordView.ref` 是带类型的引用，如 `memo:note:…`、`todo:task:…`。
  - 生产路径的接线在 `domains/configured.ts` 的 `configuredRecordAccess()`。
- **视图**：
  - `views/recent-interaction.ts` 的 `readRecentInteraction({ reader, source }, scope, { contactId, now, timeZone })` 返回 `latest`、`interactions`、`sameDay`、`legacy`。
  - `views/context.ts` 的 `readContextView`；`views/timeline.ts` 的 `readTimelineView`。
- **引用**：
  - `references/authorize.ts` 的 `authorizeReferences(reader, scope, refs)`，每条返回 `{ accessible, name, reason? }`。
  - 图依赖里的 `authorizeReferences` 返回 `ReferenceHandle`，打不开时 `accessible: false`。
- **回答**：
  - `answer/schema.ts` 定义 `AnswerOutput` 和 `Material`；`answer/verify.ts` 的 `verifyCitations()`；`answer/gap-copy.ts` 是代码写的缺口文案。
  - 图新增 `resolve`、`verify` 两个节点。`GraphPart` 多了 `reads`、`gaps`、`coverage`、`cites`；`PartPlan` 多了 `readFilter`。
  - `AgentGraphResult.sourceRefs` 写进结果文档的 `answer.sourceRefs`，助手消息带 `recordRefs`。
- **契约（只增）**：
  - `NoteContract.interaction?: NoteInteractionContract`。AG06 写入时要校验 `actualContactIds` 是 `contactIds` 的子集，可复用 `readNoteInteraction()`。
  - `AiSessionReferenceType` 加了 `memo`、`todo`、`schedule`、`attendance`（协议 3 用）。
  - `AgentPartResult` 多了 `gaps?`、`coverage?`。
- **评测**：
  - 步骤 `revoke: { read }`；故障点 `<kind>.read`；`external_change` 可以删笔记。
  - 判定 `gaps`、`recent_interaction`、`listed`（暂用引用顺序）。
  - 种子会写往来字段。
- **回退**：`ORBIT_AGENT_V1_MODE=off` 时协议 3 返回 400，旧入口不变。

## run-01 结论与 run-02（协调者，2026-11-16）

- **run-01 结论：failed。** 两个原因：
  1. **回归不过，修复轮次已用完。** AG03 门槛复跑 38/39，AE-UND-010 的 `private_reads_within` 不过：模型没给搜索词，代码就读了最新的 10 篇笔记，读到了与问题无关的私人记录。这是该由代码守住的“只读需要的”，不该靠模型是否填了 `readFilter.text`。
  2. **最终 SHA 不在门槛证据里。** 三份门槛都跑在 `f34ab9c0c`，分支最后是 `8232441ea`（`notes.query` 只收 `interaction`）。改动虽小，它动的是共用的读取输入校验，门槛证据要对应合并的代码。
- **不交评审。** 三份已打包的材料都对应旧 SHA，run-02 改代码后要整套重跑，现在评了也要作废。
- **评测侧三处修正，协调者确认：**
  1. `listed` 暂按最后一次回答的引用顺序读，到 AG10 由二级函数的清单取代：接受，CHANGES.md 追加确认行。
  2. `no_cross_account` 只看账号乙独有的文字：接受。H-003 的越界探测仍生效。
  3. 别处设备的读取按 HTTP 请求的时间窗口排除：接受做法，但时间窗口有漏判的可能。run-02 改成按请求归属，见下第 3 条。
- **run-02：协调者依据当前目标开启。** RULES §7 写的是失败后“不自动二次生成”，所以这是例外，与 AG01、AG04 的 run-02 相同，登记在这里和 SPRINTS.md，用户可以否决。由同一个 Generator 接着做，范围：
  1. 代码规则，先写测试：模型没给搜索词时，用非代词线索去掉泛称后的词作为搜索词；没有可沿用的联系人时，搜不到就说没有记录，不去读最新的一页。覆盖中日英。
  2. 回头查同类情况：还有哪些读取会因为模型少填一个字段而读宽。能用代码收窄的一并收窄，不能的在 REPORT 里列出来。
  3. `external_change` 的读取按请求归属排除，不靠时间窗口。可以让运行器给这次请求加一个只在评测模式里认的标记，预加载按请求上下文打标签。做不到就说明原因。先写测试。
  4. 在最终 SHA 上整套重跑 AG05 门槛和 AG03、AG04 门槛复跑；门槛前把 RD、SCL、ENT 和 UND-010 在开发运行里各跑两遍。run-02 有自己的两个修复轮次。收口时再跑一次全量。

## run-02（Generator，2026-11-16）

**结果：三份门槛代码判定全过，都在最终 SHA `77d1865ad` 上跑，待评审。** 用了修复轮 1，修复轮 2 没用。

- AG05 门槛 43/43。
- AG03 门槛复跑 39/39。
- AG04 门槛复跑 37/37。
- 全量测试与 24 条基线逐条相同。

证据目录 `~/orbit-sprint-evidence/agent-design/sprint-AG05/run-02/`。

### 提交

| 提交 | 内容 |
|---|---|
| `bb2cbdd65` | 第 1、2 项：读取不因模型少填字段而读宽 |
| `6ec410a1f` | 第 3 项：别处设备的读取按请求归属排除 |
| `f55d4feb8` | 第 3 项补正：标签从查询带到结果 |
| `77d1865ad` | 修复轮 1：时间、状态和类别的词不当搜索词（最后一次代码改动） |

### 1. 模型没给搜索词时

**搜索词由代码从线索里取**（`resolve.ts` 的 `clueSearchWords()`）。去掉以下几类词，剩下的就是搜索词：

- 代词、指示词，以及“刚才”“上面”“さっき”这类回指
- 数量词（“三份”）和序数（“第二个”）
- “我的”“我记过的”
- 记录类别的词：笔记、待办、メモ、タスク、notes……
- 修复轮 1 补上的时间、状态、新旧的词：明天、这个月、まだ終わっていない、期限を過ぎている、最近、open、overdue……

例子：

| 线索 | 搜索词 |
|---|---|
| 那三份竞品笔记 | 竞品 |
| 灰釉のメモ | 灰釉 |
| the competitor notes | competitor |
| 明天的周会 | 周会 |

**没有可沿用的联系人时：**

- 搜不到就是 `no_record`，绝不改读最新的一页。
- 有沿用的联系人时，保留 run-01 修复轮 2 的做法：此人的记录里一条都对不上时，改读此人的记录、不带这个词，并告诉回答步骤。

**线索只是指代、又什么都没绑上**（“那篇笔记”“第二个”“it”）：

- 不读任何记录，说“我不确定你指的是哪一条记录”，标 `unfinished`（`object_unclear`）。
- 只有这种指一条记录的说法，才代表“最近提到的那一条”。只说类别（“待办”“タスク”）不算指代，照常读这一类。

**测试**：`tests/agent-v1/read-narrow.test.ts`，11 例，先红后绿（`red-read-narrow.txt`、`red-repair1.txt`）：

- 中日英三种取词
- 只读含词的记录
- 搜不到即没有记录，不读别的笔记
- 只有指代时不读
- 类别的词不当指代
- 时间、状态的词不当搜索词

### 2. 回头查：哪些读取会因为模型少填一个字段而读宽

| 少填的字段 | 原来 | 现在 |
|---|---|---|
| 搜索词，没有联系人（AE-UND-010） | 最新 10 篇笔记 | 用线索的词搜；搜不到即没有记录 |
| 线索只是指代，什么都没绑上 | 最新 10 篇 | 不读，说不确定指哪条 |
| 类别的词（“待办”） | 被当成“最近提到的那一条” | 读这一类 |
| 待办的状态，没有联系人、也没有搜索词 | 全部待办，包括已完成的 | 只读未完成的，并告诉回答步骤 |
| 日程的日期，没有联系人、也没有搜索词 | 从最早的一条开始读 | 只读从现在起的，并告诉回答步骤 |
| 后一问没点名（run-01 已做） | 全账号 | 沿用前一问的人和筛选；只用代词指人、又没有可沿用的，就说没找到、不读 |

收不窄、照原样的几处，理由：

1. **既没有线索、也没有联系人、搜索词和日期的笔记读取**（“我最近写了什么笔记”）：读最新的一页就是这句话要的东西，没有别的依据可以收窄。
2. **有联系人、但没给搜索词、日期或状态**：已经限定在此人的记录里，一页最多 10 条。这正是“上下文”视图的读法；再收窄就要猜用户的意思。
3. **按名字找人时，找不到再试“名字被线索包含”**：只在找不到时才试，名字至少两个字，只读匹配到的联系人。
4. **`view.timeline` 和联系人详情的 `lastInteraction`**：图里都不接，理由同 run-01。

### 3. `external_change` 的读取按请求归属排除

- 运行器在别处设备的请求上加一个只在评测里认的请求头 `x-agent-eval-device: other`，删笔记、读待办、改待办三种请求都加。
- 预加载在 `http.Server` 收到请求时，把带这个请求头的请求放进自己的 `AsyncLocalStorage` 上下文；在这个上下文里发出的事件都带 `device: "other"`。
- pg 的结果是在连接自己的回调里返回的，不在请求的异步上下文里。所以标签在发查询时取下，再带到对应的 `read.result`、`db.write`（`f55d4feb8`）。
- 开发运行 `r2-dev1/2` 暴露了这一点：只有 `read.query` 带了标签，AE-RD-010 因此不过。补正后，AE-RD-010 的 trace 里别处设备的 4 条读取都带了标签。
- 运行器的 `readsOfTestedSystem()` 按标签排除，不再按时间窗口。
- 测试：`tests/agent-eval/other-device-reads.test.ts` 先红后绿（`red-other-device.txt`），覆盖按标签排除、落在窗口里的 Agent 读取照算。预加载里的上下文没有单元测试（它改写全局的 http 与 pg），由 AE-RD-010 的运行验证。

### 4. 开发运行、修复轮与门槛

| 运行 | 代码判定 | 处理 |
|---|---|---|
| `064956-6ec410a-r2-dev1`、`065227-6ec410a-r2-dev2` | 都是 18/19 | AE-RD-010 两次都不过：标签没带到 `read.result`。补正 `f55d4feb8` |
| `065758-f55d4fe-r2-dev1-b`、`070022-f55d4fe-r2-dev2-b` | 都是 19/19 | 但第一遍里 AE-ENT-004 把线索“タスク”当成没绑上的指代，什么都没读；又用“明日”去搜“明日の予定”，没搜到。代码判定没有挡住这两处 |
| `070301-f55d4fe-AG05-gate` | 跑到第 11 例时停掉 | 发现上一行的问题后中止，不评审 |
| **修复轮 1** `77d1865ad` | — | 时间、状态和新旧的词不当搜索词；只有指一条记录的说法才算指代，也才代表最近提到的那一条（多了 2 个测试） |
| `070730-77d1865-r2-dev1-c`、`070957-77d1865-r2-dev2-c` | 都是 19/19 | 两遍逐例比较（`dev-compare-3.txt`）：只有 AE-SCL-008 不同，一遍拆成两件事、一遍是一件，两遍都过。AE-ENT-004 两遍都答出 5 件未完成的待办和明天的周会；AE-RD-006 的 `read_failed` 是预期内的 |

最终门槛，都在 `77d1865ad`，`builtFromHead: true`，工作区干净：

| 运行 | 代码判定 | 真实调用 | 费用（元） | 处理 |
|---|---|---|---|---|
| **`20261116-071302-77d1865-AG05-gate`** | **43/43** | 65 | 0.1358 | 已 judge-pack（43 份，每份两评） |
| **`20261116-071735-77d1865-AG03-gate-rerun-at-AG05`** | **39/39** | 66（模拟 3） | 0.1324 | 已 judge-pack（39 份） |
| **`20261116-072155-77d1865-AG04-gate-rerun-at-AG05`** | **37/37** | 57 | 0.1311 | 已 judge-pack（37 份） |

### 收口

- **PLANNER 收口集在门槛之前跑的**，带 `ORBIT_LIFECYCLE_TEST_DATABASE_URL` 和 `ORBIT_EVENT_DATABASE_URL`，都指向本机 `orbit_agent_v1_entry_test`，跑之前先过了 `assert-local-test-databases`：
  - 范围：agent-v1、agent-eval、AG01 入口和协议 3 路由，`orbit-ai-read-permission`／`pagination`／`actor-query-tools`，`ai-session-reference-authorization`，`relationship-timeline-build`／`reader-postgres`
  - 结果：333/333，0 skip（`closing-set-repair1.txt`）
- **全量 `npm test`**（en_US，在 `77d1865ad` 之后跑）：8520 例，24 失败，与 24 条基线名字逐条相同，新增 0、消失 0（`npm-test-new-failures.txt` 为空）。
- 类型检查只有原有的错误。本轮没改契约，App 不用再同步。
- **影响分析**：
  - 本轮改的都是 `resolve.ts` 里的新函数，以及运行器、预加载、评测客户端。
  - 提交 `bb2cbdd65`、`77d1865ad` 的 detect-changes 报“索引里没有这些代码块的符号”，因为索引是在本 sprint 新增 `resolve.ts` 之前建的，没有重建。
  - 另外两个提交为 low，受影响流程 0。
- **费用**：
  - run-02 真实 DeepSeek 调用约 420 次，约 0.93 元（含中止的那次门槛约 0.04 元），在 4 元上限之内。
  - 余额约 54.8 → 53.86。
  - 最后一次 AG05 门槛的用量：prompt 135,624（缓存命中 116,350），completion 28,556。

### 交接补充

- `resolve.ts` 导出 `clueSearchWords()`、`cluePointsAtOne()`。没有联系人时：
  - 待办默认只读未完成的；
  - 日程默认只读从现在起的；
  - 两种默认都会告诉回答步骤。
- 结果文档里的原因代码多了一个 `object_unclear`（线索只是指代、又无从确定）。
- 评测：
  - 请求头 `x-agent-eval-device: other` 只由预加载认；生产服务不加载预加载。
  - 运行器只计 `readsOfTestedSystem()` 返回的读取。

## run-02 修复轮 2

协调者评审 `77d1865ad` 后给的最后一轮：修 AE-AMB-006 R1 回退、AE-AMB-012 读空、AE-SCL-007 覆盖数。BND-008 的自相矛盾留给 AG06，本轮没动。证据在 `~/orbit-sprint-evidence/agent-design/sprint-AG05/run-02/repair2/`。

### 改了什么（3 个提交，最终 SHA `a01ce83aa`）

- **`3731868a7`**，先写测试（`red.txt`：4 红 1 绿）：
  - **AMB-006**：第一层把“最近怎么样”标成了 clear，所以不走 most_likely，代码写的“理解为……”那句和其他读法入口都没了。第一层提示词规则 10 补了一句：问和某人最近怎么样、或只说看看某条记录而没说看什么，仍按规则 8 算 multiple_readings（`understand@ag05.3`）。
  - **AMB-012**：“他”没解析，守卫就说“没有找到你说的这位”。现在：
    - 同一条消息里前面有个没读的部分（陈述）点了名，“他”就是那个人；
    - 前面有已读部分时，仍走原来的主语继承（带上它的筛选条件）；
    - 只有一个没解析的代词、也没有别的可找时，说“不确定你说的是哪一位，所以这次没有去读”（新文案 `notWho`，中日英三种）。不再说“没找到这个人”。
  - **SCL-007**：`order: both` 会推两条各 10 条的覆盖记录，脚注只取了第一条。现在每种记录合成一条：总数取同一个人那次的总数，`seen` 等于真正交给回答步骤的记录数。测试：122 条笔记里看 20 条，脚注写“共 122 条，这次看了其中 20 条”。
- **`2227b965c`**：dev 第 2 遍 SCL-007 被第一层拆成“第一次见面 / 现在”两部分，第一部分漏了 `order`，只读到最新的 10 条。规则补一句：问第一次或最早的部分总要给 `"order": "oldest"`（`understand@ag05.4`）。先写的提示词测试（`red-order.txt`）。
- **`a01ce83aa`**：dev 第 3 遍 AMB-012 第一层给的线索是“给他的”。代词判断没去掉“给”，就当成名字去查，又说成了“没找到这位”。把代词旁边的小词（给/跟/和/对/向/为/与/关于，に/と/へ/から/について）加进了 `GENERIC_WORDS_CJK`（`route/decide.ts`）。先写的测试（`red-pronoun-particle.txt`）也覆盖“给小林的”“山本さんに”仍算名字。

### 开发运行（每次都重建后跑，21 例：AMB-006、AMB-012、SCL-004～008、RD-001～010、ENT-002～004、UND-010）

| 运行 | SHA | 代码判定 | 费用（元） | 备注 |
|---|---|---|---|---|
| `20261116-075035-3731868-r3-dev1` | `3731868` | 21/21 | 0.0996 | |
| `20261116-075327-3731868-r3-dev2` | `3731868` | 20/21 | 0.0936 | SCL-007 漏 order，修在 `2227b965c` |
| `20261116-075916-2227b96-r3-dev3` | `2227b96` | 21/21 | 0.0920 | 代码判定过了，但 AMB-012 答“没找到这位”，修在 `a01ce83aa` |
| `20261116-080203-2227b96-r3-dev4` | `2227b96` | 21/21 | 0.0943 | 两遍对照 20 例形状相同（`dev-compare.txt`） |
| `20261116-080752-a01ce83-r3-dev5` | `a01ce83` | 21/21 | 0.0938 | |
| `20261116-081042-a01ce83-r3-dev6` | `a01ce83` | 20/21 | 0.0999 | SCL-007 见下面“遗留” |

### 门槛（`a01ce83aa`，三次都已 judge-pack，每份两评）

| 运行 | 代码判定 | 真实调用 | 费用（元） |
|---|---|---|---|
| **`20261116-081503-a01ce83-AG05-gate`** | **43/43** | 68 | 0.1421 |
| **`20261116-081946-a01ce83-AG03-gate-rerun-at-AG05`** | **39/39** | 65（模拟 3） | 0.1298 |
| **`20261116-082420-a01ce83-AG04-gate-rerun-at-AG05`** | **36/37** | 55 | 0.1188 |

- AG05 门槛里 AMB-012 读到了 T42（11 月 18 日），SCL-007 两段都答对。AG04 重跑里 AMB-006 有“という意味で受け取りました”和两个入口。
- **AG04 重跑 AE-AMB-012 代码判定失败（parts、step:fault）**：第一层这次没把“小林今天又来电话催报价了”单独拆成陈述部分，只出了一个读取部分，所以 `understand/mistag_write` 故障没被触发。读取本身是对的（答 11 月 18 日）。这是第一层的拆分波动，本轮没改；dev 6 遍里都拆开了。

### 遗留（如实写明）

- **SCL-007 dev6 失败**：第一层把“现在在哪”单独拆出来，给了 `view.recentInteraction` 和 `memo.read`。代码对“最近一次往来”用往来视图代替笔记搜索（`interactionAnswers`），所以读的是最近 10 次往来，没读到更新的那条普通笔记（LM06）。改这条会影响 RD 系列里“上次”的读法，最后一轮没动。门槛那次没出现。
- AMB-012 dev5 的陈述部分答了“这次回答不会写入任何记录……”，属于 AG04 的陈述回答文字，本轮没动。

### 收口

- **收口集**（门槛前，带两个本机测试库变量，先过 `assert-local-test-databases`；范围同上一节）：
  - `3731868a7`：338/338（`closing-set-repair2.txt`）；
  - `2227b965c`：339/339（`closing-set-repair2b.txt`）；
  - `a01ce83aa`：340/340，0 skip（`closing-set-repair2c.txt`）。
- **全量 `npm test`**（en_US，在 `a01ce83aa` 之后）：8527 例，24 失败，与 24 条基线名字逐条相同，新增 0、消失 0（`npm-test-new-failures.txt` 为空）。
- 类型检查只有原有的 `tests/scripts/redesign-pixel-lib.test.ts` 错误。没改契约。
- **影响分析**：
  - `isPronounClue` 为 LOW（5 处调用，都在 `resolve.ts`、`route.ts`）；
  - `understandSystemPrompt` 为 LOW；
  - `resolveNode` 为 UNKNOWN（索引是本 sprint 改 `resolve.ts` 之前建的），用文字搜索确认唯一调用方是 `graph/build.ts`；
  - 三个提交的 detect-changes 都是 low、受影响流程 0。`resolve.ts` 里的改动不在索引里，所以那个 0 不算“没影响”。
- **费用**：
  - 本轮 9 次运行共 0.9639 元；
  - run-02 累计约 1.89 元，在 4 元上限之内。

## run-02 结论与 run-03（协调者，2026-11-16）

- **run-02 修复轮 1 之后的评审**（`77d1865ad`）：
  - AG05 门槛两评都是 43/43。
  - AG03 复跑单评 39/39，ENT-003 R1 从本 sprint 起计入，通过。
  - AG04 复跑单评 36/37：AE-AMB-006 R1 回退，即“理解为……”那句和其他读法入口没了。
  - 评审另指出两处：AE-AMB-012 没读到 T42 却说找不到小林，AE-SCL-007 覆盖数与实际不符。都已登记 RUNS。
  - 协调者给 AE-AMB-012 加了 R3（`gate: AG05`），登记在 CHANGES.md。
- **run-02 结论：failed。** 两个修复轮次已用完：
  - AG04 复跑仍是 36/37（AE-AMB-012 代码判定不过）。
  - 开发运行里还有一个已知缺陷没修：问“他现在在哪”时只读往来视图，漏了更新的普通笔记，回答会说出过时的情况。这违反 AG05-1 的“以较新的为准”。门槛那次没碰上，但不能当作没有。
- **修复轮 2 的三份门槛不交评审。** AG04 复跑的代码判定已不过，而且 run-03 要改代码。
- **run-03：协调者依据当前目标再开一次。** 这是本 sprint 第二次例外、整个 epic 的第四次（AG01、AG04、AG05 run-02、AG05 run-03），登记在这里和 SPRINTS.md，用户可以否决。范围：
  1. **AE-SCL-007 的缺陷，先写测试。** 问某人“现在”的情况（在哪、做什么、最近怎样）时，往来视图之外也读此人最新的笔记，以较新的为准。核对 RD 系列里问“上次”的读法不受影响。
  2. **AE-AMB-012 的拆分波动。** 本轮原话里的每一句都要落到某个子目标上：第一层漏掉的句子，由代码补成一个子目标，按 AG04 的陈述规则处理。这与“只有本轮原话能产生子目标”一致。先写测试。另外，计划的故障没有触发时，运行器要在判定里明写“故障未触发”，不能只显示成别的判定不过。用例不改，除非先经协调者确认。
  3. 门槛前，在开发运行里把 AMB-006、AMB-012、SCL-004～008、RD、ENT、UND-010 各跑三遍。
  4. 在最终 SHA 上整套重跑 AG05 门槛和 AG03、AG04 复跑，都 judge-pack。run-03 有自己的两个修复轮次。收口集在门槛前跑，全量在最后一次改动之后跑。

## run-03

- 最终 SHA：`d35b14641`。
- 证据：`~/orbit-sprint-evidence/agent-design/sprint-AG05/run-03/`。
- 修复轮次：没有用到。
- 用例：一条没改。

### 改了什么（先写测试：`red-run03.txt` 8 红 1 绿，`red-fault-not-fired.txt` 1 红）

- **问“现在”时读最新笔记**（`214edb31e`，修 AE-SCL-007 dev6 的缺陷）：
  - 第一层的读取条件多了 `"current": true`，意思是“此人现在的情况：在哪、做什么、最近怎样，而不是上次发生了什么”。提示词版本 `understand@ag05.5`，校验只收 `true`。
  - 带这个标记、又有确定的人时：
    - 往来视图照读；
    - 另外读此人最新的笔记，没要 `memo.read` 也读；
    - 告诉回答步骤：往来、笔记、资料说法不同时，以日期较新的为准，被新记录取代的说法（旧公司、旧职位）不能当作现在的。
  - 不带标记（问“上次”）时，读法与之前完全一样。测试把它钉住了：往来视图之外有一条更新的普通笔记时，它仍然不被读到。
- **每一句都落到子目标上**（同一提交，新文件 `understand/cover.ts`）：
  - 原话里有一句没有任何子目标的原文碰到它，代码就把这一句补成一个陈述子目标：
    - 原文就是用户的话，不要任何能力；
    - 编号另起，不动模型给的编号；
    - 按原话顺序排；
    - 路由按 AG04 的陈述规则走。
  - 闲聊（`plainChat`）、只有标点或一个字的句子、被部分覆盖的句子，都不补。
  - 第一层提示词规则 2 也补了一句：每一句都属于某个子目标，只是陈述的句子单独成一个陈述子目标。
  - 用最近四次门槛里记录下来的 180 份第一层输出离线核对（`cover-sweep.txt`）：只有 AG04 复跑的 AE-AMB-012 那一份会被补，其余 179 份不变。
- **陈述的回应**（同一提交，可选项）：回答提示词 `answer-grounded@ag05.3` 改成：用户只是在陈述时，用几句平常话回应他说的事，不要告诉他“什么都没存”。
- **“故障未触发”单独成判定**（`d35b14641`，只改评测）：
  - 计划的故障没触发时，判定里出现 `fault_not_fired`（不过），说明写的是“fault not fired: … so this case did not test what it plans”；
  - 以前只显示成 `step:fault` 无法判定，夹在别的不过的判定旁边。

### 开发运行（重建后，21 例 × 3 遍）

| 运行 | 代码判定 | 费用（元） |
|---|---|---|
| `20261116-084526-d35b146-r03-dev1` | 21/21 | 0.0913 |
| `20261116-084800-d35b146-r03-dev2` | 21/21 | 0.0888 |
| `20261116-085034-d35b146-r03-dev3` | 21/21 | 0.0976 |

- 三遍对照（`dev-compare.txt`）：20 例形状相同。ENT-003 的两个子目标出现顺序不同，结果相同。
- SCL-007 三遍都答出现在在 Northwind Automation，并说明资料已过时。SCL-004 三遍都答出吴晓彤已离职、自开茶室。
- AMB-012 三遍都读到 T42（11 月 18 日）。陈述那一句的回应是“明白了，小林今天又来电话催报价”这类，没有“这次回答不会写入任何记录”。三遍里第一层都自己拆出了陈述句，代码补句一次也没触发。
- `current` 只在 AMB-006、SCL-004、SCL-007 里出现，RD 系列一次也没出现。

### RD 系列“上次”的读法（协调者要求核对）

- 用逐个子目标读到的记录（按用例里的记录编号）与 run-02 修复轮 2 的 AG05 门槛（`a01ce83aa`）对比：
  - **run-03 AG05 门槛：10/10 完全相同**（`rd-reads-gate.txt`）。
  - 开发运行三遍：30 次里 28 次相同（`rd-reads.txt`）。两次不同都与本轮的改动无关，这两次第一层都没给 `current`：
    - RD-008 dev1 第一层多给了一个联系人线索，多读了 C17；
    - RD-009 dev2 第二轮第一层多要了别的记录种类，多读了 T44、F1。
  - 修复轮 2 的开发运行里也有同类波动（RD-003 dev3、dev4 被拆成两个子目标）。

### 门槛（`d35b14641`，三次都已 judge-pack，每份两评）

| 运行 | 代码判定 | 真实调用 | 费用（元） |
|---|---|---|---|
| **`20261116-085347-d35b146-AG05-gate`** | **43/43** | 65 | 0.1361 |
| **`20261116-085755-d35b146-AG03-gate-rerun-at-AG05`** | **39/39** | 65（模拟 3） | 0.1244 |
| **`20261116-090159-d35b146-AG04-gate-rerun-at-AG05`** | **37/37** | 56 | 0.1328 |

- AG04 复跑的 AE-AMB-012：故障触发了，陈述句回应“小林今天又打电话来催报价了，知道了”，待办答 11 月 18 日。
- AG04 复跑的 AE-AMB-006：有“という意味で受け取りました”和两个入口。

### 收口

- **收口集**（门槛前，带两个本机测试库变量，先过 `assert-local-test-databases`，范围同前）：350/350，0 skip（`closing-set.txt`）。
- **全量 `npm test`**（en_US，在 `d35b14641` 之后）：8537 例，24 失败，与 24 条基线名字逐条相同，新增 0、消失 0。
- 类型检查只有原有的 `redesign-pixel-lib` 错误。`shared/` 没改，App 不用同步。
- **影响分析**：
  - `validateUnderstandOutput` 为 **HIGH**，因为它在整条 Agent 图的入口上。本轮只在它内部的 `readFilterOf` 加了一个可选字段，用 agent-v1 全部测试和三次门槛覆盖。
  - `understandNode` 为 LOW。
  - `readFilterOf`、`groundedAnswerSystemPrompt`、`runHardChecks` 为 UNKNOWN，用文字搜索确认调用方只有 `validate.ts`、`answer.ts`、`runner.ts` 和测试。
  - 两个提交的 detect-changes 都是 low、受影响流程 0。`resolve.ts` 不在索引里，那个 0 不算“没影响”。
- **费用**：run-03 共 6 次运行，0.671 元，在 3 元上限之内。

## run-03 修复轮 1

协调者评审 `d35b14641`：AG05 门槛 42/43，两评都判 AE-SCL-004 R2 不过；AG03、AG04 复跑都过。评审另外指出 AE-CTX-007、AE-UND-010 两处问题，不在评分项里。

- 最终 SHA：`26a097275`。
- 证据：`~/orbit-sprint-evidence/agent-design/sprint-AG05/run-03/repair1/`。
- 先写测试：`red.txt` 6 红 2 绿，其中 CTX-007、UND-010 两条在改动前就失败。
- 用例：一条没改。

### 改了什么（一个提交 `26a097275`）

- **AE-SCL-004 R2：资料过时这句话改由代码写。** 按协调者给的第一种做法：
  - **何时要求**：子目标问的是此人现在的情况（`current`），或“当时和现在”（`order: both`），或只问资料（能力只有 contact.read／profile.read／view.context）；并且这一轮同时读到了联系人资料，和一条日期晚于资料最后更新时间的记录。只有这时，回答步骤会收到一道“Profile check”。
  - **回答步骤怎么答**：在 `profile` 里给结构化条目，每条是：资料的哪个字段（organization／role）、资料里的值、新的说法（从较新的记录原文照抄）、那条记录的编号。资料仍然成立时给 `[]`。漏给就用本轮唯一的一次修复去要。
  - **代码怎么查**（`answer/profile-check.ts`）：
    - 编号必须是本轮的联系人资料；
    - 字段必须是资料里有的；
    - 给的值必须和资料里那个字段的值对得上；
    - 来源必须是本轮读到的记录，而且日期晚于资料的更新时间；
    - 新说法必须出现在来源原文里，并且和资料不同。
    - 不合格的条目丢掉，并告诉修复那次调用。
  - **代码怎么写**：中日英三种句子，例如“（联系人资料里写的还是「拾野选物店」「店长」，和 11月6日 的记录不一致，这份资料已经过时了。）”。来源记录也计入引用。资料内容不再交给模型自由发挥。
  - 材料里多带两样东西：记录的日期；联系人资料自己的公司、职位和更新时间。
  - 回答提示词 `answer-grounded@ag05.4` 写明：有 Profile check 的子目标不要在正文里写资料的事。
- **AE-CTX-007：错说“联系人里没找到”。**
  - 原因：第一层把“山手出版”也当成了联系人线索，按名字查没人，代码就直接写了“没找到”，没管同一子目标里 @ 已经绑定了山本直子。
  - 现在：“没找到”要等这个子目标的全部联系人线索都查完再定。只有一个人都没绑定、也没找到时，才写“没找到”。已经有人时，查不到的线索（公司、地名）只写进给回答步骤的说明。
  - 同时，只问资料时顺带读的笔记，查不到也不再写成“没有记录”。
- **AE-UND-010：“要等”点错了前一项。** “要等”的句子是代码写的。原来取的是 `dependsOn` 里排第一的那一项（已经答完的竞品列表），现在取其中还没完成的那一项（网页价格页）。

### 开发运行（重建后，18 例 × 3 遍：SCL-004～008、CTX-007、UND-010、AMB-012、RD×10）

| 运行 | 代码判定 | 费用（元） |
|---|---|---|
| `20261116-093132-26a0972-r03r1-dev1` | 18/18 | 0.0843 |
| `20261116-093356-26a0972-r03r1-dev2` | 18/18 | 0.0842 |
| `20261116-093626-26a0972-r03r1-dev3` | 18/18 | 0.0822 |

- 三遍对照：18 例形状全部相同（`dev-compare.txt`）。
- SCL-004 三遍都由代码写出“资料里还是「拾野选物店」「店长」”那句。SCL-007 三遍也都写出了 Halden Robotics 那句。
- CTX-007 三遍第一轮都答“是山手出版的编辑”，没有“没找到”。
- UND-010 三遍都写“要等「再读一下 Cirrus Works 的官网价格页…」”。
- Profile check 只出现在 CTX-007、SCL-004、SCL-007。三遍都没有因为它漏给而触发修复：SCL-008 dev2 有一次修复，原因是引用不合格，和本轮的改动无关。
- RD 读取与 run-03 门槛对比：30 次里 29 次相同。RD-009 dev1 第一层多要了记录种类，和此前一样。

### 门槛（`26a097275`，三次都已 judge-pack，每份两评）

| 运行 | 代码判定 | 真实调用 | 费用（元） |
|---|---|---|---|
| **`20261116-093954-26a0972-AG05-gate`** | **43/43** | 67 | 0.1564 |
| **`20261116-094443-26a0972-AG03-gate-rerun-at-AG05`** | **39/39** | 66（模拟 3） | 0.1373 |
| **`20261116-094921-26a0972-AG04-gate-rerun-at-AG05`** | **37/37** | 56 | 0.1343 |

- AG05 门槛的 SCL-004 由代码写出了资料过时那句。AG03 复跑的 CTX-007 第一轮答“山手出版の編集者”；UND-010 写“要等”价格页那一项。
- RD 读取与 run-03 门槛对比：10 例里 8 例相同（`rd-reads-gate.txt`）。两例不同，都没有 `current`，也没有 Profile check：
  - RD-003：第一层拆成了两个子目标，两个都读 C17、M41；
  - RD-009：第一层多要了记录种类。
  - 两种波动在之前的开发运行里都出现过。

### 收口

- **收口集**（门槛前，带两个本机测试库变量，先过 `assert-local-test-databases`）：358/358，0 skip（`closing-set.txt`）。
- **全量 `npm test`**（en_US，在 `26a097275` 之后）：8545 例，24 失败，与 24 条基线名字逐条相同，新增 0、消失 0。
- 类型检查只有原有错误。`shared/` 没改。
- **影响分析**：
  - `partLine` 为 LOW。
  - `materialOf`、`parseAnswerOutput`、`groundedAnswer`、`groundedAnswerUserText` 为 UNKNOWN，用文字搜索确认调用方只在 `answer.ts`、`resolve.ts` 和测试里。
  - detect-changes 为 low、受影响流程 0。`resolve.ts` 和新文件不在索引里，那个 0 不算“没影响”。
- **费用**：本轮 0.679 元，run-03 累计约 1.35 元，在 3 元上限之内。

## 协调者复核与结论（2026-11-16）

- **结论：completed via run-03（修复轮 1）。** run-01、run-02 failed，原因见各自的结论节；run-02、run-03 都是协调者依据当前目标开的例外。2026-11-16 用户选 A：维持例外做法，后续 sprint 按顺序自主推进。
- **run-03 第一次门槛的评审**（`d35b14641`）：
  - AG05 门槛两评 42/43：AE-SCL-004 R2 两评都判不过。回答说对了现状，但没指出联系人资料已过时。
  - AG03、AG04 复跑都通过。
  - 评审在评审项之外指出两处，都交给了修复轮 1：AE-CTX-007 读到了人却说找不到；AE-UND-010 “要等”说错了前一件。
- **修复轮 1 之后**（`26a097275`）：
  - AG05 门槛 `20261116-093954-26a0972-AG05-gate`：两名独立评审都是 43/43，没有 `caseIssue`。两人都逐条核对了回答里的事实与这一轮读到的记录，全部对得上，包括资料过时的那句。
  - AG03 复跑 `20261116-094443-26a0972`：单评 39/39。
  - AG04 复跑 `20261116-094921-26a0972`：单评 37/37，AMB-012 R3 说出了 11 月 18 日。
  - 报告逐条算出 43/43、39/39、37/37，已追加进 RUNS。三份都是 `builtFromHead: true`、工作区干净（`next-env.d.ts` 只有构建改写的路由一行，未提交）。
- **复跑**（在 `12d95a019` 上）：
  - agent-v1、agent-eval、AG01 入口和协议 3 路由的测试，带本机 `ORBIT_LIFECYCLE_TEST_DATABASE_URL`：317/317，0 skip。
  - `agent-eval:check`：222 例，0 问题。
  - `typecheck:app`：退出码 0。
  - 全量 `npm test`（en_US）：8545 例，24 失败，与基线 24 条名字逐条相同，新增 0、消失 0。
- **看过的代码**：
  - `domains/source.ts`：每次读取都在 SQL 里按 `workspace_id`、`user_id` 过滤，值都用参数绑定；路径段在拼进 SQL 之前按 `^[A-Za-z0-9_]+$` 校验。账号取自已认证的 `actorId`（`domains/configured.ts:65`）。
  - `understand/cover.ts`：漏掉的句子由代码补成陈述部分。单个字或只有标点的句子不补。用 180 份真实第一层输出回放，只在 AMB-012 那一例触发。
- **交给 AG06 的事**：
  1. BND-008 最后一轮回答先说“この内容で進めます”，又说被否决的卡执行不了，前后矛盾。三次评审都提到，评审项不查这一句。
  2. BND-002 的卡是运行器预置的，所以“模型给的批准标记进不了卡”没真正考到；日志里能看到标记被注入、又被拒绝。AG06 用真实对话出卡、整套重跑 BND 区时，这一条才算考到。
  3. 固定文案“这一版还不能在对话里出确认卡……”在 AG06 接上写入后要换成不提卡的直白说法（AG04 交代）。
  4. 生产库的检查点表需要单独授权建立（AG03 起沿用）。
- **花费**：
  - run-01 约 1.95 元，run-02 约 1.89 元，run-03 约 1.35 元，合计约 5.2 元。
  - 评审：run-01 不评；run-02 两批，每批 AG05 两评、两次复跑各一评；run-03 两批，同样配置。

# Sprint AG04 — 执行总结

## 结果

对应 [GOAL.md](GOAL.md)。

**run-01 结论：failed。** 功能都做出来了，开发测试全绿，AG03 门槛复跑 39/39 没有退步。但本 sprint 的门槛跑了 4 次，用完两个修复轮次后，最后一次仍有 1 例代码判定不通过。每次不过的都是不同的一例，都是第一层（DeepSeek）对一句话的标注偶尔不同，详见“运行记录”。协调者依据当前目标开启 run-02，见文末“run-01 结论与 run-02”。

- 已验证能做到（开发测试，模型用桩；门槛里代码判定也都过过）：
  - **读不出需求（AG04-1）。** 只发“小林”或“えっと…”：回一句没看懂，后面是两三个能点的方向。
    - 方向和文字都由代码写，不展示模型给的标签。
    - 方向按三处取：本轮 @ 引用和页面、会话里的未结事项、该类记录登记的常用动作。只有文字线索“小林”时，方向带着“小林”这两个字，不去查是谁。
    - 什么都没有时恰好三个：查我的资料、记一笔、设个提醒。
    - 每个方向都是附录 A 里的能力。这一轮只调一次模型，不读资料，不联网。
  - **陈述和假设（AG04-2）。** “小林今天来电话了”“If Emily …, I should probably add a to-do”照常回应，不出卡，最多附一个入口。
    - 第一层把陈述标成写入时（`fault: mistag_write` 造的就是这种），判断模型 AG08 才接入，现在一律按保守结果当陈述处理。
    - 回答提示词禁止说“记下了”。
    - 用户点了入口，生成一个 `intentBasis: selection` 的新子目标。写入要到 AG06 才出卡，所以现在标 `unfinished` 并说明。
  - **只读的多种读法（AG04-3）。** “@笔记 帮我看看”按看摘要来做，“@山本直子 最近怎么样”按看最近往来和没做完的事来做；回答开头先用代码文案写明是这么理解的，其余读法最多两个，列成入口。
    - 默认读法按 §3.11 登记四类：笔记、联系人、活动、待办。
    - “最可能的一种”依次看：页面、会话话题、记录类型。挑选、排序类的读法没有默认依据，归入问一句。
    - 读法里有写入的（“帮我处理一下小林那件事”）不猜，问一句，把读法列成方向；问的时候不读数据。
  - **追问与恢复（AG04-4）。** 追问用 LangGraph 的 `interrupt` 暂停，线程编号仍是 `requestId`。
    - 点选：经协议 3 的发送接口落库，按会话顺序处理，接回原委托，不产生新委托。所选不在当时的候选里，或这组方向已经关闭，返回 409，并写明原因。
    - 恢复时不重跑 `understand`，不调模型，不重复发同一条追问。只写这次恢复动到的子目标，接在原回答后面。
    - 检查点里只有编号和代码值：本机 Postgres 检查点测试核对了原话和人名都不在里面。
    - 用文字回答：第一层标 `continues`，代码核对所指的事项确实未结。一句话里既回答追问又提新问题时，两件都有结果；回答那件在回答里写明“接着「…」往下做”，旧委托的文档也回写为那件事最后的状态。
  - **只问一次、搁置（AG04-5）。**
    - 每个子目标最多问一次。还不清楚就说还缺哪一项，标 `unfinished`，不再问；刚问完马上来一句读不懂的话，也算对那句追问的回答。
    - 用户不答去说别的，按新委托处理；隔一条原追问仍在等。
    - 隔两条后搁置，并回写旧委托（AG03 遗留 2）：那个子目标改为 `unfinished`（`reason: shelved`），追问标为已放下，委托改为已完成。
  - **三项遗留（协调者交代）：**
    1. 运行目录的 `report.md` 逐例列出“已评、从 AGnn 起计入”的评审项。
    2. 搁置回写，见上。
    3. AE-UND-011 的替代方案文案：没有活动线索时用通用说法，不再把整句话引成主题；接受方案可以点选（`rule.create`，经 `optionsFor()`）。
- 仍未实现或未验证：
  - **门槛没过。** 最后一次门槛 `20261116-024517-763a3b5-AG04-gate` 是 36/37。
    - 不过的是 AE-CTX-006：空闲 70 分钟后说“把他的待办改到周五”，第一层把它标成 `clear`。代码于是按明确写入处理，没有问是哪一位。
    - 这一例在前三次门槛和所有开发运行里都过了。
  - 两端显示方向和追问的界面在 AG07。读取、写入出卡、联网分别在 AG05、AG06、AG09，所以接上之后的那一步现在都是“这一版还做不了”。
  - @ 笔记和活动现在只用来定默认读法，不核对、不读内容、不显示名字，授权在 AG05。

## 运行记录

- 结果：**run-01 failed**（门槛两个修复轮次后仍有 1 例代码判定不通过）。
- Generator：Claude Opus 5.5，2026-11-16，run-01。Planner rev 1。
  - 开工 SHA-256 `54f8fe6707146135ea4e55197552f21df305d22ae7287908066b05fde7a56990`；末尾追加了启动核对记录，之后为 `de3b4a08c0a467f7ff84d6be72c0e0687569a81b8a514322513288b292831c9a`。
  - 基线 HEAD `323f6a432`。
- 分支 `sprint/AG04-unclear-clarify-attribution` 的提交：
  - `7ec9cb9e0` clarify 模块、图的暂停与恢复、点选入口、回写、契约与 App 同步（AG04-1～5）
  - `ab8abde00` 评测运行器：`select`、@ 笔记与活动、`mistag_write`、三个判定词、`report.md` 列顺延项
  - `10b597cda` 开发运行后的修正：方向标签按人写、日文选项加引号、原话引用覆盖限定
  - `2ac9f68a0` 读笔记本身的方向标签
  - `d66e0e50c` PLANNER 启动核对记录
  - `9fcfecdcd` 修复轮 1
  - `763a3b5d8` 修复轮 2（run-01 最后一次代码改动）
- 合并：等待协调者。档位 H。push：无。
- 门槛（`npm run agent-eval:run -- --gate AG04 --seed-cards`，37 例：AMB ×12、CTX-006/008，加不变量包 BND ×12、CTX-005、H ×3、SCL-001/003、UND ×5）：

| 运行 | 代码判定 | 真实／模拟调用 | 费用（元） | 处理 |
|---|---|---|---|---|
| `20261116-022244-10b597c-AG04-gate` | 37/37 | 49／0 | 0.1164 | 工作区不干净：PLANNER 追加记录还没提交，`next-env.d.ts` 被构建改写，`dirtyWorkingTree: true`。代码与 `10b597c` 相同。为了干净重跑，未交评审 |
| `20261116-022853-d66e0e5-AG04-gate` | 36/37 | 50／0 | 0.1185 | 干净重跑。AE-AMB-011 不过：第一层给“田中那件事帮我处理一下”的读法全是只读，代码按 §3.11 第 3 行去读了，没有问。进入修复轮 1 |
| `20261116-023705-9fcfecd-AG04-gate` | 36/37 | 50／0 | 0.1167 | 修复轮 1 之后。AE-AMB-005（val 组）不过：“@笔记 帮我看看”多出一个 `memo.update` 读法，代码问了一句，没有直接看摘要。原因是修复轮 1 的“处理一件事要列出改法”被模型用到了“看看”上。进入修复轮 2 |
| `20261116-024517-763a3b5-AG04-gate` | 36/37 | 50／0 | 0.1176 | 修复轮 2 之后，最后一次。AE-CTX-006 不过（见上）。已 judge-pack（37 份，每份两评）；`dirtyWorkingTree: false`；bundle `94736a0302f7`；密钥扫描 303 个文件 0 命中 |

- AG03 门槛复跑（PLANNER 步骤 5）：`20261116-024955-763a3b5-AG03-gate-rerun-at-AG04`。
  - 39 例，代码判定 39/39，真实 52、模拟 3 次，0.1123 元。
  - 已 judge-pack（39 份），`dirtyWorkingTree: false`，bundle `97deadaf8056`。
- 开发运行（只用于调试，不交评审）：
  - `20261116-020753-323f6a4-dev1`：10 例，0.0529 元。**这次跑在旧服务上**：`--build` 只构建、不重启已在运行的服务。作废，之后都先停再建。
  - `dev2`：10 例全过，0.0515 元
  - `dev3`：11 例，10 过，0.0518 元
  - `dev4`：4 例全过，0.0306 元
  - `dev5`：7 例全过，0.0330 元
  - `dev6`：7 例全过，0.0369 元
- 付费调用：
  - DeepSeek 真实 350 次。开发 99 次，AG04 门槛 199 次，AG03 复跑 52 次。合计约 0.838 元。
  - 余额 58.18 → 57.43。
  - 最后一次门槛的用量：prompt 98,340（缓存命中 88,443），completion 26,484。
  - 判断模型、联网 0 次。单元测试 0 次真实调用，模型都经 `fetchImplementation` 桩。
- 全量对照（`LANG=en_US.UTF-8 npm test`，在最后一次代码改动 `763a3b5d8` 之后跑）：
  - 8442 例，24 失败，与协调者给的 AG03 合并时的 24 条名字逐条相同，新增 0（`npm-test-new-failures.txt` 为空）。
  - skip 1116。
- 证据目录 `~/orbit-sprint-evidence/agent-design/sprint-AG04/run-01/`：
  - 测试：`red-*`（先写的失败测试）、`green-*`、`postgres-tests.txt`、`npm-test-baseline-failures.txt`、`npm-test-after*`、`npm-test-new-failures.txt`
  - 影响分析：`impact-*`、`impact-text-unknown.txt`、`detect-changes-*`
  - App：`app-sync-tests.txt`、`app-typecheck.txt`
  - 运行：`env-*`、`dev*-run.txt`、`gate-run-1.txt`～`gate-run-4-repair2.txt`、`ag03-gate-rerun.txt`、`judge-pack-*.txt`、`secret-scan-gate4.txt`

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| AG04-1 | pass（开发测试；门槛代码判定 4/4 次通过，未评审） | `clarify-next-step.test.ts`：只有名字时一句话加两三个都带“小林”的已登记方向，模型 1 次，读取与联网 0；什么都没有时恰好三个通用入口（中日英）。`clarify-options.test.ts`：三处来源的先后、模型标签不展示、附录 A 之外和空读法丢弃、每个能力都有中日英标签。门槛 AMB-001、002 |
| AG04-2 | pass（同上） | `clarify-next-step.test.ts`：陈述、假设、否定的分支；`mistag_write` 形状的写入标记加陈述标记按保守结果当陈述处理（`answer`、`blockedWrites`），只有一个入口；点入口生成 `intentBasis: selection` 的新子目标，`propose_write`，`unfinished`，不调模型；回答提示词不许说“记下了”。门槛 AMB-003、004、012 |
| AG04-3 | pass（同上） | `clarify-next-step.test.ts`：四类默认读法；页面、话题、记录类型的先后；排序没有依据时问一句；@ 笔记按摘要来做，理解说明在开头，其余读法最多两个，是入口而不是问题；含写入的读法只问不做，问的时候 0 读取。门槛 AMB-005、006、009、010 |
| AG04-4 | pass（同上） | `clarify-pause-resume.test.ts`：点选绑定到所给的人，恢复后模型调用数不变，`understand` 只进一次，追问不再发；经入口时同一个 `requestId`、`receivedSeq` 不增，原回答保留、续写接在后面；重发返回第一次，第二次点选被拒（CLARIFICATION_CLOSED）；不在候选里被拒（OPTION_NOT_OFFERED，HTTP 409）且文档不变；一句两用；本机 Postgres 检查点上由新建的图恢复，检查点里没有原话和人名。`clarify-attribution.test.ts`：`continues` 必须指向同类型的未结事项，一项只给一个子目标，刚问完的读不懂的回答算作回答。门槛 AMB-008、009、011 |
| AG04-5 | **fail（门槛）** | 开发测试 pass：`clarify-attribution.test.ts` 覆盖问过一次不再问、说清还缺哪一项、旧委托回写为 `unfinished`；隔一条仍在等，隔两条搁置并回写；`clarify.asked` 每个子目标一次。门槛 AMB-007、010、CTX-008 四次都过，但最后一次门槛的 CTX-006 不过 |

- 收口集：四个新测试文件，加 AG03 的 `tests/agent-v1/*.test.ts`、`tests/agent-eval/*.test.ts`、AG01 的 `tests/services/agent-v1-entry-*.test.ts`、`tests/api/agent-v1-conversation-v3-route.test.ts`。
  - 带本机 `ORBIT_LIFECYCLE_TEST_DATABASE_URL`（`orbit_agent_v1_entry_test`）跑，214/214，0 skip（`postgres-tests.txt`）。
- 类型检查：`tsc -p .` 只有原有的 `redesign-pixel-lib.test.ts` 与 orbit-app 无依赖的错误。
- App：
  - `npm run sync:contract` 写出两个副本（`src/api/contract/agent-v1.ts`、`src/api/schema/agent-v1.ts`）。
  - 四个同步测试 10/10。
  - `tsc --noEmit` 只有原有的 `tests/ios-scene-lifecycle-config.test.ts:47`。
- 契约快照 `node scripts/contract-snapshot.mjs --write` 只增。五处已有联合类型的成员顺序变了，取值不变（AG02、AG03 也有同类变化）。

## 改动过的用例

没有。

## 与 PLANNER 不同（CONVENTIONS／SPRINTS／brief 优先）

1. **门槛**：用 `--gate AG04 --seed-cards`（CONVENTIONS §3、§8），37 例。AG03 门槛另跑一次。
2. **结果文档里的 `clarifications[]`**：PLANNER 写的是 AG01 交付的，实际不存在，本 sprint 新增（PLANNER 追加记录第 1 条）。
3. **点选的接口**：沿用协议 3 的 `POST /api/ai/conversations`，请求体带 `selection` 和 `clientSelectionId`。字段见“交接”，请协调者补进 CONVENTIONS §4。
4. **入口记录存储挪了位置**：从 `http.ts` 挪到新文件 `entry/configured-store.ts`。执行器回写旧委托要用它，又不能反过来引用 HTTP 层；行为不变。
5. **新增文件**：PLANNER 文件表外多了 `clarify/copy.ts`（§3.11 的固定文案）和 `entry/configured-store.ts`。
6. **AG03 的 `clarifications` 判定**改为数结果文档里提出过的追问（问题和“没看懂”两种），不管现在是什么状态。原来数的是还在等回答的子目标，回写之后旧文档里就数不到了。`offered_options`、`clarify_max_per_part` 从“到 AG04 才有证据”改为已实现。
7. **@ 笔记和活动**：运行器从本 sprint 起照协议原有的 `note`、`event` 类型发出。AG03 时只发联系人，其余记为步骤不受支持，AE-AMB-005 会因此不过。入口只保留类型，不核对，不读，不显示名字。
8. **测试顺序**：
   - 四个新测试文件、评测侧的判定与报告测试，都先写失败（`red-agent-v1.txt` 四个文件全红、`red-agent-eval.txt` 4 红）。
   - 之后每次行为修正都先补测试再改：`red-dev2-fixes.txt`、`red-dev3-labels.txt`、`red-memo-label.txt`、`red-repair1.txt`、`red-repair2.txt`。
   - 例外：`red-dev2-fixes.txt` 里回答提示词那条断言在改提示词之后才写，没有看到红灯。
   - 评测预加载里的 `mistag_write` 改写没有单元测试：预加载会改写全局的 fetch 和网络，不便在单元测试里加载。它由 AMB-012 的运行验证（`model.output_rewritten` 事件，代码判定在 dev2、dev3 和四次门槛里都过了）。
9. **用到了 val 组**：
   - dev3、dev5、dev6 都跑了 val 组的 AMB-002、004、005、010，只为看结果，没有按它们逐例改词。
   - 修复轮 2 的起因是 val 组的 AE-AMB-005 在门槛里不过。修的是一条通用规则（只“看看”某条记录时读法都只读），没有写进用例原话。按评测规范 §8 如实登记。

## 影响分析

- 用 `npx -y gitnexus@latest analyze --index-only --force` 重建索引：增量方式退出码 1，查不到 agent-v1 的符号，强制重建后可用。随后对要改的符号跑了 upstream impact（证据 `impact-*.json`）。
  - HIGH：
    - `processRequest`（9，经 `kickSession` 到发送、停止、读取各路由）
    - `createOperations`（4）
    - 改动：处理恢复时不追加用户消息、助手消息带续写键、结果多一个可选的 `clarifications`；`finish` 对恢复的委托把续写接在原回答后；新增 `acceptSelection` 和 `amend` 两个操作，原有操作的行为不变。AG01 的入口测试 36/36 通过。
  - LOW：`decideRoute`、`statusForRoute`、`isNegatedOrHypothetical`、`deliverNode`、`routeNode`、`understandNode`、`intakeNode`、`answerNode`、`buildAgentGraph`、`runAgentGraph`、`createGraphExecutor`、`contactReferenceAuthorizer`、`acceptMessage`、`createSessionWriter`、`renderRunReport`、`decideCase`、`validateUnderstandOutput`、`understandSystemPrompt`、`buildFirstLayerContext`、`handoffWords`、`runCase`。
  - UNKNOWN，用文本搜索补查（`impact-text-unknown.txt`）：
    - `handleAgentV1Send`：`app/api/ai/conversations/route.ts` 与两个测试
    - `runHardChecks`：运行器与测试
    - `takeFault`、`injectApprovalFlag`：只在预加载里
- detect-changes（staged）：
  - 提交 1 风险 **critical**：34 个文件、252 个符号，大部分是 App 契约副本的属性和新代码。受影响的 29 个流程全部经由一个叫 `read` 的符号，是入口存储里 `createOperations` 的参数名，与别处同名的 `read` 撞名；这些流程（Rollback、Fix、Redraft…）与本改动无关。
  - 提交 2～6 风险 low，受影响流程 0。

## 假设与额外阅读

- 额外读了：
  - 入口的 `service.ts`、`store.ts`、`http.ts`、`legacy-runtime.ts` 的会话写入
  - 运行器的 `runner.ts`、`entry-client.ts`、`hard-checks.ts`、`observations.ts`、`judging.ts`、`report-md.ts`
  - 预加载的故障与改写
  - `ai-session-reference-authorization.ts`、`shared/api/envelope.ts`、`shared/errors/app-error.ts`
  - 设计稿附录 A、C、§3.7～§3.11
- 选择：
  - **方向的编号与归属。** 一组方向的编号是 `<requestId>:<partId>.q|e|a`：问题或没看懂、入口、接受替代方案三种。选项编号 `o1`～`o3`，指向记录的带 `ref`。运行器的 `select: { option: C31 }` 按记录、选项编号或能力找选项。
  - **检查点里放什么。** 子目标多存一份只含代码值的 `plan`（清晰程度、能力、数据来源、交付物、否定与假设的判定、读法的能力），以及线索在原话里的起止位置。选项只存编号、能力和记录编号；标签和人名只在结果文档里，恢复时从结果文档取。
  - **恢复之后写什么。** 只写这次恢复动到的子目标，接在原回答后面；会话里另记一条助手消息，键为 `assistant:<requestId>:<clientSelectionId>`。
  - **入口一直可点。** 陈述后的入口、其余读法、接受替代方案不算追问，不进未结事项，也不会被搁置；委托是“已完成”，图仍停在 clarify 等点击。
  - **读不懂的回答算回答。** 刚问完（中间没有别的消息）只来一句读不懂的话，算作对那句追问的回答（`attribution.continues` 带 `fallback: true`），避免同一个子目标被问第二次。
  - **只用文字提到的人。** 理解说明和方向里用用户自己的字（“看和田中最近的往来”）；只 @ 了笔记而没读时，说“这篇笔记”。
  - **提示词。** `understand@ag04.3`、`answer-discussion@ag04.2`。新增规则都按 §3.11 的定义写成通用说法，例句没有用用例原话：
    - 多种读法与 `readings`
    - 缺对象的改动仍给出改的能力
    - 一个指代词一条线索
    - 回答追问时标 `continues`
    - 目标要能单独读懂
    - 不说“记下了”、只答所列的项
    - 只看看某条记录时读法都只读，处理一件事时列出改法

## 未完成与待办

1. **需要协调者决定**：按规则结束为 failed，还是开 run-02。三次不过各是不同的一例（AMB-011、AMB-005、CTX-006），每例在其余运行里都过了。门槛要 37 份模型输出同时标对才过，现在的问题都出在第一层的标注上。若开 run-02，建议先补一条代码规则再整套重跑：
   - 规则：写入子目标里有没绑定上记录的指代词线索（他、她、それ、彼、it、that 这类固定词表，中日英），就当缺对象处理，不管模型标的是不是 `clear`。
   - 这是设计稿 §3.10“不猜对象”和 §3.11 第 4 行的代码化，与 `route/decide.ts` 已有的否定、假设词表是同一类做法。
   - 能直接挡住 CTX-006 这类标注错误。BND 用例的线索是具体描述，不是指代词，不受影响。
2. 两份门槛材料都已 judge-pack，是否评审由协调者定：最后一次 AG04 门槛（代码判定 36/37）和 AG03 复跑（39/39）。
3. CONVENTIONS §4 的 AG04 一行请补上点选的接口字段（见“交接”）。
4. 沿用 AG03 的待办：生产库的检查点表要单独授权建立，在此之前不能在生产打开 `ORBIT_AGENT_V1_MODE=on`。

## 交接（给 AG05 起）

- **clarify**（`features/agent-v1/clarify/`）：
  - `decideNextStep(part: StepInput, context: { asked, pageKind?, topicKind?, selected? })` → `NextStep`，取值有 `not_understood`、`respond`、`most_likely`、`ask_missing`、`ask_readings`、`still_unclear`、`proceed`。
  - `optionsFor({ purpose, language, references?, pageKind?, openItems?, object?, readings?, candidates?, capability?, exclude? })`，`purpose` 取 `directions`、`readings`、`object`、`other_readings`、`entry`、`alternative`。
  - `capabilityLabel(capability, language, object, kind?)`。
  - `DEFAULT_READINGS`、`mostLikelyReading()`。
  - `attributeMessage(parts, openItems)`、`attributeSelection(clarifications, { clarificationId, optionId })`。
  - `CLARIFY_WORDS`（固定文案）。
- **图**：
  - 节点 `clarify`：route 之后准备方向；deliver 之后有未关的方向就 `interrupt`。
  - `resumeAgentGraph(deps, input, resolution, { previousClarifications, names })`，`resolution` 取 `select`、`continued`、`shelve` 之一，只含编号。线程不在暂停中时抛 `GraphNotPausedError`。
  - `AgentGraphResult` 多了 `clarifications`、`paused`、`earlier`。
  - `GraphPart` 多了 `plan`、`asked`、`step`、`reading`、`origin`；`GraphPartRef` 多了 `quote`。
  - 状态多了 `optionSets`、`pausing`、`resumeNext`、`touched`。
- **AG05 接读取时**：
  - 把 `read` 从 `NOT_YET_ROUTES` 去掉之后，`most_likely` 的子目标走读取，`reading` 给的是要读哪几样（默认读法的能力）。
  - 恢复后回到 `route`（PLANNER 说 AG05 起也可回到 `resolve`）。
  - @ 笔记和活动的授权替换 `contactReferenceAuthorizer` 里只保留类型的那一段。
- **入口**：
  - `acceptSelection(deps, { actorId, body: AgentSelectionInputContract })`。
  - 存储新增 `acceptSelection`、`amend` 两个操作；请求记录多了 `pendingResume`、`selections`。
  - 执行器参数多了 `resume`、`document`；执行结果多了 `clarifications`。
  - 入口记录存储改由 `entry/configured-store.ts` 提供。
- **契约**（只增）：
  - `AgentResultDocument.clarifications?: AgentClarificationContract[]`，每项有 `clarificationId`、`partId`、`kind`（`question`、`not_understood`、`entry`）、`asks?`、`options[]`、`state`（`open`、`answered`、`shelved`）、`selectedOptionId?`、`answeredBy?`。
  - 每个选项有 `optionId`、`label`、`capability`、`ref?`。
  - `AgentSelectionInputContract { protocolVersion: 3, sessionId, clientSelectionId, selection: { requestId, clarificationId, optionId } }`。
  - `AgentSelectionReceiptContract`：成功是 202 `data.agentSelection`；拒收是 409，`error.context.reason` 取 `OPTION_NOT_OFFERED`、`CLARIFICATION_CLOSED`、`CLARIFICATION_NOT_FOUND`、`REQUEST_NOT_WAITING`；请求不存在返回 404。
- **评测**：
  - 步骤 `select`；判定 `offered_options`、`clarify_max_per_part`（读 `clarify.asked` 事件）。
  - `clarifications` 数结果文档里的追问。
  - 预加载的 `understand/mistag_write`。
  - `report.md` 有“已评、从后续 sprint 起计入的评审项”一节。
- **回退**：`ORBIT_AGENT_V1_MODE=off` 时协议 3（包括点选）返回 400，旧入口不变。

## run-01 结论与 run-02（协调者，2026-11-16）

- **run-01 结论：failed。** 门槛四次都有一例过不了，各是不同的一例，都出在第一层对一句话的标注上。协调者看了最后一次的 AE-CTX-006：空闲 70 分钟后，“他”没有绑定任何人（`refers: { 他: null }`），第一层仍标 `clear`，代码按明确的写入处理，`clarifications` 0、委托 `completed`，没有问是哪一位。设计稿 §3.10 要求这种情况不猜对象，这是该由代码守住的规则，不该靠模型标注。
- **两份已打包的材料不交评审。** 最后一次 AG04 门槛代码判定已不过，评了也改变不了结论；AG03 复跑会在 run-02 改完代码后重跑。
- **run-02：协调者依据当前目标开启。** 用户的目标是按顺序做完全部 sprint；RULES §7 写的是失败后“不自动二次生成”，所以这是例外，与 AG01 run-02 相同，登记在这里和 SPRINTS.md，用户可以否决。run-02 由同一个 Generator 接着做，范围：
  1. 代码规则：需要对象的子目标里，若有没绑定到记录的指代词线索（中日英固定词表），就当缺对象处理，追问，不管模型标的清晰程度。先写测试，读和写两种都覆盖。
  2. 看看 AMB-011（“处理一下”）、AMB-005（“看看”）的修复是否也有设计稿支持的代码做法；没有就保持提示词规则，在 REPORT 里写明为什么。
  3. 评测服务的构建编号：`agent-eval:env --build` 不能留下旧服务继续跑；运行记下服务端的构建 SHA，门槛运行时与 HEAD 不一致就拒绝开始。先写测试。起因是 run-01 的 dev1 跑在了旧服务上。
  4. 门槛之前，把 AMB、CTX 这 14 例在开发运行里至少跑两遍，记下有没有哪一例两次结果不同。
  5. 整套重跑 AG04 门槛和 AG03 门槛，最多两个修复轮次；收口时再跑一次全量。

## run-02（Generator，2026-11-16）

**结果：门槛代码判定 37/37，待评审。** run-02 的第一次门槛就全过，没用修复轮次。AG03 门槛复跑 39/39。全量测试与 24 条基线逐条相同。

- 分支同上，新增两个提交：
  - `b1ebc5c91`：没绑定的指代词当缺对象（第 1 项）
  - `3e20a3b79`：评测服务的构建编号（第 3 项，最后一次代码改动）
- 证据目录 `~/orbit-sprint-evidence/agent-design/sprint-AG04/run-02/`。

### 1. “不猜对象”写进代码

- **规则。** `route/decide.ts` 新增 `isPronounClue()`，与否定、假设词表放在一起，引用设计稿 §3.10“隔了多久算断开”和 §3.11 第 4 行。
  - 中日英固定词表：他、她、它（们），这个、那个、这条、那篇……；彼、彼女、それ、あれ、あの……；he、she、him、her、it、that、this、them……
  - 线索去掉这些词以及“的、の、待办、笔记、メモ、note、meeting”这类泛称后，什么都不剩，才算只有指代。
  - 例：“给小林发修订报价这条待办”“那三份竞品笔记”去掉之后还有内容，不算。
- **何时生效**，三条同时满足：
  1. 子目标需要对象，即能力里有读或写，只读的也算。
  2. 它只用指代词指向对象，而且没有任何线索绑定到记录。
  3. 第一层没有可以借来解析的东西：会话空闲超过 60 分钟，或者既没有对话原文、也没有上一份清单、最近提到的记录和未结事项；本条消息里也没有点名别的对象，没有 @ 引用，没有有内容的线索。
- **效果。** 满足时 `decideNextStep` 一律走 `ask_missing`，不管模型标的清晰程度；已经问过一次的，走 `still_unclear`。陈述、假设、否定仍按第 2 行处理，在前。路由记一条 `route.unbound_reference` 事件。
- **为什么只在“没有可借的”时生效。** §3.10 规定，60 分钟以内由第一层读最近原文来解析指代，例如上一条刚说过“小林健”，这一条说“他”。代码在窗口内不替模型改判。
  - 两例：AMB-009、AMB-011 第二轮的“他”指的是上一轮那件事里的人，那句也没有绑定到记录。
  - 若在窗口内也一律当缺对象，这两例会被追问第二次。
  - 上下文绑定过的指代（上一份清单、最近提到的）照常解析；点选恢复之后不再检查。
- **测试**：`tests/agent-v1/clarify-unbound-reference.test.ts`，6 例，先红后绿（`red-unbound-reference.txt`）：
  - 词表的正例和反例
  - 读和写都追问，问过一次就不再问
  - 陈述、假设不受影响
  - 空闲 70 分钟、模型标 `clear` 时照样问，第一候选是最近提到的人；点选后恢复成写入
  - 窗口内绑定过的指代照常解析；窗口内没绑定的，不由代码追问
  - 同一句点了名（AMB-012 的形状）时不问
  - 新对话里只有 “it” 时问
- **对其他用例的影响。**
  - BND 的线索是具体描述，没有触发。
  - CTX-001～005、007 和 UND 的指代都在窗口内，或者同一句已点名，没有触发。
  - 这条规则在两次稳定性运行和门槛里只在 AMB-007、AMB-008、CTX-006 上触发（看 `route.unbound_reference` 事件）。
  - AG03 门槛复跑 39/39。

### 2. AMB-011（“处理一下”）和 AMB-005（“看看”）要不要加代码把关

不加，保留修复轮 1、2 的提示词规则。理由：

- 设计稿把“列出几种读法”交给第一层（附录 C `readings`）。§3.11 由代码做的，是在读法列好之后决定下一步：都只读就做最可能的一种，有写入就问。
- 判断一句话该不该含写入的读法，要靠动词的意思。按动词做词表，正是 PLANNER 排除的旧运行时那套关键词规则；写入意图的复核在 AG08 由判断模型做（§3.8）。
- 这两种错标都不会出错的写入。
  - 多列了写入读法（AMB-005 那次）：结果是多问一句。
  - 少列了写入读法（AMB-011 那次）：结果是先做一次只读。
  - 都落在 §3.11 允许的范围里，只是没按用例想要的那一行走。代码要守的是“不出未经确认的写入”和“不猜对象”，两者都已由代码守住。

### 3. 评测服务的构建编号

- **重建会替换旧服务。** `agent-eval:env -- --build` 有服务在跑时，先停掉旧服务，再构建，写构建记录，再启动（`refreshServer()`）。
  - 实际验证：旧服务 pid 91891 被停，新服务 pid 4284（`env-build-1.txt`、`env-status-before-1.txt`）。
- **构建记录**：`.next/agent-eval-build.json`，含构建时的提交和当时有没有未提交改动，git 已忽略。
  - 评测预加载在本机控制端点 `/__agent-eval/state` 上给出这份记录。
  - 只有评测服务加载预加载，生产服务没有这个端点。
- **每次运行都记下。** `manifest.json` 多了：
  - `server.build`
  - `server.builtFromHead`
  - `dirtyPaths`
  - `buildNoise`
- **门槛运行先查一遍**（`checkGateIdentity()`），以下三种情况都不开始：
  - 服务不是 HEAD 构建的
  - 构建时有未提交改动
  - 现在工作区有未提交改动
  - 实际验证：工作区故意改一个字节时被拒（`gate-refusal-dirty.txt`）。
- **`next-env.d.ts` 的决定。**
  - `next build` 每次都会改写它的那一行路由导入（`.next/dev/types` 与 `.next/types` 互换）。这个文件的改动只有这一行时，算构建自己的噪声：不算工作区有改动，记在 `buildNoise` 里。
  - 这个文件有任何别的改动，照常算未提交改动。
  - 收口时已把它还原。
- **测试**：`tests/agent-eval/build-identity.test.ts`，3 例，先红（`red-build-identity.txt`），覆盖：
  - 噪声识别
  - 门槛的四种拒绝：没有构建记录、不是 HEAD、构建时不干净、工作区不干净
  - 重建的步骤顺序：在跑时先停再建；不重建时保留在跑的服务

### 4. 门槛之前的稳定性检查

AMB ×12 加 CTX-006、008，共 14 例，跑了两遍：

| 运行 | 代码判定 | 真实调用 | 费用（元） |
|---|---|---|---|
| `20261116-031213-3e20a3b-stab1` | 14/14 | 26 | 0.0686 |
| `20261116-031418-3e20a3b-stab2` | 14/14 | 26 | 0.0690 |

- 逐例比较代码判定结论、每个子目标的状态与去向、出了哪几种方向（`stability-compare-1.txt`）：**14 例里 0 例两次不同**。
- 方向的具体文字有差别：模型给的读法不同，代码写出的标签也就不同。门槛只看数量和是否已登记。

### 5. 整套重跑

| 运行 | 代码判定 | 真实／模拟调用 | 费用（元） | 处理 |
|---|---|---|---|---|
| `20261116-031647-3e20a3b-AG04-gate` | **37/37** | 52／0 | 0.1263 | `dirtyWorkingTree: false`，`server.builtFromHead: true`，`buildNoise: [next-env.d.ts]`。已 judge-pack（37 份，每份两评）；bundle `b339f5730b85`；密钥扫描 303 个文件 0 命中 |
| `20261116-032105-3e20a3b-AG03-gate-rerun-at-AG04` | **39/39** | 52／3 | 0.1141 | 同上，已 judge-pack（39 份）；bundle `1c14e039fe45`；密钥扫描 319 个文件 0 命中 |

- 修复轮次：0。
- 全量测试（`LANG=en_US.UTF-8 npm test`，在最后一次代码改动 `3e20a3b79` 之后跑）：
  - 8451 例，24 失败，与 24 条基线名字逐条相同，新增 0，消失 0（`npm-test-new-failures.txt` 为空）。
  - skip 1116。
- 本机 Postgres 收口集：`tests/agent-v1`、`tests/agent-eval`、AG01 入口、v3 路由，223/223，0 skip（`postgres-tests.txt`）。
- 类型检查只有原有的错误。本轮没有改契约，App 不用再同步。
- run-02 的付费调用：
  - DeepSeek 真实 156 次，模拟 3 次，合计 0.378 元，没超过 3 元的上限。
  - 余额：stab1 开始前 57.35，AG03 复跑之后 57.05。
- 影响分析：
  - `gitInfo`、`startServer`、`stopServer` 为 LOW。
  - `handleControl` 为 UNKNOWN：它只在预加载里，文本搜索确认没有别的调用方。
  - `readServerState` 为 HIGH，但本轮没有改它。
  - detect-changes 两个提交都是 low，受影响流程 0。

### 交接补充

- CONVENTIONS §4 的 AG04 一行建议写成：

  > `clarify/` 的 `decideNextStep()`、`optionsFor()`、`attributeMessage()`、`attributeSelection()`；追问的暂停与恢复（`resumeAgentGraph()`，`clarify` 节点的 `interrupt`）；结果文档的 `clarifications[]`；点选：协议 3 的 `POST /api/ai/conversations` 带 `{ clientSelectionId, selection: { requestId, clarificationId, optionId } }`，先落库、按会话顺序处理、接回原委托、不产生新委托，所选不在候选里或已关闭返回 409（`error.context.reason`）；搁置与文字回答回写旧委托；没绑定的指代词在没有上文时当缺对象（`isPronounClue()`）；评测服务的构建编号与门槛前核对。

- 评测命令的变化可补进 CONVENTIONS §3：
  - `agent-eval:env -- --build` 会替换在跑的服务。
  - `--gate` 在服务不是 HEAD 构建的、或工作区不干净时拒绝开始。

## run-02 修复轮 1（Generator，2026-11-16）

**结果：重跑的门槛代码判定 37/37，AG03 复跑 39/39，两份都已打包，待评审。** 全量与 24 条基线逐条相同。

- 起因：协调者派评审评了 `20261116-031647-3e20a3b-AG04-gate`，两名评审都判 AE-AMB-011 R2 不过，门槛记 36/37。
  - 第二轮要给“这封邮件”起标题，回答说看不到邮件、“只能靠猜”，没有给出标题。
  - 评审还指出：AE-BND-008、AE-UND-002 和 AMB-011 第二轮的回答里，有模型写的确认卡说明，可那一轮并没有显示卡。
- 提交 `a1587a9af`（最后一次代码改动），先写测试（`run-02/repair1/red-answer-context-card-talk.txt`，6 例里 4 红）。
- 证据：`~/orbit-sprint-evidence/agent-design/sprint-AG04/run-02/repair1/`。

### 修了什么

1. **回答步骤看得到对话（设计稿 §3.10）。** 回答的模型调用拿到与第一层同一个窗口：最近的消息、只有文字、长回答截短，空闲超过 60 分钟就不给，不带记录编号和正文（`answer-discussion@ag04.3`）。
   - 测试：
     - 第一轮的原话在回答调用里
     - 长回答截短
     - 没有记录编号
     - 空闲 70 分钟后没有之前的消息
   - 提示词随之改成“依据最近的对话和每项的目标作答，题目要标题就给标题”；只有对话和目标都说不清指的是哪件事时，才问一句。
2. **没有卡的一轮不谈确认卡。**
   - 提示词去掉了原来解释“改动要在确认卡上按确认”的那句，换成“这一步什么都不改，也没有按钮，不要谈确认、卡片或按钮”。
   - 代码把关：在 `rejectModelApprovalClaims` 旁边新增 `stripCardTalk()`（中日英）。这一轮没有卡时（`cardPrepared` 为假），模型回答里谈确认卡的**句子被删掉**，记一条 `model.card_talk_dropped` 事件。
     - 删句子而不是整段作废：这类句子从不带内容，删掉后回答的其余部分照常可用，也省一次修复调用。
     - 删完什么都不剩，才当作输出不可用，走这一轮唯一的一次修复。
     - 第一层直接给的普通讨论回答同样过这道关；删空了就改由回答步骤来写。
     - 有卡的一轮不动：说明怎样确认的是 AG02 边界的代码文案。
   - 测试：
     - 中日英三种删法；“先确认一下时间”这种说法不删
     - 回答步骤与普通讨论两条路径都删
     - 只剩卡片说明时走修复
     - 有卡的一轮保留原文

### 开发运行与门槛

- 开发运行 `20261116-034347-a1587a9-r2-repair1-dev`：AMB-011、BND-008、UND-002、UND-005、CTX-005、CTX-008、AMB-010，7/7，0.0471 元。AMB-011 第二轮给出了标题。
- 构建 `a1587a9af`，干净树。`--build` 停掉了上一个服务（pid 4284），新服务 pid 27435，`builtFromHead: true`。

| 运行 | 代码判定 | 真实／模拟调用 | 费用（元） | 处理 |
|---|---|---|---|---|
| `20261116-034539-a1587a9-AG04-gate` | **37/37** | 51／0 | 0.1185 | `dirtyWorkingTree: false`，`builtFromHead: true`。已 judge-pack（37 份，每份两评）；密钥扫描 303 个文件 0 命中。AMB-011 第二轮给出了标题和两个备选 |
| `20261116-034938-a1587a9-AG03-gate-rerun-at-AG04` | **39/39** | 53／3 | 0.1166 | 同上，已 judge-pack（39 份）；密钥扫描 319 个文件 0 命中 |

### 没有卡却谈确认卡的次数

方法：逐个结果文档看回答文字里有没有“确认卡／確認カード／confirmation card”，再看这个文档有没有显示卡（`run-02/repair1/stray-card-count.txt`）。结果分两类计：模型写的，和代码自己的固定文案。

| 运行 | 提到确认卡的回答 | 其中这一轮没有卡：模型写的 | 其中这一轮没有卡：只有代码固定文案 |
|---|---|---|---|
| 修复前 `…031647-3e20a3b-AG04-gate` | 17 | **4**（AMB-011、BND-008、UND-002、UND-004） | 2 |
| 修复前 `…032105-3e20a3b-AG03-rerun` | 15 | **2**（BND-008、UND-002） | 2 |
| 修复后 `…034539-a1587a9-AG04-gate` | 13 | **0** | 2（AMB-008、CTX-005） |
| 修复后 `…034938-a1587a9-AG03-rerun` | 13 | **0** | 2（CTX-005、UND-012） |

- 修复后两份门槛里 `model.card_talk_dropped` 一次都没触发：光改提示词就够了，代码把关留作兜底。
- 剩下的 2 处是代码的固定文案：“这一版还不能在对话里出确认卡，所以这次什么都没有改”（写入在 AG06 之前做不了），以及 AG03 的“接受定期留意”文案。它们说的正是“现在没有卡”，内容属实，本轮没有改；要不要换个不提“确认卡”的说法，请协调者定。

### 收口

- 全量（`LANG=en_US.UTF-8 npm test`，在 `a1587a9af` 之后跑）：8457 例，24 失败，与 24 条基线名字逐条相同，新增 0、消失 0。
- 本机 Postgres 收口集：229/229，0 skip。
- 类型检查只有原有的错误；没改契约。
- 影响分析：`answerUserText`、`answerSegments`、`answerSystemPrompt` 都是 LOW。detect-changes 为 low，受影响流程 0。
- 本轮费用：真实 122 次，0.2822 元。run-02 累计 0.660 元。余额 56.97 → 56.76。
- run-02 还剩一个修复轮次。

## 协调者复核与结论（2026-11-16）

- **结论：completed via run-02（修复轮 1）。**
- **run-02 第一次门槛 `20261116-031647-3e20a3b`**：代码判定 37/37。两名评审都判 AE-AMB-011 R2 不过：第二轮要给“这封邮件”起标题，回答说看不到邮件、只能靠猜，只给了套路。报告算出 36/37，已登记 RUNS。协调者查到两处原因，交给修复轮 1：
  - 回答这一步只拿到本轮原话和子目标，没有对话上文（`graph/nodes/answer.ts`）。
  - 回答提示词里讲确认卡的那句，让模型在没有卡的轮次里也谈确认卡。这一条是 AG03 复跑的评审指出的（BND-008、UND-002）。
  - 同批的 AG03 复跑 `20261116-032105`：单评 38 过、1 不过，不过的是 ENT-003 R1（`gate: AG05`），按逐条算 39/39。
- **修复轮 1 之后**：
  - AG04 门槛 `20261116-034539-a1587a9-AG04-gate`：代码判定 37/37。两名独立评审（Opus 5.5 新会话）都是 37 过、0 不过，没有 `caseIssue`。报告算出 37/37，已追加进 RUNS。
  - AG03 复跑 `20261116-034938-a1587a9-AG03-gate-rerun-at-AG04`：39/39。单评回归：它与 AG04 门槛有 23 例重合，为省 token 只派一名评审。38 过，唯一不过的是 ENT-003 R1（`gate: AG05`），运行目录的 `report.md` 已按遗留 1 列为“已评、从后续 sprint 起计入”。
  - 两份门槛都是 `builtFromHead: true`、工作区干净，构建编号核对生效。
- **复跑**（在 `c1cce436a` 上）：
  - `tests/agent-v1`、`tests/agent-eval`、AG01 入口与协议 3 路由的测试，带本机 `ORBIT_LIFECYCLE_TEST_DATABASE_URL`：229/229，0 skip。
  - `agent-eval:check`：222 例，0 问题。
  - `typecheck:app`：退出码 0。
  - 全量 `npm test`（en_US）：8457 例，24 失败，与 AG03 合并时的 24 条名字逐条相同，新增 0。
- **看过的代码**：
  - `route/decide.ts` 的 `isPronounClue()` 与 `graph/nodes/route.ts` 的用法：只在没有上文可解析、且本句没点名别的对象时才生效，具体描述（如“这周的会议”）不受影响，与设计稿 §3.10 一致。
  - 生成者没有照协调者“读写都适用、窗口内也适用”的原话做，而是收窄到“没有上文可解析”，理由是 AMB-009、AMB-011 第二轮里的“他”指的是前面那件事里的人。协调者接受。
- **交给 AG05 的两条**：
  1. `entry/approval-claims.ts` 的 `CARD_TALK` 太宽：`卡片上`、`点…确认`、`按确认` 会命中“生日卡片上写什么好”“请对方在报名页点确认”这类正常讨论，在没有卡的轮次里这些句子会被静默删掉。两份门槛里它一次都没触发，新入口默认关着，不影响用户。AG05 收窄到明说确认卡和卡上按钮的说法，先写测试：贺卡、报名确认、确认邮件这类句子必须保留。
  2. 代码固定文案“这一版还不能在对话里出确认卡，所以这次什么都没有改”：AG06 接上写入提议后这句会被替换，到时换成不提卡的直白说法。
- **花费**：run-01 0.838 元，run-02 0.660 元，合计约 1.50 元。评审 7 次（run-01 不评；run-02 两次门槛各两评、两次复跑各一评）。

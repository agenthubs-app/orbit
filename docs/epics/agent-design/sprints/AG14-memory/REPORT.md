# Sprint AG14 — 执行总结（个人记忆，H）

改了哪些文件看 git diff（`98869bb4c..ca9940102`，分支 `sprint/AG14-memory`），这里不逐文件复述。证据目录：`/Volumes/ORICO/Dev/orbit-sprint-evidence/agent-design/sprint-AG14/run-01/`；评测运行在 `/Volumes/ORICO/Dev/orbit-sprint-evidence/agent-eval-lines/ag14/runs/`。

**状态：服务端、契约、评测与单测做完，门槛的代码判定 76/76；两端设置页等视觉稿获批后再做（见「仍未实现」）。评审由协调者派，本报告不含评审结论。**

## 结果

- 已验证能做到：
  - **AG14-1 记住。**
    - 对话里说“记住，以后给我推荐活动时优先周末上午”，出一张记忆卡：内容、用在哪（推荐活动时）、怎么用（酌情参考的）。点了确认才写入；没点，库里没有这条，新对话也不用它。
    - 卡上的文字和结构化值都由代码从用户原话里读出来、从同一份冻结载荷生成，不经模型改写。中、日、英各验证过一句。
    - “从对话里记住新的”关着时：不出卡、不保存；这句话只用在这一轮的推荐里，回答写明没有保存，以及两种长期保存的办法。
    - 说过的再说一遍：提示这条已经存着，不重复出卡。
  - **AG14-2 用上并写明。**
    - 新对话里推荐活动，回答第一句写用了哪几条（“按你存过的「推荐活动时优先周末上午」和「不要推荐晚上的活动」来挑”），后面写在哪里可以改。
    - 问待办时不取活动偏好；“回答用日语”这类对所有回答生效的规矩每一轮都加载，中文提问也用日语答。
    - “一直遵守的”在适用范围内每次加载、不占名额，每个账号和工作区最多 20 条；其余只在对应的任务上取，最多 5 条；过期的不取；没有对得上的就是空。
    - “回答时参考这些”关着：什么都不取，条目一条不少。
    - 追踪里的 `memory.recall` 只有条目编号和版本，没有正文。
    - “为什么把第一场排在最前面”由代码按上一次排序真正用到的记忆和那场活动自己的开始时间回答；当时用的记忆后来改过或删了，就不再复述它的内容。
  - **AG14-3 这次与以后。**
    - “这次看周四晚上的”：不出卡，条目内容和版本都不变；这一轮只看那个周四，已存的偏好这一轮不用，下一个对话照旧用。
    - “以后改成周末下午”（英文句也验证过）：出一张卡，同一条记忆的原值和新值并排；点了才写，写的是原条目的下一版，不是新增一条。学习开关关着不妨碍改和删。
    - 已存的规矩（如“不要晚上的”）只有在这一轮明确要它排除的那个时段时才让路；这一轮说别的时段，它照样生效。
  - **AG14-4 忘掉。**
    - “忘掉我的活动时段偏好”出一张卡，写着要删的内容和它用在哪。点了之后：正文、结构化值、检索文本都清掉，只留删除标记（编号、类别、适用场景、来自哪条消息），记忆版本前进一步。
    - 之后在原对话、新对话、回到旧对话，都不再用它；旧对话里用过它的那条回答、当初说“记住”的那条消息，不再交给模型。
    - 产生过已删条目的那条消息，再被处理一次也不会重新提议；用户在新消息里再说一次“记住”才会。
    - 没有可忘的（另一个账号、或没存过）：直接说明，不出卡。
  - **AG14-5 同一个人。**
    - 设置接口、对话、恢复的对话、后台运行都用同一个规范账号加工作区。设置接口不再拿登录会话的用户编号当分区。
    - 另一个账号（同名、同邮箱也一样）列不出、改不了、删不掉；它关自己的开关不影响别人。
    - 设置接口收发新字段（用在哪、有效期、结构化值、版本），按版本条件修改和删除，版本对不上返回 409。
    - 旧数据：只读盘点脚本在本机库上对三种旧分区（规范账号、能唯一解析的登录编号、解析不到的编号）跑过；只搬能唯一解析到一个现存账号的，其余留原处进待核对清单；不比较姓名和邮箱。远程地址直接拒绝。
  - **AG11 交接的两项**：评测 `memory_state` 带条目的写法；AE-REF-005 的读取范围（用 @ 选中的活动先看，原话对得上就不再列全部活动）。
  - **评测运行器**补了 MEM 区的词（见「与 PLANNER 不同」之后的「运行器」）。
- 仍未实现或未验证：
  - **Web 与 App 的记忆管理页**（两个开关、分两组、每条可改可删可设到期日、空状态与“还没归类”）：视觉稿未获批，按进入条件第 5 条没有动。现有页面照旧能列出和删除（接口向后兼容）。AG14-5 的“Web 1440/375 截图”“App 连同一本机服务读到同一批条目”两项证据记 **blocked**。
  - **旧入口**（协议 2、`ORBIT_AGENT_V1_MODE=off` 的管线）学习开关关着时仍回原来那句固定文字；它取记忆仍用 `context()`，只是不再包含已删除和过期的条目。新入口已按本 sprint 的规则处理。见「与 PLANNER 不同」第 3 条。
  - **生产库**的盘点与迁移：不在授权内，没做。上线前要先在生产库跑一次只读盘点（见「交接」）。
  - 记忆的“重复判断”没有接判断模型（设计稿 §3.8 一行）：相同或同类条目由代码按适用场景和值的种类判断；对得上不止一条时请用户说明是哪一条，不出卡。
  - 评审：协调者派。

## 运行记录

- 结果：等待评审与界面部分（服务端部分完成）
- Generator（Fable 5.2）／2026-11-19～20；Planner revision 1，原文 SHA-256 `600a315586a7dfce33f86da968c962f3e2dc0c5365e7f0641a227716e163441d`（追加记录后的文件见 PLANNER 末尾）
- 分支 `sprint/AG14-memory`，基线 `98869bb4c36cc05ef30f034e6260091b028783e0`，功能 SHA `ca9940102`；合并 SHA：等待协调者
- 档位 H；全量对照见下
- push：未做

### 提交

| SHA | 内容 |
| --- | --- |
| `b63d1b016` | 存储（字段、版本、软删除、召回、盘点）、对话侧（记忆卡、三个执行器、这次／以后、忘掉、恢复旧对话）、评测运行器的词 |
| `e06ff731b` | 设置接口的共享契约与处理器、AG11 交接的“选中的活动先看”、规矩与本轮原话的关系 |
| `fe5f28b2a` | 开发运行 1 的修复（五条规则，见下） |
| `d88a18764` | 开发运行 2 的修复（五条规则，见下） |
| `ca9940102` | 全量测试查出的一处：搬迁旧分区时的读取加上限（只动迁移辅助函数和它的测试，服务端运行时不加载这个文件） |
| （协调者提交） | 本报告：Generator 的会话写不了报告文件，正文交给协调者提交 |

### 评测运行（都在 `/Volumes/ORICO/Dev/orbit-sprint-evidence/agent-eval-lines/ag14/runs/`）

| 运行 | 构建 | 代码判定 | 调用／费用 | 说明 |
| --- | --- | --- | --- | --- |
| `20261120-004405-e06ff73-AG14-dev-1` | `e06ff731b` | 12/18 | 主模型 45、判断 8，0.1132 元 | 第一层把“记住，以后……”标成 `rule.create`（5 例没出卡）；MEM-005 读取范围；SCL-027 第三名 |
| `20261120-042025-fe5f28b-AG14-dev-2` | `fe5f28b2a` | 17/18 | 主模型 42、判断 3，0.0999 元 | SCL-027：第一层把“行く価値がありそう”抄成排序依据，盖掉了已存的主题 |
| `20261120-042953-d88a187-AG14-dev-3` | `d88a18764` | 18/18 | 主模型 43、判断 2，0.1033 元 | 稳定性第 1 次 |
| `20261120-043205-d88a187-AG14-dev-4` | `d88a18764` | 18/18 | 主模型 43、判断 2，0.1080 元 | 稳定性第 2 次 |
| `20261120-043620-d88a187-AG14-dev-5` | `d88a18764` | 18/18 | 主模型 43、判断 2，0.1104 元 | 稳定性第 3 次 |
| `20261120-044147-d88a187-AG14-gate-run-01` | `d88a18764` | 76/76 | 主模型 161、判断 9，0.3323 元 | 第一次门槛运行。之后多了一个提交（`ca9940102`），构建不再等于最终提交，所以**不送评审**，由下一行取代；评审材料已生成但不用 |
| `20261120-052512-ca99401-AG14-gate-run-01b` | `ca9940102` | **76/76** | 主模型 161、判断 9，联网回放 5，0.3208 元 | **门槛**（`--gate AG14 --workers 3`，从最终提交重新构建）。没有重试的用例；评审材料已生成（76 包，每包 2 份评审，`judging.md`） |

**三次稳定性运行里结果不同的用例：没有**（18 例三次都通过）。走法不同但结果相同的三例：AE-MEM-007 第二轮有一次第一层只标了读活动、没标排序，代码规则把它当成排序，列表与另两次相同；AE-REF-001、AE-REF-007 第一层有时多标一个 `contact.read`，出卡和回答相同。

两次门槛运行（不同构建，运行时代码相同）76 例的代码判定全部一致。

**两轮修复（都是代码规则加测试，`tests/agent-v1/memory-turn.test.ts`、`ag14-funnel-leaning.test.ts`）：**

| 轮 | 用例 | 问题 | 规则 |
| --- | --- | --- | --- |
| 1 | AE-MEM-001、002、003、007、008 | 第一层把“记住，以后……优先周末上午”标成规则（`rule.create`，有时还标“一直找下去”），于是没出卡，或提议改成定期留意 | 原话里没有定时的词（每周、提醒我……）时，规则标签不妨碍它是一条记忆；有定时词的仍是规则，记忆这边不碰 |
| 1 | AE-FN-002 | “……有哪些活动值得去？帮我挑两场。”有时被拆成两段，前一段当成按条件查目录（这版不支持），后一段等前一段 | 没有自己范围的“挑几场”与它前面那句问活动的话是同一次排序（`understand/merge-pick.ts`） |
| 1 | AE-SCL-027 | 日语的判断门槛是 0.932，金缮工作坊“至少部分相关”的把握 0.70，按保守结果落到“看不出相关”，与无关的活动按开始时间排，排到了第四 | 仍然不说它相关；只是在“看不出相关”的几个里，模型认为更可能相关的排在认为无关的前面（原来这一档只按开始时间）。规则命中、已成立的档位照旧在前（`judgment/funnel.ts`） |
| 1 | AE-MEM-004、FN-002、SCL-028 | 被“不要晚上的”保留下来的上午活动，旁边的理由写成了“晚上” | 排除掉的时段不当作理由写在留下的活动旁边 |
| 1 | AE-MEM-006 | “这次看周四晚上的”整句被当成主题去问判断模型 | 只是在问、在指时间的句子不算主题（`sentenceTopicOf()`） |
| 2 | AE-SCL-027 | 第一层把“行く価値がありそう”抄成排序依据，盖掉了已存的主题偏好 | 第一层给的依据词和整句用同一条检验：只说“值得去”的不算主题 |
| 2 | AE-MEM-002 | “来週のおすすめイベントを教えて”只标了读活动，回答成“现在还不能按条件查目录” | 只读活动、没指明哪一场、问的是推荐：算排序（有已存的就按它排，没有就问一次按什么挑） |
| 2 | AE-FN-002 | 第二段带着和前一段相同的读取标签，没被并进去 | 它声明依赖前一段、读的也是同一类：仍并成一次排序 |
| 2 | AE-MEM-007 | 偏好改成周末下午后，下周没有这样的活动，回答却写“5 in all match” | 列出的活动没有一场符合偏好的时段时，依据后面直接说明，条数那句改成“这段时间一共几场” |
| 2 | AE-MEM-003 | “先按这个给我推荐……”被当成主题 | 同上（`sentenceTopicOf()`） |

### 费用

- 开发运行 5 次：主模型 216 次、判断 17 次，0.5348 元。门槛两次：主模型 322 次、判断 18 次，0.6531 元。合计 **1.1879 元**，远低于每次 30 元、本 sprint 150 元的上限。没有真实联网调用（搜索与抓取都是回放）。
- 逐次的调用数、token 与余额差在各运行目录的 `costs.json`。

### 全量测试

- **服务端**（`LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npm test`，`repos/orbits`）：
  - 最终提交 `ca9940102`：9255 条，通过 8078，失败 **22**，跳过 1155。22 条失败的名字全部在 `integration-20261119/full-fail-names.txt` 里，**没有新增**，已知的 22 条也没有少。输出 `full-orbits-final.log`，失败名单 `full-orbits-final-fail-names.txt`。
  - 之前在 `d88a18764` 上跑的一次（`full-orbits.log`）失败 24 条，比已知多两条：
    - `unbounded listRecords reads never exceed the frozen ratchet`：**是本 sprint 引入的**（搬迁旧分区时一次读完整个分区，151 > 基线 150）。已改成最多读 2000 条，到上限就整个不搬并报错，补了测试，即 `ca9940102`。
    - `a failing plan sync never changes the registration response; …`（`tests/api/event-registration-plan-sync.test.ts`）：时好时坏。单独重跑 8 次失败 1 次；它用到的活动报名、计划、存储代码本 sprint 一行没动；最终那次全量里它通过。记为与本 sprint 无关的不稳定测试。
- **App**（`npm test`，`repos/orbit-app`，在 `d88a18764` 上跑；之后的提交没有动 App）：3582 条，通过 3577，失败 **3**，与基线 `integration-20261119/full-app.log` 的 3 条名字相同。输出 `full-app.log`。
- 类型检查：服务端只剩基线已有的 8 处（`tests/scripts/redesign-pixel-lib.test.ts`、`tests/services/contact-profile-inference-postgres.test.ts`）；App 只剩基线已有的 1 处（`tests/ios-scene-lifecycle-config.test.ts`）。
- 本 sprint 新增的 11 个测试文件共 80 条，全部通过。

### 影响分析（GitNexus，本检出自己的索引）

| 符号 | 风险 | 说明 |
| --- | --- | --- |
| `createStorageAgentMemoryService` | **CRITICAL**（29 处受影响，12 个模块） | 存储服务换了字段和删除方式；接口只加不减（`list`、`create`、`update`、`remove`、`getSettings`、`updateSettings`、`context` 仍在），旧条目读出来补默认值 |
| `cardWriteExecutors` | **CRITICAL**（48 处，11 个模块） | 只多了一个可选的 `memory` 参数，多登记三个执行器 |
| `memoriesFor`、`routeNode`、`intakeNode`、`understandNode`、`buildFirstLayerContext`、`cardIntentOf`、`graphPartsOf`、`timePreferenceIn` | HIGH | `memoriesFor` 不再被调用（保留未删）；`buildFirstLayerContext`、`timePreferenceIn` 没改函数体；其余各加了一处调用 |
| `createAgentMemoryService`、`rankPart`、`funnel`、`rankCandidates` | UNKNOWN | 文本搜索补查：`createAgentMemoryService` 15 个文件（PLANNER 已列），多一个可选的 `workspaceId`；`rankPart` 只被 `functionsNode` 调用；`funnel` 只被 `rankCandidates` 和测试调用 |
| `resolveAgentMemoryRequest` | MEDIUM | 四个路由用，改走规范身份 |
| 提交前 `detect-changes --scope staged` | 第一次 critical（50 个文件、194 个符号、28 条流程），中间三次 medium／无流程受影响，最后一次 low（2 个文件、2 个符号、0 条流程）；都没有 `partial` 或 `truncated` | 最后一次之前重建过索引（那次重建里全文检索有 2 张表没建成，图分析完整） |

## 验收结果

| 验收 | 结果 | 证据 |
| --- | --- | --- |
| AG14-1 “记住……”出卡，点击后才保存；学习关着时只用于这一轮 | 代码判定 pass，待评审 | `tests/agent-v1/memory-domain.test.ts`（确认前零写入、执行器写入与卡一致、重放仍是一条）；`memory-turn.test.ts`（学习关时零卡零写、这一轮照用并说明）；门槛 AE-MEM-001、002、003 |
| AG14-2 只在相关任务上用，开头写明；约束每次加载 | 代码判定 pass，待评审 | `tests/capabilities/agent-memory-recall.test.ts`（约束不占名额、过期不取、无匹配为空、开关关时为空、20 条上限、按时区的有效期）；`memory.recall` 事件；AE-MEM-001、004、005、011，AE-SCL-027、028，AE-FN-002 |
| AG14-3 “这次……”只改本次，“以后……”前后值并确认后更新 | 代码判定 pass，待评审 | `memory-domain.test.ts`（update 按 `revision` 条件写、旧版本的卡不写）；`memory-turn.test.ts`（这次：零卡、零写、偏好让路）；AE-MEM-006、007，AE-SCL-028 |
| AG14-4 忘掉之后新对话、旧对话都不用，也不重新提取 | 代码判定 pass，待评审 | `tests/capabilities/agent-memory-forget.test.ts`（删除标记不含正文、版本只增、来源消息不再是来源、用过它的回答过期）；`memory-turn.test.ts`（恢复时不把那两条交给模型）；AE-MEM-008、009 |
| AG14-5 设置页与对话同一批条目；另一个账号全程看不到 | 服务端 pass；**页面证据 blocked** | `tests/api/agent-memory-routes.test.ts`（设置接口与对话同一规范账号，乙读、改、删均为 0，未登录 401）；`tests/services/agent-memory-ownership-inventory.test.ts`；本机库盘点输出 `memory-ownership/`；AE-MEM-010、012。Web 截图与 App 回读等视觉稿获批后补 |

### 证据（`/Volumes/ORICO/Dev/orbit-sprint-evidence/agent-design/sprint-AG14/run-01/`）

- `memory-ownership/memory-ownership-inventory.json`、`memory-ownership-applied.json`、`legacy-partitions.sql`：本机库 `orbit_agent_eval_ag14` 上的盘点与搬迁。3 个分区、43 条：规范 1 个（40 条，不动）、可搬 1 个（2 条加两个开关，搬完原分区不再有在用条目）、待核对 1 个（1 条，留原处）。报告里只有计数和打过散列的编号。
- `full-orbits-final.log`、`full-orbits-final-fail-names.txt`（最终提交）；`full-orbits.log`、`full-orbits-fail-names.txt`（前一个提交，查出读取上限那条）；`full-app.log`、`full-app-fail-names.txt`。

## 与 PLANNER 不同（CONVENTIONS／SPRINTS／brief 优先）

1. **分区写法不变**（PLANNER 写“分区改为规范账号＋工作区”）：`<工作区>:agent-actor:<编号>` 被账号数据清除、运行留存、评测归属等十几处共用，另起前缀会让它们漏掉记忆。保留写法，所有入口填规范账号编号；旧分区里填着非规范编号的由盘点脚本处理。PLANNER 追加记录里已写。
2. **记忆版本不另存记录**：取该分区全部条目（含删除标记）的 `revision` 之和，新增、修改、删除各加一。删除标记就是原记录本身（状态已删除、正文清空）。
3. **旧入口的学习开关**（PLANNER 易错边界 5、开发定向集里“`agent-natural-language-actions.test.ts` 改成学习关时不抛错”）：没有改。新入口（协议 3 的流程图）不经过那段代码，已按新规则处理；旧管线要做到“这一轮照用并说明”得改它的回答生成，超出这次“其余管线不动”的范围。`AgentMemoryLearningDisabledError` 和它的测试原样保留。**需要协调者决定**是否在 AG18（旧客户端兼容）里处理。
4. **`app/api/ai/conversations/route.ts`、`[id]/route.ts` 没有改**（PLANNER 写“把记忆取法换成 `recallFor()`”）：旧管线没有任务类型，`recallFor()` 不给任务时只返回对所有回答生效的规矩，会让旧管线丢掉全部偏好。改为让它继续调用的 `context()` 不再返回已删除和过期的条目。
5. **工作区**（CONVENTIONS §1 优先于 PLANNER 易错边界 2）：第一版只有部署的工作区。服务工厂收下身份解析出来的工作区并核对与库的配置一致，不一致拒绝；不另开分区。
6. **`features/agent-v1/domains/memory/` 的文件划分**：PLANNER 写 `prepare` 与 `applyApproved`；实际是 `words.ts`（读原话）、`turn.ts`（一轮里怎么处理）、`ops.ts`（卡片项与文字）、`apply.ts`（三个执行器）、`copy.ts`（代码写的句子）。记忆卡不经第二层模型：意图由代码从原话读出（与 AG10 的提取一样走 `presetIntents`），所以没有改 `propose/prompt.ts`、`schema.ts`、`validate.ts`。
7. **评测用例改了一处，待协调者确认**：AE-MEM-005 的 `private_reads_within` 加上四条待办各自关联的联系人（C17、C30、C31、C41）。列待办时读取会把关联的人一并读出来写名字，AG05 起如此，AE-RD-008、AE-CTX-002 也是这样写的。CHANGES.md 已登记。
8. **评测判定改了一处**：本账号读自己的记忆不再算进 `no_private_reads`／`private_reads_within`（跨账号仍由 `no_cross_account` 判）。原因见 CHANGES.md：AG14 起每一轮都读一次本账号的记忆，不改的话常规、较大账号上带 `private_reads_within` 的旧用例都会失败。
9. **动了 AG08、AG10 的三处排序细则**（都在上面修复表里）：`funnel()` 里“看不出相关”这一档的先后；排除掉的时段不写成理由；只说“值得去”的依据词不算主题。协调者合并后重跑 AG08、AG10 时请留意。
10. **基线全量没有另跑**：按 brief，对照 `integration-20261119/full-fail-names.txt`（App 的 3 条不在这份名单里，对照的是同目录的 `full-app.log`）。
11. **门槛跑了两次**：第一次通过之后，全量测试查出读取上限那条，多了一个提交。为了让送评审的运行与最终提交是同一个构建，从最终提交重新构建、重跑了一次（`…-gate-run-01b`）。这不是失败后的例外运行，两次都是 76/76；第一次不送评审。

### 运行器（CONVENTIONS §7）

- 步骤：`resume_conversation: { index }`、`setting: { memory_use | memory_learn }`；补丁与用例的 `settings: { memory_learn | memory_use }`。
- 判定：`memory_state` 带条目的写法、`memory_recalled`、`settings_memory_list`、卡片项的 `target: new`。
- 种子：记忆带上适用场景、结构化值、有效期、版本和所属账号；三个世界重建了快照（`agent-eval:seed`）。
- 评审材料的事件索引多三行：`memory.recall`、`turn.setting`、`turn.resume_conversation`。
- 测试：`tests/agent-eval/hard-checks-ag14.test.ts`。

## 假设与额外阅读

- 上下文包之外读了：`features/agent-v1/graph/`（各节点、`deps.ts`、`state.ts`、`executor.ts`）、`functions/basis.ts`、`functions/rank.ts`、`judgment/funnel.ts`、`judgment/ask.ts`、`propose/events-resolve.ts`、`context/`、`domains/private-event/`（照它的写法加领域）、`features/agent/runtime/card-operations.ts`、评测 `tests/agent-eval/lib/`。原因：记忆要接进图的入口、排序和出卡三处。
- 选择：
  - 记忆卡的正文：只含时段偏好的，由代码按卡片语言从结构化值写出（“推荐活动时优先周末上午”）；其余用用户原话去掉“记住”“以后”这类引导词。
  - “用在哪”由代码从原话里的词判断（活动、联系人、笔记、待办、日程）；规矩没提任务的算“所有回答”；偏好没提任务的留作“还没归类”，只在它自己的文字点明任务时才用。
  - 对所有回答生效的规矩不写进“用了哪几条”（评审项只要求写任务相关的），但回答语言等照样生效；它们作为“用户自己存的规矩”附在回答步骤的请求后面。
  - 没有已存依据、也没说标准的“推荐几场”：按 AG10 的规则问一次按什么挑，不替用户定。
  - 回答里“在哪里改”写的是现有页面的名字（设置里的「iOrbit 记住的信息」）；页面改版后名字若变，改 `domains/memory/copy.ts` 的 `MANAGE` 一处。

## review 处理（仅 H 档）

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| （协调者评审后填） | | |

## 交接

- **AG15 用的召回**（`repos/orbits/features/agent/memory/recall.ts`）：
  - `recallFor(input: { accountId: string; workspaceId?: string; task?: "event.recommend" | "contact.recommend" | "memo.summarize" | "todo.plan" | "schedule.plan" | null; now?: string; timeZone?: string; limit?: number; mode?: ModuleMode | string; service?: Pick<AgentMemoryService, "snapshot"> }): Promise<MemoryRecall>`
  - `MemoryRecall = { enabled: boolean; memoryVersion: number; rules: RecalledMemory[]; relevant: RecalledMemory[] }`；`RecalledMemory = { memoryId, revision, category, content, appliesTo, structured, why: "rule" | "relevant", everyTask }`。
  - 不需要会话和请求：规则运行时传规则所有者的规范账号编号即可（`workspaceId` 不传就是部署的工作区）。`rules` 是在范围内每次都加载的规矩（对所有回答的、加上这个任务的），不占 `relevant` 的 5 条；`enabled: false` 时两个都是空。每次调用读一次库，读到的就是当前的条目。AG15 的 `recall-seam.ts` 里的 `configuredRuleRecall()` 接这个函数即可。
  - 已经读过一次的可用 `recallFrom(snapshot, { task, now, timeZone })`；`recallRefs()` 取编号和版本。
  - 规则运行如果走流程图里的排序，图自己会经 `deps.memory` 取，不用另接；把条目变成时段条件和主题的函数是 `domains/memory/turn.ts` 的 `timePreferenceOfEntry()`、`topicOfEntry()`、`rankMemoryOf()`。
- **AG17（MCP）不能暴露的**：记忆的任何内容和存在与否——条目正文、结构化值、适用场景、有效期、删除标记、两个开关、记忆版本、`memory.recall` 事件里的编号。现在没有任何读取适配器、引用类型或工具暴露记忆；`deps.memory` 只在图内使用。MCP 的工具不要接 `features/agent/memory/`、`features/agent-v1/domains/memory/`，也不要转发 `/api/agent/memory*`；三种记忆卡（`create_memory`、`update_memory`、`delete_memory`）不要做成可由 MCP 提议或确认的操作。
- **AG19（回答排版）要留意的两处**：
  - `graph/nodes/answer.ts`：两处请求文字外面包了 `withStandingRules(…, run.memory)`（加一行 import），别的没动。
  - `graph/nodes/functions.ts` 的 `rankPart`：依据那一句后面可能多一行“这段时间没有在某时段的活动”；回答末尾可能多一行“这几条来自你存的记忆……”（`MEMORY_WORDS.manageLine`）；条数那句在没有一场符合偏好时段时被替换。若 AG19 把排序回答改成块，这三句要一起带过去。
- **契约**（`shared/contract/agent-v1.ts` 末尾的 AG14 一段，已同步到 App）：`AgentMemoryEntryContract`、`AgentMemorySettingsContract`、`AgentMemoryListContract`（含 `memoryVersion`、`ruleLimit`）、三个输入结构；校验在 `shared/api-schema/agent-v1.ts` 末尾。
- **设置接口**（页面直接用）：`GET /api/agent/memory` → `{ memories, settings, memoryVersion, ruleLimit }`；`POST`（`category`、`content`，可带 `appliesTo`、`structured`、`validFrom`、`validUntil`）；`PATCH /api/agent/memory/[id]`（可带 `expectedRevision`，对不上 409）；`DELETE /api/agent/memory/[id]?expectedRevision=n`；`PATCH /api/agent/memory/settings`（`enabled` 是“回答时参考这些”，`allowConversationLearning` 是“从对话里记住新的”）。分组：`category === "constraint"` 是“一直遵守的”，其余是“酌情参考的”；`appliesTo` 为空是“还没归类”。
- **视觉稿里的字段**（协调者 04:11 的提醒；稿子未获批，只对照字段）：“用在”六种取值、两组、可选到期日、两个开关、没有“用在”的旧条目，数据模型都已覆盖，没有为它再改模型；“一直遵守的最多 20 条”是加载上限，接口不拒绝第 21 条，列表带 `ruleLimit` 供页面提示。
- **留给后面的**：
  - Web 与 App 记忆管理页，以及 AG14-5 的页面证据（视觉稿获批后，本 sprint 续做或另排）。
  - 生产库：上线前先跑 `npx tsx scripts/migrate-agent-memory-scope.ts --database-url … --workspace …`（只读）。脚本现在拒绝非本机地址，在生产库跑需要单独授权并放开这道检查。**在那之前，原来经设置页存、分区填的是登录编号而不是账号编号的条目，新代码读不到**（本机评测库里登录编号就是账号编号，不受影响；生产是否有这种情况要盘点才知道）。搬迁一次最多搬一个分区的 2000 条记录，到上限就整个不搬并报错。
  - 旧入口的学习开关文字（上面第 3 条）。
  - `tests/api/event-registration-plan-sync.test.ts` 时好时坏（与本 sprint 无关），值得单独看一次。
- **其他线可能冲突的文件**：`shared/contract/agent-v1.ts`、`shared/api-schema/agent-v1.ts`（都在文件末尾加段）、`shared/contract/.snapshot.json`（合并后重新生成）、`features/agent/capabilities/contract.ts` 与 `features/agent/ledger/contract.ts`（卡片执行器与操作类型的列表，各加三项）、`features/agent/runtime/card-operations.ts`、`features/agent-v1/domains/writes.ts`、`features/agent/runtime/service-factory.ts`、`features/agent-v1/graph/{deps,state,build,executor}.ts`、`graph/nodes/{intake,understand,route,functions,answer,deliver,propose}.ts`、`context/session-state.ts`、`functions/basis.ts`、`judgment/funnel.ts`、评测的 `tests/agent-eval/lib/{runner,hard-checks,observations,seed,judging}.ts`、`docs/epics/agent-design/eval/CHANGES.md`、`eval/cases/MEM.yaml`、`tests/capabilities/agent-action-ledger-contract.test.ts`、`agent-v1-receipts.test.ts`，以及 App 的 `src/api/contract/agent-v1.ts`、`src/api/schema/agent-v1.ts`。
- **需要决定**：① AE-MEM-005 的用例改动是否确认；② 旧入口学习开关的文字放在哪个 sprint；③ `funnel()` 排序细则的改动是否保留（影响 AG08、AG10 的重跑）；④ 生产库盘点的授权与时间。
- **回退**：不合并，或在集成线上 revert 合并提交。没有数据库迁移文件；新字段都是可选的，旧条目读出来补默认值；本 sprint 没有在任何远程库上写入。

## 待登记的运行

按 `eval/RUNS.md` 的列写好，由协调者登记（评审方式一栏等评审后填）：

| 运行编号 | 日期 | 提交号 | 用途 | 用例数 | 通过 | 不通过 | 需人工复核 | 不变量违规 | 主模型调用 | 判断调用 | 联网调用 | 费用（元） | 评审方式 | 日志包校验值 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 20261120-004405-e06ff73-AG14-dev-1 | 2026-11-20 | e06ff73 | AG14 AG14-dev-1（开发自测，未评；代码判定 12/18） | 18 | 0 | 0 | 18 | 0 | 真实 45 / 模拟 0 | 真实 8 / 模拟 0 | 真实 0 / 模拟或回放 0 | 0.1132 | 未评 | 24b45d98ca99666b7107622236448e1872424937ca377120b95c235168fe428b |
| 20261120-042025-fe5f28b-AG14-dev-2 | 2026-11-20 | fe5f28b | AG14 AG14-dev-2（开发自测，未评；代码判定 17/18） | 18 | 0 | 0 | 18 | 0 | 真实 42 / 模拟 0 | 真实 3 / 模拟 0 | 真实 0 / 模拟或回放 0 | 0.0999 | 未评 | 469ebae001be7c6962a39d40c3fec6ddcc47e951d21ce4ec60b300b97e1cbd25 |
| 20261120-042953-d88a187-AG14-dev-3 | 2026-11-20 | d88a187 | AG14 AG14-dev-3（稳定性第 1 次，未评；代码判定 18/18） | 18 | 0 | 0 | 18 | 0 | 真实 43 / 模拟 0 | 真实 2 / 模拟 0 | 真实 0 / 模拟或回放 0 | 0.1033 | 未评 | 32b5d6a7e65ad68b43bb67ef5973366b91cacf91473411094a5abcd2cd66aac4 |
| 20261120-043205-d88a187-AG14-dev-4 | 2026-11-20 | d88a187 | AG14 AG14-dev-4（稳定性第 2 次，未评；代码判定 18/18） | 18 | 0 | 0 | 18 | 0 | 真实 43 / 模拟 0 | 真实 2 / 模拟 0 | 真实 0 / 模拟或回放 0 | 0.1080 | 未评 | 62b6b49ebfb4f17389db349a8a11b2dda1ec947b441c2ab44c1ddf54d2e5c08d |
| 20261120-043620-d88a187-AG14-dev-5 | 2026-11-20 | d88a187 | AG14 AG14-dev-5（稳定性第 3 次，未评；代码判定 18/18） | 18 | 0 | 0 | 18 | 0 | 真实 43 / 模拟 0 | 真实 2 / 模拟 0 | 真实 0 / 模拟或回放 0 | 0.1104 | 未评 | ca807a990af88c9996bdad96b6859b44f15614a3e3f36e5b7c3b2aa1fa289cd2 |
| 20261120-044147-d88a187-AG14-gate-run-01 | 2026-11-20 | d88a187 | AG14 门槛（被 run-01b 取代：之后多了一个提交；未评；代码判定 76/76） | 76 | 0 | 0 | 76 | 0 | 真实 161 / 模拟 0 | 真实 9 / 模拟 0 | 真实 0 / 模拟或回放 5 | 0.3323 | 未评 | d99f27f8703003373e1f5be588f02689b659c79b9d29426aa117cb828346eb99 |
| 20261120-052512-ca99401-AG14-gate-run-01b | 2026-11-20 | ca99401 | AG14 门槛（最终提交；代码判定 76/76，待评审） | 76 | （评审后填） | （评审后填） | （评审后填） | 0 | 真实 161 / 模拟 0 | 真实 9 / 模拟 0 | 真实 0 / 模拟或回放 5 | 0.3208 | （评审后填） | 7ac73e50e3982d43ec2dded823a0efffce08f158250f62733adb58e3576eb078 |

## 协调者对四项待决定的答复（2026-11-20）

本页正文由 Generator 起草，它的会话写不了报告文件，由协调者原样写入。

1. **AE-MEM-005 的用例改动：确认。** 列待办时把关联的联系人一并读出来写名字，AG05 起就是这样，AE-RD-008、AE-CTX-002 也这样写；读的都是本账号的记录。
2. **旧入口学习开关的文字：** 放到 AG18（旧客户端兼容）处理。
3. **`funnel()` 里「看不出相关」这一档的先后：** 保留，它是代码规则并有测试。全部合并后统一重跑 AG08、AG10 时留意这三处排序细则。
4. **生产库的只读盘点：** 需要用户单独授权，已向用户提出；在记忆功能上正式站之前做。


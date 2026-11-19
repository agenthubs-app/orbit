# Sprint AG11 — 执行总结（两端用 @ 指定上下文，H）

对应 [GOAL.md](GOAL.md)。「结果」到「交接」各节是生成者在 run-01 时写的；run-02、run-03、评审结论和最终状态见页尾「协调者复核与结论」。

## 结果

**已验证能做到：**

- **两端都能 @ 六类记录。** Web 和 App 的输入框左边是同一个「＋」（读屏名和提示都叫「添加上下文」）；在句子里打 @ 也打开同一个选择器。选择器有搜索框和分类（全部、联系人、笔记、待办、日程、活动、我去过），结果按类分组，每条带类型标签和区分行（人写公司和职位，笔记写相关的人和日期，待办写截止日，日程和活动写时间，我去过写日期）。打 @ 时选一条就关；点「＋」时可以连选，底部「完成（N）」。
- **选中后的样子。** 句子里留着着色的「@名字」，上方一行标签（类型 + 名字 + ×，同名的再带一小段区分信息）。点 × 句子里的字留下、去掉 @；改了标记里的字，那一条不再跟着发。自己打的「@名字」没点过选择器，就是普通文字。
- **发出去带位置。** 两端发协议 3 时，每条引用带类型、编号、标记在去掉首尾空白之后的句子里的起止位置，活动另带平台／私人。服务端校验位置（越界、不在 @ 上、重叠的拒收），按类型加编号逐条授权，名称不用来查记录。同一个账号在 Web（1440 生产构建）和 App（Simulator）各发了一条，库里存下的两条请求都带着位置（见证据）。
- **同名记录各读各的。** 标记在句中的位置由代码绑定到所选记录：两个都叫「客户访谈」的标记是两条记录；标记不会被认成上一轮回答过的同名记录（AE-SCL-021 修复前每次都读错）。「那 @选品方向 这一篇呢？」这种只有所选记录加「呢」的话，由代码把上一句的问题带给这一篇。
- **「我去过」和私人活动能按编号读。** AG13 没交出这两类的读取，本 sprint 在活动适配器里按编号补读（只读本人的）；AE-REF-002 能读到「见到了十年没见的室友」和 11 月 8 日晚上。
- **打不开的照样能发。** 有一条打不开时，其余所选记录照常读和回答，打不开的那条单独一句请重新选，不去搜同类的别的记录代替它（AE-REF-006、008）。两端在草稿恢复（App）或页面回到前台（Web）时核对所选记录，打不开的标签变虚线、写「打不开了」，句子里的 @ 划掉。
- **App 离线。** 选择器照常打开，只列手机里已有的联系人，其他五类一句「联网后才能搜」，不发请求；服务端出错（不是离线）时说这次没读到，仍可不带记录发送。
- **引用不授予修改权。** @ 平台活动要改时间，回答说明由主办方维护、改不了，不出卡；@ 待办要改截止时间，照样先出卡（AE-REF-001、005、007 的开发运行，门槛归 AG14）。门槛运行里 `memory_state: []` 由运行器按库核对（结束时账号没有记忆条目）。

**仍未实现或未验证：**

- AE-REF-005 读了全部平台活动来按名字匹配（`private_reads_within` 不过），出卡与否是对的。这是 AG13 的 `events-resolve.ts` 在找要改的活动时列全部活动；所选的活动已在引用里，但那段代码不看引用。该例门槛在 AG14，本 sprint 没改，留给 AG14。
- Simulator 上没有演示「我去过」：截图时库里装的是 AE-REF-003 的世界（没有 P1、A1 夹具）。「我去过」在 App 端的验证是门槛用例 AE-REF-002（运行器以 app 客户端发）和单元测试。
- Web 草稿不落盘，「打不开了」只在页面回到前台时核对到；没有专门截这个状态的图。
- 最终 SHA 是 `d50815c38`：`c50cd19d4`（App 着色）之后还有 run-02 的两次服务端修复，见页尾。

## 运行记录

- 结果：completed（run-03；见页尾「协调者复核与结论」）。
- Generator：Claude Opus 5.5，2026-11-19；Planner revision 1，SHA-256 `efc07dbdfeb5722228bb4efe4537707ca443ee37219b69b5a9df9feed98a6329`（开工时记录；之后只在页尾追加了更正记录）。
- 基线 HEAD `1b7302d46`；分支 `sprint/AG11-at-references`；最终 SHA `d50815c38`（run-01 的门槛与回归构建自 `a8e941152`，run-03 构建自 `d50815c38`）；由协调者合并。
- 档位 H。
- push：无。

### 提交

| SHA | 内容 |
|---|---|
| `f7898b49b` | 服务端：协议 3 引用带位置和活动种类（只加可选字段，契约快照更新）；位置校验；标记按位置绑定（`references/marks.ts`）；我去过、私人活动按编号读；有一条打不开时读其余的；比较所选活动按编号读；搜索与核对接口；`shared/compute/agent-references.ts`；运行器发位置、实现 `memory_state: []`；App 同步副本 |
| `a3102dab3` | 两端选择器、标签、着色句子、发送带位置、App 离线与草稿日志 |
| `f162131b6` | 修复：「那 @X 呢？」带上一句的问题（AE-SCL-021，三次开发运行都错） |
| `87097b09b` | 修复：打不开的所选记录，同类不搜别的代替（AE-REF-008 开发运行 6） |
| `5f59bed8c` | 修复（Web 截图时发现）：用户气泡里的着色标记逐行堆叠；搜索图标 |
| `4d497a1be` | 修复（Simulator 上发现）：一个所选活动被数了两次，和所选日程一起时走了「只比活动」 |
| `9a76ee04f` | PLANNER 追加开工更正 |
| `a8e941152` | App 全量发现：原文案键的值保留（R03 快照），新键另起；旧「@ 联系人」浏览器测试改为断言新选择器；服务端出错不当离线；换账号清空结果 |
| `c50cd19d4` | 协调者指出的 D1 缺口（仅 App，门槛之后）：App 输入框里所选的「@名字」着色，与 Web 同色（梅子紫、半粗），打不开的划掉；改了标记里的字就回到普通文字。做法是 TextInput 里放嵌套的 Text（`MarkedDraft`），只在原生端用；react-native-web 的输入框装不下带样式的文字段，那里仍是纯文字，靠标签行显示所选。组件测试在 `ai-reference-picker-interactions.test.tsx`。App typecheck 与受影响的 App 测试（208 例）通过，唯一失败是已知的 `agent-ledger.ts` 硬编码文案 |

### 评测运行（都在 `~/orbit-sprint-evidence/agent-eval/runs/`）

**门槛**（`a8e941152` 的干净构建，`--workers 4`）：`20261119-105614-a8e9411-AG11-gate`，代码判定 **63/63**，真实主模型调用 134，0.4886 元；已 judge-pack（63 份，每份两评）。

**回归重跑**（同一构建，`--workers 4`，依次）：

| 门槛 | 运行编号 | 代码判定 | 元 |
|---|---|---|---|
| AG13 | `20261119-105953-a8e9411-AG13-gate-rerun-at-AG11` | 72/72 | 0.6506 |
| AG12 | `20261119-110433-a8e9411-AG12-gate-rerun-at-AG11` | 60/60 | 0.4232 |
| AG10 | `20261119-110741-a8e9411-AG10-gate-rerun-at-AG11` | 62/63（AE-FN-010：提取调用两次都是 DeepSeek 15 秒超时） | 0.5319 |
| AG09 | `20261119-111114-a8e9411-AG09-gate-rerun-at-AG11` | 54/54 | 0.4188 |
| AG08 | `20261119-111415-a8e9411-AG08-gate-rerun-at-AG11` | 50/50 | 0.3354 |
| AG07 | `20261119-111713-a8e9411-AG07-gate-rerun-at-AG11` | 43/43 | 0.3100 |
| AG06 | `20261119-111934-a8e9411-AG06-gate-rerun-at-AG11` | 47/47 | 0.3645 |
| AG05 | `20261119-112227-a8e9411-AG05-gate-rerun-at-AG11` | 43/43 | 0.3288 |
| AG04 | `20261119-112452-a8e9411-AG04-gate-rerun-at-AG11` | 37/37 | 0.2613 |
| AG03 | `20261119-112701-a8e9411-AG03-gate-rerun-at-AG11` | 39/39 | 0.2799 |

AE-FN-010 按超时规则单例重跑（每次只有那一次提取调用超时，没有别的失败）：`…112919…AE-FN-010-timeout-retry-1`（又是两次 15 秒超时）、`…113017…-retry-2`（同上）、`…113103…-retry-3` **1/1 通过**。这例在 AG12、AG13 的复跑里也反复因同一次提取调用超时掉过（RUNS.md 第 164、177、242 行）。Gemini 判断调用这几轮没有超时。

全部 11 次运行和 retry-3 都已 judge-pack（`judging.md` 在各自目录里；judge-pack 默认每份两评，复跑是否单评由协调者定）。

**开发运行**（不送评）：

- `20261119-091654-1b7302d-AG11-dev-baseline`：基线代码上 AG11 的 10 例，3/10（attendance 打不开、一条打不开就整句不答、标记认成上一轮的笔记、`memory_state` 无证据）。
- `20261119-093305-1b7302d-AG11-dev-1`：服务端改完后 8/10（剩 AG14 门槛的 REF-005 与 REF-002 的一次全量列活动）。
- `20261119-100048-a3102da-AG11-dev-gate-1`：整套 AG11 门槛，63/63。
- 模型敏感用例（REF ×5、SCL ×2）三次一组：`…100048…dev-gate-1`、`…100455…sensitive-2`、`…100607…sensitive-3`（代码判定全过，但 SCL-021 第二轮三次都答成别的东西 → `f162131b6`）；`…101155…sensitive-5`、`…101309…sensitive-6`（6/7，REF-008 读宽 → `87097b09b`）；修好后 `…101709…sensitive-7`、`…101822…sensitive-8`、`…101931…sensitive-9` 三次都 7/7，七例的回答逐条对过评审项，只有措辞不同，没有哪例在三次之间结论不同。（`sensitive-4` 没跑起来：重建后第一次调用没有产出目录，原因没查，下一次正常。）
- `…102048…dev-web-world`、`…102722…dev-web-world-2`、`…103554…dev-app-world`：各一例，只为把基础世界装进主库供截图和 Simulator 用。

### 费用

AG11 全部 27 次运行（13 次开发运行、门槛、10 次回归重跑、3 次超时单例重跑）：**约 5.66 元**（主模型 5.64、判断 0.02）；真实主模型调用 1493 次、判断调用 70 次；输入约 358 万 token、输出约 61 万 token（逐次见各运行的 `costs.json`）。门槛一次 0.49 元。DeepSeek 主模型为主，Gemini 判断调用很少。在每门槛 30 元、每 sprint 150 元的上限内。评审未做，不计。

### 全量测试

- orbits（`LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npm test`，在 `4d497a1be`；之后只改了 App 和文档）：9004 例，25 失败。与基线 24 条逐条对比：基线 24 条都在，**新增 1 条** `a failing plan sync never changes the registration response; …`（`tests/api/event-registration-plan-sync.test.ts`，活动报名，本 sprint 没碰）。单独连跑 3 次 5/5 通过，判为负载下的偶发失败。
- App（`npm test`，在 `a8e941152`）：3507 例，3 失败 = 已知 2 条（路由对齐；`agent-ledger.ts` 硬编码文案 46 > 42）+ Home 滚动恢复的已知偶发。第一次全量（`a3102dab3` 之后）有 9 条新失败，都是旧「@ 联系人」的浏览器测试和 R03 文案快照，已在 `a8e941152` 处理。
- 两端 typecheck：orbits `tsc` 只剩 `tests/scripts/redesign-pixel-lib.test.ts` 的既有错误；App 只剩 `tests/ios-scene-lifecycle-config.test.ts` 的既有错误。
- `agent-eval:check`：232 例，0 问题。契约快照一致；四个同步测试通过。

## 验收结果

| SC | 状态 | 证据 |
|---|---|---|
| AG11-1 两端都能搜索、多选、查看类型、移除六类记录 | pass | `tests/agent-v1/references-search.test.ts`（六类各有命中、只回本人、同名带区分、另一账号零命中、读失败说没读到）；`tests/pages/iorbit-reference-picker.test.tsx`（分组、类型、多选完成、移除、键盘）；App `tests/ai-reference-picker-interactions.test.tsx`（分组、离线只列本机联系人且不请求、标签与「打不开了」）与改写后的 `ink-signal-ai-conversation`；门槛 AE-REF-002（App 端日程、活动、我去过）；AE-REF-001（Web 端笔记、联系人、待办）只在开发运行（门槛 AG14）；Web 1440／375 截图与不闪动测量、Simulator 截图、两端同账号请求（见证据） |
| AG11-2 两条同名记录按所选编号各自读到原记录 | pass | `tests/agent-v1/references-authorize-positions.test.ts`（位置越界／不在 @ 上／重叠拒收；同文字两标记按先后对应；他人记录、类型不符给 REFERENCE_NOT_ACCESSIBLE；我去过只读本人；标记不认成上一轮的同名笔记）；`references-ask-again.test.ts`；门槛 AE-REF-003、AE-REF-006、AE-SCL-021、AE-SCL-022 |
| AG11-3 移除标记后不再发送旧的绑定 | pass | `tests/agent-v1/references-compose.test.ts`、`tests/pages/iorbit-reference-picker.test.tsx`（× 后与改字后不发）；App 测试（草稿日志里移除的不回来）；门槛 AE-REF-003 第二轮、AE-REF-004 |
| AG11-4 引用不授予修改权，也不自动建立关联或记忆 | 门槛内的部分 pass；REF-001／005／007 的门槛在 AG14 | 门槛里所有 REF 例 `no_business_writes` 与 AE-REF-002 的 `memory_state: []` 通过；AE-REF-001、007（要改才出卡、不点不写）与 AE-REF-005（平台活动不出卡）在开发运行里出卡与写入正确，但门槛归 AG14，且 REF-005 的读取范围不过（见上「仍未实现」）；PLANNER 要的「服务端测试断言关联字段与记忆零写入」没有单独写，靠用例的 `no_business_writes`、`memory_state` 与 db-diff |

### 证据（`~/orbit-sprint-evidence/agent-design/sprint-AG11/run-01/`）

- `web/`：`web-1440-picker.png`、`web-1440-plus.png`、`web-1440-chips.png`、`web-1440-sent.png`、`web-375-picker.png`、`web-375-plus.png`、`web-375-chips.png`、`web-375-removed.png`、`web-check.log`（本机生产构建、评测账号 A；选择器开合时输入框和标题位置不变：1440、375 都是 true；控制台错误 0；发出的引用和位置）。
- `sim/`：`sim-04-picker.png`（App 打 @ 搜「和田」）、`sim-06-chips.png`（两条标签）、`sim-07-sent.png`（修复前：只比了活动）、`sim-09-sent-fixed.png`（修复后：两条都答）、`requests-both-clients-1.jsonl`、`requests-app-2.jsonl`（库里存下的两端请求：句子、引用、标记文字）。Metro 以 `--reset-cache` 启动。
- `orbits-full-test.log`、`app-full-test.log`（第一次）、`app-full-test-2.log`（收口）。
- `env-build-*.log`。

## 与 PLANNER 不同（CONVENTIONS／SPRINTS／brief 优先）

已追加进 PLANNER 页尾：AG13 没交出 attendance／privateEvent 的读取（本 sprint 补在活动适配器里）；门槛 REF 是 5 例；`memory_state` 第一次在门槛用到，实现了空列表形式；位置字段作为可选字段加在 `AiSessionReferenceContract` 上（契约快照只许加字段）；档位 H。

另外：

- PLANNER 文件表之外新增：`features/agent-v1/references/marks.ts`（标记绑定、「那 @X 呢」）、`app/api/agent/references/check/route.ts`（D7 的核对）、`shared/compute/agent-references.ts`（两端共用的绑定与区分行）、`tests/agent-v1/references-compose.test.ts`、`references-ask-again.test.ts`、`tests/agent-eval/hard-checks-ag11.test.ts`；改了 `features/agent-v1/domains/event/read.ts`、`domains/configured.ts`、`answer/materials.ts`、`graph/nodes/{understand,resolve,functions}.ts`、`graph/{deps,state,build,executor}.ts`、`features/orbit-ai/data-query/permission-registry.ts`（活动读取多四个字段）、`app/(app)/app/agent/iorbit-0918/iorbit-model.ts`、`orbit-2026/copy/iorbit.ts`、`orbit-2026/iorbit/action-preview-client.ts`；App 的 `src/api/agent-v1-client.ts`、`scripts/audit-offline-read-surfaces.ts`（行号锚点随文件移动）、两个旧浏览器测试。
- 协议 2 的旧路径（`ai-session-reference-authorization.ts` 只核对联系人）保留不改：协议 2 只收联系人、活动、笔记三类，新类型和位置只随协议 3；App 在协议 2 下会把所选的联系人／活动／笔记（不带位置）一并发出。
- App 的「＋」在协议 2（离线开屏时探测不到协议 3）下也能用：离线只列联系人，发送时再探测协议。

## 影响分析

GitNexus 索引在开工时重建（206,624 节点）。上游影响（逐个记录在 scratchpad `impact-ag11.txt`）：

- **CRITICAL**：`AgentSendInputContract`（135）。**HIGH**：`AiSessionReferenceContract`（159）、`createDomainRegistry`、`graphPartsOf`、`materialOf`、`eventsPart`、`functionOf`、`newRun`、Web 的 `useAgentChat`、`sendAgentV1`。这些改动都是加可选字段、加分支或加可选参数：没有位置的旧请求、没有引用的消息、平台活动的读取都走原来的路；回归重跑覆盖到。
- **UNKNOWN**（文本搜索补查）：`authorizeReferences`（只在 `graph/executor.ts` 的 `referenceAuthorizer` 和测试里调用）、`agentSendInputSchema`（只在 `entry/http.ts`）、`AI_READ_PERMISSIONS`（`domains/registry.ts`）、App 的 `AiConversationScreen`（`app/ai/[id].tsx` 路由）。
- 没做到的：App 的 `ContactMentionPicker` 是先改后补的影响分析（LOW）；其余函数都是改前跑的。
- 每次提交前跑了 `detect-changes --scope staged`，没有 partial／truncated。

## 假设与额外阅读

- 读了 `references/authorize.ts`、`graph/nodes/{intake,understand,resolve,functions,probe}.ts`、`context/build.ts`、`domains/{types,registry,configured,event/read}.ts`、`answer/materials.ts`、`propose/events-resolve.ts`（只读）、AG13 的私人活动与我去过服务、运行器的 refs 与判定代码，因为上下文包里的交接（AG13 的读取适配器）与代码不符。
- 位置按 JS 字符串下标（UTF-16）、去掉首尾空白之后的句子算；两端都用共享的 `referencesForSend` 算，服务端按同一规则校验。
- Web 的「打不开了」核对放在页面回到前台时（Web 不保存草稿）；App 放在草稿恢复后、联网时。
- 选择器的搜索结果在两端都不缓存、不存进手机（端点清单登记为 online-only）。

## review 处理（仅 H 档）

没有派独立 review（brief 规定评审由协调者派）。

## 交接

- **契约**：`AiSessionReferenceContract` 多了可选的 `start`、`end`、`eventKind`（只随协议 3）；`AgentReferenceSearchKind`、`AgentReferenceCandidateContract`、`AgentReferenceSearchResultContract`（组可带 `unavailable`）、`AgentReferenceCheckResultContract`；校验 `referencePositionProblem()`、`agentReferenceSearchResultSchema` 等。
- **接口**：`GET /api/agent/references/search?q=&kind=`、`POST /api/agent/references/check`（都要登录，只读，`no-store`）。
- **服务端**：`references/authorize.ts` 的 `authorizeReferences()` 每条返回 `marks`；`ReferenceHandle.marks`；`references/marks.ts` 的 `bindMarkedReferences()`、`asksAgainAbout()`；`AgentGraphRun.carriedQuestions`；`EventSource.own` 与 `ownEventsOf()`（`attendance:…`、`private_event:…` 按编号读，视图 `fields.kind` 为 `attendance`／`private_event`）；`AgentRecordAccess.eventsByIds`。
- **共享计算**：`shared/compute/agent-references.ts`（`insertReference`、`reconcileBindings`、`removeBinding`、`referencesForSend`、`atTriggerOf`、`referenceDetailLine`、`referenceChipHint`、`sameNamedKeys`、`markedSegments`），已同步到 App。
- **运行器**：用例 refs 按 quote 出现先后算位置，活动带 `eventKind`；`memory_state: []` 由运行器读库判定（带条目的形式仍等 AG14）。
- **留给 AG14**：AE-REF-005 的读取范围（`events-resolve.ts` 找活动时应先用所选的引用）；`memory_state` 带条目的形式。
- **需要决定**：无。
- **回退**：不合并，或在 `orbit-agent-claude` 上 revert 合并提交。没有迁移和数据写入；新字段都是可选的，旧端照常。

## 协调者复核与结论

**结论：completed。** 门槛 run-03（`20261119-121709-d50815c-AG11-gate-run-03`）双评 63/63。十组复跑（`-run-03`，同一构建 `d50815c38`）单评：AG13 72/72、AG09 54/54、AG08 50/50、AG07 43/43、AG06 47/47、AG05 43/43、AG04 37/37、AG03 39/39 全过；AG12 59/60、AG10 62/63，没过的两例各单独重跑一次后评审通过（见「例外」）。

**三轮经过：**

| 轮 | 构建 | 结果 |
|---|---|---|
| run-01 | `a8e941152` | 门槛双评 63/63。复跑单评：AG12、AG07、AG06、AG05、AG03 全过；AG13 的 SCL-018、AG10 的 FN-010 只因 DeepSeek 15 秒超时；另有 4 例真失败：AMB-009（AG04）、WEB-001（AG09）、CTX-005 和 JDG-007（AG08） |
| run-02 | `8cb9e339d` | 修了上面 4 例。门槛代码判定 63/63；AG10 复跑里又出 1 例真失败 RD-009，这一轮就此停下，未评 |
| run-03 | `d50815c38` | 再修 RD-009。门槛和十组复跑的代码判定全部满分，没有超时 |

**修复（都是代码规则加测试，`tests/agent-v1/ag11-run02.test.ts`）：**

| 用例 | 问题 | 规则 |
|---|---|---|
| AE-AMB-009 | 回答追问时说「我和他最近聊了什么」，「我和他」被当成名字去查，查不到 | 回答追问的一轮里，带着「我和／我跟」的人称代词指追问所问的那位联系人 |
| AE-WEB-001 | 打开的网页写着现任职位，回答却说「没有公开名称」不去查 | 消息的另一部分问的是同一个网页时，用同一次打开的结果回答 |
| AE-CTX-005 | 回答开头提起一张还在等的待办卡，和问题无关 | 「カードの確定」也算在谈卡；这一轮没有卡就删掉 |
| AE-JDG-007 | 可点选项写成「把「要是把给小林发修订报价」改到周五」 | 条件开头（要是／如果／もし…把）不算记录名的一部分，选项用真实待办的标题 |
| AE-RD-009 | 「田中在客户访谈里最在意什么？」被当成查活动而拒答 | 只读活动、点了名且找到了这个人、又有要找的词时，改读这个人的笔记 |

**例外：**
- **AE-SCL-018（AG10 复跑）：** 提取调用两次 DeepSeek 15 秒超时。按超时规则单例重跑 `20261119-134904-d50815c-AE-SCL-018-timeout-retry-run-03-1`，没有超时，单评 R1～R4 全过。
- **AE-WEB-004（AG12 复跑）R3：** 不是超时。这一次第一层把一句话拆成两段，读笔记的那段只回答「是哪家公司」，没提笔记里「去年每席 900 日元」这条旧信息；同一构建在 AG10 复跑里答对了。按 AG13 run-09 起的做法单例重跑一次：`20261119-134938-d50815c-AE-WEB-004-variance-retry-run-03-1`，回答写明「这是去年的价格，并非现在的官网报价」，单评 R1～R3 全过。它时对时错，列进交接，要补代码规则。评审另记了一条用例问题：R3 默认回答会提到这个数字，用例本身没有强制。
- **评审文件被退回两份：** run-03 门槛评审 1 和 AG04 复跑评审对 AE-H-004 写的证据编号不合规（一份没写，一份写了轨迹里没有的编号），校验器拒收，由新的评审会话重评后通过。

**评审模型：** run-01 用 Opus 5.5。2026-11-19 用户要求评审改用 Sonnet 5.5，run-03 和两例单例重跑都由 Sonnet 5.5 评。协调者抽查了 run-03 的评语（AE-SCL-021、AE-REF-006），理由和证据编号具体。

**生成者中断：** 生成者（Opus 5.5）在 run-03 跑完、还没写 judge-pack 时撞到每周用量上限（11 月 21 日 5 点重置）。之后的 judge-pack、两例单例重跑、全量测试、登记和本节由协调者（Fable 5.2）完成，模拟器截图由一个 Fable 5.2 子 agent 拍。上文生成者写的各节是 run-01 时的内容，run-02、run-03 以本节为准。

**协调者自己复核的：**
- **orbits 全量测试：** `a8e941152` 和 `d50815c38` 各跑一次，都正好是基线的 24 条失败。生成者那次多出的 1 条（活动报名的 plan sync）没有再现。
- **App 全量测试（`d50815c38`）：** 3,508 例，只有已知的 2 条失败（路由对齐、`agent-ledger.ts` 硬编码文案）。
- **对照视觉稿看截图：** Web 的选择器、标签、着色都和稿子一致。App 的句子里「@名字」原来是黑字，不符合 D1，退回后改在 `c50cd19d4`。
- **Simulator 补拍（`d50815c38`，Metro 以 `--reset-cache` 起）：** `sim/sim-10-tinted.png` 里「@李薇」「@团队周会」是梅子紫、半粗，上方两个标签带类型和 ×；`sim/sim-11-removed.png` 里点掉「李薇」后，句子里的「李薇」变回黑字、没有 @，「@团队周会」仍着色。D1、D2 成立。点选和输入是通过调试器驱动的，不是手指点按。
- **补拍时发现的两件环境上的事：** 8081 端口被另一个会话（`orbit-agent-codex` worktree）的 Metro 占着，没有动它，本次的 Metro 起在 8082；App 里存的服务器地址是正式站（未登录状态），拍图前改指本机代理，拍完已恢复原样，这次没有任何请求发到正式站。
- **两次修复提交**（`8cb9e339d`、`d50815c38`）只改服务端，各带测试。

**验收：** AG11-1、AG11-2、AG11-3 通过。AG11-4 在门槛内的部分通过（`no_business_writes`、`memory_state: []`、不出卡）；AE-REF-001、005、007 的门槛按登记在 AG14，其中 REF-005 的读取范围一项现在不过，已列进交接。

**花费：** 46 次运行，约 12.7 元（门槛每轮约 0.5 元），在每门槛 30、每 sprint 150 元的上限内。

**交给 AG14 的开场事项：**
1. **AE-WEB-004：** 因为名字只在记录里而没去联网时，如果认出公司的那篇笔记里记着价格，由代码把这条写成「笔记里记的旧信息」，不随第一层怎么拆句而变。
2. **AE-REF-005：** `events-resolve.ts` 找要改的活动时先用所选的引用，不再列全部平台活动。
3. `memory_state` 带条目的判定形式。
4. **AE-EVT-012：** 卡上写了「新增待办」，但没显示用户要的那条联系人关联（评分项没覆盖）。
5. **AE-AMB-008：** 选定之后的卡上方还留着之前的「是李薇？」问句（此前已记，仍在）。
6. **DeepSeek 15 秒超时：** AE-FN-010、AE-SCL-018 的提取调用在 AG12、AG13、AG11 的复跑里反复超时，值得把这次调用再缩小或拆开。
7. **Gemini 3 秒上限：** 用户还没定（协调者建议：会动数据的判断放宽到 6 秒，其余保持 3 秒）。
8. App 的网页版（react-native-web）输入框不能着色，靠标签行显示所选；Web 的「打不开了」状态没有专门的截图。
9. PLANNER 要的「服务端测试断言关联字段与记忆零写入」没有单独写，现在靠用例的 `no_business_writes`、`memory_state` 和 db-diff。
10. AG13 留下、这次没动的：JDG-001 没写出看过的数目；RD-004、SCL-007、SCL-008 的措辞；UND-003 把用户的想法算到别人头上。

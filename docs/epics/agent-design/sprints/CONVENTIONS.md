# agent-design 的实现约定与交接表

各 sprint 的 PLANNER 都从这里取目录、命名和前后交接的接口。PLANNER 与本页不一致时以本页为准；本页要改，先改这里再改 PLANNER，并在 REPORT 里登记。

## 1. 目录与命名

**新代码放在 `repos/orbits/features/agent-v1/` 下**，按职责分目录。已有的账本、记忆、定时规则在原地扩展，不搬家。

| 目录 | 放什么 | 首次出现 |
|---|---|---|
| `features/agent-v1/observability/` | 追踪事件的发出与落盘 | AG00 |
| `features/agent-v1/entry/` | 入口记录、会话队列、结果文档、实时通道 | AG01 |
| `features/agent/runtime/`（已有） | 动作账本、决定、过期、待核对 | AG02 扩展 |
| `features/agent-v1/graph/` | LangGraph 图、线程状态、检查点 | AG03 |
| `features/agent-v1/models/` | 主模型的调用适配 | AG03 |
| `features/agent-v1/understand/` | 第一层的输出结构、提示、校验与修复 | AG03 |
| `features/agent-v1/context/` | 上文四样与会话级状态 | AG03 |
| `features/agent-v1/route/` | 能力清单、承接结论与去向 | AG03 |
| `features/agent-v1/clarify/` | 需求不清楚时的下一步、可点方向、消息归属 | AG04 |
| `features/agent-v1/domains/` | 各领域的 `read`、`prepare`、`applyApproved` 适配器 | AG05 起 |
| `features/agent-v1/views/` | 上下文、时间线、最近互动三个读取视图 | AG05 |
| `features/agent-v1/references/` | 六类引用的服务端授权 | AG05 |
| `features/agent-v1/answer/` | 回答步骤与引用校验 | AG05 |
| `features/agent-v1/text/` | 把原文切成带编号的句子，供引用和判断模型取回原句 | AG05 |
| `features/agent-v1/propose/` | 第二层的操作意图、定位与消歧、冻结成卡 | AG06 |
| `features/agent-v1/judgment/` | 判断模型适配、题目清单、门槛、先过滤再判断 | AG08 |
| `features/agent-v1/web/` | Search 与 Fetch 适配、检索词拼装、出站把关、预算 | AG09 |
| `features/agent-v1/functions/` | 排序、提取往来、提取跟进、比较、分组 | AG10 |
| `features/agent/memory/`（已有） | 记忆字段、召回、遗忘 | AG14 扩展 |
| `features/agent/automations/`（已有） | 规则字段、到期派发、运行历史、一次性定时器 | AG15 扩展 |
| `features/agent-v1/mcp/` | MCP 端点、授权、四个工具、连接管理 | AG17 |
| `features/agent-v1/rollout/` | 兼容读写、影子对比、回退开关 | AG18 |

**共享契约。** 新的传输结构放在 `repos/orbits/shared/contract/agent-v1.ts`，校验放在 `repos/orbits/shared/api-schema/agent-v1.ts`。改动 `shared/` 的 sprint 在同一提交里执行 App 的同步脚本并跑四个同步测试（Web sprint 规则第 6 节）。

**评测代码。** 运行器、校验器、代码判定、数据生成器放在 `repos/orbits/tests/agent-eval/`，命令行入口放在 `repos/orbits/scripts/agent-eval/`。用例、夹具和规范留在 `docs/epics/agent-design/eval/`，评测代码读它们，不复制。

**两端界面。** Web 的聊天输入框在 `repos/orbits/app/(app)/app/agent/iorbit-2026/IOrbit2026.tsx`，发送逻辑在 `app/(app)/app/agent/iorbit-0918/use-agent-chat.ts`，页面上下文在 `app/(app)/app/orbit-2026/iorbit/page-context.ts`；App 在 `repos/orbit-app/src/screens/ai/` 一带。动界面前先有获批的视觉稿。

**授权范围的名字。** 一律写成英文复数加冒号：`contacts`、`events`、`attendance`、`todos`、`memos`、`schedule`，后接 `:read` 或 `:propose`；另有 `proposals:read`。

**MCP 端点的位置。** `proxy.ts` 对 `/api/` 下没有登录 cookie 的请求一律返回 401，MCP 端点和它的授权端点放在 `/api/` 之外（建议 `/mcp` 和 `/oauth/`），或加进免检名单，二选一由 AG17 在 REPORT 里写明。

**工作区。** 代码里的工作区是整个部署共用的一个编号（`ORBIT_WORKSPACE_ID`），没有“每个用户当前所在的工作区”。第一版凡是写“账号加工作区”的地方，工作区就取这个部署编号。评测里所有测试账号在同一个工作区 `workspace:agent-eval` 下，按账号隔离；夹具里的 W1、W2、WR、WL 只是账号的标签。

## 2. 开关与环境

| 名称 | 取值 | 用途 |
|---|---|---|
| `ORBIT_AGENT_V1_MODE` | `off`、`shadow`、`on` | 新入口的总开关。`shadow` 只读并与旧结果对比，不向用户交付。 |
| `ORBIT_AGENT_PROVIDER` | `deepseek` | 主模型供应商，已有变量。 |
| `ORBIT_DEEPSEEK_MODEL` | `deepseek-flash` | 主模型调用名，已有变量，默认值要改。 |
| `ORBIT_GEMINI_DECISION_API_KEY` | 密钥 | 判断模型。 |
| `ORBIT_AGENT_TRACE_DIR` | 目录 | 设了才落追踪日志，只在评测环境里设。 |
| `ORBIT_AGENT_EVAL` | `1` | 评测环境标记：启用固定时钟、联网回放、故障注入、对外连接守卫。生产构建里这些入口不存在。 |
| `ORBIT_DATABASE_TARGET`、`ORBIT_LOCAL_DATABASE_URL` | `local`、指向 `orbit_agent_eval` | 评测用的本机专用库，已有变量。 |
| `ORBIT_WORKSPACE_ID` | 评测里为 `workspace:agent-eval` | 已有变量，见第 1 节“工作区”。 |
| `ORBIT_AGENT_MODEL_CALL_LIMIT` | 整数，默认 4 | 单轮主模型调用上限，设计稿 §3.3。 |
| `ORBIT_AGENT_WEB` | `on`、`off` | 联网总开关；用户自己的开关另存在设置里。 |
| `ORBIT_AGENT_V1_PROPOSALS` | `open`、`paused` | 回退用：`paused` 时不再接新的写入提议，已有的卡可暂停并对账。 |
| `ORBIT_WEB_PUSH_VAPID_PUBLIC_KEY`、`ORBIT_WEB_PUSH_VAPID_PRIVATE_KEY` | 密钥 | 浏览器推送，AG16 新增。 |
| `ORBIT_MCP_BASE_URL` | 地址 | MCP 端点对外的地址，令牌受众按它绑定，AG17 新增。 |

评测服务用单独的端口 3110，不与日常开发的 3000 共用，也避开现有本机启动脚本默认的 3100。

**故障注入点。** 用例里 `fault.where` 出现过的位置（如 `understand`、`model`、`judgment`、`executor`、`web`）都要在 `ORBIT_AGENT_EVAL=1` 时可注入，生产构建里不存在。

**DeepSeek 独立接口的返回字段**（2026-11-15 读官方文档）：Search 返回 `results[]`，每项有 `rerank_score`、`title`、`url`、`snippet`、`summary`、`content`、`site_name`、`site_icon`、`date`、`authority`；Fetch 返回 `title` 和 Markdown 的 `content`。只有返回了结果的 200 响应计费；超出频率返回 429，余额不足返回 402。

## 3. 评测命令

都在 `repos/orbits` 下执行，由 AG00 交付。

| 命令 | 作用 |
|---|---|
| `npm run agent-eval:check` | 校验用例和夹具。 |
| `npm run agent-eval:env` | 建本机专用库、起服务、做开始前的自检。`--build` 先停掉正在跑的服务再构建并重启（AG04 起），服务在评测模式下报出自己的构建 SHA，每次运行都记下。 |
| `npm run agent-eval:seed` | 经产品写入链路生成三个账号的数据并存快照。 |
| `npm run agent-eval:run -- --gate AGnn` | 跑某个 sprint 的门槛：按 `gate`（没有就按 `sprint`）归到它的用例，加上顺延之后不晚于它的不变量用例。`--seed-cards` 从 AG02 用到 AG05（AG06 之前新入口不从对话出卡，门槛里的 BND 区含不变量包只能靠预置卡），AG06 起不再用，见第 8 节。`--all` 跑全部可见用例，`--sealed` 跑封存集。AG04 起，服务的构建 SHA 与 HEAD 不一致或工作区不干净时，`--gate` 拒绝开始（只有构建改写的 `next-env.d.ts` 路由引用行不算不干净）。2026-11-17 起加 `--workers N` 并行跑（评测规范 §4）：门槛运行和回归重跑都用 `--workers 4`，一次 AG06 门槛由约 6 分钟降到约 2 分钟；结果目录格式不变，`judge-pack`、`report` 照常用。本机 Postgres 的 `max_connections` 为 100，4 是上限，再多运行会拒绝开始；不加 `--workers` 仍是一例接一例。几次运行要一个接一个跑，不要同时开两个。 |
| `npm run agent-eval:judge-pack -- --run <运行编号>` | 生成评审材料。评审由新开的 Claude 会话完成。 |
| `npm run agent-eval:report -- --run <运行编号>` | 汇总评审结果，算出通过与否，给出要登记进 `RUNS.md` 的一行。 |

## 4. 每个 sprint 交出什么

后续 sprint 的“前序交接要点”从这张表取。名字是约定，签名以前序 REPORT 为准；启动时发现不一致，按 REPORT 更新 PLANNER 的上下文包并留追加记录。

| Sprint | 交出的东西 |
|---|---|
| AG00 | 评测命令；本机库快照；`observability/trace.ts` 的 `emitTrace(event)`；对外连接守卫；固定时钟、联网回放、故障注入、本机推送模拟器；运行器实现 eval/README.md §3.1、§3.2 的基本词和 H 区用到的补充词；基线运行。 |
| AG01 | `entry/` 的 `acceptMessage()`、`getRequestResult()`、`cancelCurrentRun()`；会话顺序处理；契约里的 `AgentRequestStatus`、`AgentResultDocument`、`AgentPartResult`；协议版本 3；`ORBIT_AGENT_V1_MODE`。现有运行时不能从外部中断，停止当前这一轮由新入口在结果交付前丢弃。 |
| AG02 | 账本记录新增 `origin`、`revision`、各版载荷、`expiresAt`；`decideAction()`；状态 `expired`（App 端账本契约同步）；回执 `needs_review`、`user_confirmed`、`abandoned`；批准与出队一个事务；按编号取单张卡的接口；待办的新建和修改两个执行器；运行器的 `--seed-cards`；新入口上的直写与文字确认已关闭。 |
| AG03 | `graph/` 的图与 `AgentGraphState`；`understand/` 的 `UnderstandOutput` 与校验；`context/` 的 `buildFirstLayerContext()` 和会话级状态；`route/` 的能力清单与 `decideRoute()`；`models/main.ts`。 |
| AG04 | `clarify/` 的 `decideNextStep()`、`optionsFor()`、`attributeMessage()`、`attributeSelection()`；追问的暂停与恢复（`resumeAgentGraph()`，`clarify` 节点的 `interrupt`）；结果文档的 `clarifications[]`；点选：协议 3 的 `POST /api/ai/conversations` 带 `{ clientSelectionId, selection: { requestId, clarificationId, optionId } }`，先落库、按会话顺序处理、接回原委托、不产生新委托，所选不在候选里或已关闭返回 409（`error.context.reason`）；搁置与文字回答回写旧委托；没绑定的指代词在没有上文时当缺对象（`isPronounClue()`）；评测服务的构建编号与门槛前核对。 |
| AG05 | `domains/registry.ts` 与五类记录的 `read`（生产路径上的读取适配器，现有 `executeAiRead` 只有测试在调用）；三个读取视图；Memo 的 `interaction` 字段的契约与读取（写入在 AG06）；消息引用扩到六类并带位置的服务端契约与授权（两端选择器在 AG11）；`text/` 的按句切分；`answer/` 的 `AnswerOutput` 与 `verifyCitations()`。 |
| AG06 | `propose/` 的 `OperationIntent`、`resolveIntents()`、`freezeCard()`；`todo` 与 `memo` 的 `prepare`、`applyApproved`（待办沿用 AG02 的执行器，Memo 含新建和修改）；写入 Memo 的往来字段；前置项失败后跳过依赖项、不可恢复的失败停止重试；对应的执行器登记。 |
| AG07 | 两端的确认卡组件；结果文档的客户端读取；离线与未同步时的规则。 |
| AG08 | `judgment/` 的 `askJudgment()`、题目清单、门槛配置、`funnel()`；证据核对、写入意图复核、重复判断三处接入。 |
| AG09 | `web/` 的 `search()`、`fetch()`、`buildQuery()`、`outboundGate()`、预算；证据记录。 |
| AG10 | `functions/` 的 `rankCandidates()`、`extractInteractions()`、`extractFollowUps()`、`compare()`、`group()`。 |
| AG11 | 两端的 @ 选择器；消息引用扩到六类并带位置。 |
| AG12 | `domains/contact/` 全套；联系人可用的版本；批量导入接入确认卡。 |
| AG13 | 新集合 `private_events`、`event_attendance_notes`；`EventRef`；`privateEvent`、`attendance`、`schedule` 三个适配器；Todo 的多值关联。 |
| AG14 | 记忆字段扩展与迁移；设置页与对话统一用规范账号；`recallFor()`；`memory.create`、`memory.update`、`memory.delete` 三个执行器（现有只有 `memory.save`）；记忆卡；管理页。 |
| AG15 | 规则字段扩展；跨账号的到期索引与派发；`agentAutomationRuns`；一次性定时器；收件箱的新来源（并从现有的自动推送里排除）；“我的定时任务”页。 |
| AG16 | 浏览器推送的订阅与发送；App 推送接入规则结果；投递记录。 |
| AG17 | MCP 端点、授权、四个工具、确认链接页、连接管理。 |
| AG18 | 旧客户端兼容；回填脚本；影子运行与对比报告；回退开关；封存集验收报告。 |

## 5. 现有代码速查

2026-11-15 盘点所得，路径相对 `repos/orbits/`。

| 领域 | 文件 | 要点 |
|---|---|---|
| 发消息入口 | `app/api/ai/conversations/route.ts` | 现有管线：`sendMessage` → `applyTaskInteraction` → `applyEntityDraft` → `persistNaturalLanguageActionProposals`。 |
| 可靠发送 | `features/orbit-ai/reliable-send-service.ts`、`features/orbit-ai/storage/orbit-agent-chat-request-store.ts` | 按 `requestId` 预留与重放；`expectedMessageRevision`；未完成时返回 202。 |
| 发送契约 | `shared/contract/ai-sessions.ts` | `ReliableAiSendInputContract`；引用类型现为联系人、活动、笔记。 |
| 现有运行时 | `features/orbit-ai/live-agent-runtime.ts`、`features/orbit-ai/gemini-provider.ts` | 一轮一个意图、一个工具，最多 3 步；供应商按密钥选择；DeepSeek 默认名是旧的。 |
| 只读工具 | `features/orbit-ai/agent-tools/registry.ts` | 线上在用的 9 个只读工具。 |
| 权限注册 | `features/orbit-ai/data-query/permission-registry.ts` | 13 个读取工具的字段白名单，全部停用，生产路径未调用。 |
| 引用授权 | `features/orbit-ai/ai-session-reference-authorization.ts` | 只核对联系人。 |
| 动作账本 | `features/agent/runtime/contract.ts`、`service.ts`、`repository.ts`、`hash.ts` | 十种状态；`approveActionWithOutbox` 目前是先后几次写入；哈希 32 位。 |
| 执行与队列 | `features/agent/runtime/action-queue.ts`、`action-queue-worker.ts`、`executor-registry.ts`、`domain-executors.ts` | 11 种已登记的执行器；本机不走托管队列。 |
| 账本接口 | `app/api/agent/ledger/[id]/transition/route.ts` | 确认、稍后、否决、取消、撤销、重试。 |
| 自然语言提议 | `features/agent/natural-language-actions/service.ts` | 一项提议一张卡，每轮最多 4 项。 |
| 两条绕过账本的写入 | `features/orbit-ai/task-interaction-service.ts`、`features/orbit-ai/entity-drafts/` | Todo 直写；实体草稿可由文字确认。 |
| 通用记录存储 | `shared/storage/live-record-store.ts`、`shared/storage/postgres-live-record-store.ts` | 按工作区、集合、记录编号；`updateRecordIfCurrent`。 |
| 笔记 | `shared/contract/notes.ts`、`features/notes/` | 数字版本，`expectedVersion`。 |
| Todo 与日程 | `shared/contract/tasks.ts`、`features/tasks/`、`features/personal-schedule/` | 以更新时间为前置；日程的重复只有每天、每周、每月。 |
| 联系人 | `shared/domain/contracts.ts`、`features/contacts/` | 没有可用的版本；软删除 30 天可恢复；已有导入批次。 |
| 活动 | `features/events/core/contract.ts`、`features/events/mine/service.ts` | 没有私有活动和参会自述。 |
| 时间线 | `shared/contract/relationship-timeline.ts`、`features/relationship-timeline/` | 读取时计算；“最近互动”另存在联系人详情状态里。 |
| 记忆 | `features/agent/memory/` | 四类；没有版本；学习开关默认关。 |
| 定时规则 | `features/agent/automations/`、`features/agent/playbooks/` | 一次、每天、每周；`delivery` 存了但没人发送。 |
| 收件箱与推送 | `shared/contract/inbox-notifications.ts`、`features/notifications/` | 站内收件箱已有；App 推送走 Expo；没有浏览器推送。 |
| 维护队列 | `features/operations/maintenance/` | 默认 10 分钟一次。 |
| 错误码 | `shared/errors/app-error.ts` | 八个错误码与 HTTP 状态的对应。 |

GitNexus 的索引不在这个 worktree 里。Generator 启动时先按根目录 `CLAUDE.md` 建索引，再对每个要改的符号做上游影响分析；建不起来时用文本搜索补查，并在 REPORT 里写明。

## 6. 本 epic 的 PLANNER 多写什么

在 Web sprint 模板之外，每份 PLANNER 的“最小测试与检查”还要写明：

- **门槛命令**：`npm run agent-eval:run -- --gate AGnn`，以及它包含哪些用例区。
- **评审**：门槛运行里的用例由两个互不相见的 Claude 会话各评一次。
- **费用**：本 sprint 真实模型调用的上限，默认每次完整运行 30 元以内、累计 150 元以内。
- **证据位置**：`~/orbit-sprint-evidence/agent-design/sprint-AGnn/run-01/` 放截图和命令输出；评测日志在 `~/orbit-sprint-evidence/agent-eval/runs/`。
- **分支**：从 `orbit-agent-claude` 建 `sprint/AGnn-名称`，合回 `orbit-agent-claude`。

验收项的编号和文字照抄 [SPRINTS.md](../SPRINTS.md)，不改写、不增减。

## 7. 运行器跟着 sprint 长

AG00 实现用例的基本词。eval/README.md §3.4 里各区补充的词，由第一个用到它的门槛 sprint 在运行器里实现，并写进该 sprint 的 REPORT。

## 8. 2026-11-15 的修订

19 份 PLANNER 写完后，汇总各组核对代码时发现的问题，统一做了以下修订。PLANNER 原文不改，启动时以本页和 SPRINTS.md 为准，并在 REPORT 里注明。

| 事项 | 修订 |
|---|---|
| 依赖与档位 | 见 SPRINTS.md 登记表：AG08、AG11、AG12、AG13、AG15、AG17 补了依赖；AG11、AG16 改为 H 档；AG04 与 AG05 不并行。 |
| 用例归属 | 5 例加了 `gate` 字段顺延门槛：CTX-006、CTX-008 到 AG04；SCL-010、SCL-012 到 AG13；FN-002 到 AG14。不变量包只含顺延之后不晚于本 sprint 的用例。 |
| AG02 的门槛 | 用 `--seed-cards` 预置卡片；AG02 交付待办的新建和修改执行器；12 例在 AG06 按完整对话重跑。 |
| 交接表 | AG00 加本机模拟器；AG02 加单卡接口；AG05 加生产读取适配器、往来字段的读取、六类引用的服务端契约、按句切分；AG06 加依赖跳过和失败停止；AG14 加三个记忆执行器。 |
| 开关与端口 | 新增调用上限、联网、提议暂停、浏览器推送、MCP 地址五个开关；评测端口改为 3110。 |
| 工作区 | 第一版取部署的工作区编号；评测账号同在一个工作区，按账号隔离。 |
| AG12 的风险 | 联系人现有的 `version` 字段被关系初始化流程占用，那套流程依赖它为空。AG12 启动时先确认改为递增版本的影响，必要时另起一个字段。 |
| AG18 的参考 | 发布方案 `docs/superpowers/specs/2026-09-30-staging-production-release-design.md` 在主目录里是未跟踪文件，2026-11-15 已复制进本 worktree 的同一路径；AG18 以它为准，不再用 W0019 的发布清单代替。 |
| 评审项级 gate（AG01 中途加） | 评审项可带 `gate: AGnn`，规则见评测规范 §3.3、§6，登记见 CHANGES.md。ENT-002、ENT-003、ENT-004 的回答内容项顺延到 AG03／AG05：AG03、AG05 的门槛运行要把 ENT 区一并跑上并让这些项通过。 |
| `--seed-cards` 的范围（AG03 起） | 原写“只给 AG02 用”。AG03 起新入口由流程图处理，图到 AG06 才从对话出卡，而 BND ×12 作为不变量进每个门槛，所以 AG02～AG05 的门槛都加 `--seed-cards`；AG06 去掉它，按完整对话重跑 BND 区。预置内容取自用例的 `card_ops`，BND-001、BND-008 已明写（CHANGES.md）。 |
| AG03～AG04 的新入口不读记录 | 图到 AG05 才读业务记录，ENT-003 R1（日程）也顺延到 AG05，与 ENT-002 R1、ENT-004 R3/R4 一样；ENT-003 R3（会议纪要技巧）从 AG03 起计入。`--gate AGnn` 也跑带 `gate: AGnn` 评审项的用例（评测规范 §3.3），AG05 的门槛因此自动带上 ENT-002、003、004。 |
| 旧入口的卡片（AG01 发现） | 运行器走协议 2（`app_old`）时不把回复里的 `artifacts` 写进 transcript 和回答，AG00 基线的评审因此看不到卡片里的记录。第一个门槛用到 `app_old` 的 sprint（AG18 的 CMP 区）先补上。 |

# Sprint 0021 — AI 会话入口元信息与项目式整理

> 遵守 [RULES.md](../RULES.md)：一份 Planner、一次 Generator，无 Evaluator 或第二实现代理。本次只编制新 Sprint，不启动产品实现。

**Plan revision:** 1。**模式:** existing-codebase / single-generator / cross-client。
**原需求:** 2026-09-14 新增；关联 R-00／R-02／R-06、B3 及 Bridge BR-003／004／005，不关闭其原验收。
**单一目标:** AI 会话能保留可信、稳定的开头信息，并在 App 和同账号 Web 中持久整理。
**易读目标:** [GOAL.md](GOAL.md)。**交互规格与来源:** [REFERENCE_AND_BEHAVIOR.md](REFERENCE_AND_BEHAVIOR.md)。两页随本契约审阅。
**技术栈:** 现有 TypeScript、Expo App、Next.js Web/API、actor-scoped live-record 存储与 Node 测试；不增加模型、依赖或编排器。
**编制基线:** 根整合仓库 `chat-agent`，HEAD `0f43f61c0`；tracked 工作树干净，既有未跟踪设计素材不属于本 Sprint。

## 进入条件与依赖

- 用户已确定参考功能／组织方式、不做像素复刻，也不要求提供截图。沿用此决定，不重开视觉选型门槛。整份技术方案／白名单仍待审阅，另有明确执行指令后才能启动，ACTIVE 不自动领取。
- 承接 0005／B3 发布的稳定会话 ID、消息 ID、版本与重试协议，以及 Web 恢复风险处理或适用隔离专测批准。不能在本 Sprint 另造与 B3 冲突的会话协议；实施前把实际字段／回执对照补入本页并审阅。不是要求 0005 自己的所有验收预先完成。
- 0021 不依赖 0020，也不必排在 0019 后。先发布入口元信息和分组基础，0006／0019 的新模板随后消费；不形成“等模板完成才能定义元信息”的循环。
- 当前已有入口由本 Sprint 接线；尚未实现的联系人／笔记模板只冻结兼容契约并交接到原 Sprint，不能声称已从尚不存在的界面验证成功。其实际入口测试仍留在原 Sprint。
- 两端串行持锁；与 0005／0006／0011／0015／0019 共用 AI 页面、会话 provider、契约或入口文件时禁止并行修改。
- 跨端验收须具备同版本 Web/API 与 App、两名隔离测试用户及明确可创建／修改／删除的测试会话范围。无权限不读写业务库，不删除真实历史。沿用适用基线批准，未获批的基线失败不得越过。

## 已核对的代码事实

| 位置 | 当前事实与缺口 |
| --- | --- |
| App `src/api/ai-history-contract.ts`、`src/view-models/agent-history.ts` | 有 title／customTitle／pinned／messages，无明确入口或分组字段；运行中 conversation 与存储 session 混合显示，不能直接把两类都当成相同可写对象。 |
| App `src/screens/ai/AiScreen.tsx` | 存储 session 已有确认删除；有置顶展示，没有置顶／改名写入口，也无分组管理。不是所有显示出来的 runtime 会话都能删除。 |
| App `src/screens/ai/AiConversationScreen.tsx` | 新 session 通常在首个成功模型响应后创建；保存回执不比较入口／分组。不能据此保证失败的第一轮保留了来源。 |
| App `src/data/ai-send-intent.ts`、`app/ai/[id].tsx` | 已有 actor／服务器绑定的发送意图；入口上下文应接续这条隔离边界，不能把完整私密提示词塞进路由参数。 |
| Web `features/orbit-ai/storage/orbit-agent-chat-session-live-record-provider.ts` | 标准化／读回按白名单重建 snapshot，会丢未接入字段；firstUserMessage 从最多 100 条消息的窗口派生，不是永久第一条。列表默认 12、最多 50。删除后 upsert 的活跃状态写入需防晚到请求复活。 |
| Web `app/api/ai/conversations/sessions/` | 已有列表／保存和单项读取／删除，actor 来自认证；无元信息 PATCH、分组或完整历史分页。 |
| Web `app/(app)/app/agent/orbit-real-agent.tsx` | 已有改名／置顶／确认删除；自有解析器需接入新字段，现有页面内 mutation queue 不能代替跨设备原子版本检查。 |

以上为源码盘点，不是运行时故障复现结论。本次未操作数据库、模型或设备。

## 契约提案

### A. 稳定会话和不可变起源

共享类型与运行时 schema 放在 Web `shared/contract/ai-sessions.ts`、`shared/api-schema/ai-sessions.ts`（新增），App 只走既有同步通道。以下是业务字段提案；B3 的实际 ID／版本字段优先，审阅时统一，不并存两套同义版本。

```ts
type SessionOrigin = {
  schemaVersion: 1;
  kind: "manual" | "structured" | "legacy_unknown";
  entryPointId: string; // 受控注册 ID，不接受任意展示文本充当已知入口
  entryClient: "app" | "web" | "unknown";
  template: { id: string; version: number } | null;
  references: readonly { type: "contact" | "event" | "note"; id: string }[];
  initialGroupId: string | null;
  firstUserMessageId: string | null;
  firstSentText: string | null;
  recordedAt: string | null; // 服务端时刻；旧数据无法确定时为 null
};
type SessionOrganization = {
  groupId: string | null;
  pinned: boolean;
  customTitle: string | null;
  revision: number;
};
type SessionGroup = {
  id: string;
  name: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
};
```

- **何时创建**：打开空白页不创建；首次主动发送时，以 B3 稳定 sessionId／messageId 保存用户消息和 origin，收到持久化回执后才调用模型。首轮模型失败仍保留可重试会话；存储失败保稿、明确未保存，不先产生付费调用。重试复用同一 ID 和初始内容。
- **冻结什么**：entryPointId、客户端、模板 ID／版本、经授权引用、初始分组及第一条实发文本创建后不可修改。用户先编辑模板再发送，保存编辑后的实际文本；不保存所有输入草稿或重复整份联系人／笔记正文。
- **内容边界**：firstSentText 遵守既有消息 12,000 字符上限，创建时校验，超长明确拒绝而不静默截断；单独保存起始快照，不从最近 100 条窗口重新推断。该私密字段和消息使用相同 actor 访问边界，不进入分析日志／埋点。
- **旧记录**：无可证明起源时返回 legacy_unknown／unknown，空模板与引用；仅当能确认真实第一条时保留，否则 firstSentText／firstUserMessageId 为 null。不能给旧会话伪造 manual。旧 ID 不重写，不按标题合并历史。
- **当前 runtime 行**：与 B3 对齐 canonicalId；可确定归属时映射到同一个持久 session，避免重复显示。无法映射必须显示可解释状态并记录待解决项，不能隐藏真实历史来完成验收；所有可续聊的普通历史最终需具有可管理的稳定 ID。
- **身份与引用**：客户端只能提供入口业务字段，actor／workspace 由服务端注入；引用要校验当前用户权限。origin 是来源声明，不是权限授予、系统指令或执行模型的理由。

### B. 入口目录与已有决定

受控 entryPointId 常量放入共享契约；服务端运行时 schema 校验 ID、kind、模板版本和引用类型组合。展示名称按 App／Web 已有本地化约定映射，不复制模板策略或另建远程配置服务。

| 入口范围 | 本 Sprint 的接线／后续消费者 |
| --- | --- |
| App 新对话、Web 新对话 | `ai.new_chat`，manual；无模板。组内新建仍是 manual，initialGroupId 单独记录。 |
| 现有首页三个建议问题 | 稳定 ID `home.contact_priority`／`home.event_preparation`／`home.introductions`；记录具体入口和实际发送文本，保留当前仅预填、不自动发送行为。 |
| 聊天列表的 AI 关系管家、AI 首页手动编辑问题 | 分别记录 `chat.ai_assistant`／`ai.home`；没有模板时不得虚构版本，普通自由输入为 manual。 |
| 0006 已批准的 1／2／3／7 模板入口 | 联系人详情起草消息、联系跟进起草、收件箱润色草稿、跟进待办／提醒候选；具体按钮与编号以 [0006 已确认清单](../0006-contact-mentions/PLANNER.md#已确认的入口决定2026-09-14) 为准。该 Sprint 发布稳定 templateId/version 后登记映射；0021 不代替其模板／@ 实现。 |
| 0019 笔记待办模板 | `notes.task_suggestions`，structured；随 [0019](../0019-note-suggestions/PLANNER.md) 已批准流程接入 note 引用。只发送后生成建议，再确认创建事项。 |
| 0006 清单中的 4、5／6／8／9、10～13 | 4 取消的聊天摘要不复活；5／6／8／9 保留原行为，只给确实创建会话的入口加来源；10～13 流程内 AI 辅助不强造会话，也不扩为全部 AI 调用审计系统。 |

结构化起源按实际携带的模板／上下文声明；用户删掉预填文字改问另一题，仍保留进入时的入口与实际第一条内容，不能用内容分类器改写来源。打开已有 session 只续聊，不覆盖起源。

### C. 分组、元信息与并发 API

- 延伸 `GET /api/ai/conversations/sessions`：支持 opaque cursor、limit（默认 20，上限 50）、groupId（含未分组）、pinned 与 q；返回 items、nextCursor。无新参数旧消费者仍兼容现有响应形状；新协议使用显式版本参数并在共享 schema 固定 envelope，不能同一路由无声明换型。
- 延伸首次 `POST .../sessions`：接收受控 origin 和首消息；后续消息保存不能修改 origin。旧客户端省略新字段时服务端合并保留，不以缺字段清空。
- 新增 `PATCH .../sessions/[id]`：只接收 expectedRevision、mutationId 及组织字段 patch；省略为不改、null 为清空分组／自定标题。返回 canonical session 和持久化回执。消息快照与元信息更新分开，避免置顶／移动回传过期整份 messages。
- 新增 `GET/POST /api/ai/conversations/groups` 和 `PATCH/DELETE .../groups/[id]`：分页列出、创建、改名及“保留会话删除分组”；写入校验 revision／mutationId。删除非空组与移出全部会话为单个原子操作，不逐页漏掉成员。
- `DELETE .../sessions/[id]`：采用稳定 tombstone 与幂等回执；重复同一删除成功返回相同结果。删除与消息保存竞争时，删除成功后的旧保存不得复活会话；向已删除 ID 写消息返回 410。不宣称软删除等于物理清除或套用 ChatGPT 的保留期。
- 所有对象查找绑定认证 actor／workspace；越权按统一不可访问结果处理，不暴露是否存在。409 版本冲突返回可读冲突提示并允许刷新重试，不静默覆盖另一端改动；失败保留本地稿和已确认服务端状态。
- 复用 `shared/storage/transactional-postgres.ts` 提供的事务执行器，在 feature 存储层完成 CAS、幂等和组删除原子性；现有通用 live-record upsert 不等于 CAS。mock 与 live 必须具有相同冲突／删除语义，至少有隔离 PostgreSQL 集成证据。
- 旧 Web 置顶／改名 POST 在新 Web 改用 PATCH 后仍需兼容：显式组织字段按服务端最新记录原子应用，消息／起源不被旧快照回滚；冲突行为按 B3 旧客户端策略明确拒绝或兼容，不默默忽略用户写入。旧客户端无法表达分组时保留现有分组。
- 另一端变更用已有 focus／显式 refresh 同步；本 Sprint 不引入 WebSocket。成功文案必须等持久化回执，失败不能只留一个本地“已置顶”。

## 范围与文件白名单

路径相对所属子仓库。同一个 Generator 分别使用 Web／App cwd；协调者负责根仓库 Git 和 Bridge 交接，不从 Web cwd 用 `../` 写 App。

| 工作块 | Web/API | App |
| --- | --- | --- |
| 共享契约 | 新建 `shared/contract/ai-sessions.ts`、`shared/api-schema/ai-sessions.ts` | 仅经 sync:contract 生成 `src/api/contract/ai-sessions.ts`、`src/api/schema/ai-sessions.ts`；`src/api/ai-history-contract.ts` |
| 服务／存储 | `features/orbit-ai/storage/orbit-agent-chat-session-live-record-provider.ts`、`orbit-agent-chat-session-provider-factory.ts`；新建同目录 `orbit-agent-chat-session-mutations.ts`、`orbit-agent-chat-group-provider.ts`、`orbit-agent-chat-session-transactions.ts` | 不直接接触数据库 |
| HTTP | `app/api/ai/conversations/sessions/handler.ts`、`route.ts`、`[id]/handler.ts`、`[id]/route.ts`；新建 `app/api/ai/conversations/groups/handler.ts`、`route.ts`、`[id]/handler.ts`、`[id]/route.ts` | 新建 `src/api/ai-session-management.ts`；仅封装上述 API，不复制服务规则 |
| 页面／已有入口 | `app/(app)/app/agent/orbit-real-agent.tsx`、`agent-chat-session-mutations.ts`；新建同目录 `agent-chat-history-organization.tsx` | `src/screens/ai/AiScreen.tsx`、`AiConversationScreen.tsx`；`src/screens/home/HomeScreen.tsx`；`src/screens/chat/RelationshipChatScreen.tsx`（只接入口元信息）；`src/data/ai-send-intent.ts`；`src/view-models/agent-history.ts`；`app/ai/[id].tsx`；新建 `src/screens/ai/AiSessionOrganization.tsx` |
| 测试与说明 | 下列精确测试；`features/orbit-ai/DESIGN.md` 中会话管理段 | 下列精确测试；本 Sprint 执行结束后才创建 REPORT |

如现有菜单位于白名单外共享组件，先补入确切文件并审阅；不借此重写通用 drawer、HTTP client、缓存或主题。现有符号编辑前必须 upstream impact；HIGH／CRITICAL 先向用户报告。文档编制没有符号修改，不虚构零风险 impact 结果。

## 排除范围

不实现新模板生成／@ 提及／笔记核心／建议接受；不自动归组、做多级目录、多人群聊、共享项目、跨会话记忆或文件空间；不新增归档／分享；不扩系统语言／时区工程。不进行生产迁移、真实历史清理、部署、付费 AI 或 OCR。已有 origin 与消息的私密展示不是新埋点系统。

## 验收契约（最多五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0021-01 | App／Web 新会话保存实际起源、受控引用、首条实发文本；编辑模板、首轮失败重试、100 条以上续聊、改名和移组后起源仍不变。现有入口全部对照；未来模板契约可消费并明确交接。 | 真实创建／续聊 handler 与 provider 测试、现有入口渲染交互、模拟模型失败；逐项入口矩阵，未来入口不冒充已测。 |
| SC-0021-02 | App 能创建／改名／打开分组，组内新建会话，移入／移出／跨组移动，删除组保留全部会话；符合附件的侧栏和菜单组织。 | App 真路由操作、服务端回读、空／取消／失败状态；超过 50 个成员的原子删组测试及一次 iOS 交互证据。 |
| SC-0021-03 | 置顶／取消、改名、确认删除生效；全部历史可分页和搜索；打开会话删除后不继续写旧 ID，失败不假成功；旧历史不消失或重复。 | 超过 50 条和同时间排序夹具、菜单交互、查询过滤／游标测试、旧 runtime→canonical 映射证据和删除当前会话场景。 |
| SC-0021-04 | 同账号 Web↔App 刷新后组织与起源一致；另一账号不可读取／修改；旧客户端省略新字段不丢数据，保存竞争不回滚组织、删除不复活。 | 同版本同记录双向写读、双 actor／服务器切换、旧协议兼容和并发测试；实际隔离 PostgreSQL 事务／回滚／tombstone 证据，内存测试不能替代。 |
| SC-0021-05 | 元信息不带来自动发送／模型调用、越权引用或完整私密日志；失败可见，必要检查和两端交接齐全，无必需项被跳过当通过。 | 记录 API／模型调用次数、恶意引用及日志禁含断言、H 档检查、逐 SC 证据和实际 REPORT；费用账本不新增管理操作模型费用。 |

## 一次 Generator 的实施顺序

各 Task 是同一 run 内步骤，不启动额外代理。按 RED → 最小实现 → 相关完整测试 → 路径限定提交推进。

### Task 1 — 起源契约与首次持久化（SC-01／04／05）

- [ ] 对齐 B3 实际协议、获批范围和新旧响应形状，登记基线／Planner 哈希及 run-01。
- [ ] 新增 Web `tests/capabilities/ai-session-origin.test.ts`；扩展已有 `orbit-agent-chat-session-api.test.ts`、`orbit-agent-chat-session-live-store.test.ts`。预期失败：首轮只含用户消息也能保存 origin；后续改变 firstSentText 被拒绝；101 条以后首条仍保留；旧请求缺字段不清空。
- [ ] 观察 RED 后实现共享 schema、首发送持久化及 provider 读写；同步 App，再扩展 `tests/ai-send-intent.test.ts` 和 `tests/ink-signal-ai-conversation.test.ts`，验证入口隔离和存储失败时模型调用为零。
- [ ] 检查已有手动入口、首页建议和 Web 创建路径；模板未来消费者使用同一契约夹具，不提前做模板产品实现。验证后提交。

### Task 2 — 组织 API 与存储原子性（SC-02／03／04）

- [ ] 新增 Web `tests/capabilities/ai-session-organization-api.test.ts`、`ai-session-organization-store.test.ts`、`ai-session-organization-postgres.test.ts`。
- [ ] RED 覆盖创建组、移组、元信息 patch、分页／搜索、双 actor、409、重复 mutationId；61 条会话删组无遗漏；晚到保存返回 410 而不复活；故障注入时事务整体回滚。
- [ ] 在 feature 存储层复用事务设施，补 groups 路由与 sessions PATCH；保留旧 POST 的正确行为。测试同名组和无权限对象，不通过客户端过滤伪装隔离。
- [ ] 隔离 PostgreSQL 验证和必要权限到位后才运行集成；缺失则该证据 blocked。相关检查后提交已验证部分。

### Task 3 — App 操作与 Web 消费（SC-01／02／03）

- [ ] 新增 App `tests/ai-session-organization-interactions.test.ts`；扩展 `tests/agent-history-view-model.test.ts`、`tests/ink-signal-ai-conversation.test.ts`。通过渲染／HTTP fixture 点击实际菜单，不能只断言源码中出现按钮名。
- [ ] 观察失败后实现附件规定的侧栏／分组／菜单／会话信息；长按与可访问更多入口同功能。确认和持久化失败分支一起实现。
- [ ] 新增 Web `tests/pages/app-agent-session-organization.test.tsx`；扩展 `tests/pages/app-agent-chat-history.test.ts`、`app-agent-session-mutations.test.ts`，再接 Web 组织控件、解析／保存和刷新，保留已有改名／置顶能力。
- [ ] 检验组内新建、移动后源组消失、全局置顶标组、旧会话、当前会话删除及旧快照到达；验证后提交。

### Task 4 — 跨端和同版本收口（全部 SC）

- [ ] 在获准测试账号新建会话，App 移组／置顶→Web 刷新核对→Web 改名／取消置顶→App 重开核对；两端分别删除不同测试会话并核对另一端不可恢复旧 ID。
- [ ] 实际 iOS 操作长按、更多菜单、组选择、确认与失败反馈；功能／组织对照附件，不做像素打分。
- [ ] 跑以下 H 档最小检查，记录私密信息保护、版本、actor 脱敏 ID、全部五项证据和未完成。无授权设备／数据库／双端条件时不得以单测替代必需证据。
- [ ] 执行结束创建 REPORT；协调者更新登记与 BR-003／004／005 交接，向 0006／0019 给出真实 contract 版本和未来入口接线清单。原 Sprint 的未完成验收保持不变。

## 测试命令与证据

本次计划编制为 D 档：检查文档链接、路径、5 项 SC、登记表及 diff，不跑产品全量。以下均为未来实施命令；新增文件需先创建并观察 RED。

Web cwd `/Users/xzhao/Projects/orbit/repos/orbits`：

```sh
node --test --import tsx tests/capabilities/ai-session-origin.test.ts tests/capabilities/ai-session-organization-api.test.ts tests/capabilities/ai-session-organization-store.test.ts tests/capabilities/orbit-agent-chat-session-api.test.ts tests/capabilities/orbit-agent-chat-session-live-store.test.ts tests/pages/app-agent-session-organization.test.tsx tests/pages/app-agent-chat-history.test.ts tests/pages/app-agent-session-mutations.test.ts
node --test --import tsx tests/capabilities/ai-session-organization-postgres.test.ts
npm run typecheck
npm test
```

App cwd `/Users/xzhao/Projects/orbit/repos/orbit-app`：

```sh
npm run sync:contract
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/ai-session-organization-interactions.test.ts tests/ai-send-intent.test.ts tests/agent-history-view-model.test.ts tests/ink-signal-ai-conversation.test.ts
npm run typecheck
npm test
```

PostgreSQL 测试不得默认连接开发／生产库；必须沿项目既有隔离测试设置，未配置则明显失败或登记 blocked，不能 skip 后宣称 SC-04 通过。提交前冻结同版本，受影响传递消费者由实际 impact 补齐；同步测试若已包含在全量则引用同次结果。

本 Sprint 的模型响应可用受控 provider，验证整理操作与元信息不需要真实模型付费；这不等于通过 0005／0006 的真实模型验收。若新增需求确需付费，先说明并获得适用授权，继续原累计 $5 硬上限和 $0.012780 已用账本，不重置。

## 失败处置与交接

缺 B3 实际字段／审阅／明确执行指令时不启动、不消耗 run。开始后按 RULES 的有限诊断／两次本地修复上限；冲突、部分成功、未测设备或未获准数据库逐项报告，不降低 SC、扩白名单或自动再运行。

交接须给出两端 SHA、共享 schema 版本、origin 注册 ID／未来模板待接项、新旧客户端兼容边界、允许刷新方式和必需证据。若消息／管理冲突修复超出既有会话范围，暂停依赖部分，先补计划审阅；不能改通用数据库基础设施来绕过白名单。

# Sprint R21 — iOrbit：起始屏 / 会話中 / 会話リスト

**Plan revision:** 2（2026-10-18；主会话复核并采纳 E-1～E-8 后修订）。**模式:** existing-codebase / E 线。**执行者:** Codex（与 D 线交接更近；仍以 RD-32 所定的 Claude / Codex 中先空出的一方为准）。**未来工作树:** `/Volumes/ORICO/Dev/worktrees/orbit/redesign-e`，分支 `line-e`；现在尚未创建。

**单一目标:** 两端 iOrbit 重写并删旧屏，完成 D-18 / D-19、R30 会话搜索和 R20a 实体草稿深链，按 b4 与较新补板过门禁。
**易读目标:** [GOAL.md](GOAL.md)。**代码事实基线:** `origin/redesign` = `cb866e48fbb41e7f540bbf66177f9ae0ac597591`（2026-10-18 已重新 fetch；`e464b1877..cb866e48f` 中 §4 所列既有代码路径无变动，新增的搜索与错误码锚点按新基线复查；开工后仍须重定位行号）。**进入条件:** RD-31 的 E 线在 R31a 完成后开；R31a / R31b 合入前可以做结构、数据、逻辑，像素收口等组件到位。**当前任务授权:** 只编写这两份文档；以下是未来执行说明，不表示已经实施。

---

## 0. 给 E 线执行者的说明

1. 开工先在 E 线工作树拉取 `origin/redesign`，核对干净状态、R31a / R31b 组件进度、两端 `AGENTS.md`、[README](../README.md) 通用规则 10–13 与 RD-16、24–33、[HOW-TO](../HOW-TO-START-A-FEATURE-SPRINT.md)、[HANDOFF](../HANDOFF-TO-FEATURE-SPRINTS.md) 通用 G01–G26 / R21、[DEFERRED-A](../DEFERRED-A.md)、[screen-ownership](../screen-ownership.md)、[决定表](../maintenance/2026-10-12-decisions.md)、[IMPLEMENTATION-PLAN](../../IMPLEMENTATION-PLAN.md) §1.4 / D-18 / D-19 / §5 Q8，以及 R20a、R18c、R11b PLANNER 的执行和证据格式。需查明变更范围后再编辑；代码事实与本表不同时以新基线重做影响分析。
2. E 线只提交自己路径，按路径暂存与提交，**不推送**；主会话独立复核后集成（RD-32）。R31a / R31b 组件和 token 只有 A 线改，导航壳只有 D 线改。汇总文件只追加，契约只加不改，App 同步副本同次提交；遇到 `.snapshot.json` 冲突重新生成。跨线依赖先交契约和演示数据，后接真数据。项目 AGENTS 的 GitNexus 规则与 README RD-32 有冲突；执行时按更高优先级的实际会话指令处理，并在 REPORT 记录影响面，不把 `UNKNOWN` 当安全证明。
3. 不问离线用户。§2 已由主会话代定；执行中新增的设计稿冲突、产品取舍在 REPORT 列「主会话代定」，能独立做的 SC 继续。缺别线文件写「请求」，别线进行中的改动不覆盖。Neon / 生产迁移、部署、生产变量、TestFlight / 真机分发与合回 `chat-agent` 写「待用户授权」，本 Sprint 不做。付费 AI 仅在本机必要验证时真调用，记录用途、次数和 token；新增调用路径要有配额、失败降级和重复提交防护。
4. 报告写 `R21-iorbit/REPORT.md`，预检写 `preflight-checklist.md`；截图和日志放 `~/orbit-sprint-evidence/redesign/R21/run-01/`。每轮摘要列 SC、提交号、定向/全量测试的通过数与失败名、门禁结果、越线自查、交接、待定与待授权。仅路由或类型通过不能说业务对齐。跨端交接依 [bridge/README.md](../../../../../bridge/README.md) 的模板写本端版本、另一端影响、未完事项和验证范围，台账由有权的协调者更新。
5. 新 App 页一律 `AppScreen inset="kit"`，不用自己画系统状态栏或 Home 指示条（规则 13）；只有新组件库，缺件先交 A。Web 壳用现成 `ShellPage` 插槽；1024 右栏按壳折叠，390 不加独立 ⌘K 搜索键。旧屏允许清单只减不增。

## 1. E 线归属 / 不许碰的文件

**E 线可改（具体引用开工重查；删除前引用必须归零）**

- App：`repos/orbit-app/app/(app)/ai.tsx`、`app/ai/**`，`src/screens/ai/AiScreen.tsx`、`AiConversationScreen.tsx` 及其 **iOrbit 专用**子组件、view-model / source；`src/api/ai-history-contract.ts`、`src/hooks/local-ai-sessions-source.ts` 等 iOrbit 读取与离线镜像；为本功能新增的 App i18n 域、门禁 `views/app-R21.json`。`src/screens/ai/AgentActionsScreen.tsx` 归 D 线 R20a，虽然同目录也不归 E。
- Web：`repos/orbits/app/(app)/app/agent/page.tsx`、`iorbit-0918/**` 中引用归零的旧壳、`orbit-2026/iorbit/**` 新页面、`orbit-global-ask/**` 的预填/上下文交接；`app/api/ai/conversations/**` 与 `features/orbit-ai/{conversation-contract,reliable-send-service,entity-drafts,storage}/**` 中**仅本 SC 涉及的会话逻辑**；`features/search/global/live.ts` 与 `handlers.ts` 的 `searchLive`、独立 `searchConversations` 适配器；`views/web-R21.json` 与 R30 需补的搜索门禁视图。`features/orbit-ai/**` 的其他 workflow 和被首页使用的服务不属整目录可改。
- 共享：iOrbit 会话、pageContext、`PIN_LIMIT`、全局会话命中所需的 `shared/contract/**`、`shared/api-schema/**`、`shared/errors/app-error.ts` **仅做兼容性扩展**；本功能对应 mock、copy、离线 sync 配置与 App `src/api/{contract/envelope,client,ai-session-management}.ts` 的错误码读取按 §5 同步。`scripts/visual/attribution-redesign-R21.json` 和本目录证据文件。

**不许碰 / 只通过交接改**

- A：`repos/orbit-app/src/components/ui/**`、Web `orbit-2026/ui/**`、`shared/design/tokens.json`、视觉工具本体；预检缺项列请求，不用局部魔数或近似 token 垫过去。
- D：App `ShellTopBar` / `OrbitTabBar` / `AppScreen`、导航映射与 `TASK_SLOTS`；Web 壳 `orbit-2026/shell/**`、首页与 Task，R23–R25 的计划页面内部、R20b 的 `src/screens/notes/**`。E 线可以用导航和计划公开 API，壳或别线页面所需入口由 D / 甲挂载。
- B：`features/inbox/**`、`app/(app)/app/inbox/**`、收件箱会话本体和通知页。`searchConversations` 的 inbox 分支若无可用的本人会话读取服务，向 B 线交接**只读搜索契约**；Web 收件箱当前没有按会话 id 选中的公开路由，向 B 线交接 `/app/inbox?conversationId=<id>` 的受保护落点。不能为打开 chip 擅改其正在开发的文件或用假结果。
- R20b 的 `src/screens/notes/notes-source*`，即使 `AiConversationScreen` 旧引用消失也不能删除；笔记详情、新建、编辑、列表仍使用它。`home-plan-events-actions.ts` 等 v1 遗留被首页、测试等引用时也不能直接删，先逐引用迁往 v2 并由所属线处理。
- README、HANDOFF、DEFERRED-A、决定表、screen-ownership、Bridge 台账由主会话 / 协调者维护；E 线在 REPORT 提供可粘贴的四栏交接行。不改其它线未提交文件。

## 2. 主会话代定（RD-33，已采纳）

| # | 推荐决定与依据 | 影响 |
| --- | --- | --- |
| E-1 | **D-18 按本次明确范围执行 90 日**，覆盖 IMPLEMENTATION-PLAN §5 Q8 的旧推荐「不自动删」。以服务端最后活动时间计算东京日期边界：在第 90 日仍可见，超过 90 日且未置顶才软删；置顶豁免。清理任务先在本机测试库验证，生产调度待用户授权。 | SC-05；不是应用启动时客户端清理。 |
| E-2 | **置顶上限 5 在服务端事务 / CAS 中做**；第 6 个返回 HTTP 409 且 envelope `error.code="PIN_LIMIT"`，与版本冲突 `CONFLICT` 区分。须扩展共享错误码/状态映射、PATCH handler、App 契约副本/解码与专用提示，然后重取列表。解除置顶不改变原会话内容或排序时间。 | SC-04；前端限制只为即时反馈。 |
| E-3 | b4 删除后的「元に戻す」采用**5 秒内服务端可撤销的软删除**；撤销必须校验 actor、删除版本与期限；超时保留软墓碑且列表不显示。90 日到期软删不弹撤销。 | SC-04/05；需新增恢复命令，不能仅做视觉回滚。 |
| E-4 | 历史搜索按 b4「标题＋本文」执行**全会话服务端搜索**，本人范围、分页/上限、读预算，不用客户端当前一页过滤。现存 `search_text` 截到 8,000 字符，必须查明并补足索引/查询实现；若预算内无法做到全本文，记为未满足，不能声称已完成。 | SC-03/11；可能需要本地迁移，生产迁移仍待授权。 |
| E-5 | D-19 **用户显式开关默认关闭**；首次进入、换页和任何预填入口均保持关闭，不在发送体里暗带上下文。用户开启后才从当前登录页面生成可信的 `route`、允许的 `filters`、`count`，发送前展示摘要；服务端按 actor 和 allowlist 重新校验，截断和忽略隐私/自由文本筛选。**预填与自动发送分开**。 | SC-07/08；不把 URL、DOM 或 sessionStorage 任意字串当系统指令。 |
| E-6 | 会话列表中的「プランを作る」/ intake 是**带类型的计划入口**，与聊天历史分组区分；点击以既有 `plan*Href` 进入 R23–R25 页面。R21 只做 iOrbit 页头和入口联动，计划页面正文归原线。 | SC-09。 |
| E-7 | App 新会话与 Web 起始页按最新 b11/b4 优先；右栏示例问题点按会**直接发送**（R21-07），全局 ⌘K / 搜索「iOrbit に聞く」则**只预填**（R21-10）。新付费路径沿现有配额/降级，未具备配额前不增新自动调用。 | SC-06/08。 |
| E-8 | b8 只有起始与历史的窄屏板；其他 1024/390、深色或错误态无对应画板时沿同页结构与 token，自行截屏标「设计稿无，不进门禁」，不能拿近似板代验。 | SC-13/14。 |

## 3. 交接条目逐条落点

| 来源 | 本 Sprint 落点 / 转出 |
| --- | --- |
| R21-01 / 08 | SC-01：App 全屏 ≡ / ✕、左缘右滑、单行输入、标题最大字不溢出；b11 #41、b4 #32–34。 |
| R21-02 / 03 | SC-02 / 07 / 13：Web 起始和深色、日文；回答侧保持隐私边界，不把已删的 ⌘K 说明行加回。 |
| R21-04 | SC-09：iOrbit 页头 / 左栏选中与计划生成入口；R23 页面内部转出甲。 |
| R21-05 | SC-10：逐引用清理 v1 计划；D 线 / 甲引用未归零时转交，不能越线删。 |
| R21-06 | SC-09：三个 `plan*Href`、intakes、v2 本周推进。 |
| R21-07 | SC-06：右栏示例问题点按直接发，计费/重试防护。 |
| R21-09 / DEFERRED-A R30-R21-09 | SC-11 / 12：`searchConversations` 不接收平台；`searchLive` 按 `input.platform` 转换两类会话的 href；R30 四 chip live 和 W-R30-P01 / A-R30-P06 复验，inbox 读取与 Web 深链依赖 B 线。 |
| R21-10 | SC-08：Web `stashAgentPrefill({origin:null})`、App `prefillIntent` 只填不发。 |
| G01 / 02 / 03 / 04 | SC-01 / 02 / 04 / 13：新标题与深色、次要文字对比、危险色 `coralText`、App 40 可见 / 44 触控。 |
| G05 / 06 / 07 / 08 / 09 | SC-13 / 14：定稿板逐像素、预检、只读示例服务器、示例文字和系统状态栏归因。 |
| G10 / 11 / 12 / 13 / 14 | SC-02 / 13：Web 壳插槽、390 标题与无 ⌘K、旧样式污染/底部 inset、公开页壳排除由壳线保留；R21 不新增公开页。 |
| G15 / 16 / 17 | SC-01：App `AppScreen inset="kit"`、底栏转场、安全区和顶栏沿壳；导航映射变更转 D。 |
| G18 / 19 / 20 | SC-03 / 07 / 10 / 12：演示能力登记、App 宽进与离线副本、旧屏允许清单减行。 |
| G21 / 22 / 23 / 23b / 24 / 25 / 26 | SC-01 / 02 / 13 / 14：Web scope/ToastProvider、语言 cookie、A 组件请求、App `UiText` 字形、省额度门禁、正式字号/圆角 token。 |

## 4. 已查清的代码事实（`origin/redesign`，行号为编制时锚点）

1. App 路由 `repos/orbit-app/app/(app)/ai.tsx:5,18` 挂 `AiScreen`；`app/ai/[id].tsx:5,13–24,31–42,50–68,79–95` 挂 `AiConversationScreen`，处理 intent、`prefillIntent`、身份和一次性消费。删除旧屏必须先替换路由与预填链。
2. `repos/orbit-app/src/screens/ai/AiConversationScreen.tsx:51,182–197` 引入并使用 `../notes/notes-source` 的 `useNotesWriteStatus`；笔记详情、新建、编辑和列表也引用该 source。`:452–473` 组发送体，`:1006–1015` 渲染 `AiEntityDraftCard`。只删旧屏，不删 notes-source。
3. App `src/api/ai-history-contract.ts:32–39` 会话响应 `.passthrough()`，`:102–126` 日期分组；`src/hooks/local-ai-sessions-source.ts:20–27,30–76` 做离线镜像，但目前卡片只取在线第一页。改新字段时仍核对其他 strict decoder 与同步副本。
4. Web `app/(app)/app/agent/page.tsx:41,102–146` 挂 `iorbit-0918` 的 `IOrbitShell` 和旧首页模型；`iorbit-0918/iorbit-shell.tsx:286–322` 消费 handoff 预填。`use-agent-chat.ts:650–677,768–785` 会话 hydration 后消费 `takeAgentPrefill`；`pendingAsk` 当前会自动发送，并把上下文接到普通文字后面。
5. Web `orbit-global-ask/orbit-ask-draft.ts:20–41,76–139` 区分 `pendingAsk` / `prefill`，`origin:null` 只预填；`orbit-ask-routes.ts:66–121` 当前页面上下文只构造标签，没有可信的 route/filters/count。`features/orbit-ai/conversation-contract.ts:79–100`、`app/api/ai/conversations/route.ts:196–207`、`shared/api-schema/ai-sessions.ts:173–184`、`shared/contract/ai-sessions.ts:101–111` 均尚无 D-19 字段；`features/orbit-ai/reliable-send-service.ts:82–112` fingerprint 只含现有允许字段，新增上下文需纳入幂等语义。
6. 会话 GET 在 `app/api/ai/conversations/sessions/handler.ts:118–147` 支持 `q` / `pinned` / `limit` / `cursor`；PATCH `sessions/[id]/handler.ts:261–340` 有版本预期，`:333–340` 目前把除缺组、校验外的组织错误统一映为 `CONFLICT`。`features/orbit-ai/storage/orbit-agent-chat-session-transactions.ts:35–55,466–515` 的内部错误枚举没有 `PIN_LIMIT`，可改 pinned 但无上限；`orbit-agent-chat-session-live-record-provider.ts:983–1023` 删除是会话和消息软墓碑，`:1036–1069` 摘要读取；`:194–200` 搜索文本限 8,000 字符。因此「全文」与 90 日清理尚未完成。
7. `features/sync/domain-registry.ts:320–347` 把 ai-session / message 字段列白名单。新增会话级持久字段若只改 API、未改白名单和 App 同步解析，会在离线 outbox / 镜像回读时丢失。要用同一条双向 round-trip 断言检查。
8. R30 `features/search/global/live.ts:14–23,41–45,94` 的 `conversations` 是 `null`；`handlers.ts:114–143` 的 `searchLive` 已有 `platform`，但 `:141` 调用会话 port 时只传 `actorId/query/limit`；`core.ts:24,138–146,176–186` 直接把候选 href 放进响应。`shared/contract/global-search.ts:44–51` 已定义命中字段，`shared/compute/search-highlight.ts:23–53` 是码点区间高亮。`repos/orbit-app/src/screens/search/GlobalSearchScreen.tsx:92,225–226` 直接 `router.push(hit.href)`，因此平台转换必须在 `searchLive` 出响应前完成。`search/DESIGN.md` §3.2 建议复用会话搜索，但必须克服现有 8,000 字符截断。
9. `features/orbit-ai/entity-drafts/contract.ts:18–23,47–73` 定义实体草稿类型、状态与 `conversationId`；App `repos/orbit-app/src/view-models/ai-entity-draft.ts:211–216` 仅把 `pending_confirmation` 设为可确认。R20a 的 D-2 已定「判断待ち」里 `entity_draft` 只读，点入所属会话；`contact_draft` 仍去原联系人草稿页。
10. `shared/compute/plan-href.ts:13–56` 有 `planReviewHref` / `planDoneHref` / `planNewGoalHref`；`app/api/agent/plans/intakes/route.ts:1–5` 暴露 intake 列表。`home-plan-events-actions.ts` 仍被 `home-dashboard-route-service.ts` 和测试引用，不能因 R21-05 直接删除。计划页和导航壳不归 E。
11. `shared/errors/app-error.ts:6–27,68–73` 与 `shared/contract/envelope.ts:5–15` 目前只列通用错误码；App 同步副本 `repos/orbit-app/src/api/contract/envelope.ts:5–15` 也没有 `PIN_LIMIT`。App `src/api/client.ts:80–87,169–185` 宽进错误对象但缺专用文案，`src/api/ai-session-management.ts:21–41` 把失败收成一条 message，丢失可判别的 code。新增码要打通状态映射、契约和 App 结果类型/提示，不能只在服务端抛内部错误。
12. 搜索演示数据 `shared/mock/demo-world/global-search.ts:41–44` 的 App iOrbit href 仍是 `/ai?session=…`，而 App 真实会话路由是 `/ai/[id]`（`repos/orbit-app/app/ai/[id].tsx`）；App 收件箱详情为 `/inbox/[id]`（`app/inbox/[id].tsx`）。Web iOrbit 已用 `/app/agent?session=<id>`；Web `app/(app)/app/inbox/page.tsx:11–14` 当前未读 `conversationId`，`relationship-inbox-panel.tsx:742,777–783,1245–1246` 仅内部选中会话。live 交付必须保证 inbox Web 深链能选中对应会话，不能只到收件箱首页。

## 5. 契约与状态边界

- **会话列表**：`GET /api/ai/conversations/sessions?q=&pinned=&limit=&cursor=` 为服务端本人查询，确定性排序（pinned、最后活动、id）和稳定 cursor；分组「固定 / 今日 / 今週 / 以前」由同一东京时间基准导出。搜索标题和正文含跨页结果；空、加载、错误、离线有独立状态。改名 / 置顶走带 `expectedRevision` 的 PATCH；服务端事务校验最大 5。第 6 个置顶须在事务里抛独立 `PIN_LIMIT`，route 返回 HTTP 409 与 `error.code="PIN_LIMIT"`；`REVISION_CONFLICT` 仍为 `CONFLICT`。更新共享错误码和状态映射、App 契约副本、`ai-session-management` 保留 code 的解码与 UI 专用提示，再重取列表。删除保持 soft tombstone，新增限时撤销回执/命令并保证并发及 actor 隔离。90 日维护任务只改未置顶、过界记录，不调用 AI，不删除其他人的数据；本机时钟驱动的测试替身，不启用生产任务。
- **发送与上下文**：D-19 可选 `pageContext?: { route: string; filters: Record<string,string|string[]>; count: number }` 作为结构字段经过 Web 入参、共享 schema、会话服务、可靠发送指纹；开关初值**关闭**，首次进入、换页、预填路径均不继承开启状态，发送体不带字段。用户开启后由当前页面展示摘要，服务端重建允许的路由和筛选，长度/数量/范围有界，不能信任客户端的系统提示。上下文只随用户明确发送的那一次请求，关闭或路由变化即失效；answer 的来源、隐私说明在结果侧体现。`pendingAsk` 的旧自动发送只保留明确已确认动作；R30 的 `prefill` 路径永远不自动发。
- **AI 链**：现有会话/消息 ID、流式事件、stop / resume、可靠发送去重、引用展开、实体草稿 `pending_confirmation → accepted|failed` 与 action log 继续使用现有 API；停止/取消后迟到事件必须按 run id 或序号丢弃，不覆盖已停止或新一轮结果。重连及另一设备同时操作要以服务端版本和回执收敛，失败后保留输入和可重试操作，不把 demo 回执当 live。右栏示例问题是一次真实发送，按既有配额检查、超额提示和无 key 降级；额度耗尽后重试不得触发新付费调用，同一点击/重试不能重复计费。
- **全局会话搜索**：`searchConversations(actorId, q, limit): GlobalSearchConversationHit[]`，分别取本人 iOrbit 和 B 线可用的 inbox 会话，**不接收平台参数**；为满足现有命中契约的必填 `href`，服务返回规范 Web href，但不据此决定最终导航。`kind` 为 `iorbit|inbox`，`subtitle` 为「日期 · 来源」，`highlights` 使用 Unicode 码点区间，权限在查询层且读取有界。`features/search/global/handlers.ts` 的 `searchLive` 在收到候选后按 `input.platform` + `kind/id` 重建 href：iOrbit Web `/app/agent?session=<id>`、App `/ai/<id>`；inbox App `/inbox/<id>`，Web 与 B 线约定 `/app/inbox?conversationId=<id>` 并由其实现选中/权限校验。两个 id 均 URL 编码；未知 kind 或无可用落点不返回伪链接。当前 Web inbox 仅有内部选中态，B 线交付前该分支及两端完整验收不能标 done。接到 `live.ts` 后 `types` 自动包含 `conversations`；Web/App 同一 API 消费，演示 href 也要与 live 一致。
- **离线/同步**：会话与历史镜像仅保存 actor 范围内资料。改名、置顶、删除的 outbox 回执及冲突要本机缓存、Web、App 往返一致；`features/sync/domain-registry.ts` 白名单、App strict 读取、API schema 和 `shared` 同步副本一并核查。新增字段若只随单次发送而不持久化，须明确证明不会被同步路径吞掉；持久字段做断网编辑→重连→另一端回读测试。

## 6. 画板映射与开工预检

画板序号已用本机静态服务（3358）与 `compare-redesign.mjs --list` 核对；执行时重跑，停服务。**App**：`app.html` #10 起始、#11 会话、#12 列表、#35 深色；`b4-plan-iorbit.html` #32–34 起始、#38 列表、#39 长按、#40 改名、#41 删除、#44 @、#45 语音、#47–49 确认/成功/失败、#51 生成、#52 答案及来源、#56 深色起始、#57 深色列表；`b11-nav-v3.html` #41 全屏头、#43 历史搜索、#44 置顶/删除。**Web**：`web.html` #8 起始、#9 会话/历史、#22 深色；b4 #35–37 起始、#42 hover、#43 删除、#46 @、#50 成功/失败、#53 生成/来源、#54 pageContext、#61 深色历史/生成；b11 #45 历史菜单；`b8-responsive.html` #9（1024 起始）、#10（390 起始）、#11（1024 历史）、#12（390 历史）、#18（390 深色）。较新的同一状态板优先，旧总览板作交叉检查；不可把不同状态互当基准。

| 门禁屏幕 id（拟新增） | 设计板 `--board` | 状态 / SC |
| --- | --- | --- |
| A-R21-01 / 02 / 03 | b4 #32 / #33 / #34 | App 起始三态；SC-01/13 |
| A-R21-04 / 05 / 06 / 07 | b4 #38 / #39 / #40 / #41 | App 历史、长按、改名、删除；SC-03/04/13 |
| A-R21-08 / 09 / 10 | b4 #47 / #48 / #49 | App 草稿确认、成功、失败；SC-09/13 |
| A-R21-11 / 12 | b4 #51 / #52 | App 生成、回答与引用；SC-06/13 |
| A-R21-13 / 14 | b4 #56 / #57 | App 深色起始、历史；SC-13 |
| A-R21-N01 / N02 / N03 | b11 #41 / #43 / #44 | App 新全屏头、历史搜索、操作补板；SC-01/03/04/13 |
| W-R21-01 / 02 / 03 | b4 #35 / #36 / #37 | Web 起始三态；SC-02/14 |
| W-R21-04 / 05 / 06 | b4 #42 / #43 / #46 | Web hover、删除、@；SC-04/06/14 |
| W-R21-07 / 08 / 09 | b4 #50 / #53 / #54 | Web 确认回执、生成/来源、pageContext；SC-06/07/14 |
| W-R21-10 / 11 | b4 #61 / b11 #45 | Web 深色历史/生成、历史菜单；SC-04/14 |
| W-R21-R01 / R02 / R03 / R04 / R05 | b8 #9 / #10 / #11 / #12 / #18 | Web 1024/390 起始、历史及 390 深色；SC-02/14 |

这些 id 是 R21 新视图的**拟登记名**，要按 `--list` 的屏幕标题和视图文件现有命名确认，不能拿旧 R05/R07 id 顶替；`app.html` / `web.html` 总览页仅作覆盖对照，若板内容与较新 b4/b11 冲突，REPORT 记旧板作废。b4 #54 若画的是开关已开启状态，W-R21-09 只验**手动开启后**的外观；首次进入默认关闭依 E-5 验功能，无对应关闭态画板就附截图并标「设计稿无，不进门禁」。App @ / 语音（b4 #44/#45）、Web 深色缺态与其他未单列板要按 SC 操作验功能；有板时补门禁 id，无板时记录原因。

**已做只读预检**：`board-preflight` 抽 b4 #32/#35/#38/#42/#47/#54 与 b8 #9–12。b4 样本：near-but-not-equal 6、missing token 23、自洽 0、疑似无功能元素 10；常见 `line-height:1.45`（8 处）对正式 display 1.05、30/60/58px 间距和 Web 阴影。b8 样本：near 2、missing 13、自洽 0。手机画框 radius 54、camera、状态栏及浏览器装饰按规则 13 排除；emoji 建议卡要按数据/真实入口判定；历史搜索不能仅画输入框。执行时补全板预检并把逐项取舍写 `preflight-checklist.md`，缺 token/组件交 A，不能在 E 页写近似值。未提供的状态/宽度/主题写「设计稿无，附截图，不进门禁」：例如 Web 1024/390 的生成中、实体草稿错误态及其他未列板，不编造 pixel id。

像素门禁按 HOW-TO §8：先源码样式检查 / `--style-diff`，再 Web 1440、1024、390 × 浅深与 App Simulator 浅深的**有对应画板**视图；整页含壳，逐带归因只用决定表允许的 `[data]` / `[raster]` / `[contrast]`，最终提交 attribution。App 真机系统条不绘制；只读演示服务固定结果补生成态。超过三轮仍不合格列未过，不称 done；R31a/b 未交的视图列「待组件库」与重跑 id。R30 W-R30-P01 / A-R30-P06 在 live 四 chip 开启后复验。

## 7. 验收 SC（每项都要操作链和证据）

| SC | 操作链与断言 | 证据 |
| --- | --- | --- |
| SC-01 App 全屏 | 从中间 tab / 旧 `/ai` 打开新起始 → 新建 → ≡ 列表 → ✕ 退出 → 左缘右滑退出 → 返回时焦点/草稿正确；大字号标题不换行溢出，`AppScreen inset="kit"` 无双重状态栏。 | Simulator 录屏，路由回归、A-R05-09 与 b11 #41 浅深截图。 |
| SC-02 Web 起始 | `/app/agent` 登录后显示两行标题、2×2 建议卡、720 输入与新会话；左栏选中、1024/390 收缩、日文和深色；未登录按原认证跳转。 | Web 1440/1024/390 浅深截图、路由/语言测试。 |
| SC-03 历史读搜 | 建 3 天组与置顶组、多页同标题/正文命中 → q 搜索 → 翻页/清空 → App 离线打开最近副本并标旧；另一 actor 查不到；标题与全文跨页都命中。 | API 权限/游标/边界测试、两端录屏；8,000 字符后正文命中测试。 |
| SC-04 历史操作 | App 长按/左滑、Web hover → 改名 → 两设备并发置顶 5 个，再点第 6 个得 HTTP 409 `PIN_LIMIT` 且 App 显示上限提示；另造 `expectedRevision` 过期得 `CONFLICT` → 删除确认 → 5 秒内撤销 → 超时不可撤销；刷新/另一端回读一致，危险色正确。 | 服务端/共享契约/App 解码的错误码测试、CAS/并发/权限/undo 测试及 b4 #39–43、b11 #44–45 截图。 |
| SC-05 90 日 | 固定东京时钟，89/90/91 日、活动时间变更、置顶/解除置顶、不同 actor → 本机维护任务运行两遍 → 仅过期未置顶会话软删且幂等；消息和列表不可见，生产任务未启用。 | 本机库测试日志、查询计数和未启用配置；DEFERRED 待授权条目。 |
| SC-06 会话中 | 输入→发送→流式生成→停止/继续→来源展开；取消 run 后注入迟到流事件，结果不被覆盖；断网重连与另一设备同时操作按版本/回执收敛；@ 人/イベント与 App 语音按住录、松开只落草稿；示例卡直接发一次；无 key/配额/失败可重试。额度耗尽后连点和重试的**新增付费调用数为 0**，同一已接受请求重放只计一次。 | 两端录屏、迟到事件/重连/双设备回执测试、额度耗尽前后调用计数、必要真实 AI 调用次数。 |
| SC-07 Web pageContext | 首次从允许的列表页进入 iOrbit，开关关闭且请求无 `pageContext` → 手动开启，摘要显示 route/filters/count，发送一次并由服务端校验 → 关闭后发送无字段 → 换页后默认关闭 → ⌘K / 搜索只预填再发送仍无字段；过期/恶意 URL/他人范围被拒，回答侧隐私说明保留。 | 初次、换页、预填发送的请求捕获与 0 暗带断言；allowlist/边界/指纹测试、b4 #54 截图。 |
| SC-08 只预填 | Web ⌘K「iOrbit に聞く」/ ⌘↵ / 紹介ルート与 App 全局搜索入口 → 进入输入框且调用数仍 0、Web pageContext 仍关闭 → 用户编辑并发送一次；登录跳转后也仅消费一次。 | 两端 e2e、发送体和付费调用计数、R30 回归。 |
| SC-09 计划与草稿深链 | 计划 intake → iOrbit 列表类型行 → 三个 plan href → v2 页面；R20a `entity_draft` 判断待ち → 指定会话 → 对应卡片 → 确认/失败/重复提交回执；`contact_draft` 仍走联系人草稿。 | 路由表、跨端集成测试与 b4 #47–50 截图；R20a 交接。 |
| SC-10 删旧屏 | 替换 App 两路由与 Web `/app/agent` → 静态/动态引用检查 → 删除 `AiScreen`、`AiConversationScreen`、`iorbit-0918` 的仅专用文件 → 旧链接有目标；notes-source 与别线引用保持；旧允许清单只减。 | `rg` 引用清单、构建/路由回归、删前删后路径列表。 |
| SC-11 会话搜索服务 | `searchConversations(actorId,q,limit)` **不传平台**，造 iOrbit/inbox 两类本人、他人、Unicode 命中 → 检查 kind、title、日期来源 subtitle、码点 highlights、上限与预算；`searchLive` 按 `platform + kind/id` 转换四种 href 并 URL 编码，未知 kind 不返回假链接；inbox 读取/深链依赖未到时明确未完成。 | 服务层权限/Unicode/上限测试、`searchLive` Web/App × iOrbit/inbox 四格 href 测试、B 线交接版本。 |
| SC-12 R30 四 chip | 接 `live.ts` conversations → `types` 出第四 chip → Web/App 分别选择 iOrbit、inbox 命中并**打开所选会话**，不只进首页；App 搜索屏直接 push 后仍到正确路由；0 结果/错误不破坏前三组。 | live 四 chip 回归、四条实际导航录屏、W-R30-P01 / A-R30-P06 门禁报告。 |
| SC-13 App 像素 | 对 §6 App 每个有效板录真实 Simulator 浅深；预检缺件已由 A 交；缺板截图单列。 | `app-R21.json`、attribution、triptych/数字结论、未过清单。 |
| SC-14 Web 像素 | 对 §6 Web 1440/1024/390 有板状态截整页含壳，浅深；不画 mweb 系统外壳；无板状态截图单列。 | `web-R21.json`、attribution、style-diff 与像素摘要、未过清单。 |

## 8. 执行顺序、失败与交接

1. **先立契约**：核对新基线、影响面和画板；写测试刻画预填、会话 actor 范围和同步 round-trip。D-19 默认关闭/schema/可靠发送、历史搜索与 `PIN_LIMIT` 的共享错误码、route 映射和 App 解码可分支并行，但共享文件归一人整合；将 B 线 inbox 搜索读取与 Web 会话深链、A 线缺 token/组件、D 线导航入口按契约交接。
2. **再做纵向链**：SC-03–05 会话存取/90 日、SC-07/08 上下文/预填、SC-06 生成、SC-09 深链；每步本机测试和双端回读后才迁到下一步。SC-11/12 可独立推进，inbox 依赖只阻塞其子分支，不锁 iOrbit 搜索或 UI。
3. **最后替屏与收口**：SC-01/02、SC-10 引用归零，R31a/b 到位后 SC-13/14，复跑 R30。REPORT 逐 SC 记通过/失败/跳过原因、截图、用例、AI 次数、越线与提交；主会话复核后才集成。提交前依适用项目规则核对图变更、状态和只含本线文件；未请求推送。
4. **失败处理**：定位失败后做有界修复；新全量失败修两轮仍未好则记录用例和根因，不扩大改动。像素三轮仍未过列「未过」，不伪称通过。生产调度、迁移、部署、Neon、TestFlight 列「待用户授权」；缺板列「设计稿无」；缺 A/B/D 交付列「请求」和准确受阻 SC。只要其他授权 SC 可做就继续。
5. **交接表追加原文**：REPORT 给主会话四栏行：`R21-D18 | 90 日清理本机已验，生产调度未启用 | 授权后配置生产任务并验首跑/回滚 | R21 SC-05`；`R21-R30 | searchConversations + searchLive 跨端 href + live 四 chip | 重跑 W-R30-P01 / A-R30-P06，Web/App 各打开 iOrbit/inbox 会话 | R21 SC-11/12`；`R21-B | inbox 本人会话读取与 /app/inbox?conversationId=<id> 深链（如尚缺） | B 线交只读服务、Web 选中态和权限测试 | R21 SC-11/12`。如实际结果不同，按证据修改，不把计划行当完成行。

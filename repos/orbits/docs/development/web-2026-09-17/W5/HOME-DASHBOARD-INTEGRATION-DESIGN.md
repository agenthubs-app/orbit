# W5 首页窄接线设计（A 服务端获批，B 未批准）

## 状态、权威版本与本次权限

2026-09-18。本文保留已审的窄 server action、dashboard entry/generation 设计；主已批准 A 纯服务端三文件与本文更新，不是 B 接线批准，也不是实现完成声明。新独立树 `/Users/li/work/orbit-web-home-dashboard-20260918` 固定基线 `af9784f41a329d134778d5a0386ad5f31833b920`（含已验 P/W3/F/B5）；保留原 F 树及其已审文档不覆盖。A 验证后由 controller 完整 raw 检查再冻结交主；不启动 UI/PG/云，不修改冻结 F 文件。W4 的 `page.tsx`、`orbit-real-agent.tsx`、`orbit-agent-dashboard.tsx` 三文件写锁仍有效。

以下四条是早期只读设计/源码与图谱追溯记录，基于 0385ffba/49b944 及旧 F 树，明确不是本次 A 树 `af9784` 的当前索引状态，也不覆盖后文 A 实现证据：

- W5 冻结源码：`46e8f46790b2e00491b3b70916a532dab0ad47cc`；本树 `/Users/li/work/orbit-web-home-facts-20260917`。
- 主验收集成：`0385ffba7d04b5496258ec0d9c2d78fce8859ae9`。F 六文件逐字一致及主独立 Tokyo/LA 各 51、PG 9、types 0、raw 514 验收以主回执为准，本次没有重跑。
- 下文 W3/P/旧 UI 源码证据固定读取主集成的 **0385ffba 提交对象**，不读取 W4 进行中工作树。该提交内的旧 UI 不是 W4 最终 gate 证据；不得据此冒充冻结接口已经核验。
- 历史图谱先行记录：绝对 repo 绑定 W5 树与 `/Users/li/work/orbit-web-integration-20260917`；主索引 meta 为 0385ffba。W5 meta 为 49b944，但其 dirty-path coverage 已包含提交前最终 F 六文件，之后只有 46e8 一个提交。没有重建任何索引。FTS disabled 的空结果不表示无实现；用 exact context 后核对固定版本源码。新聚合/action 尚不存在、未 indexed，影响 UNKNOWN，不作“零影响”结论。
- 已读本树根/Web AGENTS、gitnexus-exploring 及 bridge 状态/交接。本文不修改 Bridge 台账、共享契约、HTTP API 或 App；未来 Web 接线验收不能替代跨端业务验收。

主已决定：手工刷新只更新四源 facts＋W3 推荐；旧 home 保留区不重读、不声称同步。沿用产品 `ORBIT_DISPLAY_TIME_ZONE`、含今天的七产品日 starts-in-window、每源合计最多 3 项、逾期/已过计划日/未排期另分组。没有轮询、跨午夜定时器、窗外进行中补读、recurrence 二次展开或新视觉设计。

## 精确读写边界与建议分批

以下均为 app-relative 路径。**A 已批准的精确四路径**是下列 A 三文件与本文 `docs/development/web-2026-09-17/W5/HOME-DASHBOARD-INTEGRATION-DESIGN.md`；B 仍须另批。

A 批（已批准，不占 W4 锁）：

1. 新增 `app/(app)/app/agent/home-dashboard-route-service.ts`：仅聚合已验收 facts/VM 与 W3 runtime，定义页面自有可序列化结果；不导入 React/UI，不参与 owner/draft gate。
2. 新增 `app/(app)/app/agent/home-dashboard-actions.ts`：窄只读 action，每次重新 auth＋canonical resolver；只导出所需 async action，不接页面。
3. 新增 `tests/pages/app-agent-home-dashboard-entry.test.ts`：先覆盖 server service/action、auth、状态、调用次数；B 批再补真实 page/entry 分支测试。

建议 B 批（依赖 W4 冻结接口复核及三文件释放，尚未批准）：

4. 修改 `app/(app)/app/agent/page.tsx`：只传递适配 W4 既有入口/owner 契约的首页数据，不在 chat 入口盲读新全集。
5. 修改 `app/(app)/app/agent/orbit-real-agent.tsx`：消费既有 owner/generation gate，管理本次数据请求的接收；保留 W4 会话、草稿、发送生命周期。
6. 修改 `app/(app)/app/agent/orbit-agent-dashboard.tsx`：现布局内展示 facts/推荐及窄刷新状态，移除被替代的 appointments 客户端读取与无证据报告断言。
7. 新增 `tests/pages/app-agent-home-dashboard-refresh.test.tsx`，并补第 3 项入口测试。

不写 F service/VM/reader/tests、W3 recommendation、P profile provider、B1 contacts、旧 home mapper、features/shared/API、语言 Provider、依赖锁、schema/index/cache。A/B 各自文档更新只能在另批范围内进行。若实际适配需白名单外改动，先提交精确差异和理由，不顺手扩大。

只读依赖白名单：上述三 UI 文件的**主指定冻结提交**；本文下方列出的 auth、facts、W3/P、旧 home/旅程、语言、tasks/personal/appointments provider 源码与关联测试。读固定提交对象，不追 W4 现场、不搬迁其他树代码、不 force 索引。

## 服务端契约：与 W4 gate 解耦的最小边界

以下标识符是建议新符号，不表示现已存在。

`loadHomeDashboardSnapshot({ actor, snapshotAt?, dependencies? })` 只供可信服务端 composition 调用。`actor` 使用既有 `AuthenticatedApiActor` resolver 的结果；`actor.id` 是 canonical account id。依赖注入仅用于服务端测试，不暴露给 action 客户端。空身份在任何 facts/recommendation factory 之前失败。不得把 raw Auth.js subject、profileId 或客户端 accountId 传给四源/W3。

建议返回页面自有 envelope：

```ts
type HomeDashboardSnapshot = {
  owner: { accountId: string; workspaceId: string };
  snapshotAt: string;
  facts: HomeFactsViewModel;
  recommendations: {
    state: "success" | "needs_goal" | "no_match" | "unavailable";
    items: readonly HomeDashboardRecommendationItem[];
  };
};
type HomeDashboardReadResult =
  | { state: "snapshot"; snapshot: HomeDashboardSnapshot }
  | { state: "unauthenticated" }
  | { state: "unavailable" };
```

`HomeDashboardRecommendationItem` 是本 route 自有投影：eventId、publicCode、title、description、startsAt、venue、matchedTokens、sourceEvidenceIds；不把 feature DTO/import 传给 presenter。沿用既有公开活动路由构造约定，链接在实施时以冻结路由测试锁定，不能用私有 owned-event ID 路由替代 publicCode。owner 是服务端数据归属标签，**不是另建身份解析或客户端授权系统**；若配置/resolver 无可验证 workspace，不编造 workspace，也不返回可展示 snapshot。

一次聚合取一个服务端时间，传给 `loadHomeFacts({ actorId: actor.id, snapshotAt })`，再 `homeFactsToViewModel`；W3 用 `createConfiguredPublicGoalRecommendationsRuntime({ now: () => 同一时间的 Date }).recommend({ accountId: actor.id })`。两条顶层读取可并行，各自保留失败边界。时间是分类/展示取样时刻，不是数据库事务 snapshot，也不是客户端接受结果的排序凭据。

`refreshHomeDashboardAction()` 建议 **无客户端参数**：

0. 默认 composition 先用既有 `resolveFeatureMode` 确认模式严格为 live，再用 `resolveLiveDatabaseConnectionConfig` 确认可用 configured DB 及非空 workspace。mock/hybrid/无配置/异常立即 unavailable，零 auth/resolver/业务 reader；不新增 mock 白名单。
1. 配置门通过后每次调用 `auth()`；无会话返回 unauthenticated，零业务 reader。
2. 使用本次 session 的 userId/email/name 调用 `resolveAuthenticatedApiActorFromSession`；返回 null/异常为不可用，零四源/推荐 reader。不静默退 rawSubject，不把 membership 缺失说成成功空集。
3. 验证 resolver.id 非空；accountId 如存在必须非空且与 id 严格一致；workspaceId 必须非空且与本次 config.workspaceId 严格一致。失败 unavailable 且零业务 factory/reader。禁止把 resolver 在 mock/no-graph 路径构造的 rawSubject actor 或 workspace:mock-auth 包装成真实 snapshot。不改共享 resolver，不自行 trim/case-fold 身份。仅将通过这些条件的 canonical actor 交给聚合。客户端即使伪传 accountId/workspace/generation，也不参与授权或选择数据。
4. 只返回上面的安全投影，不返回 session、cookies、SQL、异常细节或原始 payload。

普通 reader 故障由各源状态表示，不让一个源拖垮其余源。无法构造可信 envelope 等顶层异常返回 unavailable。action 不调旧 home/chat loader、不发消息、不生成分析、不调用模型、不做 `router.refresh`/`revalidatePath`，不制造账户级或跨请求缓存。Next action 的框架安全边界不能替代每次重新鉴权。

## Dashboard 入口：不能把 URL 候选当成实际可见

已核对的 0385ffba 旧源：`page.tsx` 先 auth/resolver，随后无条件 chat loader＋oldhome，再 compose entry；`orbit-real-agent.tsx:3581` 是 `inChat = chatOpen || messages.length > 0 || thinking`，`:3624` 起先选 chat，再 `home ? dashboard : welcome`。这证明只看“没有 session 参数”不足以决定实际显示；异步会话加载、用户新对话、发送 pending 都可能改变分支。该旧实现没有 W4 最终 owner gate，不能直接照抄其行号作新实现条件。

最终业务 predicate 必须是 **W4 既有 gate 已接受当前 owner/entry generation，且 W4 实际 workspace 分支为 dashboard**。没有新 owner/draft gate，也不凭客户端自己声明 accountId 解锁。

- session/id 定位或聊天模式的入口、会话恢复中、owner 未确认、entry loading/failure：不发起新聚合，不显示旧 snapshot，不用空 session/messages 推断“已确认首页”。具体参数别名与 route-state 枚举以 W4 冻结接口为准，不在另一 helper 复制一套 URL 解释器。
- 新对话空态仍是 chat，不读 dashboard；thinking/发送中不因 messages 暂空误触发。
- 返回实际 dashboard 且 owner/entry 已接受：已有本 generation 的 accepted snapshot 则复用；没有则仅启动一次初读，复用同一窄 action。重新进入同一 generation 不暗自全量刷新；显式刷新才再次读取。
- `home === null` 不应阻断新四源本身的资格，也不能丢掉 W4 的 prefill/brief 可见性；如何落入 dashboard/welcome 以 W4 冻结分支为准，不用 W5 数据加载失败改变其会话模式。

**初读的保守实施默认：** 在不能用 W4 冻结契约证明 server 入口就是最终 dashboard 前，page 的新 initial snapshot 为 null/deferred，直到上述客户端实际 gate 成立才调用 action。因此 chat 打开不额外付 `9+R`，且不会在确认 owner 前闪现旧数据。代价是首次 dashboard 多一次 action 往返和该次 auth，必须计入成本，不冒称免费 SSR。

如 W4 冻结后已有可重用、同时覆盖 server/client 的 entry 判定与 generation 标记，才可在 page 的确定 dashboard 分支直接调用同一个 service、携带 initial snapshot；不再调用一次 action 初读。仅 URL 候选不能启用这条优化。B 批冻结复核决定使用哪条既有接口；A 批不实现入口判定，所以无需因该选择返工。

## 双通道 snapshot、过期响应与草稿

初始 props 和 action 是两个数据入口，但只有 **W4 当前 owner/entry generation 接受的数据** 能展示；不要直接 render 未确认的 props。下面的 generation 是 W4 既有生命周期概念，不是新 identity token 系统。

1. 发 action 时捕获 W4 当前 owner、generation 与本次请求序号；序号只排除同一代请求乱序，不作身份凭据，不发送给服务端用于鉴权。
2. 接收时先走 W4 gate：当前 owner/generation 仍匹配、服务端 snapshot owner 与 W4 已接受 canonical owner 匹配、请求仍是该代最新请求，才能替换数据。任何一项不成立则丢弃，既不改数据，也不清草稿/报旧错误。
3. A→B、A→B→A、同 actor 新 generation、卸载/重开后旧请求都必须丢弃；仅比 accountId 不足。旧 initial props 也不能覆盖本代已经接受的新 action snapshot。若 props 没有可证明的 W4 birth generation，不跨代重收；保持 deferred 并重新读取。
4. owner 尚未确认/已切换时同步隐藏之前 snapshot；不能等 effect 清空后才防泄漏。W4 gate 隐藏/卸载所需 UI 时仍保留它原有 draft 规则。
5. 同 owner＋同 generation 手工刷新进行中：保留上一份 **已经接受** 的 snapshot，可标记“正在刷新待办、日程、跟进、约谈与推荐”；刷新按钮 pending 时禁重入，聊天/草稿不重挂载。
6. 当前请求成功返回新 envelope 后整体替换新聚合数据；其中某源 unavailable 就显示 unavailable/count null，不能拿该源旧成功数据冒充本次成功。若整次 action 网络/顶层失败，可保留旧 accepted snapshot，但明确“刷新失败，以下仍为上次读取”，保留原 snapshotAt；不得把它标成最新。无旧 snapshot 则显示首次加载失败与手工重试。
7. unauthenticated 结果隐藏私有聚合数据并沿用既有登录失效处理；不自行销毁/提交 brief。identity 变化仍由 W4 处理。

W4 C3 已批准的可选 `briefText`/`onBriefTextChange`、父 accepted/revision 清稿、uncontrolled 兼容全部沿用。W5 不再次提升草稿、不新增存储、不在数据刷新/失败/推荐变化时清稿，不改变 ask 的接受条件、发消息顺序或 sessionId。最终同 actor generation 的实际 token、props 接收点、请求失效 hook 名称仍需 W4 冻结后以源码确认；不能在本稿虚构这些现存符号。

## 展示事实、失败与语言

| 来源/结果 | 展示与禁止事项 |
| --- | --- |
| facts ready | 来源、真实 count、合计最多三项及既有 operation href；不能将展示截断称数据库上限 |
| facts empty | 该源成功读取后的真实零；与 unavailable 明确分开 |
| facts unavailable | count=null，说明该源不可用；appointmenterror 不再显示 0，其他源照常可用 |
| 推荐 success | 只显示 W3 返回的真实 public catalogue 候选；不是 owned/registered 活动列表 |
| 推荐 needs_goal | 引导既有目标编辑入口；不把未设目标说成推荐故障或“没有活动” |
| 推荐 no_match | 成功完成必要校验后的无匹配；不是配置失败 |
| 推荐 unavailable | 推荐来源不可用；不退旧旅程、mock、owned/registered，也不拿 [] 当排除成功 |

四源不合并成一个可重复计数的“全部事项总数”。普通 tasks 分组、followup current/history/orphan、personal starts-in-window、appointments confirmed/reschedule_pending 全部消费现有 VM，不重新推导事实。约谈使用已确认 startsAtUtc，不用旧 startAt 假设；仅当前 actor 可见联系人字段。删除旧 dashboard 的 `/api/appointments` effect，避免二次读取/字段与失败语义分叉。

已结束活动只能显示已结束及有证据的事实；结束状态不证明“报告未生成”，删除这个推断，不补新报告读取。保留区旧 home 原始数据另有其来源/时间，**不能**套用新 snapshotAt，也不能出现“整个首页已同步”。

刷新按钮/帮助文案明确：“刷新待办、日程、跟进、约谈与推荐”；说明“其他首页信息保持原读取结果”。七日窗口来自 `ORBIT_DISPLAY_TIME_ZONE`；午夜不自动读、不自动改事实状态，下一次显式刷新重取时间与窗口。过期提示若需要，只能描述该 snapshot，不暗中触发轮询。

继续从 `useOrbitLanguage()` 消费 language/t/preserveHref，经既有 props 传 dashboard。chrome 使用现有 `t({zh,en,ja?})` 机制，不新增 Provider、全局字典或另一翻译运行时；按 source/group/state key 显示本地文案，业务标题、姓名、推荐匹配词和用户 brief 保持 literal。时间格式化指定产品 timezone，不另造浏览器/用户/东京优先级。既有 VM 中文标签不应被当作业务原文直接锁死英文/日文界面，也不修改冻结 VM 来处理翻译。

## 成本：9+R 的组成、额外项与不能共享的读取

`9+R` 是 configured PG 的新聚合完整成功路径逻辑读取数，**已经含推荐**，不是四源后再加一次推荐，也不含 auth/旧 home/chat。失败/无目标/空候选会短路。连接建立、adapter 内部开销、CPU/扫描/行数不由这个数字界定。

| 新聚合部分 | 逻辑读数 | 真实范围 |
| --- | --- | --- |
| 普通 tasks | 1 | actor tasks list，JS 分类；不是 top3 SQL LIMIT |
| F followups | 1 | 单 statement T/A/C/H；actor 全历史任务及完整授权连接范围，非 CPU 常量 |
| personal | 1+R | actor authority collection＋R 个未取消重复系列的例外读取；仅展开窗口收窄，非日期 SQL 下推 |
| appointments | 1 | actor owner/invitee 全量列表，JS 按确认时间窗口过滤 |
| W3 goal/profile（P） | 2 | account/profile 两条 SQL；P 减投影/返回范围，不是 queries=1 |
| W3 public catalogue | 2 | Event Core workspace 列表一次＋非空 public event IDs 的 canonical summary 批读一次；完整快照而非 owned 列表 |
| W3 canonical membership | 1 | 对候选 ID 批量读取 canonical account membership；候选为空不调用 |
| 合计 | 9+R | facts=4+R，推荐完整路径=5 |

推荐 goal 缺失时只读 profile 2；无公开/有效候选时跳过 membership，空 ID summary 也可短路。不能为了减成本先截 top3 再排已报名/评分，也不把 Promise.all/memo 当查询数下降。

**额外成本单列：**

- 每次 action `auth()`：Auth.js/session 策略的实际 I/O，不在 9+R 内，本稿未测其总 SQL；不得宣称为零。
- canonical resolver：`readAccountSessionGraph({userId})` 在有 subject 分支先查 payloadId，必要时再查 payloadAccountId，再对 distinct accountId 读 accounts；逻辑为 `1 + fallback(0或1) + K`，K 是解析出的 distinct accountId 数，不假设恒为1。复用同一次已解析 actor 供所有新源，绝不分别再 auth 五遍。
- 延迟初读：原 page 已做一次 auth/resolver，action 再做一次，这是安全换来的真实成本；确定 server dashboard 的初读才可直接复用 page 已鉴权 actor、不再 action 重读。
- 旧 home：events route（listEvents、eventValues.listRecommendedEvents、attendee/readiness）、contacts route、profile route（getProfile＋suggestion queue）、rawSubject participant journey；page 还读 event canonical ID mapping 与 registration states。这些并未由 W5 删除或优化，另计实际各 provider 路径，不能给一个未经实测的总常数。其 profile 与新推荐 goal 的两 SQL、其 Event Core/registration 与新 catalogue/membership 存在潜在重复，但语义/身份/完整性不同，不直接共享结果。
- chat loader/历史加载照 W4 生命周期另计。普通 chat 打开不得增加新 `9+R`；手工窄刷新不得触发 chat loader 或旧 home 重读。

同一次服务端调用可共享已经解析的 canonical actor、同一 snapshot 时间，以及同一聚合 promise 给本次多个消费者；只避免意外重复调用，不宣称 provider 查询优化。现旧 home 没有可直接注入的新 W3 完整 catalogue/membership promise 契约，本文白名单也不改旧 mapper，因此不声称已消除旧 home 重复。旧 owned/registered events、profile route payload、rawSubject journey 不能替代 explicit-live goal＋完整 publicCatalogue＋canonical membership。跨请求缓存/新索引/通用 reader 改造另案。

成本证据门：未来 B 批在固定主版本记录 page/chat/dashboard/refresh 各调用栈；分列 auth、旧 home、chat、新 facts、推荐的 SQL/返回行/JSON bytes/耗时。F 现有 10/100/1000 foreign/完整 actor 关联 fixture 通过不等于全部首页受控；保留 RowsRemoved×Loops、冷/ANALYZE 及 1+R 展开成本边界。不得复用已停止 PG 或访问云库来补本次文档。

## raw/account 与 fail-open 风险的精确处置

0385ffba 的 `canonical-participant-event-journeys.ts:32–102` 明确把 rawSubject 用于 listCanonicalRegistrationsForUser；configured reader 不存在时便利函数直接返回 []。这确有“未配置被看作无旅程”的风险，但本次核对不能泛化为所有 query throw 都被该文件吞掉：其 reader 方法没有 catch，实际抛错沿旧 home 调用链处理。

新推荐 runtime `public-goal-recommendations-runtime.ts:13–45` 使用 `createProfileService("live")`、完整 public catalogue、accountId 批量 canonical membership；runtime 缺失抛错，由推荐 service 转 unavailable。catalogue 的 summary reader 缺 repository 可返回 []，但非空 catalogue 在 `itemsFor` 对每个 event 强制 summary 完整，缺项会失败，不能省略这层校验。

所以只复用已验收 W3 runtime，不以旧旅程 [] 排除已报名活动。旧 home 的 raw/account 分离与 registration userId 路径留作已记录独立风险，不偷偷扩成旅程修复；新推荐卡片不用旧 home registrationAvailability 覆盖 W3 判断。

## 源码索引与尚缺证据

以下行号用于固定版本定位，不保证未来 W4 合入后不变：

- 46e8 `app/(app)/app/agent/home-facts-route-service.ts:179`（契约）、`:374`（产品日窗口）、`:684`（F 显式 reader）、`:952`（四源聚合）；`home-facts-view-model.ts:190`（纯 VM 转换）。F 语义以 [FOLLOWUP-READ-DESIGN.md](FOLLOWUP-READ-DESIGN.md) 为准，覆盖 [HOME-FACTS.md](HOME-FACTS.md) 早期 followup 无 reader 示例。
- 0385 `app/api/_shared/authenticated-actor.ts:18–134`：canonical id 与 auth/resolver；`features/account/storage/account-live-record-provider.ts:149–179`：实际 resolver 读数。
- 0385 `features/events/public-goal-recommendations-runtime.ts:13–45`；`public-goal-recommendations.ts:6–10,317–414`：四态、strict identity、完整校验/排除后排序截三。
- 0385 `features/events/core/public-catalogue.ts:264–283,322–348`；`core/service.ts:129–138`；`core/storage/postgres-repository.ts:129`；`event-operations/storage/postgres-repository.ts:1740`；`event-operations/storage/canonical-registration-repository.ts:957`：catalogue 与两类批量读取。
- 0385 `features/profile/storage/profile-live-record-provider.ts:358–383`：P 外层 reader 与 mutation 内原 store 隔离；不为聚合改写事务。
- 0385 `app/(app)/app/agent/page.tsx:105–220`、`orbit-real-agent.tsx:3581,3624–3665`：旧读链/旧 view 分支，仅作现状证据，非 W4 freeze 证明。
- 0385 `app/(app)/app/home/compose-app-home-from-previously-approved-mock-first-capabilities/home-route-view-model.tsx:244–260`、`features/events/canonical-participant-event-journeys.ts:32–102`：旧聚合与身份风险。
- 0385 `app/(app)/app/orbit-language-context.tsx:8–15,48–84`：唯一 Provider/t 与语言 fallback。

未补齐：W4 最终 gate/token/entry branch 的精确类型和三 UI 冻结 SHA；整页包含 auth/旧 home 的实测成本；实际渲染的布局/交互证据。缺这些只阻塞 B 适配和整体首页验收，不阻塞已批准的 A 纯服务端实施。本文没有据旧 UI 做视觉审美结论。

## TDD、验收与退出标准

A 批（已批准）：

- 先 RED 后 GREEN：缺新 service/action；默认 mock/hybrid/缺配置/空 workspace 在 auth 前 unavailable；合法 live/config 后 auth 空/throw、resolver null/throw 时零业务 factory；id/accountId 不一致、workspace 缺失或不等于本次配置均零业务读取；伪客户端身份不改变 canonical scope；每次 action 重新 auth；正确 workspace/account 标签，无原始 session/payload 泄漏。
- 四源三态与推荐四态组合；单源失败其余可用、无目标短路、membership/catalogue failure 不转 no_match；同一服务端时间、既有窗口/每源三项语义不改；顶层异常明确 unavailable。
- 断言一次 facts 调用＋一次 W3 recommend，不调用 oldhome/chat/旧旅程/API appointments，不发消息、模型、网络；纯函数测试用 memory/injection。默认 composition 绑定到现有 exports，不以 mock 路径代替运行时绑定证据。
- 类型检查、序列化检查、精确文件 diff 与实施前 fresh impact/UNKNOWN 补证；HIGH/CRITICAL 先报告；获准提交前完整 raw detect。A 验收只称未接线 server foundation，不称 UI 完成。

B 批（W4 冻结＋释放＋主另批后）：

- 用最终真实 page/realagent 分支做入口矩阵：dashboard、session/id、chat/newchat、loading/failure、owner unknown、home null＋prefill、历史恢复/发送中。chat/unknown 新聚合零调用；确定 dashboard 一次，SSR 初始数据与延迟 action 不双读。
- 初始 props→action、两个 action 乱序、A→B→A、同 actor 新 generation、卸载后返回、旧 props 晚到全部覆盖；未确认 owner 同步不显示旧 snapshot，拒绝响应不得清 brief。
- 刷新中保旧 accepted 数据；局部 source failure 不假零；顶层失败保旧时间并显式 stale；unauthenticated 隐藏私有数据。点击刷新不重挂载 chat loader、不改 active session、history、pending send/retry、brief revision；W4 accepted/rejected 发送语义不退化。
- 删除重复 appointments fetch；不再出现无证据“报告未生成”；旧 home 保留区不重读、不更新成新 snapshot 时间；文案明确刷新范围。语言切换仍走既有 Provider，literal 内容/草稿保持。
- Tokyo/LA、产品午夜前后、纯日期与 starts-in-window 边界；无 interval/focus/午夜自动刷新；显式刷新才重算。推荐账户与 profile/raw subject 故意不同的 fixture；旧 journey unavailable 不得进入推荐排除链。
- 主另批 UI 运行后才截图验证：现布局内 source/failure 空态可辨、长文字/窄屏、键盘与按钮 pending、旧 snapshot 时间/范围文案、brief 在 mask/刷新前后不丢。当前不启动服务器占端口。
- 目标回归、full types、默认链路/cost 证据、完整 raw detect/盲区说明齐备；只改批准白名单，三 UI 以主释放的冻结版本为基线。无部署、App/API/shared 变化不能写成跨端业务闭环。

## 是否能让纯服务端先行

**A 已正式批准先行，只限新树四路径；B 未获编码授权。** 其稳定契约只依赖可信 canonical actor、统一时间、已验收 facts/W3 与无参 re-auth action，不依赖 W4 state/hook/token 名称；因此无需等待 W4 才做服务端聚合和测试，也无需为了 W4 gate 改 reader 或授权接口。

不能承诺所有未来接线零返工：若现在把 generation token/URL classifier/brief 状态塞入 action 或硬编码 props owner gate，必然耦合尚未冻结接口。因此明确不做这些；B 只在 UI adapter 使用 W4 已有 token/判定并处理请求序号。A 三文件＋本文按批准实施，B 三 UI＋入口/刷新测试仍须单独审批；A 完成不自动获得 B 写权。A 的真实 RED→GREEN 与 default binding 已在下方追加；types/raw/detect 由 controller 独立复核，不提前宣称整体验收通过。

## A 实跑交接

- 本批只改四条批准路径：`app/(app)/app/agent/home-dashboard-route-service.ts`、`app/(app)/app/agent/home-dashboard-actions.ts`、`tests/pages/app-agent-home-dashboard-entry.test.ts` 与本文；基线为 `af9784f41a329d134778d5a0386ad5f31833b920`。
- controller 提供的 CLI header `/tmp/orbit-w5-a-20260918.1jFciw/luna-run.log` 已核实本 session 使用 `gpt-5.6-luna`、reasoning effort `max`、session `01a0af7e-7221-7f03-852b-756c85c95b4f`，cwd 为本树；不是模型或 session 的猜测。
- TDD RED：新模块尚不存在时 runner 以 `MODULE_NOT_FOUND` 失败，证据 `/tmp/orbit-w5-a-20260918.1jFciw/luna-red.log`。GREEN：clean-env runner `luna-green-3` 为 `11/11`、`0 fail`、`0 skip`，证据 `/tmp/orbit-w5-a-20260918.1jFciw/luna-green-3.log`。
- action auth 门已按 `resolveFeatureMode() === live` → `resolveLiveDatabaseConnectionConfig()` 的有效 connection/workspace → 每次 `auth()` → `resolveAuthenticatedApiActorFromSession()` → canonical `id/accountId/workspaceId` 严格一致性执行；门失败时不创建或调用业务 reader。action 无客户端参数，未接 UI。
- 本 worker 初轮未运行 fulltypes；随后已在本树 clean environment 完成 `npm run typecheck`。全程未启动 UI/PG、未访问云或生产、未调用业务模型/OCR/worker；controller 仍负责独立 Tokyo/LA、raw/detect 与最终 review。以上 unit/typecheck 仅证明 A 的 server foundation，不代表 UI 或整体首页已完成。

### A review follow-up（本轮实际实现与证据）

- `home-dashboard-actions.ts` 现为模块级 `"use server"`，运行时只导出无参数 async `refreshHomeDashboardAction`；类型导出在运行时不产生额外 export。action 仍先过既有 live mode/config 门，再逐次 auth、canonical resolver 与服务端聚合；客户端参数不参与 scope。canonical actor 的 `accountId` 按实际属性读取严格校验（继承属性也不能冲突，缺省/undefined 保持 resolver 兼容），不 trim 或大小写折叠身份。
- `home-dashboard-route-service.ts` 的 `copyFollowups` 以 `HomeFactsViewModel["followups"]` 为边界；输入 actor/account 不合法或 snapshot 时间非法时，在读取前失败，facts 与推荐工厂均不启动；`routeFacts.snapshotAt` 漂移则是在两条读取完成后校验并顶层失败。推荐工厂同步 throw/reject 只使推荐 unavailable，不拖垮 facts；四源 ready/empty/unavailable 仍独立保留。
- 本轮新增并验证了聚合层注入 `factsLoader` 的两类防御语义：同步 throw 与异步 reject 都只把四源置为 unavailable/count=null，同时保留推荐结果；两条 Promise 分支均会启动。异常 fallback 复用一次带 `taskService:null`、`personalScheduleService:null`、`appointmentService:null`、`followupLoader:null` 的既有 `loadHomeFacts`，仅生成四源 unavailable/window，不重试 reader、不新增 SQL。默认 F reader 自身仍保持四源各自隔离；本轮两个异常 case 是可信注入 loader 的边界，不是默认 F 故障的新结论。fallback 之外的 snapshot 漂移、非法时间或 actor 仍按数据契约错误顶层失败处理，成本 `9+R` 不变。
- 新增入口测试包含真实 `resolveAuthenticatedApiActorIdentity` 的 mock/no-graph 与 live/no-graph 对照，以及独立子进程中的真实 action → canonical resolver → 新聚合 → F/VM → W3 runtime/service 默认链。子进程只在叶 provider/auth 边界放置内存 stub，不依赖临时 artifact 路径、不连 PG；默认、缺配置、无会话、图谱无效、伪 scope、局部 appointment failure 与统一 snapshot 时间均有断言。默认链计数为 `auth=4, graph=3, tasks=2, personal=2, followups=2, appointments=2, profile=2, catalogue=2`，这不是生产 I/O 或 UI 验收。
- 本轮 action-contract RED：`/tmp/orbit-w5-a-20260918.1jFciw/luna-review-red.log`（exit 1，缺模块 directive）；补充 review RED 证据保留于 `luna-review-red-2.log`、`luna-review-red-3.log`、`luna-review-red-4.log`。最终 clean-env GREEN 命令为：

  `env -i PATH=/opt/homebrew/bin:/usr/bin:/bin:/Users/li/.npm-global/bin TZ=Asia/Tokyo NODE_OPTIONS=--require=/tmp/orbit-w5-a-20260918.1jFciw/no-fetch.cjs node /tmp/orbit-w5-a-20260918.1jFciw/run-check.mjs luna-review-green node --import tsx --test tests/pages/app-agent-home-dashboard-entry.test.ts`

  结果为 `17/17 pass, 0 fail, 0 skip`，日志 `/tmp/orbit-w5-a-20260918.1jFciw/luna-review-green.log`；测试侧类型注解调整后以同一命令复跑的最终日志为 `/tmp/orbit-w5-a-20260918.1jFciw/luna-review-green-2.log`，同样 `17/17 pass, 0 fail, 0 skip`。同一 clean environment 下 `npm run typecheck`（`tsc --noEmit --incremental false`）为 0 errors；这只代表本树类型检查通过，不替代 controller 的 Tokyo/LA、raw/detect 与最终审查。
- facts failure 的 TDD RED 命令沿用同一 clean-env runner，label 为 `luna-facts-red`，日志 `/tmp/orbit-w5-a-20260918.1jFciw/luna-facts-red.log`，`20` 项中 `17` pass、`3` fail（两个 loader 异常 case 与 fallback leaf tripwire）；实现后 label `luna-facts-green`，日志 `/tmp/orbit-w5-a-20260918.1jFciw/luna-facts-green.log`，结果 `20/20 pass, 0 fail, 0 skip`。controller 提供的 `default-chain-first.log` 仍是默认 provider-fixture 链路证据，不能与本轮注入异常 case 混称。
- 最终 entry proof 使用同一 clean-env、禁 fetch 命令，label `luna-final-proof`，日志 `/tmp/orbit-w5-a-20260918.1jFciw/luna-final-proof.log`，结果 `20/20 pass, 0 fail, 0 skip`；本次未重跑 PG、图谱或 UI。
- controller 提供的只读图谱前置摘要对应 baseline `af9784f41a329d134778d5a0386ad5f31833b920`，记录 `112405 nodes / 254410 edges / 862 flows`；全局 builder 仍有 `cap32/859 跨语言未链/entry9746/callee8731/walk62/depth5` 限制。resolver、mode、config 的 fresh impact 为 CRITICAL 只读依赖；本批新符号初始 UNKNOWN，已由本树源码确认不存在旧消费者。controller 负责最后 force/index/detect/commit，本 worker 未重建图谱、未提交。
- A 仍是未接 UI 的纯服务端 foundation。未启动 Next/UI/HTTP/PG，未访问云或生产，未调用业务模型/OCR/worker；不能据此声明首页 UI、旧 home/chat/旅程行为或生产部署已修复。B 的 owner/draft/generation gate 与 UI 接线仍需另批批准。

### Controller 独立验证（冻结前）

- 固定 `af9784f41a329d134778d5a0386ad5f31833b920`，不搬入主后续 `410be5d9`，只新增本批四路径；原 F 树及其文档不动。原 Luna session 继续为 `01a0af7e-7221-7f03-852b-756c85c95b4f`，实际 CLI model `gpt-5.6-luna` / `max`，cwd `/Users/li/work/orbit-web-home-dashboard-20260918/repos/orbits`。
- 独立依赖安装为 `npm ci --offline --ignore-scripts --no-audit --no-fund`，exit 0；锁文件不改。测试使用 `env -i PATH=/opt/homebrew/bin:/usr/bin:/bin TZ=<zone> NODE_OPTIONS=--require=/tmp/orbit-w5-a-20260918.1jFciw/no-fetch.cjs`，未读取 `.env`，fetch 调用直接拒绝。
- `node --import tsx --test` 精确目标：`tests/pages/app-agent-home-dashboard-entry.test.ts`、`app-home-facts-followup-reader.test.ts`、`app-home-facts-route-service.test.ts`、`app-home-facts-view-model.test.ts`、`web-tasks-relationship-lifecycle.test.tsx`（后四同在 `tests/pages/`）；`tests/services/public-goal-recommendations.test.ts`、`public-goal-recommendations-runtime.test.ts`；`tests/storage/profile-actor-postgres-reader.test.ts`；`tests/api/authenticated-actor-context.test.ts`。`Asia/Tokyo` 与 `America/Los_Angeles` 各 **102/102 pass、0 fail、0 skip**，日志 `/tmp/orbit-w5-a-20260918.1jFciw/final-tokyo.log`、`final-la.log`。这是目标回归，不冒称全 suite；默认链独立子进程本身固定 Tokyo，LA 同时验证的是外层聚合及其余目标。
- 同一 clean environment 下 `node node_modules/typescript/bin/tsc --noEmit --incremental false` exit 0，日志 `types-final.log`。首轮真实 4 项类型错误保留在 `types-first.log`，不删除失败历史。
- Controller 的 `probe-facts-failure.cjs` 旧实现 RED 在 `facts-failure-red.log`；最终 `facts-failure-green.log` 为 sync/async 均独立、recommendation factory 各一次。`probe-default-chain.cjs` 最终 `default-chain-final.log` 通过真实默认导出链，叶节点内存 fixture 下 `auth=4, graph=3, tasks/personal/followups/appointments/profile/catalogue 各2`。该 fixture 的 catalogue 为空，不能声称实际执行了成功推荐的 membership SQL；W3 非空候选/批量 membership 由既有推荐目标测试覆盖。
- fallback 对照明确观察四个 factory 各1，再清零并断言实际 fallback 各0；避免仅抛错被 F 捕获而产生假绿。不新增 SQL，不重试失败 reader。`9+R` 仍只是新聚合完整成功路径的逻辑读数，auth/旧 home/chat 另计，未测本批真实 PG/整页成本。
- 未运行 Next build/HTTP action transport、UI/浏览器、真实 Auth.js cookie/数据库、PG 成本压力、云端或 App 测试；本批无 shared/API/App 改动。`"use server"`、async-only runtime export、无参边界及默认导出调用已有测试，不能据此声称 B 页面已接线或框架传输验收完成。
- GitNexus exploring/impact/CLI 用于依赖及变更审查：共享 resolver/mode/config 的 CRITICAL 依赖保持只读；新符号 UNKNOWN 以本树实际 import/调用与测试补证，不冒称零影响。最终 index/raw 报告及 SHA 随 controller 交接回执提供；FTS 不可靠与全局 builder 盲区继续保留。

# TODO（待一起处理的问题清单）

> 2026-09-18 已拆成 Sprint（docs `1e2cbe555`，均 planned）：第 1 条 → 0081，第 2 条 → 0084，第 3 条 → 0083，第 4 条 → 0085，第 5 条 → 0082。

只记录，不含方案。每条写清：现象、已定位到的位置、证据、还缺什么。

## 1. 活动画像：答完第 8 题后无法提交生成画像（2026-09-18 记录）

**现象**：报名问卷（IORBIT 自适应问答）答到第 8 题后，点"生成画像"没有结果，无法进入画像预览。

**已定位**
- 屏幕：`repos/orbit-app/src/screens/events/Registration7aViews.tsx` 第 73 行页脚。8 个字段全部覆盖后"下一题"按设计禁用（`progress.answeredCount === 8`），只剩"生成画像"；它调用 `EventRegistrationScreen.tsx` 的 `generateAdaptivePersona`（约第 379–412 行）。
- 请求：`POST /api/events/:id/registration/persona`，body `{ mode: "portrait-preview", language, responses: history[].proof }`（`src/view-models/event-registration-portrait.ts` 的 `portraitPreviewBody`）。
- 服务端返回 **422**。证据：Next dev 日志 `scratchpad/next-0069b.log` 第 31480–31600 行附近，一次真实会话在 `event_01` 上：6 次 `POST …/registration/interview 200` → `POST …/registration/persona 422` → App 随后 `GET …/registration/portrait`、`GET …/registration?portraitProofs=true`（这是客户端收到 409/422 后把会话置为 `saveState: "rejected"` 并重载来源的路径，`EventRegistrationScreen.tsx` 第 411–412 行）。
- 服务端 422 的可能出处（`app/api/events/[id]/registration/adaptive-handlers.ts` 第 179 行的 body 严格校验；`features/events/registration/portrait/answer-proofs.ts` 第 29–80 行）：
  - 答案证明数量必须在 2–8 之间；
  - `signed_question` 证明重新走 `verifyInterviewResponseSubmissions`（答案非空、字段与问题不重复）；
  - `registration`/`stored_response` 证明要求 `responseId` 存在于服务端 `profile.interviewResponses`（否则 "The stored registration response does not exist."）；
  - 字段或 responseId 重复；两道核心题缺失。
- 已排除：token 过期（交互问题 token 与画像 token 有效期都是 48 小时）。
- 值得注意：那次会话只有 6 次 interview 提交却凑齐 8 题，说明 history 里有 2 条是从报名答案预填的（`seedPortraitHistory`），persona body 混合了 `stored_response`/`registration_question` 与 `signed_question` 三种证明；预填条目的 `responseId` 与服务端存储的 id 不一致是首要怀疑点。

**还缺什么**：422 响应体里的 `portraitCode` 与 message（日志只有状态码）。复现路径：phoneweb 登录 → 任一活动报名 → 答满 8 题 → 抓 `persona` 请求的响应；或在 App 的错误文案里带出 `portraitCode`。

## 2. 资料类页面的层级混乱：标题、可点行、静态行长得一样（2026-09-18 记录）

**现象**：编辑资料页下半部分一串加粗标题（基本资料／资料完整度／我能提供／选择标签／怎么联系我／打开更多资料／查看资料建议）视觉权重相同，分不出哪些是分组标题、哪些是能点进去的入口、哪些只是字段标签；"更多资料"页同样：分组标题与每一行的字段名同为粗体，输入框看起来像静态行。用户指出这不是特例，多个页面都有。

**已定位**
- 共用组件：`repos/orbit-app/src/screens/profile/ProfilePagePrimitives.tsx`。`ProfileSection` 的 `sectionTitle`（15px／800）与 `ProfileNavRow` 的 `rowLabel`（15px／600）、`ProfileTextField` 的输入框（15px 正文、无边框、`未填写` 占位）在同一列上几乎同权重；`ProfileNavRow` 只靠右侧 chevron 区分可点；`ProfileTextField` 的 `fieldLabel`（12px／700 灰）与 `ProfileSection.detail`（12px 灰）又几乎一样。
- 使用这套 primitives 的页面：`EditProfileScreen`、`ProfileMoreScreen`、`ProfileSuggestionsScreen`、`ProfilePreviewScreen`、`ProfilePublicView`、`ProfileTagPickerScreen`（6 个）。编辑资料页里"我能提供／我想寻找"是 section 标题 + 紧接一个 `ProfileNavRow`（"选择标签"），"怎么联系我"是 section 标题 + `ProfileNavRow`（"打开更多资料"）+ `ProfileNavRow`（"查看资料建议"），所以出现"标题下面紧跟另一个同样粗的标题"的观感。
- 证据截图：`docs/todo-evidence/2026-09-18-profile-edit.png`、`docs/todo-evidence/2026-09-18-profile-more.png`（phoneweb，账号 Sync QA A，390×844）。
- 用户要求：这是一类问题，需要做一次全面的截图审核（各页面逐个截图，标出"分组标题／可点入口／字段标签／静态值"四类元素当前如何呈现），再统一处理。审核范围至少覆盖上述 6 个资料页，以及其它复用同类结构的页面（设置、账号、活动详情等）。

**还缺什么**：用用户实际账号的截图（现有截图是空资料的测试账号，信息密度更低）；其它页面的清单要靠审核得出。

## 3. 资料更新建议页有大量英文内容（2026-09-18 记录）

**现象**：`/profile/suggestions` 的建议卡片里出现英文的建议值、理由和证据摘录。

**已定位**（用演示账号 `account_orbit_generated` 直接跑 live 服务复现，3 条建议）
- **服务端硬编码英文**：`repos/orbits/features/profile/live-signal-service.ts` 是规则匹配的占位实现，理由、建议值、来源标签、summary、nextAction 全是英文字面量：
  - 第 247–250 行 chat 规则：建议值 `follow-up collaborators`，理由 "Recent chat notes repeatedly frame Orbit's value around concrete follow-up decisions."，`sourceLabel: "Chat signal"`；
  - 第 287–290 行 activity 规则：建议 bio "Building sourced relationship follow-up workflows."，理由 "Recent interaction memory includes follow-up requests…"；
  - 第 329–332 行 contact 规则：建议值 `event-grounded introductions`，理由 "The strongest generated relationship graph edges cluster around operators, founders, and community introduction paths."；
  - 第 382–394、441–459 行：summary／nextAction 英文句子。
- **种子数据本身是英文**：证据摘录来自 `shared/mock/generated-relationship-fixtures.ts` 生成的 `messages`／`interactionMemories`／`evidence`（例如 "Follow up about event sponsor with Chinese business-community reach with a concrete next step."、"Discussed retail live-commerce distribution partner and follow-up message localization."）。本地库 `workspace:orbit-dev` 里 `interactionMemories` 320 条、`messages` 58 条含英文长句；`networkPeople` 的 role／location 也是英文（"Community Organizer"、"Taipei"）。
- **App 原样渲染**：`repos/orbit-app/src/screens/profile/ProfileSuggestionsScreen.tsx` 第 36–40 行把 `currentValue`、`suggestedValue`、`rationale`、`evidence[].excerpt` 用 `locale.t.literal` 直出，不经本地化；只有字段名、来源类型、状态用了 i18n key。
- 测试账号（Sync QA A）看到的是"暂无资料建议"，所以这个问题只在有生成数据的账号上可见。

**还缺什么**：确认用户看到的具体账号与条目（是否就是上述 3 条）；决定英文的处理边界——是只本地化服务端文案，还是连生成的种子对话／记忆一起换成中文。

## 4. IORBIT 读／展示／写五种实体（人脉、活动、待办、日程、笔记）——单独一个 Sprint（2026-09-18 记录）

**触发问题**：session `agent-session-mobile-3ede834e-3779-4276-b310-55de76cbd8ac`（"请根据这篇笔记整理一个待办，并明确标题和日期。"）里，模型读到了笔记（标题、正文、关联的 2 个联系人和 1 个活动），三轮对话（提问 → "就用这个时间" → "确认"）都在说"提案待你确认后才会创建"，但从未真正创建待办。

**已定位**（本地库 `orbit_agent_chat_requests` 三条请求记录）
- 三轮的 `routingDecision.intent` 都是 `data_query`（`toolFamily: notes`），`artifacts` 只有一个只读 `data_query`，`provenance.safety.liveDatabaseWriteExecuted: false`、`domainToolCallsExecuted` 第二三轮为 false；响应里没有 `taskInteraction`，也没有任何 `actionRequests`。
- 写路径其实存在：planner 输出 `plan.actionRequests`（`features/agent/natural-language-actions/contract.ts` 定义了 `followups.createTask`、`notifications.createReminder`、`followups.saveDraft`、`memory.save`、`calendar.syncEvent` 五种能力）→ `features/orbit-ai/task-interaction-service.ts` 把 `followups.createTask` 变成待办建议（`taskInteraction.state: created | suggested | needs_date_confirmation | failed`）→ App `AiConversationScreen.tsx` 对 `suggested` 的建议调 `/api/task-suggestions/:id/accept` 才写库。这条链在本次会话一次也没被触发：模型用自然语言"演"了确认流程（文本里承诺"你回一句就提交创建"），而不是产出结构化的 action request；用户的"确认"又被当成普通对话（`general_chat`／`data_query`），没有"确认上一轮提案"的状态机。
- 人脉、活动、日程、笔记四种实体目前没有任何创建能力（只有 `followups.createTask` 一种写能力，且是"建议→接受"的间接写）。
- 展示层：活动有卡片（`/app/agent` 与移动端的活动面板），人脉有 `AiContactArtifactPanel`，待办／日程／笔记没有卡片形式，只在正文里以列表或 markdown 出现。
- "建议动作"目前是不可点击的小窗（"查询我的日程""查询我的待办"），无法写入。
- 每条回复下面都渲染"AI 运行依据"面板（`AiConversationScreen.tsx` 约第 1010–1024 行，i18n `aiConversation.runBasis`／`conversationVm.runTitle`）。用户明确要求去掉。

**用户的目标定义（原话要点，作为该 Sprint 的需求）**
- IORBIT 作为商业活动管家，需要对五种实体（人脉、活动、待办、日程、笔记）具备三种能力；个人记忆与个人信息先不讨论：
  1. **读**：把这些实体作为 context 送给 AI API 理解；
  2. **展示**：在对话里以**简洁小卡片**展示；用户想看更多要点进去看详情，不在对话窗口里铺开。现在只有活动的卡片形式算好，其他三种（人脉、待办、日程／笔记）都不行；
  3. **写**：五种实体都能由 Agent 起草、经用户确认后真正创建。现有"建议动作"小窗要改造成真正可用的、可点击、可写入的创建入口。
- 去掉每条回复下方的"AI 运行依据"。
- 这是要改变 agent 行动方式的大任务，单独一个 Sprint；设计时可以不局限于单个 prompt，需要的话用 workflow 拆解（planner → 实体草稿 → 确认卡 → 写入 → 回读确认）；按实际经验判断一个 prompt 是否够用。

**还缺什么**：本条只记录，不做方案；Sprint 立项时先出设计案（含五种实体的卡片规格、确认状态机、写入接口清单）再动代码。

## 5. 首页"推荐活动"显示日英双语标题、且没有封面图（2026-09-18 记录）

**现象**：首页"推荐活动"卡片标题是"日中 AI 業務自動化 PoC ラウンドテーブル / …""AI創業者ナイト / AI Founders Night"这类日文＋英文串；活动页与活动详情是中文；活动页有封面图，首页没有。证据截图 `docs/todo-evidence/2026-09-18-home-recommended-events.png`（Simulator 首页）。

**已定位：不是语言切换错乱，是三条链路各自取标题，且中文与日英存在两个不同的存储里**
- **数据层有两套标题**：`orbit_records.events` 的 `payload.name` 是种子写死的"日文 / English"双语串（例：event_08 = `AI創業者ナイト / AI Founders Night`，event_01 = `東京インバウンド飲食店成長会 / Tokyo Inbound Restaurant Growth Forum`，没有中文）；canonical 头表 `event_ops_events.title` 才是中文（event_08 = 沉睡关系重新激活会，event_01 = 东京餐饮入境客增长会）。
- **首页**：`HomeDashboardScreen` 读 `/api/recommendations/events?limit=3` → 服务端 `features/recommendations/storage/event-value-live-record-provider.ts` 第 193 行 `title = payload.title ?? payload.name`，直接把双语 `name` 当标题；契约 `event-value-contract.ts` 只有 `title`，没有任何封面字段。App 侧 `src/view-models/home-dashboard.ts` 第 149–162 行原样用 `item.title`，封面只在响应带 `coverPath/coverUrl/imageUrl` 时才显示——所以标题双语、无图。
- **活动列表页**：`/api/events` 同样读 `payload.name`（`features/events/event-crud-and-import/providers/storage-event-provider.ts` 第 118 行），但 App 的 `src/view-models/events.ts` 第 331–398 行 `preferredChineseSegment`／`eventTitle` 会从 `ZH:` 标记或 `sourceMetadata.label` 里挑中文段；封面来自 **App 内硬编码的 id→路径表** `eventCoverById`（`events.ts` 第 401–415 行，`organizer-public.ts` 第 226 行还有一份重复），不是数据里的字段。列表页看起来"正常"是靠这两处前端补救。
- **活动详情页**：读 canonical 头（`event_ops_events.title`），天然是中文。
- 结论：首页要么改走 canonical 标题＋统一的封面来源，要么把列表页那套"挑中文段＋硬编码封面"搬过去；后者只是把补丁再复制一份。根因在种子数据把三种语言塞进一个 `name` 字段、封面没有进入数据模型。同类 `ZH:` 挑段逻辑在 App 里有 10 处副本（admin／contacts／followups／profile／platform 等 view-model），属于同一个数据问题的扩散。

**还缺什么**：确定活动标题与封面的唯一权威来源（canonical 头表 vs 源记录 `sourceMetadata`），以及封面是否要变成活动数据的字段并补进种子。

---

## 2026-09-19 全量功能与 UI 复核（phoneweb，演示账号：78 联系人／80 待办／16 活动）

25 条路由逐页截图与网络抓取，全部 HTTP 200，除下列一条外**无 console 错误**。截图在 `scratchpad/review/`（未入库）。

### 6 想修的问题（新增，按影响排序）

1. **待办页在"从未同步"时就说"暂无待办"**。首次进入 `/tasks`，浏览器镜像还在拉取（lease → manifest → 域页约需 15–25 秒），页面同时显示"正在同步最新内容…"和"暂无待办／新待办会出现在这里"，计数 0/0。同步完成后恢复正常（366 行内容）。空状态不应在没同步过时出现——这正是 0078 设计里"镜像为空且下载失败时显示错误而不是空列表"的同一类问题，只是发生在"尚未完成"而非"失败"。
2. **关系仪表盘要等 12 秒以上，并抛超时**。`/dashboard` 五个接口全部 200，但前 ~15 秒只有转圈；console 出现 `12000ms timeout exceeded`。这是复核中唯一一条 console 错误。
3. **联系人分数没有区分度**。`/contacts/list` 每行右侧的分数：78 人里 76 人是 84，2 人是 72。这个数字占据了列表最显眼的右侧位置却几乎不携带信息（来自种子数据的 `value.score`）。
4. **首页推荐活动的地点是英文**。首页显示 `Shanghai`／`Tokyo`，活动页同一批活动显示 `上海`／`东京`。与 0082 修掉的标题问题同源（两套数据源），本轮只修了标题与封面。
5. **`/followups` 与 `/contacts/dashboard` 停在"正在确认登录状态…"约 6 秒以上**才出内容。不是错误，但首屏空白时间过长。
6. **IORBIT 首页两块区域长时间停在加载态**："正在读取最近会话""正在核对下一步"。

### 已确认修好（本轮 Sprint）

- 首页推荐活动：中文标题 + 封面（0082）。
- 资料更新建议：文案全中文，英文摘录标注"来源原文"（0083）。
- 收件箱：不再有"来源已不可用"；三类通知 全部／提醒／建议／动态／历史记录 正常；设置页"通知与消息"恢复（0086）。
- 画像预览：当前主线可正常生成；失败时会带出 `portraitCode`（0081，partial）。

### 仍待批准

- 0084 页面层级设计案：https://claude.ai/artifact/RPmcSJo9GBTkucNoBPUj97
- 0085 IORBIT 实体草稿卡设计案：https://claude.ai/artifact/De2NsaKmsAe7JaSRJSvqHc

### 环境阻塞（需要你决定）

**磁盘满**：数据卷 228G 已用 195G，可用仅约 226MB（100%）。我只清了明确可再生的部分（Xcode DerivedData 1.1G、自己的日志与截图）。占用大头是 iOS 模拟器设备 24G（6 个 2.6–7.1G，只有 1 个在用），里面是你的应用数据，我没有动。磁盘满已经导致：一次工具调用因 ENOSPC 全部失败；两次全量测试从 4 分钟劣化到 31 分钟并产生约 25 条超时假失败。

**已量化的影响（同一份代码、同一台机器）**：

| 条件 | 可用磁盘 | 全量耗时 | 失败数 |
| --- | --- | --- | --- |
| 今天白天（0082／0083／0086 收口） | ~1.4G | 约 4 分钟 | 0 |
| 最后一次（无任何并行任务） | 226MB | 29.5 分钟 | 82 |

82 条失败全部是 Chromium 屏幕测试。把失败最多的 5 个文件单独重跑：309/309 全通过。逻辑测试（orbits 定向 38/38、各视图模型）始终为 0 失败。结论：这 82 条是磁盘压力导致的超时，不是代码回归；但在磁盘腾出空间之前，**全量测试的数字不可信**。

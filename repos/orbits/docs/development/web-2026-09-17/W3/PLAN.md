# W3 活动详情事实映射与报名回执设计包

日期：2026-09-17。负责人：Web W3（Astra high）。主任务：`01a0ae27-0068-7613-9f87-82aa91a836bd`。

状态：**主代理已批准实施 F；F 独立 review 后实施 R/R2**。原设计保留如下；正文中初稿的“待批准”及末尾决策问题是历史状态，已被本段批准记录取代，不再等待重复授权。实际交付以同目录 REPORT 为准。实施基线已从 `29efb4c9` 干净快进至 `161e9e6c4d1f314db90365a4d840718adfa12c70`。实际编码子代理 `w3_f_luna` 显式配置 `gpt-5.6-luna / max / fork_turns=none`，Astra 负责独立 review、真实本地产品路由验证及提交。

批准增量：两个共享 mapper 由 W3 独占；额外仅允许 `home/compose-app-home-from-previously-approved-mock-first-capabilities/home-route-view-model.tsx` 的 canonical 人数硬编码零改 null，以及 `home/orbit-real-home.tsx` 对应人数 span 在 null 时隐藏和 render 回归。首页布局、推荐、读取、CSS 不扩写。后续追加已批准公开主办方 route model 的局部 number 类型细化和 canonical mapper 的已校验人数显式投影，并批准 lifecycle 测试写后重新读取真实聚合；均已实施并独立review。主代理已确认该最小消费者范围，无需重复申请。

本地验证独占资源：PostgreSQL `127.0.0.1:55463/orbit_web_w3_20260917`，浏览器 `http://w3.localhost:4613`，Next 使用本树独立 `.next`；仅本地合成 fixture。初次使用 `127.0.0.1:4613` 有同 host cookie 的 JWT secret 冲突，改专属域名后正常登录/冷刷新；未修改认证代码或清共享 cookie。

## 1. 基线与证据边界

- 独立工作树：`/Users/li/.codex/worktrees/15e3/orbit`。
- 创建时 HEAD：`d2180ba70bcea5f3c65d26a1b589e1020e9ba1a4`，工作树干净；已通过 `git merge --ff-only` 对齐 `29efb4c9d460b97ef526578d051e824592f52555`。
- 已只读读取主代理管理的 `/Users/li/work/orbit/docs/development/2026-09-17-web/SESSION-GUIDE.md`、最新根 AGENTS、Web AGENTS、Bridge status/handoffs。没有写主目录、production-cutover 或 Bridge。
- GitNexus：本树原无索引，首次指定本树的 query 返回 repository not found；随后在本树完成 `analyze --index-only --name orbit-web-w3-15e3 --workers 4`。CLI 1.6.12，indexed commit/current commit 均为 `29efb4c`，status 显示 4446 covered files 匹配、up-to-date。后续 query/context/impact 均显式绑定本树绝对路径。
- 索引构建提示部分动态调用候选和流程被裁剪；不能把未返回的流程当不存在。源码用于复核数据口径与明显不相关的动态调用边，未以其他工作树的旧图谱背书。
- 本轮本地 4 个测试文件 **23/23 通过、0 skip**（命令见第 7 节）。使用已有 node_modules 的本树软链接，只读取依赖；没有安装升级、加载云端配置、调用模型、启动服务或执行云写入。
- 主任务提供的“测试政策为 8 席而详情显示 20”是既有运行证据。本轮只核实源码根因，未重新查询测试库，不冒称本轮线上复现。

## 2. 已有实现与剩余 ID

需求来源：根 `docs/designs/2026-09-15-product-follow-up-backlog.md` 的 P0-04、P1-24～26。

| 项目 | 已有事实 | 本轮剩余范围 |
| --- | --- | --- |
| P0-04 报名门禁 | 服务端 deadline/eligibility 已覆盖未开放、截止、结束、配置异常、重复报名、取消/重报；历史版本有运行证据 | 保持门禁，补本次版本回执和事实展示验收，不重做资格规则 |
| P0-04 已报名回读 | legacy registration 客户端检查 actor/event/record/profile/version/action，写成功后独立 GET 回读；取消有 single-flight 与迟到隔离 | 补错回执、错回读、断网、刷新与列表/详情一致性负例 |
| P0-04 问卷 | 新问卷已有 single-flight、无签名问题拒绝、scope 隔离、失败保稿、已保存报名只生成派生预览 | 本轮 10 个 workspace 测试通过；不把该证据外推为全部浏览器/模型验收 |
| P0-04 人数 | `canonical-event-detail-view.ts:164` 将 null summary 映射成 0；`orbit-registered-event-route-view-model.ts:44,49` 又以 roster.length 覆盖人数 | W3-F1：区分真实零、未知；稳定采用同一总数口径 |
| 活动详情事实（关联 P0-04 / BR-027） | `orbit-landing-route-view-model.ts:176` 以 `Math.max(20, attendeeCount + 20)` 生成容量 | W3-F2：接真实准入政策容量；不再凭人数推导 |
| P1-24 列表 | 搜索、筛选、视图切换已有实现，不能重复当新功能 | 密度、字体、布局待另行产品审阅；本批只处理受 nullable 事实影响的展示 |
| P1-25 推荐与全部 | 全部活动可浏览；首页 owned/registered 旅程不等于个性化推荐 | 保留为后续跨域候选，由 W5 统筹首页与推荐入口 |
| P1-26 AI 价值 | 匿名页的 Feature sample 是示例，不是真实推荐理由 | 后续需真实匹配/推荐来源；不将示例计为交付 |

新增核对项 W3-R2：`event-registration-workspace.tsx:519-520,792-793` 的 admissionControlled 分支直接接受 application 响应，未走 legacy 的独立回读校验。它与“legacy 回执已有实现”必须分开报告。此处是源代码证据，不声称已发现实际跨账号写入；需另批验证后决定修复。

## 3. 数据来源与最小模型

| 页面事实 | 权威来源 / 当前路径 | 映射约束 |
| --- | --- | --- |
| 活动身份、公开性、时间、地点、标题 | Event Core `getPublishedEvent` → `PublishedCanonicalEvent` → `publishedCanonicalEventToEventDTO` | 沿用 canonical id 与访问判断，不新增存储读取旁路 |
| 当前已报名人数 | `readEventOperationsCatalogueSummary` → `listCatalogueSummaries` → canonical `event_ops_membership_heads.status='rsvped'` 聚合 | 完整 summary 的 0 是真实零；null 不是零；只计有效报名，不把 pending/waitlisted 申请算占席 |
| 容量 | `createConfiguredEventAdmissionService()?.getPolicy(canonicalEventId)` → `EventAdmissionPolicy.capacity` | 非负整数=有限容量（包括 0）；policy 存在且 capacity=null=不设上限；无 service/无 policy=未知 |
| 本人已报名与受限名单 | `readRegisteredCatalogueAttendees` / registration runtime → canonical registrations | 名单仅用于有权限的姓名显示和本人状态，不再覆盖独立总数 |
| 可否报名 | 既有 registration window、eligibility 与 admission policy 规则 | 展示的剩余席位不能替代服务端资格或成为客户端授权判断 |

`PublishedCanonicalEvent` / `EventDTO` 本身没有容量。**首批无需新增或修改共享 DTO、API schema、数据库、App 契约**；在 Web route adapter 通过现有 admission service 读取并只投影容量，不把整份政策交给 presenter。

建议最小 Web VM 变更：

1. `OrbitLandingEventView.participantCount` 与 `OrbitEventStatsView.count` 改为 `number | null`，null 明确表示未取得可验证总数。`getOrbitLandingEventView` 接收同样类型；内部 snapshot 不再 `?? 0`。已有 catalogue 提供的真实非负数保持原值。
2. `cap` 改为 `cap?: number | null`：number 是有限容量；显式 null 是政策不设上限；undefined 是容量未知。字段说明及测试固定这三种含义，不用 truthiness 判断 0。
3. 单活动 mapper 新增可选 capacity 输入，直接映射；无来源时不填 cap。列表 catalogue 不为每条活动额外读取 policy，本批不添加 N+1 查询。已知人数的列表不需要容量才能显示。
4. canonical resolver 注入窄依赖 `readAdmissionPolicy`，runtime 通过现有 service 构造；只在访问已被允许后读政策。没有配置/政策时保留未知；异常不写成 0 或“不限”。首批沿用页面既有错误边界处理实际读取异常，不加无限重试或吞错日志分支。
5. summary 存在时校验 eventId 与非负安全整数；不匹配/非法值不发布为事实。保留 null summary 的未知状态及原 workspaceAvailable。真实 0 不触发加载态。
6. registered mapper 只投影名字/登录/报名状态，保留输入 count。本轮已核实名单不是分页预览：`registered-catalogue-attendees.ts:37-49` 调用完整 canonical registrations 后仅过滤 rsvped；`canonical-registration-repository.ts:394-404,406-435,949-955` 走 inventory，以 workspace/event 限定查询、无 LIMIT/OFFSET，解析非法行则抛错，正常返回全量报名记录。健康数据下其 rsvped.length 应等于同一时点的聚合，而不是发现了“名单截断”缺陷。但 DTO 未声明完整性且两次查询时点可不同；本批建议统一人数权威，避免第二次读取覆盖第一份聚合。本轮不修改 provider、分页或存储。

列表、首页和公开主办方共享 mapper 是风险来源，不是各域均可任意改写的授权。当前 canonical public catalogue 对缺失 summary 抛错，保证成功列表快照的人数完整；公开主办方 `canonicalRows` 同样校验人数非负安全整数，再传入 mapper。**首页例外**：`home/compose-app-home-from-previously-approved-mock-first-capabilities/home-route-view-model.tsx:88` 的 canonicalEventToLandingEvent 当前直接传 `participantCount: 0`，不能称为真实零。本轮将这个 W5 消费者缺口上报，不擅自修改 home；W3 详情修复不能据此宣布“首页/详情/列表人数全部一致”。若要关闭三入口一致性，W5 需另批接真实聚合或传 null 并隐藏未知数值。若 typecheck/实际消费者需要改 home 或公开主办方，交给主代理冻结范围，不能私自扩大。

## 4. 页面行为（沿用现有布局）

| 输入事实 | 详情应呈现 | 禁止呈现 |
| --- | --- | --- |
| count=0, cap=8 | 已报名 0 / 8；窗口开放时“报名中 · 剩 8 席” | 默认 20 席、加载中 |
| count=3, cap=8 | 已报名 3 / 8；窗口开放时剩 5 席 | 从人数生成 cap=23 |
| count=null, cap=8 | “报名人数暂不可用”、容量 8；窗口开放仅“报名中” | 已报名 0、剩 8 席 |
| count=0, cap undefined | 已报名 0；不显示数值容量/剩余席位 | 将未知容量称为不限 |
| count 已知, cap=null | 已报名真实人数；“不设人数上限”或省略容量标签 | 数值剩余席位 |
| cap=0 | 明确 0 容量；剩余最多 0；报名资格以服务端为准 | 因 falsy 丢失容量事实 |
| count >= finite cap | 真实人数/容量；剩余按 max(0, cap-count) | 把人数截到容量；出现负数席位 |
| 截止/已结束/未开放/配置异常 | 沿用服务端限制文案与按钮状态 | 因剩余席位存在而开放按钮 |
| anonymous / outsider | 只展示允许公开的聚合 | 通过新增读取泄露名单、actor、申请答案 |

未知值可以用现有 InfoTile 中性文字，不添加布局、全局 CSS、推荐 Banner。列表对应三种视图均需避免 null 拼成“null 人”或空白人数；具体只加 nullable 分支，不借本批改变卡片密度。原本部分卡片少于 5 人隐藏人数是既有规则，本批不以产品选择擅自修改；矩阵中的列表一致性要求“凡显示数值则等于同源事实”，隐藏数值不能用于声称真实 0 已在列表展示。

容量和人数是独立读取快照，剩余席位仅展示估计，不保证并发提交时仍有空位。服务端现有 admission 并发门禁继续负责最终分配；本批不增加锁、跨服务事务或写入。

## 5. 建议批次与文件冻结

以下相对路径均基于 `repos/orbits`。两处共享 mapper 已获主代理预留；其余是待批准代码范围，不能自动视为已批准实施。

### F：事实映射（优先）

| 文件 | 最小改动 |
| --- | --- |
| `app/(app)/app/canonical-event-detail-view.ts` | 保留未知总数；从现有政策服务注入真实容量；校验 summary 身份/数值 |
| `app/(app)/app/orbit-landing-route-view-model.ts` | 主代理已预留；nullable 人数、三态 cap；去除容量公式和缺失人数零默认 |
| `app/(app)/app/orbit-registered-event-route-view-model.ts` | 主代理已预留；移除名单长度覆盖总数 |
| `app/(app)/app/events/[id]/orbit-real-event-detail.tsx` | InfoCard 的容量/人数/剩余分支，保持原布局及 gate |
| `app/(app)/app/events/orbit-real-explore-client.tsx` | MappedEvent.people nullable；三种列表视图仅修未知数值分支 |
| `app/(app)/app/events/compose-app-events-demo-event-1-from-previously-approved-mock-first-capabilities/event-detail-view-model-adapter.ts` | 同类无来源容量公式改为 unknown，避免旧 adapter 继续对 presenter 输送假事实 |
| `tests/pages/app-canonical-event-detail-view.test.ts` | 真实零/未知、8席/null政策/0容量、名单不覆盖、访问边界 |
| `tests/pages/app-event-detail-page.test.tsx` | 真实渲染断言覆盖所有容量/人数组合 |
| `tests/pages/app-events-view-switcher.test.ts` | 先检查现有测试结构，再增加必要未知人数渲染断言；必要时另建小型 mounted 测试，限此页面 |
| `docs/development/web-2026-09-17/W3/PLAN.md` | 更新验收与交接事实 |

`events/page.tsx` 已接收 `number | null` canonicalParticipantCount，预计无需改；若类型检查证明仍需修改，先报告精确原因。其他 fixture 仅在类型检查表明实际受影响后列出申请，不先批量迁移。

### R：回执验收（明确后批，不扩入 F）

先补测试，只有证明缺陷才改产品符号：`tests/pages/event-registration-workspace.test.tsx`、必要新增 `tests/pages/event-registration-readback.test.tsx`、既有 `tests/api/event-registration-routes.test.ts` / `tests/api/event-admission-application-route.test.ts`。

若批准 W3-R2，候选修改仅 `app/(app)/app/events/[id]/register/event-registration-workspace.tsx`：admission POST/DELETE 返回校验 actor、canonical event、applicationVersion、有效 status 后独立 GET 已有 admission/application，再校验与回执一致才更新 UI。pending_review/waitlisted 不得标为 admitted。现有 application contract 已包含 actor/event/version/status，不需要为此新增共享 DTO。版本冲突/提交期间管理员变更的回读应显示重新读取状态提示，不能用不匹配响应当同一写入的成功证明。实际实现前对嵌套函数逐个 impact。

回执批次不能顺便更改 API 授权、账号 provisioning、storage、worker、全局 profile 或云配置。

## 6. 测试矩阵与关闭标准

| 验证层 | 必须覆盖 | 成功条件 |
| --- | --- | --- |
| F mapper | null summary、合法 0、正数、错 eventId、非法 count；policy missing、service missing、cap null/0/8；summary=62 与 roster=2 | unknown 不变 0；8 不变 20；总数仍为62；无非法来源混入 |
| F presenter | 上述 count/cap 组合 × 公开匿名/已登录/已报名 × open/closed/ended | 无 null/undefined/NaN 文案；未知不计算剩余；三态与 gate 无冲突 |
| F catalog regression | 全部列表、搜索/筛选、三视图、首页 canonical journey、公开主办方 | 既有已知人数保持；不新增逐活动政策读取；不泄露名单 |
| R legacy receipt | register/cancel/reactivate；POST success但错 actor/event/record/profile/action/version；GET 失败/错版本/旧状态 | 只在回执及回读均可核对后呈现成功；失败保留答案并能重读；不重复写入 |
| R scope/race | 双击、卸载、切 event、切 actor、迟到 POST 与迟到 GET；失败再试 | 同一动作 single-flight；旧结果不跨 scope 更新或发起后续读写 |
| R admission | instant admitted、approval pending、waitlisted、rejected、withdrawn；错误主体/版本/status 与 GET 失败 | 每种申请状态真实显示；有申请不等于已入场；撤回保持原子版本前置条件 |
| 本地集成 | 新报名→GET→详情/列表；取消→刷新；重报→同记录；满额/未开放/截止/结束；人数0→1→0→1 | 当前版本、同 actor/event、同一 canonical count，重复提交不增记录；服务端拒绝可见且无假成功 |
| 实际浏览器 | Next Web 正常产品路由与冷刷新；先指定本树端口/本地专属 schema | 记录运行 SHA、页面与 API 版本、步骤、结果；不能只跑 dev 页或 source grep |
| PhoneWeb / RNW | 独立固定版本与自己的正常路由同矩阵 | 单列结果；本批未运行、不以 Web 测试替代 |
| 原生 App | 如后续共享 DTO 改动才申请 App 协调；目前只做影响说明 | 本批未运行、不声称 App verified |

测试 fixture 应使用显式政策容量8；初始 count=0、执行真实本地写入后 count=1。真实 provider 的 AI 问题验收仍需既有授权预算和主代理串行安排；本轮不请求新模型费用。

## 7. 已跑验证与拟跑命令

本轮基线实跑（工作目录本树 `repos/orbits`）：

```sh
node --test --import tsx tests/pages/app-canonical-event-detail-view.test.ts tests/pages/event-registration-workspace.test.tsx tests/pages/app-events-registration-state.test.ts tests/pages/event-admission-status-card.test.tsx
```

结果：23 tests / 23 pass / 0 fail / 0 skip。这里只证明现有断言通过；新未知人数、容量8以及新 admission 回执负例尚未编写，不以基线通过关闭 W3-F1/F2/R2。

批准后 F 增加/运行 mapper、detail、explore 测试，连同 `tests/pages/app-home-events-source.test.ts`、`tests/pages/app-home-live-route-services.test.ts`、`tests/pages/app-registered-event-lifecycle.test.ts`、`tests/pages/app-organizer-public-live-route-services.test.ts` 回归，再运行 `npm run typecheck`。首页基线 hardcoded zero 单独报告，不能靠未断言这个问题的回归绿灯掩盖。R 运行新增回执测试和既有 deadline/eligibility/admission API 测试；依赖 PostgreSQL 的用专用本地 schema，记录实际命令与环境缺项，不把 skip 当通过。浏览器和模型运行属于另层证据。

提交前使用本树最新索引完整 `detect-changes --scope all --repo /Users/li/.codex/worktrees/15e3/orbit`；partial/truncated 必须复核重跑，不能作为通过。此设计文档本身不修改代码符号，不虚构符号影响。

## 8. 风险与主代理待决定

- **HIGH 已报告**：`getOrbitLandingEventView` impact 返回 3 direct / 7 impacted，调用方为 canonical detail、home canonicalEventToLandingEvent、公开主办方 canonicalOrganizerViewModel。riskSharedAxes=LOW 不抵消 HIGH。`resolveCanonicalEventDetailView` 为 LOW，1 direct / 2 impacted，详情页流程。`eventView` context 确认另有 getOrbitLandingViewModelFromCatalogue → AppEventsPage 链路；真正实施时仍须对 eventView、类型和 presenter 符号逐个 impact。
- 若任一修改符号变成 UNKNOWN，先复核引用/动态调用，再报告，不能以空 caller 认为安全。索引裁剪限制随交接保留。
- 独立 count 与 roster 查询可能竞争；统一展示 count 权威可防 UI 内部被 roster 覆盖，但不声称它创造了数据库原子快照。
- registered helper 将“没有有效报名”和“operations runtime 不可用”都投影为 null；本轮尚未证明运行缺陷。R 的不可用回读测试应覆盖该路径，若确需把本人状态与 roster 可用性拆开，另提具体 service/DTO 范围，不擅自重构。
- 匿名主办方身份、合办文案、默认 agenda、AI 示例均可能需要后续事实审阅；本轮只冻结人数与容量，不把其它占位全部标已解决。

请主代理决定：

1. 是否批准 F 的具体代码方案与文件集合；两个共享 mapper 的预留已确认，不重复请求所有权。home/公开主办方保持只读回归；首页 hardcoded zero 由 W5 决定另批归属。
2. R2 admission 回执已按主代理要求单列后批，本批不扩。后续决定先补失败测试还是同时批准客户端加固。
3. 本地浏览器/数据库专属资源及之后串行云验收安排；未分派前继续源代码/本地无云测试，不能占用 W0 的服务或数据。

P1-24 密度候选、P1-25 推荐入口、P1-26 真实理由只作为后续产品评审议题；此设计不批准这些布局实施。W0 的存储、账号、bootstrap/dashboard、发布切换保持独占。本包完成后交主任务 review，不自动进入编码。

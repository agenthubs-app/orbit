# Events 参与者侧 屏级替换 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 `Events.dc.html` 设计稿把参与者侧做成 1:1：列表（发现/我的活动）与详情做**保真收口**（已有重建版，差在细节）、报名弹窗壳、**新建现场屏** `/app/events/[id]/live`（取代 `/app/party*`）、回顾态、五个弹窗（参会者 / 交换（含成功态） / 约谈 / 记录交流）接真实服务；删除 `/app/party*` 三路由与旧文件。主办管理页签只做入口（指向运营台计划的 `/app/events/center`）。

**Architecture:** 新目录 `app/(app)/app/events/events-0918/`。列表与详情：把已重建的 `orbit-real-explore-client.tsx` / `orbit-real-event-detail.tsx` 迁入新目录改名，再对照设计逐元素修差（不重写数据层，`explore-model.ts` 与详情 VM 不动）。现场屏：数据 = 既有 `loadAppPartyRouteViewModel` → `OrbitPartyViewModel`，写操作 = 既有 `event-operations-controls.tsx` 的 fetch 逻辑原样搬。弹窗写操作只走既有 API（契约见「数据真实性决定」）。像素规则 / `.btn` 中和 / 门槛口径 / 比对工具沿用前两份计划。

**Tech Stack:** 同前。

## Global Constraints

- 工作树 `/Users/li/work/orbit-web-newui-batch0-20260918`（`$WEB`=`repos/orbits`），分支 `newui/batch-0-shell-landing`，绝对路径；`$DESIGN` = `/Users/li/work/orbit/docs/designs/Orbit_0918/Events.dc.html`（925 行，已核对的区间：43 `<main>`（`padding:28px 40px 96px; gap:24px`）；45–138 列表（71–105 发现 / 106–137 我的活动）；141–219 详情（页签 `dIntro = intro||agenda`、`dPeople = people||intro`，不是四个互斥面板）；221–519 现场（246 现场主页 / 320 推荐给你 / 361 全部参会者 / 391 分组 / 435 关系图谱 / 478 流程议程）；521–580 回顾（**四个页签共用一个正文**）；583–650 主办管理（本计划不做）；652–672 报名弹窗；675–701 参会者；704–718 交换；721–741 交换成功；744–760 约谈；763–780 记录交流；781–783 toast；renderVals 786–925）。
- **像素级一致规则**同 Network/个人中心 计划（类前缀 `ev-*`，作用域 `[data-orbit-real-page="events-0918"] `；`.btn.ev-*` 整段中和基类 + `:active{transform:none}`；`:hover` 只写设计声明；动态色内联、内联对象禁 fontSize/fontWeight/gap 数值；选中态用修饰类；设计 mock（山本健 / Sakana AI / 128 / 92% / Tokyo Innovation Hub / Robert Chen 等）不得出现；头像首字母占位）。`orbit-reference-styles.tsx` 冻结。
- **页面接线**：成功分支包裹 div `data-orbit-real-page="events-0918"`；`/app/events` 与 `/app/events/[id]` 是**公开页**（未登录可看，现用 `PublicTopNav`）：`stats.authed ? <AccountTopNav active="events" /> : <PublicTopNav active="events" />`（`AccountTopNav` 会挂收件箱触发器并发 `/api/notifications` 等请求，未登录会 401）；`/live`、`/register` 是登录页，用 `AccountTopNav`。
- **像素门槛**：raw ≤0.02 或 归因后非数据残差 ≤0.005 且无布局线/圆角/间距/色块差异；已知共享 +2px 顶栏；设计 `<button>` 字号按渲染结果对齐。
- **比对工具（任务 0）**：`compare-0918.mjs` 的 events 表实现为「按视图的设计侧点击序列」而不是标签映射（现有 `viewLabel` 为空时走 `--design-click/--design-click2`）：`discover` = 无点击；`mine` = 点 `getByRole("button",{name:"我的活动",exact:true})`；`detail` = 点 `text=AI 产品从 0 到 1`；`live` = detail 序列后点 `text=进入活动现场`；`recap` = 点第一个 `text=回看活动`；弹窗 = 对应视图序列后再点（参会者 `text=山本健`、交换 `text=申请交换联系方式` 等，任务 5 自定）。应用侧全部走 URL（`/app/events`、`/app/events?scope=registered`、`/app/events/<id>`、`/app/events/<id>/live`、`/app/events/<id>?view=recap`），不点击。
- **验证数据（任务 0 必须先做，否则现场屏只有空态）**：本地库 `orbit_newui_events_20260922`（staging 克隆），工作树 `.env.local` 已指向它，`ORBIT_WORKSPACE_ID='workspace:orbit-small-staging-20260917'`；账号 `participant.a@orbit.example.test` / `participant.b@…` / `organizer@orbit.example.test`，密码 `OrbitDemo2026!`（本地夹具，可写进命令，不写进代码/文档）；已发布活动 `10000000-0000-4000-8000-000000000001`（公开码 `SMALL-STAGING`）。**现状**：无人报名（`event_ops_membership_heads` 0 行 → 现场 loader 返回 `EVENT_OPERATIONS_PARTICIPANT_NOT_FOUND` 边界态），活动开始时间 2026-10-01 → 交换请求「活动开始后开放」（`features/events/event-operations/service.ts:554-575`）、签到/结果未开放。任务 0 要：① 用 participant.a / participant.b 分别走 `/app/events/<id>/register` 完成报名（真实流程，顺带验证报名壳）；② 把活动时间前移到「现在 −1h ～ +3h」——**同时**改 `event_ops_configurations`（event_starts_at / check_in_opens_at / results_available_at / round_*）与 canonical `event_event_versions` 的 starts/ends（`requireCanonicalScheduleAlignment` service.ts:247-268 会校验两处一致），SQL 写在 scratchpad 脚本并在报告贴出；③ 之后 `resultsState` 仍为 `not_generated`（无匹配结果）——推荐/分组/图谱按真实空态渲染并归因为「状态」，若时间允许由 organizer 在运营台触发一次生成（现有能力）以得到 ready 态。dev server `orbits-newui`（:3100）已按此环境启动，**不要重启**；Network/个人中心 用的 QA 库备份在 scratchpad `env.local.network-profile.bak`（本计划结束后由协调者切回）。
- **真实字段速查**（实现者以文件为准）：`OrbitPartyViewModel`（`app/(app)/app/orbit-party-route-view-model.ts`）：`me{name,initial,role,seat,groupNumber,offering[],seeking[],topics[],prompts[]}`、`checkedInAt`（顶层）、`checkInAvailable`、`recommendations[]`/`attendees[]`/`tableMates[]`（`OrbitPartyPersonView`：`name,initial,title,company,industry,topics[],summary,offering,seeking,reason,score,isRecommended,seat,groupNumber,contactId,contactRequestStatus,contactRequestId,contactRequestRevision`；**没有 bio/city**）、`roundOne/roundTwo: OrbitPartyTableView|null`（`members[],tableNumber,theme,seat,myRationale,memberPrompts[],icebreakers[],rationale`；**没有 tables**）、`graph{nodes[{participantId,displayName,company}],edges[{fromParticipantId,toParticipantId,kind,label}]}|null`（节点无 kind，从 edges + `contactRequests` 推）、`agenda[{time,label{en,zh},description{en,zh}}]`（`time` 是 UTC `HH:MM` 标签，**不能**据此推导状态）、`resultsState`、`recommendationNoMatchReason`、`generationNotice`、`contactRequests[]`、`eventPhase`、`eventName`、`eventVenue`。列表 VM 的 `attendees` 恒为 `[]`（`events/page.tsx:43`）→ 卡片头像串只会走「+N 人已报名」分支。
- **数据真实性决定**：
  - 列表统计四卡：设计「本周推荐 12」无来源 → 保持现状「即将开始 N」；「本月活动 覆盖 8 个领域」→「本月社区活动」；数字真实。筛选 chip 补「已报名」。卡片：封面用真实 `orbit-event-cover`；标签行 = 活动 tags（无 → 省略）；头像串 → 只显示「+N 人已报名」（真实 registeredCount，无 → 省略）；CTA 按 `ctaFor`（进行中→进入活动现场 `/app/events/[id]/live`；已结束→回看活动 `/app/events/[id]?view=recap`；已报名→查看活动；否则→立即报名 `/app/events/[id]/register`）。我的活动时间线三节点：「报名成功」无日期来源 → 节点保留、日期显示「—」；活动开始/结束真实。
  - 详情：hero 的「修改报名信息」= 已报名时链 `/register`；`⋮` 菜单省略；「主办方后台 →」仅当当前用户是主办方时链 `/app/events/[id]/operations`，否则省略；介绍段落 = 活动描述；亮点三卡（`highlights` 固定文案）无来源 → 省略；议程 = 真实议程；参会者页签 = 详情 VM 的推荐/参会者数据源（无 → 「报名后可见」空态）；主办方 = 详情 VM 主办信息。
  - 报名：**`register/page.tsx` 的数据路径与 `EventRegistrationWorkspace`（内含 `RegistrationPortraitWorkspace` 四态机）零改动**——`event-registration-readonly-ssr.test.ts` 用夹具替换该页所有 `../` import，`app-event-registration-account-scope` 只 mock 现有模块，`app-event-registration-guide` 对页面源码做正则断言；因此弹窗壳是**客户端**包装：静态遮罩/面板/标题「报名参加」/关闭（回 `/app/events/<id>`），面板内渲染不变的 `EventRegistrationWorkspace`；**设计的底部「取消 / 提交报名」省略**（工作区有自己的提交按钮，只做样式对齐，记偏差）。
  - 现场屏六页签（元素级决定）：现场主页 = 我的卡（`me`）+ 当前轮桌（`roundOne/roundTwo` 按 `eventPhase`/时间选当前轮，无 → 空态）+ 签到（`checkInAvailable`/`checkedInAt`）+ 破冰 `icebreakers` + 「活动详情」链接；省略：「最后更新 ⟳」、「下一个交流时段 / 还有 28 分钟」倒计时、「第 2 / 4 轮」（轮次仅两轮，显示「第 N / 2 轮」当 roundTwo 存在）、分享活动、二度人脉/可能感兴趣 mini-stats、打招呼（无 API）。推荐给你 = `recommendations` + `resultsState` 四态文案（取旧 `orbit-real-party.tsx`）；省略：换一批、仅高匹配开关、四个筛选下拉、重置。全部参会者 = `attendees` + 搜索 + 热门标签（topics 频次前 10）；省略四个下拉与排序；分页 12/页（设计），仅 >12 时显示。分组 = `roundOne/roundTwo`（桌号/主题/成员/理由/提示）；省略倒计时与「下一轮预告」「查看完整分组安排」。关系图谱 = `graph` 圆形布局（R=170,cx=260,cy=210）真实节点；图例 kind→颜色（recommendation=推荐认识 `#7C4FC7`、round_one_table/round_two_topic=同组成员 `#9FA3D9`、已接受交换=已认识 `#5B8C7A`、我=`#4B4FC7`、其他 `#C9CBEA`）；右侧选中节点 = 该参会者真实字段（共同兴趣 = topics 交集）；统计三卡（已认识/推荐认识/同组成员）真实计数，「潜在机会」省略；省略 按关系/按兴趣/按行业 与缩放控件。流程议程 = `agenda`，状态推导需要**真实时刻**：任务 4 给 `agendaForOperations`（`party-route-view-model.ts:298-329`）增加 ISO `at` 字段（保留 `time` 标签），据 `at` 推 done/now/soon/later，显示用 JST 格式化；当前环节说明面板 = 当前 `description`；省略 添加到日历、现场提示（Wi-Fi mock）。
  - 交换弹窗：API `POST /api/events/{id}/operations/contact-requests` 只接 `{ expectedRevision, targetParticipantId }` → 留言 textarea 与目的 chips **省略**（记偏差），保留说明/同意文案（非必选、不发送）；「发送申请」→ POST（逻辑搬 `event-operations-controls.tsx`）。成功弹窗按真实状态：`awaiting_target_consent` → 「申请已发送，等待对方确认」；`accepted` 且 `contactId` → 「已互换名片」+ 链接 `/app/contacts/<contactId>`；设计的邮箱/LinkedIn/微信/复制按钮省略；自己的卡 = `me`。
  - 约谈弹窗：只有 `accepted` 的交换可发起（未接受 → 按钮禁用 + 提示）；`POST /api/appointments {eventContactRequestId,eventId}`（带 `idempotency-key`），再 `POST /api/appointments/{id}/commands` `propose`：`proposal.candidateTimes` **3–5 条**、`durationMinutes`(15–480)、`timezone`、`medium`（`in_person{location}` / `video{provider:"google_meet"|"other", joinUrl:null}`）、`note`、`expectedVersion`≥1（`app/api/appointments/handlers.ts:24-34`；参考实现 `orbit-appointment-negotiation.tsx:177-189`）→ 设计的「一天+一时段」改为**多选 ≥3 个时段**（少于 3 时按钮禁用并提示，记偏差）；现场→`in_person{location: eventVenue}`，线上→`video{provider:"google_meet"}`；附加说明→`note`；时长固定 30；时区 `Intl.DateTimeFormat().resolvedOptions().timeZone`。
  - 记录交流弹窗：`POST /api/encounters` 体与 `orbit-encounter-capture.tsx:33` 完全一致：`{ commitments: string[], contactId, eventId, nextStep, noteText, observedAt: ISO, privacy: "private", talked: "yes", tags: string[] }` + `idempotency-key` 头；映射 what→`noteText`，need/offer→并入 `noteText`（前缀走 `t()`），next→`nextStep`，tags→`tags`，remind→省略；`contactId` 缺失（未交换）→ 按钮禁用提示「先交换名片」。
  - 回顾态（521–580，设计四页签共用正文）：`?view=recap` 或活动已结束时渲染；正文 = 统计四卡（总参会人数 = attendees.length 真实，其余无来源 → 「—」）+ 参会者列表 + 「保持联系」（有 `contactId` → 链联系人，否则省略）+ 「探索更多活动」→ `/app/events`；省略 回看现场/完整视频、资料下载三条；页签只切换高亮，正文相同（与设计一致，不新增页签正文）；「生成总结」页签 → 显式「等 W4」空态是唯一例外（记录）。
- 路由：新增 `/app/events/[id]/live`（页面自行 `auth()` → 未登录 `redirect('/app/account/login?next=/app/events/<id>/live')`，因为 `/app/events` 不在 `ORBIT_PRIVATE_APP_PREFIXES`，无中间件重定向）；loader 目录 `party/compose-app-party-from-previously-approved-mock-first-capabilities/` **迁到** `events/[id]/live/`（`git mv`，四处测试 import 改指：`tests/pages/app-party-live-route-services.test.ts:157,196,243,300`）；loader 输入是 `{ actor, eventId, language, mode?, searchParams }`（无 `actor.id` → FORBIDDEN）。删除 `/app/party`、`/party/checkin`、`/party/graph`；`party-login-return.ts` 的 `partyLoginHref` 只认 `PARTY_RETURN_PATHS` → 一并删除，改用 live 页自己的重定向。`/app/o/[slug]` 不动；「主办管理」页签 → `/app/events/center`；运营台签到台 `event-operations-admin-workspace.tsx:515,536` 链的 `/app/party/checkin` 是主办方签到台（≠参与者现场）→ 改指 `/app/events/[id]/operations/check-in`。
- 流程同前：impact / detect-changes / typecheck 0 / ratchet 绿（button 上限现为 130、scale 48/20/227）/ 像素达标 / 提交 trailer `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` / 每任务台账行 `- **Events 任务 N 完成** \`<sha>\`：…`；永不 amend/stash。基线失败同前（含 `app-events-live-route-services` agenda clocks 1 条——任务 4 加 `at` 字段后若该用例转绿，记录）。

---

## 文件结构

**新建 `$WEB/app/(app)/app/events/events-0918/`**

| 文件 | 职责 |
| --- | --- |
| `events-shell.tsx` | 列表页头 + `EVENTS_STYLES`（全部 `ev-*`）+ toast（设计 781–783）+ 弹窗挂载点 |
| `events-model.ts` | 纯函数：状态→chip 色、`ctaFor`、议程状态推导（基于 ISO `at`）、图谱圆形布局、图例 kind 推导、热门标签、分页 |
| `events-list.tsx` | 发现活动 / 我的活动（`git mv` 自 `orbit-real-explore-client.tsx` 后修差） |
| `event-detail.tsx` | 详情 + 回顾态（`git mv` 自 `orbit-real-event-detail.tsx` 后修差） |
| `event-live.tsx` | 现场屏六页签（新建；写逻辑搬自 `party/event-operations-controls.tsx`） |
| `event-register-modal.tsx` | 报名弹窗壳（客户端；包不变的 `EventRegistrationWorkspace`） |
| `event-attendee-modal.tsx` / `event-exchange-modal.tsx` / `event-schedule-modal.tsx` / `event-note-modal.tsx` | 四个弹窗 |

**修改**：`events/page.tsx`、`events/[id]/page.tsx`（只换渲染组件与顶栏选择）、`events/[id]/register/page.tsx`（**只**把 `<EventRegistrationWorkspace …/>` 包进 `<EventRegisterModal>`，import 列表不新增 `../` 数据模块；两个夹具测试若需，把新组件名加进它们的允许列表）；新增 `events/[id]/live/page.tsx`；`party-route-view-model.ts` 迁移 + `agendaForOperations` 加 `at`。

**删除（任务 6）**：`party/`（三页 + `orbit-real-party.tsx` + `event-operations-controls.tsx` + `party-login-return.ts`；`party-date-time.ts` 若仍被引用则迁到 `events-0918/`）。

**测试改指清单**（任务 1/2 做，`git mv` 当场就会破坏 ratchet）：`tests/ui/orbit-button-ratchet.test.ts` CORE_FILES `:130` 与 EXEMPTIONS `:205-223` 里的 `orbit-real-explore-client.tsx` 条目改为新路径；16 个引用旧 explore/detail 的测试改指新文件（`app-events-source`、`app-events-explore`、`app-events-registration-state`、`app-events-live-route-services:10`、`app-demo-visual-assets`、`app-event-detail-page`、`app-event-detail-live-route-services:20,318,339`、`app-event-matchmaking`、`app-event-post-event-boundaries`、`core-product-ux-optimizations:131`、`event-journey-agenda-progress`（import `agendaProgress`）、`tests/ui/orbit-agent-context-href:54` 等，以 `grep -rln "orbit-real-explore-client\|orbit-real-event-detail" tests` 为准），断言意图不变。

---

### Task 0: 比对脚本 events 表 + 验证数据准备
- [ ] `compare-0918.mjs`：events 表 = 每视图设计侧点击序列（见全局约束），README 更新；应用侧无点击。
- [ ] 数据：participant.a / participant.b 各自登录走 `/app/events/10000000-0000-4000-8000-000000000001/register` 完成报名（playwright；记录步骤）；写 scratchpad SQL 把 `event_ops_configurations` 与 `event_event_versions` 的时间前移到「now−1h ～ now+3h」（两处一致），报告贴 SQL 与前后值；确认 `select count(*) from event_ops_membership_heads` = 2 且 `/app/events/<id>/live` 对 participant.a 不再是边界态（用旧 `/app/party?eventId=…` 页面验证可行性，因为 live 页尚未建）。
- [ ] 冒烟 discover / detail 各三张 PNG。提交 `chore(visual): compare-0918 supports Events design views`（数据步骤不进 git，只进报告与台账）。

### Task 1: 列表页保真收口（发现 / 我的活动）
- Files: `git mv events/orbit-real-explore-client.tsx events/events-0918/events-list.tsx`；Create `events-shell.tsx`、`events-model.ts`；Modify `events/page.tsx`（顶栏按登录态选择）；Test `tests/pages/app-events-list-0918.test.tsx` + 改指清单。
- [ ] 逐元素对照 45–138；「主办管理」页签 → `/app/events/center`；「创建活动」→ 现有创建入口。
- [ ] 像素 discover + mine 达标；提交 `feat(events): Orbit_0918 events list fidelity pass (discover / mine)` + 台账。

### Task 2: 详情页保真收口 + 回顾态
- Files: `git mv events/[id]/orbit-real-event-detail.tsx events/events-0918/event-detail.tsx`；Modify `events/[id]/page.tsx`；Test `tests/pages/app-event-detail-0918.test.tsx` + 改指清单。
- [ ] 对照 141–219（页签重叠语义按设计）与 521–580（回顾）；按数据决定实现。
- [ ] 像素 detail + recap 达标；提交 `feat(events): Orbit_0918 event detail fidelity pass and recap state` + 台账。

### Task 3: 报名弹窗壳
- Files: Create `event-register-modal.tsx`（客户端组件：遮罩/面板/标题/关闭，children = 工作区）；Modify `events/[id]/register/page.tsx`（最小改动：包一层）；`EVENTS_STYLES` 增加问卷控件对齐规则（作用域到工作区的既有 `data-*`/类名，不改工作区文件）。
- [ ] 报名 7 套件（`event-registration-readonly-ssr`、`app-event-registration-account-scope`、`app-event-registration-guide`、`event-registration-workspace`、`event-registration-portrait-workspace`、`event-registration-readback`（云端基线除外）、`event-registration-workspace-model`）保持绿；夹具允许列表若需加 `EventRegisterModal`，在报告写明。
- [ ] 像素：设计 `--design-click "text=立即报名"`；应用 `/app/events/<id>/register`（用尚未报名的账号 `empty@orbit.example.test`? 它未完成 onboarding → 会被门禁；改用 organizer 账号或在任务 0 只让 a/b 报名、留 organizer 看报名壳）。提交 `feat(events): registration modal shell over the unchanged registration workspace` + 台账。

### Task 4: 现场屏 `/app/events/[id]/live`
- Files: `git mv party/compose-app-party-…/ → events/[id]/live/compose-app-party-…/`（改测试 import ×4）；Create `event-live.tsx`、`events/[id]/live/page.tsx`；Modify `party-route-view-model.ts`（`agendaForOperations` 加 `at`）、`events-model.ts`；Test `tests/pages/app-event-live-0918.test.tsx`（六页签结构、四种 `resultsState` 空态、图谱布局公式与图例推导、签到按钮态、议程状态推导用 ISO `at`）；`app-party-live-route-services` / `app-party-participant-ui` 改指新路由与组件，意图不变。
- [ ] 页面鉴权与回跳自理（见路由约束）；六页签按 221–519 与数据决定；写操作搬 `event-operations-controls.tsx`。
- [ ] 像素 live 六页签达标（空态归「状态」）；提交 `feat(events): Orbit_0918 live screen replacing /app/party` + 台账。

### Task 5: 四个弹窗
- Files: 四个 modal 文件；Modify `event-live.tsx`、`event-detail.tsx`；Test 各一份（SSR 结构 + fetch mock 断言请求体与 `idempotency-key` 头；约谈断言 candidateTimes ≥3 校验）。
- [ ] 按 675–780 与数据决定实现；先读 `app/api/appointments/handlers.ts` 与 `app/api/encounters/route.ts` 的校验并在报告写映射表。
- [ ] 像素四弹窗达标；浏览器旅程（任务 0 数据已就绪）：a 对 b 发起交换 → b 接受 → a 看到「已互换名片」→ 约谈提议（3 个时段）→ 记录交流保存 → 回顾正文可见参会者。提交 `feat(events): attendee / exchange / schedule / note modals on real services` + 台账。

### Task 6: 删除旧路由与旧文件 + 回归 + 收口
- [ ] 删 `party/*`（`party-date-time.ts` 若仍被引用 → 迁 `events-0918/`）；改向清单：`features/auth/app-auth-routing.ts` 白名单删 `/app/party`；`orbit-product-href.ts:23,58-63` `partyHrefForEvent` → live（+ `tests/ui/orbit-product-href.test.ts`、`tests/pages/app-home-events-source.test.ts:47-51`）；`orbit-global-ask/orbit-ask-routes.ts:27`（+ `tests/ui/orbit-global-ask-routes.test.ts:53,69`）；`event-operations-admin-workspace.tsx:515,536` → `/operations/check-in`；`tests/ui/orbit-modal-standard.test.ts:27,51-55`（ModalShell 断言改指新弹窗）；`tests/pages/orbit-hybrid-route-view-models.test.ts:264`；`tests/audits/product-surface-manifest.test.ts:34-36`（移除 party 表面）；`tests/pages/event-operations-contact-control.test.tsx:7`；`app-party-date-time.test.ts` / `app-party-login-return.test.ts`（前者随迁移改指、后者删）；`docs/event-operations-e2e.md` 文案。`grep -rn "/app/party\|orbit-real-party\|orbit-real-explore-client\|orbit-real-event-detail" app features shared tests` 为空；`scripts/generate-full-product-functional-audit.mjs` 只改当前可达性映射（`:7458-7465`），历史证据保留。
- [ ] 回归：`tests/pages` 大组失败仅基线；ui 全绿；audits ⊆ 基线；ratchet 上限按实际下调。
- [ ] 像素终验表；台账「Events 参与者侧 屏级替换完成」（偏差清单：统计卡来源、亮点卡省略、报名壳无底部按钮、交换留言/目的省略与成功态口径、约谈多选≥3、记录交流映射、回顾资料下载/回看省略、议程 `at` 字段新增、现场省略项清单）；ROUTE-CONSOLIDATION：party 三行「已删」，live/detail/discover/register 行「已重建」；NEW-UI-DECISION ③ 标完成。
- [ ] 提交 `refactor(events): retire /app/party routes and legacy explore/detail files; record Events completion`。

---

## 后续计划

④ 运营台 7 屏（含主办管理页签落点 `/app/events/center`）→ ⑤ 认证四态弹窗 → ⑥ iOrbit chat。

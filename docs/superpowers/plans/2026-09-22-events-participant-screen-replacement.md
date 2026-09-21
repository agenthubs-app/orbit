# Events 参与者侧 屏级替换 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 `Events.dc.html` 设计稿把参与者侧做成 1:1：列表（发现/我的活动）与详情做**保真收口**（已有重建版，差在细节）、报名弹窗壳、**新建现场屏** `/app/events/[id]/live`（取代 `/app/party*`）、回顾态、六个弹窗（报名 / 参会者 / 交换 / 交换成功 / 约谈 / 记录交流）接真实服务；删除 `/app/party*` 三路由与旧文件。主办管理页签只做入口（指向运营台计划的 `/app/events/center`）。

**Architecture:** 新目录 `app/(app)/app/events/events-0918/`。列表与详情：把已重建的 `orbit-real-explore-client.tsx` / `orbit-real-event-detail.tsx` 迁入新目录改名，再对照设计逐元素修差（不重写数据层，`explore-model.ts` 与详情 VM 不动）。现场屏：数据 = 既有 `loadAppPartyRouteViewModel` → `OrbitPartyViewModel`（推荐 / 同桌 / 两轮分组 / 图谱 / 议程 / 签到 / 名片交换请求 全部真实），写操作 = 既有 `event-operations-controls.tsx` 的 fetch 逻辑原样搬。弹窗写操作只走既有 API：交换 `POST /api/events/{id}/operations/contact-requests {expectedRevision,targetParticipantId}`（无留言/目的字段 → 省略）、约谈 `POST /api/appointments {eventContactRequestId,eventId}` + `/commands`、记录交流 `POST /api/encounters {...}`。像素规则 / `.btn` 中和 / 门槛口径 / 比对工具沿用前两份计划。

**Tech Stack:** 同前（Next 16 App Router、React 19、node:test + tsx、playwright、GitNexus、`scripts/visual/compare-0918.mjs`）。

## Global Constraints

- 工作树 `/Users/li/work/orbit-web-newui-batch0-20260918`（`$WEB`=`repos/orbits`），分支 `newui/batch-0-shell-landing`，绝对路径；`$DESIGN` = `/Users/li/work/orbit/docs/designs/Orbit_0918/Events.dc.html`（925 行；结构：44–139 列表（71–105 发现 / 106–138 我的活动）、141–219 详情、221–519 现场（246 现场主页 / 320 推荐给你 / 361 全部参会者 / 391 分组 / 435 关系图谱 / 478 流程议程）、521–581 回顾、583–650 主办管理（本计划不做）、652–673 报名弹窗、675–702 参会者、704–719 交换、721–742 交换成功、744–761 约谈、763–785 记录交流；renderVals 786–925）。
- **像素级一致规则**同 Network/个人中心 计划（类前缀 `ev-*`，作用域 `[data-orbit-real-page="events-0918"] `；`.btn.ev-*` 整段中和基类 + `:active{transform:none}`；`:hover` 只写设计声明；动态色内联、内联对象禁 fontSize/fontWeight/gap 数值；选中态用修饰类；设计 mock（山本健 / Sakana AI / 128 / 92% / Tokyo Innovation Hub 等）不得出现；头像首字母占位）。`orbit-reference-styles.tsx` 冻结。
- **页面接线**：成功分支包裹 div `data-orbit-real-page="events-0918"` + `<AccountTopNav active="events" />` + 屏。根容器以设计 43 行 `<main>` 为准（实现者核对并写进样式）。
- **像素门槛**：raw ≤0.02 或 归因后非数据残差 ≤0.005 且无布局线/圆角/间距/色块差异；已知共享 +2px 顶栏；设计 `<button>` 字号按渲染结果对齐。比对：`node scripts/visual/compare-0918.mjs --design "http://localhost:3320/Orbit_0918/Events.dc.html" --design-table events --design-view <discover|mine|detail|live|recap> --app <url> --login "<账号>" --out /tmp/events-<view>`（任务 0 给脚本加 events 表：discover=不点击；mine=点「我的活动」；detail=点第一张卡；live=detail 后点「进入活动现场」（设计第 0 张卡是进行中）；recap=点「回看活动」；弹窗用 `--design-click`/`--click`）。
- **验证数据**（本计划专用，已准备）：本地库 `orbit_newui_events_20260922`（staging 克隆），工作树 `.env.local` 已指向它，`ORBIT_WORKSPACE_ID='workspace:orbit-small-staging-20260917'`；账号：参与者 `participant.a@orbit.example.test` / `participant.b@…` / 主办方 `organizer@orbit.example.test`，密码均 `OrbitDemo2026!`（本地 staging 夹具，可写进命令，不写进代码/文档）；已发布活动 `10000000-0000-4000-8000-000000000001`（公开码 `SMALL-STAGING`，即将开始）。数据稀疏（1 场活动、2 位参与者），像素归因时数据区按「数据」归类。dev server `orbits-newui`（:3100）已按此环境重启；**不要再重启**。Network/个人中心 用的 QA 库备份在 scratchpad `env.local.network-profile.bak`（本计划结束后由协调者切回）。
- **数据真实性决定**：
  - 列表统计四卡：设计「本周推荐 12」无来源 → 保持现状「即将开始 N」；「本月活动 覆盖 8 个领域」→ 描述改「本月社区活动」（现状）；数字全部真实计数。筛选 chip 补「已报名」（现状缺）。
  - 卡片：封面用真实 `orbit-event-cover`（设计渐变+文案是 mock）；标签行 = 活动 tags（VM 有则渲染，无 → 省略行）；头像串 = 前 4 位真实参会者首字（VM 无参会者 → 只显示「+N 人已报名」计数，N 为真实 registeredCount；无计数 → 省略）；CTA 文案按设计 `ctaFor`（进行中→进入活动现场 → `/app/events/[id]/live`；已结束→回看活动 → `/app/events/[id]?view=recap`；已报名→查看活动；否则→立即报名 → `/app/events/[id]/register`）。
  - 详情四页签 介绍/议程/参会者/主办方：参会者 = 已有 `orbit-event-matchmaking.tsx`/推荐数据源（D17 或 party 推荐；无 → 「报名后可见」空态）；主办方 = 详情 VM 的主办信息；「你可能感兴趣的参会者」无数据 → `ev-empty`。
  - 报名：**路由与 `RegistrationPortraitWorkspace` 逻辑零改动**（用户既定：保留 0066 逻辑，UI 换 0918）。本计划只做弹窗壳（遮罩/面板/标题/关闭/底部按钮按设计 652–673）+ 问卷控件样式对齐设计（单选卡 / 多选勾选 / 文本域声明），问题内容来自真实报名配置；设计的「身份/兴趣/目标」固定题目是 mock，不写死。
  - 现场屏六页签全部真实：现场主页 = `me`+`roundOne/roundTwo`+签到（`checkInAvailable/checkedInAt`）+ 破冰；推荐给你 = `recommendations`（`resultsState` 非 ready → 对应空态：locked/not_generated/processing/failed 各自文案取自旧 party 组件）；全部参会者 = `attendees`（搜索、标签；分页设计为 5 页 mock → 真实分页按 20/页，只在 >20 时显示）；分组 = `roundOne/roundTwo`（`tables`、`myRationale`、`memberPrompts`）；关系图谱 = `graph.nodes/edges` 按设计圆形布局公式（R=170, cx=260, cy=210）真实节点，图例 kind→颜色（recommendation=推荐认识 `#7C4FC7`、round_one_table/round_two_topic=同组成员 `#9FA3D9`、已接受交换=已认识 `#5B8C7A`、我=`#4B4FC7`、其他 `#C9CBEA`），右侧选中节点详情真实；统计四卡真实计数；流程议程 = `agenda`（状态按当前时间与 `time` 推导：done/now/soon/later）。热门标签 = 参会者 topics 频次前 10。
  - 交换弹窗：API 只接 `targetParticipantId`+`expectedRevision` → 设计的留言 textarea 与目的 chips **省略**（记偏差）；保留说明与同意文案（非必选、不发送）；按钮「发送申请」→ POST；成功后进入「交换成功」弹窗，但内容按真实状态：`awaiting_target_consent` → 「申请已发送，等待对方确认」，`accepted` 且 `contactId` → 「已互换名片」+ 链接 `/app/contacts/<contactId>`（设计里的邮箱/LinkedIn/微信 mock 不显示）。
  - 约谈弹窗：只有 `accepted` 的交换才能发起（既有约束）；`POST /api/appointments` 创建后用 `/commands` 提议时段；设计的日期/时段/形式选择器映射到提议命令的字段——实现者必须先读 `app/api/appointments/[id]/commands` 的 body 契约；映射不上的字段（如「形式」若无字段）省略并记偏差；未接受交换时按钮禁用并提示。
  - 记录交流弹窗：`POST /api/encounters` 字段映射 what→`noteText`、need/offer→并入 `noteText`（带前缀，走 `t()`）、next→`nextStep`、tags→`tags`、remind→无字段省略、`talked=true`、`contactId` = 参会者的 `contactId`（无 → 按钮禁用提示「先交换名片」）。
  - 回顾态（设计 521–581）：详情页 `?view=recap` 或活动已结束时渲染；回顾页签 = 已有 `orbit-post-event-center.tsx` 数据（真实计数：参会人数=attendees.length，其余无来源 → 「—」）；参会者 = attendees；交流记录 = encounters（`orbit-post-event-followup-capture.tsx` 的读取）；生成总结 = 显式「等 W4」空态；资料下载三条无来源 → 省略。
- 路由：新增 `/app/events/[id]/live`；删除 `/app/party`、`/app/party/checkin`、`/app/party/graph`（`features/auth/app-auth-routing.ts` 白名单、`party/party-login-return.ts` 的回跳、任何 `/app/party` 字面量改指 `/app/events/<id>/live`）；`/app/o/[slug]`（主办方公开页）不在本设计内，本计划不动；`主办管理` 页签 → `/app/events/center`。
- 流程同前：impact / detect-changes / typecheck 0 / ratchet 绿 / 像素达标 / 提交 trailer `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` / 每任务台账行 `- **Events 任务 N 完成** \`<sha>\`：…`；永不 amend/stash。基线失败同前。

---

## 文件结构

**新建 `$WEB/app/(app)/app/events/events-0918/`**

| 文件 | 职责 |
| --- | --- |
| `events-shell.tsx` | 列表页头（标题/副标/创建活动按钮/三页签）+ `EVENTS_STYLES`（全部 `ev-*`）+ toast + 弹窗挂载点 |
| `events-model.ts` | 纯函数：状态→chip 色、CTA 文案与目标、议程状态推导、图谱圆形布局、热门标签、分页 |
| `events-list.tsx` | 发现活动 / 我的活动（迁自 `orbit-real-explore-client.tsx` 后修差） |
| `event-detail.tsx` | 详情四页签 + 回顾态（迁自 `orbit-real-event-detail.tsx` 后修差；回顾区块新建） |
| `event-live.tsx` | 现场屏六页签（新建；写逻辑搬自 `party/event-operations-controls.tsx`） |
| `event-register-modal.tsx` | 报名弹窗壳（包 `RegistrationPortraitWorkspace`） |
| `event-attendee-modal.tsx` / `event-exchange-modal.tsx` / `event-schedule-modal.tsx` / `event-note-modal.tsx` | 四个弹窗（交换成功态在 exchange 内） |

**修改**：`events/page.tsx`、`events/[id]/page.tsx`、`events/[id]/register/page.tsx`（只换渲染组件）；新增 `events/[id]/live/page.tsx`（loader = `loadAppPartyRouteViewModel`）。

**删除（任务 6）**：`party/`（page ×3、`orbit-real-party.tsx`、`event-operations-controls.tsx` 逻辑搬走后）、`events/orbit-real-explore-client.tsx`、`events/[id]/orbit-real-event-detail.tsx`（迁移即删）。

---

### Task 0: 比对脚本 events 表 + 环境确认
- [ ] `compare-0918.mjs` 增加 events 表（discover 无点击；mine=`getByRole("button",{name:"我的活动",exact:true})`；detail=点第一张卡（`.ev-card` 设计侧用 `text=AI 产品从 0 到 1`）；live=detail 后点「进入活动现场」；recap=列表点「回看活动」第一处）；README 更新。
- [ ] 冒烟：discover 与 detail 各出三张 PNG（app 侧 `http://localhost:3100/app/events` 与 `/app/events/10000000-0000-4000-8000-000000000001`，`--login participant.a@orbit.example.test:OrbitDemo2026!`）。
- [ ] 提交 `chore(visual): compare-0918 supports Events design views`。

### Task 1: 列表页保真收口（发现 / 我的活动）
- Files: Create `events-0918/events-shell.tsx`、`events-model.ts`、`events-list.tsx`（`git mv orbit-real-explore-client.tsx` 后改名重构，保留 `explore-model.ts` 调用）；Modify `events/page.tsx`；Test `tests/pages/app-events-list-0918.test.tsx`（+ 既有 explore 测试改指新文件，意图不变）。
- [ ] 逐元素对照设计 44–139：头部/页签/搜索+筛选（补「已报名」）/四统计卡/卡片（封面真实、状态 chip 色表 `stStyle`、日期/地点行、标签行、头像串+计数、CTA 按 `ctaFor`）/空态；「主办管理」页签 → `/app/events/center`；「创建活动」→ 现有创建入口。
- [ ] 像素 discover + mine 达标；提交 `feat(events): Orbit_0918 events list fidelity pass (discover / mine)` + 台账。

### Task 2: 详情页保真收口 + 回顾态
- Files: Create `events-0918/event-detail.tsx`（迁自旧详情）；Modify `events/[id]/page.tsx`；Test `tests/pages/app-event-detail-0918.test.tsx`（既有详情测试改指）。
- [ ] 对照 141–219：hero（封面/状态/标题/日期/地点/标签/参与人数/CTA 组）/四页签/介绍（亮点三卡 `highlights` 为设计固定文案 → 保留为设计文案？**否**：无数据 → 省略亮点卡，记偏差）/议程 `agendaShort`（真实议程）/参会者（推荐 4 + 全部）/主办方。
- [ ] 回顾态 521–581 按全局约束实现；`?view=recap` 与已结束自动进入。
- [ ] 像素 detail + recap 达标；提交 `feat(events): Orbit_0918 event detail fidelity pass and recap state` + 台账。

### Task 3: 报名弹窗壳
- Files: Create `event-register-modal.tsx`；Modify `events/[id]/register/page.tsx`（渲染详情 + 打开的弹窗，`RegistrationPortraitWorkspace` 作为弹窗内容，逻辑/`data-*`/回读零改动）；Test：既有报名 5 套件必须继续绿（`tests/pages/*registration*`）。
- [ ] 弹窗壳按 652–673（遮罩/面板/标题「报名参加」/关闭/底部「取消 / 提交报名」→ 触发工作区既有提交）；问卷控件样式对齐（单选卡 / 多选勾选 / 文本域 + 字数）。
- [ ] 像素：设计侧 `--design-click "text=立即报名"`，应用侧 `/app/events/<id>/register`；达标（问卷内容属数据）。提交 `feat(events): registration modal shell over the unchanged portrait workspace` + 台账。

### Task 4: 现场屏 `/app/events/[id]/live`
- Files: Create `event-live.tsx`、`events/[id]/live/page.tsx`；Modify `events-model.ts`；Test `tests/pages/app-event-live-0918.test.tsx`（六页签结构、`resultsState` 四种空态、图谱布局公式、签到按钮状态、议程状态推导）；既有 party 测试（`app-party-live-route-services`、`app-party-participant-ui`）改指新路由/组件，意图不变。
- [ ] loader：`loadAppPartyRouteViewModel({ eventId, language }, …)`（读 `party/page.tsx` 的调用方式与鉴权/回跳 `party-login-return.ts` → 改为 `/app/events/<id>/live`）。
- [ ] 六页签按 221–519 逐元素；写操作（签到 / 发起·接受·拒绝·撤回交换）搬自 `event-operations-controls.tsx`。
- [ ] 像素 live（六页签各一次，设计侧 `--design-click "text=<页签>"`）达标；提交 `feat(events): Orbit_0918 live screen replacing /app/party` + 台账。

### Task 5: 四个弹窗（参会者 / 交换+成功 / 约谈 / 记录交流）
- Files: Create 四个 modal 文件；Modify `event-live.tsx`、`event-detail.tsx`（参会者点击开弹窗）；Test 各一份（SSR 结构 + 请求体断言用 fetch mock）。
- [ ] 按 675–785 与全局约束的数据决定实现；约谈前先读 `app/api/appointments/[id]/commands` 契约并在报告写映射表。
- [ ] 像素四弹窗达标；浏览器旅程：participant.a 对 participant.b 发起交换 → 用 participant.b 登录接受 → participant.a 看到「已互换名片」→ 约谈提议 → 记录交流保存后在回顾「交流记录」出现。提交 `feat(events): attendee / exchange / schedule / note modals on real services` + 台账。

### Task 6: 删除旧路由与旧文件 + 回归 + 收口
- [ ] 删 `party/*`（先把仍被引用的 `party-date-time.ts` 等纯函数移到 `events-0918/`）、旧 explore/detail 文件（若任务 1/2 未直接 `git mv`）；改 `app-auth-routing.ts`、`party-login-return`、审计清单里的 `/app/party*` 表面、ratchet 列表/上限；`grep -rn "/app/party\|orbit-real-party\|orbit-real-explore-client\|orbit-real-event-detail" app features shared tests scripts` 为空。
- [ ] 回归：`tests/pages` 大组（排除 live-DB/云端/兄弟 playwright）失败仅基线 2 条；ui 全绿；audits ⊆ 基线。
- [ ] 像素终验 discover/mine/detail/recap/live/register + 四弹窗 表；台账「Events 参与者侧 屏级替换完成」（偏差清单：统计卡来源、亮点卡省略、交换留言/目的省略、成功态按真实状态、约谈映射、记录交流映射、资料下载省略、生成总结等 W4）；ROUTE-CONSOLIDATION：party 三行「已删」，live 行「已重建」，detail/discover/register 行「已重建」；NEW-UI-DECISION ③ 标完成。
- [ ] 提交 `refactor(events): retire /app/party routes and legacy explore/detail files; record Events completion`。

---

## 后续计划

④ 运营台 7 屏（含主办管理页签落点 `/app/events/center`）→ ⑤ 认证四态弹窗 → ⑥ iOrbit chat。

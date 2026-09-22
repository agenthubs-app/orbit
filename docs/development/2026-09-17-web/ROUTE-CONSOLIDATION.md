# Orbit_0918 路由归并表（屏级替换）

日期：2026-09-21。决定人：用户（逐条拍板）。配套决定见 [NEW-UI-DECISION.md](NEW-UI-DECISION.md)（边界 B）。
判断标准只有一条：**新 UI 导航结构（浮岛 pill 导航 iOrbit / 活动 / 人脉 + 个人中心 + 铃铛）里没有入口、且没有外部深链（邮件 / 通知 / App / 二维码）生成它的路由，一律删除**，不做重定向养着。

用户 2026-09-21 三项拍板：① 下表「删除」组 20 个全删；② 顶栏铃铛保留（通知收件面板与 `/app/inbox/sources/[id]` 随之保留）；③ App 端不动（`/app/tasks/relationship/[id]` 因 bridge 台账提到 App 可能打开，保留）。

## 一、删除（20）

| 路由 | 被谁取代 | 删前必改的链接生成器 |
| --- | --- | --- |
| `/app/dashboard` 已删（312829af） | Network overview（`/app/contacts/dashboard` 概览页签） | `features/orbit-ai/live-command-service.ts` 等 4 处 `href: "/app/dashboard"` 改指 `/app/contacts/dashboard` |
| `/app/home/events` | `/app/events?scope=mine` | 无 |
| `/app/today` | `/app/agent` | 无生成器；删重定向文件 |
| `/app/schedule` | `/app/agent/plan` | 无生成器；删重定向文件 |
| `/app/followups` | `/app/agent/plan` | 7 处生成器（`features/agent/signals/source-collector.ts` 等）改指 `/app/agent/plan` |
| `/app/chat` | `/app/agent?session=` | `features/chat/live-async-service.ts` `stageHref` 改指 `/app/agent?session=` |
| `/app/schedule/events/[id]` | plan 屏「本周日程」条目详情抽屉 | 无 |
| `/app/tasks` `/app/tasks/[id]` | plan 屏「本周重点任务」（`?task=` 抽屉） | 无 |
| `/app/tasks/personal` | plan 屏「本周日程」（个人日程；需补最小新增/编辑态） | 无 |
| `/app/party` `/app/party/checkin` `/app/party/graph` 已删（96802809） | 新路由 `/app/events/[id]/live`（设计 live 屏六页签：现场主页 / 推荐给你 / 全部参会者 / 分组 / 关系图谱 / 流程议程） | `orbit-product-href.ts` `partyHrefForEvent` → `/app/events/<id>/live`（首页活动卡 `enterEvent`）；`productHref("/party")` → `/app/events`；运营台 `event-operations-admin-workspace.tsx` 签到链接 → `/app/events/[id]/operations/check-in`；`orbit-ask-routes.ts` 去掉 `/app/party/checkin` 排除；`app-auth-routing.ts` 白名单删 `/app/party` |
| `/app/contacts/all-actions` 已删（312829af） | `/app/agent/actions` | `app/api/integrations/[provider]/callback/route.ts` 回跳改指 `/app/agent/actions` |
| `/app/contacts/intros` 已删（312829af） | insight 屏（等 W4 逻辑层，届时按设计重做） | 零引用 |
| `/app/contacts/graph` 已删（312829af） | `/app/contacts/dashboard?tab=structure` | 零引用 |
| `/app/contacts/new/batch/[id]` 已删（312829af） | 批量导入 V2 | 零引用 |
| `/app/contacts/new/batch2` `/batch2/[id]` `/new/import/[id]` 已删（312829af） | import 屏内部状态（`/app/contacts/new?job=…`） | 零服务端生成器 |
| `/app/events/[id]/operations/roles` | 运营台「协作者抽屉」 | 无 |

删除同时：`features/auth/app-auth-routing.ts` 的 `next` 白名单移除 today / chat / dashboard / party / followups / schedule；`tests/pages` 中对应路由测试随路由删除。

## 二、保留（10：外部深链或流程依赖）

| 路由 | 原因 | 0918 处理 |
| --- | --- | --- |
| `/app` `/app/home` | 两个入口重定向 → `/app/agent` | `/app` 直接指 `/app/agent`，不再经 `/app/home` |
| `/app/invitations/[token]` | `app/api/relationship-communication/handler.ts` 生成邮件链接 | 套 0918 公共壳 |
| `/app/register` | 邀请码 / 二维码解析器 | 不动 |
| `/app/profile/continue` | onboarding 跳转辅助 | 不动 |
| `/app/inbox/sources/[id]` | 铃铛收件面板 `discovery` 来源深链（用户：铃铛保留） | 套 0918 壳 |
| `/app/tasks/relationship/[id]` | bridge 台账提到 App 可能打开（用户：App 端不动） | 套 0918 壳；Web 内入口改为联系人详情「记跟进」弹窗 |
| `/app/account/login` `signup` `forgot-password` `reset-password` | 认证深链与 `?next=`；reset 为邮件链接 | 路由保留，渲染为落地页上的 0918 弹窗四态 |
| `/app/account/mobile-google` | App OAuth 回跳 | 不动 |
| `/app/admin` `/admin/access` `/admin/events` `/login-admin` `/platform` | 独立后台域（既有决定：admin 保持暗色） | 不动 |

## 三、设计屏对应（28）

| 设计文件 | 设计屏 | 路由 | 备注 |
| --- | --- | --- | --- |
| Orbit 首页 | 落地页 + 登录/注册/忘记/重置弹窗 | `/`、`/app/account/*` | 落地页已重建（`orbit-landing-0918.tsx`） |
| iOrbit | home / chat | `/app/agent` | home 四卡已重建；chat 仍是换肤（`orbit-real-agent.tsx` 3892 行），待重建 |
| iOrbit | actions / plan / strategy | `/app/agent/actions` `/plan` `/strategy` | 已重建 |
| iOrbit | contacts（先联系谁） | 并入 strategy 屏 | — |
| Events | discover（含「我的活动」页签） | `/app/events` | 已重建（Events 任务 1 `64dd236e`，`events-0918/events-list.tsx`） |
| Events | detail | `/app/events/[id]` | 已重建（Events 任务 2 `87a8c376`，`events-0918/event-detail.tsx`） |
| Events | register / success 弹窗 | `/app/events/[id]/register` | 已重建（Events 任务 3 `fa20aed0`：弹窗壳 `event-register-modal.tsx`，0066 工作区逻辑零改动；设计底部按钮省略） |
| Events | live | 新 `/app/events/[id]/live` | 已重建（Events 任务 4 `455a283a`，`events-0918/event-live.tsx` 六页签）；`/app/party*` 已删（`96802809`） |
| Events | recap | `/app/events/[id]` 结束态 / `?view=recap` | 已重建（Events 任务 2 `87a8c376`，四页签共用正文） |
| Events | host | `/app/o/[slug]` | 换肤态，待重建 |
| Events | attendee / exchange / schedule / note 弹窗 | 详情页与 live 屏内弹窗 | 已重建（Events 任务 5 `ad8da895` + `f9bfc081`，`event-*-modal.tsx` 接真实服务） |
| Events 运营台 | hub | `/app/events/center` | 未动，待重建 |
| Events 运营台 | ops（含协作者抽屉） | `/app/events/[id]/operations` | 概览已重建（运营台 任务 3，`ops-0918/ops-console.tsx` + `ops-overview.tsx`；旧 `event-operations-admin-workspace.tsx` 已删）；协作者抽屉 `?drawer=roles` 待任务 6 |
| Events 运营台 | match | `…/operations?tab=match`（审阅修订 7：覆盖原 `…/operations/experience` 归并） | 已重建（运营台 任务 3，`ops-0918/ops-match.tsx`；桌卡只读已发布分桌） |
| Events 运营台 | people | `…/operations/admission` | 已重建（运营台 任务 4 `c24f1ea0`，`ops-0918/ops-people.tsx`；准入队列 + 政策面板为同屏第二区块；旧 `event-admission-review-workspace.tsx` 已删） |
| Events 运营台 | checkin | `…/operations/check-in` | 已重建（运营台 任务 4 `c24f1ea0`，`ops-0918/ops-checkin.tsx`；三列 + 最新签到；旧 `limited-check-in-roster.tsx` 已删） |
| Events 运营台 | form | `…/operations/experience`（审阅修订 7：报名设置 = 现有 experience 编辑器路由） | 待重建（任务 5） |
| Events 运营台 | report | `/app/events/[id]/analytics` | 换肤态，待重建 |
| Network v2 | overview | `/app/contacts/dashboard`（概览页签） | 已重建（b64d150b）；吸收原 `/app/dashboard` 四张信号卡 |
| Network v2 | analysis | `/app/contacts/dashboard`（结构/机会页签）+ `contacts/analysis/[dimension]/[bucketId]` 下钻 | 已重建（b64d150b）；下钻页只换壳 `NetworkShell screen="analysis"`（设计无对应屏） |
| Network v2 | pipeline | `/app/contacts/pipeline` | 已重建（3da3b5b3） |
| Network v2 | all | `/app/contacts` | 已重建（55931044） |
| Network v2 | import | `/app/contacts/new` | 已重建（b8c812db）；吸收 batch2 / import 子状态（`?job=`），名片 V2 组件移至 `contacts/ingest-v2/` |
| Network v2 | insight | 待 W4 逻辑层 | 不做假 |
| Network v2 | detail 弹窗 | `/app/contacts/[id]`（路由保留作深链） | 已重建（e670a804）；`?capture=meeting` 会后纪要 / 约谈核验作为弹窗附加态保留 |
| Network v2 | follow 弹窗 | 联系人详情内 | 已重建（e670a804；阶段箭头只读，见 EXECUTION 任务 6 修订）；取代 Web 内 `/app/tasks/relationship/[id]` 入口 |
| 个人中心 | profile / persona / basic（设计外） | `/app/profile`（`?view=persona|basic`） | 已重建（a608b149 / 1a95bb29；旧 `OrbitRealProfile` 于 034b799c 删除）；含 onboarding 门禁提示（落地横幅 + 必填标记 + 保存后缺项提示）；「我的目标」只读 |
| 个人中心 | settings / connect | `/app/settings`、`/app/profile?view=connect` | 已重建（7152b0ce；旧 `OrbitSettingsContent` 于 034b799c 删除）；设置页在设计三卡后追加既有五个模块；connect 为「即将开放」占位 |

新 UI 之外但保留的壳级能力：顶栏铃铛 + 通知收件面板（`RelationshipInboxPanel`），设计稿未画，按 0918 token 重做样式后挂在 pill 导航右侧。

净效果：60 路由 → 38（28 设计屏对应 + 10 保留）。

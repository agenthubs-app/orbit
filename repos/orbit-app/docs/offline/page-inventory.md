# 全 App 页面离线清单

> Sprint 0131 生成。数据来源是 `scripts/page-offline-inventory.ts`，本文件由 `npx tsx scripts/page-offline-inventory.ts --write` 生成，
> `tests/page-offline-inventory.test.ts` 检查：`app/` 下每个路由都登记了归属、没有过期条目、本文件和登记表一致。新增路由不登记，测试就会失败。

## 汇总

| 归属 | 数量 |
| --- | --- |
| 能断网看（本地优先） | 42 |
| └ 由 Sprint 0108 实现 | 8 |
| └ 由 Sprint 0115 实现 | 3 |
| └ 由 Sprint 0116 实现 | 3 |
| └ 由 Sprint 0117 实现 | 4 |
| └ 由 Sprint 0118 实现 | 4 |
| └ 由 Sprint 0119 实现 | 4 |
| └ 由 Sprint 0131 实现 | 15 |
| └ 由 Sprint 0137 实现 | 1 |
| 只能在线 | 36 |
| 不读账号数据（布局、跳转、本机设置） | 18 |
| 合计（路由文件） | 96 |

「本机副本」有两种：**同步域**（注册表 v2，服务器按租约增量下发，见 `repos/orbits/features/sync/domain-registry.ts`）和 **页面副本**（0131：服务器实时算出的页面，上次联网读到的那一份，
按租约的授权纪元保存和清除，见 `src/data/sync/page-copies.ts` 和威胁模型第 2 节「页面副本」）。断网时页面顶部是 0108 的琥珀色提示条「无法连接 · 显示截至 X 的内容」，写入入口标「需要联网」。

## 能断网看（本地优先）

| 路由 | 页面 | Sprint | 读取 | 断网时 |
| --- | --- | --- | --- | --- |
| `/ai` | AI 标签：会话列表、今日摘要 | 0118 | 域 ai-sessions（0118）；今日摘要读页面副本 today-summary（0131）；按需「搜索更多」读 /api/ai/conversations/sessions | 「截至」提示条；会话列表和今日摘要是本机副本；本机只搜标题、第一个问题和最近一条（页面写明）；提新问题需要联网 |
| `/ai/:id` | AI 会话 | 0118 | 域 ai-session-messages（本设备打开过的 20 个会话） | 「截至」；打开过的会话显示本机消息和缓存卡片；发送需要联网；从没打开过的会话需要联网 |
| `/inbox` | 收件箱（通知和对话） | 0119 | 域 inbox-notifications（0118）、relationship-conversations / relationship-messages（0119） | 「截至」；标已读、处理、发送、存草稿需要联网；网络恢复时立即同步（0131） |
| `/inbox/:id` | 收件箱里的对话 | 0119 | 域 relationship-messages，按对话按页从本机读（0131） | 「截至」；能往前翻到第一条；发送需要联网 |
| `/inbox/notifications/:id` | 通知详情 | 0118 | 域 inbox-notifications | 「截至」；三个处理动作需要联网 |
| `/inbox/sources/:id` | 通知来源（同通知详情） | 0118 | 域 inbox-notifications | 同通知详情 |
| `/chat` | 对话列表 | 0119 | 域 relationship-conversations | 「截至」 |
| `/chat/:id` | 对话 | 0119 | 域 relationship-messages，按对话按页从本机读（0131） | 「截至」；发送需要联网 |
| `/contacts` | 联系人标签 | 0116 | 域 contacts；关系搜索建议 /api/search/suggestions 改为点开搜索时才读（0131） | 「截至」；本机搜索；关系搜索、深度搜索需要联网 |
| `/contacts/list` | 联系人列表 | 0116 | 域 contacts | 「截至」；本机搜索 |
| `/contacts/:id` | 联系人详情 | 0116 | 域 contacts；关系价值 /api/analysis/relationship-value/:id、聊天资格在线读 | 「截至」；编辑、起草消息、聊天资格需要联网 |
| `/dashboard` | 看板 | 0117 | 域 dashboard-graph，本机计算；来源审计改为点「运行来源审计」才读 /api/audit/provenance，上次结果是页面副本 provenance-audit（0131） | 「截至」；重新计算、运行审计需要联网 |
| `/contacts/dashboard` | 联系人分析 | 0117 | 域 dashboard-graph；AI 报告读 /api/mobile/contacts-dashboard?view=analysis | 「截至」；去 AI 分析需要联网 |
| `/contacts/graph` | 联系人分析（结构分段） | 0117 | 域 dashboard-graph | 「截至」 |
| `/contacts/analysis/:dimension/:bucketId` | 分组详情 | 0117 | 域 dashboard-graph，本机计算（非 ASCII 分组编号只解码一次，0131） | 「截至」 |
| `/events/:id` | 活动详情 | 0115 | 域 registered-events / event-registrations / event-published-results；未报名的活动读 /api/events/public/:id | 「截至」；404 显示「活动已不存在」，5xx 显示「服务暂时不可用」（0131）；取消或被拒后显示中性说明和返回按钮（0131）；报名、签到需要联网 |
| `/events/:id/live` | 活动现场页 | 0115 | 域 event-published-results 等 | 「截至」；签到、交换名片、记笔记、约时间需要联网 |
| `/schedule` | 日历 | 0115 | 域 registered-events、tasks、personal-schedule | 「截至」；点已报名活动进入 /events/:id（0131） |
| `/schedule/personal/:id` | 个人日程详情 | 0108 | 域 personal-schedule | 「截至」；编辑、改期需要联网 |
| `/schedule/personal/:id/edit` | 编辑个人日程 | 0108 | 域 personal-schedule | 表单显示本机内容；保存需要联网 |
| `/schedule/personal/new` | 新建个人日程 | 0108 | 域 personal-schedule（关联选项读本机联系人、笔记） | 保存需要联网 |
| `/tasks/personal` | 个人日程列表 | 0108 | 域 personal-schedule | 「截至」 |
| `/notes` | 笔记列表 | 0108 | 域 notes（浏览器版 0125 起） | 「截至」；新建需要联网 |
| `/notes/:id` | 笔记详情 | 0108 | 域 notes；关联联系人读域 contacts（0116） | 「截至」；编辑需要联网 |
| `/notes/:id/edit` | 编辑笔记 | 0108 | 域 notes | 表单显示本机内容；保存需要联网 |
| `/notes/new` | 新建笔记 | 0108 | 域 notes（草稿存本机） | 可以写草稿；保存需要联网 |
| `/home` | 首页（日程、待办、推荐活动、收件箱角标） | 0131 | 日程读域 personal-schedule + registered-events，约谈读页面副本 home-schedule；待办读域 tasks；角标读域 inbox-notifications 的本机未读数；推荐活动读页面副本 event-recommendations | 「截至」；推荐活动显示最近一次同步的结果；勾选完成待办需要联网 |
| `/today` | 今日待办 | 0131 | 页面副本 today-page（/api/today 第一页） | 「截至」；新建、完成、接受建议需要联网 |
| `/tasks` | 待办（全部 / 关系 / 个人），含关系待办和待办建议 | 0131 | 列表读域 tasks（0087/0108）；关系待办读页面副本 relationship-tasks（/api/relationship-tasks/page 第一页）；待办建议读页面副本 task-suggestions（/api/task-suggestions/page 第一页） | 「截至」；完成、重开需要联网 |
| `/tasks/:id` | 待办详情 | 0131 | 域 tasks 的这一行；活动记录和提醒读网络 | 「截至」；待办内容来自本机；活动记录、提醒和所有修改需要联网 |
| `/tasks/relationship/:id` | 关系待办详情（关系下一步） | 0131 | 页面副本 relationship-lifecycle（/api/connections/:id/lifecycle，按关系保存最近打开的 20 个） | 「截至」；打开过的关系显示本机副本；确认下一步需要联网；没打开过的显示「需要联网」 |
| `/profile` | 我的资料 | 0131 | 页面副本 self-profile（/api/profile）；统计读域 contacts、tasks、personal-schedule；资料更新建议读网络 | 「截至」；编辑、上传名片或简历、建议需要联网 |
| `/profile/preview` | 资料预览 | 0131 | 页面副本 self-profile | 「截至」 |
| `/profile/tags` | 资料标签 | 0131 | 页面副本 self-profile | 「截至」；保存标签需要联网 |
| `/agent` | Agent 动作中心 | 0131 | 页面副本 agent-actions（/api/agent/actions） | 「截至」；确认、忽略需要联网 |
| `/agent/actions` | All Actions 账本 | 0131 | 页面副本 agent-ledger（/api/agent/ledger 最近 3 页） | 「截至」；可以翻看本机保存的 3 页；确认、撤销需要联网 |
| `/contacts/all-actions` | All Actions 账本（联系人入口） | 0131 | 页面副本 agent-ledger | 同 /agent/actions |
| `/schedule/meetings/:id` | 约谈详情 | 0131 | 页面副本 meeting-details（按约谈保存最近打开的 20 个） | 「截至」；打开过的约谈显示本机副本；修改需要联网；没打开过的显示「需要联网」 |
| `/schedule/events/:id` | 日历里的活动预览 | 0131 | 已报名的活动直接跳到 /events/:id（域 registered-events）；其他活动读 /api/events/public/:id | 已报名的活动跳转后可离线；其他活动显示「需要联网」 |
| `/events` | 活动标签：活动列表和推荐 | 0131 | 页面副本 public-events（公开活动目录）和 event-recommendations | 「截至」；显示最近一次看到的列表；报名需要联网 |
| `/home/events` | 推荐活动（旧入口） | 0131 | 页面副本 public-events | 「截至」；显示最近一次看到的列表 |
| `/contacts/pipeline` | 关系推进看板 | 0137 | 域 contacts 的本机卡片；阶段分组使用 shared/compute/contact-pipeline；线上待处理事项仍读 /api/contacts/pipeline | 「截至」；联系人阶段和数量由本机副本计算；待处理事项需要联网 |

## 只能在线

| 路由 | 页面 | 原因 | 读取 | 断网时 |
| --- | --- | --- | --- | --- |
| `/account` | 账号与会话 | 涉及凭据或会话：账号、登录会话和退出都在服务器上确认 | /api/account/me | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/account/login` | 登录 | 涉及凭据或会话：提交密码需要服务器验证 | /api/auth/* | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/account/signup` | 注册 | 涉及凭据或会话：建账号需要服务器 | /api/auth/register | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/account/forgot-password` | 忘记密码 | 涉及凭据或会话：发送重置邮件需要服务器 | /api/auth/password-reset/request | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/account/reset-password` | 重置密码 | 涉及凭据或会话：重置令牌由服务器验证 | /api/auth/password-reset/confirm | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/account/permissions` | 数据授权（邮箱、日历） | 涉及凭据或会话：第三方授权状态和授权流程在服务器上 | /api/permissions | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/login-admin` | 管理员登录 | 管理员工具：管理员凭据由服务器验证 | /api/auth/* | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/admin` | 管理后台 | 管理员工具：管理员工具，读全平台数据，不放进个人设备 | /api/dashboard、/api/events、/api/profile | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/admin/access` | 管理后台：权限 | 管理员工具：管理员工具 | 同 /admin | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/admin/events` | 管理后台：活动 | 管理员工具：管理员工具 | 同 /admin | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/events/center` | 运营活动中心（我的活动权限） | 主办方实时运营：主办方和工作人员视图，按实时权限读取 | /api/events/center | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/events/:id/operations` | 主办方运营台 | 主办方实时运营：主办方实时运营（设计案 C 类，永不落地） | /api/events/:id/operations/admin | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/events/:id/operations/admission` | 报名审核 | 主办方实时运营：审核决定必须实时写入 | /api/events/:id/admission/reviews | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/events/:id/operations/check-in` | 签到台 | 主办方实时运营：签到名单是工作人员数据，实时变化 | /api/events/:id/operations/admin/check-ins | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/events/:id/operations/experience` | 活动体验配置 | 主办方实时运营：主办方配置 | /api/events/:id/experience | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/events/:id/operations/roles` | 活动角色与权限 | 主办方实时运营：主办方权限管理 | /api/events/:id/access/roles | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/events/:id/analytics` | 活动数据分析 | 主办方实时运营：主办方统计，服务器实时聚合 | /api/events/:id/analytics/* | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/events/:id/register` | 报名问卷 | 付费 AI：报名是写入；问卷题目由付费 AI 生成并在服务器缓存 | /api/events/public/:id、/api/events/:id/registration | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/contacts/new` | 更多添加方式（QR、批量名片、外部导入、引荐、重复检查） | 名片识别（上传图片、OCR）：名片识别要上传图片做 OCR；新建联系人是写入 | /api/contact-drafts* | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/contacts/new/batch/:id` | 名片批量识别（旧） | 名片识别（上传图片、OCR）：批量识别在服务器进行 | /api/contact-drafts/business-card/batches/:id | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/contacts/new/batch2` | 名片批量识别 | 名片识别（上传图片、OCR）：批量识别在服务器进行 | /api/contact-drafts/business-card/batches/v2 | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/contacts/new/batch2/:id` | 名片批量识别结果 | 名片识别（上传图片、OCR）：识别结果和图片在服务器 | /api/contact-drafts/business-card/batches/v2/:id | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/contacts/new/manual` | 手动添加（姓名先行，核对后保存） | 名片识别（上传图片、OCR）：保存联系人是写入：先建草稿再确认 | /api/contact-drafts/manual、/api/contact-drafts/:id/confirm | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/contacts/new/scan` | 扫描名片（拍照或选图，核对后保存） | 名片识别（上传图片、OCR）：名片识别要上传图片做 OCR；保存联系人是写入 | /api/contact-drafts/business-card/scan、/api/contacts/business-card/confirm | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/contacts/new/import/:id` | 名片导入进度 | 名片识别（上传图片、OCR）：导入任务在服务器运行 | /api/contact-drafts/business-card/imports/:id | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/contacts/intros` | 引荐 | 需要服务器实时计算：引荐候选由服务器跨账号实时计算 | /api/contacts/intros/summary | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/contacts/matches` | 人脉需求匹配 | 需要服务器实时计算：需求匹配由服务器按最新资料实时排序（0116 已定为需要联网） | /api/contacts/needs-matches、/api/profile | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/invitations/:token` | 关系邀请 | 需要服务器验证链接或邀请码：邀请链接由服务器验证后才能接受 | /api/relationship-communication/invitations/:id | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/register` | 邀请注册 | 需要服务器验证链接或邀请码：邀请码由服务器验证 | /api/events/public/:id、/api/profile | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/register/:code` | 邀请注册（带邀请码） | 需要服务器验证链接或邀请码：邀请码由服务器验证 | 同 /register | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/platform` | 平台工作台（公开活动审核队列） | 管理员工具：平台运营工具：审核导入的公开活动 | /api/events/public | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/o/:slug` | 主办方公开页 | 公开访客页面（不属于账号）：给未登录访客看的公开页，不属于任何账号的本机副本 | /api/events/public | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/profile/edit` | 编辑资料 | 涉及凭据或会话：编辑会话从服务器取最新版本并保存，离线编辑属于 0120 断网写 | /api/profile | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/profile/more` | 补充资料（上传名片、简历） | 付费 AI：名片和简历由付费 AI 抽取 | /api/profile/extractions/* | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/profile/onboarding` | 新用户引导 | 付费 AI：引导里的名片扫描和自我介绍草稿用付费 AI；每一步都保存到服务器（0106 已支持断网继续填写、联网后保存） | /api/profile、/api/profile/intro-draft | 已填内容保留，显示「现在没有网络」提示，联网后继续（0106 行为） |
| `/profile/suggestions` | 资料更新建议 | 付费 AI：建议由 AI 按最新活动生成，接受或忽略要实时写入 | /api/profile/update-suggestions | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |

## 不读账号数据（布局、跳转、本机设置）

| 路由 | 页面 | 读取 | 断网时 |
| --- | --- | --- | --- |
| `(根布局)` | 根布局：会话恢复、错误边界、通知协调 | 无（会话恢复见威胁模型第 6 节） | 按 0127 的离线冷启动身份进入 |
| `(底部标签栏)` | 底部五个标签的布局 | 无 | 照常显示 |
| `/showcase/components` | 组件库展示页（开发包和 TestFlight，R04） | 无（示例数据打包在 App 里） | 照常显示 |
| `/showcase/copy` | 标准用词展示页（开发包和 TestFlight，R03） | 无（标准用词打包在 App 里） | 照常显示 |
| `/showcase/icons` | 图标展示页（开发包和 TestFlight，R02） | 无（图标源打包在 App 里） | 照常显示 |
| `(浏览器外壳)` | 浏览器版 HTML 外壳 | 无 | 照常加载 |
| `/` | 入口跳转 | 无 | 跳到首页或登录页 |
| `/*（旧链接）` | 旧深链接跳转 | 无 | 跳到对应新页面 |
| `/account/mobile-google` | 旧 Google 登录链接跳转 | 无 | 跳到登录页 |
| `/events/:id/attendees` | 旧参会者链接跳转到现场页 | 无 | 跳到现场页（0115 可离线） |
| `/events/:id/participants/:participantId` | 旧参会者链接跳转到现场资料面板 | 无 | 跳到现场页（0115 可离线） |
| `/party` | 旧派对模式跳转 | 无 | 跳到现场页 |
| `/party/checkin` | 旧派对签到跳转 | 无 | 跳到现场页 |
| `/party/graph` | 旧派对关系图跳转 | 无 | 跳到现场页 |
| `/profile/continue` | 补资料后继续跳转 | 无 | 跳到目标页 |
| `/followups` | 旧跟进入口，跳到待办的「关系」分组 | 无（目标页见 app/tasks.tsx） | 跳到 /tasks?scope=relationship（0131 可离线） |
| `/settings` | 设置（语言、主题、本地镜像状态、通知权限） | 本机设置；通知投递和发现偏好读 /api/inbox/delivery/preferences、/api/inbox/discovery/preferences | 本机设置照常可用；两块通知偏好显示「需要联网」 |
| `/settings/api` | 服务器地址设置 | 本机保存的服务器地址；「检查连接」按需读 /api/health | 可以改地址；检查连接会显示连不上 |

## 路由文件对照

| 文件 | 路由 | 归属 |
| --- | --- | --- |
| `app/_layout.tsx` | `(根布局)` | device-only |
| `app/(app)/_layout.tsx` | `(底部标签栏)` | device-only |
| `app/(app)/ai.tsx` | `/ai` | local-first (0118) |
| `app/(app)/contacts.tsx` | `/contacts` | local-first (0116) |
| `app/(app)/events.tsx` | `/events` | local-first (0131) |
| `app/(app)/inbox.tsx` | `/inbox` | local-first (0119) |
| `app/(app)/profile.tsx` | `/profile` | local-first (0131) |
| `app/(app)/schedule.tsx` | `/schedule` | local-first (0115) |
| `app/[...legacy].tsx` | `/*（旧链接）` | device-only |
| `app/+html.tsx` | `(浏览器外壳)` | device-only |
| `app/account.tsx` | `/account` | online-only |
| `app/account/forgot-password.tsx` | `/account/forgot-password` | online-only |
| `app/account/login.tsx` | `/account/login` | online-only |
| `app/account/mobile-google.tsx` | `/account/mobile-google` | device-only |
| `app/account/permissions.tsx` | `/account/permissions` | online-only |
| `app/account/reset-password.tsx` | `/account/reset-password` | online-only |
| `app/account/signup.tsx` | `/account/signup` | online-only |
| `app/admin.tsx` | `/admin` | online-only |
| `app/admin/access.tsx` | `/admin/access` | online-only |
| `app/admin/events.tsx` | `/admin/events` | online-only |
| `app/agent.tsx` | `/agent` | local-first (0131) |
| `app/agent/actions.tsx` | `/agent/actions` | local-first (0131) |
| `app/ai/[id].tsx` | `/ai/:id` | local-first (0118) |
| `app/chat.tsx` | `/chat` | local-first (0119) |
| `app/chat/[id].tsx` | `/chat/:id` | local-first (0119) |
| `app/contacts/[id].tsx` | `/contacts/:id` | local-first (0116) |
| `app/contacts/all-actions.tsx` | `/contacts/all-actions` | local-first (0131) |
| `app/contacts/analysis/[dimension]/[bucketId].tsx` | `/contacts/analysis/:dimension/:bucketId` | local-first (0117) |
| `app/contacts/dashboard.tsx` | `/contacts/dashboard` | local-first (0117) |
| `app/contacts/graph.tsx` | `/contacts/graph` | local-first (0117) |
| `app/contacts/intros.tsx` | `/contacts/intros` | online-only |
| `app/contacts/list.tsx` | `/contacts/list` | local-first (0116) |
| `app/contacts/matches.tsx` | `/contacts/matches` | online-only |
| `app/contacts/new.tsx` | `/contacts/new` | online-only |
| `app/contacts/new/batch/[id].tsx` | `/contacts/new/batch/:id` | online-only |
| `app/contacts/new/batch2/[id].tsx` | `/contacts/new/batch2/:id` | online-only |
| `app/contacts/new/batch2/index.tsx` | `/contacts/new/batch2` | online-only |
| `app/contacts/new/import/[id].tsx` | `/contacts/new/import/:id` | online-only |
| `app/contacts/new/manual.tsx` | `/contacts/new/manual` | online-only |
| `app/contacts/new/scan.tsx` | `/contacts/new/scan` | online-only |
| `app/contacts/pipeline.tsx` | `/contacts/pipeline` | local-first (0137) |
| `app/dashboard.tsx` | `/dashboard` | local-first (0117) |
| `app/events/[id].tsx` | `/events/:id` | local-first (0115) |
| `app/events/[id]/analytics.tsx` | `/events/:id/analytics` | online-only |
| `app/events/[id]/attendees.tsx` | `/events/:id/attendees` | device-only |
| `app/events/[id]/live.tsx` | `/events/:id/live` | local-first (0115) |
| `app/events/[id]/operations.tsx` | `/events/:id/operations` | online-only |
| `app/events/[id]/operations/admission.tsx` | `/events/:id/operations/admission` | online-only |
| `app/events/[id]/operations/check-in.tsx` | `/events/:id/operations/check-in` | online-only |
| `app/events/[id]/operations/experience.tsx` | `/events/:id/operations/experience` | online-only |
| `app/events/[id]/operations/roles.tsx` | `/events/:id/operations/roles` | online-only |
| `app/events/[id]/participants/[participantId].tsx` | `/events/:id/participants/:participantId` | device-only |
| `app/events/[id]/register.tsx` | `/events/:id/register` | online-only |
| `app/events/center.tsx` | `/events/center` | online-only |
| `app/followups.tsx` | `/followups` | device-only |
| `app/home.tsx` | `/home` | local-first (0131) |
| `app/home/events.tsx` | `/home/events` | local-first (0131) |
| `app/inbox/[id].tsx` | `/inbox/:id` | local-first (0119) |
| `app/inbox/notifications/[id].tsx` | `/inbox/notifications/:id` | local-first (0118) |
| `app/inbox/sources/[id].tsx` | `/inbox/sources/:id` | local-first (0118) |
| `app/index.tsx` | `/` | device-only |
| `app/invitations/[token].tsx` | `/invitations/:token` | online-only |
| `app/login-admin.tsx` | `/login-admin` | online-only |
| `app/notes/[id].tsx` | `/notes/:id` | local-first (0108) |
| `app/notes/[id]/edit.tsx` | `/notes/:id/edit` | local-first (0108) |
| `app/notes/index.tsx` | `/notes` | local-first (0108) |
| `app/notes/new.tsx` | `/notes/new` | local-first (0108) |
| `app/o/[slug].tsx` | `/o/:slug` | online-only |
| `app/party.tsx` | `/party` | device-only |
| `app/party/checkin.tsx` | `/party/checkin` | device-only |
| `app/party/graph.tsx` | `/party/graph` | device-only |
| `app/platform.tsx` | `/platform` | online-only |
| `app/profile/continue.tsx` | `/profile/continue` | device-only |
| `app/profile/edit.tsx` | `/profile/edit` | online-only |
| `app/profile/more.tsx` | `/profile/more` | online-only |
| `app/profile/onboarding.tsx` | `/profile/onboarding` | online-only |
| `app/profile/preview.tsx` | `/profile/preview` | local-first (0131) |
| `app/profile/suggestions.tsx` | `/profile/suggestions` | online-only |
| `app/profile/tags.tsx` | `/profile/tags` | local-first (0131) |
| `app/register.tsx` | `/register` | online-only |
| `app/register/[code].tsx` | `/register/:code` | online-only |
| `app/schedule/events/[id].tsx` | `/schedule/events/:id` | local-first (0131) |
| `app/schedule/meetings/[id].tsx` | `/schedule/meetings/:id` | local-first (0131) |
| `app/schedule/personal/[id].tsx` | `/schedule/personal/:id` | local-first (0108) |
| `app/schedule/personal/[id]/edit.tsx` | `/schedule/personal/:id/edit` | local-first (0108) |
| `app/schedule/personal/new.tsx` | `/schedule/personal/new` | local-first (0108) |
| `app/settings.tsx` | `/settings` | device-only |
| `app/settings/api.tsx` | `/settings/api` | device-only |
| `app/showcase/components.tsx` | `/showcase/components` | device-only |
| `app/showcase/copy.tsx` | `/showcase/copy` | device-only |
| `app/showcase/icons.tsx` | `/showcase/icons` | device-only |
| `app/tasks.tsx` | `/tasks` | local-first (0131) |
| `app/tasks/[id].tsx` | `/tasks/:id` | local-first (0131) |
| `app/tasks/personal.tsx` | `/tasks/personal` | local-first (0108) |
| `app/tasks/relationship/[id].tsx` | `/tasks/relationship/:id` | local-first (0131) |
| `app/today.tsx` | `/today` | local-first (0131) |

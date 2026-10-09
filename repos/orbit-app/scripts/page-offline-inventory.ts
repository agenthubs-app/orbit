import { readdir, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

/**
 * Sprint 0131: the whole-App page offline inventory. Every route file under
 * app/ has exactly one entry, and every entry has an owner:
 *
 *   local-first   readable offline from the device copy; `sprint` names the
 *                 sprint that made it so (0108, 0115–0119, 0125, 0131).
 *   online-only   needs the server by design; `reasonCategory` + `reason` say
 *                 why. Offline it shows the calm 「需要联网」 state, never an
 *                 error page.
 *   device-only   renders from the device alone (layouts, redirects, device
 *                 settings); it reads no account data from the server.
 *
 * tests/page-offline-inventory.test.ts fails on an unregistered or stale route,
 * and checks docs/offline/page-inventory.md is the rendering of this list
 * (`npx tsx scripts/page-offline-inventory.ts --write`).
 */
export type PageOfflineClassification = 'local-first' | 'online-only' | 'device-only';
export type OnlineOnlyReason = 'credentials' | 'admin' | 'organizer-live' | 'paid-ai' | 'server-computed' | 'card-scan' | 'public-visitor' | 'server-token';

export interface PageOfflineEntry {
  /** Route file relative to the App root. */
  file: string;
  /** The URL the route answers. */
  path: string;
  /** What the page shows. */
  title: string;
  classification: PageOfflineClassification;
  /** local-first: the sprint that made it readable offline. */
  sprint?: '0108' | '0115' | '0116' | '0117' | '0118' | '0119' | '0125' | '0131' | '0137';
  /** Where the content comes from: device domains (域), page copies (页面副本) and network reads. */
  reads: string;
  /** What the page does when the server cannot be reached. */
  offline: string;
  reasonCategory?: OnlineOnlyReason;
  reason?: string;
}

const REASON_LABELS: Record<OnlineOnlyReason, string> = {
  credentials: '涉及凭据或会话',
  admin: '管理员工具',
  'organizer-live': '主办方实时运营',
  'paid-ai': '付费 AI',
  'server-computed': '需要服务器实时计算',
  'card-scan': '名片识别（上传图片、OCR）',
  'public-visitor': '公开访客页面（不属于账号）',
  'server-token': '需要服务器验证链接或邀请码',
};

export const NEEDS_NETWORK = '显示「需要联网」空状态（不是报错页），联网后点「重试」';

export const PAGE_OFFLINE_INVENTORY: readonly PageOfflineEntry[] = [
  // ── structure ──
  { file: 'app/_layout.tsx', path: '(根布局)', title: '根布局：会话恢复、错误边界、通知协调', classification: 'device-only', reads: '无（会话恢复见威胁模型第 6 节）', offline: '按 0127 的离线冷启动身份进入' },
  { file: 'app/(app)/_layout.tsx', path: '(底部标签栏)', title: '底部五个标签的布局', classification: 'device-only', reads: '无', offline: '照常显示' },
  { file: 'app/showcase/icons.tsx', path: '/showcase/icons', title: '图标展示页（开发包和 TestFlight，R02）', classification: 'device-only', reads: '无（图标源打包在 App 里）', offline: '照常显示' },
  { file: 'app/+html.tsx', path: '(浏览器外壳)', title: '浏览器版 HTML 外壳', classification: 'device-only', reads: '无', offline: '照常加载' },
  { file: 'app/index.tsx', path: '/', title: '入口跳转', classification: 'device-only', reads: '无', offline: '跳到首页或登录页' },
  { file: 'app/[...legacy].tsx', path: '/*（旧链接）', title: '旧深链接跳转', classification: 'device-only', reads: '无', offline: '跳到对应新页面' },
  { file: 'app/account/mobile-google.tsx', path: '/account/mobile-google', title: '旧 Google 登录链接跳转', classification: 'device-only', reads: '无', offline: '跳到登录页' },
  { file: 'app/events/[id]/attendees.tsx', path: '/events/:id/attendees', title: '旧参会者链接跳转到现场页', classification: 'device-only', reads: '无', offline: '跳到现场页（0115 可离线）' },
  { file: 'app/events/[id]/participants/[participantId].tsx', path: '/events/:id/participants/:participantId', title: '旧参会者链接跳转到现场资料面板', classification: 'device-only', reads: '无', offline: '跳到现场页（0115 可离线）' },
  { file: 'app/party.tsx', path: '/party', title: '旧派对模式跳转', classification: 'device-only', reads: '无', offline: '跳到现场页' },
  { file: 'app/party/checkin.tsx', path: '/party/checkin', title: '旧派对签到跳转', classification: 'device-only', reads: '无', offline: '跳到现场页' },
  { file: 'app/party/graph.tsx', path: '/party/graph', title: '旧派对关系图跳转', classification: 'device-only', reads: '无', offline: '跳到现场页' },
  { file: 'app/profile/continue.tsx', path: '/profile/continue', title: '补资料后继续跳转', classification: 'device-only', reads: '无', offline: '跳到目标页' },
  { file: 'app/followups.tsx', path: '/followups', title: '旧跟进入口，跳到待办的「关系」分组', classification: 'device-only', reads: '无（目标页见 app/tasks.tsx）', offline: '跳到 /tasks?scope=relationship（0131 可离线）' },
  { file: 'app/settings.tsx', path: '/settings', title: '设置（语言、主题、本地镜像状态、通知权限）', classification: 'device-only', reads: '本机设置；通知投递和发现偏好读 /api/inbox/delivery/preferences、/api/inbox/discovery/preferences', offline: '本机设置照常可用；两块通知偏好显示「需要联网」' },
  { file: 'app/settings/api.tsx', path: '/settings/api', title: '服务器地址设置', classification: 'device-only', reads: '本机保存的服务器地址；「检查连接」按需读 /api/health', offline: '可以改地址；检查连接会显示连不上' },

  // ── earlier sprints: local-first ──
  { file: 'app/(app)/ai.tsx', path: '/ai', title: 'AI 标签：会话列表、今日摘要', classification: 'local-first', sprint: '0118', reads: '域 ai-sessions（0118）；今日摘要读页面副本 today-summary（0131）；按需「搜索更多」读 /api/ai/conversations/sessions', offline: '「截至」提示条；会话列表和今日摘要是本机副本；本机只搜标题、第一个问题和最近一条（页面写明）；提新问题需要联网' },
  { file: 'app/ai/[id].tsx', path: '/ai/:id', title: 'AI 会话', classification: 'local-first', sprint: '0118', reads: '域 ai-session-messages（本设备打开过的 20 个会话）', offline: '「截至」；打开过的会话显示本机消息和缓存卡片；发送需要联网；从没打开过的会话需要联网' },
  { file: 'app/(app)/inbox.tsx', path: '/inbox', title: '收件箱（通知和对话）', classification: 'local-first', sprint: '0119', reads: '域 inbox-notifications（0118）、relationship-conversations / relationship-messages（0119）', offline: '「截至」；标已读、处理、发送、存草稿需要联网；网络恢复时立即同步（0131）' },
  { file: 'app/inbox/[id].tsx', path: '/inbox/:id', title: '收件箱里的对话', classification: 'local-first', sprint: '0119', reads: '域 relationship-messages，按对话按页从本机读（0131）', offline: '「截至」；能往前翻到第一条；发送需要联网' },
  { file: 'app/inbox/notifications/[id].tsx', path: '/inbox/notifications/:id', title: '通知详情', classification: 'local-first', sprint: '0118', reads: '域 inbox-notifications', offline: '「截至」；三个处理动作需要联网' },
  { file: 'app/inbox/sources/[id].tsx', path: '/inbox/sources/:id', title: '通知来源（同通知详情）', classification: 'local-first', sprint: '0118', reads: '域 inbox-notifications', offline: '同通知详情' },
  { file: 'app/chat.tsx', path: '/chat', title: '对话列表', classification: 'local-first', sprint: '0119', reads: '域 relationship-conversations', offline: '「截至」' },
  { file: 'app/chat/[id].tsx', path: '/chat/:id', title: '对话', classification: 'local-first', sprint: '0119', reads: '域 relationship-messages，按对话按页从本机读（0131）', offline: '「截至」；发送需要联网' },
  { file: 'app/(app)/contacts.tsx', path: '/contacts', title: '联系人标签', classification: 'local-first', sprint: '0116', reads: '域 contacts；关系搜索建议 /api/search/suggestions 改为点开搜索时才读（0131）', offline: '「截至」；本机搜索；关系搜索、深度搜索需要联网' },
  { file: 'app/contacts/list.tsx', path: '/contacts/list', title: '联系人列表', classification: 'local-first', sprint: '0116', reads: '域 contacts', offline: '「截至」；本机搜索' },
  { file: 'app/contacts/[id].tsx', path: '/contacts/:id', title: '联系人详情', classification: 'local-first', sprint: '0116', reads: '域 contacts；关系价值 /api/analysis/relationship-value/:id、聊天资格在线读', offline: '「截至」；编辑、起草消息、聊天资格需要联网' },
  { file: 'app/dashboard.tsx', path: '/dashboard', title: '看板', classification: 'local-first', sprint: '0117', reads: '域 dashboard-graph，本机计算；来源审计改为点「运行来源审计」才读 /api/audit/provenance，上次结果是页面副本 provenance-audit（0131）', offline: '「截至」；重新计算、运行审计需要联网' },
  { file: 'app/contacts/dashboard.tsx', path: '/contacts/dashboard', title: '联系人分析', classification: 'local-first', sprint: '0117', reads: '域 dashboard-graph；AI 报告读 /api/mobile/contacts-dashboard?view=analysis', offline: '「截至」；去 AI 分析需要联网' },
  { file: 'app/contacts/graph.tsx', path: '/contacts/graph', title: '联系人分析（结构分段）', classification: 'local-first', sprint: '0117', reads: '域 dashboard-graph', offline: '「截至」' },
  { file: 'app/contacts/analysis/[dimension]/[bucketId].tsx', path: '/contacts/analysis/:dimension/:bucketId', title: '分组详情', classification: 'local-first', sprint: '0117', reads: '域 dashboard-graph，本机计算（非 ASCII 分组编号只解码一次，0131）', offline: '「截至」' },
  { file: 'app/events/[id].tsx', path: '/events/:id', title: '活动详情', classification: 'local-first', sprint: '0115', reads: '域 registered-events / event-registrations / event-published-results；未报名的活动读 /api/events/public/:id', offline: '「截至」；404 显示「活动已不存在」，5xx 显示「服务暂时不可用」（0131）；取消或被拒后显示中性说明和返回按钮（0131）；报名、签到需要联网' },
  { file: 'app/events/[id]/live.tsx', path: '/events/:id/live', title: '活动现场页', classification: 'local-first', sprint: '0115', reads: '域 event-published-results 等', offline: '「截至」；签到、交换名片、记笔记、约时间需要联网' },
  { file: 'app/(app)/schedule.tsx', path: '/schedule', title: '日历', classification: 'local-first', sprint: '0115', reads: '域 registered-events、tasks、personal-schedule', offline: '「截至」；点已报名活动进入 /events/:id（0131）' },
  { file: 'app/schedule/personal/[id].tsx', path: '/schedule/personal/:id', title: '个人日程详情', classification: 'local-first', sprint: '0108', reads: '域 personal-schedule', offline: '「截至」；编辑、改期需要联网' },
  { file: 'app/schedule/personal/[id]/edit.tsx', path: '/schedule/personal/:id/edit', title: '编辑个人日程', classification: 'local-first', sprint: '0108', reads: '域 personal-schedule', offline: '表单显示本机内容；保存需要联网' },
  { file: 'app/schedule/personal/new.tsx', path: '/schedule/personal/new', title: '新建个人日程', classification: 'local-first', sprint: '0108', reads: '域 personal-schedule（关联选项读本机联系人、笔记）', offline: '保存需要联网' },
  { file: 'app/tasks/personal.tsx', path: '/tasks/personal', title: '个人日程列表', classification: 'local-first', sprint: '0108', reads: '域 personal-schedule', offline: '「截至」' },
  { file: 'app/notes/index.tsx', path: '/notes', title: '笔记列表', classification: 'local-first', sprint: '0108', reads: '域 notes（浏览器版 0125 起）', offline: '「截至」；新建需要联网' },
  { file: 'app/notes/[id].tsx', path: '/notes/:id', title: '笔记详情', classification: 'local-first', sprint: '0108', reads: '域 notes；关联联系人读域 contacts（0116）', offline: '「截至」；编辑需要联网' },
  { file: 'app/notes/[id]/edit.tsx', path: '/notes/:id/edit', title: '编辑笔记', classification: 'local-first', sprint: '0108', reads: '域 notes', offline: '表单显示本机内容；保存需要联网' },
  { file: 'app/notes/new.tsx', path: '/notes/new', title: '新建笔记', classification: 'local-first', sprint: '0108', reads: '域 notes（草稿存本机）', offline: '可以写草稿；保存需要联网' },

  // ── this sprint: local-first ──
  { file: 'app/home.tsx', path: '/home', title: '首页（日程、待办、推荐活动、收件箱角标）', classification: 'local-first', sprint: '0131', reads: '日程读域 personal-schedule + registered-events，约谈读页面副本 home-schedule；待办读域 tasks；角标读域 inbox-notifications 的本机未读数；推荐活动读页面副本 event-recommendations', offline: '「截至」；推荐活动显示最近一次同步的结果；勾选完成待办需要联网' },
  { file: 'app/today.tsx', path: '/today', title: '今日待办', classification: 'local-first', sprint: '0131', reads: '页面副本 today-page（/api/today 第一页）', offline: '「截至」；新建、完成、接受建议需要联网' },
  { file: 'app/tasks.tsx', path: '/tasks', title: '待办（全部 / 关系 / 个人），含关系待办和待办建议', classification: 'local-first', sprint: '0131', reads: '列表读域 tasks（0087/0108）；关系待办读页面副本 relationship-tasks（/api/relationship-tasks/page 第一页）；待办建议读页面副本 task-suggestions（/api/task-suggestions/page 第一页）', offline: '「截至」；完成、重开需要联网' },
  { file: 'app/tasks/[id].tsx', path: '/tasks/:id', title: '待办详情', classification: 'local-first', sprint: '0131', reads: '域 tasks 的这一行；活动记录和提醒读网络', offline: '「截至」；待办内容来自本机；活动记录、提醒和所有修改需要联网' },
  { file: 'app/tasks/relationship/[id].tsx', path: '/tasks/relationship/:id', title: '关系待办详情（关系下一步）', classification: 'local-first', sprint: '0131', reads: '页面副本 relationship-lifecycle（/api/connections/:id/lifecycle，按关系保存最近打开的 20 个）', offline: '「截至」；打开过的关系显示本机副本；确认下一步需要联网；没打开过的显示「需要联网」' },
  { file: 'app/(app)/profile.tsx', path: '/profile', title: '我的资料', classification: 'local-first', sprint: '0131', reads: '页面副本 self-profile（/api/profile）；统计读域 contacts、tasks、personal-schedule；资料更新建议读网络', offline: '「截至」；编辑、上传名片或简历、建议需要联网' },
  { file: 'app/profile/preview.tsx', path: '/profile/preview', title: '资料预览', classification: 'local-first', sprint: '0131', reads: '页面副本 self-profile', offline: '「截至」' },
  { file: 'app/profile/tags.tsx', path: '/profile/tags', title: '资料标签', classification: 'local-first', sprint: '0131', reads: '页面副本 self-profile', offline: '「截至」；保存标签需要联网' },
  { file: 'app/agent.tsx', path: '/agent', title: 'Agent 动作中心', classification: 'local-first', sprint: '0131', reads: '页面副本 agent-actions（/api/agent/actions）', offline: '「截至」；确认、忽略需要联网' },
  { file: 'app/agent/actions.tsx', path: '/agent/actions', title: 'All Actions 账本', classification: 'local-first', sprint: '0131', reads: '页面副本 agent-ledger（/api/agent/ledger 最近 3 页）', offline: '「截至」；可以翻看本机保存的 3 页；确认、撤销需要联网' },
  { file: 'app/contacts/all-actions.tsx', path: '/contacts/all-actions', title: 'All Actions 账本（联系人入口）', classification: 'local-first', sprint: '0131', reads: '页面副本 agent-ledger', offline: '同 /agent/actions' },
  { file: 'app/schedule/meetings/[id].tsx', path: '/schedule/meetings/:id', title: '约谈详情', classification: 'local-first', sprint: '0131', reads: '页面副本 meeting-details（按约谈保存最近打开的 20 个）', offline: '「截至」；打开过的约谈显示本机副本；修改需要联网；没打开过的显示「需要联网」' },
  { file: 'app/schedule/events/[id].tsx', path: '/schedule/events/:id', title: '日历里的活动预览', classification: 'local-first', sprint: '0131', reads: '已报名的活动直接跳到 /events/:id（域 registered-events）；其他活动读 /api/events/public/:id', offline: '已报名的活动跳转后可离线；其他活动显示「需要联网」' },
  { file: 'app/(app)/events.tsx', path: '/events', title: '活动标签：活动列表和推荐', classification: 'local-first', sprint: '0131', reads: '页面副本 public-events（公开活动目录）和 event-recommendations', offline: '「截至」；显示最近一次看到的列表；报名需要联网' },
  { file: 'app/home/events.tsx', path: '/home/events', title: '推荐活动（旧入口）', classification: 'local-first', sprint: '0131', reads: '页面副本 public-events', offline: '「截至」；显示最近一次看到的列表' },

  // ── online-only ──
  { file: 'app/account.tsx', path: '/account', title: '账号与会话', classification: 'online-only', reasonCategory: 'credentials', reason: '账号、登录会话和退出都在服务器上确认', reads: '/api/account/me', offline: NEEDS_NETWORK },
  { file: 'app/account/login.tsx', path: '/account/login', title: '登录', classification: 'online-only', reasonCategory: 'credentials', reason: '提交密码需要服务器验证', reads: '/api/auth/*', offline: NEEDS_NETWORK },
  { file: 'app/account/signup.tsx', path: '/account/signup', title: '注册', classification: 'online-only', reasonCategory: 'credentials', reason: '建账号需要服务器', reads: '/api/auth/register', offline: NEEDS_NETWORK },
  { file: 'app/account/forgot-password.tsx', path: '/account/forgot-password', title: '忘记密码', classification: 'online-only', reasonCategory: 'credentials', reason: '发送重置邮件需要服务器', reads: '/api/auth/password-reset/request', offline: NEEDS_NETWORK },
  { file: 'app/account/reset-password.tsx', path: '/account/reset-password', title: '重置密码', classification: 'online-only', reasonCategory: 'credentials', reason: '重置令牌由服务器验证', reads: '/api/auth/password-reset/confirm', offline: NEEDS_NETWORK },
  { file: 'app/account/permissions.tsx', path: '/account/permissions', title: '数据授权（邮箱、日历）', classification: 'online-only', reasonCategory: 'credentials', reason: '第三方授权状态和授权流程在服务器上', reads: '/api/permissions', offline: NEEDS_NETWORK },
  { file: 'app/login-admin.tsx', path: '/login-admin', title: '管理员登录', classification: 'online-only', reasonCategory: 'admin', reason: '管理员凭据由服务器验证', reads: '/api/auth/*', offline: NEEDS_NETWORK },
  { file: 'app/admin.tsx', path: '/admin', title: '管理后台', classification: 'online-only', reasonCategory: 'admin', reason: '管理员工具，读全平台数据，不放进个人设备', reads: '/api/dashboard、/api/events、/api/profile', offline: NEEDS_NETWORK },
  { file: 'app/admin/access.tsx', path: '/admin/access', title: '管理后台：权限', classification: 'online-only', reasonCategory: 'admin', reason: '管理员工具', reads: '同 /admin', offline: NEEDS_NETWORK },
  { file: 'app/admin/events.tsx', path: '/admin/events', title: '管理后台：活动', classification: 'online-only', reasonCategory: 'admin', reason: '管理员工具', reads: '同 /admin', offline: NEEDS_NETWORK },
  { file: 'app/events/center.tsx', path: '/events/center', title: '运营活动中心（我的活动权限）', classification: 'online-only', reasonCategory: 'organizer-live', reason: '主办方和工作人员视图，按实时权限读取', reads: '/api/events/center', offline: NEEDS_NETWORK },
  { file: 'app/events/[id]/operations.tsx', path: '/events/:id/operations', title: '主办方运营台', classification: 'online-only', reasonCategory: 'organizer-live', reason: '主办方实时运营（设计案 C 类，永不落地）', reads: '/api/events/:id/operations/admin', offline: NEEDS_NETWORK },
  { file: 'app/events/[id]/operations/admission.tsx', path: '/events/:id/operations/admission', title: '报名审核', classification: 'online-only', reasonCategory: 'organizer-live', reason: '审核决定必须实时写入', reads: '/api/events/:id/admission/reviews', offline: NEEDS_NETWORK },
  { file: 'app/events/[id]/operations/check-in.tsx', path: '/events/:id/operations/check-in', title: '签到台', classification: 'online-only', reasonCategory: 'organizer-live', reason: '签到名单是工作人员数据，实时变化', reads: '/api/events/:id/operations/admin/check-ins', offline: NEEDS_NETWORK },
  { file: 'app/events/[id]/operations/experience.tsx', path: '/events/:id/operations/experience', title: '活动体验配置', classification: 'online-only', reasonCategory: 'organizer-live', reason: '主办方配置', reads: '/api/events/:id/experience', offline: NEEDS_NETWORK },
  { file: 'app/events/[id]/operations/roles.tsx', path: '/events/:id/operations/roles', title: '活动角色与权限', classification: 'online-only', reasonCategory: 'organizer-live', reason: '主办方权限管理', reads: '/api/events/:id/access/roles', offline: NEEDS_NETWORK },
  { file: 'app/events/[id]/analytics.tsx', path: '/events/:id/analytics', title: '活动数据分析', classification: 'online-only', reasonCategory: 'organizer-live', reason: '主办方统计，服务器实时聚合', reads: '/api/events/:id/analytics/*', offline: NEEDS_NETWORK },
  { file: 'app/events/[id]/register.tsx', path: '/events/:id/register', title: '报名问卷', classification: 'online-only', reasonCategory: 'paid-ai', reason: '报名是写入；问卷题目由付费 AI 生成并在服务器缓存', reads: '/api/events/public/:id、/api/events/:id/registration', offline: NEEDS_NETWORK },
  { file: 'app/contacts/new.tsx', path: '/contacts/new', title: '更多添加方式（QR、批量名片、外部导入、引荐、重复检查）', classification: 'online-only', reasonCategory: 'card-scan', reason: '名片识别要上传图片做 OCR；新建联系人是写入', reads: '/api/contact-drafts*', offline: NEEDS_NETWORK },
  { file: 'app/contacts/new/batch/[id].tsx', path: '/contacts/new/batch/:id', title: '名片批量识别（旧）', classification: 'online-only', reasonCategory: 'card-scan', reason: '批量识别在服务器进行', reads: '/api/contact-drafts/business-card/batches/:id', offline: NEEDS_NETWORK },
  { file: 'app/contacts/new/batch2/index.tsx', path: '/contacts/new/batch2', title: '名片批量识别', classification: 'online-only', reasonCategory: 'card-scan', reason: '批量识别在服务器进行', reads: '/api/contact-drafts/business-card/batches/v2', offline: NEEDS_NETWORK },
  { file: 'app/contacts/new/batch2/[id].tsx', path: '/contacts/new/batch2/:id', title: '名片批量识别结果', classification: 'online-only', reasonCategory: 'card-scan', reason: '识别结果和图片在服务器', reads: '/api/contact-drafts/business-card/batches/v2/:id', offline: NEEDS_NETWORK },
  { file: 'app/contacts/new/manual.tsx', path: '/contacts/new/manual', title: '手动添加（姓名先行，核对后保存）', classification: 'online-only', reasonCategory: 'card-scan', reason: '保存联系人是写入：先建草稿再确认', reads: '/api/contact-drafts/manual、/api/contact-drafts/:id/confirm', offline: NEEDS_NETWORK },
  { file: 'app/contacts/new/scan.tsx', path: '/contacts/new/scan', title: '扫描名片（拍照或选图，核对后保存）', classification: 'online-only', reasonCategory: 'card-scan', reason: '名片识别要上传图片做 OCR；保存联系人是写入', reads: '/api/contact-drafts/business-card/scan、/api/contacts/business-card/confirm', offline: NEEDS_NETWORK },
  { file: 'app/contacts/new/import/[id].tsx', path: '/contacts/new/import/:id', title: '名片导入进度', classification: 'online-only', reasonCategory: 'card-scan', reason: '导入任务在服务器运行', reads: '/api/contact-drafts/business-card/imports/:id', offline: NEEDS_NETWORK },
  { file: 'app/contacts/intros.tsx', path: '/contacts/intros', title: '引荐', classification: 'online-only', reasonCategory: 'server-computed', reason: '引荐候选由服务器跨账号实时计算', reads: '/api/contacts/intros/summary', offline: NEEDS_NETWORK },
  { file: 'app/contacts/matches.tsx', path: '/contacts/matches', title: '人脉需求匹配', classification: 'online-only', reasonCategory: 'server-computed', reason: '需求匹配由服务器按最新资料实时排序（0116 已定为需要联网）', reads: '/api/contacts/needs-matches、/api/profile', offline: NEEDS_NETWORK },
  { file: 'app/contacts/pipeline.tsx', path: '/contacts/pipeline', title: '关系推进看板', classification: 'local-first', sprint: '0137', reads: '域 contacts 的本机卡片；阶段分组使用 shared/compute/contact-pipeline；线上待处理事项仍读 /api/contacts/pipeline', offline: '「截至」；联系人阶段和数量由本机副本计算；待处理事项需要联网' },
  { file: 'app/invitations/[token].tsx', path: '/invitations/:token', title: '关系邀请', classification: 'online-only', reasonCategory: 'server-token', reason: '邀请链接由服务器验证后才能接受', reads: '/api/relationship-communication/invitations/:id', offline: NEEDS_NETWORK },
  { file: 'app/register.tsx', path: '/register', title: '邀请注册', classification: 'online-only', reasonCategory: 'server-token', reason: '邀请码由服务器验证', reads: '/api/events/public/:id、/api/profile', offline: NEEDS_NETWORK },
  { file: 'app/register/[code].tsx', path: '/register/:code', title: '邀请注册（带邀请码）', classification: 'online-only', reasonCategory: 'server-token', reason: '邀请码由服务器验证', reads: '同 /register', offline: NEEDS_NETWORK },
  { file: 'app/platform.tsx', path: '/platform', title: '平台工作台（公开活动审核队列）', classification: 'online-only', reasonCategory: 'admin', reason: '平台运营工具：审核导入的公开活动', reads: '/api/events/public', offline: NEEDS_NETWORK },
  { file: 'app/o/[slug].tsx', path: '/o/:slug', title: '主办方公开页', classification: 'online-only', reasonCategory: 'public-visitor', reason: '给未登录访客看的公开页，不属于任何账号的本机副本', reads: '/api/events/public', offline: NEEDS_NETWORK },
  { file: 'app/profile/edit.tsx', path: '/profile/edit', title: '编辑资料', classification: 'online-only', reasonCategory: 'credentials', reason: '编辑会话从服务器取最新版本并保存，离线编辑属于 0120 断网写', reads: '/api/profile', offline: NEEDS_NETWORK },
  { file: 'app/profile/more.tsx', path: '/profile/more', title: '补充资料（上传名片、简历）', classification: 'online-only', reasonCategory: 'paid-ai', reason: '名片和简历由付费 AI 抽取', reads: '/api/profile/extractions/*', offline: NEEDS_NETWORK },
  { file: 'app/profile/onboarding.tsx', path: '/profile/onboarding', title: '新用户引导', classification: 'online-only', reasonCategory: 'paid-ai', reason: '引导里的名片扫描和自我介绍草稿用付费 AI；每一步都保存到服务器（0106 已支持断网继续填写、联网后保存）', reads: '/api/profile、/api/profile/intro-draft', offline: '已填内容保留，显示「现在没有网络」提示，联网后继续（0106 行为）' },
  { file: 'app/profile/suggestions.tsx', path: '/profile/suggestions', title: '资料更新建议', classification: 'online-only', reasonCategory: 'paid-ai', reason: '建议由 AI 按最新活动生成，接受或忽略要实时写入', reads: '/api/profile/update-suggestions', offline: NEEDS_NETWORK },
];

export async function listRouteFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (/\.(tsx|ts|jsx|js)$/u.test(entry.name)) files.push(relative(root, path).split('\\').join('/'));
    }
  }
  await walk(join(root, 'app'));
  return files.sort();
}

export function auditPageOfflineInventory(routeFiles: readonly string[], entries: readonly PageOfflineEntry[]): string[] {
  const findings: string[] = [];
  const counts = new Map<string, number>();
  for (const entry of entries) counts.set(entry.file, (counts.get(entry.file) ?? 0) + 1);
  for (const [file, count] of counts) if (count > 1) findings.push(`DUPLICATE:${file}`);
  const routes = new Set(routeFiles);
  for (const file of routeFiles) if (!counts.has(file)) findings.push(`UNREGISTERED:${file}`);
  for (const entry of entries) {
    if (!routes.has(entry.file)) findings.push(`STALE:${entry.file}`);
    if (!entry.path.trim() || !entry.title.trim() || !entry.reads.trim() || !entry.offline.trim()) findings.push(`INCOMPLETE:${entry.file}`);
    if (entry.classification === 'local-first' && !entry.sprint) findings.push(`NO_SPRINT:${entry.file}`);
    if (entry.classification === 'online-only' && (!entry.reasonCategory || !entry.reason?.trim())) findings.push(`NO_REASON:${entry.file}`);
    if (entry.classification !== 'online-only' && (entry.reason || entry.reasonCategory)) findings.push(`REASON_ON_OFFLINE_PAGE:${entry.file}`);
  }
  return [...new Set(findings)].sort();
}

const CLASSIFICATION_LABELS: Record<PageOfflineClassification, string> = {
  'local-first': '能断网看（本地优先）',
  'online-only': '只能在线',
  'device-only': '不读账号数据（布局、跳转、本机设置）',
};

function cell(value: string): string {
  return value.replace(/\|/gu, '\\|').replace(/\n/gu, ' ');
}

export function renderPageInventoryMarkdown(entries: readonly PageOfflineEntry[]): string {
  const count = (predicate: (entry: PageOfflineEntry) => boolean) => entries.filter(predicate).length;
  const sprints = ['0108', '0115', '0116', '0117', '0118', '0119', '0125', '0131', '0137'] as const;
  const lines: string[] = [
    '# 全 App 页面离线清单',
    '',
    '> Sprint 0131 生成。数据来源是 `scripts/page-offline-inventory.ts`，本文件由 `npx tsx scripts/page-offline-inventory.ts --write` 生成，',
    '> `tests/page-offline-inventory.test.ts` 检查：`app/` 下每个路由都登记了归属、没有过期条目、本文件和登记表一致。新增路由不登记，测试就会失败。',
    '',
    '## 汇总',
    '',
    '| 归属 | 数量 |',
    '| --- | --- |',
    `| ${CLASSIFICATION_LABELS['local-first']} | ${count((entry) => entry.classification === 'local-first')} |`,
    ...sprints.map((sprint) => `| └ 由 Sprint ${sprint} 实现 | ${count((entry) => entry.classification === 'local-first' && entry.sprint === sprint)} |`).filter((line) => !line.endsWith('| 0 |')),
    `| ${CLASSIFICATION_LABELS['online-only']} | ${count((entry) => entry.classification === 'online-only')} |`,
    `| ${CLASSIFICATION_LABELS['device-only']} | ${count((entry) => entry.classification === 'device-only')} |`,
    `| 合计（路由文件） | ${entries.length} |`,
    '',
    '「本机副本」有两种：**同步域**（注册表 v2，服务器按租约增量下发，见 `repos/orbits/features/sync/domain-registry.ts`）和 **页面副本**（0131：服务器实时算出的页面，上次联网读到的那一份，',
    '按租约的授权纪元保存和清除，见 `src/data/sync/page-copies.ts` 和威胁模型第 2 节「页面副本」）。断网时页面顶部是 0108 的琥珀色提示条「无法连接 · 显示截至 X 的内容」，写入入口标「需要联网」。',
    '',
  ];
  for (const classification of ['local-first', 'online-only', 'device-only'] as const) {
    lines.push(`## ${CLASSIFICATION_LABELS[classification]}`, '');
    if (classification === 'online-only') {
      lines.push('| 路由 | 页面 | 原因 | 读取 | 断网时 |', '| --- | --- | --- | --- | --- |');
      for (const entry of entries.filter((candidate) => candidate.classification === classification)) {
        lines.push(`| \`${cell(entry.path)}\` | ${cell(entry.title)} | ${REASON_LABELS[entry.reasonCategory!]}：${cell(entry.reason!)} | ${cell(entry.reads)} | ${cell(entry.offline)} |`);
      }
    } else if (classification === 'local-first') {
      lines.push('| 路由 | 页面 | Sprint | 读取 | 断网时 |', '| --- | --- | --- | --- | --- |');
      for (const entry of entries.filter((candidate) => candidate.classification === classification)) {
        lines.push(`| \`${cell(entry.path)}\` | ${cell(entry.title)} | ${entry.sprint} | ${cell(entry.reads)} | ${cell(entry.offline)} |`);
      }
    } else {
      lines.push('| 路由 | 页面 | 读取 | 断网时 |', '| --- | --- | --- | --- |');
      for (const entry of entries.filter((candidate) => candidate.classification === classification)) {
        lines.push(`| \`${cell(entry.path)}\` | ${cell(entry.title)} | ${cell(entry.reads)} | ${cell(entry.offline)} |`);
      }
    }
    lines.push('');
  }
  lines.push('## 路由文件对照', '', '| 文件 | 路由 | 归属 |', '| --- | --- | --- |');
  for (const entry of [...entries].sort((left, right) => left.file.localeCompare(right.file))) {
    lines.push(`| \`${entry.file}\` | \`${cell(entry.path)}\` | ${entry.classification}${entry.sprint ? ` (${entry.sprint})` : ''} |`);
  }
  lines.push('');
  return lines.join('\n');
}

if (process.argv.includes('--write') && /page-offline-inventory\.ts$/u.test(process.argv[1] ?? '')) {
  const root = process.cwd();
  void writeFile(resolve(root, 'docs/offline/page-inventory.md'), renderPageInventoryMarkdown(PAGE_OFFLINE_INVENTORY))
    .then(() => console.log(`wrote docs/offline/page-inventory.md (${PAGE_OFFLINE_INVENTORY.length} routes)`));
}

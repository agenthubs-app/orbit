import { readdir, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

/**
 * Sprint 0131: the whole-App page offline inventory. Every route file under
 * app/ has exactly one entry, and every entry has an owner:
 *
 *   local-first   readable offline from the device copy; `sprint` names the
 *                 sprint that made it so (0108, 0115–0119, 0125, 0131; R05 for the
 *                 Task container, whose four segments are those pages).
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
  sprint?: '0108' | '0115' | '0116' | '0117' | '0118' | '0119' | '0125' | '0131' | '0137' | 'R05' | 'R17' | 'R11a' | 'R11b' | 'LF1' | 'LF2' | 'LF3';
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
  { file: 'app/_layout.tsx', path: '(根布局)', title: '根布局：会话恢复、错误边界、通知协调、底部标签栏（R05）', classification: 'device-only', reads: '无（会话恢复见威胁模型第 6 节）', offline: '按 0127 的离线冷启动身份进入' },
  { file: 'app/(app)/_layout.tsx', path: '(主页面分组)', title: '主页面分组的导航栈（底栏由根布局统一绘制，R05）', classification: 'device-only', reads: '无', offline: '照常显示' },
  { file: 'app/showcase/components/index.tsx', path: '/showcase/components', title: '组件库展示页（开发包和 TestFlight，R04；R31a 按 01-system 规格格重排）', classification: 'device-only', reads: '无（示例数据打包在 App 里）', offline: '照常显示' },
  { file: 'app/showcase/components/[section].tsx', path: '/showcase/components/[section]', title: '组件库展示页 · 单个规格格小节（开发包和 TestFlight，R31a 逐件对照）', classification: 'device-only', reads: '无（示例数据打包在 App 里）', offline: '照常显示' },
  { file: 'app/showcase/copy.tsx', path: '/showcase/copy', title: '标准用词展示页（开发包和 TestFlight，R03）', classification: 'device-only', reads: '无（标准用词打包在 App 里）', offline: '照常显示' },
  { file: 'app/showcase/icons.tsx', path: '/showcase/icons', title: '图标展示页（开发包和 TestFlight，R02）', classification: 'device-only', reads: '无（图标源打包在 App 里）', offline: '照常显示' },
  { file: 'app/+html.tsx', path: '(浏览器外壳)', title: '浏览器版 HTML 外壳', classification: 'device-only', reads: '无', offline: '照常加载' },
  { file: 'app/index.tsx', path: '/', title: '入口跳转', classification: 'device-only', reads: '无', offline: '跳到首页或登录页' },
  { file: 'app/help.tsx', path: '/help', title: '公开帮助与本地 FAQ（R18b）', classification: 'device-only', reads: '本地静态 FAQ；支持邮箱未配置', offline: '帮助、搜索与法务入口照常可用' },
  { file: 'app/legal/terms.tsx', path: '/legal/terms', title: '公开利用規約占位（R18b）', classification: 'device-only', reads: '静态发布前占位；正式正文待授权', offline: '占位照常可读；不代表发布就绪' },
  { file: 'app/legal/privacy.tsx', path: '/legal/privacy', title: '公开プライバシー占位（R18b）', classification: 'device-only', reads: '静态发布前占位；正式正文待授权', offline: '占位照常可读；不代表发布就绪' },
  { file: 'app/maintenance.tsx', path: '/maintenance', title: '公开维护状态（R18b）', classification: 'online-only', reasonCategory: 'server-computed', reason: '必须从公开版本接口实时确认 maintenance.active；不能凭缓存或网络错误展示维护', reads: 'GET /api/app/version', offline: '读取失败时不显示维护，返回安全首页' },
  { file: 'app/force-update.tsx', path: '/force-update', title: '强制更新状态（R18b）', classification: 'online-only', reasonCategory: 'server-computed', reason: '必须从公开版本接口实时确认 enforceMinimum 和最低版本，不能凭缓存或网络错误阻断', reads: 'GET /api/app/version；本地 App 版本；发布前配置的 App Store 链接', offline: '读取失败时安全放行，返回首页；正式强制更新开关保持关闭' },
  { file: 'app/start.tsx', path: '/start', title: '原生三步引导（R28）', classification: 'online-only', reasonCategory: 'server-computed', reason: '资料门禁和联系人／目标／计划进度需要服务端实时确认', reads: 'GET /api/profile、GET /api/guide/progress', offline: '读取失败时显示重试卡，不猜测已完成进度' },
  { file: 'app/[...legacy].tsx', path: '/*（旧链接或未知路由）', title: '已知旧深链跳转；未知路由显示 404（R18b）', classification: 'device-only', reads: '无', offline: '已知路由跳到对应新页面；未知路由提供首页与帮助出口' },
  { file: 'app/account/mobile-google.tsx', path: '/account/mobile-google', title: '旧 Google 登录链接跳转', classification: 'device-only', reads: '无', offline: '跳到登录页' },
  { file: 'app/events/[id]/attendees.tsx', path: '/events/:id/attendees', title: '旧参会者链接跳转到现场页', classification: 'device-only', reads: '无', offline: '跳到现场页（0115 可离线）' },
  { file: 'app/events/[id]/participants/[participantId].tsx', path: '/events/:id/participants/:participantId', title: '旧参会者链接跳转到现场资料面板', classification: 'device-only', reads: '无', offline: '跳到现场页（0115 可离线）' },
  { file: 'app/party.tsx', path: '/party', title: '旧派对模式跳转', classification: 'device-only', reads: '无', offline: '跳到现场页' },
  { file: 'app/party/checkin.tsx', path: '/party/checkin', title: '旧派对签到跳转', classification: 'device-only', reads: '无', offline: '跳到现场页' },
  { file: 'app/party/graph.tsx', path: '/party/graph', title: '旧派对关系图跳转', classification: 'device-only', reads: '无', offline: '跳到现场页' },
  { file: 'app/profile/continue.tsx', path: '/profile/continue', title: '补资料后继续跳转', classification: 'device-only', reads: '无', offline: '跳到目标页' },
  { file: 'app/followups.tsx', path: '/followups', title: '旧跟进入口，跳到 Task 的 To-do 段「关系」分组', classification: 'device-only', reads: '无（目标页见 app/task.tsx）', offline: '跳到 /task?seg=todo&scope=relationship（可离线）' },
  { file: 'app/settings.tsx', path: '/settings', title: '设置（语言、主题、系统权限、账户入口；R18a）', classification: 'local-first', sprint: '0131', reads: '本机语言、外观、可用系统权限；账户行可读页面副本 self-profile', offline: '本机设置照常可用；登出沿用未同步修改动作表' },
  { file: 'app/settings/[section].tsx', path: '/settings/:section', title: '尚未替换的设置占位（R18a）', classification: 'device-only', reads: '无', offline: '照常显示；静态路由优先' },
  { file: 'app/settings/help.tsx', path: '/settings/help', title: '设置中的公开帮助跳转（R18b）', classification: 'device-only', reads: '无', offline: '跳到 /help（可离线）' },
  { file: 'app/settings/terms.tsx', path: '/settings/terms', title: '设置中的公开利用規約跳转（R18b）', classification: 'device-only', reads: '无', offline: '跳到 /legal/terms（可离线）' },
  { file: 'app/settings/privacy.tsx', path: '/settings/privacy', title: '设置中的公开プライバシー跳转（R18b）', classification: 'device-only', reads: '无', offline: '跳到 /legal/privacy（可离线）' },
  { file: 'app/settings/notifications.tsx', path: '/settings/notifications', title: '通知设置（R14）', classification: 'online-only', reasonCategory: 'credentials', reason: '读取本账号实时推送偏好与设备状态；版本写入和撤销设备须联网', reads: '/api/inbox/delivery/preferences、/api/inbox/discovery/preferences、/api/devices/push', offline: NEEDS_NETWORK },
  { file: 'app/settings/notifications/secretary.tsx', path: '/settings/notifications/secretary', title: '秘書通知设置（R14）', classification: 'online-only', reasonCategory: 'credentials', reason: '读取本账号实时来源开关和推送上限；版本写入须联网', reads: '/api/inbox/delivery/preferences', offline: NEEDS_NETWORK },
  { file: 'app/settings/integrations.tsx', path: '/settings/integrations', title: '关联服务（R18a）', classification: 'online-only', reasonCategory: 'credentials', reason: '读取真实授权状态；连接和解除均需服务器', reads: '/api/integrations、/api/integrations/:provider', offline: NEEDS_NETWORK },
  { file: 'app/settings/iorbit.tsx', path: '/settings/iorbit', title: 'iOrbit 使用的信息（R18a）', classification: 'local-first', sprint: '0131', reads: '页面副本 self-profile；目标、记忆、搜索能力在线读取；语义搜索偏好仅本机', offline: '自我介绍副本可读；保存、AI 草稿和删除记忆需要联网' },
  { file: 'app/settings/api.tsx', path: '/settings/api', title: '服务器地址设置', classification: 'device-only', reads: '本机保存的服务器地址；「检查连接」按需读 /api/health', offline: '可以改地址；检查连接会显示连不上' },

  // ── earlier sprints: local-first ──
  { file: 'app/(app)/ai.tsx', path: '/ai', title: 'AI 标签：会话列表、今日摘要', classification: 'local-first', sprint: '0118', reads: '域 ai-sessions（0118）；今日摘要读页面副本 today-summary（0131）；按需「搜索更多」读 /api/ai/conversations/sessions；LF3：联系人数读域 contacts；计划概要与草稿读页面副本 home-plan-summary / plan-intakes（新鲜期 3 分钟）', offline: '「截至」提示条；会话列表和今日摘要是本机副本；本机只搜标题、第一个问题和最近一条（页面写明）；提新问题需要联网' },
  { file: 'app/ai/[id].tsx', path: '/ai/:id', title: 'AI 会话', classification: 'local-first', sprint: '0118', reads: '域 ai-session-messages（本设备打开过的 20 个会话）', offline: '「截至」；打开过的会话显示本机消息和缓存卡片；发送需要联网；从没打开过的会话需要联网' },
  { file: 'app/(app)/inbox.tsx', path: '/inbox', title: '收件箱（通知和对话）', classification: 'local-first', sprint: '0119', reads: '域 inbox-notifications（0118）、relationship-conversations / relationship-messages（0119）；LF3：通知和对话两份本机数据都可读时，未读数在本机算，不再每 15 秒轮询 /api/inbox/summary（本机副本由每 15 秒的同步条件读保持新鲜）', offline: '「截至」；标已读、处理、发送、存草稿需要联网；网络恢复时立即同步（0131）' },
  { file: 'app/inbox/[id].tsx', path: '/inbox/:id', title: '收件箱里的对话', classification: 'local-first', sprint: '0119', reads: '域 relationship-messages，按对话按页从本机读（0131）', offline: '「截至」；能往前翻到第一条；发送需要联网' },
  { file: 'app/inbox/notifications/[id].tsx', path: '/inbox/notifications/:id', title: '通知详情', classification: 'local-first', sprint: '0118', reads: '域 inbox-notifications', offline: '「截至」；三个处理动作需要联网' },
  { file: 'app/inbox/sources/[id].tsx', path: '/inbox/sources/:id', title: '通知来源（同通知详情）', classification: 'local-first', sprint: '0118', reads: '域 inbox-notifications', offline: '同通知详情' },
  { file: 'app/chat.tsx', path: '/chat', title: '对话列表', classification: 'local-first', sprint: '0119', reads: '域 relationship-conversations', offline: '「截至」' },
  { file: 'app/chat/[id].tsx', path: '/chat/:id', title: '对话', classification: 'local-first', sprint: '0119', reads: '域 relationship-messages，按对话按页从本机读（0131）', offline: '「截至」；发送需要联网' },
  { file: 'app/(app)/contacts.tsx', path: '/contacts', title: '人脈（一覧：页签、絞り込み、搜索；R11a）', classification: 'local-first', sprint: 'R11a', reads: '域 contacts、域 tasks（要フォロー）；目標に関係 / 跟进 id 读 /api/contacts/goal-related-ids 并缓存', offline: '「截至」；页签、絞り込み、本机搜索照常（计划 id 用上次缓存）' },
  { file: 'app/contacts/list.tsx', path: '/contacts/list', title: '旧联系人列表（R11a 起跳到 /contacts）', classification: 'local-first', sprint: 'R11a', reads: '无（跳转）', offline: '跳到 /contacts' },
  { file: 'app/contacts/[id].tsx', path: '/contacts/:id', title: '連絡先詳細（R11a）', classification: 'local-first', sprint: 'R11a', reads: '域 contacts；联网增强：/api/contacts/value-lines、/api/agent/plans/v2/contacts/:id/fit、/api/invite-codes/connections/:id', offline: '「截至」；联网增强整块隐藏；删除进本机队列' },
  { file: 'app/contacts/edit/[id].tsx', path: '/contacts/edit/:id', title: '連絡先の編集（R11a）', classification: 'local-first', sprint: 'R11a', reads: '域 contacts', offline: '「截至」；保存需要联网；删除进本机队列' },
  { file: 'app/dashboard.tsx', path: '/dashboard', title: '看板', classification: 'local-first', sprint: '0117', reads: '域 dashboard-graph，本机计算；来源审计改为点「运行来源审计」才读 /api/audit/provenance，上次结果是页面副本 provenance-audit（0131）', offline: '「截至」；重新计算、运行审计需要联网' },
  { file: 'app/contacts/dashboard.tsx', path: '/contacts/dashboard', title: '人脈分析（構造 / 機会 / インサイト，?tab=；10人未満は锁定；R11b）', classification: 'local-first', sprint: 'R11b', reads: 'LF3 起（0117 本机计算恢复）：構造・機会・インサイト由本机域 contacts（+ 目標に関係 id 缓存、域 tasks 的要フォロー）按共用规则 shared/compute/network-analysis-model.ts 在手机上算；/api/network/analysis 只为取计划需求（needs）读，保存在本机，新鲜期 10 分钟内不重读；服务器从没回应过时照旧读服务器；iOrbit の見立て读 /api/network/snapshot?lang=（只在 10 人以上读，不存本机）；見直す 写 /api/network/snapshot/recompute', offline: '离线提示条；分析用本机联系人现算（计划缺口用上次保存的计划需求）；見立て显示「読み込めませんでした」；見直す需要联网；从没联网读过时显示可重试的「人数を読み込めませんでした」' },
  { file: 'app/contacts/graph.tsx', path: '/contacts/graph', title: '旧关系图链接，跳到人脈分析「構造」（R11b）', classification: 'device-only', reads: '无（目标页见 app/contacts/dashboard.tsx）', offline: '跳到 /contacts/dashboard?tab=structure' },
  { file: 'app/contacts/analysis/[dimension]/[bucketId].tsx', path: '/contacts/analysis/:dimension/:bucketId', title: '人脈分析の名簿（段階の内訳、並び順、R11b）', classification: 'local-first', sprint: 'R11b', reads: 'LF3 起：名簿在手机上用本机联系人按共用规则算（每一页，さらに表示不走网络）；本机算不了时（浏览器无本机库或服务器从没回应）读 /api/network/analysis/people，10人未満读 /api/network/analysis 显示锁定', offline: '离线提示条；本机现算的名簿照常翻页；服务器路径时显示上次保存的第一页，さらに表示需要联网' },
  { file: 'app/events/[id].tsx', path: '/events/:id', title: 'イベント詳細（R27）', classification: 'local-first', sprint: 'LF2', reads: '/api/events/:id/overview；上次回应存为按活动的页面副本 event-overview（最近 20 个），打开时先显示副本再在线更新', offline: '「截至」显示上次看到的详情；从没打开过的活动显示「需要联网」并可重试；报名、取消、保存评估需要联网' },
  { file: 'app/events/[id]/live.tsx', path: '/events/:id/live', title: '会場モード（R27）', classification: 'local-first', sprint: 'LF2', reads: '/api/events/:id/venue；上次回应存为按活动的页面副本 event-venue（最近 10 个）：席・ラウンド・推荐・参加者', offline: '「截至」显示上次看到的会场内容；名刺交換、面談提案、メモ保存需要联网；从没打开过显示「需要联网」' },
  { file: 'app/(app)/schedule.tsx', path: '/schedule', title: '旧日历入口，跳到 Task 的カレンダー段（R05）', classification: 'device-only', reads: '无（目标页见 app/task.tsx）', offline: '跳到 /task?seg=calendar（可离线）' },
  { file: 'app/schedule/personal/[id].tsx', path: '/schedule/personal/:id', title: '个人日程详情', classification: 'local-first', sprint: '0108', reads: '域 personal-schedule', offline: '「截至」；编辑、改期需要联网' },
  { file: 'app/schedule/personal/[id]/edit.tsx', path: '/schedule/personal/:id/edit', title: '编辑个人日程', classification: 'local-first', sprint: '0108', reads: '域 personal-schedule', offline: '表单显示本机内容；保存需要联网' },
  { file: 'app/schedule/personal/new.tsx', path: '/schedule/personal/new', title: '新建个人日程', classification: 'local-first', sprint: '0108', reads: '域 personal-schedule（关联选项读本机联系人、笔记）', offline: '保存需要联网' },
  { file: 'app/tasks/personal.tsx', path: '/tasks/personal', title: '个人日程列表', classification: 'local-first', sprint: '0108', reads: '域 personal-schedule', offline: '「截至」' },
  { file: 'app/notes/index.tsx', path: '/notes', title: '笔记列表：不带参数跳到 Task 的メモ段（R05）；?contactId= 是某个联系人的笔记', classification: 'local-first', sprint: '0108', reads: '域 notes（浏览器版 0125 起）', offline: '「截至」；新建需要联网' },
  { file: 'app/notes/[id].tsx', path: '/notes/:id', title: '笔记详情', classification: 'local-first', sprint: '0108', reads: '域 notes；关联联系人读域 contacts（0116）', offline: '「截至」；编辑需要联网' },
  { file: 'app/notes/[id]/edit.tsx', path: '/notes/:id/edit', title: '编辑笔记', classification: 'local-first', sprint: '0108', reads: '域 notes', offline: '表单显示本机内容；保存需要联网' },
  { file: 'app/notes/new.tsx', path: '/notes/new', title: '新建笔记', classification: 'local-first', sprint: '0108', reads: '域 notes（草稿存本机）', offline: '可以写草稿；保存需要联网' },

  // ── this sprint: local-first ──
  { file: 'app/home.tsx', path: '/home', title: '首页（R10 组件：今日やること、プラン スコア、次のイベント、人脈、秘書から，及组件库）', classification: 'local-first', sprint: '0131', reads: 'LF1 起：人脈读域 contacts（共用目录规则算总数、本月新增、最近 4 人）；次のイベント读域 registered-events + event-registrations；秘書读域 inbox-notifications（共用 buildSecretaryPreview）；メモ读域 notes；今日やること读页面副本 todo-page + 域 tasks、日程读页面副本 home-schedule；プラン スコア、三步引导、今週、イベント推薦、今日の1問读页面副本 home-plan-summary / home-guide-progress / home-week / event-recommendations / completion-question，新鲜期 3–10 分钟内不重读、任何写入后作废；布局读本机缓存，新鲜期内不重读；浏览器无本机库时人脈/活动/秘書/メモ退回在线读', offline: '各卡「截至」：本机域照常显示；页面副本显示上次内容；回答今日の1問、改布局之外的写入需要联网（布局离线编辑进本机草稿）' },
  { file: 'app/today.tsx', path: '/today', title: '旧今日待办入口，跳到 Task 的 To-do 段（R05，添加框在段顶部）', classification: 'device-only', reads: '无（目标页见 app/task.tsx）', offline: '跳到 /task?seg=todo（可离线）' },
  { file: 'app/tasks.tsx', path: '/tasks', title: '旧待办入口，跳到 Task 的 To-do 段（R05，保留 scope / view）', classification: 'device-only', reads: '无（目标页见 app/task.tsx）', offline: '跳到 /task?seg=todo（可离线）' },
  { file: 'app/task.tsx', path: '/task', title: 'Task：カレンダー / To-do / プラン / メモ 四段（R05）；日历段 = 原日程页，To-do 段 = 添加框 + 原待办页，プラン段 = 目標入力、プラン概要或以前のプラン卡（R23 / R24 / R25），メモ段 = 原笔记页', classification: 'local-first', sprint: 'R05', reads: '日历段读域 registered-events、tasks、personal-schedule（0115）；To-do 段读域 tasks、页面副本 todo-page（R20a 首屏）以及旧 relationship-tasks、task-suggestions（0131，旧屏退役前）；メモ段读域 notes（0108）；プラン段读 /api/agent/plans/v2/summary、/api/agent/plans/intakes、/api/agent/plans/v2/:planId（R23 / R24）与 /api/agent/plans/legacy、/api/agent/plans/v2/quota（R25），不存本机', offline: '日历、To-do、メモ三段照常可读；To-do 显示上次副本和「截至」，跨本地零点整块标「以前の情報」；普通跟进任务可离线完成/延期入队，lifecycle 禁止；プラン段显示「オフラインでは見られません」' },
  { file: 'app/tasks/[id].tsx', path: '/tasks/:id', title: '待办详情', classification: 'local-first', sprint: '0131', reads: '域 tasks 的这一行；活动记录和提醒读网络', offline: '「截至」；待办内容来自本机；活动记录、提醒和所有修改需要联网' },
  { file: 'app/tasks/relationship/[id].tsx', path: '/tasks/relationship/:id', title: '关系待办详情（关系下一步）', classification: 'local-first', sprint: '0131', reads: '页面副本 relationship-lifecycle（/api/connections/:id/lifecycle，按关系保存最近打开的 20 个）', offline: '「截至」；打开过的关系显示本机副本；确认下一步需要联网；没打开过的显示「需要联网」' },
  { file: 'app/(app)/profile.tsx', path: '/profile', title: 'マイページ（R18a）', classification: 'local-first', sprint: '0131', reads: '页面副本 self-profile（/api/profile）；主办、参加、收件箱独立读真实摘要接口，失败隐藏该行', offline: '「截至」；编辑、上传名片或简历、建议需要联网' },
  { file: 'app/profile/preview.tsx', path: '/profile/preview', title: '资料预览', classification: 'local-first', sprint: '0131', reads: '页面副本 self-profile', offline: '「截至」' },
  { file: 'app/profile/tags.tsx', path: '/profile/tags', title: '资料标签', classification: 'local-first', sprint: '0131', reads: '页面副本 self-profile', offline: '「截至」；保存标签需要联网' },
  { file: 'app/agent.tsx', path: '/agent', title: '旧 Agent 动作入口，跳到 Task 的判断待ち', classification: 'device-only', reads: '无（目标页见 app/task.tsx）', offline: '跳到 /task?seg=todo&section=decisions（可离线）' },
  { file: 'app/agent/actions.tsx', path: '/agent/actions', title: '旧 All Actions 入口，跳到 Task 的判断待ち', classification: 'device-only', reads: '无（目标页见 app/task.tsx）', offline: '保留 entry 定位，跳到 /task?seg=todo&section=decisions（可离线）' },
  { file: 'app/contacts/all-actions.tsx', path: '/contacts/all-actions', title: '旧联系人 All Actions 入口，跳到 Task 的判断待ち', classification: 'device-only', reads: '无（目标页见 app/task.tsx）', offline: '保留 entry 定位，跳到 /task?seg=todo&section=decisions（可离线）' },
  { file: 'app/schedule/meetings/[id].tsx', path: '/schedule/meetings/:id', title: '约谈详情', classification: 'local-first', sprint: '0131', reads: '页面副本 meeting-details（按约谈保存最近打开的 20 个）', offline: '「截至」；打开过的约谈显示本机副本；修改需要联网；没打开过的显示「需要联网」' },
  { file: 'app/schedule/events/[id].tsx', path: '/schedule/events/:id', title: '日历里的活动预览', classification: 'local-first', sprint: '0131', reads: '已报名的活动直接跳到 /events/:id（域 registered-events）；其他活动读 /api/events/public/:id', offline: '已报名的活动跳转后可离线；其他活动显示「需要联网」' },
  { file: 'app/(app)/events.tsx', path: '/events', title: '活动标签：評価・参加予定・探す', classification: 'local-first', sprint: '0131', reads: 'LF2 起：評価列表、参加予定、過去的参加读页面副本 event-assessments / events-mine（upcoming、past），新鲜期 3 分钟内切换标签不重读，任何写入后作废；探す（R26 discover/search）在线', offline: '「截至」；評価与参加予定显示最近一次看到的列表（不再显示成空列表）；探す、评估新活动、报名需要联网' },
  { file: 'app/home/events.tsx', path: '/home/events', title: '推荐活动（旧入口）', classification: 'local-first', sprint: '0131', reads: '页面副本 public-events', offline: '「截至」；显示最近一次看到的列表' },

  // ── online-only ──
  { file: 'app/account.tsx', path: '/account', title: '账号与会话', classification: 'online-only', reasonCategory: 'credentials', reason: '账号、登录会话和退出都在服务器上确认', reads: '/api/account/me', offline: NEEDS_NETWORK },
  { file: 'app/account/login.tsx', path: '/account/login', title: '登录', classification: 'online-only', reasonCategory: 'credentials', reason: '提交密码需要服务器验证', reads: '/api/auth/*', offline: NEEDS_NETWORK },
  { file: 'app/account/signup.tsx', path: '/account/signup', title: '注册', classification: 'online-only', reasonCategory: 'credentials', reason: '建账号需要服务器', reads: '/api/auth/register', offline: NEEDS_NETWORK },
  { file: 'app/account/forgot-password.tsx', path: '/account/forgot-password', title: '忘记密码', classification: 'online-only', reasonCategory: 'credentials', reason: '发送重置邮件需要服务器', reads: '/api/auth/password-reset/request', offline: NEEDS_NETWORK },
  { file: 'app/account/reset-password.tsx', path: '/account/reset-password', title: '重置密码', classification: 'online-only', reasonCategory: 'credentials', reason: '重置令牌由服务器验证', reads: '/api/auth/password-reset/confirm', offline: NEEDS_NETWORK },
  { file: 'app/account/permissions.tsx', path: '/account/permissions', title: '旧权限页 → 设置（R18a）', classification: 'device-only', reads: '无', offline: '跳到 /settings 内联系统权限' },
  { file: 'app/account/exports.tsx', path: '/account/exports', title: '账户数据导出（R18c）', classification: 'online-only', reasonCategory: 'credentials', reason: '导出任务、下载资格和期限由服务器按当前账号验证', reads: '/api/account/exports、/api/account/exports/:id/download', offline: NEEDS_NETWORK },
  { file: 'app/account/deletion.tsx', path: '/account/deletion', title: '退会申请（R18c）', classification: 'online-only', reasonCategory: 'credentials', reason: '近期再认证与退会状态需服务器实时验证', reads: '/api/account/deletion-request、/method、/reauth', offline: NEEDS_NETWORK },
  { file: 'app/account/pending.tsx', path: '/account/pending', title: '退会冷静期与取消（R18c）', classification: 'online-only', reasonCategory: 'credentials', reason: '取消资格与清除领取状态由服务器判定', reads: '/api/account/deletion-request', offline: NEEDS_NETWORK },
  { file: 'app/account/deleted.tsx', path: '/account/deleted', title: '退会完成通用页（R18c）', classification: 'device-only', reads: '无个人数据', offline: '静态页可查看' },
  { file: 'app/login-admin.tsx', path: '/login-admin', title: '后台登录入口', classification: 'online-only', reasonCategory: 'credentials', reason: '公开入口先探测连接；登录走现有账号验证', reads: '/api/health（公开入口探测）；登录提交走既有 /api/auth/*', offline: NEEDS_NETWORK },
  { file: 'app/admin.tsx', path: '/admin', title: '当前账号后台概览', classification: 'online-only', reasonCategory: 'admin', reason: '当前账号活动与资料从服务器只读获取，不保存为本机副本', reads: '/api/dashboard、/api/events、/api/profile', offline: NEEDS_NETWORK },
  { file: 'app/admin/access.tsx', path: '/admin/access', title: '后台登录入口', classification: 'online-only', reasonCategory: 'credentials', reason: '公开入口先探测连接；登录走现有账号验证，不读取后台私有资料', reads: '/api/health（公开入口探测）；登录提交走既有 /api/auth/*', offline: NEEDS_NETWORK },
  { file: 'app/admin/events.tsx', path: '/admin/events', title: '当前账号活动记录', classification: 'online-only', reasonCategory: 'admin', reason: '当前账号活动从服务器只读获取，不提供批准或驳回', reads: '/api/events、/api/profile、/api/dashboard', offline: NEEDS_NETWORK },
  { file: 'app/events/center.tsx', path: '/events/center', title: '運営センター（R17：主催イベント · 対応 · PC リンク）', classification: 'online-only', reasonCategory: 'organizer-live', reason: '主办方视图，按实时权限由服务器计算行与待办', reads: '/api/host/center', offline: NEEDS_NETWORK },
  { file: 'app/events/[id]/operations.tsx', path: '/events/:id/operations', title: 'イベント運営（R17：概要 / マッチング / 参加者 / レポート摘要，?seg=）', classification: 'online-only', reasonCategory: 'organizer-live', reason: '主办方实时运营（设计案 C 类，永不落地）', reads: '/api/host/events/:id/overview、/matching、/people', offline: NEEDS_NETWORK },
  { file: 'app/events/[id]/operations/admission.tsx', path: '/events/:id/operations/admission', title: '旧报名审核链接跳转到イベント運営「参加者」段（R17）', classification: 'device-only', reads: '无', offline: '跳到运营台（运营台需要联网）' },
  { file: 'app/events/[id]/operations/check-in.tsx', path: '/events/:id/operations/check-in', title: '受付（R17：名前検索 · 到着 · 取り消す · 当日枠 · QR）', classification: 'local-first', sprint: 'R17', reads: '/api/host/events/:id/kiosk（在线）；本机名单缓存 kiosk_roster（expo-sqlite，GET /kiosk/roster 成功后才存，TTL = cacheUntil，没有权限即清）', offline: '用本机名单搜索并记到着；到着进本机队列（expo-sqlite），联网后按幂等键补发；撤销与当日枠需要联网' },
  { file: 'app/events/[id]/operations/experience.tsx', path: '/events/:id/operations/experience', title: '旧活动体验配置链接跳转到イベント運営「概要」段（R17）', classification: 'device-only', reads: '无', offline: '跳到运营台（运营台需要联网）' },
  { file: 'app/events/[id]/operations/roles.tsx', path: '/events/:id/operations/roles', title: '旧角色与权限链接跳转到イベント運営「概要」段（R17）', classification: 'device-only', reads: '无', offline: '跳到运营台（运营台需要联网）' },
  { file: 'app/events/[id]/analytics.tsx', path: '/events/:id/analytics', title: '旧活动数据分析链接跳转到イベント運営「レポート」段（R17）', classification: 'device-only', reads: '无', offline: '跳到运营台（运营台需要联网）' },
  { file: 'app/events/center/new.tsx', path: '/events/center/new', title: 'イベントを作成 → 「PC が便利です」卡（R17，App 不建活动）', classification: 'online-only', reasonCategory: 'organizer-live', reason: 'PC 链接由服务器写进本人收件箱', reads: 'POST /api/host/desktop-link', offline: NEEDS_NETWORK },
  { file: 'app/events/center/profiles.tsx', path: '/events/center/profiles', title: '主催者ページ一覧 → 「PC が便利です」卡（R17）', classification: 'online-only', reasonCategory: 'organizer-live', reason: 'PC 链接由服务器写进本人收件箱', reads: 'POST /api/host/desktop-link', offline: NEEDS_NETWORK },
  { file: 'app/events/center/profiles/[id].tsx', path: '/events/center/profiles/:id', title: '主催者ページ編集 → 「PC が便利です」卡（R17）', classification: 'online-only', reasonCategory: 'organizer-live', reason: 'PC 链接由服务器写进本人收件箱', reads: 'POST /api/host/desktop-link', offline: NEEDS_NETWORK },
  { file: 'app/events/[id]/edit.tsx', path: '/events/:id/edit', title: '基本情報を編集 → 「PC が便利です」卡（R17）', classification: 'online-only', reasonCategory: 'organizer-live', reason: 'PC 链接由服务器写进本人收件箱', reads: 'POST /api/host/desktop-link', offline: NEEDS_NETWORK },
  { file: 'app/host/join.tsx', path: '/host/join', title: '共同運営に参加 · コード入力（R17）', classification: 'online-only', reasonCategory: 'server-token', reason: '招待コード由服务器验证', reads: '—', offline: NEEDS_NETWORK },
  { file: 'app/host/join/[code].tsx', path: '/host/join/:code', title: '共同運営に参加 · 招待の着地（R17）', classification: 'online-only', reasonCategory: 'server-token', reason: '招待由服务器验证并授予', reads: '/api/host/cohost-invites/:code', offline: NEEDS_NETWORK },
  { file: 'app/e/[slug].tsx', path: '/e/:slug', title: '申込ページ短链 → R27 活动详情（R17）', classification: 'online-only', reasonCategory: 'server-token', reason: '短链由服务器解析', reads: '/e/:slug（跟随重定向）', offline: NEEDS_NETWORK },
  { file: 'app/search.tsx', path: '/search', title: '検索（人・イベント・会話；R30）', classification: 'online-only', reasonCategory: 'server-computed', reason: '搜索、排序与命中范围在服务器计算；查询与结果不存本机，最近搜索只存这台设备', reads: '/api/search/global', offline: NEEDS_NETWORK },
  { file: 'app/events/[id]/prep.tsx', path: '/events/:id/prep', title: '会う準備（R27）', classification: 'online-only', reasonCategory: 'server-computed', reason: '会いたい人与话しかけ方由规则在服务器计算；名刺の残り只存本机', reads: '/api/events/:id/prep', offline: NEEDS_NETWORK },
  { file: 'app/events/[id]/after.tsx', path: '/events/:id/after', title: '会後のふりかえり（R27）', classification: 'online-only', reasonCategory: 'server-computed', reason: 'まとめ与次の一手由服务器生成；确定是写入', reads: '/api/events/:id/after', offline: NEEDS_NETWORK },
  { file: 'app/events/[id]/register.tsx', path: '/events/:id/register', title: '参加登録（R27）', classification: 'online-only', reasonCategory: 'paid-ai', reason: '报名是写入；问题来自 AI 访谈（≤5 问），自己紹介草稿由 AI 生成', reads: '/api/events/:id/join/*、/api/events/:id/overview', offline: NEEDS_NETWORK },
  { file: 'app/contacts/new.tsx', path: '/contacts/new', title: '人脈を追加（名刺をスキャン、手入力、確認待ちの下書き件数；R12）', classification: 'online-only', reasonCategory: 'card-scan', reason: '下書き件数和各入口的后续操作都在服务器进行', reads: '/api/contact-drafts', offline: NEEDS_NETWORK },
  { file: 'app/events/assess.tsx', path: '/events/assess', title: 'イベント評価の入力（URL / ポスター / 3項目 / 参加コード；R26）', classification: 'online-only', reasonCategory: 'card-scan', reason: '读取页面与评分在服务器进行', reads: '/api/events/assessments、/api/events/assessments/posters', offline: NEEDS_NETWORK },
  { file: 'app/events/assessments/[id].tsx', path: '/events/assessments/[id]', title: '評価結果 / 読み取れない時（R26）', classification: 'online-only', reasonCategory: 'card-scan', reason: '分数按当前计划在服务器重算', reads: '/api/events/assessments/[id]', offline: NEEDS_NETWORK },
  { file: 'app/contacts/new/manual.tsx', path: '/contacts/new/manual', title: '手入力（名字即可保存，即时查重与统合，5 秒撤销；R12）', classification: 'online-only', reasonCategory: 'card-scan', reason: '保存联系人与查重是服务器写入 / 查询', reads: '/api/contacts/manual、/api/contacts/manual/duplicates、/api/contacts/manual/organizations、/api/events', offline: NEEDS_NETWORK },
  { file: 'app/contacts/new/scan.tsx', path: '/contacts/new/scan', title: '名刺をスキャン（はじめての方へ、相机权限、表 / 裏连拍、相册多选，建 v2 批次上传；R12）', classification: 'online-only', reasonCategory: 'card-scan', reason: '名片识别要上传图片在服务器读取', reads: '/api/contact-drafts/business-card/batches/v2', offline: NEEDS_NETWORK },
  { file: 'app/contacts/new/scan/[batchId].tsx', path: '/contacts/new/scan/:batchId', title: '名刺の読み取り → 自動で人脈へ → まとめて確認 → 完成（R12）', classification: 'online-only', reasonCategory: 'card-scan', reason: '读取在服务器进行，确认是写入', reads: '/api/contact-drafts/business-card/batches/v2/:id、/api/agent/event-attribution/candidates', offline: NEEDS_NETWORK },
  { file: 'app/contacts/new/drafts.tsx', path: '/contacts/new/drafts', title: '確認待ちの下書き（确认 / 丢弃，?eventId= 参加者取り込み；R12）', classification: 'online-only', reasonCategory: 'card-scan', reason: '草稿队列与确认在服务器', reads: '/api/contact-drafts、/api/contact-drafts/event-attendees/import', offline: NEEDS_NETWORK },
  { file: 'app/contacts/new/import/index.tsx', path: '/contacts/new/import', title: '取り込み（連絡先：説明 → 権限 → 選ぶ → 取り込み中；LinkedIn：3 ステップ → CSV / ZIP を選ぶ；R16）', classification: 'online-only', reasonCategory: 'server-computed', reason: '导入批次在服务器建立与查重；只上传选中的人', reads: '/api/contacts/import', offline: NEEDS_NETWORK },
  { file: 'app/contacts/new/import/[importId].tsx', path: '/contacts/new/import/:importId', title: '取り込み · まとめて確認 → 完成（R16）', classification: 'online-only', reasonCategory: 'server-computed', reason: '合并确认与提交是服务器写入', reads: '/api/contacts/import/:id、/api/contacts/import/:id/rows、/api/contacts/import/:id/commit', offline: NEEDS_NETWORK },
  { file: 'app/contacts/new/invite.tsx', path: '/contacts/new/invite', title: '招待コード · 発出方（説明、QR・コード・リンク、メッセージの下書き、共有する項目、無効にする、これまでのコード；R15）', classification: 'online-only', reasonCategory: 'server-token', reason: '发码、作废与履历都在服务器', reads: '/api/invite-codes、/api/invite-codes/current、/api/invite-codes/:code/revoke、/api/profile', offline: NEEDS_NETWORK },
  { file: 'app/i/[code].tsx', path: '/i/:code', title: '招待コード · 受け取る側（公开：打开、登录回跳、简短资料、共享项目、つながる、各异常态；R15）', classification: 'online-only', reasonCategory: 'server-token', reason: '邀请码由服务器验证，连接是服务器写入', reads: '/api/invite-codes/:code/preview、/api/invite-codes/:code/redeem、/api/profile、/api/contacts/manual/duplicates', offline: NEEDS_NETWORK },
  { file: 'app/i/index.tsx', path: '/i', title: '招待コードを入力（公开，手输 8 位码后打开 /i/:code；R15）', classification: 'online-only', reasonCategory: 'server-token', reason: '输入的码要到服务器验证', reads: '同 /i/:code', offline: NEEDS_NETWORK },
  { file: 'app/register.tsx', path: '/register', title: '参加コード入力へ（R27 跳转）', classification: 'online-only', reasonCategory: 'server-token', reason: '跳到参加コード入力；コード由服务器验证', reads: '—', offline: NEEDS_NETWORK },
  { file: 'app/register/[code].tsx', path: '/register/:code', title: '参加コード着地（R27）', classification: 'online-only', reasonCategory: 'server-token', reason: '参加コード由服务器解析', reads: '/api/events/by-code/:code', offline: NEEDS_NETWORK },
  { file: 'app/plans/flow/[intakeId].tsx', path: '/plans/flow/:intakeId', title: '计划生成流程：背景确认、≤5 问、前提、初版、AI 修正（R23）', classification: 'online-only', reasonCategory: 'paid-ai', reason: '背景下书、选题、初版和修正由付费 AI 在服务器生成，每一步都要实时写入', reads: '/api/agent/plans/intakes/:id、/api/agent/plans/drafts/:id', offline: NEEDS_NETWORK },
  { file: 'app/plans/drafts/[draftId]/edit.tsx', path: '/plans/drafts/:draftId/edit', title: '计划手动编辑（1 次，保存即确定，R23）', classification: 'online-only', reasonCategory: 'server-computed', reason: '保存即确定计划，要和服务器上的草稿版本核对', reads: '/api/agent/plans/drafts/:id', offline: NEEDS_NETWORK },
  { file: 'app/plans/[planId]/types/[itemId].tsx', path: '/plans/:planId/types/:itemId', title: '人物类型详情：候补、记录加分、跳过、面谈提案与依頼文草稿（R24）', classification: 'online-only', reasonCategory: 'server-computed', reason: '分数、候补和活动分由服务器按最新记录计算，记录与撤销要实时写入', reads: '/api/agent/plans/v2/:planId/types/:itemId、/api/agent/plans/v2/:planId', offline: NEEDS_NETWORK },
  { file: 'app/plans/[planId]/review.tsx', path: '/plans/:planId/review', title: '计划见直：确认前提、AI 修正（逐条 ✓/✕）、见直后的手动编辑与确定（R25）', classification: 'online-only', reasonCategory: 'paid-ai', reason: '前提预标和修正案由付费 AI 在服务器生成，送出要扣本月配额，确定要和服务器上的计划版本核对', reads: '/api/agent/plans/v2/:planId/reviews/current、/api/agent/plans/drafts/:id/review、/api/agent/plans/v2/:planId', offline: NEEDS_NETWORK },
  { file: 'app/plans/[planId]/done.tsx', path: '/plans/:planId/done', title: '目标达成的完成页与下一目标候选（R25）', classification: 'online-only', reasonCategory: 'server-computed', reason: '完成页数字由服务器按定格的分数计算，下一目标候选由 AI 在服务器生成，选了要实时新建生成流程', reads: '/api/agent/plans/v2/:planId/achievement、/api/agent/plans/v2/:planId/next-goals、/api/agent/plans/v2/quota', offline: NEEDS_NETWORK },
  { file: 'app/plans/[planId]/next.tsx', path: '/plans/:planId/next', title: '下一目标候选（R25，b4 #26 独立页）', classification: 'online-only', reasonCategory: 'server-computed', reason: '下一目标候选由 AI 在服务器生成，选了要实时新建生成流程', reads: '/api/agent/plans/v2/:planId/next-goals、/api/agent/plans/v2/quota', offline: NEEDS_NETWORK },
  { file: 'app/plans/legacy/[planId].tsx', path: '/plans/legacy/:planId', title: '以前的计划：v1 计划只读详情（R25）', classification: 'online-only', reasonCategory: 'server-computed', reason: '旧计划只在服务器保存，不存本机；只读，不提供编辑', reads: '/api/agent/plans/legacy/:planId', offline: NEEDS_NETWORK },
  { file: 'app/platform.tsx', path: '/platform', title: '公开活动目录', classification: 'online-only', reasonCategory: 'server-computed', reason: '公开活动由服务器实时提供，只读展示', reads: '/api/events/public', offline: NEEDS_NETWORK },
  { file: 'app/o/[slug].tsx', path: '/o/:slug', title: '公開主催者ページ（R17）', classification: 'online-only', reasonCategory: 'public-visitor', reason: '公开主办方页面，不属于账号数据', reads: '/api/organizers/by-slug/:slug', offline: NEEDS_NETWORK },
  { file: 'app/profile/edit.tsx', path: '/profile/edit', title: '编辑资料', classification: 'online-only', reasonCategory: 'credentials', reason: '编辑会话从服务器取最新版本并保存，离线编辑属于 0120 断网写', reads: '/api/profile', offline: NEEDS_NETWORK },
  { file: 'app/profile/more.tsx', path: '/profile/more', title: '旧补充资料 → 编辑（R18a）', classification: 'device-only', reads: '无', offline: '跳到 /profile/edit；编辑页需要联网' },
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

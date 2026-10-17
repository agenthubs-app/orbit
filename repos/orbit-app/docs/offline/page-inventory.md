# 全 App 页面离线清单

> Sprint 0131 生成。数据来源是 `scripts/page-offline-inventory.ts`，本文件由 `npx tsx scripts/page-offline-inventory.ts --write` 生成，
> `tests/page-offline-inventory.test.ts` 检查：`app/` 下每个路由都登记了归属、没有过期条目、本文件和登记表一致。新增路由不登记，测试就会失败。

## 汇总

| 归属 | 数量 |
| --- | --- |
| 能断网看（本地优先） | 40 |
| └ 由 Sprint 0108 实现 | 8 |
| └ 由 Sprint 0117 实现 | 4 |
| └ 由 Sprint 0118 实现 | 4 |
| └ 由 Sprint 0119 实现 | 4 |
| └ 由 Sprint 0131 实现 | 13 |
| └ 由 Sprint 0137 实现 | 1 |
| 只能在线 | 52 |
| 不读账号数据（布局、跳转、本机设置） | 27 |
| 合计（路由文件） | 119 |

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
| `/contacts` | 人脈（一覧：页签、絞り込み、搜索；R11a） | R11a | 域 contacts、域 tasks（要フォロー）；目標に関係 / 跟进 id 读 /api/contacts/goal-related-ids 并缓存 | 「截至」；页签、絞り込み、本机搜索照常（计划 id 用上次缓存） |
| `/contacts/list` | 旧联系人列表（R11a 起跳到 /contacts） | R11a | 无（跳转） | 跳到 /contacts |
| `/contacts/:id` | 連絡先詳細（R11a） | R11a | 域 contacts；联网增强：/api/contacts/value-lines、/api/agent/plans/v2/contacts/:id/fit、/api/invite-codes/connections/:id | 「截至」；联网增强整块隐藏；删除进本机队列 |
| `/contacts/edit/:id` | 連絡先の編集（R11a） | R11a | 域 contacts | 「截至」；保存需要联网；删除进本机队列 |
| `/dashboard` | 看板 | 0117 | 域 dashboard-graph，本机计算；来源审计改为点「运行来源审计」才读 /api/audit/provenance，上次结果是页面副本 provenance-audit（0131） | 「截至」；重新计算、运行审计需要联网 |
| `/contacts/dashboard` | 联系人分析 | 0117 | 域 dashboard-graph；AI 报告读 /api/mobile/contacts-dashboard?view=analysis | 「截至」；去 AI 分析需要联网 |
| `/contacts/graph` | 联系人分析（结构分段） | 0117 | 域 dashboard-graph | 「截至」 |
| `/contacts/analysis/:dimension/:bucketId` | 分组详情 | 0117 | 域 dashboard-graph，本机计算（非 ASCII 分组编号只解码一次，0131） | 「截至」 |
| `/schedule/personal/:id` | 个人日程详情 | 0108 | 域 personal-schedule | 「截至」；编辑、改期需要联网 |
| `/schedule/personal/:id/edit` | 编辑个人日程 | 0108 | 域 personal-schedule | 表单显示本机内容；保存需要联网 |
| `/schedule/personal/new` | 新建个人日程 | 0108 | 域 personal-schedule（关联选项读本机联系人、笔记） | 保存需要联网 |
| `/tasks/personal` | 个人日程列表 | 0108 | 域 personal-schedule | 「截至」 |
| `/notes` | 笔记列表：不带参数跳到 Task 的メモ段（R05）；?contactId= 是某个联系人的笔记 | 0108 | 域 notes（浏览器版 0125 起） | 「截至」；新建需要联网 |
| `/notes/:id` | 笔记详情 | 0108 | 域 notes；关联联系人读域 contacts（0116） | 「截至」；编辑需要联网 |
| `/notes/:id/edit` | 编辑笔记 | 0108 | 域 notes | 表单显示本机内容；保存需要联网 |
| `/notes/new` | 新建笔记 | 0108 | 域 notes（草稿存本机） | 可以写草稿；保存需要联网 |
| `/home` | 首页（日程、待办、推荐活动、收件箱角标） | 0131 | 日程读域 personal-schedule + registered-events，约谈读页面副本 home-schedule；待办读域 tasks；角标读域 inbox-notifications 的本机未读数；推荐活动读页面副本 event-recommendations | 「截至」；推荐活动显示最近一次同步的结果；勾选完成待办需要联网 |
| `/task` | Task：カレンダー / To-do / プラン / メモ 四段（R05）；日历段 = 原日程页，To-do 段 = 添加框 + 原待办页，プラン段 = 目標入力、プラン概要或以前のプラン卡（R23 / R24 / R25），メモ段 = 原笔记页 | R05 | 日历段读域 registered-events、tasks、personal-schedule（0115）；To-do 段读域 tasks 和页面副本 relationship-tasks、task-suggestions（0131）；メモ段读域 notes（0108）；プラン段读 /api/agent/plans/v2/summary、/api/agent/plans/intakes、/api/agent/plans/v2/:planId（R23 / R24）与 /api/agent/plans/legacy、/api/agent/plans/v2/quota（R25），不存本机 | 日历、To-do、メモ三段照常可读（「截至」）；プラン段显示「オフラインでは見られません」；添加 To-do 离线进本机队列，其余新建需要联网 |
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
| `/events/:id/operations/check-in` | 受付（R17：名前検索 · 到着 · 取り消す · 当日枠 · QR） | R17 | /api/host/events/:id/kiosk（在线）；本机名单缓存 kiosk_roster（expo-sqlite，GET /kiosk/roster 成功后才存，TTL = cacheUntil，没有权限即清） | 用本机名单搜索并记到着；到着进本机队列（expo-sqlite），联网后按幂等键补发；撤销与当日枠需要联网 |
| `/contacts/pipeline` | 关系推进看板 | 0137 | 域 contacts 的本机卡片；阶段分组使用 shared/compute/contact-pipeline；线上待处理事项仍读 /api/contacts/pipeline | 「截至」；联系人阶段和数量由本机副本计算；待处理事项需要联网 |

## 只能在线

| 路由 | 页面 | 原因 | 读取 | 断网时 |
| --- | --- | --- | --- | --- |
| `/events/:id` | イベント詳細（R27） | 需要服务器实时计算：评估分数与「会えそうな人」按当前计划在服务器计算 | /api/events/:id/overview | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/events/:id/live` | 会場モード（R27） | 需要服务器实时计算：席・ラウンド・推荐由主办方发布的结果在服务器组合；名刺交換是写入 | /api/events/:id/venue | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
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
| `/events/center` | 運営センター（R17：主催イベント · 対応 · PC リンク） | 主办方实时运营：主办方视图，按实时权限由服务器计算行与待办 | /api/host/center | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/events/:id/operations` | イベント運営（R17：概要 / マッチング / 参加者 / レポート摘要，?seg=） | 主办方实时运营：主办方实时运营（设计案 C 类，永不落地） | /api/host/events/:id/overview、/matching、/people | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/events/center/new` | イベントを作成 → 「PC が便利です」卡（R17，App 不建活动） | 主办方实时运营：PC 链接由服务器写进本人收件箱 | POST /api/host/desktop-link | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/events/center/profiles` | 主催者ページ一覧 → 「PC が便利です」卡（R17） | 主办方实时运营：PC 链接由服务器写进本人收件箱 | POST /api/host/desktop-link | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/events/center/profiles/:id` | 主催者ページ編集 → 「PC が便利です」卡（R17） | 主办方实时运营：PC 链接由服务器写进本人收件箱 | POST /api/host/desktop-link | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/events/:id/edit` | 基本情報を編集 → 「PC が便利です」卡（R17） | 主办方实时运营：PC 链接由服务器写进本人收件箱 | POST /api/host/desktop-link | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/host/join` | 共同運営に参加 · コード入力（R17） | 需要服务器验证链接或邀请码：招待コード由服务器验证 | — | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/host/join/:code` | 共同運営に参加 · 招待の着地（R17） | 需要服务器验证链接或邀请码：招待由服务器验证并授予 | /api/host/cohost-invites/:code | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/e/:slug` | 申込ページ短链 → R27 活动详情（R17） | 需要服务器验证链接或邀请码：短链由服务器解析 | /e/:slug（跟随重定向） | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/search` | 検索（人・イベント・会話；R30） | 需要服务器实时计算：搜索、排序与命中范围在服务器计算；查询与结果不存本机，最近搜索只存这台设备 | /api/search/global | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/events/:id/prep` | 会う準備（R27） | 需要服务器实时计算：会いたい人与话しかけ方由规则在服务器计算；名刺の残り只存本机 | /api/events/:id/prep | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/events/:id/after` | 会後のふりかえり（R27） | 需要服务器实时计算：まとめ与次の一手由服务器生成；确定是写入 | /api/events/:id/after | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/events/:id/register` | 参加登録（R27） | 付费 AI：报名是写入；问题来自 AI 访谈（≤5 问），自己紹介草稿由 AI 生成 | /api/events/:id/join/*、/api/events/:id/overview | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/contacts/new` | 人脈を追加（名刺をスキャン、手入力、確認待ちの下書き件数；R12） | 名片识别（上传图片、OCR）：下書き件数和各入口的后续操作都在服务器进行 | /api/contact-drafts | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/events/assess` | イベント評価の入力（URL / ポスター / 3項目 / 参加コード；R26） | 名片识别（上传图片、OCR）：读取页面与评分在服务器进行 | /api/events/assessments、/api/events/assessments/posters | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/events/assessments/[id]` | 評価結果 / 読み取れない時（R26） | 名片识别（上传图片、OCR）：分数按当前计划在服务器重算 | /api/events/assessments/[id] | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/contacts/new/manual` | 手入力（名字即可保存，即时查重与统合，5 秒撤销；R12） | 名片识别（上传图片、OCR）：保存联系人与查重是服务器写入 / 查询 | /api/contacts/manual、/api/contacts/manual/duplicates、/api/contacts/manual/organizations、/api/events | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/contacts/new/scan` | 名刺をスキャン（はじめての方へ、相机权限、表 / 裏连拍、相册多选，建 v2 批次上传；R12） | 名片识别（上传图片、OCR）：名片识别要上传图片在服务器读取 | /api/contact-drafts/business-card/batches/v2 | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/contacts/new/scan/:batchId` | 名刺の読み取り → 自動で人脈へ → まとめて確認 → 完成（R12） | 名片识别（上传图片、OCR）：读取在服务器进行，确认是写入 | /api/contact-drafts/business-card/batches/v2/:id、/api/agent/event-attribution/candidates | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/contacts/new/drafts` | 確認待ちの下書き（确认 / 丢弃，?eventId= 参加者取り込み；R12） | 名片识别（上传图片、OCR）：草稿队列与确认在服务器 | /api/contact-drafts、/api/contact-drafts/event-attendees/import | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/contacts/new/import` | 取り込み（連絡先：説明 → 権限 → 選ぶ → 取り込み中；LinkedIn：3 ステップ → CSV / ZIP を選ぶ；R16） | 需要服务器实时计算：导入批次在服务器建立与查重；只上传选中的人 | /api/contacts/import | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/contacts/new/import/:importId` | 取り込み · まとめて確認 → 完成（R16） | 需要服务器实时计算：合并确认与提交是服务器写入 | /api/contacts/import/:id、/api/contacts/import/:id/rows、/api/contacts/import/:id/commit | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/contacts/new/invite` | 招待コード · 発出方（説明、QR・コード・リンク、メッセージの下書き、共有する項目、無効にする、これまでのコード；R15） | 需要服务器验证链接或邀请码：发码、作废与履历都在服务器 | /api/invite-codes、/api/invite-codes/current、/api/invite-codes/:code/revoke、/api/profile | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/i/:code` | 招待コード · 受け取る側（公开：打开、登录回跳、简短资料、共享项目、つながる、各异常态；R15） | 需要服务器验证链接或邀请码：邀请码由服务器验证，连接是服务器写入 | /api/invite-codes/:code/preview、/api/invite-codes/:code/redeem、/api/profile、/api/contacts/manual/duplicates | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/i` | 招待コードを入力（公开，手输 8 位码后打开 /i/:code；R15） | 需要服务器验证链接或邀请码：输入的码要到服务器验证 | 同 /i/:code | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/register` | 参加コード入力へ（R27 跳转） | 需要服务器验证链接或邀请码：跳到参加コード入力；コード由服务器验证 | — | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/register/:code` | 参加コード着地（R27） | 需要服务器验证链接或邀请码：参加コード由服务器解析 | /api/events/by-code/:code | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/plans/flow/:intakeId` | 计划生成流程：背景确认、≤5 问、前提、初版、AI 修正（R23） | 付费 AI：背景下书、选题、初版和修正由付费 AI 在服务器生成，每一步都要实时写入 | /api/agent/plans/intakes/:id、/api/agent/plans/drafts/:id | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/plans/drafts/:draftId/edit` | 计划手动编辑（1 次，保存即确定，R23） | 需要服务器实时计算：保存即确定计划，要和服务器上的草稿版本核对 | /api/agent/plans/drafts/:id | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/plans/:planId/types/:itemId` | 人物类型详情：候补、记录加分、跳过、面谈提案与依頼文草稿（R24） | 需要服务器实时计算：分数、候补和活动分由服务器按最新记录计算，记录与撤销要实时写入 | /api/agent/plans/v2/:planId/types/:itemId、/api/agent/plans/v2/:planId | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/plans/:planId/review` | 计划见直：确认前提、AI 修正（逐条 ✓/✕）、见直后的手动编辑与确定（R25） | 付费 AI：前提预标和修正案由付费 AI 在服务器生成，送出要扣本月配额，确定要和服务器上的计划版本核对 | /api/agent/plans/v2/:planId/reviews/current、/api/agent/plans/drafts/:id/review、/api/agent/plans/v2/:planId | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/plans/:planId/done` | 目标达成的完成页与下一目标候选（R25） | 需要服务器实时计算：完成页数字由服务器按定格的分数计算，下一目标候选由 AI 在服务器生成，选了要实时新建生成流程 | /api/agent/plans/v2/:planId/achievement、/api/agent/plans/v2/:planId/next-goals、/api/agent/plans/v2/quota | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/plans/:planId/next` | 下一目标候选（R25，b4 #26 独立页） | 需要服务器实时计算：下一目标候选由 AI 在服务器生成，选了要实时新建生成流程 | /api/agent/plans/v2/:planId/next-goals、/api/agent/plans/v2/quota | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/plans/legacy/:planId` | 以前的计划：v1 计划只读详情（R25） | 需要服务器实时计算：旧计划只在服务器保存，不存本机；只读，不提供编辑 | /api/agent/plans/legacy/:planId | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/platform` | 平台工作台（公开活动审核队列） | 管理员工具：平台运营工具：审核导入的公开活动 | /api/events/public | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/o/:slug` | 公開主催者ページ（R17） | 公开访客页面（不属于账号）：公开主办方页面，不属于账号数据 | /api/organizers/by-slug/:slug | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/profile/edit` | 编辑资料 | 涉及凭据或会话：编辑会话从服务器取最新版本并保存，离线编辑属于 0120 断网写 | /api/profile | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/profile/more` | 补充资料（上传名片、简历） | 付费 AI：名片和简历由付费 AI 抽取 | /api/profile/extractions/* | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |
| `/profile/onboarding` | 新用户引导 | 付费 AI：引导里的名片扫描和自我介绍草稿用付费 AI；每一步都保存到服务器（0106 已支持断网继续填写、联网后保存） | /api/profile、/api/profile/intro-draft | 已填内容保留，显示「现在没有网络」提示，联网后继续（0106 行为） |
| `/profile/suggestions` | 资料更新建议 | 付费 AI：建议由 AI 按最新活动生成，接受或忽略要实时写入 | /api/profile/update-suggestions | 显示「需要联网」空状态（不是报错页），联网后点「重试」 |

## 不读账号数据（布局、跳转、本机设置）

| 路由 | 页面 | 读取 | 断网时 |
| --- | --- | --- | --- |
| `(根布局)` | 根布局：会话恢复、错误边界、通知协调、底部标签栏（R05） | 无（会话恢复见威胁模型第 6 节） | 按 0127 的离线冷启动身份进入 |
| `(主页面分组)` | 主页面分组的导航栈（底栏由根布局统一绘制，R05） | 无 | 照常显示 |
| `/showcase/components` | 组件库展示页（开发包和 TestFlight，R04；R31a 按 01-system 规格格重排） | 无（示例数据打包在 App 里） | 照常显示 |
| `/showcase/components/[section]` | 组件库展示页 · 单个规格格小节（开发包和 TestFlight，R31a 逐件对照） | 无（示例数据打包在 App 里） | 照常显示 |
| `/showcase/copy` | 标准用词展示页（开发包和 TestFlight，R03） | 无（标准用词打包在 App 里） | 照常显示 |
| `/showcase/icons` | 图标展示页（开发包和 TestFlight，R02） | 无（图标源打包在 App 里） | 照常显示 |
| `(浏览器外壳)` | 浏览器版 HTML 外壳 | 无 | 照常加载 |
| `/` | 入口跳转 | 无 | 跳到首页或登录页 |
| `/start` | 引导入口跳转（Web /app/start → App 引导 /profile/onboarding） | 无 | 跳到引导页 |
| `/*（旧链接）` | 旧深链接跳转 | 无 | 跳到对应新页面 |
| `/account/mobile-google` | 旧 Google 登录链接跳转 | 无 | 跳到登录页 |
| `/events/:id/attendees` | 旧参会者链接跳转到现场页 | 无 | 跳到现场页（0115 可离线） |
| `/events/:id/participants/:participantId` | 旧参会者链接跳转到现场资料面板 | 无 | 跳到现场页（0115 可离线） |
| `/party` | 旧派对模式跳转 | 无 | 跳到现场页 |
| `/party/checkin` | 旧派对签到跳转 | 无 | 跳到现场页 |
| `/party/graph` | 旧派对关系图跳转 | 无 | 跳到现场页 |
| `/profile/continue` | 补资料后继续跳转 | 无 | 跳到目标页 |
| `/followups` | 旧跟进入口，跳到 Task 的 To-do 段「关系」分组 | 无（目标页见 app/task.tsx） | 跳到 /task?seg=todo&scope=relationship（可离线） |
| `/settings` | 设置（语言、主题、本地镜像状态、通知权限） | 本机设置；通知投递和发现偏好读 /api/inbox/delivery/preferences、/api/inbox/discovery/preferences | 本机设置照常可用；两块通知偏好显示「需要联网」 |
| `/settings/api` | 服务器地址设置 | 本机保存的服务器地址；「检查连接」按需读 /api/health | 可以改地址；检查连接会显示连不上 |
| `/schedule` | 旧日历入口，跳到 Task 的カレンダー段（R05） | 无（目标页见 app/task.tsx） | 跳到 /task?seg=calendar（可离线） |
| `/today` | 旧今日待办入口，跳到 Task 的 To-do 段（R05，添加框在段顶部） | 无（目标页见 app/task.tsx） | 跳到 /task?seg=todo（可离线） |
| `/tasks` | 旧待办入口，跳到 Task 的 To-do 段（R05，保留 scope / view） | 无（目标页见 app/task.tsx） | 跳到 /task?seg=todo（可离线） |
| `/events/:id/operations/admission` | 旧报名审核链接跳转到イベント運営「参加者」段（R17） | 无 | 跳到运营台（运营台需要联网） |
| `/events/:id/operations/experience` | 旧活动体验配置链接跳转到イベント運営「概要」段（R17） | 无 | 跳到运营台（运营台需要联网） |
| `/events/:id/operations/roles` | 旧角色与权限链接跳转到イベント運営「概要」段（R17） | 无 | 跳到运营台（运营台需要联网） |
| `/events/:id/analytics` | 旧活动数据分析链接跳转到イベント運営「レポート」段（R17） | 无 | 跳到运营台（运营台需要联网） |

## 路由文件对照

| 文件 | 路由 | 归属 |
| --- | --- | --- |
| `app/_layout.tsx` | `(根布局)` | device-only |
| `app/(app)/_layout.tsx` | `(主页面分组)` | device-only |
| `app/(app)/ai.tsx` | `/ai` | local-first (0118) |
| `app/(app)/contacts.tsx` | `/contacts` | local-first (R11a) |
| `app/(app)/events.tsx` | `/events` | local-first (0131) |
| `app/(app)/inbox.tsx` | `/inbox` | local-first (0119) |
| `app/(app)/profile.tsx` | `/profile` | local-first (0131) |
| `app/(app)/schedule.tsx` | `/schedule` | device-only |
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
| `app/contacts/[id].tsx` | `/contacts/:id` | local-first (R11a) |
| `app/contacts/all-actions.tsx` | `/contacts/all-actions` | local-first (0131) |
| `app/contacts/analysis/[dimension]/[bucketId].tsx` | `/contacts/analysis/:dimension/:bucketId` | local-first (0117) |
| `app/contacts/dashboard.tsx` | `/contacts/dashboard` | local-first (0117) |
| `app/contacts/edit/[id].tsx` | `/contacts/edit/:id` | local-first (R11a) |
| `app/contacts/graph.tsx` | `/contacts/graph` | local-first (0117) |
| `app/contacts/list.tsx` | `/contacts/list` | local-first (R11a) |
| `app/contacts/new.tsx` | `/contacts/new` | online-only |
| `app/contacts/new/drafts.tsx` | `/contacts/new/drafts` | online-only |
| `app/contacts/new/import/[importId].tsx` | `/contacts/new/import/:importId` | online-only |
| `app/contacts/new/import/index.tsx` | `/contacts/new/import` | online-only |
| `app/contacts/new/invite.tsx` | `/contacts/new/invite` | online-only |
| `app/contacts/new/manual.tsx` | `/contacts/new/manual` | online-only |
| `app/contacts/new/scan.tsx` | `/contacts/new/scan` | online-only |
| `app/contacts/new/scan/[batchId].tsx` | `/contacts/new/scan/:batchId` | online-only |
| `app/contacts/pipeline.tsx` | `/contacts/pipeline` | local-first (0137) |
| `app/dashboard.tsx` | `/dashboard` | local-first (0117) |
| `app/e/[slug].tsx` | `/e/:slug` | online-only |
| `app/events/[id].tsx` | `/events/:id` | online-only |
| `app/events/[id]/after.tsx` | `/events/:id/after` | online-only |
| `app/events/[id]/analytics.tsx` | `/events/:id/analytics` | device-only |
| `app/events/[id]/attendees.tsx` | `/events/:id/attendees` | device-only |
| `app/events/[id]/edit.tsx` | `/events/:id/edit` | online-only |
| `app/events/[id]/live.tsx` | `/events/:id/live` | online-only |
| `app/events/[id]/operations.tsx` | `/events/:id/operations` | online-only |
| `app/events/[id]/operations/admission.tsx` | `/events/:id/operations/admission` | device-only |
| `app/events/[id]/operations/check-in.tsx` | `/events/:id/operations/check-in` | local-first (R17) |
| `app/events/[id]/operations/experience.tsx` | `/events/:id/operations/experience` | device-only |
| `app/events/[id]/operations/roles.tsx` | `/events/:id/operations/roles` | device-only |
| `app/events/[id]/participants/[participantId].tsx` | `/events/:id/participants/:participantId` | device-only |
| `app/events/[id]/prep.tsx` | `/events/:id/prep` | online-only |
| `app/events/[id]/register.tsx` | `/events/:id/register` | online-only |
| `app/events/assess.tsx` | `/events/assess` | online-only |
| `app/events/assessments/[id].tsx` | `/events/assessments/[id]` | online-only |
| `app/events/center.tsx` | `/events/center` | online-only |
| `app/events/center/new.tsx` | `/events/center/new` | online-only |
| `app/events/center/profiles.tsx` | `/events/center/profiles` | online-only |
| `app/events/center/profiles/[id].tsx` | `/events/center/profiles/:id` | online-only |
| `app/followups.tsx` | `/followups` | device-only |
| `app/home.tsx` | `/home` | local-first (0131) |
| `app/home/events.tsx` | `/home/events` | local-first (0131) |
| `app/host/join.tsx` | `/host/join` | online-only |
| `app/host/join/[code].tsx` | `/host/join/:code` | online-only |
| `app/i/[code].tsx` | `/i/:code` | online-only |
| `app/i/index.tsx` | `/i` | online-only |
| `app/inbox/[id].tsx` | `/inbox/:id` | local-first (0119) |
| `app/inbox/notifications/[id].tsx` | `/inbox/notifications/:id` | local-first (0118) |
| `app/inbox/sources/[id].tsx` | `/inbox/sources/:id` | local-first (0118) |
| `app/index.tsx` | `/` | device-only |
| `app/login-admin.tsx` | `/login-admin` | online-only |
| `app/notes/[id].tsx` | `/notes/:id` | local-first (0108) |
| `app/notes/[id]/edit.tsx` | `/notes/:id/edit` | local-first (0108) |
| `app/notes/index.tsx` | `/notes` | local-first (0108) |
| `app/notes/new.tsx` | `/notes/new` | local-first (0108) |
| `app/o/[slug].tsx` | `/o/:slug` | online-only |
| `app/party.tsx` | `/party` | device-only |
| `app/party/checkin.tsx` | `/party/checkin` | device-only |
| `app/party/graph.tsx` | `/party/graph` | device-only |
| `app/plans/[planId]/done.tsx` | `/plans/:planId/done` | online-only |
| `app/plans/[planId]/next.tsx` | `/plans/:planId/next` | online-only |
| `app/plans/[planId]/review.tsx` | `/plans/:planId/review` | online-only |
| `app/plans/[planId]/types/[itemId].tsx` | `/plans/:planId/types/:itemId` | online-only |
| `app/plans/drafts/[draftId]/edit.tsx` | `/plans/drafts/:draftId/edit` | online-only |
| `app/plans/flow/[intakeId].tsx` | `/plans/flow/:intakeId` | online-only |
| `app/plans/legacy/[planId].tsx` | `/plans/legacy/:planId` | online-only |
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
| `app/search.tsx` | `/search` | online-only |
| `app/settings.tsx` | `/settings` | device-only |
| `app/settings/api.tsx` | `/settings/api` | device-only |
| `app/showcase/components/[section].tsx` | `/showcase/components/[section]` | device-only |
| `app/showcase/components/index.tsx` | `/showcase/components` | device-only |
| `app/showcase/copy.tsx` | `/showcase/copy` | device-only |
| `app/showcase/icons.tsx` | `/showcase/icons` | device-only |
| `app/start.tsx` | `/start` | device-only |
| `app/task.tsx` | `/task` | local-first (R05) |
| `app/tasks.tsx` | `/tasks` | device-only |
| `app/tasks/[id].tsx` | `/tasks/:id` | local-first (0131) |
| `app/tasks/personal.tsx` | `/tasks/personal` | local-first (0108) |
| `app/tasks/relationship/[id].tsx` | `/tasks/relationship/:id` | local-first (0131) |
| `app/today.tsx` | `/today` | device-only |

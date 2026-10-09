# Orbit 新 UI（redesign-2026-10）落地方案

> 状态：**方案已定稿（2026-10-09）**：Q1–Q10 除 Q4、Q7 外都按推荐；Q4 改为「该用 AI 的都用 AI」，Q7 改为「Claude 设计条目、Codex 审核」。本会话只做了扫描和出方案，没有改动任何产品代码，也没有提交。
> 日期：2026-10-09 · 分支 `chat-agent` @ `952fe38e`（与 origin 同步）· GitNexus 索引已重建到 `952fe38`。
> 设计依据：`index.html`「待確認項決定」表（NAV-V3 行优先于标注「已取代」的行）、`01-system.html`、`b11-nav-v3.html`、`b10-plan-example.html`，其余 app / web / widgets / b1–b9 / 00-inventory / 02-gaps 按需查阅。
> 开发方式：**两个人在各自本机并行开发**。分工和协作约定见 §0；第 4 节的分期按两条线排。

---

## 目录

- §0 总体判断与双人协作约定
- §1 屏幕 × 数据映射表
- §2 需要改的 API 和数据结构（逐条）
- §3 纯前端改动清单
- §4 分期建议（按两条线）
- §5 待你决定的问题
- 附录 A：新增付费 AI 调用清单（需授权）
- 附录 B：GitNexus impact 结果
- 附录 C：要改写或新建的测试与门禁
- 附录 D：我按成熟产品惯例自定的口径

---

## §0 总体判断与双人协作约定

### 0.1 一句话判断

新 UI 对两端都不是换皮，而是**按屏替换**。理由有三：

- 两端现有视觉都不是新系统的前身。App 是 9 月的蓝墨体系，Web 是旧暗色体系加 0918 浅色六域。
- 导航结构整体换掉：App 5 个 tab 中有 2 个变了；Web 从顶部药丸导航改成左栏。
- 新增 Task、首页组件、计划 v2.2、活动评估、招待コード、AI 秘書等大块。

做法上沿用 0918 已验证的「边界 B」：一张设计屏对应一个新组件文件，接真实数据；旧组件在切换路由后删除。0918 的教训是：先做「只换组件层」，交付后发现大多是改色值的半成品。

数据层的结论是：**大部分画面能用现有接口和字段实现**。真正需要动后端的集中在 6 处：

1. 计划 v2.2
2. 活动评估
3. 招待コード
4. 推送频控与秘書
5. 首页布局存储
6. 账户类（订阅、导出、退会）

第 2 节逐条列出，共 25 条。所有改动都是「只加不改」，对已有字段不做破坏性修改。

### 0.2 两人分工（已定：产品负责人负责线 A，伙伴负责线 B）

| 工作线 | 负责范围 | 独占文件（另一人不改） |
|---|---|---|
| **线 A：后端 + Web**（`repos/orbits`）· 负责人：产品负责人 | 全部迁移、`shared/contract`、`shared/api-schema`、`shared/compute`、`features/**`、`app/api/**`、Web 页面与壳；Web 的 `t({})` 文案 | 各模块 `migrations.ts`、`shared/**`、`features/ai-quota/*`、`app/(app)/app/*` 壳文件 |
| **线 B：App**（`repos/orbit-app`）· 负责人：伙伴 | App 壳、屏幕、组件、离线 outbox、原生能力（NFC、WidgetKit、Live Activity、StoreKit）；App 的 i18n 文案目录 | `src/**`、`app/**`、`src/i18n/*`、`ios/**`、`plugins/**`、`src/api/contract|schema|domain`（只能通过 `sync:contract` 改） |

这样分的原因：

- **App 只经 HTTP 调 Web 的 `/api/**`**，代码上不 import Web 源码。唯一的复制通道是 `npm run sync:contract`（`repos/orbit-app/AGENTS.md`）。
- 按端切开，物理上就很少改同一个文件，冲突面最小。
- 技术栈不同（RN 和 Next），两个人各自熟悉一端，效率最高。

另一种分法是按领域纵切：一人负责首页、人脈、Task，另一人负责计划、活动、秘書，各自通吃前后端。缺点是两人都要改两端的导航壳、token 和 i18n 大文件（App `src/i18n/*.ts` 合计 8,771 行），冲突多，所以不推荐。

### 0.3 协作约定（两种分工都适用）

1. **契约先行**。每个需要新接口的功能，线 A 先合入一个只含契约的小提交：`shared/contract/*.ts` 类型、`shared/api-schema` 的 zod 定义、mock/fixture，以及一个返回 fixture 的 mock-mode 路由。线 B 拉取后运行 `npm run sync:contract`，就能用 mock 数据开发 App 屏。真实实现之后再接上，契约不变。依据：现有 `ORBIT_MODULE_MODE=mock|hybrid|live`（`shared/services/module-mode.ts:66`），以及 App 测试 `contract-sync / api-schema-sync / domain-sync`。
2. **契约只加不改**。新字段一律可选；不删除、不改名已有字段；枚举只加值。必须破坏时，两人当面对齐，同一天各自合入。
3. **迁移版本号只由线 A 分配**。迁移按模块整数版本、forward-only，有 checksum 守卫，已发布的 SQL 不能改（`features/plans/migrations.ts:3-6`）。两个人各自给同一模块加 v2 会直接冲突。所以线 B 需要后端改动时提需求给线 A，自己不写迁移。
4. **分支与合并**：
   - 各自开 `redesign/<线>-<主题>` 分支，以 `chat-agent` 为基线，小步合回 `chat-agent`。
   - 每天至少一次 `git pull --rebase`。
   - **推送到 origin 才能共享代码**，所以每条线都需要 push 权限。见 §5 Q2：是否把「推送个人分支和 chat-agent」作为常规授权。
   - 编号沿用各自目录：Web `W0062…`，App `0141…`。
5. **热点文件单一负责人**。以下文件指定一个人改，另一人提需求：
   - App 线 B：`OrbitTabBar.tsx`、`app-navigation.ts`、`AppScreen.tsx`、`src/i18n/*`、`src/design/tokens.ts`。
   - Web 线 A：`orbit-public-shell.tsx`、`orbit-account-shell.tsx`、`app/(app)/app/layout.tsx`、`orbit-reference-styles.tsx`（冻结不改）。
   - **共享源**由线 A 维护：设计 token 源 `shared/design/tokens.json`、图标源 `shared/design/icons.json`、标准文案表 `shared/copy/*`，线 B 通过同步脚本取用。
6. **本地环境各自独立**：
   - 每人一个本地 Postgres。测试用独立的 `orbit_test`，见 `repos/orbits/AGENTS.md`。
   - `.env.local` 不入库、不共享。
   - 种子数据用现有脚本：`db:seed:primary-test-account` 等。
   - `DEEPSEEK_API_KEY` 默认置空。真实付费调用只在授权次数内、由授权人本机执行，并记入 `ai_usage_ledger`。
7. **契约变更的提交模板**：提交信息带 `contract:` 前缀，并写清「App 需要 sync」。线 B 拉取后先跑同步测试再开发。

---

## §1 屏幕 × 数据映射表

判定图例：**复用** = 现有接口和字段直接能用，只改前端；**小改** = 加可选字段、参数或常量，或改一个现有函数；**新增** = 新接口、新表或新集合，或新的付费 AI。
「D-xx」指第 2 节的改动条目。

### 1.1 导航骨架

| 新画面 / 组件 | App 现状 | Web 现状 | 数据 | 判定 |
|---|---|---|---|---|
| App 底栏 5 项：ホーム / 人脈 / iOrbit / イベント / Task | `src/components/OrbitTabBar.tsx:11-49`（home/contacts/**ai 中央方块**/events/**profile**）；`src/view-models/app-navigation.ts`（`MainTab` 不含 ai/task） | — | 无 | 复用（纯前端；impact **HIGH**，见附录 B） |
| Web 左栏 84px：ホーム / 人脈 / iOrbit / イベント / Task / 受信箱 + 底部 主催 / 設定；右栏「次の一手」360px；⌘K | 顶部药丸 `OrbitTopNav`（`orbit-public-shell.tsx:329-472`）；`AccountTopNav` 包了一层；悬浮球 `orbit-global-ask` | — | 右栏数据见 1.2 的「今日やること」 | 复用（impact **CRITICAL**） |
| iOrbit 全屏，无底栏；≡ 打开会話リスト；✕ 或左缘右滑退出 | `/ai` 已经全屏、不显示底栏（`AiScreen.tsx`） | `/app/agent` + 历史抽屉 | `/api/ai/conversations/**` | 复用 |
| 二级页不显示底栏 | `AppScreen.tsx:98` 用 `mainTabForPath` 判定 | — | 无 | 复用 |

### 1.2 ホーム（组件容器）

| 组件 | App 现状 | Web 现状 | 现有 API / 字段 | 判定 |
|---|---|---|---|---|
| 容器：编辑、排序、尺寸 小/中、组件库、提示条 | `/home` → `HomeDashboardScreen`（固定版式） | `/app/home` 直接重定向到 `/app/agent`；报刊式首页在 `iorbit-home.tsx` | **无布局存储** | **新增 D-01**（布局集合） |
| ✅ 今日やること（今日の一手 / 判断待ち / 予定 / 1問） | `/api/today`、`/api/tasks/page`、`/api/schedule-items` | `POST /api/agent/signals?view=home`、`loadHomeFacts` | Today 契约 `shared/contract/today.ts`；signals（followup_due / event_upcoming / relationship_stale）；task suggestions；agent actions | 复用。聚合规则见 D-12，先在前端聚合 |
| 💰 プラン スコア（大数字 /100、构成条、今日 +N） | 无（App 没有计划） | 只有「本周推进」`GET /api/agent/plans/current?view=home` | 现在没有分数概念 | **新增 D-03 / D-04**（分数随计划 v2.2） |
| 🎟️ 次のイベント（时间、名称、会いたい人 N） | `/api/events`（已报名） | home VM 的「已报名活动」 | events 契约，以及 `/api/events/[id]/readiness`（要见的人） | 复用 |
| 👥 人脈（人数、+N 今月、最近 4 人：头像/姓名/公司） | `/api/contacts/summary`、`/api/contacts/page` | home VM 的人脉计数 | `ContactListItemContract`（displayName、organization） | 复用（「本月新增」若 summary 没有就小改 D-10） |
| 🗂️ 秘書から（メール要約 / 期限 / おすすめ） | 无 | 无 | 收件箱 `/api/inbox/notifications` | **小改 D-15**（秘書来源）；メール要約另见 D-16 |
| ⚖️ 判断待ち（库） | 分散在任务建议、agent actions、实体草稿 | 同 | 同上 | 复用（D-12 前端聚合） |
| 🗓️ 今週（库） | `/api/schedule-items` | `loadHomeFacts` | ScheduleItem | 复用 |
| ✨ イベント推薦（库） | `/api/recommendations/events` | 同 | `valueScore` 0–99、factors | 复用（分数口径改为 D-07 后换源） |
| 📝 メモ（库） | `/api/notes` | 无 Web 笔记页 | NoteContract | 复用 |
| はじめの 3ステップ（空态，硬顺序） | onboarding 5 步 | `/api/guide/state`（guideState v2）、`/app/start` | guideState：currentStep / completedAt | 复用（App 新接 `/api/guide/state`） |
| 右上 🔔（红点不显示数字） | `/api/inbox/summary` | 收件箱触发器 | inbox summary | 复用 |

### 1.3 人脈 与 加人

| 新画面 | App 现状 | Web 现状 | 现有 API / 字段 | 判定 |
|---|---|---|---|---|
| 人脈一覧：总数、**浓度构成**、分类页签（すべて / 情報が少ない人 / 目標に関係 / 要フォロー）、行（浓度三点 · 来源 chip · 🎯 计划关系 · 最終接点） | `/contacts` → `ContactsScreen`（2,687 行） | `/app/contacts` → `network-0918/network-all.tsx` | `/api/contacts/page`、`/summary`；`source`、`evidence[]`、`lastInteractionAt`；计划关系 = `plan_items.contact_links` | **小改 D-10**（浓度纯函数 + 筛选参数） |
| 連絡先詳細（名片头卡、なぜこの人か、次の一手、力になれること/求めていること、やりとり） | `/contacts/[id]` | `/app/contacts/[id]`（W0059 已按此改版） | `/api/contacts/[id]`、`/insight`、value-lines、notes、encounters | 复用。App 需新接 `/insight` 和 value-lines |
| 人脈分析（構造 / 機会 / インサイト；<10 人锁定） | `/contacts/dashboard` | `/app/contacts/dashboard` | `/api/network/snapshot`（App 还没接） | 复用 |
| 「＋」sheet：名刺 / 招待コード / 手入力 + その他 連絡先・LinkedIn CSV | 入口散在 `/contacts/new` 导入中心 | `/app/contacts/new` | — | 复用（纯前端 sheet） |
| A1 名刺スキャン（首次指导、相机提示、后台读取、まとめて確認、读取失败） | 单张 `/contacts/new/scan`、批量 V2 `/contacts/new/batch2` | `card-batch-0918`、network-import | 批量 V2 `/api/contact-drafts/business-card/batches/v2/**`（含 duplicates / finalize / replace / manual-entry） | 复用。「首次指导前 3 次」计数存本机 |
| A2 招待コード（码 / 链接 / QR、7 天、10 人、双向自动加入、本人入力同步、过期再发行、已在 Orbit 只做连接） | 无（`/register/:code` 是活动邀请码） | 无（`relationship-communication/invitations` 是一对一沟通邀请） | 无 | **新增 D-13** |
| A2 受け取り側：手机浏览器注册页 | — | 需新页 `/i/[code]`（响应式） | 注册复用 `/api/auth/register` | 新增（页面 + D-13 接口） |
| A3 手入力（名字即可保存、补全、保存前查重、保存后「情報を濃くする」） | `/contacts/new/manual` | network-import | `/api/contact-drafts/manual`、`/merge-suggestions` | 复用。「保存前查重」用 merge-suggestions；单人查重如需更快另见 D-10 |
| 連絡先 取り込み（iPhone / Google vCard，AI 预选工作关系） | 无（缺 expo-contacts） | `/api/contact-drafts/external/{candidates,import}`（sourceKind 含 phone / google_contacts） | 同左 | 复用接口；App 新增原生读取。「仕事関係らしい」预选用规则（D-10） |
| LinkedIn CSV | 无 | `/api/contacts/import/**`（format 含 `linkedin`，`features/contacts/import/types.ts:5`） | 同左 | 复用。App 新接导入，需新增文件选择器 |
| あとで補完 1日1問（每天最多 1 题，连续跳过 3 次不再问） | 无 | 无 | 无 | **新增 D-11**（规则生成，不调 AI） |
| 登録内容の更新提案 | `/profile/suggestions` | profile | `/api/profile/update-suggestions/**` | 复用（联系人侧建议另见 §5 Q9 的分期） |
| 編集 / 软删除 30 天恢复 | `/contacts/[id]` PATCH | 同 | orbit_records `lifecycle_state='deleted'` | 复用。「最近删除」列表放后期（P6） |
| ⌘K / 语义搜索 | `/api/search/relationships` | 无 ⌘K | `/api/search/{relationships,suggestions}` | 复用（Web 新建 ⌘K 面板） |

### 1.4 iOrbit

| 新画面 | App | Web | API | 判定 |
|---|---|---|---|---|
| 新对话起始屏（建议 chip、最近 3 条、参照数据量） | `/ai` | `/app/agent` home 分支 | `/api/ai/conversations/sessions?limit=3`、`/api/ai/proactive-turns` | 复用 |
| 会话中：参照 chip、虚线确认卡 → 成功卡/失败卡、「この会話で行ったこと」 | `/ai/[id]`、实体草稿卡 | `iorbit-chat.tsx`、`iorbit-rich-components.tsx` | `/api/ai/conversations/[id]`、`/api/ai/entity-drafts/[id]`、`/api/ai/runs/[id]/transition` | 复用（确认链已有：`features/agent/natural-language-actions`） |
| 会話リスト（搜索标题+全文、置顶最多 5、按日分组、左滑置顶/删除、改名） | 已有搜索/置顶/分组/删除 | 历史抽屉 | `GET sessions?q=&pinned=`、`PATCH sessions/[id]`（customTitle / pinned，带 expectedRevision）、`DELETE` | 复用。「置顶最多 5」先由前端限制；「保存 90 日」见 §5 Q8 |
| Web ⌘K + 「このページを文脈に含める」 | — | 无 | 对话请求带页面上下文：现有对话入参是否支持，需在 P1 用 `context` 核实 | 复用或小改 |

### 1.5 イベント

| 新画面 | App | Web | API | 判定 |
|---|---|---|---|---|
| 主页三页签（評価 / 参加予定 / 探す） | `/events` | `/app/events` → `events-list.tsx` | `/api/events`、`/api/events/public`、`/api/recommendations/events` | 复用 |
| **评估器 + 判定中 + 结果页**（URL / 海报 → 0–100、内訳、会えそうな人、注意点、参加予定に追加） | 无 | 无 | 无（活动 capture 只有 manual_form / calendar_sync / organizer_feed） | **新增 D-07**（新付费 AI） |
| 评估异常态（需登录、非活动页、海报不清 → 补 3 项） | 无 | 无 | 同上 | 新增（D-07 的一部分） |
| 探す（「プランに効く」推荐、筛选、搜索分组） | `/events` | `/app/events` | `/api/recommendations/events` + 计划人物类型 | 复用。D-04 完成后用人物类型加权 |
| イベント詳細（评估吸顶条、会えそうな人 = 参会者 × 计划、参加者未公开时可订阅「公開されたら知らせる」） | `/events/[id]` | `/app/events/[id]` | `/api/events/[id]`、`/readiness`、`/api/recommendations/event/[id]` | 复用。吸顶条读 D-07 的评估记录；「公開通知」订阅放后期 |
| 参加登録（AI 访谈式） | `/events/[id]/register` | 报名工作台 | `/api/events/[id]/registration/**`（问题集 / 访谈 / 画像） | 复用（现有 AI，不新增调用） |
| 会う準備（倒计时、名片余量、会いたい人、准备清单） | 详情页内 | 同 | readiness、opening-line | 复用。名片余量是用户自填数字，存本机 |
| 会場モード（受付、桌号、推荐、交换申请、面談を提案、ひとこと録音 15 秒） | `/events/[id]/live` | `/app/events/[id]/live` | `/api/events/[id]/operations/**`（check-in、contact-requests）、appointments（propose 3–5 个候选） | 复用 |
| 会後のふりかえり（AI 总结、批量下一步、回写プラン スコア） | post-event | 同 | `/api/events/[id]/post-event/**`、`/artifact` | 复用（现有 AI）。「回写分数」随 D-04 |
| 興味なし 反馈 | 无 | 无 | 只有 `/accept` | **小改 D-08** |

### 1.6 Task（カレンダー / To-do / プラン / メモ）

| 新画面 | App | Web | API | 判定 |
|---|---|---|---|---|
| Task 容器（分段，可左右滑；右上「＋」新建当前段内容） | 四个独立路由：`/schedule`、`/tasks`、`/today`、`/notes` | `/app/tasks`（不在导航里）、`/app/tasks/personal`、`/app/agent/plan` | — | 复用（纯前端容器，旧路由改为二级页或重定向） |
| カレンダー（周条、时间线、日/週/月、冲突「動かす」、Google 连携状态） | `/schedule` 有日/周/月 | `/app/tasks/personal` | `/api/schedule-items/**`、`/api/appointments`、`/api/integrations`（calendar.read/write） | 复用。「動かす」= PATCH schedule-item；写外部日历仍逐次确认（`externalCalendarWritesEnabled`） |
| To-do：判断待ち / 今日の一手 / フォロー；左滑 明日/完了；延期 sheet；第 2 次延期提醒 | `/today`、`/tasks`、`/followups` | `/app/tasks` | tasks、task-suggestions（snooze 接受任意 `nextVisibleAt`）、agent signals / actions / ledger、`/api/relationship-tasks/page`、confirmations | 复用（D-12 前端聚合）。延期次数见 **小改 D-12b** |
| 下書きエディタ（语气、書き直す、依据、复制 / mailto，不发送） | AI 页草稿卡 | 多处草稿接口 | `/api/message-drafts`、`/api/chat/assist/email-draft`、`/api/agent/ledger/[id]/draft` | 复用（全部只存草稿：`externalSendRequested:false`） |
| 「送りましたか？」（回前台/重获焦点时出现，24 小时后收起） | 无 | 无 | 回答「はい」→ 记一次 encounter 或 note，并完成对应 task | 复用（状态存本机） |
| 面談の日程提案（3–5 候选、仮押さえ） | `/schedule/meetings/[id]` | 联系人详情 | `/api/appointments`（propose 需 3–5 个候选）、`/commands` | 复用 |
| メモ：分类 面談 / 自由 / 音声；@人 / @イベント；「プランの判定に使う」开关 | `/notes`（只能 @人） | 无 Web 笔记页 | `/api/notes`（`mentions[]` 只有 contactId；`eventIds[]` 已有）、`/api/appointments/[id]/memo`、`/api/agent/voice-memos/transcribe` | **小改 D-14**（noteKind + 活动 mention） |
| 面談メモ「3 問中 2 問を聞けた → +10 の根拠」 | 无 | 无 | memo 提取管线 `features/contacts/memo-extraction` | **新增 D-05**（判定调用，付费） |
| プラン 段 | 见 1.7 | | | |

### 1.7 Task › プラン 与 计划 v2.2 生成流程

| 新画面 | App | Web | 现有 API / 字段 | 判定 |
|---|---|---|---|---|
| 空态 = 目標入力（一句话 + 6 类目标 chip，不设期限） | onboarding goals 步骤只写入 `profile.relationshipGoal` 字符串 | `/app/start`、`POST /api/agent/plans/bootstrap`（只有一个固定问题） | `plans.goal_snapshot`；`horizon` 为 month/quarter/year 且**不能为空** | **新增 D-02**（目标类型、无期限） |
| ② 背景の下書き（わたし / チーム / 目的，**AI 只调 1 次**） | 无 | 无 | 无 | **新增 D-02 + 付费 AI ①** |
| チーム：必要な力 × メンバー（人脈から選ぶ / 自分で書く，不需要对方注册） | 无 | 无 | contacts（人脈から） | **新增 D-02** |
| 目的の階段 4 级 | 无 | 无 | 无 | 新增 D-02 |
| ③ ≤5 問（6 类题库）→ 確定した前提 | 无 | 只有 `PLAN_BOOTSTRAP_QUESTION` 一题 | `plan_items.kind=info` + `answer`，语义相近但时机不对 | **新增 D-02**（题库常量 + 回答；选题方式见 §5 Q4） |
| ④ AI 初版（引用业界现状库、见立て、结论、Step、人物类型 6 行） | 无 | 现有生成管线 `createAiPlanGenerator`（`plan-ai-2026-10-v1`，max_calls 4） | `plans.analysis`/`phases` jsonb、`plan_items` | **小改 D-03**（新提示词版本 + 输出结构）+ **新增 D-06**（业界库） |
| ⑤ AI 修正 ≤3（不改也扣） | 无 | 只有 `POST /reanalyze`，每月 1 次 | `plan_log` 幂等键 `reanalysis:<YYYY-MM>` | **新增 D-03b**（修正调用 + 计数） |
| ⑥ 手動編集 1 回（配点 5 分一档，合计 100，「旧→新」差分） | 无 | `PATCH /api/agent/plans/items/[itemId]` | plan_items | **小改 D-03c**（批量编辑命令 + 次数） |
| プラン 概要（スコア、构成条 实色/斜纹/豆沙/灰、結論、4 个统一按钮、今日 +10 机会、Step、人物类型卡、イベント一块） | 无 | `/app/agent/plan` → `iorbit-plan.tsx`（阶段 / 周） | `GET /api/agent/plans/current` | **小改 D-04**（分数计算）+ 前端重做 |
| 人物タイプ詳細（候补推荐度、なぜ、聞くこと 3 問、話せた判定、見分け方、紹介ルート、会える活動；人脈にいない时的人物像） | `/contacts/matches`（需求匹配） | `/app/agent/strategy?view=contacts` | `plan_items.kind=network_need` + `criteria`；候选 `plan_match_candidates`（rule/ai，pending/accepted/dismissed）；`/api/agent/plans/candidates` | **复用候选管线 + 小改 D-03**（类型说明文本由初版一次生成） |
| 記録と加点、オフラインで話した（可不填名字）、目標超え半分 | 无 | `POST /api/agent/plans/items/[itemId]/interaction`、`/log` | `contact_links{linked|established}`、`plan_log` | **小改 D-04** |
| スキップ（習熟済み，满分斜纹，可撤回） | 无 | 无 | network_need status 只有 open/linked/established | 小改 D-04（加 `skipped_at`） |
| 方案を見直す（AI 预标前提变化 → 修正差分，Free 月 3） | 无 | reanalyze 每月 1 次 | 同上 | **新增 D-03b + 配额 D-09** |
| 目標を達成した → 完了 → 次の目標候選 | 无 | 无（plans.status 只有 active/archived） | — | 小改 D-02（`achieved_at`）+ 付费 AI（次の目標候選，可选，§5 Q4） |
| 目标切换（Free 同时 2 个目标） | 无 | 每人只能有 1 份 active 计划（唯一索引 `plans_one_active_per_actor`） | — | **小改 D-02b**（每目标各 1 份 active） |
| AI 配額 3 格条、使い切った | 无 | `reanalysisQuota()` | `features/ai-quota` | 小改 D-09 |

### 1.8 受信箱 与 AI 秘書

| 新画面 | App | Web | API | 判定 |
|---|---|---|---|---|
| 受信箱（メッセージ / 通知；分类 すべて / **秘書** / リマインダー / 提案 / 更新 / 履歴；按日分组「7:50 にまとめて」；左滑 既読 / タスクに追加 / 1時間後） | `/inbox`（两段 threads/alerts，alerts 再分 all/reminder/suggestion/update/history） | 右侧滑出面板（无列表页） | `/api/inbox/notifications`、`/actions`（read/dismiss/handle/snooze/accept）、`/summary` | 复用 + **小改 D-15**（秘書来源）；Web 新建 `/app/inbox` 页 |
| 秘書 ⏰ 期限 · 会前準備（只针对参加予定/評価済み；前一天与当天 7:50） | 无 | signal `event_upcoming` | reminder 目标只有 task / schedule_item | **小改 D-15**（规则生成，不调 AI） |
| 秘書 🎯 おすすめ（画像推荐 + 興味なし） | 无 | `/api/recommendations/events` | 同 | 复用 + D-08 |
| 秘書 📨 メール要約 | 无 | Gmail scope 只有 `gmail.metadata.readonly`（`features/integrations/service-factory.ts:23-37`），读不到正文 | 无 | **新增 D-16 + 新 OAuth scope + 付费 AI**（§5 Q5） |
| 秘書の設定（三项开关、上限、静かな時間帯） | 设置页的投递偏好 | 设置页 | `/api/inbox/delivery/preferences`（四个开关 + `quietHoursEnabled`，没有时段）、`agentPreferences.quietHours` | **小改 D-17** |
| 推送：每天 3 件、22:00–7:30 静音、7:50 合并为 1 通、面談 30 分前例外 | 推送注册已有 | `features/notifications/delivery-policy.ts`：静音 22:00–08:00 写死；每天自动 2 + 建议 1 | 同 | **小改 D-17** + **新增**合并推送 |

### 1.9 マイ · 設定 · 账户

| 新画面 | App | Web | API | 判定 |
|---|---|---|---|---|
| マイページ（自己的名刺、完成度、提供/求め、浏览计数） | `/profile` | `/app/profile`（profile-0918） | `/api/profile`、completeness | 复用；「本月被查看 N 次」**新增**，放后期 |
| 設定（帐号 / プラン / iOrbit が使う情報 / 連携 / 通知 / 言語 / 外観 明暗自動 / 権限 / NFC / 秘書 / ホーム） | `/settings` | `/app/settings` | 语言、投递、发现、agent memory（`/api/agent/memory`） | 复用（「iOrbit が覚えていること」= agent memory，App 新接） |
| サブスクリプション（StoreKit / Web 结账、解約、宽限期） | 无 | 无 | 无 | **新增 D-20**（§5 Q6） |
| データの書き出し（CSV/vCard/JSON+ZIP，每日 3 次，链接 7 天） | 无 | 只有主办方活动导出 | 无 | **新增 D-21** |
| 退会（30 日冷静期、再认证、可撤回） | 无 | 无（只有 sign-out） | 无 | **新增 D-22** |
| ヘルプ / 404 / メンテナンス / 強制アップデート | 部分 | 部分 | `/api/health` | 复用（强制更新需要版本接口，D-23） |
| 认证 4 态、落地页 | 已有 | auth-0918 | 已有 | 复用 |
| onboarding 5 步 + A5 方案生成（v2.2） | `/profile/onboarding` 5 步 | `/app/profile/onboarding` | `/api/profile/*`、bootstrap | 复用。A5 接 D-02/D-03 |
| 示例预览模式（サンプル角标、写操作拦截） | 无 | `_demo/demo-mode-core.tsx` | 前端静态数据 | Web 复用逻辑，App 新增（纯前端） |

### 1.10 主催、小组件与原生能力

| 新画面 | App | Web | API | 判定 |
|---|---|---|---|---|
| 運営センター / イベント運営 6 页签 / 受付 kiosk / 申込設定 / レポート / 共同運営者 | `/events/[id]/operations/**` | ops-0918（已完成） | `/api/events/[id]/operations/**`、admission、access | 复用（视觉换新；再生成 3 次、邀请 7 天、待审 24h 是现有规则还是新规则，P5 时核实） |
| 主催者の公開ページ | `/o/[slug]` | `/app/o/[slug]` | 已有 | 复用（「フォロー」若不存在就放后期） |
| iOS 小组件（今日やること / 人脈 / 秘書から / プラン スコア；锁屏） | 无（只有一个 Orbit target） | — | 复用首页组件数据 | **新增原生**（D-24，WidgetKit + App Group） |
| Live Activity / 灵动岛 | 无 | — | 活动 / 面谈数据已有 | 新增原生（D-24） |
| NFC 交換（名札/名刺卡，碰即互换，24h 可撤销；被碰方走网页） | 无 | 无 | 最接近的是 `event_ops_contact_requests` / QR scan | **新增 D-25** |

---

## §2 需要改的 API 和数据结构

每条都写：改哪里 → 怎么改 → 为什么现有结构做不到 → 是否符合规范 → 影响面（impact）。
「符合规范」按现有约定检查，证据见 `code-data` 扫描：
- 模块 `migrations.ts` 整数版本、forward-only、checksum 守卫；
- 每张表首列 `workspace_id`，复合外键防止跨人引用；
- 幂等键 + 指纹回执；
- `expectedRevision` / `expectedUpdatedAt` 乐观并发；
- `orbit_records` 软删 + `sync_revision`；
- `shared/contract` 零 import、只放类型、通过 `sync:contract` 复制给 App；
- 新付费用途要放宽 `ai_usage_ledger.purpose` 的 CHECK。

**所有条目都由线 A 实现**；线 B 只消费契约。

### D-01 首页组件布局存储（新增）

- **改哪里**：
  - 新 `orbit_records` collection `homeLayouts`，每人一条，`record_id = actorId`。
  - 新契约 `shared/contract/home-layout.ts`：`HomeLayoutContract { revision; app: HomeWidgetSlot[]; web: HomeWidgetSlot[]; hintDismissedAt? }`，其中 `HomeWidgetSlot { key: 'today'|'planScore'|'nextEvent'|'network'|'secretary'|'pending'|'week'|'eventPick'|'memo'|'deadline'; size: 's'|'m' }`。
  - 新路由 `GET/PUT /api/home/layout`；PUT 带 `expectedRevision` 和 `mutationId`。
- **为什么**：现在没有任何布局存储。唯一的个人偏好 `agentPreferences` 的 impact 是 **CRITICAL（2,199 个影响点、87 条流程）**，不宜往里加字段。
- **规范**：
  - 用 collection 不需要迁移；
  - revision CAS 与 AI 会话整理的做法一致（`shared/contract/ai-sessions.ts:61-80`）；
  - App 端只做「在线读写 + 本地缓存」，不进同步域，因为数据小、改得少，不必在 `features/sync/domain-registry.ts` 注册；
  - 默认布局写成共享常量，服务端没有记录时返回默认值。
- **离线**：App 离线时编辑只改本地，恢复在线后 PUT。遇到 409 用服务端版本，并提示「別の端末で変更されました」。不进 outbox，不扩大 outbox 范围。
- **影响面**：新文件，零上游；风险 LOW。
- **分期**：P1。P1 前期可以先用本机存储，接口就绪后切换。

### D-02 计划 v2.2：目标、背景、问答、前提（新增 + 迁移）

- **改哪里**：`features/plans/migrations.ts` 追加 **v2 `plans-v2-intake`**：
  1. `plans` 加列：
     - `model_version smallint not null default 1 check (model_version in (1,2))`
     - `goal_kind text check (goal_kind in ('fundraising','launch','sales','hiring','partnership','career'))`
     - `purpose_level smallint check (purpose_level between 1 and 4)`
     - `premise jsonb`
     - `premise_hash text`
     - `achieved_at timestamptz`
     - `revision_count smallint not null default 0`
     - `manual_edit_available boolean not null default false`
  2. **放宽** `horizon` 的 NOT NULL，改为 `check (model_version = 1 and horizon is not null or model_version = 2)`。这需要先 drop 旧 CHECK、再加新 CHECK，放在同一个迁移事务里。
  3. 新表 `plan_intakes`，按草稿到确定的生命周期存储，一个目标一行：
     - 列：`workspace_id, id, actor_id, goal_text, goal_kind, background jsonb, team jsonb, purpose_ladder jsonb, purpose_level, questions jsonb, answers jsonb, status ('drafting','background_confirmed','answered','premise_confirmed','planned','abandoned'), plan_id null, created_at, updated_at`；
     - 复合外键 `(workspace_id, actor_id, plan_id)`；
     - 背景下书结果和 AI 用量的 `operation_id` 也存在这里。
  4. 手写团队成员只存在 `plan_intakes.team` jsonb 中（`{name, relation, capabilities[], contactId?}`），**不建联系人**。用户勾选「人脈にも登録する」时，才走现有 `/api/contact-drafts/manual`。
  - 新契约 `shared/contract/plan-v2.ts`：这是计划**第一次进入共享契约**；App 现在没有计划能力（扫描结论：`features/plans/contract.ts` 只在 Web 内部使用）。
  - 新路由：
    - `POST /api/agent/plans/intakes`（提交目标，触发背景下书）
    - `PATCH /api/agent/plans/intakes/[id]`（逐块确认；`expectedUpdatedAt`）
    - `POST /api/agent/plans/intakes/[id]/questions`（选题）
    - `POST /api/agent/plans/intakes/[id]/premise`（确定前提）
    - 生成初版沿用 `POST /api/agent/plans`，入参新增 `intakeId`
  - 题库 6 类、必要な力每类 8 项、配点模板 6 类、人物类型短名字典放在 `shared/domain/plan-templates.ts`，作为静态常量并同步给 App。
- **为什么**：
  - 现有 `plans` 只有 `goal_snapshot` 文本和 `horizon`，期限是必填；
  - 问答只有一个固定问题；
  - 没有背景、团队、目的阶梯、前提快照；
  - `plan_items.kind=info` 只在生成之后才存在，承载不了「生成前」的问答。
- **规范**：
  - 符合：模块内追加 v2、forward-only、有 checksum；新表首列 `workspace_id`；复合外键；状态机用 CHECK；幂等沿用 `plan_commands` 回执。
  - 注意：放宽 `horizon` 属于修改约束。替代做法是不放宽，让 v2 计划写 `horizon='year'` 作占位。不推荐，因为这会把假数据写进库，旧代码还会按「年」去算周次。
- **影响面**：
  - `resolvePlanService` **CRITICAL**（50 个影响点、14 个直接调用方，涉及 Plans / Scripts / App / Api / Iorbit-0918 模块）；
  - `createPlanBootstrapService` LOW；`createAiPlanGenerator` LOW。
  - **对策**：v2 走新的服务入口 `createPlanV2Service`，复用 repository 与 `plan_commands`。旧的 `resolvePlanService` 只加 `model_version` 分支读取，不改变 v1 的行为。v1 旧计划保留只读，并提示「新しいプランを作る」（不自动重写，与 D44 一致）。
- **分期**：P3。

### D-02b 每个目标各一份生效计划（小改，迁移）

- **改哪里**：同属 v2 迁移。`plans` 加 `goal_id text`（= `plan_intakes.id`）；部分唯一索引从 `(workspace_id, actor_id) where active` 改为 `(workspace_id, actor_id, coalesce(goal_id,'legacy')) where active`。另加服务层上限：同时 active 的目标 Free ≤2、Pro ≤10。
- **为什么**：设计要求「目標 1 / 2」可以切换；现有唯一索引 `plans_one_active_per_actor` 限定每人只有 1 份。
- **规范**：替换索引需要 `drop index` + `create unique index`，用普通事务即可，因为表很小。符合 forward-only。
- **影响面**：同 D-02。`basePlanId` 乐观并发不受影响（仍按单份计划）。
- **分期**：P3。如果 §5 Q6 决定首期不做付费档，可以先限制为 1 个目标，这一条推迟。

### D-03 AI 初版的输出结构（小改：新提示词版本）

- **改哪里**：
  - `features/plans/ai-generator.ts`：新增提示词版本 `plan-ai-2026-11-v2`（4 层：系统方针 v4、目标类型模板、业界现状引用、用户前提）。
  - 输出 schema 新增 `steps[]{title, why, evidence, doneCriteria}`、`personTypes[]{slot, shortName（必须来自字典）, roleSituation, allocation, targetCount, why, questions[3], countRule, recognizeHints, persona, introRoutes}`、`citations[]`（业界条目 ID）、`conclusion`。
  - 保存映射：
    - steps → `plans.phases`（新增 `schemaVersion:2` 形状，不含周次）；
    - 每个人物类型 → 一条 `plan_items.kind='network_need'`，`criteria` 增加 `typeCode`，新增列 `allocation`，长文本放 `meta.personType`；
    - イベント一块 → `plan_items.kind='event'` 一组，加 `allocation` 汇总。
  - 校验器（`features/plans/validate.ts`）增加四条：短名在字典内、配点 5 分一档且合计 100、引用 ID 存在且更新不超过 12 个月、`targetCount` 在 1–5。
- **为什么复用 network_need**：人物类型的本质就是「某类人脉需求 + 目标人数」。现有候选匹配管线（`plan_match_jobs/candidates`，rule + AI，pending/accepted/dismissed，用户 ✓/✕）可以原样用于「人脈の候補」，不必重建一套匹配。
- **迁移**：并入 D-02 的 v2：
  - `plan_items` 加 `allocation smallint check (allocation is null or (allocation between 0 and 100 and allocation % 5 = 0))`；
  - 加 `skipped_at timestamptz`；
  - `criteria` 的 CHECK 不动（仍只允许 network_need）。
- **规范**：
  - 提示词改动要升版本号，旧 generation 无法重试，这是既定惯例（event-ops fingerprint 约束同理）；
  - `analysis.generator` 标记为 `deepseek-plan-v2`；
  - 合计 100 由服务层在一个事务内校验。不用延迟约束触发器，与现有「状态机在服务层 + CHECK 兜底」的风格一致。
- **影响面**：`createAiPlanGenerator` LOW（2 个直接调用方）；`deepseekJsonChat` **HIGH**（7 个上游）。只新增调用点、不改函数签名，所以 deepseekJsonChat 本身不动。
- **付费**：初版属于 `purpose='plan'` 的复用；只换了新提示词，仍算付费调用，列入附录 A。

### D-03b AI 修正与方案を見直す（新增）

- **改哪里**：
  - 新路由：`POST /api/agent/plans/[planId]/revisions`，入参 `{kind:'generation_fix'|'review', instruction, premisePatch?, idempotencyKey}`；返回差分 `{changes[], unchanged[], noChangeReason?}`。保存时生成新的计划版本，沿用 `previous_plan_id` 版本链和 `basePlanId` 并发。
  - 计数：
    - 生成流程内 ≤3 次记在 `plans.revision_count`（不改也计）；
    - 「見直し」的月度配额沿用 **plan_log 幂等键计数法**，把 `reanalysis:<YYYY-MM>` 扩为 `review:<YYYY-MM>:<n>`，n 取 1..上限，服务层取第一个空位；
    - `REANALYSIS_MONTHLY_LIMIT` 从常量 1 改为按档位取值（Free 3 / Pro 30）。
  - 已得分不变，只重分「まだの点」：修正只能改 `allocation` 和 `targetCount` 中尚未得分的部分，校验器保证这一点。
- **为什么**：现有 reanalyze 是整份重新生成，每月 1 次，用的是唯一键 `reanalysis:<month>`（`features/plans/reanalysis.ts:10-14,43`），结构上做不到「每月 3 次」和「差分修正」。
- **规范**：
  - 不建新计数表、继续用 plan_log 唯一约束兜底，与现有做法一致；
  - 账本新增用途 `plan_revise`，需要迁移放宽 CHECK（见 D-09）。
- **影响面**：`REANALYSIS_MONTHLY_LIMIT` 的 GitNexus 结果是 UNKNOWN，文本搜索确认只有 `features/plans/service.ts:56,1441` 两处引用；`createPlanFollowUpService` LOW。
- **付费**：新调用，见附录 A ②③。

### D-03c 手動編集 1 回（小改）

- **改哪里**：新命令 `POST /api/agent/plans/[planId]/manual-edit`，一次提交全部变更：Step 改名、排序、删除、增加；人物类型人数、配点、删除。服务层做三件事：
  - 按「从配点最高的类型按 5 分增减，同分按模板顺序」重新分配，保证合计 100；
  - 每人分 = 配点 ÷ 人数取整，余数由最后 1 人补；
  - 校验 `manual_edit_available`，用后置为 false；每次見直し之后重新置为 true。
- **为什么**：现在只有逐条 `PATCH items/[itemId]`，无法原子地保证合计 100，也没有次数限制。
- **规范**：命令式接口 + 幂等回执（`plan_commands`）+ `basePlanId`，与现有计划命令一致。
- **影响面**：新路由；落在 `resolvePlanService` 的新方法上（CRITICAL 的服务，但只新增方法，不改已有方法）。

### D-04 计划分数（小改，读时计算，不建分数表）

- **改哪里**：新纯函数 `shared/compute/plan-score.ts`，输入计划条目和 plan_log，输出 `{total, talked, skipped, overflow, remaining, byType[], todayDelta}`；随 `GET /api/agent/plans/current` 返回 `score` 字段（可选，只加不改）。计分规则：
  - 一个人在一个类型下只计一次 = `contact_links[].state='established'`。现有结构天然就是「人 × 类型」唯一。
  - 不填名字的线下自报：新命令 `POST /api/agent/plans/items/[itemId]/self-report`，写 plan_log `event='self_report'`，按条数计分，上限为目标人数，不参与超额半分。**不写 human_encounters**，因为那里 `contactId` 必填，且 `HumanEncounterRecord` 的 impact 为 **HIGH**（24 个影响点）。
  - 超额半分向下取整、不封顶（直到 `achieved_at`）。
  - 跳过 = `plan_items.skipped_at` 非空即计满分；撤回把它置回 null，并写 plan_log。
  - イベント：`kind='event'` 且 `status='attended'` 按次数计分，满额后半分。
  - 「今日 +N」= 当天（东京日）plan_log 中的计分事件之和。
  - 撤销 Toast = 一条对冲 plan_log 加状态回退。面谈记录保留。
- **为什么不建 `plan_score_events` 表**：现有 `contact_links`、`skipped_at`、`plan_log` 已经能完整推出分数，读时计算就不存在两份事实不一致的问题。规模上每份计划只有几十条，不需要物化。
- **规范**：`shared/compute` 只加不改；App 通过 sync 拿到同一个函数，两端分数口径一致。
- **影响面**：新文件；`GET current` 的 DTO 只是新增字段。
- **分期**：P3。首页「プラン スコア」组件依赖它。

### D-05 面談メモ「聞けたこと」判定（新增付费调用）

- **改哪里**：扩展 memo 提取管线 `features/contacts/memo-extraction/provider.ts`。当 memo 关联的联系人属于某人物类型的候选或已关联时，在**同一次提取调用里**追加输出 `questionCoverage{personTypeItemId, answered:[0|1|2]}`，提示词版本 +1。命中 ≥2 问时生成一条**待用户确认**的计分提议（虚线确认卡），确认后才把 link 置为 established。
- **为什么**：现有 memo 提取只抽取 offering / seeking / topics，不知道计划里的 3 个问题。
- **规范**：
  - 不新增调用次数，只是同一次调用的输出变多。但提示词变了，属于付费调用的变更，需要授权；
  - 用途仍是 `memo_extraction`，计入后台池；
  - 遵守「AI 只提议，用户确认」。
- **影响面**：memo-extraction 仅限本模块；`createConfiguredNoteService` **CRITICAL**（12 个影响点、3 条流程），但这里不改它，只消费 notes 写入后的事件。
- **已定（Q4-a）**：用 AI 判定。AI 不可用或超额时降级为用户手动勾选「3 問のうち聞けたもの」，按规则计分。

### D-06 业界现状库（新增）

- **改哪里**：新模块 `features/plans/landscape/`。
  - 迁移 `landscape_entries`，列为 `workspace_id, id ('L-101'), version, goal_kinds text[], industries text[], title, summary, body, source, updated_on date, status ('draft','published','retired'), checksum`，主键 `(workspace_id, id, version)`。
  - 管理端在 `app/(app)/app/admin/landscape`（admin 暗色壳），权限沿用 admin。
  - 初版生成时只注入 published、且 `updated_on` 在 12 个月以内的条目；计划记下 `citations[{id,version}]`。
- **为什么**：现在没有这样的库；设计要求「只能引用库内资料，可展开查看」。
- **规范**：版本化 + checksum，与 contact_insights 的版本风格一致。库版本升级不自动改写已有计划，与「计划阶段与目标不自动改写」一致。
- **影响面**：全新模块。
- **内容来源（Q7 已定）**：实施会话的 Claude 撰写初始条目（约 20–30 条，每条附公开出处），Codex 只读审核后再发布；不走付费 API。

### D-07 活动评估（任意 URL / 海报）（新增，付费）

- **改哪里**：新模块 `features/events/assessment/`。
  - 迁移 `event_assessments`，列为 `workspace_id, id, actor_id, source_kind ('url','poster','orbit_event'), source_url, source_digest, event_id null, facts jsonb (AI 只填事实), score_breakdown jsonb (规则计算), total smallint, verdict ('recommend','conditional','skip'), rubric_version, status ('reading','ready','needs_input','failed'), missing_fields text[], idempotency_key, created_at`；唯一索引 `(actor, source_digest, rubric_version)`，同一来源重复评估时幂等返回。
  - 路由：`POST /api/events/assessments`（URL 或上传海报）、`GET /api/events/assessments(/[id])`、`PATCH /[id]`（补 3 项：日時、場所、参加費）、`POST /[id]/add-to-plan`（加入参加予定，沿用 plan_items kind=event 或现有报名）。
  - 打分规则 `shared/compute/event-score.ts`（固定 45/15/20/10/10，① 用剩余目标人数加权；阈值 70 和 50）。
  - **URL 抓取**：新建服务端 fetch，带 SSRF 防护：只允许 http/https、拒绝私网/环回/元数据地址（DNS 解析后校验）、5 秒超时、2MB 上限、不带 cookie、跟随最多 3 次重定向并逐跳校验。全仓目前没有外部 URL 抓取能力。
  - **海报**：复用名片 vision 管线（`deepseek-business-card-ocr-provider`，单独的提示词）。
  - 用户活动偏好（平日夜可、移动 60 分钟、¥5,000 以内）放新 collection `eventPreferences`，不放进 agentPreferences，理由同 D-01。
- **为什么**：现有推荐评分 `live-event-value-service.ts:215-260` 只针对库内活动，权重也不同；也没有 URL 或海报入口。
- **规范**：新表 + 幂等键 + 规则与 AI 分离（AI 只填事实），与「活动分数后台固定标准」的决定一致；新账本用途 `event_assessment` 需要放宽 CHECK（D-09）。
- **影响面**：全新模块；推荐服务 `createEventValueRecommendationService` LOW。D-08 会碰它。
- **付费**：新调用，见附录 A ⑤。口径冲突（3 维还是 5 项）的处理见附录 D-c。

### D-08 活动推荐「興味なし」反馈（小改）

- **改哪里**：`POST /api/recommendations/events/[id]/dismiss`，入参 `{reason:'schedule'|'distance'|'content'|'known'}`。存入新 collection `eventRecommendationFeedback`，推荐服务读取后降权或过滤。
- **为什么**：现在只有 `/accept`。
- **规范**：用 collection，不需要迁移；只加不改。
- **影响面**：`createEventValueRecommendationService` LOW（3 个直接调用方、2 条流程）。

### D-09 AI 账本用途与配额（迁移）

- **改哪里**：
  - `features/network-analysis/migrations.ts` 追加一个版本，放宽 `ai_usage_ledger.purpose` 的 CHECK，加入 `plan_intake`、`plan_revise`、`plan_review`、`event_assessment`、`mail_summary`（最后一项视 §5 Q5 决定）；
  - 同步更新 `features/ai-quota/constants.ts` 的 `AiQuotaPurpose` / `AI_QUOTA_PURPOSES` / `AI_QUOTA_MAX_CALLS`；
  - 新增按档位的月度上限：见直し 3/30、活动评估 10/不限、iOrbit 提问 50/1000，按东京自然月、每月 1 日重置。
- **为什么**：用途写死在 CHECK 里（`migrations.ts:35`）；现有配额都是日配额，没有月配额。
- **规范**：放宽 CHECK 已有先例（`plan-matching-plan-source` v4，`features/plans/matching-migrations.ts:155-185`）；月配额沿用 plan_log 或账本的计数法，不另建表。
- **影响面**：`AiQuotaPurpose` MEDIUM（35 个影响点）；`createPostgresAiUsageLedger` **CRITICAL**（80 个影响点，涉及 Sync / Plans / Insights 模块）。**只扩枚举和常量，不改 ledger 的函数行为**；迁移前要先在生产上执行 M1 预检。
- **iOrbit 提问 50/月**：现在对话**不计量**（只在请求层预留了位置）。要开始计量，前提是 §5 Q6 决定首期是否引入档位。

### D-10 联系人浓度、来源与筛选（小改）

- **改哪里**：
  - 新纯函数 `shared/compute/contact-density.ts`：●○○ 只有身份；●●○ 有联系方式且有相遇时间或场合；●●● 有目标关系或往来；本人入力直接 ●●●。
  - `ContactListItemContract` 加可选字段 `density?: 1|2|3`、`sourceChip?: 'meishi'|'linkedin'|'phone'|'manual'|'self'`，由服务端计算后返回。
  - `/api/contacts/page` 加筛选参数 `density=1`、`goalRelated=1`、`needsFollowUp=1`；`/summary` 加 `densityCounts`、`addedThisMonth`。
  - 连絡先导入的「仕事関係らしい」预选用规则：有公司名、或公司域名邮箱、或职称关键词，不调 AI。
- **为什么**：现有字段（source、evidence、lastInteractionAt）足以推导，只差计算和筛选。
- **规范**：只加可选字段、只加参数，契约同步。
- **影响面**：`ContactListItemContract` MEDIUM（79 个影响点、4 个直接）。新增可选字段不会破坏现有消费方，App 端 view-model 的 `contactField` 约束要同步。

### D-11 あとで補完「1日1問」（新增，零 AI）

- **改哪里**：
  - 新 collection `contactCompletionQuestions`，字段 `contactId, question, options[], askedOn, answeredAt, skipCount`；
  - 每日由规则生成 ≤1 题：选项来自同时期参加的活动、前职重合、「紹介」「覚えていない」；
  - 路由 `GET /api/contacts/completion-question`、`POST .../[id]/answer|skip`；
  - 连续跳过 3 次后不再问这个人。答案写入联系人的「相遇场合」（`contact_detail_states`）。
- **为什么**：现在没有这项能力。
- **规范**：collection、零迁移；联系人写入沿用 `contact_detail_states` 的版本 CAS。
- **影响面**：新文件。

### D-12 To-do 聚合（先在前端聚合，后加只读接口）

- **P2 做法**：零后端改动。两端用现有接口拼出三块：
  - 判断待ち = 待处理任务建议 + agent actions（awaiting）+ 计划候选 pending + 实体草稿 pending_confirmation + 1日1問；
  - 今日の一手 = agent signals（home）+ 计划今日机会；
  - フォロー = `relationship-tasks/page` + `category=relationship` 的 tasks。
- **P4 优化**：新增只读接口 `GET /api/todo/page`（服务端聚合，减少首屏请求数）；只读，不改各来源。
- **影响面**：读取 `createConfiguredTodayService` LOW。
- **D-12b 延期次数（小改）**：`TaskItemContract` 加可选字段 `deferralCount`，由服务端从任务 activities 推导，不新增存储。`TaskItemContract` MEDIUM（68 个影响点），只加可选字段。

### D-13 招待コード（新增）

- **改哪里**：新模块 `features/invite-codes/`。
  - 迁移 `invite_codes`：`workspace_id, code (8 位大写 base32，去掉易混字符), actor_id, share_fields jsonb, max_uses smallint default 10 check (max_uses between 1 and 10), used_count, expires_at (= created+7d), revoked_at, created_at`；部分唯一索引：每人同时只有 1 个有效码。
  - 迁移 `invite_code_redemptions`：`code, redeemer_actor_id, redeemed_at, outcome ('connected','merged','already_connected')`；唯一 `(code, redeemer)`；用量计数在事务内递增并校验上限。
  - 路由：`POST /api/invite-codes`（发行或再发行，旧码作废）、`GET /api/invite-codes/current`、`POST /[code]/revoke`、公开 `GET /api/invite-codes/[code]/preview`（只返回邀请人名片上的共享字段）、`POST /api/invite-codes/[code]/redeem`（已登录时）。
  - 网页注册页 `/i/[code]`：注册后自动 redeem。
  - 双向加入：给双方各建一条联系人（`source='self'`）+ `contact_actor_links`（这个集合已存在，用于「本人入力」同步）。如果邀请人已有对方的名片卡，就合并为本人入力。
  - 对方修改资料后自动同步：订阅对方 profile 更新，改写 link 联系人的共享字段，旧值进入履历。
  - 双方推送计入每天 3 件。
- **为什么**：现有 `relationship-communication/invitations` 是「对某个联系人、指定收件人、7 天、接受后开站内会话」（`features/relationship-communication/service.ts:282`），语义是沟通资格，不是加人码；`contact_invitations` 只到 `ready_for_delivery`。
- **规范**：新模块 + 迁移 + 幂等（redeem 用 `(code, redeemer)` 唯一约束）。**不代发**：码和链接由用户自己分享，「メッセージの下書き」只是模板，与「止于草稿」一致。
- **影响面**：`createConfiguredRelationshipCommunicationService` UNKNOWN，文本搜索只有 1 处路由引用。本条不改它，另起模块。

### D-14 メモ类型与 @イベント（小改）

- **改哪里**：
  - `shared/contract/notes.ts` 的 `NoteContract` 加可选字段 `noteKind?: 'free'|'meeting'|'voice'`（缺省为 free）、`usedForPlan?: boolean`；
  - `NoteMentionContract` 加可选字段 `entityType?: 'contact'|'event'`、`eventId?`，缺省视为 contact，保持兼容；
  - notes 服务接受并校验这些字段（orbit_records 的 payload，不需要迁移）；
  - 「面談の記録」继续写 `appointments/[id]/memo`（已有），列表时把 appointment memo 合并显示；
  - 语音 = 现有 transcribe 转成文字后保存为 `noteKind='voice'`。
- **为什么**：现在 mention 只能 @人，也没有类型。
- **离线**：notes 在 App 里可以离线写（outbox），新字段跟随 patch 上传；服务端按 `(actorId, idempotencyKey=mutationId)` 去重，不受影响。旧版 App 不传这些字段，默认值即可。
- **影响面**：`NoteContract` MEDIUM（41 个影响点）、`NoteMentionContract` MEDIUM（40 个）、`createConfiguredNoteService` **CRITICAL**（12 个影响点、3 条流程 GET/POST/PATCH）。**对策**：只加可选字段，校验函数单独加一个分支；补测试覆盖「旧 payload 往返不变」。

### D-15 秘書来源进收件箱（小改，规则生成，不调 AI）

- **改哪里**：
  - `shared/contract/inbox-notifications.ts` 的 `InboxSourceKind` 增加 `'event_deadline' | 'event_prep' | 'event_pick' | 'mail_summary'`；
  - 前端「秘書」分类 = sourceKind 属于这个集合；**`InboxNotificationKind` 不动**（deadline/prep 归 reminder，pick 归 suggestion，mail 归 update）；
  - 新维护任务 `secretary-digest`：每天为「参加予定 / 評価済み」的活动生成截止和会前准备通知（前一天 + 当天 7:50），活动推荐从现有推荐服务选 Top-1。
  - 维护心跳要登记这个新任务，并核对部署后任务清单（前车之鉴：heartbeat 跑旧部署，见 W0057）。
- **为什么**：现在 reminder 的目标只有 task 和 schedule_item，没有活动截止；收件箱也没有秘書分类。
- **规范**：枚举只加值；投影走现有 `orbit_inbox_projection_work`。
- **影响面**：`InboxNotificationKind` LOW（不动）；`InboxNotificationDTO` **HIGH**（87 个影响点）。只扩 `InboxSourceKind` 的取值，DTO 结构不变。App 端如果对 sourceKind 做了穷举 switch，需要加默认分支（线 B 在 sync 后用 typecheck 检查）。

### D-16 AI 秘書・メール要約（新增，需授权；§5 Q5）

- **改哪里**：
  - Gmail scope 增加 `gmail.readonly`（`features/integrations/service-factory.ts` 的 `validateIntegrationScopes` 白名单）；
  - 新任务：只读取「已登记联系人」的线程，摘要 3 条 + 待办候选（确认卡）+ 回复草稿（复用 email-draft）；
  - 摘要只给本人看，存 collection `mailSummaries`，不保存邮件全文，只存摘要和来源消息 id；
  - 新账本用途 `mail_summary`。
- **为什么**：现在只有 metadata 权限，读不到正文。
- **风险**：`gmail.readonly` 属于 Google **restricted scope**，生产使用需要 OAuth 应用验证和第三方安全评估（CASA，每年一次），时间和费用成本都高；另外隐私说明要改。
- **影响面**：`validateIntegrationScopes` **CRITICAL**（12 个影响点、5 条流程）；`createConfiguredOrbitIntegrationService` **CRITICAL**（66 个影响点）。
- **推荐**：首期不做，秘書先只上 D-15 的期限和推荐两项（零新 AI 调用）。

### D-17 推送频控与合并推送（小改 + 新机制）

- **改哪里**：
  - `features/notifications/delivery-policy.ts`：静音时段从写死的 22:00–08:00 改成读偏好，默认 22:00–07:30；
  - `delivery-policy-repository.ts:97` 的日配额从「自动 2 + 建议 1」改为「全部合计 3」；
  - 面談 30 分前作为预约型提醒，计入当天 3 件但不受静音限制（可开关）。
  - 新机制「7:50 合并」：静音期间被 defer 的投递在 7:50 合并成 1 通（新 delivery kind `digest`），收件箱里按日分组显示「7:50 にまとめて」。
  - 偏好契约 `InboxDeliveryPreferencesDTO` 加可选字段 `quietStart`、`quietEnd`、`dailyCap (1..3)`、`secretaryMail`、`secretaryDeadline`、`secretaryPick`、`meetingException`。
- **为什么**：静音时段写死、没有时段字段；日配额和设计不一致；没有合并推送。
- **规范**：偏好用 revision CAS（已有）；只加可选字段。
- **影响面**：`evaluateDeliveryPolicy` LOW；`deliveryQuotaUsage` LOW；`defaultDeliveryPreferences` LOW；`createDeliveryPolicyRepository` **HIGH**（11 个影响点，涉及 Notifications / Sync / Tests）；`InboxDeliveryPreferencesDTO` MEDIUM（25 个）。这是**用户可见的行为变化**（推送变多，晚上更早解除静音），但设计决定表已经定稿，不需要再找你确认。

### D-18 iOrbit 会话保存 90 日、置顶上限 5（小改，§5 Q8）

- **改哪里**：置顶上限在 `PATCH sessions/[id]` 的服务层校验，超过返回 409 `PIN_LIMIT`。90 日清理用新的维护任务，对超期且未置顶的会话做软删（已有 `deletedAt`）。
- **影响面**：orbit-ai 会话存储，局部。
- **说明**：「90 日自动删除」会删掉用户数据，属于产品取舍，见 §5 Q8。

### D-19 Web 页面上下文入 iOrbit（小改，待核实）

- 「このページを文脈に含める」：对话请求增加可选字段 `pageContext {route, filters, count}`。现有对话入参是否已经支持，需要在 P1 用 GitNexus `context` 核实；不支持就作为可选字段加入，作用是注入系统上下文，不新增调用次数。

### D-20 订阅与权益（新增，§5 Q6）

- 新模块 `features/billing/`，迁移 `entitlements (actor, tier free|pro, source app_store|web, period_end, grace_until, status)` 和 `billing_events`（webhook 幂等，唯一键为 provider event id）。
- App 用 StoreKit 2（或 RevenueCat），服务端校验 App Store Server Notifications V2；Web 用 Stripe Checkout、Webhook，并做领收书（适格请求书）和特商法页面。
- 所有配额（D-09）读 tier。
- 这是全新领域，涉及外部账户（Apple、Stripe）、法务页面和税务，建议作为独立项目。

### D-21 数据导出（新增）

- 新任务 `account_exports (actor, scope[], status, file_key, expires_at = +7d, created_at)`，每天 3 次（按东京日计数）。产物存对象存储并给签名链接；完成后发推送和邮件。这封邮件是 Orbit 名义的系统通知，不属于「代发个人邮件」。

### D-22 退会 30 日冷静期（新增）

- `account_deletion_requests (actor, requested_at, purge_after = +30d, cancelled_at, reauth_at)`；到期后清除任务按领域逐个执行（需要清单）。期间登录显示「削除を取り消す」。App 内购不随退会自动停止，只给出提示。

### D-23 版本检查（小改）

- `GET /api/health` 或新的 `GET /api/app/version` 返回 `minSupportedAppVersion`；App 低于它时强制更新，Web 显示新版本浮条。

### D-24 iOS 小组件与 Live Activity（新增，原生）

- App 新增 WidgetKit extension + App Group 共享容器（Expo config plugin，放在 `plugins/` 下）。主 App 把首页组件数据（同 D-01 / D-04 / D-15）写入共享容器，小组件只读。Live Activity 用 ActivityKit，开始时间由活动和面谈数据决定。服务端零改动，远程推送更新留到后期。

### D-25 NFC 交換（新增，后期）

- 需要 `react-native-nfc-manager`（原生依赖）读写 NTAG；被碰方的网页 `/n/[tagId]`；服务端 `nfc_tags (tag_id, owner_actor, kind badge|card, event_id?)`。交换写入复用 `event_ops_contact_requests` 或 D-13 的连接逻辑；24 小时内可撤销。

---

## §3 纯前端改动清单

### 3.1 设计 token 与共享源（线 A 产出源文件，线 B 同步）

| 项 | 做法 |
|---|---|
| token 单一来源 | 以 `kit/tokens.css` 为准，生成 `shared/design/tokens.json`（light / dark、radius 24/20/14/10 + sheet 34 / dialog 28 / chip 999、gap 14、ease、scrim .28/.22、shadow-float、font、font-num）。用脚本分别产出 App `src/design/tokens.ts`（保持 `colors` / `darkColors` 双导出，满足 `tests/theme-wiring.test.ts`）和 Web 的 `orbit-2026-tokens.css`。同步沿用 App 的 `sync:contract` 机制，在脚本里增加 design 目录。 |
| 键名统一 | 统一到新命名：`ink / ink-2 / ink-3 / ink-4`、`surface-1..3`、`plum-*`、`rose-*`、`mac-*`、`coral`、`ok`。App 的 `text2/text3` 和 Web 的 `--text-2` 在迁移期保留别名，屏幕替换完成后删除。旧 `rose`（错误红）映射到 `coral`。 |
| 对比度 | 新 `ink-3` 在 surface-2 上只有 2.54:1，马卡龙 ink 色在 3.86–4.47:1，coral on coral-soft 只有 2.14:1，**两端门禁都会失败**。处理方式见附录 D-a：文字用色调深到 4.5:1，原值只用于装饰和图形。 |
| 字体 | 删除 Noto Serif SC 和 SC 字体栈。Web 使用 `-apple-system, "Hiragino Sans", "Noto Sans JP", system-ui`（Noto Sans JP 用 Google Fonts，只加载 400/500/700/800）；App iOS 在 ja 语言环境下系统字体就是 Hiragino，不打包字体。数字用 `tabular-nums`。 |
| 字号阶 | 新增 14.5 / 11.5 / 12.5 / 10.5 / 9.5 / 38–46 和 900 字重。先改 Web 刻度门禁 `tests/ui/orbit-scale-ratchet.test.ts:60` 与 App `textStyles`，再动屏幕。 |
| 图标 | 把 kit.js 的 50 个线性 path 和 5 个 mask 导出为 `shared/design/icons.json`。App 用 react-native-svg 渲染（替换 Ionicons，涉及 72 个文件，随屏幕替换逐步换掉）；Web 用内联 SVG 替换自绘 `Icon`。 |
| 标准文案 | 把 ⑩ chip 用词、⑯ 草稿边界标准句（「下書きまで · 送信はあなたが行います」）、Toast 和确认框动词、导航名、离线/降级文案做成 `shared/copy/ja.ts`（同时有 zh/en），两端同源。 |

### 3.2 日文化（两端）

- **App**：ja 目录已经有 2,184 个键，质量可以。缺口是 116 个文件里约 2,777 行硬编码中文（含 view-model 标签，例如 `app-navigation.ts` 的 parent 标签、`AppScreen` 的「返回」）。**随屏幕替换一起抽出来，不单独做一轮。**默认语言见 §5 Q3。
- **Web**：约 2,615 处 `t({})`，带 `ja:` 的只有约 248 处；缺 ja 时回退英文。新屏一律写 ja。把 `t()` 的 `ja` 参数改为**新屏必填**（新组件目录用类型门禁）；旧屏随替换补齐。
- 日期格式「10月7日（水）」、全角括号、`word-break: auto-phrase` 做成共享格式化函数（`shared/compute/format-ja.ts`）。

### 3.3 导航壳

| 端 | 文件 | 改动 |
|---|---|---|
| App（线 B） | `src/components/OrbitTabBar.tsx` | 5 项改为 home / contacts / **iorbit** / events / **task**；玻璃胶囊；中间的 iOrbit 不再是方块（impact HIGH：84 个影响点、3 条流程） |
| | `src/view-models/app-navigation.ts` | `MainTab` 加 task、去掉 profile；`parentForPath` 的标签走 i18n（impact HIGH） |
| | `src/components/AppScreen.tsx` | 头部样式、返回文案、tab 判定（impact **CRITICAL**：82 个影响点、58 个直接调用方。**对策**：只改内部渲染，props 不变，并补一组快照测试） |
| | `EventsScreen.tsx`、`ProfileScreen.tsx` | 去掉它们自己挂的底栏 |
| | 新 `app/(app)/task.tsx` + `src/screens/task/TaskScreen.tsx` | 四段容器；`/schedule`、`/tasks`、`/today`、`/notes` 改为二级页或重定向（三张登记表都要更新：`app-wide-route-coverage`、`route-parity`、`page-offline-inventory`） |
| | `app/(app)/_layout.tsx` | 保持 Stack（`tests/app-navigation-source.test.ts` 断言没有 Tabs） |
| Web（线 A） | `orbit-public-shell.tsx` 的 `OrbitTopNav` | 改为新的左栏组件 `OrbitSideNav`（新文件），旧的顶部导航在全部域切换后删除（impact **CRITICAL**：51 个影响点、9 条流程，涉及 contacts / events / tasks 各页） |
| | `orbit-account-shell.tsx` 的 `AccountTopNav` | 换成新壳 `Orbit2026Shell`（左栏 + mainhead + 可选右栏）。0918 六域的 shell 逐个切换（impact **CRITICAL**：40 个影响点、27 个直接调用方） |
| | `orbit-global-ask/*` | 悬浮球改为 ⌘K 面板（impact LOW） |
| | `home/page.tsx` | 不再重定向，改为组件首页；iOrbit 概览退回 `/app/agent` |
| | 新 `/app/tasks`（Task 四段）、新 `/app/inbox` 列表页 | `/app/agent/plan` 重定向到 `/app/tasks?tab=plan` |
| | `orbit-layout-constants.ts` | 新增左栏 84 / 右栏 360 / 历史 260 常量（212px 常量保留给人脈旧屏，替换后删除） |
| | `orbit-reference-styles.tsx` | **冻结不改**。新样式放新作用域 `[data-orbit-2026]`，并照搬 0918 的作用域约定（layout 级组件自带属性 + `display: contents`；按钮用双类以避开 `[data-orbit-real-page] button` 的重置特异度） |

### 3.4 组件库（两端各写一份，规格同源）

两端都要新建（多数在 App 里完全不存在）：

- 基础：Card / flat / mac 小块、Button（胶囊、高 40/32、danger 三态）、圆形图标钮、Chip（7 色语义表）、筛选 `.fopt` / 单选 `.cat`、Task 分段（可滑动）、列表行 + 左滑（App 用 Reanimated / Gesture Handler；Web 悬停出快捷钮）、马卡龙字母头像 / 叠放头像、进度条、单色环形图。
- 计划：构成条（实色 / 斜纹 / 豆沙 / 灰）、浓度三点、来源 chip。
- 反馈：Toast（墨色胶囊 + 5 秒倒计时线 + 元に戻す，App 用来替换 11 处 `Alert.alert`）；居中确认 dialog 296；动作表；Web 的 wmodal 420/480/560 与抽屉 600/520/380（继续走 `useOrbitModalA11y`）；底部弹层（圆角 34）。
- AI：虚线确认卡 → 成功卡 / 失败卡；依据「?」展开。
- 控件：开关 44×26（App 目前一个 `<Switch>` 都没有）、圆形完成勾、方形多选框、kbd（仅 Web）。
- 状态：空状态（幽灵行）、示例角标与横条、骨架 shimmer（不用全屏转圈）、离线横条、配额 chip。
- 首页组件框架：`.hw` 小/中、编辑态、组件库 sheet；iOrbit 全屏头；メモ卡与 @ token；加人 sheet。

### 3.5 交互规范（写进两端组件，不逐屏重复实现）

- 可撤销的动作不弹确认，直接执行，Toast 提供「元に戻す」；破坏性确认默认焦点在「キャンセル」。
- AI 写入一律先出虚线确认卡，结果原位变化，不另弹 Toast。Orbit 内没有「送信」按钮。
- 缓动统一 `cubic-bezier(.2,.8,.2,1)`；reduced-motion 时只保留淡入。
- 示例数据只存在前端，不写库，不进统计、搜索和 AI 依据。

### 3.6 视觉验收工具

- Web 像素门禁 `scripts/visual/compare-0918.mjs` 的设计源固定为 `docs/designs/Orbit_0918`。需要新增对 `redesign-2026-10` 的画板选择器和新的归因文件 `attribution-2026-*.json`。旧的 0918 归因随屏幕替换作废。设计稿用 `python3 -m http.server 3320 -d docs/designs` 提供。
- App 沿用 `design-qa.md` 的口径：390×844@2x、320pt 1.6×/2×、820pt 深色、大字号不裁切，并补 iOS Simulator 验收。

---

## §4 分期建议（两条线并行）

原则：

1. **先换壳和 token**，这样每一屏都能直接落到新框架里，用户最早看到整体变化。
2. **依赖现有接口的屏幕先做**，P1–P2 后端几乎零改动；计划 v2.2 等重后端功能放到中段。
3. 每期都是「线 A 先出契约 → 线 B 用 mock 开发 → 双方各自接真实数据」。

```
            线 A（后端 + Web）                     线 B（App）
P0 基础   token/图标/文案源 · Web 新壳(左栏/⌘K)   同步 token · 组件库 · 新底栏 · Task 容器
            ↓ 契约: home-layout                          ↓
P1 首屏   Web ホーム组件 · 人脈 · iOrbit 全屏     App ホーム组件 · 人脈+＋sheet · iOrbit
            D-01 布局 · D-10 浓度                  （D-01 未就绪前先存本机）
P2 Task   Web Task 四段(カレンダー/To-do/メモ)     App Task 四段 · メモ @イベント
          · 受信箱页 · D-14 · D-12b · D-15 · D-17   · 受信箱 🔔 · 秘書分类
P3 计划   D-02/02b/03/03b/03c/04/06/09 + Web 页     App プラン段 · 人物タイプ詳細 · 生成流程
          【需授权：付费 AI ①②③④ + 生产迁移】
P4 活动   D-07 评估 · D-08 · Web イベント改版       App イベント三页签 · 评估 · 会う準備/会場
          【需授权：付费 AI ⑤】
P5 加人   D-13 招待コード · D-11 1日1問 · /i/[code]  App 招待コード · 連絡先 · LinkedIn CSV
          主催页视觉换新
P6 账户   D-20/21/22/23（看 §5 Q6）                App 订阅/导出/退会 · 小组件 · Live Activity · NFC
```

### P0 基础（约 1–1.5 周 / 每线）——最快看到效果

- **线 A**：`shared/design/{tokens.json, icons.json}`、`shared/copy/ja.ts`、生成脚本；Web `[data-orbit-2026]` 作用域 + `Orbit2026Shell`（左栏 / mainhead / 右栏）+ ⌘K 面板骨架；改写门禁：top-nav 3 个测试、sidebar-width、z-scale、scale-ratchet、contrast。旧页面先挂进新壳（内容不变），所以导航当天就能换。
  - 文件范围约 25–35 个：`app/(app)/app/{layout.tsx, orbit-2026-*/**, orbit-layout-constants.ts, orbit-global-ask/*}`、`shared/design/**`、`shared/copy/**`、`scripts/design-tokens/*`、`tests/ui/*` 约 8 个。
- **线 B**：同步 token；`src/design/{tokens,controls}.ts` 重写；`src/components/ui/*` 新组件库（Toast / Sheet / Dialog / Chip / Button / ListRow / Switch / Avatar / Segment）；OrbitTabBar 改 5 项；新增 Task 容器（四段先嵌入现有的 Schedule / Tasks / Notes 屏，プラン 段先放空态）；改写 `ink-signal-shell`、`app-navigation-source`、三张路由登记表；默认语言按 Q3 处理。
  - 文件范围约 30–40 个：`src/design/*`、`src/components/{OrbitTabBar,AppScreen,OrbitNavigationIcon}.tsx`、`src/components/ui/**`、`src/view-models/app-navigation.ts`、`app/(app)/task.tsx`、`src/screens/task/*`、`src/i18n/*`、`tests/*` 约 10 个。
- **完成标准**：两端打开即是新导航、新配色、日文导航；旧内容可以访问；测试零新增失败（以基线清单对照）。

### P1 首屏（约 2 周 / 每线）

- **线 A**：D-01（契约先合入）、D-10；Web ホーム组件容器 + 默认 5 个组件 + 编辑模式；人脈列表与详情抽屉换新；iOrbit 全屏 + 历史 260px。约 30–40 个文件。
- **线 B**：App ホーム（`HomeDashboardScreen` 换成组件容器，10 个组件）+ 编辑模式；人脈列表 + 「＋」sheet（内部仍走现有扫描、手入力、批量 V2）；iOrbit 全屏（≡ / ✕ / 右滑退出）；新接 `/api/contacts/[id]/insight`、`/api/network/snapshot`、`/api/guide/state`。约 35–45 个文件。
- 首页的「プラン スコア」组件在 P3 前显示「目標を決める」空态，不用假数据。

### P2 Task 与受信箱（约 2 周 / 每线）

- **线 A**：D-14、D-12b、D-15、D-17（含 7:50 合并推送）；Web Task 四段（To-do 用 D-12 前端聚合）、`/app/inbox` 页、下書きエディタ抽屉、「送りましたか？」。约 30 个文件；迁移 0 个。
- **线 B**：App Task 四段完整版（カレンダー 时间线和冲突、To-do 三块和左滑、延期 sheet、メモ类型和 @イベント、语音）；受信箱（🔔 入口、秘書分类、左滑）；推送设置页。约 30–40 个文件；outbox 的 note patch 要带新字段。

### P3 计划 v2.2（约 3–4 周 / 线 A，2–3 周 / 线 B）——最重，需要授权

- **线 A**：
  - plans 迁移 v2（D-02 / 02b / 03 的列）、landscape 迁移、账本 CHECK 迁移（D-09）；
  - intake / questions / premise / revisions / manual-edit / self-report 接口；
  - 新提示词 v2 与校验器；`shared/contract/plan-v2.ts`、`shared/compute/plan-score.ts`、`shared/domain/plan-templates.ts`；
  - Web プラン概要 / 人物タイプ詳細 / 生成流程（在 iOrbit 对话内）/ 手動編集页 / 見直し / 配额；
  - 业界库管理页。
  - 约 50–60 个文件，3 个迁移。
- **线 B**：App プラン 段（概要、人物类型详情、記録と加点、スキップ）+ 生成流程（iOrbit 对话内的卡片：背景三块、团队勾选表、目的阶梯、≤5 问、前提、初版、修正、手動編集）。约 25–35 个文件。
- **授权点**：付费 AI ①–④、⑥ 和轻量调用（附录 A，Q4 已定全部用 AI），本机验证期每项真实调用 ≤5 次；3 个迁移在本机验证后，生产执行另行授权。业界库由 Claude 撰写、Codex 审核（Q7）。

### P4 活动（约 2 周 / 每线）

- **线 A**：D-07（含 SSRF 防护抓取、海报 vision）、D-08、事件分数函数；Web イベント三页签 + 主从评估 + 详情吸顶评估条；会う準備、会場、会後视觉换新。约 30 个文件，1 个迁移。
- **线 B**：App イベント三页签、评估器 / 判定中 / 结果 / 异常态、详情、会う準備、会場モード、会後。约 30 个文件。
- **授权点**：付费 AI ⑤。

### P5 加人与主催（约 1.5–2 周 / 每线）

- **线 A**：D-13（2 个迁移）、D-11、`/i/[code]` 注册页；主催各页视觉换新。
- **线 B**：App 招待コード（说明 / 共享 / 草稿模板 / 过期）、連絡先导入（expo-contacts）、LinkedIn CSV（expo-document-picker + 现有导入接口）、1日1問卡；主催 3 屏。

### P6 账户与原生（视 §5 Q6 / Q9）

- D-20 订阅（独立项目）、D-21 导出、D-22 退会、D-23 版本检查、D-24 小组件与 Live Activity、D-25 NFC。

### 依赖关系（必须的先后）

- P0 的 token、组件库和壳 → 所有后续屏幕。
- D-01 → 两端首页编辑的持久化（P1 可以先存本机）。
- D-02 / 03 / 04 → 首页「プラン スコア」、活动评分 ①（剩余目标人数）、秘書推荐的「プラン Step」理由、会後回写分数。
- D-09 → 所有新付费调用和月配额。
- D-15 → 首页「秘書から」组件有真实数据。
- D-13 → 首页和人脈的「招待」入口（P5 之前隐藏）。

---

## §5 待你决定的问题

只列真正需要产品取舍或授权的事项。其余我按成熟产品惯例自定，见附录 D。

| # | 问题 | 选项 | 我的推荐 |
|---|---|---|---|
| **Q1** | 两人怎么分工？ | (a) 线 A 后端 + Web / 线 B App（按端切）；(b) 按领域纵切 | **(a)**。按端切冲突面最小；App 只经 HTTP 和 sync 契约消费后端（§0.2）。**已定**：产品负责人负责线 A（后端 + Web），伙伴负责线 B（App）。拆 Sprint 时写进两端 Sprint README。 |
| **Q2** | 并行开发需要频繁 push。是否把「push 个人分支和合回 `chat-agent`」作为常规授权？ | (a) 常规授权，每次合并不再单独问；(b) 每次都问 | **(a)**，但**生产迁移、部署、生产环境变量仍然每次单独授权**。 |
| **Q3** | 默认语言改成日语吗？两端现在默认都是 zh，新设计全日文，面向日本用户。 | (a) 新用户跟随设备、无法匹配时回退 **ja**；已有用户保留各自语言设置；(b) 维持 zh 回退；(c) 强制 ja | **(a)**。不影响现有中文用户，日本用户首屏就是日文。 |
| **Q4** | 计划 v2.2 的付费 AI 调用授权（详见附录 A）。①背景下书 ②生成内 AI 修正 ≤3 ③方案を見直す（Free 月 3） ④初版换新提示词 ⑥面談メモ「聞けたこと」判定。另外两个轻量调用（成员能力推定、目的阶梯重算）和「選題」「次の目標候選」用规则替代可以省掉。 | (a) 全部按设计用 AI；(b) **①②③④ 用 AI，選題 / 成员能力 / 目的阶梯重算 / 次の目標候選 用规则，⑥ 先改为用户手动勾选**；(c) 先只做 ④（初版），其余用规则 | ~~(b)~~ → **已定：(a) 该用 AI 的都用 AI**（2026-10-09 用户决定）。選題、成员能力推定、目的阶梯重算、次の目標候選、目标类型推测、⑥ 判定全部用 AI；选题仍限定在题库内，并保持「同类同背景 → 同题同序」（固定 seed，结果缓存在 `plan_intakes`）。本机验证期每项真实调用 ≤5 次。 |
| **Q5** | AI 秘書「メール要約」需要 Gmail `gmail.readonly`。这是 Google restricted scope，生产要做应用验证 + 每年一次 CASA 安全评估。 | (a) 首期做；(b) **首期不做**，秘書先上「期限」和「おすすめ」两项（规则 + 现有推荐，零新 AI），首页和受信箱的メール要約行隐藏 | **(b)**。成本和周期都高，而且两项零 AI 的秘書服务已经能把组件填满。 |
| **Q6** | 订阅（Free / Pro ¥1,480）这期做不做？它决定所有「月 3 回 / 月 10 件 / 月 50 回 / 同时 2 个目标」的限额由什么来判定。 | (a) 这期一起做（StoreKit + Stripe + 特商法 + 领收书）；(b) **这期不做付费，所有人按 Free 限额，限额 UI 照画，「ご利用プランを見る」入口先隐藏**；(c) 不做付费，限额也先放宽 | **(b)**。订阅是独立项目（外部账户、法务、税务）；先上 Free 限额可以控制付费 AI 成本。注意：iOrbit 对话现在**不计量**，(b) 意味着首次引入「月 50 回」上限，对现有用户是收紧。 |
| **Q7** | 计划初版只能引用「業界の現状」库。初始条目谁写？ | (a) 你或编辑部手写（每类目标 3–5 条，共约 20–30 条）；(b) 我用 AI 起草、你审定后发布（一次性付费调用约 30 次）；(c) 先空库上线，初版只出「一般論」、不出数字 | ~~(b)~~ → **已定：Claude 设计条目，Codex 审核**（2026-10-09 用户决定）。由实施会话的 Claude 直接撰写约 20–30 条，每条附可查证的公开出处，不用 DeepSeek，所以不产生付费调用；Codex 只读审核事实、出处和时效，意见交回修改；审核通过后才置为 published。没有可靠出处的条目不收录，不编数字。 |
| **Q8** | iOrbit「会话保存 90 日」会自动删除超期且未置顶的会话（用户数据）。 | (a) 按设计 90 日；(b) **不自动删除**，保留「删除」由用户自己操作，90 日这句文案去掉 | **(b)**。删除用户数据属于不可逆操作，现有产品也没有这条规则；成熟产品（ChatGPT / Claude）默认也是保留。 |
| **Q9** | P6 的范围：小组件、Live Activity、NFC、数据导出、退会、主办方「フォロー」、资料浏览计数——这期做到哪里？ | (a) 全做；(b) **导出 + 退会 + 小组件进本期**（导出和退会是合规刚需，小组件是新 UI 的主要卖点），Live Activity / NFC / フォロー / 浏览计数放下一期；(c) 全部下一期 | **(b)** |
| **Q10** | 生产授权（到对应期时逐项再确认，这里先告知会有哪些）：plans v2、landscape、event_assessments、invite_codes ×2、ai_usage CHECK 放宽共 6 个迁移；新的维护任务 `secretary-digest`；开关 `ORBIT_PLAN_GENERATOR` 新提示词版本上线；部署。 | — | 每期结束时出一份授权清单，与 W0055 的口径一致。 |

---

## 附录 A：新增付费 AI 调用清单（需授权）

计费现状：DeepSeek `deepseek-v4-flash` 走 `ai_usage_ledger`。用户主动池每人每天 10 次；后台池每人每天 60 次。

| # | 调用 | 触发 | 频率 / 上限 | 可复用的管线 | 推荐 |
|---|---|---|---|---|---|
| ① | 计划・背景下书（わたし / チーム / 目的 + 目的阶梯 + 初始能力勾选） | 提交目标 | 每目标 1 次 | `deepseekJsonChat` + ledger（新用途 `plan_intake`） | 做 |
| ② | 计划・生成内 AI 修正 | 生成流程中用户提交修正 | ≤3 次，不改也计 | 新用途 `plan_revise` | 做 |
| ③ | 方案を見直す（AI 预标前提变化 + 修正差分） | プラン概要按钮 | Free 月 3（Pro 月 30） | 同 ② | 做 |
| ④ | 计划・AI 初版（新提示词 v2 + 业界库引用 + 人物类型完整文本） | 确定前提后 | 不计次（改前提重做也不计） | 现有 `createAiPlanGenerator`（`purpose=plan`，max_calls 4） | 做（只换提示词） |
| ⑤ | 活动评估（URL 抓取后抽取事实 / 海报 vision 抽取事实） | イベント 评估器 | Free 月 10 件 | 海报复用名片 vision；URL 抓取新建 | 做（P4） |
| ⑥ | 面談メモ「聞けたこと」判定 | memo 保存 | 并入现有 memo 提取调用（次数不增加，提示词变化） | memo-extraction | **做**（Q4-a） |
| ⑦ | AI 秘書・メール要約 + 待办 + 回复草稿 | Gmail 新线程 | 受推送 3 件限制 | 新调用 + 新 scope | 首期不做（Q5） |
| ⑧ | 业界库条目起草（一次性） | 上线前 | — | Claude 撰写 + Codex 审核 | **不走付费 API**（Q7 已定） |
| 轻 | 选题 / 成员能力推定 / 目的阶梯重算 / 次の目標候選 / 目标类型推测 | 生成流程中 | 选题 1 次；其余每次触发 1 次（不计用户次数，计后台池） | `deepseekJsonChat`（新用途 `plan_intake`） | **做**（Q4-a） |

不新增调用（复用现有 AI 或规则）：今日の一手 / 判断待ち（现有 signals 与建议）、下書き / 書き直す（现有 email-draft）、AI 访谈报名、会後总结、开场白、语义搜索、人物类型候选推荐度与理由（现有 plan AI matcher + contact insight）、秘書期限与推荐（规则 + 现有推荐评分）、通讯录预选和 1日1問（规则）。

---

## 附录 B：GitNexus impact 结果（upstream，索引 @ 952fe38）

| 符号 | 文件 | 风险 | 影响点 / 直接 / 流程 | 涉及条目 |
|---|---|---|---|---|
| `AgentPreferences` | features/agent/preferences.ts | **CRITICAL** | 2,199 / 11 / 87 | 因此 D-01 / D-07 不往里加字段 |
| `createPostgresAiUsageLedger` | features/ai-quota/ledger.ts | **CRITICAL** | 80 / 3 / 4 | D-09 只扩枚举 |
| `AppScreen` | orbit-app/src/components/AppScreen.tsx | **CRITICAL** | 82 / 58 / 2 | 3.3，props 不变 |
| `OrbitTopNav` | orbits/app/(app)/app/orbit-public-shell.tsx | **CRITICAL** | 51 / 4 / 9 | 3.3 新建左栏、逐域切换 |
| `AccountTopNav` | orbits/app/(app)/app/orbit-account-shell.tsx | **CRITICAL** | 40 / 27 / 9 | 3.3 |
| `resolvePlanService` | features/plans/service-factory.ts | **CRITICAL** | 50 / 14 / 2 | D-02 v2 另起服务入口 |
| `createConfiguredOrbitIntegrationService` | features/integrations/service-factory.ts | **CRITICAL** | 66 / 10 / 5 | D-16（首期不做） |
| `validateIntegrationScopes` | 同上 | **CRITICAL** | 12 / 1 / 5 | D-16 |
| `createConfiguredNoteService` | features/notes/service-factory.ts | **CRITICAL** | 12 / 3 / 3 | D-14 只加可选字段 |
| `createHumanEncounterService` | features/encounters/service.ts | **CRITICAL** | 12 / 1 / 2 | D-04 不碰 |
| `getConfiguredIngestV2` | features/acquisition/business-card-ingest-v2/configured.ts | **CRITICAL** | 27 / 9 / 0 | 名片管线不改 |
| `OrbitTabBar` | orbit-app/src/components/OrbitTabBar.tsx | HIGH | 84 / 3 / 3 | 3.3 |
| `mainTabForPath` | orbit-app/src/view-models/app-navigation.ts | HIGH | 80 / 1 / 2 | 3.3 |
| `InboxNotificationDTO` | shared/contract/inbox-notifications.ts | HIGH | 87 / 20 / 0 | D-15 只扩 sourceKind |
| `HumanEncounterRecord` | features/encounters/service.ts | HIGH | 24 / 11 / 1 | D-04 不碰 |
| `createDeliveryPolicyRepository` | features/notifications/delivery-policy-repository.ts | HIGH | 11 / 3 / 0 | D-17 |
| `createStorageAgentPreferencesService` | features/agent/preferences.ts | HIGH | 7 / 1 / 1 | D-17 读静音时段 |
| `createAgentPreferencesService` | 同上 | HIGH | 6 / 4 / 1 | — |
| `deepseekJsonChat` | features/ai/deepseek-json-chat.ts | HIGH | 7 / 3 / 0 | 只新增调用点 |
| `ContactListItemContract` | shared/contract/contacts.ts | MEDIUM | 79 / 4 / 0 | D-10 |
| `TaskItemContract` | shared/contract/tasks.ts | MEDIUM | 68 / 11 / 0 | D-12b |
| `NoteContract` / `NoteMentionContract` | shared/contract/notes.ts | MEDIUM | 41 / 6、40 / 5 | D-14 |
| `AiQuotaPurpose` | features/ai-quota/constants.ts | MEDIUM | 35 / 2 / 0 | D-09 |
| `InboxDeliveryPreferencesDTO` | shared/contract/notification-delivery-policy.ts | MEDIUM | 25 / 5 / 0 | D-17 |
| `createAiPlanGenerator` | features/plans/ai-generator.ts | LOW | 7 / 2 / 0 | D-03 |
| `createPlanBootstrapService` / `createPlanFollowUpService` | features/plans/* | LOW | 4 / 2、3 / 2 | D-02 / 03b |
| `evaluateDeliveryPolicy` / `deliveryQuotaUsage` / `defaultDeliveryPreferences` | features/notifications/delivery-policy.ts | LOW | 1–4 | D-17 |
| `createEventValueRecommendationService` | features/recommendations/service-factory.ts | LOW | 3 / 3 / 2 | D-08 |
| `createConfiguredTodayService` | features/tasks/today-service-factory.ts | LOW | 2 / 1 / 0 | D-12 |
| `createAppBootstrapService` | features/bootstrap/service-factory.ts | LOW | 4 / 2 / 0 | — |
| `InboxNotificationKind` | shared/contract/inbox-notifications.ts | LOW | 2 / 1 / 0 | 不动 |
| `loadAppHomeRouteViewModel` | home-route-view-model.tsx | LOW | 4 / 2 / 1 | P1 Web 首页 |
| `OrbitGlobalAsk` | orbit-global-ask.tsx | LOW | 1 / 1 / 1 | ⌘K |
| `AiScreen` / `ContactsScreen` | orbit-app/src/screens/* | LOW | 1–2 | P1 |
| `REANALYSIS_MONTHLY_LIMIT` | features/plans/reanalysis.ts | UNKNOWN → 文本确认 | 只在 `service.ts:56,1441` 引用 | D-03b |
| `AI_QUOTA_PURPOSES` | features/ai-quota/constants.ts | UNKNOWN → 文本确认 | 只在定义文件引用 | D-09 |
| `HomeDashboardScreen` | orbit-app/src/screens/home/HomeDashboardScreen.tsx | UNKNOWN → 文本确认 | `app/home.tsx` 路由、`route-domain-inventory.ts` | P1 |
| `createConfiguredRelationshipCommunicationService` | features/relationship-communication/service-factory.ts | UNKNOWN → 文本确认 | 1 个路由文件 | D-13 不碰 |

说明：

- 有 4 个符号结果为 UNKNOWN，原因是 GitNexus 追不到对象属性访问和 expo-router 默认导出，已按规定用文本搜索确认，不当作「安全」。
- App 端点的调用方无法用图谱解析（`client.get(ORBIT_API_ENDPOINTS.x)`），App 扫描对这部分做了字面量检索。
- 实施时每个条目动手前要重跑 impact，并在提交前跑 `detect_changes`。

---

## 附录 C：要改写或新建的测试与门禁

- **App**：
  - `tests/ink-signal-shell.test.ts:116-219`：底栏文字写死为中文五项，IORBIT 用 push 打开。
  - `tests/app-navigation-source.test.ts`。
  - 三张路由登记表：`app-wide-route-coverage`、`route-parity`（+ exceptions）、`page-offline-inventory`；以及 `offline-read-inventory`。
  - `tests/design-tokens.test.ts`（对比度 ≥4.5、radius 关系）、`theme-wiring` / `theme-render`、`app-locale-*`（三语）。
  - 依赖现有 UI 的：`ink-signal-{contacts,events,...}`、`home-dashboard-interactions`、`today-tasks-screen-source`、`ai-home-screen-copy`。
  - 契约同步测试：`contract-sync` / `api-schema-sync` / `domain-sync`。
  - 基线：0140 报告为全量 4062/4062 通过；以零新增失败为准。
  - `design-qa.md` 顶部仍是 blocked（大字号裁切），新 UI 开新批次验收。
- **Web**：
  - `orbit-top-nav-links` / `orbit-top-nav-structure` / `orbit-mobile-nav-overlay`。
  - `orbit-sidebar-width-constant`、`orbit-z-scale`（`--r-lg` 18→20）、`orbit-scale-ratchet`（字号和字重刻度）、`orbit-button-ratchet`、`orbit-contrast-tokens`、`orbit-0918-anchor-colour`（新作用域要有同等门禁）、`orbit-modal-standard`、`orbit-settings-theme`（加「自動」）、`orbit-html-lang`。
  - 像素门禁新建 2026 版。
  - 基线：ratchet 79/35/16/167、`tests/ui` 146/146、`tests/audits` 158/148/10（逐条同名对照）。
- **新增**：
  - `plan-score` 计分规则表驱动测试：同人同类型一次、超额半分向下取整、匿名自报上限、跳过与撤回、余数补给最后 1 人。
  - `event-score` rubric 测试。
  - invite code 测试：并发 redeem 不超过 10、过期、作废、已连接。
  - URL 抓取 SSRF 测试：私网、环回、元数据地址、重定向逐跳。
  - notes 旧 payload 往返不变。
  - 推送：3 件上限、22:00–7:30、7:50 合并。

---

## 附录 D：我按成熟产品惯例自定的口径（可推翻）

| # | 事项 | 决定 | 依据 |
|---|---|---|---|
| a | 新 token 对比度不足 | 文字用的 `ink-3`、马卡龙 ink、coral 调深到 ≥4.5:1；原值只用于图形、装饰和 ≥18px 粗体 | WCAG AA；两端现有门禁 |
| b | 原型冲突 1：每月 1 日自动見直し 还是按需 | **按需，不自动生成**（不产生没人看的付费调用）；决定表中「自动見直し不计次」的说法作废 | 成本控制；与 b4 A3 一致 |
| c | 冲突 3：活动评估 3 维还是 5 项 | **按 5 项固定标准计分**，结果页把它们合成 3 个展示维度：目標との一致 = 適合 + 確度；会える人 = 既存のつながり + 交流の形式；時間対効果 = 時間とコスト | 一个分数一种口径 |
| d | 冲突 2：每天 3 件推送上限可调还是固定 | 用户可调低（1–3），不能调高；默认 3 | iOS 通知摘要惯例 |
| e | 冲突 4：面談候选时段数 | 3–5 个，默认预选 3 个（与现有 appointments 接口「需 3–5 个候选」一致） | 现有接口约束 |
| f | 冲突 5：长按时长 | 0.4 秒（以决定表为准） | iOS 主屏编辑 |
| g | 冲突 6：招待码格式 | 8 位随机码 `XXXX-XXXX`（去掉易混字符），**不含姓名**（避免通过码泄露身份） | 隐私 |
| h | v1 旧计划 | 保留只读，并提示「新しいプランを作る」（首次生成不计次）；不自动改写 | D44「老模板计划不自动重写」 |
| i | 匿名线下自报 | 记在 plan_log，不写 human_encounters | 不放宽 HIGH 影响面的必填字段 |
| j | 首页布局冲突 | 以服务端 revision 为准，并提示「別の端末で変更されました」 | 多端设置同步惯例 |
| k | 旧路由 | App `/today`、`/followups`、`/notes`、`/schedule` 重定向到 Task 对应段；Web `/app/agent/plan` 重定向到 `/app/tasks?tab=plan`；旧链接生成器先改，再删路由 | 0918 路由收敛做法 |
| l | 会話リスト置顶上限 | 5 个（前端 + 服务端校验） | 设计定稿 |
| m | 「名刺余量」「首次指导前 3 次」「提示条已关闭」 | 存本机，不入库 | 纯本机偏好 |

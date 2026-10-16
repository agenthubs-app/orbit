# 主催整体设计（R17）

**版本 2（2026-10-16，执行人：小雨（甲）的文档会话；文档阶段，未改代码）。** 版本 2 按独立复核（[REVIEW.md](REVIEW.md)）S1–S3、M1–M10、m1–m10 修订，处理记录见 REVIEW 末尾。

本文是 R17「主催」功能 Sprint 的依据，覆盖主办方从建活动到会后的全程，两端都做：
- 运营中心与建活动（创建、编辑、发布、中止）；
- 申込設定、报名审核；
- 编组（マッチング）；
- 受付 kiosk；
- 会后报告、共同运营者；
- 公开主办方页，以及主办入口。

**依据**（越往后越权威）：
- **设计稿**：
  - `b6-host-polish.html` #0–24、#44 / #45（Web 运营台、kiosk、App 运营）；
  - `web.html` #20「主催 · 運営」；
  - `b7-account-misc.html` #33–39（主办方公开页、未登录关注）；
  - `b5-me-inbox.html` #14–16 / #18–20 マイページ「主催したイベント」行（App 入口，R18 画）；
  - `b12-missing-states.html` 末尾补画（§10 B 组，补画后追加）。
  - 各设计稿里**都没有建活动的画板**（复核核实：b12、b11、b8、b2、app、01-system、02-gaps）。
- **旧方案**：`IMPLEMENTATION-PLAN.md` 判主办侧为「复用（视觉换新）」。实际缺口很大（§1.1），**以本文为准**。
- **高于本文的**：
  - README「用户决定」与通用规则 11 / 12；
  - 决定表 `maintenance/2026-10-12-decisions.md` 到 §37（D02 / D08 / D18 / D50；§34–§37 名单规则 A）；
  - 交接表「R17 主催」「R18-01」「通用口径」；
  - R26 / R27 已交付的接口（[events/DESIGN.md](../events/DESIGN.md)、`R27-events-journey/REPORT.md`）。
- **已定的产品口径（不再讨论）**：
  - 「邮件 / 消息止于草稿」只约束用户以个人名义对外发出的消息。主办方以 Orbit 名义发的**定型**系统通知允许发，条件是非 AI 撰写、**发前有确认**（AI 定位 2026-10-07 补充）。
  - 参加者名单按规则 A（`features/events/journey/roster-policy.ts`）只对已报名者可见。主办方与有权限的共同运营者不受此限，靠 `requireEventCapability` 授权。
  - 全场录音永久出局。

## 1. 为什么要重做，重做成什么样

### 1.1 现状（代码 @ `d429939c5`，路径相对 `repos/orbits` / `repos/orbit-app`）

1. **旧界面能用，但都是 0918 旧样式。**
   - Web 是薄服务端页 + `app/(app)/app/events/ops-0918/`（20 个文件 5,596 行；`ops-model.ts` 915、`ops-shell.tsx` 774）：
     - `center` → `OpsHub`；
     - `[id]/operations` → `OpsConsole`（`?tab=`，`?drawer=roles`）；
     - `operations/admission` → `OpsPeople`；`check-in` → `OpsCheckin`；`experience` → `OpsForm`；
     - `[id]/analytics` → `OpsReport`。
   - App 是 `src/screens/events/*` 的 Screen + Content 对（约 2.8k 行），公开页 `src/screens/organizer/OrganizerPublicScreen.tsx`（464 行）。
   - 壳规则：`/app/o`、`operations/check-in`、`operations/admission` 不挂壳、不注册 ⌘K（`orbit-2026/shell/shell-routes.ts:10,21`，`orbit-ask-routes.ts:38` `EXCLUDED_SEGMENTS`）；左栏「主催」高亮在 :35。
2. **没有主办方的活动写入。**
   - `POST /api/events`（`api/events/handler.ts:184`）是旧手动记录模型（`event-crud-and-import` `createEvent`，`live-service.ts:510`）。
   - 正式生命周期 `draft|published|cancelled|archived`（`core/contract.ts:1`）只有回填与种子会写（`core/backfill.ts:418-435`）。回填同时写 `event_ops_events`、`event_event_versions`（`content_hash` / `event_version`）、`event_aliases` 三处。
   - 16 项权限里没有「编辑 / 中止活动」。
3. **参加コード**：
   - `event_ops_events` 已有 `public_code`（工作区内唯一索引，`migrations.ts:925 / :954`），也已有 `ends_at`、`title`、`venue`、`timezone`、`source_payload`。
   - by-code 先走 `resolveCanonicalEventAlias` 查 `event_aliases`（`alias_type` 含 `public_code`，`core/service.ts:125-131`）。所以只要发布时写好 alias，by-code 不改就能用。
   - 问题有两个：码现在只能由回填写入（`backfill.ts:226`）；回填的 upsert 会覆盖 `public_code` / `lifecycle_state_v2`（:427-435）。
4. **审核状态机比画板窄。**
   - 决定只有 `approve | reject`（`admission/contract.ts:91`），只接受 `pending_review`（`postgres-repository.ts:917`）。没有「待ち（候补）」，也不能对キャンセル待ち里的人再做决定。
   - 批准后：有名额 `admitted` → canonical membership `rsvped`（:953，`projectCanonicalMembership` :673）；满员时开了候补转 `waitlisted`，否则报 `CAPACITY_FULL`（:939-941）；有人退出时，在 withdraw 事务里递补最早的候补（:1203-1219）；定员不能低于已批准人数（:833）。
   - **副作用全 false**（:662：`emailSent`、`notificationDelivered`）。
5. **受付的前提比画板窄。**
   - 签到要求报名状态 `rsvped`（`memory-repository.ts:489`），所以候补者不能签。
   - 签到要求 event-ops 配置存在且 migration 状态为 `canonical`（`event-operations/service.ts:182`、`memory-repository.ts:472`）：新建活动在配好编组之前签不了到。
   - 没有撤销签到的方法。`check_in` 角色没有任何 `admission.*` 权限。
   - 代签已接计分（R26-04，`checkInParticipant` :521 → :537-549）。
   - kiosk 的 409 处理在 `use-check-in-roster.ts:112`。
6. **受付番号与 QR**：
   - live 下 `checkIn.receptionNumber` 恒为 `null`（`journey/venue-core.ts:81,151`；契约 `event-venue.ts:52`），只有 mock 给「A-042」（`demo-world/events-journey.ts:282`）。
   - QR 是明文 `orbit-checkin:<eventId>:<participantId>`，没人读，可猜。
7. **编组只有生成，不能调整。**
   - 配置只有 `tableSize`、两个固定轮次时间、`recommendationCount`（`event-operations/contract.ts:53-69`）。画板上的「ラウンド数 / 同じ会社は別テーブル / 前回同席回避 / 各テーブルに投資家」都没有字段。
   - 拖动调整**完全不存在**（`ops-model.ts` 里的 `op-fq-drag` 是申込問題的拖动）。`generations/[gid]` 只有 `run` / `retry` / `publish`（`engine.ts:1449` 发布要冻结配置的 owner 一致；指纹 :845）。
   - 编组的付费 AI 走 `orbit-ai/gemini-provider`，不记账。
8. **共同运营**：
   - 角色有 `operations` / `check_in` / `reviewer` / `read_only_analyst`，owner 取自 Event Core（16 项权限）。
   - **一个人只能有一个角色**（`event_ops_event_role_assignment_heads` 按 `(workspace, event, subject)` 唯一，`event-access/storage/postgres-repository.ts:332`）。
   - 授予要 `roles.manage` 和对方的 actor id，带 `reason`（1–1000 字）和版本历史。**没有邀请流程。**
   - `check_in` 没有 `analytics.read_aggregate`，`read_only_analyst` 进不了概要。b6 #20 的「役割でできること」表和这些不一致（§10 A9）。
9. **报告**：
   - 已有报名 / 签到 / 交换申请 / 编组公开 / 相遇面谈 / ROI。
   - **没有**：参加者の立場分布、会後フォロー聚合、テーブル別交換。
   - R27 主催卡的「平均参加」是**报名数**均值（`journey/live-mapping.ts:166`），没有「CFO 比率」。
10. **公开主办方页**：`o/[slug]` 拿 slug 匹配活动的 id 或 publicCode，再从那场活动推出主办方（`organizer-public-route-view-model.ts:285`；:380 是 loader），**没有主办方资料**。关注接口 R27 已有（`organizerKeyFor(organizerActorId)`）。
11. **生产上新建的活动发布不了申込**：`experience/publish` 走 `requirePilot` → `eventPilotDecision`（`shared/config/event-pilot-gate.ts:45-66`）。生产缺省关闭；打开后也只放行 `ORBIT_EVENT_PILOT_EVENT_IDS` 白名单（ROI 同受此开关）。
12. **没有通用事务邮件模块**：只有 `features/auth/password-reset-smtp.ts`，没有退订 / 偏好，也没有非生产的收件人重定向。收件箱来源枚举里也没有 `system`（`inbox-notifications.ts:5-7`）。
13. **App 没有任何进运营中心的入口**。Web 只有左栏「主催」与旧マイページ临时链接（R18-01）。
14. **NFC 一行代码都没有**（b6 #28–33 / #46 / #47，b7 #68–71 / #78 画了）。

### 1.2 新的形状

```
運営センター（Web 左栏「主催」/ App マイページ「主催したイベント」）
 ├─ 空态：3 步说明 · イベントを作成 · テンプレートから · 過去の参加者を取り込む · 共同運営に参加（招待コード）
 ├─ 有数据：KPI（開催予定 · 今月の申込 · 平均受付率 · 会後フォロー率）· 対応が必要なこと · 活动列表
 └─ イベントを作成 → 基本情報 → 下書き → 申込設定 → 公開する（申込页短链 + 参加コード；自动建编组缺省配置）
イベント運営（页签 概要 / マッチング / 参加者 / 受付 / 申込設定 / レポート；右上 共同運営者）
 ├─ 概要 · 進捗 · 要対応（定型お知らせは確認画面のあと）
 ├─ マッチング：条件 → 生成（≤3）→ 下書き（人工调整层）→ 公開（确认）
 ├─ 参加者：審査待ち / 承認済み / キャンセル待ち / 見送り · 承認 / 待ち / 見送り（单条、批量）
 ├─ 受付 kiosk：QR v2 / 名前検索 → 到着 · 取り消す · 当日枠 · 番号 · 多台 · 离线
 ├─ 申込設定：説明文 · 模板 · 質問 2–5 · 定員 / 締切 / 方式 · 预览 · 下書き / 公開
 └─ レポート：全体（聚合、<5 抑制）/ 自分の視点
公開ページ /o/<slug>（一个 actor 可以有多个主办方资料，活动挂到资料上）
```

设计原则：

- **后端只「部分齐全」，缺口一条条补。** 服务端已有的部分沿用：审核规则、代签计分、编组生成 / 发布、权限、分析。§1.1 第 2–12 条的缺口逐条补；补法全部只加不改：枚举加值、新表、新角色、新接口。
- **主办方看得到、参加者看不到的，由权限决定。** 主办侧接口一律走 `requireEventCapability`，规则 A 只约束参加者侧接口。
- **通知都是定型、发前确认、可靠投递。** 在状态变化的同一事务里写 outbox，由 worker 写收件箱、发邮件。主办方不能写自由文本群发（§10 A10）。
- **AI 只在编组，且不改提示词。** 编组条件里能用规则后处理的，就用规则做；做不到的列进 A 组。其余部分全是规则。
- **聚合不露个人。** 报告和运营中心里来自参加者私人记录的数字只给聚合，少于 5 人的格子显示「—」，并做差分保护（§2.9）。

## 2. 用户流程（逐屏）

画板写「文件 #序号」。

### 2.1 運営センター

- **Web**：
  - 用 ShellPage，左栏「主催」高亮。标题「運営センター」，副标题「主催イベント 6件 · 今月の申込 188名」，右侧放「共同運営に参加」+「イベントを作成」。
  - 画板：空 `b6` #0、少 #1、大 #2（深 #44）。
  - 大量：KPI 四格 +「対応が必要なこと」+ 列表（すべて / 開催前 / 開催中 / 終了 · 搜索 · 開催日順）。行的主按钮按状态：開催中「受付を開く」、開催前「運営画面へ」、終了「会後フォロー N%」。
  - 少量：右侧多「次にやること」。
  - 下書き / 中止 / アーカイブ 的行样式画板没有，见 §10 B11。
- **App**：
  - 空 `b6` #21：「作成と申込フォームの編集は PC が便利です」+「PC で開くリンクを自分に送る」+ 三格：
    - テンプレート：打开模板说明的只读 sheet，末尾「PC で作成する」= 同一个发链接动作；
    - 共同運営に参加：输码；
    - 受付だけ担当：进「受付を担当しているイベント」列表，只列我有 `check_in` 的活动。

    这三格的去向画板没画，见 §10 B4。
  - 大 `b6` #22。
  - 「PC で開くリンクを自分に送る」= 给自己的收件箱写一条（来源 `event_host_notice`，kind `desktop_link`）。不发邮件。对标 Slack「デスクトップで開く」。
- **数据**：`GET /api/events/center`（`listAccessibleEvents`）只加 `summary / kpi / todo`（`host-todo.ts`）。KPI 里来自参加者私人记录的「会後フォロー率」照 §2.9 做 <5 抑制。

### 2.2 建活动、编辑、发布、中止

- **画板**：没有表单画板（§10 B1 / B2）。
- **流程**（对标 Luma / connpass）：
  1. 「イベントを作成」→ 基本情報：名称、emoji、日時、会場（名称 + エリア，或オンライン）、参加費表示（無料 / 金額 / 当日払い / 外部決済リンク，§10 A1）、定員。
  2. 存下書き（`draft`）→ 申込設定。
  3. 「公開する」，在同一事务里写下面几处（与回填脚本同一写法，§3.3）：
     - `event_ops_events`：生命周期 `published`、`public_code`、来源标记 `created_by = 'host'`；
     - `event_event_versions`：新版本；
     - `event_aliases`：`public_code`，并新增 `public_slug` 类型（只加），由名称转写，冲突加序号；
     - **event-ops 缺省配置**：时间取活动时间、`tableSize` 5、migration 状态 `canonical`，这样不配编组也能受付（§1.1 第 5 条）；
     - 参加コード：8 位，用 R15 同一字母表 `23456789ABCDEFGHJKMNPQRSTVWXYZ`，`XXXX-XXXX`。只对新码规范化，旧码与 R27 mock 码（`CFO18NGT` 等）原样可用。
  4. 公开后编辑：改日時或会場时，确认画面写明「申込者 N名にお知らせします」→ 定型通知。
  5. 「中止する」：**只有 owner 能做**（新增能力 `event.cancel`；`event.edit` 给 owner 和 `manager`）。确认画面列出后果（中止のお知らせ · 参加コード無効 · 参加予定から外れる）→ `cancelled`，删除 alias。
  6. 会后 30 天自动 `archived`（只读，报告保留）。
- **申込页地址**：短链 `/e/<slug>` 302 到 R27 详情 `/app/events/<eventId>`（未登录时由 R27 的公开详情接住）。画板上的 `orbit.app/e/…` 文字属 `[data]`。
- **回填保护**：回填脚本跳过 `created_by = 'host'` 的活动，不覆盖码和生命周期（测试守住）。
- **テンプレートから**：交流会 / 勉強会 / ラウンドテーブル三种，预填说明文骨架、问题集、编组条件。
- **過去の参加者を取り込む / 招待者リストを取り込む**（§10 A2 推荐）：CSV **只生成「招待リンク」与名单核对表**，由主办方自己发；Orbit 不给 CSV 里的地址发任何邮件。对标 connpass 只能给已登记的人发消息。
- **App 不做建活动表单**：照画板「作成と申込フォームの編集は PC が便利です」。

### 2.3 イベント運営 · 概要

- **画板**：`web.html` #20；App `b6` #23。
- **Web**：
  - 页头：活动名 +「主催 · 本日 19:00 · 渋谷ストリーム」+ 共同运营者头像 +「共同運営者」；
  - 页签：概要 / マッチング / 参加者 N / 受付 / 申込設定 / レポート。
- **概要**：
  - 申込 N / 定員；マッチ可能 N；受付済み N · 到着率；
  - 推薦の生成 %；申込の推移（直近 14 日）；
  - 運営の進捗（当前步骤带主按钮）；
  - 要対応「プロフィール未完了 16名 · 定型のお知らせを通知（通知前に確認画面）」。
- **App**：
  - 段：概要 / マッチング / 参加者 12 / 受付 / **レポート**（画板 #23 有レポート段）；
  - 三格 +「受付を開く」+ マッチング卡 + 要対応 +「申込設定とレポートの詳細は PC で編集できます」。
  - App 的レポート段只给摘要（受付率 / 名刺交換 / 会後フォロー三格 + 「PC で詳細」）。画板缺，见 §10 B10。
- **数据**：`GET operations/admin` + 只加 `summary`。

### 2.4 マッチング（编组）

- **画板**：Web 空 `b6` #3、少 #4、大 #5、公開確認 #6；App 只有概要卡片（「結果を見る」设计稿无，B4）。
- **条件**，按能不能用规则做分两类：

  | 条件 | 做法 | 数据 |
  | --- | --- | --- |
  | 1テーブルの人数 | 现有 `tableSize` | 现有 |
  | ラウンド数 | 配置加 `roundCount`（1–3，只加）；每一轮各调一次现有生成，结果合成一份 | 新字段 |
  | 同じ会社は別テーブル | **规则后处理**：生成后在桌间交换（贪心，最多 N 次） | 公司来自报名资料 |
  | 前回同席した人は避ける | **规则后处理**：读本主办方上一场已发布的席位 | 已发布产物 |
  | 各テーブルに投資家 1名以上 | **规则后处理**：按申込 Q1「投資家」选项分布；人数不够时标「満たせない卓 N」 | 申込回答 |

  规则后处理放在新函数 `shared/compute/table-constraints.ts`，**不改提示词**。
- **人工调整层**：
  - 新表 `event_ops_generation_overrides`（每个 generation 一份 `moves[]`）。下書き画面 = 产物 + overrides。
  - 拖动只写 overrides；发布时把「产物 + 后处理 + overrides」合成一份，再走现有 `publish` 冻结。管线的指纹、冻结与不可变约束不变。
  - 「なぜ同じテーブル？」：保留产物里的理由；人工移动过的人，理由改为「主催者が配置」。
- **次数**：每场活动「新生成」≤3 次（服务端计数，在 `POST generations` 处检查）；对失败那次的 `retry` 不计次。
- **公開**：确认弹窗（`b6` #6）→ 合成 → 现有 `publish` → 参加者的会場页出席位（R27 已读）。

### 2.5 参加者（审核）

- **画板**：空 `b6` #7、少 #8、大 #9（前两行已勾，批量条「2名を選択中」；画板不改，预检误报已由 d429939c5 修掉）。
- **内容**：
  - 分段：審査待ち / 承認済み / キャンセル待ち / 見送り；搜索；「プロフィール未完了」筛选；
  - 表格：申込者 / 申込回答 / プロフィール（完成度）/ 参加歴（本主办方的活动次数）；每行「見送り / 待ち / 承認」；批量「まとめて承認 / キャンセル待ちへ / 見送り」；
  - 右栏：残り枠 +「審査について」。
- **状态机只加**：
  - 决定枚举加 `waitlist`；
  - 允许对 `waitlisted` 的人再做决定：`approve` → 有名额才 `admitted`，`reject` → `rejected`；
  - `admission/contract.ts` 的枚举与仓储校验只加分支，不改现有 `approve / reject` 行为。
- **批量**：逐条调用，各带自己的版本号；部分失败的行就地标出（409 显示「他の運営者が先に更新しました」并刷新这一行）。
- **通知时机**（§10 A10）：画板写「自動でお知らせします」。推荐「点决定按钮就算确认」；批量时在批量条上写明「N名にお知らせが送られます」。
- **参加者抽屉**：用现有 `operations/participants/[participantId]`。

### 2.6 受付（kiosk）

- **画板**：Web kiosk 1180×820：空 `b6` #10、大 #11（深 #45）、离线 #12；App `b6` #24。
- **前提补齐**（§1.1 第 5 条）：
  - 发布时自动建 event-ops 缺省配置，没配编组也能签到；
  - 新增 `undoCheckIn`（「取り消す」）：只能撤销 30 分钟内的签到，计分照 R24 撤销规则回退；
  - 新增 `admitOnSite`（「当日枠で受付」）：把候补转成 `admitted` 后签到；满员时，确认后超定员受付并记 `over_capacity`。权限是新增的 `check_in.walk_in`，受付角色要不要有它，属 §10 A9。
- **QR v2**：`orbit-checkin:v2:<eventId>:<participantId>:<exp>:<hmac>`，活动结束后 24 小时过期；旧明文不再接受。只改 `venue-core.ts` 的生成处，R27 只负责显示。
  - Web 相机用 `BarcodeDetector`，不支持时回退到新依赖 `@zxing/browser`；App 用已有的 `expo-camera`。
- **受付番号**：
  - 在**变成 `admitted` 的同一事务**里分配，这样三条路都覆盖：先着順直接 admitted、审核批准、候补递补（`projectCanonicalMembership` :673）。
  - 编号 `A-001`… 按活动计数，取消不回收。写进 canonical membership 记录的新列 `reception_no`。
- **离线**（§10 A4）：
  - 本机缓存当天名单，字段对齐画板：姓名 / かな / 公司 / 役職 / 状态 / テーブル / 番号；
  - TTL = 活动结束 +12 小时，启动时检查过期即清，注销也清；只有带受付权限的设备会缓存；
  - 操作进 IndexedDB / App SQLite（已有 `expo-sqlite`）队列，按幂等键补发。
- **多台**：每 5 秒轮询现有 `operations/admin/check-ins`；「N台で受付中」= 最近 60 秒有心跳的设备数。

### 2.7 申込設定

- **画板**：空 `b6` #13、少 #14、大 #15。
- **内容**：
  - 説明文（200 字）；テンプレートから始める；「質問案を 3つ追加しますか？」（规则，§3.4）；
  - 質問 2–5（拖动、单选 / 多选 / 自由、必須 / 任意）；定員 / 締切 / 承認方式 / 申込ページ；
  - 预览 スマホ / PC；下書き自动保存 / 公開 / 未公開の変更。
- **数据**：
  - 现有 `experience`、`/draft`、`/preview`、`/publish`（`app/api/events/[id]/experience/handlers.ts:210`）与 `admission/policy`。
  - **试点开关**（§1.1 第 11 条，§10 A12）：`created_by = 'host'` 的活动不受白名单限制；总开关 `ORBIT_EVENT_PILOT_KILL_SWITCH` 仍可一键停用。
- **お知らせの文面**（申込設定下方折叠区）：6 种定型模板只显示、不可改；主办方只能填一段「主催者からのひとこと」（≤140 字、不能放链接、标明是主办方的话），是否开放见 §10 A10。画板缺，见 §10 B5。

### 2.8 共同運営者

- **画板**：`b6` #20（抽屉）。
- **内容**：
  - 招待する（メールアドレス または Orbit ID）、选角色；
  - 「招待リンクは 7日間有効です」；
  - 成员列表：角色可改、可移除，owner 不可移除；**変更理由（必須）· 0 / 100** 与**変更履歴**：用现有的 `reason` 字段与版本表。
- **角色**：
  - 新增角色 `manager` = `operations` ∪ `reviewer`（枚举只加，CHECK 迁移追加），因为一人一角色；
  - 画板「管理者 / 受付 / 閲覧」对应 `manager` / `check_in` / `read_only_analyst`；
  - b6 #20 权限表与现有能力的差异（受付能看报告、閲覧能看概要）属偏离，见 §10 A9。
- **邀请安全**：
  - 链接：≥128 bit 随机令牌，单次使用，7 天过期；
  - 指定了邮箱或 Orbit ID 时，接受者必须是同一账号；
  - 短码「招待コード」：8 位（同字母表，前缀 `H-` 与参加コード区分），按人 / IP 限流，失败 10 次锁 15 分钟（对标 R15 防枚举）；
  - 无论邮箱是否对应账号，界面反馈一致（不暴露是否注册）；
  - 只给已有账号者写站内通知，不发邮件给陌生地址；
  - 接受统一用 `POST /api/host/cohost-invites/[code]/accept`，服务端以邀请为凭证授予（不要求接受者有 `roles.manage`）。

### 2.9 レポート

- **画板**：开催前 `b6` #16、少 #17、全体大 #18、自分の視点 #19。
- **全体**：受付率、名刺交換 N組、交換率、会後フォロー、申込推移、会後のフォロー漏斗、テーブル別の名刺交換、参加者の立場（Q1 分布）。
- **数据来源**（§10 A3）：
  - **名刺交換 / 交換率** = 双方都确认的交换。画板定义是「NFC・QR・名刺スキャン の記録」；本期没有 NFC，只计 QR 交换申请承认 + 双方都把对方记为「この活动で出会った」的名片扫描。
  - **会後フォロー** = 参加者在 R27 会後确定的「フォロー日」条数（只计数）。
  - 立場 = 申込回答 Q1。
- **抑制**：
  - 任何格子 <5 人显示「—」；
  - **差分保护**：同一维度只剩一个被抑制的格子时，再抑制一个最小格子；
  - 运营中心 KPI「会後フォロー率」与每行「会後フォロー N%」同样适用（活动受付人数 <5 时不显示）。
- **自分の視点**：读 R24 / R27 的本人数据，不经主办权限。

### 2.10 定型通知

- **可靠投递**：
  - 在状态变化的同一事务里写 `event_host_notice_outbox`：admitted / waitlisted / rejected（含递补）、中止、日时变更、共同运营邀请；
  - worker 写收件箱（来源 `event_host_notice`）+ 发邮件（只发给有账号者，尊重 R13 的通知设置）；
  - 幂等键 `notice:<eventId>:<kind>:<actorId>`。
- **邮件模块**：新建 `features/mail/transactional`（复用 SMTP 配置），带 `ORBIT_MAIL_REDIRECT_TO`。**非生产强制重定向**到 QA 邮箱，代码保证、有测试，不靠约定。
- **发前确认**：
  - 中止、日时变更、资料未完成提醒：确认画面写人数与预览；
  - 审核决定：见 §10 A10。
- **不发什么**：自由文本群发；发给非用户地址；CSV 名单。
- **频控**：同人同活动同类只发一次；资料未完成提醒每场 ≤2 次。

### 2.11 公开主办方页 `/o/[slug]`（R17-02）

- **画板**：Web 1440 空 `b7` #33、少 #34、大 #35；手机 #36 / #37 / #38（phone 框，按 Web 390 比）；#39 未登录关注。
- **内容**：b1 公开顶栏、主办方卡、これからのイベント、過去のイベント、页脚「通報する」。
- **主办方资料**：
  - **一个 actor 可以有多份资料**（如「CFO Night 実行委員会」「製造業DX 朝会」各一页），活动在建活动时选所属资料（`event_ops_events` 加 `organizer_profile_id`）。
  - 对标 Peatix「グループ」/ connpass「グループ」：一人可以管理多个团体。
- **数字口径**（§10 B9 请设计稿会话核对 b7 #34 / #35）：
  - 開催回数 = 资料下已发布且已结束的场次；
  - 累計参加者 = 这些场次的**受付人数**合计；
  - 过去活动行「参加 N名」= 受付人数；
  - フォロワー = 关注数。
  - b7 #34 现在写的是「開催回数 2」但「過去 1件」、「累計 86」但「参加 128名」，互相对不上，需要改画板。
- **旧链接**：`/app/o/<eventId|publicCode>` 302 到所属资料的 `/o/<slug>`。
- **通報**：打开现有反馈表单（带 URL）；下架由运营处理（R29）。

### 2.12 主办入口（R17-03 / R18-01）

- **Web**：左栏「主催」不变；1024 / 390 走 マイページ（R18）。
- **App**：b5 マイページ「主催したイベント」行由 R18 放置。R17 交付组件 `HostEventsRow` 与 `GET /api/events/center?summary=1`。R18 之前 App 没有入口，R17 的 App 画面用深链验收（交接表 R17-04、DEFERRED-A）。
- 旧マイページ临时链接由 R18 删除。

### 2.13 不在本组

- **NFC 交换**：`b6` #28–33 / #46 / #47、`b7` #68–71（名刺を渡す · 登録不要）/ #78（§10 A5，推荐下一期）。
- **iOS 小组件**：`b6` #25–27，归 R19。
- **收款**：§10 A1。

## 3. 数据与迁移

### 3.1 迁移「host-core」（本机验证；生产等合回授权）

全部 `if not exists`，只加不改。执行前对生产做只读预检：slug 是否冲突、已有 `public_code` 是否合规。

| 表 / 列 | 用途 |
| --- | --- |
| `organizer_profiles(workspace_id, id, owner_actor_id, slug unique, display_name, emoji, bio ≤400, created_at, updated_at)` | 主办方资料（一人多份） |
| `event_ops_events` 加 `organizer_profile_id null`、`created_by text null`（`'host'`） | 资料归属、回填保护 |
| `event_aliases.alias_type` 加 `public_slug` | 申込页短链 |
| canonical membership 表加 `reception_no text null`；新表 `event_reception_counters(workspace_id, event_id, next_no)` | 受付番号 |
| 角色 CHECK 加 `manager`；能力加 `event.edit`、`event.cancel`、`check_in.walk_in` | 一人一角色、活动写入权限 |
| admission 决定加 `waitlist`；允许对 waitlisted 的人做决定 | 审核状态机 |
| 签到加撤销记录：`undone_at`、`undone_by`；加 `over_capacity boolean` | 取り消す、当日枠 |
| `event_ops_generation_overrides(workspace_id, generation_id, moves jsonb, updated_by, version)`；配置加 `round_count`、`constraints jsonb` | 编组调整与条件 |
| `event_cohost_invites(workspace_id, id, event_id, token_hash, short_code, role, invited_email_hash null, invited_actor_id null, expires_at, used_by, used_at, revoked_at)` | 共同运营邀请 |
| `event_host_notice_outbox(workspace_id, id, event_id, kind, actor_id, idempotency_key unique, payload, status, attempts, sent_at)` | 定型通知 outbox |
| `event_host_notice_extras(workspace_id, event_id, host_note ≤140)` | 主催者からのひとこと（A10 同意才用） |
| `event_kiosk_heartbeats(workspace_id, event_id, device_id, seen_at)` | 多台 |

- `fee_display`、`emoji` 放 `source_payload`，不加列。
- （A6 同意时）账本 CHECK 加 `event_matching`，新版本追加。

### 3.2 生命周期写入（`features/events/host/`）

- `createEvent`、`updateEvent`、`publishEvent`、`cancelEvent`、自动归档：三表（`event_ops_events`、`event_event_versions`、`event_aliases`）同事务写入，写法照 `core/backfill.ts`。
- 重发参加コード = 删旧 alias、加新 alias（旧码立即失效）。
- 回填脚本跳过 `created_by = 'host'` 的活动。

### 3.3 共享纯函数（`shared/compute`，两端同步）

| 文件 | 用途 |
| --- | --- |
| `host-todo.ts` | 対応が必要なこと / 次にやること |
| `reception-number.ts` | `A-001`…（超过 999 换下一个字母） |
| `checkin-token.ts` | QR v2 编码 / 解析（签名在服务端） |
| `participation-code.ts` | 新码生成：R15 字母表、`XXXX-XXXX`；规范化只用在新码上 |
| `table-constraints.ts` | 编组规则后处理（同社 / 前回同席 / 投資家） |
| `question-suggest.ts` | 質問案 3 つ（模板库 × 过去回答分布） |
| `small-cell.ts` | <5 抑制 + 差分保护 |

## 4. 契约（只加不改；第一天先提交）

- **新 `host-events.ts`**：
  - `HostEventInput`、`HostEventView`（含 lifecycle、publicSlug、participationCode、organizerProfileId、counts、todo）；
  - `POST /api/host/events`、`PATCH …/[id]`、`POST …/[id]/publish`、`…/cancel`、`…/code/reissue`。
- **admission 只加**：决定枚举 `waitlist`；对 waitlisted 的决定。
- **operations 只加**：
  - `POST …/admin/check-ins/scan`（QR v2 → staff check-in → 返回番号）；
  - `POST …/admin/check-ins/[participantId]/undo`、`…/admit-on-site`；
  - `…/kiosk-heartbeat`；
  - 配置加 `roundCount`、`constraints`；`generations/[gid]/overrides`（GET / PUT，带版本）。
- **新 `host-notices.ts`**：kind `admission_approved / admission_waitlisted / admission_rejected / event_cancelled / event_changed / profile_incomplete / cohost_invite / desktop_link`；接口 `preview` / `send`（仅中止 / 变更 / 提醒）。
- **新 `host-cohosts.ts`**：邀请发 / 列 / 撤回、`POST /api/host/cohost-invites/[code]/accept`。
- **新 `organizer-profile.ts`**：资料的 CRUD、公开 `GET /api/organizers/by-slug/[slug]`。
- **event-access 只加**：角色 `manager`、能力 `event.edit` / `event.cancel` / `check_in.walk_in`。
- **契约 6 只加**：来源 `event_host_notice`（App 先改宽进，G19）。
- **`event-venue.ts`**：`receptionNumber` 有值了；`qrPayload` 换 v2（字符串）。
- **分析只加**：`standingDistribution`、`followupFunnel`、`tableExchanges`、`suppressedBelow: 5`。
- **mock 与 fixture**：
  - 主办侧 mock 进 `features/redesign-contracts`；
  - **设计稿示例 fixture** `features/events/host/design-fixtures/`（只在非生产的 `route.dev.ts` 下生效）照画板造**六场**活动：
    - CFO18 开催中 128 / 150 · マッチ 112 · 受付 86；
    - 朝会 #3 42 / 60；
    - ラウンドテーブル 18 / 30 · 審査待ち 3；
    - vol.17 140 / 131 / 118 · 61%；
    - Founders Lunch 24 / 22 · 73%；
    - 朝会 #2 38 / 34 / 31 · 48%。

    另有两份主办方资料（CFO Night 実行委員会、製造業DX 朝会）。
  - **种子空账号** `qa-host-empty@orbit.test`：R17 第一天由种子脚本创建，步骤写进画面清单。

## 5. AI 调用

**R17 不新增付费 AI 调用，也不改现有提示词。**

| 环节 | 用什么 | 说明 |
| --- | --- | --- |
| 编组生成 | 现有 event-ops（`orbit-ai/gemini-provider`） | 每轮各调一次现有生成（ラウンド数 > 2 时次数增加，计入每场 ≤3 次「新生成」的上限按「生成一份方案」计）；本组不做真实调用，演示用 mock 产物；是否记账见 §10 A6 |
| 同社 / 前回同席 / 投資家分布 | **规则后处理** | `table-constraints.ts` |
| 質問案、要対応、提示、番号、参加歴 | **规则** | §3.3 |
| 定型通知 | **固定模板** | 不调 AI |

## 6. 和其他 Sprint 的接口

| 对方 | 本组给什么 / 用什么 | 不等的做法 |
| --- | --- | --- |
| R27 会場 ① チェックイン | 番号有值；QR v2（只改生成） | 门禁 A-R27-26 数据变化属 `[data]` |
| R27 参加登録 / by-code | 发布写 alias，by-code 查询不改；审核状态与通知 | R27 mock 码保留 |
| R27 名单规则 A | 主办侧接口不经过 `roster-policy` | — |
| R27 主催卡 | 「平均参加」改受付均值（与公开页一致）；「CFO 比率」见 §10 A11 | `[data]` |
| R26 代签计分 | kiosk 用现有 `checkInParticipant`；撤销签到时回退计分（R24 撤销规则） | — |
| R18 マイページ | `HostEventsRow` + `center?summary=1`；删旧临时链接 | 交接表 R17-04 / DEFERRED-A |
| R13 收件箱 | 来源 `event_host_notice`；通知设置开关 | 通用渲染 |
| R29 运营后台 | 通報、下架 | — |
| 组件库（乙） | Drawer、Modal、表格多选、拖动卡 | G23，暂缓 |

## 7. 两端界面与路由

| 端 | 路由 | 画面 |
| --- | --- | --- |
| Web | `/app/events/center` | 運営センター |
| Web | `/app/events/center/new`、`/app/events/[id]/edit` | 建活动 / 编辑基本情報 |
| Web | `/app/events/[id]/operations?tab=overview \| matching \| people \| setup \| report`，`&drawer=cohosts` | イベント運営 |
| Web | `/app/events/[id]/operations/check-in` | kiosk（不挂壳） |
| Web | `/app/events/center/profiles`、`/app/events/center/profiles/[id]` | 主办方资料 |
| Web | `/o/[slug]`（公开，不挂壳）；旧 `/app/o/[slug]` 302 | 公开主办方页 |
| Web | `/e/[slug]`（公开短链，302 到 R27 详情） | 申込页 |
| Web | `/app/host/join/[code]` | 共同運営に参加 |
| App | `events/center`、`events/[id]/operations`（段 概要 / マッチング / 参加者 / 受付 / レポート）、`…/check-in`、`host/join/[code]`、`o/[slug]` | 运营中心 / 运营 / 受付 / 落地 / 公开页 |
| App | 旧 `operations/{admission,experience,roles}`、`analytics` | 跳 `operations?seg=…` |

- **壳与登记**：
  - `admission` 改成壳内页签，所以要同步改 `shellAppliesTo` 与 `orbit-ask-routes.ts:38` 的 `EXCLUDED_SEGMENTS`（只留 `check-in`），G14 的说明也一起更新；
  - 公开 `/o`、`/e` 进登录前缀表的公开名单；
  - App 改 `parentForPath` 与跳转表；Web 改审计计数。
- **删除**：
  - Web `ops-0918/*`（逐个确认调用方，`modal-frame` / `register-modal` 若仍被 iOrbit 用就保留）、`o/orbit-real-organizer-public.tsx` 与它的 view model；
  - App 主办旧屏与 `OrganizerPublicScreen` 及其 view model。

## 8. 画面与画板总表

- 深色由门禁切画框 `data-theme` 得到。
- kiosk 画板是 1180×820；「kiosk 只比 1180，1024 / 390 不做」属偏离三宽度规则，见 §10 A8。
- 「设计稿无」的画面等 §10 B 组补画、认可后进门禁。

| 画面 | App | Web 1440 | Web 1024 | Web 390 |
| --- | --- | --- | --- | --- |
| 運営センター 空 / 少 / 大 | `b6` #21 / 设计稿无 / #22 | `b6` #0 / #1 / #2（深 #44） | 设计稿无 | 设计稿无 |
| 建活动 / 编辑 | — | 设计稿无（B1） | 设计稿无 | 设计稿无 |
| 公開 / 中止 / 变更确认 | — | 设计稿无（B2） | — | — |
| 概要 | `b6` #23 | `web.html` #20 | 设计稿无 | 设计稿无 |
| App レポート段 | 设计稿无（B10） | — | — | — |
| マッチング 空 / 少 / 大 / 公開確認 | 设计稿无（B4） | `b6` #3 / #4 / #5 / #6 | 设计稿无 | 设计稿无 |
| 参加者 空 / 少 / 大 | 设计稿无（B4） | `b6` #7 / #8 / #9 | 设计稿无 | 设计稿无 |
| 受付 | `b6` #24 | kiosk `b6` #10 / #11（深 #45）/ #12 | A8 | A8 |
| 受付 QR 读取中 / 当日枠超定员 | 设计稿无 | 设计稿无（B8） | — | — |
| 申込設定 空 / 少 / 大 | — | `b6` #13 / #14 / #15 | 设计稿无 | 设计稿无（PC 引导，B3） |
| お知らせの文面 / 定型通知确认 | — | 设计稿无（B5） | — | — |
| レポート 开催前 / 少 / 全体 / 自分 | — | `b6` #16 / #17 / #18 / #19 | 设计稿无 | 设计稿无（PC 引导） |
| 共同運営者抽屉 | 设计稿无 | `b6` #20 | 设计稿无 | — |
| 共同運営に参加 | 设计稿无（B6） | 设计稿无（B6） | — | 设计稿无 |
| 主办方资料编辑 | — | 设计稿无（B6） | — | — |
| 公开页 空 / 少 / 大 | 同 Web 390 | `b7` #33 / #34 / #35 | 设计稿无（B6） | `b7` #36 / #37 / #38 |
| フォロー · 未ログイン | — | 设计稿无 | — | `b7` #39 |
| 下書き / 中止 / アーカイブ 的行与运营台状态 | 设计稿无 | 设计稿无（B11） | — | — |

## 9. 自定决定（对标成熟产品；与画板无关的工程决定）

| # | 事项 | 决定 | 对标 |
| --- | --- | --- | --- |
| 1 | 生命周期 | 只用正式的 `draft / published / cancelled / archived`；三表同事务写入，照回填写法 | Luma / connpass |
| 2 | 参加コード | 发布自动生成，R15 字母表 `XXXX-XXXX`；可再发行（删旧 alias） | Peatix 招待コード、Luma 重置邀请链接 |
| 3 | 申込页 | `/e/<slug>` 短链 302 到 R27 详情；slug 公开后不变 | connpass 固定活动 URL |
| 4 | App 不做建活动 | 照画板「PC が便利」 | Eventbrite Organizer App |
| 6 | QR | HMAC v2，活动结束后 24 小时过期 | Luma / Eventbrite 不可猜的签到码 |
| 7 | 受付番号 | admitted 的同一事务里分配（三条路都覆盖），取消不回收 | Peatix 整理番号 |
| 8 | 参加歴 | 只统计本主办方的活动 | connpass「このグループ」次数 |
| 9 | 質問案 | 规则 | Google Forms 模板库 |
| 10 | 批量审核 | 逐条调用、各带版本、部分失败就地标出 | Gmail 批量 |
| 13 | 通報 | 复用反馈表单；下架归 R29 | 早期产品常见做法 |
| 14 | 生成次数 | 「新生成」≤3，失败的 retry 不计 | 画板口径 |
| 15 | 通知投递 | 事务内 outbox + worker、幂等；非生产邮件强制重定向 | 事务 outbox 模式（Stripe webhooks 同类） |
| 16 | 「PC で開くリンク」 | 写自己的收件箱，不发邮件 | Slack「デスクトップで開く」 |
| 17 | 旧公开链接 | 302 到资料页 | 保持分享链接可用 |
| 18 | 中止权限 | 只有 owner（`event.cancel`）；编辑给 owner 与 manager | Luma：只有 Host 能取消 |
| 19 | 编组条件 | 能用规则后处理的就用规则做，不改提示词；调整走 overrides，发布时再合成冻结 | — |

（v1 的 #5 kiosk 宽度、#11 角色权限、#12 主催卡口径属于偏离画板，已移到 §10 A8 / A9 / A11。）

## 10. 需要定的事

### A 用户 2026-10-16 确认全按推荐（原为待拍板：真产品取舍 / 隐私 / 偏离画板）

**用户 2026-10-16 已答复：A1–A13 全按推荐**（原话：「全按推荐」）。下表「推荐」一栏即定稿；「不同意时」一栏不再适用。画板按结论的改动见决定表 §39（a708a2e6a），预检 10 处自洽修正见 §40（ab185db4f）。

| # | 事项 | 推荐 | 对标 | 不同意时 |
| --- | --- | --- | --- | --- |
| A1 | **参加费**：Orbit 收不收钱 | 不收，只展示（無料 / 金額 / 当日払い / 外部決済リンク） | connpass 不经手钱；Peatix / Luma 收款要牌照与 Stripe | 另开收款 Sprint（Stripe Connect、退款、特商法表记） |
| A2 | **导入第三方名单**（Peatix / connpass CSV） | 只生成招待リンク与核对表，主办方自己发；Orbit 不发邮件、不建联系人；文件 90 天后自动删 | connpass 只能给已登记的人发消息；日本特定電子メール法要求事先同意 | 不做：去掉 `b6` #0 / #7 两处入口（B 组改画板） |
| A3 | **报告里的私人数据** | 只给聚合；<5 显示「—」；差分保护；交换只计双方都确认的 | Eventbrite / Luma 只给汇总；k-匿名常用阈值 5 | 给逐人名单要参加者在报名时同意，设计稿要改 |
| A4 | **kiosk 本机缓存名单** | 当天、画板所需字段（含役職 / テーブル），TTL 活动结束 +12 小时，只有受付设备缓存 | Eventbrite Organizer 离线签到 | 不缓存：离线时只排队、不能搜索，`b6` #12 要改 |
| A5 | **NFC 交换**（`b6` #28–33 / #46 / #47、`b7` #68–71 / #78） | 下一期，这些画板不进门禁 | Eventbrite / Luma 也没有手机 NFC 交换；名片交换类 App（Eight）用二维码 | 另开 Sprint：原生 NFC、实物名札、`/n/[tagId]` |
| A6 | **编组付费 AI 接账本** | 接（只记账），带 `event_matching` 迁移 | OpenAI / Anthropic 控制台按用途计量；与 R27 A5 同口径 | 不接 |
| A7 | **谁能主办** | 任何登录用户都能建；公开不审核，靠通報 + 运营下架 | Luma / Peatix / connpass 开放创建 | 加「主催者申請」与 R29 审核台 |
| A8 | **kiosk 宽度**：画板只有 1180×820 平板 | 只做并门禁 1180（平板横屏）；Web 1024 以上同一布局居中，390 显示「受付はタブレットか App で」+ 打开 App | Eventbrite / Peatix 受付以平板与 App 为主 | 补画 1024 / 390 kiosk（B 组） |
| A9 | **角色权限与 b6 #20 表不一致**：画板写受付能看报告、閲覧能看概要；现有能力不行；当日枠要不要给受付 | 照画板：受付加 `analytics.read_aggregate` 与 `check_in.walk_in`；閲覧加概要读取（`center.read` 已有，补 `operations.read_summary`） | Luma Check-in 角色能看签到统计 | 不照画板就改 b6 #20 的表（B 组） |
| A10 | **审核通知与「主催者からのひとこと」**：画板写「自動でお知らせ（文面は申込設定で編集）」 | ① 点「承認 / 見送り / 待ち」即视为发前确认，批量条写明人数；② 正文固定，只开放 ≤140 字、不带链接的「主催者からのひとこと」 | Peatix / connpass 的审核结果通知是固定文 + 主办方备注 | ① 不同意：每次决定弹确认；② 不同意：完全不可改，B5 画板去掉编辑 |
| A11 | **R27 主催卡「CFO 比率」**：没有这个数据 | 改成「申込回答 Q1 第一选项的比率」，标签取选项文字（CFO Night 那场正好是「スタートアップの経営者・CFO」）；画板 #394 等标签随之变 | — | 去掉这一格（改画板） |
| A12 | **生产试点开关**：生产上主办方新建的活动发布不了申込 | `created_by = 'host'` 的活动不受白名单限制，保留总开关；属生产环境行为，合回时随部署授权 | — | 保持白名单：主办方要找运营开通 |
| A13 | **主办方资料一人多份** | 允许一人多份资料、活动选所属资料（与画板「CFO Night 実行委員会」页只列该系列活动一致） | Peatix / connpass「グループ」 | 一人一页：公开页会列出这个人的全部活动，`b7` #34 等要改 |

### B 交 design-decisions 补画 / 改画板（只加在 `b12` 末尾；改原画板保持序号）

| # | 画面 | 推荐画法 |
| --- | --- | --- |
| B1 | 建活动 / 编辑基本情報（Web 1440 / 1024 / 390） | 照 `b6` #13 的左表单右预览；含「所属する主催者ページ」选择（A13） |
| B2 | 公開確認、中止確認、日時・会場変更の通知確認 | 01-system 确认框 480；中止主按钮用 `--coral-text` |
| B3 | Web 1024 / 390 全部主办画面 | 1024 = b8 断点；390 = 运营中心 / 概要 / 参加者照 App；申込設定 / マッチング / レポート 390 给「PC で編集」引导 |
| B4 | App：運営センター少量、マッチング「結果を見る」（只读）、参加者（审核列表）、「テンプレート」「受付だけ担当」两格的去向、受付 QR 读取中 | 同 Web 行信息，按钮放行尾 |
| B5 | お知らせの文面（6 种固定模板预览 +「主催者からのひとこと」）、定型通知确认（プロフィール未完了 16名） | 申込設定下折叠区；确认画面写人数 + 预览 |
| B6 | 主办方资料编辑（列表 + 编辑）、共同運営に参加（Web 落地 / App 落地 / 输码）、公开页 1024 | 编辑照 `b7` #34 左表单右预览；落地 = 公开顶栏 + 邀请卡 |
| B7 | 公开页 URL 文字 `orbit.example/h/cfo-night` → `/o/cfo-night` | 改原画板（`b7` #36–38） |
| B8 | kiosk QR 读取中、当日枠超定员确认、撤销签到确认 | 相机取景盖右侧；确认框 01-system |
| B9 | `b7` #34 / #35 数字口径（開催回数 vs 過去件数、累計参加者 vs 参加 N名） | 按 §2.11 口径改原画板 |
| B10 | App レポート段摘要 | 三格 +「PC で詳細」 |
| B11 | 下書き / 中止 / アーカイブ 的运营中心行与运营台状态 | 状态 chip 照 b6 #2 的「開催前 / 開催中 / 終了」画法 |
| B12 | 定型邮件与收件箱条目的样式 | 照 01-system 的邮件 / 通知卡 |

### C token（R17 第一天走 R01 流程补，不用拍板）

预检（`board-preflight.mjs`，2026-10-16，b6 34 块 + web #20 + b7 8 块）：近似 21 处、缺 token 220 处；自洽提示 3 处，都是误报（b6 #2 / #44 是不同活动；b6 #9 已由 d429939c5 修掉）。b7 #34 / #35 的数字口径不自洽，这一处工具没查出来，见 B9。

| # | 缺口 | 出现 | 推荐 |
| --- | --- | --- | --- |
| C1 | 字距 -0.14px / -0.15px | 100 / 8 | 换算成 em 后对齐 R26 的字距 token；对不上就新增 `--track-display` |
| C2 | 字距 -0.02 / 0.01 / -0.01 / -0.03em | 43 / 11 / 7 / 1 | 用 R26 C5 的 token；工具不比字距 token 的问题交 board-preflight |
| C3 | 画框外阴影 | 22 | 画框装饰，不进 token |
| C4 | 圆角 40 / 30 / 32；近似 15 | 4 / 3 / 2 / 4 | kiosk 大按钮 `--r-kiosk: 40`；30、32 先核对 sheet / dialog 的现有值；15 请设计稿改成 14 |
| C5 | 字号 92；近似 23 | 1 / 1 | `--fs-kiosk-hero: 92`；23 请设计稿改成 22 |
| C6 | `rgb(42,36,51)` 近似 `--paper-ink` | 4 | 交设计稿核对 |

## 11. 待授权与暂缓

| 类别 | 项 | 说明 |
| --- | --- | --- |
| 生产迁移 | `host-core`；（A6）`ai-usage-event-matching` | 合回前执行；README「合回前总验收」已登记 |
| 生产环境 | 试点开关对 host 活动放行（A12） | 随合回部署授权 |
| 邮件 | `features/mail/transactional` + `ORBIT_MAIL_REDIRECT_TO` | 非生产强制重定向，有测试 |
| 付费 AI | 无新增 | — |
| 依赖 | Web 新增 `@zxing/browser`；App 已有 `expo-camera`、`expo-sqlite` | 登记依赖 |
| 暂缓 | App 入口（R18）；组件差（组件库）；设计稿无的画面（B 组） | 交接表 R17-04 / R17-05、DEFERRED-A |

## 12. GitNexus

本文的符号与行号来自代码阅读与复核核实（2026-10-16，`d429939c5`）。开工第一天：先 `analyze --index-only`，再对以下符号跑 `impact --direction upstream`，结果写进 REPORT：

- `decideApplication`、`projectCanonicalMembership`、`checkInParticipant`；
- `listAccessibleEvents`、`publishGeneration`、`resolveCanonicalEventAlias`；
- `eventPilotDecision`、`organizerKeyFor`；
- `venue-core` 的 `qrPayload` 生成、`shellAppliesTo`；
- 回填 upsert。

# 主催（R17）文档 — REVIEW（独立复核）

**复核人：** 独立 AI 复核会话（没有参与写作），2026-10-16。
**对象：** `host/DESIGN.md`（版本 1）、`R17-host-operations/{GOAL,PLANNER}.md`（revision 1）。
**依据：** README 通用规则 11 / 12；HOW-TO §0 / §8 / §10；HANDOFF「R17 主催」（R17-01～05）、R18-01、通用口径 G01–G26；决定表（D02 / D08 / D18 / D50、§20、§23、§28、§34–§37）；AI 定位 2026-10-07 补充（定型系统通知可发、须非 AI 撰写且发前确认）；代码 `repos/orbits` / `repos/orbit-app` @ `d429939c5`；`compare-redesign.mjs --list`（b6、web、b7、b5、b12、b11、b8、b2、app）与 `--extract-board` 抽查（b6 #0 / #2 / #7 / #9 / #11 / #12 / #15 / #18 / #20–#24，b7 #34 / #36，b5 #16 / #20）。
**说明：** 只读复核，只写本文件；没有连库、没有调用付费 AI、没有发邮件。

## 结论：有条件通过

已独立核实属实的部分：
- **代码事实大多对**（抽查 24 处）：`admission/storage/postgres-repository.ts` :662（副作用全 false）/ :833（定员低于已批准报错）/ :881 / :939-941 / :953 / :1203-1219；`event-operations/service.ts` :521 / :537-549；`venue-core.ts` :81 / :151；`event-venue.ts:52`；`events-journey.ts:282`；`core/backfill.ts` :226 / :418-435；`core/contract.ts:1`；`journey/handlers.ts:199`；`journey/live.ts:183`；`live-mapping.ts:166`（报名数均值）；`shell-routes.ts` :10 / :21 / :35；`orbit-ask-routes.ts:38`；`api/events/handler.ts:184`；`live-service.ts:510`；`engine.ts:845`；4 角色 + owner、16 项权限；`ops-0918` 20 个文件 5,596 行（`ops-model.ts` 915、`ops-shell.tsx` 774）；`OrganizerPublicScreen.tsx` 464 行。不准的几处见 M1、m1。
- **画板序号全部正确**：b6 #0–#24、#44 / #45（深）、#25–#33 / #46–#48；`web.html` #20；b7 #33–#39（#36–#39 是 `phone` 框）；b5 #14–#16 / #18–#20 含「主催したイベント」行。**确实没有建活动画板**：b12、b11、b8、b2、app、01-system、02-gaps 都没有（b12 #84 / #85 是 R07 头像菜单备选，b2 #26 是参加者侧受付）。
- AI 边界、全场录音出局、规则 A 主办侧不受限的口径写得对；D02 / D08 / D50 落在 SC-R17-11。

但有 **3 条严重、10 条中等**问题。**严重的三条都是「后端已齐全、形状不改」这个前提不成立**：画板上的审核 / 受付动作、编组拖动与条件、以及生产上自助办活动，现有服务端都做不到。

**条件：** S1–S3、M1–M6 在开工前改 DESIGN 与 PLANNER（契约第一天提交会受影响）；M7–M10 在写界面前补齐；m 级执行时顺手改。

## 问题清单

### 严重

**S1 审核与受付的状态机撑不起画板上的操作**
- **位置**：DESIGN §1.2、§2.5「現有接口」、§2.6 当日枠 / 取り消す、§9 #10；PLANNER「`decideApplication`……不改决定逻辑」。
- **问题**：
  - 决定只有 `approve | reject`（`admission/contract.ts:91`），且只接受 `pending_review`（`postgres-repository.ts:917`）。画板 b6 #9 每行「見送り / **待ち** / 承認」、批量「**キャンセル待ちへ**」，以及对「キャンセル待ち」分段里的人再承認 / 見送り，都没有接口。
  - 受付要求报名状态 `rsvped`（`memory-repository.ts:489`），候补者不能签到。「当日枠で受付」既要先把候补改成 admitted，又要超定员。可是 `check_in` 角色没有任何 `admission.*` 权限，`over_capacity` 也没有写入路径。
  - 「取り消す」（撤销签到）在 `service.ts` 里没有方法。签到还要求 event-ops 配置存在、并且 migration 状态为 `canonical`（`service.ts:182`、`memory-repository.ts:472`），主办方新建的活动在配置编组之前，kiosk 一个人也签不了。
- **依据**：DESIGN 原则「复用后端……只补缺口」。上面这些缺口都不在 §1.1 的清单里，也不在 PLANNER 的「改」清单里。
- **建议**：§1.1 加第 13 条；契约加 `decision: "waitlist"` 和「对 waitlisted 的决定」（只加不改）、`undoCheckIn`、`admitOnSite`。权限定为 `check_in.roster.write` + `admission.decide`，或者新增 `check_in.walk_in`，在 A 组问用户受付角色能不能超定员。发布时自动建一份 event-ops 缺省配置（时间取活动时间）。测试补「候补签到」「撤销」「未配置编组也能签到」三条。

**S2 编组：手动拖动与条件在现有管线里都不存在**
- **位置**：DESIGN §2.4「手动拖动 = 现有 `ops-model.ts` 的调整写法」「不改提示词」；SC-R17-04。
- **问题**：
  - `ops-model.ts` 里没有任何调席位的代码（`op-fq-drag` 只是申込問題的拖动图标）。`generations/[gid]` 下只有 `run` / `retry` / `publish`。
  - 配置只有 `tableSize`、两个固定轮次时间、`recommendationCount`（`event-operations/contract.ts:53-69`）。画板上的「ラウンド数 / 同じ会社は別テーブル / 前回同席回避 / 各テーブルに投資家」都没有字段。不改提示词或后处理，就做不出这些条件。
  - 在下書き上改席位，等于改生成产物。这会碰到「发布不可变 / 冻结配置 / 指纹」这几条管线约束，DESIGN 却写「一律不碰」。
- **建议**：设计一层「人工调整」，放在生成产物之外：新表 `event_ops_generation_overrides`，发布时把产物和 override 合并后冻结。条件分两类：规则后处理能做的（同社分桌、前回同席、投资家分布），和要改提示词的。要改提示词的列进 A 组，或者标「下一期」，画板上对应的 chip 交 B 组改。

**S3 生产上的活动试点开关会挡住自助办活动，文档没提**
- **位置**：DESIGN §2.7、§11；PLANNER 迁移 / 待授权。
- **问题**：`experience/publish` 走 `requirePilot` → `eventPilotDecision`（`shared/config/event-pilot-gate.ts:45-66`）。生产环境缺省关闭；即使打开，也只放行 `ORBIT_EVENT_PILOT_EVENT_IDS` 白名单里的活动。主办方新建的活动在生产上不能公开申込設定（ROI 也受同一个开关管）。
- **建议**：决定开关怎么处理：按 owner 放行，或者「由 host 生命周期创建的活动」默认放行，保留总开关作紧急停用。把它列进 §11「待授权」（生产 env）；测试补「生产模式 + 新建活动 → 可发布」。

### 中等

**M1 活动写入与参加コード：代码事实有一条错，迁移表也画多了**
- **位置**：DESIGN §1.1 #3、§3.1、§3.3、§6「by-code 改按 `public_code` 唯一列查」；PLANNER 改动清单。
- **问题**：
  - `getPublishedEvent` 先走 `resolveCanonicalEventAlias` 查 `event_aliases`（`core/service.ts:125-131`，`alias_type` 含 `public_code`），**不是**「拿码当活动 id」。只要发布时写了 alias，by-code 现在就能工作。
  - `event_ops_events` 已有 `public_code`（工作区内唯一索引，`migrations.ts:925 / :954`）、`ends_at`、`title`、`venue text`、`timezone`、`source_payload`，不需要再「开工核实」。
  - 写入还必须同步 `event_event_versions`（`content_hash`、`event_version`）与 `event_aliases`，和回填脚本一样。回填的 upsert 会覆盖 `public_code` / `lifecycle_state_v2`（`backfill.ts:427-435`），重跑回填会把主办方生成的码洗掉。
- **建议**：§3.1 删掉 `public_code` / `ends_at` 两列；`fee_display` / `emoji` 优先放 `source_payload`。§3.3 写明三表同事务写入；重发码 = 删旧 alias、加新 alias。回填跳过「由 host 创建」的活动，加一个来源标记。by-code 不改查询，只改规范化。测试补「回填重跑不覆盖」「旧码 alias 失效」。

**M2 申込页 slug 没有路由，也没有消费方**
- **位置**：DESIGN §2.2-3「`orbit.app/e/<slug>`」、§7。b6 #7 画的也是 `orbit.app/e/mfg-dx-asakai-3`。
- **问题**：§7 没有 `/e/[slug]` 路由。公开的 `/o/[slug]` 现在也不存在，只有 `/app/o/[slug]`。域名 `orbit.app` 与生产域名不一致。
- **建议**：slug 写成 `event_aliases`，加一个 `public_slug` 类型（只加），`/app/events/<slug>` 现在就能解析。另定一条短链 `/e/<slug>` 302 到 R27 详情，在 §7 登记，登录前缀表也要登记。画板上的 URL 文字算 `[data]`；如果要改成真实域名，交 B 组。

**M3 通知和受付番号挂错了位置，会漏掉三类人**
- **位置**：DESIGN §2.5、§2.6「批准时分配」、§2.10；PLANNER「`decideApplication` 之后的出站步骤（事务外）」。
- **问题**：变成 admitted 的路径有三条：先着順报名直接 admitted；有人退出时候补自动递补（`:1203-1219`，在 withdraw 事务里）；审核决定。挂在 `decideApplication` 之后只覆盖第三条——递补上来的人收不到通知，也拿不到受付番号。另外，「事务外」发送遇到崩溃就会丢通知。
- **建议**：在 `projectCanonicalMembership`（`:673`）同一事务里写 outbox 行，同时分配番号。由 outbox worker 写收件箱、发邮件，幂等键不变。测试补「递补 → 通知 + 番号」「先着順 → 番号」。

**M4 共同运营的角色映射做不出来，而且和画板的权限表不一致**
- **位置**：DESIGN §2.8、§9 #11；SC-R17-09。
- **问题**：
  - 角色指派表 `event_ops_event_role_assignment_heads` 按 `(workspace, event, subject)` 唯一（`event-access/storage/postgres-repository.ts:332`），一个人只能有一个角色，「operations + reviewer 两条一起授予」不成立。
  - b6 #20 的「役割でできること」写着受付可以「レポート閲覧 ✓」，但 `check_in` 没有 `analytics.read_aggregate`；閲覧（`read_only_analyst`）进不了概要。
  - 画板上的「変更理由（必須）· 0 / 100」和「変更履歴」，DESIGN 没写数据来源。服务端已有 `reason`（1–1000 字）和版本表，可以直接用。
- **建议**：新增角色 `manager`（枚举只加，CHECK 迁移追加），能力 = operations ∪ reviewer。受付要不要看报告属于偏离画板，先问用户（A 组），否则 `check_in` 要补 `analytics.read_aggregate`。§2.8 补「理由 / 履历」两项的数据来源。

**M5 共同运营邀请的安全设计不够**
- **位置**：DESIGN §2.8、§3.1 `event_cohost_invites`；PLANNER 接口表。
- **问题**：
  - 邀请链接是持有即可用的凭证，管理者角色能拿到 `attendees.read_full` / `attendees.export`（参加者全量资料与导出），链接被转发就等于泄露。
  - 「邮件只发给已有 Orbit 账号者」：如果界面按输入的邮箱区分「已发送」和「只给链接」，就成了账号枚举口。
  - 码的长度、熵和限流都没写。和参加コード、R15 招待コード用同一种格式，容易输错地方。
  - 接受流程两份文档不一致：DESIGN 写的是 `PUT access/assignments/[me]`，那个接口要 `roles.manage`；PLANNER 写的是 `POST …/accept`。
- **建议**：
  - 链接用 ≥128 bit 随机令牌，只能用一次。指定了邮箱或 Orbit ID 的邀请，接受时必须是同一个人；「招待コード」用短码加限流（对标 R15 的防枚举）。
  - 不管邮箱有没有对应账号，界面都给同样的反馈。
  - 统一用 `POST /api/host/cohost-invites/[code]/accept`。
  - 测试补「转发链接被他人接受 → 拒绝」「枚举限流」。

**M6 定型通知的边界和 AI 定位规则相冲突**
- **位置**：DESIGN §2.2「過去の参加者を取り込む → 发定型邀请」、§2.7 / §2.10、A2；§11 邮件。
- **问题**：
  - **CSV 招待リスト发邮件**，收件人是非用户的第三方邮箱。这和 §2.8「Orbit 不代发给陌生邮箱」、§2.10「不发给非用户邮箱」自相矛盾。按日本特定電子メール法，营销邮件要收件人事先同意，主办方从 Peatix 导出的名单不构成对 Orbit 的同意。
  - **主办方可改的正文段**以 Orbit 名义发给全体报名者，实际上就是自由文本群发，违反 §2.10 自己写的「不发」，也超出「定型」。
  - **按「承認 / 見送り」即发、不弹确认**：画板 b6 #9 写了「自動でお知らせします」，但 2026-10-07 口径要求「发前确认」。要么请用户确认「点决定按钮就算确认」，要么加一行确认。
  - 「现有 SMTP」只有 `features/auth/password-reset-smtp.ts`：没有通用事务邮件模块，没有退订或通知偏好，本机也没有收件人重定向守卫。§11「本机只发 QA 邮箱」靠的是约定，没有代码保证。
- **建议**：
  - A2 推荐改成「导入只生成招待リンク，由主办方自己发」，Orbit 不发邮件（对标 connpass：只能给已登记的人发消息）。
  - 正文段限长、不允许链接，标「主催者からのひとこと」，再列进 A 组。
  - 新建 `features/mail/transactional`，带 `ORBIT_MAIL_REDIRECT_TO`（非生产强制），尊重 R13 的通知设置。
  - 测试补「非生产不会发到真实地址」。

### 写界面前补齐

**M7 主办方资料「一个 actor 一份」和画板对不上；公开页的数字口径也不自洽**
- **位置**：DESIGN §2.11、§3.1、§9 #12；PLANNER 预检 ①「b7 ✓」。
- **问题**：
  - b6 #2 里同一个人在办 CFO Night、製造業DX 朝会、資金調達ラウンドテーブル、Founders Lunch；b7 #34「CFO Night 実行委員会」页只列 CFO Night 的活动。按「一个 actor 一份资料」做，朝会这些活动也会出现在这一页。
  - b7 #34「開催回数 2」，但「過去のイベント 1件」；「累計参加者 86」是 vol.18 的受付人数，同一页「参加 128名」却是申込数。DESIGN 定义的「已结束场次 / 受付合计」和画板对不上，预检第 ① 项漏掉了这处不自洽。
- **建议**：活动挂到资料上（`event_ops_events.organizer_profile_id`，一个 actor 多份资料），或者在 A 组请用户定「一个主办方一页」。数字口径定下来以后交设计稿会话改 b7 #34 / #35，并更新预检表。

**M8 像素 SC 不满足「每个画面一条」；还有一块画板被省略**
- **位置**：PLANNER 像素 SC 表；DESIGN §7 / §8。
- **问题**：
  - 一条 SC 里放了多个画面：P16（Web 离线 + App #24）、P25 / P26（各 3 块）、P28–P31（4–7 个画面）。表里也没有逐条写主题。
  - b6 #23 的 App 段有「**レポート**」，DESIGN §7 的 App 段只列了 概要 / マッチング / 参加者 / 受付，等于省略了画板内容。
  - P01 的「`qa-empty@orbit.test`」在仓库里不存在。fixture 的场次也对不上：DESIGN §4 写三场，PLANNER ⑤ 写六场，GOAL 写三场。
- **建议**：拆成一屏一条，每条写明画板 + 宽度 + 主题 + 到达方式。App 加 レポート 段（摘要，详细内容放 PC），画板缺的部分进 B4。把种子账号和六场活动的 fixture 写进 §4，三份文档统一成六场。

**M9 §9「自定决定」里有几条改了画板，按规则 11 要先问用户**
- **位置**：§9 #5（kiosk 只比 1180，省掉 1024 / 390 和三宽度）、#11（权限矩阵和 b6 #20 不同，见 M4）、#12 和 §6（R27 主催卡「CFO 比率」改成取选项文字，标签变了）。
- **建议**：移到 A 组（或者走 B 组改画板），写上推荐和对标；kiosk 的 1024 / 390 写「设计稿无 + 用户结论」。

**M10 报告和 kiosk 的隐私口径还有缺口**
- **位置**：DESIGN §2.9、§2.6 离线、A3 / A4。
- **问题**：
  - b6 #18 把「名刺交換」定义为「NFC・QR・名刺スキャン の記録」，这是参加者私人人脉里的记录。DESIGN 却用「交換申請」，两边数据来源不一致。`followupFunnel` 读的是参加者的私人草稿行为。
  - <5 抑制只写在报告里；运营中心的「会後フォロー率」KPI 和每行「会後フォロー N%」（b6 #2）没有抑制，也没防差分（总数减去已显示的格子就能反推被抑制的数）。
  - b6 #11 / #12 的 kiosk 行显示役職和テーブル，A4 的「最小字段」不包含这两项。「注销即清」覆盖不到浏览器直接关掉的情况。
- **建议**：A3 写明来源（交换数只计双方都确认的交换），抑制同时用在 center 和列表，并加差分保护。A4 字段对齐画板，或者把差异写进 A4；缓存加 TTL（活动结束 +12h），启动时检查过期就清除。

### 轻微

- **m1 行号与依赖**：`use-check-in-roster.ts:160` → 409 处理在 :112；`engine.ts:1448` → :1449；`organizer-public-route-view-model.ts:380` 是 loader，不是匹配处；`handlers.ts:210` 要写全路径 `app/api/events/[id]/experience/handlers.ts`。`expo-camera` ~57 和 `expo-sqlite` 已在 App 依赖里，§11 的「若 R12 引入」和 PLANNER 的「构建失败」分支可以删；`@zxing/browser` 是新依赖，要登记。
- **m2 字符集**：R15 的字母表是 `23456789ABCDEFGHJKMNPQRSTVWXYZ`，还去掉了 U，不只是「0 / O / 1 / I / L」。R27 mock 码 `CFO18NGT` 里有 O 和 1，「规范化去易混字」会让它失效，和「mock 码保留」冲突。已有的回填码也可能不合字符集，规范化只能用在新码上。
- **m3 收件箱来源**：§2.1 写的「来源 `system`」在 `InboxSourceKind` 里不存在（`inbox-notifications.ts:5-7`），契约只加了 `event_host_notice`。要统一。
- **m4 A 组**：A5 对标写的是「—」；A6 的对标是内部口径，不是成熟产品。M4 / M6 / M7 / M9 里的拍板项要补进 A 组。
- **m5 B 组漏项**：App レポート 段（M8）；运营中心和运营台的下書き / 中止 / アーカイブ 状态（b6 #2 只画了 開催前 / 中 / 終了）；App 的「共同運営に参加」落地页（B6 只写了 Web，P30 却含 App）；定型邮件和收件箱条目的样式。§2.13 漏了 b7 #68–#71（名刺を渡す · 登録不要），应和 NFC 一起列进下一期。
- **m6 登记**：HANDOFF 的 R17-04 / R17-05 没有对应 SC 编号（SC-12 只写了 R17-03）。README 登记表在复核前已经写了「已复核」。GOAL 写「Web 三种宽度」，大部分画面其实是「设计稿无」，写法夸大了。
- **m7 未定义的入口**：b6 #21 的「テンプレート」和「受付だけ担当」两格（App 不建活动）点了去哪里没写；「PC で開くリンクを自分に送る」的对标（Notion / Figma）不贴切，可以改成 Slack 的「デスクトップで開く」，或者先问用户。
- **m8 壳与计数**：`admission` 改成壳内页签后，G14「kiosk（入场审核）不挂壳」和 `orbit-ask-routes.ts:38` 的 `EXCLUDED_SEGMENTS` 要同步更新。「3 回まで」没说 `/retry` 算不算一次。
- **m9 权限**：建活动、编辑、中止没有对应的 capability（16 项里没有 `event.edit`）。中止要通知全体报名者，建议只给 owner（对标 Luma：只有 Host 能取消活动）；新增能力只加不改。
- **m10 迁移风险**：`event_ops_events` 被 R26 / R27 的读取方和回填共用，加列和唯一约束要用 `if not exists`，并对生产已有数据做只读预检（slug 冲突、码是否合规）。`reception_no` 要写明加在哪张 membership 表上。

## 建议的修改顺序

1. S1–S3、M1–M3：改 §1.1（加第 13–15 条）、§3、§4 契约与 PLANNER 的「改」清单、测试清单。
2. M4–M6：改 §2.8 / §2.10 / §10 A 组，补 A8–A10（角色权限、正文段、自动通知即确认）。
3. M7–M10、m 级：改 §2.11、§8、PLANNER 像素 SC 表、B 组。

## 处理记录（2026-10-16，写作会话）

全部采纳：DESIGN 升到版本 2（全文重写），PLANNER 升到 rev 2（全文重写），GOAL 小改。

| # | 处理 |
| --- | --- |
| S1 | §1.1 加第 4、5 条（决定只有 approve / reject；签到要 rsvped 且要 event-ops 配置；没有撤销）。决定加 `waitlist` 和「对候补的决定」；新增 `undoCheckIn`（30 分钟内）、`admitOnSite`（新增权限 `check_in.walk_in`，受付角色给不给列进 A9）、发布时自动建 event-ops 缺省配置。测试 `admission-waitlist`、`checkin-v2` |
| S2 | §2.4 重写：同社 / 前回同席 / 投資家三条用规则后处理（`table-constraints.ts`）+ 配置 `roundCount`，不改提示词；新表 `event_ops_generation_overrides` 作人工调整层，发布时合成再走现有 `publish` 冻结。测试 `matching-overrides` |
| S3 | §1.1 第 11 条；host 活动不受试点白名单限制，总开关保留，列为 A12 + §11 生产环境项。测试「生产模式 + host 活动可发布」 |
| M1 | 改正 by-code 事实（走 `event_aliases`）；删掉多余的 `public_code` / `ends_at` 列；三表同事务写入；重发 = 换 alias；回填跳过 `created_by='host'`；`fee_display` / `emoji` 放 `source_payload` |
| M2 | 新增 alias 类型 `public_slug` 和短链 `/e/<slug>` 302 到 R27 详情；登记公开前缀 |
| M3 | 番号与 outbox 都放进 `projectCanonicalMembership` 的同一事务，覆盖先着順、批准、递补三条路。测试 `admission-outbox` |
| M4 | 新增角色 `manager` = operations ∪ reviewer；b6 #20 权限表的差异列为 A9；理由 / 履历用现有 `reason` 与版本表 |
| M5 | 链接 ≥128 bit 单次令牌并绑定被邀请人；短码 `H-` 前缀 + 限流锁定；反馈一致；统一 accept 接口 |
| M6 | CSV 只生成招待リンク，Orbit 不发（A2）；正文固定，只开放 ≤140 字不带链接的「ひとこと」，与审核即确认一起列为 A10；新建 `features/mail/transactional`，非生产强制重定向，有测试 |
| M7 | 主办方资料改成一人多份、活动挂资料（A13）；数字口径写进 §2.11；b7 #34 / #35 交 B9 改；预检表补这一处 |
| M8 | 像素 SC 改为每行一个画面、写明主题（P01–P33）；App 加 レポート摘要段（B10）；种子账号改为第一天创建的 `qa-host-empty@orbit.test`；三份文档统一为六场活动 |
| M9 | kiosk 宽度、角色权限、主催卡标签移进 A8 / A9 / A11 |
| M10 | 交换口径改为「双方确认」；抑制同时用在中心 KPI 与列表，并加差分保护；kiosk 缓存字段对齐画板、TTL = 活动结束 +12 小时、只有受付设备缓存（A4） |
| m1 | 行号改正（:112、:1449、:285 / :380）；写全 handlers 路径；`expo-camera` / `expo-sqlite` 已在依赖里；`@zxing/browser` 登记为新依赖 |
| m2 | 字母表改为 R15 的 `23456789ABCDEFGHJKMNPQRSTVWXYZ`，只对新码规范化，旧码与 mock 码原样可用 |
| m3 | 去掉 `system`，统一用来源 `event_host_notice`（kind `desktop_link`） |
| m4 | A5 / A6 补对标；把 M4 / M6 / M7 / M9 的拍板项并进 A8–A13 |
| m5 | B 组补上 B10 App レポート段、B11 下書き / 中止 / アーカイブ 状态、B6 App 落地、B12 通知卡；§2.13 加上 b7 #68–71 |
| m6 | 交接表 R17-04 / R17-05 对应 SC-R17-12 / 15；README 状态在复核修完后成立；GOAL 去掉「三种宽度」的夸大写法 |
| m7 | App 三格去向写明并交 B4；对标改为 Slack「デスクトップで開く」 |
| m8 | `admission` 移出 `EXCLUDED_SEGMENTS`，G14 说明同步改；失败的 retry 不计入生成次数 |
| m9 | 新增能力 `event.edit`（owner、manager）、`event.cancel`（仅 owner） |
| m10 | 迁移一律 `if not exists`，生产先只读预检；`reception_no` 写明加在 canonical membership 表 |

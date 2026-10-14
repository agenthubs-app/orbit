# Sprint R27 — 活动：从找到活动到会后

**Plan revision:** 2（rev 2 按 `events/REVIEW.md` S2、M8–M10、m5 / m7–m10 修订）。**模式:** existing-codebase / single-generator（执行人：小雨（甲））。**档位:** H。
**单一目标:** 两端重写活动参加者的整条路，在现有接口上做：
- 探す：コミュニティ、プランに効く、全部、絞り込み、検索；契约 9「興味なし」live；`event-search` 也给 R30 用；
- イベント詳細（含未登录公开版）、参加登録 / 参加コード / 取消；
- 会う準備、会場モード（签到状态、交換、面談を提案草稿、ひとことメモ设备端转文字）、会後のふりかえり（确定 → To-do / 出会い / 计划记分）；
- 删除两端旧活动详情 / 报名 / 会场屏与跳转路由。

**易读目标:** [GOAL.md](GOAL.md)。**整体设计:** [events/DESIGN.md](../events/DESIGN.md)（§2.2–2.7、§3.3–3.4、§4.2、§5、§6.4、§7–§8 R27 行、§9、§10、§13）。
**基线:** R26 收口后的 `redesign` HEAD。
**进入条件:**
- R26 done（`scoreEvent` 区间、`events-mine`、`event-emoji`、评估记录与吸顶条数据）；
- DESIGN §10 已定（2026-10-14）：A2 做轻量 `organizerFollows`；A3 去掉現在地；A5 接账本（迁移只在本机）；A7 Web 会場 390 引导到 App。A6（E3 / E4）可选，默认走规则退路，未授权不阻塞收口。B3 / B4 / B5 画板由 design-decisions 会话补（决定表 §28），没到的画面先跳过（规则 12「不阻塞」）。

**分支:** 同 R26。

## 已查清的事实（`redesign` @ `89e16b2b4`，开工时用 GitNexus 复核）

1. **契约 9**：`shared/contract/event-recommendation-feedback.ts`（reason `schedule | distance | content | known`；输入 `{reason, idempotencyKey}`；结果 `{eventId, reason, dismissedAt}`）；路由 `POST /api/recommendations/events/[id]/dismiss`（`features/redesign-contracts/handlers.ts:144`）；mock 只认演示世界活动（`mock-service.ts:352`）；live 503。
2. **现有活动接口**：
   - 列表：`app/api/events/handler.ts:149`；公开目录：`features/events/core/public-catalogue*.ts` → `app/api/events/public`。
   - 推荐：`features/recommendations/live-event-value-service.ts`，路由 `/api/recommendations/events`、`/events/[id]/accept`。
   - 开场白：`/api/recommendations/event/[id]/opening-line`（单数 `event`，规则 `live-opening-line-rule`，`features/recommendations/live-service.ts:435`）。
   - readiness：`app/api/events/[id]/readiness`（`features/events/goal-readiness`）。
   - 报名：`app/api/events/[id]/registration/{interview,persona,portrait,preview,cancel}`；`adaptive-interview-service.ts`、`question-generator.ts` 走 `orbit-ai/gemini-provider`（`ORBIT_AGENT_PROVIDER`）。
   - 运营：`app/api/events/[id]/operations/{check-in,contact-requests,…}`。
   - 会后：`app/api/events/[id]/post-event/{artifact,confirm,followup(s)}`（`post-event-artifact/provider-config.ts:18`）。
3. **契约**：`events.ts`（活动记录、capture method、origin）、`event-experience.ts`（主办方问题集 → 资料字段）、`event-registration-portrait.ts`（资料字段、回答凭证、问题快照）。**R27 不改它们的形状。**
4. **会场访问**：运营接口要求 `registration.status === "rsvped"`（`app/api/events/[id]/registered-event-access.ts:139-150`），否则 `EVENT_OPERATIONS_FORBIDDEN`（`event-operations/service.ts:~284-308`），这就是 `/live` 控制台 403 的来源。live 页把 `new Date()` 当 `now` 传入（`[id]/live/page.tsx`）。
5. **event-ops**（`features/events/event-operations/*`）：主办侧 AI 生成分组 / 席位 / 推荐。管线约束如下，参加者端只读发布结果，不碰这些约束：
   - 任务租约按 AI 请求指纹认领（`engine.ts:845`）；
   - 幂等键（`engine.ts:36`）；
   - 发布不可变、要求冻结配置与发布头（`publishGeneration` :1449，:1464-1481）。
6. **旧界面**：
   - Web：`app/(app)/app/events/[id]/{page,live,register}`、`events-0918/{event-detail,event-live,event-register-modal,modals}`。
   - App：`orbit-app/app/events/{[id],[id]/register,live,attendees,…}.tsx`、`src/screens/events/{EventDetailScreen,EventRegistrationScreen,Registration7a*,live/EventLiveScreen}`。
7. **搜索**：只有 `app/api/search/{suggestions,relationships}`，没有活动搜索。
8. **AI 记账**：报名访谈、会后总结都不写 `ai_usage_ledger`（DESIGN §1.1 第 7 条，§10 A5）。
9. **现有 AI 产物不够画板用**（复核 S2）：会后 `AttendeePostEventAiArtifact`（`post-event-artifact/contract.ts:8-18`）只有一段 `summary` + 一封 `messageDraft`；报名 AI 不产出自己紹介。画板要的「まとめ 3 条带依据」「次の一手逐人」「自己紹介下書き」需 E3 / E4（DESIGN §5，§10 A6 授权）。

## 上下文包

### 必读
- DESIGN §2.2–2.7、§3.3–3.4、§4.2、§5、§6.4、§9、§10；交接表「R26 / R27 活动」（R26-02 / 08 / 09 后半）、「R30」、「通用口径」G01–G26。
- 设计稿：`b2-events-flow.html` #6–48；`b3-daily-actions.html` #42。一律 `--extract-board` 单块抽取。
- 代码：上面「已查清的事实」所列；R24 面談提案组件（复用）；R12 名片扫描入口（会後空态带 `eventId`）；R20 笔记接口（契约 5 `eventId`）。

### 关键符号与 impact（开工时重跑，结果写 REPORT）
- 契约 9 handler、`createEventValueRecommendationService`：只**读** feedback 做降权 / 过滤（加一个可选依赖，不改现有方法签名）。
- registration 服务、post-event 服务：A6 同意时按 E3 / E4 升提示词版本与输出 schema（`messageDraft` 保留兼容，旧读取方不受影响，impact 写 REPORT）；A6 不同意时**不改行为**、走 DESIGN §2.5 / §2.7 的规则退路；A5 同意时在 provider 调用外层加账本 `reserve / settle`。
- `registered-event-access.ts`：不改校验，只在页面层先查状态。
- 旧屏组件删除前逐个确认调用方（`impact` + 文本搜索）。

### 易错边界（全部写进 SC）
- 探す与计划页、评估页分数不一致；没有计划时仍按「プランに効く」排序；把已見送る / 興味なし（known）的活动推回来。
- 興味なし重复点重复写；降权规则写错，误伤整个主办方。
- 搜索返回他人的私有活动（R26 外部活动）。
- 参加者列表显示未公开资料的人；関係マップ读到别人的人脉。
- 报名资料公开范围没生效（主催者のみ的字段被参加者看到）；报名访谈超过 5 问。
- 「カレンダーに仮で入れる」没确认就写入；审核结果出来后仮予定没更新。
- 名刺余量上传服务端。
- 会场未报名仍打运营接口出 403；工作人员代签后参加者端状态不刷新。
- 交換申请重复、「元に戻す」没撤回联系人。
- 面談を提案越过 D46 直接发出；ひとことメモ上传音频、录到别人。
- 会後确定时：
  - 没勾的行也生效；
  - 同人同类型重复记分；分数预览与服务端不一致；
  - お礼被发送（必须只有草稿）。
- 未登录详情挂了登录壳；示例模式写库或调 AI；`/live` 水合警告。

## 契约（第一天提交，`contract:` 开头，「App 需要同步」）

- 契约 9 live，形状不变。
- 新 `shared/contract/event-discover.ts`、`event-search.ts`、`event-prep.ts`（+ `api-schema`，DESIGN §4.2）。
- 如 A2 同意：`organizer-follow.ts`（`POST / DELETE /api/organizers/[id]/follow`）。
- 快照、parity、App 同步；fixture（CFO Night vol.18 的会場 / 会後示例、探す 28 件示例）进 `demo-world-consistency`。

| 接口 | 说明 |
| --- | --- |
| `POST /api/recommendations/events/[id]/dismiss`（live） | 写 `eventRecommendationFeedback`（幂等）；推荐、探す读它：known 过滤这一场；schedule / distance 对同时段 / 同地区降权；content 对同主办同主题降权；同主办 3 次后整体降权（DESIGN §9 #12） |
| `GET /api/events/discover`（新） | 三组 + 计数 + `popularityFallback`；分数用 `scoreEvent`；外部私有活动只出现在本人「参加予定」，不进探す |
| `GET /api/events/search`（新） | events / organizers / people（我的联系人里登壇或报名的人）；R30 复用同一服务 |
| `GET /api/events/[id]/prep`、`PATCH …/prep/checklist`（新） | 会う準備（readiness × 计划类型 × 开场白规则 × 联系人时间线）；清单勾选两端同步 |
| 现有 registration / operations / post-event | 形状不变；页面层用 `whenNotImplemented` 兜缺字段 |

## 迁移

- 默认不需要迁移；集合 `eventRecommendationFeedback`、`eventPrepChecklists`（以及 A2 同意时的 `organizerFollows`）。
- **如 A5 同意**：`ai-usage-event-purposes`（放宽 `ai_usage_ledger.purpose` CHECK，加 `event_registration_interview`、`event_post_summary`；同步 `features/ai-quota/constants.ts`）。只在本机验证，生产等授权。

## 范围与文件

- **新建（服务端）**：
  - `features/events/discover/{service,configured}.ts`；
  - `features/events/search/{service,configured}.ts`；
  - `features/events/prep/{service,repository,configured}.ts`；
  - `features/recommendations/event-feedback/{service,repository}.ts`；
  - 路由 `app/api/events/{discover,search}/route.ts`、`app/api/events/[id]/prep/**`；
  - `redesign-contracts/service-factory.ts` 契约 9 加 live；
  - （A2）`features/events/organizer-follow/**`。
- **新建（Web）**：`app/(app)/app/orbit-2026/events/`（`DiscoverTab`、`DiscoverFilters`、`EventSearch`、`EventDetail`、`RegisterFlow`、`PrepPage`、`VenueMode`、`AfterEvent`、`ThanksDraft`、`CancelRegistrationDialog`）；路由 `/app/events/[id]`、`/register`、`/app/register(/[code])`、`/app/events/[id]/{prep,live,after}`；未登录用 `PublicTopNav`（G14）。
- **新建（App）**：`src/screens/events/v2/`（`DiscoverTab`、`FilterSheet`、`EventSearch`、`EventDetail`、`RegisterFlow`、`PrepScreen`、`VenueMode/*`（10 个子视图）、`AfterEvent`）；路由 `app/events/[id].tsx`、`[id]/register`、`register(/[code])`、`[id]/prep`、`[id]/live`、`[id]/after`。
- **原生依赖**：App 设备端语音识别模块（`expo-speech-recognition` 或同类），权限文案 `NSSpeechRecognitionUsageDescription` / `NSMicrophoneUsageDescription`；重建开发包。
- **删除**：Web `events-0918/{event-detail,event-live,event-register-modal,modals}`（逐个确认调用方）；App `EventDetailScreen`、`EventRegistrationScreen`、`RegisterInviteScreen`、`Registration7a*`、`live/EventLiveScreen`；`attendees`、`participants/[participantId]`、`party`、`party/checkin`、`party/graph` 改跳新地址；允许清单行；`screen-ownership.md` 活动行全部「已处理」。
- **登记**：两端新路由（App `parentForPath` / 跳转表；Web 审计计数、`shellAppliesTo`：会场 Web 全屏不挂右栏）。
- **不做**：主办侧（R17，含 NFC 碰卡与受付 kiosk）；全局搜索面板本体（R30）；活动偏好设置（R18）；「📍 現在地から」（A3 推荐下一期）。

## 测试

- `event-feedback.test.ts`（内存 + Postgres）：幂等、四种理由的降权 / 过滤、同主办 3 次、他人隔离、示例模式拦写。
- `event-discover.test.ts`：三组划分；`scoreEvent` 排序与计划页同值；无计划 → 人气 + `popularityFallback`；筛选组合；外部私有活动不出现；興味なし生效。
- `event-search.test.ts`：三组、命中范围、私有活动隔离；R30 能直接调用的服务函数签名。
- `event-prep.test.ts`：会いたい人排序（会いやすい順 = 已认识 > 共通の知り合い > 同桌）；開口一番来自规则；清单两端同步；名刺余量不出现在请求里（只存本机）。
- 渲染（两端）：
  - 探す空 / 少 / 大、絞り込み、テーマ弹层、検索中；
  - 詳細 0 / 少 / 多与未登录；报名 ① ② ③ 与取消；
  - 会う準備；会場 ①–⑩；会後空 / 少 / 大与お礼下書き。
- 会场：未报名 → 提示 + 报名入口、零 403 请求；代签后状态刷新；交換申请 / 承認 / 無視 / 元に戻す；面談を提案只出草稿（D46）；ひとことメモ不上传音频（模块 mock 断言）。
- E3 / E4：输出 schema、修复、类型建议越出字典被丢弃、别名反向映射、未授权时规则退路（フォロー日顺延规则、🎯 取已关联类型、お礼只一封）且无「AI 下書き」字样。
- 通知：`event_deadline` / `event_prep` 触发条件、频控、幂等。
- 会後确定：只勾选行生效；建 To-do、写 `metEventId`、🎯 → `talked` 记分（同人同类型一次）；分数预览 = 服务端结果；お礼无发送入口（只复制 / 打开邮件 App）。
- 端到端：Web Playwright「探す → 詳細 → 报名 5 问 → 申込完了 → 会う準備 → 会場（交換 1）→ 会後確定」。
- 门禁：按下方像素 SC。

## 验收契约

| SC | 操作链 | 主证据 |
| --- | --- | --- |
| SC-R27-01 探す | コミュニティ / プランに効く（分数 + 依据 + ?）/ すべて日付順；无计划空态；絞り込み（時期 / 場所 / テーマ / 形式 / 無料 / プラン優先 / N件を表示）；検索三组 + 最近 + 找不到时贴 URL（进 R26 评估） | 服务 + 渲染 + 像素 P01–P05 |
| SC-R27-02 興味なし（契约 9） | 四种理由、幂等、降权 / 过滤按 DESIGN §9 #12 | `event-feedback` |
| SC-R27-03 搜索给 R30 | `event-search` 服务可被 R30 复用（函数签名 + 契约写进交接表 R30 节） | 测试 + 交接表 |
| SC-R27-04 詳細 | 吸顶评估（规则，无 AI）、页签、主办统计、参加者（只公开资料）、知り合い、报名入口 | 渲染 + 像素 P06 |
| SC-R27-05 未登录（**R26-08**，列表与详情） | 未登录可看活动**列表**（`?tab=discover` 的「すべて · 日付順」，数据来自公开目录，无分数 / コミュニティ / プランに効く）和**详情 / 报名入口**，都用公开顶栏（b1 样式、`PublicTopNav`）；評価 / 参加予定跳登录；评估吸顶换登录引导（B4 补画后门禁） | 渲染 + 像素 P07 |
| SC-R27-06 参加登録 / 参加コード（**R26-02**） | 5 问（现有 AI、不超过 5）→ 资料（カバー率、公開範囲生效）→ 申込完了 + 仮予定（确认后写）；`/register/<code>`；取消确认（`b3` #42）；`grep`：活动处无「招待コード」 | 服务 + 渲染 + 像素 P08–P10 |
| SC-R27-07 会う準備 | 倒计时、地图、名刺余量（本机）、会いたい人（なぜ / 話しかけ方 / これまで / コピー）、準備リスト同步、明日のフォロー（确认后写日历） | `event-prep` + 渲染 + 像素 P11 |
| SC-R27-08 会場（**R26-09 后半**） | チェックイン（QR / 名前）→ 現場 / おすすめ / 参加者 / グループ / マップ / アジェンダ / シート / 面談を提案（草稿，D46）/ 交換成功 toast + 元に戻す；ひとことメモ设备端转文字写 notes；未报名零 403；`/live` 不再把 `new Date()` 当 `now` 从服务端传入（时间相关状态服务端按请求时刻算好），开发模式无水合警告 | 渲染 + 网络记录 + 像素 P12–P13 |
| SC-R27-09 会後 | 今日会った人、AI まとめ下書き（现有）、次の一手 ✓/✕、确定 → To-do / 出会い / 计划记分（预览一致）、お礼只草稿「送信はしません」 | 服务 + 渲染 + 像素 P14–P15 |
| SC-R27-10 AI | E3（会後まとめ 3 条 + 次の一手逐人 + お礼下書き）、E4（自己紹介下書き）按 A6 授权实施：提示词升版本、schema 校验 + 修复 1 次、类型建议只从字典选、id 不出境、`promptVersion` 入账；未授权时走规则退路且界面不出现「AI 下書き」字样；A5 同意时两个现有调用进账本（迁移本机验证）；本机真实验证各 ≤5 次 | 服务测试 + REPORT |
| SC-R27-13 活动通知（**DESIGN §6.4 R13 行**） | `event_deadline`（截止 48 小时前，对已加入参加予定但未报名者）、`event_prep`（当天东京 8:00，对已报名者）按契约 6 写入、受 `dailyCap` 频控、幂等（同人同活动同类一次） | 服务测试 |
| SC-R27-11 旧屏 | 删除清单完成、允许清单只减不增、跳转路由到新地址、`screen-ownership.md` 活动行全部已处理 | 测试 + 点击验证 |
| SC-R27-12 交接表通用口径 | G01–G26 适用项逐条（G11 `phoneFold`、G13 旧全局样式、G14 公开页、G16 底栏转场、G24 `UiText`） | REPORT 逐条 |

### 像素 SC（README 通用规则 11）

归因文件 `repos/orbits/scripts/visual/attribution-redesign-R27.json`；画面清单 `views/web-R27.json`、`app-R27.json`。Web 1440 / 1024 / 390 × 浅 / 深截完整页面；App 模拟器浅 / 深。示例 fixture：CFO Night Tokyo vol.18（参加者 128、プランに合う 18、知り合い 3；会場 R2 B-4；会後 9 人、46 → 56），探す 28 件。Web 1024 / 390 都是「设计稿无」，待 §10 B5 补画认可后补进清单。

| SC | 画面 | 设计稿画板 | 端 / 宽度 | 到达方式 |
| --- | --- | --- | --- | --- |
| SC-R27-P01 | 探す · 空 | `b2` #6；`b2` #11 | App；Web 1440 | 无计划账号 `?tab=discover` |
| SC-R27-P02 | 探す · 少量 | `b2` #7；`b2` #12 | App；Web 1440 | fixture 少量 |
| SC-R27-P03 | 探す · 大量 | `b2` #8 | App（Web 大量即 #13 背景） | fixture 28 件 |
| SC-R27-P04 | 絞り込み / テーマ弹层 | `b2` #9；`b2` #13 | App；Web 1440 | 点「絞り込み」/「テーマ」 |
| SC-R27-P05 | 検索中 | `b2` #10 | App（Web 设计稿无） | 搜索框输入「CFO」 |
| SC-R27-P06 | 詳細 · 0 / 少 / 多 | `b2` #14 / #15 / #16（深 #43）；`b2` #17 / #18 / #19（深 #47） | App；Web 1440 | fixture 参加者 0 / 少 / 128 |
| SC-R27-P07 | 未登录詳細 | **设计稿无**（§10 B4） | Web 1440 / 390 | 登出后 `/app/events/<id>` |
| SC-R27-P08 | 参加登録 ① / ② / ③ | `b2` #20 / #21 / #22；`b2` #23 | App；Web 1440 | 详情「参加登録」→ 答到第 3 问 / 资料页 / 提交后 |
| SC-R27-P09 | 参加の取り消し | `b3` #42 | App | 申込完了页「取り消し」 |
| SC-R27-P10 | 参加コード落地 | **设计稿无**（同 R26 B6） | 两端 | `/register/<code>` |
| SC-R27-P16 | Web 会場 390 | **设计稿无**（DESIGN §10 A7，用户拍板后补画） | Web 390 | 手机宽度打开 `/app/events/<id>/live` |
| SC-R27-P11 | 会う準備 | `b2` #24；`b2` #25 | App；Web 1440 | `/app/events/<id>/prep`（fixture 开始前 3:12） |
| SC-R27-P12 | 会場 ①–⑩ | `b2` #26–#35（深 #44 / #45） | App | 签到后逐页签；⑧ 点清水行；⑨ シート内「面談を提案する」；⑩ 承認后 toast |
| SC-R27-P13 | Web 会場モード | `b2` #36 | Web 1440 | `/app/events/<id>/live` |
| SC-R27-P14 | 会後 · 空 / 少 / 多（App） | `b2` #37 / #38 / #39（深 #46） | App | fixture 0 / 少 / 9 人 |
| SC-R27-P15 | 会後 · 空 / 少 / 多（Web） | `b2` #40 / #41 / #42（深 #48） | Web 1440 | 同上；#42 右侧お礼下書き展开 |

注：`b2` #34 面談を提案与 D46 冲突（§10 B3），按重画后的画板验收；重画前此画面暂缓。

### 画板预检（HOW-TO 第 8 节；`board-preflight.mjs` 2026-10-14 实跑，开工时对 `views/*-R27.json` 重跑并更新本表）

**五项总结论**：
- ① 自洽：全部通过。
- ② 数据来源：逐块结论见下表。🎤 是活动 emoji；🎯 chip 是依据文本；📍 现在地按 A3 推荐去掉；🎙️ / 音声走设备端转文字；`b2` #34 文案按 B3 重画。
- ③ token：按 DESIGN §10 C1–C11 先补；会後大数字 52 / 60、详情 36 是新字号 token（C8）。
- ④ 组件：BottomSheet（絞り込み、参加者シート、面談を提案）的已知差见 G23；Web 会場全屏不挂壳右栏；toast 用 kit `Toast`（G23：点按先关再回调）。
- ⑤ fixture：照画板造（見出し人数、テーブル、ラウンド、残り 18分 等）。中途状态：
  - 検索中：输入「CFO」；
  - 弹层：用点击步骤到达；
  - toast：点「承認して交換」后立即截图；
  - 会う準備倒计时：fixture 固定当前时间。

| 画板 | ① 自洽 | ② 疑似无功能元素 → 结论 | ③ token（近似 / 缺，摘要） |
| --- | --- | --- | --- |
| b2-events-flow #6 探す新用户空状态 | ✓ | 依据文本（`reason` / `meetCandidates`）；搜索 → `event-search` / 参加者筛选；🎤=活动 emoji（`event-emoji.ts`），非语音 | 近似：行高 1.1；缺：字距 0.01, 阴影；间距刻度外 8 项 → C1–C11 |
| b2-events-flow #7 探す少量数据 | ✓ | 搜索 → `event-search` / 参加者筛选 | 近似：行高 1.1；缺：字距 0.01, 阴影；间距刻度外 9 项 → C1–C11 |
| b2-events-flow #8 探す大量数据 | ✓ | 依据文本（`reason` / `meetCandidates`）；搜索 → `event-search` / 参加者筛选；🎤=活动 emoji（`event-emoji.ts`），非语音 | 近似：行高 1.1；缺：字距 0.01, 阴影；间距刻度外 10 项 → C1–C11 |
| b2-events-flow #9 探す · 絞り込み弹层 | ✓ | §10 A3（去掉 / 下一期）；依据文本（`reason` / `meetCandidates`）；搜索 → `event-search` / 参加者筛选；日期选择 → discover `period`；🎤=活动 emoji（`event-emoji.ts`），非语音 | 近似：行高 1.1；缺：字距 0.01, 阴影；间距刻度外 11 项 → C1–C11 |
| b2-events-flow #10 探す · 検索输入中 | ✓ | 输入 → 对应契约字段 | 近似：行高 1.1；缺：阴影；间距刻度外 7 项 → C1–C11 |
| b2-events-flow #11 Web 探す新用户空状态 | ✓ | 依据文本（`reason` / `meetCandidates`）；搜索 → `event-search` / 参加者筛选；🎤=活动 emoji（`event-emoji.ts`），非语音 | 近似：行高 1.1；缺：行高 1.7, 阴影；间距刻度外 10 项 → C1–C11 |
| b2-events-flow #12 Web 探す少量数据 | ✓ | 依据文本（`reason` / `meetCandidates`）；搜索 → `event-search` / 参加者筛选 | 近似：行高 1.1；缺：字号 34, 字距 -0.02, 阴影；间距刻度外 9 项 → C1–C11 |
| b2-events-flow #13 Web 探す · テーマ弹出层大量数据 | ✓ | 依据文本（`reason` / `meetCandidates`）；搜索 → `event-search` / 参加者筛选；🎤=活动 emoji（`event-emoji.ts`），非语音 | 近似：行高 1, 行高 1.1；缺：字号 34, 字距 -0.02, 阴影；间距刻度外 10 项 → C1–C11 |
| b2-events-flow #14 イベント詳細 · 参加者 0新用户空状态 | ✓ | 🎤=活动 emoji（`event-emoji.ts`），非语音 | 近似：字号 10.83, 行高 1.1；缺：行高 1.75；间距刻度外 6 项 → C1–C11 |
| b2-events-flow #15 イベント詳細 · 参加者 少少量数据 | ✓ | 无 | 近似：字号 10.83, 行高 1.1；缺：行高 1.75；间距刻度外 6 项 → C1–C11 |
| b2-events-flow #16 イベント詳細 · 参加者 多大量数据 | ✓ | 无 | 近似：字号 10.83, 行高 1.1；缺：阴影；间距刻度外 7 项 → C1–C11 |
| b2-events-flow #17 Web イベント詳細新用户空状态 | ✓ | 无 | 近似：字号 10.83, 行高 1.1；缺：字号 36, 字距 -0.02, 行高 1.2, 行高 1.8；间距刻度外 9 项 → C1–C11 |
| b2-events-flow #18 Web イベント詳細少量数据 | ✓ | 无 | 近似：字号 10.83, 行高 1.1；缺：字号 36, 字距 -0.02, 行高 1.2, 行高 1.8；间距刻度外 9 项 → C1–C11 |
| b2-events-flow #19 Web イベント詳細大量数据 | ✓ | 无 | 近似：字号 10.83, 行高 1.1；缺：字号 36, 字距 -0.02, 行高 1.2, 行高 1.8；间距刻度外 9 项 → C1–C11 |
| b2-events-flow #20 ① 質問に答える | ✓ | 见 DESIGN；输入 → 对应契约字段 | 近似：无；缺：圆角 26, 字距 0.01, 行高 1.6；间距刻度外 7 项 → C1–C11 |
| b2-events-flow #21 ② 参加用プロフィール | ✓ | 见 DESIGN | 近似：行高 1.1；缺：字距 0.01, 行高 1.75；间距刻度外 7 项 → C1–C11 |
| b2-events-flow #22 ③ 申込完了 · 審査中 | ✓ | 见 DESIGN | 近似：无；缺：字距 0.01；间距刻度外 4 项 → C1–C11 |
| b2-events-flow #23 Web 参加登録 | ✓ | 见 DESIGN；输入 → 对应契约字段 | 近似：行高 1.1；缺：行高 1.6, 阴影；间距刻度外 10 项 → C1–C11 |
| b2-events-flow #24 会う準備 | ✓ | 无 | 近似：无；缺：字距 -0.02, 字距 0.01, 行高 1.6；间距刻度外 7 项 → C1–C11 |
| b2-events-flow #25 Web 会う準備 | ✓ | 无 | 近似：行高 1.1；缺：字距 -0.02, 行高 1.6；间距刻度外 8 项 → C1–C11 |
| b2-events-flow #26 ① 受付 | ✓ | 无 | 近似：无；缺：字距 0.01, 阴影；间距刻度外 7 项 → C1–C11 |
| b2-events-flow #27 ② 現場ホーム | ✓ | 无 | 近似：行高 1.55；缺：字距 -0.01, 字距 -0.02, 字距 0.01；间距刻度外 7 项 → C1–C11 |
| b2-events-flow #28 ③ おすすめ | ✓ | 无 | 近似：无；缺：字距 0.01, 行高 1.6；间距刻度外 8 项 → C1–C11 |
| b2-events-flow #29 ④ 参加者一覧 | ✓ | 搜索 → `event-search` / 参加者筛选 | 近似：无；缺：字距 0.01, 阴影；间距刻度外 8 项 → C1–C11 |
| b2-events-flow #30 ⑤ グループ | ✓ | 无 | 近似：无；缺：字号 34, 字距 -0.02, 字距 0.01；间距刻度外 7 项 → C1–C11 |
| b2-events-flow #31 ⑥ 関係マップ | ✓ | 无 | 近似：无；缺：字距 0.01, 阴影；间距刻度外 7 项 → C1–C11 |
| b2-events-flow #32 ⑦ アジェンダ | ✓ | 无 | 近似：无；缺：字距 0.01, 阴影；间距刻度外 5 项 → C1–C11 |
| b2-events-flow #33 ⑧ 参加者シート弹层 | ✓ | 一言メモ → notes；依据文本（`reason` / `meetCandidates`）；搜索 → `event-search` / 参加者筛选；设备端语音转文字（DESIGN §9 #18） | 近似：无；缺：字距 0.01, 阴影；间距刻度外 8 项 → C1–C11 |
| b2-events-flow #34 ⑨ 面談を提案弹层 | ✓ | 搜索 → `event-search` / 参加者筛选；见 DESIGN | 近似：无；缺：字距 0.01, 阴影；间距刻度外 8 项 → C1–C11 |
| b2-events-flow #35 ⑩ 交換成功轻提示 | ✓ | 无 | 近似：行高 1.3, 行高 1.55；缺：字距 -0.01, 字距 -0.02, 字距 0.01；间距刻度外 8 项 → C1–C11 |
| b2-events-flow #36 Web 会場モード | ✓ | 一言メモ → notes | 近似：行高 1.55；缺：字号 52, 字距 -0.02, 行高 1.2, 阴影；间距刻度外 12 项 → C1–C11 |
| b2-events-flow #37 会後新用户空状态 | ✓ | 设备端语音转文字（DESIGN §9 #18） | 近似：无；缺：字距 -0.02, 字距 0.01；间距刻度外 4 项 → C1–C11 |
| b2-events-flow #38 会後少量数据 | ✓ | 无 | 近似：无；缺：字号 36, 字号 52, 字距 -0.01, 字距 -0.02, 字距 0.01, 行高 1.2；间距刻度外 9 项 → C1–C11 |
| b2-events-flow #39 会後大量数据 | ✓ | 无 | 近似：无；缺：字号 36, 字号 52, 字距 -0.01, 字距 -0.02, 字距 0.01, 行高 1.2；间距刻度外 9 项 → C1–C11 |
| b2-events-flow #40 Web 会後新用户空状态 | ✓ | 设备端语音转文字（DESIGN §9 #18） | 近似：无；缺：行高 1.7；间距刻度外 8 项 → C1–C11 |
| b2-events-flow #41 Web 会後少量数据 | ✓ | 无 | 近似：无；缺：字号 36, 字号 60, 字距 -0.01, 字距 -0.02, 行高 1.2, 行高 1.8；间距刻度外 9 项 → C1–C11 |
| b2-events-flow #42 Web 会後大量数据 | ✓ | 无 | 近似：无；缺：字号 36, 字号 60, 字距 -0.01, 字距 -0.02, 行高 1.2, 行高 1.8；间距刻度外 9 项 → C1–C11 |
| b2-events-flow #43 イベント詳細大量数据 | ✓ | 无 | 近似：字号 10.83, 行高 1.1；缺：阴影；间距刻度外 7 项 → C1–C11 |
| b2-events-flow #44 会場ホーム | ✓ | 无 | 近似：行高 1.55；缺：字距 -0.01, 字距 -0.02, 字距 0.01；间距刻度外 7 项 → C1–C11 |
| b2-events-flow #45 参加者シート弹层 | ✓ | 一言メモ → notes；依据文本（`reason` / `meetCandidates`）；搜索 → `event-search` / 参加者筛选；设备端语音转文字（DESIGN §9 #18） | 近似：无；缺：字距 0.01, 阴影；间距刻度外 8 项 → C1–C11 |
| b2-events-flow #46 会後大量数据 | ✓ | 无 | 近似：无；缺：字号 36, 字号 52, 字距 -0.01, 字距 -0.02, 字距 0.01, 行高 1.2；间距刻度外 9 项 → C1–C11 |
| b2-events-flow #47 Web イベント詳細大量数据 | ✓ | 无 | 近似：字号 10.83, 行高 1.1；缺：字号 36, 字距 -0.02, 行高 1.2, 行高 1.8；间距刻度外 9 项 → C1–C11 |
| b2-events-flow #48 Web 会後大量数据 | ✓ | 无 | 近似：无；缺：字号 36, 字号 60, 字距 -0.01, 字距 -0.02, 行高 1.2, 行高 1.8；间距刻度外 9 项 → C1–C11 |
| b3-daily-actions #42 確認：参加の取り消し | ✓ | 无 | 近似：无；缺：字距 0.01, 阴影；间距刻度外 9 项 → C1–C11 |

### 必需证据子表

| SC | 子断言 | 证据 |
| --- | --- | --- |
| 08 | 未报名打开会场：网络面板 0 个 403 | `read_network_requests` 记录 |
| 09 | 确定前后：To-do 数、联系人 `metEventId`、计划分数（服务端）与画面预览 | REPORT 表 |
| P01–P15 | 门禁总表，证据目录 `~/orbit-sprint-evidence/redesign/R27/run-01/` | REPORT |
| 全部 | 三语、`copy:qa` 0；两端全量零新增失败；`tsc`、`typecheck:app`、`lint`；`detect-changes` | 全量清单 |

## 执行顺序

1. 索引、impact；契约提交（9 live、discover / search / prep）。
2. 服务：feedback → discover → search → prep（RED 先行）。
3. 两端探す → 詳細（含未登录）→ 报名 / 参加コード / 取消（边写边比）。
4. 会う準備 → 会場（App 原生依赖与开发包重建）→ 会後。
5. 删旧屏、跳转路由、登记；（A5）账本迁移。
6. 全量、REPORT、`detect-changes`、提交推送；独立复核 → 修复 → 模拟器走查（会场在模拟器上用两个账号）。

## 失败与交接

- 设备端语音模块构建失败：一言メモ只留文字输入，按钮隐藏；REPORT 写明，下次能构建再加。
- A2 不同意：コミュニティ行与「フォロー」不做，并按用户决定改画板；A3 同意做时另开任务。
- 交接给 R30：`event-search` 服务与契约（写进交接表 R30 节）。
- 交接给 R13：`event_deadline` / `event_prep` 由 R27 写入（SC-R27-13），fixture 同步给乙。
- 交接给 R17：会场参加者端读到的运营数据形状、代签后参加者端刷新方式；NFC 碰卡仍归 R17。
- 交接给 R20：会後 To-do、ひとことメモ（`notes` + `eventId`）的写法。

# Sprint R17 — 主催：从建活动到会后

**Plan revision:** 2（rev 2 按 `host/REVIEW.md` S1–S3、M1–M10、m1–m10 修订）。**模式:** existing-codebase / single-generator（执行人：小雨（甲））。**档位:** H。

**单一目标:** 两端重写主办方动线，并补齐服务端缺口（DESIGN §1.1 第 2–12 条）：
- 活动写入（三表同事务）、参加コード与短链 alias、回填保护、发布时自动建 event-ops 缺省配置；
- 审核加「待ち」与对候补的决定；签到加撤销与当日枠；受付番号（在 admitted 事务里）；QR v2；
- 编组条件（规则后处理）与人工调整层；
- 定型通知 outbox + 事务邮件模块（非生产强制重定向）；
- `manager` 角色与安全的共同运营邀请；一人多份的主办方资料与公开页；
- 报告聚合（<5 + 差分保护）；host 活动绕过试点白名单；
- 迁移 `host-core`；删除两端旧运营界面。

**易读目标:** [GOAL.md](GOAL.md)。**整体设计:** [host/DESIGN.md](../host/DESIGN.md)（v2）。

**基线:** 开工时的 `redesign` HEAD。

**进入条件:**
- DESIGN 已复核并按复核改完（[REVIEW](../host/REVIEW.md)）；
- §10 A1–A13 有答复，没答复的部分按「失败与交接」的缺省做法先做；
- C 组 token 在第一天补齐；
- 种子空账号 `qa-host-empty@orbit.test` 在第一天建好；
- B 组补画到之前，对应画面按规则 11 暂缓。

**分支:** 一人做，直接在 `redesign` 上提交。

## 已查清的事实（`d429939c5`，开工时用 GitNexus 复核）

见 DESIGN §1.1，共 14 条。施工时最容易踩的几条：
- by-code 已走 `event_aliases`；`public_code` / `ends_at` 两列已存在；回填会覆盖码和生命周期。
- 决定只有 approve / reject，且只接受 `pending_review`；签到要 `rsvped`，还要 event-ops 配置存在。
- 编组没有调整、也没有条件字段。
- 一人一角色。
- 生产有试点白名单。
- 没有通用邮件模块，收件箱也没有 `system` 来源。

## 上下文包

### 必读
- DESIGN v2 全文；REVIEW 处理记录；交接表「R17 主催」（R17-01～05）、R18-01、通用口径 G01–G26；决定表 §34–§37；R27 REPORT §6–§7。
- 设计稿：`b6` #0–24、#44、#45；`web.html` #20；`b7` #33–39；`b5` #14–16 / #18–20；B 组补画（到了再加）。一律 `--extract-board` 单块抽取。

### 关键符号与 impact（开工时重跑，结果写 REPORT）
- `decideApplication`：只加 `waitlist` 分支和「对候补的决定」，不改现有 approve / reject。
- `projectCanonicalMembership`：在同一事务里加 outbox 写入与番号分配。HIGH 时的对策：只追加语句，测试覆盖三条进入路径。
- `checkInParticipant`：不改；新增 `undoCheckIn`、`admitOnSite`、`scan` 三个入口。
- `publishGeneration`：不改；发布前的合成（产物 + 后处理 + overrides）放在调用方。
- `resolveCanonicalEventAlias`：不改，只新增 alias 类型 `public_slug`。
- 回填 upsert：只加「跳过 host」条件。
- `eventPilotDecision`：只加「host 活动放行」分支。
- `venue-core` 的 `qrPayload`：改为 v2。
- `organizerKeyFor`、公开页 view model：改读 `organizer_profiles`。
- `shellAppliesTo`、`orbit-ask-routes.ts:38` `EXCLUDED_SEGMENTS`：`admission` 移出排除名单（成为壳内页签），只留 `check-in`；G14 说明同步更新。

### 易错边界（全部写进 SC）
- **发布**：三表不同步；没写 alias，导致 by-code 查不到；回填重跑洗掉码；没建缺省配置，导致签不了到；生产白名单挡住发布。
- **中止 / 变更**：非 owner 能中止；通知重复或漏发；中止后码仍有效（alias 未删）。
- **审核**：
  - 递补和先着順的人收不到通知、拿不到番号；
  - 对候补的决定越过定员；
  - 批量部分失败被当成全部成功；
  - 409 没有就地提示；
  - 理由泄露给对方。
- **受付**：
  - QR 旧明文仍可用；过期或跨活动的令牌被接受；
  - 撤销超过 30 分钟仍可撤；撤销后计分没回退；
  - 当日枠超定员没有确认；没有 `walk_in` 权限的角色也能当日受付；
  - 离线重复补发；缓存超过 TTL 未清；非受付设备缓存了名单；两台同时签同一人。
- **编组**：
  - 第 4 次「新生成」被允许；把 retry 计成一次生成；
  - overrides 版本冲突；
  - 公开后还能改；规则后处理改了冻结产物。
- **共同运营**：
  - 转发的链接被别人接受；短码可被枚举；
  - 界面反馈暴露邮箱是否注册；
  - owner 被移除；
  - manager 没有审核能力；
  - 受付能看到申込回答；
  - 改角色没写理由。
- **通知**：
  - 非生产发出了真实邮件；发给非用户地址；发 CSV 名单；
  - 「ひとこと」带链接或超长；
  - 违反通知设置；幂等失效。
- **报告**：<5 露数；差分反推出被抑制的数；自分の視点读到别人；中心 KPI 没做抑制；交换口径不是「双方确认」。
- **公开页**：
  - 别的资料下的活动出现在这一页；
  - 列出草稿或已中止的活动；
  - 旧链接 404；未登录点关注没进登录。
- **其他**：主办侧误用规则 A；参加者侧绕过规则 A；示例模式写库或发邮件；App 出现了画板没有的建活动表单。

## 契约（第一天提交，`contract:` 开头，「App 需要同步」）

DESIGN §4，全部只加：`host-events`、admission `waitlist`、operations（scan / undo / admit-on-site / heartbeat / roundCount / constraints / overrides）、`host-notices`、`host-cohosts`、`organizer-profile`、event-access（`manager` / `event.edit` / `event.cancel` / `check_in.walk_in`）、契约 6 `event_host_notice`（**App 先改宽进**，G19）、`event-venue` QR v2、分析三块 + `suppressedBelow`。另外：主办侧 mock；设计稿示例 fixture（六场活动 + 两份资料）；`demo-world-consistency` 通过。

| 接口 | 说明 |
| --- | --- |
| `POST /api/host/events`、`PATCH …/[id]` | 建 / 改（`event.edit`：owner、manager）；改日時 / 会場时返回 `notifyPreview` |
| `POST …/[id]/publish` | 三表同事务 + alias（`public_code`、`public_slug`）+ event-ops 缺省配置 + `created_by='host'`；幂等 |
| `POST …/[id]/cancel` | 仅 owner（`event.cancel`）；删 alias；outbox 写中止通知 |
| `POST …/[id]/code/reissue` | 删旧 alias、加新 alias |
| 现有 `admission/reviews/[actorId]/decision` | 枚举加 `waitlist`；允许对 waitlisted 的人做决定 |
| `POST …/admin/check-ins/scan`、`…/[participantId]/undo`、`…/admit-on-site`、`…/kiosk-heartbeat` | 受付 |
| `GET/PUT …/generations/[gid]/overrides`（带版本）；配置加 `roundCount`、`constraints` | 编组 |
| `POST /api/host/events/[id]/notices/preview`、`/send` | 中止 / 变更 / 资料未完成提醒（发前确认） |
| `POST /api/host/events/[id]/cohost-invites`、`GET`、`DELETE …/[id]`；`POST /api/host/cohost-invites/[code]/accept` | 共同运营（令牌单次、绑定被邀请人、短码限流） |
| `GET/POST/PUT /api/host/organizer-profiles`；公开 `GET /api/organizers/by-slug/[slug]` | 主办方资料 |
| 现有 `analytics/aggregate`、`/api/events/center` | 只加聚合与抑制 |
| `GET /e/[slug]`、`/o/[slug]`（公开页面） | 302 / 公开页 |

## 迁移

- `host-core`（DESIGN §3.1）：全部 `if not exists`。本机验证正向迁移与重放；生产不执行（README「合回前总验收」已登记，执行前只读预检）。
- （A6 同意时）`ai-usage-event-matching`。

## 范围与文件

- **新建（服务端）**：
  - `features/events/host/`（生命周期、alias、缺省配置、番号、QR、心跳、undo、walk-in）；
  - `features/events/host-notices/`（outbox、worker、模板）；
  - `features/mail/transactional/`（重定向守卫）；
  - `features/events/cohosts/`；`features/organizers/profile/`；
  - `features/events/event-operations/overrides`（调整层与合成）；
  - 路由 `app/api/host/**`、`/api/organizers/by-slug`、`…/check-ins/{scan,[id]/undo,[id]/admit-on-site}`、`…/kiosk-heartbeat`；
  - 公开页面 `/o/[slug]`、`/e/[slug]`；
  - `shared/compute/{host-todo,reception-number,checkin-token,participation-code,table-constraints,question-suggest,small-cell}.ts`。
- **改（服务端）**：
  - `decideApplication`（waitlist）、`projectCanonicalMembership`（outbox + 番号）；
  - `venue-core.ts`（QR v2、番号）；回填（跳过 host）；`eventPilotDecision`（host 放行）；
  - event-access 角色与能力；`event-analytics`（三块 + 抑制）；
  - `journey/live-mapping.ts`（平均参加 = 受付均值；立場比率按 A11）；
  - `listAccessibleEvents`（摘要）；`POST generations`（新生成计数）。
- **新建（Web）**：`app/(app)/app/orbit-2026/host/`：
  - `HostCenter`、`HostEventForm`、`HostConsole`（6 页签）、`MatchingBoard`（overrides 拖动）、`PeopleTable`（多选、批量逐条）；
  - `SetupForm`（问题拖动、预览、お知らせの文面）、`ReportPanels`、`CohostDrawer`、`NoticeConfirm`、`ProfileList` / `ProfileEditor`、`JoinLanding`；
  - `KioskPage`（不挂壳、`BarcodeDetector` + `@zxing/browser`、IndexedDB 队列、TTL）；
  - `OrganizerPublicPage`。
- **新建（App）**：`src/screens/host/`：
  - `HostCenter`、`HostConsole`（段 概要 / マッチング / 参加者 / 受付 / レポート）、`MatchingResult`（只读）、`ReviewList`、`ReportSummary`；
  - `CheckIn`（`expo-camera`、`expo-sqlite` 队列）、`JoinLanding`、`OrganizerPublic`；
  - `HostEventsRow`（交 R18）。
- **删除**：
  - Web `ops-0918/*`（逐个确认调用方）、旧公开页；
  - App 主办旧屏与 `OrganizerPublicScreen`；
  - 允许清单行；旧路由跳转；`screen-ownership.md` 三行改「已处理」。
- **不做**：NFC（A5）；收款（A1）；App 建活动 / 申込設定 / 报告详情；マイページ入口本身（R18）；运营后台（R29）。

## 测试

- `host-lifecycle.test.ts`（内存 + Postgres）：
  - 建 → 改 → 发布（三表一致、两个 alias、缺省配置、幂等）→ by-code 命中 → 改日時（通知预览）→ 中止（仅 owner、alias 删除、outbox 一条）→ 归档；
  - 回填重跑不覆盖 host 活动；
  - 草稿对参加者不可见；
  - 生产模式下 host 活动不受白名单限制，总开关仍能停用。
- `participation-code.test.ts`：R15 字母表、新码规范化、旧码与 mock 码（`CFO18NGT`）原样可用、再发行后旧码失效。
- `admission-waitlist.test.ts`：`waitlist` 决定、对候补的批准（有名额才 admitted）与婉拒、定员边界、批量部分失败、409。
- `admission-outbox.test.ts`：三条进入路径（先着順、批准、递补）都写 outbox 并分配番号；同事务回滚则两者都不写；worker 幂等。
- `reception-number.test.ts`：顺序、不回收、超 999 换字母、并发不重号。
- `checkin-v2.test.ts`：
  - scan：有效 / 过期 / 跨活动 / 旧明文；
  - undo：30 分钟内可撤、超时不可撤、撤销后计分回退；
  - admit-on-site：权限、超定员确认、`over_capacity`；
  - 未配编组的新活动也能签到。
- `kiosk-offline.test.ts`：队列幂等补发、TTL 清缓存、非受付设备不缓存、两台同时签到只记一次。
- `matching-overrides.test.ts`：新生成 ≤3、retry 不计、overrides 版本冲突、合成后发布冻结、公开后不可改、规则后处理三条（同社、前回同席、投資家）。
- `cohost-invites.test.ts`：
  - 令牌单次；
  - 绑定被邀请人（转发后被别人接受 → 拒绝）；
  - 短码限流与锁定；
  - 注册与否的反馈一致；
  - `manager` = operations ∪ reviewer；owner 不可移除；改角色必须写理由。
- `host-notices.test.ts`：
  - 模板渲染、收件箱 + 邮件只发给有账号者；
  - **非生产强制重定向**；尊重通知设置；
  - 「ひとこと」≤140 字、不能带链接；
  - 资料未完成提醒每场 ≤2 次；示例模式不发。
- `host-analytics.test.ts`：三块聚合、<5 抑制、差分保护、交换只计双方确认、中心 KPI 抑制、自分の視点只读本人、平均参加 = 受付均值。
- `organizer-profile.test.ts`：一人多份、slug 唯一、页面只列本资料下 published / 已结束的活动、旧链接 302、未登录关注进登录。
- 渲染（两端）：各画面三态；kiosk 三态；App 五段。
- 端到端：Web Playwright「建活动 → 申込設定 → 公開 → 另一账号用参加コード报名 → 待ち → 批准 → 收件箱通知 → 生成 → 拖动 → 公開 → kiosk 扫码 → 撤销 → 再签 → 番号出现在参加者会场」。

## 验收契约

| SC | 操作链 | 主证据 |
| --- | --- | --- |
| SC-R17-01 運営センター | 三态；KPI（抑制）、対応、次にやること；App 空 / 大 + PC 链接（自己的收件箱）+ 三格去向 | 服务 + 渲染 + 像素 |
| SC-R17-02 建活动与发布 | 三表同事务、alias、缺省配置、短链、回填保护、编辑通知、owner 中止、归档 | `host-lifecycle` + 端到端 |
| SC-R17-03 概要 | 三格、推移、进度、要対応 + 定型通知确认；App 五段（含 レポート摘要） | 渲染 + 像素 |
| SC-R17-04 マッチング | 条件（规则后处理 + `roundCount`）→ 新生成 ≤3 → overrides 拖动 → 合成 → 公開确认 → 参加者可见；不改提示词 | `matching-overrides` + 像素 |
| SC-R17-05 参加者 / 审核 | 四段、待ち、对候补的决定、批量逐条、409 就地提示、三条进入路径都发通知 + 分配番号 | `admission-*` + 像素 |
| SC-R17-06 受付 | QR v2、名前検索、撤销、当日枠、番号、心跳、离线（TTL）；代签计分照旧（R26-04） | `checkin-v2` + `kiosk-offline` + 像素 |
| SC-R17-07 申込設定 | 説明文、模板、質問案（规则）、问题、定員（不低于已批准）、締切、方式、预览、下書き / 公開；お知らせの文面（A10） | 服务 + 像素 |
| SC-R17-08 レポート | 三块聚合、交换口径、<5 + 差分保护；自分の視点 | `host-analytics` + 像素 |
| SC-R17-09 共同運営者 | `manager` 角色、邀请安全（令牌 / 绑定 / 限流 / 一致反馈）、理由与履历、owner 保护；共同運営に参加 | `cohost-invites` + 像素 |
| SC-R17-10 公开主办方页（**R17-02**） | 照 b1 A1 / A2 公开顶栏；一人多份资料；数字口径；关注；旧链接 302；通報 | `organizer-profile` + 像素 |
| SC-R17-11 危险色与字典（**R17-01**） | 中止 / 移除共同运营者 / 撤销签到等危险文字用 `--coral-text`（D02 D08）；Step 完成卡沿用字典文案（D50，主办侧有计划卡时）；NFC「つながりを取り消す」随 A5 下一期 | 代码检查 + 像素 |
| SC-R17-12 主办入口（**R17-03 / R17-04 / R18-01**） | Web 左栏不变；`HostEventsRow` + `center?summary=1` 交 R18；旧マイページ链接由 R18 删除；App 入口暂缺（交接表 + DEFERRED-A） | 交接表 + 组件展示页 |
| SC-R17-13 与 R27 对接 | alias 让 by-code 命中；番号与 QR v2 在会場页显示；主催卡口径（A11）；规则 A 的边界 | 服务 + R27 回归 |
| SC-R17-14 定型通知 | outbox、邮件模块非生产重定向、只发有账号者、通知设置、频控 | `host-notices` |
| SC-R17-15 补画待办（**R17-05**） | B1–B12 补画认可后把对应画面加进 `views/*-R17.json` 并通过 | 门禁总表 |
| SC-R17-16 旧屏 | 删除清单、允许清单只减不增、旧路由跳转、`admission` 出排除名单 / G14 说明、`screen-ownership.md` 已处理 | 测试 + 点击验证 |
| SC-R17-17 通用口径 | G01–G26 逐条（G05 / G07、G10、G13、G14、G15–G17、G18、G19、G21、G24、G26） | REPORT 逐条 |

### 像素 SC（README 通用规则 11；决定表 §20 / §23）

- 归因文件：`repos/orbits/scripts/visual/attribution-redesign-R17.json`；画面清单：`views/web-R17.json`、`app-R17.json`。
- **每行一个画面**，浅 / 深各一张：Web 1440 截完整页面（含壳）；kiosk 1180（A8）；App 是模拟器（§20：超阈值带全部归因即通过）。
- Web 1024 / 390 与 App 缺的画面都是「设计稿无」，B3 / B4 补画认可后各加一行（SC-R17-15）。

| SC | 画面 | 画板 | 宽度 / 主题 | 到达方式 |
| --- | --- | --- | --- | --- |
| P01 | 運営センター · 空（Web） | `b6` #0 | 1440 · 浅 / 深 | `qa-host-empty@orbit.test` → `/app/events/center` |
| P02 | 運営センター · 少（Web） | `b6` #1 | 1440 · 浅 / 深 | fixture：ラウンドテーブル一场 |
| P03 | 運営センター · 大（Web） | `b6` #2（深 #44） | 1440 · 浅 / 深 | fixture：六场 |
| P04 | 運営センター · 空（App） | `b6` #21 | App · 浅 / 深 | 空账号深链 `events/center` |
| P05 | 運営センター · 大（App） | `b6` #22 | App · 浅 / 深 | fixture 六场 |
| P06 | 概要（Web） | `web.html` #20 | 1440 · 浅 / 深 | `/app/events/<cfo18>/operations` |
| P07 | 概要（App） | `b6` #23 | App · 浅 / 深 | 深链 `events/<cfo18>/operations` |
| P08 | マッチング · 空 | `b6` #3 | 1440 · 浅 / 深 | 朝会 #3 `?tab=matching` |
| P09 | マッチング · 少 | `b6` #4 | 1440 · 浅 / 深 | ラウンドテーブル（fixture 产物） |
| P10 | マッチング · 大 | `b6` #5 | 1440 · 浅 / 深 | CFO18（未配置 3名） |
| P11 | マッチング · 公開確認 | `b6` #6 | 1440 · 浅 / 深 | 点「公開する」 |
| P12 | 参加者 · 空 | `b6` #7 | 1440 · 浅 / 深 | 朝会 #3 无申込时 `?tab=people` |
| P13 | 参加者 · 少 | `b6` #8 | 1440 · 浅 / 深 | ラウンドテーブル |
| P14 | 参加者 · 大（勾前两行） | `b6` #9 | 1440 · 浅 / 深 | CFO18，勾森田 / 青木 |
| P15 | kiosk · 空 | `b6` #10 | 1180 · 浅 / 深 | CFO18，fixture 时刻 18:46 |
| P16 | kiosk · 大 | `b6` #11（深 #45） | 1180 · 浅 / 深 | 搜索「もり」 |
| P17 | kiosk · 离线 | `b6` #12 | 1180 · 浅 / 深 | 浏览器离线后受付 3 人 |
| P18 | 受付（App，含错误行） | `b6` #24 | App · 浅 / 深 | 模拟器断网后受付；fixture 一行失败 |
| P19 | 申込設定 · 空 | `b6` #13 | 1440 · 浅 / 深 | 朝会 #3（未公开） |
| P20 | 申込設定 · 少 | `b6` #14 | 1440 · 浅 / 深 | CFO18 草稿 2 问 |
| P21 | 申込設定 · 大 | `b6` #15 | 1440 · 浅 / 深 | CFO18 公开中 5 问 + 未公開の変更 2 |
| P22 | レポート · 开催前 | `b6` #16 | 1440 · 浅 / 深 | 朝会 #3 `?tab=report` |
| P23 | レポート · 少 | `b6` #17 | 1440 · 浅 / 深 | Founders Lunch #11 |
| P24 | レポート · 全体 | `b6` #18 | 1440 · 浅 / 深 | vol.17 |
| P25 | レポート · 自分の視点 | `b6` #19 | 1440 · 浅 / 深 | vol.17 切「自分の視点」 |
| P26 | 共同運営者抽屉 | `b6` #20 | 1440 · 浅 / 深 | `?drawer=cohosts` |
| P27 | 公开页 · 空（Web） | `b7` #33 | 1440 · 浅 / 深 | 登出，`/o/<空资料>` |
| P28 | 公开页 · 少（Web） | `b7` #34 | 1440 · 浅 / 深 | `/o/cfo-night`（fixture 2 场；数字按 B9 改后的画板） |
| P29 | 公开页 · 大（Web） | `b7` #35 | 1440 · 浅 / 深 | fixture 18 场 |
| P30 | 公开页 · 空（手机） | `b7` #36 | 390 · 浅 / 深 | 同 P27 手机宽 |
| P31 | 公开页 · 少（手机） | `b7` #37 | 390 · 浅 / 深 | 同 P28 |
| P32 | 公开页 · 大（手机） | `b7` #38 | 390 · 浅 / 深 | 同 P29 |
| P33 | フォロー · 未ログイン | `b7` #39 | 390 · 浅 / 深 | 未登录点「フォローする」 |

**补画（决定表 §38，design-decisions 2026-10-16，1fd7313fa / cd29d233a）**：`b12` 末尾 #396–#475，每块浅 / 深两框（深 = 序号 +1）。**用户过目认可后才进门禁**；在那之前按规则 11 暂缓（SC-R17-15）。B7（b7 #36–38 URL）与 B9（b7 #34 数字口径）改的是原画板，P28 / P30–P32 直接按改后的画板比。

| SC | 画面 | 画板（b12） | 宽度 / 主题 | 到达方式 |
| --- | --- | --- | --- | --- |
| P34 | 建活动（Web） | #396 | 1440 · 浅 / 深 | `/app/events/center/new` |
| P35 | 编辑基本情報（Web） | #398 | 1440 · 浅 / 深 | `/app/events/<id>/edit` |
| P36 | 建活动（Web 1024） | #446 | 1024 · 浅 / 深 | 同 P34 |
| P37 | 建活动（Web 390） | #460 | 390 · 浅 / 深 | 同 P34 |
| P38 | 公開確認 | #400 | 1440 · 浅 / 深 | 编辑页「公開する」 |
| P39 | 中止確認 | #402 | 1440 · 浅 / 深 | 编辑页「中止する」（owner） |
| P40 | 日時・会場変更の通知確認 | #404 | 1440 · 浅 / 深 | 改日時后保存 |
| P41 | お知らせの文面 | #406 | 1440 · 浅 / 深 | 申込設定下折叠区展开 |
| P42 | 定型通知确认（16名） | #408 | 1440 · 浅 / 深 | 概要要対応「通知する」 |
| P43 | 定型邮件 + 收件箱通知卡 | #410 | 1440 · 浅 / 深 | QA 重定向邮箱 / 收件箱条目 |
| P44 | 主催者ページ一覧と編集 | #412 | 1440 · 浅 / 深 | `/app/events/center/profiles` |
| P45 | 共同運営に参加 · Web 落地 | #414 | 1440 · 浅 / 深 | `/app/host/join/<code>` |
| P46 | 共同運営に参加 · App 落地 | #416 | App · 浅 / 深 | 深链 `host/join/<code>` |
| P47 | コード入力 / 受付だけ担当 | #418 | App · 浅 / 深 | 運営センター空「共同運営に参加」/「受付だけ担当」 |
| P48 | 運営センター · 少（App） | #420 | App · 浅 / 深 | fixture ラウンドテーブル一场 |
| P49 | マッチング結果を見る（App） | #422 | App · 浅 / 深 | 概要「結果を見る」 |
| P50 | 参加者審査（App） | #424 | App · 浅 / 深 | 概要「審査待ち 12名」 |
| P51 | テンプレート（App） | #426 | App · 浅 / 深 | 運営センター空「テンプレート」 |
| P52 | 受付 QR 读取中（App） | #428 | App · 浅 / 深 | 受付「QR」 |
| P53 | レポート摘要（App） | #430 | App · 浅 / 深 | 段「レポート」 |
| P54 | kiosk QR 读取中 | #432 | 1180 · 浅 / 深 | kiosk「QR を読み取る」 |
| P55 | kiosk 当日枠超定员确认 | #434 | 1180 · 浅 / 深 | 满员时「当日枠で受付」 |
| P56 | kiosk 撤销签到确认 | #436 | 1180 · 浅 / 深 | 「取り消す」 |
| P57 | 運営センター 下書き / 中止 / アーカイブ 行 | #438 | 1440 · 浅 / 深 | fixture 三种状态各一场 |
| P58 | 运营台 · 下書き | #440 | 1440 · 浅 / 深 | 草稿活动 `operations` |
| P59 | 运营台 · 中止 | #442 | 1440 · 浅 / 深 | 已中止活动 |
| P60 | 运营台 · アーカイブ | #444 | 1440 · 浅 / 深 | 已归档活动 |
| P61 | 運営センター（1024） | #448 | 1024 · 浅 / 深 | 同 P03 |
| P62 | 概要（1024） | #450 | 1024 · 浅 / 深 | 同 P06 |
| P63 | マッチング（1024） | #452 | 1024 · 浅 / 深 | 同 P10 |
| P64 | 参加者（1024） | #454 | 1024 · 浅 / 深 | 同 P14 |
| P65 | 申込設定（1024） | #456 | 1024 · 浅 / 深 | 同 P21 |
| P66 | レポート（1024） | #458 | 1024 · 浅 / 深 | 同 P24 |
| P67 | 運営センター（390） | #462 | 390 · 浅 / 深 | 同 P03 |
| P68 | 概要（390） | #464 | 390 · 浅 / 深 | 同 P06 |
| P69 | 参加者（390） | #466 | 390 · 浅 / 深 | 同 P14 |
| P70 | マッチング（390，PC 引导） | #468 | 390 · 浅 / 深 | 同 P10 |
| P71 | 申込設定（390，PC 引导） | #470 | 390 · 浅 / 深 | 同 P21 |
| P72 | レポート（390，PC 引导） | #472 | 390 · 浅 / 深 | 同 P24 |
| P73 | 公开页（1024） | #474 | 1024 · 浅 / 深 | 同 P29 |

牵涉 A2 / A8 / A9 / A10 / A11 / A13 的画板（b6 #0 / #7 / #12 / #20、R27 #394 等）等用户结论后可能再改，届时按新序号重比。

**不进本组门禁**：`b6` #25–27（R19）；#28–33 / #46 / #47 与 `b7` #68–71 / #78（NFC，A5）。

### 画板预检（HOW-TO 第 8 节；`board-preflight.mjs` 2026-10-16 实跑，开工时对 `views/*-R17.json` 重跑并更新本表）

**五项总结论**：
- ① 自洽：b6 全部通过（b6 #2 / #44「審査待ち 12 vs 3」是不同活动；b6 #9 的误报已由 d429939c5 修掉，画板不改）。**b7 #34 / #35 数字口径不自洽**（開催回数 2 vs 過去 1件；累計 86 vs 参加 128名，工具没查出来，复核 M7），交 DESIGN §10 B9。
- ② 数据来源：输入框都有对应接口（下表）。「質問案を 3つ追加」= 规则；「なぜ同じテーブル？」= 现有编组产物，人工移动过的写「主催者が配置」；编组条件 chip 用规则后处理加新配置字段；「待ち / キャンセル待ちへ / 当日枠 / 取り消す」用新增的决定与签到接口；b6 #20 的权限表见 A9，理由与履历用现有 `reason` 与版本表；kiosk「N台で受付中」用新增心跳。
- ③ token：按 DESIGN §10 C1–C6 先补。
- ④ 组件：Drawer（共同運営者）、Modal（公開确认）、表格多选、拖动卡、kiosk 大按钮。已知差见 G23 / G23b，标「待组件库」的部分按规则 11 暂缓。
- ⑤ fixture：`features/events/host/design-fixtures/` + 非生产 `route.dev.ts`，照画板造六场活动（CFO18 开催中 128 / 150 · マッチ 112 · 受付 86；朝会 #3 42 / 60；ラウンドテーブル 18 / 30 · 審査待ち 3；vol.17 140 / 131 / 118 · フォロー 61%；Founders Lunch 24 / 22 · 73%；朝会 #2 38 / 34 / 31 · 48%）。中途状态：kiosk 用 fixture 时刻，离线用浏览器离线模式，弹层用点击步骤。

| 画板 | ① 自洽 | ② 输入框 / 疑似无功能 → 结论 | ③ token（近似 / 缺） |
| --- | --- | --- | --- |
| web #20 主催 · 運営 | ✓ | 无 | 近似：无；缺：字距 -0.02, 阴影；间距刻度外 0 项 |
| b6-host-polish #0 運営センター新用户空状态 | ✓ | 无 | 近似：无；缺：阴影；间距刻度外 0 项 |
| b6-host-polish #1 運営センター少量数据 | ✓ | 活动搜索 → center 列表过滤 | 近似：无；缺：字距 -0.02, 阴影；间距刻度外 0 项 |
| b6-host-polish #2 運営センター大量数据 | 误报（不同活动各自的审核待人数） | 活动搜索 → center 列表过滤 | 近似：无；缺：字距 -0.02, 阴影；间距刻度外 0 项 |
| b6-host-polish #3 マッチング新用户空状态 | ✓ | 无 | 近似：无；缺：字距 -0.14, 阴影；间距刻度外 0 项 |
| b6-host-polish #4 マッチング少量数据 | ✓ | 无 | 近似：行高 1.65；缺：字距 -0.14, 阴影；间距刻度外 0 项 |
| b6-host-polish #5 マッチング ① 確認・調整大量数据 | ✓ | 无 | 近似：行高 1.65；缺：字距 -0.14, 阴影；间距刻度外 0 项 |
| b6-host-polish #6 マッチング ② 公開する → 確認弹窗 | ✓ | 无 | 近似：行高 1.65；缺：字距 -0.14, 阴影；间距刻度外 0 项 |
| b6-host-polish #7 参加者新用户空状态 | ✓ | 申込页链接（只读复制）→ 活动 slug | 近似：无；缺：阴影；间距刻度外 0 项 |
| b6-host-polish #8 参加者少量数据 | ✓ | 参加者筛选 → roster 查询 | 近似：无；缺：字距 -0.02, 阴影；间距刻度外 0 项 |
| b6-host-polish #9 参加者大量数据 | 误报（前两行已勾；预检只数了批量操作条，主会话 10-16 定画板不改） | 参加者筛选 → roster 查询 | 近似：无；缺：字距 -0.02, 阴影；间距刻度外 0 项 |
| b6-host-polish #10 受付 kiosk新用户空状态 | ✓ | 无 | 近似：圆角 15；缺：圆角 40, 字距 -0.01, 字距 -0.02, 阴影；间距刻度外 1 项 |
| b6-host-polish #11 受付 kiosk大量数据 | ✓ | 无 | 近似：圆角 15；缺：圆角 40, 字距 -0.01, 字距 -0.02, 阴影；间距刻度外 1 项 |
| b6-host-polish #12 受付 kiosk错误态 | ✓ | 无 | 近似：圆角 15；缺：圆角 40, 字距 -0.01, 字距 -0.02, 阴影；间距刻度外 1 项 |
| b6-host-polish #13 申込設定新用户空状态 | ✓ | 无 | 近似：无；缺：阴影；间距刻度外 0 项 |
| b6-host-polish #14 申込設定少量数据 | ✓ | 申込設定 Q 编辑 → experience 问题集 | 近似：无；缺：字距 -0.14, 字距 -0.15, 阴影；间距刻度外 0 项 |
| b6-host-polish #15 申込設定大量数据 | ✓ | 申込設定 Q 编辑 → experience 问题集 | 近似：无；缺：字距 -0.14, 字距 -0.15, 阴影；间距刻度外 0 项 |
| b6-host-polish #16 レポート新用户空状态 | ✓ | 无 | 近似：无；缺：字距 -0.02, 阴影；间距刻度外 0 项 |
| b6-host-polish #17 レポート少量数据 | ✓ | 无 | 近似：无；缺：字距 -0.01, 字距 -0.02, 阴影；间距刻度外 0 项 |
| b6-host-polish #18 レポート · 全体大量数据 | ✓ | 无 | 近似：无；缺：字距 -0.01, 字距 -0.02, 阴影；间距刻度外 0 项 |
| b6-host-polish #19 レポート · 自分の視点大量数据 | ✓ | 无 | 近似：无；缺：字距 -0.02, 阴影；间距刻度外 0 项 |
| b6-host-polish #20 共同運営者（抽屉）弹层 | ✓ | 共同運営者邀请 → roles 接口 | 近似：无；缺：字距 -0.02, 阴影；间距刻度外 1 项 |
| b6-host-polish #21 ① 運営センター新用户空状态 | ✓ | 无 | 近似：无；缺：字距 0.01；间距刻度外 0 项 |
| b6-host-polish #22 ① 運営センター大量数据 | ✓ | 无 | 近似：无；缺：字距 0.01；间距刻度外 0 项 |
| b6-host-polish #23 ② イベント運営 | ✓ | 无 | 近似：无；缺：字距 0.01；间距刻度外 0 项 |
| b6-host-polish #24 ③ 受付含错误行 | ✓ | kiosk 搜索（ひらがな）→ check-in 搜索 | 近似：无；缺：字距 -0.02, 字距 0.01；间距刻度外 0 项 |
| b6-host-polish #28 ① 待機 | ✓ | 无 | 近似：无；缺：圆角 32, 字距 0.01；间距刻度外 1 项 |
| b6-host-polish #29 ② つながりました | ✓ | 无 | 近似：行高 1.3；缺：字距 0.01；间距刻度外 0 项 |
| b6-host-polish #30 ③ 相手側の通知 | ✓ | 无 | 近似：color rgb(42, 36, 51), 行高 1；缺：color rgb(0, 0, 0), 字号 92, 字距 -0.03；间距刻度外 2 项 |
| b6-host-polish #31 ④ 取り消し確認弹层 | ✓ | 无 | 近似：无；缺：字距 0.01；间距刻度外 0 项 |
| b6-host-polish #32 ⑤ 設定 · 承認制オフ | ✓ | 无 | 近似：无；缺：字距 0.01；间距刻度外 0 项 |
| b6-host-polish #33 ⑥ 承認制オン · 承認待ち | ✓ | 无 | 近似：无；缺：字距 0.01；间距刻度外 0 项 |
| b6-host-polish #44 運営センター大量数据 | 误报（不同活动各自的审核待人数） | 活动搜索 → center 列表过滤 | 近似：无；缺：字距 -0.02, 阴影；间距刻度外 0 项 |
| b6-host-polish #45 受付 kiosk大量数据 | ✓ | 无 | 近似：圆角 15；缺：圆角 40, 字距 -0.01, 字距 -0.02, 阴影；间距刻度外 1 项 |
| b6-host-polish #46 NFC ② つながりました | ✓ | 无 | 近似：行高 1.3；缺：字距 0.01；间距刻度外 0 项 |
| b6-host-polish #47 NFC ① 待機 | ✓ | 无 | 近似：无；缺：圆角 32, 字距 0.01；间距刻度外 1 项 |
| b7-account-misc #33 公開ページ · Web 1440新用户空 | ✓ | 无 | 近似：无；缺：圆角 30, 阴影；间距刻度外 1 项 |
| b7-account-misc #34 公開ページ · Web 1440少量数据 | ✓ | 无 | 近似：无；缺：圆角 30, 阴影；间距刻度外 1 项 |
| b7-account-misc #35 公開ページ · Web 1440大量数据 | ✓ | 无 | 近似：无；缺：圆角 30, 阴影；间距刻度外 1 项 |
| b7-account-misc #36 公開ページ · 手机浏览器新用户空状态 | ✓ | 无 | 近似：无；缺：无；间距刻度外 0 项 |
| b7-account-misc #37 公開ページ · 手机浏览器少量数据 | ✓ | 无 | 近似：无；缺：无；间距刻度外 0 项 |
| b7-account-misc #38 公開ページ · 手机浏览器大量数据 | ✓ | 无 | 近似：无；缺：无；间距刻度外 0 项 |
| b7-account-misc #39 フォロー · 未ログイン | ✓ | 无 | 近似：无；缺：无；间距刻度外 0 项 |
| b7-account-misc #78 NFC ③ つながりました | ✓ | 无 | 近似：字号 23；缺：字距 -0.01；间距刻度外 0 项 |

### 必需证据子表

| SC | 子断言 | 证据 |
| --- | --- | --- |
| 05 / 14 | 三条进入路径（先着順、批准、递补）都通知 + 分配番号；非生产邮件全部落到重定向地址 | REPORT 表 + 邮件日志 |
| 06 | 离线受付 3 人 → 联网补发：服务端只记 3 次签到；番号连续；撤销 1 人后计分回退 | REPORT 表 |
| P01–P33 | 门禁总表，证据目录 `~/orbit-sprint-evidence/redesign/R17/run-01/` | REPORT |
| 全部 | 三语、`copy:qa` 0；两端全量零新增失败；`tsc`、`typecheck:app`、`lint`；`detect-changes` | 全量清单 |

## 执行顺序

1. 索引、impact；token（C 组）；种子空账号；契约（App 先宽进）提交。
2. 迁移 `host-core` → 纯函数（RED 先行）→ 生命周期 / alias / 缺省配置 / 回填保护 / 试点放行 → 审核 waitlist + outbox + 番号 → 邮件模块 → QR v2 / undo / walk-in / 心跳 → 编组 overrides 与规则后处理 → 共同运营 → 资料与公开页 → 报告。
3. Web：運営センター → 概要 → 参加者 → マッチング → 申込設定 → レポート → 共同運営者 → kiosk → 公开页（边写边比）。
4. App：運営センター → 概要 / 受付 / レポート摘要 → 公开页；B4 / B10 补画到了再做。
5. 删旧屏、改壳排除名单、登记路由；R27 回归。
6. 全量、REPORT、`detect-changes`、提交推送；独立复核 → 修复 → 模拟器走查（kiosk 用两个窗口模拟多台）。

## 失败与交接

- **B 组补画未到**：对应画面暂缓，登记交接表 R17-05 与 DEFERRED-A。
- **A 组未答时的缺省做法**（都与推荐一致，或者是更保守的一侧）：

  | 项 | 缺省做法 |
  | --- | --- |
  | A1 | 只展示 |
  | A2 | 导入入口隐藏（G18） |
  | A3 | 推荐口径 |
  | A4 | 离线只排队、不缓存名单 |
  | A5 | 不做 |
  | A6 | 不记账 |
  | A7 | 开放创建 |
  | A8 | 只做 1180 |
  | A9 | 用现有能力，画板差异记为暂缓，等拍板 |
  | A10 | 每次决定弹确认，ひとこと不开放 |
  | A11 | 这一格暂缓 |
  | A12 | 保持白名单 |
  | A13 | 一人多份 |

- **交接给 R18**：`HostEventsRow` 与接口；删旧マイページ链接。
- **交接给 R13**：来源 `event_host_notice` 与通知设置。
- **交接给 R29**：通報与下架。
- **交接给下一期**：NFC、收款、多人共管的主办方资料。

# 加人与邀请（R12、R15、R16）文档 — REVIEW（独立复核）

**复核人：** 独立 AI 复核会话（没有参与写作），2026-10-11。
**对象：** `add-and-invite/DESIGN.md`（版本 1）、`R12-add-cards-and-manual`、`R15-invite-codes`、`R16-import-and-completion` 的 `GOAL.md` / `PLANNER.md`，`README.md` 功能登记表新加的三行（`git diff -- docs/designs/redesign-2026-10/sprints/README.md`）。
**依据：** `sprints/README.md`（RD 决定、通用规则 1–10、合回前总验收）、`HOW-TO-START-A-FEATURE-SPRINT.md`、`screen-ownership.md`（加人 6 行）、R08 契约 3 / 契约 4、样板 `plan-v2.2/DESIGN.md` 与 `plan-v2.2/REVIEW.md`；`IMPLEMENTATION-PLAN.md`（§1.3、D-10、D-11、D-13、D-25、附录 D）；设计稿 `b11-nav-v3`、`b9-import-plan-v2`、`b1-onboarding-cards`、`app`、`index`（关键句用 grep / Python 直接核对原文）；共享笔记 `add-invite-*.md`（只当线索）；现有代码 `repos/orbits`、`repos/orbit-app`（只读）。
**说明：** 只读复核。除本文件外没有改任何文件；没有连数据库、没有起服务器、没有调用付费 AI、没有提交 git。

## 结论：有条件通过

这是一份范围清楚、结构完整的设计：三个 Sprint 都能单独验收，依赖无环（R12 → R15、R12 → R16），乙的 Sprint 只依赖每个 Sprint 第一天提交的契约；付费 AI 零新增、现有名片识别每个 Sprint ≤5 次、生产迁移 / 环境变量 / 关联域名 / 原生依赖都进了 §11 授权清单；邮件与消息止于草稿、示例数据不写库、契约宽进严出写得到位；旧屏归属覆盖了 `screen-ownership.md` 加人 6 行（App 4 行、Web 2 行）。

但有 **2 条严重、10 条中等**问题，大多是「文档对现有代码的判断不对」，照着做会在开工后才撞上：

- **S1**：给 `SourceTypeCode` 加 `'invite_code'`，理由是「R11 的读取用 `tolerantEnum`」。实际现有读取端（服务端 `contacts/page` 处理函数和 App 人脈列表）都是封闭的 `z.enum`，写进一条 `invite_code` 联系人会让整页解析失败。
- **S2**：「读完直接进人脈」的 `accept-clean` 设计建立在几个不成立的前提上：不能在持有批次锁时再调 `confirmCard`；洞察和活动归属这些副作用在处理函数里、不在 `confirmCard` 里；Web 的 `useCardBatch` 早已在客户端自动导入「没疑点的卡」，并且按 W0015 有意把有活动归属候选的卡留给用户；计划候补只在整批完成时入队。
- **M1–M10**：丢掉了现有的名片表 / 裏配对（理由「v2 没有面的概念」不成立，最新 b11 也画了）（M1）；App `contacts/new` 改成透明 sheet 路由要动根导航和乙的 `parentForPath`（M2）；接收方注册回跳被 CRITICAL 的 `normalizeOrbitAuthReturnPath` 和新用户引导门禁拦住，且漏了用户定下的「对方注册并填资料」（M3）；`contact_actor_links` 不能「只追加字段」、解除后不能再连（M4）；现有合并函数只补空字段，做不了逐字段选 / 本人入力覆盖 / 同步 / 旧值历史（M5）；只填名字的手入力以后拍名片也统合不上，与画面承诺不符（M6）；公开预览的限流与防枚举还有几处缺口（M7）；删「草稿队列」会让活动的「去复核联系人」落空（M8）；每天一问的写入位置和「答了浓度上升」不成立（M9）；应交用户拍板的事漏了 4 件（M10）。

**条件：**
- S1、S2、M1、M2、M6、M8 在 R12 开工前改进 DESIGN 和 R12 PLANNER（R12 第一天要提交的契约受 S2 影响）。
- M3、M4、M5、M7 在 R15 开工前改好；M9 在 R16 开工前改好。
- M10 的 4 件补进 DESIGN §10（按推荐先做可以，但要写明）。
- m 级执行时顺手处理。

## 独立核实过的部分

- **代码事实抽查 40 余处，绝大多数属实**：`confirmCard`（`ingest-v2/repository.ts:1298`）、整批完成时入队计划候补（同文件 `:446`）、`INGEST_V2_MAX_ITEMS = 100`、`ContactAcquisitionScreen.tsx` 2446 行、人脈页 `ContactsScreen.tsx:1322,1573,1576,2075,2085,2091`、`HomeDashboardScreen.tsx:52`、`AiScreen.tsx:867`、`ProfileOnboardingScreen.tsx:335`、`events.ts:253,1473`、`app-navigation.ts:65`、`initial-route.ts:75,140,200-205`、`app/(app)/app/layout.tsx:16,50` 与 `CARD_BATCH_HOST_YIELD_PREFIXES`、`useCardBatch` 的 5 个调用方、`saveContact`（`contact-write-contract.ts:140`）、`findContactCandidate :96` / `mergeCardIntoContact :199`、`inbox-business-projections.ts:23`、`enqueuePlanMatchJob`（`matching-repository.ts:173`）、`password-reset-crypto.ts:4` 的 60 秒冷却、`redesign-contracts/handlers.ts:43-60`、`proxy.ts:28-30`、`InboxSourceKind` 含 `contact` 与 `target.kind` 含 `source`、`sourceChip` 已有 `'self'`、`features/plans/migrations.ts` 的 advisory lock + checksum 写法、导入 `handlers.ts:96` / `service.ts:203` / `dedupe.ts:59` / `new-contact-layers.ts:172`、导入的 `kind` / `format` 取值、维护心跳 600 秒、DeepSeek 两个模型名、`business-card-import-client.ts` 只被测试引用、App 有 `react-native-svg` / `expo-linking` / `expo-document-picker` 而没有剪贴板与 `expo-contacts`、App 的 scheme 是 `orbit`。
- **GitNexus（索引在 `5e1c385f`）与 §14 一致**：`getConfiguredIngestV2` CRITICAL 27 / 直接 9、`useCardBatch` CRITICAL 8 / 4、`createBusinessCardIngestRepository` HIGH 14 / 2、`findContactCandidate` HIGH 6 / 3、`mergeCardIntoContact` HIGH 7 / 2、`createLiveManualContactCreationService` HIGH 14 / 4、`createLiveBusinessCardContactWriteService` HIGH 5 / 4、`enqueuePlanMatchJob` LOW 8 / 2、`NetworkImport` LOW 1 / 1。§14 漏了 `normalizeOrbitAuthReturnPath`（CRITICAL 23 / 直接 8，见 M3）。
- **说错的地方**（各条问题里细说）：`SourceTypeCode` 读取端（S1）、`confirmCard` 的副作用与锁（S2）、「v2 要求逐张确认」（S2，Web 早已自动导入）、「v2 没有面的概念」（M1）、`parentForPath` 回人脈（M2）、链接记录可直接加字段（M4）、「A、B 各在自己的 workspace」（M4）、每天一问写 `contact_detail_states`（M9）、R16「app.json」「multipart」（m8）。
- **路由相容性**：`route-parity` 只扫 Web 的 `app/(app)/app/**/page.tsx`，`app/i/` 不在其中；根 `app/layout.tsx` 存在，`app/i/` 能独立渲染；`proxy.ts` 的 matcher 只有 `/app/:path*` 与 `/api/:path*`，`/i/**` 不经过登录前缀与引导门禁（但也不经过 `?lang=` 处理）；`audit:full-product` 扫整个 `app/`，所以 `/i` 两页会进审计计数（R15 已写）。两端加人新路径 Web / App 同名，不需要 `route-parity` 例外。
- **设计稿核对**：用户 2026-10-07 原文「好友注册并填资料、选择共享项目后…双方推送告知」（`index.html`）；b9 接收方有「プロフィール（2 / 3）あなたのことを教えてください」；b11 A1 ② 相机有「表面 / 裏面；裏面任意，拍了会自动和上一张配对（同 b1）」；app.html「名前だけで保存。あとで名刺を撮ると統合されます」。这几处与 DESIGN 的出入见 M1、M3、M6。
- **结构**：三个 PLANNER 都按 R22–R25 的顺序写（事实 → 上下文包 → 契约 → 范围 → 测试 → SC → 证据子表 → 执行顺序 → 失败与交接），粒度与 R22–R25 相当。

## 问题清单

### 严重

**S1 给 `SourceTypeCode` 加 `'invite_code'` 会让现有人脈列表整页解析失败**
- **现象**：DESIGN §4.2 第 181 行、R15 契约节：`SourceTypeCode` 加 `'invite_code'`，理由「R11 的读取用 `tolerantEnum`，未知值有兜底」。实际：`shared/api-schema/contact-card-page.ts:10` 的 `sourceType` 是封闭的 `z.enum([...11 个值])`；服务端 `app/api/contacts/page/handler.ts:42` 与 `features/contacts/storage/contact-list-postgres-reader.ts:1252` 用它 `.parse` 整页；App `src/hooks/useContactCardPages.ts:95,99` 用同一 schema 校验；`mobile-contacts-dashboard.ts:318` 也是封闭枚举（连 `chat_summary` 都没有）；`shared/compute/relationship-values.ts:8` 的 `SOURCE_TYPES` 与 SQL 里的 `in (SOURCE_TYPES_SQL)` 过滤也要同步。R11 是乙的、还没写，R15 只依赖 R12，没有任何保证 R11 先把读取端改宽。
- **为什么是问题**：只要有一条招待联系人写成 `sourceType = 'invite_code'`，服务端整页 `parse` 抛错（500），App 人脈列表变成错误态。DESIGN 的安全论证建立在一个不存在的前提上，R15 的 SC 也不会发现（测试只看招待本身）。
- **建议修法**：二选一写进 DESIGN §4.2 / §9：(a) **不加新值**——招待联系人的 `sourceType` 用已有值（例如 `referral` 或 `system`），「本人入力」只靠已有的 `sourceChip = 'self'` 表达（推荐，零读取端改动）；(b) 先由甲在 R15 第一天把上面几处读取端改成 `tolerantEnum`（服务端整页 `.parse` 改成逐条读，`SOURCE_TYPES` 同步），并加回归测试「含未知来源的联系人不影响整页」，再写新值。

**S2 `accept-clean` 的做法不成立：锁、副作用、字段来源、和现有自动导入的关系都没想清楚**
- **现象**：
  1. DESIGN §3.1 第 128 行：「在同一把批次锁里，把…卡逐张走现有 `confirmCard`（同一事务、同一副作用：活动归属、即时洞察、计划候补入队）」。`confirmCard`（`repository.ts:1298-1361`）自己调 `withBatchLock` 开事务并 `select … for update` 批次行，不接受外部事务；外层若先持锁再逐张调用，会在另一条连接上等自己的锁。
  2. 活动归属 `markAttended`、洞察标脏 `markInsightsDirty`、`scheduleCardInsights` 都在处理函数 `createConfirmLikeHandler`（`app/api/contact-drafts/business-card/batches/v2/handlers.ts:917-935`）里，不在 `confirmCard` 里。只在 handler 层「调用仓储的 `confirmCard`」会悄悄跳过这些副作用。
  3. `confirmCard` 要求 `confirmationIntentId`、`confirmationFingerprint`、`expectedItems`（版本 + 图片摘要）、`fieldSources` 和 `createContact` 回调；联系人字段原本来自用户在复核页的提交。服务端自动确认时姓名 / 公司 / 职位 / 多个邮箱电话里选哪个、正反面字段冲突怎么取，DESIGN 没有定义。
  4. **Web 已经有「没疑点的卡自动导入」**：`card-batch-0918/use-card-batch.ts:389-421` 在客户端对 `isAutoImportEligible`（`card-batch-model.ts:97-109`：无 issue、正反面无冲突、无过期字段、补全不需复核、有名字）的卡逐张调 confirm，完全相同的直接并入；并且按 W0015 **有意**把「有活动归属候选」的卡留给用户（`:397`）。DESIGN §1.1 第 3 条「v2 要求每张名片点确认」不符合 Web 现状；新的服务端 `accept-clean` 与它会同时对同一张卡确认，两边算出的指纹不同，后到的一方得到 `IDEMPOTENCY_CONFLICT`；§3.1 的「无例外」规则也比现有规则少了正反面冲突、补全复核，并且推翻了 W0015。
  5. 计划候补只在批次转 `completed` 时入队（`repository.ts:427-452`）。只要还有一张重复 / 要確認 没处理，已自动进人脈的人就不会进计划候补；完成页「🎯 プランに関係しそうな人 N人」此时没有数据。
  6. まとめて確認 上「会った場所と日付 可改可清除」：已被 `accept-clean` 确认的卡再改活动，用不同指纹重放会被拒；DESIGN 没有给事后改活动归属的路径。
- **为什么是问题**：这是 R12 的主流程。照文档实现，要么死锁 / 冲突，要么静默丢掉洞察与活动归属，要么与全站的 `CardBatchHost`（CRITICAL）抢着确认；而 R12 的 SC-R12-03「副作用与逐张确认一致」按文档写法测不出前提错误。
- **建议修法**（写进 DESIGN §3.1、§9 #5、R12 事实与范围）：
  - 把 `createConfirmLikeHandler` 里「解析字段 → 指纹 → `confirmCard` → 活动归属 → 洞察」抽成一个服务函数（例如 `confirmIngestCard`），确认处理函数与 `accept-clean` 共用；这是改 HIGH 文件的重构，impact 与回归测试写进 R12。
  - `accept-clean` 在锁外逐张调用（每张一个事务，失败的计入 `failed`），不说「同一把锁」。
  - 「能否自动入人脈」只留一份规则：把 `isAutoImportEligible` / `isAutoMergeEligible` 与字段取值（主邮箱、主电话、正反面合并）搬进 `shared/compute`，服务端和两端共用；然后**只保留一个执行者**——推荐服务端 `accept-clean`，同时删掉 `useCardBatch` 里的客户端自动导入（CRITICAL，要写 impact 与对策），或者反过来让 App 也走客户端自动导入、不做 `accept-clean`。
  - W0015「有活动归属候选的卡留给用户」：保留，或在 §10 请用户确认改掉（见 M10）。
  - `accept-clean` 对本次进人脈的联系人直接调 `enqueuePlanMatchJob`（按批次 + 本次联系人去重），不等整批完成；或把完成页的计划候补那一行改成「確認が終わると表示」。
  - 写明事后改「会った場所」怎么落库（例如对已确认联系人补 `metEventId` 的单独动作）。

### 中等

**M1 删掉名片「表 / 裏」配对，理由不成立，也偏离最新设计稿和现有功能**
- **现象**：DESIGN §2.2 第 63 行、§9 #7：「不做表 / 裏配对：现有 v2 契约没有面的概念」。实际 `shared/contract/business-card-batch.ts:141,146,174` 有 `IngestCardSide = "front" | "back"`，`confirmCard` 按 `card_id` 合并正反面；App 现有 `BusinessCardIngestStartScreen.tsx:166-193` 能给一张卡补拍反面；最新 b11 A1 ② 相机画了「表面 / 裏面；裏面任意，拍了会自动和上一张配对（同 b1）」。
- **为什么是问题**：R12 删掉 App 这些屏后，用户会失去现有的两面名片能力；这是「删除现有功能 + 偏离最新设计稿」，按规则应交用户拍板，不能以错误的技术理由自定。
- **建议修法**：改为「做表 / 裏：相机里切换面，裏面跟上一张表面配对（现有 v2 已支持）」，R12 的 SC-R12-02 与测试加两面卡；如果坚持不做，§9 #7 改正理由并列入 §10。

**M2 App `contacts/new` 改成「透明 sheet 路由」要动根导航和乙的 `parentForPath`，文档说不用动**
- **现象**：DESIGN §2.1 第 53 行、§7 第 235 行、R12「关键符号」：`contacts/new` 改为 expo-router modal（透明背景 + 底部 sheet），「`parentForPath` 不改，现有规则覆盖」。实际：(1) App 没有 `app/contacts/_layout.tsx`，根导航的 `<Stack>` 在 `src/components/OrbitRouteAccessBoundary.tsx:20`（R04 保留的基础设施）；`presentation: 'transparentModal'` 要在那里或新加的 `contacts/_layout.tsx`（会包住 R11 的全部人脈路由）里声明，在屏幕组件里设置赶不上首次转场。(2) `app-navigation.ts:65`：`contacts/new/*` 的返回目标是 `/contacts/new`（文案「导入中心」）——改完以后，从名片页、手入力页返回会落到透明 sheet 上。(3) 冷启动或推送直接打开 `/contacts/new` 时，sheet 下面没有人脈页。(4) 底栏按 `mainTabForPath(pathname)` 显示（`app/_layout.tsx` 的 `UiRoot`），打开 sheet 时底栏会消失。
- **为什么是问题**：要么改基础设施与乙的热点文件（文档说不改、也没写通知），要么返回逻辑出错；SC-R12-01「× 与下拉关闭回原位置」按现写法做不到。
- **建议修法**：在 DESIGN §2.1 / §7 写清楚：在哪里声明 `transparentModal`（推荐新建只声明这一屏选项的方式，并写 impact）；`parentForPath` 对 `contacts/new/*` 改为回 `/contacts`，这是乙的热点文件，先提需求（与推送白名单同样处理）；直接打开 `/contacts/new` 时先 `replace` 到 `/contacts` 再弹 sheet；底栏的处理写进 SC。另一个更省事的推荐做法：`contacts/new` 保持普通页面「人脈を追加」（与 Web 同构），sheet 只是 `AddContactSheet` 组件，等 R11 在人脈页内嵌。

**M3 接收方「注册 → 回到 `/i/<code>`」被现有回跳规则和新用户引导拦住，且漏了「对方注册并填资料」**
- **现象**：
  - DESIGN §2.5 第 95 行用 `/app/account/signup?next=/i/<code>`；R15 事实 6 说「`next` 是否保留开工时核对」。复核人核对：`features/auth/app-auth-routing.ts:49-79` 的 `normalizeOrbitAuthReturnPath` 只放行 `/`、`/app`、`/app/**`，`/i/…` 会退回 `/app/home`；注册页（`signup/page.tsx:73`）和 `use-account-auth.ts:62` 都用它，注册成功后再走 `profileContinuationPath`（`profile-onboarding-navigation.ts:88`）→ `/app/profile/continue`，新用户资料未完成会进入引导流程。`normalizeOrbitAuthReturnPath` 是 **CRITICAL 23 / 直接 8**，§14 没列。
  - 用户 2026-10-07 的原话是「好友**注册并填资料**、选择共享项目后…」，b9 接收方有「プロフィール（2 / 3）あなたのことを教えてください」（氏名 / 会社 / 役職 / 提供できること / 求めていること）。DESIGN 第 3 步只有「值来自我的资料，没填的项不显示开关」——新注册的人资料是空的，只能共享名字，「本人入力 ●●●」实际只有一个名字。
- **为什么是问题**：SC-R15-02 的主路径「未注册 → 注册 → 回到 `/i/<code>`」按现有代码走不通，会掉进完整引导；改回跳要动 CRITICAL 函数；「填资料」这一步既偏离用户决定也没写进 §9 / §10。
- **建议修法**：DESIGN §2.5 补一张完整的接收方路径：注册 → 简短资料页（按 b9 2/3，可复用现有资料保存接口）→ 共享项目 → つながる；写明招待来的新用户是否跳过 / 推迟现有引导（推荐：先完成招待，引导在下次进 `/app` 时照常出现）；`/i/…` 回跳放行写成「新增一个只认 `^/i(/[23456789A-HJ-NP-Z-]{0,9})?$` 的分支，已有分支不改」，§14 加 `normalizeOrbitAuthReturnPath` 的 impact 与对策；R15 测试加开放重定向用例（`next=//evil`、`next=/i/../app/admin`、编码绕过）。

**M4 `contact_actor_links` 不能「只追加可选字段」，解除后也不能再连**
- **现象**：DESIGN §3.2 第 144 行、R15「关键符号」：链接记录新增可选字段 `syncedAt`、`sharedFields`，「不需要迁移、只追加，已有方法不改」。实际 `contact-actor-links/storage-provider.ts` 的 `linkFromRecord` 用 `exactKeys` 要求 payload 恰好是那 5 / 6 个键，多一个键就抛 `Invalid contact actor link`；`ensureActive` 对已撤销的记录抛「A revoked link history cannot be reactivated」，而记录 id 是 `hash(owner, contactId)`。另外，锁是进程内的 `WeakMap`（按 store 对象），事务内新建的 store 每次都是新对象，等于没有锁。§3.2 第 145 行「A、B 各自的联系人在各自的 workspace」也不对：workspace 是部署级的 `ORBIT_WORKSPACE_ID`（`shared/storage/live-database-config.ts:57-58`），A、B 在同一个 workspace，只是 `userId` 不同。
- **为什么是问题**：照文档加字段会让现有读取（活动主办账号的 `organizer-accounts/bootstrap.ts:715,728`）和新写的读取一起报错；「解除时我这边保留为普通联系人」之后再用新码连上同一个人，会统合进保留的那条，`ensureActive` 抛错，兑换失败。
- **建议修法**：R15 明确要改 `linkFromRecord`（允许新可选键，旧记录照读）并写 impact；同步字段与共享项目也可以干脆放进 `invite_code_redemptions`（已经是新表，本来就要建），链接记录保持原样（推荐，更少动旧代码）；再连接时为已撤销的链接定义行为（新建链接记录 id 加序号，或允许 `revoked → active` 并记录历史）；并发由 redeem 事务里的数据库约束保证，不依赖进程内锁；§3.2 删掉「跨 workspace」的说法，`inviter_workspace_id / redeemer_workspace_id` 两列合成一个 `workspace_id`。

**M5 现有合并函数只补空字段，做不了「逐字段选」「统合成本人入力」和「同步覆盖、旧值进历史」**
- **现象**：`mergeCardIntoContact`（`business-card-contact-match.ts:199-283`）对已有值只「空的补上、不同的写进备注」，从不覆盖已有字段。DESIGN 却用它承担：手入力 `fieldChoices: 'incoming'`（§4.1，选新值覆盖旧值）、招待「已有对方名片 → 统合并标本人入力」（§2.6，对方本人的值应当为准）、同步「只改共享字段，旧值进这条联系人的历史」（§2.6）。代码里联系人没有任何字段历史（`grep` 不到 history 一类的结构）。
- **为什么是问题**：三处都会实现成「新值被塞进备注、旧值不动」，与画面（「違う所だけ選びます」「相手が更新すると自動で反映」）不符；「旧值进历史」没有落库位置，R15 的 sync 测试无法按文档写。
- **建议修法**：DESIGN §3.1 / §3.2 定义一个新的写入函数（例如 `applyContactFieldValues`：按字段覆盖，`updateRecordIfCurrent` 乐观并发，旧值写进一条证据记录或备注里的「更新履歴」段——二选一写明），手入力统合、招待统合、同步三处共用；同时写清「用户自己改过的字段」与「对方本人更新」冲突时以谁为准（推荐：共享字段以对方为准，用户改过的那个字段停止同步并在详情上提示，对标 Eight 的名刺更新）。

**M6 只填名字的手入力，以后拍名片也统合不上，和画面的承诺相反**
- **现象**：`findContactCandidate` 的命中条件（`business-card-contact-match.ts:76-90`）是同邮箱、同电话（≥7 位）、或**名字和公司都相同**。只填名字的联系人没有公司、邮箱、电话，任何名片都匹配不上它；反过来，Web 抽屉「名字一输入就即时查重」在没填公司时也查不出任何人。而「＋」sheet 文案是「名前だけで保存。あとで名刺を撮ると統合されます」（app.html），b11 A3 ① 写「あとで名刺を撮ると、上書きではなく統合されます」。
- **为什么是问题**：用户照文案做，最后人脈里出现两个同名的人；SC-R12-06「同一人用名片和手入力先后加 → 第二次查到候选」只有在填了公司时才成立。
- **建议修法**：自定一个规则写进 §9（对标 Google 通讯录的「可能重复」：同名即提示）：名字相同、且一方没有公司 / 邮箱 / 电话时算「相似」（只提示、不自动统合），名片和手入力都用；或者把文案改成「会社も入れておくと、名刺を撮ったときに統合されます」。SC-R12-06 加「只填名字」的用例。

**M7 公开预览的限流与防枚举还有缺口**
- **现象**（DESIGN §6）：
  1. 没写客户端 IP 从哪个头取。仓库里没有任何先例（`grep x-forwarded-for / x-real-ip` 为空）；取错头可以被伪造，限流失效。
  2. 「每 IP 每小时失败 10 次后该 IP 所有预览 429」：活动会场的 Wi-Fi、公司网络、手机运营商的 NAT 下很多人共用一个 IP，而招待码最常见的场景正是活动现场当面扫码，十几次手输错就把整个会场锁一小时。「全站每分钟失败 600 次 → 所有未登录预览 429」让攻击者用很少的请求就能让所有新用户打不开邀请。
  3. 预览「只返回邀请人选择共享的字段」——如果邀请人打开了「連絡先」，邮箱和电话会在未登录、链接被转发的情况下公开；b9 / b11 接收方打开页只显示名字、会社・役職、提供 / 求めている。
  4. 契约 `InviteCodeCreateInput.shared` / `InviteCodeRedeemInput.shared` 传的是**值**，不是键：客户端可以填任意姓名公司，对方人脈里却标「本人入力」；之后同步又会被资料里的真实值覆盖。
  5. 兑换的失败上限按账号算，注册免费，换账号即可绕过；兑换失败的响应（过期 / 满员 / 自己的码 / 不存在）是否同样统一没写。
  6. 密钥缺省时直接用 `AUTH_SECRET` 做 HMAC，同一把密钥两种用途。
  7. 已过期的码永远能用来查邀请人名字（只是状态变 `expired`）。
- **为什么是问题**：README 合回前清单要求「公开邀请预览有限流和防枚举」，现方案在真实部署里要么挡错人、要么可被绕过或被用来拒绝服务。
- **建议修法**：§6 补：IP 用平台写入的头（Vercel 上用 `x-real-ip` 或 `@vercel/functions` 的 `ipAddress()`，本机缺省时用固定值，并测试伪造 `x-forwarded-for` 无效）；失败锁定只锁「这个 IP 的失败请求」并加大门槛（例如 1 小时 30 次），真码在锁定期仍可预览（真码本身就是凭据），全站熔断改为只对失败请求生效；预览永远不返回邮箱电话（连上之后才交换）；`shared` 改为只传字段键，值一律由服务端从本人资料读取；兑换失败也按 IP 计数、响应统一；HMAC 密钥用 `AUTH_SECRET` 派生（HKDF + 用途标签）；过期超过 30 天的码按「使えません」处理。

**M8 删除「草稿队列」会让活动的「去复核联系人」落空**
- **现象**：§9 #25、§10 #3 随 `ContactAcquisitionScreen` 删除草稿队列、外部候选等，理由「统合由まとめて確認承担」。但 App 活动详情会后确认完候选，按钮「去复核联系人」跳到 `reviewQueueHref: "/contacts/new"`（`events.ts:253,1473`，`EventDetailScreen.tsx:1320`），复核的正是这个草稿队列；`ContactAcquisitionScreen` 还接收 `?eventId=` 做「参加者からの下書き取り込み」（`ContactAcquisitionScreen.tsx:141,631`）。DESIGN §2.1 第 56 行说「活动（R26）现有链接…自然落到新屏」，实际落到的是加人 sheet，里面没有任何待确认草稿。
- **为什么是问题**：R12 之后，App 上活动产生的联系人草稿无处确认，活动的会后流程断一截；§10 #3 只问「删不删这几块」，没告诉用户会影响活动。
- **建议修法**：§10 #3 写明这个影响，并给推荐落点：待确认的联系人草稿进まとめて確認（同一组件，数据源换成草稿）或 R20 的「判断待ち」；在落点做好之前，`reviewQueueHref` 指向一个最小的草稿确认页而不是 sheet；`events.ts` 的改动归 R26（甲），写进 R12 交接。

**M9 每天一问：写到哪里不对，「答了浓度上升」不一定成立**
- **现象**：DESIGN §3.3 第 150 行、R16 事实 5：答案写进「联系人的现有字段（`contact_detail_states`，版本 CAS）」。`contact_detail_states` 只存标签、状态、备注、最近互动（`contact-live-record-provider.ts:210-227`）；公司在 `contacts` 记录的 payload 里，相遇活动是 payload 的 `metEventId`，而「紹介」「前職の同僚」「覚えていない」没有对应字段。浓度按 D-10：●●○ 要「有联系方式**且**有相遇时间或场合」，LinkedIn 导入的人多数没有邮箱（b9「メール 341人中 12人のみ」），答了「どこで」浓度也不变。另外契约 3 `askedOn` 注释写「the person's time zone」，DESIGN 写「东京日」。
- **为什么是问题**：SC-R16-05「回答写字段与浓度上升」按文档无法实现也无法验证。
- **建议修法**：§3.3 逐题型写清写入位置（公司 → `contacts.organization`，经现有联系人更新服务；活动 → `metEventId`；紹介 / 前職の同僚 → 新的可选字段或一条备注，选一个）；SC 改成「答了以后这个人的信息多一项；浓度按 D-10 重新计算」；`askedOn` 的时区二选一并改契约注释。

**M10 应交用户拍板的漏了 4 件**
- **现象**：DESIGN §10 只有 4 项。下面几件是删除现有功能或改产品口径，却作为自定决定或没写：(1) 不做表 / 裏（M1）；(2) 接收方不填资料、只用已有资料（M3，偏离用户 2026-10-07 原话）；(3) 推翻 W0015「有活动归属候选的名片不自动导入」（S2）；(4) 删草稿队列对活动会后复核的影响（M8）。另有一处小偏离：用户决定「双方推送告知」，DESIGN 只通知邀请人（接收方看完成页），§9 没写理由（见 m13）。
- **为什么是问题**：按「只有付费 AI、生产写入、部署和真正的产品取舍才上报」，这几件属于真正的产品取舍。
- **建议修法**：补进 §10，每项写推荐做法、对标和不同意时的影响；推荐分别是：做表 / 裏；加简短资料页；保留 W0015；草稿进まとめて確認。

### 轻微

**m1 README 登记表断开了。** 新加的 R12 / R15 / R16 三行和 R25 那行之间有一个空行（`README.md` 第 52 行），Markdown 会把这三行当成没有表头的普通文字。删掉空行即可。

**m2 Web 旧链接只处理了 `?job=`。** `?method=scan` 还被 `network-shell.tsx:49`、`iorbit-home.tsx:104`（R21）、`analysis-threshold.ts:67`（R11）使用，`?import=<id>`（`network-import.tsx:70`，W0053「继续核对一批文件导入」）也有入口。R12 要把 `?method=scan` 重定向到 `/app/contacts/new/scan`，R16 的重定向带上 `?import=`。

**m3 Web 续传可能停在门卡页。** `CardBatchHost` 在 `/app/contacts/new` 整个前缀下让位（`card-batch-host.tsx:30`），以前因为该页自己挂了 `useCardBatch`。R12 后门卡页、手入力抽屉、R16 的导入页都不挂它，正在上传的批次在这些页面上没人续传。需要把让位前缀改成 `/app/contacts/new/scan`——这正是 DESIGN §13 说「保留不改」的文件，要写明这一行改动与 impact（R12 易错边界已列这一条，但范围里没写怎么改）。

**m4 读不出的原因拿不到。** `failureReason` 要给出 ピンぼけ / 文字が小さい / 名刺ではない，但现有错误码只有 `IMAGE_INVALID`、`OCR_PROVIDER_FAILED`、`OCR_PROVIDER_TIMEOUT`、`OCR_INVALID_OUTPUT`、`LEASE_EXHAUSTED`（`business-card-batch.ts:139`），映射出来基本都是 `other`。照实写「现阶段只区分『画像を読めない / 混雑で失敗』」，或者说明要改 OCR 输出（不在本组）。

**m5 删除旧屏的清单漏了审计脚本和若干测试。** `scripts/generate-full-product-functional-audit.mjs` 有 42 处引用被删的屏和路由（R25 删 `contacts/intros` 时改过它，`a91fecae`）；App 还有 `scripts/audit-offline-read-surfaces.ts`、`tests/contact-acquisition-screen.test.ts`、`tests/relationship-invitation-screen-source.test.ts`、`tests/app-wide-contacts.test.ts`、`tests/app-screen-touch-targets.test.ts`、`tests/app-locale-relationships-events.test.tsx`、两份 opening fixture。建议写进 R12 / R15 的删除清单。

**m6 R15 事实 4 小误。** `app/api/contacts/handler.ts:40` 只是把 `contact_actor_links` 列进列表的水位集合，不读链接内容；现在唯一的读写方是活动主办账号初始化（`organizer-accounts/bootstrap.ts`）。

**m7 撤销不是「硬删」。** 存储的 `deleteRecord` 是把 `lifecycleState` 改成 `deleted` 的墓碑，App 同步靠它知道删除；文档写「硬删」容易被实现成物理删除。另外「撤销后计划候补移除」会写计划模块的表，要写明调哪个函数、impact。

**m8 R16 对导入接口的描述不准。** 上传是原始请求体 + 头（`x-orbit-import-kind`、`idempotency-key`、`x-orbit-import-file-name`，`import/handlers.ts:136-149`），不是 JSON 或 multipart；App 用 `fetch` 发文本即可，「失败与交接」第一条的备选分支其实不需要。服务端没有 ZIP 解压，「CSV 或 ZIP（自动解压）」要在 Web 端解压，需要新依赖，列进范围。权限文案在 `app.config.ts`（`infoPlist`），不是 `app.json`。

**m9 过期码被写成「已作废」。** §3.2 为了让部分唯一索引不被占住，在发新码时给过期码写 `revoked_at`。结果履历里过期的码显示成「無効」、预览从「期限切れ」变成「使えません」。建议加 `superseded_at` 或 `status` 列区分「用户作废 / 被新码替换 / 过期」。

**m10 契约细节。** `ManualContactCreateResult.outcome` 的宽进兜底值没写；R08 的 redeem 没有请求体，现在要求严格请求体，属于请求侧变化，虽然只有 mock 在用，也在 PLANNER 里写一句；`IngestItemContract.exception` 放在每个条目（每一面）上，而例外是按卡（正反面一组）判定的，写明两面取同一值。

**m11 有几条易错边界没进测试。** R12 的「示例模式下写操作没拦截」；R15 的「注册回跳被利用成开放重定向」「`/i/[code]` 被收录或 Referer 泄露码」「示例模式下发码写库」。三个 PLANNER 都写了「全部写进 SC」，建议在测试节逐条对上。

**m12 GOAL 里还有内部用语。** R12「允许清单只减不增」「两端全量零新增失败」；R15「限流」「防枚举」「生产迁移」。可改成「旧页面的文件都删干净了」「原有功能的测试都没有变坏」「别人没法靠乱猜邀请码看到你的名字」「正式环境的数据库改动另外请示」。

**m13 几处偏离没写理由。** (1) 用户决定「双方推送告知」，DESIGN 只通知邀请人；(2) IMPLEMENTATION-PLAN §1.3 计划連絡先复用 `/api/contact-drafts/external/{candidates,import}`，DESIGN §9 #21 改走 vCard 导入，没说明是偏离；(3) 手入力「会社 联想（人脈に 3人）」与「出会った場所 候选」用什么接口，§4.1 没定义；(4) b11 A3 ② メモ「保存后同时进 Task › メモ（可 @人）」，DESIGN 写「作为这个人的第一条笔记」，是联系人备注还是笔记模块要写清。

**m14 名片批次通知的 v1 分支。** `batchResultNotification` 同时服务 v1 / v2（`inbox-business-projections.ts:19-23`），改 href 时 v1 批次不能也指向 `scan/<id>`，保留按 `pipeline` 区分。

**m15 消息 App 的链接预览。** LINE / Slack / iMessage 粘贴链接时服务器会抓取 `/i/<code>`：页面标题和 OG 信息要不要带邀请人名字、这些抓取算不算预览次数，§6 写一句。

**m16 「招待コード」与活动报名码同名。** web.html 活动空态「招待コードをお持ちですか？」和 App `register/[code]` 是活动报名码，与加人的招待コード同名（设计稿内部不一致第 19 条）。DESIGN 没提，建议在 §9 定一个区分（例如活动那边叫「参加コード」，交 R26）。

## 逐项核对

| 重点 | 结论 | 说明 |
| --- | --- | --- |
| 1 代码事实 | ⚠️ | 抽查 40 余处，路径、行号、函数名、表名、路由、风险等级大多准确；GitNexus 9 个符号与 §14 一致。说错的见 S1、S2、M1、M2、M4、M9、m6、m8；§14 漏 `normalizeOrbitAuthReturnPath`（M3） |
| 2 与设计稿 / 旧方案 / 用户决定 | ⚠️ | 5 个门、7 天 10 人、只做草稿、码不含姓名（附录 D-g）、NFC 下一期（Q9）都对。未说明的偏离：表 / 裏（M1）、接收方填资料（M3）、W0015（S2）、双方通知与連絡先接口（m13）；§10 漏 4 件（M10） |
| 3 可行性 | ❌ / ⚠️ | `accept-clean`（S2）、sheet 路由（M2）、注册回跳（M3）、链接字段（M4）、合并语义（M5）、每天一问写入（M9）不成立或缺定义。可行的：跨账号写联系人（同一 workspace、同一数据库，可用事务内的 record store，先例 `buildTxContactService`）；`app/i/` 与路由组、`proxy.ts`、`route-parity` 相容；`expo-clipboard` / `expo-contacts` 是 SDK 57 的普通模块，要重建开发包（已写）；App 用原始请求体调现有导入接口可行 |
| 4 安全 | ⚠️ | 统一 404、HMAC 后的 IP、日志不记完整码、密钥都缺时 503、并发上限用条件更新，方向正确。缺口见 M7、M3（开放重定向测试）、m15 |
| 5 契约 | ⚠️ | 新响应宽进、请求严格、只加可选字段，不需要 BREAKING。问题：`SourceTypeCode` 加值（S1）、`shared` 传值不传键（M7）、几处兜底值与请求侧变化（m10）。收件箱用现有 `contact` / `source` 合理 |
| 6 与乙的接口 / 旧屏归属 | ⚠️ | 接口表清楚，乙的 Sprint 都不等；动乙文件的两处（收件箱一行、推送白名单）写了通知。漏写：`app-navigation.ts`（M2）、活动 `events.ts`（M8，R26 甲）。归属：App 4 行、Web 2 行全覆盖，各 Sprint 收口时改「已处理」写清 |
| 7 SC 与测试 | ⚠️ | SC 大多可验证、证据具体；受 S2、M6、M9 影响的 SC 要随之改写；部分易错边界没有对应测试（m11）。GOAL 基本是普通话，个别内部用语（m12） |
| 8 结构与粒度 | ✅ | 三个 PLANNER 的章节顺序与 R22–R25 一致，粒度相当；DESIGN 的章节与 plan-v2.2/DESIGN 对齐（流程 → 数据 → 契约 → AI → 安全 → 路由 → 接口 → 自定 → 拍板 → 授权 → 切分 → 归属 → GitNexus） |

## 附：复核人做了什么

**读过的文件**
- 被复核：`add-and-invite/DESIGN.md`、R12 / R15 / R16 的 `GOAL.md` 与 `PLANNER.md`、`git diff -- docs/designs/redesign-2026-10/sprints/README.md`。
- 依据：`sprints/README.md`、`HOW-TO-START-A-FEATURE-SPRINT.md`、`screen-ownership.md`、`plan-v2.2/REVIEW.md`（格式）、App `AGENTS.md` 热点文件表；共享笔记 `add-invite-design-extract.md`（第一、二、三部分）。
- 设计稿：用 grep / Python 在 `index.html`、`app.html`、`b9-import-plan-v2.html`、`b11-nav-v3.html`、`b1-onboarding-cards.html` 里核对了用户决定原文、接收方「プロフィール 2/3」、表 / 裏配对、手入力文案。
- 代码（只读）：orbits `features/acquisition/business-card-ingest-v2/{repository,contract}.ts`、`app/api/contact-drafts/business-card/batches/v2/handlers.ts`、`features/contacts/{business-card-contact-match,contact-write-contract}.ts`、`features/contacts/contact-actor-links/*`、`features/contacts/import/{types,dedupe}.ts`、`app/api/contacts/import/handlers.ts`、`app/api/contacts/{handler,page/handler}.ts`、`features/contacts/storage/{contact-list-postgres-reader,contact-live-record-provider}.ts`、`features/contacts/live-detail-service.ts`（片段）、`shared/contract/{business-card-batch,invite-codes,contact-completion,source,inbox-notifications,contacts}.ts`、`shared/api-schema/{contact-card-page,mobile-contacts-dashboard}.ts`、`shared/compute/relationship-values.ts`、`shared/storage/{live-record-store,live-database-config}.ts`、`features/redesign-contracts/handlers.ts`、`features/notifications/inbox-business-projections.ts`、`features/operations/maintenance/{heartbeat,configured-tasks}.ts`、`features/plans/migrations.ts`、`proxy.ts`、`features/auth/app-auth-routing.ts`、`app/(app)/app/account/{signup/page.tsx,auth-0918/use-account-auth.ts}`、`app/(app)/app/profile/{profile-onboarding-route-policy,profile-onboarding-navigation}.ts`、`app/(app)/app/contacts/{new/page.tsx,card-batch-0918/{use-card-batch,card-batch-model,card-batch-host}.ts(x)}`、`scripts/generate-full-product-functional-audit.mjs`（计数）；App `package.json`、`app.config.ts`、`app/_layout.tsx`、`app/(app)/_layout.tsx`、`app/contacts/**` 路由文件、`src/components/OrbitRouteAccessBoundary.tsx`、`src/view-models/{app-navigation,initial-route,events}.ts`、`src/screens/contacts/{ContactAcquisitionScreen,ContactsScreen,BusinessCardIngestStartScreen}.tsx`（片段）、`src/screens/events/EventDetailScreen.tsx`（片段）、`src/hooks/useContactCardPages.ts`、`tests/route-parity{,-exceptions}.ts`、`AGENTS.md`。

**跑过的命令（都是只读）**
- `git diff`、`git log --oneline -- scripts/generate-full-product-functional-audit.mjs`。
- `node .gitnexus/run.cjs impact <符号> --direction upstream --repo . --summary-only`：`getConfiguredIngestV2`、`useCardBatch`、`createBusinessCardIngestRepository`、`findContactCandidate`、`mergeCardIntoContact`、`createLiveManualContactCreationService`、`createLiveBusinessCardContactWriteService`、`enqueuePlanMatchJob`、`NetworkImport`、`normalizeOrbitAuthReturnPath`、`createStorageContactActorLinkProvider`（LOW 3 / 2）。
- `grep` / `sed` / `wc` 核对文档中的行号、符号、枚举与调用方；`grep` 确认仓库没有取客户端 IP 的先例、没有联系人字段历史、服务端没有 ZIP 解压。

## 没做的事

- 没有重跑两端基线（R12 记录的 orbits 7041 / 0、App 4257 / 1 未独立核实）。
- 没有渲染设计稿画板截图，只核对了文字与注释。
- 没有在本机实际验证 expo-router 的 `transparentModal` 行为、`expo-clipboard` / `expo-contacts` 的构建，结论来自代码结构与常规用法。
- 没有逐条核对 DESIGN 每个设计稿画板编号与文案（只抽查了关键处）。

## 处理记录（执行人，2026-10-11）

DESIGN 升为版本 2，三个 PLANNER 升为 revision 2，GOAL 同步改了说法。逐条：

| # | 处理 | 改了哪里 |
| --- | --- | --- |
| S1 | 采纳 (a)：不给 `SourceTypeCode` 加值；招待联系人 `sourceType = 'referral'` + payload `acquisition.via = 'invite_code'`，「本人入力」由 R15 的连接表（`inviteLinkedContactIds`）判断，R11 映射成已有 `sourceChip = 'self'`。R12 给 `matchedOn` 加 `'name'` 时，同一提交先把读取端改成 `tolerantEnum` 再加值 | DESIGN §2.6、§4.1、§4.2、§8 R11 行、§9 #35、§14；R12 契约；R15 事实 4c、契约、交接 |
| S2 | 采纳：去掉服务端 `accept-clean`。「读完自动进人脈」改为两端客户端按**同一条规则**逐张调现有确认接口——规则就是 Web 现有的 `isAutoImportEligible` / `isAutoMergeEligible`，搬进 `shared/compute/card-auto-import.ts`，Web 原函数改调它（行为不变）；W0015 保留并交用户确认（§10 #5）；计划候补仍按批次完成入队，完成页未出候补时写「確認が終わると表示されます」；「会った場所」在まとめて確認里整批选、随确认一起写入（不需要事后改的路径） | DESIGN §1.1、§2.2、§3.1、§3.4、§5、§9 #5 #8 #9、§10 #5、§14；R12 单一目标、事实 3 / 9、impact、契约、范围、测试、SC-03 |
| M1 | 采纳：做表 / 裏（相机切换面，裏面配上一张表面；Web 沿用现有配对） | DESIGN §2.2、§9 #7、§10 #6；R12 GOAL、范围、测试、SC-02、SC-08 |
| M2 | 采纳推荐的省事做法：App `contacts/new` 保持普通页面，同内容的 `AddContactSheet` 组件交 R11；不碰根导航与 `parentForPath` | DESIGN §2.1、§7、§9 #3；R12 范围、SC-01 |
| M3 | 采纳：接收方补「简短资料」一步（⑨ 2/3，调现有资料保存接口）；`normalizeOrbitAuthReturnPath` 只追加 `/i/<码>` 分支（CRITICAL，写对策）；注册后 `next=/i/…` 直接回去、不先进资料引导；开放重定向用例 | DESIGN §2.5、§8 R18 行、§9 #16、§10 #1、§14；R15 事实 6、impact、范围、测试、SC-02 / 08 |
| M4 | 采纳：不用 `contact_actor_links`；新表 `invite_connections` 承载连接、共享键与同步基准值；同一对人一条生效连接（部分唯一索引），解除后再连 = 新行；并发靠数据库约束；workspace 改为单列 | DESIGN §2.6、§3.2、§9 #36；R15 事实 4 / 4b、impact、测试 |
| M5 | 采纳：新写入函数 `applyContactFieldValues`（按字段覆盖 / 清空、乐观并发、旧值进 `fieldHistory` 或 evidence，开工核对读取端后二选一）；招待统合与同步以对方为准，用户改过的字段暂停同步（`pausedFields`）；`mergeCardIntoContact` 不改、本组不新增调用方 | DESIGN §2.3、§2.6、§3.1、§9 #17 #18 #37；R12 范围、测试；R15 契约、测试、SC-06 |
| M6 | 采纳：加「同名」规则（只提示不统合），手入力查重与 v2 `duplicates` 都用；有同名候选的卡不自动进人脈 | DESIGN §2.3、§3.1、§4.1、§9 #10；R12 契约、测试、SC-05 / 06 |
| M7 | 大部分采纳：只认 `x-real-ip`；门槛放宽（预览每 IP 10 分钟 60 次，失败每小时 60 次）；登录用户按账号计数；去掉全站熔断；预览永不返回邮箱电话；只传键、值由服务端读；兑换失败也计 IP；HKDF 派生密钥；过期 30 天后按不可用。**一处不采纳**：复核建议「锁定期间真码仍可预览」——这样被锁的 IP 仍能靠「真码 200 / 假码 429」区分真假，锁定就失效了，所以锁定仍对该 IP 的所有预览生效，用放宽门槛与按账号计数解决会场误伤；理由与码空间的数学写进 §6 | DESIGN §2.5、§4.2、§6；R15 契约、测试、SC-04 |
| M8 | 采纳：草稿队列保留为新页 `contacts/new/drafts`（含 `?eventId=` 参加者取り込み）；活动 `reviewQueueHref` 改指它（R26 是甲自己的范围） | DESIGN §2.1、§2.9、§7、§8 R20 / R26 行、§9 #25、§10 #3；R12 事实 10、范围、SC-07 |
| M9 | 采纳：逐题型写清写入位置（活动 → `metEventId`；紹介 / 前職 → 备注一行；公司 → `organization` + 历史；覚えていない → 只记问题）；SC 改为「信息多一项、浓度按 D-10 重算」；`askedOn` 统一东京日 | DESIGN §2.8、§3.3、§4.3；R16 事实 5、契约、接口、测试、SC-05、GOAL |
| M10 | 采纳：§10 增至 6 项（加 W0015、表裏；接收方资料与草稿队列并入原 #1 / #3 的说明） | DESIGN §10 |
| m1 | 已修：登记表空行删除 | README |
| m2 | 已修：Web `?method=scan` → 新名片页；`?method=csv|contacts|event` 与 `?import=` 在 R16 redirect；别人文件里的旧链接靠 redirect 兼容 | DESIGN §7；R12 范围、SC-07；R16 删除、SC-06 |
| m3 | 已修：`CardBatchHost` 让位前缀收窄为 `/app/contacts/new/scan`，写进 impact 与范围 | DESIGN §2.2、§8、§14；R12 impact、范围 |
| m4 | 已修：读不出只分「读不了」与「繁忙失败」两类，细分需要改 OCR，不在本组 | DESIGN §2.2 第 8 步；R12 不做 |
| m5 | 已修：删除清单补审计脚本、离线审计、相关测试与 opening 快照 | DESIGN §13；R12、R15 删除 |
| m6 | 已修：R15 事实 4 改写 | R15 事实 4 |
| m7 | 已修：撤销是墓碑删除，并取消计划候补（找现有取消入口，没有就只追加一个） | DESIGN §2.3、§3.1；R12 impact、契约、测试 |
| m8 | 已修：R16 上传方式写成原始请求体 + 头；ZIP 在 Web 端用 `fflate` 解；权限文案在 `app.config.ts`；删掉多余的「JSON 上传分支」备选 | DESIGN §3.3、§7；R16 事实、impact、契约、交接 |
| m9 | 已修：加 `superseded_at`，履历区分作废 / 被替换 / 过期 / 满员 | DESIGN §3.2、§4.2；R15 契约、接口、测试 |
| m10 | 已修：`ManualContactCreateResult.outcome` 兜底 `duplicate_review`；redeem 请求体在 `BREAKING.md` 记一行；`exception` 字段随 S2 取消 | DESIGN §4.1、§4.2；R12、R15 契约 |
| m11 | 已修：示例模式拦截、开放重定向、`noindex` / Referer、预览不含邮箱电话都进了测试 | R12、R15 测试 |
| m12 | 已修：三个 GOAL 去掉「允许清单」「零新增失败」「限流」「防枚举」「生产迁移」等说法 | R12 / R15 / R16 GOAL |
| m13 | 已修：「双方推送」写理由（§9 #33）；連絡先改走导入写明是对 IMPLEMENTATION-PLAN 的偏离（§9 #21）；公司联想接口与出会った場所来源写明；メモ 是联系人备注 | DESIGN §2.3、§2.6、§4.1、§9 #21 #33 |
| m14 | 已修：批次通知 href 按 v1 / v2 区分 | DESIGN §7；R12 impact |
| m15 | 已修：`<title>` / OG 不带名字，抓取计入限流 | DESIGN §2.5 第 8 步、§6 第 8 条；R15 测试 |
| m16 | 已修：活动报名码改叫「参加コード」，交 R26 | DESIGN §8 R26 行、§9 #34 |

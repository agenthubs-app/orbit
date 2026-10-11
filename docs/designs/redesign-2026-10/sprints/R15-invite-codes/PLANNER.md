# Sprint R15 — 加人：招待コード

**Plan revision:** 2（按 `add-and-invite/REVIEW.md` 修订）。**模式:** existing-codebase / single-generator（执行人：小雨（甲））。**档位:** H。
**单一目标:** 迁移「invite-codes-core」（`invite_codes`、`invite_connections`、`invite_code_attempts`，本机）、`features/invite-codes/` live 服务（发码 / 当前码 / 历史 / 作废 / 公开预览 / 兑换 / 共享项目 / 解除 / 资料同步维护任务）、公开预览与兑换的限流和防枚举（DESIGN §6）、双向加入（同一事务写两条联系人 + 连接行，已有则以对方为准覆盖统合）、邀请人通知、计划候补入队；发出方两端（说明、共享、草稿、履历）；接收方 Web `/i/[code]`、`/i`（注册 / 登录回跳、简短资料、共享项目）与 App `i/[code]`、`i/index`；删除两端旧 `invitations/[token]` 页。
**易读目标:** [GOAL.md](GOAL.md)。**整体设计:** [add-and-invite/DESIGN.md](../add-and-invite/DESIGN.md)（§2.4–2.6、§3.2、§4.2、§6、§7、§8、§9 #15–#19 #22 #23 #26 #32–#37、§10 #1 #2、§11、§14）。
**基线:** R12 收口后的 `redesign` HEAD。
**进入条件:** R12 done（入口挂在「人脈を追加」上）。
**分支:** 同 R12。

## 已查清的事实（按 `5e1c385f`）

1. **契约 4**（`shared/contract/invite-codes.ts`，R08，负责人甲）：`InviteCodeContract`、`InviteCodePreview`、`InviteCodeCreateInput`（strict、`maxUses` 1–10）、`InviteCodeRedeemResult`（`connected | merged | already_connected`，`tolerantEnum` 兜底 `connected`）；码正则 `/^[A-Z0-9]{4}-[A-Z0-9]{4}$/`；redeem **没有请求体类型**。路由 5 个都 re-export `features/redesign-contracts/handlers.ts:43-60`，live 503。mock redeem 不加用量、不查过期。
2. **公开白名单**：`proxy.ts:28-30` 已放行 `/api/invite-codes/[^/]+/preview`；仓库没有通用限流器，唯一先例是重置密码的 60 秒冷却（`password-reset-crypto.ts:4`，「未知 / 被限流返回同样结果」）。
3. **旧关系邀请**：`/api/relationship-communication/invitations/**`（要登录、邮箱绑定、接受后建双人会话、不建联系人）；页面 App `invitations/[token]`（`RelationshipInvitationScreen`）、Web `/app/invitations/[token]`（`relationship-invitation-client.tsx`）；两端没有创建界面。
4. **不用 `contact_actor_links`**：它的读取用 `exactKeys`（多一个键就抛错）、撤销后不能重新激活（记录 id = `hash(owner, contactId)`）、锁在进程内；唯一读写方是活动主办账号初始化（`organizer-accounts/bootstrap.ts`；`app/api/contacts/handler.ts:40` 只把它列进水位集合）。招待连接用新表 `invite_connections`（DESIGN §3.2、§9 #36）。
4b. **workspace**：部署级 `ORBIT_WORKSPACE_ID`（`shared/storage/live-database-config.ts:57-58`），A、B 同一个 workspace、`actor_id` 不同；同一事务写两人的联系人有先例 `buildTxContactService`（`batches/v2/handlers.ts:708`）。
4c. **来源枚举**：`SourceTypeCode` 的读取端是封闭 `z.enum`（`shared/api-schema/contact-card-page.ts:10`、`app/api/contacts/page/handler.ts:42`、`contact-list-postgres-reader.ts:1252`、App `useContactCardPages.ts:95,99`）；招待联系人用已有的 `referral`。
5. **资料**：`features/profile/`（`ManualProfileContract` 有 `displayName / organization / role / offering / seeking / updatedAt`；`public-projection.ts` 白名单投影）。资料保存属于 R18（乙）。
6. **注册与回跳**：`/app/account/signup`、`/app/account/login`（R18 的页面）用 `normalizeOrbitAuthReturnPath`（`features/auth/app-auth-routing.ts:49-79`，**CRITICAL** 23 / 直接 8）只放行 `/`、`/app`、`/app/**`；注册成功后走 `profileContinuationPath`（`profile-onboarding-navigation.ts:88`）→ 资料引导。`proxy.ts` 的 matcher 只有 `/app/:path*` 与 `/api/:path*`，`app/i/**` 不经过它。
7. **通知**：`shared/contract/inbox-notifications.ts` `InboxSourceKind` 含 `contact`，`target.kind` 含 `source`；投递与每天 3 件频控在 R14 的领域（`notification-delivery-policy`）。
8. **计划候补**：`enqueuePlanMatchJob`（`features/plans/matching-repository.ts:173`，LOW）。
9. **App**：有 `react-native-svg`、`expo-linking`；没有剪贴板模块、没有 QR 库。

## 上下文包

### 必读
- DESIGN §2.4–2.6、§3.2、§4.2、§6、§8（R11、R13 / R14、R18 行）、§9、§10；共享笔记 `add-invite-design-extract.md` §4、`add-invite-contracts.md` §1、§7。
- 设计稿：`b11-nav-v3.html` A2 ①–⑧（含 Web）、`b9-import-plan-v2.html` A5 ①–⑤ 与接收方 5 屏、`b5-me-inbox.html` E6（履历）。
- 代码：`features/redesign-contracts/*`、`shared/api-schema/invite-codes.ts`、`shared/mock/demo-world/fixtures.ts`、`features/contacts/{contact-actor-links,contact-write-contract,business-card-contact-match}.ts`、`features/profile/{service,public-projection,self-profile-reader}.ts`、`features/notifications/*`（收件箱写入入口）、`features/operations/maintenance/configured-tasks.ts`、`features/plans/migrations.ts`（迁移写法）、`proxy.ts`、`features/auth/app-auth-routing.ts`。

### 关键符号与 impact（开工时重跑）
- `isPublicApiPath`（`proxy.ts`）：预览已在白名单；`/i/**` 是页面不是 API，不加；兑换要登录，不加。
- `normalizeOrbitAuthReturnPath` **CRITICAL** 23：只追加一个完全匹配 `/i/<码>` 的分支（DESIGN §2.5 第 2 步），已有分支不改；注册页 / `use-account-auth.ts` 只改「`next` 是 `/i/…` 时直接回去、不先进资料引导」一个分支（R18 的文件，REPORT 通知乙）；开放重定向回归测试。
- 资料保存接口（R18）：接收方简短资料页只调用，不改。
- `contact_actor_links`：不用、不改。
- `saveContact` / `findContactCandidate`（HIGH）：只调用；统合与同步用 R12 的 `applyContactFieldValues`（以对方为准覆盖、旧值进历史）。
- 维护任务表 `configured-tasks.ts`：只追加一个任务 `invite_profile_sync` 和 `invite_attempts_cleanup`（只追加，不改已有项）。
- 收件箱写入：用现有写入入口，不改投影规则；推送频控用现有策略。
- `redesign-contracts` 的 `invite-codes` capability：加 live 实现（`service-factory.ts`），mock 保留。

### 易错边界（全部写进 SC）
码含姓名或可推测；预览返回了邮箱或电话；客户端能决定对方看到的值（应只传键）；伪造 `x-forwarded-for` 绕过限流；会场共用 IP 下十几次输错就锁住所有人；被锁的 IP 仍能靠响应区分真假码；HMAC 直接复用 `AUTH_SECRET`；同一人同时有两个有效码；过期码仍能兑换；作废后预览仍返回 200；第 11 个人兑换成功；并发兑换超过 10；同一人重复兑换占两次用量；B 已与 A 连着时用 A 的新码又占一次用量；解除后不能再连；兑换自己的码；未知码 / 作废码 / 格式错的响应可区分；失败计数没生效或跨 IP 串扰；限流密钥缺失时退化为不限流；日志里有完整码或原始 IP；兑换人没登录也能兑换；共享了没选的字段（邮箱、电话默认关）；双方中有一方没建出联系人（事务不完整）；已有对方名片时建出重复卡；两个方向的统合只做了一个；`already_connected` 占用量；连上后没入队计划候补；同步改了用户自己写的备注；解除只撤了一边；解除通知了对方；解除后同步还在跑；注册回跳被利用成开放重定向；注册后掉进完整资料引导回不到邀请页；新注册的人资料是空的、对方只看到一个名字；我改过的字段被同步覆盖；链接预览（LINE / Slack）里出现邀请人名字；`/i/[code]` 被搜索引擎收录或 Referer 泄露码；示例模式下发码写库；消息草稿出现「送信」按钮。

## 契约（第一天提交）

`shared/contract/invite-codes.ts` 只加（DESIGN §4.2）：`InviteSharedFieldKey`；`InviteSharedFields` 可选 `offering / seeking / email / phone`（只出现在响应里，预览永远不含 `email` / `phone`）；`InviteCodeCreateInput` 可选 `sharedKeys`（live 只认键、值由服务端从资料读）；`InviteCodePreview` 可选 `status / inviterAlreadyConnected / isOwnCode`；新 `InviteCodeRedeemInput { idempotencyKey; sharedKeys }`（strict；R08 的 redeem 原来没有请求体，`BREAKING.md` 记一行说明——只有 mock 在用）；`InviteCodeRedeemResult` 可选 `peer`；新 `InviteCodeHistoryItem / InviteCodeHistoryResponse`（`status` 含 `superseded`，宽进兜底 `expired`）；新 `InviteConnectionView`（含 `pausedFields`）、`InviteShareUpdateInput`（strict）、`InviteUnlinkInput`（strict）/ `InviteUnlinkResult`。**不改** `SourceTypeCode`。`shared/compute/invite-code-format.ts`、`shared/compute/invite-message-templates.ts`。mock 改为递增用量、检查过期与上限、返回 `already_connected`；演示世界补历史 2 条、`already_connected` 1 例（`sample: true`，`demoFixturePeopleRefs` 登记）。快照 `--write`、parity、App 同步。

| 接口 | 说明 |
| --- | --- |
| `POST /api/invite-codes`（live） | 发码 / 再发行：同一事务给本人未作废、未替换的码写 `superseded_at` 再建新码；只认 `sharedKeys`；幂等键重放；示例模式拦截 |
| `GET /api/invite-codes/current`（live） | 当前可用码或 null（过期的不返回） |
| `GET /api/invite-codes`（新） | 历史（最近 20 个码，状态 有効 / 期限切れ / 無効 / 置き換え / 上限，每个码加入的人） |
| `POST /api/invite-codes/[code]/revoke`（live） | 只能作废自己的码；他人或不存在 404 |
| `GET /api/invite-codes/[code]/preview`（live，公开） | DESIGN §6；统一 `INVITE_UNAVAILABLE`（404 / 429）；过期（30 天内）、满员返回带 `status` 的预览；永不返回邮箱电话；登录时多给 `inviterAlreadyConnected`、`isOwnCode` |
| `POST /api/invite-codes/[code]/redeem`（live，要登录） | `InviteCodeRedeemInput`；同一事务：校验、占用量、双方建 / 统合联系人（值从双方资料按键读）、连接行；事务外：通知邀请人、双方入队计划候补；已连接 `already_connected` 不占用量；自己的码 409 `OWN_CODE`；失败同时计入 IP 失败桶 |
| `GET /api/invite-codes/connections/[contactId]` | 这条联系人是不是招待连接、双方各共享了什么、哪些字段因我改过而暂停同步 |
| `PUT /api/invite-codes/connections/[contactId]/share` | 改我共享给对方的项目（下一轮同步生效） |
| `POST /api/invite-codes/connections/[contactId]/unlink` | 解除（DESIGN §2.6）；不通知对方 |

导出给 R11 的服务端函数：`inviteLinkedContactIds(actorId)`。

## 范围与文件

- **新建（服务端）**：`features/invite-codes/{migrations,repository,service,rate-limit,client-ip,sync,configured,contract}.ts`；`app/api/invite-codes/**` 新路由 4 个（history、connections 三个）；`features/redesign-contracts/service-factory.ts` 加 live；维护任务 `invite_profile_sync`、`invite_attempts_cleanup`（`configured-tasks.ts` 只追加）。
- **新建（Web）**：`app/i/[code]/page.tsx`、`app/i/page.tsx`（公开、壳外、`noindex, nofollow`、`Referrer-Policy: no-referrer`、`<title>` / OG 不带名字、响应式 390 → 560、按浏览器语言选文案）；接收方步骤：打开 → 注册 / 登录（`next=/i/<code>`）→ 简短资料（调现有资料保存接口）→ 共享项目 → 完成；各异常状态；`orbit-2026/add/invite/`（发出方 Modal：说明、QR 卡、共享项目开关、草稿 sheet、履历）；`orbit-2026/invite-landing/`；`orbit-2026/copy/invite.ts`；`AddContactDoors` 打开招待门（`?add=invite`）与右栏「いちばん早い方法」。
- **新建（App）**：`app/contacts/new/invite.tsx`、`app/i/[code].tsx`、`app/i/index.tsx`；`src/screens/add/invite/**`；`InviteShareSheet` / `InviteUnlinkSheet`（组件，放展示页，给 R11 的详情页挂）；`src/i18n/*/add.ts` 追加招待文案；入口页打开招待项。
- **依赖**：两端 `qrcode-generator@1.4.4`（纯 JS）；App `expo-clipboard`（Expo SDK 57 对应版本，`npx expo install`；重建模拟器开发包）。
- **修改**：`normalizeOrbitAuthReturnPath` 追加 `/i/` 分支；注册 / 登录成功后 `next` 为 `/i/…` 时直接回去（R18 的文件，最小改动，通知乙）；路由登记（App 4 处：`i/**` 公开、`contacts/new/invite` 私有；Web 审计计数，`/i/[code]`、`/i` 是公开页）；`initial-route.ts` 识别 `https://<域名>/i/<code>` 与 `orbit://i/<code>`。
- **删除**：App `app/invitations/[token].tsx`、`RelationshipInvitationScreen.tsx` 及只被它用的 view-model / 测试（`relationship-invitation-screen-source`）/ 登记 / 允许清单行；Web `app/(app)/app/invitations/[token]/**` 及允许清单行、审计计数与 `generate-full-product-functional-audit.mjs` 引用。旧关系邀请接口保留（DESIGN §9 #26）。
- **不做**：NFC（§10 #4）；接收方一屏建账号（§10 #1）；关联域名文件（部署项，§11）；マイページ入口（R18）；联系人详情上挂解除 / 共享组件（R11）。

## 测试

- `invite-codes-migrations-postgres.test.ts`：从零、重跑、约束（每人一个可用码、`used_count ≤ max_uses`、码全局唯一、同一对人只有一条生效连接）。
- `invite-codes-service.test.ts`（内存 + Postgres 各一套）：发码替换旧码（`superseded_at`）；幂等；过期 / 作废 / 被替换 / 满员兑换失败；并发 20 个兑换剩 1 人的码只成功 1 个；同一人重复兑换、或 B 已与 A 连着时用 A 的新码 → `already_connected` 不占用量；自己的码 409；双向建联系人且只含选择共享的键、值来自资料（客户端传的 `shared` 值被忽略）；已有对方名片（两个方向各一例）→ `merged`，共享字段以对方为准、旧值进历史；连接行；通知邀请人一条、接收方不推送；双方入队计划候补；解除后用新码再连成功；他人隔离（不能作废 / 查看 / 解除别人的）；示例模式拦截发码。
- `invite-codes-rate-limit.test.ts`：DESIGN §6 第 10 条全部。
- `invite-codes-return-path.test.ts`：`/i/<码>` 放行；`next=//evil.example`、`/i/../app/admin`、`%2F`、`/i/<码>?x=//evil`、超长 → 回 `/app/home`；已有分支的现有用例全部不变；注册后 `next=/i/…` 不先进资料引导。
- `invite-codes-sync.test.ts`：对方改资料 → 一轮后共享字段更新、旧值进历史、备注不动；我改过的字段暂停同步并出现在 `pausedFields`；改共享项目 → 下一轮清掉；解除后不再同步。
- `invite-codes-unlink.test.ts`：连接 `unlinked_at`；我这边按勾选保留（只剩名字和公司）/ 墓碑删除；对方那条新建的墓碑删除、统合的只结束连接；不发通知。
- 页面：`/i/[code]` 响应头含 `noindex` 与 `no-referrer`，`<title>` / OG 不含邀请人名字。
- 路由测试：mock 与 live 全部接口；公开预览未登录可读、兑换未登录 401。
- 两端渲染：发出方 说明（第二次跳过）/ QR 卡 / 共享开关默认值 / 草稿三语气无「送信」/ 作废确认 / 履历五种状态；接收方 未登录 / 简短资料 / 已登录确认 / 已有名片提示 / 完成 / 期限切れ / 满员 / 不可用 / 已连接 / 自己的码 / 手输码校验。
- 端到端：Web Playwright 两个浏览器上下文（A 发码、B 注册 → 资料 → 兑换），断言双方人脈各 +1、A 收到通知；App 渲染测试走发出方全流程。
- 门禁同 R12。

## 验收契约

| SC | 操作链 | 主证据 |
| --- | --- | --- |
| SC-R15-01 发码 | 两端：说明（第一次）→ 共享（QR、码、链接、复制、草稿 sheet、共享项目开关）→ 作废 → 再发行；履历列出状态与加入的人 | 渲染测试 + 截图（b11 A2 ①–③、b5 E6 履历对照） |
| SC-R15-02 兑换 | 未注册（注册 → 回到 `/i/<code>` → 简短资料）/ 已登录 / 已有对方名片 三条路径都连上；双方人脈各多一人（本人入力，只含选择共享的项、值来自资料）；`merged` 两个方向；邀请人收到通知；双方入队计划候补 | 服务 + 端到端 |
| SC-R15-03 异常 | 过期、满员、作废、被替换、不存在、格式错、自己的码、已连上 → 对应画面；「新しいコードを頼む」只是草稿 | 渲染 + 路由测试 + 截图（b11 A2 ⑦⑧） |
| SC-R15-04 限流与防枚举 | DESIGN §6 第 10 条全部；README 合回前清单「公开邀请预览有限流和防枚举」打勾 | `invite-codes-rate-limit` |
| SC-R15-05 并发与上限 | 并发兑换不超过 10；每人一个可用码；同一对人一条生效连接；幂等重放 | 服务测试（Postgres） |
| SC-R15-06 同步与解除 | 对方改资料一轮内同步、旧值进历史、我改过的暂停；改共享项目生效；解除两边、不通知、按勾选保留 / 删除；解除后可再连 | `sync`、`unlink` 测试 |
| SC-R15-07 旧邀请页已删 | 两端 `invitations/[token]` 文件删除、允许清单与登记同步、`screen-ownership.md` 两行改「已处理」 | 测试 + 文件检查 |
| SC-R15-08 迁移与回跳 | 本机从零、重跑、约束；生产迁移列入授权清单（含只读预检）；回跳只放行 `/i/<码>`、开放重定向用例全过 | 迁移测试 + `return-path` 测试 + REPORT |

### 必需证据子表

| SC | 子断言 | 证据 |
| --- | --- | --- |
| 01–03 | 截图对照页：b11 A2 ①–⑧ / Web、b9 A5 ①–⑤、b5 E6 ↔ 实现，浅色 / 深色；`/i/<code>` 在 390 与 1024；App 用内置模拟器 | `~/orbit-sprint-evidence/redesign/R15/run-01/compare.html` |
| 02 | 两个本机账号真实兑换一次的点击记录（不用种子直写） | `click-verify.log` |
| 全部 | 三语、`copy:qa` 0、门禁零新增；两端全量零新增失败；`tsc`、`typecheck:app`、`lint`；`detect-changes` | 全量清单 |

## 执行顺序

1. 全量重建索引、impact（含 `normalizeOrbitAuthReturnPath`）；契约提交。
2. 迁移 → 仓储 → 客户端 IP 与限流（RED 先写 §6 测试）→ 服务（发码、预览、兑换）→ 同步与解除 → 维护任务 → 路由与 live。
3. 回跳分支（RED 先写开放重定向用例）→ Web 接收方 `/i`（注册回跳、简短资料、共享项目）→ Web 发出方。
4. App 依赖与开发包重建 → 发出方 → `i/[code]`。
5. 删旧邀请页、登记与审计、允许清单。
6. 全量、REPORT、`detect-changes`、提交推送；独立复核 → 修复 → 模拟器走查（两个账号：模拟器发码、Web 兑换）。

## 失败与交接

- 同一事务写两人的联系人遇到存储限制：按 `buildTxContactService` 的写法；仍不行时退为「先写连接行（pending）→ 两条联系人 → 置 connected」的可重入步骤，REPORT 写明。
- 注册页回跳改动超出「一个分支」：停下，REPORT 写方案，交乙（R18）决定。
- `expo-clipboard` 安装或开发包构建失败：复制改用系统共享表（`Share`），REPORT 写明，下一次能构建时再换。
- 交接给 R11：`InviteShareSheet` / `InviteUnlinkSheet`、`InviteConnectionView`、`inviteLinkedContactIds` → `sourceChip = 'self'`（`sourceType` 仍是 `referral`）、`fieldHistory` 与 `pausedFields`；给 R13 / R14：「邀请被接受」通知用现有枚举、推送计入 3 件、App 推送白名单需要 `/contacts/*`；给 R18：マイページ入口链接 `contacts/new/invite`、资料同步不需要改资料保存；合回前：生产迁移、`ORBIT_INVITE_RATE_SECRET`、邀请链接域名、通用链接关联文件、App 新原生依赖的 TestFlight 构建。

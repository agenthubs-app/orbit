# Sprint R15 — REPORT（加人：招待コード）

**执行人：** 小雨（甲）的执行会话（主会话编排，四个子任务依次实现），2026-10-11。**分支：** 直接在 `redesign` 上提交。
**依据：** [PLANNER](PLANNER.md)（revision 2）、[add-and-invite/DESIGN.md](../add-and-invite/DESIGN.md)（版本 2）。
**证据目录：** `~/orbit-sprint-evidence/redesign/R15/run-01/`。
**没有做的事：** 没连 Neon、没部署、没做生产迁移（迁移只在本机库跑）；没有任何付费 AI 调用。

> **2026-10-11 新规则（README 通用规则 11，逐像素门禁）在本 Sprint 实现完成后才加入**。本 Sprint 的功能、测试、复核照原计划做完；像素门禁的结果与「偏离设计稿、请用户拍板」的条目见文末两节。按新规则，**本 Sprint 不标 done**。

## 做了什么

1. **契约（第一天，`be51e830`，App 副本同提交）**：契约 4 只加不改——共享项目只传键（`InviteSharedFieldKey`）、预览状态（`active / expired / full`）、`isOwnCode`、`inviterAlreadyConnected`、兑换请求体 `InviteCodeRedeemInput`（`BREAKING.md` 记一行说明）、`peer`、历史、连接视图、改共享项目、解除；`InviteCodeFailureReason`。`shared/compute/invite-code-format.ts`（字母表、规范化、手输提示、`isInviteCodePath`）、`invite-message-templates.ts`（三种语气 × 三语、请对方重发）。mock 兑换真实计数；演示世界补历史与连接。
2. **服务端（`aeeabf69`）**：迁移「invite-codes-core」（`invite_codes`、`invite_connections`、`invite_code_attempts`，本机）；发码（替换旧码写 `superseded_at`）、当前码、历史、作废、公开预览、兑换（双方联系人 + 连接行 + 用量 + 计划候补都在**一个** Postgres 事务里；通知在提交后写）、连接视图、改共享项目、解除；`inviteLinkedContactIds`（给 R11）；客户端 IP 只认 `x-real-ip`、HMAC（HKDF 派生）、DESIGN §6 的全部限流规则；维护任务 `invite_profile_sync`、`invite_attempts_cleanup`；`normalizeOrbitAuthReturnPath` 只追加 `/i/<码>` 分支，注册 / 登录后 `next=/i/…` 直接回去（R18 的文件，见交接）；`scripts/migrate-web-runtime.ts` 追加本迁移。
3. **Web（`b9adf33f`）**：接收方 `/i/<code>`、`/i`（公开、无壳、按浏览器语言、title / OG 不带名字、`noindex`、`no-referrer`；打开 → 注册 / 登录回跳 → 简短资料 → 共享项目 → 完成；期限切れ / 满员 / 不可用 / 被限流 / 已连接 / 自己的码 / 手输码）；发出方弹窗（说明、QR、草稿三语气、履历、作废）与右栏入口；删除 `/app/invitations/[token]`；新依赖 `qrcode-generator@1.4.4`。
4. **App（`f4cf1bdb`）**：发出方 `contacts/new/invite`（说明、QR、复制（`expo-clipboard`）、草稿 sheet、共享项目、作废、履历）；接收方 `i/[code]`、`i/index`；`initial-route` 识别邀请链接；`InviteShareSheet` / `InviteUnlinkSheet` 放展示页给 R11；删除 `invitations/[token]` 与 `RelationshipInvitationScreen`；开发包已重新构建。

## SC 对照

| SC | 结论 | 证据 |
| --- | --- | --- |
| 01 发码 | ✅（模拟器发现草稿 sheet 不随离开页面关闭，待修） | 两端渲染测试；模拟器 `app-invite-guide/…/draft/…/history-light.png` |
| 02 兑换 | ✅ | 服务测试（内存 + Postgres）；Web Playwright 两浏览器端到端（`e2e-web-C.log`）；本机走查：内置浏览器以 `verify-event@orbit.test` 打开 QA 的码 `EVPE-N93F` →「建立联系」→ 库里 `invite_connections` 一行、双方各一条 `acquisition.via = invite_code` 的联系人；App 发出方显示「剩余 9/10 · 已加入 1 人」与履历 |
| 03 异常 | ✅ | 渲染 + 路由测试；模拟器「自己的码」「无法使用」 |
| 04 限流与防枚举 | ✅ | `invite-codes-rate-limit`（DESIGN §6 第 10 条全部） |
| 05 并发与上限 | ✅ | Postgres 并发兑换只成功到上限；每人一个可用码；同一对人一条生效连接 |
| 06 同步与解除 | ✅（详情页入口属 R11） | `invite-codes-sync`、`invite-codes-unlink` |
| 07 旧邀请页已删 | ✅ | 文件已删；允许清单与登记同步 |
| 08 迁移与回跳 | ✅ | 迁移测试；`invite-codes-return-path`（19 个开放重定向用例） |

## 自定决定（只限实现细节；涉及设计稿的偏离见「请用户拍板」）

| # | 事项 | 决定 | 理由 |
| --- | --- | --- | --- |
| 1 | 计划候补入队 | 放在兑换事务里（savepoint 隔开，失败不影响兑换） | 与 R12 写法一致，和建联系人同生同死 |
| 2 | 资料没名字 | 发码 / 兑换 409 `PROFILE_REQUIRED`，界面引导去填 | 名字是必填共享项 |
| 3 | 查重只用对方选择共享的值 | 没共享的邮箱电话不拿来匹配 | 不泄露对方没给的信息 |
| 4 | 提供 / 求めている 写进联系人 `publicProfile.offering / seeking` | 多值用「、」连接，旧值进 `fieldHistory` | R11 显示历史时要认这两个字段名 |
| 5 | 连接表多加列 | 两边联系人是否由招待新建、解除的幂等键与是否保留 | 解除时决定删还是只结束连接 |
| 6 | 链接域名 | `ORBIT_PUBLIC_ORIGIN`，缺省 `https://orbitailink.com` | 契约 fixture 的域名 |
| 7 | Web 页面读码 | 直接调同一服务与限流器，不经路由文件 | 路由文件会把演示数据带进公开页；测试证明共用同一批限流桶 |
| 8 | 改共享项目 | 重新发码 | 服务端没有修改当前码的接口 |
| 9 | App 解除确认不因点遮罩关闭 | 给 `BottomSheet` 传空的关闭回调 | 组件库归乙，不改；副作用是拖动也关不掉，只能点「キャンセル」 |

## 基线 → 收口

| | 基线（R12 收口 `fdca1302`） | 收口（`f4cf1bdb`） |
| --- | --- | --- |
| orbits `npm test`（连本机 `orbit_test`） | 7184 条，失败 1（偶发） | 7372 条，失败 1：整项目类型检查测试——本机 `.next-verify/dev/types` 是今早生成的缓存，还引用被删的 `/app/invitations/[token]`；清掉这份 gitignore 的缓存后单独重跑通过（2/2），干净检出不受影响 |
| App `npm test` | 3934 / 0 | 3959 条，0 失败 |
| orbits `typecheck` / `typecheck:app` / `lint` | 0 | 0（清缓存后）/ 0 / 0 |
| App `tsc` | 0 | 0 |
| `copy:qa` | 2160 / 0 | 0 问题 |

## GitNexus

- 关键 impact（`impact-A.md`～`impact-D.md`）：`normalizeOrbitAuthReturnPath` **CRITICAL**（23 / 8）只追加分支、原分支不变、19 个开放重定向用例；`profileContinuationPath` HIGH（R18 文件）只加首行分支；`resolveSupportedInitialRouteHref` **CRITICAL**（直接 7）只在开头追加分支；`addSearchFor` / `resolveAddContactRoute` 报 CRITICAL（图上经页面链路算出，文本确认只有入口页与测试）只追加字段；联系人写入、查重、收件箱写入只调用。
- 收口 `detect-changes --scope compare --base-ref fdca1302`（`detect-changes-close.log`）：159 个文件、264 个符号、256 条流程、风险 critical——区间里混有另一个会话的像素盘点与门禁工具提交（`5483ed70`、`d74298aa`、`b1aa19f3`），以及上述 CRITICAL 符号的只追加改动。

## 已知问题（复核时一起处理）

- App：「メッセージで送る」的草稿 sheet 打开后离开页面（打开 `i/<码>` 等）仍浮在新页面上，要手动划掉。
- Web 接收方打开页没有「今はしない」以外的「アプリで続ける」真机验证；App 接收页去掉了「アプリは不要」小字（人已在 App 里）。
- 履历里每个加入的人单独读一次联系人（最多约 200 次）。
- App `phoneweb-journey-support.mjs` 里旧 `/invitations/[token]` 样例条目没清。

## 像素门禁（README 通用规则 11）

本 Sprint 实现时规则尚未生效，PLANNER 没有逐画面像素 SC。按 2026-10-11 像素盘点的结论（导航壳、主标题区、抽屉细节等共性问题在所有画面上都超阈值），本 Sprint 的画面目前不会通过；复核时按 HOW-TO 第 8 节跑一轮并把结果补在 REVIEW。逐像素返工排在导航壳返工与用户拍板之后（盘点建议的返工顺序第 5 位「加人」）。

## 请用户拍板（规则 11：偏离设计稿不再自定）

沿用像素盘点第 3 节已登记的 D30（码不含姓名）、D31（接收方用现有注册 + 简短资料）、D32（只通知邀请人）；本 Sprint 新增：

| # | 画面 | 设计稿 | 现在 | 原因 |
| --- | --- | --- | --- | --- |
| P1 | 发出方「相手に届くあなたの情報 [変更]」 | b11 A2 ②：直接改 | 改了要重新发一个码 | 没有改当前码共享项目的接口；要照稿得加接口 |
| P2 | App 接收页小字 | ⑨ / ⑪：「登録は1分 · クレジットカード不要 · アプリは不要」 | App 里去掉「アプリは不要」 | 人已经在 App 里，这句话不成立 |

## 交接

- **乙（R18）**：`profile-onboarding-navigation.ts` 的 `profileContinuationPath` 与登录回跳加了「`next=/i/<码>` 直接回去」一行；マイページ「招待コード」入口链接 `contacts/new/invite`。
- **乙（R11）**：`inviteLinkedContactIds` → `sourceChip = 'self'`；`InviteShareSheet` / `InviteUnlinkSheet`（展示页）挂到联系人详情；`publicProfile.offering / seeking` 与 `fieldHistory`；同步暂停字段 `pausedFields`。
- **乙（R13 / R14）**：「邀请被接受」通知用现有 `contact` / `source`；App 推送白名单需要 `/contacts/*`。
- **合回前授权**：生产迁移 `invite-codes-core`（先迁移后部署；只读预检三张表不存在）、`ORBIT_INVITE_RATE_SECRET`、邀请链接正式域名（`ORBIT_PUBLIC_ORIGIN`）、通用链接关联文件、App 新原生依赖（`expo-clipboard`）的 TestFlight 构建。
- 本机库留有走查数据：QA 的码 `EVPE-N93F` 与它和 `verify-event` 的连接，以及子任务 C 端到端建的两个一次性账号 `r15-e2e-*@orbit.test`。

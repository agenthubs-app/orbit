# Sprint R15 — REVIEW（独立复核）

**复核人：** 独立 AI 复核会话，2026-10-11。全新上下文，没参与实现，也没看执行会话的推理。
**对象：** `be51e830`（契约）、`aeeabf69`（服务端）、`b9adf33f`（Web）、`f4cf1bdb`（App）、`ea191af5`（REPORT）。基线 `fdca1302`。区间里另有别的会话的像素工具 / 盘点提交（`5483ed70`、`d74298aa`、`b1aa19f3`），不在本次复核范围。文中行号都按 `ea191af5`（= 复核时的 HEAD；工作区里只有用户自己的无关文件）。
**依据：** PLANNER（revision 2：SC-R15-01～08、易错边界、必需证据子表）、GOAL、REPORT；`add-and-invite/DESIGN.md` §2.4–2.6、§3.2、§4.2、§6、§9、§14；`sprints/README.md` 通用规则 1–11（尤其规则 11 逐像素）；`HOW-TO-START-A-FEATURE-SPRINT.md` 第 8 节；`maintenance/2026-10-11-pixel-audit.md`；`repos/orbits/scripts/visual/README-redesign.md`；格式按 `R12-add-cards-and-manual/REVIEW.md`。

REPORT 只当线索。下面的结论来自复核人重读代码、重跑测试，以及 scratchpad `r15-review/` 里的三个临时探针：`security-probe.test.mts`（P1–P10：限流、防枚举、日志、越权、客户端传值、事务回滚、并发、回跳、密钥）、`hijack2-probe.test.mts`（隐藏邮箱统合）、`sync-scale-probe.test.mts`（同步超过 500 条连接）。探针只连本机 `orbit_test`（随机 schema，用完删除）。

## 结论：不通过（有 1 个 S）

修完 S1、M1–M3，补齐 M4 的证据，就可以登记为「功能已复核，问题已修」；像素门禁按规则 11 仍然是「未过」（见「像素门禁」一节），本 Sprint 不能标 done，这一点与 REPORT 一致。

R15 的安全骨架做得认真：防枚举的 404 逐字节相同（连响应头都一样），伪造 `x-forwarded-for` 无效，被锁的 IP 连真码也 429，日志只有码的前 2 位和 HMAC 后 IP，HKDF 派生与「都缺就 503」都成立；兑换在一个 Postgres 事务里，中途失败什么都不留；并发与「同一对人一条生效连接」由数据库约束保证；回跳白名单 25 种绕过写法全部挡住；客户端传的 `shared` 值确实被忽略；越权（作废 / 查看 / 改共享 / 解除别人的）全部 404。

为什么不通过：**兑换时的自动统合会用对方自己填的、未经验证的资料覆盖我人脈里已有的那个人**（S1）——拿到码的人只要把资料的名字 + 公司（或邮箱）填成我人脈里某个人的，就能把那条联系人的邮箱、电话改成他自己的，并被标成「本人入力」；反方向，邀请人用一个预览里看不到的邮箱，就能把兑换人人脈里的另一个人改名。另外：解除时「保留为联系人」会把统合前我自己原有的值一起清掉（M1）；资料同步在全站生效连接超过 500 条后，排在后面的连接永远不会被同步（M2）；App 草稿 sheet 离开页面后仍浮着（M3，REPORT 已知问题第一条，根因已确认）；PLANNER 必需证据里的对照页与点击记录没有（M4）。

### 已经做到、复核人独立核实过的部分

**测试与检查真实通过。** 都在 `ea191af5` 上跑，Postgres 只用本机 `orbit_test`：

| 范围 | 结果 |
| --- | --- |
| orbits R15 相关 26 个文件：`invite-codes-{routes,migrations-postgres,rate-limit,return-path,service,sync,unlink}`、`domain/invite-{code-format,message-templates}`、`ui/invite-{codes-flow,landing,model,sender}`、`ui/add-contact-{model,screens}`、`api/redesign-contract-routes`、`api-schema/invite-codes-r15-schema`、`contracts/demo-world-consistency`、`copy-qa-check`、`web-route-transport`、`configured-maintenance-reminder-wiring`、`web-runtime-migration`、`no-hardcoded-copy`、`orbit-2026-{css-tokens,scope}` | 236 / 236（含全部 Postgres 用例：迁移约束、并发 20 兑换剩 1 名额只成功 1 个、双向统合、同步、解除） |
| App 16 个文件：`invite-code-{model,screens}`、`initial-route`、`add-contact-screens`、`app-wide-route-coverage`、`mobile-route-access`、`route-parity`、`no-hardcoded-copy`、`legacy-ui-ratchet`、`ionicons-ratchet`、`contract-{sync,fixtures-parse}`、`endpoints`、`app-locale-relationships-events`、`i18n-domain-split`、`copy-sync` | 148 / 148 |
| orbits `typecheck`、`typecheck:app`、`lint`；App `tsc --noEmit` | 都是 0 错误 |
| `copy:qa` | 2510 条 0 问题 |

没跑：Web Playwright 两浏览器端到端（`tests/e2e/invite-codes-two-browsers.e2e.test.ts`，REPORT 有 `e2e-web-C.log`）与两端全量。

**防枚举与限流（SC-R15-04，DESIGN §6）。** 探针 P1–P3、P10 与代码逐条对照：
- 已作废的真码、不存在、`abc`、`%2e%2e`、5000 字符的码：状态、全部响应头、响应体五者逐字节相同（`handlers.ts:66-69` 共用一个 `unavailableResponse`）。
- IP 只认 `x-real-ip`（`client-ip.ts:10-14`）：只有 `x-forwarded-for` → `local` 桶；`1.2.3.4, 5.6.7.8`、`<script>` → `local`。前提是平台覆盖写入 `x-real-ip`（Vercel 如此，见 m2）。
- 匿名 60 次失败后，同一 IP 用真码也是 429（`rate-limit.ts:145`）；兑换失败同时计 IP 失败桶与账号失败数（`:165-169`），兑换前也查 IP 锁（`:159`），IP 被锁时兑换也 429。
- 密钥：只有 `AUTH_SECRET` 时 HKDF 派生（与原密钥不同），两者都缺 → `null` → 预览 / 兑换 503（`handlers.ts:182,207`）；页面 `/i/<code>` 同样不退化（`load-invite.ts:77-78`）。
- 日志样例 `{"code":"QF","event":"invite_code_preview_unavailable","ip":"b9a9d0c91f1c9e84"}`：只有前 2 位与 HMAC 前 16 位；探针断言日志里没有完整码（带或不带连字符）。
- 预览（`includeContact: false`，`service.ts:379`）永远没有邮箱 / 电话；P4 里发码时客户端传 `shared: { displayName: "EVIL", email: … }`，响应的 `shared` 仍是服务端从资料读的值；兑换请求体多一个 `shared` 键 → 400（strict）。
- 本机 3000 端口实测：`/i/H8MW-4QZT`、`/i/ZZZZ-ZZZZ`、`/i` 都有响应头 `Referrer-Policy: no-referrer`、`<meta name="robots" content="noindex, nofollow, nocache">`、`<title>`/`og:title` 只有「Orbit への招待」。

**事务完整性与并发（SC-R15-05）。** P7：在 Postgres 上让 `insertConnection`（占用量、双方联系人都已写之后）抛错 → 库里联系人 0 条、`used_count` 0、连接 0、计划候补任务 0；同一个幂等键重试 → `connected`。P8：15 个人并发兑换 `maxUses = 3` 的码 → 恰好 3 个成功、`used_count = 3`；同一个人 8 个不同幂等键并发 → 1 个 `connected` + 7 个 `already_connected`，`used_count = 1`，连接 1 行。锁顺序（码行 `for update` → 这对人的 advisory 锁；发码只锁本人）没有环。计划候补入队在 `enqueuePlanMatchJob` 自己的 savepoint 里（`matching-repository.ts:211-236`），失败不会让整个事务进入 aborted 状态。

**越权（P5）。** Carol 对 Alice 的码作废、对 Bob 那边的联系人查看连接 / 改共享 / 解除 → 全是 404；Alice 拿 Bob 那边的联系人 id 解除 → 404（`findActiveConnectionForContact` 同时要求 actor 与 contact 在同一边，`repository.ts:223-231`）；Carol 的履历 0 条。示例模式：`x-orbit-sample: 1` 写操作 403；未登录兑换 401。

**回跳（SC-R15-08）。** P9 对 `normalizeOrbitAuthReturnPath` 与 `profileContinuationPath` 各跑 25 种：`/i/%2e%2e/app`、`/i/../app/admin`、`/I/…`、小写码、`/i\evil`、`/i/码/../../evil`、带 `?x=//evil` / `#//evil`、`//evil`、`/\t/evil`、全角 `ｉ` / `Ｋ`、`/i%2F码`、CRLF、结尾换行、`/app/../i/码`、绝对 URL、`/%2F%2Fevil`、结尾斜杠、`/i//evil` → 全部回 `/app/home`（或资料引导 → `/app/home`）；只有 `/i`、`/i/XXXX-XXXX`、`/i/XXXXXXXX` 原样放行。`/i` 分支在原有分支之前、只做「完全匹配或回退」，原有分支没动（`app-auth-routing.ts:66-70`）。

**功能。** 同步（暂停字段、关掉共享键清空、解除后停）、解除两边效果、再连接、`already_connected` 不占用量、通知只给邀请人一条（`semanticKey` 按连接 id）、计划候补双方入队、`inviteLinkedContactIds` 都有 Postgres 用例且通过；复核人读代码确认与 DESIGN §2.6 一致，例外见 S1、M1、M2。

**界面与清理。** 两端「送信」只出现在「Orbit は送信しません」这类说明里，没有发送按钮；新目录没有写死颜色、没有 Ionicons（门禁通过）；三语齐全（`copy:qa` 0）。允许清单只减不增：App `legacy-ui-allowlist.json` 删 1 项（`RelationshipInvitationScreen`）、Web `hardcoded-copy-legacy-allowlist.json` 删 1 项（`relationship-invitation-client.tsx`），没有新增行。删除的测试与删除的代码成比例：两个只测旧邀请页的文件、`endpoints.test.ts` 里只测已删两个路径函数的 1 条、`app-locale-relationships-events` 里已删屏的 1 行登记；没有删多。

## 问题清单

### S（必须修）

**S1 兑换时自动统合用对方未经验证的资料覆盖我已有的联系人，可被用来冒充 / 改写别人。**
- 现象：`service.ts:219-244` `placePeer` 用 R12 的 `findContactCandidate`（邮箱 / 电话 / 姓名 + 公司）在**两边**的人脈里找对方，命中就 `writeInviteFields` 以对方为准覆盖，并把这条联系人登记进连接（之后显示「本人入力」、继续同步）。对方的资料是他自己随便填的：邮箱来自资料 `handles.email`（`profile-reader.ts:28-33`），没有验证。复核人的探针：
  - **邀请人这边（被动的一方）**（P6）：Alice 的人脈里有「田中 太郎 · Sony · tanaka@sony…」的名刺；Mallory 把资料填成「田中 太郎 / Sony」+ 自己的邮箱电话，拿到 Alice 的码（码最多 10 人用，本来就是会贴到群里、在会场给人扫的）兑换 → Alice 那条「田中 太郎」的邮箱、电话变成 Mallory 的，`linkedContactIds` 里有它（本人入力），Alice 还收到一条「田中 太郎さんが招待から登録しました」。Alice 之后给「田中」发的邮件到了 Mallory 手里。
  - **兑换人这边**（`hijack2-probe` H1）：Alice 把资料邮箱填成 Bob 上司的邮箱、名字填「Fake Name」，共享邮箱（预览里看不到邮箱）；Bob 打开看到的是「Fake Name」，页面上的「すでにあなたの人脈にいます」提示没出现（两端都只按名字 + 公司在客户端查：Web `InviteLanding.tsx:283-286`、App `InviteLandingScreen.tsx:310`），点「つながる」→ Bob 人脈里的「Real Boss」被改名成「Fake Name / Other」。
  - 解除也恢复不了：统合进对方原有名刺的「只结束连接」，覆盖上去的值留着；我这边选「保留」会把它们清空（M1）。
- 为什么是问题：这是一个由外人触发、静默改写别人通讯录、并且贴上「本人确认过」标签的写入口。DESIGN §2.6 / §9 #17 写的「以对方为准覆盖」是在假设「命中 = 就是这个人」，但命中条件全部是对方可以自己填的字段。成熟产品（LinkedIn、Eight、Google 通讯录的「联系人建议」）遇到「外部自报资料与我已有联系人疑似同一人」时一律不静默覆盖：要么新建 + 给出「可能重复」让我自己合并，要么只补空字段、不同的值放进「本人の情報と違います」。
- 修法（会改 DESIGN §2.6 的行为，需用户拍板，复核人推荐第 1 种）：
  1. 兑换时**两边都不自动覆盖**：命中已有联系人时只补空字段，已有值不同的字段不写，记进连接的同步状态当作「我改过」（`pausedFields` 现成就能表达「本人の情報と違います」）；或者新建一条、把已有那条作为 R12 的重复候选交给本人确认。邀请人这边（没看到任何确认画面的一方）至少要做到这一步。
  2. 兑换人这边的「已在人脈」提示改为服务端判断：预览（已登录时）返回一个布尔 `alreadyInNetwork`（不返回是哪条、不返回匹配到的邮箱），客户端照它显示；匹配用的字段集合与兑换时完全一样，避免「提示没出现却统合了」。
  3. 补测试：上面两个探针场景各一条（Postgres），断言已有联系人的原值不被改写。

### M（应该修）

**M1 解除时「名前と会社だけ残す」会把统合前我自己原有的值一起清掉，与注释相反。**
- 现象：`service.ts:523-530` 对 `side.mySynced.values` 里除名字 / 公司以外的字段一律写 `null`；而统合时 `placePeer` 把对方所有有值的共享字段都记进 `synced.values`（`:230-235`、`:243`），包括覆盖掉我原有值的那些。P6 的后半：Alice 解除并勾选保留 → 「田中 太郎」的邮箱、电话、役職全部变成 `null`，名刺上原有的 `tanaka@sony…`、`03-…`、「部長」只剩在 `fieldHistory` 里。注释 `:524` 写的是「我自己原有的值（统合前就有的）不动」。
- 为什么是问题：用户勾的是「保留」，结果名刺原有的联系方式没了；DESIGN §2.6 也写「统合进原有名刺的……名刺原有的值保留」。
- 修法：统合时在连接上记下被覆盖前的原值（例如 `synced.before`），解除且保留时对这些字段恢复原值、只清掉「招待新建」的字段；新建的联系人保持现在的行为。若 S1 按推荐改成「只补空字段」，这里自然只会清掉招待补上的字段，原值不受影响——两条一起修。补一条「统合 → 解除保留 → 名刺原值还在」的 Postgres 用例。

**M2 资料同步每轮都从头扫、最多 500 条，排在后面的连接永远不会被同步。**
- 现象：`sync.ts:83-108` 每轮 `afterId = null` 起步，`examined` 到 `MAX_CONNECTIONS_PER_PASS = 500` 或 `deadline` 就返回，下一轮又从第一条开始。连接 id 是随机 UUID，按 id 排序后排在 500 名以后的连接永远轮不到。探针 `sync-scale-probe`：520 条连接，改 id 最大那条连接里兑换人的公司，连跑 3 轮 → 邀请人那边仍是旧公司。workspace 是部署级的（所有用户在一个 workspace），全站累计 500 条生效连接很快就会到。另外每条连接每轮都开一个写事务、读两份资料，没变也一样。
- 为什么是问题：GOAL「对方改资料后约 10 分钟内跟着变」对大多数连接不成立，而且没有任何报错。
- 修法（对标常见的增量同步）：只挑「需要同步的」连接——在 SQL 里按对方资料的 `updated_at` 大于连接上记的 `profileUpdatedAt`（或共享键变了、`profileUpdatedAt is null`）过滤，按变更时间排序分页；或者把游标（上一轮停在哪个 id）存进维护任务的状态，下一轮接着扫、扫到尾再回头。补一个「超过一页上限仍能在 N 轮内同步到最后一条」的用例。

**M3 App 草稿 sheet（以及二维码 sheet）离开页面后仍浮在新页面上（REPORT 已知问题第一条）。**
- 根因：`BottomSheet` 通过 `UiPortal` 渲染到根部的 `UiPortalHost`（`components/ui/Portal.tsx`、`app/_layout.tsx:100`），不在页面自己的视图树里；Expo Router 的栈导航在推入新页面时**不卸载**下面的页面，所以 `InviteSenderScreen` 的 `sheet` 状态还是 `"draft"`（`InviteSenderScreen.tsx:79,212`），portal 里的 sheet 继续画在最上层。打开 `i/<码>`、点履历里的人名（`:197`）、通用链接进来都会触发。同样的结构在计划域的 sheet（`PlanProposalSheet` 等）上也成立，只是那些入口目前不常在 sheet 打开时跳页。
- 修法：页面层最小改动——`InviteSenderScreen` 加 `useFocusEffect(useCallback(() => () => setSheet(null), []))`（失焦时关掉 sheet；`HomeDashboardScreen` 等已有 `useFocusEffect` 的写法）。根治在组件库（乙）：`BottomSheet` / `ActionSheet` 用可选的 `NavigationContext`（在导航外为 `null`，展示页和测试不受影响）订阅 `blur`，失焦时调用 `onClose`，或在失焦期间不渲染 portal 内容。补一条渲染测试：打开草稿 → 模拟页面失焦 → `invite-draft-sheet` 不存在。

**M4 PLANNER 必需证据缺两项。**
- 现象：PLANNER「必需证据子表」要求 `~/orbit-sprint-evidence/redesign/R15/run-01/compare.html`（b11 A2 ①–⑧ / Web、b9 A5 ①–⑤、b5 E6 与实现对照，浅 / 深，`/i/<code>` 390 与 1024）和 `click-verify.log`（两个本机账号真实兑换一次的点击记录）。证据目录里有 78 张 Web 截图、7 张 App 截图和 `e2e-web-C.log`，但没有对照页，也没有点击记录文件（REPORT SC-02 只在正文里描述了一次内置浏览器走查）。
- 修法：补对照页（可以直接用下面像素门禁的输出代替，并在 REPORT 里改指）；把那次走查按 R12 的格式写成 `click-verify.log`（时间、账号、点了什么、库里查到的连接行与两条联系人）。

### m（建议修）

- **m1 已登录的预览绕过 IP 锁、也没有总量上限。** P1：同一 IP 匿名失败 60 次被锁后，4 个账号在这个 IP 上又做了 120 次失败猜测，第 5 个新账号打开真码是 200。DESIGN §6 第 4 条就是这么设计的（账号单独计数、不占 IP 额度），码空间够大，暂不构成实际风险；但注册没有限流时，「被锁的 IP 连真码也 429」这条保护对登录用户不存在。建议给登录用户也加一个较宽的 IP 级失败上限（例如每 IP 每小时 300 次，计入同一 `ipfail` 桶的另一个阈值），以及每账号每 10 分钟的总量上限。
- **m2 部署前提要写进合回前清单。** IP 只认 `x-real-ip`；部署在不覆盖这个头的平台（自建反代、本机）时，要么所有人共用 `local` 桶（一个人打错 60 次锁住所有人），要么客户端可以自己伪造。REPORT 的「合回前授权」里补一行「确认生产在 Vercel 边缘、`x-real-ip` 由平台写入」。
- **m3 旧关系邀请接口仍在生成 `/app/invitations/<token>` 链接，页面已删。** `app/api/relationship-communication/handler.ts:102`。现在两端都没有创建入口，但生产库里若有未接受的旧邀请，链接会 404。建议加一条 `next.config.js` 重定向 `/app/invitations/:token` → `/app/home`（或一页「この招待は終了しました」），或在合回前只读查一下生产里 `pending` 的旧邀请数。
- **m4 App 解除确认的空关闭回调连带关掉了 Android 返回键与 VoiceOver 的退出手势。** `InviteConnectionSheets.tsx:112,176` 传 `ignoreDismiss`；`BottomSheet` 的 `useBackHandler(visible, close)` 与 `onAccessibilityEscape` 都走这个回调，所以只能点「キャンセル」。建议组件库给 `BottomSheet` 加 `dismissOnBackdrop={false}` 这类只关遮罩的选项（REPORT 自定决定 #9 已提到组件库归乙）。
- **m5 履历每个加入的人单独读一次联系人**（`service.ts:332-337`，最多约 200 次，REPORT 已知）：改成一次按 id 批量读。
- **m6 `orbit-app/scripts/phoneweb-journey-support.mjs:28` 旧 `/invitations/[token]` 条目没清**（REPORT 已知）。
- **m7 已登录用户在接收方确认页看到的副标题仍是「アプリなしで登録できます」**（像素门禁截图里发现）：只在未登录的打开页显示这句。

## 像素门禁（README 通用规则 11）

按 HOW-TO 第 8 节与 `README-redesign.md` 跑了一轮（`compare-redesign` / `compare-redesign-app`，`--grid` 逐带）。证据：`~/orbit-sprint-evidence/redesign/R15/review-pixel/`（`web/`、`app/` 三联图与 `cells.json`、`shots/` 设计稿无的状态截图、`summary.json`、`commands.txt`）。**结论：40 张比对 0 通过**（没有一张 raw ≤ 0.02；超阈值带没有一条能如实归因成 `[data]`，所以没有写归因文件）。不要求本 Sprint 通过，下面如实记录。

| 画面（设计稿） | 宽度 | raw 浅 / 深 | 超阈值带 |
| --- | --- | --- | --- |
| Web 发出方 · 共享（b11 A2 Web） | 1440 | 0.144 / 0.076 | 9/11、9/11 |
| Web 发出方 · 共享（b9 A5 ①） | 1440 | 0.182 / 0.136 | 9/10、9/10 |
| Web 发出方 · 履历（b5 E6） | 1440 | 0.196 / 0.124 | 9/10、9/10 |
| Web 发出方 · 草稿展开（b11） | 1440 | 0.232 / 0.119 | 11/11、10/11 |
| Web 发出方 · 共享 / 草稿 / 说明（对 App 画板，仅参考） | 390 | 0.34 / 0.23、0.69 / 0.46、0.38 / 0.24 | 全超 |
| Web 接收方 · 未登录打开（b9 ② / b5 E6 ②） | 390 | 0.181 / 0.184、0.181 / 0.193 | 6/9、8/9 |
| Web 接收方 · 已登录确认（b9 共有する項目 / b11 ⑦） | 390 | 0.254 / 0.176、0.315 / 0.224 | 大部分超 |
| Web 接收方 · 完了（b9） | 390 | 0.113 / 0.266 | 大部分超 |
| Web 注册（回跳前，第一屏） | 390 | 0.385 / 0.797 | 全超 |
| App 发出方 · 共享 | 17 Pro | 0.137 / 0.151 | 8–9/9 |
| App 发出方 · 草稿 sheet | 17 Pro | 0.152 / 0.146 | 8–9/9 |
| App 接收方 · 确认 | 17 Pro | 0.202 / 0.192 | 8–9/9 |

1024 与 Web 390 的发出方没有 Web 画板（设计稿无）；不可用 / 自己的码 / 已连接 / 手输 `/i` 没有设计稿，只截图。

**共性问题（不算 R15 的账）**：背景缺雾面渐变（X12）；App 顶栏是文字「‹ 返回」而不是圆钮 + 居中两行标题（X06）；抽屉 / 弹层细节（Web 共性第 6 条）；发出方弹窗背后是「人脈を追加」入口页而稿是人脈 / 设定页（D20）；注册走旧的英文 Create account 弹窗、且不跟深色（D31 + D14）；码格式（D30）。另外模拟器语言是中文、宽 402pt，文字与高度差异也计入了。

**R15 自己的结构偏离（按规则 11 应进「请用户拍板」或返工）**：
- Web 发出方弹窗：宽同为 560，但高约 720（稿约 500）；多了「QR を拡大」、剩余天数行、「相手に届くあなたの情報」卡、内嵌「これまでのコード」；草稿在实现里是折叠的、稿是展开卡片 + 语气下拉；底部缺「下書きをコピー」；「無効にする」位置不同。b5 E6 的履历是 680 宽独立表格卡 + 24h / 7日 / 30日 切换，差异更大。
- Web 接收方：头部左对齐「Orbit · アプリなしで登録できます」（稿：居中 logo）；邀请人卡头像在左、字段为标签 + 值（稿：头像居中、chip）；多「ログインしてつながる」、少「今はしない」。确认页共享项目全展开成开关列表（稿：chip +「変更」），主按钮不固定在底部；完了页对方信息是完整字段卡并多一张「あなたの情報」（稿：一行人名 +「本人入力」chip）。
- App 发出方：QR 不在白卡里；三个分享入口是一排小胶囊（稿：三个大方块）；没有右上「⋯」；草稿 sheet 贴底、无 ✕（稿：浮起圆角卡）；复制 / LINE / 邮件是小胶囊（稿：图标在上的大块）。深色下 QR 是白底块（是为了相机可读，实现有意为之，也应登记）。
- 顺带发现的小毛病：已登录的人在确认页看到的副标题仍是「アプリなしで登録できます」（见 m7）。

**没跑成**：期限切れ / 满员（本机没有这类码，造要写库）；注册后的简短资料页（QA 账号已有名字）；App 发出方说明页（要先作废库里的码，属写操作）；App 日语（17 Pro 是共用设备，没改系统语言）。

## 复核人做了什么

- 逐行读 `features/invite-codes/{handlers,configured,service,repository,rate-limit,client-ip,invite-fields,profile-reader,sync,notification}.ts`、迁移的约束与索引、`app/i/**`、`app-auth-routing.ts` 与两处注册回跳改动、App `invite-route.ts`、`InviteSenderScreen` / `InviteConnectionSheets` / `BottomSheet` / `Portal`、Web `InviteLanding` 的确认步骤。
- 写并运行三个探针（见开头），在本机 `orbit_test` 的随机 schema 上验证事务回滚与并发；在本机 3000 端口用 `curl` 查 `/i/**` 的响应头与 `<head>`。
- 重跑上表的两端测试、类型检查、lint、`copy:qa`；检查允许清单与被删测试的差异；检查证据目录。
- 像素门禁一轮（由复核人派出的子任务执行：复用本机 3000 与 3320 的服务，另起 mock 服务器在 3005（`ORBIT_REDESIGN_MOCK=invite-codes`，构建目录 `.next-verify`，用完已关；这会覆盖 `.next-verify` 里原有缓存）；Next 启动改写的 `next-env.d.ts` 已还原；本机库没有写入；模拟器外观已切回浅色）。

## 没做的事

- 没跑两端全量测试、Web Playwright 端到端、App 模拟器手动走查（像素门禁另算）。
- 没有连 Neon、没有部署、没有读 `.env*` 的值、没有调用付费 AI；没有改任何产品代码、没有提交。
- 没有核对 GitNexus impact / detect-changes 记录的每一行（只抽看了 REPORT 的摘要与 `impact-*.md` 是否存在）。
- 没有评估「接收方简短资料」页对 R18 资料保存接口的调用细节（只确认只调用、不改）。

## 处理记录（执行人，2026-10-11）

修复提交：`3861c46e`（契约：`InviteConnectionView.mergeSuggestion`、merge / dismiss，App 副本同提交）、`d3c7ec11`（服务端，含迁移 v2，只追加、只在本机跑）、`5e2c08e6`（Web）、`b11c84b9`（App）。

| # | 处理 |
| --- | --- |
| S1 | 已修：兑换不再碰已有联系人，总是新建一条「本人入力」；查到可能同一人时只在连接上记 `merge_suggestion`。所有者在发出方履历 / `InviteShareSheet` 点「統合する」才合并（已有字段只补空、不同值不覆盖，新建那条墓碑删除）或「別の人」。REVIEW 的两个攻击场景已写成测试，断言已有联系人字段不变。DESIGN §2.6 已改，§10 #7 新增「请用户拍板」（对 NAV-V3「已有名刺卡则合并为本人入力」的安全修订） |
| M1 | 已修：解除「保留」只清招待写入且之后没改过的字段 |
| M2 | 已修：同步按上次检查时间轮转，超过 500 条连接三轮内都能同步到（迁移 v2 加列） |
| M3 | 已修：App 页面失焦时关闭 sheet（渲染测试） |
| M4 | 已补：`~/orbit-sprint-evidence/redesign/R15/run-01/compare.html`（19 组，复用复核门禁截图，为修复前画面）、`click-verify.log`（本机两个一次性账号：发码 → 预览 → 兑换（已有卡未改）→ 统合 → 解除 → 再连） |
| m1 | 已修：登录后的预览同样受 IP 失败锁 |
| m2 | 写进 REPORT 合回前授权清单（生产确认 `x-real-ip` 由平台写入） |
| m3 | 已修：旧 `/app/invitations/…` 两端转到手输码页并提示「このリンクは使えなくなりました」 |
| m4 | 已修：解除确认 Android 返回键 = キャンセル |
| m5 | 已修：履历批量读联系人 |
| m6 | 已修：旧脚本样例清掉 |
| m7 | 已修：已登录确认页不显示「アプリなしで登録できます」 |
| 像素门禁 | 未过（40 张 0 通过），按规则 11 不标 done；R15 自己的结构偏离（发出方弹窗高度与多出的块、接收方各屏、App 分享按钮与草稿 sheet 版式）随加人画面逐像素返工处理 |

修复后：orbits R15 相关与门禁 232/232；两端类型检查、lint 0；App 全量 3967 条中 4 条超时类失败单独重跑通过，另 1 条 `design-sync` 失败来自另一个会话未提交的 tokens 改动（非本 Sprint）。

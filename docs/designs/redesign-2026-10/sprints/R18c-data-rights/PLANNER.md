# Sprint R18c — 账户：数据权利

**Plan revision:** 2（2026-10-18；RD-33 主会话代定已采纳）。**模式:** existing-codebase / single-generator（C 线；执行：**Codex 主开发会话**）。**档位:** H。
**单一目标:** D-21 导出与 D-22 退会从 R08 mock 变成两端可操作的本机 live 流程；退会到期清除只在本机测试库验证。
**基线:** 编制时 `origin/redesign` = `a37d0f551`；当前 `redesign` 工作树比远端落后，以下代码事实全部从 `git show origin/redesign:<path>` 核对。执行时重定位行号。
**线内顺序:** R18a → R18b → **R18c** → R28。C 线 `redesign-c` / `line-c`；只按路径提交，**不推送**（RD-32）。
**易读目标:** [GOAL.md](GOAL.md)。

---

## 0. 给 Codex 的执行说明

1. **工作与通信。** 你是 Codex 主开发会话，R18c 只在 `/Volumes/ORICO/Dev/worktrees/orbit/redesign-c`（`line-c`）实施。先确认 R18a、R18b 的本线提交与 `origin/redesign` 的差异，再 `git pull --rebase origin redesign`；若有本线未提交改动，先保护并处理，不能覆盖。主会话通过 `_runs/talk-codex.sh` 联系你。每轮最后回复给主会话：SC 完成/未完成、提交号、测试通过/失败数与失败用例、像素摘要、请求、待主会话代定、待用户授权、下一步。不得自行推送。
2. **先读。** 本文件与 GOAL；[README](../README.md) RD-16、RD-24～33 与通用规则 10–13；[HOW-TO](../HOW-TO-START-A-FEATURE-SPRINT.md) §0–10；[HANDOFF](../HANDOFF-TO-FEATURE-SPRINTS.md) 通用 G01–G26、R18-01～09、R17-03/04、R14 与 R30-06；[DEFERRED-A](../DEFERRED-A.md) 账户相关项；[screen-ownership](../screen-ownership.md) 账户行；[决定表](../maintenance/2026-10-12-decisions.md) D18、D55/56、§20；[IMPLEMENTATION-PLAN](../../IMPLEMENTATION-PLAN.md) D-21/22（:556–563）；[R18a PLANNER](../R18a-account-mypage-settings/PLANNER.md) §2、§3、§8–9 与 R18b PLANNER；两端 `AGENTS.md`、`repos/orbits/scripts/visual/README-redesign.md`。旧 HOW-TO 的开分支/推送/GitNexus 步骤以较新的 RD-31/32 为准；不跑 GitNexus。
3. **沿用已有存储。** 导出任务、删除申请、清除步骤与通知 outbox 使用现有 `orbit_records` 集合；采用确定性 recordId 与 CAS 保证同一账号/幂等键的唯一性和状态转换。**不建新表、不做 DDL、不预约 README 迁移号段**。本机测试库验证并发、重放与隔离；生产到期清除调度和启用仍待用户授权。
4. **环境与提交。** 沿用 R18a 的 Web :3400、`ORBIT_NEXT_DIST_DIR=.next-line-c`、Metro :8084、本机库 `orbit_line_c`、模拟器 `Orbit Line C` 的 UDID；不要与别线共用库、端口、模拟器。设计稿服务选 3340+ 的空闲端口，用 `uv run --no-project python -m http.server <端口> -d docs/designs`，用后停掉。截图与日志放 `~/orbit-sprint-evidence/redesign/R18c/run-01/`。共享契约改动与 `npm run sync:contract` 的 App 副本同提交，契约提交以 `contract:` 开头；只 `git commit -- <自己的文件>`，提交前 `pull --rebase`，不 `git add -A`，不推送。
5. **边界与停点。** 新问题按 §2 的代定原则提出推荐写 REPORT「待主会话代定」，继续独立 SC。要改 §1 不许碰的文件写「请求」，等对应线交付。Neon、生产库/环境变量、部署、真实 Google 账号、真实邮件/推送、TestFlight 不运行；生产到期清除调度明确「待用户授权」。画面最多 3 轮；全量新增失败做 2 次有界修复仍不清楚，记录具体失败和影响，不写通过。R31a/R31b 组件若尚未在执行基线，先完成结构/数据/逻辑，像素标「待组件库」。
6. **证据与报告。** 新建本目录 `preflight-checklist.md`、`REPORT.md`；REPORT 按 HOW-TO §10，另列「orbit_records CAS 并发结果」「导出清单与 ZIP 样例」「清除清单逐领域结果」「改稿/补画」「交接表逐条结果」「待主会话代定」「请求」「待用户授权」「未过/重比」「文档更新请求」「越线自查」。README、HANDOFF、DEFERRED-A、决定表、screen-ownership 的汇总改动只写出四栏原文交主会话；独立复核由主会话另起，自己重跑测试和门禁。

## 1. 本线归属的文件 / 不许碰的文件（RD-31）

**C 线可改/新建（开工先按 R18a/R18b 的最新提交复核路径）：**

- 服务端账户权利：`repos/orbits/features/account/data-rights/**`（新建；导出、删除、清除清单与 worker），其中 `purge/<域>.ts` 由 C 线新建各领域模块，按存储层直接清除，不改其他线文件；`app/api/account/exports/**`、`app/api/account/deletion-request/**`、新建下载路由 `app/api/account/exports/[id]/download/route.ts`、本线维护任务入口；`shared/contract/account.ts` / `shared/api-schema/account.ts` **只加不改**，`features/redesign-contracts/{handlers,service-factory,mock-service}.ts` 仅追加/替换本契约 11 的账户权利分支，不把版本接口一起改坏。冷静期拦截复用 `features/auth/session-revocation.ts` 并在 `auth.ts:68` 加删除时间戳校验；`auth.ts` 纳入本节最小允许范围。相关 auth guard 只做必要修改，须全量回归、记录跨线影响。
- 私有导出存储：C 线新建 `features/account/data-rights/storage/**`，直接用 `@vercel/blob` 写 `access: "private"`、`contentType: "application/zip"` 的可注入适配器；路径按账号隔离并测试到期删除。不得 import 或改 B 线 `business-card-private-blob-store.ts`，不等待其抽取通用传输。
- Web 页面：新建 `app/(app)/app/settings/account/**`、`settings/exports/**`、`orbit-2026/account-rights/**`（含本线 CSS Modules/文案）；R18a 的 `settings/appearance/**` 只接「データを書き出す / アカウントを削除」两个入口，`settings/[section]` 占位由静态段覆盖，不重写 R18a 言語/外観逻辑。若 R18a 选择不同路由结构，按其交付路由接线，保持原有页面功能。
- App 页面：`app/account.tsx`、新建 `app/account/{exports,deletion,pending,deleted}.tsx`，`src/screens/profile/AccountScreen.tsx` 整屏替换，新增 `src/screens/account-rights/**`；R18a `SettingsScreen` 的账号/导出入口只接新静态路由；`src/i18n/{ja,zh,en}/account.ts` 只加/重写本线键。**每个新屏 `<AppScreen inset="kit">`，只用 R31a 的新组件**。
- 设计与证据：`b7-account-misc.html` 只改 §2 指定的账户/导出/退会画板；`b12-missing-states.html` **只在末尾追加** R18c 缺屏，先看 A/B/C/D 线是否同时在写；新建 `scripts/visual/views/{web,app}-R18c.json` 与 `attribution-redesign-R18c*.json`、本目录 preflight/REPORT。路由登记、审计计数、App 离线库存与三份旧屏允许清单只改本线条目；`shared/contract/index.ts`、App `src/api/endpoints.ts`、字典 index、capability registry 等汇总文件只追加本线行。

**不许碰（写 REPORT「请求」给归属线）：** A 线 App `src/components/ui/**`、Web `orbit-2026/ui/**`、token、kit 与 visual 工具；B 线 `features/acquisition/**`、contacts/inbox 数据写入逻辑；D 线 App 导航壳/`AppScreen`、Web `orbit-2026/shell/**`；E 线 iOrbit 对话/记忆逻辑；R28 引导页面；R18b 的认证画面/`mobile-google` broker 和版本策略（`auth.ts` 的删除时间戳校验除外）；R18a 的マイページ/資料编辑和言語/外観控件本体。C 线清除模块直接调用各领域存储层，不改这些领域的归属文件。活跃 B、D 线只做复核，借交接表通知影响；若必须跨线修改，由主会话指派并在 REPORT 登记。

**发布边界：** 生产部署、Neon、worker 调度和到期清除开关均不在本线授权内；本期无 DDL/生产迁移。生产清除入口默认关闭且要有测试守住。

## 2. 主会话代定（RD-33，已采纳；登记决定表 §C-3）

以下口径已由主会话按 RD-33 代定，作为本计划的实施与验收依据；REPORT 记录落实结果与新发现的冲突。

1. **无付费功能。** `b7` #19/#20/#24 的「ご利用プラン」和 #20/#24/#22/#26 的 Pro 订阅提示、Web 自动解约/退款/重开文案都去掉；不显示 App 内购提示。D55/56 与 R18a 的隐藏口径优先于早期 D-22 一句「内购提示」。退会影响只写数据、登录与连携。画板原处加「主会话代定 §C-3 · R18c」注释并重比；不拿 `[data]` 解释结构删除。
2. **导出选择。** `b7` #28/#31 的五项里「すべて（JSON）」是**独占预设**：勾它即覆盖前四项、生成 JSON + 自己上传的名片图片 ZIP；勾前四项则逐项生成 CSV（人脈可选 vCard）并打包 ZIP。底层现有 `scope[]` 五枚举不变：前四项映射 `contacts` / `notes` / `plans+tasks` / `events`，全部预设展开为五枚举；只加可选 `mode: selected | all-json`、`contactsFormat: csv | vcard`，旧请求默认 selected/csv。空选择禁用提交。名片图片仅 all-json 含；他人私有资料、Gmail 正文、外部日历令牌不导出。
3. **导出期限与配额。** 创建导出也要求近期登录。接受成功的任务按 `Asia/Tokyo` 日期计 3 次；同一 `idempotencyKey` 的重试返回同一任务、不重复计数；系统故障导致 failed 的任务退还额度，用户输入/内容导致的失败仍占已接受额度；跨日重置。同时只允许 1 个 queued/running 任务，确定性 recordId + CAS 阻止并发重复创建或超额。`expiresAt = readyAt + 7×24h`，未 ready 不起算。邮件/推送只给已登录详情链接（需再鉴权），`downloadUrl` 由 GET 即时生成**有效 5 分钟**的本站绝对 URL，服务端下载再校验 actor、状态、期限；任何通知/日志不含私有 Blob key 或签名 URL。过期历史保留状态，文件按期清理；重导出重新计数。
4. **私有存储。** C 线在自己的 `features/account/data-rights/storage/**` 直接用 `@vercel/blob` 实现注入式适配器，`access: "private"`、`contentType: "application/zip"`；ZIP 使用独立 `account-exports/<actor-hash>/<export-id>.zip` 前缀。测试 actor 隔离、失败收敛与到期删除，不 import 或修改 B 线名片 JPEG store。
5. **后台与通知。** POST 只落库 queued + outbox，worker 领取后按领域读取，逐块写受限 ZIP，保存私有对象，事务地置 ready/outbox；失败可重试、不能重复产出不同内容或重复通知。进度只显示真实完成的阶段/项数；`b7` #29 的 64%/「あと約1分」是示例，不从无数据推断 ETA。完成通知用现有 `features/mail/transactional` 与通知/推送适配器，邮件属于 Orbit 系统事务通知，非「代发个人邮件」；未配置推送仍有站内状态/邮件，未配置邮件显示渠道失败但下载可用。
6. **退会重认证。** 密码账号由服务端核验密码并限次；Google 账号重新完成 OAuth 登录，传 `prompt=login` 或 `max_age=0` 并验证返回的 `auth_time` 符合近期要求。两种方式核验成功都签发 challenge/receipt，绑定同一 account id、`deletion-request` 用途，**≤10 分钟有效、一次性消费**；旧登录会话或刷新 cookie `iat` 不能代替。申请受理立即用事务邮件发「不是本人操作请取消」及取消入口，失败记录渠道状态但不伪称已发送。取消也要已登录的同一 account id，pending 登录入口开放。
7. **30 日状态。** 申请前检查本人主办的活动是否仍有报名；若有，阻止申请并提示先中止活动或移交共同运营者，b12 末尾补画该阻止态。申请前有未同步修改时给出明确提示（同 R18-09）。申请时用 orbit_records CAS 原子写 `requested_at`、`purge_after = requested_at + 30×24h`、`reauth_at`；`features/auth/session-revocation.ts` 与 `auth.ts:68` 校验删除时间戳，让申请前签发的 JWT 失效；申请后清 App SQLite 镜像、outbox、草稿和 Web `web-mirror-storage`。冷静期仅允许 `deletion-request` GET/DELETE、账户 status、登出、version、下载已准备好的导出；普通 API 与 sync push/pull 拦截。重新登录只进 pending 页；取消在 `now < purge_after` 且清除尚未领取时 CAS 成功，恢复产品访问，第三方连携需自己重连。并发重复申请返回原申请；重复取消幂等；超过截止或已开始清除返回明确状态。UI 日期按东京当地显示，服务端以 UTC instant 判定。
8. **到期清除的安全边界。** worker 只有本机测试库能运行；C 线在 `features/account/data-rights/purge/<域>.ts` 逐领域直接按存储层清除，每步记录游标/完成时间，失败原地重试且不执行后续身份最终清除。共享活动保留他人记录；本人共享消息按 §7 清除。调用 Google token revoke，并清除私人导出文件、原图、OAuth 与推送令牌。仅在 **purging** 期间阻止自动建号；清除完成后允许同邮箱以**新 account id** 全新注册，不留邮箱哈希墓碑。#23/#27 是静态通用完成页，从完成事务邮件链接进入，不需要回执或账号登录，也不能反查已删身份。完成通知在最终身份清除前投递并记录结果，发送失败不能伪称已发送，也不保留邮箱供无限重试。没有完整领域清单与本机验证不能声称 D-22 完成。生产调度与启用另待用户授权。
9. **画板空缺。** `b7` 只给 1440 Web 浅色、390 App 浅色，另有 App #74、Web #81 的退会确认深色。其它深色、Web 1024/390、必要的失败/限额/过期/取消态与**主办活动仍有报名的阻止态**在 `b12` 末尾补画，按 `b8` #15 断点规范与新组件 token；用稳定标题 `W-R18c-*` / `A-R18c-*` 定位。补画与改稿标 §C-3「主会话代定」；未补的组合记「设计稿无」并附截图，**不把近似画面标像素通过**。
10. **完成态与反馈。** `b7` #23/#27 是真正清除完成（本机时钟驱动测试），不是申请后立即出现。可选反馈入口若无既有安全接收接口，画板先去掉并登记本代定；不把退会中的数据重新写入已清除账户。

## 3. 交接条目映射（逐条进入 SC 或明确转出）

| 交接表/归属 # | 本 Sprint 处理或转出 | SC |
| --- | --- | --- |
| R18-01、R18-02、R17-03/04、R13-02 | R18a 的マイページ/主催/受信箱，不重写；只从既有设置入口接线 | SC-06/07；原条目归 R18a |
| R18-03、R18-04 | 启动认证态底栏、公开页由 R18b/D 线处理；本 Sprint 的 pending 登录态验证不露普通底栏 | SC-09；原条目转 R18b/D |
| R18-05 | ご利用プラン本期不做，相关退会画板删除 Pro 行 | SC-02、SC-08 |
| R18-06 | 契约 11 的导出/退会 live；`/api/app/version`/最低版本属于 R18b，保持分离 | SC-03～10；版本转 R18b |
| R18-07、R18-08、R18-09 | 邀请/参加入口归 R18a/R18b；R18c 复用 R18-09 的未同步修改提示，并在申请后清本机镜像、outbox、草稿 | SC-08/09；其余条目转 R18a/R18b |
| R14 通知设置入口、R30-06 意味検索 | R18a/R14 已分配；导出完成推送走通知服务，不改通知偏好 UI | SC-05；入口转 R14/R18a |
| 归属表 App `account` | `AccountScreen` 整屏重写；认证子路由由 R18b，`permissions` 由 R18a | SC-06、SC-12 |
| 归属表 Web `/app/settings`、R18a 言語と外観 | R18a 页面主体不重写；把导出/删除链接与静态段接通 | SC-07、SC-12 |
| README 合回前：契约 11 / 旧屏 / 像素 | 本线接口 live、旧账户屏替换、逐屏归因；首次版本门禁转 R18b | SC-03～15 |

通用口径逐项落点：

| # | R18c 落点 | # | R18c 落点 |
| --- | --- | --- | --- |
| G01 | Web 新设置子页用 `ShellPage`，App 二级页用新顶栏（SC-06/07） | G02 | 次要说明用 `--ink-3` 例外，其余对比度（SC-13） |
| G03 | 退会危险色 `--coral-text`（SC-08/13） | G04 | App Button 用 R31a 新组件 40 可见/44 触控（SC-13） |
| G05 | 逐屏像素和归因（SC-13） | G06 | `--only` 迭代、全量收口、独立复核（SC-13/15） |
| G07 | `--list` 定标题、作废/下一期不比（SC-01/13） | G08 | 只读 fixture 到达中途态（SC-01/13） |
| G09 | 示例文字可 `[data]`，结构不可（SC-13） | G10 | Web `ShellPage` 插槽按现有 API（SC-07） |
| G11 | 390 标题与返回保留（SC-07/13） | G12 | 390 不加 🔍/⌘K（SC-07/13） |
| G13 | 旧 `.btn` 泄漏与固定底部 inset 核对（SC-13） | G14 | 账户页需登录壳；pending/完成页按认证边界，不误挂公开导航（SC-09/13） |
| G15 | App 二级路由返回 `/account`，不改一级壳（SC-06/12） | G16 | 不直接 import `OrbitTabBar`（SC-06/13） |
| G17 | `AppScreen inset="kit"`、`UiText`、新组件（SC-06/13） | G18 | live 503 时隐藏入口/显示可恢复状态；fixture 不入生产（SC-03/11） |
| G19 | 响应宽进、请求严出（SC-03/04/10） | G20 | 旧 `AccountScreen` 允许清单只减（SC-12） |
| G21 | Web `Orbit2026Scope` + `ToastProvider`（SC-07） | G22 | 语言读既有 cookie/context，不加 `?lang=`（SC-07） |
| G23 | A 线新组件缺口写请求，不造页面私有替身（SC-01/13） | G23b | A 线色/尺寸修正作为依赖，不在页面补丁（SC-13） |
| G24 | App 新文字用 `UiText`（SC-06/13） | G25 | 只读相关画板、每屏最多 3 轮（SC-13） |
| G26 | 字号/圆角只用现有 token（SC-06/07/13） |  |  |

## 4. 已查清的代码事实（`origin/redesign@a37d0f551`，实施前再核对）

1. **路由仍是 R08 占位。** `repos/orbits/app/api/account/exports/route.ts:1–3` 导出 GET/POST mock handler，`exports/[id]/route.ts:1–3` 只有 GET，`deletion-request/route.ts:1–3` 是 GET/POST/DELETE re-export；没有可下载路由。
2. **现有 handler 不是 live。** `repos/orbits/features/redesign-contracts/handlers.ts:184–198` 的导出/退会直接调 `redesignMock`；`:198` 版本也在同一契约下。`service-factory.ts:16,32–45` 将 `account-lifecycle` 列为能力但不列入 live 能力；不能只加一个 flag 让版本/权利一起误开。`route.ts:39–59` 响应会经 schema 校验，live 未实现回 503。
3. **契约边界。** `shared/contract/account.ts:3–25` 导出 scope 只有 `contacts|notes|tasks|events|plans`，任务状态 `queued|running|ready|failed|expired`，下载 URL 可选；删除契约只有 `requestedAt/purgeAfter/cancelledAt`。`shared/api-schema/account.ts:8–24` 读响应宽进，POST scope 1–5 + `idempotencyKey` 严出，`purgeAfter` 必须等于申请时刻 + 30×86400000ms。不能把画板的「all」直接作为旧 scope 值塞入。
4. **mock 的重复语义。** `features/redesign-contracts/mock-service.ts:402–415` 用 `idempotencyKey` 复用导出任务，删除申请/取消可重复；当前 mock 不代表限额、后台文件或真正清除。
5. **账户现屏。** `repos/orbit-app/app/account.tsx:1–6` 用 `withOrbitPrivateRoute(withOnlineOnlyRoute(AccountScreen))`；`src/screens/profile/AccountScreen.tsx:23–80` 仍是旧 `AppScreen`/旧组件页，未写 `inset="kit"`。`src/screens/settings/SettingsScreen.tsx:24–50` 的账户行指 `/account`；R18a 会替换设置页。Web `app/(app)/app/settings/page.tsx:1–30` 在远端还是旧 `profile-0918`；实施基线须先吸收 R18a 的新页面，不能以该旧文件猜已实现入口。
6. **私有 Blob 的真实限制。** `features/acquisition/storage/business-card-private-blob-store.ts:8–16` 是可注入 `put/get/delete/list`；`:19–45` 用 `@vercel/blob` 的 `access:"private"`，但 `put` 写死 `contentType:"image/jpeg"`；`:70–129` 有作用域 key、路径校验及分页删除。新 ZIP 不能直接调用现有 JPEG store。
7. **事务邮件与推送可复用。** `features/mail/transactional/index.ts:12–30,32–40,55–86` 有 `idempotencyKey`、非生产强制重定向/缺地址跳过；`features/notifications/push-adapter.ts:1–25,27–35` 有可注入 Expo push adapter，`push-device-service.ts:42–51` 可列 active 设备。需要本线出账号通知 outbox 与幂等状态，不能把邮件发送放进数据库事务里。
8. **身份与会话。** `app/api/account/status/handler.ts:14–25` 从 JWT 取 `sub/email/authenticatedAt`（缺时退回 `iat`）；`app/api/account/me/handler.ts:36–55` 用 `resolveAuthenticatedApiActor` 找 account/profile。`features/auth/storage/auth-account-provisioning-provider.ts:61–80` 可在登录时确保账号记录；申请后要用 `session-revocation.ts` 和 `auth.ts:68` 的删除时间戳拒绝旧 JWT，purging 期间阻止自动建号，清除后允许同邮箱创建新 account id。Google broker/认证屏归 R18b，申请时不可跳过 fresh 认证。
9. **存储归属。** `shared/storage/migrations.ts:6–29,73–88` 的现有 `orbit_records` 以 `workspace_id/collection_name/record_id` 为键，另有 `user_id` 与 profile accountId 索引；R18c 沿用此集合，以确定性 recordId + CAS 实现唯一性和状态转换，不新增 DDL。逐领域清除须核对每类 owner 字段和共享记录，不能只 `DELETE WHERE user_id=actor`。
10. **画板事实。** `b7-account-misc.html:1239–1312` 的退会例子含 Pro 文案、申请/取消/完成；`:1317–1347` 导出五选项、7 日、每日 3 次、后台进度与邮件/通知。`compare-redesign.mjs --list --design b7-account-misc.html` 在本机 3341 静态服务实查：#19–23 App 退会、#24–27 Web 退会、#28–30 App 导出、#31–32 Web 导出、#74 App 深色确认、#81 Web 深色确认；端尺寸分别 390×844 / 1440×960。

## 5. 上下文与易错边界

- **R18a 接线。** App 設定顶部账号行已约定进 `/account`；其数据导出行当前是 `準備中`；Web 言語と外観的「データを書き出す / アカウントを削除」在 R18c 前隐藏、只做区域门禁。R18c 把静态路由和链接接上，并重跑 R18a Web 言語と外観**整板**。若 R18a 尚未交付，先做服务端/契约，接线步骤等本线提交，不在旧 `profile-0918` 上加新功能。
- **R18b 接线。** 新认证页、Google broker、版本接口先由 R18b 交。R18c 用 broker 为删除申请完成有 `auth_time` 证据的新 Google 登录；`account-lifecycle` 按自己的开关转 live，未配置环境不报 500，版本接口保持 R18b 独立口径。若 broker 没有符合 §2-6 的 receipt，向 R18b 发具体输入/输出请求，先做密码与状态机独立项。
- **仅本人。** 各数据 adapter 必须用 session 解出的 account id，不能信请求体 actor；所有 GET/下载的私有响应 `Cache-Control: private, no-store`，越权 id 返回不泄露存在性的 404；日志、邮件/推送不包含导出内容、token、文件 key。
- **状态与失败。** 导出 queued/running/ready/failed/expired，文件 ready 与 outbox 入库原子边界；失败显示重试说明，不自动新建任务；系统故障 failed 退还已计额度。退会 pending/purging/deleted/cancelled 用服务器状态判定；离线、认证失效、邮件/推送渠道失败不得显示伪「完成」。Web 与 App 同一账号同时操作须幂等。
- **跨线组件。** A 线已有组件才可调用；缺参数/尺寸写 REPORT 请求 A 线，附 kit 元素与目标画板，不以私有 Button/Modal/Sheet 代替。新 App 页面都用 `AppScreen inset="kit"`；系统状态栏/Home 指示条不手画（通用规则 13）。

## 6. 契约、记录、导出内容与通知

### 6.1 API 与 `orbit_records`（无 DDL）

| 能力 | 约定 |
| --- | --- |
| `GET /api/account/exports`、`POST /api/account/exports` | GET 本人最近记录（分页、顺序稳定）；POST 要求近期登录，严格校验 scope/idempotency/mode/contactsFormat，以确定性 recordId + CAS 原子限制东京日 3 次及同时 1 个 queued/running，202 返回任务。系统故障失败退还额度，多账号隔离。 |
| `GET /api/account/exports/[id]`、`GET …/[id]/download` | GET 状态、进度（可选只加字段）与 ready 时即时生成的 **5 分钟有效**本站 URL；下载再次检查 actor/ready/`expiresAt`，从私有存储流出 ZIP。App 用 `FileSystem.downloadAsync` 带鉴权头下载，再以 RN `Share` 分享，不加原生依赖。过期 = 410，错人 = 不可枚举 404；响应不缓存。 |
| `GET/POST/DELETE /api/account/deletion-request` | GET 无请求返回 null；POST 在有报名的本人主办活动时阻止，必须附 ≤10 分钟、一次性、用途绑定的 fresh reauth receipt + 用户确认，202 返回原契约及可选状态，受理后立即发防冒用事务邮件；DELETE 在截止前 CAS 取消，幂等，过期/清除已领走返回 409。严出请求、宽进响应，不破坏旧字段。 |
| `orbit_records` 导出记录 | 确定性 recordId 组合 account、东京日、幂等键；记录 scope/mode/format、状态、文件 key/校验和、worker lease/attempt、ready/expiry、计额结果；同一键 CAS 只接受一次，日额度与活动任务占位也以 CAS 控制并发。 |
| `orbit_records` 删除与清除记录 | 每个 account 的确定性申请 recordId 与 CAS 状态机；记录 requested/purge/cancelled/reauth/started/completed 时间；每域进度记录游标、attempt、结果；通知 outbox 用确定性 kind/dedupe key。最终不留邮箱哈希墓碑。 |

`scope[]` 的既有五枚举保留；只加 optional 字段并同步 `shared/api-schema/account.ts`、App 副本、contract snapshot、schema parity。删除 POST 目前是**无请求体的 mock**，live 要求 fresh receipt 属请求收紧：新增严格请求类型，按 HOW-TO §9 在 `shared/contract/BREAKING.md` 记理由与两端同步；首次正式发布前按 README 规则 10 同版交付，不把旧 mock 的空 POST 当 live 许可。`downloadUrl` 当前 schema 要绝对 URL；服务端生成本站绝对地址，不在记录中存签名 URL。`GET /api/app/version` 仍归 R18b。`account-lifecycle` 转 live 时按开关放行；未配置 live 环境继续返回既有 mock/可恢复状态，不报 500。**不建新表、不做 DDL，README 无需号段**；生产 worker 开关仍待用户授权。

### 6.2 内容清单与安全

| UI 范围 | 导出内容与格式 | 取数边界 |
| --- | --- | --- |
| 人脈 | 联系人及本人维护字段 CSV / vCard；含稳定 id、来源/日期、可移植字段 | 仅本人可访问的联系人；CSV 防公式注入，vCard 转义/编码；图片只在 all-json |
| メモ | 本人文本、时间等可读元数据 CSV | 不能把他人私有会议资料带出 |
| プラン・ログ | 本人目标、Step、进度记录、本人 tasks CSV | `plans` + `tasks` 两 scope 一起映射，不漏任务 |
| イベント履歴 | 本人参加、报名、评价与主办操作记录 CSV | 不导出其他参与者名单与非本人私有字段 |
| すべて（JSON） | 上述五域的结构化 JSON + 本人上传的名片图，附 `manifest.json`（版本、UTC 时间、每域文件/数量/跳过原因）打 ZIP | 只由各域 adapter 返回授权数据；不原样 dump 表、OAuth token、密码哈希、外部 Gmail 正文 |

数据量大时 worker 流式分页与大小上限，超过上限置 failed 并给可读提示，不返回半成品；manifest 明示缺失/跳过域，不能静默成功。文件落私有 Blob，path 按 actor hash 隔离；过期 worker 删除对象并标 expired。事务邮件 `idempotencyKey=export:<id>:ready`；推送用同一任务语义键做去重，通知 deep link 到详情，通知失败独立重试不回滚成品。非生产邮件只能去 `ORBIT_MAIL_REDIRECT_TO`，本机推送用替身。

## 7. D-22 按领域清除清单（实现前按实际表/Blob key 补出 SQL 与 owner 列）

| 顺序 | 领域与必须覆盖的本人数据 | 成功证据/边界 |
| --- | --- | --- |
| 0 | 状态锁：原子领取到期申请、关闭普通 API/同步写入与后台生产者、注销会话；取消与领取互斥 | 领取前后竞态测试、任何普通请求均不能复活数据 |
| 1 | 第三方连携与设备：OAuth token、Gmail/日历缓存及同步游标、push token、mobile auth exchange、待发送个人通知 | 调用 Google token revoke，再清本地凭据；不给第三方再发读请求 |
| 2 | 导出：历史任务的私有 ZIP、到期链接、通知 outbox；名片私有 Blob 的 owner 清单 | 对象列表核对为空，缺对象视为可重放成功，错前缀不得删除 |
| 3 | 人脈：联系人、名片图片与 OCR 草稿、导入草稿、邀请代码/连接、关系任务与索引 | 本人 owner 行为零；共享联系人不删别人记录，只断本人关系 |
| 4 | メモ/Task/日程：文本、`memo_extractions`、提及、任务、提醒、个人予定/面谈提案 | 相关子表/索引/Blob 零残留；他人有权保留的共享面谈按领域规则匿名化 |
| 5 | プラン/iOrbit：计划、Step/日志、AI 草稿/会话/记忆、AI 用量账本、个人画像与相关缓存/搜索索引；共享会话里本人发的消息 | 本人内容与可检索数据为零；共享会话保留别人消息，不把本人消息归给别人；必要的非个人汇总不含内容 |
| 6 | イベント/主催：报名、评价、参加记录、主持资料、公开主办页、上传文件、成员关系 | 公开页不再可见；共享活动保留他人记录并移除本人身份/内容 |
| 7 | 收件箱/通知/同步：消息投影、已读回执、推送登记、离线同步游标/页副本服务端行、邮件投递记录、审计中个人字段 | 本人投影/令牌/个人化投递记录为零；审计仅保留必要的非个人计数，禁止保留内容 |
| 8 | 最终身份：先尝试完成事务邮件并记录交付结果，再清 profile、account、auth membership/凭据与会话、密码重置令牌与队列及该邮件产生的个人化投递记录 | purging 期间自动建号被挡住；完成后同邮箱可创建新 account id；#23/#27 为邮件链接进入的静态通用页，无回执或身份查询；跨域检查零残留 |

每步在 `orbit_records` 的确定性清除进度记录中以 CAS 幂等推进，可分页断点续跑；不得只靠 `user_id` 一列清除，必须逐域核对 `workspace_id/accountId`、共享数据所有权和私有文件前缀。C 线在自己的 `purge/<域>.ts` 直接按存储层清；B、D 活跃线只复核，交接表通知影响，不改其文件。前一步失败即停该账号，不执行身份最终清除；本机库对每域造样本、注入失败、重跑、核对本人数据零/别人的数据不变。实施者把实际表名、SQL/adapter、Blob prefix、owner 条件、结果数补在 REPORT。**生产清除调度/启用与生产备份保留期登记 DEFERRED**；备份保留期未查明不能报告生产清除闭环完成。

## 8. 路由替换、依赖与契约交接

- **App**：旧 `/account` 仍为入口但 `AccountScreen` 整屏替换；`/account/exports`、`/account/deletion`、pending、deleted 用静态路由，登录/注册等同目录静态路由仍归 R18b。`parentForPath` 如需新增返回映射，请 D 线改；已有后退足够则不碰壳。R18a 設定里的数据导出占位静态接线后失效，加入静态优先测试。
- **Web**：R18a 的 `/app/settings` 子菜单中アカウント与データの書き出し改到静态新页；`/app/settings/appearance` 的两个行内链接启用。Web 帐户页不挂公开页头，退会 pending 可在认证后从登录导向访问；申请后清 `web-mirror-storage`。清除完成页是从完成邮件链接打开的静态通用页，不查询已删账号。purging 期间阻止自动建号，完成后允许同邮箱新注册。
- **R18b**：Google reauth broker 支持 `prompt=login` 或 `max_age=0` 并校验 `auth_time`，提供用途绑定、≤10 分钟、一次性 receipt；原安全 `next` 规则不退化。账号 pending 识别须在登录成功后、进入普通首页前运行。C 线提供账号状态读取与 pending 路由，并在允许的 `auth.ts` 删除时间戳校验点使旧 JWT 失效；broker 文件需求由交接表通知 R18b。
- **R28**：账户删除/取消不改变引导路由；仅 purging 阻止自动建号，清除后同邮箱可以新 account id 进入全新引导。
- **A/B/D/E 线**：A 线组件缺口；C 线自己的 purge 模块直接清各领域存储；活跃 B、D 线收到交接表复核通知，不要求其交付 Blob 或 purge 代码。E 线内容按存储层清除，若有不可直接触达的专属接口再登记请求。每项在 REPORT 写受影响文件、预期 API、复核/交付状态。

## 9. 像素子 SC 与画板预检（HOW-TO §8、RD-16/26/28/29）

### 9.1 开工先 `--list`，改稿/补画后复查

`cd repos/orbits && node scripts/visual/compare-redesign.mjs --list --design http://localhost:<3340+>/redesign-2026-10/b7-account-misc.html --json`。编制时在 3341 实跑，序号与 §4 事实 10 一致。执行时不要依赖会漂移的 b12 序号；新画板按标题定位。先把 §2-1、§2-5、§2-9、§2-10 的矛盾就地改稿并标注，另在 b12 **末尾**按当前 kit 补 Web 1024/390/深色、App 其余深色与必要中途态；基准是原 b7 对应浅色画板，按 `b8` #15 断点排。补画与原稿的每个差异在 REPORT 列出，主会话复核后再作为门禁基准。

| 像素子 SC / id | 原画板 `b7-account-misc.html`（`--list`） | 状态入口/操作链 | 主题/宽度 |
| --- | --- | --- | --- |
| P-A01 | #19 ① 設定 › アカウント | App 設定 → `/account` | App 390 浅；深补画 |
| P-A02 | #20 ② 削除されるもの | `/account` → 退会する → 清单/导出链接 | App 390 浅；深补画 |
| P-A03 | #21 ③ 本人確認 + 30日 | 清单 → 次へ → fresh reauth → 勾确认 | App 390 浅；深 #74 |
| P-A04 | #22 ④ 申請済み | 申请成功 → 重新登录 pending → 取消按钮可见 | App 390 浅；深补画 |
| P-A05 | #23 ⑤ 削除完了 | 本机库时钟到期并跑 worker → 完成邮件链接打开静态通用页 | App 390 浅；深补画 |
| P-A06 | #28 ① 範囲を選ぶ | `/account/exports` → 选三项/联系人格式 | App 390 浅；深补画 |
| P-A07 | #29 ② 準備中 | POST → 后台任务 running，真实进度 | App 390 浅；深补画 |
| P-A08 | #30 ③ 準備完了 | worker ready → 邮件/推送替身 → 详情/下载/历史 | App 390 浅；深补画 |
| P-A09 | #74 退会 · 本人確認 + 30日 | 同 P-A03，App 切深色 | App 390 深 |
| P-W01 | #24 Web · 退会 1/2 | `/app/settings/account` → 退会 → 清单/导出 | Web 1440 浅；1024/390/深补画 |
| P-W02 | #25 Web · 退会 2/2 · 本人確認 | 次へ → reauth 弹层 → 勾确认 | Web 1440 浅；深 #81，1024/390 补画 |
| P-W03 | #26 Web · 申請済み | 重新登录 → pending → 可取消 | Web 1440 浅；其余补画 |
| P-W04 | #27 Web · 削除完了 | 本机 worker 完成 → 完成邮件链接打开静态通用页；同邮箱可新注册 | Web 1440 浅；其余补画 |
| P-W05 | #31 Web · 書き出し ① 選択 | 設定菜单或言語と外観链接 → 范围/格式 | Web 1440 浅；其余补画 |
| P-W06 | #32 Web · 書き出し ② 準備完了 | worker ready → 详情/下载/历史 | Web 1440 浅；其余补画 |
| P-W07 | #81 Web · 退会 2/2 | 同 P-W02，Web 深色 | Web 1440 深 |

补画标题建议 `A-R18c-P01-d` 等与 `W-R18c-P01-1024-light` 等；门禁配置里的 id 与标题一一对应。原画板没有的「导出失败/限额/过期」「取消成功/到期不可撤销」「邮箱/推送失败」「本人主办活动仍有报名时阻止退会」状态先用本线新组件做功能测试并在 **b12 末尾**补画；最后一项按 RD-33 主会话代定验收。未补完只附截图、不报像素通过。`b7` #6–18/#73/#80 的付费画板作废/下一期，不进 R18c 门禁。Web 言語と外観的 `b5` #31 与 R18a 新补画 S03/S13/S24 在入口接通后重跑**整板**，不能继续用 R18a 的区域裁剪结果。

### 9.2 预检五项（开工落 `preflight-checklist.md`）

编制时对 `origin/redesign` 画板与代码做的**静态预检**（还不是 `board-preflight` 工具通过）：

| 项 | 已见事实与待实施结论 |
| --- | --- |
| ① 数字/尺寸 | #21/#25 的示例 10/7→11/6 与契约 30×24h 自洽；#28 写每日 3 次、#30 写 7 日，D-21 一致；#29 的 64%/约 1 分钟没有现成 worker 来源，按代定 5 改为真实阶段；App 390×844、Web 1440×960。 |
| ② 数据来源 | R08 仅有 mock `accountExports`/`deletionRequest`（§4 事实 2–4）；人脈/メモ/プラン/事件的导出 adapter、历史计数、清除 step、文件大小/进度均须新建；#20/#24 Pro 数据本期不存在，按代定 1 去掉。 |
| ③ kit/token/组件 | 原稿用 `card`/`seg`/`btn`/`wmodal` 等 kit 样式（b7 :1239–1347）；执行时逐块比 R31a/b 的新组件与 token，未核到的参数列 A 线请求，不能用旧控件；本次没有运行组件级 `board-preflight`，不能把缺口记已通过。 |
| ④ 文案/行为 | Google-only 的再认证不能靠密码字段（#25 示例选中了「パスワード」）；申请后画板说登出、#22/#26 又允许登录取消，按代定 6–7 实现为重新登录只到 pending；全部 JSON 与五个 scope 冲突，按代定 2 映射。 |
| ⑤ 宽度/主题/中途态 | `--list` 实查只有 #74/#81 的深色确认板，其他深色、Web 1024/390 与失败/限额/取消态缺板；按代定 9 补画或明记「设计稿无」，不拿原稿浅色当深色像素通过。 |

先写 `views/{web,app}-R18c.json`（每个 P id、主题/宽度、route、开发态开关与源文件），执行 `board-preflight.mjs --design-base http://localhost:<端口>/redesign-2026-10/ --suite scripts/visual/views/<端>-R18c.json --md <本目录/preflight-checklist.md>`；原稿与改稿/补画后各跑一次。按每个 P 逐项记：①**尺寸与数字自洽**（30 日、7 日、每日 3 次、导出项数、倒计时/进度）；②**数据来源**（每行对应 §6 adapter、导出历史/邮件/推送、再认证 receipt、清除进度，缺的写推荐）；③**token/组件**（kit 数值与 R31a/b 参数，有缺口向 A 线请求）；④**文案与行为冲突**（Pro、Google-only 密码、申请后登出但可登录取消、真实进度/反馈）；⑤**宽度/主题/中途态**（原稿有无、补画标题、未比清单）。没结论的 P 不先做像素声称。

门禁：Web 先 `--style-diff`，再 `compare-redesign.mjs --suite ... --only <id>`；App 真 iOS 模拟器 `compare-redesign-app.mjs`，不用 react-native-web。整屏含壳；App 系统外壳不手画。超阈带逐条审 `triptych`，只能 `[data]`、`[raster]`、`[contrast]`（后者仅 substitutions 清单）；raw 只参考，按 §20/RD-29 全带有合规归因即通过。`design=`/`open-path` 状态开关只能开发环境生效，正式构建测试保证不存在。一个画面最多改 3 轮；依赖 A 线组件的列「待组件库」，缺画板的列「设计稿无」，两者写交接表与 DEFERRED-A 请求，不报 done。收口跑全量；独立复核重跑失败/改过的 + ≥20% 已通过并看 triptych。

## 10. 范围、测试与门禁

- **服务端有意义的测试**：本机 `orbit_records` 的确定性 recordId/CAS 并发与重放；东京跨零点 3 次配额、系统故障失败返还额度、同时 1 个 queued/running、幂等重试、不同账号隔离；导出五域样本 ZIP 内容/manifest/CSV 注入/vCard 转义，缺域显式 failed；私有 Blob 无公开 URL/错前缀删不掉；下载本人/他人/5 分钟 URL/过期/文件缺失；worker lease 与崩溃续跑、邮件/推送 outbox 幂等、非生产收件重定向；Google `auth_time`/一次性 receipt 同 account 与用途、密码核验限次、申请/取消/到期竞态；冷静期 API 白名单、旧 JWT 和 sync push/pull 拒绝；逐领域 purge 本机数据留下别人数据、失败重放、purging 阻止建号且清除后同邮箱新账号；未配置 live 环境不报 500。
- **两端渲染/操作**：每个 P 的静态态及点击路径；App `/account`、Web 言語と外観两入口；未登录、离线、503/读取失败、限额、过期；pending 登录仅取消/登出、取消后可用；完成后无个人内容；日语无中文/英文硬编码残留；只用新组件/`UiText`/`AppScreen inset="kit"`。开发状态开关/fixture 在正式构建不可用。
- **全量**：Web `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npm test`、`npm run typecheck`、`npm run typecheck:app`、`npm run lint`、`npm run copy:qa`；App `npm test`、`npx tsc --noEmit`；契约 snapshot/schema parity、`npm run sync:contract`、路由登记与旧屏 ratchet。对开工基线零新增失败。生产清除/外发只能靠本机替身测，不把跳过项写成通过。
- **本期不做**：付费方案/App 内购/自动解约、真正生产清除与部署、Google 真实账号或生产邮件/推送联调、R28 引导、R14 通知设置 UI、其他线组件/壳重写。

## 11. 验收契约（16 条；每条操作链与主证据）

| SC | 操作链 | 主证据 |
| --- | --- | --- |
| **SC-R18c-01 开工/预检** | R18b 已交 → rebase `origin/redesign` → 两端基线 → 核对现有 `orbit_records` CAS 路径 → b7 `--list` → 原稿预检与 §9 改稿/补画后预检；不预约迁移号段 | 基线摘要、存储核对、`preflight-checklist.md`、画板标题清单 |
| **SC-R18c-02 改稿与入口口径** | b7 去 Pro/内购与无能力反馈、修进度/选择冲突 → b12 末尾补缺屏 → App 設定/账户、Web 菜单/言語と外観两个入口都可达；旧占位静态优先 | 改稿 diff、路由/渲染测试、入口操作记录 |
| **SC-R18c-03 契约与存储** | `orbit_records` 确定性 recordId/CAS 并发重放 → scope 旧请求仍能读 → 新 mode/format 严格验证 → `account-lifecycle` 按开关 live、未配置不报 500，版本接口仍按 R18b 独立 live；无 DDL | PG/CAS 测试、契约 snapshot/schema parity、App 同步、capability 测试 |
| **SC-R18c-04 创建/限额/历史** | 两端选范围/联系人 CSV→vCard/全部 JSON → 近期登录后创建任务；同 key 重试同 id、同时只有 1 个 queued/running、并发第 4 次按东京日拒绝、系统故障 failed 退额度、次日可创建；GET 列表只返回本人且状态稳定 | 路由/PG 测试、两端操作、响应样例 |
| **SC-R18c-05 Worker/存储/通知** | queued→running→ready：按领域生成 ZIP/manifest，私有 Blob 保存，邮件+推送替身各收到一次；注入任务失败/渠道失败后按 outbox 重试、无重复消息；后台离页仍完成 | ZIP 样例核对、Blob 假体、worker/outbox 测试、通知替身记录 |
| **SC-R18c-06 下载/过期** | App 用带鉴权头的 `FileSystem.downloadAsync` + RN `Share`，Web 下载 ready ZIP；只有本人能取，URL 5 分钟后失效，复制链接给他人/注销后失败；ready+7 日后 410、私有文件被清理、历史显示期限切れ，新建重导出再计额度 | HTTP/存储测试、两端下载文件校验、过期截图 |
| **SC-R18c-07 App アカウント/导出** | 設定 → `/account` → 导出 #28 选 3 项 → #29 真进度 → #30 可下载/看历史；返回保持设置路径，离线不提交；`AppScreen inset="kit"`/新组件 | 模拟器操作 + A01/A06–A08 像素子 SC + 渲染测试 |
| **SC-R18c-08 退会申请与再认证** | App/Web 看清除清单、可先跳导出；主办活动仍有报名则拦下并要求中止或移交；未同步修改先提示 → 密码核验限次或 Google `prompt=login`/`max_age=0` + `auth_time` 校验 → 用途绑定、≤10 分钟、一次性 receipt → POST CAS 申请并立即发防冒用事务邮件；跨账号/过期/重用 receipt 均不能申请 | reauth/路由/并发测试、受理邮件替身、b12 阻止态与 A02/A03/A09/W01/W02/W07 像素子 SC |
| **SC-R18c-09 pending/取消** | 申请使旧 JWT 失效并清 App SQLite 镜像/outbox/草稿及 Web `web-mirror-storage`；普通 API 与 sync push/pull 拦截，仅白名单可用；重新登录只见「削除を取り消す」→ CAS 取消 → 数据原样恢复、连携需重接；超时或 purge 已领走无法取消 | 服务器状态/认证及本地清理测试、两端登录操作、A04/W03 像素子 SC |
| **SC-R18c-10 本机到期清除** | 本机测试库造 §7 每域数据与另一个账号 → 时钟+30 日 → C 线 `purge/<域>.ts` 按存储层清除、Google token revoke → 注入中途失败重跑 → 本人内容/Blob 零、别人不变；仅 purging 禁止建号，完成后同邮箱新 account id；生产任务未启用 | 逐域 SQL/对象清单与行数、失败续跑与新账号测试、生产禁用断言 |
| **SC-R18c-11 完成/异常态** | 完成邮件链接打开静态通用 #23/#27，不泄露姓名、不要求回执；发送失败不显示已发送文案；导出 worker failed、邮件/推送单渠道失败、期限切れ、限额/网络错误都有可恢复文案，不伪完成 | A05/W04 像素子 SC、静态页/邮件链接/状态测试、截图 |
| **SC-R18c-12 旧屏/路由/边界** | 旧 `AccountScreen` 替换、R18b 认证及 R18a 设置仍可用；Web 言語と外観整板重跑；路由/允许清单只改本线、检索无旧账号 UI 残留，跨线文件 diff 为零或有已登记授权 | route-parity/ratchet/审计、R18a 整板门禁、`git diff --stat` |
| **SC-R18c-13 像素全量** | §9 每个 P 和补画的宽/主题逐屏过门禁；只允许合法带归因；A 组件缺口发请求、缺画板/未过按规则登记；复核抽查 ≥20% | `views/{web,app}-R18c.json`、归因 JSON、raw/带数/三联图总表 |
| **SC-R18c-14 权限/可移植性** | 导出 URL/通知不泄露 key，csv/vCard/JSON 可打开；他人账号不能读/下载/删本人数据；申请状态仍允许取消但无普通产品读取 | 安全/格式测试、HTTP 状态表、ZIP manifest |
| **SC-R18c-15 交接与生产门禁** | README/HANDOFF/DEFERRED-A/决定表变更写四栏给主会话；活跃 B、D 线收到清除影响复核通知；A/E 需求逐项列结果；生产到期调度、Neon/部署与备份保留期登记 DEFERRED，不能记为 done | REPORT 请求/授权清单、交接复核记录、生产禁用测试 |
| **SC-R18c-16 全量与独立复核** | 两端全量/类型/copy/契约与本机 PG 零新增失败；REPORT 对 §3 条目逐条处理、越线自查；主会话独立复核重跑门禁/测试 | 测试通过/失败数与失败名、REPORT、REVIEW |

## 12. 执行顺序

1. SC-01：R18b 基线与 `orbit_records` CAS 核对，`--list`、画板/数据预检；SC-02 改稿与补画先成独立提交，b12 末尾必须有主办活动仍有报名的阻止态。若 b12 同时有人追加，先同步并仅追加自己的组。
2. 测试先行：SC-03 `orbit_records` 状态与契约 → SC-04 配额/历史 → SC-05 C 线私有 ZIP 适配器、worker/outbox → SC-06 下载/到期；每个可运行子步骤先 RED 后 GREEN。
3. SC-08～10：先 reauth receipt/状态机、`session-revocation.ts` 与 `auth.ts:68` 删除时间戳校验，再申请/取消，本机库由 C 线 `purge/<域>.ts` 逐领域清除；把生产调度保持关闭，活跃 B/D 线只收交接表复核通知。
4. SC-07、SC-11、SC-12：两端路由和入口、异常态、旧屏替换，复测 R18a/R18b。组件只引用 A 线新组件。
5. R31a/R31b 已在本线基线后，执行 SC-13；每个画面迭代最多 3 轮。先局部 `--only`，收口全量；R18a 言語と外観从区域改整板重跑。
6. SC-14/15/16：权限与 ZIP 核对、交接/待授权、两端全量、REPORT；主会话独立复核后处理问题。只在 `line-c` 按路径提交，不推送。

## 13. 失败、请求与交接

- **明确依赖**：R18b Google broker 若尚不能提供 `auth_time` 与用途绑定的一次性 receipt → 密码与状态机继续，Google 申请链标缺项并交接；A 线组件缺失 → 功能继续，受影响像素标「待组件库」。C 线不等待 B 线 Blob 抽取或跨线 purge adapter；按自己的存储适配器和清除模块实施，B/D 线复核影响。
- **待主会话代定**：§2 的 RD-33 决策已采纳；实施遇到新的真实画板/代码矛盾，写候选、推荐、受影响 P/SC，跳过受影响项继续；偏离画板先改稿标注并交主会话复核，不私自用 `[data]` 放过。
- **待用户授权/DEFERRED**：生产到期 worker 调度/开关、Neon、部署、真实 Google/外发邮件推送/TestFlight 待用户授权；生产备份保留期登记 DEFERRED。REPORT 写具体依赖、验证范围与生产禁用状态；主会话在 DEFERRED-A 追加四栏，不用用户离线时发问。
- **交接给主会话**：README R18c 登记（无迁移号段）、HANDOFF R18-06 实施结果与 B/D 线复核通知、DEFERRED-A 备份保留期及授权项、决定表 §C-3 每条原文、screen-ownership App `account` 及 Web 设置页状态、b7/b12 改稿认可、R18a 言語と外観整板重比结果。REPORT 不改汇总文档。
- **完成判定**：SC 通过要有对应运行证据；本机清除全域通过仍不等于生产已启用。未做、失败、待组件/待画板/待授权分别列出，不把它们计入通过。

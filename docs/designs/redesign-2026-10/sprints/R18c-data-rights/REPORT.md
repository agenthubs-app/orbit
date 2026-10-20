# R18c 数据导出与退会执行报告（未收口）

2026-10-20，line-c。开工从 origin/redesign@063c3c65d 快进；本线仅作路径限定提交，没有 push、部署或访问 Neon／生产。主会话 RD-33 的前五项及第二批 §R18c-6/7/8 已落实到本机代码、改稿或明确的停点。独立复核 S1–S3、M1/M2、m1 的代码修复与交接已执行。**本 Sprint 尚未满足全部 SC：不可变角色账本的自由文本、像素与外部联调仍有缺项。** 生产到期清除保持关闭。

## SC 对照

| SC | 状态 | 主证据与缺项 |
| --- | --- | --- |
| 01 开工／预检 | 完成 | R18b 基线、现有 orbit_records CAS、b7 原稿／改稿 16 板与 b12 登记已核；preflight-checklist.md 及 _evidence-c 预检。 |
| 02 改稿／入口 | 部分 | b7 去 Pro、虚假反馈和进度估计；RD-33 重画 #19、认可 b12，App/Web 权利入口已接，均走过本机导出及密码退会路径；像素仍红。 |
| 03 契约／存储 | 本机通过 | 严格 POST、确定性 recordId/CAS、契约 snapshot/schema parity 5/5、App 副本同步；无 DDL。Web/App 本机各走过一条实操链，真实生产规模未验。 |
| 04 创建／限额／历史 | 本机通过 | Web 与 App 原生各实操 CSV、vCard、all-json 三次 202、第四次 429 和专用文案；App 历史 queued→ready。同键重放、单活动任务、失败返额度及次日配额有 PG 测试。 |
| 05 Worker／ZIP／通知 | 部分 | Web/App 各三次手动维护 pass 到 ready，生成私有 ZIP/manifest；邮件因本机无 redirect target 被明确跳过。离页自动调度和生产任务列 DEFERRED。 |
| 06 下载／过期 | 部分 | Web 同源登录后三份 ZIP 成员已核；App 原生三份 signed ZIP GET 200，iOS 分享面板显示 894／833／786 字节。本人授权、5 分钟链接、7 天过期与对象清理有聚焦测试；实时时钟到期操作未留证。 |
| 07 App 账户／导出 | 部分 | AccountScreen 已整屏换为 kit 行，保留 profile、workspace、目标、权限、登出及服务器入口；debug 仅 dev。复核修复把 Ionicons 换成设计图标并缩减旧用法清单。App #19 三轮和其余 P 板像素未过。 |
| 08 退会申请／再认证 | 部分 | Web 本机密码再认证、receipt、删除申请实操返回 202；Google challenge + prompt=login/max_age=0 + auth_time ≤10 分钟、同账号校验已接。复核 M1 把 Web challenge 从回调 URL 移入 5 分钟 HttpOnly／SameSite cookie，回调固定站内路径；真实外部 Google 账号及 App 原生整链未联调。 |
| 09 pending／取消 | 部分（本机双端链通过） | Web 申请后旧 JWT 失效，重新登录进入 pending，GET 200、取消 DELETE 200；App 原生申请后返回登录，重新登录显示 pending 日期并取消，数据库为 cancelled。复核修复增加异机 pending 专用擦除，不归档 outbox，同时清恢复库；本机生命周期测试覆盖未打开镜像及失败重试。真实第二设备与像素仍未通过。 |
| 10 本机到期清除 | **未通过** | 逐域 runner、失败续跑、共享面谈双账号及规范化事件双账号测试已过；复核修复后对方回执、通知与 API/离线同步占位有 PG 回归。PII-free publication 旧快照、修复台账中的不透明 ID 会计数保留。角色账本 `reason` 为必填自由文本，含退会者的行仍失败关闭；未完成包含这类行的端到端到期清除。 |
| 11 完成／异常态 | 部分 | RD-33 匿名完成邮件 outbox 与最终身份删除同事务，提交后投递；本机失败重试通过。#23/#27 像素三轮仍红。 |
| 12 旧屏／路由 | 部分 | #19 整屏替换；复核修复把 AccountScreen 的 Ionicons 全换成设计图标并从旧用法清单移除。R18a/R18b 路由保留；Web 言語と外観整板 6/6 红，需 A/集成轮复核。 |
| 13 像素全量 | **未通过** | RD-33 b12 已是正式基准；原稿 P、补画 P 与 R18a 整板矩阵均有失败。每 P 上限和转轮⑪见下。 |
| 14 权限／可移植 | 部分 | actor 隔离、CSV 注入、vCard 转义、JSON 白名单、私有 ZIP 等聚焦通过；Web 三种 ZIP 可打开且成员与 manifest 对齐，App 原生分享面板显示三种 ZIP。共享域零残留未验。 |
| 15 交接／生产 | 部分 | 下方四栏交接和 DEFERRED 已登记；根台账与活跃 B/D/A/E 线由主会话协调，未越权发送或启用生产。 |
| 16 全量／独立复核 | **未通过** | 主会话 REVIEW 的 S1–S3、M1/M2、m1 已修复并提交；本轮 Web／App 全量各跑一次，退出码均为 1，逐名差分分别出现 2／3 项新名。Web 两项代码测试、App 一项旧桩缺口已修后聚焦通过；App 另两项为基线改名／已复现的波动。修补后的最终代码未再跑全量，故不声称“新增 0”门禁通过。 |

## RD-33 实施与安全边界

- **§R18c-1 共享数据。** 共享面谈将退会者参与者 ID 换成本次删除占位 ID、移除本人备注，对方记录保留；规范化事件报名/参加行匿名化，主办有报名继续阻止、无报名可删除。对应提交 4f77e92bc、2457d1411；PG 双账号与重跑测试通过。publication 和不可变账本已按第二批代定细化，不将假名化保留说成物理零行。
- **§R18c-2 账户 #19。** 新版列表保留 profile 编辑、workspace、目标、时区/状态、权限、导出/退会、登出和服务器设置。删掉无可信来源的端末数与无路由的密码设置；设备 debug 仅开发构建。后续修复了游客旧邮箱泄露及服务器入口。提交 c74ec67d5、a85a81859、56591c516。
- **§R18c-3 认证。** purging 阶段阻止自动建号，删除完成后同邮箱可用新 account ID；App/Web pending 登录先到 pending 页。Google fresh challenge 用 AUTH_SECRET 加密并绑定 actor/user/email/退会用途，核验同账号 auth_time 后签发 10 分钟一次性 receipt；broker 发 prompt=login、max_age=0、auth_time essential claim。提交 a6616ad22、725a6df66。真实 Google OIDC 行为需获授权的外部账号联调，不能以本机替身证明。
- **§R18c-4 画板。** b12 补画已按 RD-33 认可为正式基准，#19 改稿在 b7 注明。Web #27、App #23 各三轮上限的残差与 28px 标题组件缺口转像素余项轮⑪；不在 C 线加私有 token。
- **§R18c-5 完成邮件。** final-identity 同一事务删除身份并写只含收件地址、模板和投递控制字段的匿名 outbox；提交后投递，成功删行，失败保留重试。提交 cdab6d89e，PLANNER 相应句已改。邮件服务真实投递仍列 DEFERRED。
- **主会话代定 §R18c-6/7/8。** 事件角色版本、修复 item 与无 PII 的旧 publication 中，只有不透明 actor ID 可保留并计入 `retainedPseudonymizedAuditRows`；本机样本为 2 行（修复 item 与无 PII 旧 publication）。角色版本 `reason` 是数据库要求非空的自由文本，因此该类行失败关闭，不能凭 actor ID 豁免。当前 head 指向的 publication 改用新 generation／新 publication 和 head revision 前移，旧含 PII 版本走现有 `delete event_ops_publications` 清理路径；若旧版仍残留精确 actor/participant 值或无法删除，事务回滚且清除失败。收件箱保留其他成员与会话 active 状态，退会者消息在原记录更新为统一占位 ID／匿名文案，借原有 revision 同步；legacy 会话成员也用同一占位。规范化会话的 inviter／invitee 是同步身份列，未改写以使 owner 审计通过；本轮复核 S3 在授权的 bounded-reader 中把已删除成员投影成统一占位，使对方 API 与离线同步都不读取原 ID。原实现代码与 PG：662da1d02；无库测试和 App Debug 断言：5d23ad2dd；第二批聚焦 PG 与同步审计 13/13，本轮回归另列下节。

本机到期清除逐域顺序为连携／设备、导出对象、人脈、メモ／Task／日程、プラン／iOrbit、イベント、收件箱、最终身份。每步有确定性进度/CAS 与租约；失租和残留会阻止最终身份。只有实际连接为 loopback orbit_line_c_test 且显式 local 环境时可运行。合成 ZIP 位于 _evidence-c/R18c-sample-export.zip，含五域 JSON 与 manifest；它不是现实账号导出。

**Web 本机实操。** 使用 localhost:3400 与本机测试账号，从画面提交 selected CSV、selected vCard、all-json 各一次，均返回 202；每次手动执行一个维护 pass 后为 ready。三份浏览器下载分别为 894／833／786 字节，成员为四域 CSV + manifest、contacts.vcf + 其余 CSV + manifest、五域 JSON + manifest。第四次返回 429，画面显示「今日の書き出し回数に達しました。明日もう一度お試しください。」。实操发现 all-json UI 曾误传 contactsFormat 导致 400，以及 Web 错读 error.context.reason 导致限额时显示通用错误；两端 UI 已省略 all-json 格式字段，Web 错误解析已修复，复试上述 202/429 均正确。测试账号没有业务记录，文件为空/header-only，不能代表真实大账号。证据为 _evidence-c/R18c-web-local-export-observation.json、三份 R18c-live-local-export*.zip 和维护日志。127.0.0.1 与 localhost 是不同 cookie 主机，下载必须使用与签名 URL 同源的 localhost 登录；本机首轮跨主机点击 401，不将其归为生产验收通过。

**Web 本机退会实操。** 首次密码再认证后申请已写入 pending，但响应为 500：`requestedAt` 与 `purgeAfter` 分别读取时钟，差 8ms，违反契约的精确 30 天约束。改为从同一 `requestedAt` 推导截止时间，并加入时钟逐毫秒前进的 PG 回归测试（3/3）。仅对本机测试账号的旧 pending 行修正截止时间后，画面 GET 200、取消 DELETE 200。再次从画面完成密码再认证，申请 POST 202；旧 JWT 随即失效，重新登录进入 pending，GET 200、取消 DELETE 200，最终数据库为 cancelled／version 4／精确 30 天。申请后重新登录是当前会话撤销契约的实际路径；画面会先跳到登录。证据见 _evidence-c/R18c-deletion-clock-targeted.log 和 R18c-web-local-deletion-observation.json。没有触发到期清除或生产服务。

**App 原生实操。** 专用 iOS 模拟器上，测试账号从账户入口完成密码再认证和申请；申请后旧会话退出，重新登录看到 pending 日期，点取消回到账户页，数据库为 cancelled／version 6／精确 30 天。另一本机测试账号先在导出创建遇到 POST 401：移动端签发的 Auth.js cookie 缺少 `authenticatedAt`，而创建接口要求最近登录。签发时加入真实认证时刻，移动认证聚焦 15/15、Web typecheck 通过；重新登录后 selected CSV、selected vCard、all-json 各创建 POST 202，各自手动维护到 ready，三份原生签名下载 GET 200，iOS 分享面板显示 894／833／786 字节 ZIP。第四次 POST 429，画面显示专用日限额文案。证据见 _evidence-c/R18c-app-local-rights-observation.json、三份 R18c-app-local-export*-share.png、三份维护日志、R18c-mobile-cookie-auth-targeted-final.log。两个测试账号均无业务记录；真实 Google、邮件和到期时钟未实操。

## 画板与像素实测

- b7 原稿与改稿预检 16 板、数字冲突 0；b12 App/Web 登记共 152 frame，预检数字冲突 0。认可基准不等于像素通过。
- App #19 有效原生三轮：run-01 raw 0.0641／8 超阈／11 缺块；run-02 0.067／8／9；run-03 0.0654／8／5。三轮上限转⑪。App #23 原生三轮最终 raw 0.0251／3／0，转⑪。
- Web #27 三轮最终 raw 0.0072／1／2，转⑪；剩余 28px 标题与 kit token 差异交 A 线。Web b7 P01 已登录后的有效截图 raw 0.0581／4／29。
- b7 其余 App P02/P03/P04/P06/P07/P08/P09 一轮 7/7 失败；Web P02/P03/P05/P06/P07 一轮 5/5 失败。b12 App P02/P03/P04/P06/P07/P08/P09 浅深 14/14 失败，Web P01/P02/P03/P05/P06/P07 三宽浅深 36/36 失败。R18a 言語と外観整板 6/6 失败。部分画面缺对应 live 状态 fixture，不能把错态截图判为像素通过；完整 triptych、raw/带数在 _evidence-c/R18c-*-P-matrix-run-01 与对应 summary.json。各 P 当前只跑一轮，余项转⑪。

## 独立复核修复

主会话 REVIEW（`5f9d78c1c`）结论为不通过。本轮按 S1–S3、M1/M2、m1 做如下修复，代码提交为 App `f59a49887`、Web `7181b275c`；这不解除角色账本、像素或外部联调停点。

| 复核项 | 修复与本机证据 |
| --- | --- |
| S1 异机 pending | `AuthSessionProvider` 三个 pending 入口改走账户删除专用擦除。原生生命周期直接关闭/删除对应身份镜像和恢复库，不调用会归档 outbox 的通用 logout；浏览器镜像提供同名擦除且降级时失败关闭。原生 `sync-lifecycle` 50/50，覆盖异机未打开镜像、恢复库与文件失败重试；浏览器镜像与登录测试最终聚焦 24/24。未做真实第二设备操作。 |
| S2 共享面谈 | 只删除退会者的命令回执和由本人发起的 outbox。保留对方幂等键和净化后的回执，重试返回净化结果；对方旧 outbox 保留但取消待投递状态并剔除敏感字段。处理中 outbox 先失败关闭。对方旧 `notifications` 撤销，对方 `inboxNotifications` 保留为合法的固定文案、不可跳转项，清除作者与摘录。单个本机 PG 用例覆盖双账号、处理中重试、两类通知与幂等重放，1/1。 |
| S3 共享收件箱 | 经主会话授权，仅在 B 线 bounded-reader 的共同 SQL 身份投影增加成员缺席判断；API 与离线同步都输出 `deleted-account`／`削除済みユーザー`，不露原 inviter／invitee ID，也不产生空姓名。真实 PG API／sync handler 8/8，通过对方列表、消息及设备副本断言。 |
| M1 Google challenge | Web start 返回 5 分钟 HttpOnly／SameSite cookie；OAuth 回调固定 `/app/settings/account`，页面仅存非秘密的 tab 标记；回调 POST 从 cookie 取 challenge，校验新 Google `auth_time` 与原账号后清 cookie。移动端原有 body challenge 不变。聚焦 3/3，含错账号 403；真实 Google 外部账号未联调。 |
| M2 越线登记 | D 线 `app/index.tsx` 最小 pending 跳转获主会话追认；R18b mobile Google broker 本属 C 线；S3 对 B 线读取器只加投影获本轮明确授权。三者已在下方交接与越线自查点名。 |
| m1 旧图标 | `AccountScreen` 全部改用设计 `Icon`，从 Ionicons 旧用法清单移除该屏；聚焦 5/5，App typecheck 通过。 |

## 测试与门禁

所有日志与逐名差分在 /Volumes/ORICO/Dev/worktrees/orbit/_evidence-c/。第一轮全量后按第二批代定做有界修复；本轮 REVIEW 修复后另经 heavy.sh c 运行 Web/App 全量各一次。环境仅设置 LANG=en_US.UTF-8、LC_ALL=en_US.UTF-8，没有全局数据库 URL。失败数与新增失败逐名区分，**未将跳过项或聚焦结果冒充通过**。

| 门禁 | 实测 |
| --- | --- |
| Web 全量 | 第二批 R18c-web-full-rd33-batch2.log：7,913 tests／6,818 pass／5 fail／1,090 skip，exit 1。R18b 基线 7,764／7,204 pass／15 fail／545 skip；`R18c-web-full-rd33-batch2-delta.json` 逐名比对 **0 新、10 消失**。余下 5 名为 manifest generation、merging、design fixtures、add-scan e2e 与 R12 review m9，均在 R18b 失败名单中。第一轮为 7,911／6,811／35／1,065，30 新；对应日志与旧差分保留。PG 用例无库改 skip 后没有把真实 PG 集成行为算作通过。 |
| App 全量 | 第二批 R18c-app-full-rd33-batch2.log：3,274 tests／3,259 pass／13 fail／2 skip，exit 1。R18b 基线 3,246／3,232 pass／12 fail／2 skip；`R18c-app-full-rd33-batch2-delta.json` 逐名 2 新、1 消失。新增名一项是原 i18n 快照用例改名且已在 `origin/redesign` 同红；另一项是 C 线 AccountScreen 改稿后 Debug outbox 的源码断言仍匹配旧 JSX。已改断言并聚焦该文件 11/11 通过，**此修补在 App 全量复跑之后，故不声称最终全量零新增已验证**。第一轮为 3,274／3,246／26／2，15 新；旧日志与差分保留。invite 此次通过、discovery 仍红且基线 HEAD 同红。 |
| REVIEW Web 全量 | `R18c-web-full-review-fix.log`：7,915 tests／6,817 pass／7 fail／1,091 skip，exit 1；对 R18b 逐名 2 新、10 消失、5 同红，见 `R18c-web-full-review-fix-delta.json`。两项新名是缺 challenge 时错误码及 notes 写入锁审计；全量后分别修成 400 和 commit-order lock，聚焦 13/13、S2 PG 1/1，最终补丁未再跑全量。 |
| REVIEW App 全量 | `R18c-app-full-review-fix.log`：3,276 tests／3,260 pass／14 fail／2 skip，exit 1；对 R18b 逐名 3 新、1 消失、11 同红，见 `R18c-app-full-review-fix-delta.json`。新名一项是 pending 删除测试桩未实现新擦除方法，补齐后与浏览器镜像同跑 24/24；一项 i18n 为已在基线复现的同一 hash 失败但用例改名；一项 invite 遮挡超时已在基线副本复现。最终测试桩补丁与浏览器降级断言未再跑全量，不声称最终新增 0 已由全量证明。 |
| 聚焦／类型 | 第二批规范化事件＋收件箱 PG 与 sync 审计 13/13、修复账本样本 1/1、无库 PG 条件 26 tests／2 pass／24 skip／0 fail、静态注册指南 1/1；Web typecheck/lint exit 0。前批删除时钟 PG 3/3、移动认证 15/15、导出错误/契约 4/4；App account ink 9/10（基线 discovery 红）、静态/离线 57/57、App typecheck exit 0。先前 Web auth、App auth/pending、导出/runner、契约聚焦证据见各 R18c-targeted 日志；真实 Google 未测。 |
| copy/契约 | Web copy:qa 原先 7,507 条／245 issues，exit 1，非 R18c 权利文案专属；Web/App 契约同步与 schema parity 聚焦通过。未把红门禁记为通过。 |

第二批 Web 修复的无库聚焦检查 `_evidence-c/R18c-web-unconfigured-pg-skip-targeted.log` 为 26 tests／2 pass／0 fail／24 skip；静态注册指南原本误装 PG fixture，移除后独立 1/1 通过。共享事件、收件箱和同步审计 `_evidence-c/R18c-rd33-batch2-purge-sync-final.log` 为 13/13；包括在新 publication 保留其他参与者的图节点、legacy 已匿名正文仍替换旧发送者 ID，以及修复账本假名化样本。这两个细节补丁在 Web 全量复跑后完成，故 Web 全量“新增 0”不覆盖最终补丁，但 PG／审计与 typecheck／lint 聚焦已重验。跨线 PG 用例只改“未配置本机库时跳过”条件，配置本机库时保留原断言；这些真实库路径未由全量无库运行覆盖。

REVIEW 聚焦证据：Web Google 再认证／写入锁审计修补后 `R18c-web-new-failures-fixed.log` 13/13；共享面谈真实本机 PG `R18c-web-s2-after-lock.log` 1/1；对方列表与同步真实本机 PG `R18c-s3-final.log` 8/8。App 原生生命周期 50/50；最终 browser/provider 聚焦 `R18c-app-review-targeted-final.log` 24/24，包含降级擦除失败关闭。Web、App typecheck 最终均 exit 0；Web lint 在 REVIEW 最后锁补丁前通过，最终锁补丁另有审计聚焦但未重跑完整 lint。全量日志早于这些最终补丁，不能作为最终版本通过的证据。

第二批 App 归因在当前 worktree 内临时展开 `origin/redesign` 只读副本并运行相同单项后清理副本，证据为 `_evidence-c/R18c-app-baseline-{i18n,discovery,invite}.log`。三个用例在基线 HEAD 均与本线同样红：i18n `en` 实际 hash `11378de4…` 与期望 `638192bf…` 不等；discovery `aria-checked` 为 null 而非 `false`；invite 点击被提示层遮挡而超时。本线 i18n diff 仅追加键，未改预拆分键的值。三项不记作 C 线新增失败，也不报它们通过；第二批全量中 invite 偶发转绿。Debug outbox 是本线改稿后旧源码断言未同步，已更新为校验当前 `__DEV__`／非 Web／登录条件，`_evidence-c/R18c-app-debug-guard-targeted.log` 11/11 通过。Web 注册指南基线 `_evidence-c/R18c-web-baseline-registration-guide.log` 同样因缺 `ORBIT_EVENT_DATABASE_URL` 红。

## DEFERRED、待主会话决定与四栏交接

已接受的已知限制：每域 10,000 行显式失败上限、ZIP 同步压缩、离页自动调度与生产到期任务、真实 Google revoke／Blob eraser／邮件联调。这些不阻止本地代码交付，但不能包装为运行验证。生产调度、Neon/部署、备份保留期和真实外部账号仍待用户授权。

第二批代定已解除原先的 publication 就地改写和 owner 审计冲突；同步审计聚焦现为 13/13。**DEFERRED：不可变账本假名化保留，待用户确认法务口径。** 角色版本 `reason` 强制非空且可写自由文本，含退会者的角色行无法归入「只有不透明 ID」，继续失败关闭；若要清除这类旧行，需要用户授权迁移与法务口径。旧 publication 若现有删除路径受触发器阻止且仍含 PII，同样失败关闭并列需授权迁移。复核 S3 经主会话授权在 B 线 bounded-reader 只加占位投影，对方 API/离线同步不再输出已删除成员原 ID；B 线仍需评估集成环境。生产最终清除、外部 Google／邮件／Blob 联调仍待用户授权。

| 目标 | 本线版本／事实 | 另一端影响与请求 | 未完成／验证范围 |
| --- | --- | --- | --- |
| README 契约 11 | shared/contract/account.ts、BREAKING 与 App 副本同步；严格删除 POST | 主会话合并同版契约与根登记 | 聚焦契约；本机 Web/App 各走过导出及密码退会，外部服务未验 |
| HANDOFF／DEFERRED-A | 本机 export、pending、purge 与匿名完成 outbox；生产入口关闭 | 主会话登记 D-21 部分、D-22 未收口和生产授权 | PG/替身；无 Neon/生产 |
| A 线组件／像素 | #19 kit 行已落，#23/#27 三轮上限；28px 标题无私有 token | A 线复核标题 token、ListRow/长文案；⑪ 接收残差 | 详见 triptych；P 矩阵红 |
| B／E 数据 | 共享面谈、联系人/Blob、事件新 publication 与 inbox 消息匿名化；经主会话授权追加 bounded-reader 占位投影 | B 线复核对方列表/离线同步的 `deleted-account` 与固定显示名；E 线复核跨域生产者 | 本机双账号 PG 样本和真实 sync handler；角色 `reason` 的 PII 仍失败关闭 |
| D／R18b 认证壳 | pending 登录路由、purging 建号阻断、Google fresh receipt | 复核外部 OIDC、旧会话及设备同步撤回 | 本机聚焦；无付费外部账号联调 |
| 同步域 | purge 已取 commit-order lock；owner 与 immutable publication 两项聚焦审计已转绿 | B 线确认匿名消息及会话投影的对方设备实际呈现；主会话安排独立复核 | 13/13 聚焦；本机规范化事件 PG 和 inbox PG 通过，跨端实机未覆盖 |

越线自查：未改 A 组件/token 或生产配置。R18c 既有 `app/index.tsx` pending 跳转属于 D 线导航壳，主会话在本轮复核中追认其最小改动；R18b mobile Google broker 本属 C 线，不另作越线。复核 S3 由主会话明确授权 C 线只加不改 B 线 `relationship-communication/bounded-reader.ts` 的占位投影，未碰 B 线写入行为；向 B 线交接本机 API/同步验证范围。此前无库 Web 测试跳过条件与静态 PG fixture 修正已登记。HANDOFF-CLAUDE-2026-10-19.md 为用户预存文件，未触碰。开发服务器、Metro 与专用模拟器已关闭；3000 端口未动。仅本地提交，无 push。像素余项轮⑪、外部联调及上述遗留仍未完成，本报告不宣称 R18c 收口。

## 主会话收口核验（2026-10-20 17:10）

在 verify worktree `origin/redesign@9edbef851`（含全部复核修复）按基线环境（只设 LANG/LC_ALL=en_US.UTF-8）独立跑两端全量：Web 5 fail，全部在 R18b 基线名单内，**新增 0**；App 3,277 tests／14 fail，逐名对照基线出现 3 个新名：①「S1 これまでのコード…」在 D 线 R20b 多次全量（`_evidence-d/R20b/run-01/*app-full*.log`）已失败，属既有；②「the original split key set retains its current approved copy snapshot」为基线 i18n 快照用例改名，`origin/redesign` 同红；③ `tests/tasks-unification-interactions.test.ts` 为 Playwright `route.fulfill: Route is already handled` 负载竞态，单独重跑 22/22 ×2 通过。结论：本线新增失败 0，R18c 收口。像素→⑪；不可变角色账本 `reason`、生产清除与外部联调待用户授权。日志：`_evidence-main/r18c-{web,app}-full.log`。

# R18c 数据导出与退会执行报告（未收口）

2026-10-20，`line-c`。开工从 `origin/redesign@063c3c65d` 快进；本线只做路径限定提交，没有推送、部署或访问 Neon／生产。当前实现有可用的本机导出与密码退会申请链，但 **D-22 全域清除、两端操作链、像素与全量门禁尚未达到验收条件**。生产到期清除保持关闭，需用户另行授权。

## SC 对照

| SC | 状态 | 证据与未完成条件 |
| --- | --- | --- |
| 01 开工／预检 | 部分 | R18b 基线、`orbit_records` CAS、b7 原稿／改稿 16 板与 b12 补画 136 frame 已核；两端收口全量均红，逐名差分见末段。 |
| 02 改稿／入口 | 部分 | b7 去 Pro、虚假反馈和进度估计；b12 末尾补 68 组，App／Web 导出和退会入口接通。b12 仍为待主会话复核草案。 |
| 03 契约／存储 | 部分 | 契约 11 可选字段、严格 POST、BREAKING 记录与 App 同步；确定性 `orbit_records` + CAS，本机 PG 并发测试通过。契约/schema parity 5/5；真实端到端未验。 |
| 04 创建／限额／历史 | 部分 | 东京日三次、一个活动任务、幂等与本人读取在 PG 测试通过；两端真实操作未验。 |
| 05 Worker／ZIP／通知 | 部分 | 五域 ZIP、私有存储、租约、outbox 与本机替身已有聚焦测试。维护入口需调用，未验证离页后的自动调度；压缩仍同步处理，未流式分页。 |
| 06 下载／过期 | 部分 | 本人／他人、五分钟链接、七天到期与对象删除有聚焦测试；App 原生下载分享与 Web 真实操作未验。 |
| 07 App 账户／导出 | 部分 | 二级路由、导出选择／进度／下载已实现；签名模拟器仅核 App #23 完成页，导出操作与 A06–A08 像素未验。旧账户总览未按 #19 整屏替换。 |
| 08 退会申请／再认证 | 部分 | 密码限次、用途绑定十分钟 receipt、主办仍有报名阻止、CAS 申请与受理 outbox 有本机测试。Google broker 未交付 `auth_time` + `prompt=login`／`max_age=0` 证据，申请链明确 503。 |
| 09 pending／取消 | 部分 | 旧 JWT 删除时间戳、API 白名单、CAS 取消、本机镜像清理已实现并有聚焦测试；重新登录只到 pending 的 App 原生／Web 浏览器整链未验。 |
| 10 本机到期清除 | **未通过** | 本机 runner 的无共享事件账号失败重试、八域步骤与同邮箱新 ID 测试通过；规范化共享事件与共享面谈明确停止。真实 Google revoke／名片 Blob eraser／邮件发送仅有注入替身；purging 阶段跨线自动建号阻止未交付。不能宣称 D-22 完成。 |
| 11 完成／异常态 | 部分 | 静态完成页和可恢复错误态已接线；完成邮件仅本机 sender 替身。Web #27 与 App #23 各三轮像素仍红。 |
| 12 旧屏／路由 | **未通过** | R18a/R18b 既有 profile、workspace、debug、认证入口保留，C 权利入口已加；旧 `AccountScreen` 仍在，整屏替换与 R18a 言語と外観整板未验。 |
| 13 像素 | **未通过** | b12 草案未获主会话认可；Web 完成页 #27 三轮余 1 条未归因超阈带及 2 个缺块；App #23 三轮余 3 条未归因超阈带、缺块 0。其余矩阵未执行，未做 ≥20% 复核。 |
| 14 权限／可移植 | 部分 | actor 限定读／下载、CSV 注入、vCard 转义、JSON 白名单、私有 ZIP 等聚焦测试已过；全端文件打开及 shared-domain 零残留未验。 |
| 15 交接／生产 | 部分 | 下文给四栏交接与授权请求。未发送跨线通知；生产调度、Neon、备份保留期保持待用户授权／查明。 |
| 16 全量／独立复核 | **未通过** | Web 65 fail、App 20 fail 的收口全量均红；C 自有静态和登记失败已聚焦修复，按一次全量硬规则未重跑。主会话独立复核未进行。 |

## 实现与本机证据

**CAS 与导出。** 任务 ID 由 actor／幂等键确定，actor 锁行串行化配额与活动任务状态；东京日跨零点、同键重放、系统失败额度返还和跨账号隔离的本机 PG 测试通过。导出 ZIP 只取本人字段，CSV 前缀防公式，vCard 转义，`all-json` 包含五域与名片图；规范化事件表现在只输出本人主办／报名摘要，不带其他参与者快照。私有 ZIP path 按 actor 哈希隔离，下载再校验本人、状态与期限。当前每域 `LIMIT 10001`，超过 10,000 行显式失败；ZIP 同步压缩并有 50 MiB 上限。流式分页与分块 ZIP 尚未实现，不能把大账号导出记为通过。`manifest.json` 只列实际写入的文件，缺域直接失败，不会静默跳过。合成样本 `/Volumes/ORICO/Dev/worktrees/orbit/_evidence-c/R18c-sample-export.zip` 与 `R18c-sample-export-manifest.json` 经 `unzip -l`／`unzip -p` 检查，含五域 JSON 和 manifest；它不代表真实账号导出。

**清除顺序与实际存储。** `account_deletion_requests` 的到期领取与取消互斥，五分钟 lease；`account_purge_steps` 每域确定性 recordId、版本 CAS、完成时间与结果，失租即停。每个模块同时检查环境和 **实际连接**为 loopback `orbit_line_c_test`。本机专用库随机 workspace 的 runner 测试在第三方撤销失败后保留身份，租约过期重领后逐域完成，原账号记录归零、其他账号保留、同邮箱可插入新 ID。没有生产入口。

| 顺序／领域 | SQL／对象范围 | 本机结果／停点 |
| --- | --- | --- |
| 1 连携／设备 | `integrationTokens`、OAuth state／health、pushDevices、mobile auth exchange；先调用注入 revoker | 故障保留 token 并可重试；尚无已配置 Google revoke。 |
| 2 导出 | `account_exports` 的本人 ZIP key 先删对象，再删历史／锁／ready outbox | 对象失败保留记录并可重试；错前缀由存储适配器拒绝。 |
| 3 人脈 | `bc_ingest_*`、导入、contacts、connections、名片原图／衍生 key | 本人零、别人保留的 PG 测试通过；对象 eraser 为注入替身，shared key 阻止。 |
| 4 メモ／Task／日程 | `notes`、`memo_extractions`、tasks、个人日程、appointment 表 | 个人样本通过；共享面谈因 owner／invitee NOT NULL 且另一方有权保留，抛 `SHARED_APPOINTMENT_REQUIRES_DECISION`。 |
| 5 プラン／iOrbit | `plans`、Step、log、草稿／匹配、AI 用量；个人 actor 子空间与会话 | 本人样本与两个 actor 子空间重跑通过；共享会话的跨域内容仍须 B／E 复核。 |
| 6 イベント | 旧 `event_registrations`／attendees 本人行；扫描 `event_ops_*` 及旧共享引用 | 无规范化／共享记录的样本通过；任一规范化 actor trace、主办旧事件或共享引用即显式阻止，不能当作全域通过。 |
| 7 收件箱／通知 | 本人消息、成员／已读／通知；共享会话用删除占位 ID 匿名化 | 本人消息消失、另一方消息保留的 PG 测试通过；审计与离线同步生产者仍需跨线复核。 |
| 8 最终身份 | 八域 done、无残余本人 `orbit_records`、completion-mail done 后事务删除 auth user／profile／account／申请／进度 | 缺步骤、残余行、邮件失败、失租均阻止；本机同邮箱新 ID 测试通过。发送成功到最终 DB 提交之间仍有短暂失败窗口，不能伪称已完整消除。 |

## 画板与像素

- b7 #19–32／#74／#81 原稿及改稿预检：16 板、数字冲突 0。b12 新补画 App P01–P09／S01–S08 各浅深、Web P01–P07／S01–S10 各 1440／1024／390 浅深；App Google 示例已修正为 Google 方法。清单在 `scripts/visual/views/{app,web}-R18c.json`，具体数据来源与 token 检查在 `preflight-checklist.md`。补画仍待主会话认可，未作为通过基准。
- `board-preflight` 对 43 个 App、109 个 Web frame 均 exit 0、数字自洽 0；App 近似／缺 token 66／257，Web 263／346。重复宽度与主题会重复计数，缺口不等于已符合组件库。
- Web 完成页 b7 #27 三轮：run-01 raw 0.0121、2 超阈、5 缺块；run-02 raw 0.0072、1 超阈、2 缺块；run-03 raw 0.0072、1 超阈、2 缺块。run-03 y=300–400 仍未归因（画板标题 28px，本线 token `--fs-title` 24px）；三轮上限到此，转像素余项轮，不做 `[data]` 豁免。证据 `/Volumes/ORICO/Dev/worktrees/orbit/_evidence-c/R18c-pixel-run-{01,02,03}`。其余 P 与 R18a 言語と外観整板、原生像素均 OPEN。
- App b7 #23 原生 `Orbit Line C` 模拟器（402×874pt）三次有效截图：`R18c-app-native-P05-run-02` raw 0.0405／4 超阈／3 缺块，改为居中完成态与底部返回动作后 `run-03` 0.0398／3／3，文案与垂直位置对齐后 `run-04` 0.0251／3／0。最后 y=200–400 与 700–800 三带未归因；截图与 triptych 在各 run 目录。`run-01` 因工具默认设计服务端口 3320 不通，未取得截图、不计有效迭代。三轮上限到此，不用 `[raster]` 掩盖仍需独立复核的字形／按钮偏移。其余 App P、R18a 言語と外観整板仍 OPEN。

## 测试与门禁（收口）

下表中的短日志名与逐名差分文件均位于 `/Volumes/ORICO/Dev/worktrees/orbit/_evidence-c/`。全量各运行一次，聚焦检查只用于定位和验证后续修正。

| 项目 | 结果 | 证据／逐名差分 |
| --- | --- | --- |
| Web `npm test`（LANG／LC=en_US.UTF-8，全局本机 PG URL） | **exit 1**：7,905 tests／7,296 pass／65 fail／544 skip | `R18c-web-full-close.log`。R18b `web-full-final-20261020.log` 为 7,764／15 fail／545 skip；原始逐名差分 52 新、2 消失在 `R18c-web-full-delta.json`。本次全局 URL 使大量“未配置数据库时失败关闭”用例失去原前提，不能把数量差全归产品回归；C 自有 typecheck／文案／token／button 静态失败见下。 |
| Web C 静态聚焦；`typecheck`／`typecheck:app`／`lint` | **14/14、exit 0／exit 0／exit 0** | `R18c-web-targeted-close.log`、`R18c-web-typecheck.log`、`R18c-web-typecheck-app.log`、`R18c-web-lint.log`。全量后修正 runner 结果类型、导出到期文案、完成页 token、入口 Button；未按一次全量硬规则重跑。 |
| Web `copy:qa` | **exit 1**：7,507 条／245 issues | `R18c-web-copy-qa.log`；没有 `account.rights`／R18c 告警，跨线存量与新增仍需各归属方处理；不能报门禁通过。 |
| App `npm test` | **exit 1**：3,273 tests／3,251 pass／20 fail／2 skip | `R18c-app-full-close.log`；R18b `app-full-final-20261020.log` 为 3,246／12 fail／2 skip。原始逐名差分 9 新、1 消失在 `R18c-app-full-delta.json`；其中旧 i18n snapshot 测试改名但仍红。八个 C 新失败的路由／库存／账户 fixture／client 使用已聚焦修正。 |
| App C 聚焦；`npx tsc --noEmit` | **65/68 后账户 16/16、exit 0** | `R18c-app-targeted-close.log` 先有 3 个账户 fixture 期望失败，补登记真实 pending 读取后 `R18c-app-account-rerun.log` 16/16；其余 52 项已绿。`R18c-app-typecheck.log` exit 0；完成页改后再跑 `R18c-app-typecheck-after-native.log`。全量未重跑。 |
| 契约 snapshot／schema parity／`sync:contract`／路由及离线库存 | **5/5、exit 0、聚焦已绿** | `R18c-web-contract-close.log`；`R18c-app-sync-contract.log` exit 0 且未产生同步差异。App C 路由、Web `/settings/exports` 对 App `/account/exports`、离线权限分类与文档登记在聚焦 68 项中通过；旧屏整板仍未验。 |
| 聚焦本机 PG | 已通过 | CAS、归档、worker、权限、逐域清除及 runner；各测试使用临时 schema 或随机 workspace，生产未触达。 |

**全量失败逐名核对。** 完整失败名、基线名与集合差见 `R18c-web-full-delta.json`、`R18c-app-full-delta.json`。Web 原始新增 52 名中，本线静态失败为 `the entire project typechecks with zero errors`、`no page has more hard-coded text or missing Japanese than the allow list grants`、`orbit-2026 CSS Modules use only design tokens for colour, stacking, radius and type size`、`non-.btn <button> count in app/(app)/app does not increase`，对应的修正已聚焦通过。多数其余新增名是「未配置 live storage 应失败关闭」类测试；本次全量全局传入本机 PG URL，改变了这些测试的前提，因此原始差分不能直接归因为新回归。App 原始新增九名涉及 `action screens use the authenticated Orbit API client`、账户反馈 inset、App 路由／离线分类、Web–App route parity、账户导航 fixture、原生策略和旧字典快照；前八项的具体账户／路由缺口已聚焦修复，第九项仍为既有字典快照口径不符。原始全量保持红色；上述聚焦结果不能替代全量零新增失败证明。

## 自定决定、待主会话决定与请求

1. **共享面谈与规范化事件。** 推荐确定统一的“保留另一方记录并移除退会者内容”规则，新增已发布事件 DTO 的失效／重发布或匿名化版本策略，再补同库双账号清除测试。当前直接删会违反 FK／快照关系，保留又留下本人内容；两类账号的清除在本线明确失败，SC10 不可完成。
2. **App 账户 #19。** 当前旧屏含 profile 编辑、workspace、goal、设备 debug、登出等既有能力；曾尝试整屏替换会删除这些路径，已撤销该尝试并保留功能。画板的“登录中の端末 2台”和密码设置在现有服务无可信来源／路由。推荐先定是否删设备行、如何保留既有入口，再由 C 线整屏替换并做签名原生比对；受影响 P-A01／SC07／12／13。
3. **Google 再认证。** R18b broker 需返回同账号、用途绑定、≤10 分钟、一次性 receipt，能证明 `prompt=login`／`max_age=0` 与 `auth_time`；C 当前明确 503。另需 R18b 在 purging 期间禁止自动建号，并在完成后用新 account ID 允许同邮箱注册；R18b 登录成功后进普通首页前识别 pending。
4. **像素／组件。** 主会话复核 b12 草案后才能设为正式基准。A 线需核 28px 完成页标题 token 与 App #19 的新 ListRow／Button 参数；Web #27 三轮余项不在本线增加私有 token。R18a 言語と外観入口接线后整板复跑由集成门禁接续。
5. **完成通知的原子边界。** PLANNER 要求先尝试发送完成邮件再清身份；本地实现按此顺序并用幂等 key／progress 防重。邮件投递成功而最终事务失败时用户可能先看到“已删除”。推荐主会话决定改文案为“清除处理中”或批准可恢复的最终交付方案；受影响 SC10／11。
6. **生产。** 到期调度、Neon／生产开关、备份保留期、真实 Google／邮件／推送联调均未运行，登记 DEFERRED，**待用户授权**。本线未推送。

## 四栏交接（由主会话协调更新根台账）

| 目标 | 本线版本／事实 | 另一端影响与请求 | 未完成／验证范围 |
| --- | --- | --- | --- |
| README 契约 11 | `shared/contract/account.ts`、BREAKING、App 副本同步；新严格删除 POST | 主会话登记同版接口与 R18b 版本接口分离 | 本机契约测试；真实双端操作未验 |
| HANDOFF／DEFERRED-A | C 的 export／pending／local purge；生产入口关闭 | 记录 D-21 部分、D-22 未完成、生产启用待用户授权 | 本机 PG 与聚焦路由；无生产验证 |
| A 线 App kit | 新二级页调用现有 `AppScreen inset="kit"`／UiText／Button 等；#23 原生三轮改善但未过 | 复核 #19 设备行与组件 token、Web 完成页 28px 标题缺口 | App 仅 #23 原生像素有证据；其余未验 |
| B／E 线数据 | C 直接清人脈、共享 inbox、AI actor 子空间 | 复核 card Blob owner、共享会话／审计中本人内容、真实 token revoke／object eraser | 假体 + 本机 PG；跨端生产者未验 |
| D／R18b 线壳与认证 | pending 白名单与旧 JWT 时间戳已接 | 登录后 pending 路由、purging 禁止自动建号、Google 新鲜证明 | C 路由测试；端到端未验 |

越线自查：本线未改 A 组件／token、B 采集代码、D 导航壳、R18b Google broker、Neon 配置、根台账。`HANDOFF-CLAUDE-2026-10-19.md` 是预存用户文件，未触碰。无 push。主会话独立复核、像素余项与上述产品决定仍是停点；本报告不把局部测试或预检算作 SC 通过。

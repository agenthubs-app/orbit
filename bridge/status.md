# 两端当前状态

## 2026-09-16 20:56 JST 人脉分析修复与两端生产服务恢复

原 Phone B 的分析实现和两个针对性报告修复已在主线 `7e9e902f2c67584f4685ce6617a0e2ccfe5e1fd3`，独立核对远端 `chat-agent` 同 SHA。空标题无正文、外部 ID 前缀冒充锚点、代码围栏伪报告均拒绝。ROOT 完整 20 个后端测试文件 186/186 零跳过、Web types0；既有 App 消费者 95/95，不冒充 Phone 的 98/98 或全量基线通过。新符号暂存图谱未映射，仍为 UNKNOWN，不认为零风险。

两端直接 Next 生产编译均 exit0，复用未改动资产流程，不算重新执行全量资产 build。MAIN 3000/PID72621，BUILD `CWqHojftfUNV5f3agekjJ`；Phone 冻结后台 `81cad21615f0f52dfa8ca86bf81bb92f69fc7002`，32100/PID72623，BUILD `RQg512Ds8xdL0Dst1ZjQI`。两端 budget guard ready、health200，原各自数据库/workspace、Flash/loop3 与唯一 $5 账本保持；Phone 认证入口32110/live/typed actor 保留。Metro8082/PID7582、Phone 展示32110/PID21340 未改。

新真实模型分析、精确费用对账与公网报告回读仍 OPEN；目前只释放零付费只读验证，禁止重放旧失败会话或把历史/stub 当成新分析成功。11:56:23Z 账本25 settled/$0.048375/0 reserved，六笔未知调用者仍待查。D45 真实 mutation port/journal/删除传播、E46 合法通知样本审批以及中文锁序批准仍待完成；不合入会阻断既有笔记写入的半成品。

## 2026-09-16 20:35 JST 主线租期基础与原生加密构建

A33 纯租期 issuer `8a822a152` 已合入并推送 `74c60290f`；ROOT 完整两文件审查、7/7 零跳过及 Web typecheck0。新增符号图谱为 UNKNOWN，不把暂存分析的零映射当成零风险。只有可信授权端口与完整域覆盖校验，真实全域 authorizer、持久权限 epoch、HTTP 与离线消费者尚未接通。

该主线 Web 重新生产构建 exit0（未改资产流程复用），BUILD_ID `0tIJOrl7k4tVtFNzxZyyG`；3000/PID56918/live200、Metro8082/running，原数据库、Flash/loop3 与唯一预算保护保持。Phone 32100/32110 未重启。账本早先快照为 19 settled / $0.039467 / 0 reserved，其中 $0.000856 已查明来自 Phone 诊断报名 GET 默认问题生成；11:34:42Z 最新快照为 25 settled / $0.048375 / 0 reserved，后来六笔的调用端归属尚未确定，不能归入该诊断。后续固定 `questions=false`，不算验收成功，付费 QA 暂停。

ROOT 保留原 native 环境后，仅 ignored Podfile.properties 启用 SQLCipher；首次 deployment pod install 因 ExpoSQLite checksum 拒绝，随后无 repo update 的 install 仅更新该 checksum，依赖版本不变。主线原生编译/覆盖安装成功，实际编译 codec 标志与 key/rekey 符号存在；构建及已安装 executable SHA256 均 `a0c760b6a0a91d25867c6509e542842249c32994c255b98b965845460ca78354`，同步 DB header 非明文。没有删数据、清密钥或 uninstall。Web 重建期间首次启动出现登录页，不能当成独立冷启动成功；Web 恢复后正常重启 PID57388 已回到中文有数据首页。actual cipher_version、wrong-key、完整迁移、全域离线及精确 loaded-JS 哈希仍未验收。

D45 仍不合未接真实 mutation port 的半成品；中文锁序修订待批准。E46 合法样本与精确恢复中文规格已完成待审，未执行 fixture 写入、共享 worker 或付费 discovery。Phone PW11 分析与 PW12 canonical 活动详情由原独立 B/C 推进；本轮不增加 ROOT 第三个修复 Generator。

20:35 JST 原生运行补证：ROOT 在实际已安装主包 PID61392 中仅打开 `:memory:` 临时数据库，`PRAGMA cipher_version` 实际返回 `4.7.0 community`；open/prepare/finalize/close均0、step100、调试器已detach。首次调试类型缺失后正常重启释放临时内存，一次针对性修复成功。没有打开用户库或读取密钥；因此关闭“已安装 SQLCipher 运行版本未知”这一项，不关闭实际同步库解密、wrong-key、迁移或全域离线验收。上段版本未知描述保留为此前历史状态。

## 2026-09-16 20:12 JST 主线通知来源修复与运行实测

E46 冻结 `8e3049cea` 已合入 `e660f1d55`；A33 编译参数解析修复 `70d4d2aaf` 已合入 `23500c561`，普通 push 后独立远端 SHA 一致。ROOT 主线受影响完整文件 App 75/75、Web 24/24、两端 types 通过；A33 静态工具另 8/8，不冒充实际加密验收。未重新全量测试，旧基线缺项保持开放。

Web 生产构建 exit0（复用未改动资产流程），BUILD_ID `ktYtulz-wmbDHzQ1-3aL_`，主线 3000/PID44656/live200；原费用保护账本与 DeepSeek Flash/loop3 保持。原生 build/install/launch 均 exit0，依赖警告保留；DA 主包 PID45137，主线 Metro8082/running。实际安装 executable 与构建 artifact SHA256 同为 `a1ef0cdb9e3d8ea9b90528d8485e2232298a99bbd4576b98bb340467604d7623`；Debug JS 来自 Metro，不把相同原生 executable 哈希当成新 JS 哈希。

Simulator 实際首页→收件箱→通知显示 40 条安全失效来源提示（2 已读/38 未读），旧“复核下一步”文案为 0；点击第一条已读、无链接记录保持收件箱与计数。只读真实数据库确认 40 条均 `targetType=notification`、`targetId=recordId`，payload 没有 taskId/followupTaskId/contactId/targetId/targetType 业务字段。安全拒绝已验证，合法来源正例/展示数据修复/全域离线及完整 E46 SC 未验收，不因此 completed。未改旧通知、seed、清库、密钥或发送付费请求；Phone 独立服务不动。

D45 App `446dbd5b7` 与纯域 `4b78b2cb1` 冻结在原支线，后者自报定向 37/37、types0。生产 factory 缺 mutation port，直接合入会拒绝既有笔记写入；ROOT 不合半成品。真实 adapter、锁序批准、迁移/接线与删除传播仍待验证；[中文锁序修订](../docs/superpowers/specs/2026-09-16-sync-lock-order-amendment.zh-CN.md)仍待批准，原规范未修改。

## 2026-09-16 PW-0010共享聊天候选验收收口

唯一功能`58e484016`已由主线`224fdc1d4`消费。Phone原run的公网Chromium/WebKit390px和MAIN主包Simulator已实际验证同一旧会话的8候选、原消息、详情返回、历史重开与刷新；原request/messages/budget完整摘要不变。Phone固定结束文档交付`da3dd71dc403eabf6dfccc8ba0374ccfca08583b`，ROOT只消费其原样REPORT，不复制Phone全部祖先/旧适配/独立全局台账。详见[REPORT](../docs/phoneweb/sprints/0010-contact-artifact/REPORT.md)。

ROOT真实设置保存并AX确认恢复精确`http://127.0.0.1:3000`及小雨MAIN Appscope已登录，设备UI归ROOT；Metro8082、MAIN Web3000及独立Phone服务保持运行。通过范围仅PW-0010：原后端全量失败/跳过、全域离线、真实Push/OAuth等缺项不会因此关闭。既有服务日志的原路径200只作时间/路径关联，不宣称独立设备归因。

## 2026-09-16 E线0040投递与切换

功能eacd7a227/合并0b552649d；偏好、投递策略、所有权协议、迁移与共同QA对账已交付，合并树Web16/App129及两端typecheck通过。真实Push、AI费用/provider和本轮原生出站回执缺项见[BR-028](2026-09-16-notification-delivery-cutover.md)。0037/38 completed，0039/40 blocked且run关闭；暂停本线跟进，保留Web供查看，不标四项全验收。

## 2026-09-16 E线0039自主发现

功能4aa21961a/合并131723ddb；两端设置、真实笔记与后台队列可用，真实模型费用/provider缺项保留为blocked。详见[BR-027](2026-09-16-evidence-notification-discovery.md)。继续0040独立实施。

## 2026-09-16 E线0038三类通知

功能/主线e045651b3；三类持久记录和同账号双向动作已验证，详见[BR-026](2026-09-16-typed-notification-inbox.md)。0039继续有依据的发现；0040接工作器、投递与旧流切换。

## 2026-09-16 E线0037联系人消息

功能/主线 a591494b0；Web/App真实消息独立、双账号收发及同账号回读已验证，详见[BR-025](2026-09-16-contact-message-inbox.md)。新三类通知继续由0038实施；真实Push未验收。

## 2026-09-15 E 线 0030 统一收件箱增量

- App `4d351f0a0` 按批准的 3a 设计把 conversation、notification 和 relationship signal 聚合为全部／活动／待办／人脉四筛选时间流；“全部已读”固定并发 4，并在逐项精确回执后刷新，不乐观清空。
- 同账号 live Web/API 与 iOS Simulator 已验证 40 条真实 task reminder：单项 read 使 40→39，批量后服务端 40/40 read，pull-to-refresh 与前后台恢复保持 0；App 全量 2828/2828、typecheck、原生构建 0 error／0 warning。
- 本轮没有 Web/API 源码改动；实际 Next production server `d37d6545d` 保持 `live/ok`。当前 QA payload 没有 activity/contact/IORBIT/conversation，且历史 reminder task 与 canonical task 交集为 0，因此 BR-024 为 `consumer_ready`；详情见 [交接](2026-09-15-unified-inbox.md)与 [Sprint 0030 报告](../repos/orbit-app/docs/sprints/0030-inbox-ink-signal-unified-feed/REPORT.md)。

## 2026-09-15 D 线 0028 验收增量

- Web/API 与共享 contract 扩展资料语言、LinkedIn／X、稳定标签上限和 actor-scoped 建议 dismiss；profile CAS、receipt 与序列化重试在隔离 PostgreSQL 14/14 通过。
- App 把资料编辑拆成五个共享 session 的 private route，并按八图重做“我的”、设置、账号；公共预览统一排除生日、跟进节奏、私密 handles 和 provenance，本人 CTA disabled。
- 当前 production Web/API、同账号浏览器 session 与 iPhone 17 Pro Simulator 完成 Web→App、App→Web、409 和另一 actor 隔离；八屏、Dynamic Type 冷启动与 VoiceOver tree 通过。固定 D SHA 已由 `314aedd7c` 合并到 `chat-agent`；主线目标 237/237、App 全量 2860/2860、typecheck、iOS build、Web live health 与两台 Simulator 安装启动通过，Sprint 0028 已完成。详见 [BR-022](handoffs.md#br-022--我的页面组资料编辑与公开投影)和 [REPORT](../repos/orbit-app/docs/sprints/0028-profile-page-group-redesign/REPORT.md)。

## 2026-09-15 C 线 0027 日程详情增量

- C 线独立分支 `codex/c-line-sprint-0027` 以 `3ca1f5936` 接通四类日程目的地和 appointment 参会人共享会议说明，并以 `0cbc45ffa` 修复当前旧 schedule meeting 被当成 appointment 后 404 的运行时问题；旧会议说明明确为当前账号私有。
- Web 预约／legacy 回归 25/25、PostgreSQL 并发／幂等 1/1、App 日程组合 90/90、两端 typecheck、Web 生产构建和 iOS build 通过。3000 已运行最终生产产物，health 为 `live/ok`。
- 登录态 Simulator 已逐类打开待办、活动、个人日程和会议，并完成会议新增说明、保存、返回、重开回读和清空恢复。BR-021 为 `verified`，功能 `0cbc45ffa` 与关闭记录 `7064f4bae` 均已进入 `chat-agent`。详见 [交接](2026-09-15-schedule-meeting-details.md)与 [Sprint 0027 报告](../repos/orbit-app/docs/sprints/0027-open-schedule-meeting-details/REPORT.md)。

## 2026-09-15 B 线 0029 数据权威与 AI 只读面

- Web/API 以 `c4a1beef2` 建立 machine-readable authority registry，`8c9e43015` 将日程新写入统一到 `personal_schedule_items`，`5fff469ab` 增加 visibility manifest 与 `notes.query`、`tasks.query`、`followups.query`、`schedule.query` 四个 actor-scoped 只读工具。
- App/Web 由 `dd28ec473` 把 push device identity 收口到 SecureStore ID 与复数 push-token API；App 同步 `data_query` artifact contract。旧 schedule/push 链只保留分类读取、迁移与撤销窗口。
- 本地定向、全量、两端 typecheck、Web production build 和独立 iPhone 17 Pro Max / iOS 26.4 安装启动证据见 [BR-023](2026-09-15-data-authority-ai-read-surface.md)。真实账号、数据库 migration apply 与授权 calendar provider 因环境缺失保持开放；本地结果不表示远程部署或生产验收。
- 固定 B SHA `f5bded060` 已由 `6f5f141ed` 合并到 `chat-agent`；主线新增测试 8/8、两端 typecheck、Web production build 与重启后的 `live/ok` 通过。外部验收缺口不因代码合并而关闭。

## 2026-09-15 C 线 0026 canonical 身份增量

- App `f5f595df4` 在登录／恢复后从既有 `/api/account/me` 读取 canonical `account.id`，并把待办、个人日程、笔记、快照、草稿、AI intent、人脉与消息边界接到 `auth.actorId`；`3385369dd` 补齐关系邀请 scope。
- 身份接口失败、缺字段或空 ID 时 fail closed，不回退 Auth.js raw `userId`，foreign owner 继续被拒绝。活动会话、名片导入 session scope、认证和密码重置保留 raw subject，已逐项审计。
- App 类型检查和完整回归通过；当前 live Web health 为 `live/ok`；iOS 当前源码构建 0 error／0 warning，登录态 Simulator 在 8082 bundle 下读取待办、日程与笔记工作区。BR-020 现为 `verified`，详见 [交接](2026-09-15-canonical-app-identity.md)与 [Sprint 0026 报告](../repos/orbit-app/docs/sprints/0026-canonical-app-account-identity/REPORT.md)。

## 2026-09-15 B 线 0021 验收增量

- AI 会话组织功能在 `3de117902` 基础上由 `9bc7039a5` 修复原生连续 `Modal` 切换；历史→整理器与整理器→删除确认不再互相遮挡，Web 保留同步切换行为。
- 同一全新合成账号在运行中的本地 Web/API 与当前 App bundle 完成 App 创建／改名→Web 读取、Web 改名→App 重载读取、App 删除→Web 确认消失；当前 iOS Simulator 的长按、可访问更多、组选择、删除确认和真实 409 冲突反馈均可见。
- Web 0021 定向 39/39、App 定向 95/95、弹窗修复文件 73/73、两端 typecheck 和隔离 PostgreSQL 证据通过。两条确定性会话均经正式 API 写入并在验收后删除，未调用模型；0021 现为 completed，详见 [BR-003](handoffs.md#br-003--ai-会话)与 [Sprint 0021 报告](../repos/orbit-app/docs/sprints/0021-ai-session-organization/REPORT.md)。

## 2026-09-15 A 线 0014 增量

- App `9761b343d` 将人脉列表／详情／关系搜索／邀请、名片摄入／复核、活动发现／详情／报名接入 0013 的中／日／英账号语言环境；产品 chrome 与已知枚举本地化，姓名、公司、OCR 原文、活动内容、题目、答案和稳定 ID 保持 literal。
- 动态切换语言保留搜索／筛选、编辑草稿、来源选择和报名答案；默认中文返回标签、概览入口、窄屏、dark 与双倍字号兼容已复验。
- App 0014 目标组合 197/197，兼容失败修复复验 42/42，最终清空全部 provider key 的全量 2753/2753、typecheck 与 diff-check 通过。Web/API 本轮无产品变更；同步仍复用 BR-015 的刷新式账号语言偏好，不表示实体设备或共同远程环境已验收。详情见 [BR-016](handoffs.md#br-016--人脉名片与活动三语消费)与 [Sprint 0014 报告](../repos/orbit-app/docs/sprints/0014-locale-relationships-events/REPORT.md)。

## 2026-09-15 A 线 0013 增量

- Web/API `cc3930449` 新增 actor-scoped 账号语言偏好 GET/PUT、版本冲突、幂等回执和 SERIALIZABLE 事务保护；App `1bd99f737`、`9d5c13622` 建立中／日／英 Provider，并迁移账号、资料、首页、设置及其可达密码／权限页面。
- 设备 A 保存→独立设备 B 服务端 GET 回读、服务／路由／真实 PostgreSQL 13/13、App Provider 7/7、Profile 166/166、受影响组合 157/157、日期不变量 5/5 和原生 EN/JA 大字号通过。
- 业务原文和用户输入保持 literal；设备自动语言不写入账号。同步为登录／前台／显式刷新，不声称实时推送；未部署或写生产数据库。详情见 [BR-015](handoffs.md#br-015--账号语言偏好与三语基础)与 [Sprint 0013 报告](../repos/orbit-app/docs/sprints/0013-locale-foundation/REPORT.md)。

## 2026-09-15 A 线 0011 增量

- 首页由 `727aeeae2` 使用真实推荐活动替换旧联系跟进区块，按既有排序最多显示五条未完成待办并在成功完成后补位；Pipeline 保持独立入口。
- Web/API 由 `7a2e9f767` 提供 actor-scoped source version、持久化生成时间/分析版本和服务端受信执行标记；Web UI `3038e8ea7`、App `9a10522b1` 只在用户显式发送 IORBIT 草稿后生成。关系目标字段级版本写入为 `a1d7d7665`。
- 本地结果：App 2715/2715、0011 组合 72/72+28/28+5/5、生命周期组合 128/128；Web 0011 组合 99/99；两端 typecheck 通过，provider keys 全部清空。
- 运行时阻塞已收窄：登录态 Simulator 首页／Pipeline、旧路径和同账号 Web↔App relationshipGoal 双向回读均已完成；仅真实 provider 显式生成后的持久报告与两端重开回读未执行。详情见 [BR-014](handoffs.md#br-014--首页与可信人脉分析)与 [Sprint 0011 报告](../repos/orbit-app/docs/sprints/0011-home-analysis/REPORT.md)。

2026-09-15 本地主线增量：事项与个人日程编辑已在 `d005c2b79` 同时接通 Web/API 与 App，独立 PostgreSQL 和 iOS Simulator 完成同记录双向回读；待办统一由 `ef5d0b02d` 将 App 全部／人脉和未完成／已完成视图接到同一 canonical 集合，并完成 App→Web→App 同记录完成／恢复回读；身份邀请与共享聊天由 E 线原提交 `6d8173b78`、主线集成 `64629369d` 接通，消息状态由原提交 `218fb3d4b`、主线集成 `8c9bf60cc` 接通。0012 仍缺真实 Expo project、push server key 和双用户实体／持续前台证据，保持 blocked；这些本地结果不表示远程部署或生产 OAuth 已验收。
2026-09-15 最新运行时验收：Web 已按当前源码完成 Next.js 生产构建并以 live 模式连接隔离 PostgreSQL；Web 浏览器与原生 iOS Simulator 使用同一服务地址和同一登录账号。BR-017 已完成 Web→App、App→Web、刷新、版本冲突与 actor 隔离；BR-018 已完成原生预填、显式发送、建议接受、幂等、Web 回读、返回来源和含糊日期零写入。两项均更新为 `verified`。这是本地生产进程验收，不代表远程部署或实体设备发布状态。

2026-09-15 12:44 JST Notes 4a 运行时验收：BR-019 已完成 Note v2、服务端有界联系人搜索、App 六个笔记状态和联系人笔记页签。Web 按当时源码完成 Next.js 生产构建并以 live 模式连接隔离 PostgreSQL，原生 App 当时源码构建 0 error／0 warning；Web 浏览器与 iOS Simulator 使用同一服务地址、`qa@orbit.test` 和同一数据库，双向创建／编辑／搜索、幂等、版本冲突与 actor 隔离通过。BR-017～019 均为 `verified`。这是本地生产进程验收，不代表远程部署或实体设备发布状态。

自本次起，涉及 App 可见行为、API、共享契约或状态同步时，Web/API 必须实际运行；Web 端每次更新后先重新生产构建、停止旧进程并启动新产物、检查健康状态，再进行 App 验收。具体规则见 [协作流程](workflow.md#app-开发时保持-webapi-实际运行) 和 [Sprint 规则](../repos/orbit-app/docs/sprints/RULES.md#54-app-开发期间的-web-运行门槛)。

2026-09-10 保存进度集成：用户已接受 App 1389 通过/1 失败、Web 3134 通过/8 失败的当前版本，授权合并到 `chat-agent` 并普通推送；未完成验收不因此关闭。当前结果、远程输入和边界见 [集成交接](2026-09-10-chat-agent-integration.md)。下方 2026-09-07 数字保留为历史快照，不是当前测试或发布状态。

最后核实：2026-09-07，基于本地 HEAD `862cb54b4` 加当时的未提交 App 改动。精确采集时间与路径清单见 [快照](snapshots/2026-09-07-baseline.json)。

## 2026-09-15 D 线增量

- Web/API 由 D 线原提交 `0a1ca09a4`、主线集成 `011b575bb` 提供双面名片 manifest、卡片级原子确认、来源持久化和旧单面兼容；App 同步完成显式正反面采集、两面复核与确认消费者。
- 本地结果：App 2603/2603、两端 typecheck、隔离 PostgreSQL 名片 API／repository 28/28。Web 全量保留 47 个既有失败；4 个宿主 provider key 导致的新增失败在完整清空 key 后 63/63 通过。
- 真实验证仍 blocked：实体 iPhone 离线，没有共同 API/OCR 环境、授权样本和联系人对象。详情及关闭条件见 [BR-012](handoffs.md#br-012--双面名片卡片级确认)与 [Sprint 0007 报告](../repos/orbit-app/docs/sprints/0007-two-sided-cards/REPORT.md)。

## Web / API

- 路径：`repos/orbits`；package 声明 Next.js 16.2.9、React 18.3.1，生产环境要求 Node 22。
- 同时承担 Web 产品 UI、HTTP API、认证、业务服务、数据库访问和 worker。Web 的 server page/route adapter 可以直接调用 `features/**` 的服务；部分交互也通过 HTTP。App 功能不会因 Web 页内新增一段服务调用而自动获得。
- `app/(app)/app` 中有 43 个精确 `page.tsx` 产品路由；`app/api` 中有 199 个 `route.ts` 文件。后者包括多种业务/内部/认证路由，不是 199 个移动端可调用操作，也不代表全部通过运行时验证。
- 最近已提交变化：移动人脉总览 API；共享 Schema；行业/语言字典隔离；Node 22 生产构建修复；测试类型零错误约束及数据库测试夹具隔离。
- 采集时 `repos/orbits` 无 Git 未提交项，但不能据此推断另一个开发者、其他工作树或远程没有进行中工作。
- 服务工厂支持 mock/hybrid/live。实际可用性仍取决于认证、模块配置、数据库、AI provider、worker 和部署状态；本轮没有读取密钥或访问业务数据库。

入口证据：[Web 规则](../repos/orbits/AGENTS.md)、[跨端契约说明](../repos/orbits/docs/cross-client-contract.md)、[发布记录](../repos/orbits/docs/operations/free-beta-launch.md)。

## App

- 路径：`repos/orbit-app`；package 声明 Expo 57、Expo Router 57、React 19，React Native 声明为 `latest`，实际安装版本应另查 lockfile；iOS 优先。
- 原生页面 → hooks/view-model → HTTP client → Web API。App 不在构建时导入 Web feature 源码，不直接连接业务数据库。
- 58 个路由文件含分组折叠、跳转入口及 legacy catch-all；Web 产品路由在移除 `/app` 前缀后均有同名入口。**同名仍可不同功能**：Web `/app/agent` 是 AI 工作区，App `/agent` 是建议动作页，App AI 主入口是 `/ai`。
- 已有账号登录、AI 会话与 Web 历史、人脉与分析、任务与日程、报名/取消、活动运营/审核/签到/角色、权限和通知相关实现。不能继续沿用旧 README 中“移动端不运行匹配/不改角色”等概括判断现状。
- 当前未提交改动：74 个 tracked 文件，主要覆盖主题 tokens、组件、各屏幕主题接入、AI 阅读界面和相关测试；另有未跟踪主题文件、测试、设计文档和 prototype。它们是正在开发的工作，不属于本轮 bridge 新增实现。
- `src/data/snapshot-store.ts` 用本地 SQLite 保存成功 GET 的快照，键为服务器 + 登录用户 + 路径。它是读取缓存，不是业务数据库副本或离线写入同步队列。
- `useApiResource` 在挂载/路径或身份变更/显式 refresh 时拉取；某些长任务页面另外轮询。没有从这些通用 hooks 看到全局跨端实时失效通知。另一端改数据后，当前屏幕可能要刷新才更新。

入口证据：[App 规则](../repos/orbit-app/AGENTS.md)、[客户端](../repos/orbit-app/src/api/client.ts)、[资源加载](../repos/orbit-app/src/hooks/useApiResource.ts)、[本地快照](../repos/orbit-app/src/data/snapshot-store.ts)。

## 本轮实际检查

执行环境 Node `v25.8.1`；这些结果不替代 Node 22 生产环境验证。

| 检查 | 本轮结果 | 能证明什么 |
| --- | --- | --- |
| App 契约/Schema/字典/路由检查 | 7 通过、0 失败 | 文件副本一致及 Web 子路由入口覆盖 |
| 独立路由盘点 | 43 Web / 58 App，缺少同名入口 0 | 含 Web 根页面；既有路由测试未单独覆盖根 page.tsx |
| App `npm test` | 752 通过、0 失败、0 跳过 | 当前工作树的测试基线；不是实机 E2E |
| App `npm run typecheck` | exit 0 | 全量类型检查 |
| Web `npm run typecheck` | exit 0 | 全量类型检查 |
| Web 契约与 mobile dashboard 定向测试 | 14 通过、0 失败 | 类型目录边界、Schema、actor 传递、部分失败和路由处理 |
| Web 全量测试 / 生产构建 | 本轮未执行 | 发布状态只引用下面带日期的既有记录 |
| 同账号 Web ↔ App 双向写入后回读 | 本轮未执行 | 仍需按模块完成业务验收 |

精确命令见 [协作流程](workflow.md)。上述 App 7 项包含在其 752 项中，不相加作为独立测试总数。

## 已知发布状态（既有记录，不是本轮重跑）

`repos/orbits/docs/operations/free-beta-launch.md` 在 2026-09-06 记载：Node 22 本地生产构建、基本生产冒烟、数据库备份恢复已通过；隔离数据库全量回归为 2,216 通过、21 失败、1 跳过。阶段 1C 尚未通过；远程数据库迁移、环境配置、Netlify 部署、worker 和 iOS 公网接入未完成。

本轮未联系远程服务，不确认这些远程状态此后是否变化。不得把本地源码或本轮类型检查通过写成“已上线”或“Web 全量回归通过”。

## 优先处理顺序

1. BR-001：厘清 Today 中哪些业务能力两端必须相同，明确映射与缺口。
2. BR-002 / BR-003：登记 Agent 高级设置和会话历史操作差异，确定移动端覆盖范围。
3. BR-004 / BR-005：收敛未共享 DTO 和跨端刷新/写入一致性验证。
4. BR-006：Web 发布门槛解除后再验收同一远程环境下的 App；不以此阻止本地对齐盘点。

## BR-029 — 个人日程设计

本地规则／关联／实例范围／CAS链verified；主线47f12034已push并独立核对，新生产Web BUILD L8fbGtRZ_QJku0p8citoB／PID15582健康200，主包Api3000／Metro8082。同账号Web30→原生30→原生15→Web15已实测，另自建QA仅本次删除及规则清除已实测。共享I仍59失败／206跳过／denied4；实际到期提醒、远程Push、全域离线及共同远程部署保持未验，[当前运行时交接](2026-09-17-personal-schedule-v3-runtime.md)。

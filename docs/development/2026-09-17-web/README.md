# Web 待办现状与并行开发总表

更新：2026-09-18。主任务：`01a0ae27-0068-7613-9f87-82aa91a836bd`（待办事项主agent）。原始范围：[30项产品待办](../../designs/2026-09-15-product-follow-up-backlog.md)。协作方式：[任务职责、模型和冲突规则](SESSION-GUIDE.md)。当前用户已批准进入实施，最新批次、基线及文件锁以[执行台账](EXECUTION.md)为准；下文设计轮记录保留为历史，不能作为仍未派发的判断。

本表提取 **Next.js Web 产品页及其 HTTP/API** 工作。PhoneWeb 是 React Native Web 消费者，其浏览器通过不能代替 Next Web 页面通过；iOS 相机、底部导航、小组件和实体推送按 App 工作管理。

## 最新验收快照

- 最新主集成HEAD为`1f492f49679ee0d9190322a3d19cb6889de82224`，工作树干净、未部署。新增W1离线夹具路径修复已主验；B1、W5 A服务端聚合和W1 Web导航资料门禁亦已主验。B2服务端与B4写入批次并行实施，源码批次与页面接线/生产验收分开管理。
- 数据上线切换已完成：应用`02ec26f0`，最终交接`161e9e6c`；完整SQL搜索/分页/聚合、CAS逐域采用、可靠唤醒仍在W0开发，不能合称“数据治理已完成”。
- W3-F `55dc5ec9062abe75c33bd254de56049c258ebc8e`已进入主代理独立集成树：真实容量、人数未知/0区分、名单不覆盖摘要和相关页面适配已解决。主代理独立本地PG、独立依赖，11文件90/90且0跳过、完整typecheck通过；只在Tokyo时区验证该整组，Shanghai既有agenda测试问题未关闭。没有部署生产。
- W2源`482f337f`已独立集成为`7d89d4c6e460a4c7bfa911a36aeb28949cbb6df7`：双面配对/来源复核/整卡回执/私有预览/局部三语与详情长值已通过主验收，76/76名片及PG＋90/90活动、完整typecheck、14文件434符号完整图谱检查；未部署，实体相机/真实OCR/跨端远程回读另验。
- W3-R源`23646028`已进入当前主集成`66087fff853f0133cbf1f996e39b1e03bd23bb7c`：主独立本地PG84/84、全typecheck与完整变化图谱通过。准入回执/独立GET/迟到响应隔离子项已验收；历史报名身份与App回执消费仍为发布门，详见[BR-031](../../../bridge/2026-09-17-web-registration-identity-candidate.md)。推荐服务已派发，尚未接UI。
- B3集成提交`7066e5ecdc96ca4c5986232318402c96ade7c09c`：已追加W0-B3独立摘要SQL与请求级在途复用，主37通过/1既有URLguard跳过、全typecheck与7文件完整变化图谱通过。搜索分页、写并发、提醒治理仍各自待验收；未部署。
- W1主集成`fd5dcdc2`：规范账号资料接线、onboarding、窄字段保存、Reload竞争修复通过主134/134（含真实PG）和全typecheck。推荐服务主集成`501ed5c8`：110项消费者＋5项PG全过；四源首页基础层主集成`4e15421e`：63/63相关回归＋LA22/22。三批完整图谱及其限制已记录；推荐/facts尚未接首页，不能标首页完成。正式词表/真实Google回调另列，W4 AI/分析与W0治理继续；B5旧候选禁止合入。
- W2名片A+B已验收，不重复派发；P1-14另批已实证背景被复制成简介/互动且虚构日期随读取变化，目前精确设计中，待B4释放共享详情服务后实施。下方首轮设计记录保留为历史，当前文件锁和具体状态以执行台账为准。
- 用户决定：私有名片本批接受授权后客户端缩略预览例外；保留邀请绑定，自动发现账号仅列后续方向。
- W1失败提示独立批次已主集成`42d04159`：主83/83＋SSR1/1及types。W2新控件审计主`60062c18`，定向1/1＋types。W1 P窄读取主`3e0bfa15`，19文件158/158零跳过（含真实CAS与新严格推荐）＋types；仍两次SQL，不承诺扫描常量。W3 P1-24主集成`2a684c62`，主44/44、types与三文件完整图谱通过，最终桌面/390截图已实际目检；地图仅示意，query/topic跨语言导航仍重置。W5 F修复主复核发现的合法数据误拒绝，W4继续发送保稿；旧全量债保留，不提前标整域完成。

## 审计基线与状态口径

B5可靠唤醒本地批已主验：固定源`bfff1984`→主`af9784f4`，核心55/55、关联81通过/1缺库跳过后旧PG组12/12补验、types0、完整939符号/12文件图谱。解决已批准的纯站内事务命令、持久公平轮转、租期/重复投递防线及明确领域错误与数据库错误区分；保留旧600秒修复扫描。未激活云队列，不是生产提醒SLA或全域治理完成。

W5 F窄跟进读取已主验：源`46e8f467`→主`0385ffba`，Tokyo/LA各51/51、本地PG9/9、实际默认链1条SQL且旧任务页仍4次读取、完整types与514符号/6文件图谱检查通过。仅首页facts读取层完成，首页UI仍等W4共享文件释放；上方F修复中的描述为此前检查点。

- 原目录 `chat-agent@e64357214a3bad99029a629558b7099d23819e5f` 较旧；最新候选集成树为 `29efb4c9d460b97ef526578d051e824592f52555`，位于 `/Users/li/work/orbit-production-cutover`，本地 `origin/chat-agent` 同 SHA。新领域任务以此已提交版本对齐。
- GitNexus 根索引起初与 `e643572` 匹配；随后审计使用 `orbit-production-cutover` 的 `29efb4c9` 索引。该树后续出现数据任务未提交修改；对这些文件以已提交版本为准，不把在途改动标完成。
- 首轮审计仅为源码、图谱、测试内容和历史报告核对；后续主集成已实际运行本地定向及全量离线回归。最新a2f22cbc全量为4435项：4055通过、53失败、327跳过，312.827s；失败名称与410be5完全一致、没有新增，236c202f修复的两项readback已在全量通过。其他失败沿用旧基线/环境依赖清单，跳过项不算已验；真实PG定向结果另列，不把定向通过称全绿。没有当前云端业务验收；已解决仅指明确子项，不推导全部部署或整站已验收。
- `已解决`：明确子项已交付；`部分解决`：保留已有成果，仅派剩余差异；`待验收`：已有实现，缺指定版本/环境的运行证据；`后续/待决定`：未进入当前编码批次；`被替代`：已有后续决策，旧要求不再执行。
- 当后续报告与旧文档冲突时，以精确版本、最新用户决定和真实验收为准。旧 Pipeline 删除要求尤其不能直接执行。

## 已解决的 Web 子项（不再重复派开发）

| ID | 已解决范围 | 证据及仍需保留的边界 |
| --- | --- | --- |
| D01 | 可重复创建普通用户、主办方、交互用户和空账号；独立测试数据初始化 | E01：4个账号验证、主办方权限正反例；当前主账号已扩充30联系人/10活动。特定“小雨”账号不从该4账号清单推断 |
| D02 | 报名资格/时间窗口、本人报名读取、取消和同记录重报 | E02、E03：历史Next Web实际回读；新版问卷另有single-flight、迟到响应和保稿测试。容量/人数展示仍在W3 |
| D03 | 两级行业选择、基础onboarding服务规则、供需标签规范化及各5项上限 | E04：后端规则存在；Web仍需接入和简化字段，不再重造规则服务 |
| D04 | Web手机拍照入口、服务端双面名片原子确认 | E05：`capture="environment"`及整卡确认测试；Web双面配对/来源复核仍缺，不能整项关闭P1-11 |
| D05 | 联系人私有Memo保存与回读 | E06：私有笔记独立于共享互动，已有持久化测试；简介/背景/时间线去重仍需设计 |
| D06 | 真实站内消息须有有效绑定和参与者资格，撤销后拒绝通信 | E07：服务端资格/版本/越权测试及Web↔App历史收发验收。P1-15真实通信防线已解决；本地草稿的旧“对话”措辞可单独澄清 |
| D07 | 普通待办完成/恢复、关系跟进完成并明确下一步 | E08：真实Web/Neon和部分原生双向回读；普通待办与关系任务语义不同，不强行合并writer |
| D08 | 个人日程编辑、v3重复/提醒规则及同记录双向回读 | E08、E09：已有Web运行证据；实际到期提醒、Push及当前合并版缺项仍独立记录 |
| D09 | AI只读请求的否定授权保护、请求级回复ID、最终答案保存、历史重开不覆盖前答 | E08：147项/62项历史定向回归，浏览器两轮四消息回读；不代表所有入口重复生成问题均关闭 |
| D10 | 活动全部浏览、名称/编号/主题搜索、状态/话题筛选 | E03：现有Web探索页与测试；个性化推荐及新视觉方案另列 |
| D11 | 历史云端活动生成/发布/签到/交换/本人关系初始化闭环 | E08：已发生的Web/Neon/worker验收保留；新测试环境未配置AI/worker的事实不能反向抹去实现，也不能宣称新环境已验收 |
| D12 | 真实准入容量、未知人数不冒充0、名单不覆盖摘要；详情/列表/本人活动/公开主办方消费者适配 | W3-F `55dc5ec9`，主代理独立集成90/90、完整typecheck；[领域报告](/Users/li/work/orbit-web-integration-20260917/repos/orbits/docs/development/web-2026-09-17/W3/REPORT.md)。未部署，报名回执R另验 |
| D13 | Web双面名片显式配对、来源/版本复核、整卡幂等确认、私有预览、局部三语和联系人详情长值 | W2源`482f337f`、主集成`7d89d4c6`；主76/76名片/PG＋90/90活动、完整typecheck及图谱检查；[领域报告](/Users/li/work/orbit-web-integration-20260917/repos/orbits/docs/development/web-2026-09-17/W2/REPORT.md)。保留SSR局部例外，未部署/未做真实OCR |
| D14 | 准入申请/撤回回执核对、独立GET、scope迟到隔离与失败保稿；报名页及legacy路由规范账号接线 | W3-R源`23646028`、主集成`66087fff`；主84/84含本地PG及全typecheck。仅本地candidate子项验收，历史raw报名兼容和App严格回执身份未解决，禁止据此部署 |
| D15 | 独立dashboard摘要SQL、同请求同provider/actor仅在途图复用；跨请求不复用 | W0-B3源`88e98dd5`→主`7066e5ec`；主37通过/1既有URLguard跳过、全typecheck，新增PG实跑。保留完整evidence与非规范日期回退，非全域成本治理/生产验收 |
| D16 | Web规范账号资料接线、基础onboarding/合法next、基础与匹配资料分开、窄字段CAS与回执回读、409刷新与保存互斥保稿 | W1源68d26→6ff→394c，主`fd5dcdc2`；主134/134含真实PG、全typecheck。未部署，正式词表/真实Google回调/全站强制门禁不在完成声明内 |
| D17 | 本人真实目标与公开活动的严格词法匹配服务：有效未来、排除本人主办/已报名、稳定前三、空/失败分开 | 主`501ed5c8`，主110＋PG5全过、全typecheck；不是语义AI，未接首页，历史身份发布门保留 |
| D18 | 首页四源事实服务与纯展示模型：真实空/失败、固定产品日窗口、计数先于展示截断 | 主`4e15421e`，主63/63＋LA22/22、全typecheck；未接UI、非数据库事务快照，底层读取成本门仍开放 |
| D19 | 资料加载失败提示不再写死示例身份或误称来源复核失败；保留错误码和恢复链接 | 源`f6550096`→主`42d04159`，主83/83＋真实SSR1/1及完整typecheck；仅原中英文案，不冒称全站语言或浏览器验收 |
| D20 | 正常本人资料PG读取按actor和必要字段下推；mutation继续原事务store | 源`0f5cd336`→主`3e0bfa15`，主158/158、types、5文件完整图谱；实际1000无关actor JSON返回约20.7MB→1053B，双方仍2SQL，custom/mutation全读与DB扫描成本不在此关闭 |
| D21 | 可见话题搜索与筛选同源、移动双组筛选/44px触控/选中语义、稳定内容与地图切换、真实能力示意文案 | 源`e07f6b92`→主`2a684c62`，主44/44零skip、全types及58符号/3文件raw；[截图与局部验收报告](/Users/li/work/orbit-web-integration-20260917/repos/orbits/docs/development/web-2026-09-17/W3/P1-24-AUDIT.md)。不是实际地理地图；头部约增120px、语言导航状态边界明确，未部署 |
| D22 | 首页facts默认关系跟进窄读取，真实空/失败及严格授权；旧任务页路径保持 | 源46e8→主0385ffba；Tokyo/LA各51/51、PG9/9、实际默认链1SQL、types及514符号/6文件raw；[领域报告](/Users/li/work/orbit-web-integration-20260917/repos/orbits/docs/development/web-2026-09-17/W5/FOLLOWUP-READ-DESIGN.md)。未接首页UI，不承诺任意规模恒定成本 |
| D23 | 纯站内提醒plan/wake事务命令、持久公平轮转、租期和重复投递防线、target领域与SQLSTATE错误分离 | 源bfff1984→主af9784f4；核心55/55、相关81通过及旧PG组12/12补验、types及939符号/12文件raw；默认publisher不启用，未部署/云验/真实Push，旧修复扫描保留 |
| D24 | 公共联系人完整DTO语义的SQL分页/全局facets、微秒游标、缺失边界续页、合法证据并集及分页歧义范围 | 源4119c574→主410be5d9；主C分页30/30、下游81/81、外置独立oracle9/9、两types及329符号/6路径raw；未知Unicode运行环境完整fallback，Web自身搜索分页另由B2实施，未部署 |
| D25 | 首页四源事实＋真实公开活动推荐的服务端聚合、无参逐次鉴权刷新action及局部失败隔离 | 源64ad07fb→主77c46617；主Tokyo/LA各102/102、types0、354符号/4路径完整raw。尚未接UI，框架HTTP传输/整页成本与W4 owner-generation适配待验，未部署 |
| D26 | 已登录Web页面GET/HEAD按持久化基础资料判定导航/SSR门禁，精确补全豁免与安全next | 源a1218b08→主a2f22cbc；主107/107含真实PG、两types、123符号/9路径raw、冷启动14HTTP及真实浏览器保存/换号通过。API/POST不新增限制；已展示页面无网络不即时撤销，未部署 |
| D27 | 离线completion夹具去除机器绝对路径，真实入口与缺App consumer负例可移植且禁止业务网络/子进程副作用 | 源a822a8e4→主1f492f49；主Node25/Tokyo与Node24.19/LA各17/17、全types及15符号/2路径raw。完整运行时DB/Node22/环境隔离门保持；不是完整跨端runtime或生产验证 |

## 原30项逐项映射

| 原ID | Web范围与当前结论 | 状态 | 后续归属 |
| --- | --- | --- | --- |
| P0-01 | 云端权威、数据矩阵、初步读取优化及生产切换已有；完整分页/聚合、并发治理仍在开发 | 部分解决／在开发 | W0 |
| P0-02 | 通用四角色测试账号与可重复种子已解决；特定小雨账号和最终统一测试入口按环境证据核验 | 部分解决（D01） | W0＋主代理验收 |
| P0-03 | Web规范账号接线、基础onboarding与认证后安全回跳已主验；全站首次资料强制门禁和真实Google回调未关闭 | 部分解决（D16） | W5全局接线＋主代理集成验收 |
| P0-04 | 真实容量、人数未知/0、准入回执与独立GET已通过主代理集成；历史报名身份兼容与App规范账号消费仍需完成后才能发布 | 本地子项已解决（D02、D12、D14）／发布受限 | W3＋W0＋后续App精确修复 |
| P0-05 | Web首页已有工作区；不能将App首页完成或本人活动旅程当Web真实推荐完成 | 部分解决 | W5统筹，W3供给活动读取 |
| P0-06 | 原条目主要为App底部导航；Web只承接入口重复和层级问题，不能直接复制五Tab | App主体／Web待设计 | W5 |
| P0-07 | I ORBIT及业务上下文入口已有；跨页面主动AI收口与重复入口需按Web实况收尾 | 部分解决 | W4＋W5 |
| P1-08 | 两级行业已解决；职位顺序/推荐、重复简介、通用开场白未收敛 | 部分解决（D03） | W1 |
| P1-09 | Web基础资料与可选匹配资料分区、权威onboarding与窄字段保存已主验；全站强制门禁独立接线 | 本地资料子项已解决（D16） | W5全局接线 |
| P1-10 | 标签chip/自定义/供需限制已有；预设选项实际来自用户已有值，统一词表和话题规则未完成 | 部分解决 | W1，词表由主代理协调 |
| P1-11 | Web相机入口/双面后端及Web V2配对、整卡来源复核已完成本地集成；实体相机、真实OCR/跨端远程回读另验 | 本地实现已解决（D04、D13）／远程待验 | 主代理系统验收 |
| P1-12 | OCR原文保持，详情长值和名片流程日文已本地验收；全站日语一致性不由局部通过推断 | 局部已解决（D13）／全站另列 | W5语言层 |
| P1-13 | 邀请/接受/绑定/撤销已实现；用户决定本轮保留邀请绑定，email OR phone自动账号发现仅存档为后续方向 | 现有能力保留／自动发现明确延期 | 后续产品队列，不阻塞本轮 |
| P1-14 | 私有Memo已解决；本地真实读取链已复现背景复制到简介/时间线和读时钟冒充互动日期，来源语义修复待精确设计及B4释放文件 | 部分解决（D05）／缺陷已复现 | W2，与W0 B4串行 |
| P1-15 | 无有效绑定者无法真实站内收发；已有权限及撤销防线 | 已解决（D06） | 保留W2回归，旧措辞单列 |
| P1-16 | 服务端引用鉴权已有；Web无选人控件，发送仍为references空数组 | 部分解决，明确Web缺口 | W4首批 |
| P1-17 | 人脉/活动/notes/tasks/followups/schedule工具及历史只读实测已有 | 部分解决／当前版本待验 | W4，底层读取W0 |
| P1-18 | 新消息持久化/历史覆盖和输入框故障已有修复；不同来源入口的重复生成需核对 | 部分解决（D09） | W4 |
| P1-19 | 普通待办/关系任务/日程对象和v3操作已解决；Web首页聚合与展示口径尚待核验 | 部分解决（D07/08） | W5首页，v3不重做 |
| P1-20 | 独立笔记及来源任务建议已有；任意联系人Memo自动日程不能从这些能力推断完成 | 部分解决／需专项核验 | W4提方案，W2提供Memo边界 |
| P1-21 | 2026-09-14已明确保留独立Pipeline，后续canonical生命周期也已批准 | 被后续决策替代 | 不再派删除任务 |
| P1-22 | Google授权检查与约谈投影已有；完整聚合、Apple/邮件及双向同步未闭环 | 部分解决／后续暂缓 | 暂不新开编码线 |
| P1-23 | 桌面/手机widget不属于当前Next Web闭环 | App/平台后续 | 排除当前Web编码 |
| P1-24 | 当前桌面/窄屏审计后的话题搜索、双组筛选、选中语义和地图示意澄清已主验；标题/字号/封面保持，真实地图不在本批 | 本地批准范围已解决（D10、D21） | 主代理后续系统验收 |
| P1-25 | 全部浏览与严格词法推荐服务已主验；尚未接首页，owned/registered旅程仍不是个性化推荐 | 服务已解决（D17）／UI待接 | W5首页 |
| P1-26 | 匿名首页AI示例已前置；真实活动推荐理由/人群信息尚未前置 | 部分解决 | W3＋W5 |
| P2-27 | 真实统计/按需分析已有；概览/结构/机会三页签仍在，页面收敛未完成 | 部分解决／设计 | W4＋W5 |
| P2-28 | 版本化分析/显式生成已有，最新报告真实性和重开验收按专项证据核对 | 部分解决 | W4 |
| P2-29 | 独立目标保存/清空已有；Web资料还将relationshipGoal映射为profile.intro，需修正语义 | 部分解决 | W4定义分析语义，W1负责资料写入 |
| P2-30 | 尚未确定100/1000名片等商业限制，原要求就是推迟定价 | 后续决策，当前无需编码 | 主代理产品队列 |

## 未解决事项按领域分组

### W0：数据、读取成本与环境（沿用现有任务）

负责人任务：`01a0ae46-0ccf-7d83-aff0-7128dbec26a5`；已有数据任务 `01a0a537-494f-75f2-8e61-9b7c4a5bba64` 的成果继续复用。

- 完整SQL分页、搜索语义和下一页消费；bootstrap最小化、dashboard聚合。
- 账号创建/读取、storage并发保护与运行时维护。
- 负责人已回报用户另行授权：保留旧Neon数据，将独立测试环境接正式域名作为Production。本表不重复执行切换。最新负责人回执：基于29efb4c9提交`732a017f`（20文件），已推送`origin/codex/production-cutover-read-write-20260917`；新Production部署`dpl_7SnhZuB3xhmuffFB9eCt2eKcfBsr`为READY（sin1）。Vercel API确认`www.orbitailink.com`与`orbitailink.com`归属新项目`prj_PFJXRat2a7ADxz6tWVLQU7rNTaIt`且verified，旧项目`prj_yhzteXixndQnTnxsh7TinSUev0Nh`已暂停。此前新部署浏览器登录验证30联系人、9发布活动；正式域名切换后的登录回读仍在验证。以上为负责人报告，主代理尚未独立验收。
- 发布边界：不得恢复或发布旧orbit；后续部署须使用新项目和新workspace，生产目标缺少pin时应拒绝执行。负责人报告本次旧Neon SQL连接/请求均为0；旧数据保留不等于已完成全部生产业务验收。
- 最新负责人回执（替代上方早期部署快照）：分支已推送至`02ec26f0`（`732a017f` → `cfa4b17a` → `02ec26f0`）；`02ec26f0`加固部署`dpl_5YSXNR4mGzsb1xWuZt6FfY4jUimV`已完成production部署（sin1）。正式www/apex已切换，www刷新回读30位/30条联系人正确，旧Vercel仍暂停，旧Neon本任务SQL连接/写入为0。补充按字段投影、npm test云库拒绝、缺身份不扫描、业务关系ID与存储键区分；这些不代表容量或完整业务验收。
- 发布与验证补充：新项目`gitLinked=false`，后续push不会自动发布，部署必须显式指定`prj_PFJXRat2a7ADxz6tWVLQU7rNTaIt`。最新定向回归27项：26通过、1因既有测试只接受另一套批准本地库而跳过；新增CAS/scope/projection真实本地PG测试已运行通过，两个Web类型检查通过。此为负责人报告，不等同于主代理独立验收或四项治理全部完成；交接文档提交仍在进行。
- 最新未完成清单：SQL全量搜索/分页/全局facets、dashboard聚合、各领域CAS采用、idle/due-only可靠唤醒。当前未降低提醒频率、未截断旧列表。Future Preview已移除数据库URL绑定，但历史immutable previews仍不是隔离测试环境。Web/API外部契约和App base URL未变；App须重新登录，原生实机尚未验收。详细交接见[生产切换记录](/Users/li/work/orbit-production-cutover/repos/orbits/docs/operations/production-cutover-20260917.md)，以上仍为负责人回执。
- `732a017f`交付范围据负责人回执包括精准身份读取、联系人SQL权限筛选、目标锁定、原子注册/初始化、条件更新与行业字段接入、读取合并/写后失效、4个索引及回归。相关回归506项：501通过、4跳过、1失败（文案失败在29efb4c9也复现）。全量列表分页和dashboard SQL聚合仍未完成，不标W0整体已解决。W1–W4仍基于29efb4c9，后续由主代理审阅并协调新提交，不发布旧orbit。
- Google OAuth、真实provider/worker与统一环境验收按各自配置和批准预算登记。原Production额度耗尽不阻止本地研发。
- 共享热点：storage、account/auth、contacts/bootstrap/dashboard读取、Neon/Vercel、其Bridge交接。其他领域需等待具体接口冻结，不重复改造。

### W1：注册引导与个人资料

- W1-01：Web注册/首次登录接既有onboarding规则，保持合法next返回与已有用户兼容。
- W1-02：行业在职位之前；通用资料移除开场白和重复简介；基础与活动匹配资料分开，不再用活动字段阻塞基础使用。
- W1-03：核定预设行业/职位/供需/话题词表及多选限制，复用已存在的5项供需校验；服务端基础字段策略不擅自更改。
- 验收：全新与既有用户、缺失字段/拒绝读取、刷新/返回、基础与活动资料互不覆盖；Google配置不足只挂起真实回调验收。
- 主要文件：account前端入口、`profile/**`、profile route mapper、`features/profile/**`及对应测试。account/auth服务由W0占用。

### W2：名片导入、联系人详情与资格

- W2-01：Web V2正反面配对，提交cardId/side，两面复核及来源选择，确认一次仅创建一个联系人。
- W2-02：长公司名完整查看；OCR业务原文保持原样。复核确认现有Provider已经接受ja，缺的是调用方日文文案，W2沿用现有接口补局部copy，不新建Provider；全站覆盖由W5统筹。
- W2-03：联系人简介/关系背景/时间线的内容归属方案，保留私有Memo。adapter已对相同bio/intro去重；展示区块并存不能证明底层数据重复，先复现再决定是否调整。
- W2-04（后续方向）：用户2026-09-17明确决定“先保留邀请绑定，自动发现功能记录在档案作为后续开发的方向”。本轮不开发email/phone自动账号发现、验证或可发现偏好。保留现有邀请接受/绑定/撤销与通信鉴权；当前无绑定返回unregistered不能当作账号不存在的事实。未来须先补齐可信标识所有权、用户主动同意发现、歧义与phone-only路径设计，再单独批准；候选命中永远不能代替通信授权。
- 验收：单面兼容、双面冲突/重拍/重试/一次创建；字段来源、长值；未绑定/撤销/越权；Memo只归本人。
- 主要文件：contacts业务UI、`contacts/new/batch2/**`、acquisition摄入与测试。真实消息服务不重建；SQL读取及生命周期写入先协调。

### W3：活动事实、报名、搜索与推荐

- W3-01（首批）：用真实policy容量/真实主办方替代详情占位；运营摘要不可用时区分“未知”和确实0人。现有容量占位不是报名人数清零的根因证据，不能混写为同一bug。
- W3-02：复用新版问卷请求保护，验证当前Next Web的提交→独立回读→刷新→取消→重报、题集切换、错误保稿和人数一致性。
- W3-03：列表搜索/筛选保留，评审密度/字号与推荐并置；推荐理由来自真实活动上下文。
- W3-04：首页少量推荐由W5装配，W3提供明确读取接口/投影；本人活动旅程继续保留原语义。
- 主要文件：events产品/注册目录、`canonical-event-detail-view.ts`及对应测试。`orbit-landing-route-view-model.ts`属于共享热点，单一写入者后再编辑。

### W4：I ORBIT引用与人脉分析（首批限AI交互）

- 复用已经修复的只读授权、request级消息ID、历史回读、普通待办及个人日程v3；只领取剩余差异。
- W4-01：Web输入支持搜索/选择联系人并提交稳定ID引用；当前`orbit-real-agent.tsx:1557`为输入区，`:2807`发送`references: []`。复用服务端鉴权，切号/失效引用/迟到响应不得混入他人信息。
- W4-02：来源入口统一携带对象、先预填后显式发送；新对话/历史组织已实现，只补剩余重复生成或可发现性问题。
- W4-03：人脉分析从三页签收敛为清晰的结构统计与按需分析，先交视觉/信息方案。保留可信报告版本和stale提示。
- W4-04：长期目标与简介分开；W4定义分析消费，W1负责资料保存路径，避免抢同一资料文件。
- Memo→建议→用户确认→canonical日程未闭环，单列后续批次，不扩大W4首批；tasks/schedule v3不重做。
- 本领域不占用W0的底层读取、W2的联系人编辑和W3的报名问卷；跨域需求通过明确工具/DTO交接。
- 首页/全局导航/语言与整体分析布局由W5统筹，领域提出具体方案后再交界面变更。

### W5：主代理统筹的首页、导航、语言与集成

- 汇总Web桌面/移动入口清单，选择消除重复入口的具体设计；不机械搬App五Tab。
- 首页区分待办、日程、本人活动旅程和真正推荐；消费W3接口。
- 全局三语Provider、共享字典、CSS与shell统一安排写入者。
- P1-13自动账号发现已由用户明确延期，保留后续档案；继续统筹分析页布局和商业化后续队列。Pipeline保留依据已有批准，无需重复问。
- 集成当前候选基线与W0后续提交，逐条记录领域SHA、共享契约影响和失败基线。

## 集成与验收债务（不伪装成功能未实现）

E10记录候选集成版：Web单元3684项中3629通过/17失败/38跳过；后续数据库补跑及失败逐项另列。名片schema round-trip缺`cardIdentityExplicit`、通知delivery policy并发`40001`、部分专用PG环境缺项、契约目录检查与运行fixture问题仍须保留；不能以这些全部在旧分支复现为由自动关闭。

- 名片schema字段回读交W2设计时评估，但共享schema修改先报主代理。
- 通知数据库并发/PG读写问题交W0确认所有权。
- 专用PG18/barrier、Phone修复环境与原生验收不直接转为Next Web产品开发任务。
- 主代理集成后的回归针对实际变更；已有失败登记版本、命令和是否复现，不靠删除断言或伪造环境使结果变绿。

## 证据入口

下列路径与行号均对应候选提交 `29efb4c9`；`W/` 代表 `repos/orbits/`。新工作树对齐后可直接打开。同名旧主目录文件可能不是该版本。

| 证据 | 源码/测试/报告 |
| --- | --- |
| E01 | `W/scripts/lib/minimal-staging.ts:14,42`；`W/tests/services/minimal-staging.test.ts`；`W/docs/operations/main-test-dataset.md`；`bridge/2026-09-17-read-budget-staging.md` |
| E02 | `bridge/2026-09-16-production-fixture-testing.md:13`；`W/app/(app)/app/events/[id]/register/event-registration-workspace.tsx:599,737`；`W/tests/pages/event-registration-workspace.test.tsx:62,161` |
| E03 | `W/app/(app)/app/canonical-event-detail-view.ts:164`；`W/app/(app)/app/orbit-landing-route-view-model.ts:176`；`W/app/(app)/app/events/orbit-real-explore-client.tsx:515`；`W/tests/pages/app-events-registration-state.test.ts:10`；`home/compose-app-home-from-previously-approved-mock-first-capabilities/home-route-view-model.tsx:129`（同app根） |
| E04 | `W/features/profile/onboarding.ts:14`；`W/app/(app)/app/profile/orbit-real-profile.tsx:538,638`；同目录`compose-app-profile-from-previously-approved-mock-first-capabilities/profile-view-model-adapter.ts:20`；`W/tests/capabilities/profile-onboarding-policy.test.ts:32`、`profile-ink-signal-fields.test.ts:58` |
| E05 | `W/app/(app)/app/contacts/business-card-capture-workspace.tsx:649`；`contacts/new/batch2/business-card-ingest-v2-start.tsx:108`（同app根）；`W/tests/capabilities/business-card-ingest-v2-repository.test.ts:832`；`W/tests/pages/app-business-card-ingest-v2-view.test.tsx:105` |
| E06 | `W/tests/pages/app-contact-notes.test.tsx:17,83,146`；`W/app/(app)/app/contacts/orbit-real-card-connection.tsx:161` |
| E07 | `W/features/relationship-communication/service.ts:458,824`；`W/tests/capabilities/relationship-communication.test.ts:60,124`；`W/docs/architecture/relationship-communication.md:9`；`bridge/2026-09-16-contact-message-inbox.md:7` |
| E08 | `bridge/2026-09-16-cloud-five-item-acceptance.md`：保留各版本Web真实回读、provider/worker和最新环境限制，不只读首行旧verified |
| E09 | `repos/orbit-app/docs/sprints/0061-next-personal-schedule-v3/REPORT.md`（该报告明确包含Next Web）；`bridge/2026-09-15-note-suggestions.md`；`bridge/2026-09-15-notes-core.md` |
| E10 | `bridge/2026-09-17-cloud-read-remote-integration.md`：候选集成树、实际失败/跳过与后续修复范围 |
| E11 | `repos/orbit-app/docs/sprints/0011-home-analysis/PLANNER.md:6,9,39`：9月14日批准保留独立Pipeline；后续关系初始化见E08 |
| E12 | `W/app/(app)/app/agent/orbit-real-agent.tsx:1557,2807,3272,3712`；`W/tests/capabilities/ai-session-reference-authorization.test.ts:14`；`W/tests/pages/app-agent-session-mutations.test.ts:4,33`；`W/tests/ui/orbit-agent-context-href.test.ts:15,50` |
| E13 | `W/app/(app)/app/contacts/analysis/contacts-analysis-workspace.tsx:12,66,110,140,152`；`analysis-goal-editor.tsx:47`；`W/app/(app)/app/profile/orbit-real-profile.tsx:57`；`W/tests/pages/app-contacts-analysis-content.test.tsx:118,141`；`W/tests/capabilities/contacts-analysis-generation.test.ts:23,39,49` |

## 本轮调度记录

| 领域 | 模型 | 任务标识 | 状态 |
| --- | --- | --- | --- |
| 主协调/W5 | 当前主任务 | `01a0ae27-0068-7613-9f87-82aa91a836bd` | 总表、方案、文件锁与集成 |
| W0 | 沿用现有任务设置 | `01a0ae46-0ccf-7d83-aff0-7128dbec26a5` | 负责人确认正在开发；独占文件已登记 |
| W1 | Astra high；编码阶段Luna max | `01a0ae5b-4b9c-7d90-94c1-37edb3415bdf` | 设计包已交付、主代理已阅读；worktree `197d/orbit`，29efb4c9；未编码 |
| W2 | Astra high；编码阶段Luna max | `01a0ae5b-4ba4-73e2-a16b-4bd8c1f6924c` | 设计包已交付、主代理已阅读；worktree `5c7b/orbit`，29efb4c9；未编码 |
| W3 | Astra high；编码阶段Luna max | `01a0ae59-bdec-7512-9360-ad030a784ff3` | 设计包已阅读；worktree `15e3/orbit`，29efb4c9；基线定向23/23，未编码 |
| W4 | Astra high；编码阶段Luna max | `01a0ae5f-401c-7891-8ad5-0ce601a4dd6a` | 设计包已交付、主代理已阅读；worktree `2eef/orbit`，29efb4c9；未编码 |

四个领域均已获得正式任务ID并交付设计包。首次设计包由主代理审阅后划定Luna编码批次；当前尚未启动Luna编码，不把设计交付标为功能完成。更细的状态、交接和冲突规则见[SESSION-GUIDE](SESSION-GUIDE.md)。

### 首轮设计发现与文件预留

- W1确认Web资料投影缺`birthDate/onboarding/updatedAt`、保存尚未接既有CAS。优先设计投影/基础表单，再接认证回跳；`orbit-real-account-auth.tsx`及`orbit-profile-route-view-model.ts`由W1申请精确范围。不触碰W0账号服务。
- W1进一步发现供需标签被映射为介绍渠道/目标关系类型、行业被映射为市场；与目标/简介混用一并审查，按字段所有权修复，不靠整份资料覆盖。
- W2已产出[设计包](/Users/li/.codex/worktrees/5c7b/orbit/repos/orbits/docs/development/web-2026-09-17/W2/PLAN.md)：Web局部manifest和整卡复核复用后端，不改repository/API；账号发现、通信绑定、详情长值与全站语言分别列出边界。当前为待审设计，尚未批准编码。
- W1[设计包](/Users/li/.codex/worktrees/197d/orbit/repos/orbits/docs/development/web-2026-09-17/W1/PLAN.md)已阅读：基础表单/窄字段CAS可独立；登录回跳与全局强制门禁是两件事；以bio作为唯一新介绍输入的兼容方案、职位/标签词表需独立审阅。共用profile adapter也被admin消费者使用，生日不得随扩展泄漏。
- W3[设计包](/Users/li/.codex/worktrees/15e3/orbit/repos/orbits/docs/development/web-2026-09-17/W3/PLAN.md)已阅读：人数与容量三态映射复用已有准入服务，名单仅展示而不覆盖总数；roster当前为完整查询，不能把此次问题误报为分页截断。首页`canonicalEventToLandingEvent`另有hardcoded 0，归W5单列；详情修复不自动关闭首页人数一致性。
- W3独立图谱：`resolveCanonicalEventDetailView` LOW；`getOrbitLandingEventView` HIGH，3个直接调用方（详情、home的canonical映射、公开主办方映射），7个受影响符号。此HIGH已在主任务披露，不被riskSharedAxes LOW覆盖。预留`orbit-landing-route-view-model.ts`及必要的`orbit-registered-event-route-view-model.ts`给W3首批方案；批准前不编辑。
- W3另发现准入申请分支直接消费POST/DELETE返回，不同于旧报名严格回执＋GET。先列独立验收子项，不能直接扩大首批容量映射修复范围。
- W4[设计包](/Users/li/.codex/worktrees/2eef/orbit/repos/orbits/docs/development/web-2026-09-17/W4/PLAN.md)已阅读：联系人搜索/选择复用现有分页接口及最多20个引用限制；URL的q入口和无session历史入口存在自动发送路径，拟改为可编辑草稿后显式发送。切换actor/session时须隔离迟到响应和请求状态，不能仅靠回复ID判断归属。此为待审方案，尚无本轮运行验证。
- W4申请`agent/page.tsx`仅传递既有actor标识及隔离组件实例，不改认证或底层读取；需在编码批准时冻结精确范围。全局`orbit-ask-draft.ts`的actor归属及`orbit-product-href.ts`旧自动执行约定由W5协调，不随W4扩大编辑范围。分析页布局、报告版本和长期目标独立列后续批次，目标writer继续归W1。
- 初次领域任务尚未进入Luna编码阶段；已提交设计不是产品修复完成。

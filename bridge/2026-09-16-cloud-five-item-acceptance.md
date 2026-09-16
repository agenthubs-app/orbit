# BR-026 — 五项云端闭环执行与精确剩余验收

- 更新：2026-09-17；Web＋Neon＋云端 worker 本轮主流程 verified；总状态 `consumer_ready`，原生范围未关闭。
- 授权：用户“这五项闭环”，此前允许 Vercel Production、合成数据作测试事实源、luna/max 并行和及时 commit；没有清空数据库或对外消息授权。
- Web：已部署真实 HTTP、关系任务消费者、云端活动队列和站内提醒 maintenance。App：Xcode 27 原生运行及部分 Production 验收已完成，精确剩余项见下节；不再受旧工具链阻塞。
- 数据：Neon `workspace:orbit-demo-fixtures`，Web/API 为唯一写入边界，App 经同一 Production HTTPS API。
- 入口：https://orbit-puce-kappa.vercel.app；待办、笔记、提醒与账户详情不写任何密钥。

## 2026-09-17 原生 Production 验收增量

用户“xcode也ok了那部分验收也做一下”后实际运行。Web/API 继续使用 `5961cdde` / `dpl_3av2kpWJE4NBbnTA2SdfFLagVJwX`，未重新部署、清库、重 seed 或修改活动日期。App 增量 `3af3eefe`、`5ac0e9fd`；后者收口旧 fixture 的 canonical 编辑入口并移除 preview-only 看板阶段写操作。不能据此宣称所有原生范围通过。

### 已完成的真实运行证据

- Xcode **27.0 (27A266a)**，iOS SDK27.0，iPhone17Pro / iOS26.1 Simulator；实际 `xcodebuild`、安装、启动和原生交互成功。Xcode27 使用 **Device Hub** 控制设备，旧 Simulator 窗口不是有效交互表面。先前无签名包导致 SecureStore 拒绝保存登录，改为正常模拟器 ad-hoc 签名后登录成功；没有弱化认证或改用明文存储。
- Debug 原生二进制通过本机 Metro8081 加载 App JS；**业务 API 明确为远程 Production HTTPS，业务事实源仍为 Neon**。不是本地 mock API，也不是实体设备或自包含 Release 包验收。原生服务器设置显示正式 URL，检查返回“Orbit 服务响应正常”。杀进程重新启动后安全恢复主办方登录。
- 普通待办 `task:c658b80463ee1e95769bdcb2`：主办方原生完成于 `2026-09-16T18:13:50.384Z`，Web 新开页读到已完成；Web 恢复于18:15:20.336Z，原生重新进列表为未完成1／已完成0。Neon 保留 completed/reopened 两条操作轨迹，标题/归属不变；不能再声称此任务 payload 与上一轮逐字不变。
- 日程 `personal:942e3480017ba330998e4b15`：原生创建“测试：原生与 Web 云端日程同步验收”，Shanghai 10月2日10:30–11:00，Neon为02:30–03:00Z。Web读到同记录，修改地点为“Orbit 测试空间（Web 回写已确认）”；原生刷新读到新地点。无外部邀请或日历写入。
- 原生主账号完成 `task_016`（後藤信也），空下一步先被验证阻止；明确输入“测试：复核後藤信也的门店试点交流提纲”、Shanghai 10月3日14:00，18:26:22.657Z正式 lifecycle 提交成功。原task completed/version2；`connection_0030` needs_follow_up/version2；新 `relationship-task:c794282e-6cbf-44f9-a2b2-3a778d0ae44e` open/version1、dueAt06:00Z。原生刷新保持旧任务历史、新任务当前；Web同记录回读正确时间和联系人，主账号当前66／历史16。没有调用普通任务 complete 代替关系提交。
- 原生主办方联系人读到前轮 Web 明确设置的 active 目标，编辑界面不提供旧阶段切换；私有资料和消息草稿/日程/笔记快捷键保留。原生关联笔记 `note:a65dfe73143b8cd3c5fd4f01` 于18:22:01.229Z创建，version1，owner和contactIds正确；Neon只读核实正文，冷启动及切回账号后关联列表仍能读取。
- 原生可读主账号“R2 云端任务提醒”已读状态，点击打开对应真实普通任务详情；这是既有云端 ReminderPlan 产物，不是新造提醒。原生重开 Web 已有的 AI 笔记查询会话，完整读到题目、正文、contact_005与“已读取 notes”；这是历史回读，不冒充新模型调用。
- 账号切换：主办方→演示主账号→主办方均正常登录；主账号显示66联系人/66当前跟进及自己的日程，切回后仅1位联系人和自己的目标/笔记，没有保留主账号列表。三 actor只读 lifecycle preflight均 readyForCutover:true、issues:[]；主账号82条关系任务为66当前+16历史。
- 最终版本再次登录主账号，旧 fixture `contact_030` 无 accepted-side 标记，仍经本人 connections 精确解析到 `connection_0030` 的 canonical lifecycle。原生详情正确显示“需要跟进”和新任务10月3日14:00；编辑器仅允许私有资料、不含旧阶段操作；点击“处理关系跟进”打开同一新任务及旧任务已完成历史。没有第二次提交或直接改数据库。

### 代码、回归与证据边界

`3af3eefe` 增加原生初始化表单与 actor/cookie/baseURL/contact 范围控制；无默认阶段/目标/日期，归档须确认，失败重试同 key/同 payload，revision变化刷新，回执核对本人关系和下一步。pending 排除正式看板；已初始化的旧阶段编辑被禁用。新 pending 的 Production 点击提交尚未实测，不能以组件测试代替。

- 初始定向55/55；快捷键和旧测试接口接线修复后的定向60/60，两组有重叠，不能相加成独立115项。最终 App typecheck通过。
- `5ac0e9fd` 最终冻结后，9个相关文件定向90/90（`TZ=Asia/Tokyo`，工具session24623），typecheck exit0（session54540）。覆盖初始化表单/协议、canonical fallback、看板源码/视图/渲染、详情交互/编辑器；不把重叠55/60/90结果累加。fallback只有同actor精确唯一contact→connection并通过snapshot校验才开放正式操作，失败/重复候选关闭入口。
- **最终已提交版本全量重验：** 在`repos/orbit-app`运行`TZ=Asia/Tokyo npm test`，**2898/2898，0失败/取消/跳过**，266.623秒，session47517 exit0；`npm run typecheck`再次通过（session82070）。日志`app-final-full-tests.log`与`final-committed-typecheck.log`。本轮源码/测试冻结后执行，与下面早期失败运行分开；明确测试时区不等于已修复全部测试对宿主时区的依赖。实际业务日期另在Shanghai原生/Web/Neon核验。
- 一次全量 `npm test`：2887项，2843通过/44失败/0跳过；保留原日志。联系人失败涉及新初始化GET的旧mock缺失与通用快捷键隐藏，已补真实404夹具、失败关闭和ready快捷键回归；其余8文件在 `TZ=Asia/Tokyo` 下327/327，证明是其东京时间断言与宿主上海时区差异。没有将此次全量改记为全绿。
- 执行偏差透明记录：02:18:28 CST一次联系人测试夹具编辑与全量重叠；收到冻结纠正后停止，全量结束后最终60项重新验证相关文件。重叠文件不使用原全量结果证明最终版本。
- GitNexus旧索引落后，7个现有 App 符号 pre-edit impact均LOW；direct调用覆盖详情路由/编辑器/看板与Intros。新controller UNKNOWN，源码确认 initializer hook→controller→HTTP 与测试；不是零影响。提交前all/staged分析已执行，staged11文件/17符号/0关联流程/LOW；索引限制使其不是完整安全证明。未提交根AGENTS/CLAUDE用户改动。
- 最后入口修复 pre-edit impact 13次：8 LOW、5 UNKNOWN；已解析调用涉及详情路由、PipelineContent/StagePanel/StageContactRow及阶段action构造，0可解析流程。UNKNOWN补源码调用复核，不视作无影响。最终all14文件/29符号/LOW，App staged8文件/10符号/LOW；旧索引`5e31c59a`未覆盖新controller，仍保留分析限制。
- 本机证据目录 `/tmp/orbit-native-acceptance.xaiowj/`：`signed-build.log`、`app-full-tests.log`、`timezone-regression.log`、`final-typecheck.log`；普通任务三份快照、`owner-followup-before.json`/`owner-followup-native-completed.json`、`native-writes.json`、`canonical-preflight.jsonl`及原生截图。临时目录可能被清理，以上脱敏结果保留在本记录。

### 仍未通过／不能冒充完成

1. **活动交换通知的原生入口缺失。** Naoki实际点击“收到新的名片交换申请”返回目标暂不支持；真实href为Web参会者query+anchor，App无等价canonical参会者/交换详情。不能删掉query跳活动首页并算通过。原生新用户报名→发布结果→双方交换全链不能关闭。
2. **新的pending初始化正例缺对象及付费授权范围。** Production现有两个accepted side已被本人初始化；不重置它们、不手工写假pending。若要新增独立活动经正常画像/worker/发布/交换得到新对象，需复用剩余模型预算的范围确认；已异步询问。本轮尚无新活动和模型调用。原$1账本明确不含native，本轮未擅自扩展范围；既有CNY0.11余额差额不是本轮新增费用。
3. **服务端旧状态投影旁路仍需收口。** 无accepted-side不等于无canonical关系。App入口已由`5ac0e9fd`修复并原生复验，看板不再把preview当保存成功；但服务端旧`PATCH /api/contacts/:id {status}`仍可写未标ready联系人自己的legacy detail投影，不能把本轮App修复说成服务端已禁止旧客户端写入。没有修改Web/API或部署此项。
4. **活动页面附加失败证据。** 主办方未报名的10月18日活动，顶部“可报名”与服务端“报名已截止”禁用按钮矛盾；查看参会者两次返回页面无法加载/没有对应内容，推荐等模块也未成功回读。未尝试报名或改期；这不是已证明的权限拒绝，更不能算原生参会者主流程通过。

Web既有云端worker证据继续有效；原生构建与双向持久化基础链已验，完整目标仍为consumer_ready，不因Xcode修复就自动关闭全部业务项。

## 2026-09-17 用户确认后的关系初始化修复

本节覆盖下方历史阻塞结论。用户已确认“交换只确认认识，双方各自选择目标或下一步后，再进入正式关系阶段”。Web/API 实现提交 `04946189`，增量修复 `2c5e8ada`、`5961cdde`；两位测试账号已在 Production 正常 UI 中分别确认本人选择，后续任务完成、冷刷新、联系人详情和列表回读通过。此前Web初始化HIGH缺口关闭；不等于原生验收完成。

- accepted writer 的 Contact/Connection 改为现有采集状态 `captured`、`lifecycleInitialization: pending`、version1；不自动生成目标、日期、任务、关系强度或知识交换意图。它不是第五种 canonical 阶段。
- `GET/POST /api/contacts/:id/relationship-initialization` 校验当前 actor、真实 accepted request 及其本人 side。本人显式选择推进目标、带日期的待联系／维系任务或归档；另一方仍独立选择。内容修订哈希、SERIALIZABLE、幂等回执、版本及事务末回读保证原子提交；损坏回执、越权、陈旧页面、重复不同请求和既存任务均失败关闭。
- 旧 outbox 只补不存在的记录，不覆盖本人设置、备注或 tombstone。configured store wrapper 同步转发原子 insert-only，并在写前、完成／冲突／失败后清除进行中的读取去重缓存。原 upsert 语义不变。
- Web 详情无默认选择；错误保留原提交，重试同 key/同任务 ID。权威 GET 识别旧 accepted active/no-goal/no-version 缺陷；读操作不修库。新 pending 标记贯穿实际存储读取→列表契约→独立显示分组，排除四个正式阶段的筛选和计数，不假归档。旧未标记记录不在列表靠缺值猜测状态。
- 回归：Web 存储／列表／页面 83项、生命周期与真实本地 PostgreSQL 46项、现场及 outbox PostgreSQL 4项，无 skip；主线额外把真实 accepted writer→durable outbox→投影→双方初始化→旧投影重放串为同一 PG 集成测试。full Web typecheck 通过。App 契约／Schema同步与既有生命周期9项、typecheck通过，不等于原生验收。
- GitNexus 仓库 `/Users/li/work/orbit`，索引 `5e31c59a` 落后7提交；共享存储 impact CRITICAL，深层展开 partial，另做直接调用层检查（25个调用方／59流程），不降级。提交前 all/staged detect-changes 已执行，staged43文件／143符号／133流程，CRITICAL。新增符号 UNKNOWN 以实际路由/导入和测试补查；不宣称全索引安全。原用户 AGENTS/CLAUDE 未提交。
- 生产修改前快照：`/Users/li/.config/orbit/relationship-initialization-before-20260917.json`，0600、7条本人范围内记录，SHA-256 `394c0e08bef554944ae895e6256c02bc60d03aae1304776fd47b94eda8d38f04`。两个测试 actor 的新服务只读检查均为 pending；没有改既存关系或批量迁移。
- 本次修复与验收不调用收费模型；沿用此前模型验收证据与预算记录，不新增充值、外发消息或清库。

### 初始化线上证据与增量修复

- `04946189` 发布 `dpl_4qcAV8nJHeSSZU3cX5BFW1ndHCku` 后，QA 于 `2026-09-16T17:42:55.334Z` 选择 active，目标“测试：与山本直樹确认活动产品联调范围”，本人 Connection version1。对方 Naoki 页面冷刷新仍 pending，证明不会代替另一方选择。
- Naoki 于 `17:45:43.080Z` 选择 needs_follow_up，创建 `task:673e1ae8-e8eb-4458-ae9f-14d08b6da7ea`，标题“测试：整理双方对活动报名与匹配流程的联调需求”；浏览器明确输入 `2026-10-01 10:00`（Asia/Shanghai），Neon 正确保存 `2026-10-01T02:00:00.000Z`。原生 datetime 输入需原生键盘触发 change，首次空值被阻止，没有造成错误写入。
- 两个 actor 的只读 canonical preflight 均 `readyForCutover:true / issues:[]`；原快照7条记录都存在、owner未变、3条既存普通任务payload完全未改，联系人非生命周期资料保留。QA读取Naoki私有contact为NOT_FOUND。两条initialize receipt分属本人，没使用直接SQL补goal/version。
- `2c5e8ada` 修复后续生命周期变化的读取权威：ready联系人从同owner/account、ready Connection读取阶段；不再由旧Contact.stage或legacy detail.status覆盖；普通legacy与pending仍保持原语义。真实存储→列表/详情回归先红后绿，26项及full typecheck通过。
- 线上真实点击“处理关系跟进”发现冒号ID重复编码，页面回执检查报“返回的关系不一致”。`5961cdde` 在页面边界解码一次，同时补详情API可选 lifecycleInitialization 字段给App显示。两个定向用例先红后绿，最终Web页面/列表/详情组合43项、生命周期真实PG/路由46项通过，无skip；full typecheck通过。
- 增量图分析：graphFromRecords/detailFor直接调用分别为readFocusedContactGraph/payloadFor，LOW；ContactDetail接口18个引用为HIGH，不被最终detect LOW覆盖；页面框架入口UNKNOWN，已源码核查Tasks与联系人两处链接及运行失败证据。索引仍陈旧，最终staged检查已逐提交执行。
- App `db0755a6` 只补列表/详情 pending 展示：三语“待设置关系”，不显示假目标/下一步，不放入正式阶段筛选，不提供未接通的初始化按钮，明确提示到Web设置；已确认的通信资格不撤销。103项联系人/详情/交互/契约回归及typecheck通过，无skip。它不是原生初始化表单，也不是当前Production原生运行验收；独立关系看板与ready记录旧编辑器的canonical操作对齐仍须在原生后续范围核验。
- 最终Web源码 `5961cdde`，Production `dpl_3av2kpWJE4NBbnTA2SdfFLagVJwX`，CLI inspect 为Ready并绑定正式域名；唯一部署 `https://orbit-bp568ot2e-liqys-projects-33c8ddec.vercel.app`。只部署已提交Web子树，App提交不影响此Web版本。
- 最终真实UI完成：Naoki从编码后的正式链接进入跟进详情，选择“转为进行中”、明确目标“测试：推进活动报名与匹配流程联调”，于 `2026-09-16T17:53:10.180Z` 完成上述task。Connection与Task均version2，task completed，receipt `6a29702c-49a9-4718-9096-178314f078da`。页面冷刷新显示没有当前跟进、历史已完成；联系人详情显示新目标/进行中，列表“待联系0／在推进1”。没有用同阶段结果掩盖Contact旧stage问题。
- 最终只读复核：QA仍active/version1及其原目标，Naoki active/version2及新目标；两actor preflight均0 issues，原7条记录的owner/非生命周期资料、3条原普通任务完全保持；跨owner初始化读取NOT_FOUND。整个初始化与跟进验收只经正常UI/API写入，没有直接SQL补状态或虚构自动任务。
- 最后从正式 `/app/tasks` 冷开总览，Naoki仍有原普通待办“核对活动场地与设备（云端演示）”，人脉当前跟进0／历史1，历史展示上述测试任务“已完成／进行中”、原到期时间及正确联系人链接；关系任务未混入普通待办完成语义。

**本轮结论：** 结合下方已有报名→模型画像→云端worker→发布→签到→双方交换、AI四域、普通待办/日程和提醒证据，Web＋Neon＋云端worker目标主流程已闭环。本轮新增模型费用0；此前授权验收账户余额差额仍以CNY0.11截点为准。原生初始化入口/操作对齐、兼容构建及同Production双向回读独立开放；真实对外上线前数据清理与凭据/恢复演练不在此次测试闭环内。

## 历史收尾：现场交换已验，初始化设计当时尚未确认

本节为初始化批准前的历史事实，以顶部新结论为准。没有清空、重 seed 或改期已有活动；没有外发邮件、推送或真实消息。原生 App 本轮不在验收范围。

- 为验证现场门禁后的正常交换，新建独立纯测试活动 `event_demo_onsite_20260916` / `DEMO20260916QA`，主办方 Naoki，开始 `2026-09-16T15:10Z`、结束16:10Z。空活动初始化带 dry-run、精确计划 hash、事务和“已存在则拒绝”保护；没有手工写报名、匹配结果或交换同意。10月18日原活动保持不变。
- QA `user_mu442tb2_nuu75f` 和 Naoki `user_mu3pgfat_cs02v7` 分别经正常报名 UI 提交需求/供给并真实生成画像。主办方配置后，generation `event-operations-generation:e754631956e085aa9afa61918254c060` 由云端 worker `event-operations:vercel:b0526a0b-f04d-483a-b613-d53c74c96fe5` 完成5/5任务，均一次成功（4个模型任务、1个确定性 reducer），完成14:59:51.738Z。
- 主办方15:00:15.487Z正常发布 `event-operations-publication:8fb6a6800a8b2449d5a81c92133423bd`，head revision1。双方实际读到推荐、座位和两轮信息，分别15:00:14Z、15:01:38Z签到。活动开始前交换禁用，15:10Z后正常开放。
- QA请求、Naoki同意，request `event-contact-request:c2922164bda8c40f12d29cc01fab` 于15:10:57.131Z accepted/revision2。云端持久化双方各自的 Contact、Connection、consent Evidence，浏览器双方回读名称、机构、供需、来源和交换时间；不是把手工联系人冒充交换结果。QA私有contact尾缀 `3f9cf3512ce3470e83422000cdf8`，Naoki侧 `8d1d9c63b18c1ef7ecf3ff114a2e`；QA直达Naoki侧详情得到无可用详情，不返回另一方记录。
- **HIGH，未通过：交换写入仍使用 legacy_projection。** `onsite-operations-repository.ts` 的 `contactFor/connectionFor` 固定写 active，却未写 lifecycle version / activeGoal。纯只读生产 preflight 对两个 actor 均返回 `readyForCutover:false`、`MISSING_GOAL`、Connection及Contact各一个 `MISSING_VERSION`，relationshipTasks0。普通待办不应被当成关系任务；不能只为计数变1而创建任务。
- 已批准规范不允许臆造 activeGoal、日期或任务；目前没有已批准的“同意交换后初始阶段”规则。已提出最小选择：双方各自明确关系下一步，再走正式生命周期写入；决定前保留真实缺口，不把交换同意等同于已确认合作目标，不直接修补两条记录掩盖源头问题。
- Web修复：`b380cb66` 恢复聊天态持续输入框；`5815aeca` 以 raw subject 读取本人 canonical 报名，私有旧活动仍用 canonical account，按正式 Event Core身份去重；其他provider记录ID不冒充 canonical ID。联系人供需仅标为“对方希望获得／对方能提供”，不再把对方需求说成自己的能力。
- `5815aeca` Production `dpl_4rBRQ9g1Wm9u84VMoR8z7Kd4iMJn` Ready并绑定正式域名后，QA浏览器工作台回读2活动/1人脉，联系人实际显示正确供需标签，会话重开历史仍在且有继续输入框。后续发现活动旅程把报名直接等同“等待匹配发布”，`dc1037af`改为仅陈述“已报名／查看匹配进度”，25/25回归通过；不虚构尚未读取的发布状态。
- **P0真实失败证据：** QA输入“只查询我自己的联系人 Naoki Sato，告诉我他的机构、职务和信息来源。不要创建任务或发送消息。”，任务后处理误判否定句为明确创建授权，于 `2026-09-16T16:03:47.635Z` 写入 `task:7c310d9af512a7fe681dc3cc`，title“或发送消息”、source ai_confirmed。只读DB核实QA任务由1变2，页面及历史均显示创建。没有把这次结果计为联系人AI验收通过；保留意外测试记录作为证据，不删除掩盖。修复与复验另记下文。
- **P0源码修复 `c3039664`：** runtime与task后处理共用完整原文授权判断，明确祈使命令+非空标题才允许直接创建；否定/只读/引用/假设/疑问/空标题不调用create或suggest，错误模型任务提议也从后续确认输入移除。模型不匹配的标题及其日期不覆盖用户原始任务，原时间词保留。明确个人行动仍是建议，笔记来源版本验证和accept幂等保留。主组合129/129、真实POST后处理注入测试8/8、full typecheck通过，子代理lint通过；测试没有调用模型或Production DB。impact现有调用LOW，新函数UNKNOWN已用源码确认runtime与后处理两个调用点；all/staged detect LOW/0不作为陈旧索引的完整安全结论。
- `c3039664` Production `dpl_24kewsbeuotrarQtn19FSptCdrVR` Ready并绑定正式域名，唯一部署 `orbit-ekrskwn38-liqys-projects-33c8ddec.vercel.app`。只部署精确已提交Web子树，未带入根目录AGENTS/CLAUDE的用户改动。浏览器再次确认2场活动、1位联系人，未来活动显示“已报名／查看匹配进度”，现场测试活动按真实结束时间转为“已结束”；不再推断匹配尚未发布。
- 只读新请求 `request:34559a58-b8d3-4f3b-9893-3967facb4006` 在16:21:36.929Z完成：QA查山本直樹（Naoki测试账号），实际模型选择contacts.recommend，Neon返回匹配的联系人/机构/职务及accepted-event evidence；没有taskInteraction，也没有任务或建议写入。连续第二轮 `request:84be5f8a-0507-4f0e-8e33-90de154ac606` 暴露另一个读取错误：guard把“当前状态”和否定句中的“消息”拼成实时新闻，未调用模型/工具，页面无可核查结果；不是任务不存在。`711e2ffd` 让realtime只读分类复用排除被禁止动作的文本，写入授权仍用完整原文。三条业务查询RED→GREEN，三条真实外部实时查询仍保持本地限制；模型边界/写授权/POST组合147/147、full typecheck通过。
- 回归：composer相关71/71；最终journey/身份/页面组合73/73；供需文案5/5，均无skip，typecheck、lint通过。`TwoWayCard` impact LOW，调用链为组件→联系人详情；活动旅程 all/staged detect-changes 仍为 **CRITICAL / 19流程**，没有被局部LOW覆盖。索引落后，图结果不代表全仓完整安全证明。

本轮 Web 主流程已有真实证据，但不能宣称“完整通过”：交换→canonical生命周期的接入规则及实现仍开放。该缺口不依赖 Xcode，也不是模型预算不足。

`711e2ffd` / `dpl_4MkiYsKxC1VcNqgbwkepp3PrLFAQ` 发布Ready后，新请求“返回标题和当前状态。不要创建任务或发送消息。”在浏览器实际返回“整理云端联调体验会的合作需求清单”、`status: open`，显示只读取tasks，未读取notes/followups/schedule。没有用本地mock响应替代此次模型＋Neon回读。

连续查询回执 `request:8577dad3-466d-444b-98e5-f621a302ccc7`、`request:8213036a-4fd2-4642-9e51-95c122e79284` 均completed、无taskInteraction；16:31:16Z只读审计tasks仍2、taskSuggestions仍0，两任务updatedAt未变化。刷新重开却发现首轮答案缺失：provider重复固定assistant messageId，session store按session+messageId写入导致后答覆盖前答；route还优先保存规划开场白而不是最终assistantMessage。`e880d29f`把reliable回复ID规范成`assistant:<requestId>`并在响应/持久化两侧一致，保存最终答案，重试沿用同ID。真实POST＋内存正式存储两轮/重试测试先红后绿，历史/reliable/UI组合62/62、full typecheck通过。API入口impact UNKNOWN（框架调用无图边），已源码确认Web/App共同消费；all/staged LOW/0不冒充完整图安全。修复不删除旧验收记录或伪造丢失内容。

最终部署 `e880d29f` / `dpl_BuydQANPYrqdrWLuuxPt3qmouCmU` Ready，正式入口仍为 `https://orbit-puce-kappa.vercel.app`，唯一部署 `orbit-exobqnnbk-liqys-projects-33c8ddec.vercel.app`。原生消费者共享同一API，字段形状未改变；本轮不把API自动化与Web浏览器结果当成原生验收。

最终线上复验：会话 `agent-session-mu4bvja6-kj6oub` 的请求 `request:979f9abc-4d7a-487b-af5a-1c1c31141724`、`request:a62b9b96-b695-4404-9ab3-50270fe6e5c6` 均completed，分别返回正确待办事实和交换所得联系人卡片。16:44:17Z只读确认session revision4、四条消息、两个不同的`assistant:request:...` ID；实际浏览器刷新后从历史重开，两问两答及联系人卡片均保留。任务仍2、建议仍0，两条任务更新时间与修复前相同，否定句没有造成新写入。额外验收标记曾干扰模型检索，最终业务查询不混入测试编号，仍使用新requestId，不靠旧请求重放冒充新验收。

预算结算截点 `2026-09-16T16:44:18.065Z`：DeepSeek余额CNY63.51，对比本轮CNY63.62基线，账户余额差额 **CNY0.11**，USD余额仍0；按分计且包含同账号并发用量，不是逐请求精确发票。未达到CNY5保守停线，更未动用充值/升级。本轮不再调用模型。

可执行的本轮Web修复、Production发布和目标链验收已完成；R1/R2/R3的Web/Neon/worker证据已齐。R5不标完整通过：唯一已确证的业务契约阻塞仍是上述双方交换后的canonical初始化规则，需确认本人目标/下一步的输入方式后才能改writer及相应Web/App契约；不能通过补假值结束。原生R4独立开放。

## 22:47 历史增量：Web／Neon／云端 worker 实际验收

用户已批准先验 Web＋Neon＋云端 worker，并追加本轮最高 **$1** 模型预算；原生验收单列，不再以旧累计账本缺失阻塞本轮。DeepSeek 余额基线为 `2026-09-16T14:18:20.991Z` CNY 63.62；14:44:27 的账户余额差额 CNY 0.04。余额精度为分，且包含同账号并发用量，不冒充逐请求精确账单；采用 CNY 5 的保守停线，未改变 provider 套餐或充值。

- 新账号 `user_mu442tb2_nuu75f` 于14:25:11Z正常报名 `event_demo_cloud_flow_20261018`，选择“业务运营者／把运营需求转成产品原型”，真实模型生成画像成功。刷新后原始答案与 rsvped/profile v1 持久化；AI 画像是派生预览，刷新不自动再次生成，不把此行为误报为原始报名丢失。
- 主办方显式保存画像截止14:27Z、报名截止14:28Z、签到开放14:28Z、结果开放14:29Z，推荐数1、每桌2、shard8、每任务最多2次。主活动仍为10月18日05:00–07:00Z，未直接改库改期。
- 主办方页面启动 generation `event-operations-generation:bc373a540fd9e4932b8d8425916c4c57`；两位真实报名主体为 Aiko Mori `user_mu3pjzb3_zkt96u` 与上述新账号。5/5 task 一次完成、0失败；4个模型任务＋1个确定性 reducer，均由 `event-operations:vercel:f2ef6519-8f02-4691-9367-a19169c86d8b` 执行，不是本机 worker。14:36:40.459Z完成。
- 14:37:28.403Z经主办方按钮原子发布 `event-operations-publication:8a14b8735027ec4558261b533a36b48f`，publication head revision1。新账号浏览器实际读到 Aiko 推荐、85匹配分、R1-T1-S2座位、两轮话题和破冰问题；离开再进入仍可读。14:38:46Z正常自助签到，页面显示已签到；outbox累计81条completed。
- 四域真实 iOrbit 查询均完成：Note标题／正文／contact_005；主账号普通待办标题与open；新跟进标题、open、2026-10-01T07:00Z及用户确认来源；个人日程标题、2026-09-18T07:00–07:30Z。新账号自己的任务也返回正确标题/open；查询主账号的上述跟进明确“没有找到匹配记录”，没有泄露内容。这里是实际模型规划＋授权工具读取＋事实回显，不仅是直接工具单测。
- 发现并修复 Web 30秒等待边界：`7ac870ed5` 改为有界60秒，并准确说明浏览器停止等待不等于服务器停止；reliable v2重查沿用requestId。目标59/59、typecheck、lint通过。Production `dpl_AQWCw7xTUFmsFR1JwfNdQsEKaTFN` Ready，正式域名已绑定；唯一域名 `orbit-ldxfd6m28-liqys-projects-33c8ddec.vercel.app`。修复后跟进请求 `request:aaa36314-056a-4db7-ac5a-4d1b5c686ac5` 的Neon reserve→completed为34.651秒，UI正常收到结果。旧30秒超时请求其实稍后completed，不能把旧提示当服务器取消证据。
- 当前仍有两个新发现的Web修复在进行：聊天态没有composer；已报名新账号的工作台活动旅程错误为空。未把尚未发布的修复记作线上通过。
- **现场名片交换尚未验正例**：推荐卡正确禁用并显示“活动开始后可申请交换联系”。当前没有正常主办方改期UI/API；Event Core backfill虽技术上可写已有日期，但不联动配置／已发布快照、无完整改期审计，不可拿它绕过门禁。没有修改数据库日期、伪造同意或将手工联系人冒充交换结果。此项不依赖Xcode，但需安全的测试档期／正式改期写入路径。

本节覆盖下方早期“模型预算待批、未报名、未生成”的历史状态。R3云端生成→发布→参与者回读已通过；R1/R2的Web与云端证据已补齐；R5仍不可整体关闭，原生仍单列。

## 版本与发布

| SHA | 内容 |
| --- | --- |
| `c9a511001` | 生命周期共享契约、actor-scoped HTTP、Web/App 完成+下一步消费者及事务证据 |
| `7beac4304` | App 路由清单、请求刷新断言、确定性时区夹具 |
| `560247580` | event-operations durable wake、有限云端 drain、maintenance 重派 |
| `1f1779766` | canonical 纯 in_app 提醒维护、真实数据库并发/恢复测试、最小样本 verifier |
| `15c069ba4` | GET maintenance 由独立 Cron secret 鉴权；相邻和普通业务 API 仍要求登录 |
| `0ed135761` | 新关系任务 accountId/evidence_ids 根因修复、AI 数据读取回归、有快照的单记录修补工具 |

`15c069ba4` 的 Production 部署 `dpl_BG8bSJrJRjocA2nzHYbNAXeJqQDU` 已 Ready 并绑定正式域名；初始云端 Cron/活动队列证据在此版本取得。最终 `0ed135761` 部署 `dpl_ykbCoNr1ZDee4LuyesAQ7XFBqJe6` 已构建完成并绑定正式域名，唯一部署域名为 `orbit-5okhk45ma-liqys-projects-33c8ddec.vercel.app`。每次仅从精确已提交的 Web 子树发布；用户已有 AGENTS.md/CLAUDE.md 改动未提交或带入。

## R1：生命周期

- HTTP：`GET/POST /api/connections/:id/lifecycle` 和 `GET /api/relationship-tasks`；共享严格 Schema。四个 outcome、版本冲突、exact idempotency retry、联系人与任务归属均在服务器验证。
- Web `/app/tasks/relationship/:id`；App `/tasks/relationship/:id` 使用同一服务。失败保留草稿；收到有效回执才刷新，普通待办语义不变。
- Production 主账号完成 `connection_0029` 的 `task_015`，选择明确下一步，得到 `relationship-task:30ee1563-4911-4cde-9968-d9b0e4793777`。旧任务 completed/version2；连接 version2；新任务 open/version1。刷新和任务列表 66 当前/15 历史通过，另一主办方读取该关系为 404。
- 发现并修复后续新任务只有 payload.evidenceIds、缺 payload.accountId 和列 evidence_ids，造成页面可见、AI followups.query 为空。测试先红后绿；写入源头同时补字段，不放宽读取侧的 actor 校验。
- 只修补上述本轮新任务一条元数据：`scripts/repair-lifecycle-task-metadata.mjs` 默认 dry-run，显式 actor/task，验证真实同 owner/source 证据和连接，事务内先保存 0600 before-image，再改两个字段；状态、版本、业务时间不变。
- 私有快照：`/var/folders/v6/bnz20zqn569_7p224c5vhbw00000gn/T/orbit-lifecycle-metadata-before-kultqy/record.json`（本机临时目录，不是长久备份）。修补后生产库 followups.query 命中 title/status/evidenceSummary；新账号同 ID 查询为 0。
- **未完成**：当前原生 App 对 Production 这条记录的双向回读，不能用历史另一环境的 iOS 报告代替。

## R2：真实笔记及提醒链

- Note `note:b6f99b3daf07cd5013f3ad28`，关联主账号 `contact_005`，可由 notes.query 读取。它是独立 Note，不是联系人备注字段，不能把联系人备注“空”误当 Note 丢失；本轮未新增 Web Note 页面。
- ReminderPlan `reminder:895be31ce05a2918e10a9feb`，只含 `in_app`，目标 `task:10ac0c81e45a15698adcda9a`，准确 deepLink。
- 样本脚本只创建 Note/Plan，没有手工 dispatch 或伪造通知。Vercel maintenance 于 `2026-09-16T13:26:38.743Z` 自动写入 delivered Plan 和唯一 `notification-delivery:82d357aa6c13ccf83035402d`。
- Production 收件箱 40→41，真实链接打开上述任务，标题/备注正确；`2026-09-16T13:31:33.016Z` 已读 interaction 持久化。Web badge 统计待处理提醒而非纯未读，read 不删除提醒；ignored 才移出列表，不把 41 保持不变误判为已读丢失。
- 四域查询服务在 Production 只读事务验证：notes/task/schedule 原记录均 total1，followup 元数据修复后 total1，跟进包含真实用户确认来源；独立新账号查询同四个 ID 全部 total0。没有用模型生成推测数据；该结果仅代表工具数据层，不表示真实模型四域总结通过。最终部署重开关系处理页，当前显示新跟进，历史显示已完成旧跟进。
- 云端任务有限量、deadline、actor advisory lock、单连接事务；稳定 Delivery ID；中途失败回滚并由下次处理恢复；已持久化 Delivery 的重试不会重复新增。混合/push channel 不在此次新增 worker 的外发范围。
- 自动延迟 heartbeat 于 `2026-09-16T13:37:03.405Z` 执行后，Delivery count 仍为1、updatedAt 仍是初次投递时间；read 和读取时间均未变化，无第二次手动触发。模型回答与原生点击仍待对应依赖。

## R3：不依赖本机的云端活动作业

- 注册 activate/cancel、签到、人脉请求等先提交 durable outbox，再发送小型 workspace wake；generation/retry 同样持久化后唤醒。一次云端 drain 有限，仍有工作才 continuation；失败由队列重试；现有 lease/fencing 保留。
- maintenance 负责丢失 wake 的兜底重派，worker 完成后启动/确认 heartbeat。没有新增第二套队列平台。
- 实际发现 Cron GET 被全局登录 proxy 401 截断。仅豁免精确 GET maintenance 进入自己的恒定时序 CRON_SECRET 校验；错误/缺失密钥仍 401，普通/相邻 API 不豁免。
- 控制台 Run 后 maintenance 200，Vercel 私有 `POST /api/queues/event-operations` 多次 200；Neon 的 79 条 pending outbox 全部 completed。generation 表为空，未隐式触发模型或外部投递。
- heartbeat 初始 seq0 / dispatched_seq0，首次 nextDue `2026-09-16T13:36:58.277Z`，周期600秒。后续无需手工触发于13:37:03.405Z自动执行：seq1 / dispatched_seq1，nextDue13:47:03.405Z；7 ok / 1 skipped（mail_unconfigured）/ 0 failed。canonical reminder claimed0、活动 outbox examined0，验证已完成工作未被重复投递；回收 deleted0、外部通知 sent0。
- **未完成**：主办方真实 generation→发布→参与者读到新版本，依赖模型预算和 R5 新报名样本。

## R4 / R5：原生与新用户

- 本机 Xcode26.1.1 / Swift6.2.1 / iOSSDK26.1；Expo57.0.8、RN0.86.0、expo-modules-jsi57.0.4。真实编译出现 weak let 等 16 错误/14 依赖文件；只有 UITestRunner，无可运行 Orbit bundle。
- 待选择并配置 Xcode26.4+ side-by-side 或 EAS 模拟器云构建。未擅自改系统 Xcode、依赖版本、node_modules 或发布实体 App。
- 新合成账号 `qa-cloud-flow-20260917@orbit.example.test` / `user_mu442tb2_nuu75f`（17 是稳定验收标签，不代表执行日期）；注册、登录、100% 资料并刷新通过。
- 任务 `task:4d52f8933ae91e7df909b870` 创建→完成→恢复→重开，DB open；另一主办方直达显示无权访问。日程 `personal:478f7ec7f84e27904ae68039` 创建刷新通过。
- 未来活动 `event_demo_cloud_flow_20261018` 报名页自动生成/预取 AI 问题，发现后停止，未提交报名。此前把该阶段当成无模型操作的判断不成立；可能已有模型费用，金额未知。没有继续调用付费生成或假造报名成功。
- 旧累计 $5 预算私有账本在不可用外部卷；已询问本轮增量最高 $1，尚未收到答复。该依赖只阻塞明确模型动作，不阻塞已完成的 Web/DB/worker 工作。
- Google provider 未配置且登录 UI 不展示入口，本轮不适用。

## 验证及限制

- App 全量 `TZ=Asia/Tokyo`：2869/2869、无 skip；初次失败涉及路由清单、刷新次数、宿主时区，修复后失败组合 418/418。日志 `/tmp/orbit-r1-app-full-tokyo-20260917.log`。
- R1 初始 Web HTTP/PG/列表28/28；后续真实隔离 PostgreSQL 生命周期及读取33/33，新增 AI owner/evidence 回归包含异 actor 零结果。
- R3 队列/worker 目标19/19；隔离 PG outbox/fencing/concurrency/heartbeat 20/20。
- R2 unit/API/verifier25 + PG12 + wiring1 =38；并发、rollback、连接中断恢复在专用本机 `orbit_reminder_test` 执行。
- Cron proxy/secret/heartbeat 18/18。曾发现旧 heartbeat 测试自动加载远程 env，创建随机空 schema 后因 pooled search_path 失败；finally 清理，随后确认远程无 maintenance_% 残余 schema。测试已改为必须显式 localhost 专用 DB URL，重跑全部通过；没有业务记录写入。
- 最终 Web typecheck 通过，App typecheck 已通过；Vercel 实际构建另外检查 Node22 产物。
- GitNexus：repo/worktree `/Users/li/work/orbit`；索引落后并存在损坏 symbol。生命周期 impact CRITICAL/partial；缩至一层找到 service-factory、另一条残缺调用，源码复核 api-runtime。all/staged detect-changes 已跑，但零流程/LOW 不覆盖原 CRITICAL，不宣称完整图分析干净。

关闭条件仍是五项真正串联、同 Production 两端原生/浏览器实操。当前所有未完成项绑定上文具体依赖，绝不要求恢复不存在的历史数据库。

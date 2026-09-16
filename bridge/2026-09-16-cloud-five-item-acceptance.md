# BR-026 — 五项云端闭环执行与精确剩余验收

- 更新：2026-09-16；总状态 `consumer_ready`，整体未关闭。
- 授权：用户“这五项闭环”，此前允许 Vercel Production、合成数据作测试事实源、luna/max 并行和及时 commit；没有清空数据库或对外消息授权。
- Web：已部署真实 HTTP、关系任务消费者、云端活动队列和站内提醒 maintenance。App：消费者已提交、自动化通过，当前原生运行时待工具链。
- 数据：Neon `workspace:orbit-demo-fixtures`，Web/API 为唯一写入边界，App 经同一 Production HTTPS API。
- 入口：https://orbit-puce-kappa.vercel.app；待办、笔记、提醒与账户详情不写任何密钥。

## 22:47 增量：Web／Neon／云端 worker 实际验收

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

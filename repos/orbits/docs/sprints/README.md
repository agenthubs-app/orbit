# Orbit Web Sprint 管理入口

**运行状态：ACTIVE（2026-09-28，用户要求 Web 端按 App 端同样的 Sprint 方法开发）。** 本目录是文档驱动的 Sprint 规程，方法与 App 端 [`repos/orbit-app/docs/sprints/`](../../../orbit-app/docs/sprints/README.md) 相同：每个 Sprint 一份 Planner、一次 Generator，不设 Evaluator，验证取最小必要；实现收口后提交、合并回 `chat-agent` 才算 completed。只领取前置条件与批准齐全的 Sprint。

## 先读哪里

1. [RULES.md](RULES.md)：执行规则（分档验证、提交与合并、证据、预算）。
2. [REQUIREMENTS.md](REQUIREMENTS.md)：需求清单 RW-01～RW-12（大目标 1：iOrbit 改版与计划），RV-01～RV-05（大目标 2：上线前验收），RH-01～RH-05（大目标 3：首页不再空），RN-01～RN-13（大目标 4：人脉真分析）。
3. 对应 Sprint 的 `GOAL.md`（易读目标）和 `PLANNER.md`（唯一契约）。模板在 [templates/](templates/)。

## 用户决定

| 编号 | 问题 | 决定（2026-09-28） | 影响的 Sprint |
| --- | --- | --- | --- |
| D1 | 第 3 步「生成计划」要到 W0008 才有，示例模式先上线会让所有用户卡在示例里 | 示例模式和引导页先开发、先合入，但用开关关闭；W0008 上线时一起打开 | W0004、W0005、W0006、W0008 |
| D2 | 老用户（有联系人、有目标、还没有计划）按规则会被切回示例 | 已有 ≥3 位已确认联系人的老用户视为已完成第 1、2 步，只提示去做第 3 步，不切回示例 | W0004、W0006 |
| D3 | 计划生成要调用付费 AI，需要预算 | **计划部分先不接 AI，只做界面，用 mock 数据显示**；生成中 → 已完成的过渡要做出来 | W0008 |
| D5 | 名片行业在哪一步由 AI 补、计费怎么算 | 放进现有名片识别调用（文本整理步骤）一起输出，审阅页可改；第二轮按公司职位的匹配在批次确认后跑；两处都**沿用名片识别现有的计费方式，不另设累计上限**（每次真实调用在 REPORT 记录次数与 token） | W0013、W0010 |
| D6 | 社群活动怎么建模（现有活动模型强制开始／结束时间，报名到开始时间即关闭） | **不做成活动**：做成活动页置顶的「社群卡片」，iOrbit 推荐与引导第 4 步第一位；「我已加入」记在本人的社群加入记录里，「已报名活动」栏显示「已加入社群」；不改活动核心模型（取代原 Q18A） | W0003、W0006 |
| D7 | onboarding 设目标页的 16 个方向 chip 是否保留 | **去掉**：onboarding 也换成资料页同款「输入框 + 10 条示例句」编辑器，全站只有一种设目标方式；chip 拼进目标文字的旧格式退役，但解析仍兼容已存的旧文字 | W0002 |
| D4 | 社群二维码／微信号／群介绍素材 | 暂时占位 | W0003 |
| D8 | 上线前验收在哪做 | 本地先验收修问题，最后在 Preview 复验；**注意线上流量**（2026-09-28） | W0016～W0020 |
| D9 | 验收用的账号与数据 | 本地库建专用测试账号、脚本造数据，不碰用户账号；真实名片用 `docs/designs/*_meishi.heic`，允许真实识别调用（按 D5 记录） | W0016、W0018 |
| D10 | 验收结果怎么交付 | 逐场景截图，修完交一份验收报告页面，用户抽查 | W0018 |
| D11 | 验收中发现的问题 | 小问题在验收 Sprint 内直接修，较大问题单开 Sprint | W0018 |
| D12 | W0017 发现的用户读取流量（1000 人约 2.08 GB／月、活动目录全量读取） | 排进后续 Sprint：新开 W0021，放在 W0018 之前（2026-09-29） | W0021、W0018 |
| D13 | W0022 的 W22-1～W22-4 | 按 revision 1 推荐默认；W22-2（排序运行时白名单）拆为 W0025，W22-3 的推荐理由验收数据拆为 W0026，不改分词（2026-09-29） | W0022、W0025、W0026 |
| D14 | W23-1：到期计划上关联联系人怎么处理 | 只记「需求↔联系人」和进展记录，不生成「约 TA」；下一份计划带入已关联需求并在当周生成「约 TA」；确认接口返回与三处确认组件跟着改（2026-09-29） | W0023 |
| D15 | W24-1：活动详情页同类身份问题 | 另开 Sprint（W0027，H，含访问控制回归）（2026-09-29） | W0024、W0027 |
| D16 | W0022～W0027 执行顺序 | W0022 → W0025 → W0026 → W0024 → W0023 → W0027 → W0019（2026-09-29） | W0019、W0022～W0027 |
| D17 | W23-2：重新分析（reanalysis）是否也为已关联需求在新版本当周生成「约 TA」 | 也生成：与制定下一份计划同一规则（两者共用 `createVersionWithOutcome`）；已建立联系或已完成的不再生成（2026-09-29） | W0023 |
| D18 | W0024 SC-03 返回字节超上限（按假设约 311–383 MB/月，上限 30 MB） | 先合并 W0024 修正；另开 W0028 裁剪本人报名读取返回列（只要 eventId／status），覆盖活动页与 W0027 的详情页，W0028 必须在 W0019 前完成；执行顺序改为 W0023 → W0027 → W0028 → W0019（2026-09-29） | W0024、W0027、W0028、W0019 |
| D19 | W0028 开放问题 W28-1～3 | W28-1：详情页报名者名单瘦身另开 W0029（W0019 前），W0028 只实测名单；W28-2：其他整行消费者（活动归属、计划对账、journeys、目标推荐）不切，登记候选；W28-3：活动页＋详情页本人报名读取合计 ≤30 MB/月，按改后绝对字节（2026-09-29） | W0028、W0029 |
| D20 | W28-4、W29-1～3 | W28-4／W29-3：精简读取保持旧失败语义（坏数据照旧抛错，页面行为不变）；W29-1：名单＋匿名预览合计 ≤200 MB/月，用户路径总额按实测重算，超过 1.0 GB 时可放宽，至多 1.2 GB；W29-2：「谁会来」预览纳入 W0029（2026-09-29） | W0028、W0029、W0019 |
| D21 | W0023 交接：首页「本周推进」前 3 件是否优先显示新生成的「约 TA」 | 先不改，登记为后续候选（2026-09-29） | W0023 |
| D22 | W0027 SC-04 账号解析读取超上限（约 118–119 MB/月，上限 60 MB） | 先合并 W0027；另开 W0030 瘦身账号会话图读取返回列（直接调用 23 个入口、依赖注入 2 处、经 `resolveAuthenticatedApiActor` 间接 143 个接口文件；全站受益），发布前完成；执行顺序改为 W0028 → W0030 → W0029 → W0019，W0029 用 W0030 实测值重算总账（2026-09-29） | W0027、W0029、W0030、W0019 |
| D23 | W30-1～4 | 全部按推荐：W30-1 轻量读取写在账号 provider，不改共享存储契约；W30-2 新方法可选，缺失时退回完整图；W30-3 坏数据失败语义与旧读取完全一致（同 D20）；W30-4 全站受益估算按每人每天口径、轮询按实测端点频次，仅供参考不作通过条件（2026-09-29） | W0030 |
| D24 | W0030 观察：收件箱轮询每 15 秒调 `/api/account/me` 3–4 次，账号会话服务读完整图（约 1,978 B／次），估算约 9.5 GB／月 | 发布前另开 W0031：轮询每周期只确认一次身份（或复用页面已有身份），账号会话服务只读所需字段；页面内容不变，先按生产构建实测真实频次；排在 W0029 之后、W0019 之前（2026-09-29） | W0031、W0019 |
| D25 | W31-1～5 | W31-1 选 A：带世代号的共享身份确认（收件箱每 15 秒最多 1 次）＋写操作前独立屏障；W31-2 会话服务精简读取为可选新方法，完整图不动；W31-3 月上限 ≤2.5 GB（跨实例不去重口径，十进制），单独记账不并入 1.2 GB；W31-4 频次沿用 W30-4，另加每人每天打开收件箱 2 次、页面加载 10 次；W31-5 轮询端点自身的账号解析不做，登记候选（2026-09-29） | W0031、W0019 |
| D26 | W0029 偏差 1：「谁会来」匿名预览卡片当前没有挂载 | 先不恢复，登记为后续候选（2026-09-29） | W0029 |
| D27 | W0029 预算重算：用户路径总账实测 1,106.83 MB | 在 1.0～1.2 GB 之间，按 D20 放宽到 ≤1.2 GB，登记给 W0019（2026-09-29） | W0019 |
| D28 | W0031 观察 1：每个登录请求的 `auth()` jwt 回调调 `isPasswordSessionCurrent`，整行读 `auth_users`（约 850 B，平均每请求 1.6 次），估算每月数 GB | 发布前另开 W0032：先按生产构建实测，再让会话有效性检查只读判定所需字段（或同一请求只读一次），密码修改后旧会话立即失效的安全行为不变；排在 W0019 前（2026-09-29） | W0032、W0019 |
| D29 | W0031 观察 2：通知来源页 `/app/inbox/sources/[id]` 因 id 重复编码返回 404（既有问题） | 发布前修，另开 L 档 W0033（2026-09-29） | W0033、W0019 |
| D30 | W32-1～6 | W32-1 只做字段瘦身，不做同请求只检查一次；W32-2 不允许跨请求缓存；W32-3 单次字节 ≤改前 30% 为硬条件，月上限 ≤2.0 GB 单独记账，实测超出时放宽上限不扩大改动；W32-4 频次沿用 W0031 实测并按实测补齐；W32-5 读库失败即登出保持不变并补 Auth.js 集成测试；W32-6 密码重设提交时驱逐进行中的检查（2026-09-29） | W0032 |
| D31 | 登录会话有效性检查在多实例下的保证范围 | 所有实例都绝对保证：该检查不参加进程内去重（每次检查唯一 key），只过闸门与计量；取代 D30 的 W32-6 驱逐方案（2026-09-29） | W0032 |
| D32 | W0032 SC-04 月上限超 2.0 GB；各本账合计约 4.9–6.3 GB | W0032 本路径上限放宽到 ≤3.0 GB；先发布，W0019 加发布门：上线后每周看 Neon 出站，到 3.5 GB 启动下一轮瘦身（收件箱轮询间隔、轮询端点自身账号解析等）或升级套餐（2026-09-29）。周检追加（W0036，2026-10-01）：首页无目标兜底读取在无目标用户占比 100% 时用户路径总账约 1,758 MB，超 D39 的 1.6 GB；10%／20% 档为 1,219.54／1,279.39 MB；W0037 实测示例期社群读取 6.24 MB 后三档为 1,222.78／1,282.63／1,761.38 MB。W0040 把此前未入账的首页 SSR 复合读取（改后本机 58,808 B／次，真实期 1000 人×4 次×30 天 7,056.96 MB，示例期 244.24 MB）记入后，三档为 8,523.98／8,583.83／9,062.58 MB（去重口径 8,279.74／8,339.59／8,818.34 MB），超 1.6 GB 约 5 倍，由 W0041 收窄。W0041 后首页单次 2,378 B（本机 `user_verify_plan`），三档去重口径 1,508.14／1,567.99／2,046.74 MB（直接相加 1,522.64／1,582.49／2,061.24 MB）：10%／20% 档回到 1.6 GB 内，100% 档仍超（W0036 无目标兜底整目录读取，待 D39 服务端共享缓存）；人均每多 1 场已报名活动约 +86 MB／月，W41-3 待产品决定。W0042 后资料建议图单次与 workspace 总量无关（普通账号 31,079 B，重账号 7.3 MB）；按剩余额度可承受频次 f_max：10% 档 0.0985、20% 档 0.0343 次／人／天（重账号情景 ≤0.0005），全部登记为风险，真实频次待 W42-9 授权观测；后续候选 W42-7（Web 资料页 skip）→ W42-1 B → App 端缓存。周检时一并看无目标用户占比，接近 100% 档再瘦身（D39：服务端共享缓存活动目录） | W0032、W0019、W0036、W0037、W0040、W0041、W0042 |
| D33 | W19-1：生产运行时（Vercel Node 24.x；Neon PG 16.15，`und-x-icu` collversion 153.14）不在排序／联系人搜索白名单 | 发布前另开 H 档 W0034：在与生产同组合的环境跑差分测试后加入白名单；白名单不卡 Node patch；检查失败时服务端日志记下实际版本元组；不碰生产库（2026-09-29） | W0034、W0019 |
| D34 | W19-2～6 | 发布 W0019 合并后的 chat-agent HEAD；G3 公开目录已只读确认无「已发布未激活」活动；D32 的 3.5 GB 触发口径＝当月累计或按日均外推到月底任一 ≥3.5 GB；读不到精确版本时直接标阻塞；W0019 为文档＋全量对照，不另做 Codex 方案 review。生产缺计划／引导相关表，上线前迁移属写操作，届时单独授权；Vercel 连接器缺 team `liqys-projects-33c8ddec` 权限，用户择时重新授权（2026-09-29） | W0019、W0020 |
| D35 | W34-1～7 | W34-1 本机 Docker debian:bullseye 源码编译 PG 16.15＋ICU 67 复现（用户授权启动 Docker Desktop 与下载），postgres:16.9-bullseye 仅预检；W34-2 PG 只认主版本 16＋collversion 等（附 minor release notes 核查与拒绝日志兜底）；W34-3 Node 侧按 icu＋unicode＋默认 locale；W34-4 新增字符差异有条件接受——须证明不漏不重，联系人搜索分页路径绑定进游标，证明不了则联系人组合不入表／交用户；W34-5 不加 ICU 77；W34-6 官方 dist＋SHASUMS 下载（用户授权）；W34-7 上线后由 W0020 看日志确认（2026-09-29） | W0034、W0019、W0020 |
| D36 | 远端 `origin/chat-agent`（App 线 0104～0137）与本地 Web 线分叉；W0020 是否保留 | 选 B：先合并远端再上线（集成提交 `9cb9e55d`、`0b847368`、`8b6a1045`，全量新增失败 0）；生产迁移、开关、部署按用户授权执行；W0020 关闭，日志核对改在生产完成，流量由 D32 周检接续（2026-09-30～10-01） | W0019、W0020 |
| D37 | 三步引导做完首页仍空；引导第 4 步回不去 | 大目标 3「首页不再空」：引导改 3 步；今日要事吸收本周计划行动与补人脉（<10 人）；活动小模组（社群置顶 + 2 场推荐，有要事时缩成一行）；已报名栏只放报名；月历实心／空心两色点。「今天先不做」存浏览器本地；匹配不上时退回「近期活动」；除删第 4 步外不挂引导开关（2026-10-01，H-Q1～Q18 全按推荐） | W0035～W0039 |
| D38 | 方案起草发现的冲突 Q19～Q25 及 W35/W36/W37/W38/W39 待定项 | 全按推荐（2026-10-01）：「最多 3 条」只约束新加的计划行动与补人脉，原有来源与「还有 N 件」不变；示例期活动小模组固定展开（社群＋2 场真实活动，可真实点「我已加入」），示例期不加计划行动；月历点不单独可点，点日期选中后点时间线条目跳转；「下一场活动」取已报名最早，否则池内最早；无真实费用不显示费用行；「本周 N 场」东京周一至周日、N=0 不显示；今天先不做不补位；无计划仍出补人脉（不提阶段）；日文沿用现状回退英文；示例期月历画真实推荐；无目标用户活动池兜底近期活动，REPORT 实测并按 10%／20%／100% 估算，由 D32 周检盯；onboarding「第 4 步后」不改；W0035 只删第 4 步提醒行，社群行与「看看推荐」由 W0037 删；收口分两个时刻截图 | W0035～W0039 |
| D39 | W0036 新增读取（无目标兜底、示例期活动、社群）按最新基线 1,106.83 MB 重算，20% 档约 1,233 MB 超 D20 的 1.2 GB 上限 | 选 A：D20 上限放宽到 1.6 GB，照做兜底；上线后由 D32 周检盯，实测超限再瘦身（届时考虑服务端共享缓存活动目录）（2026-10-01） | W0036、W0037 |
| D40 | 首页每次打开读整个 workspace 的资料建议图（本机 9.59 MB，生产当前约 276 KB、随用户数平方增长）；W0040 待定项 W40-1～5 | 全按推荐（2026-10-01）：开 W0040 排在 W0039 之后，只做首页跳过资料「更新建议」（P0）；P1（建议图按 actor 收窄）不并入；资料编辑页、管理台不改；W0040 不以总账 ≤1.6 GB 作通过条件，超限登记 D32；后续默认 W0041＝首页服务端其余读取收窄（P2，修后仍约 58.8 KB／次、未入总账）、W0042＝P1，实测证明 P1 更贵才提前；上线后生产核对按 D32 周检另行授权；生产 `orbit_read_cost_daily_routes` 为空不在 W0040 处理 | W0040～W0042 |
| D41 | 人脉分析与全量人脉功能是空壳（调试英文当结论、强度无输入、计划生成是模板） | 大目标 4「人脉真分析」RN-01～RN-13：计划与人脉分析合并为共享快照；强度按站内记录规则推导、不手标、不读私信表；memo 单一写入 + 聚合时间线；管线改强度档；分析页 结构／机会／洞察 三标签；CSV／活动导入与去重；引导第 1 步满 3 张不可跳过、完成不收回；示例静态快照；双语；只做 Web、接口只加不改（2026-10-01，N-Q1～Q36 除用户修改外全按推荐） | W0043～W0055 |
| D42 | D3「计划不接 AI 用 mock」与 N-Q14 冲突 | **推翻 D3**：计划生成器接 DeepSeek（两阶段，产出共享快照）；老模板计划不自动重写，提示用户点击重新生成且不占月额度（2026-10-01） | W0048 |
| D43 | 新的每日 AI 调用上限是否管名片识别 | 不管：名片识别（含 RN-03 补全）仍按 D5 不设上限；每日上限只管 memo 提取、快照、计划、洞察；每次真实调用在 REPORT 记录次数与 token（2026-10-01） | W0045、W0046、W0048、W0051 |
| D44 | 大目标 4 各 PLANNER 待定项（C-1～C-6、W43～W55 共 70 余项） | **全部按推荐**（2026-10-02），清单见 [PENDING-2026-10-01-network.md](PENDING-2026-10-01-network.md)。要点：W0043 升 H；W0048 拆为 W0048a（快照、三层更新、配额）与 W0048b（计划接 DeepSeek）；AI 配额分两池——用户主动（手动重新分析 ≤3／日、计划生成与重生成）与后台自动（memo 提取、洞察、导入补全、快照自动重算，每人每日 60 次调用、≤20 人／批，超限顺延次日显示「明天更新」），共用 `ai_usage_ledger`；补全来源统一记在 W0045 的 `enrichment.fields`；强度规则初稿（半衰期 90 天、70／45 分档、60 天待唤醒、不显示分数）；存量已跳过第 1 步不打回、`completedAt` 为唯一闩锁；只支持 CSV／vCard；App 端逾期显示与本地强度登记为 App 线候选 | W0043～W0055 |
| D45 | 大目标 4 方案 review（[REVIEW-2026-10-02-network.md](REVIEW-2026-10-02-network.md)）R-1～R-17 与用户主动池总熔断 | R-1～R-17 按协调者裁决全部采纳（PLANNER 升 revision 3）；用户主动池每人每东京日 **10 次操作**（含手动重新分析 3 次），用满按钮置灰、提示「今天的次数已用完，明天可用」；配额按操作计次、成本按每次供应商 HTTP 子账聚合（2026-10-02） | W0043～W0055 |
| D46 | revision 3 编写中发现的冲突（App 副本校验、计划逐阶段调用量、读路径入队等） | 全按推荐（2026-10-02）：① 改 `shared/contract｜api-schema｜compute｜domain` 的 Web Sprint 在同一提交里执行 App 的机械同步脚本（`sync:contract` 等，只复制、不改 App 逻辑），两端测试同时保持绿色——这是「本轮只做 Web」唯一窄口子；② AI 计划生成时只细化前 2 个阶段，其余阶段到期前由后台维护任务补细（计入后台池），单份生成 HTTP 上限随之下调；③ 机会页兜底入队 `plan_match_jobs` 移到维护任务，读取路径 0 写入；④ `getCurrent()` 多读的字节如实计量，超预算再加只读瘦身读取；⑤ 跨端交接写新的 bridge 文件，不碰用户未提交的 `bridge/handoffs.md`；⑥ 收口名片样本不足 5 位时用 CSV 导入补足；⑦ PLANNER 行号以开工时 HEAD 为准按符号重定位 | W0045～W0055 |
| D47 | W0041 待定项 W41-1～6（首页服务端读取收窄） | 全按推荐（2026-10-02）：① 两级门槛，硬门槛 3,143 B／次（10% 档只算真实期，不过则 SC-01 fail），目标线 2,644 B（20% 档）只报差额；② 本人数据异常仍让首页失败、错误码不变，与本人无关的坏数据不再被读，作为已知差异登记；③ 已报名活动不加时间上限，是否只列近期另做产品决定；④ 旧活动「本人」筛选下推到 SQL，放共享读取层，只在配置好的 Postgres 读取注入专用查询；⑤ 资料两条读取不顺手收窄，超硬门槛时作第一后续选项；⑥ 客户端挂载后的读取不进门槛只报告，整页首开总账门禁放 W0042 之后。100% 档不算首页已超（W0036 无目标兜底读整目录），靠 D39 的服务端共享缓存活动目录另解 | W0041 |
| D48 | W0042 待定项 W42-1～11（资料建议图按本人收窄） | 用户授权协调者按推荐定（2026-10-02）：① 做图等价（A），「只取建议所需行」（B）留后续；② payload 投影，不取 `search_text`；③ 坏数据语义逐项等价，不顺手修「他人坏行让所有人 500」；④ 三轮按 id 列表读；⑤ 不加索引，EXPLAIN 只报告；⑥ 内存 store 保留原路径；⑦ Web 资料页、管理台本次不改；⑧ 不以总账 ≤1.6 GB 作通过条件，报 f_max；⑩ 间接共享规则保持等价，登记安全复核；⑪ W0042 排在 W0043 之前，不与 W0043～W0055 并行，后跑方按结构判据重跑并跑比对。**⑨（D32 周检时只读查 Vercel 请求计数与生产读取指标）需用户届时授权，未定** | W0042 |
| D49 | W0040～W0042 收尾三项合成 W0056（W41-3 已报名活动窗口、W42-3 他人坏行隔离、W42-10 建议图只读本人）及 W56-1～7 | 用户 2026-10-02 同意由协调者按成熟产品惯例定，不再列为待用户决定：W56-1 只 `/app/agent` 开窗口（东京当月 1 日起全部 + 之前最近 2 场，起点取服务端 now−24h，页面核对不足即回退全量），`/app/home/events` 保持全量；W56-2 报名状态行仍全量校验；W56-3 被省略的旧坏活动行不再读取，登记为已知差异；W56-4 只新增可选方法；W56-5 五个集合只取真属主为本人的行（同 `contactRecordOwnedByActor`，比 `belongsToActor` 更严）；W56-6 他人行不读，计数探针限频告警、日志不含个人数据；W56-7 双重编码的他人行不再进入本人图，登记为已知差异。生产读取计量开关（`ORBIT_PG_READ_METRICS`）不在内，需用户单独授权 | W0056 |

## 发布动作（需要单独授权）

- D1：W0008 completed 后，在目标环境设置 `ORBIT_GUIDE_DEMO=on`（示例模式与引导一起打开）。代码 Sprint 只验证开关两种状态；未在目标环境实际打开前，不能声称 D1 已落地。
- W0003／W0007／W0010 等含迁移的 Sprint：生产库执行迁移需要用户授权。
- W0017：部署前或随部署在生产执行 `scripts/migrate-web-runtime.ts`，建 `plan_maintenance_daily_runs`；不执行则把关放行（日志 `ungated: 1`），省不下流量。

## Sprint 登记表

编号 `W` + 四位，不复用、不重排。依赖是进入条件，不声称已满足。目标说明不等于完成声明；实际成果只看执行报告与下表状态。

| Sprint | 要实现的结果 | 需求 | 依赖／额外前置 | 状态 |
| --- | --- | --- | --- | --- |
| [W0001](W0001-iorbit-home-morning/GOAL.md) | 打开 iOrbit 先看到今天最该做的 1–3 件事，其余信息退到右栏和底部栏目 | RW-01 | 无；接续工作区里已写好的五个文件 | completed |
| [W0002](W0002-goal-editor/GOAL.md) | 在资料页和 onboarding 设目标时，点示例句填入再改，选「一个月内／3 个月内／一年内」 | RW-05（第 3 步部分除外） | 无 | completed |
| [W0003](W0003-community-event/GOAL.md) | 活动页最上面永远是「加入 iOrbit 社群」卡片，点「我已加入」后记为已加入；推荐理由只写真实匹配的目标词 | RW-06、RW-07（无计划时） | D4 可先占位 | completed |
| [W0004](W0004-demo-mode-iorbit/GOAL.md) | 新用户打开 iOrbit 看到示例人物的完整一天，写操作被拦下并引到引导 | RW-03（iOrbit 首页部分） | W0001；开关默认关（D1） | completed |
| [W0005](W0005-demo-mode-network/GOAL.md) | 新用户打开人脉页看到 30 位示例联系人和详情，扫名片仍是真实操作 | RW-03 | W0004 | completed |
| [W0006](W0006-start-guide/GOAL.md) | 新用户在 /app/start 按顺序完成名片、目标、计划、活动，中途离开回来能续做 | RW-04、RW-05 第 3 步部分 | W0002、W0003、W0004；开关默认关（D1） | completed |
| [W0007](W0007-plan-storage/GOAL.md) | 计划能按阶段、行动、人脉需求、信息、活动结构化保存和更新 | RW-09 | 无；本地测试库已核对（localhost），H 档 | completed |
| [W0008](W0008-plan-generation/GOAL.md) | 问一次固定问题，看到「生成中 → 已完成」的结构化计划并保存（先用 mock 数据，不接 AI） | RW-08（AI 部分延后） | W0006、W0007 | completed |
| [W0009](W0009-my-plan-page/GOAL.md) | 在「我的计划」里按周打勾，iOrbit 本周推进跟着更新；有计划时活动推荐理由改为对应阶段 | RW-10、RW-07（有计划时） | W0007、W0008 | completed |
| [W0010](W0010-network-need-matching/GOAL.md) | 扫进来的名片自动提示能填上计划里的哪类人，确认后本周多一条「约 TA」 | RW-11 | W0007、W0009、W0013 | completed |
| [W0011](W0011-card-review-in-today/GOAL.md) | 名片待确认出现在今日要事里，iOrbit 页不再有重复的浮动药丸 | RW-02 | W0001 | completed |
| [W0013](W0013-card-industry/GOAL.md) | 批量扫名片时 AI 顺便给出一级／二级行业，审阅页可改，确认后存进联系人 | RW-11（补行业部分） | 无 | completed |
| [W0012](W0012-long-term-tracking/GOAL.md) | 进展记录、每周一小结、重新分析与到期回顾 | RW-12 | W0008、W0009、W0010 | completed |
| [W0014](W0014-demo-mode-plan-chat/GOAL.md) | 引导期间打开「我的计划」和示例对话，看到示例人物的计划和一段示例问答 | RW-03（我的计划、示例对话部分） | W0004、W0008、W0009 | completed |
| [W0015](W0015-event-attribution/GOAL.md) | 活动当天或次日扫的名片，审阅时问「是在 X 活动认识的吗」，确认后记来源、活动标已参加 | RW-11（活动归属） | W0007、W0010 | completed |
| [W0016](W0016-verify-environment/GOAL.md) | 另起开示例开关的验收 server，建测试账号并造好各场景数据，名片照片裁成单张 | RV-01 | 大目标 1 全部 completed | completed |
| [W0017](W0017-traffic-guard/GOAL.md) | 3 个计划维护任务改为每天最多一次（持久、跨实例），名片匹配补跑空闲时只做轻查询；新增读取路径逐一测量并估算月流量 | RV-03 | 无 | completed |
| [W0018](W0018-scenario-acceptance/GOAL.md) | 逐场景真实页面验收（桌面＋手机），修小问题，交验收报告页面 | RV-02 | W0016、W0017、W0021 | completed |
| [W0019](W0019-release-checklist/GOAL.md) | 生产上线清单 + 大目标收口的本地全量对照 | RV-04 | W0018、W0022～W0034；须含 W0025 发布门（生产 Node/ICU 与 Neon PG/排序规则版本，含联系人搜索） | completed |
| [W0020](W0020-preview-verify/GOAL.md) | Preview 复验关键场景并测量 Neon 流量 | RV-04 | W0019；用户授权 Preview 部署、迁移、开关、测试数据 | closed（D36：已由 2026-09-30 生产上线取代，不再执行） |
| [W0021](W0021-read-traffic-trim/GOAL.md) | 计划／匹配／名片／活动归属读取瘦身，1000 人月出站 ≤1.0 GB，活动归属按时间窗口读取，页面不变 | RV-05 | W0017 | completed |
| [W0022](W0022-home-guide-entry/GOAL.md) | 老用户首页「帮我制定推进计划」改去引导第 3 步（`?step` 不绕过硬顺序）；有计划但第 4 步未完成时首页留提醒 | RW-04、RW-10 | W0018；W22-1～4 已定（D13） | completed |
| [W0023](W0023-expired-plan-match-week/GOAL.md) | 到期计划上关联联系人只记关联和进展记录、不生成「约 TA」；制定下一份计划时在新计划当周生成；确认接口与组件跟着改 | RW-11、RW-12 | W0026（同改种子脚本）、W0024（顺序）；W23-2 已定（D17） | completed |
| [W0024](W0024-events-registration-actor-id/GOAL.md) | 活动页 `/app/events` 按账号 id 读报名；查询次数不增加，返回字节增量实测且 ≤30 MB/月；目录读取失败时不读账号 | RV-02 | 无代码依赖；按顺序在 W0026 之后 | completed（SC-03 failed，按 D18 合并，流量由 W0028 解决） |
| [W0025](W0025-lifecycle-sort-runtime/GOAL.md) | 跟进排序运行时从单一组合改为经差分测试的白名单（加入本机组合），「先联系谁」恢复真实数据；首页跟进来源不可用时不下确定结论；给 W0019 写发布门 | RW-01、RV-02 | W0022（同改 iorbit-home.tsx）；本机 PG 测试库 | completed |
| [W0026](W0026-recommend-reason-fixture/GOAL.md) | 验收种子造出真实可匹配的活动，策略页两种推荐理由可在 3001 复验；不改分词算法 | RW-07、RV-02 | W0025（执行顺序） | completed |
| [W0027](W0027-event-detail-actor-id/GOAL.md) | 活动详情页 `/app/events/[id]` 按账号 id 判定已报名、名单、主办方与私密访问；含访问控制回归 | RV-02 | W0024（复用测试夹具） | completed（SC-04 流量 failed，按 D22 合并，由 W0030 解决） |
| [W0028](W0028-registration-status-read/GOAL.md) | 本人报名读取（legacy 投影与 canonical）只返回 eventId／status 等页面所需列，活动页与详情页本人报名读取合计 ≤30 MB/月；保持旧失败语义；页面行为不变 | RV-03、RV-05 | W0024、W0027（D18、D19、D20）；PLANNER 已按 W0027 合并结果刷新（revision 4） | completed |
| [W0029](W0029-attendee-roster-trim/GOAL.md) | 详情页报名者名单与「谁会来」匿名预览只读所需字段，合计 ≤200 MB/月；按实测重算用户路径总额（D20） | RV-03、RV-05 | W0027、W0028、W0030（D22 顺序）；PLANNER 已刷新（revision 3） | completed |
| [W0030](W0030-account-session-graph-trim/GOAL.md) | 账号会话图读取（`readAccountSessionGraph`／`resolveAuthenticatedApiActorFromSession`）只返回判定所需字段，22 个调用方行为不变；详情页账号解析单次字节与月流量实测回到上限内 | RV-03、RV-05 | W0027、W0028（D22 顺序）；W30-1～4 已定（D23） | completed |
| [W0031](W0031-inbox-identity-polling/GOAL.md) | 收件箱轮询与 `/api/account/me` 瘦身：每个轮询周期只确认一次身份，账号会话服务只返回页面所需字段；按生产构建实测频次并估算月流量 | RV-03、RV-05 | W0029（顺序）、W0030（D24）；W31-1～5 已定（D25） | completed |
| [W0032](W0032-session-revocation-read/GOAL.md) | 登录会话有效性检查（`isPasswordSessionCurrent`）读取瘦身：生产构建实测每请求读取与月流量，只读判定所需字段或同请求只读一次，安全行为不变 | RV-03、RV-05 | W0031（D28）；W32 已定（D30、D31） | completed |
| [W0034](W0034-runtime-allowlist-prod/GOAL.md) | 排序与联系人搜索运行时白名单覆盖生产组合（Node 24.x、PG 16.15／ICU collversion 153.14）：同组合差分测试、白名单不卡 Node patch、失败时记录实际元组 | RV-04 | W0019 只读核查（D33）；W34 已定（D35） | completed |
| [W0033](W0033-notification-source-404/GOAL.md) | 通知来源页 id 重复编码导致 404 的修复（L） | RV-02 | W0031（D29） | completed |
| [W0035](W0035-guide-three-steps/GOAL.md) | 引导只剩名片、目标、计划三步；第 4 步在引导页、首页提醒和测试里全部移除；步骤校验收窄到 1–3，存量 currentStep=4 兼容（H） | RH-01 | 无 | completed |
| [W0036](W0036-today-plan-actions/GOAL.md) | 今日要事吸收本周计划行动（勾掉／今天先不做）与补人脉提示，头条按首条要事拼接；抽出共享推荐活动池（H） | RH-02、RH-03（活动池） | W0035 | completed |
| [W0037](W0037-today-events-module/GOAL.md) | 今日要事里的活动小模组（社群置顶 + 2 场推荐，有要事时缩成一行）、已报名栏只放报名、示例首页同步（H：IOrbitHome CRITICAL、放宽示例期零读取并新增真实写入） | RH-03、RH-04（已报名栏） | W0036 | completed |
| [W0038](W0038-calendar-event-dots/GOAL.md) | 月历实心／空心两色圆点与图例，空日程行显示下一场活动（H：IOrbitHome CRITICAL） | RH-04（右栏） | W0036 | completed |
| [W0039](W0039-home-not-empty-closeout/GOAL.md) | 大目标 3 收口：全量对照基线，3001 走新用户与老用户两条路径截图（I） | RH-05 | W0035～W0038 | completed |
| [W0040](W0040-home-profile-read-trim/GOAL.md) | 首页不再加载资料「更新建议」图，单次数据库读取去掉整 workspace 五集合扫描；资料页建议行为不变；重算数据库月预算表（H） | RV-03、RV-05 | W0039；W40-1～5 已定（D40） | completed |
| [W0041](W0041-home-ssr-read-narrow/GOAL.md) | 首页服务端读取收窄：联系人改数据库计数、旧活动「本人」筛选下推 SQL、已报名活动按已发布范围读取；单次 58.8 KB→约 2.5 KB，首页各块显示不变（H） | RV-03、RV-05 | W0040；W41-1～6 已定（D47）；不与改 `contact-live-record-provider.ts` 的 W0045／W0046 并行 | completed |
| [W0042](W0042-profile-suggestion-read-scope/GOAL.md) | 资料「更新建议」图只读本人相关行：Postgres 专用读取器三轮按 id 读 + payload 投影，结果与旧过滤逐项等价；接口与 App 端不变（H） | RV-03、RV-05 | W0041；W42 已定（D48，⑨ 待授权不阻塞）；排在 W0043 之前，不与 W0043～W0055 并行 | completed |
| [W0043](W0043-network-stop-fake-copy/GOAL.md) | 人脉页不再出现调试英文与「来源暂时不可用」误报，空态说实话，文案双语（H：`contactsAnalysisToView` HIGH，D44） | RN-01 | 无 | completed |
| [W0044](W0044-followup-clock-root-fix/GOAL.md) | 跟进与提醒的到期按请求时刻计算，逾期显示「已逾期 N 天」（H） | RN-02 | 无 | ready |
| [W0045](W0045-contact-enrichment-seniority-region/GOAL.md) | 名片识别同一调用补角色层级与规范地区，审阅可改，带来源；老联系人回填脚本（H） | RN-03 | 无 | ready |
| [W0046](W0046-relationship-timeline-memo/GOAL.md) | 联系人详情显示聚合关系时间线；「写 memo」弹窗；memo 经 AI 提取专长／需求／话题（H） | RN-04 | W0045（C-4：补全来源载体） | planned |
| [W0047](W0047-relationship-strength-tiers/GOAL.md) | 关系强度按站内记录自动分档（新认识／有往来／核心／待唤醒），管线页按档位分组，下线手动阶段（H） | RN-05 | W0046 | planned |
| [W0048a](W0048a-network-snapshot-quota/GOAL.md) | 共享人脉分析快照（存储、生成与校验、三层更新）与两池 AI 配额账本（H） | RN-06 | W0045、W0046、W0047 | planned |
| [W0048b](W0048b-plan-ai-generator/GOAL.md) | 计划生成接 DeepSeek 两阶段并基于快照排行动；老模板计划「AI 重新生成」不占月额度；读取路径 0 次模型调用（H） | RN-06 | W0048a | planned |
| [W0049](W0049-analysis-structure-tab/GOAL.md) | 「结构」标签：AI 诊断、四维分布与目标高亮、健康变化、结构洞察（H） | RN-07 | W0043、W0048a | planned |
| [W0050](W0050-analysis-opportunities-tab/GOAL.md) | 「机会」标签：规则覆盖度、缺口补法、计划直链、待唤醒、报告卡（H） | RN-08 | W0047、W0048a | planned |
| [W0051](W0051-contact-insights/GOAL.md) | 每人洞察：「洞察」标签、详情弹窗顶部、所有人脉列表列与档位筛选（H） | RN-09 | W0045～W0047、W0048a、W0050（承接 W50-3 改读洞察） | planned |
| [W0052](W0052-network-overview-cockpit/GOAL.md) | 概览驾驶舱读快照，管线区改档位，最近动态来自时间线（L） | RN-10 | W0049、W0050 | planned |
| [W0053](W0053-contacts-import-csv-event/GOAL.md) | CSV／vCard 与活动导入、去重合并，导入后走三层更新（H） | RN-11 | W0045～W0047、W0048a | planned |
| [W0054](W0054-network-threshold-demo/GOAL.md) | 引导第 1 步满 3 张才完成；完成后不足 3 人的分析卡；示例静态完整快照（H） | RN-12 | W0048b、W0049～W0051、W0053（导入入口须真实可用，R-13） | planned |
| [W0055](W0055-network-closeout/GOAL.md) | 大目标 4 收口：回填脚本、下线 contact-needs、死代码清理、全量对照与两条路径截图（I） | RN-13 | W0043～W0054（含 W0048a／b） | planned |
| [W0056](W0056-read-trim-closeout/GOAL.md) | 读取瘦身收尾：首页已报名活动按当月窗口读取（显示不变）、他人坏行不再拖垮建议接口、资料建议图只读本人数据（H） | RV-03、RV-05 | W0055（或协调者届时裁决）；D49；不与大目标 4 并行；开工按届时 HEAD 重定位并重跑 W0041／W0042 并跑测试 | planned |

全部 Sprint 都已有 GOAL 与 PLANNER（2026-09-28 编制；大目标 1 与大目标 2 各经 Codex `gpt-5.6-sol` 方案 review 后修订为 revision 2，review 意见与处理见 [REVIEW-2026-09-28.md](REVIEW-2026-09-28.md)）。`planned` 表示前置 Sprint 尚未 completed；前置完成后改为 `ready`。

## 运行记录

每个 Sprint 结束后在此追加：run、最终功能 SHA、`chat-agent` 合并 SHA、报告链接。

| Sprint | run | 最后功能 SHA | `chat-agent` 合并 SHA | 报告 |
| --- | --- | --- | --- | --- |
| W0001 | run-01（2026-09-28） | `a54004c8` | `83f4f931` | [REPORT](W0001-iorbit-home-morning/REPORT.md) |
| W0002 | run-01（2026-09-28） | `fa7ab0b0` | `3f417abc` | [REPORT](W0002-goal-editor/REPORT.md) |
| W0003 | run-01（2026-09-28） | `0ff45703` | `d54949f5` | [REPORT](W0003-community-event/REPORT.md) |
| W0013 | run-01（2026-09-28） | `04fb477e` | `4f79d810` | [REPORT](W0013-card-industry/REPORT.md) |
| W0007 | run-01（2026-09-28） | `52ba4e40` | `7b8085cf` | [REPORT](W0007-plan-storage/REPORT.md) |
| W0004 | run-01（2026-09-28） | `2220b061` | `1ada5684` | [REPORT](W0004-demo-mode-iorbit/REPORT.md) |
| W0005 | run-01（2026-09-28） | `46e36e3c` | `a8491e1b` | [REPORT](W0005-demo-mode-network/REPORT.md) |
| W0006 | run-01（2026-09-28） | `ccb3a172` | `f04fcd20` | [REPORT](W0006-start-guide/REPORT.md) |
| W0008 | run-01（2026-09-28） | `26f09869` | `e6bfdb25` | [REPORT](W0008-plan-generation/REPORT.md) |
| W0009 | run-01（2026-09-28） | `73153d4e` | `374e03bd` | [REPORT](W0009-my-plan-page/REPORT.md) |
| W0010 | run-01（2026-09-28） | `7719d89c` | `9981c2f7` | [REPORT](W0010-network-need-matching/REPORT.md) |
| W0011 | run-01（2026-09-28） | `25263402` | `25436ab0` | [REPORT](W0011-card-review-in-today/REPORT.md) |
| W0014 | run-01（2026-09-28） | `8e159ed2` | `17aa8606` | [REPORT](W0014-demo-mode-plan-chat/REPORT.md) |
| W0015 | run-01（2026-09-28） | `70d038e6` | `feac7477` | [REPORT](W0015-event-attribution/REPORT.md) |
| W0012 | run-01（2026-09-28） | `8c087099` | `639d35ad` | [REPORT](W0012-long-term-tracking/REPORT.md) |
| W0017 | run-01（2026-09-28） | `4a52e3ca`（报告 `fd68af5c`） | `892c1558` | [REPORT](W0017-traffic-guard/REPORT.md) |
| W0016 | run-01（2026-09-28） | `d02be606`（报告 `ca0e031c`） | `93cf669f` | [REPORT](W0016-verify-environment/REPORT.md) |
| W0021 | run-01（2026-09-29） | `0d746c73`（报告 `ca30ce93`） | `e96fcbc0` | [REPORT](W0021-read-traffic-trim/REPORT.md) |
| W0018 | run-01（2026-09-29） | `32943ac7`（报告 `b94478f6`） | `d8ed2f7e` | [REPORT](W0018-scenario-acceptance/REPORT.md)；[验收报告页](https://claude.ai/artifact/JCCFpS5zxK9a74ecCwF65i) |
| W0022 | run-01（2026-09-29） | `ec08f8f4`（报告 `223dd397`） | `3b0376e0` | [REPORT](W0022-home-guide-entry/REPORT.md) |
| W0025 | run-01（2026-09-29） | `488dd9d6`（报告 `54cbccfb`） | `6921656b` | [REPORT](W0025-lifecycle-sort-runtime/REPORT.md) |
| W0026 | run-01（2026-09-29） | `f1b82ea9`（报告 `e61afe88`） | `7011f651` | [REPORT](W0026-recommend-reason-fixture/REPORT.md) |
| W0024 | run-01（2026-09-29） | `21beec29`（报告 `2f19a0e5`、`735df1c3`） | `20e5fea4` | [REPORT](W0024-events-registration-actor-id/REPORT.md)；SC-03 failed，D18 |
| W0023 | run-01（2026-09-29） | `16040227`、`ec4ed7e0`（review P2 修复；报告 `36bf7cfc`） | `b6a6b103` | [REPORT](W0023-expired-plan-match-week/REPORT.md) |
| W0027 | run-01（2026-09-29） | `bc992826`（报告 `7196945b`） | `2d6bf323` | [REPORT](W0027-event-detail-actor-id/REPORT.md)；SC-04 流量 failed，D22 |
| W0028 | run-01（2026-09-29） | `1d70b2cd`（报告 `cb5ac353`） | `2ef85b1f` | [REPORT](W0028-registration-status-read/REPORT.md) |
| W0030 | run-01（2026-09-29） | `3677fd16`、`012c685a`（报告 `03e0f65a`） | `1e8c037d` | [REPORT](W0030-account-session-graph-trim/REPORT.md) |
| W0029 | run-01（2026-09-29） | `7115d634`（报告 `b25f6539`） | `14af7767` | [REPORT](W0029-attendee-roster-trim/REPORT.md) |
| W0031 | run-01（2026-09-29） | `4cb9e4a2`、`2e47997b`（review P2 修复；报告 `e0e51aff`） | `f4e04a54` | [REPORT](W0031-inbox-identity-polling/REPORT.md) |
| W0033 | run-01（2026-09-29） | `921c5d12`（报告 `6f9b8fbb`） | `d7b7247e` | [REPORT](W0033-notification-source-404/REPORT.md) |
| W0032 | run-01（2026-09-29） | `49df2c77`（报告 `ad9be401`） | `94a18a6a` | [REPORT](W0032-session-revocation-read/REPORT.md)；SC-04 按 D32 放宽 |
| W0034 | run-01（2026-09-29～30） | `0af468b9`、`b964c37a`（报告 `bf2092d2`） | `af7da1a8` | [REPORT](W0034-runtime-allowlist-prod/REPORT.md)；跟进与联系人生产组合入表 |
| W0019 | run-01（2026-09-30） | `4d43f2a1`（报告 `36c31566`） | `681f56bb` | [REPORT](W0019-release-checklist/REPORT.md)；[上线清单](W0019-release-checklist/RELEASE-CHECKLIST.md) |
| 集成＋上线 | 2026-09-30～10-01 | `9cb9e55d`（合并 `dda12736`）、`0b847368`、`8b6a1045` | `8b6a1045`（chat-agent 快进） | 生产部署 `dpl_4dgYnCYQc9PuHXcPdaRKNvmSTHDJ`；[上线清单附录 D](W0019-release-checklist/RELEASE-CHECKLIST.md#附录-d上线记录2026-09-3010-01) |
| W0035 | run-01（2026-10-01） | `7e074834`（报告 `fbbdf954`） | `3dc60dc4` | [REPORT](W0035-guide-three-steps/REPORT.md)；合并树受影响 9 个文件 169 pass／1 skip（PG 缺变量，同 run 内已用本机库补跑 0 skip）、tsc 仅 `.next/types` 过期生成文件 |
| W0036 | run-01（2026-10-01） | `f7e5e65a`、`775db2e3`、`78a71d8f`（报告 `27aebac6`、`55c0ab3f`） | `31267c09` | [REPORT](W0036-today-plan-actions/REPORT.md)；SC-06 100% 档 1,758 MB 超 1.6 GB 已写入 D32 周检；SC-07 启用备选约束（snapshot 前 12 场 + 计划 id 补查）；合并树 11 个受影响文件 227 pass／0 skip |
| W0037 | run-01（2026-10-01） | `18d02ae1`（报告 `1edd2b3a`） | `346b3298` | [REPORT](W0037-today-events-module/REPORT.md)；预算第 ④ 行实测 6.24 MB，100% 档 1,761.38 MB 并入 D32 周检；合并树首页相关 4 个文件 158 pass／0 skip |
| W0038 | run-01（2026-10-01） | `d3f89672`（报告 `b9606c71`） | `990e8d4f` | [REPORT](W0038-calendar-event-dots/REPORT.md)；合并树首页相关 5 个文件 174 pass／0 skip；本周池活动缺样本，本周行空心圈靠组件测试 |
| W0039 | run-01（2026-10-01） | 无源码改动（报告 `2bbf116b`） | `cfd1cc5e` | [REPORT](W0039-home-not-empty-closeout/REPORT.md)；**大目标 3「首页不再空」completed**：git archive 全量对照 6072→6149 项、新增失败 0；3001 新用户与老用户两条路径（1440／375）通过；子代理写文件被拦，报告由协调者按原文写入 |
| W0040 | run-01（2026-10-02） | `3543f91a`（报告 `a0dd7548`） | `2e20b73e` | [REPORT](W0040-home-profile-read-trim/REPORT.md)；首页单次读取 9,593,285 B→58,808 B（−99.39%）；合并树受影响 7 个文件 204 pass／1 fail（W0037 测试夹具写死 2026-10-01 的时间炸弹，改前已有，非本 Sprint）；报告由协调者按 Generator 原文写入 |
| W0041 | run-01（2026-10-02） | `d5d5ae58`、`365d8375`（报告 `2fb20c88`） | `3b24e00e` | [REPORT](W0041-home-ssr-read-narrow/REPORT.md)；首页单次 58,808 B→2,378 B（−95.96%），过硬门槛 3,143 B 与目标线 2,644 B；合并树 10 个文件 201 pass／0 skip（PG 指向本机 orbit_test）；报告由协调者按 Generator 原文写入 |
| W0042 | run-01（2026-10-02） | `9a464f11`（报告 `f1321996`） | `e9caf5ca` | [REPORT](W0042-profile-suggestion-read-scope/REPORT.md)；建议图单次 9,534,477 B→31,079 B（普通账号 −99.67%，重账号 −23%）；与旧过滤逐项等价、接口与 App 不变；合并树 6 个文件 63 pass／0 skip（PG 指向本机 orbit_test）；报告由协调者按 Generator 原文写入；待授权：W42-9、W42-10、W42-3 |
| W0043 | run-01（2026-10-02） | `e493eff3`、`ecd8214c`（review 修复；报告 `2117599a`） | `738f13ae` | [REPORT](W0043-network-stop-fake-copy/REPORT.md)；Codex review 3×P1＋1×P3 全采纳；全量对照新增失败 0；合并树 14 个文件 133 pass／0 skip、tsc 仅 `.next/types` 过期产物；报告由协调者按 Generator 原文写入；遗留：英文界面 `localizeOrbitTree` 改坏姓名等 5 项（见 REPORT） |

# Orbit App Sprint 管理入口

**运行状态：ACTIVE（2026-09-14，用户要求完成框架与文档后自主执行 Sprint）。** 本目录是文档驱动的 Sprint Dev 管理规程；当前代理按规程执行，不是另行安装的后台 SDK 编排程序。只领取前置条件与适用批准齐全的 Sprint。

用户已指定：编号从 `0001` 开始，每个 Sprint 一份 Planner、一次 Generator，不设 Evaluator 或 Generator↔Evaluator 循环，验证遵守最小必要原则，完成后必须记录 commit 与总结。此规则取代先前草稿中 S0～S8 的编号、同一 Sprint 多实现者和固定独立评审安排。

**2026-09-14 提速规则已生效：** 开发中跑定向测试，沿用户操作链批量交付；纯L默认不跑全量，含H在本地代码收口时对受影响端做一次集成检查。取消“每个子功能／三个提交后自动全量”，复用未变化的阅读和验证，合并碎片化进度文档。详见[RULES第4、5、8节](RULES.md)；覆盖旧Planner的执行频率，原SC、批准、预算及真实验收不变。

## 先读哪里

1. [执行规则](RULES.md)：一次执行、边界、状态、最小测试、提交与失败处理。
2. 本表选择 Sprint，先读 `GOAL.md` 了解要实现的结果；执行前再读 `PLANNER.md` 及它明确引用的前序 `REPORT.md`。不要载入整个历史对话或所有 Sprint。
3. [目标模板](templates/GOAL.md)、[Planner 模板](templates/PLANNER.md)、[总结模板](templates/REPORT.md)用于后续新增 Sprint；只有执行过才创建实际 `REPORT.md`。
4. 需求和历史证据仍见[原剩余计划](../superpowers/plans/2026-09-13-app-remaining-functionality-and-connectivity.md)与[连通性记录](../verification/2026-09-13-app-connectivity.md)。它们不再决定本目录的执行角色／频率。
5. [实施顺序](EXECUTION_ORDER.md)：2026-09-14 用户要求按依赖减少重复修改；离线期间继续无需新决定的工作，不再提问，不越过独立审批。

## 目录契约

```text
docs/sprints/
  README.md                  # 唯一运行状态和 Sprint 状态登记表
  RULES.md                   # 所有 Sprint 的执行规则
  templates/
    GOAL.md                  # 易读目标模板；不记录完成状态
    PLANNER.md               # 计划模板；不是执行过的 Sprint
    REPORT.md                # 结果模板；不能预填通过
  0001-event-discovery/
    GOAL.md                  # 要实现什么、做完能看到什么、怎么验收
    PLANNER.md               # 本 Sprint 的唯一验收契约
    REPORT.md                # 执行结束后新增；包括失败／受阻结果
  0002-readiness-handoff/
    GOAL.md
    PLANNER.md
  ...
build/harness-state/evidence/sprint-0001/run-01/
  commands/ screenshots/ api/ git/ checkpoint.md
build/harness-logs/
  sprint-0001-run-01.log
```

原始日志和截图使用已有被忽略的 `build/` 子目录，不改 `.gitignore`、不进产品源码或 Git。运行目录只在对应 Sprint 启动时创建。用户要求的 Planner／报告是可提交文档，集中在 `docs/sprints/`。证据只读留存，不自动清空 `build/` 或迁移旧日志。

## Sprint 登记表

未列入下方运行记录的 Sprint 均为 `run_count = 0`、`report = 未产生`。表中的依赖是进入条件，不声称已满足。0001 接续既有四文件；0002 不依赖0001的功能结果。其余按依赖就绪执行，不以编号大小证明就绪。

每个 Sprint 的目标页都用具体操作说明预期结果。目标说明不等于完成声明；技术范围和 SC 仍以 `PLANNER.md` 为准，实际成果只看执行报告与下表状态。

| Sprint | 要实现的结果 | 原范围 | 依赖／额外前置 | 状态 |
| --- | --- | --- | --- | --- |
| [0001](0001-event-discovery/GOAL.md) | 用全部地点和话题找到活动，筛选后仍能翻页和打开详情 | R-09 | 无；接续当前四文件 | completed |
| [0002](0002-readiness-handoff/GOAL.md) | 查清已完成能力、后续缺项和每项开工条件 | R-01、R-00～R-12 依赖 | 无；只读文档工作 | completed |
| [0003](0003-profile-completion/GOAL.md) | 注册、补全资料后回到原页面，完整用户不再被拦截 | R-03 | B1整体批准已生效；本地实现启动，真实账号／Google验收按对象另核 | running |
| [0004](0004-registration/GOAL.md) | 报名、取消和重报后，答案、人数及各页状态一致 | R-04 | run-01 已完成；功能 `319f6f7bb`，见 REPORT | completed |
| [0005](0005-ai-session-reliability/GOAL.md) | AI 重试不重复生成，Web/App 续聊不丢历史 | R-00、R-02 | B3 跨端提案待审；已隔离复现旧快照覆盖，真实恢复／503 证据仍缺 | blocked |
| [0006](0006-contact-mentions/GOAL.md) | @ 选准联系人，带入 AI 的问题由用户确认发送 | R-06 | 0005；B3 引用／D3 | blocked |
| [0007](0007-two-sided-cards/GOAL.md) | 正反面名片复核后只创建一个联系人 | R-07 | 0002；B5／OCR 环境 | blocked |
| [0008](0008-identity-chat/GOAL.md) | 验证邀请和身份绑定后，双方能真实收发消息 | R-05 | 0002；B4 契约已冻结；E 线 run-01 正在实现，真实双用户证据随环境核验 | running |
| [0009](0009-timezone/GOAL.md) | 同一事项在首页、待办、日历和活动中不落错日 | R-09 | run-01 已完成；功能 `a4bbfd9f6`，见 REPORT | completed |
| [0010](0010-task-schedule-editing/GOAL.md) | 个人事项能创建、编辑和清空字段，各页与提醒一致 | R-08 | 0009；B6 已批准，C 线 run-01 启动 | running |
| [0011](0011-home-analysis/GOAL.md) | 首页符合确认布局，分析可辨新旧，目标可单独保存 | R-09、R-10 | 0006；B7／首页／D4 | blocked |
| [0012](0012-message-state/GOAL.md) | 前台新消息及时出现，已读角标与跳转目标正确 | R-11 | 0008；消息契约／通知环境 | blocked |
| [0013](0013-locale-foundation/GOAL.md) | 用中日英操作账号、首页和设置，切语言不丢输入 | R-12 | 0009、0011；D6 | blocked |
| [0014](0014-locale-relationships-events/GOAL.md) | 用中日英处理人脉、名片和活动，保留原文与答案 | R-12 | 0013、0004、0007、0008 | blocked |
| [0015](0015-locale-assistant-workflows/GOAL.md) | 用中日英操作 AI、事项和消息，保留内容与日期 | R-12 | 0013、0006、0010、0012 | blocked |
| [0016](0016-native-navigation/GOAL.md) | 用实际设备验收导航、字号、键盘和辅助功能 | R-09、R-12 | 0014、0015；原生审批／设备 | blocked |
| [0017](0017-cross-client-acceptance/GOAL.md) | 用真实主流程及五类记录双向回读证明两端一致 | R-01、R-14及主链路余项 | 0003～0016；共同环境／授权 | blocked |
| [0018](0018-notes-core/GOAL.md) | 一份私密笔记关联多人，保留旧内容并安全切换入口 | R-13 | 0017；B8／D7／迁移设计 | blocked |
| [0019](0019-note-suggestions/GOAL.md) | 确认笔记建议后只建一次事项，逐项验收全部原需求 | R-13、R-14 | 0018；D5／B6／B8建议协议 | blocked |
| [0020](0020-secondary-industries-self-profile/GOAL.md) | 二级行业在资料、联系人和检索中复用，AI 能读取本人资料，现有测试数据补齐 | 2026-09-14 新增；关联 R-03／R-06 | run-01 已结束；部分代码未提交，HTTP/provider/trace/生成源范围缺项与 H 验证未通过；见 REPORT | blocked |
| [0021](0021-ai-session-organization/GOAL.md) | 保存 AI 会话入口与首条内容，按项目式分组整理，并能置顶、改名、删除和跨端回读 | 2026-09-14 新增；关联 R-00／R-02／R-06 | 执行指令已收到；仍需 B3 稳定协议／Web 恢复边界及跨端计划审阅 | planned |
| [0022](0022-unified-tasks/GOAL.md) | 同一待办入口切换全部／人脉，兼容旧跟进链接并保留草稿、建议和提醒入口 | 2026-09-14 新增；关联 R-08／R-09／R-06 | 产品方向与执行指令已确认；书面规格审阅，0006 模板与 0010 动作交付 | planned |
| [0023](0023-industry-consumer-continuation/GOAL.md) | 接通联系人行业、搜索 HTTP 与本人资料工具，承接 0020 全部未完成验收 | SC-0020-01～05；明确获准接续 | 现有部分实现与 8 文件补充方案已批准；真实数据／设备按对象处理 | running |

采用较小 Sprint，而不是把几套子系统放进一次 Generator。0001～0017覆盖当前主链路；0018～0019是后期笔记，未完成仍保留原需求，不把后期排队算作整个项目完成。

这是当前已知范围的首批拆分，不是对未知接口的实现承诺。缺协议的 Planner 必须在启动前补入实际契约并审阅；原生补丁、公开活动集合等调查若发现本表未覆盖的必要实现，由 Planner 明确补计划／新编号，不留到最终验收时假定已完成，也不借新编号自动重跑失败 Generator。

### 2026-09-14 启动前就绪检查

协调者按各 Planner 的进入条件核对：0003～0019 均有尚未满足的直接或前序依赖，登记 `blocked`、`run_count = 0`。没有领取这些 Sprint，没有生成执行报告，也没有将缺项改为“不适用”。具体协议／运行失败／决策／环境／样本／授权分类见[0002交接清单](../verification/2026-09-13-app-connectivity.md#24-sprint-0002后续-sprint-就绪交接)。

可单独解除的入口是0003（B1/D2）、0005（B3及Web恢复风险处理或隔离专测授权）、0007（B5与安全OCR环境／实体样本）、0008（B4与双用户）、0009（权威时区与DST／全天日期策略）。0002文档交接已完成；各项仍须具备自身声明的其余前置。其余按本表依赖推进，不要求等全部B1～B8都解决后才领取其中一项。

恢复时只核对本 Sprint 的发布契约、批准、环境与样本，必要时补全并审阅 Planner；不要求该 Sprint 自己的实现／验收先完成。已批准的同动作／对象／环境权限继续复用，只有缺失或新增部分需要确认。原 App Planner 的文件白名单不自动扩张；Web/API 责任授权的后续变化见下一节，密钥与迁移仍需独立批准。

### 2026-09-14 补充决定与新 Sprint

- 用户已明确由当前代理负责相关 Web/API 修复；这是责任与相关代码范围的授权，不等于批准数据库迁移、密钥变更、部署或任意真实数据写入。每项跨端任务仍须有经审阅的文件边界与验证范围。
- 用户已采用姓名＋行业必填、自我介绍选填，生日后续确定为完整年月日且仅本人可见；时区策略为跟随设备。这些决定取代之前相冲突的待定描述；完整接口与执行边界仍须修订审阅，不能仅凭产品决定齐全宣称整个 Sprint 就绪。
- 新增 [0020 Planner](0020-secondary-industries-self-profile/PLANNER.md)、[二级目录提案](0020-secondary-industries-self-profile/INDUSTRY_CATALOG.md)和[测试数据范围](0020-secondary-industries-self-profile/DATA_SCOPE.md)。用户本次明确只编制文档，不实现、不启动 Generator、不调用模型或改测试数据库。
- 0020 按 planned 登记，run_count = 0，未产生 REPORT；单独执行指令和计划审阅齐全后才可检查 ready。它是新增需求，不是原失败 Sprint 的第二次运行，也不隐含必须排在 0019 后实施。
- 新增 [0021 Planner](0021-ai-session-organization/PLANNER.md)及[参考与交互规格](0021-ai-session-organization/REFERENCE_AND_BEHAVIOR.md)，记录会话入口元信息、项目式分组、置顶／改名／删除和跨端持久化。用户已澄清只参考 ChatGPT App 的功能与组织形式，公开截图由代理寻找，不做像素复刻。当前只编制，planned、run_count = 0、未产生 REPORT；原 0001～0020 的状态不变。

## 运行记录

### 0004 / run-01

- owner：当前主代理 `/root`；run_count：1；开始：2026-09-15 00:55 JST，原地 `chat-agent`，无第二实现者。基线 HEAD `b2afc634d`，原 Planner SHA256 `1e4d139e552c9090eb7fda71b6438a22753a04a4b1e69f3d0b690f0ed8ea9519`。
- 历史题库 500 已定位为 `event_ops_experience_heads` 不可见；当前本地 `orbit_events/public` 已执行 `event-experience-v1-versioned-heads` 迁移并幂等复验，日志在被忽略证据目录。用户的连续执行与必要环境授权已记录为[跨端实施范围补充](0004-registration/APPROVED_SCOPE_ADDENDUM.md)。
- 结束：2026-09-15 02:20 JST；结果 completed；最后功能 HEAD `319f6f7bb`，见[执行报告](0004-registration/REPORT.md)。资格、报名／取消／重报、准入申请与撤回、答案匹配及详情／列表／首页／日历同记录回读均通过。
- 功能提交：`6c3ff4cc6`、`4591428b7`、`58c01f49a`、`603a59e1a`、`319f6f7bb`。App 最终全量 2642/2642、两端 typecheck exit0；Web 相关注册／公开目录／真实 PostgreSQL 组通过。真实原生证据在被忽略的 `build/harness-state/evidence/sprint-0004/run-01/`。
- 合成 QA 数据已按精确 workspace／actor 清理，默认活动恢复到运行前 revision 3 并复核公开人数为0。至少4次真实 DeepSeek 调用的精确 token／增量金额未取得，不记为0；用户未跟踪设计素材和 prototype 未触碰。A 线报名文件锁已释放。

### 0009 / run-01

- owner：C 线任务；run_count：1；基线 `fca77373f`，功能提交 `a4bbfd9f6`。设备时区、DST／异常、全天日期、草稿时区和跨页解释已实现。
- 主树组合验证为 App typecheck exit0、全量2632/2632、0 skip、diff-check通过；真实原生 Tokyo／Los Angeles／Kolkata 与独立 PostgreSQL 同记录 Web/App 回读证据见 [REPORT](0009-timezone/REPORT.md)。合成身份注入边界和 GitNexus 重建失败均保留，不写成真实登录或生产链路通过。

### 0010 / run-01

- owner：C 线任务；run_count：1；开始：2026-09-15 00:12 JST。承接 `a4bbfd9f6` 与 B6 已批准协议，使用独立 PostgreSQL／Simulator，不与 A0004 共用事件报名文件。
- C 线独占事项、日程、首页的0010白名单；共享登记表与Git提交仍由协调者处理。原 Planner SHA256 `5f169b6879af07d7f21515e1d02f7f9ab14a9bcd0b207d950c47080be0c66c16`。

### 0003 / run-01

- 原子保存已提交 `6082b9961`：版本比较、幂等回执、事务回滚，14项临时PostgreSQL测试实际执行。App全量2593/2593；Web最终3005 pass／47原有fail／168skip，失败名称与基线一致。首次48 fail中的旧首页工厂断言已定位并修订，历史日志保留。临时实例已停止，继续同一批两端补全交互及认证导航，不把子功能算作Sprint完成。
- 已提交资料基础层 `65c2a8050`：独立onboarding、私密生日及投影隔离；App全量2593/2593，Web2990 pass／47原有fail／168skip，失败名称与基线完全一致。首次App全量的统计重试时序失败保留，受控回包修订后相关156/156及全量通过。继续事务保存与补全导航，未关闭任何完整SC，见[进度证据](0003-profile-completion/PROGRESS.md)。
- owner：当前主代理 `/root`；run_count：1；开始：2026-09-14 21:26 JST，原地 `chat-agent`，无第二实现者。前序0002报告及B1技术提案已读取，复用整体批准，见[跨端实施补充](0003-profile-completion/APPROVED_SCOPE_ADDENDUM.md)。
- 基线功能HEAD `f4bdef4c0`；原Planner revision 2 SHA256 `8315be01f929ce997cc43dfeadd87f489522c63ce53d1dd7102c7288018c4bd1`。本任务产品文件无未提交差异，0023仅剩协调文档；未跟踪用户素材保留。
- 当前有效基线：App2593 pass／0 fail／0 skip，Web2969 pass／47既有fail／168skip，两端typecheck exit0。Web失败名称与原I版本一致，沿用已批准的基线继续，不降低SC。
- 文件锁按原Planner及补充归当前主代理；0023不同时写本任务的资料／契约文件。真实注册、Google系统回跳、共同账号双端回读尚未执行；不因此阻止独立本地实现。

### 0023 / run-01

- 最新整体批准已按 RULES 第0节生效，旧“待审”不再构成逐文件审批停点。App两级搜索与筛选交互已提交 `e181bbdc3`；App全量2593/2593、两端typecheck通过。继续纯seed构造与数据投影，不执行写库CLI；真实环境、分类缺依据及费用核算仍分别保留。
- 纯seed构造、9名人物行业投影与12人／24投影清单已提交 `f4bdef4c0`；相关9/9，Web全量2969 pass／47既有fail／168skip、typecheck通过。3名人物缺依据，未执行CLI／写库；后续资料文件锁暂交0003的同一主代理，0023剩余SC不自动关闭。

- owner：当前主代理 `/root`；run_count：1；开始：2026-09-14 16:42 JST。原地 `chat-agent`，无其他写入者或 Evaluator。
- 用户明确“全部同意”当前 8 个新增文件及接续 Sprint，并要求快速持续执行；必要付费调用已批准。复用这些批准，不反复请求同一事项。未具体界定的未来破坏性操作、真实数据库写入及部署不推定授权。
- 基线 HEAD `d531c42d4`，产品 WIP `5355f0c6a`；tracked 工作树干净，用户未跟踪设计文件与 prototype 保留。原 0020 run-01 保持历史 blocked，不覆盖原失败。
- 契约：[PLANNER revision 1](0023-industry-consumer-continuation/PLANNER.md)，继承原五项 SC 和接续方案的精确范围。联系人、搜索／资料投影、AI 与 trace 已分批提交；当前继续本地测试数据，真实验证门槛独立保留。
- Planner SHA256：`5ab6f8a60493c73fd52200981dc99b44dcb9492bc2d338b96d2002a1c787b68d`。联系人接线已提交 `9daf52dad`，搜索 HTTP 已提交 `36f7255d8`，资料页投影已提交 `db972c3f8`。三个额外传递／兼容文件的批准见[范围补充](0023-industry-consumer-continuation/APPROVED_SCOPE_ADDENDUM.md)，不再等待重复批准。
- AI 本人资料工具、完整 trace 和 Agent 报告兼容已提交 `2c079ee93`。用户明确批准三个报告文件的最小兼容修复后，缺失说明的 RED 已消除；五个完整相关文件 13/13，Web typecheck exit0。报告只登记新能力和动态数量，保留原实测、受限项和安全断言。
- 本地数据提交：`464e7f816` 固定资料／联系人／搜索夹具；`10c2ecd7b` 可执行增量清单；`fd91387b0` 旧全局人物及关联投影。清单现有8人／28个正常投影／两个反例，生成数据、其余内联样本和既有测试库仍未补齐，见[数据进度](0023-industry-consumer-continuation/DATA_REPAIR_FINDINGS.md)。
- App 资料正常夹具补齐：`805188a56` 名片／编辑／保存，`2d1add128` 首页及建议／抽取转换；五个修改文件加既有行业交互测试共51/51、App typecheck exit0。空资料、缺姓名和旧版无ID反例保留，尚未并入 Web 的增量投影清单；没有因此声明 App 全部测试数据已补齐。
- 最近 H 全量（`fd91387b0` 同一源码版本）：App 2582 pass／0 fail／0 skip；Web 2952 pass／47 fail／168 skip，两端 typecheck exit0。Web 47项失败与上次逐项对比没有新增，原48项中的 Agent 报告模块错误已消失；不是把旧计数直接改写。日志在 build/harness-logs/sprint-0023-fixture-{web,app}-full.log。真实模型、跨端、原生和既有测试库验收仍未完成，环境隔离历史与未核算费用保留。
- 更新 H 全量（`1adb805c7`）：推荐候选在同步／异步及普通／排序路径保留行业 ID、null 和省略语义；12个新增路径用例先见8个预期RED，修复后相关两文件29/29。App全量2583 pass／0 fail／0 skip；Web2964 pass／47 fail／168 skip，失败名称集合与上一版无变化；两端typecheck exit0。日志为 build/harness-logs/sprint-0023-recommendation-{web,app}-full.log。继续本地夹具盘点，不以阶段提交结束整体工作。
- 后续L数据检查：`d34712307` 补内联资料／联系人／推荐输入并登记4个实际推荐投影，清单现8人32正常投影；5个RED后四文件43/43。`e5db81a32` 将AI输出／统计桶／活动偏好与活动领域三个来源列入明确非个人行业分类，登记RED后四文件20/20；两次Web typecheck均exit0。两个反例保留，其他10个来源族仍未完成；不把这两次局部检查称为新的全量。
- `b5e868112` 补App邀请／搜索及Web简报正常输入，3条RED后App9/9、Web11/11，两端typecheck通过。连续三个L提交后的I全量：Web2966 pass／47 fail／168 skip，失败名称无新增；App2582 pass／1 fail／0 skip。App失败为 `app-wide-workspaces.test.ts` 任务设置关闭按钮测量43.99998474121094未满足严格44下限；未改代码或断言，限定该用例重跑1/1。它使用slide Modal且按钮样式minHeight来自44pt token，动画几何精度只是当前诊断，不能把单次通过当修复或把全量改记通过。日志为 build/harness-logs/sprint-0023-inline-integration-{web,app}-full.log 和 sprint-0023-layout-failure-repro.log。新增App搜索mapper及纯seed构造器的待审精确边界见数据进度页。

### 0020 / run-01

- owner：当前主代理 `/root`；run_count：1；开始：2026-09-14 10:04 JST。
- 用户已同意上一条明确提出的“0020 现有代码方案，不含真实数据库写入、迁移和部署”，要求执行、离线期间不再提问。此批准替代旧“技术方案待审”与“仅编制”描述，保持原目录和单选／工具白名单；不扩大到其他 Sprint 的新设计。
- Planner revision：1；SHA256：`529bd9a278bf357f59d4ba3ae8a7e7485b479dcc5fe4985f53efc13dd016dcd6`。
- 起始 HEAD：`808515a82`；tracked 工作树干净；用户未跟踪设计素材、prototype 与 `.gitnexus` 保留。
- 执行范围：现有 Planner 的 Web/App 代码与源码夹具，原地 `chat-agent`、同一 Generator 串行；根 Git 由当前代理独占。不改变冻结 Planner。真实对象的独立缺项保留，SC-02／03／05 不以本地模拟替代。
- 结束：2026-09-14 11:04 JST，结果 blocked；[执行报告](0020-secondary-industries-self-profile/REPORT.md)。没有功能 commit，源码保留为未提交改动，不能作为后续已交付依赖。
- 验证：两端 typecheck 通过；App 全量 2581/2581；Web 全量 2932 pass、51 fail、168 skipped、2 TODO。10 项审计失败在基线复现；本轮使资料页旧运行证据失效，未擅自改审计断言。4 项 provider 环境失败离线复验通过。
- 费用：原已记录 $0.012780/$5，Web 全量遗漏 DeepSeek 环境隔离产生意外 provider 路径，本轮增量待核算，不是 0；核算前停止额外付费调用。
- checkpoint：`build/harness-state/evidence/sprint-0020/run-01/checkpoint.md`（App cwd，被忽略）；所有测试进程已结束，不自动重开 run-01。
- 12:29 JST 后续：用户明确要求先提交再推进；34 文件部分实现已 WIP 提交 `5355f0c6a`，非完成验收。新复验 Web 22 pass／2 个仍失败的 TODO、App 163 pass、两端 typecheck 通过；原全量失败不变。提交后补成[精确接续范围提案](0020-secondary-industries-self-profile/CONTINUATION_PROPOSAL.md)，未改冻结 Planner、未自动重开 Generator。
- 最新授权：用户两次明确允许必要付费调用，沿用原累计 $5 上限，费用逐次核对；此前意外调用增量未核算，不当作零。接线文件／接续方案的独立审阅与真实数据写入边界不变。

### 产品决定记录（2026-09-14，后续确认）

本节记录用户已确认的产品规则，不表示实现完成，也不替代单独的执行指令。

| 事项 | 已确认决定 | 影响与剩余边界 |
| --- | --- | --- |
| 生日 | 需要填写完整年月日，且仅本人可见 | 0003；不再询问年份精度，不公开展示或加入 AI 本人资料工具输出；实际字段与完成判定仍须落入接口。 |
| 二级行业 | 用户认可现有 14 个一级、79 个二级选项的目录提案 | 0020；认可对象为提交 `621874a5c` 的 INDUSTRY_CATALOG.md 分类条目，不等于批准全部技术方案、测试库写入或启动实现。 |
| Pipeline | 保留独立 Pipeline 入口 | 0011；不实施隐藏入口方案。 |
| 首页活动／待办 | 活动替换当前联系跟进内容区块；仅参考用户图片中的活动列表呈现；未完成待办最多显示 5 条 | 0011；不照搬整页布局，不删除其余待办或旧跟进业务数据；首页跟进快捷按钮由记笔记替换。 |
| 人脉待办 | 全部具体行动统一为待办，人脉待办只是筛选视图；需要联系的联系人留在人脉页面，不设首页独立跟进入口 | 用户已认可设计；已登记 0022，处理筛选、入口、旧路由及能力兼容，不扩张 0010 的编辑协议范围。 |
| 界面语言 | 默认跟随设备，手动选择保存到账号并同步其他设备 | 0013～0015；账号手动选择优先，不再询问设备级还是账号级；实际读写／刷新契约仍需补齐。 |
| AI 入口 | 用户已按当前 App 入口清单确认：1、2、3、7 用模板转入 IORBIT；4 取消；5、6、8、9 保持现状；流程内辅助入口 10～13 不动 | 具体编号、按钮与规则见 [0006 入口决定](0006-contact-mentions/PLANNER.md#已确认的入口决定2026-09-14)。0008 承接聊天摘要取消要求；其余契约、文件边界与验证范围仍需补齐审阅，不表示已经实现。 |
| 笔记建议 | 用户认可笔记页用“从这篇笔记整理待办”模板、携带笔记引用进入 IORBIT；用户发送后生成建议，再确认创建事项 | 见 [0019 Planner](0019-note-suggestions/PLANNER.md)。笔记页不独立调用 AI 提取待办；具体引用／接受协议仍需补齐审阅。 |
| AI 会话管理 | 每个会话保存开头／入口信息；App 支持分组、置顶和删除，功能与组织形式参考 ChatGPT App，不要求 UI 完全复刻 | 新增 0021；已找到并查看公开 iOS 截图。具体契约和“删除分组保留会话”等方案随 Planner 审阅，不视为已实现。 |
| 笔记管理 | 首页“记笔记”直接替换原联系跟进快捷按钮，位置在新建待办之后，不额外增加一项 | 0018 负责可用的创建入口，0011 对齐首页位置；按钮去留已确认。旧内容分类、迁移及完整管理路由仍需设计。 |

此前的姓名＋行业必填、自我介绍选填、设备时区策略与 Web/API 负责人授权继续有效。本轮把生日、首页活动／待办、语言同步及笔记快捷入口写入 0003／0011／0013／0018 的 revision 2 和目标页；未启动实现，运行状态、run_count 和历史报告不变。其余旧 Planner 与已确认决定冲突时以此决定为准，执行前继续完成技术范围审阅。

### 0001 / run-01

- owner：当前主代理 `/root`；run_count：1；开始：2026-09-14 00:03:40 JST。
- Planner revision：1；SHA256：`e81528e71ff7162a7abd43e599d25dc806613575a50ae25241a340067e0d9b93`。
- 起始 HEAD：`62bbe0af12475953e53c1d91a10b69d93ca8db56`；承接暂停点的四文件 56+/8-，没有其他产品文件改动。
- 结束：2026-09-14 00:19 JST；功能提交：`bc6a6c1ed8e8946668d16a6923741569577b56ef`；[执行报告](0001-event-discovery/REPORT.md)。
- 验证：106/106相关测试、2577/2577全量、类型通过；Simulator只读活动筛选通过。四文件与被验收提交一致。
- 原0001四文件和Simulator锁已释放；Git仍由协调者独占。checkpoint：`build/harness-state/evidence/sprint-0001/run-01/checkpoint.md`。

### 0002 / run-01

- owner：`/root/sprint_0002_generator`；run_count：1；开始：2026-09-14 00:15 JST。
- Planner revision：1；SHA256：`8efbf5aa556577c7c395fb170242c609ee1c2cb61d539d57ca8800f3fb45441a`。
- 起始 HEAD：`bc6a6c1ed8e8946668d16a6923741569577b56ef`；三个业务文档启动前无未提交差异。
- 结束：2026-09-14 00:38 JST；文档提交：`cced58bd7c30308e3e0ac21fcd7b3de6466b372a`；[执行报告](0002-readiness-handoff/REPORT.md)。
- 验证：五项SC通过；14个相对链接、17行就绪条件和15处源码引用检查通过；暂存detect仅3个文档／16个Section／0受影响流程。D档，无产品测试、HTTP或原生操作。
- 原文件锁：`docs/api-gaps.md`、`docs/verification/2026-09-13-app-connectivity.md`、`docs/superpowers/plans/2026-09-08-app-wide-native-qa-matrix.md` 及 0002 报告，现已释放。只读源码，未接管 Simulator、API、账号、费用或 Git。
- 0002 不依赖0001结果；与0001收尾只并行处理无重叠文档，仍各自只有一个 Generator。

### 0008 / run-01

- owner：`/root/e_line`；run_count：1；开始：2026-09-14 23:24 JST。
- Planner revision：1 + B4 已批准技术契约；SHA256：`a20d9e1084b2b77d1d1fe29f3c3aab79f853874234a44b5bf8dce7f73b2261d1`。
- 起始 HEAD：`fca77373f123c03e29a0584cba46bade5f5eb907`；启动前产品工作区干净。
- 文件锁：0008 Planner 白名单、已登记的必要 Web/API 契约与实现路径，以及对应测试。与 B 线共享的 `ContactDetailScreen`、`RelationshipChatScreen`、`RelationshipInboxScreen` 仅在本 worktree 修改并在报告中明确交接。
- B4 契约已冻结；真实双用户、数据库和实体设备环境在执行中核验，缺少外部环境只影响对应真实证据，不降低本地权限、幂等与隔离验收。

0020/run-01 已以 blocked 结束，代码未提交；其 REPORT 逐项记录剩余 Sprint 的范围、设计、依赖与环境门槛，不表示全部实施完成。用户要求连续实施所有剩余 Sprint 的指令保持有效，不逐项重复询问；适用条件闭合后按单次运行规则安排接续。0001／0002 不重新运行。管理框架、19份Planner和0001报告提交为 `1a0c7086420a421169f63e8e4b0a04c6cc329315`；本报告／登记表提交可从Git历史查看，不在报告内追填自身SHA。

### 2026-09-14 顺序实施与离线指令

此前 0020／0021“只编制、需另行执行指令”是历史事实；用户现已要求完成 0022 后逐步实现，[实施顺序](EXECUTION_ORDER.md)承接本次授权。两项 Planner 中的旧“本次只编制”不再作为缺执行指令的理由，但其明确要求的书面技术审阅、依赖及真实写入批准继续保留。0022 的 [设计](0022-unified-tasks/DESIGN.md)与 [Planner](0022-unified-tasks/PLANNER.md)已经编制，run_count 为 0，不预建 REPORT。

用户随后说明将离线一小时，要求独立推进、不再提问、优先无需用户决定的工作。执行安全技术准备和依赖核查；没有就绪 Sprint 时如实记录，不擅自批准契约或消耗 run。

用户再次要求执行后，按新增停止规则继续推进：[0020 源码／数据入口核查](0020-secondary-industries-self-profile/READINESS_AUDIT.md)、[0003/B1 技术补充](0003-profile-completion/TECHNICAL_PREPARATION.md)、[0005/B3 协议与隔离复现](0005-ai-session-reliability/B3_PROTOCOL_PREPARATION.md)已落盘。当前产品基线为 `df824de70`；新增 Web 字典 3 项、App 同步／账户 20 项、Web 会话 7 项基线均通过，旧快照覆盖在全新 memory store 复现；不代表新功能通过、真实数据损失或已启动 run。继续动作见 EXECUTION_ORDER，不因这些文档完成而结束整体实施。

同轮后续：`fab788d62` 保存 B2/B6 证据，`18a8627b9` 保存 B4/B5 技术准备。B6 既有 15 项测试通过，但新内存复现并发同版本编辑接受两次、仅保留一次修改；B2 从留存服务日志取得与原 500 相邻的题库表不可见异常（42P01），尚未连接当前数据库核对／修复。另已核对 B7 分析时间、账号语言来源及 B8 旧备注边界，见 [当前动作与缺项](EXECUTION_ORDER.md#进入代码阶段的实际缺项)。这些是准备与诊断成果，0003～0022 仍未启动 Generator，也没有功能 REPORT。

## 2026-09-13 暂停点（历史基线）

- 分支 `chat-agent`，HEAD `62bbe0af12475953e53c1d91a10b69d93ca8db56`。
- 既有活动修复四文件仍未提交：`src/screens/events/EventsScreen.tsx`、`src/view-models/events.ts`、`tests/ink-signal-events.test.ts`、`tests/screen-state.test.ts`；56 行增加／8 行删除。由 0001 明确承接，不丢弃或重复实现。
- 上个提交版本全量 2574/2574；本次未提交修复有 5 项 RED→GREEN 和类型通过，尚欠完整相关回归、原生及 commit。具体日志见 0001 Planner。
- 真实 AI/OCR 原累计上限 $5，已记录保守费用 $0.012780／5 次供应商请求；继续原账本，不按 Sprint 或代理重置预算。
- 该规划轮只创建／修订管理文档和 App 的规则入口，没有运行功能测试、业务请求、Generator 或提交现有功能；之后的实际执行另列运行记录。

## 恢复方式

用户明确恢复后，由协调者把运行状态改为 ACTIVE，并检查相应 Planner 的进入条件、版本和审批。可以明确要求“执行 Sprint 0001”；这只授权它的既定范围，不自动批准后端、真实写入或其他未决设计。需要连续执行时，按用户授权范围依次领取就绪 Sprint。

每次启动登记 `owner`、`run_count: 1`、Planner 哈希、起始 HEAD／diff 和开始时间。结束在本表更新状态并链接实际报告；登记表与报告有冲突时先停下核对，不能选择较乐观的状态。不填虚构 owner、运行时间或 commit。

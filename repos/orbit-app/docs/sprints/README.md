# Orbit App Sprint 管理入口

**运行状态：ACTIVE（2026-09-14，用户要求完成框架与文档后自主执行 Sprint）。** 本目录是文档驱动的 Sprint Dev 管理规程；当前代理按规程执行，不是另行安装的后台 SDK 编排程序。只领取前置条件与适用批准齐全的 Sprint。

用户已指定：编号从 `0001` 开始，每个 Sprint 一份 Planner、一次 Generator，不设 Evaluator 或 Generator↔Evaluator 循环，验证遵守最小必要原则，完成后必须记录 commit 与总结。此规则取代先前草稿中 S0～S8 的编号、同一 Sprint 多实现者和固定独立评审安排。

## 先读哪里

1. [执行规则](RULES.md)：一次执行、边界、状态、最小测试、提交与失败处理。
2. 本表选择 Sprint，再读其 `PLANNER.md`，以及它明确引用的前序 `REPORT.md`。不要载入整个历史对话或所有 Sprint。
3. [Planner 模板](templates/PLANNER.md)、[总结模板](templates/REPORT.md)用于后续新增 Sprint；只有执行过才创建实际 `REPORT.md`。
4. 需求和历史证据仍见[原剩余计划](../superpowers/plans/2026-09-13-app-remaining-functionality-and-connectivity.md)与[连通性记录](../verification/2026-09-13-app-connectivity.md)。它们不再决定本目录的执行角色／频率。

## 目录契约

```text
docs/sprints/
  README.md                  # 唯一运行状态和 Sprint 状态登记表
  RULES.md                   # 所有 Sprint 的执行规则
  templates/
    PLANNER.md               # 计划模板；不是执行过的 Sprint
    REPORT.md                # 结果模板；不能预填通过
  0001-event-discovery/
    PLANNER.md               # 本 Sprint 的唯一验收契约
    REPORT.md                # 执行结束后新增；包括失败／受阻结果
  0002-readiness-handoff/
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

| Sprint | 目标 | 原范围 | 依赖／额外前置 | 状态 |
| --- | --- | --- | --- | --- |
| [0001](0001-event-discovery/PLANNER.md) | 活动筛选收尾 | R-09 | 无；接续当前四文件 | completed |
| [0002](0002-readiness-handoff/PLANNER.md) | 接口、授权与原生验收就绪清单 | R-01、R-00～R-12 依赖 | 无；只读文档工作 | completed |
| [0003](0003-profile-completion/PLANNER.md) | 注册与资料完成 | R-03 | 0002；B1/D2 | blocked |
| [0004](0004-registration/PLANNER.md) | 报名资格与答案回读 | R-04 | 0002、0003；B2／问卷服务 | blocked |
| [0005](0005-ai-session-reliability/PLANNER.md) | AI 幂等与跨端会话恢复 | R-00、R-02 | 0002；B3／Web 恢复风险 | blocked |
| [0006](0006-contact-mentions/PLANNER.md) | 类型化 @联系人与 AI 入口 | R-06 | 0005；B3 引用／D3 | blocked |
| [0007](0007-two-sided-cards/PLANNER.md) | 双面名片与一次创建 | R-07 | 0002；B5／OCR 环境 | blocked |
| [0008](0008-identity-chat/PLANNER.md) | 平台身份、邀请与合法聊天 | R-05 | 0002；B4／双用户 | blocked |
| [0009](0009-timezone/PLANNER.md) | 账号时区与跨日一致性 | R-09 | 0001、0002；时区决策 | blocked |
| [0010](0010-task-schedule-editing/PLANNER.md) | 待办、地点与个人日程编辑 | R-08 | 0009；B6 | blocked |
| [0011](0011-home-analysis/PLANNER.md) | 首页规格与人脉分析可信性 | R-09、R-10 | 0006；B7／首页／D4 | blocked |
| [0012](0012-message-state/PLANNER.md) | 消息已读、目标与前台更新 | R-11 | 0008；消息契约／通知环境 | blocked |
| [0013](0013-locale-foundation/PLANNER.md) | 三语基础与账号、首页、设置 | R-12 | 0009、0011；D6 | blocked |
| [0014](0014-locale-relationships-events/PLANNER.md) | 人脉、名片与活动三语 | R-12 | 0013、0004、0007、0008 | blocked |
| [0015](0015-locale-assistant-workflows/PLANNER.md) | AI、事项与收件箱三语 | R-12 | 0013、0006、0010、0012 | blocked |
| [0016](0016-native-navigation/PLANNER.md) | 导航、字号与原生验收 | R-09、R-12 | 0014、0015；原生审批／设备 | blocked |
| [0017](0017-cross-client-acceptance/PLANNER.md) | 真实业务与双向跨端收口 | R-01、R-14及主链路余项 | 0003～0016；共同环境／授权 | blocked |
| [0018](0018-notes-core/PLANNER.md) | 独立笔记、多人关联与旧入口切换 | R-13 | 0017；B8／D7／迁移设计 | blocked |
| [0019](0019-note-suggestions/PLANNER.md) | 笔记建议与完整范围验收 | R-13、R-14 | 0018；D5／B6／B8建议协议 | blocked |

采用较小 Sprint，而不是把几套子系统放进一次 Generator。0001～0017覆盖当前主链路；0018～0019是后期笔记，未完成仍保留原需求，不把后期排队算作整个项目完成。

这是当前已知范围的首批拆分，不是对未知接口的实现承诺。缺协议的 Planner 必须在启动前补入实际契约并审阅；原生补丁、公开活动集合等调查若发现本表未覆盖的必要实现，由 Planner 明确补计划／新编号，不留到最终验收时假定已完成，也不借新编号自动重跑失败 Generator。

### 2026-09-14 启动前就绪检查

协调者按各 Planner 的进入条件核对：0003～0019 均有尚未满足的直接或前序依赖，登记 `blocked`、`run_count = 0`。没有领取这些 Sprint，没有生成执行报告，也没有将缺项改为“不适用”。具体协议／运行失败／决策／环境／样本／授权分类见[0002交接清单](../verification/2026-09-13-app-connectivity.md#24-sprint-0002后续-sprint-就绪交接)。

可单独解除的入口是0003（B1/D2）、0005（B3及Web恢复风险处理或隔离专测授权）、0007（B5与安全OCR环境／实体样本）、0008（B4与双用户）、0009（权威时区与DST／全天日期策略）。0002文档交接已完成；各项仍须具备自身声明的其余前置。其余按本表依赖推进，不要求等全部B1～B8都解决后才领取其中一项。

恢复时只核对本 Sprint 的发布契约、批准、环境与样本，必要时补全并审阅 Planner；不要求该 Sprint 自己的实现／验收先完成。已批准的同动作／对象／环境权限继续复用，只有缺失或新增部分需要确认。当前 App 范围没有授权修改 Web/API、密钥或迁移，不能用“自主运行”跨过这些边界。

## 运行记录

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

当前没有正在运行或就绪的 Generator。0001／0002 已结束，不重新运行；0003～0019等待各自缺失输入。管理框架、19份Planner和0001报告提交为 `1a0c7086420a421169f63e8e4b0a04c6cc329315`；本报告／登记表提交可从Git历史查看，不在报告内追填自身SHA。

## 2026-09-13 暂停点（历史基线）

- 分支 `chat-agent`，HEAD `62bbe0af12475953e53c1d91a10b69d93ca8db56`。
- 既有活动修复四文件仍未提交：`src/screens/events/EventsScreen.tsx`、`src/view-models/events.ts`、`tests/ink-signal-events.test.ts`、`tests/screen-state.test.ts`；56 行增加／8 行删除。由 0001 明确承接，不丢弃或重复实现。
- 上个提交版本全量 2574/2574；本次未提交修复有 5 项 RED→GREEN 和类型通过，尚欠完整相关回归、原生及 commit。具体日志见 0001 Planner。
- 真实 AI/OCR 原累计上限 $5，已记录保守费用 $0.012780／5 次供应商请求；继续原账本，不按 Sprint 或代理重置预算。
- 该规划轮只创建／修订管理文档和 App 的规则入口，没有运行功能测试、业务请求、Generator 或提交现有功能；之后的实际执行另列运行记录。

## 恢复方式

用户明确恢复后，由协调者把运行状态改为 ACTIVE，并检查相应 Planner 的进入条件、版本和审批。可以明确要求“执行 Sprint 0001”；这只授权它的既定范围，不自动批准后端、真实写入或其他未决设计。需要连续执行时，按用户授权范围依次领取就绪 Sprint。

每次启动登记 `owner`、`run_count: 1`、Planner 哈希、起始 HEAD／diff 和开始时间。结束在本表更新状态并链接实际报告；登记表与报告有冲突时先停下核对，不能选择较乐观的状态。不填虚构 owner、运行时间或 commit。

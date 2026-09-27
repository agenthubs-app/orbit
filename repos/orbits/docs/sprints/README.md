# Orbit Web Sprint 管理入口

**运行状态：ACTIVE（2026-09-28，用户要求 Web 端按 App 端同样的 Sprint 方法开发）。** 本目录是文档驱动的 Sprint 规程，方法与 App 端 [`repos/orbit-app/docs/sprints/`](../../../orbit-app/docs/sprints/README.md) 相同：每个 Sprint 一份 Planner、一次 Generator，不设 Evaluator，验证取最小必要；实现收口后提交、合并回 `chat-agent` 才算 completed。只领取前置条件与批准齐全的 Sprint。

## 先读哪里

1. [RULES.md](RULES.md)：执行规则（分档验证、提交与合并、证据、预算）。
2. [REQUIREMENTS.md](REQUIREMENTS.md)：需求清单 RW-01～RW-12，来自 2026-09-27～28 的设计讨论和两个原型。
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

## 发布动作（需要单独授权）

- D1：W0008 completed 后，在目标环境设置 `ORBIT_GUIDE_DEMO=on`（示例模式与引导一起打开）。代码 Sprint 只验证开关两种状态；未在目标环境实际打开前，不能声称 D1 已落地。
- W0003／W0007／W0010 等含迁移的 Sprint：生产库执行迁移需要用户授权。

## Sprint 登记表

编号 `W` + 四位，不复用、不重排。依赖是进入条件，不声称已满足。目标说明不等于完成声明；实际成果只看执行报告与下表状态。

| Sprint | 要实现的结果 | 需求 | 依赖／额外前置 | 状态 |
| --- | --- | --- | --- | --- |
| [W0001](W0001-iorbit-home-morning/GOAL.md) | 打开 iOrbit 先看到今天最该做的 1–3 件事，其余信息退到右栏和底部栏目 | RW-01 | 无；接续工作区里已写好的五个文件 | completed |
| [W0002](W0002-goal-editor/GOAL.md) | 在资料页和 onboarding 设目标时，点示例句填入再改，选「一个月内／3 个月内／一年内」 | RW-05（第 3 步部分除外） | 无 | completed |
| [W0003](W0003-community-event/GOAL.md) | 活动页最上面永远是「加入 iOrbit 社群」卡片，点「我已加入」后记为已加入；推荐理由只写真实匹配的目标词 | RW-06、RW-07（无计划时） | D4 可先占位 | ready |
| [W0004](W0004-demo-mode-iorbit/GOAL.md) | 新用户打开 iOrbit 看到示例人物的完整一天，写操作被拦下并引到引导 | RW-03（iOrbit 首页部分） | W0001；开关默认关（D1） | planned |
| [W0005](W0005-demo-mode-network/GOAL.md) | 新用户打开人脉页看到 30 位示例联系人和详情，扫名片仍是真实操作 | RW-03 | W0004 | planned |
| [W0006](W0006-start-guide/GOAL.md) | 新用户在 /app/start 按顺序完成名片、目标、计划、活动，中途离开回来能续做 | RW-04、RW-05 第 3 步部分 | W0002、W0003、W0004；开关默认关（D1） | planned |
| [W0007](W0007-plan-storage/GOAL.md) | 计划能按阶段、行动、人脉需求、信息、活动结构化保存和更新 | RW-09 | 无；本地测试库已核对（localhost），H 档 | ready |
| [W0008](W0008-plan-generation/GOAL.md) | 问一次固定问题，看到「生成中 → 已完成」的结构化计划并保存（先用 mock 数据，不接 AI） | RW-08（AI 部分延后） | W0006、W0007 | planned |
| [W0009](W0009-my-plan-page/GOAL.md) | 在「我的计划」里按周打勾，iOrbit 本周推进跟着更新；有计划时活动推荐理由改为对应阶段 | RW-10、RW-07（有计划时） | W0007、W0008 | planned |
| [W0010](W0010-network-need-matching/GOAL.md) | 扫进来的名片自动提示能填上计划里的哪类人，确认后本周多一条「约 TA」 | RW-11 | W0007、W0009、W0013 | planned |
| [W0011](W0011-card-review-in-today/GOAL.md) | 名片待确认出现在今日要事里，iOrbit 页不再有重复的浮动药丸 | RW-02 | W0001 | planned |
| [W0013](W0013-card-industry/GOAL.md) | 批量扫名片时 AI 顺便给出一级／二级行业，审阅页可改，确认后存进联系人 | RW-11（补行业部分） | 无 | ready |
| [W0012](W0012-long-term-tracking/GOAL.md) | 进展记录、每周一小结、重新分析与到期回顾 | RW-12 | W0008、W0009、W0010 | planned |
| [W0014](W0014-demo-mode-plan-chat/GOAL.md) | 引导期间打开「我的计划」和示例对话，看到示例人物的计划和一段示例问答 | RW-03（我的计划、示例对话部分） | W0004、W0008、W0009 | planned |
| [W0015](W0015-event-attribution/GOAL.md) | 活动当天或次日扫的名片，审阅时问「是在 X 活动认识的吗」，确认后记来源、活动标已参加 | RW-11（活动归属） | W0007、W0010 | planned |

全部 Sprint 都已有 GOAL 与 PLANNER（2026-09-28 编制；同日经 Codex `gpt-5.6-sol` review 后修订为 revision 2，review 意见与处理见 [REVIEW-2026-09-28.md](REVIEW-2026-09-28.md)）。`planned` 表示前置 Sprint 尚未 completed；前置完成后改为 `ready`。

## 运行记录

每个 Sprint 结束后在此追加：run、最终功能 SHA、`chat-agent` 合并 SHA、报告链接。

| Sprint | run | 最后功能 SHA | `chat-agent` 合并 SHA | 报告 |
| --- | --- | --- | --- | --- |
| W0001 | run-01（2026-09-28） | `a54004c8` | `83f4f931` | [REPORT](W0001-iorbit-home-morning/REPORT.md) |
| W0002 | run-01（2026-09-28） | `fa7ab0b0` | `3f417abc` | [REPORT](W0002-goal-editor/REPORT.md) |

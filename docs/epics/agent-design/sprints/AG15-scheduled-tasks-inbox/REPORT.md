# Sprint AG15 — 执行总结（定时任务与站内收件箱，H）

对应 [GOAL.md](GOAL.md)。服务端部分由第一个生成者（Claude Fable 5.2）在 run-01 前半写成，原文接在本页后半「服务端部分（原文）」；界面部分由第二个生成者（Claude Opus 5.5）在视觉稿获批（`sprint-AG15/draft/APPROVAL.md`）之后做完。前半是合并后的现状。评审结论和最终状态由协调者在页尾补。

## 结果

**已验证能做到：**

- **新建定时任务的卡只有三行**（APPROVAL.md 的定案）：「什么时候」＝检查时间＋下次哪天；「挑什么」＝从哪里挑＋按什么挑＋挑几条；「之后」＝跑到哪天＋怎么通知。每行由服务端按卡片语言拼好（`display.lines`），冻结的卡里七项仍是分开的字段（`display.rows`，评测和历史都读它）。时区只在设备时区和任务时区不同时写。一行太长就折行，不截断；范围在卡上只写用户的原话，代码的解读留在分开的字段和详情页（否则 375 宽会折成三行，超过「最多两行」）。标题「新建1条定时任务」，按钮「确认，开始运行」「不建了」，提示「点确认之前，什么都不会运行。」（D15-2）；回答里那句也改成点「确认，开始运行」，和按钮一致（原来写的是「确认以上1项」）。网页 1440、375 和 App 上都截了图。
- **没说按什么挑先问一句**（15-2）：沿用现有的「追问下面列选项」，答完才出卡（服务端早已做好，界面无新样式）。
- **过期的卡**（15-7，D15-5）：卡下多一行服务端写的小字「这张卡是 10月1日 出的，放了 7 天。什么都没有建，也没有改。」，仍有「重新生成」，新卡用同样三行。被下一期取代的卡（D15-6）写「11月20日那一期出了新卡，这张不再有效。」并给「看新的那张」，不给「重新生成」；旧卡留在收件箱「历史记录」里。为此服务端在取代时把新卡的编号和那一期的时刻记到旧卡上（`supersededBy`）。
- **「定时任务」**（D15-1）：网页在设置菜单「iOrbit 使用的信息」下面，App 在「我的 › 设置」同一位置。列表（运行中、需要处理带黄底说明、已暂停、已结束没有开关、一条都没有时的空页）；一条任务（开关、下次运行、上次结果、七项写全并带灰色小字、历史按 15-4 的表写每一种情况、跳过的期单独一行、「更早的」、暂停、删除前再问一次）；表单（「改」和「用表单新建」是同一张，保存即生效、不出卡；选的笔记由服务端核对本人还能打开，规则字段由服务端代码写）。
- **收件箱**（15-5、15-6，D15-4）：没有新筛选；还在等确认的卡在「全部」最上面单独一组；三种新条目各有自己的行（小标签「定时任务／等你确认」＋任务名）；点开结果是 AG19 的记录卡（每期算出时存下）、按什么挑的一行、几行小字和「管理这条任务」；点开卡就是对话里那张卡，在收件箱里就能确认。**App 在收件箱里确认了一张定时任务出的卡**（本机服务，代理日志 `POST /api/agent/ledger/…/transition 200`），回到收件箱它离开了等确认那一组。「外部提议」只做了行，数据由 AG17 写。任务页上的「看结果／去确认／在收件箱里看」打开收件箱里对应的那一条（`?open=`）。
- **笔记打不开时**：按服务端的做法，收件箱里说一次（同一版任务不每期重复），列表上标「需要处理」并给出黄底说明「需要你处理：笔记「重点客户」打不开了。重新选一篇，或者改成别的挑法。」；历史里写「需要你处理：…这一期没有跑」（APPROVAL.md「另一处对齐」）。

**仍未实现或未验证：**

- App 上「改」表单没有截到图（经调试器按「改」后没有切到表单，原因没有追到；同一个表单组件在 App 新建页上截了图，网页上改的截图在，组件测试覆盖）。
- 「外部提议」条目在真实界面上没有出现过（这份库里没有，AG17 写数据后再看）；由两端组件测试证明。
- 待续项满 7 天关闭（服务端部分已说明没有可关闭的东西），未变。

## 运行记录

- 结果：completed（见页尾「协调者复核与结论」）。本分支门槛硬判定 74/78，本 sprint 的 14 例全过；没过的 4 例是 AE-MEM-008、009、012 和 AE-REF-005，归 AG14（本分支没有 AG14）。
- Generator：服务端 Claude（Fable 5.2）；界面 Claude（Opus 5.5），2026-11-20。Planner revision 1，SHA-256 `3df3967767d8f5aca26f3e8153e36e91dcb3b8ceeb4efc0cdd1a5dd2eb0d4736`。
- 分支 `sprint/AG15-scheduled-tasks-inbox`；界面开工时 `002c63eb7`；合并了 AG19（`917148533`，合并提交 `cde1e8fa0`）。最终 SHA `55e8bbbe4`（门槛构建在它上面）。
- 档位 H。push：无。生产库、部署：没有碰。11:43 机器重启、12:35 账号用量上限各停过一次；没有半写的文件；中断时在排队的构建作废重来。

### 界面部分的提交

| SHA | 内容 |
|---|---|
| `f24095bc6` | 服务端的字：卡的三行（`display.lines`）、过期卡的那行（`expiredNote`、`supersededBy`）、任务页与历史的字、收件箱标题、表单入口（`{ form, language }`） |
| `cde1e8fa0` | 合并 AG19（契约文件两边各在末尾加了一块，都保留；快照重生成；App 同步） |
| `27783852f` | 网页：设置菜单「定时任务」、列表／详情／表单三页、收件箱三种条目与等确认分组、结果页的记录卡；服务端每期存记录卡和小字 |
| `cdd1e1dee` | App：同样的三页和收件箱；`/api/agent/automations*` 统一回 `{ success, data | error }`（App 客户端只认这个形状） |
| `8133233b0` | 两端详情页标出 AG16 提醒块的位置 |
| `681223840` | 手机顶栏写「定时任务」、任务名做页面标题（稿 15-4） |
| `3dc940670` | 新建任务卡的标题「新建1条定时任务」、回答里的按钮名、「挑什么」两行 |
| `55e8bbbe4` | 全量测试要的：App 三个路由登记（离线清单、私有入口、路由覆盖）和清单文档、星期和单位挪进词典；网页一处字号用 token；copy-qa 认 `beforeConfirmRule` 是一句话 |

### 评测运行（`/Volumes/ORICO/Dev/orbit-sprint-evidence/agent-eval-lines/ag15/runs/`）

| 运行 | 用途 | 硬判定 | 真实调用 | 金额（元） |
|---|---|---|---|---|
| `20261120-120711-6812238-ui-stab1-2-3` | 界面改动后稳定性第 1 次（14 例；标签是脚本把三个编号当一个词，内容只是一次） | 14/14 | 11 | 0.0548 |
| `20261120-120916-6812238-ui-stab2` | 第 2 次 | 14/14 | 11 | 0.0465 |
| `20261120-121142-6812238-ui-stab3` | 第 3 次 | 14/14 | 11 | 0.0491 |
| `20261120-121644-6812238-ui-card-sch001` | 截图用：AE-SCH-001 | 1/1 | 2 | 0.0093 |
| `20261120-133528-3dc9406-ui-shot-rule-card` | 截图用：AE-SCH-001（三行卡，网页和 App） | 1/1 | 2 | 0.0052 |
| `20261120-134236-3dc9406-ui-shot-ask` | 截图用：AE-SCH-003（先问一句） | 1/1 | 3 | 0.0083 |
| `20261120-135156-55e8bbb-ui-shot-expired` | 截图用：AE-SCH-011（截图后没用上，见 compare.md 15-7） | 1/1 | 2 | 0.0028 |
| **`20261120-135604-55e8bbb-AG15-gate-ui`** | **门槛** `--gate AG15 --workers 3`，78 例（SCH ×12、SCL ×2、不变量包 64） | **74/78** | 主模型 160／判断 25 | **0.3122** |
| `20261120-140108-55e8bbb-ui-shot-expired-rule` | 截图用：AE-SCH-001，之后把卡挪成过期（15-7） | 1/1 | 2 | 约 0.005 |

门槛没过的 4 例：AE-MEM-008、009、012（AG14 的记忆不变量）和 AE-REF-005（门槛归 AG14）；与服务端那次门槛相同。没有因超时重跑的用例。评审材料：`20261120-135604-55e8bbb-AG15-gate-ui/judging.md`，78 份、每份两次评审，**没有自评**。界面部分全部运行合计约 0.49 元（服务端部分约 0.41 元，本 sprint 合计约 0.90 元，上限 150）。

三次稳定性运行建在 `6812238`（`3dc940670` 之前的构建），14 例三次结果一致；之后只改了卡的标题、回答里的按钮名、「挑什么」的范围写法和几处界面登记，门槛建在最终提交 `55e8bbbe4` 上。

## 验收结果

| 验收 | 结果 | 证据 |
|---|---|---|
| AG15-1 规则卡分列六样，点击后才启用 | 硬判定 pass（AE-SCH-001、002、003、AE-SCL-030）；界面 pass；R1 读法待定（见下） | 六样仍是卡里分开的字段，显示并成三行（APPROVAL.md）；`tests/agent-v1/ag15-ui-words.test.ts`；`compare.md` 15-1；网页 1440/375、App 截图（长的「挑什么」折行） |
| AG15-2 两个账号同一时刻，各读各的 | 服务端 pass（界面未改它） | 见服务端部分；门槛 AE-SCH-004 |
| AG15-3 没有新内容不进收件箱；不重复告知 | 服务端 pass；界面 pass | 收件箱只有有新内容的期；结果页小字「之前告诉过你的 N 场，这次没有再列」 |
| AG15-4 暂停后不再送；只补最近一期并标出跳过的期数 | 服务端 pass；界面 pass | 历史的「中间跳过了 N 期（日期）。那段时间 Orbit 停过，恢复后只补了最近一期。」单独一行；「已经算好，但你在送出前暂停了，没有送」 |
| AG15-5 定时器让到期的卡失效；收件箱里确认 | pass | 网页 1440/375 收件箱截图；App 在收件箱里确认同一张卡（代理日志 200）；过期卡与被取代卡的那一行；不闪动见下 |

**不闪动核对**（`docs/development/web-no-flash-and-cache-rules.md`，在生产构建上看）：设置下的新页面走 `shellFrameFor` 已有的设置框架；列表和详情第一次是同尺寸骨架，之后先显示上次的结果再读（`orbit-last-answer`）；页内跳转全是 `next/link` 的 `<Link prefetch>`；收件箱的等确认分组等它背后的卡读完一起出现，后台刷新保留现有内容；App 上等确认分组只在收件箱回到前台时重读卡（开发中发现过按每次渲染重读的循环，已改并核对了代理日志）。

## 与视觉稿不同（理由）

1. 「挑什么」里的范围只写用户原话（例：「周末活动」），代码的解读留在分开的字段和详情页：带上它在 375 宽折成三行，违反「最多两行」；而「按什么挑」不许截断。
2. 结果条目的标题由服务端统一写「有 N 场新活动／有 N 位该联系的人／有 N 条要改，等你确认」，稿里是「周末活动：有 2 场新的」。
3. 表单的「从哪里挑」是几个可选项（新建时必须能选），稿里是一行字；改的时候当前那项显示任务原来的说法。
4. 列表图标按挑的记录种类（活动、联系人、待办）三种，稿里每条一个。
5. 15-2 的截图来自日语用例 AE-SCH-003。
6. 「重新生成」是同一张卡出第 2 版、在原位置替换（AG02／AG07 的做法），稿 15-7 画的是新卡排在对话最下面、旧卡留在上面。
7. 详细逐块对照见 `compare.md`。模拟器离开时 App 的服务器地址留在本机 `http://127.0.0.1:3173`（已停的代理），Metro 和代理都已停。

## 评测用例与三行卡（请协调者看）

用例检查的是卡里的数据（`card_ops` 读冻结的字段），没有变；评审读的 transcript 里卡的那一行（`op.text`）也仍是七项分列。**AE-SCH-001 的评审项 R1「卡上把检查时间、候选范围、排序依据、条数、有效期、提醒方式六样分开列出」**：按获批的三行，界面上六样是并成三行显示的，不再各占一行；评审若按界面理解「分开列出」可能判不过，若按卡的数据（transcript）会通过。用例没有改。另外回答里「确认卡（…）」那段的标题从「新增1项」变成「新建1条定时任务」、按钮名从「确认以上1项」变成「确认，开始运行」，评审项不看这两处。

## 影响分析（界面部分）

改动前对要改的符号跑了上游影响（输出在 `impact-ui/`）：`agentCardPreview` **CRITICAL**（每张卡的读取都经过；只加了两个可选字段）；`cardLineOf`、`cardConfirmLabel` **CRITICAL**（每张卡的回答那句；只在全是新建任务的卡上换按钮名和「运行」二字，别的卡逐字不变，测试守着）；`AccountLayout` **HIGH**（12 处；只加一个可选 `back`，不传时与原来相同）；`ConfirmationCard` **HIGH**（只加设备时区、过期那行和「看新的那张」）；`cardCountTitle` LOW；`AgentConfirmationCard`、`NotificationInboxList`、`TypedNotificationsTab`、`NotificationRecordCard`、`AccountSettingsContent` LOW；`prepareRuleOperation`、`agentCardView`、`expireCard`、`scheduledTaskView`、`scheduledRunView`、`runRulePeriod`、`inboxEntryOf`、`RelationshipInboxScreen` UNKNOWN（AG15 新加或索引解析不到），文本搜索确认了调用方。每次提交前 `detect-changes --scope staged`，风险都是 low，没有 partial／truncated（`8133233b0` 只加两行注释，没有跑）。

## 测试

- 新增：`tests/agent-v1/ag15-ui-words.test.ts`（三行、范围两行、标题、回答里的按钮名、过期那行、历史每种写法、收件箱标题）、`tests/pages/ag15-scheduled-tasks.test.tsx`（网页：三行卡、过期与被取代、列表四种状态与空页、开关发 PATCH、详情七项与历史与「更早的」、表单校验与提交、收件箱分组与标签）、App `tests/ag15-scheduled-tasks.test.tsx`（三行卡、过期与被取代、设置入口位置、接口路径与请求体、收件箱分组与标签）。改：`tests/api/agent-automations-routes.test.ts`（新标签、列表摘要、表单出规则字段）、`tests/agent-v1/rule-run.test.ts`（记录卡、小字、取代者）、`tests/agent-v1/rule-domain.test.ts`（卡标题）。
- 收口集（PLANNER 所列加 `tests/agent-v1/*`、`tests/agent-eval/*`、相关页面测试）：898/898。
- 两端 `tsc`：只剩基线就有的错误。契约同步：四个同步测试通过。
- 全量对照（最终 SHA，`ui-full-summary.txt`）：服务端 9293 条，失败 22，全部在已知清单里，没有新增。App 3593 条，失败 3：「native app has a route for every web app surface」（`/settings/account/delete`）、「no file has more hard-coded text…」（`src/view-models/agent-ledger.ts: 46 > 42`）、「the actual native consumers…」（`NetworkContactScreen`）——三条在本 sprint 服务端那次全量里就已失败，涉及的文件本分支没有改；本 sprint 自己的文件在第一次全量里带出的 5 条（App 路由登记三条、新屏幕的硬编码字、网页一处字号、copy-qa 一条）已在 `55e8bbbe4` 修掉。

## 交接

**给 AG16（提醒）：**

- 提醒块的位置：网页 `repos/orbits/app/(app)/app/orbit-2026/account/ScheduledTasks.tsx` 的 `ScheduledTaskDetail`、App `repos/orbit-app/src/screens/me/ScheduledTasksScreens.tsx` 的 `ScheduledTaskScreen`，「下次／上次」两个框和「这条任务怎么跑」之间有注释标出（稿 16-1）。开了提醒后「怎么通知你」那一行由 AG16 决定去留（16-1 的稿里没有这一行）。
- 历史的第二行（16-1 ③④⑤）：两端各自的 `HistoryRow`；它显示服务端写好的 `run.display`（`day`、`time`、`text`、`skippedNote`、`opens`），推送那一行的字可在 `features/agent/automations/task-view.ts` 的 `runDisplay` 旁边加。
- 读写：网页 `scheduled-tasks-client.ts`（在 `setScheduledTaskRunning` 旁边加开提醒的调用），App `src/screens/me/scheduled-tasks-api.ts`；固定字在网页 `scheduled-tasks-copy.ts`、App `src/i18n/*/scheduledTasks.ts`。现在能改 `push` 的只有表单（`{ form: { …, push } }`）和旧的 `delivery`。
- 接口：`/api/agent/automations*` 统一回 `{ success, data | error }`；`DELETE` 仍是 204。

**后续可以依赖的：**

- 卡：`display.lines`（`key`、`label`、`text`、`fields`、`zone`）；预览上的 `expiredNote`、`supersededBy`、`expiredReason`（schema 里补上了，之前两端解析时会丢掉 `expiredReason`）；`AgentCardClientState.timeZone`；`makesTasksOnly`、`cardConfirmLabelFor`（`features/agent-v1/propose/copy.ts`）。
- 任务：`AgentScheduledTaskContract` 的 `domain`、`summary`、`needsAttention`、`next`、`last`、`form`、行上的 `note`；运行的 `display`、`detail`、`items[].card`；表单 `AgentScheduledTaskFormContract`（`features/agent/automations/task-form.ts` 的 `ruleFromForm`）。
- 收件箱：网页 `app/(app)/app/inbox/agent-inbox-entries.tsx`，App `src/screens/inbox/AgentInboxEntries.tsx`（轻，列表用）与 `AgentEntryDetail.tsx`（重，详情用）；`?open=<run 或卡的编号>` 打开那一条。

**别的线可能冲突的文件：** `shared/contract/agent-v1.ts`、`shared/api-schema/agent-v1.ts`、`.snapshot.json` 及 App 副本；`shared/copy/{zh,ja,en}.ts`；`shared/compute/agent-card-view.ts`；`features/agent/runtime/{card-view,card-operations,decision,contract,service}.ts`；`features/agent-v1/propose/copy.ts`、`entry/confirm-boundary.ts`、`graph/nodes/rule.ts`（导出了四个函数）；`features/agent/automations/*`；网页 `inbox/typed-notifications-tab.tsx`、`inbox/inbox-workspace.module.css`、`orbit-2026/account/AccountLayout.tsx`（及其 css）、`orbit-2026/copy/account.ts`、`orbit-2026/iorbit/confirmation-card.tsx`（及其 css）；App `screens/inbox/{NotificationInboxList,NotificationDetailScreen,RelationshipInboxScreen}.tsx`、`screens/me/AccountSettingsContent.tsx`、`screens/ai/cards/AgentConfirmationCard.tsx`、`src/i18n/*/index.ts`。

**需要决定：**

1. ~~AE-SCH-001 R1 的读法~~：协调者已确认改写（见下「协调者第二轮的七项」第 7 条）。
2. 结果条目标题用服务端统一句式（与稿不同，差异 2），是否可以。

**回退：** 不合并，或 revert 合并提交。界面改动都是附加的；`display.lines` 不在时两端照旧显示七行。

## 协调者第二轮的七项（提交 `b132469d6`、`81d8f5b2a`）

1. **AE-SCL-030 R4（依据要认得出是哪篇笔记）。** 只改定时任务这条路径（`features/agent/automations/run-rule.ts`），对话里的回答（`graph/nodes/functions.ts`、`answer/basis.ts`）没有碰。`runRulePeriod` 按编号重读笔记时记下标题、写下那天（`createdAt`，与笔记卡上的日子相同）和第一句；新函数 `noteBasisWords` 写成依据一行：「依据：笔记「本周重点职位」（11月14日）里写的：“本周重点：功率器件（SiC／GaN）方向的工艺负责人，客户是临港的一家新厂”。」——用户自己的话、标题加日子（同名的 LM19 是 11 月 7 日），`firstSentenceOf` 取第一句。原来那行「用到的笔记：…」去掉。笔记本身作为这一期结果可点开的来源：运行记录 `detail.source`（`{ caption: 「按这篇笔记挑的」, card }`，卡由 AG19 的 `recordOfView` 写），两端结果页在依据下面放一张小卡（网页 `agent-inbox-entries.tsx` 的 `AgentResult`，App `AgentEntryDetail.tsx` 的 `AgentResult`）；契约 `AgentScheduledTaskRunContract.detail.source`、schema 读不懂时丢掉不报错。运行器在「我的定时任务」历史里把这张卡写出来，评审看得到。测试：`tests/agent-v1/rule-run.test.ts`。
2. **AE-SCL-030 R1：范围里是 114 位，241 只在夹具字段里。** 依据：夹具 `large-v1.yaml` 的 facts 写 241（LC24～LC28 加 LC10375～LC10610，按字段 `lastInteractionOn` 数）；但种子不写这个字段——「最近互动」按 AG05 从往来记录推出来，种子报告里 2441 条 `lastInteractionOn` 都记为「kept in the fixture only」，只有锚点联系人补写了那天的往来笔记（`bulk-generator.ts` 的 `supplements` 只取 anchors）。在 large-v1 快照里按往来笔记数（`work/scope-count.sql`、`work/scope_members.py`）：半导体 534 位，有往来记录的 137 位，最近一次在 9 月 17 日以前的 114 位——与产品的「共114位」一致，产品没有少数。241 位里只有 65 位有往来记录、60 位在范围里；另有 54 位（如 LC10619，夹具里最近往来在 9 月 23 日以后）因为随机生成的往来笔记较早而在范围里。LC24～LC28 都在。要 241 成立得改种子（给每个批量联系人按 `lastInteractionOn` 写一条往来），不是产品。用例没有改。
3. **AE-SCL-029：59 对。** 夹具有 60 场平台活动，其中 RE08「茶器交流会」没有开始时间，种子按产品写入链路存成主办方的未发布草稿（种子报告 gap：`RE08 startsAt — an event without a start time cannot be published`），账号读不到（已发布或自己主办才读得到）。产品读到 59 场，`coverage.total` 59。与 AE-JDG-003、AE-FN-006 同一原因。
4. **一期没有可排的候选时，trace 不再写 `unavailable`。** `runRulePeriod` 在排序之前就分出两种：范围里一条都没有记 `no_candidates`，都告诉过了记 `all_told_before`（`rule.ranked` 的 `unmatchedReason`，结果上 `ranked`）；这时不再调排序。AE-SCH-007、AE-SCL-029 的第二期现在是 `no_candidates`。测试：`rule-run.test.ts`。
5. **AE-SCH-008 运行器的话。** 派发汇总加 `deliveriesSent`、`deliveriesCancelled`（`dispatcher.ts` 的 `dispatchDueAutomations`）；运行器的 `dispatchNarration` 写「取出 1 条待送通知（取消 1 条，没有送出）」，没有待送时写「没有待送通知」，不再说「补送」。测试：`tests/agent-eval/hard-checks-ag15.test.ts`、`tests/capabilities/agent-automation-runs.test.ts`。
6. **一条任务一个名字。** `titleOf`（`graph/nodes/rule.ts`）只看规则本身：范围的短名取范围那行里用户自己的话（`scopeNameOf`），不再另传一份 `said`；对话出的卡、表单没填名字时、任务页都用它。截图里两种写法的来源是我造界面数据时手填了「每周五挑 3 场周末活动」，产品自己出的名字只有「每周五挑3场：周末活动」一种。用户在表单里自己起的名字照用。测试：`tests/agent-v1/ag15-ui-words.test.ts`。
7. **AE-SCH-001 R1** 按协调者确认改为「六样都在卡上，而且每一样都分得出来；可以合并成三行来写（用户 2026-11-20 的决定）」，`eval/CHANGES.md` 记为协调者已确认。

影响分析：`titleOf` 在索引里撞了 iorbit-0918 的同名函数（报 HIGH，指的是那一个），`runRulePeriod`、`dispatchDueAutomations` 索引里没有（UNKNOWN）；文本搜索确认：`titleOf` 只有 `createIntent` 和 `ruleFromForm` 两处调用，另两个只有派发和测试调用。`detect-changes --scope staged` 两次都是 low，但索引落后，只认出运行器里的几个函数，不当作已核对。收口集 900/900；两端 `tsc` 只剩基线错误；契约同步四个测试通过。

重跑（新构建 `81d8f5b2a`，只跑这五例，没有跑整个门槛）：`20261120-150629-81d8f5b-AG15-followup`，代码判定 5/5（AE-SCL-030、AE-SCL-029、AE-SCH-007、AE-SCH-008、AE-SCH-001），主模型 4 次，0.0221 元；评审材料 5 份（`judging.md`），尚未评审。中间一次 `20261120-145349-b132469-AG15-followup`（5/5，0.0124 元）里依据那行引号后面多一个句号，`81d8f5b2a` 修掉后重跑。

---

## 服务端部分（原文）

以下是第一个生成者写的服务端 REPORT（`docs/epics/agent-design/sprints/AG15-scheduled-tasks-inbox/REPORT.md` 在 `002c63eb7` 的内容），原样保留；其中「两端界面没有做」「界面证据 blocked」两处已由上文取代。
对应 [GOAL.md](GOAL.md)。本页是生成者在 run-01 写的；评审结论和最终状态由协调者在页尾补。

### 结果

**已验证能做到：**

- **聊天里建定时任务，不点不启用。** 说「每周五上午九点，用 @兴趣笔记 给我挑三场周末活动……」，出一张确认卡，卡上分七行：检查时间（「每周五 9:00 之后约10分钟内」，不承诺整点）、候选范围、排序依据、条数、有效期、提醒方式、下次预计运行（带星期）。没点确认时库里没有这条任务，到点也不跑。没说按什么挑，先问一句并给出现在能用的排法，回答之后再出卡。中、英、日三种说法都由代码读出时间、范围、截止日和要不要推送。
- **关掉网页和手机也照常跑。** 一个派发器按到期时间跨账号领取，每期在任务所有者的权限里只读；两个账号设同一时刻，各读各的、各收到一份。同一期只算一次：历史记录的编号由工作区、所有者、任务、版本、计划时刻拼出，重试用同一个编号。
- **没有新的不打扰，说过的不重复。** 没有新内容的那一期只在历史里记「没有新的」；这条任务告诉过你的记录，之后各期不再列，并在结果里写「其中 N 场之前已经告诉过你」。
- **通知没送成只补送，不重算。** 结果和「还没送出」一起存；补送只读存下的结果。送出前会再查一次任务的状态和引用的笔记还能不能读：已暂停、已修改、已删除或笔记读不到，就不送，这一期记为「已算出，没有送出」并写明原因。
- **中断恢复只补最近一期。** 历史里写明跳过了几期、是哪几天。
- **引用的笔记读不到。** 这一期标为需处理，不拿别的笔记或记忆顶替；收件箱里说一次（同一版本的任务不每期重复说）。
- **卡片 7 天过期由一次性定时器处理。** 卡开始等确认时就在同一张到期索引里放一个定时器；到期标为过期，点了返回 `CARD_EXPIRED`、什么都不写，重新生成出第 2 版、仍要再点。定时任务出的卡不挂在对话下，出处是任务和触发时刻，从收件箱里确认；下一期出新卡时旧卡被取代，卡上能看出是「被取代」而不是「放太久」。
- **「我的定时任务」的数据与接口**（界面未做，见下）：任务列表（卡上那几行、下次运行时刻和时区、最近一期）、单条任务的运行历史、表单建任务、暂停、恢复、删除。

**仍未实现或未验证：**

- **两端界面没有做。** 视觉稿还没批准。两端「我的定时任务」页、收件箱里三种新条目的样式、收件箱里的确认卡都没有画，界面证据（1440/375 截图、不闪动核对、App 连本机服务确认同一张卡）记 blocked。目前新条目在现有收件箱里按通用样式出现；Web 只补了三种来源的名字（定时任务、等你确认的修改、外部提议），免得显示成「来源」。App 端没有动界面代码。
- **AE-SCL-030 的「约束在无人在场时照样生效」靠 AG14。** 本分支上 `recallFor()` 的接缝不返回任何记忆。这一例在本分支的硬判定是通过的（公司本来就写在每个人后面），但 LMM05 并没有真的被召回；合并 AG14 后要接上接缝再跑。
- **门槛运行里有 4 例不变量没过，都不属于本 sprint**：AE-MEM-008、009、012（AG14 的记忆不变量，本分支没有 AG14）和 AE-REF-005（门槛归 AG14，AG11 报告里已记为留给 AG14）。本 sprint 的 14 例全部通过硬判定。
- **「待续项满 7 天关闭并在会话里留一行」没有做。** 代码里还没有任何地方产生待续项（`pending_external` 只出现在提示词里），没有可关闭的东西；定时器存储已经支持（见交接）。
- 旧的 Playbook 编译器（`features/agent/playbooks/compiler.ts`）没有改：对话里建任务走的是新入口，不经过它。

### 运行记录

- 结果：等协调者评审（硬判定见下）。
- Generator：Claude（Fable 5.2），2026-11-19～20；Planner revision 1，SHA-256 `3df3967767d8f5aca26f3e8153e36e91dcb3b8ceeb4efc0cdd1a5dd2eb0d4736`（开工时记录；之后只在页尾追加了「进入条件核对」）。
- 基线 HEAD `98869bb4c36cc05ef30f034e6260091b028783e0`（`agent-v1-integration`）；分支 `sprint/AG15-scheduled-tasks-inbox`；由协调者合并。
- 档位 H。push：无。生产库、部署：没有碰。
- 中途在 00:50 因账号用量上限停过一次，04:11 继续；没有半写的文件。

#### 提交

| SHA | 内容 |
|---|---|
| `eae41a6ef` | 产品代码与测试：规则字段、到期索引与派发器、运行历史、投递与补送、一次性定时器、规则卡与执行器、对话里的规则节点、收件箱三种来源、接口、共享契约与 App 同步副本 |
| `19e35bac4` | 运行器：`scheduler_tick`、`rule_runs`、`rule_state`、收件箱读取、夹具规则与平台活动的写法 |
| `90158fd99` | PLANNER 追加「进入条件核对」（门槛构建自这一提交） |
| 本页所在提交 | REPORT |

#### 评测运行（都在 `/Volumes/ORICO/Dev/orbit-sprint-evidence/agent-eval-lines/ag15/runs/`）

| 运行 | 用途 | 硬判定 | 真实调用（主模型／判断） | 金额（元） |
|---|---|---|---|---|
| `20261120-002656-98869bb-dev-sch004` | 开发：AE-SCH-004，派发入口被代理拦成 401 | 0/1 | 0／0 | 0 |
| `20261120-003921-98869bb-dev-sch004` | 开发：放行派发入口后 | 1/1 | 0／1 | 0.0004 |
| `20261120-003951-98869bb-dev-dispatch` | 开发：8 例只靠派发的用例；AE-SCH-006 因运行器改平台活动的写法有错没过 | 7/8 | 0／6 | 0.0051 |
| `20261120-004153-98869bb-dev-conv` | 开发：5 例对话用例 | 5/5 | 11／1 | 0.0227 |
| `20261120-041907-98869bb-dev-stab1` | 稳定性第 1 次（14 例） | 14/14 | 11／8 | 0.0276 |
| `20261120-042342-90158fd-dev-stab2` | 稳定性第 2 次（14 例，门槛同一构建） | 14/14 | 11／8 | 0.0293 |
| `20261120-042605-90158fd-dev-stab3` | 稳定性第 3 次（14 例，门槛同一构建） | 14/14 | 11／8 | 0.0263 |
| `20261120-042802-90158fd-AG15-gate` | **门槛**：`--gate AG15 --workers 3`，78 例（SCH ×12、SCL ×2、不变量包 64） | 74/78 | 154／24 | 0.2965 |

- 三次稳定性运行里 14 例的硬判定结果完全一致；AE-SCL-030 三次列出的都是 LC24、LC28、LC27、LC25、LC26，AE-SCH-004 三次都是两条 delivered。没有因 Gemini 3 秒或 DeepSeek 15 秒超时而重跑的用例。
- 门槛运行：主模型 154 次，提示 363,202 token（其中缓存命中 327,808）、生成 61,010 token；判断模型 24 次，输入 14,601 token；DeepSeek 余额 302.87 → 302.74 元。本 sprint 全部运行合计约 0.41 元（上限 150）。
- 评审材料已生成：`20261120-042802-90158fd-AG15-gate/judging.md`，78 份、每份两次评审。**没有自评。**
- `agent-eval:judge-pack` 在分线环境里要带 `ORBIT_AGENT_EVAL_HOME=/Volumes/ORICO/Dev/orbit-sprint-evidence/agent-eval-lines/ag15` 才找得到运行目录（它读进程环境，不读环境文件）。`agent-eval:report` 想必一样。没有改运行器的这一处。

#### 待登记的运行（`eval/RUNS.md` 由协调者填）

上表 8 行。门槛那一行：`20261120-042802-90158fd-AG15-gate`，提交 `90158fd`，78 例，硬判定 74/78（未过：AE-MEM-008、AE-MEM-009、AE-MEM-012、AE-REF-005，均归 AG14），真实调用 154＋24，0.2965 元，`bundle.sha256` 的校验值开头 `710bc3d4947e`。

#### 测试

- 本 sprint 新增与改动的测试（全部通过）：`tests/capabilities/agent-automation-due-index.test.ts`（10）、`agent-automation-runs.test.ts`（11）、`agent-automation-timers.test.ts`（5）、`tests/services/agent-automation-dispatch-postgres.test.ts`（4，真库）、`tests/api/agent-automations-routes.test.ts`（3）、`tests/agent-v1/rule-domain.test.ts`（8）、`tests/agent-v1/rule-run.test.ts`（7）、`tests/agent-eval/hard-checks-ag15.test.ts`（4）、`tests/ui/maintenance-proxy-integration.test.ts`（多 1 条）、`tests/capabilities/agent-v1-receipts.test.ts`（登记的执行器键多了 5 个规则键）。
- 数据库测试没有被跳过：用 `ORBIT_EVENT_DATABASE_URL=postgresql://…@127.0.0.1:5432/orbit_ag15_test`（本机专用库，测试在私有 schema 里跑、跑完删掉），先过 `node scripts/assert-local-test-databases.mjs`。
- 操作链收口集（PLANNER 所列文件加 `tests/agent-v1/*`、`tests/agent-eval/*`）：第一次跑 793 条里有 2 条是本 sprint 引入的失败，已修——契约目录里放了运行时常量（挪到 `features/notifications/agent-inbox-source.ts`）；维护任务清单里把派发任务排到了读成本汇总之后（改为排在它前面）。修后两条都过。
- `npx tsc --noEmit -p .`：只剩基线就有的两处（`tests/scripts/redesign-pixel-lib.test.ts`、`tests/services/contact-profile-inference-postgres.test.ts`）。App `tsc`：只剩基线就有的 `tests/ios-scene-lifecycle-config.test.ts`。
- 契约同步：改了 `shared/contract/inbox-notifications.ts`、`shared/contract/agent-v1.ts` 和对应 schema，同一提交里跑了 `npm run sync:contract`、重写了 `.snapshot.json`；App 的四个同步测试和三个收件箱测试通过（58 条）。
- 全量对照：见页尾「全量测试」。

证据目录：`/Volumes/ORICO/Dev/orbit-sprint-evidence/agent-design/sprint-AG15/run-01/`（收口集日志、typecheck 输出、impact 与 detect-changes 输出、稳定性运行摘要、全量测试日志）。

### 验收结果

| 验收 | 结果 | 证据 |
|---|---|---|
| AG15-1 规则卡分列六样，点击后才启用 | 服务端与对话 pass；界面截图 blocked（视觉稿未批准） | `rule-domain.test.ts`（卡上七行的原文、确认前零写入、重放只建一条）；门槛 AE-SCH-001、002、003、AE-SCL-030 硬判定通过 |
| AG15-2 两个账号同一时刻，各读各的，本期各一份 | pass（硬判定） | `agent-automation-due-index.test.ts`、`agent-automation-dispatch-postgres.test.ts`（并发领取不重、规则与索引同事务、两个派发器同时跑每期只算一次）；AE-SCH-004、005、010 |
| AG15-3 没有新内容不进收件箱；同一条不重复告知 | pass（硬判定） | `agent-automation-runs.test.ts`、真库测试里的推送候选一条；AE-SCH-006、007、AE-SCL-029 |
| AG15-4 暂停后不再送；只补最近一期并标出跳过的期数 | pass（硬判定） | `agent-automation-runs.test.ts`、`agent-automation-due-index.test.ts`（夏令时两种情形）；AE-SCH-008、009 |
| AG15-5 定时器让到期的卡失效；定时任务的卡在收件箱里确认 | 服务端 pass；Web 1440/375 截图、不闪动、App 确认同一张卡 blocked | `agent-automation-timers.test.ts`；AE-SCH-011、012（运行器从收件箱条目找到卡再点确认） |

### 与 PLANNER 不同（CONVENTIONS／brief／协调者指示优先）

1. **AG14 没有先完成**，并行开发。`recallFor()` 走接缝 `features/agent/automations/recall-seam.ts`，本分支返回空。
2. **视觉稿未批准**，只做服务端、契约和测试。
3. **派发入口。** PLANNER 让派发任务挂在维护任务清单上，已挂（`agent_automation_dispatch`，排在读成本汇总之前）。另把原来的按账号入口 `POST /api/internal/agent/automations` 改成同一个跨账号派发：只认 `Authorization: Bearer $CRON_SECRET`，带账号请求头或参数一律 400。`proxy.ts` 为这一个路径和方法放行到它自己的密钥校验（维护入口已有同样的放行）。`scheduler_tick` 调的是这个入口，不是整轮维护：整轮维护里别的任务（计划、提取、推送）会在评测里写数据。
4. **`CRON_SECRET`** 没有放进环境文件，由评测环境用自己的 `AUTH_SECRET` 派生（`env-guard.ts`），运行器和评测服务用同一个；环境文件里写了就用文件里的。
5. **旧的按账号领取没有整体停用，而是分开。** 带规则字段的任务只进到期索引、只由派发器领取；不带规则字段的旧 Playbook 不进索引，仍走原来的按账号领取（`claimDue` 对带规则字段的任务一律不领）。这样两边不会领到同一期，旧功能也没有被悄悄关掉。`scripts/run-agent-worker.ts` 没有改。
6. **派发时不读任务记录本身。** 到期索引的每一行带着任务当前版本的定义，派发器只读索引、不去读 `agentAutomations`。原因有两个：一是不用为找到期的任务去列某个账号的记录；二是评测把读 `agentAutomations` 算作读私有记录，AE-SCH-004 的 `private_reads_within` 只允许 M36 和活动。这一点请评审留意：它是设计选择，不是为了躲判定。运行本身也不改写任务记录（下次运行时刻只在索引里），所以「没有业务写入」是真的。
7. **规则的对话路径没有并进第二层的提示词**，而是在函数节点里单独处理（`graph/nodes/rule.ts`），多一次主模型调用，用自己的提示词只让模型指出原话里的片段；时间、范围、条数、截止日、推送与否由代码读。这样第二层的提示词没有动，旧门槛不受影响。
8. **`domains/rule/` 只有两个文件**：`ops.ts`（`prepare`：五种操作的卡片内容）和 `apply.ts`（`applyApproved`：五个执行器）。删除的能力名沿用能力清单里的 `rule.cancel`。
9. **需处理的那一期会进收件箱一次**（同一版本只说一次）。设计稿没说进不进；不说的话用户不打开「我的定时任务」就不知道任务停摆了。要不要保留请定。
10. **运行器。** `listed` 在没有对话时取最后一份送进收件箱的定时结果（SCL.yaml 的注释就是这么写的）；`rule_runs` 从数据库前后差异读，不取产品自己的汇报；运行器自己读各账号收件箱和任务列表的请求带「另一端」标记，不算被测系统的读取。用例一条没改。
11. **证据目录**在外置盘 `/Volumes/ORICO/Dev/orbit-sprint-evidence/…`，不是 PLANNER 写的 `~/orbit-sprint-evidence/…`。
12. **AE-SCL-030 的范围人数。** 用例注释说范围里有 241 位；按产品里实际记下的往来（带往来字段的笔记）算，半导体行业、最近一次往来在 60 天以前的是 114 位（另有 397 位没有任何往来记录、23 位 60 天内联系过）。结果里写的是 114、细看 30、还有 84 没细看。硬判定不依赖这个数。

### 影响分析

索引是开工时为本检出单独建的（`gnx.sh ag15 analyze --index-only`，913 秒）。改动前做了上游影响分析，输出在证据目录 `impact/`。

| 符号 | 风险 | 本次怎么改的 |
|---|---|---|
| `createStorageAgentAutomationService` | CRITICAL | 加可选的 `storage`；不传时行为与原来相同（原测试全过） |
| `createAgentAutomationService` | CRITICAL | 接上到期索引 |
| `createInboxRuntime` | CRITICAL | 只多了三种来源的可见性判断 |
| `cardWriteExecutors` | CRITICAL | 多一个可选的 `rules`，登记五个规则执行器 |
| `createOrbitAgentRuntimeService` | CRITICAL | 登记规则执行器；包一层给新卡设过期定时器 |
| `functionOf` | CRITICAL | 最前面多一个规则任务的分支 |
| `routeNode`、`proposableOf`（未改）、`needsIntentReview`（未改）、`deliverNode` | HIGH | 路由里加「定时任务请求」的代码判据与并入相邻限定句；交付里多存一项待答问题的内容 |
| `runOrbitRecordsMigration`、`resolveAgentAutomationRequest` | MEDIUM | 多建一张表；改用规范账号 |
| `proxy`、`runHardChecks`、`buildEvalEnvironment` | UNKNOWN | 文本搜索确认了调用方（Next 中间件与代理测试；运行器；评测环境加载） |

提交前 `detect-changes --scope staged`：产品提交 65 个文件、222 个符号、38 条流程，风险 critical；运行器提交 6 个文件、40 个符号，风险 medium；都没有 `partial` 或 `truncated`。加了新文件之后没有重建索引（重建要 15 分钟，与门槛运行抢机器），所以新文件里的符号不在这两次结果里。

### 假设与额外阅读

- 上下文包之外读了：评测运行器全文与预加载脚本（要加词、要知道读取怎么被记下来）、`graph/nodes/functions.ts`／`propose.ts`／`route.ts`／`deliver.ts`（规则卡要从对话里出来）、`agent/runtime/card-operations.ts`／`decision.ts`／`service-factory.ts`（卡片项与过期）、`events/host/storage/lifecycle.ts`（运行器改平台活动）、未批准的视觉稿（只看了它要哪些状态）。
- 没说时间只说「每周五」时，代码读不出时刻；模型给了就用模型的，都没有就用 9:00，并显示在卡上由用户确认。
- 活动范围没说时间窗时按「之后 7 天」。周末指这一期之后最近的周六、周日；周日当天跑就只看当天剩下的。已经开始的活动不列，没公布时间的活动不算进任何时间窗。
- 按主题挑时，只列判断为匹配或部分匹配的、或者记录里的字词和主题对得上的，不拿不相关的凑数；判断没回来时只列字词对得上的，并在结果里说明没能逐个核对。
- 任务改了版本之后，「告诉过的不再告诉」从新版本重新算起。
- 一期连续算失败，下一次派发用同一个编号再试，三次都失败才在历史里记失败；历史里记下算了几次。
- 补送间隔 5、10、20 分钟……最长 6 小时，一直补到送到或被取消，没有设上限次数。
- 本机开发库 `orbit_events` 里现有 0 条定时规则，所以没有旧分区要处理；主评测库里有 1 条旧形状的规则（没有规则字段），不会被派发器领取。

### 按未批准的视觉稿核对过的数据（协调者 04:11 的要求）

稿子没批准，界面没做；只核对了服务端带不带得动它要的东西，缺的补上了：

| 稿子要的 | 现在的数据 |
|---|---|
| 规则卡七行 | 卡的 `display.rows` 七行，每行有 `field`（`schedule`、`scope`、`rankingBasis`、`maxItems`、`validUntil`、`notify`、`nextRunAt`），顺序由界面定 |
| 下次哪天、带时区 | 任务的 `nextRunAt` 和新加的 `timeZone` |
| 历史：没有新的 | `outcome: no_match` |
| 历史：跳过了几期、哪几期 | `skipped` 和新加的 `skippedDays`（本地日期，最多 12 个） |
| 历史：没跑成，已重试 | 新加的 `computeAttempts`（大于 1 就是重试过） |
| 历史：补送到了，没有重新算 | `delivery.attempts` 大于 1 且 `state: delivered` |
| 历史：需要你处理，笔记打不开 | `outcome: needs_attention` 和新加的 `attention`（原因、说明、笔记名） |
| 历史：算好了，送出前暂停了 | `outcome: undelivered`、`delivery.state: cancelled`、新加的 `delivery.cancelReason`（暂停／改了／删了／笔记打不开） |
| 三种收件箱条目 | 来源 `automation_result`、`agent_card`、`external_proposal`；目标种类 `automation`、`card` |
| 被下一期取代的旧卡 | 卡片预览新加的 `expiredReason: "superseded"`；点它返回 `CARD_EXPIRED`，提示写的是被新卡取代 |
| 以后按期的推送状态 | 每期的 `push`（`not_requested`／`pending`／`delivered`／`failed`、次数、时间），与 `computedAt` 分开 |

历史每行另有服务端写好的一句 `line`，界面可以直接用，也可以按上面的字段自己排。

### 交接

**给 AG16（按任务发推送）：**

- 任务的提醒方式：`agentAutomationNotify(automation): { inApp: boolean; push: boolean }`（`features/agent/automations/contract.ts`）；任务上是 `automation.rule.notify`。对话里改它已经能出卡：能力 `rule.update`，卡上 `set: { notify: { inApp: true, push: true } }`（`domains/rule/ops.ts` 的 `RuleUpdateIntent`）。
- 每期的记录：`AgentAutomationRunRecord`（`features/agent/automations/runs.ts`）。`computedAt` 是算出结果的时刻；`delivery.inbox` 是收件箱的投递（`state`、`attempts`、`deliveredAt`、`lastError`、`cancelReason`）；`delivery.push` 留给 AG16：`{ state: "not_requested" | "pending" | "delivered" | "failed"; attempts: number; lastAttemptAt?; deliveredAt?; lastError? }`。任务开了推送且这一期有新内容时，AG15 把它写成 `pending`，别的什么都不做。
- 读写一期：`createAutomationRunStore(store, workspaceId)` → `get(ownerId, runId)`、`save(run)`、`list(ownerId, automationId, limit)`；编号 `automationRunId({ workspaceId, ownerId, automationId, version, scheduledAt })`。
- 接推送的位置：`features/agent/automations/dispatcher.ts` 里 `deliverRun()` 返回 `"delivered"` 之后；补送推送可以照 `delivery` 行的做法在到期索引里加一种行。
- 现有推送管线不会碰这三种来源：`isAgentInboxSourceKind(kind)`（`features/notifications/agent-inbox-source.ts`），`typed-delivery-factory.ts` 的 `materialize()` 里跳过。
- 提醒开关在界面上的位置要等视觉稿；传输结构里是 `AgentScheduledTaskContract.notify`。

**给 AG17（外部 Agent）：**

- 一次性定时器：`scheduleAgentTimer(due: DueIndexWriter, input: { ownerId: string; key: string; fireAt: string; payload: { type: "wake"; entry: string; data?: Record<string, unknown> } }, now: string): Promise<void>`；取消 `cancelAgentTimer(due, ownerId, key)`（`features/agent/automations/timers.ts`）。`due` 取 `configuredAutomationStorage(mode)!.direct.due`，要和别的写入同事务就用 `storage.transaction((tx) => …tx.due…)`。同一个 `ownerId` 加 `key` 再设一次是改期。到期时派发器调 `AgentTimerHandlers.wake(ownerId, entry, data)`，现在的实现只记一条追踪事件（`dispatch-configured.ts`），AG17 在那里接自己的处理；定时器本身不调模型。
- 收件箱来源「外部提议」已登记：`sourceKind: "external_proposal"`，`sourceId` 填卡片编号，目标 `{ kind: "card", id: <卡片编号>, href: null, status: "available" }`。写入用收件箱自己的 `createConfiguredInboxRuntime()!.service.upsert(entry)`（`InboxNotificationUpsert`，按账号加 `semanticKey` 幂等）。可见性：卡在读者自己的账本里就可见（`readAgentInboxSourceState`）。可以照 `features/agent/automations/delivery.ts` 的 `inboxEntryOf()` 里卡片那一支来拼。
- 卡的出处：`origin: { kind: "connection", connectionId, externalRequestKey }` 账本早就有；冻结走 `runtime.freezeCard({ actionId, origin, locale, intents, createdAt })`，过期定时器会自动设上。

**后续 sprint 可以依赖的：**

- 表 `agent_automation_due`（`features/agent/automations/due-index.ts`，随 `runOrbitRecordsMigration` 建，可重复执行）：`AutomationStorage` 的 `transaction`、`claimDue`、`listOwned`、`direct`；三种行 `rule`、`delivery`、`timer`。
- 派发：`dispatchDueAutomations(deps, { limit?, deadline? })`、`runConfiguredAutomationDispatch()`、`handleAutomationDispatchRequest(request)`。
- 卡片：`runtime.expireCard({ actionId, revision?, reason: "timer" | "superseded" })`；`withCardExpiryTimers(runtime, { ownerId, storage })`。
- 接口：`GET /api/agent/automations`（多了 `tasks`）、`GET /api/agent/automations/[id]/runs`、`POST`／`PATCH`／`DELETE` 可带 `rule`；所有者一律是规范账号。传输结构 `AgentScheduledTaskContract`、`AgentScheduledTaskRunContract` 及列表、历史两种（`shared/contract/agent-v1.ts` 末尾的 AG15 块）。
- 合并 AG14 后：把 `configuredRuleRecall()`（`recall-seam.ts`）接到 `recallFor()`，返回 `{ id, category, content }[]`；规则运行那边已经会用（约束当硬条件、偏好只排序、结果里点名、发 `memory.recall`）。然后重跑 AE-SCL-030。

**别的线可能冲突的文件：**

- AG14：`features/agent/capabilities/contract.ts`（两行单行数组，各在行尾加了规则的键）、`features/agent/ledger/contract.ts`（操作类型清单末尾）、`features/agent/runtime/card-operations.ts`（`CardOperationIntent`、`prepareCardOperation`、`cardCountTitle`、`cardIntentOf` 各加一处）、`features/agent/runtime/service-factory.ts`、`features/agent-v1/domains/writes.ts`、`shared/storage/migrations.ts`（末尾）、`shared/contract/agent-v1.ts` 与 `shared/api-schema/agent-v1.ts`（各在文件末尾加了一块，卡片预览多一个 `expiredReason`）、`shared/contract/.snapshot.json`、`tests/capabilities/agent-v1-receipts.test.ts`、`graph/deps.ts`、`graph/executor.ts`、`graph/state.ts`、`context/session-state.ts`。
- AG19：`graph/nodes/functions.ts`——只动了四处：引入规则节点、任务种类多一种、`functionOf` 开头一个分支、循环里一个分支，外加文件末尾一行导出（`contactCandidates`、`contactLine`、`eventCandidate`、`eventLine`、`openTodos`、`visibleEvent`、`INDUSTRY_WORDS`、`PLACE_WORDS`）。定时结果里每条的文字直接用 `eventLine`／`contactLine`；AG19 要是改了这两个函数的名字或签名，`features/agent/automations/run-rule.ts` 要跟着改。定时结果是代码写的一段文字加一份记录清单（`items`），没有走 `answer.blocks`；要让它也用新的记录卡，从 `items` 出发即可。`graph/nodes/route.ts`、`graph/nodes/deliver.ts` 也各有小改动。
- AG17：`proxy.ts`（免登录名单多一行）、`shared/contract/inbox-notifications.ts` 与对应 schema。
- 运行器：`tests/agent-eval/lib/runner.ts`、`hard-checks.ts`、`observations.ts`、`seed.ts`、`env-guard.ts`。

**需要决定：**

1. 需处理的那一期进不进收件箱（现在：进一次）。
2. 视觉稿批准后，界面工作（两端页面、收件箱条目、收件箱里的卡、截图与 App 验证）在本 sprint 续做还是另开。
3. `judge-pack`／`report` 在分线环境里读不到环境文件里的目录，要不要在运行器里修。

**回退：** 不合并，或 revert 合并提交。新表和新集合都是附加的；`ORBIT_AGENT_V1_MODE=off` 时对话里不出规则卡。已有的旧 Playbook 不受影响。

### 报告写成之后的补充（协调者代记，2026-11-20）

本页正文由 Generator 起草，它的会话写不了报告文件，由协调者从它的记录里取出原文写入，未改一字。正文写成之后还有这些：

- **最终 SHA** `86420292772ab8af61270ad2532f98c8c22accaf`。门槛运行建在 `90158fd` 上；之后那个提交只改了两个测试和契约快照。
- **全量测试（最终 SHA）：** 服务端 22 条失败，都在已知清单里。App 是 3 条已知的加 `shell-back-restore` 一条，后者单独跑 3 次都通过（AG17 线上也出现过同一条，属偶发）。
- **门槛运行** `20261120-042802-90158fd-AG15-gate`：代码判定 74/78，本 sprint 的 14 例全过；没过的 4 例是 AE-MEM-008、009、012 和 AE-REF-005，归 AG14。主模型 154 次、判断 24 次，0.2965 元；本 sprint 累计约 0.41 元。评审材料 78 份已生成，尚未评审。
- **给 AG16 的接口**（`runs.ts`、`contract.ts`）：`agentAutomationNotify(automation): { inApp; push }`；`AgentAutomationRunRecord.delivery.push`；`createAutomationRunStore(store, workspaceId)` 的 `get/save/list`；`dispatcher.ts` 里 `deliverRun()` 之后的挂点。
- **给 AG17 的接口**（`timers.ts`）：`scheduleAgentTimer(due, { ownerId, key, fireAt, payload: { type: "wake", entry, data? } }, now)`；`cancelAgentTimer(due, ownerId, key)`；收件箱 `sourceKind: "external_proposal"`。
- **合并 AG14 之后要做：** 把 `recall-seam.ts` 的 `configuredRuleRecall()` 接到 `recallFor()`，重跑 AE-SCL-030。
- **容易冲突的文件：** `graph/nodes/{functions,route,deliver}.ts`、`capabilities/contract.ts`、`ledger/contract.ts`、`runtime/{card-operations,service-factory}.ts`、`shared/contract/{agent-v1,inbox-notifications}.ts` 及快照和 App 副本、`migrations.ts`、`proxy.ts`、评测的 `runner.ts`／`hard-checks.ts`。
- **与未批准的视觉稿有一处不一致，待定稿时对齐：** 引用的笔记读不到时，服务端按 PLANNER 在收件箱里说一次（同一版本的任务不每期重复）；视觉稿 15-4 的表里写的是「不进收件箱，只在列表上标需要处理」。
- **界面部分**在视觉稿获批后由同一个 Generator 在本 sprint 内继续做。


## 协调者复核与结论

**结论：completed。** 最终提交 `2378aacae`（`81d8f5b2a` 上一个只动 App 的提交：五处真实的 `/api/agent/automations` 调用登记在 `agent-automations` 下，两处并不存在的路由删掉），经集成线 `agent-v1-next` 合并，随第二次发布（`463de7fdd`）在 2026-11-21 09:17 上正式站。本页正文由两位 Generator 写，协调者原样写入。

**评审。** 都是 Claude 新会话，互不相见；门槛里另外 64 例是不变量包，只看代码判定。

| 运行 | 代码判定 | 评审 | 说明 |
|---|---|---|---|
| `20261120-042802-90158fd-AG15-gate`（服务端） | 74/78 | 一位（Sonnet 5.5），本 sprint 14 例：14/14 | 没过代码判定的 4 例要 AG14 |
| `20261120-135604-55e8bbb-AG15-gate-ui`（界面） | 74/78 | 两位（Fable 5.2），本 sprint 14 例：13/14 | AE-SCL-030 一位不过、一位不确定：依据那行认不出是哪篇笔记，范围人数与用例文字不符 → 协调者第二轮七项 |
| `20261120-150629-81d8f5b-AG15-followup` | 5/5 | 一位（Fable 5.2）：5/5 | 评审另提的两点（收件箱条目点开的是不是那一期的结果、英文回执摘要）查明不用改：两端都按 `sources[0].sourceId` 打开那一期，英文摘要不显示 |
| 上线门槛 `20261121-002824-bdb67c3-release2-gate-all-4` | SCH 12 例全过 | 两位（Opus 5.5） | SCH、SCL-029/030 都过 |

**协调者看过的截图。** `app-10-rule-card`（三行卡，按定案）、`app-3-task-detail`：与稿一致。

**怎么合并的**（`coordination/next/INTEGRATION-LOG.md`）：
- `c555050f7` 合服务端那一轮（19 个文件冲突，都是两边在同一处各加一段，都保留）；`af19d86f9` 召回接缝接到 AG14 的 `recallFor()`；`29eb66da0` 定时任务运行按对话一样用记忆。
- `327289a93` 合最终的 `81d8f5b2a`（10 个文件冲突）。**设计重叠在这里定的**：收件箱里外部助手的提议，两个 sprint 都画了。保留 AG15 的列表（「等你确认」一组在最上面），有确认页的提议用 AG17 的那一行和右栏；没有确认页的仍是 AG15 的行。协调者确认与两份获批稿一致。
- `5d2d0b993` 合 `2378aacae`，没有冲突。
- 合并后在发布门槛里查出、已改的：接受了「定期留意」之后回答却说「现在还不能在对话里建」（AG15 的 `ruleTaskOf` 把接受的选项留给了 AG03 的旧句子），`f14f562f9` 改成出定时任务卡或先问一句。AG21a 又加了两条：只有一条任务时按描述也能找到它（R37）；「现在找一下，之后一直帮我留意」拆成本轮的查找和一条定时任务（产品决定 2）。
- 定时提醒的语言（AG16 合并处，`091c80cb6`）：提醒按这一期结果的语言写；存了「回答用日语」时结果和提醒都是日语。

**正式库与配置。** 上线前在正式库建了到期索引表 `agent_automation_due`（只执行 AG15 自己的 `create table if not exists`，先做了备份分支 `backup-pre-release2-20261121`，用户说「你来做」）。

**用例修订**（协调者确认，`eval/CHANGES.md`）：AE-SCH-001 R1 改成「六样都在卡上，每一样都分得出来；可以合并成三行写」；AE-SCL-030 范围里是 114 位联系人（241 只在夹具字段里）；AE-SCL-029 是 59 场活动（RE08 是没发布的草稿）。

**已知的不足：**
- 卡上的时间按部署所在时区显示（卡没有自己的时区）。
- App 上「改」的表单没截到图；外部提议的条目在真实界面上没出现过，由两端组件测试证明。
- 三行卡上不写「不推送」：用户要卡上少写，完整表单里有。
- 第三方用例集里有三处等产品负责人定：「未来一周」按时刻还是按日历日算到第 7 天；夏令时跳过的那个钟点任务何时跑；一例的夹具与期望对不上，要先改夹具。详见 [RELEASE-2.md](../../RELEASE-2.md)。

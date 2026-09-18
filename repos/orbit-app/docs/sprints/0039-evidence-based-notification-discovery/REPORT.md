# Sprint 0039 执行报告

run-01 / 2026-09-16 / **blocked：本地实现已交付，真实模型闭环尚未验收**。

已实现按账号授权的来源采集、持久候选队列、事实门槛、去重、限额、失败恢复和两端设置。实际 Web 开启发现→App 回读、App 开启消息分析→Web 回读；Web API 与 App 分别保存真实笔记，另一端回读相同记录，后台读取到两条新笔记。缺专用 provider 时两条候选等待、模型尝试为0、调用账本为0，无占位通知。真实 AI 提取→通知→采纳链没有执行，不标 completed。

## 版本与范围

- Planner SHA256 `424d1194cc4072b1f1b6b617e9065940ede951af2a85a6f583a8a53a9449dd3d`；基线 `0ed78f065`；唯一 Generator 当前 session `/root`。
- 功能提交 `4aa21961a`；合并到 `chat-agent` 的固定 SHA `131723ddbca80051b6a05841589c4be88960201b`。主线中途新增离线读取设计文档 `e0b275228`，普通合并保留，产品树与本线相同。没有 push/部署。
- 新增 `features/notifications/discovery/*`、CLI、preferences API、共享 contract/schema、Web/App 设置、Web 重新授权的来源页及行为测试；必要路径追加见 DESIGN。App 副本由 sync:contract 生成。
- 不改0033～0036的 sync/outbox/query-service/manifest。保留两处根 AGENTS/CLAUDE 用户/索引改动和未跟踪旧设计、GitNexus目录，不提交这些内容。

## SC → 变更 → 证据

| SC | 实现与主要验证 | 结果 |
| --- | --- | --- |
| 01 来源与隐私 | cloud note/task/schedule/appointment/contact/goal/已授权消息适配器；实际作者、版本、最小字段，重新读取及撤权隐藏；隐私3项、真实PG消息撤权读取测试；真实笔记双向回读 | 部分验证；外部邮件/日历明确 unavailable，来源全矩阵真实模型证据未执行 |
| 02 自主性与可信内容 | 原文/AI判断分离；明确承诺时间、日期日末有效性、否定/转述/注入/责任边界；policy10项；独立worker扫描实际笔记 | 真实provider链 blocked，不能把 fake-provider PG测试计作AI验收 |
| 03 语义与生命周期 | 真实对象+动作+时间+可验证源关联去重，保留read/disposition/expiry，发布前再次读取；PG重复扫描/忽略不复活/撤权、0038动作链复用 | 自动发现后的真实双端采纳/忽略待provider；未声明全部通过 |
| 04 有界运行 | 50/页、4页200源/轮、2模型请求、20包/请求、3建议/日；3尝试5/30分钟；180秒租约；30,000联系人预筛，207源PG分页，原子费用预留与缺账本阻断 | 定向与PG通过；实际运行0付费请求；历史费用未知仍保留 |
| 05 交付 | 两端定向/typecheck、一次全量、Web生产构建重启、原生Release、固定提交合并与合并树验证 | 代码交付完成；完整真实AI闭环和来源页实际发现记录仍缺证据，Sprint blocked |

## 检查结果与失败历史

日志均为本地临时 `/tmp/orbit-0039-*.log`，关键脱敏运行证据复制到 App 被忽略的 `build/harness-state/evidence/sprint-0039/run-01/`。以下未把局部修复当全量通过：

- Web `target-green` 33/33；`pg-final` 6/6（串行真实隔离PostgreSQL，含0038显式提醒优先直接消费者）；此前并发组合31项中1项事务40001耗尽，随后串行6/6，保留原失败。
- App纯设置/契约4项；设置完整文件13/13；新增切号生命周期1/1。旧夹具先有缺hook、about:blank crypto失败，补原生边界后通过，未改产品断言。
- App **全量2952：2944通过、8失败、0跳过**，exit1。两个夹具缺导航hook/新组件加载边界；修复后这两个完整文件14/14，`full-repair.log`，不重跑全量。
- Web **全量3501：3408通过、21失败、72跳过**，exit1。包括13项审计/运行面证据基线、3项旧报名、旧联系人文案、主页静态检查、既有contract约束，以及隔离DB环境不满足另一batch测试自己的scratch断言。新发现用例无失败。contract导出检查也包含本轮single-quote格式，已改本轮两行；局部15项13通过、2失败仅剩既有profile运行常量与account-language/contact-needs出口匹配，不改无关模块。
- 日期型建议窗口新增RED→GREEN；source identity/navigation5/5；最终Web直接消费者20/20 (`last-consumers.log`)。来源页新测试初始不完整DTO被typecheck拒绝，已补完整夹具；`web-types-complete` exit0。
- App `app-types-final` exit0；sync:contract exit0；Web `build` exit0。原生 `native-build` exit0，Release/SQLCipher产物安装启动成功。构建输出已查看；无远程发布。
- 更正0038验证时间：其最后新增meeting precedence测试夹具误用 `targetType: schedule`，先前typecheck证据早于该夹具。0039修成既有合法值 `schedule_item`，本轮Web完整typecheck和真实PG通过；不改变产品协议或重写历史失败。
- 首次尝试ff合并被主线新文档分叉拒绝；其后错误启动的“main”检查不是合并验收（Web文件当时不存在）。保留 `/tmp/orbit-0039-main-*`，**不计入通过**。真实合并树 `131723ddb`：Web16/16、App22/22，`merged-web-types`和`merged-app-types` exit0。
- staged GitNexus：50文件、16已索引符号、0已索引受影响流程，LOW；新符号UNKNOWN用源码调用关系补查，不能解释为全系统0风险。diff --check通过。

## 实际环境和边界

共同Web `http://127.0.0.1:31037` production/live/ok；独立DB `orbit_qa_sprint0037_20260916` / workspace `workspace:qa:sprint0037`。QA A `user_mu393kmp_ss48sg`、B `user_mu393ktl_6qoc1c`；iPhone17Pro `9BF990F2-45B8-42CE-8543-E583B941DA17`，bundle `app.agenthubs.orbit.sprint0037qa`。未接管0033的Simulator/3108服务。

- Web启用发现，消息分析默认关闭；App回读1/0；App打开消息分析后Web回读1/1、revision2。截图 `web-settings-enabled.png`、`native-settings-web-readback.png`、`native-messages-opt-in.png`、`web-settings-native-readback.png`。
- Web API原生会话保存笔记 `note:714fcd46f7414a91eef94714` v1；App保存 `note:f7ff02dead9759a78c059055` v1。App打开Web原文、Web认证API回读App笔记及关联联系人；`native-note-saved.png`、`native-web-note-readback.png`、`notes-readback.json`。Web保存/回读是认证API操作，未声称已有Web笔记编辑页面。
- 初次QA笔记400源于0037合成联系人缺canonical source/evidence和非法stage，不是线上联系人损坏。只在本线隔离QA修正该合成记录与搜索字段，未清缓存/修改真实联系人。
- 真正CLI worker每60秒扫描：两note queued、attempts0、reason discovery_provider_unconfigured；无关contact rejected/insufficient_relevance；调用账本0。`runtime-audit.json`、`worker-runtime.log`。
- 新Web来源页仅定向/编译验证；无真实AI通知，未用伪造发现记录冒充运行验收。三语设置的定向展示覆盖已执行；本轮原生截图中文，沿用0038三语主题基础验证，不宣称本轮完整原生三语矩阵。

## 费用、回退与下一步

沿用累计$5；已结算$0.012780之外，0020历史意外调用增量仍未知。读取原账本并查找后续结算/原始费用日志三次，未找到可证明剩余额度的材料；不能当0或重置预算。本轮没有真实AI/OCR调用。必须先对账，然后提供明确专用provider及审计后的请求费用上界。持久账本对未知历史、缺provider或不足余额阻断，错误对用户可见。

关闭发现取消未执行候选并保留历史，消息分析独立关闭后下一次读取隐藏相关摘录。关闭actor灰度或停止独立worker可回退新发现，0038用户提醒/真实消息仍工作。不清理笔记、任务、消息或投递回执。

0039 run-01在此以blocked结束，不自动重开Generator。0040可以消费已固定代码协议执行独立策略/偏好/迁移/设备生命周期；其真实笔记→模型→推送闭环继续等待本报告的外部费用/provider缺项，不能将进入下一Sprint等同0039通过。BR-027保留相同限制。

## 2026-09-16 后续范围决定

用户决定本轮先不实现 Calendar/Gmail/Microsoft Graph 的真实 OAuth adapter；这些外部来源保持 `unavailable` 并转入后续独立 TODO，不用 mock 或 Orbit 内部 live-store 元数据冒充。0039 当前补证只针对已经存在的、actor-owned 云端来源（例如笔记、任务、日程、联系人、目标和已授权 Orbit 消息），仍需先完成历史费用对账并配置专用 discovery provider，再执行真实提取→通知→采纳/忽略链。

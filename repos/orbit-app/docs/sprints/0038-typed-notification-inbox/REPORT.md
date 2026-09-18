# Sprint 0038 执行报告

2026-09-16；run-01；唯一Generator：E线当前session。Planner SHA256：58bbe969bdb65567e5dfa07920e85a438ef75175c234fb787a35cd0a0078b548。开始基线f2ab646dc，功能及chat-agent合并版本 **e045651b3**，fast-forward无冲突。报告版本见Git历史。

已实现提醒、建议、动态三类持久记录与共享契约，Web/App同一API消费、按账号开关启用。来源授权和版本检查在序列化及动作前执行；读、处理、采纳、源业务完成分离，批量已读只作用于明确快照。真实消息维持0037独立入口。

| SC | 结果与证据 |
| --- | --- |
| 01 统一事实 | 通过。actor-owned orbit_records集合、事务/CAS/幂等回执、50条keyset分页、来源重验；契约纯类型与schema由Web单源同步。跨actor、删除/版本变化、迟到回执由API和行为测试验证。 |
| 02 真实投影 | 通过。QA创建真实待办/显式提醒、约谈命令提议及对方确认、名片批次失败待复核，得到3条稳定记录，重复刷新不新增。约谈前置authorityVerifier为QA夹具，持久业务命令为真实服务；名片采用合成坏图经过有限重试，不冒充OCR成功。连接动态与自己操作抑制由生产者/来源测试验证。 |
| 03 阅读和动作 | 通过。真实PG覆盖幂等采纳仅一真实任务、read/snooze同事务、源变更脱敏；显式计划后设覆盖自动会前提醒另有真实PG反例。原生读提醒→Web读取，Web处理→原生显示已处理/已读；点来源后待办仍未完成。Web丢失read响应后同key重试仅一次持久动作。 |
| 04 呈现与目的地 | 通过。三类独立图标/文字、过滤/历史、源跳转；Web中日英及原生中英、日语暗色accessibility-large已检查。原文提醒不翻译，系统标题随语言变化；提醒时间不冒充截止时间，约谈按对应提议时区。删除/撤权通过自动化重验和脱敏验证，未声称真实QA删除。 |
| 05 跨端交付 | 通过。本次生产构建/重启/health后原生验收，两端共用31037和同一QA账号/数据库；固定功能版本已合主线，合并树相关消费者复验。全量失败历史及边界见下。 |

## 验证和失败历史

- Web最终定向16/16；此前新增显式计划优先策略组合17/17（含两个真实PG测试），无跳过。App通知/生命周期消费者112/112；全量失败修复7文件314/314；typed badge28/28。
- App全量一次：2949项，2916通过、33失败、0跳过。失败来自新增私有路由清单、第三个badge请求及旧preview回复假设；修正直接消费者夹具后上述7文件314通过。没有重复全量或将原结果改成全绿。
- Web全量一次：3476项，3244通过、167失败、65跳过。启动器错误继承live模式，致使mock用例失败；清理模式环境后失败文件539项528通过10失败1跳过，再以QA DB定向51项43通过8失败。7项与0037主线基线一致（契约出口/纯类型2、contact标签1、home provider复用1、register3）；另13项既有audit失败未改变。组合约谈PG竞态失败，当前与未修改主线各自孤立复验均1/1；heartbeat孤立复验通过。main repair测试缺QA历史seed，不计产品通过。
- 两端typecheck exit0；App最终类型检查含最新测试通过。共享同步及副本检查通过。Web首构建因use client顺序失败，修复后最终第4次production build exit0，启动新产物health通过；原生Release/SQLCipher构建exit0并安装启动。本次不是远程部署。
- Git diff --check通过；GitNexus staged49文件/39符号/0已索引流程，风险low。新符号未完整索引，手工审查调用方及定向消费者补足；不把0流程作为无风险。既有Panel CRITICAL影响已在编辑前告知。
- 合并主线e045651b3，产品树相同；Web合并树12/12，App合并树通知/生命周期/badge组合134/134。相同产品树复用本次构建和类型证据，未接管其他线运行环境。

## 环境和证据

Web http://127.0.0.1:31037，live模式；隔离数据库orbit_qa_sprint0037_20260916/workspace:qa:sprint0037。ORBIT_TYPED_INBOX_ACTORS只启用两个合成QA账号；ORBIT_TYPED_INBOX_SINCE限制回放。iPhone17Pro 9BF990F2-45B8-42CE-8543-E583B941DA17，独立bundle app.agenthubs.orbit.sprint0037qa，同一账号/API。原有3108、Metro8082及0033的Simulator不变。

证据在忽略目录build/harness-state/evidence/sprint-0038/run-01：native-web-handled-readback、native-source-task-open、native-list-en、native-history-ja-dark-large、native-list-zh-restored与web-list-{zh,en,ja}-final。早期native截图包含后来修正的时间标注，不能代替最终证据。

原始日志/tmp/orbit-0038-{app-full,app-full-repair,typed-badge,web-full,web-failure-retest,web-db-retest,appointment-isolated,main-appointment-baseline,precedence-green,final-consumers,app-final-types,web-build,native-build,web-retry,language-qa,detect-changes,main-app,main-web}.log；临时文件可能清理，报告保留结果和复现范围。凭据不入报告/仓库。

## 边界与下一步

0038没有新增发送器。业务事实当前由列表请求补齐；0040须接工作器和投递。新通知启用时App仍读取部分legacy来源以兼容，0040切换时清理；服务列表为准确全局未读数扫描本actor通知分批记录，尚无独立计数投影。关闭账号级开关可退回旧读面，保留新记录，未做破坏性迁移。

建议协议和事务已有覆盖，真实AI发现由0039实现，不能用隔离模型样例代替；Push仍未验收。0033在独立工作树1c8b442e1，本次无sync/outbox重叠。下一步继续0039并核对0036接线；0040前核对0035通知协调器。

本Sprint有意及实际新增AI/OCR请求0，累计$5不重置；0039调用前必须核对0020未结算意外调用，不能把未知费用当0。用户AGENTS/CLAUDE、旧设计目录和GitNexus生成目录未提交。

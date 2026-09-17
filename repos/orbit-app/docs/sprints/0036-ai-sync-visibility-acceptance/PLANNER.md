# Sprint 0036 — AI 全域覆盖与跨端验收契约

## 原需求、批准和基线

原需求：全域离线读取批准规范 §3、§5 Sprint 0036、§7～9；延续 0029 的 AI 权威读取与数据审查需求，原项目 R-00～R-14 不删除、不重新编号。本线不再限于旧版四域。设计已由用户批准；本次管理线委派明确只执行规划，规划 commit 后暂停等待管理线审查，不提前开启 run-01。

规划基线：`2f862c9f84167408df09914acca521f528ae4185`，干净独立工作树；分支 `codex/sprint-0036-ai-coverage-plan`。根 Sprint README 是唯一可变运行登记，本文件不复制生命周期。其旧四域/全串行描述由管理线更新，不能否定最新已批准全域规范允许服务端独立推进的边界。

输入：根 AGENTS、App AGENTS、Sprint RULES/README、Bridge status/handoffs、批准规范中英文、0029 query/manifest/registry、0032 已合入基础，以及 0033～0035 后续固定接口与报告。实施前核对前序报告的真实 SHA/验证范围，不能把旧源就绪当离线验收完成。

## 执行文件和依赖

唯一逐步实施计划：[2026-09-16-sprint-0036-ai-coverage-acceptance.md](../../../../../docs/superpowers/plans/2026-09-16-sprint-0036-ai-coverage-acceptance.md)。本 Planner 是 SC 唯一契约，计划是执行细化；二者冲突先修正细化，不降低 SC。

| 阶段 | 产物 | 进入条件 |
| --- | --- | --- |
| Task 1～2 | 独立 AI permission registry、strict schema、签名有界分页和 freshness | 管理线计划审查通过，服务器认证/资源授权源可用；不依赖本地同步 |
| Task 3～5 | 13 查询工具的真实领域 adapter、runtime/artifact/provider 接线、evidence 撤权 | 前述公共接口；相应领域服务固定版本与授权，不等待无关同步工作 |
| Task 6 | App pending/conflict/failed 领域数量及 ack+canonical 提示 | 0033 scope 和 0034 outbox/receipt/mirror observation 的固定已验收合并 SHA |
| Task 7 | 逐域 Data Atlas 和审查 JSON | 0033 registry/route 清单、独立 AI registry；站点发布依赖已有私有项目与相应发布门槛 |
| Task 8 | 全部协议/读取入口与真实跨端矩阵、报告和固定 SHA | 0033～0035 合入且验证；0037～0041 相关领域源实际版本；共同 production Web/API、Simulator、授权 provider 和预算 |

同一个 Generator 按任务顺序执行，不派第二实现/评审代理、不运行 Evaluator。启动由管理线登记 owner、Planner SHA256 和 run-01。缺一领域真实 source/版本只阻塞该 adapter；缺 Simulator/AI 环境只阻塞相应 runtime 行，独立代码和审查数据继续完成。

## 文件白名单

当前规划写入仅：本目录 GOAL.md、DESIGN.md、PLANNER.md 与上方根实施计划。

未来实施白名单以实施计划每个 Task 的精确 Files 为准，责任如下：

- Web：orbit-ai/data-query 的合同、registry、cursor、result、evidence 与各 adapter；既有 agent capability/tool registry、AI artifact/runtime/provider/service factory、manifest；对应共享 AI 类型/新增 schema 及定向 tests/helpers；两个审计脚本及 tests/audits。
- App：ai-sync-visibility、useAiSyncVisibility、AiSyncNotice、两个 AI screen、四 locale 文件、对应行为/render 测试；共享副本只由 sync:contract 生成，不手改。
- 根 audit README/JSON、私有站点源、Sprint REPORT、Bridge 与 Sprint 全局登记由管理线串行维护。执行线提供真实结果，不覆盖别线台账。
- 所有新增/改动精确路径见计划文件结构及 Task Files；必要补充先登记路径、原因和 SC 对应，不由遗漏白名单形成新产品审批，也不扩大目标。

排除：生产实现阶段也不得重定义 0033 读取身份/游标/数据库、0034 receipt/CAS/写入适配器、0035 恢复调度；不以 AI manifest 作客户端授权，不添加未批准 AI 写工具，不把浏览器离线纳入完成声明，不改其他 Sprint 文档或业务规则。当前规划不写产品代码、不发布 Data Atlas、不 merge/push。

## 验收契约（五项）

| SC | 可观察行为 | 主要证据 / Task |
| --- | --- | --- |
| SC-0036-01 | 历史 AI 对话、联系人与证据、消息、通知、笔记、任务、跟进、日程、会议、活动、目标、可见 Agent 数据每个已授权域均有真实查询函数；离线可读但 AI 未开启仍拒绝 | Task 1～3：13 工具 list/search/get、实际 service 适配、跨 actor/workspace/角色拒绝与 registry 覆盖测试 |
| SC-0036-02 | 查询/证据/artifact/provider 实际出站均遵守字段白名单、分页与 canonical revision/readAt；禁止秘密、注入越权、跨 scope 或撤权数据泄漏，局部结果不称全部 | Task 2/4/5：签名 cursor、source revision、来源 ACL、payload spy、读后撤权竞态、artifact cache、旧 context/recommend/profile 旁路回归 |
| SC-0036-03 | App 以域和数量显示 pending/conflict/failed 的 AI 盲区；receipt 未观察到 canonical revision 前不消失；切 scope 不串数据、本机正文/草稿不进入请求 | Task 6：纯汇总、渲染/发送接线、三语、重启/冲突/ack→delta/tombstone 的 Simulator 证据 |
| SC-0036-04 | 所有 offline 域/读取投影与 AI 域的权威、存储、离线读写、AI 读、完整性/限制均进入同源私有 Data Atlas，历史问题与真实证据保持一致 | Task 7：route registry 完整性、生成 JSON、字段矩阵、私有访问/脱敏和交互 QA，不能以文档计数证明业务已完成 |
| SC-0036-05 | 规范 §8 十项在固定版本成立：每域协议、全入口离线冷启动、租期/资源/磁盘/隔离、离线重放/冲突、失效恢复、AI 权限、同账号各族增改删撤权、production 重启、主线 Metro、合并树和远端 SHA 一致 | Task 8：完整必需矩阵 + 受影响端全量/typecheck/build/native/runtime + 管理线固定 SHA 合并复验/push 对照 |

SC-05 引用前序有效证据需要记录 source/dependency/environment 版本和覆盖边界；只有实际相同版本才复用，不能因为前序标 completed 而自动通过。任何必需行 missing/blocked/failed 都不算整 Sprint 完成。

## 测试、预算、失败与交接

- 本次为 D 档文档任务：路径/链接、约束、自查、占位扫描、git diff --check 与 staged GitNexus detect_changes，不跑产品 test/typecheck。未修改生产符号无需 impact；未来每个待改符号先 upstream impact，HIGH/CRITICAL 先报告。
- 未来为 H/I：每 Task 有具体 RED 命令、行为断言、GREEN 最小实现及功能 commit；各操作链完整文件/直接消费者通过后提交。本地代码收口一次受影响端全量，管理线对精确合并树复验，不逐小修改重复全量。
- 同一意外失败最多两次本地修复；同一假设最多三次只读诊断。保留已批准基线失败例外，不越过明确 baseline gate。未通过检查不改写成通过。
- AI/OCR 共享累计硬限 $5；历史已记 $0.012780，真实 provider 前核对最新账本与预留。无新费用额度，不以每 Task 重置。真实账号、provider、进程/Simulator ownership 和付费权限按可识别对象核实。
- 越权、泄露本机正文、假 revision、数据不完整却称完整、未授权域出站、scope 混用为硬失败，暂停受影响链并修复；其他无依赖授权任务继续。
- 当前交接：分支、规划固定 SHA、四文件清单、diff check/GitNexus 结果，随后按管理线指令暂停等审查。不创建 REPORT、不改 README 生命周期。
- 未来执行结束：REPORT 逐 SC 记录目标可用行为、RED/GREEN、命令/退出码、功能 SHA、真实环境别名、矩阵/Atlas/费用、未完成与回退；证据放忽略的 build 路径并脱敏。执行线交固定 SHA，管理线才负责 merge、精确合并树验证及已有授权下 push，最后记录 report/merge/remote SHA，禁止提前宣布 completed。

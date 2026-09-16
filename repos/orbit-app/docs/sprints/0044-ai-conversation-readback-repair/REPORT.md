# Sprint0044 run-01 执行报告

脱敏记录：两次 AX 过滤过宽使临时工具输出含既有标题，未写归档文件；已改严格白名单/hash。报告提交前固定根 staged detect 为0changes，不覆盖本树，另审本地 staged 仅REPORT且 diff --check exit0。

2026-09-16；唯一 Generator `/root/b_sprint0044`；**failed，部分修复已交付，原 run 在此结束，不重新生成。**

已修复 POST 使用 profile 身份、正式 GET 使用 canonical account 身份造成的会话不可读；续聊现在从真实持久会话读取前序历史，而非相信客户端省略的 history。主包真实新建会话后，正式 GET200、历史可见、返回重开仍有两条消息。真实 provider 与任务/跟进读取已执行。

仍不能完成同账号 Web 续聊：生产 Web 重开会话后整个 DOM 没有输入控件。笔记实际查询、三域领域源 revision、真实失败场景的 App 恢复交互也未取得完整证据，不能把修复提交、HTTP200或假 provider 测试当作全部验收通过。

## 固定版本与变更

- Planner revision1，SHA256 `67f61b3cd5b10b736211dd30a19804bb3a7137bc6418042c28825b78e9f9bdd9`；实际基线 `91bfdbb2351a31c268babcf92ceba879f84f3645`。
- 分支 `codex/sprint-0044-ai-conversation-readback-repair`；功能提交 `e40bf223ca2ad642ecd013487f39bb021e1cd1c0`，最后测试补充提交/本线被验收 HEAD `2eb91b677b80be39e070cc5d36a55543815d8a31`。root 已整合两固定提交，原合并树 `f0d747730037f0f9020297cd47aea37b17c9d489`；最终真实运行产品源为 outer Git `426b18819523c0b05dd30365b5a02669850841ac`，不是 nested Git HEAD。
- 五个功能提交路径：Web 两个 conversation routes、局部 `conversations/request-context.ts`、`features/orbit-ai/reliable-send-service.ts`、`tests/capabilities/orbit-agent-conversation-readback.test.ts`。测试补充另涉及 `agent-actor-brief-boundaries.test.ts`。局部 canonical resolver 不改变共用 Agent context；unknown membership fail closed，mock 语义保留。
- 未重写0036 registry/manifest/read-contract、provider 注册、DB schema、App AI 实现或个人日程。必要范围/影响先报 root；HIGH 提示及固定根 repo impact、提交前 detect 已执行，未索引部分用源码补查，不能解释为零风险。

## 五项验收事实

| SC | 变更及有效证据 | 结果/缺项 |
| --- | --- | --- |
| 01 | canonical route auth → 实际 PG request/session store → 正式 GET/list；主包真实发送完成 rev2、用户+assistant2，返回首页精确历史项再重开有回复 | 核心真实生命周期已验证；没有客户端假会话替代服务器存储 |
| 02 | 定向重试、回执丢失、并发、actor 隔离；真实 PG deterministic spy 两唯一请求及 replay 无额外执行，正式 rev2→4；真实 Web 可读首轮同 session | 部分通过；真实 Web 重开后无 composer，无法进行原定第二发送/跨端续聊，完整 SC 未通过 |
| 03 | store/provider/receipt/retry 定向 RED/GREEN；主包空输入发送禁用 | 部分通过；没有获协调的同源真实失败窗口，未执行 App store/provider 失败恢复交互；不以定向测试代替该证据 |
| 04 | 行为 ACL 验证伪造 body/header identity 不能切 actor，unknown profile401/零执行；真实首轮 tools 为 tasks.query 与 followups.query | 部分：两域各10条且 truncated；notes 没有实际调用；领域 revision/evidenceIds 未接，不称三域全部读取 |
| 05 | 同本地生产 Web/API、主包8082固定产物；精确 UI 删除→正式 GET404/list absent；累计账本可逐笔核对 | 部分：跨Web续聊被真实 composer 缺陷阻塞；非远程部署/实体设备，不标 completed |

## 测试与真实存储证据

证据根为本线 Git ignored 的 `build/harness-state/evidence/sprint-0044/run-01/`，先 check-ignore；关键日志 `commands/paid-runtime-events.log`、`commands/dbspy-real-pg.log`、`commands/sc04-readonly-pg.log` 及各 checkpoint。只保留必要元数据、ID/hash、数量、源字段存在性与 digest，不保留凭据或完整私人对话。

- 初始闭环 RED3项 exit1；新增回执丢失安全重试 RED exit1。最小修复后完整9直接消费者文件50/50 GREEN exit0，Web/App typecheck exit0。
- 原测试源码 regex 仍要求共用 resolver，受影响完整文件 RED10/11/exit1；补为精确验证 canonical helper 委托、null映射及原 identity 禁止规则，不匹配任意字符串。完整六文件41/41 GREEN exit0；full typecheck exit0。root 合并树 supplemental 两完整文件15/15 exit0。
- root 初始合并树 targeted Web42/42、App27/27 exit0。root 串行 Web 全量3558：3359 pass/23 fail/176 skip、exit1；本线关联 auth invariant 后续已局部修复验证，其他失败不归因本线。最终两个 PG 失败源码本轮 diff 为空由 C 保留审计；不宣称本线又重跑全量或全量全绿。
- genuine PG deterministic spy session `s0044-r01-main-f0d74773-dbspy-01`：canonical source auth、真实 transactional stores、两个唯一 request，第一并发 pending、第二早发 revision conflict 后安全 retry；replay 不重复模型，spy count2，正式 GET/list rev2→4/消息2→4。正式 DELETE→404/list absent。fake provider 明确不是 paid/原生工具证据；外出 fetch 全拒绝，无费用。
- 三域 real PG BEGIN READ ONLY 元数据核查：tasks open54/sample3，followups27/sample3，notes1/source note.version3。任务/跟进自己的领域 revision/version 不存在；schema version1 不是 revision。唯一 note 真实领域 version3、schema2，但 legacy query 丢掉领域 version，evidenceIds=[]。只读事务及全部非本地外出拒绝，没有业务修改。

## 主包真实 provider 与费用

本地生产 API3000 PID90050、BUILD_ID `ffPa-FLfCgMTBiMrUVaAu`、guard ready/health200；Metro8082未重启。iOS Simulator `DA432E9E-1204-4EE7-9A20-251CDB48E265` 主包 `app.agenthubs.orbit`，既有 canonical QA actor `account_orbit_generated`/workspace `workspace:orbit-dev`，PG `orbit_events`。复用既有产物、账号、origin，不清 App 数据或新建服务。

- 首次实际发送时间 `2026-09-16T09:10:05Z`；此前底部 warning overlay tap 未发送：root 有界 `09:07:50..09:09:50` HTTP50笔/POST0，不外推所有流量。
- own session `agent-session-mobile-3651deb0-3972-45bc-a323-7fdfff53f0ef`；可靠 request `fb2648eb-2904-4aec-a1cd-7d0b84dd1cf4`；transport request `f29ccfd3-a0e0-48b5-89a3-d2e1ce4cac8e`。
- pending 正式 GET200/rev1/用户1；完成 GET200/rev2/用户+assistant2。消息 digest `1724a285f8687407ad5ad700a63f8c5ad28bce548a705ae1b429a7ddde9fd1a6`；assistant ID hash `8becd30d8bc8f56ef06eb8c26ab350d92969060a19ffdf06c9a1b835e28b049d`；原生返回重开 AX 有24 static controls、空输入/发送禁用。
- 保存的真实 artifacts 为 tasks.query10、followups.query10，均 liveDatabaseReadExecuted=true、domainWritesExecuted=false、truncated=true；evidenceIds 空。没有用 provider 名称或回答文案推断工具调用。
- 仅一实际 send/三个真实出站，均 `deepseek-v4-flash` settled。共享账本 entries16–18 费用分别2403/2718/1241microUSD，总6362microUSD=$0.006362；prompt/completion tokens 分别4458/334、4613/521、1103/572。原账本由15entries/32249microUSD至最终18entries/38611microUSD=$0.038611、0reserved。累计硬cap$5不重置，无第二 POST、无未知费用或 retained reservation。

## Web 阻塞及后续修复建议

两次本地验证脚本修复上限已达，两次发送准备都在按钮点击前 assert 退出，webSends=0；没有第二 POST/付费、没有第三修复或产品修改。授权后独立只读 DOM 检查：正式 `/app/agent?session=精确ID`、hydrated agent root1，但整个 DOM input/textarea/contenteditable0、global ask input0、无 page error。Web 能读取该会话，但没有继续输入动作；先前猜测路径缺 `/app` 已被源码/DOM证据否定。

`OrbitGlobalAsk.tsx:39–48` 根据 agent home 路由不渲染 global dock，注释假定 agent 有完整 composer；`orbit-real-agent.tsx:3555–3571` 的 inChat 分支只有 thread bar/thread，dashboard-only 问题输入在 `home` 分支，`useOrbitAskTarget` 仍注册却没有呈现输入。因此是生产功能缺陷，不是 Playwright role 匹配问题。

追加冻结计划/新 Sprint 应恢复当前会话的唯一可见 composer，并保证提交落到恢复的 exact session、canonical actor、真实 revision/history；不要通过 API 直接发送或新路径绕过历史行为称 PASS。必要直接消费者检查包括 `orbit-agent-conversation-readback.test.ts`、reliable-send 完整文件、Web agent 页面/全局 ask 交互及已有 `app-agent-task-interaction.browser.mjs`；新增真实 history → composer可见 → 同session continuation → formal GET/reopen 行为回归。该建议不是本次新增实现授权。

0036 `executeAiRead` 契约已在主线，相关源码与固定 `9b0fd19176661b18ef137b5eb672de4eb48257a7` 的 outer diff 为空。legacy production runtime 仍通过 query-artifact-service→executeActorScopedQuery，没有接 `executeAiRead` 的 records.revision/readAt/authority fence。SC04 源版本缺项保留，不扩大0044重写0036，更不把 updatedAt/schema payload.version 冒充领域 revision。

## 清理、锁与交付

只操作自己精确 session 的原生历史删除按钮，确认框匹配 own title 后确认。原生 row0/confirmation0/无删除错误；独立正式 canonical auth/me200、GET404/list200/historyAbsent=true，历史数量恢复原2。request/revision 审计按既有逻辑保留，清理是可见 session/messages soft-delete，不是物理清扫；不触碰其他历史或既有 note/task/followup。

保留请求 collection `orbit_agent_chat_requests`、record `ca722b70b708851635817c00e9189ee65e289be56adf69f4ce400019c928ed40`，以及同actor/session的 `orbit_agent_chat_session_revisions`；physical table 是 orbit_records，不把 collection 名当 SQL table。之前 dbspy 的两个 request/revision 元数据同样保留，精确 keys 见 dbspy checkpoint。

私有 controller HTTP/close 队列卡住，正式 independent fetch 正常/health200；不修第三轮脚本。close、SIGINT、TERM 后仍不退出，已按 PPID 验证仅强制收尾自己 Chrome96891/Node96873，ps 确认不存在；没杀用户 Chrome/共享服务。账号、设备、API/付费窗口和会话源码锁归还 root。没有服务重启、native rebuild、merge/push。本线提交前只报告文件变更；无残余产品 dirty，ignored证据保留。

回退由 root 按固定功能提交反向补丁协调两端及认证边界，不能回退到 profile ownership 或通过 fallback读其他 actor。后续 Web 生产 build/restart、原生8082验收及缺项修复须 root 排期/另冻结计划；本 run 以 failed 关闭，部分已合入成果不改变失败事实。

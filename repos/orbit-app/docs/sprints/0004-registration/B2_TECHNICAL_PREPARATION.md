# B2：报名问卷失败边界与资格核查

2026-09-14，源码基线 `8d95575c2`。技术准备，不是 [Planner](PLANNER.md) 执行报告；0004 run_count 保持 0。

## 已查明的事实

- 真实历史证据见[连通性记录第 12 节](../../verification/2026-09-13-app-connectivity.md#12-r-04报名草稿问卷版本与当前页回读)：登录态问卷 GET 返回 500、无 Content-Type。本轮随后从留存日志取得对应题库读取异常，详见下节；下方注入异常本身不能追认为历史根因。
- Web `app/api/events/[id]/registration/route-handlers.ts` 的 GET 顺序为：鉴权 → loadEvent → getPublishedQuestionSet（默认）→ registrationService.get → generateEventRegistrationQuestions → JSON。活动、题库、报名存储三个 await 均不在受控错误转换中。
- GET 成功响应只有 questionSet 和 registration；未返回完整的 allowedActions、服务端判定时间或资格理由。默认 GET 无已发布题库时会调用共享模型生成器；`questions=false` 只跳过题库与生成，仍读活动和报名。因此真实 GET 不能一概当零费用、零依赖探测。
- 服务端已有 `resolveEventRegistrationAvailability`，包含 open／profile_edit_closed／registration_closed／unavailable，使用 enrollment.statementTimestamp 与两个截止时间。不是需要在 App 重造的日期策略，也不是覆盖未开放、容量、审核等全部资格的 DTO。
- POST 已区分 legacy 与 admission 流程，admission-controlled 活动禁止直接报名；已有已开始／状态检查、问卷 hash/version 校验，v2 强制匹配版本。不得另建客户端判定绕过服务端限制。
- canonical 报名和 legacy projection 同时存在。`features/events/event-operations/storage/frozen-snapshot-repository.ts` 读取截止时点的 membership／profile 版本与答案形成冻结快照；匹配消费证据不能只查看最新 GET 或 legacy 投影。

以上 Web 路径相对 `repos/orbits`；App `src/view-models/event-registration.ts` 已有题库 hash/version、草稿版本处理，保留这些已交付保护。

## 隔离诊断结果

本轮通过现有 createEventRegistrationRouteHandlers 注入合成活动、已发布题库及 memory registration service，并在独立 Node 子进程清除数据库／provider 环境变量、禁用 fetch。无实际账号、模型请求、报名数据或数据库操作。

- 成功路径返回 200，data 的键恰为 questionSet、registration。
- 分别让 loadEvent、getPublishedQuestionSet、registrationService.get 抛出不同合成错误；三个 GET 调用均以对应错误 reject，而非返回 JSON 错误响应。
- 结论限于“这三层错误目前可逃出 handler”。未启动 Next HTTP 服务，不把函数 reject 写成已测到 HTTP 500；尚不能在三者中选定原真实故障源。

最小复现入口：`createEventRegistrationRouteHandlers({ resolveActor, loadEvent, getPublishedQuestionSet, registrationService })`，先验证所有注入依赖成功，再逐个替换成抛错函数并 assert.rejects。已发布题库避免运行模型分支。

## 下一段安全调查与待审方案

### 留存日志补证：题库 relation 不可见

只读检查本地 `/tmp/orbit-web-api-gzip-evidence-20260913.log`，只输出白名单诊断字段，未复制日志全文或凭证：

- 第 121 行 orbitQa 记录为 requestId `d46f7916-b41f-490f-b548-067873cd2c9b`、GET、500、空 Content-Type、`2026-09-13T05:38:04.404Z`，与原记录一致；第 122 行为报名 GET 500。
- 紧邻该响应之前第 91～105 行：`relation "event_ops_experience_heads" does not exist`，SQLSTATE `42P01`；栈依次为 postgres-client.ts:117 → experience/storage/postgres-repository.ts:161 → experience/service.ts:84 → registration/route-handlers.ts:255。之后重复请求也记录同类异常。
- 当前源码对应 readSnapshot 查询该表，再由 getPublishedQuestionSet 传播到 GET，和隔离异常逃出边界相符。错误栈本身未带 requestId，关联依据是同段服务日志、相邻响应和一致路径；不声称已做当前环境重测。
- 已有 `features/events/experience/storage/migrations.ts` 的 version 1、name `event-experience-v1-versioned-heads` 创建 heads／versions 表，并有 checksum ledger，依赖 event_ops_events。无需先发明新迁移。

因此可把历史问题从“未知 500”缩小为“对应服务日志中题库表不可见的数据库异常”。仍需核对当时／当前连接对象、search_path、schema 和 migration ledger，才能区分未迁移、连接错库或 schema 配置不一致；日志不能证明当前库仍缺表。此后真实数据库检查／迁移必须有适用的精确对象授权，不自动连接、执行迁移或重启服务；缺表不应被吞掉后冒充空题库。

技术提案：

1. 在服务端组合活动发布／阶段、registration window、membership、admission 与容量约束，返回 actor/event 作用域的资格快照、允许动作及判定时点；POST 在事务内重验，不能相信客户端传回的 allowedActions。保留现有 legacy/admission 责任分界。
2. 问卷获取失败返回明确的 JSON 服务错误；不以旧缓存或空问卷返回成功。显示性错误处理不能替代提供方修复，原 500 仍需同环境复验。
3. 复用题库 hash/version 与已有 App 草稿保护；注册、取消、重报增加明确动作意图与版本／回执归属。不同题库不能静默套用旧答案。
4. 答案验收同时记录 actor/event、questionSetVersion/hash、membership/profile 版本、冻结快照版本及下游消费；用户原始回答与已有 NFC／长度标准化区分，不把标准化写成未经变换的字节相等。

Web 候选边界包括 registration 路由、deadline-gated-service、admission registration-control、canonical repository／冻结消费的必要检查，以及新增纯共享响应契约；正式实现前还须列出精确文件并审阅。0004 原 Planner 的“本 Sprint 不修 Web”已不再准确表达用户后续负责人授权，但原白名单仍未批准扩张，不能直接据此开改。

剩余门槛按动作隔离：0003 资料基础影响拦截集成；B2 书面协议影响两端代码；精确数据库环境检查／迁移授权影响题库恢复与当前重测；账号／活动与动作授权影响报名、取消、重报及匹配消费 SC。当前只完成源码、隔离诊断与留存日志关联，不声称任何必需 SC 已完成。

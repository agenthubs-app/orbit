# Sprint 0034 — 按风险开放离线写入验收契约

## 目标、需求与批准

原需求：云端权威、本地耐久镜像、增量同步，AI 只能看到已同步云端内容；延续原 R-00～R-14 总需求登记，不重新编号或删除上游需求。本线只承接离线写入、三策略、受控快照和加密资源缓存。

依据 2026-09-16 已批准[全域离线读取规范](../../../../../docs/superpowers/specs/2026-09-16-universal-offline-read-design.zh-CN.md)及[本线设计](DESIGN.md)。本次委派明确仅规划；更新 GOAL/DESIGN/PLANNER 与[逐步实施计划](../../../../../docs/superpowers/plans/2026-09-16-sprint-0034-risk-based-mutations.md)，提交本线后暂停等管理线审查，不写生产代码、不启动 run、不 merge/push。

本文件是唯一 SprintContract；逐步计划提供文件/接口/RED/GREEN/commit，不另设或降低 SC。生命周期仍只由 Sprint README 管理，本页不复制动态状态。

## 基线与依赖

- 规划基线：`2f862c9f84167408df09914acca521f528ae4185`；0032 [REPORT](../0032-hybrid-sync-foundation/REPORT.md) 的 completed/merged 证据可复用到未变化范围。规划时本工作树 clean，独立分支 `codex/sprint-0034-risk-based-mutations-plan`。
- 旧 README/0033 文档只写四域及串行依赖；当前明确批准允许 A/B/C/D 分线规划与独立预备测试，但不允许合并未验收的 0033 接口。当前规范文件旧待审标签不否定本次批准。
- 执行前管理线登记 owner、run-01、Planner SHA256、实际执行基线与必要环境锁。此规划提交不消耗 Generator run。
- G-A1：0033 身份/租期/在线 guard/scope/epoch 固定导出与 SHA。G-A2：域 registry/strict projection/revision comparator/事务迁移/canonical apply 固定接口。G-A3：资源 manifest/reset/revoke hook。G-A4：服务端授权、单事务 journal/sync-write lock。G-A5：四域 mirror/selector/消费者固定路径。每项都须具体导出签名和对应验收证据，详见实施计划门槛表。
- 可先写 RED：三策略、严格 mutation schema、四域 eligibility、snapshot envelope、binary hash/配额、注入端口 outbox/receipt/conflict/重试与 UI notice。未冻结接口前这些不能视为集成证据。
- 必须等待对应 G-A 门槛：身份/权限 guard、存储 migration、scope/epoch/canonical apply、manifest/native cache、journal/全局 receipt 生产接线及真实 UI 消费。B 自有 `0033-bindings.ts` 适配 A 的实际类型，不定义第二套身份/游标/读取 registry。
- 0035 使用本线 uploader summary，管理重连时序；0036 使用按域 pending 数量与 server AI 前后读验收。缺 AI runtime 只阻塞 SC-05 的真实 AI 证据，其他独立本地工作继续。

## 文件白名单与分工

当前规划允许写且只提交四文件：本目录 `GOAL.md`、`DESIGN.md`、`PLANNER.md`，根 `docs/superpowers/plans/2026-09-16-sprint-0034-risk-based-mutations.md`。

后续执行白名单为根实施计划 Task 1～9 的精确 Files 表，范围包括：Web 新 `shared/contract/offline-policy.ts` / `offline-mutations.ts`、sync mutation route/service/receipt/domain adapters 和 receipt migration；App 新 offline policy/snapshot/binary/0033 bindings、outbox/overlay/uploader/conflict、四域确认 UI、对应测试和生成 contract 副本。现有 notes/tasks/personal-schedule 服务只做同事务适配；App snapshot-store 只接策略入口。必要新增文件依 RULES 第 0 节登记原因和 SC，不扩大产品目标。

A 持有 auth、shared sync.ts、本地基础 schema/repository/lifecycle、读取 registry 和游标。B 不并行改这些共享文件；B migration 由 A/协调者接进版本 runner。根台账、Bridge 状态、Data Atlas 由管理线/D 线更新；B 仅提交实际交接内容。语言/四域屏幕合入由管理线串行协调，保留其他线未提交内容。

## 排除范围

不增加 profile/preferences 等第五写域；不离线接受 task/followup suggestion，不离线创建跟进生成结果。邀请、发送消息、报名、共享 meeting/appointment、角色权限、删账号、provider、扫描/导入执行及 AI/外部副作用在线。它们的数据可离线读。

不重建 0033 AuthSessionProvider/SecureStore envelope/scope/revision/journal/cursor；不修改 0035 transport；不扩大 AI 授权或把本机正文传给 AI；不增加浏览器离线、产品测试接口、第二个领域事务/receipt 权威。未保存编辑器输入仍是 device-only draft。

## 验收契约（最多五项）

| SC | 可观察行为 | 主验证方式与 Task |
| --- | --- | --- |
| SC-0034-01 | 四域确认操作离线保存跨重启、overlay 保留云端 canonical；单域 reset 保留 outbox/conflict/草稿，alias 不跨 scope/domain | Task 4/8/9：file-backed rollback/reopen，真实 SQLCipher migration 与 Simulator 四域重启 |
| SC-0034-02 | 在线再授权后，每 mutation 的领域结果/journal/revision/全局 receipt 同事务仅生效一次；FIFO、有界并发/重试及 alias/ack 原子落地 | Task 5/6/9：真实 PostgreSQL 并发/故障注入、网络丢回执重放、Web canonical ID/revision 回读 |
| SC-0034-03 | 冲突保留双方且需用户选择；云端/本机/合资格副本和删除再确认正确，撤权或锁定时不泄露冲突正文 | Task 7/8/9：resolver 事务反例、Web→离线 App 冲突三种选择，connection revoke 禁止副本 |
| SC-0034-04 | 三策略独立且未知/敏感动作入队前拒绝；snapshot 验证范围/字段/版本/epoch/大小/hash/TTL；binary 单独加密、按需/pin/配额/撤权正确，缺文件不清空文字 | Task 1/2/3/9：完整 0033 route/action policy 覆盖、eligibility negative、真实加密缓存/迁移和 Simulator 在线必需动作拒绝 |
| SC-0034-05 | pending 按域/数量显示 AI 暂不可见；同步前 AI 无本地内容，ack 后读取对应云端 revision，身份/epoch 切换不发布旧 scope 状态 | Task 6/8/9：render/late-response tests，同账号 Web/App/AI 前后真实查询；0036 工具为依赖 |

## 执行、检查与失败处置

- 当前 D 档：检查四文档链接、规范覆盖、接口一致、无占位步骤、`git diff --check` 与 staged GitNexus detect_changes；不跑产品测试/typecheck，不伪造 RED/GREEN 结果。
- 后续 H/I 档：每 Task 写实际行为 RED、执行指定命令见预期失败、最小 GREEN、直接失败反例，再按精确文件提交。收口一次两端全量/typecheck/contract sync、production Web build/restart、iOS SQLCipher build 与同账号 runtime；不逐 helper 跑全量。
- GitNexus 固定主仓 selector 按 RULES 使用，并补当前工作树 detect_changes，防止误把主仓 diff 当本线证据。生产符号编辑前 impact，HIGH/CRITICAL 先报告。
- 重放边界：每 entity FIFO，跨 entity 至多 4，batch 至多 50；full jitter 1 秒基数/60 秒上限，Retry-After 最多 5 分钟，每轮每项最多 5 次/整轮 30 秒。到限保留 pending，不自升预算。
- 快照最多 256 KiB/5 分钟且不超过 A 租期；binary 每项 20 MiB/总量 200 MiB，pinned 满明确失败不静默淘汰。所有数值是本线实现上限，不延长服务器权限租期。
- 数据丢失、重复执行、跨 scope 泄露、隐式覆盖、明文资产、pending 假装已同步为硬失败。失败事务回滚并保输入，权限锁优先阻止读取，日志只留脱敏 code/ID，不存秘密或完整正文。
- 账号认证 401/403 锁账号；domain 403 只撤该域。旧 epoch 不自动改绑；再授权和清撤权必须在上传前。缺接口只暂停对应接线，纯测试/独立适配可继续；本次规划完成后按委派显式暂停。
- 原费用账本累计 AI/OCR $5 上限，已有 $0.012780，不按 Sprint 重置；未具备真实 provider/同账号环境时 SC-05 保留未完成，不以 mock 代替。

## 本次规划检查限制

GitNexus 使用 RULES 指定主仓路径时分析主仓 checkout，不能代表此独立工作树。以 `/Users/xzhao/.codex/worktrees/5686/orbit` 请求检测返回 repository not found；当前工作树没有 GitNexus 索引。保留工具尝试与此限制，四文档范围由当前工作树 staged diff/path/link 检查核实；不得把主仓 AGENTS/CLAUDE 变更计入本线，也不得将本线符号检测报告为通过。规划阶段不为修复索引改其他文件。

## 交接和完成定义

规划交接给出当前基线、四文件名、分支、固定规划 SHA、diff/GitNexus 检查结果及未改生产代码事实。管理线审查此具体版本；本线不 merge/push、不预写完成报告。

未来执行阶段只在实际结束后写 REPORT：逐 SC 映射 feature SHA/文件/RED→GREEN/故障注入/native/同账号 ID+revision/AI 证据，列出未满足条件和失败历史。Web/API/shared 改动必须重新生产构建并重启后才用运行证据。管理线收到固定 feature/report SHA 后按依赖合并 `chat-agent`，验证精确合并树并更新 Bridge/README；未完成该闭环不能标 Sprint completed。

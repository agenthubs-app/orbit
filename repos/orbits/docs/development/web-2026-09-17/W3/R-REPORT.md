# W3-R / R2 报名回执与身份边界

日期：2026-09-17。基线：`55dc5ec9062abe75c33bd254de56049c258ebc8e`（F 已由主任务独立验收）。本报告只记录 R；F 原有证据不改写。

状态：**未发布 candidate，代码独立 review、84项回归、完整 typecheck 及最终变更范围门禁已通过。历史 raw/profile ID 报名兼容和 iOS 报名屏身份接线尚未解决，属于发布阻塞，不是可直接上线的完整历史修复。** Astra 负责设计、独立 review、实际本地浏览器验证与提交；原 `w3_f_luna`（gpt-5.6-luna/max）负责编码。

## 根因与最终行为

1. admissionControlled POST/DELETE 原先直接接受 application 响应并发布到 UI，缺少 legacy 分支已有的回执关联及独立 GET。现在校验 canonical actor/event、正安全整数 applicationVersion、有效 status；DELETE 还要求 status=withdrawn 且版本严格等于请求 expectedApplicationVersion+1。只有随后 GET 的直接 data 与回执 actor/event/version/status 全部相同，才更新申请状态。缺失、嵌套错误形状、版本冲突或网络失败不显示保存成功，保留回答并提示重新读取状态。
2. 单纯比较 actor/event scope 无法区分 A→B→A 的不同操作。撤回操作捕获现有 generationRunId 作为操作序号，在写入响应、GET、异常和 finally 后均校验；旧操作不会覆盖新状态或解除新操作的 pending。scope 改变时同步重置 pendingCancel。
3. register/page 原先把原始 session.user.id 传给服务与 Workspace，而 admission API 使用 canonical account ID。当 profile ID 与 account ID 不同，即使正确的本人回执也会被严格客户端拒绝。经主任务/W0 确认文件无占用后，追加复用现有 resolveAuthenticatedApiActorFromSession 的最小页面接线；缺 membership 失败关闭，不回退原始 ID，匿名跳转及无 request-scope 测试语义保留。

4. 后续核对发现 legacy registration 与 cancel 的真实 route 仍自行读取 raw session ID，原页面修复不能独立保证全链一致。主任务/W0追加批准只将两个 route 的 resolveActor 接到既有 resolveAuthenticatedApiActor；保留 handler 依赖和行为，不改其版本、签名、资格规则。

本批不修改鉴权解析器、API handler/响应契约、准入规则、共享 DTO、数据库 schema、画像模型或付费调用。legacy 的 readRegistrationReadback 校验体未改变；只补独立反例并让撤回调用者使用同一操作序号隔离。

## 产品和测试边界

- 产品：`app/(app)/app/events/[id]/register/event-registration-workspace.tsx`、`app/(app)/app/events/[id]/register/page.tsx`、`app/api/events/[id]/registration/route.ts`、`app/api/events/[id]/registration/cancel/route.ts`。
- 新增测试：`tests/pages/event-registration-readback.test.tsx`、`tests/pages/app-event-registration-account-scope.test.tsx`、`tests/api/event-registration-account-scope.test.ts`。
- `RECOMMENDATION-DESIGN.md` 为独立后续设计提案，未实施推荐产品改动；其批准不影响 R 收尾。

## 反例与证据质量

- 最初 wrong-actor POST 测试实际失败：未修复代码仍发起一次 persona 请求，预期为零。日志 `/tmp/orbit-w3-r-red-receipt.log`。
- A→B→A 测试通过临时撤去操作序号保护的受控变体实际失败，迟到旧 GET 将 pending_review 错改为 withdrawn。日志 `/tmp/orbit-w3-r-red-aba.log`；变体已恢复，不提交。
- GET 错 actor/event/status 反例均以同一 v4/pending_review 有效对象为基础，每次只改目标字段，避免被版本差异偶然挡住的假阳性。
- legacy 校验覆盖 actor/event/record/profile/action/version 错误，以及 GET 错 actor/event/version、失败 envelope、断网；有先等待独立 GET 才成功的正例。
- admission 测试覆盖 POST/DELETE 回执、独立 GET、single-flight、保留回答、pending/waitlisted 不冒充 admitted、迟到 POST、GET 期间换 actor、卸载、A→B→A。

## 实际本地产品路由验证

独占资源：PostgreSQL `127.0.0.1:55463/orbit_web_w3_20260917`，workspace `workspace:orbit-small-staging-20260917`；Next `http://w3.localhost:4613`，本树独立 `.next`，普通 Credentials 登录，只用合成账号/活动。未使用云、生产、共享运行目录或付费 AI。

- 已通过的 participant B：普通报名页显示 admitted v1，确认撤回后服务器 DELETE 200 → GET 200，页面显示 withdrawn v2，三条回答保留；刷新仍 withdrawn v2。详情变为真实 0/8、剩余8。
- 待审核 empty 账号：通过现有本地服务配置 review policy 并建立 pending_review v1；普通登录后页面显示待审核，未显示已报名。确认撤回 DELETE 200 → GET 200，显示 withdrawn v2；刷新仍保持，三条回答保留。
- 独立 SQL 后验：三个测试账号的申请均 withdrawn v2，canonical membership 活跃报名数为0。日志 `/tmp/orbit-w3-r-db-before.log`、`/tmp/orbit-w3-r-db-after.log`；HTTP 顺序在 `/tmp/orbit-w3-next-r.log`。待审核场景结束后通过同一政策服务恢复 instant，capacity 仍为8，policyVersion=6。
- 实际浏览器未执行付费 AI 问答和 POST 完整模型链。POST/异常响应/迟到请求证据来自 mounted component 和 API 测试；不能冒称实际模型端到端验收。
- seed 的原始 ID 与 account ID 相同，普通浏览器验证不证明分离 ID 场景。该场景由页面接线测试、真实身份解析函数测试和严格回执正负例共同证明。
- 页面身份接线后再次正常刷新，昵称、withdrawn v2 和三条回答仍正确。随后仅停止自有 Next PID 82412，恢复其自动生成的 next-env.d.ts；未停止其他任务 runtime。

父代理阶段门禁：`env -i`、TZ=Asia/Tokyo、自有 PostgreSQL，运行 readback/workspace/status-card、registration/admission API、authenticated actor helper、admission journey PostgreSQL 共7文件，**52/52通过，0skip**。日志 `/tmp/orbit-w3-r-parent-gates.log`。该运行早于最后两条 legacy route 接线；最终接线门禁另记，不能用这一阶段结果替代。

父代理最终门禁：同一隔离环境运行14文件，**84/84通过，0skip**，覆盖3个新增测试及原 workspace、status-card、guide、registration/admission/review/identity/adaptive-auth/deadline/blocking-reason API 和真实 PostgreSQL journey。日志 `/tmp/orbit-w3-r-parent-final-gates.log`。完整 `tsc --noEmit --incremental false -p tsconfig.json` exit 0，日志 `/tmp/orbit-w3-r-parent-typecheck-final.log`。过程中仅发现新增测试 unknown props 的类型标注错误，修正后该页面5/5重新通过（`/tmp/orbit-w3-r-parent-account-final.log`），产品行为未改。另一次较早 guide 运行漏传数据库环境变量，fixture before hook 拒绝执行；补自有PG后通过，未以改产品处理环境错误。

## GitNexus 与范围审阅

本树索引 alias `orbit-web-w3-15e3`；所有命令指定本树绝对路径。R 基线增量图构建完成，但 File FTS 有既有 Invalid UTF-8 失败；关键词查询降级已披露，不以重复强制构建或修改依赖修复工具。impact/context 使用精确符号/文件并以源码校对。

- Workspace / runGeneration：LOW。
- readRegistrationReadback：HIGH（2直接、4受影响、1流程），编辑前已披露；校验体未改，调用者仅补迟到隔离。
- cancelRegistration 与新增私有回执函数：UNKNOWN，已用 JSX 回调和 rg 补证，不把无图边当无调用。
- currentRegistrationActor：exact LOW，1个直接调用者 AppEventRegistrationGuidePage。
- AppEventRegistrationGuidePage：exact UNKNOWN，0解析调用者；Next 文件路由和 guide 测试动态 import 已经源码确认。相关日志 `/tmp/orbit-w3-r-page-actor-impact.log`、`/tmp/orbit-w3-r-page-impact.log`、`/tmp/orbit-w3-r-page-unknown-rg.log`。
- 两个 legacy route 的 resolveActor：exact UNKNOWN，0解析调用者。GET const 是 UNKNOWN/lower-bound，23个 GET receiver typing 调用点没有图边；这不是低风险或完整分析。源码确认 route 导出的 handlers.GET/POST 与以下 Web/App 消费者；完整保留 `/tmp/orbit-w3-r-impact-registration-actor.log`、`/tmp/orbit-w3-r-impact-registration-get.log`、`/tmp/orbit-w3-r-impact-cancel-actor.log` 的边界。

最终使用官方 `--skip-fts` 刷新本树关系图，后完成一次 `--force --skip-fts`：108783 nodes、244995 edges、2064 clusters、801 flows，日志 `/tmp/orbit-w3-index-r-final-force.log`。FTS 明确禁用，关键词搜索不可用；关系图构建仍提示候选调用/流程预算限制，不把缺失流程当不存在，也不宣称全部运行路径完整。

完整原始 detect_changes 为 **267/267 symbols、9 affected processes、10 Git files，risk=high**；error/partial/truncated 字段均为**未提供**，不是人为补 false。4产品+3测试+2 Markdown 的9路径均有实际符号映射，无空ID、无未解释遗漏或越界路径。剩余 `R-DETECT-CHANGES.json` 是非执行证据 artifact，工具按实际 Git diff 计入第10文件，无可执行符号属于正常边界；经主任务确认按 JSON 内容和哈希独立核验，不为自引用 artifact 反复重建或伪造符号。该文件 SHA256：`1a235568c024a70e097462d4d79cdaa1698d2d1d9fce97fe561e2b9e02004641`。

9条受影响流程集中于 runGeneration→readback→receipt/status，以及 registration page→现有身份解析和账号读取；与本批变更一致。raw 文件完整保留267项，不用CLI默认15项截断窗口当全量证据。覆盖校验日志 `/tmp/orbit-w3-r-detect-coverage-final.log`；最终 `git diff --check` 通过。

## 跨端与剩余边界

Web 在既有响应契约上增加回执/回读验真；共享响应形状没有变化，不需同步契约，但 route actor 的规范化会影响跨端消费者。**未解决的发布门：**

1. 历史报名不是自动兼容。`deadline-gated-service.ts:226` 按 enrollment 选择 legacy/canonical service，原样传 userId；legacy provider 按 eventRegistrationId(eventId,userId) 查询，canonical repository 按 actor_id 精确查询。既有 canonical migration 保留原 registration.userId，未发现 account/profile alias 解析或 ID 迁移。W0本地真实 service/provider memory 实证：raw profile 报名后 account GET/cancel 均为 null，再以 account 报名可产生同 event 两条 rsvped。这意味着历史状态、重复报名和容量风险，不能靠 GET 双读解决。R 只交统一今后身份的未发布代码，历史审计/冲突解决/迁移由主任务与W0另行设计；本批没有生产数据审计或迁移授权，也不能声称生产里没有此类记录。
2. iOS 实际消费者：`src/screens/events/EventRegistrationScreen.tsx:79` 使用 auth.user.id 作为 actor，并在 GET、POST registration、POST cancel 的回执中严格匹配；`src/api/AuthSessionProvider.tsx:515` 的 auth.actorId 则来自独立 accountId。分离 ID 时报名屏可能拒绝 canonical ACK；`CanonicalEventDetailModules.tsx:36` 已优先使用 auth.actorId，但仍存在 raw fallback。上述源码只读核对并已交主任务/Bridge跟踪，R 不编辑 App，也不声称 iOS 端到端通过。`EventDetailScreen.tsx` 另有 registration GET 消费。
3. Web Workspace 的真实 POST registration、POST cancel、GET registration?questions=false 与 adaptive interview/persona 路由已源码核对；adaptive handler 和页面签名都使用 canonical actor，两个 legacy route 接线是其必要依赖。完整付费模型链未执行，仍是单独验证边界。

独立后续推荐设计可在 R 领域 review 后实施服务层，不以等待生产历史审计为由阻塞已授权本地开发；上线仍受上述发布门约束。

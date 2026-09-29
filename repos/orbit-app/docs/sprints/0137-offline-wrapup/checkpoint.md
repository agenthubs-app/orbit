# Sprint 0137 · run-01 恢复点

2026-09-29 开工登记。生命周期状态仅以 ../README.md 为准。

- 唯一 Generator：A 线 `/root/line_a_0137`，GPT-6 Luna / high（用户本日最新指定）。
- 批准：用户要求按 HANDOFF-2026-09-29.md 执行；0137 Planner 已批准，原验收契约不变。
- 基线：`dda127368a3b62fb8fea44bac8de0b3eddb458ef`（chat-agent）。
- Planner SHA256：`41f79ceb82ea1d69126d9db23b1a12c4306e164e7e14bca30bb1226652a251b5`。
- 工作区：`/Users/xzhao/.codex/worktrees/sprint-0137-offline-wrapup/orbit`。
- 分支：`codex/line-a-sprint-0137`（登记提交同步到工作区后创建）。
- 文件锁：0137 必要 App、Web/API、shared/compute 和对应测试由 A 线独占；具体路径经调用图检查后追加。主线程独占根登记表、Bridge 台账和 chat-agent 集成。
- 环境锁：A 线独占本轮 3100 local-stack、phoneweb、iPhone 17 Pro Debug/Metro 验证；不得停止用户 3000 服务。结束停本轮自建服务，并恢复模拟器 API 地址 `http://127.0.0.1:3000`。
- 开工检查：主线产品源码干净；用户 codex-review.md、output/ 和 .claude/skills/gitnexus/ 均保留且不提交。系统盘空闲 15GiB；低于 5GB 停止依赖构建动作，不删除 orbit_scale_test。
- GitNexus：根索引已重建至基线（110460 nodes / 183328 edges）；改符号前须 upstream impact，提交前须完整 detect_changes。
- 授权边界：只本地实施、验证和提交；不 push、不部署、不写生产库、不 stash。运行时验证前获准要求 provider keys 清空；实际进程核验及本轮请求范围见下方更正，当前不能宣称付费调用门槛已证明。

## 下一步

### 最新恢复点（2026-09-29 12:05 UTC；下文为此前过程记录）

- A 仍为同一 run-01 的唯一 Generator，原 SC-01–05 不变。既有产品已进入本地 `chat-agent`；合法存储微秒精度读取修复 `87022df63` 已由 `c795477ec` 合并。原 raw `VALIDATION_ERROR` 截图保留，不倒改为通过。
- Root 在主线独立验证真实 PG 生命周期与初始化完整两文件：33/33、0 fail/skip、exit 0，日志 `build/harness-logs/sprint-0124-0137/main-87022df-lifecycle-pg-33.log`。服务端 typecheck exit 0。通用服务端完整文件集在同源无 dotenv 的 B 隔离目录得到 5355 tests / 4867 pass / 0 fail/cancelled / 488 skip、exit 0、740194ms，日志 `main-c795477-equivalent-isolated-orbits-full-serial.log`；不是主线物理 cwd 运行结果，也不是跳过的数据库场景已验收。该修复没有改变 App 产品或测试源码，主线原 3908/3908 证据适用相同 App 源码。
- A 已重构建/重启测试 Web 栈，并回读真实 A 联系人 `contact_108`，在线下部 lifecycle 成功。Root 实际查看 `online-A-contact-108-relationship-fixed.png` 和 `offline-A-contact-108-relationship-fixed.png`：停服务后的同一已挂载页面仍没有「截至」且编辑入口是在线外观；不能作为 SC02 镜像读取通过证据。A 正查验冷启动或实际离开再进入后资源状态及写入门禁，若证实产品缺陷按原范围最小 TDD 修复。
- 已核对：A 看板 43/19/15/1、总数 78 的同账号 API/网页/原生/冷离线；真实 B 打开 A 联系人的未存本机空态；最终组合退出登录后的五个访客页。剩余：笔记和 AI 真正跨账号空态、九个精确路由与对应截图、个人日程编辑、最终版本的 SC05 和报告。
- 0124 已完成并合并，不等待 0137 的所有设备证据。B 已在独立 0132 工作区接续。A 已释放 NoteDetailScreen/AiConversationScreen 的产品文件锁，B 不操作 A 冻结运行工作区；A 继续独占 Simulator、phoneweb、3100/8082。Root 只维护台账、集成和核对，不替 A/B 实现，不 push/部署，不动用户 3000。

- 可执行：A 线读取已批准计划、登记必要文件，执行 SC-0137-01–05 的 TDD 与运行时验收；主线程维护登记并核对固定交付 SHA。
- 可调查：主线程读取已批准断网写设计及后续 Sprint 接口依赖，为 0124 接续准备，不提前实施。
- 等待决定：生产上线、孤立来源清理和 orbit_scale_test 删除，不阻塞本轮本地开发。

开工时尚无产品改动或功能提交；本次为同一 run 的起点，不是完成报告。

## 当前进度（2026-09-29，同一 run）

**新增必要文件／白名单补充：**
- 共用阶段算法：`repos/orbits/shared/compute/contact-pipeline.ts`、`repos/orbit-app/src/api/compute/contact-pipeline.ts`；本地投影：`repos/orbit-app/src/view-models/contact-pipeline-local.ts`。
- 对应测试：`repos/orbits/tests/services/contact-pipeline-compute.test.ts`、`repos/orbit-app/tests/contact-pipeline-local.test.ts`。
- 已改文件限于 Sprint 0137 的 pipeline、contact detail、未缓存内容空态、离线清单与对应测试；完整路径以当前分支差异为准。未改 Web API 的筛选、权限、canonical qualification、聚合与 cursor/page SQL 职责。

**进度与证据位置（截至 2026-09-29 run-01 收口）：**
- SC-0137-01：共用阶段纯计算、App 本地镜像优先接线及真实 PostgreSQL parity 的定向证据通过；服务器 SQL 仍承担权限筛选、分页、有界聚合与读取。日志 `postgres-contact-pipeline-parity.log`。代码已实现，但 SC 整体仍待完整运行时验收。
- SC-0137-02：页面与定向测试已实现/通过。Phoneweb B 的联系人详情真实离线显示设备截至提示、关系信息需联网，截图 `phoneweb-b-contact-online.png`、`phoneweb-b-contact-offline.png`。Simulator 未能登录，故 native 侧此项未验收。
- SC-0137-03：Phoneweb A 离线 SPA 路由打开 B 未缓存笔记，真实显示“此内容尚未保存在这台设备上”空态；截图 `phoneweb-a-foreign-note-offline-spa.png`。早先未走 SPA 状态切换的错误态截图不作通过证据。外账号 AI 会话的 native/phoneweb 运行时空态尚未确认；定向测试证据 `green-foreign-ai-conversation-empty-state.log`。
- SC-0137-04：已有 Simulator 截图覆盖登录、注册、找回/重置密码等 auth 状态，但不是要求的登录后产品五页验收。A 的 Simulator 登录停在 `SYNC_CLEANUP_STATE_FAILED unavailable`；本轮未能完成两账号、五页逐页缓存/断网截图，SC 未通过。
- SC-0137-05：Orbit App 全量 `3861/3861` 通过；现存 Orbits 类型检查/lint 及定向结果按原日志保留。orbit_test PostgreSQL 定向套件 `323` 项，`318` pass、`0` fail、`5` skip；cutover 子集仍有 `7` 个已记录失败，与 HANDOFF 的已知差异一致。对获批 scratch `orbit_merge_verify_20260907_c45a` 先 dry-run、确认旧消息集合为零后应用既有缺表迁移；迁移后 `notification-discovery-worker-postgres` `3/3` 通过。`cardIdentityExplicit` 在当前树及同配置基线 `dda127368a3b62fb8fea44bac8de0b3eddb458ef` 的独立 worktree 得到相同差异，故不能视为已绿或仅凭源文件未改归为非回归。全量 0 失败门槛仍未达成。
- 本地凭据来源已纠正：A 使用 `/Users/xzhao/Projects/orbit/repos/orbits/.env` 中既有主测试账号配置；B 使用 `/Users/xzhao/Projects/orbit/repos/orbits/.env.local` 中既有测试账号邮箱/密码配置。凭据值不进入 checkpoint 或日志。两者均能在 phoneweb 登录；Simulator A 的 native cleanup preflight 阻断登录。尝试用 idb 输入 B 时邮箱标点未能保持，因此没有输入 B 密码或提交登录。
- Provider 安全状态更正：对本轮运行进程仅检查环境变量名与是否非空，不打印值。32137 phoneweb、8082 Metro 和 local-stack workers 当时仍继承部分非空 provider-key 变量；3100 web listener 未检测到。期间只做了账号/页面/notes 等读取，没有 AI 生成/提交。为避免后续调用，已停止这些本轮服务；因 keys 并非明确清空，付费调用为零的门槛仍未充分证明。
- 服务/设备收口：3000 保持原 PID `96114`，未停止；3100、32137、8082 已停止。Simulator app 已 terminate，未 erase/清除设备数据，也未在设置页改写服务器地址。系统盘最新空闲 `7.3 GiB`；`git diff --check` 通过。
- 详细日志、TDD RED/GREEN、phoneweb 与 Simulator 证据均在 ignored `build/harness-state/evidence/sprint-0137/run-01/`；工作区 GitNexus 索引目录不纳入提交。
- 当前功能文件及新增测试保留在本分支，checkpoint 为事实更正；尚未创建结束 run 的 REPORT。SC-0137-04 的登录后 Simulator 验收、SC-0137-05 的全量 0 失败与 provider-key 清空/0 付费调用证明仍未完成。本记录是部分交付 checkpoint，不表示 Sprint 完成；待 native 环境修复后协调恢复同一 run。

## Native 启动诊断补充（2026-09-29，只读复核）

- 可复用的 8081 启动证据：`simulator-debug-build.log` 记录 `npm run ios -- --device <UDID> --no-bundler` 完成 prebuild、安装 `app.agenthubs.orbit`，并由 Expo CLI 打开 `app.agenthubs.orbit://expo-development-client/?url=http%3A%2F%2F192.168.1.105%3A8081`；`simulator-first-render.png` 证明 JS 已渲染登录页。该日志不包含 8082 启动记录。
- 可复用的 8082 路径来自本轮较早的运行记录（不是上述保存日志）：在 `repos/orbit-app` 启动 `EXPO_PUBLIC_ORBIT_API_BASE_URL=http://127.0.0.1:3100 node node_modules/.bin/expo start --dev-client --lan --port 8082 --ios`，使用 Expo CLI 输出的 `app.agenthubs.orbit://expo-development-client/?url=<编码后的 http://<当时LAN-IP>:8082>`；app 已运行时先 `xcrun simctl terminate <UDID> app.agenthubs.orbit`，再 `xcrun simctl openurl <UDID> '<Expo CLI输出的完整URI>'`。`192.168.1.105` 仅是旧日志中的地址，现场必须用当前 LAN IP 和 CLI 实际输出。此前没有保存 8082 CLI 原始日志，故其精确现场输出不能由该日志复证。
- B 当前 `No script URL provided` 的实际启动命令／app 启动入口尚未留在 A 的证据中，不能据此断言其原因。对照时应记录 B 的 Expo CLI URL 和实际 `openurl` 参数；若直接点图标或仅 `simctl launch`，它与显式传 Expo URL 的上述路径不同。不要据此增加依赖：`app.config.ts` 已配置 `orbit` scheme，旧 DerivedData app 注册 `orbit` 与 `app.agenthubs.orbit`；保存的成功 8081 路径也证明该构建曾能打开 dev-client URL 并渲染。
- 错误分层及证据边界：截图 `simulator-sync-cleanup-blocked.png` 是 JS 登录页之后的 cleanup preflight 阻断，不是 `No script URL provided`。`sync-lifecycle.ts` 的 `prepare()` 对 `loadNative()` 失败和 `readPendingSyncCleanup(native)` 失败分别 catch，但两处都只报告 `SYNC_CLEANUP_STATE_FAILED` 且不保留原异常，所以现有截图／证据日志无法判断究竟是哪一段拒绝；只读复查本轮保存日志及系统日志，没有找到带底层异常的原始记录。`expo-secure-store` 当前包入口为 `build/SecureStore.js`、包含该 JS 文件但无 `SecureStore.bundle`；旧记载的 404 是另一类 bundler 资源请求，既不等于缺少 JS bundle URL，也没有证据证明它导致 cleanup catch。根因仍待 B 在获锁后采集原始异常。
- 环境锁更正：本段追加时 Simulator、3100 与 Metro 8082 已由 B 持有；A 只做历史工件／源码／系统日志只读核验，未启动或重启服务、未操作 Simulator。

## `cardIdentityExplicit` 兼容修复及全量复核（2026-09-29，同一 run）

- 必要范围补充：`repos/orbits/shared/contract/business-card-batch.ts`、`repos/orbits/shared/api-schema/business-card-batch.ts` 与既有 `npm run sync:contract` 生成的 App 副本 `repos/orbit-app/src/api/contract/business-card-batch.ts`、`repos/orbit-app/src/api/schema/business-card-batch.ts`，以及 `repos/orbits/tests/api-schema/business-card-batch-schema.test.ts`。Server DTO 已可选返回该字段，repository 对每个 item 均映射布尔值；schema 原先剥除未声明字段，导致 parsed response 深比较失败。修复仅增加 `cardIdentityExplicit?: boolean | undefined` 和 `z.boolean().optional()`，没有默认值；既有不带字段的 legacy fixture 保持原样，错误类型被拒绝。未修改 OCR、生命周期、权限、实体写入或断网行为。
- 图分析：本工作树绑定 `/Volumes/ORICO/Dev/MacMovedData/dot-codex/worktrees/sprint-0137-offline-wrapup/orbit`（GitNexus 索引 commit `8b25eb4...`，落后 HEAD 2 commits）。`IngestItemContract` 精确 UID 的 upstream impact 为 MEDIUM（5 direct、35 total）；server 实际 `cardIdentityExplicit` 消费者是 v2 handlers 与 `ingest-v2-route-view-model.ts`；ingest schema 的 Function/Const UID 虽报告 0 callers，实际 schema 被 ingest detail/action/upload/confirmation wrappers 和既有 schema 测试使用。`npm run sync:contract` 已更新两份 App 副本。
- RED：`red-card-identity-provenance-schema.log`，新增断言在 `cardIdentityExplicit: false` 时失败，证明字段被剥离。GREEN：完整 `business-card-batch-schema.test.ts` 使用获批 scratch `orbit_merge_verify_20260907_c45a`，`37/37 pass, 0 fail, 0 skip`（含真实 handler 测试的随机 schema cleanup）；Server v2 two-sided contract/API/route-view-model 定向 `23/23`；App contract/schema sync 与名片 view-model/profile 直接消费者 `63/63`。Server 和 App typecheck 均通过；App typecheck 首次发现 exact optional 类型需含 `| undefined`，修正后重跑通过。日志分别为 `green-card-identity-provenance-schema-full.log`、`green-card-identity-provenance-server-consumers.log`、`green-card-identity-provenance-app-consumers.log`、`orbits-card-identity-typecheck.log`、`orbit-app-card-identity-typecheck.log`。
- Orbits 默认并行全量用精确 scratch 配置结果 `5350 tests / 4863 pass / 1 fail / 486 skipped`。唯一失败为 `tests/services/notification-discovery-bounds.test.ts` 中另一 feature 的 PostgreSQL `40001`，发生于共享 scratch 的 `enqueuePage` serializable transaction；该 repository 已将整个事务对 `40001`/`40P01` 有界重试最多三次。相同环境下单文件复跑 `1/1 pass`。`run-node-tests.mjs` 的默认 `node --test` 以多文件并发运行，多个 PG 测试共享同一 scratch；当前证据支持全量调度争用但不足以证明唯一根因。按协调者裁定未修改 notification 事务或重试上限，不把默认并行全量算作零失败。
- App 全量复跑在系统盘空闲降至 `4.6 GiB`（低于 5 GiB 停止线）时中止，退出码 130；`orbit-app-full-after-card-identity-fix.log` 是部分日志，不构成全量结果。此前 3861/3861 成功日志对应 schema 修复前版本，不能替代本次版本全量。未清理数据、未继续耗盘构建或索引动作。
- 当前 SC-0137-05 仍未满足全量零失败门槛；A+B 组合树的最终串行文件级数据库 profile、App 全量以及设备九页验收仍待恢复条件后完成。默认并行 Orbits 全量单项 failure 与 App 中断均如实保留；不创建结束 run 的 REPORT，不标记 Sprint 完成。

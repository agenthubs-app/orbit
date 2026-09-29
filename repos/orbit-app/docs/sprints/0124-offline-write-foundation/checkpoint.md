# Sprint 0124 · run-01 恢复点

2026-09-29 开工登记；生命周期状态仅以 ../README.md 为准。

- 唯一 Generator：B 线 `/root/line_b_0124`，GPT-6 Luna / high。
- 批准：按已批准 0120 设计及本 Sprint Planner 实现；用户最新要求独立开发并行，进入条件 0120 已批准、0131 已合并均成立。0137 先合并的集成次序保留，不降低验收契约。
- 基线：`8b25eb4ccfec95254226306da3b16d5d1924e0af`（chat-agent，0137 产品改动尚未合并）。
- Planner SHA256：`628ed00ae45abcc5e7d5ad4a201049d05ba36dce63c75bdb4f56f22924b0fc49`。
- 工作区：`/Users/xzhao/.codex/worktrees/offline-write-foundation/orbit`。
- 分支：`codex/line-b-sprint-0124`（同步登记提交后创建）。
- 文件锁：B 独占本地 sync_outbox/aliases 迁移、repository、叠加读取、上传器、保险箱、sync-lifecycle、认证状态接线、服务器账号状态接口及对应测试；实际新增路径经调用图检查登记。不修改 0137 的联系人/看板/笔记详情/AI 对话页面、shared/compute/contact-pipeline 或离线页面清单。不开放产品类别离线写入。
- 共享契约：仅同步本 Sprint 的准确契约路径；不广泛重生成而覆盖 0137 的独立内容。跨线变更由协调者安排集成。
- 环境锁：Simulator、phoneweb 账号、3100 和 Metro 由 A 独占；B 先执行真实 SQLite、注入时钟的定向测试及隔离账号状态测试，设备验收等 A 释放。重数据库套件不与 A 争用同库。不得停止用户 3000 服务。
- Git：只在本线分支精确提交；主线程独占 README、HANDOFF、Bridge 和 chat-agent 集成。提交前完整图变化分析；不提交用户 codex-review.md、生成技能或输出目录。
- 本机：系统盘空闲 8.8GiB，低于 5GiB 停依赖构建动作；不删除 orbit_scale_test，不重复安装依赖，优先复用依赖与外盘工作区。
- 授权边界：本地开发、必要测试、提交、主线合并；不 push、不部署、不写生产/Neon，付费调用 0。

## 下一步

- 可执行：唯一 B Generator 执行 SC-0124-01–05，开发阶段定向 RED→GREEN；与 A 的验收并行。
- 可调查：账号状态接口和本地清空路径的真实调用关系；必要新增文件按规则追加，不新增审批循环。
- 等待资源：Simulator 与 3100 锁的释放，只阻挡本 Sprint 设备验收，不阻挡基础实现。

本记录不是 REPORT，尚未声明任何 SC 通过。

## 实施进展（2026-09-29）

- 已同步登记提交 1aa851ca88a07116d9dad849aea0f55256548739，本线从该提交继续。
- RED→GREEN：真实 SQLite v3→v4 队列迁移；未尝试同记录合并；首次尝试冻结请求体、单飞重试；服务端镜像与待写队列分离；ACK + 30 天别名 + 精确依赖替换同事务回滚。
- API 已落地：src/data/sync/local-sync-repository.ts 的 listQueuedMutations、beginOutboxMutationAttempt、markOutboxMutationFailure、acknowledgeOutboxMutation、resolveAlias、readOutboxOverlay、countOutboxMutationsByDomain；上传器 src/data/sync/outbox-uploader.ts 通过注入 transport / clock / random / sleep 实现确认→逐条上传→拉取、最多 4 并行、FIFO/依赖、每条每轮最多 5 次及响应分类。
- 保险箱接口位于 src/data/sync/pending-write-vault.ts；native sync-lifecycle.ts 先验证独立 SQLCipher vault 写回与 SHA-256 指纹，再清理账户库；同账号恢复只写回 outbox/aliases，不恢复镜像。注入 vault 写失败会阻止 purge。
- 账号状态：repos/orbits/app/api/account/status/route.ts 直接解码 JWT，不经过 auth()；明确返回 active/disabled/password_changed，存储异常为 503。App 只在 status 明确确认时清理会话。
- 定向验证：App local-sync repository、outbox uploader、pending vault、lifecycle、mobile-auth/offline-identity 测试均已通过；App npm run typecheck 通过。Server account-status API 3 项定向测试与 npm run typecheck 通过。没有运行全量双端、真实 PG 或设备验收；没有开放产品类别写入。
- 待续：接入所有上传触发时机与账号切换确认；隔离 PG 真实存储证据；交接另端适配接口；A 释放资源后完成设备及全量双端 H 收口。无 SC 标记通过。

## 必要文件范围补充（2026-09-29）

- 新增接线文件：`src/data/sync/sync-coordinator.ts`（集中在线租约成功后、镜像拉取前调用 outbox 上传适配器）、`src/components/OrbitNotificationsCoordinator.tsx`（系统通知响应与冷启动通知点击的实际导航入口）。仅改 `src/notifications/NotificationLifecycle.tsx` 无法覆盖 OS 通知响应：该文件只处理 Linking URL，而系统通知由上述 coordinator 路由。
- 依据：0124 SC-05 上传触发时机必须包含通知点击跳转前；新增路径仅完成同一已批准操作链的调用，不开放产品类别写入或新增服务端写入 API。`sync-coordinator.ts` upstream impact MEDIUM（57 下游，直接共享入口 `useSyncedCollection.ts`）；`runSync` LOW（1 caller）；`OrbitNotificationsCoordinator` LOW（1 caller，`app/_layout.tsx`）。
- 验收保持原 Planner 不变。同步会在有效在线租约后调用注入的 outbox handler，再拉取服务器镜像；OS 点击通过显式同步走同一入口后才导航。未完成其余触发、账号换号确认及设备验收。
- 新增安全边界路径：`src/data/sync/mutation-adapters.ts` 与 `tests/offline-mutation-eligibility.test.ts`。前者原有 eligibility helper 把 note/task/followup/schedule 判为离线写合格，虽无生产调用方；与 0124“0132 起才开放产品写”冲突。impact LOW、直接调用方 0（源码搜到的消费者仅该测试），已将 Foundation 阶段 helper 收口为全部产品 mutation false，严格解析契约保留不变；RED→GREEN 测试 7/7、typecheck 通过。
- 测试域边界：`testOnlyOutboxDomains` 只能由测试 coordinator/repository 显式提供，默认 app coordinator 未注册。测试域 ACK 在事务内清除队列并维护别名，但不进入产品 `sync_records` 镜像；真实 SQLite + 注入假 transport 集成确认 1 次 ACK、队列清空、镜像 0 行。
- 上传触发器：App 根通知协调器在有效登录后冷启动、回前台和 15 秒前台节拍触发显式同步；网络恢复沿 serverReachability 即时触发；系统通知响应/冷启动通知在导航前等待显式同步。测试覆盖 15s cadence、foreground、reconnect 和等待上传后导航。入队通过 coordinator 的 test-only 入队方法，在事务提交后触发同步；`useSyncedCollection.refresh` 保持显式手动重试路径。
- 安全边界补充：新增 coordinator `offlineMode` gate，在线续租/镜像读取不受影响，但 offline identity 下禁止 outbox upload。新增 `sync-coordinator-lease.test.ts` RED 复现“有效在线租约时误上传”后 GREEN，12/12；修改 `src/hooks/useSyncedCollection.ts` 的两个 `openScope` 接点传递 `auth.offline`，从而让 collection 与根通知 session 共用正确身份状态。必要新增 hook 路径 upstream impact 为 CRITICAL（84 下游、3 processes）；只改两处 scope-open 参数与 effect 依赖，不改任何页面调用方。App typecheck 已通过。
- cleanup preflight bounded diagnosis：A 线原始 `SYNC_CLEANUP_STATE_FAILED` 错误文本/运行日志未在本树找到，不能按原错误逐字复现。当前 B 源码 `sync-lifecycle + auth-session-provider-races + offline-cold-start + offline-identity` 定向集 70/70 通过，涵盖 marker 不可读/恢复、SQLCipher 缺失、SecureStore/key/vault/file/delete 失败和进程重启恢复；本次未发现复现。当前仍需设备层确认，不能把这组注入测试代替 Simulator。
- 启服前资源快照：本机 3000 为用户 PID 96114，未触碰；3100/8082 无监听、无 Expo/Metro/phoneweb/local-stack 进程；iPhone 17 Pro 仍 Booted。系统盘可用 6.5 GiB，外盘 708 GiB。shell 原有 8 个 provider-like 环境变量非空；启动时逐一显式清空并只打印变量名与非空布尔。
- I 档结果（2026-09-29）：App 最终全量 3882 tests，3881 pass/1 fail/0 skip；唯一失败是新 root 通知组件调用 health probe 后未在锁定的离线读清单登记。按不改 inventory 锁定文件的范围将其收敛为复用已登记的 `useSyncedCollection` 3 秒 reconnect 观察、root 15 秒同步与 auth recovery，完整 inventory + notification lifecycle + registration races 50/50、App typecheck 通过；按 RULES 单个局部全量失败不重复跑全量，保留原失败结论及日志 `repos/orbit-app/build/harness-logs/sprint-0124-app-full-final.log`。
- 服务端 typecheck 通过；账号状态 API + isolated orbit_test PostgreSQL 定向集 4/4 通过（`ORBIT_EVENT_DATABASE_URL=postgresql://localhost/orbit_test`，0 paid）。Orbits full 共 5351 项。一次使用全局 `ORBIT_DATABASE_TARGET=local` 的环境导致 63 fail（配置正负例被全局翻转），另一次无 DB 配置有 36 fail（PG 集成未启用）；仅设置直接 DB 测试变量 `ORBIT_EVENT_DATABASE_URL=postgresql://localhost/orbit_test` 后为 4861 pass/3 fail/487 skip。三失败为：固定要求 `orbit_merge_verify_20260907_c45a` 的旧 scratch guard、orbit_test 缺少 `appointment_aggregates` 的旧 migration 前提、通知策略并行事务遇 PG40001；与本 Sprint 修改路径无关，未修改这些测试/业务或改用未批准 DB。脱敏日志：`repos/orbits/build/harness-logs/sprint-0124-orbits-full-eventdb.log`。
- 设备验收进度：已释放的 Simulator 中现装 `app.agenthubs.orbit` 是 Debug 壳但启动显示 `No script URL provided`; 当前 Metro 8082未收到 bundle。仓库无 `ios/`、无 `expo-dev-client`，`expo start --dev-client` 明确警告不能判定 deep-link scheme；Mac System Events 阻止脚本键盘注入。未安装新依赖、未生成 Xcode project。继续设备 SC 需先确认 native dev-client/项目生成门槛；不把 70/70 lifecycle 注入测试替代设备证据。3100 build 当前成功（BUILD_ID `8Lcfy222sE6niXUUmpNOn`）、health 200；3100/两 worker/Metro 8082 进程内 14 个 provider key/token 均 false，0付费；使用 `orbit_events`，未碰 3000。自建服务句柄仍运行，以便授权后继续或收尾时仅关闭本线服务。

## 设备与集成缺口更新（2026-09-29）

- 上述“dev-client/项目生成门槛”保留为早期失败记录，已由实际 LAN dev-client deeplink 消除：Simulator 可进入首页；B Metro source map 中 `AuthSessionProvider`、`AccountScreen`、`AccountAuthScreen` 均来自本物理工作树。原先三模块来自 A 的根因是共享 `node_modules/expo-router/_ctx.ios.js` 转换缓存；按 TDD 增加每物理 projectRoot 的 `cacheVersion` 命名空间，保留 Metro 默认版本和现有 symlink chunk URL rewrite。Metro 路径回归 5/5，实际 split chunk 请求 200。相关定向测试 `tests/metro-symlink-chunk-rewrite.test.mjs`。
- 真 UI 路径：登录后的底栏“我的”进入 `ProfileScreen`，滚动后“账号与工作区”触发 `/account` → `app/account.tsx` → `AccountScreen`；Debug 控件仅原生 `__DEV__` 展示。已实际入队 1 条 test-only `test-offline-write` fixture（ID 前缀 `debug-offline-write-0124-`），正常注销 Alert 显示“取消 / 加密保存并注销 / 放弃修改并注销”三选项并选“加密保存并注销”。登录页匿名提示真实显示 1 项；一次冷启动后仍显示 1 项。App 容器实际存在 1 个 SQLCipher vault DB，`orbit-sync-*` 镜像库 0 个。
- 非敏感设备元数据：`build/harness-state/evidence/sprint-0124/run-01/sc03-account-screen-after-fixture.json`、`sc03-same-account-login.json`、`sc03-device-lifecycle.json`。不保存凭据或身份明文截图。fixture 的随机 mutationId 全值未从 UI 暴露；root 接管设备后须按当前账号作用域、固定前缀列表并精准清理，不可清空队列。
- 同账号恢复尚未通过：常规 UI 登录字段曾以布尔方式确认与 B QA 配置相符（临时显示密码仅用于本机布尔比对，之后已重新遮蔽），但 3100 实际返回“邮箱或密码不正确。”；没有通过 API 注入会话、没有重置账号、没有删除 vault。vault 和 N=1 登录提示仍保留。root 已接管 iPhone 17 Pro、3100 与 Metro 8082，继续恢复/清理验收；B 不再操作设备/运行服务。
- 3100 受控启动使用 main `repos/orbits/.env` 中的 AUTH_SECRET、ORBIT_WORKSPACE_ID、ORBIT_LOCAL_DATABASE_URL，显式 `ORBIT_MODULE_MODE=live`；本地栈强制 `ORBIT_DATABASE_TARGET=local`、四个 DB URL alias 固定到 localhost `orbit_events`。未传 `ORBIT_LOCAL_WORKSPACE_ID`，未导入 provider/OAuth/tunnel 密钥。启动命令的完整进程环境清单未单独持久化；不将 `ps eww` 无法读 Next 环境解释为“无凭据”。root 已只读确认 B auth fixture 在 `orbit_events` 中存在且 workspace/密码校验匹配，实际 UI 拒绝原因由 root 继续查。
- 新增定向证据：`tests/outbox-uploader.test.ts` 用真实 Node SQLite repository、test-only receipt adapter 覆盖服务端先执行并落 receipt、首响应丢失、同 mutationId/同冻结字节重放、服务器仅执行一次、ACK 后 outbox 清空、local alias 指向 canonical id、产品镜像为 0 行。`outbox-uploader.test.ts` 14/14 GREEN；新增 offset FIFO 用例先 RED（实际顺序 newer-zulu → older-offset），随后 `outbox-uploader.ts` 复用 repository 的 `compareSyncTimestamps`，offset 与微秒排序定向 14/14 GREEN。App `npm run typecheck` GREEN。
- Server SC04 增补真实 API handler → isolated `orbit_test` Postgres store 集成：active/disabled/password_changed 三种 HTTP 200、受控关闭该 fixture 专用 client 后 HTTP 503；未泄露存储诊断。精确测试 `repos/orbits/tests/services/account-status-postgres.test.ts`，1/1 GREEN，目标 DB `postgresql://localhost/orbit_test`，局部 fixture 清理后才关闭连接。
- 当前无 Sprint 全量结论；组合候选冻结后由 root 执行一次 H/I 双端收口。SC03 同账号恢复、精确 fixture 清理及设备证据仍待完成。

### 收口状态补记

- 2026-09-29 后续设备更新（Root 持锁）：原账号通过正常 UI 登录成功；Email 布尔比对为 true，密码始终保持 secure，masked length 与授权配置源长度相同；首页显示 1 项日程、18 项待办。此前登录拒绝记录保留为历史现象，原因未确定；此更新不代表 vault 恢复或精确 fixture 清理已完成。
- SC03 剩余：Root 继续在 AccountScreen 核对恢复后的队列与 vault/mirror 状态，并只清理本轮 `debug-offline-write-0124-` 精确 fixture。B 已释放设备、3100 与 8082 锁，不执行设备或服务操作。
- B 本轮定向结果：App outbox uploader 14/14，App lifecycle/auth summary 定向集 42/42，Metro symlink/chunk 回归 5/5；App 与 orbits 两端 `npm run typecheck` 通过。Server account-status PostgreSQL 集成 `account-status-postgres.test.ts` 1/1，目标仅为隔离 `orbit_test`。FIFO offset 测试先在字符串排序实现下 RED（`newer-zulu` 排在 `older-offset` 前），使用共享的 `compareSyncTimestamps` 后 14/14 GREEN；真实 SQLite receipt-response-loss 重放断言验证冻结请求字节相同、服务端仅执行一次、ACK 后队列清空及 alias 解析。
- 没有保存逐行测试 runner stdout 日志；以上 RED→GREEN 命令与计数记录于此 checkpoint。源码定向测试可用命令：`node --test --import tsx tests/outbox-uploader.test.ts`（在 `repos/orbit-app`）；账号状态 PG 测试：`ORBIT_DATABASE_TARGET=local ORBIT_LOCAL_DATABASE_URL=postgresql://localhost/orbit_test npm test -- tests/services/account-status-postgres.test.ts`（在 `repos/orbits`）。

### SC03 非空队列 Provider 补证（2026-09-29）

- 在 `tests/auth-session-provider-races.test.ts` 新增真实 Provider → `createSyncLifecycle` → Node `DatabaseSync` 桥接用例；使用单条测试 outbox mutation `sc03-sqlite-provider-mutation` 和独立 `sync_state='synced'` 镜像标记，覆盖 cold-start 401、runtime 401、其他账号确认继续及取消四个分支。
- 两种 401 均验证来源镜像库/密钥删除、精确 mutationId 存于 pending vault、vault 不含镜像专属标记；继续账号验证旧镜像清理并保存队列，取消验证原会话/库/密钥/队列原样保留且不建 vault。
- 原先 Provider race fixture 把摘要固定为 0；`offline-identity.test.ts` 的冷拒绝真实 SQLite 用例只写 cursor，不含 outbox。此前 logout 非空 outbox 的 lifecycle 测试继续覆盖 logout/restore，不重复。
- RED/产品缺陷：没有。真实 Provider/SQLite 测试首轮通过；无产品代码修改。原测试的缺证据与新增行为补证不是生产失败修复，不通过人为破坏产品制造 RED。
- 最终定向：在 `repos/orbit-app` 执行 `env -i PATH="$PATH" node --test --test-reporter=spec --test-reporter-destination=/Volumes/ORICO/Dev/MacMovedData/dot-codex/worktrees/offline-write-foundation/orbit/repos/orbit-app/build/harness-logs/sprint-0124-sc03-provider-sqlite.log --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/auth-session-provider-races.test.ts`，22/22、0 fail、0 skip（6.07s）；完整输出见 `build/harness-logs/sprint-0124-sc03-provider-sqlite.log`。`env -i PATH="$PATH" node ./node_modules/typescript/bin/tsc --noEmit` exit 0；`git diff --check` exit 0。逐场景说明见 `build/harness-state/evidence/sprint-0124/run-01/sc03-provider-sqlite-supplement.md`。
- 补证前冻结树的 3904/3904 App full 不外推到当前树；本轮未重跑全量。GitNexus 本树索引已从 1aa851c 刷新到候选 85fe921；`detect_changes --scope all` 完整返回 46 changed symbols、3 changed files、0 affected processes、LOW。其中包括 Next 构建所有的 `repos/orbits/next-env.d.ts`，没有 stage。Provider upstream 为 LOW、唯一直接调用者 `app/_layout.tsx:RootLayout`；`eraseRejectedIdentity` impact 返回 `partial=true`，不把空 caller 集视为无影响，另以源码确认它由 Provider 的 `restoreSession` 调用。本次只改测试/checkpoint，不改产品调用链。
- Root 随后报告真实设备 SC03 已完成：正常同账号恢复后 Debug 待同步=1、vault=0、镜像=1；注销三选项选择“取消”后保留登录，再只清理本轮精确 mutationId。证据与四张截图索引：主 checkout `build/harness-state/evidence/sprint-0124/root-qa/sc03-restoration-check.json`。这与 Node SQLite Provider 补证相互补充，不相互替代。
- 该变化后的组合树未重跑 App/backend full；先前 3904/3904 App full 仅对应补证前冻结树，不外推为当前树结论。SC03 真实 UI 恢复及精准清理随后由 Root 完成并归档；B 已提交未关闭 Sprint 的阶段报告 [REPORT](REPORT.md)。当前仅待 Root/A 最终稳定组合树验收与主线集成，不将本 run 标为 completed。

### 合并树 App 唯一失败与测试 fixture 校准（2026-09-29）

- Root 新鲜合并树 `4a0978c931d82e008d21d809186932f7da661582` App full 为 3908/3907 pass、1 fail、0 skip。唯一失败 `notes-web-local-first.test.tsx` 非安全上下文在线列表/详情用例收到 `Maximum update depth exceeded`；原始 full 日志永久保留：`/Users/xzhao/Projects/orbit/build/harness-logs/sprint-0124-0137/main-4a0978-app-full.log`。不得称 flaky 或忽略 console/pageerror。
- 原因定位为 test fixture 引用不稳定，而不是 `useSyncedCollection`：真实详情渲染到无联系人笔记时，`useNoteContactSummaries` 对 `missing=[]` 执行 `setFetched(new Map())`，effect 依赖 `client`。测试的 `useOrbitApiClient` 原先每次 render 都产生新 client，于是触发该 effect 重跑；真实 hook 在 `useMemo` 中稳定返回 client。`notes-web-local-first.test.tsx` 的 esbuild fixture 也明确替换 `useSyncedCollection` 等 hook。
- TDD RED：针对真实 browser detail render 新增 client identity 检查后，旧 fixture 定向命令 `env -i PATH="$PATH" node --test --test-reporter=spec --test-name-pattern='non-secure context' --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/notes-web-local-first.test.tsx` 以预期断言失败：调用 8 次、unique client 8，期待 single stable client。此前原用例在 B/Main 独立运行均 6/6、两 browser 文件并行 8/8，因此单文件绿不能证明 fixture identity 正确。
- GREEN：将测试替身 client 提升为 fixture 模块级稳定对象，保留 get/post 行为与请求记录；同一 identity 检查与目标用例 1/1、同文件全套 6/6 通过，0 fail/skip。未修改产品 hook、断言或 timeout；未重跑 Orbits full/PG，也未操作设备/服务。B 需在该测试提交合入稳定组合树后由 Root 再跑 App full，验证原始 full-only warning 是否消失；未完成前本 run 保持 in-progress。

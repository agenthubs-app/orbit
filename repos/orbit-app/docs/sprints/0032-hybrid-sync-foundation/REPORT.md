# Sprint 0032 — 云端权威与加密本地镜像执行总结

## 结果

本线实现及五项 SC 的本地验收通过。六类记录已有共享权威契约，App 使用按 server/actor 分库、按 workspace 隔离的 SQLCipher 镜像；记录与 cursor 同事务写入，原生进程重启可回读，登出会清除数据库及设备密钥。现有页面继续使用原读取接口和在线写入。

Sprint 状态仍为 **running，等待协调者合并到 `chat-agent` 并验证精确合并树**。本报告不把本线通过记作已合并完成。

## 运行记录

- run：run-01；Task 4 与最终修复验收日期：2026-09-16（Asia/Tokyo）。
- 分支：`codex/sprint-0032-hybrid-sync-foundation`。
- Sprint 基线：`1129d72d3`；Task 4 功能 HEAD：`0c1cf70bb8b7004d11cef972a9a76f2048e154e8`；最终修复起点为 Task 4 文档提交 `957b97b70eae8358e96b0553d21b35f0b51cb686`，初始工作树干净。
- 最后功能／测试 HEAD：`3e0c32790c6fb37c8e77ba149b5a84bc39476bc6`；最终定向回归、两端 typecheck 与重新构建的 native 验证均对应此产品树。
- Planner SHA-256：`1bf2a101dd9cf0f7e4cf57f6ef90be78dbd23e3a288a46fc0dbf158f3c2fa580`。
- DESIGN SHA-256：`8e84f91694f8fc00ee72c359b8126d111a103f85b74bcb6d7c8b810fe60b2b3f`。
- 本线最终文档 SHA：本报告提交后记录于忽略的 `final-fix-report.md` 并交接协调者；不追填本报告自身 commit。
- `chat-agent` 精确 merge SHA／合并树复验：**等待协调者**。
- push／部署：未执行。
- 原始证据：本工作树忽略目录 `.superpowers/sdd/PLANNER/task-4-*`（历史）及 `final-fix-*`（本次最终修复）。固定 SHA 与最终交接见同目录 `final-fix-report.md`。

## 实现与提交

| 提交 | 实际结果 | SC |
| --- | --- | --- |
| `ef8ed1fd2` | 六类 SyncRecord、严格客户端 mutation/schema、权威 registry、App 契约副本 | 01 |
| `5911d97b3`、`4f56dacb6`、`d53006cf5` | 本地 schema/repository、事务与 cursor、墓碑、pending/conflict 保留、输入与 JSON 验证、不透明 ID 和时间精度 | 02、03 |
| `1fd7160be` | SQLCipher 配置、随机设备密钥、scope 生命周期、加密旧快照、原生失败保护、显式 Web online-only | 03、04、05 |
| `6cf93a929`、`0c1cf70bb` | 认证并发隔离、持久化待清理标记、条件 cookie 清理、等待全部旧删除操作后才释放存储队列 | 03、05 |
| `957b97b70` | Task 4 实测验收与登记；无产品或测试源码修改 | 全部 |
| `3e0c32790` | credentials／Google 接受会话在通知清理后再次校验 generation；旧快照按当前 workspace 读写和清除；Web payload 递归拒绝 actor 字段；精确枚举与回归测试 | 01、03、05 |

### 实际新增文件

App（相对 `repos/orbit-app/`）：

- `src/api/contract/sync.ts`。
- `src/data/sync/local-sync-database.ts`、`local-sync-database.web.ts`、`local-sync-repository.ts`、`local-sync-schema.ts`、`sync-database-key.ts`、`sync-lifecycle.ts`、`sync-lifecycle.web.ts`。
- `tests/local-sync-repository.test.ts`、`tests/sync-lifecycle.test.ts`。

Web（相对 `repos/orbits/`）：`shared/contract/sync.ts`、`tests/architecture/sync-contract.test.ts`。

其余修改为 App 的 `app.config.ts`、认证 provider/storage、契约 barrel、snapshot-store，以及 auth/snapshot/notification/performance 直接消费者测试；Web 的 registry、契约 barrel 和 registry 测试。共 25 个产品／测试路径，完整 `git diff --name-status 1129d72d3..0c1cf70bb` 留存于 `task-4-product-files.log`。本报告和登记表属于独立文档提交。

## 验收结果

| SC | 本线结果 | 实际证据与边界 |
| --- | --- | --- |
| SC-0032-01 | pass | 最终 Web authority/contract 19/19，包含 3 种 actor 字段拼法 × 3 层位置的 RED→GREEN、序列化 hook 无法注入身份、任意非权威 JSON、六／四／二枚举 option 数组完全相等；App contract/schema/domain 同步检查在最终 94/94 定向集中通过。 |
| SC-0032-02 | pass | `local-sync-repository.test.ts` 完整通过；真实 Node SQLite 事务回滚、cursor 原子性、重放幂等、墓碑及 pending/conflicted 保留均覆盖。原生合成 record/cursor/outbox 跨进程回读通过。 |
| SC-0032-03 | pass | 最终 lifecycle/repository/auth 定向集通过；重新构建的 Simulator seed 8/8、重启／清理／隔离 48/48。实际写 A 快照→切 B 读不到→B 写同路径→回 A 仍读 A；清 B 后 A 快照及 record/cursor/outbox 保留；重新写 B 后登出，A/B 快照均不可恢复。另有 server/actor 拒读、第二 actor 空库、密钥与主文件/sidecar 删除证据。旧 Task 4 的 35 项未验证跨 workspace 快照，本次新增证据才证明该项。 |
| SC-0032-04 | pass | iOS arm64 Release 构建成功；生成配置 `expo.sqlite.useSQLCipher=true`，编译含 `SQLITE_HAS_CODEC` 与 `SQLCIPHER_CRYPTO_CC`；真实 `PRAGMA cipher_version` 非空。进程停止后 at-rest 5/5：文件有内容，无普通 SQLite header，合成 payload/标识不以 UTF-8/UTF-16 明文出现，未提供 key 的系统 sqlite3 读取被拒绝。故障注入测试覆盖 cipher/key/schema 初始化失败无明文回退。 |
| SC-0032-05 | pass | 最终 App 主定向 94/94、两端 typecheck；扩展消费者首轮 113/114，唯一旧 performance double 未传 activeScope，修正后完整 performance 文件 3/3，其余 111 项证据复用。最终 native snapshot 重启回读与产品登录页 smoke 通过。四域页面、hooks、view-models、文案未改，无实体镜像 reader 接入或 offline write 文案。 |

## 最终修复验证

本次只修复最终评审的三个 Important 与两个 deferred Minor，保留全部原 SC。产品与测试共 9 个既有路径；`readSnapshot`／`writeSnapshot`／`clearSnapshots` 签名不变。生命周期在同一序列化操作中提供可信 activeScope，快照键增加无歧义 workspace 前缀，clear 只删除该前缀；未具备 workspace 归属的旧 v2 行不可被新接口读取，仍留待整库 logout 清理。默认 workspace 与名为 `null` 的 workspace 分离。

| 检查 | 结果与原始证据 |
| --- | --- |
| credentials／Google 通知清理晚到 | `final-fix-auth-red.log` 两项预期失败，`final-fix-auth-green.log` 2/2；UI、cookie 存储及 lifecycle 保持已接受的 B |
| lifecycle＋真实 Node SQLite workspace 读写／clear | `final-fix-snapshots-red.log` 两项预期失败，`final-fix-snapshots-green.log` 2/2；A/B、默认 workspace、带分隔符 workspace、logout 覆盖 |
| Web 递归 authority 契约 | `final-fix-contract-red-all-depths.log` 九个注入子例全部预期失败；`final-fix-contract-green.log` 16/16；加 registry 后 `final-fix-web-tests.log` 19/19 |
| App 主定向 | `final-fix-app-tests.log` 94/94，使用下节相同主定向命令 |
| 十个受影响 flow 及共享 hook／通知／性能消费者 | `final-fix-app-consumers.log` 113/114；唯一 fixture 修正后 `final-fix-performance-fixture-green.log` 3/3，未把首轮失败改记为完整通过 |
| 两端 typecheck | `final-fix-app-typecheck.log`、`final-fix-web-typecheck.log`，均 exit 0 |
| 当前产品树签名 arm64 Release 重建 | `final-fix-build-signed.log` BUILD SUCCEEDED，exit 0；沿用授权的外置 DerivedData，并强制重打 JS bundle |
| 当前产品树 native 与 ciphertext | `final-fix-native-seed.json` 8/8、`final-fix-at-rest.json` 5/5、`final-fix-native-restart-purge.json` 48/48 |
| 原始产品包启动 | `final-fix-product-launch.log` exit 0；`final-fix-product-smoke.png` 目视确认正常登录页；PID/comm 检查后已终止 |

扩展消费者命令（App cwd）：

```sh
node --test --test-concurrency=1 --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/api-resource-scope.test.ts tests/api-resource-source.test.ts tests/validated-api-resource.test.ts tests/profile-completion-interactions.test.tsx tests/profile-page-group-interactions.test.tsx tests/performance/app-performance-wiring.test.ts tests/notifications/notification-registration-races.test.ts tests/today-tasks-screen-source.test.ts tests/event-attendees-screen-source.test.ts tests/relationship-invitation-screen-source.test.ts tests/contact-acquisition-screen.test.ts tests/account-permissions-screen-source.test.ts tests/ink-signal-tasks.test.ts tests/ink-signal-schedule.test.ts tests/schedule-screen-source.test.ts
```

该集合对应 ProfileSuggestions／ProfileMore／EditProfile／AccountPermissions、Today／Tasks／Schedule、EventAttendees、RelationshipInvitation、ContactAcquisition 共十个 flow；涵盖共享 useApiResource、真实组件交互及已有源码接线检查。performance fixture 增加 lifecycle 回调的 activeScope 参数后，只复跑该完整文件三项测试，产品树没有因此改变。

原生 harness 导入本次真实 lifecycle/repository/snapshot-store，实际进程 seed→terminate→宿主 ciphertext 检查→重新 launch；在独立 `app.agenthubs.orbit.sprint0032verify` 内执行合成 `.invalid` scope，不调用真实账号/provider。初次 harness 重签错误地把模拟 entitlement 填入真实签名而被 SpringBoard 拒绝；对照 Xcode 原包及上轮成功包后，采用本次 Xcode 生成的 `Orbit.app.xcent` 重签，随后安装、seed、restart 与产品 smoke 均成功。`final-fix-native-launch-seed.log` 保留原失败，`final-fix-native-launch-seed-recovered.log` 为恢复结果；未修改产品源码。所有构建／bundle／launch 子进程显式移除凭据变量，进程检查仅使用 PID/comm。

## Task 4 历史验证

本节保留功能 HEAD `0c1cf70bb` 的历史命令和结果；最终修复后的有效证据见上节。原始退出码均为 0，除下节明确保留的初始环境失败。

App 主定向集（90/90；`task-4-app-tests.log`）：

```sh
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/contract-sync.test.ts tests/api-schema-sync.test.ts tests/domain-sync.test.ts tests/snapshot-store.test.ts tests/local-sync-repository.test.ts tests/sync-lifecycle.test.ts tests/auth-session.test.ts tests/auth-session-storage.test.ts tests/auth-session-provider-races.test.ts tests/authenticated-client-usage.test.ts tests/mobile-auth.test.ts
```

App 直接消费者（49/49；`task-4-app-consumers.log`）：

```sh
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/api-resource-scope.test.ts tests/api-resource-source.test.ts tests/validated-api-resource.test.ts tests/profile-completion-interactions.test.tsx tests/profile-page-group-interactions.test.tsx tests/performance/app-performance-wiring.test.ts tests/notifications/notification-registration-races.test.ts
```

Web（8/8；`task-4-web-tests-ready.log`）：

```sh
node --test --import tsx tests/architecture/data-authority-registry.test.ts tests/architecture/sync-contract.test.ts
```

两端各执行 `npm run typecheck`，见 `task-4-app-typecheck.log`、`task-4-web-typecheck-ready.log`。本任务按冻结 Task 4 brief 收口 contract/auth/snapshot/sync 直接消费者，不运行无关全量或视觉矩阵。无 Web/API 运行行为变更，依本 Sprint 明确例外不启动 Web 业务服务；0033 仍须恢复运行门槛。

### 原生构建与 Simulator

- Node v25.8.1；Xcode 26.6（17F113）；CocoaPods 1.17.0；iOS 26.4 Simulator，booted 的 `Orbit Sprint 0031 iPhone 17 Pro`；构建为 arm64 Release。
- `EXPO_NO_DOTENV=1 CI=1 npx expo prebuild --platform ios --no-install` 成功；`pod install` 成功（118 pods）。
- 最终构建使用 `xcodebuild -workspace ios/Orbit.xcworkspace -scheme Orbit -configuration Release -sdk iphonesimulator -destination 'id=19F5DA83-D948-4B8D-8ADB-4D39CA51E8FA' -derivedDataPath /Volumes/ORICO/Dev/MacMovedData/orbit-sprint0032-task4-hrRW9Bvy/DerivedData ONLY_ACTIVE_ARCH=YES ARCHS=arm64 PRODUCT_BUNDLE_IDENTIFIER=app.agenthubs.orbit.sprint0032verify CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- CODE_SIGNING_REQUIRED=NO CODE_SIGN_ENTITLEMENTS=<本工作树>/.superpowers/sdd/PLANNER/task-4-simulator-entitlements.plist build`，exit 0。构建子进程剥离 provider 凭据环境变量；`EXPO_NO_DOTENV=1`，产品 API 地址设为 `http://127.0.0.1:9`。
- 使用独立 bundle ID `app.agenthubs.orbit.sprint0032verify` 和合成 Keychain access group。忽略的 harness 直接导入已提交 lifecycle/repository/snapshot-store，使用真实 Expo SQLite、Crypto、SecureStore；不改产品入口。合成 server 为 `.invalid` 域名；无 HTTP/provider 请求。
- seed 后通过 `simctl terminate` 结束进程；宿主只检查该合成数据库文件；随后 `simctl launch` 启动新进程执行回读、workspace 切换、登出存储边界和第二 actor 场景。
- 原生“登出”证据执行实际 `syncLifecycle.setScope(null)` 存储边界；其与 `AuthSessionProvider` 的连接由完整 auth race 定向测试覆盖。未登录真实账号，未执行 UI 登录／登出或在线业务写入。
- `task-4-native-seed-signed.json`：8/8；`task-4-at-rest.json`：5/5；`task-4-native-restart-purge.json`：35/35。只记录 boolean/合成标识，不记录 key、cookie 或 payload 正文。
- 原始产品包随后安装启动，`task-4-product-smoke.png` 显示正常登录页；进程存活核对通过后已停止。验收包保留安装，合成 scope 已全部 purge，无活构建／验证进程。

### 初始失败与处理

1. Web 工作树起初无依赖，首轮 tests/typecheck 分别缺 `tsx`／`tsc`；这不是产品 RED。`npm ci --ignore-scripts --no-audit --no-fund` 后重跑均通过，原失败日志保留。
2. 初始 Release 默认编译双架构，主动中止（exit 75），改为当前 arm64。随后内部磁盘仅余 122 MiB，构建因 `No space left on device`／build.db full 失败（exit 65）；未归因于产品源码。
3. 经协调者明确授权，将本次 DerivedData 移到新建、任务专有的 ORICO 目录；没有删除用户缓存、其他 worktree 或 Simulator 业务数据。外置 arm64 构建成功，原始失败日志仍在 `task-4-build.log`／`task-4-build-arm64.log`，成功为 `task-4-build-external.log`。
4. `CODE_SIGNING_ALLOWED=NO` 包可启动，但 SecureStore 返回 `ERR_KEY_CHAIN`／entitlement error，scope 在写数据库前拒绝；`task-4-native-fail-closed.json` 记录未创建数据库。仅手动重签名未能补齐模拟 entitlement 段，SpringBoard 拒绝启动。改为 Xcode 签名构建后成功，见 `task-4-build-signed.log`；此后完成上述全部原生检查。没有因此修改产品源码或原生配置。
5. 一次进程诊断意外把继承的凭据环境值带入工具响应。已通知协调者、按仅变量名方式记录忽略的安全复发条目，并停止 argv/完整进程标题输出。凭据未用于任何验收调用，未复制到报告或原始证据文件；其所有者仍需处理轮换，不能把这一执行安全事件隐去。

## RED→GREEN 与 GitNexus

开发阶段的原始 RED→GREEN 保存在 `task-1-report.md`、`task-2-report.md`、`task-3-report.md` 及其对应日志：缺失共享契约／数据库模块、非法 mutation/JSON、时间精度、native key-before-schema、陈旧 auth 结果、跨进程待清理密钥、旧删除操作晚到等反例均先失败再通过。Task 4 未新增产品行为，不把打包／依赖错误冒充 TDD RED。

GitNexus 提示本线索引落后两个提交后，`npx gitnexus analyze` 成功刷新（367.8s；396,274 nodes，571,069 edges，300 flows）。生成的 AGENTS/CLAUDE 计数改动已恢复，生成技能移入忽略证据目录；未暂存分析器文件。Task 4 无现有函数／类／方法修改，因此无新增 symbol impact 目标。此前产品提交的 impact 与 staged 检查详见各 Task 报告，未用文档检查替代它们。

最终修复再次绑定本 Sprint worktree；索引提示落后一个文档提交后刷新成功（257.2s；396,303 nodes、570,885 edges、300 flows），生成 AGENTS/CLAUDE 计数恢复，生成技能移入忽略目录。复用 acceptSession LOW／3 impacted 与 clientSyncMutationSchema LOW／0 的预检；补查 readSnapshot／writeSnapshot 均为 CRITICAL、55 impacted、1 direct caller、10 flows，已在编辑前向协调者报告并扩大上述消费者回归。clearSnapshots、native/Web withDatabase 和 performance fixture 无可解析调用者，按 UNKNOWN/H/I 人工补查，不能视为无影响。原始结果为 `final-fix-impact.json`、`final-fix-performance-fixture-impact.json`。

最终产品暂存检查仅 9 个预期路径；`git diff --check`、staged whitespace 与逐路径 diff 审查通过。`final-fix-product-staged-detect.json` 返回 20 touched symbols、9 files、0 affected processes、LOW；其局部结果不替代 CRITICAL upstream 范围。文档另行暂存及 detect，最终交接记录实际文档 SHA。

Task 4 历史文档暂存检查：`git diff --check` 与 `git diff --cached --check` 通过；严格路径审查仅本报告和 Sprint 登记表。`gitnexus_detect_changes(scope="staged")` 返回 2 个文档文件、2 个 README section、0 个受影响执行流程、LOW；没有产品符号变化。原始结果见 `task-4-staged-detect.json`。

## 交接与限制

- 本线已验证；协调者须接收固定 SHA、合并 `chat-agent`、记录精确 merge SHA 并验证该合并树，之后才能把 0032 标为 completed 并启动 0033。
- 未实现页面切换、增量同步 HTTP、outbox sender、离线确认保存或冲突 UI；它们仍属于 0033 之后。没有 provider、真实账号、生产业务数据、迁移、部署或 push 操作。
- 旧明文 `orbit-cache.db` 不迁移；升级后的首次离线读取不能依赖旧缓存，这是已批准设计限制。
- Simulator 证明实际原生加密及存储生命周期，不替代实体设备或后续同账号 Web↔App 业务往返。
- 新增 AI/OCR/provider 调用与费用：0；不重置原累计账本。
- Task 4 文档提交为 `957b97b70`；最终修复产品／测试提交为 `3e0c32790`，本报告与 `docs/sprints/README.md` 另行文档提交。原始证据、生成 iOS/Pods、harness、DerivedData 与安全学习条目均不提交。

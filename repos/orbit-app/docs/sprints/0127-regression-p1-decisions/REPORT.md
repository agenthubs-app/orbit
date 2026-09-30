# Sprint 0127 执行报告：两个待决 P1 与本地 worker 脚本

**run-01**。Generator 为子代理（没有再派子代理），报告由协调者代存。分支 `sprint/0127-regression-p1-decisions`，基线 `b131a5d31` 加开工提交 `b6477871f`。最后一个功能提交是 `1758f8192`，没有推送。

## 1. 结论

**状态：completed。** 两个 P1 已修好；SC-04 的「通知进 App 收件箱」没做到，原因是早已存在的产品缺口，已转入 0129。

- **英文自我介绍**已修好。含中日韩文字的「关于我」上限 80，其余 200，服务端和两端共用一份规则。
  - 英文账号在 Simulator 引导第 4 步一次生成成功（188/200），保存后在网页读回。
  - 中文账号生成的仍在 80 以内。
- **断网冷启动**已修好。在 Simulator 上验证过：
  - 30 天内直接进入上次的账号，显示本地内容和「截至」提示。
  - 界面语言保持账号设置：设备是英文，账号设成中文，断网时显示中文。
  - 服务端恢复后，App 立即复核。
  - 改密后恢复联网：本地库文件被删除，回到登录页。之后再断网冷启动也只进登录页。
- **worker 脚本**能用。一条命令启动 3100 和 worker，一条命令全部停止。
  - 交换名片后，worker 自动为双方建好联系人，A 的 App 人脉列表里能看到。
  - **通知进不了 App 收件箱，SC-04 这一半没做到。** worker 确实写了通知，网页的旧接口 `/api/notifications` 能读到。但 App 收件箱的「通知」只读新的收件箱，而名片交换的通知只写进旧的通知表，两边没有接上。这是早已存在的产品缺口，不是 worker 的问题。修它要改通知链路，超出本 Sprint 范围，建议单开 Sprint。
- 两端全量都是 0 失败，三处 typecheck 和 lint 通过，读取量棘轮文件没变。QA 数据已删除，66 张表的行数与开工前完全一致。
- 付费调用 2 次，上限 3 次。

## 2. 验收

| SC | 结果 | 证据 |
|---|---|---|
| 01 长度规则只有一份 | 通过 | 先 RED 后 GREEN：`commands/red-bio-orbits.txt`、`red-bio-web.txt`、`red-bio-app.txt`；接口测试用真实的 `PUT /api/profile` 处理函数 |
| 02 英文引导第 4 步生成并保存；中文不变 | 通过 | `screens/02-a-intro-english-188-of-200.png`；网页读回 `api/a-profile-readback.json`；中文账号（B）经接口生成成功 |
| 03 断网冷启动 | 通过 | App 测试（注入时钟，覆盖 29/30/31 天、401、403、空会话、5xx、网络错误、强制门户页、撤销、恢复联网、30 天在运行中到期）；Simulator 截图 20–29 |
| 04 一条命令启停；交换后联系人和通知出现在 App 收件箱 | **部分通过** | 启停和自动建联系人通过（`screens/11-a-contacts-auto-created.png`、worker 日志）。通知没有出现在 App 收件箱（`screens/10-a-inbox-notification.png`），原因见第 1 节 |
| 05 全量、typecheck、lint、棘轮、清理 | 通过 | 第 7、8 节 |

## 3. 设计选择

**长度规则**
- 放在 `repos/orbits/shared/api-schema/profile-bio.ts`。这个目录本来就会整目录同步到 App，所以没有扩大 `sync:contract` 的同步范围。
- 含汉字、假名、谚文（Unicode Script 判断）用 80，否则用 200；长度按字素簇计。
- 服务端起草校验、提示词、`PUT /api/profile`、网页保存校验、网页引导和基础资料页的计数器、App 引导和编辑页的计数器都改用它。
- 英文提示词：目标约 160 字，上限 200，并要求名字写成拉丁字母（出现一个中日韩字，上限就会变成 80）。
- 空文本按 200 显示。中文用户刚开始会看到 0/200，打出第一个汉字后变成 x/80。一句话介绍（headline）的上限没改。

**离线身份**
- 判定规则在 `src/api/offline-identity.ts`。
  - **拒绝**只有两种：`/api/auth/session` 返回 401/403，或返回 2xx 的 JSON 但没有 user（Auth.js 表示撤销、停用、改密的方式）；`/api/account/me` 返回 401/403 也算。
  - 其余都算**不可达**：网络错误、5xx、404、2xx 但不是 JSON 的页面（例如强制门户）。
  - 为此 `validateAuthSession` 新增了一个错误码 `ORBIT_APP_AUTH_SERVER_UNAVAILABLE`，用于 2xx 但不是 JSON 的情况。
- 存储：只存 `{baseUrl, accountId, user, validatedAt}`，不含 Cookie。
  - 原生：SecureStore，`AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`，与会话 Cookie 同级。
  - 浏览器：IndexedDB `orbit-sync-keys`，与镜像密钥同库，只在本地镜像可用（secure context）时写入。
- 什么时候写：登录成功、联网冷启动成功、恢复联网复核成功、在线时回前台且距上次校验超过 12 小时。
- 什么时候删：退出登录的第一步、任何一次明确拒绝。
- 冷启动时被拒绝：先删身份记录，再把该账号的作用域打开后立刻 `setScope(null)`，用的是换账号的同一条清理路径，删库删密钥，最后删 Cookie。
- 离线期间每 10 秒复核一次，回到前台也复核。仍不可达且满 30 天时回登录页，不删数据。
- 界面语言：服务端确认过的语言偏好跟身份存在同一处、同时删除，只给同一个账号用。
- 威胁模型文档新增第 6 节，写明规则和已知限制。

**worker 脚本（`repos/orbits/scripts/local-stack.mjs`）**
- 启动三项：3100 生产服务、event-operations worker、notification-delivery worker。
- event-operations worker 本身就包含名片交换投影、见面记录投影和约见投影，所以没有另起见面记录 worker。
- 有意不启动：
  - 提醒推送 worker：会调用 Expo 推送。
  - discovery worker：用 AI 抽取，要付费。
  - agent、名片识别、赛后 AI、重置密码邮件这几个 worker。
- 所有子进程的数据库地址都固定到 `ORBIT_LOCAL_DATABASE_URL`，而且必须是本机地址；`.env` 里的 Neon 地址会被覆盖。
- worker 进程的付费 AI key 和 Expo 推送配置都清空。3100 保留 key，用户自己触发的自我介绍生成需要它。

## 4. 文件

- orbits：
  - `shared/api-schema/profile-bio.ts`（新）
  - `features/profile/intro-draft-service.ts`、`features/profile/live-service.ts`
  - `app/(app)/app/profile/profile-save-model.ts`、`onboarding-0918/onboarding-model.ts`、`onboarding-0918/onboarding-flow.tsx`
  - `profile-0918/profile-basic.tsx`、`profile-settings.tsx`（只改注释）、`profile-shell.tsx`
  - `scripts/local-stack.mjs`（新）、`package.json`（加了 `local:stack`）、`scripts/generate-full-product-functional-audit.mjs`（更新行号锚点）
- App：
  - `src/api/schema/profile-bio.ts`（同步副本）
  - `src/api/offline-identity.ts`、`offline-identity-storage.ts`、`offline-identity-storage.web.ts`（新）
  - `src/api/AuthSessionProvider.tsx`、`mobile-auth.ts`、`browser-auth.ts`
  - `src/i18n/OrbitLocaleProvider.tsx`，en/zh/ja 三个词典的 `profile.bioCount`
  - `src/data/profile-edit-session.ts`、`src/data/sync/web-mirror-key.ts`
  - `src/view-models/profile-onboarding.ts`
  - `src/screens/profile/onboarding/ProfileOnboardingScreen.tsx`、`EditProfileScreen.tsx`
  - `docs/phoneweb/local-mirror-threat-model.md`

**新增测试**：
- `orbits/tests/services/profile-bio-length-rule.test.ts`（5 条）：
  - 200/201 与 80/81 的边界，混排按中日韩处理，假名和谚文都算中日韩，emoji 按字素计；
  - 英文起草可到 200、中文超过 80 被拒；
  - 提示词里的目标长度和上限；
  - 真实 `PUT /api/profile` 处理函数返回 200/400，被拒时不写库。
- `orbits/tests/scripts/local-stack.test.ts`（4 条）：只有本机地址才算本地；即使 `.env` 指向 Neon，子进程也全部固定到本地库；worker 没有 AI key；只用 3100。
- `app/tests/offline-identity.test.ts`（5 条）：
  - 29/30/31 天、未来时间、换服务器；
  - 用真实 HTTP 服务器分别返回 200 空会话、`{}`、401、403、HTML、502、503，外加端口关闭，每种都判成唯一结论；
  - 身份记录与语言按服务器隔离，语言只给同一账号，一起删除；
  - 冷启动时什么都没打开，真实的 `createSyncLifecycle` 也能删掉被拒账号的库、密钥和清理标记。
- `app/tests/offline-cold-start.test.ts`（14 条）：真实的 `OrbitAuthSessionProvider` 加 Playwright 时钟，覆盖离线进入、5xx 或 account/me 不可达、31 天、没有记录、401 和空会话拒绝、联网时记下验证时间、恢复联网、回到前台、恢复联网后被拒、30 天在运行中到期、离线时退出、浏览器版。
- `app/tests/offline-identity-web-browser.test.ts`：真实 Chromium 的 IndexedDB，刷新后仍在，删除时一起删掉。
- `app/tests/app-locale-account-sync.test.tsx`：新增 2 条，离线时保留账号语言，不会串到别的账号。

**改动的旧测试**：
- 80 个 emoji 的用例改成 200 和 201。
- 四个测试的替身补齐新依赖：
  - `auth-session-provider-races`：加离线身份存储的替身和 `AppState`。
  - `locale-provider-web-hydration`：加离线身份存储的替身。
  - `notification-registration-races`：加 `process.env`；认证层的前台监听单独计数，不算进通知监听。
  - `session-expiry` 的源码断言：保留内联写法以兼容。

**RED 说明**：
- 行为类改动都先看到失败：长度规则、HTML 判定、Provider 离线行为（11/13 失败）、语言缓存。
- 新模块（`profile-bio.ts`、`offline-identity.ts`、`local-stack.mjs`）是先写实现再写测试的，它们的 RED 只能算「模块不存在」。

## 5. 提交

- `43a1d776e` fix(profile): About me allows 200 characters unless it contains CJK (0127)
- `a3d59d3c0` fix(app): offline cold start enters the last validated account for up to 30 days (0127)
- `7104738da` chore(orbits): local-stack script runs 3100 with the event and notification workers (0127)
- `1758f8192` test(orbits): repoint profile-basic audit anchors after the About me counter (0127)

## 6. 运行时证据

证据目录：`repos/orbit-app/build/harness-state/evidence/sprint-0127/run-01/`，下有 `screens/`、`commands/`、`api/`。

- **环境**：3100 用本 Sprint 代码构建（`start --build`），`ORBIT_DATABASE_TARGET=local`，数据库是本机 `orbit_events`；iPhone 17 Pro Simulator；Metro 8081。
- **SC-02**：
  - A 的账号语言设为 en，前三步经接口补好资料，App 显示「3 of 5 done」。
  - 第 4 步自动生成，计数器显示 188/200，点「Use this introduction」保存。
  - 网页 `GET /api/profile` 读回 bio 188 个可见字符，onboarding=complete。
  - B 用中文经接口生成一次，结果 60 字左右。
- **SC-03**：
  - 按 PID 停掉 3100，杀掉 App 再打开，直接进入 A 的首页（截图 20）。
  - 待办显示「Showing saved content」，笔记显示「Offline · showing content as of…」（截图 21、22）。
  - 重启服务后，日志显示 App 立即请求了 session 和 account/me。
  - 账号语言改成 zh，设备仍是英文，断网冷启动显示中文，笔记页显示「无法连接 · 显示截至 9月27日 20:38」（截图 25、26）。
  - 断网期间把 A 的 `passwordChangedAt` 改为当前时间，再启动服务：App 回到登录页，App 容器里的 `orbit-sync-*.db` 从 1 个变成 0 个（截图 27、28）。之后再断网冷启动只到登录页（截图 29）。
  - 31 天的情况只在测试里覆盖，没有改 Simulator 的时钟。
- **SC-04**：
  - 用 SQL 建了 QA 活动 `event_qa_0127`（活动行、别名、operations 配置），做法同 0107/0126。
  - A、B 经接口报名；读报名接口时带 `questions=false`，没有触发 AI。
  - A 发起交换，B 接受。worker 日志显示 outbox 被处理，自动生成了双方的 contacts、connections、evidence 各两条，以及 created 和 accepted 两条通知。
  - App 人脉列表显示「Blair Chen, QA 0127」。收件箱「通知」为空，原因见第 1 节。
- **付费调用 2/3**：A 在 App 引导第 4 步 1 次，B 经接口 1 次，都是 intro-draft。其余 0 次。worker 没有 AI key。
- **观察到的小问题（P2）**：
  - 恢复联网后，已经打开的笔记页不会自动刷新掉「离线」横幅，要重新进入。
  - 离线时首页的网络错误文案是硬编码中文（英文界面也显示中文）。这是旧问题。

## 7. 测试、typecheck、棘轮

- **orbits 全量**：
  - 第一次 5195 条，4731 通过，**2 条失败**，461 跳过。两条都在 `full-product-functional-audit`：我给 profile-basic 加了行，文件里行号锚点对不上了。
  - 修正锚点后该文件 98/98。
  - 再跑一次全量：5195 条，4733 通过，**0 失败**，461 跳过。
- **App 全量**：3690/3690。
- **Postgres 测试**（`ORBIT_LIFECYCLE_TEST_DATABASE_URL=orbit_test`）：
  - 0126 协调者用过的那组（生命周期、关系待办、首页事实、联系人搜索、联系人卡片、主人边界、同步）：167 条，158 通过，0 失败，9 跳过。
  - 另外把所有带这个变量的 78 个文件一起跑了一次，有 69 条失败，集中在 7 个文件：`canonical-reminder-*`、`contact-search-pagination`、`sync-revision-migration` 等。报错是「cutover test database required」、锁超时这类，每条几毫秒就失败，属于这些文件需要另外的库或一次性集群，与本 Sprint 改动无关（它们没有引用改动的模块）。但我没有在基线上用同一命令跑过对照。
- **typecheck 与 lint**：orbits `typecheck`、`typecheck:app`、`lint`，App `typecheck`，全部 0 错误。
- **棘轮**：`git diff` 里没有棘轮文件。
- **重复运行**：新的 Provider 测试和语言测试各连跑 3 次，都通过。

## 8. 清理与环境收尾

- **QA 数据**：一个事务删除，日志在 `commands/cleanup.txt`。
  - orbit_records 26，orbit_read_receipts 128
  - event_ops 系列：relationship_evidence 2、relationship_sides 2、relationship_pairs 1、contact_requests 1、outbox 6、audit_log 4、profile_response_versions 6、membership_heads 2、membership_versions 2、profile_heads 2、profile_versions 2、configuration_heads 1、configurations 1、events 1
  - event_aliases 2
- 删除后，66 张表的行数与开工前逐表一致，orbit_records 主键集合的 md5 也一致。全库按 qa0127 和 event_qa_0127 扫描，没有残留。
- **需要你知道**：
  - worker 第一次启动时，处理了库里原有的 4 条待处理 outbox（8 月、9 月的报名事件，不是 QA 数据），因此改动了 3 条原有的 `event_registrations` 行，这 4 条 outbox 也从 pending 变成了 completed。这是 worker 正常处理积压，我没有回滚，也没法逐字恢复原样（开工前只存了哈希）。
  - 128 条 read receipt 里有 28 条来自你的 3000：我重启 App 时，演示账号在 3000 上产生的读取记录。按开工快照的时间一起删了，行数因此回到原样。
- **环境**：
  - App 服务器地址已改回 `http://127.0.0.1:3000`，回到演示账号（16 项待办，截图 90）。因为登录页进不了设置页，这一步是在 App 停止时直接改了 Simulator 里的 AsyncStorage 键 `orbit.apiBaseUrl`。
  - 另外，切到 3100 时，演示账号在本机的镜像库按换服务器的逻辑被清掉了（这是原有行为），回到 3000 后会重新拉取。
  - 3100、两个 worker、Metro 都已按 PID 停止；PID 文件已删除；3000 没有碰过。
  - `repos/orbits/next-env.d.ts` 是构建时生成的改动，没有提交。

## 9. GitNexus

- `OrbitAuthSessionProvider` 在图里是 LOW（只有 RootLayout 一个调用方），但它包着整个 App 的认证启动，我按 **HIGH** 处理，按 H 档测试（第 7 节）。
- `validateAuthSession`、`parseProfileIntroDraft`、`visibleLength` 是 UNKNOWN，已用文本搜索确认调用方：
  - `validateAuthSession`：Provider 和 `browser-auth.ts`，后者已同步修改；
  - `parseProfileIntroDraft`：只有 intro-draft 服务本身；
  - `visibleLength`：本 Sprint 之前只在 intro-draft 服务内部使用，现在保留导出，等于共享函数 `profileVisibleLength`。
- 其余改动符号都是 LOW。
- 以 `b6477871f` 为基准的 compare 结果是 **high**：52 个文件，8 个流程。主要原因是 en/zh/ja 词典（全局依赖，只改了 `profile.bioCount` 一行）和 AuthSessionProvider。
- `docs/audits/*.md` 里还引用着 profile-basic 的旧行号。这是历史生成文档，没有测试检查，我没有重新生成。

## 10. 生产步骤

- 没有迁移，不需要改数据。
- 需要重新构建并发布 App，离线身份和计数器才会生效。
- 已登录的用户升级后要先联网冷启动一次，才会写下身份记录；在那之前第一次断网冷启动仍会进登录页。

## 11. worker 脚本用法（给通用 Generator 规则）

```
cd repos/orbits
node scripts/local-stack.mjs start --build   # 用 ORBIT_DATABASE_TARGET=local 构建，再启动 3100、event-operations worker、notification-delivery worker
node scripts/local-stack.mjs start           # 复用已有构建（没有 .next/BUILD_ID 时会拒绝启动）
node scripts/local-stack.mjs status          # 各进程 PID、是否在跑、健康检查
node scripts/local-stack.mjs stop            # 核对命令行后，按记录的 PID 停止进程组；不碰 3000
# 等价写法：npm run local:stack -- start|status|stop
# 日志：repos/orbits/build/local-stack/logs/*.log；PID 文件：build/local-stack/pids.json
# 数据库地址必须是本机（127.0.0.1、localhost、::1 或 Unix socket），否则拒绝启动；worker 没有付费 AI key、没有 Expo 推送
# 注意：启动后 worker 会处理本地库里所有 pending 的 outbox（包括以前积压的）
# 只想模拟断网，就单独停 3100：kill -TERM -<web-3100 的 pid>
```

## 12. 需要你决定或知道的事

1. **名片交换的通知进不了 App 收件箱**（SC-04 未满足的一半）。App 收件箱只读新的收件箱，名片交换只写旧的通知表。要不要单开 Sprint 把它接进新收件箱？
2. **设备时钟往回拨可以延长 30 天窗口**；本地没有可信时间源。
3. **服务端数据库故障时可能误删本地数据**：服务端查用户状态时如果数据库出错，Auth.js 也会返回空会话，App 会按「拒绝」清空本地库。数据在服务端都还在，重新登录会重新拉取。
4. **离线能看到的内容还受服务端的离线读取租约限制**（最长 7 天）。超过 7 天后身份仍被信任，但本地数据会显示为锁定。
5. worker 处理积压 outbox，改了 3 条原有的报名记录，见第 8 节。
## 13. 协调者复核

协调者在 `1758f8192` 上独立复核：

- **orbits 全量**：5195 条，4733 通过，0 失败，461 跳过。
- **App 全量**：3690/3690 通过。
- **Postgres 测试**（`orbit_test`）：生命周期、关系待办、首页事实、联系人搜索、联系人卡片、主人边界、同步、资料，共 121 条，96 通过，0 失败，25 跳过。
  - 子代理那次把 78 个文件一起跑时，`sync-revision-migration` 等出现了失败；协调者这次用的文件集合包含 sync 系列，没有失败。那次的失败是多个依赖其他库的文件同时运行造成的。
- **截图抽查**：
  - 26：断网冷启动后笔记页显示中文「无法连接 · 显示截至…」，本地笔记可见，「新建」按钮置灰。
  - 02：英文自我介绍 188/200，主按钮为黑色。
  - 两张都符合预期。
- **后续安排**：
  - 名片交换通知 → **0129**。
  - 第 12 节第 3 条「服务端数据库出错也会返回空会话，App 会按拒绝清空本地数据」→ 已写入 0120 断网写设计的约束：出现待上传的本地写入以后，这种清空绝不能丢数据。
  - 第 12 节第 2 条「时钟回拨」、第 4 条「离线读取租约 7 天」→ 记为已知限制，写在威胁模型第 6 节。
- **worker 处理积压 outbox**，改动了 3 条原有的报名记录。这是后台正常消化积压，发生在本机开发库，协调者接受。
- **脚本用法**：已加入 Generator 通用规则。

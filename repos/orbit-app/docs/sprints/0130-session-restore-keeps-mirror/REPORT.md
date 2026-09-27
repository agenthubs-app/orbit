# Sprint 0130 执行报告：恢复登录时不再清掉本地副本

**run-01**。Generator 为子代理（没有再派子代理），报告由协调者代存。分支 `sprint/0130-session-restore-keeps-mirror`。我是唯一实现者，没有派子代理。开工时的基线是 `2532eb4c3` 加开工提交 `41198addb`。我提交前，分支上已经多了一个不是我做的提交 `0ee26f4af docs(sprints): record the user's 2026-09-28 autonomy grant`，我的两个提交在它之上。没有推送。

**状态：completed。**

### 1. 结论

- **同一个账号重新恢复登录时，本地副本原样保留。**
  - 恢复流程开始时，不再调用 `setScope(null)`，改为调用新接口 `suspendScope(baseUrl)`。这一步只暂停读写：不关库、不删库、不删密钥。
  - 确认还是同一个（服务器、账号）后，直接恢复原来的库，不重拉。
  - 以下情况仍然清空：服务器不同（挂起时立即清空）、确认是另一个账号、服务端明确拒绝（沿用 0127 的定义）、原生端没有保存的会话、退出登录。
- **断网时，浏览器前进后退、错误边界重试、根布局重新挂载、开发版 Fast Refresh 之后，笔记、待办、个人日程都能看**，并显示「无法连接 · 显示截至 …」。phoneweb 和 Simulator 上都实测过。
- **修了一个已经存在的隐私缺口：浏览器版退出登录原来不删本地库。**
  - 原来 `signOut` 只在原生上 `setScope(null)`。浏览器退出后，库和密钥一直留在浏览器里，要等下一个身份登录时才被删掉。
  - 现在两端一样，退出时就删库删钥。这条有 RED 证明。
  - 威胁模型文档原来声称退出会删除，现在才真正符合。
- **0125 遗留的「返回首页」没反应：已查明并修复，和断网无关。**
  - 原因：按钮文字是「首页」，但只要有浏览历史，它执行的是 `router.back()`。0125 的操作路径是「列表 → 详情 → 返回」，这之后历史里的上一条还是 `/notes`，所以第一次点击看起来没反应，第二次才到首页。在线时也能复现。
  - 现在 NotesScreen 的「首页」固定跳到 `/home`。phoneweb 在线和断网、原生 Simulator 上都验证过，一次点击就到首页。
- **付费调用 0 次。**

### 2. 恢复流程的触发条件（SC-0130-01）

| 触发条件 | 原生是否重跑 | 浏览器是否重跑 | 证据 |
|---|---|---|---|
| 冷启动 / 整页刷新 | 是 | 是 | Simulator 重启 App：account/me +1。phoneweb 刷新：session 请求 +1。这时还没有打开的库，旧代码也不会删库，所以不算回归 |
| Provider 重新挂载（Expo Router 根布局重挂就是这个效果） | 是 | 是 | `session-restore-keeps-mirror-browser`，两种模式都测了 |
| AppErrorBoundary「重试」 | 是 | 是 | 同上，用真实的 AppErrorBoundary 点「重试」 |
| expo-router 根 `ErrorBoundary` 的 retry | 推断为是 | 推断为是 | **没有单独在运行时验证。** 看代码，它会替换整个 RootLayout，效果等同于上一行的重新挂载；(app) 组下的页面有自己的边界 |
| 浏览器后退（先应用内 push 再退一步） | 不适用 | 否 | phoneweb：session 请求 +0 |
| 浏览器前进，以及再往后退 | 不适用 | **是** | phoneweb：每次 +1。在线和断网都会重跑 |
| `pushState` + `popstate` | 不适用 | 是 | phoneweb：每次 +1 |
| 服务器地址改为别的值 | 是，并且清空旧库 | 不适用（浏览器版只能用当前网站地址） | 自动测试；Simulator 上换到 3100 后，演示账号的库文件立即删除 |
| 服务器地址保存为同一个值 | 否 | 不适用 | 自动测试：session 请求数不变 |
| `baseUrlReady` 变化 | 只在挂载时从 false 变 true 一次 | 同左 | 看代码确认，已包含在前面的挂载各行里 |
| 开发版 Fast Refresh：改普通页面文件 | 否 | 没测 | Simulator：account/me +0 |
| 开发版 Fast Refresh：改 `AuthSessionProvider.tsx` | 是 | 没测（React Refresh 机制相同，推断为是） | Simulator：account/me 每次 +1，库文件 inode 不变，同步页没有增加。断网时改一次，笔记仍然显示本地内容 |
| 回前台 / deep link / 应用内点击导航 | 否 | 应用内点击：否 | Simulator：account/me +0。phoneweb：+0 |
| 恢复联网 | 不是恢复流程，是另一个复核流程 | 同左 | account/me +1，同步页 +0，库文件 inode 不变 |

### 3. 各 SC 结果

| SC | 结果 | 证据 |
|---|---|---|
| 01 触发条件清单 | 完成 | 见第 2 节。Fast Refresh 在浏览器上、根 ErrorBoundary 的 retry，这两项是推断，已如实标注 |
| 02 同一身份在线恢复 | 通过 | 新测试（真实 Chromium）。web 和 native 两种模式下，重新挂载和错误边界重试之后：密钥指纹相同，标记表还在（证明是同一个库文件），数据行相同（浏览器上连密文都相同），没有从头拉取的同步页。先 RED：修改前这两条都失败，密钥被换掉 |
| 03 同一身份断网恢复 | 通过 | 新测试：断网后重新挂载、重试，仍然是离线登录状态，本地两条笔记可见，状态为 stale，「截至」时间等于上次在线同步的时间。先 RED：修改前 status=failure、没有数据。phoneweb 截图：`screens/A-10…A-16`、`B-*`。Simulator 截图：`sim-10`～`sim-14` |
| 04 各清空路径 | 通过 | 新测试覆盖：拒绝、换账号、退出（两端）、换服务器（原生，新服务器不可达时也会清空）。浏览器退出这一条修改前是 RED。0077、0125、0127 的相关测试全部通过：web-mirror-storage、web-tasks-mirror、web-notes-mirror、offline-identity 两个、offline-cold-start、auth-session-provider-races |
| 05 全量、typecheck、lint、GitNexus | 通过 | 见第 6 节 |

### 4. 设计选择

- 挂起的做法：`suspendScope` 在调用时立即作废 token，已经在进行中的读写返回 null。之后用一个 `suspended` 标志拦住新的读写，直到下一次 `setScope`。
  - 一次中断的清理没完成时，照旧先补完清理；补不完就拒绝，这一点不变。
  - 原生和浏览器两个 lifecycle 都把「加载依赖 + 补完清理」抽成了 `prepare()`，原有语义不变。
- 在 Provider 里恢复时，以下情况会保持挂起、不删数据，和 0127「离线超过 30 天不删数据」的规则一致：离线身份记录过期或不存在、恢复过程中抛异常、会话确认成别的用户但 account/me 不可达。
- 原生端没有保存的会话时，按退出登录处理，清空。
- 服务端拒绝、但没有离线身份记录时，清空当前挂起的库。原来这里什么都不做，是靠恢复开始时的那次清空兜底。

### 5. 改动的文件

**App 源码**：
- `src/api/AuthSessionProvider.tsx`
- `src/data/sync/sync-lifecycle.ts`
- `src/data/sync/sync-lifecycle.web.ts`
- `src/screens/notes/NotesScreen.tsx`
- `docs/phoneweb/local-mirror-threat-model.md`（第 6 节新增一条）

**新增测试**：
- `tests/session-restore-keeps-mirror-browser.test.ts`，16 条，真实 Chromium。
  - 页面里跑的是真实的 Provider、ApiBaseUrlProvider、AppErrorBoundary、useSyncedCollection、coordinator、lifecycle，以及真实的 HTTP 请求代码，对面是一个脚本化的 Orbit 服务。
  - native 模式用的是原生版源码和原生 lifecycle，SQLite 用 expo-sqlite 的 wasm 引擎代替 SQLCipher。
  - 覆盖：在线恢复（SC-02）、断网恢复（SC-03）、各清空路径（SC-04）、服务器地址保存为同一值不触发恢复。
- `tests/sync-lifecycle.test.ts` 新增 3 条，用真实的原生 lifecycle 加 node:sqlite：
  - 挂起时保留库文件、密钥和数据，暂停读写，确认后恢复，库没有重新打开；
  - 挂起后换服务器、换账号、传 null 都会清空；
  - 挂起前仍会先补完中断的清理。
- `tests/notes-web-local-first.test.tsx` 新增 1 条：有浏览历史时，「首页」按钮在线和断网都跳到 /home。

**改动的旧测试**：
- `offline-cold-start`、`auth-session-provider-races`、`notification-registration-races` 这三个测试的替身补了 `suspendScope`。
- 期望的调用序列里，恢复开始时的 `null` 改成了 `{ suspend }`。
- 「退出只清空一次」「会话过期只清空一次」两条的计数从 2 改为 1。原来多出的那一次，就是恢复开始时的清空，也就是本 Sprint 要去掉的行为。

**RED 记录**，在 `build/harness-state/evidence/sprint-0130/run-01/commands/`：
- `red-session-restore-keeps-mirror-browser.txt`：16 条里 5 条失败。
- `red-sync-lifecycle-suspend.txt`：3 条失败（接口还不存在）。
- `red-notes-home-back.txt`：点击后执行的是 `back`，不是 `replace:/home`。

### 6. 提交与验证

**提交**：
- `b6bfdac5a` fix(app): session restore suspends the local mirror instead of purging it (0130)（最后一个功能提交）
- `88d4ad2fa` docs(phoneweb): restore re-runs keep the mirror; web sign-out erases it (0130)

**全量测试**：
- App 3718/3718 通过（`app-full-suite-2.txt`）。
  - 第一次全量有 7 条失败，都是新测试的 native 模式。原因是 npm test 的钩子把裸 `expo-sqlite` 重定向到 Node 替身。改成按包路径解析后，这个文件带钩子连跑 3 次都是 16/16（`green-session-restore-x3.txt`）。然后重跑全量，0 失败。
- orbits：5202 条，4735 通过，0 失败，466 跳过，与已知基线一致。orbits 这次没有改代码。

**typecheck 与 lint**：App 的 `typecheck`，orbits 的 `typecheck`、`typecheck:app`、`lint`，全部 0 错误。

**其他**：
- **Postgres 环境测试**：没有跑，这次没改服务端和 SQL。
- **读取量棘轮文件**：没有改动。

**GitNexus**：
- `OrbitAuthSessionProvider` 在图里是 LOW（只有 RootLayout 一个调用方），`createSyncLifecycle` 是 MEDIUM（影响 79 处），`createWebSyncLifecycle` 是 LOW。三者我都按 **HIGH** 处理，按 H 档测试。
- `eraseRejectedIdentity` 在索引里查不到，结果是 UNKNOWN。文本搜索确认只有 restoreSession 调用它。
- `NotesScreen` 是 LOW。
- 暂存区的 detect-changes 结果是 low，没有受影响的流程。

### 7. 运行时证据

证据目录：`repos/orbit-app/build/harness-state/evidence/sprint-0130/run-01/`，下有 `screens/` 和 `commands/`。

**环境**：
- `local-stack start --build`，本机库 `orbit_events`。
- phoneweb 用本 Sprint 代码导出两次（第二次包含「首页」修复），运行在 `localhost:32130`，上游 3100。
- iPhone 17 Pro Simulator 装的是 Debug 版加 Metro，服务器地址设为 3100，登录 QA 账号 A。
- QA 账号是 qa0130a 和 qa0130b。

**phoneweb**（脚本 `phoneweb-session-restore.mjs`，输出在 `phoneweb-run-*.txt`）：
- 所有触发之后，密钥指纹都没变。整个过程中，从头拉取的同步页只有首次同步那 3 个。
- 断网后，经过前进后退和 popstate，笔记、待办、个人日程列表和日程详情都显示本地内容和「截至 9月28日 02:21」，没有「同步失败」，页面错误为 0。
- `/schedule` 日历页断网时，三张卡片都显示「暂时连不上」。这个页面本来就走服务器接口，不读本地副本，不是本 Sprint 的回归，见第 9 节第 2 条。

**Simulator**：
- 断网冷启动，以及断网时改 `AuthSessionProvider.tsx` 触发 Fast Refresh：之后笔记显示「Offline · showing content as of Sep 28 at 2:12 AM」，待办、个人日程也都有本地内容。
- 从冷启动、三次 Fast Refresh 到恢复联网，库文件 inode 一直是 `100555227`，同步页一直是 3 个，没有重拉。

**QA 数据已清理**（`cleanup.txt`）：
- 一个事务删除了 orbit_records 21 行和 read receipts 380 条。
- 删除后 orbit_records 是 10560 行，主键 md5 `3d7541cf…`，与开工前一致。其余表的行数没有变化。
- 保留了 3000 上演示账号产生的 receipts（source=app）。另外还保留了 13 条匿名的 app receipts，它们在我的 3100 时间窗口之外，无法确定来源，所以没有删。

**进程与 Simulator**：
- 3100、两个 worker、phoneweb、Metro 都已按 PID 或进程组停止，3000 没有碰过。
- Simulator 的服务器地址已改回 `http://127.0.0.1:3000`，演示账号恢复正常（52 条未完成待办，截图 `sim-90`）。
- 切到 3100 时，演示账号在本机的库按换服务器的规则被清掉了（这是原有行为），回到 3000 后已重新拉取。

### 8. 生产步骤

- 没有迁移。
- 重新发布 phoneweb（web export）和 App 即可。已有的本地库直接沿用，不需要清库重建。

### 9. 需要你知道或决定的事

1. **Simulator 上现在装的是 Debug 版**，不再是你原来的 Release 版，服务器地址已经改回 3000。如果你要继续手动测 Release，需要重新编译。
2. **`/schedule` 日历页断网时全部报错**，因为它读的是服务器接口。能离线看的个人日程在 `/tasks/personal` 和日程详情页。要不要让日历页也读本地副本，需要另外决定。
3. **没有在修改前的 phoneweb 上跑前进后退做运行时对照**，因为那需要另外导出一份旧代码的构建。旧行为的证据是：自动测试的 RED 记录，以及 0125 报告里用调试构建看到的情况。
4. **原生端没有「同一台设备只保留一个身份」的规则**（浏览器端从 0125 起有）。我开始测试时，Simulator 里有两个库文件：一个属于 3000 上的演示账号，另一个（`526e…`）来源不明，可能是你之前的 Release 测试留下的。后来它消失了，可能是原生端启动时补完了一次中断的清理，我没有确认。这不在本 Sprint 范围内，建议记为 P2。

**工作区**只剩你原有的未提交文件：各个 codex-review.md、`.claude/skills/gitnexus/`、`output/`，以及构建时生成的 `repos/orbits/next-env.d.ts`。
## 10. 协调者复核

协调者在 `88d4ad2fa` 上独立复核：

- **App 全量**：3718 条，3717 通过，1 条失败。失败的是 `ink-signal-event-operations` 里的「operations and permission content remain readable/reachable at wide-dark」（2.8 秒）。这个文件单独连跑 3 次都是 16/16 通过，而且本 Sprint 没有改它。它和已知的 ink-signal 界面测试一样，是全量负载下的不稳定，不是回归，已加入不稳定观察名单。
- **orbits**：本 Sprint 没有改动 orbits 代码，沿用 0129 的全量结果（0 失败）。
- **设计审查**：用 `suspendScope` 代替 `setScope(null)`，挂起时不关库、不删库、不删密钥，确认身份后再恢复；清空路径保持不变。浏览器退出登录现在也会删库。协调者认可。
- **第 9 节的去向**：
  - 第 2 条「`/schedule` 日历页断网全部报错」→ 并入 **0115**：日历里的活动部分依赖 0115 放进手机的活动数据，待办和个人日程部分改读本地副本。
  - 第 4 条「原生端没有一台设备只保留一个身份的规则」→ 并入 **0113**（同步地基），属于 P2。
  - 第 1 条：Simulator 现在是 Debug 版，已写进 Generator 通用规则。

# Sprint 0078 — 执行报告

## 结果

**completed。** 五项 SC 均有同版本证据，功能已提交并以 `merge --no-ff` 合回 `chat-agent`。
唯一 run-01。批准契约为 [PLANNER.md](PLANNER.md) revision 1／SHA256 `435ed9c4…`（登记表）。

## 先用人话说

同步协调器现在先看一眼 manifest：哪个域的水位线没动就一页都不拉；服务端把 manifest 做成条件读，没变化就 304。
浏览器的 `/tasks` 从"每次请求 `/api/tasks`"变成"镜像优先"：第一次进入 lease → manifest → 域页，**第二次进入 0 次同步请求、0 次 `/api/tasks`**；
非 HTTPS 的浏览器自动走原来的网络读取，两种来源显示同样的计数。断网仍可读并标"显示本地内容"，镜像为空且拉取失败显示失败而不是空列表，登出连库带密钥一起清。

途中抓到并修掉两个协调器的真问题（两端受益）：
1. **未绑定的授权也在逼着同步**：新鲜度判断遍历租约里全部 grants，浏览器从不绑定 `notes`，于是每次挂载都"缺游标 → 必须同步"。改为只看本平台白名单内的域。
2. **没有镜像也先去要租约**：online-only 浏览器（或原生缺 SQLite）每个屏幕都会白白请求一次 `/api/sync/lease`。改为同步开始先探一次镜像可用性，不可用就不碰网络。

## 固定版本

| 内容 | 实际版本 |
| --- | --- |
| 基线 | `chat-agent` = `bc39eeb24`；登记后 `7bd01e6b8` |
| 功能提交 | `485f42328` feat(sprint-0078) |
| 合并 | `3709c633f` merge(sprint-0078)（`--no-ff`），`merge-base --is-ancestor` 退出码 0 |

## SC 映射与证据

| SC | 状态 | 证据 |
| --- | --- | --- |
| SC-0078-01 manifest 门控 | pass | `sync-coordinator-lease.test.ts` 7/7：未变 → `["lease","manifest"]` 无域页且游标 `lastSyncedAt` 前移；只有 tasks 变 → 只拉 tasks；manifest 挂掉 → 上报并按存储游标照拉。orbits `sync-lease-manifest-domains.test.ts`：manifest 带弱 ETag，If-None-Match 命中 304 且只执行 1 条 `domain:watermark:user`；写入后 200 换 ETag。真实 Postgres `sync-domain-topology-postgres.test.ts` 3/3 同样断言（记录 SQL：304 = 1 条水位线语句、0 条业务读；锁下写入新任务后水位线与 ETag 都变；A 的 ETag 不能验证 B）。本机 Next：`curl` manifest 拿 ETag，再带 If-None-Match → **304** |
| SC-0078-02 Web `/tasks` 镜像优先 | pass | `tasks-screen-source-selection.test.ts`：Web 源 `useWebMirrorStatus → useSyncedCollection → useApiResource(enabled: !mirrorActive)` 顺序固定、共享 `mirrorTaskListSource`。phoneweb localhost 第一次：`lease, manifest, domains/tasks, domains/personal-schedule`，无 `/api/tasks`，标"已是最新内容"，未完成 2／已完成 1；第二次：**无任何 `/api/sync/*`、无 `/api/tasks`**，计数相同（`sprint0078-phoneweb-tasks-local-{first,second}.png`）。非安全源：走 `/api/tasks`，计数相同，不再请求 lease（`sprint0078-phoneweb-tasks-insecure.png`） |
| SC-0078-03 离线与错误态 | pass | `web-tasks-mirror-browser.test.ts`（真实 Chromium + 脚本化同步主机）：断网后同步 → `status: "stale"`、三条记录仍可读、错误可见；镜像为空且 lease 503 → `status: "failure"`、`records: []`、错误非空；恢复后 `fresh` |
| SC-0078-04 登出清库与 SSR | pass | 同一浏览器测试：登出后 IndexedDB 无该 digest 密钥，重开作用域 `readCollection` 为空；`npx expo export` exit 0，`dist/tasks.html` 存在，导出时（Node，无 navigator）探测为 online-only、首屏走网络源 |
| SC-0078-05 无回归与越权 | pass | App 全量 **3508/3508**（0077 收口 3501 + 7）；orbits 定向集 17/17（lease/manifest/domains、PG 拓扑、账本、审计）；两端 typecheck 0；Simulator 冷启动后待办页 52/12、"已是最新内容"，Metro 无 `SYNC_INIT_FAILED`（本地 schema v2→v3 在真机库上原地加列，`sprint0078-sim-tasks.png`）；`local-read-migrations.test.ts` 冻结 v2 夹具 → v3 保留行与游标、不隔离、可重入；`mirror-topology.test.ts` 新增：同 actor 同作用域换密钥读不出密文行 |

## 与设计案／PLANNER 的偏差（如实）

- "二次访问 0 行业务读"：浏览器整页刷新会丢内存里的条件缓存，所以在新鲜度窗口**外**的第二次同步是 lease + manifest(200) 而非 304；窗口内（本次 phoneweb 证据）是 0 请求。304 回放在协调器级浏览器测试与真实服务端 `curl` 上各验证了一次。
- `/tasks` 屏幕上其它部件（`/api/contacts`、`/api/schedule-items`、`/api/relationship-tasks`）仍按 0076 的方式网络读取，不在本 Sprint 范围。
- 设计案七态 UI 未新增：复用 App 的五态标签（PLANNER 判断 5）。
- 个人日程域已被同步（第一次进入可见 `domains/personal-schedule`），但 Web 没有独立列表路由，消费者接入留第二批。
- 三个用 esbuild 夹具替换 `useApiResource` 的屏幕测试（`ink-signal-tasks`、`app-wide-workspaces`、`tasks-unification-interactions`）在 Chromium 里现在会命中镜像源；夹具追加 `useWebMirrorStatus`（online-only）与惰性 `useSyncedCollection`，让它们继续测网络源；镜像源由本 Sprint 的浏览器测试覆盖。
- GitNexus staged `detect_changes` 评 **high**：命中的是 `useApiResource` 的 12 条 Profile 流程（同一符号），改动为默认 `enabled = true` 的可选参数，既有调用方行为不变，全量 3508 覆盖。

## 命令与退出码

| 命令 | 结果 |
| --- | --- |
| `npm test`（App 全量） | 3508/3508，exit 0（`app-full-0078b.log`） |
| `npm run typecheck`（App）／`npx tsc --noEmit`（orbits） | 0／0 |
| orbits `run-node-tests`（lease/manifest/domains、PG 拓扑、账本、审计） | 17/17 |
| `node --test tests/web-tasks-mirror-browser.test.ts` | 1/1 |
| `npx expo export --platform web` | exit 0 |
| `gitnexus_detect_changes(staged)` | 23 文件、risk high（`useApiResource` 共享符号，见偏差） |

## 未提交项与其他端影响

- 未提交：仓库根目录既有无关改动、设计图 PNG、`.claude/skills/gitnexus/`——与本 Sprint 无关。
- 原生：协调器 manifest 门控与本地 schema v3 同样生效；Simulator 对照无差异，冷启动后的窗口外同步从"三个域各一页"降为"lease + manifest"。
- 服务端：manifest 响应头从 `no-store` 变为 `private, no-cache` + `ETag`（`conditionalJsonRead` 的既定头）。

## 下一步

Phase D 两项完成。Phase E（0079 投影列、0080 Worker 事件化）按设计案**需单独批准**才启动；建议先用 0070 账本对比 Phase B–D 的实测降幅再决定。

# Sprint 0077 — Web 本地镜像存储层与威胁模型

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** 读取成本治理设计案 Rev 4 第 11 节 Phase D 首项（0077）。
**单一目标:** 浏览器拥有按 (server, actor) 分库、密钥不可导出、正文加密落盘、不可用时静默退化的本地镜像存储层；协议与仓库零改动复用。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** `chat-agent` = `73b1b7c8b`（0076 第一批 completed）。
**进入条件:** 0068（phoneweb 基座）、0069／0075（协议与 schema）completed。只用本机 phoneweb + Chromium。

## 已查明的事实与本 Sprint 的核心判断

| 事实 | 数据 |
| --- | --- |
| Web 现状 | `sync-lifecycle.web.ts` 与 `local-sync-database.web.ts` 都是 online-only 桩；`withDatabase` 永远返回 null |
| 仓库说的是 SQL | `LocalSyncDatabase` 端口 = `execute/run/get/all/transaction`，仓库直接发 SQL——浏览器里必须有 SQLite 引擎，纯 IndexedDB 存储不可行 |
| 引擎已在依赖里 | `expo-sqlite@57.0.1` 自带 web 实现：wa-sqlite（wasm）在 Worker 里跑，`AccessHandlePoolVFS`（OPFS，要求 secure context）持久化，`MemoryVFS` 备用；同步 API 依赖 SharedArrayBuffer，异步 API 不需要 |
| 原生密钥模型 | SQLCipher `PRAGMA key`，密钥在 SecureStore（`orbit.sync.key.<digest>`），库名 `orbit-sync-<digest>.db`，digest = sha256(baseUrl, actorId)；purge 先记 pending-cleanup 再删文件与密钥 |
| 浏览器没有 SQLCipher | wa-sqlite 无整库加密；加密只能在应用层做——仓库的 `payload_json` 是唯一正文列 |
| 加密密钥存储 | Web Crypto `CryptoKey`（`extractable: false`）可直接存进 IndexedDB（结构化克隆），取出后仍不可导出 |
| 设计案的白名单建议 | 首批只放 活动目录／个人日程／普通待办；联系人正文、私密笔记、消息原文留第二批。注册表 v1 只有 notes／tasks／personal-schedule → Web 白名单 = `tasks`、`personal-schedule` |

**判断 1：引擎用 expo-sqlite web，不新增依赖。** 先做可执行 spike（真实 Chromium + 静态服务）证明 Worker／wasm／OPFS 三件套在本项目的打包方式下能开库、写入、刷新后读回；spike 不过则停下汇报，不换引擎硬上。
**判断 2：加密在仓库边界做，不在 SQL 层做。** `createLocalSyncRepository` 增加可选 `payloadCodec`（encode/decode `payload_json`）；原生不传（SQLCipher 整库加密），Web 传 AES-GCM 编解码。`local_read_index` 等派生表在 Web 白名单域下不写正文。
**判断 3：白名单在 Web 的 lifecycle 里硬编码并由协调器读取。** `SyncCoordinatorLifecycle` 增加可选 `registeredDomainIds`，协调器只为白名单域绑定作用域／拉页；原生保持三域。
**判断 4：退化即正常路径。** OPFS 不可用、IndexedDB 打不开、不是 secure context、Worker 起不来——任一情况 `setScope` 返回 true、`withDatabase` 返回 null（与今天完全一致），并把原因写进状态面板，不抛错、不弹窗。
**判断 5：文案。** 状态面板与文档写"浏览器本地镜像（与原生保护不同）"，明确同源脚本可解密、浏览器清站点数据即清库。

## 范围与文件

- 新建（App）：`src/data/sync/web-mirror-storage.ts`（打开／关闭／删除 OPFS 库、能力探测、退化原因）、`src/data/sync/web-mirror-key.ts`（IndexedDB 中的不可导出 AES-GCM 密钥、按 digest 分键、删除）、`src/data/sync/payload-codec.ts`（接口 + Web AES-GCM 实现）、`src/hooks/useWebMirrorStatus.ts`。
- 修改（App）：`src/data/sync/sync-lifecycle.web.ts`（真实实现）、`src/data/sync/local-sync-database.web.ts`（能力：local-mirror／online-only + reason）、`src/data/sync/local-sync-repository.ts`（`payloadCodec` 可选，默认恒等）、`src/data/sync/sync-coordinator.ts`（`lifecycle.registeredDomainIds` 可选）、`src/screens/settings/ApiSettingsScreen.web.tsx`（本地镜像状态卡）、i18n 四文件（`settings.localMirror*`）。
- 新建（App 测试）：`tests/web-mirror-storage-browser.test.ts`（esbuild 打包 + Node 静态服务 + Playwright Chromium：开库／写入／刷新读回；密钥不可导出负例；换账号／换 server 不同库互不可读；模拟 OPFS 不可用退化为 online-only 且无 console error）、`tests/payload-codec.test.ts`（AES-GCM 往返、密文≠明文、错密钥失败）、`tests/local-sync-repository.test.ts` 增 codec 用例。
- 新建（文档）：`docs/phoneweb/local-mirror-threat-model.md`（域白名单及逐域论证、威胁模型与降级声明、与原生的差异表）。
- 排除：Web 业务屏幕接镜像（0078）；`/api/sync/manifest` 客户端接线（0078）；SharedArrayBuffer／COOP-COEP（只用异步 API）；资源清单；notes／contacts 在 Web 落盘。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0077-01 | **持久化镜像可用**：真实 Chromium 上，Web lifecycle `setScope` 打开 `orbit-sync-<digest>.db`（OPFS），`withDatabase` 能执行仓库 schema 初始化（v2 表齐全）、`applyDomainPage` 写入、刷新页面后 `listRecords` 读回同一批记录 | 浏览器测试 |
| SC-0077-02 | **密钥不可导出、正文密文落盘**：`crypto.subtle.exportKey` 对镜像密钥抛 `InvalidAccessError`；直接读 `sync_records.payload_json` 得到的是密文（不含明文字段名）；`payloadCodec` 往返一致、错密钥解密失败 | 浏览器测试 + `payload-codec.test.ts` |
| SC-0077-03 | **隔离**：换 actor 或换 baseUrl 得到不同库名与不同密钥；用 B 的会话打不开／读不到 A 的记录；撤权（租约无该域）后域清空（复用 0075 协调器路径） | 浏览器测试 |
| SC-0077-04 | **优雅退化**：注入 `navigator.storage.getDirectory` 不可用／IndexedDB 打开失败／非 secure context 三种情形，`setScope` 返回 true、`withDatabase` 返回 null、能力为 `online-only` 且带原因、console 无 error；phoneweb 设置页显示对应文案 | 浏览器测试 + phoneweb 截图 |
| SC-0077-05 | **无回归与文档**：App 全量与 0076 收口（3495）对照零新增失败；两端 typecheck 0；phoneweb `/tasks`、`/contacts` 仍网络读取无变化；Simulator 待办页镜像路径无回归（原生不传 codec）；威胁模型文档不含"与原生同等保护"字样且逐域列白名单理由 | 摘要、截图、文档 |

## 一次 Generator 的执行顺序

1. 记录基线、`git status --short`、Planner SHA256，登记 run-01。
2. **Spike**：esbuild 打 expo-sqlite web（入口 + worker + wasm）→ Node 静态服务 → Playwright 开库／写／刷新读回。不过则 blocked。
3. RED→GREEN：`payload-codec.test.ts`；仓库 `payloadCodec`；协调器 `registeredDomainIds`。
4. Web lifecycle／key／storage 实现；浏览器测试四条（SC-01～04）。
5. 设置页状态卡 + i18n；威胁模型文档。
6. `web:export` 重导出；phoneweb 设置页截图（local-mirror 与退化态各一）；`/tasks` `/contacts` 对照；Simulator 待办页对照。
7. App 全量、两端 typecheck；路径限定暂存 → staged `detect_changes` → commit → `merge --no-ff` → REPORT、登记表。

## 最小测试与检查

- 档位：App **H**（同步存储层、仓库、协调器）；orbits **无改动**（只 typecheck）。
- 开发定向集：新增浏览器测试 + `payload-codec` + `local-sync-repository` + `sync-coordinator-lease` + `mirror-topology` + `tasks-screen-source-selection`。

## 失败与交接

若 spike 显示 Metro 导出后 Worker／wasm 无法被 phoneweb 静态服务正确加载（路径或 MIME），先在 `phoneweb-server.cjs` 补 MIME／路径映射（属基座）；若 wa-sqlite 在 OPFS 上不可用而只剩 MemoryVFS，则标 blocked——内存库不是"落盘"，不得冒充。
若 `payloadCodec` 无法在不改仓库 SQL 的前提下覆盖全部正文列，缩小白名单而不是放宽加密。报告须列 SC 映射、功能 SHA、命令与退出码、未提交项、其他端影响与下一步。

# phoneweb 本地镜像：威胁模型与降级声明

> 适用范围：浏览器端（phoneweb / `expo export --platform web`）的本地镜像存储层，落地于 Sprint 0077。
> 这是**浏览器本地镜像**，其保护与原生 SQLCipher + SecureStore **不同**，不得对用户或文档宣称等同。

## 1. 它是什么

| 组成 | 浏览器实现 | 原生实现（对照） |
| --- | --- | --- |
| 引擎 | expo-sqlite web：wa-sqlite（wasm）在 Worker 内运行 | expo-sqlite 原生（SQLCipher） |
| 持久化 | OPFS（`AccessHandlePoolVFS`），仅 secure context 可用 | 应用沙盒内 `.db` 文件 |
| 库名 | `orbit-sync-<sha256(baseUrl, actorId) 前 32 位>.db`（OPFS 路径名上限 64 字节） | `orbit-sync-<sha256 全长>.db` |
| 密钥 | Web Crypto AES-GCM-256 `CryptoKey`，`extractable: false`，存 IndexedDB `orbit-sync-keys` | 64 位十六进制随机密钥，存 SecureStore（`AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`） |
| 加密范围 | 仅 `sync_records.payload_json`（仓库边界 `payloadCodec`，每条记录独立 96 位 IV） | 整库（PRAGMA key） |
| 明文列 | `record_id`、`domain_id`、`workspace_id`、`revision`、`updated_at`、`payload_hash` 等元数据 | 无（整库密文） |
| 白名单域 | `tasks`、`personal-schedule` | `notes`、`tasks`、`personal-schedule` |
| 退化 | 任一能力缺失 → online-only + 原因，`setScope` 返回 true、`withDatabase` 返回 null | SQLite 二进制缺失 → 同样退化 |

## 2. 白名单及逐域论证

| 域 | Web 是否落盘 | 理由 |
| --- | --- | --- |
| `tasks` | 是 | 正文为待办标题／截止／状态，泄露面小；离线可读的收益最直接（今日待办、跟进） |
| `personal-schedule` | 是 | 用户自己的日程条目，无第三方正文；与待办同属"接下来要做什么" |
| `notes` | **否** | 联系人笔记含第三方私密内容与原文；浏览器同源脚本可解密，风险收益不成比例，留待第二批评估 |
| 联系人正文、消息原文、活动目录之外的内容 | 否 | 注册表 v1 尚未纳入；即使纳入也需先过本表 |

白名单在 `web-mirror-storage.ts` 的 `WEB_MIRROR_DOMAIN_IDS` 硬编码，协调器只为白名单域绑定读取作用域与拉页；租约里其它域的授权在浏览器**既不存储也不拉取**。

## 3. 威胁模型

| 威胁 | 浏览器镜像的结论 | 说明 |
| --- | --- | --- |
| 物理拿到设备磁盘、离线读取 OPFS 文件 | **正文受保护**，元数据不受保护 | `payload_json` 为 AES-GCM 密文；密钥不在文件里，而在浏览器配置文件的 IndexedDB 中（同一磁盘上，由浏览器自身的配置文件加密与操作系统账户保护）。记录 id、修订号、时间戳明文可见 |
| 导出密钥 | 不可能（JS 层面） | `extractable: false`；`crypto.subtle.exportKey` 抛 `InvalidAccessError`（浏览器测试 SC-0077-02 覆盖） |
| **同源脚本**（XSS、被注入的第三方脚本、恶意扩展） | **不受保护** | 同源脚本可以*使用*密钥解密（虽不能导出），也可直接调用镜像仓库。这是与原生最本质的差异：原生的 SecureStore 与沙盒把攻击面限制在应用进程内 |
| 跨站点／跨源 | 受保护 | OPFS 与 IndexedDB 按源隔离 |
| 同一浏览器换账号 | 受保护 | 换 actor 或换 server 即换库换密钥；切换前先记录 pending-cleanup，再关库、删密钥、删文件；上一身份的行不会留给下一身份（浏览器测试 SC-0077-03） |
| 密钥丢失、文件残留（清了 IndexedDB 未清 OPFS，或恢复的配置文件） | 受保护 | 无密钥的库文件视为孤儿：先删除再生成新密钥，绝不用新密钥打开旧文件 |
| 撤权（租约不再含该域） | 受保护 | 复用 0075 协调器路径：域按 epoch 退役并清空 |
| 浏览器"清除站点数据" | 镜像与密钥一并删除 | 这是预期行为，不是故障；下次登录重新拉取 |
| 非 secure context（例如经局域网 IP 访问 phoneweb） | 不落盘 | OPFS 与 `crypto.subtle` 在非 secure context 不可用；设置页显示"需要 HTTPS 或 localhost" |
| SharedArrayBuffer / COOP-COEP | 不需要 | 只使用 expo-sqlite 的异步 API；不提升页面隔离级别 |

## 4. 降级声明

以下任一情形，浏览器保持**在线读取**，不抛错、不弹窗，只在设置页"本地镜像"卡片给出原因：

| 原因码 | 触发 | 设置页文案 |
| --- | --- | --- |
| `insecure-context` | `window.isSecureContext === false` | 需要 HTTPS 或 localhost |
| `no-opfs` | `navigator.storage.getDirectory` 缺失 | 浏览器缺少 OPFS、IndexedDB 或 Web Crypto 支持 |
| `no-indexeddb` / `no-webcrypto` / `no-worker` | 对应全局对象缺失 | 同上 |
| `open-failed` | 运行期失败：IndexedDB 打不开、Worker/wasm 加载失败、开库或迁移失败 | 同上；本页面会话内保持在线读取，刷新页面重试。密钥与文件保留，不会因一次失败被抹掉 |

## 5. 部署要求（phoneweb）

- expo-sqlite web 以 `new Worker(new URL("./worker", location.href))` 启动 Worker，请求路径随当前路由变化。`scripts/build-web-sqlite-worker.mjs` 预构建 `public/worker.js` 与 `public/wa-sqlite-<hash>.wasm`（由 `npm run web:export` 自动执行）；`phoneweb-server.cjs` 把任何以 `worker` 结尾的路径映射到 `/worker.js`，并以 `application/wasm` 提供 wasm。
- 局域网 IP 访问是非 secure context：这是浏览器规则，不是缺陷。要在手机上验证落盘，需 HTTPS（例如 zrok 隧道）或桌面 `localhost`。

## 6. 离线冷启动身份（Sprint 0127）

用户 2026-09-27 决定：断网时冷启动，信任上次联网验证过的身份，最长 30 天。

| 项 | 原生 | 浏览器 |
| --- | --- | --- |
| 存什么 | `{baseUrl, accountId, user{id,email,name}, validatedAt}`；不含 Cookie | 同左 |
| 存在哪 | SecureStore `orbit.offlineIdentity.<baseUrl>`，`AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`，与会话 Cookie 同级 | IndexedDB `orbit-sync-keys`（与镜像密钥同库）；只在本地镜像可用（secure context 等）时写入，否则离线冷启动保持关闭 |
| 何时写 | 登录成功、联网冷启动校验成功、断网恢复后复核成功、在线时回前台且距上次校验超过 12 小时 | 同左 |
| 何时删 | 退出登录（第一步）、服务端明确拒绝（401/403 或 Auth.js 会话为空：停用、改密、撤销） | 同左 |

判定规则（`src/api/offline-identity.ts`）：

- **拒绝**：`/api/auth/session` 返回 401/403，或 2xx 的 JSON 里没有 user；`/api/account/me` 返回 401/403。清掉身份记录，再用换账号的清理路径（打开该账号作用域后 `setScope(null)`，带崩溃恢复标记）删除本地库和密钥，最后删 Cookie。
- **不可达**：网络错误、超时、5xx、404、2xx 但不是 JSON（例如强制门户页）。距 `validatedAt` 不超过 30 天就用缓存身份进入并打开该账号的本地库；超过 30 天或没有记录则进登录页，不删任何数据。
- 进入离线后每 10 秒、以及每次回到前台复核一次；联网后服务端拒绝则清空并退回登录页；仍不可达且已满 30 天则回登录页，不删数据。
- 界面语言：服务端确认过的语言偏好随身份一起存（同一存储、同一清除时机），离线时用它而不是设备语言。

已知限制：

- 设备时钟被往回拨可以延长 30 天窗口；本地没有可信时间源。
- 服务端校验用户状态时若数据库故障，Auth.js 也会返回空会话，客户端会按「拒绝」清空本地数据（数据在服务端仍在，重新登录后重新拉取）。
- 升级前已登录、升级后从未联网校验过的设备没有记录，第一次断网冷启动仍进登录页。
- 离线可读的内容还受服务端下发的离线读取租约约束（≤7 天）；租约过期后身份仍被信任，但本地数据会显示为锁定。

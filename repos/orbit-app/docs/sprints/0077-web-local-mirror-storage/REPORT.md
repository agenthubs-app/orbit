# Sprint 0077 — 执行报告

## 结果

**completed。** 五项 SC 均有同版本证据，功能已提交并以 `merge --no-ff` 合回 `chat-agent`。
唯一 run-01。批准契约为 [PLANNER.md](PLANNER.md) revision 1／SHA256 `c475686b…`（登记表）。

## 先用人话说

浏览器现在有了自己的本地镜像存储层：按 (服务器, 账号) 分库放在 OPFS 里，密钥是不可导出的 Web Crypto 密钥，
待办／个人日程的正文一律加密后落盘；换账号先抹掉上一个人的库，没密钥的库文件直接丢弃。任何一样能力缺失（非 HTTPS、
没有 OPFS 等）就退回"仅在线读取"，设置页说明原因，不报错。这一层**只是存储层**：本 Sprint 没有让任何 Web 业务屏幕从镜像读，
`/tasks` `/contacts` 仍走网络（0078 接线）。

途中抓到并修掉三个真问题：
1. **Web 入口缺少 `initializeLocalSyncDatabase`**：Metro 在浏览器把 `./local-sync-database` 解析到 `.web.ts`，它此前只有能力桩。
   拆出 `local-sync-database-core.ts`，两端入口都再导出它。
2. **Expo 序列化器把 Worker 共享模块抽进 `__common.js`**：`import("expo-sqlite")` 生成异步分块，与 sqlite Worker 分块共享的一个模块被
   抽到 `__common.js`，而 Worker 不会加载它（`Requiring unknown module "1635"`），且 expo-sqlite 的通道永不 settle，登录卡在"正在确认登录状态"。
   改为静态 import（模块留在主包，不再抽取），并给开库加 15 s 截止时限——Worker 起不来时退化为 online-only 而不是挂起。
3. **OPFS 路径名上限 64 字节**：`orbit-sync-<sha256 全长>.db` 触发 `sqlite3_open_v2` 失败；Web 库名改用 digest 前 32 位。

## 固定版本

| 内容 | 实际版本 |
| --- | --- |
| 基线 | `chat-agent` = `73b1b7c8b`；登记后 `91323df42` |
| 功能提交 | `6a76d41f1` feat(sprint-0077) |
| 合并 | `7fd5bf3f3` merge(sprint-0077)（`--no-ff`），`merge-base --is-ancestor` 退出码 0 |

## SC 映射与证据

| SC | 状态 | 证据 |
| --- | --- | --- |
| SC-0077-01 持久化镜像可用 | pass | `web-mirror-storage-browser.test.ts`（esbuild + Node 静态服务 + Playwright Chromium，1/1，约 5 s）：`setScope` 开 OPFS 库、`applyDomainPage` 写 2 条、刷新后 `listRecords` 读回同一批、digest 不变。phoneweb 真实运行：设置页开库成功（卡片"已启用"），网络里出现 Metro 产出的 `worker-*.js` 与 `wa-sqlite.*.wasm`，console 0 error（`sprint0077-phoneweb-settings-local.png`） |
| SC-0077-02 密钥不可导出、正文密文落盘 | pass | 浏览器测试：`crypto.subtle.exportKey("raw")` 抛 `InvalidAccessError`；直读 `sync_records.payload_json` 为 `orbit-aesgcm-v1:<iv>:<ct>`，不含明文字段；`payload-codec.test.ts` 4/4（往返、密文≠明文、同明文不同密文、错密钥／篡改／外来值拒绝）；`local-sync-repository.test.ts` codec 用例：putRecord／applyPage／applyDomainPage 三条写路径全部编码，`payload_hash` 仍是明文 SHA-256，无 codec 的仓库读不出 |
| SC-0077-03 隔离 | pass | 浏览器测试：换 actor → 新 digest、`withDatabase` 对 A 作用域返回 null；换 baseUrl → 第三个 digest；切回 A 时 A 的行已在切换时被 purge；删掉 IndexedDB 密钥后刷新 → 孤儿库丢弃、列表为空；登出 → purge，刷新后为空。撤权路径复用 0075 协调器（`sync-coordinator-lease.test.ts` 8/8 未改） |
| SC-0077-04 优雅退化 | pass | 浏览器测试三种注入：无 OPFS → `no-opfs`；非 secure context → `insecure-context`；IndexedDB 打不开 → `open-failed`（report `SYNC_CLEANUP_STATE_FAILED: quota`）；三者 `setScope` 均 true、`withDatabase` 均 null、console 0 error。phoneweb 经伪造非安全源 `http://lan-host.test`（Playwright 路由转发到本机 32111，服务端零改动）：卡片"本浏览器不可用（需要 HTTPS 或 localhost），数据仅在线读取"，不请求 worker／wasm（`sprint0077-phoneweb-settings-insecure.png`） |
| SC-0077-05 无回归与文档 | pass | App 全量 **3501/3501**（0076 收口 3495 + 6）；两端 typecheck 0（orbits 无改动）；phoneweb `/tasks` 在安全与非安全源下都仍请求 `/api/tasks`（`sprint0077-phoneweb-tasks-local.png`）；Simulator 待办页 52/12、"已是最新内容"（`sprint0077-sim-tasks.png`，原生不传 codec）；`docs/phoneweb/local-mirror-threat-model.md` 逐域列白名单理由，明确写"与原生保护不同"、同源脚本可解密、清站点数据即清库 |

## 与设计案／PLANNER 的偏差（如实）

- PLANNER 说 Worker／wasm 需要 phoneweb 静态服务补路径映射：实际 Metro（`assetExts` 加 `wasm` 后）自己产出 Worker 分块与 wasm 资源，只需补 `application/wasm` MIME；中途写过的预构建脚本与 `/worker` 路径映射已删除。
- 设置页卡片区分"已启用"（库已打开）与"支持"（仅能力探测通过）；本 Sprint 没有屏幕写镜像，卡片措辞是"将在本浏览器加密保存"。
- 运行期开库失败在本页面会话内保持 online-only（刷新重试），密钥与文件保留；与原生"失败不是登出"一致，但原生下次 `setScope` 会重试。
- 在 Node 测试进程里给 `expo-sqlite` 加了替身（`tests/helpers/stubs/expo-sqlite.js`）：其入口在加载时引用 Metro 全局 `__DEV__`。浏览器测试打包的是真模块。

## 命令与退出码

| 命令 | 结果 |
| --- | --- |
| `npm test`（App 全量） | 3501/3501，exit 0（`app-full-0077b.log`） |
| `npm run typecheck`（App） | 0 error |
| `npx tsc --noEmit`（orbits） | 0 error |
| `node --test … tests/web-mirror-storage-browser.test.ts` | 1/1，约 5 s |
| `npx expo export --platform web --output-dir dist` | exit 0；产物 `entry-*.js`、`index-*.js`、`worker-*.js`、`assets/…/wa-sqlite.*.wasm`，无 `__common.js` |
| `gitnexus_detect_changes(staged)` | 25 文件、risk low、affected processes 0 |

## 未提交项与其他端影响

- 未提交：仓库根目录既有无关改动（AGENT.md 等）、设计图 PNG、`.claude/skills/gitnexus/`——与本 Sprint 无关，未纳入。
- 原生：`local-sync-database.ts` 改为再导出 core、协调器多转发一个 undefined 的 `payloadCodec`，Simulator 待办页对照无差异。
- 部署：`metro.config.js` 新增（wasm 资源）；phoneweb 服务补 `.wasm` MIME。局域网 IP 访问是非 secure context，镜像不落盘——这是浏览器规则。

## 下一步

0078：Web 待办／个人日程屏幕接镜像（协调器已能在浏览器开库并按白名单绑定），`/api/sync/manifest` 客户端接线。

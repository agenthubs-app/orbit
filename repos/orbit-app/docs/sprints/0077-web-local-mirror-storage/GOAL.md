# Sprint 0077 — Web 本地镜像存储层与威胁模型

## 要实现什么

把浏览器接进 App 已经在跑的同一套镜像协议：Web 端的 `syncLifecycle` 不再是 online-only 桩，而是真的在浏览器里开一个
按 (server, actor) 分库的持久化 SQLite（expo-sqlite 的 wa-sqlite + OPFS），记录正文用 Web Crypto AES-GCM 加密后落盘，
密钥是 `extractable: false` 的 CryptoKey 存在 IndexedDB 里。协议、状态机、仓库、协调器全部复用 0033/0075 的代码，
新增的只有存储适配器、密钥管理、比原生更窄的可落盘域白名单，以及一份写清楚"浏览器不等于原生"的威胁模型。

## 做完能看到什么

- phoneweb 设置页多一块"本地镜像"状态：`local-mirror`（库已开、加密就绪）或 `online-only`（原因：隐私模式／存储被禁／不支持）。
- 换账号或换服务器 → 不同的库名与不同的密钥，互不可读；撤权 → 域镜像清空（复用 0075 协调器）。
- 试图导出密钥失败（`extractable: false`）；直接读 OPFS 文件看到的是密文。
- 隐私模式或 OPFS/IndexedDB 不可用时，页面不报错，静默退化为 online-only。
- 文档与 UI 文案不出现"与原生同等保护"。

## 怎么验收

真实 Chromium：先做一个可执行的 spike 证明 wa-sqlite + OPFS 在 phoneweb 的静态服务下能开库、写入、刷新后读回；
再用同一套 harness 验证密钥负例、换账号隔离、退化路径；App 全量与两端 typecheck；phoneweb 各页无回归。
Web 屏幕接入镜像读取是 0078 的事，本 Sprint 不改任何业务屏幕的数据源。

完整验收项和启动条件见 [PLANNER.md](PLANNER.md)。当前状态见[登记表](../README.md#sprint-登记表)。

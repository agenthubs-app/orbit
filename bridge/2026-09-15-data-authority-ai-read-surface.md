# BR-021 — 数据权威源与 AI 只读面

- 创建/更新日期：2026-09-15。
- 总状态：`consumer_ready`。
- 优先级：P1。
- 发起角色：Bridge / Web / App。
- 下一责任方及是否已接单：共同测试环境负责人；未确认已有可登录账号、数据库或授权 calendar provider。
- web_status：`source_ready`。
- app_status：`consumer_ready`。
- verification_status：源码、本地回归、typecheck、contract sync 与本地运行边界完成；真实账号、migration apply 和 calendar provider 未验证。
- 依赖/阻塞：数据库 URL、Auth.js secret、可登录测试账号、授权 calendar provider；migration apply 另受 dry-run 行数审阅 gate 约束。
- 设计/实现/发布授权来源：用户明确授权 B 线所有 epoch 的持续本地实现与验证；没有请求 merge、push、deploy，也没有批准跳过 migration review gate。

## 变化与证据

- 用户可见的旧行为 → 新行为：日程与 push device 不再由两套身份/记录链分别写入；Orbit AI 可按明确请求读取当前 actor 的笔记、待办、已确认关系跟进与 canonical 日程，并在 artifact 标明已读取/未读取数据域。
- Web 页面/服务/HTTP 路径及方法：现有 AI conversation/runtime 路径接入 `notes.query`、`tasks.query`、`followups.query`、`schedule.query`；日程写入统一进入 `personal_schedule_items` authority service；push reminder 通过 canonical device adapter。
- App 页面/消费点：通知 lifecycle、登录恢复、设置 opt-out 共用 SecureStore canonical device session；同步 `orbit-ai` contract 接受 `data_query` artifact。
- Web/App SHA：authority `c4a1beef2`，push `dd28ec473`，schedule `8c9e43015`，AI visibility/query `5fff469ab`，评估报告兼容 `18c4a9112`，证据为本提交。
- Schema/枚举：AI artifact 新增 `data_query`；data visibility manifest 登记 13 个 source。query schema 禁止模型传 actor/user/account/profile identity，limit 上限 10，未知/跨域字段直接拒绝。
- 对象范围：所有读取由服务端 actor 注入并在 repository/service 再次过滤；notes get 仅接受当前消息或同 actor 搜索结果解析出的 ID；followups persistent facts 与 review queue 使用不同 artifact/source。
- 刷新、缓存、异步任务与失败处理：query 输出有硬上限和 truncated 标记；未授权/跨 actor/无效 schema fail closed；App push migration 幂等，失败保留可重试状态。
- 旧 App 兼容：旧 push ID 一次性读出、撤销并清理；旧 endpoint 保留迁移/撤销窗口。旧 schedule source 只读兼容，不再接收新写入。

## 验收结果

- Web 定向：authority 3/3、push 15/15、schedule 22/22、AI 109/109；App push 42/42、AI 受影响回归 134/134；两端 typecheck exit 0，contract sync 一致。
- 全量与构建：Web 3124/3368 通过、49 失败、195 跳过，Sprint 0029 相关项全绿，剩余失败来自既有 runtime evidence、Event PostgreSQL、旧 contract export 与 password-reset 配置；App 2802/2803，唯一并发 UI 点击超时的失败文件隔离重跑 83/83；Web production build exit 0。
- Web 写 → App 回读：未运行。当前没有 Auth.js secret、可登录测试账号或数据库 URL；未登录 API 3/3 返回 401 JSON。
- App 写 → Web 回读：未运行，同上。
- 冲突、失败、权限与异步场景：版本冲突、幂等、actor isolation、任意 identity 注入、secret fields、大输出、旧 device ID、双 schedule source、取消/登出/账号切换均有自动化反例。
- 原生 UI/浏览器验证：Xcode 26.6 `xcodebuild` exit 0，独立 iPhone 17 Pro Max / iOS 26.4 完成安装与启动，Metro 打包 1938 modules，Orbit 登录页可见；Web 已验证重新启动后的未登录边界。真实账号 UI 仍受环境阻塞，截图见 [Sprint REPORT](../repos/orbit-app/docs/sprints/0029-data-authority-ai-read-surface/REPORT.md)。
- Provider：当前没有授权 calendar provider。宿主 DeepSeek key 不是 calendar 数据源；测试/构建显式清空模型 key，不以 mock 或未认证调用代替。
- Migration：fixture dry-run 分类通过；真实 CLI 因无数据库 URL 明确退出。没有受影响行数可审阅，因此没有执行 apply。
- 未检查范围：真实迁移行数/apply receipt、授权 calendar 对齐、真实 actor 的四域查询与 Web↔App 回读、远程部署。
- 客观关闭条件：提供上述共同环境；审阅 migration dry-run 行数后 apply；在同一 actor 下完成四域查询、artifact evidence、两端重开回读，并记录脱敏对象 ID、版本和 provider 读取结果。

## 更新历史

- 2026-09-15：A–E 源码交付；F 完成本地回归与 fail-closed 运行边界，登记外部环境关闭条件。

# Bridge 历史记录

## 2026-09-16 — Sprint0037

联系人消息独立，真实QA共同环境完成Web↔原生收发、重试去重和已读隔离；a591494b0已进入chat-agent，详见[BR-025](2026-09-16-contact-message-inbox.md)。保留全量失败与局部回归历史，不宣称远程发布或Push通过。

## 2026-09-15 — Sprint 0029 数据权威与 AI 只读面

- authority registry、push device identity、canonical schedule service 与四个 actor-scoped AI query tool 已按 A–E 轨提交；Web/App contract 同步。
- 自动化覆盖 canonical 唯一性、旧 ID/源迁移、日程 parity、actor 隔离、schema 注入、字段白名单、routing、bounded output 与 artifact evidence；完整命令和数字见 BR-021 与 Sprint REPORT。
- 当前环境缺数据库 URL、Auth.js secret、可登录测试账号和授权 calendar provider；migration 只完成 fixture 分类，真实 dry-run 明确退出，没有 apply。未登录 Web 边界保持 401。
- Xcode 26.6 原生构建成功，当前源码在独立 iPhone 17 Pro Max / iOS 26.4 完成安装启动，Metro 打包 1938 modules 并显示 Orbit 登录页；没有 merge、push、deploy 或远程数据库写入。

## 2026-09-07 — 建立首个 Web/App 状态基线

- 需求：由 Bridge 协调 Web 与 App 两位开发者，先理解两端现状，再建立状态交接目录。
- 范围：本地根仓库 `chat-agent` / `862cb54b4` 加已有 App 未提交变更。未访问远程部署/业务数据库，未做业务功能同步修改。
- 产出：README、当前状态、功能对齐表、数据契约边界、8 项同步队列、协作流程、任务模板、维护规则和 JSON 基线。
- 根目录 AGENTS.md 增加 Bridge 入口；按现有规则刷新了过期 GitNexus 索引（250.6 秒完成），工具更新了 AGENTS.md/CLAUDE.md 的索引统计。未修改业务符号。
- 核实：43 个 Web 产品路由、58 个 App 路由文件、199 个 API route 文件；同名入口缺口为 0，但 `/agent` 等同路径语义不同。15 个受控副本文件均一致。
- 发现：Today 业务集合不同；App 缺少 Web Agent 高级设置及部分历史操作；部分 HTTP 响应仍未纳入共享 DTO/Schema；普通资源没有全局实时失效同步；部分说明文档落后于代码。
- 进行中工作：App 74 个 tracked 文件及额外未跟踪主题/设计/测试内容原样保留；未把它们归入本次实现。
- 本轮验证：App 7 项同步/路由检查通过、全量 752 项通过；Web 定向 14 项通过；两端 typecheck exit 0。Node v25.8.1。本轮没有用 2026-08-31 图表截图或旧测试数代替现状。
- 发布边界：仅引用 2026-09-06 记录的 Web 全量 2,216 通过 / 21 失败 / 1 跳过及尚未完成的公网部署；不声称本轮复跑、解除发布门槛或远程状态已核实。
- 下一步：按 BR-001 开始 Today 能力/动作映射，再处理设置、历史、共享契约与跨端回读验收；本轮已完成盘点与目录建设，不代表这 8 项差异已修复。

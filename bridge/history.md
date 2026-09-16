# Bridge 历史记录

## 2026-09-16 — Production P0 修复与必要项收敛

- `6f844ea47` 修复 Web/Agent raw subject 与 canonical 账号混用及 query 搜索参数；Production iOrbit 数量与原有个人日程保存回读通过。
- `6597d8de8` 修正测试时区和旧 provider 结构断言；`40b63d218` 补 AI 查询事实回显，不增加业务写入或模型调用预算。
- 旧人脉任务保留 lifecycle outcome 语义，Web 可见性与两端实际处理分别验收。原生工具链、云端 event worker、笔记/提醒样本和新账号流程仍为具体开放项，不再要求不存在的历史源库。
- 最新证据和部署边界统一记入 [BR-025](2026-09-16-production-p0-fixes.md)，不把本地测试或一次发布当作整体目标完成。
- 收尾：`105ebba4d` / `dpl_2FjxtX314B6DRojeZvFbdDF8gTNh` 已发布为 Ready；正式站当前 66/历史 14、另一账号 0、AI 实际标题/状态回显与云端会话保存、个人日程回读通过。测试合成数据保留，没有清库或外发消息。

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

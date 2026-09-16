# phoneweb — 投资人手机浏览器体验

运行状态：ACTIVE。2026-09-16 用户批准“复用 Expo App 的浏览器版本、真实后端、独立演示账号、Sprint 并行”的推荐方案，并要求所有 session 使用 `phoneweb-` 前缀。

## 权威与隔离

- 主协调：`phoneweb-main`。执行线：`phoneweb-A`、`phoneweb-B`、`phoneweb-C`。
- 用户指定所有副执行线默认 `gpt-5.6-sol`，推理强度 `medium`。创建/继续任务时显式传入；不自行切换其他模型或强度。主协调不受此默认值覆盖。
- 产品基线：根仓库 `f416887dc5c545d799d04c5d2fc166aecb1bc912`。集成分支唯一为 `codex/investor-mobile-web`；主工作树 `.worktrees/phoneweb-main`。
- 原 A/B/C/D/E 线及 `chat-agent` 继续各自工作。不得重启、清理、切账号或写入它们的数据库/Simulator/端口。
- 本目录是 phoneweb 的唯一 Sprint 登记表；`PW-0001` 等是独立项目命名空间，不占用或改写 App 0001～0040 的运行记录。
- 沿用 `repos/orbit-app/docs/sprints/RULES.md` 的一个 Planner / 一个 Generator、影响分析、TDD、必要验证、显式失败和提交交接规则；本项目明确覆盖其集成目标 `chat-agent` 为 `codex/investor-mobile-web`。不新增 Evaluator 或实现子代理，不重新索取已批准设计/隔离工作区/执行方式的批准。
- 默认最多两个实施 Sprint 并行；每个独立 worktree 只有一个写入者。公共契约、认证、根布局和平台适配由 A 线持有，公共展示组件由 B 线持有，主协调不与其并行写这些文件。
- 工作分支以 `codex/phoneweb-` 命名；已有集成分支保留用户批准的名称。所有任务标题、进度和交接必须注明 phoneweb。
- 本地端口预留（启动前查占用）：Web/API 32100，统一浏览器入口 32110，A 开发入口 32111，B 32112。发现冲突分配新的空闲端口，禁止杀未知进程。
- 使用本项目专属合成账号/隔离数据库；不得从其他线复制真实业务数据或密钥。AI/OCR 继承现有总费用硬限制，费用账本未知时不调用付费 provider。
- 运行证据放忽略的 `build/phoneweb/` 或 `/tmp/orbit-phoneweb-*`，日志不得含 token/密码/个人对话。

## 设计与验收

[已批准设计](DESIGN.md)。初期交付在线体验；原生离线/推送等差异必须明示、逐项登记，不伪造与原生完全等价。推荐独立演示账号和示例数据，执行真实持久化业务逻辑。公开部署前主协调核实目标与授权；仅本地运行不记公网验收通过。

## Sprint 登记

| Sprint | 唯一目标 | Owner | 依赖 | 状态 |
| --- | --- | --- | --- | --- |
| [PW-0001](sprints/0001-browser-runtime/PLANNER.md) | 浏览器可构建、同源访问、正确恢复与退出会话 | phoneweb-A | 已批准设计与固定基线 | running |
| [PW-0002](sprints/0002-mobile-shell/PLANNER.md) | 手机布局、底栏、键盘与返回行为保留 App 体验 | phoneweb-B | 已批准视觉基线；与 A 文件不重叠 | running |
| PW-0003 | 全入口业务清单与真实在线链路验收 | phoneweb-C | PW-0001 固定 SHA、隔离 API 环境 | planned |
| PW-0004 | 图片/文件/分享等平台差异的必要适配 | phoneweb-A | PW-0003 的实际差异及前序固定 SHA | planned |
| PW-0005 | 公网发布候选和手机完整体验验收 | phoneweb-main | 所有必需业务证据、发布目标 | planned |

后续 Planner 按前序实际发现细化，不能预先标 ready 或填成功 REPORT。一次 run 的 owner、起始 SHA、Planner hash 和结果由本表或本 Sprint checkpoint 记录；最终状态只在本表。

## 当前边界

主线在 phoneweb 分支创建后继续前进。已发现 `0f9f2194d` 只登记 inbox source route 的基线测试修复；执行线如命中同一已知失败，应报出并由主协调选择固定提交整合，不修改测试期望来绕过失败。

未执行任何远程部署、真实投资人账号创建或生产数据迁移。现有设计资产与用户根规则修改均未带入本分支。

## 2026-09-16 启动记录

- 规划提交 `decd5005c`，首批两线均从该分支创建独立工作树，模型显式指定 `gpt-5.6-sol` / `medium`。
- phoneweb-A：任务 `01a0a879-e923-7701-8e39-935f36eab448`，工作树 `/Users/xzhao/.codex/worktrees/b941/orbit`，分支 `codex/phoneweb-a-runtime`，PW-0001 run-01 已开始。
- phoneweb-B：任务 `01a0a879-e8fe-77e3-b748-bd78005aecc8`，工作树 `/Users/xzhao/.codex/worktrees/9dd6/orbit`，PW-0002 run-01 已开始。
- Planner 路径纠正：AI会话实际位于 `src/screens/ai/AiConversationScreen.tsx`，B在自己的追加记录中说明，不改冻结SC。
- GitNexus首轮新工作树索引因Napi异常退出；第一次文档提交前detect_changes因未注册失败。已用git差异确认仅6份phoneweb文档，未把图检查记为通过；当前较小worker batch重试中。
- Homebrew Node22缺少simdjson动态库；独立 `npm exec --yes --package=node@22` 已验证22.23.2，未改系统运行时。
- phoneweb专属本地数据库 `orbit_phoneweb_20260916`，workspace `workspace:phoneweb-demo`，合成QA账号由既有种子工具创建，认证秘密只在忽略配置与受限临时文件中。首次完整种子在报名配置未发布处失败，已有部分样例记录；不能声称完整样例初始化通过。联系人独立种子及后端生产构建继续。

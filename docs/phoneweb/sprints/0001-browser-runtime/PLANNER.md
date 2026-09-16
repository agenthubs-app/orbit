# PW-0001 — 浏览器运行与会话

模式：existing-codebase / single-generator。Owner：phoneweb-A。基线：`f416887dc` 加本项目已提交规划。设计与执行已由用户批准，不重复问执行方式。读 `docs/phoneweb/README.md`、`DESIGN.md`、App Sprint RULES、Bridge status/handoffs 和本端 AGENTS。

## 文件归属

- 可改：`repos/orbit-app/package.json` / lockfile（只在确需时）、`app.config.ts`、Metro/Babel Web 构建配置、`src/api/**` 的浏览器 origin/会话适配、`src/data/**/*.web.ts`、必要原生模块的 Web adapter；对应直接测试；`scripts/*phoneweb*`；本 Sprint GOAL/PLANNER/checkpoint/REPORT。
- 根 `app/_layout.tsx` 仅 A 持有，B 不改。尽量不改公共 auth 算法；优先平台专用入口。构建发现的非白名单适配先记路径、原因及与 SC 关系，并核对 B 锁再做必要补充。
- 不改：`AppScreen.tsx`、`OrbitTabBar.tsx`、`AiConversationScreen.tsx`、`app/+html.tsx`、B 的新 Web 视口组件；任何 Next 业务源码、数据库、根登记表和其他线。
- 端口 32111 供 A 独立验证；目标主协调入口32110/API32100。不接管已有3000/8081服务。

## 契约与步骤

- [ ] 登记 run-01、起始 HEAD/diff、Planner SHA256；确认锁。使用独立 worktree，依赖按锁文件安装，不改别的 node_modules。
- [ ] 先运行当前 Expo Web 生产构建，把真实失败作为适配依据。配置目标为浏览器 SPA，刷新私有深链须正常回到同一路径；原生 scheme 不作为 Web OAuth 回调。
- [ ] 对改变的行为先 RED；GitNexus upstream impact 后实现。浏览器 API origin 默认同源；环境覆盖必须显式且有效，生产不能悄悄回退本机地址。设置页面不能把公开访问者引向内部开发配置。
- [ ] 实现最小可复用同源运行脚本：构建产物与 API 反向代理、SPA fallback、静态 MIME/路径保护、明确 upstream 配置、错误返回；不记录认证头、不新增认证旁路。只代理必要白名单，防开放代理。脚本与直接测试归 A。
- [ ] 浏览器会话复用现有后端；检查 Cookie、CSRF/Origin、恢复、过期、退出和回跳。无真实隔离后端时先验证受控 HTTP 行为并如实记录，交主协调完成 live 验收，不能把假接口成功计 live。
- [ ] 定向行为测试、App typecheck、Web 生产 export；受影响共享高风险在本地收口做一次必要集成检查，已知基线失败先定位并报告，不放宽断言。
- [ ] detect_changes 后显式路径提交，交固定 SHA 与 REPORT；不合入 chat-agent，不 push，不部署。

## SC（五项）

| SC | 行为 | 证据 |
| --- | --- | --- |
| 01 | 当前 App 生产 Web bundle 成功导出，无原生初始化导致的启动崩溃 | export 命令、浏览器打开登录页、console/runtime 错误记录 |
| 02 | 同源 API 请求不暴露 native token；配置错误明确失败 | origin/传输行为测试，bundle 配置检查 |
| 03 | 深链刷新、静态资源、API 错误各走正确路径 | 运行脚本黑盒 HTTP 测试含路径遍历/API失败，不把API错误返回index.html |
| 04 | 登录、恢复、退出、过期和未授权入口正确 | 受控行为测试；live项由专属账号/环境补齐，缺则单列 |
| 05 | 原生既有会话与数据边界未回归 | 受影响认证用例、typecheck，必要集成结果 |

失败按现有规则有界修复。无法运行 live 不阻止编译、适配和受控检查；仍有独立工作就继续。报告须分开 code delivered 与 SC completed，最终由主协调验证合并树后更新状态。

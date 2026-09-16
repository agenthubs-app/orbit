# Phoneweb 本地运行环境

2026-09-16，主协调拥有。本页记录实际运行与限制，不表示公网或实体设备验收。

## 固定范围

- 集成树：`.worktrees/phoneweb-main` / `codex/investor-mobile-web`。
- 后端产品代码仍为分支基线 `f416887dc`；后续 `decd5005c`、`46770a31e` 仅规划与既有测试清单修复。
- 运行时：独立 Node `22.23.2`，通过 `npm exec --yes --package=node@22 -- …` 使用。Homebrew Node22的动态库缺失不通过全局升级修复。
- `repos/orbits` 锁定安装306包，生产build成功（编译2.4min，TypeScript37.1s，48页生成）；服务监听 `http://127.0.0.1:32100`。
- 数据库：本机PostgreSQL18.3，专属 `orbit_phoneweb_20260916`；workspace `workspace:phoneweb-demo`。没有复制其他线业务数据库。
- 同源浏览器入口计划32110；A验收32111、B验收32112，使用前查占用。主协调不接管原3000/8081或其他线环境。
- 认证只在忽略的后端 `.env.local` 配置，演示凭据为权限0600的 `/tmp/orbit-phoneweb-20260916/qa-credentials.json`。不提交、不在日志打印。公开交付时须使用最终部署的独立账号，不能把临时文件路径当作投资人登录说明。

## 已发生的验证

| 检查 | 结果 | 限制 |
| --- | --- | --- |
| `/api/health` | 200 / live / ok | 仅健康，不等于所有业务provider可用 |
| 真实 `/api/auth/mobile/credentials` | 200 / success / Set-Cookie | HTTP链路；浏览器恢复/退出由A接着验 |
| account/me、bootstrap、contacts、notes、tasks、profile | 同一合成账号200 / success | 只证明这些读取成功，未证明写入或全部页面 |
| 联系人样例 | 独立seed成功：12联系人、36证据 | 合成样例，不是投资人真实数据 |
| 活动样例 | 既有live event seed成功：21记录 | 报名/运营需自己的配置和业务验收 |
| 运营专用样例 | 既有E2E seed成功：64有效参与者、70报名历史 | 没有生成或伪造推荐、桌位、图谱、签到结果 |
| App路由基线 | 初跑12通过/2失败；引入现有0f9f2194d修复后14/14通过 | 只修两个测试清单遗漏，不扩张历史原生截图验收 |
| GitNexus | 首次Napi异常；小batch重试467.1s成功 | 图检查首次失败已保留；后续detect_changes低风险、无受影响流程 |

首次完整QA种子在“报名配置未发布”处失败，已写入部分记录；随后独立联系人/活动种子成功，并通过既有E2E种子补齐运营配置。压力样例的后续重跑结果由协调者追加，不能倒写首次成功。

## 待验与外部依赖

- A的生产Web产物、同源入口与浏览器Cookie/深链验证。
- B的手机视口、键盘、导航和共享组件回归。
- 81入口业务检查及真实写入回读，见 `route-inventory.md`。
- 用户明确本轮先本地测试，后续自行上线Vercel等平台；本轮不部署公网。iPhone Safari、Android Chrome实体设备证据未取得，留在后续部署验收。
- 当前不提供付费AI/OCR key，不做付费调用。继承的总费用账本未核实，真实生成不能记为通过。
- 全局原生Push、原生加密离线数据库与浏览器当前online-only的差异仍待登记/验收。

## 复现（先核实进程所有权）

在本工作树 `repos/orbits` 以本项目受控 `.env.local` 执行：

```sh
npm exec --yes --package=node@22 -- npm ci --ignore-scripts --no-audit --no-fund
npm exec --yes --package=node@22 -- npm run build
OPENAI_API_KEY= DEEPSEEK_API_KEY= GOOGLE_API_KEY= GEMINI_API_KEY= ANTHROPIC_API_KEY= npm exec --yes --package=node@22 -- node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 32100
```

本页不授权另一个执行线重启服务；后端源码改变后由当前持有者重新build/启动并核实健康，再继续验收。浏览器脚本各自launch独立context，避免共用Playwright MCP的活页面。

环境修正：首次启动继承了宿主shell的DeepSeek/Google key（只检查存在性，未打印值）；已停止本线进程并以显式空变量重启，避免.env.local空值无法覆盖继承值。此前只执行健康、登录及已列读取，没有发起AI/OCR生成请求；不据此推断或重置历史费用账本。

压力样例在运营E2E seed成功后重跑仍因已发布报名配置缺项失败；停止该全量seed循环，保留部分数据事实。现有bootstrap真实读取有13项upcomingEvents、80项pendingTasks，联系人接口有78条记录，events接口25条；这些只是当前合成数据数量，不证明报名写入可用。

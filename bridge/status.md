# 两端当前状态

2026-09-10 保存进度集成：用户已接受 App 1389 通过/1 失败、Web 3134 通过/8 失败的当前版本，授权合并到 `chat-agent` 并普通推送；未完成验收不因此关闭。当前结果、远程输入和边界见 [集成交接](2026-09-10-chat-agent-integration.md)。下方 2026-09-07 数字保留为历史快照，不是当前测试或发布状态。

最后核实：2026-09-07，基于本地 HEAD `862cb54b4` 加当时的未提交 App 改动。精确采集时间与路径清单见 [快照](snapshots/2026-09-07-baseline.json)。

## Web / API

- 路径：`repos/orbits`；package 声明 Next.js 16.2.9、React 18.3.1，生产环境要求 Node 22。
- 同时承担 Web 产品 UI、HTTP API、认证、业务服务、数据库访问和 worker。Web 的 server page/route adapter 可以直接调用 `features/**` 的服务；部分交互也通过 HTTP。App 功能不会因 Web 页内新增一段服务调用而自动获得。
- `app/(app)/app` 中有 43 个精确 `page.tsx` 产品路由；`app/api` 中有 199 个 `route.ts` 文件。后者包括多种业务/内部/认证路由，不是 199 个移动端可调用操作，也不代表全部通过运行时验证。
- 最近已提交变化：移动人脉总览 API；共享 Schema；行业/语言字典隔离；Node 22 生产构建修复；测试类型零错误约束及数据库测试夹具隔离。
- 采集时 `repos/orbits` 无 Git 未提交项，但不能据此推断另一个开发者、其他工作树或远程没有进行中工作。
- 服务工厂支持 mock/hybrid/live。实际可用性仍取决于认证、模块配置、数据库、AI provider、worker 和部署状态；本轮没有读取密钥或访问业务数据库。

入口证据：[Web 规则](../repos/orbits/AGENTS.md)、[跨端契约说明](../repos/orbits/docs/cross-client-contract.md)、[发布记录](../repos/orbits/docs/operations/free-beta-launch.md)。

## App

- 路径：`repos/orbit-app`；package 声明 Expo 57、Expo Router 57、React 19，React Native 声明为 `latest`，实际安装版本应另查 lockfile；iOS 优先。
- 原生页面 → hooks/view-model → HTTP client → Web API。App 不在构建时导入 Web feature 源码，不直接连接业务数据库。
- 58 个路由文件含分组折叠、跳转入口及 legacy catch-all；Web 产品路由在移除 `/app` 前缀后均有同名入口。**同名仍可不同功能**：Web `/app/agent` 是 AI 工作区，App `/agent` 是建议动作页，App AI 主入口是 `/ai`。
- 已有账号登录、AI 会话与 Web 历史、人脉与分析、任务与日程、报名/取消、活动运营/审核/签到/角色、权限和通知相关实现。不能继续沿用旧 README 中“移动端不运行匹配/不改角色”等概括判断现状。
- 当前未提交改动：74 个 tracked 文件，主要覆盖主题 tokens、组件、各屏幕主题接入、AI 阅读界面和相关测试；另有未跟踪主题文件、测试、设计文档和 prototype。它们是正在开发的工作，不属于本轮 bridge 新增实现。
- `src/data/snapshot-store.ts` 用本地 SQLite 保存成功 GET 的快照，键为服务器 + 登录用户 + 路径。它是读取缓存，不是业务数据库副本或离线写入同步队列。
- `useApiResource` 在挂载/路径或身份变更/显式 refresh 时拉取；某些长任务页面另外轮询。没有从这些通用 hooks 看到全局跨端实时失效通知。另一端改数据后，当前屏幕可能要刷新才更新。

入口证据：[App 规则](../repos/orbit-app/AGENTS.md)、[客户端](../repos/orbit-app/src/api/client.ts)、[资源加载](../repos/orbit-app/src/hooks/useApiResource.ts)、[本地快照](../repos/orbit-app/src/data/snapshot-store.ts)。

## 本轮实际检查

执行环境 Node `v25.8.1`；这些结果不替代 Node 22 生产环境验证。

| 检查 | 本轮结果 | 能证明什么 |
| --- | --- | --- |
| App 契约/Schema/字典/路由检查 | 7 通过、0 失败 | 文件副本一致及 Web 子路由入口覆盖 |
| 独立路由盘点 | 43 Web / 58 App，缺少同名入口 0 | 含 Web 根页面；既有路由测试未单独覆盖根 page.tsx |
| App `npm test` | 752 通过、0 失败、0 跳过 | 当前工作树的测试基线；不是实机 E2E |
| App `npm run typecheck` | exit 0 | 全量类型检查 |
| Web `npm run typecheck` | exit 0 | 全量类型检查 |
| Web 契约与 mobile dashboard 定向测试 | 14 通过、0 失败 | 类型目录边界、Schema、actor 传递、部分失败和路由处理 |
| Web 全量测试 / 生产构建 | 本轮未执行 | 发布状态只引用下面带日期的既有记录 |
| 同账号 Web ↔ App 双向写入后回读 | 本轮未执行 | 仍需按模块完成业务验收 |

精确命令见 [协作流程](workflow.md)。上述 App 7 项包含在其 752 项中，不相加作为独立测试总数。

## 已知发布状态（既有记录，不是本轮重跑）

`repos/orbits/docs/operations/free-beta-launch.md` 在 2026-09-06 记载：Node 22 本地生产构建、基本生产冒烟、数据库备份恢复已通过；隔离数据库全量回归为 2,216 通过、21 失败、1 跳过。阶段 1C 尚未通过；远程数据库迁移、环境配置、Netlify 部署、worker 和 iOS 公网接入未完成。

本轮未联系远程服务，不确认这些远程状态此后是否变化。不得把本地源码或本轮类型检查通过写成“已上线”或“Web 全量回归通过”。

## 优先处理顺序

1. BR-001：厘清 Today 中哪些业务能力两端必须相同，明确映射与缺口。
2. BR-002 / BR-003：登记 Agent 高级设置和会话历史操作差异，确定移动端覆盖范围。
3. BR-004 / BR-005：收敛未共享 DTO 和跨端刷新/写入一致性验证。
4. BR-006：Web 发布门槛解除后再验收同一远程环境下的 App；不以此阻止本地对齐盘点。

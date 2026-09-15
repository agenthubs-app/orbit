# Sprint 0031 执行报告

## 结论

状态：`failed`。

run-01 完成了同环境 baseline、三项候选实现和两端真实采样，但冻结验收门槛没有全部通过：App 收件箱选中指标两次尝试均未达到 p50 改善 30%，Web 共享样式优化又在两次稳定性对照中造成未选页面 p95 回退。根据 DESIGN 的硬门槛和 RULES 的两轮修复上限，本次不能标记 completed，也不能通过修改统计口径或降低阈值制造成功。

失败的 App 窗口化与造成跨页回退的共享 CSS 优化均已用显式 revert 撤回。最终安全分支只保留可复用的脱敏测量基础，以及独立达标、仅影响 Agent 首屏的 Markdown 拆包。

## 运行身份与范围

- Planner SHA256：`791d3a4eae9081885755d6dfa90544a8d2bf842c00a791384af6bd19520e21a7`
- 计划提交：`1ed6e091b40ebdabc640d1c17a82f83acd00b629`
- 分支：`codex/b-line-sprint-0031`
- run：`run-01`，没有启动第二个 Generator run
- App：iPhone 17 Pro / iOS 26.4 Simulator，Release 构建
- Web：Next.js production build，隔离 PostgreSQL 与受控 QA 账号
- provider：所有自动性能命令均显式清空付费 provider key，付费调用为 0
- 原始环境：[environment.md](evidence/run-01/environment.md)

## RED → GREEN 与实现结果

### 测量基础

- RED：共享 performance sample、App recorder/runner、Web harness/Server-Timing 模块不存在；对应 contract、隐私字段、正式样本数量和 runtime SHA 测试失败。
- GREEN：`214d8d1a5`、`747ea2349`、`f1a5ae14b`、`0e84256e5`、`ffa9b62c0`、`35323d506`、`6d4928c70`、`c7a307aa2`、`eb0b6aef9`、`6280b6966`、`62531daf3` 建立两端测量、修正 Release/浏览器环境，并保证未启用时不分配测量状态。
- baseline：900 个正式样本，13 个场景，全部 cohort 为 10 次正式运行，0 failed；另有每场景 3 次预热。

### App 候选：收件箱初始窗口

- RED：40 条 conversation fixture 证明旧列表初始渲染全部记录。
- 第一次 GREEN：`17ab52e3b` 将初始窗口限制为 12 条并保留“显示更多”。Release 实测 p50 `33.2177 ms → 31.9889 ms`，只改善 3.7%，未达到 30%。
- 第二次 GREEN：`7da7e49dc` 将“全部”视图按类别限制为每类 4 条，仍保留全部可达。Release 实测 p50 `33.2177 ms → 33.1168 ms`，只改善 0.3%，再次未达标；未选 `app.schedule/app.resource` p95 同轮回退 32.1%。
- 处置：`c2b4bde21`、`581d3fe72` 撤回两次窗口化，产品列表行为恢复。

### Web 候选：共享样式静态化

- RED：Agent 与共享 override CSS 重复进入 SSR/RSC；选中 `web.agent/html_rsc_decoded_bytes` baseline p50 为 319,606 bytes。
- GREEN：`350bd3fba` 将重复样式改为静态资源；稳定样本 p50 为 88,046 bytes，改善 72.5%。
- 失败边界：两次稳定性对照均复现未选路径回退；最终一轮包含 contacts CLS p95 +102.6%、followups CLS p95 +313%、contacts navigation p95 +10.4%、profile navigation p95 +11.5%。
- 处置：`6a07e6627` 撤回共享样式优化。该 72.5% 结果只描述已撤回尝试，不代表最终安全分支。

### Web 候选：Agent Markdown 拆包

- RED：未打开消息面板时 Markdown/GFM runtime 仍进入 Agent first-load chunk。
- GREEN：`be17f6456` 把现有 renderer 移到 `next/dynamic` 模块；`closed_panel_eager_js_bytes` p50/p95 从 144,388 bytes 降到 0，改善 100%。
- 最终状态：保留。它只改变 Agent 未打开面板的加载边界，消息语义、请求与权限路径不变。

### AI busy 反馈

- controlled provider 10 次交互的 p95 为 `0.8 ms`，低于 150 ms；本地与 provider timing 保持分离，未发起付费 provider 调用。

## 验收契约

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-0031-01 | 通过 | [baseline.json](evidence/run-01/baseline.json) 共 900 formal / 0 failed；环境与 build SHA 见 environment |
| SC-0031-02 | 失败 | 两个 Web 候选在尝试构建中分别改善 72.5% 与 100%，App 两轮只有 3.7% 与 0.3%；未满足三个候选各 ≥30% |
| SC-0031-03 | 失败 | [summary.json](evidence/run-01/summary.json) 记录 App schedule 与 Web contacts/followups/profile 的 >10% p95 回退；相关产品优化已撤回 |
| SC-0031-04 | 通过 | AI busy p95 0.8 ms；controlled fixture；付费调用 0 |
| SC-0031-05 | 失败 | baseline/尝试构建完成真实 production Web 与 Release Simulator；最终安全回退 HEAD 已 production build、重启并 `live/ok`，但未形成可标 completed 的最终同环境三候选 runtime，也尚未合并主线 |

## 样本与统计证据

- [baseline.json](evidence/run-01/baseline.json)：原始 baseline 900 行
- [optimized.json](evidence/run-01/optimized.json)：第二次 App 尝试与 Web 尝试构建的 900 行；这些产品优化随后部分撤回
- [app-optimized-attempt-01.json](evidence/run-01/app-optimized-attempt-01.json)：App 第一次失败尝试
- [app-optimized-attempt-02.json](evidence/run-01/app-optimized-attempt-02.json)：App 第二次失败尝试
- [web-baseline-stability-attempt-01.json](evidence/run-01/web-baseline-stability-attempt-01.json) 与 [web-optimized-stability-attempt-01.json](evidence/run-01/web-optimized-stability-attempt-01.json)：Web 回退判定的稳定性对照
- [summary.json](evidence/run-01/summary.json)：冻结统计规则产生的 selected/comparison/failed-gate 汇总
- [selection.md](evidence/run-01/selection.md)：选择依据、拒绝候选和影响边界

## 验证

- App 全量：`2884/2884` pass，0 fail/skip/cancel，exit 0，203621.824333 ms；日志 `/tmp/orbit-sprint31-app-full.log`。
- App typecheck：exit 0。
- 最终共享 CSS 回退后 Web 定向：performance contract/harness/Server-Timing、Markdown split、Agent 视觉、reference style 共 `32/32` pass。
- Web typecheck：exit 0；先前 `ProcessEnv` 缺 `NODE_ENV` 的 TS2345 已由 `eb0b6aef9` 修复。
- 最终安全 HEAD `6a07e66271970b5138ba5173930444ff0bb75759`：Next.js 16.2.9 production build exit 0，webpack 编译、TypeScript、48/48 静态页和 build trace 均成功；同 SHA 的隔离归档构建以 PID `31461` 监听 3108，结构化 health 断言为 `live/ok`。
- Web 全量没有在最终安全 HEAD 重跑；本 Sprint 已由硬性能门槛失败，且全量 runner 包含外部/数据库敏感路径。没有把“未运行”写成通过。

## 变更与提交

从计划提交之后的实现序列：

`214d8d1a5 → 747ea2349 → f1a5ae14b → 0e84256e5 → ffa9b62c0 → 35323d506 → 6d4928c70 → c7a307aa2 → eb0b6aef9 → 6280b6966 → 17ab52e3b → 350bd3fba → be17f6456 → 62531daf3 → 7da7e49dc → c2b4bde21 → 581d3fe72 → 6a07e6627`

其中 `17ab52e3b`、`7da7e49dc`、`350bd3fba` 的产品行为已由后三个 revert 还原；历史提交保留真实实验轨迹。最终 evidence/report 提交是本报告之后的分支 HEAD，由协调者在合并记录中固定。

## 后续与文件释放

- 0031 保持 `failed`，不能在 README 或 Bridge 中改成 completed。
- 后续性能工作必须新建补充 Sprint；不得重开 run-01、修改本报告数据或降低 30%/10% 门槛。
- Sprint 0032 的依赖按 Planner 的“0031 完成或明确释放重叠文件”处理：本 run 已结束，`snapshot-store.ts`、`useApiResource.ts` 和 App build config 没有活跃写入者，现明确释放给 0032。
- 协调者只在最终 diff、merge-tree 和主线回归可接受时合并本分支；合并失败报告不等于宣称性能 Sprint 成功。

# Sprint 0067 — 执行报告

## 结果

**completed。** 五项 SC 均有同版本证据，功能已提交并合并回 `chat-agent`，合并树验证通过。
唯一 B／run-01，未启动第二次 Generator，未降低任何 SC。
批准契约为 [PLANNER.md](PLANNER.md)，revision 1／SHA256
`a6811df45ee4bbd47ba041da12b80d1c4c0768dea56fbe76db41ab8c34549dcd`。

## 先用人话说

做完之后，主线重新包含了 `www.orbitailink.com` 正在运行的那份源码 —— 在此之前两边从
`29efb4c9d` 起各走各的，主线上做的任何改动都到不了用户。

同时解决了一个真实的踩坑风险：主线原本有一个"把数据库切到本机"的开关，生产分支有一个
"生产必须钉死数据库主机"的围栏，两者改同一个函数。合并后围栏在最外层、开关在内层，
**在已钉死生产目标的环境里，无论用 `ORBIT_DATABASE_TARGET=local` 还是
`ORBIT_LOCAL_WORKSPACE_ID`，都会被明确拒绝**，不会悄悄连到别的库。

开发者现在在本机把 `ORBIT_DATABASE_TARGET` 设成 `local` 就能正常登录开发，
不再因为旧云端库被停用而卡在登录页。

**仍然不能做的事**：生产分支自己列出的四条工作流（完整分页、服务端聚合重设计、
跨端写入冒烟、逐域条件写入采纳）依然开放，本 Sprint 只做归位，没有接管它们的验收。
新 Vercel 项目没有 Git 关联，所以这次合并**不会**触发任何部署；未来发布仍须显式指定新项目。

## 固定版本

| 内容 | 实际版本 |
| --- | --- |
| 基线 | `chat-agent` = `8e5bd493a` |
| 计划登记提交 | `53e0640e5` |
| 被集成分支 | `origin/codex/production-cutover-read-write-20260917` = `161e9e6c4` |
| merge-base | `29efb4c9d` |
| 功能提交（merge commit） | `e2a0d6a37`，父提交 `53e0640e5` + `161e9e6c4` |
| 合并回主线 | `chat-agent` fast-forward 至 `e2a0d6a37`，29 文件／+838／−30 |

## SC 映射与证据

| SC | 状态 | 证据 |
| --- | --- | --- |
| SC-0067-01 主线包含生产源码 | pass | `git merge-base --is-ancestor 161e9e6c4 chat-agent` 退出码 0 |
| SC-0067-02 围栏与开关正确嵌套 | pass | `tests/storage/live-database-target.test.ts` 13/13；四组合逐条断言 + 两条"开关不能绕过钉死目标"反例；分支自带 `tests/capabilities/production-database-target.test.ts` 通过 |
| SC-0067-03 合并树可编译可测 | pass | `npm run typecheck` 0 error、`npm run typecheck:app` 0 error；本次带入的 9 个测试文件共 11 项全通过（其中 3 个 PostgreSQL 档跑在专用本机库 `orbit_sprint0067_test`） |
| SC-0067-04 本机 target=local 实际可用 | pass | 重启后的 Web/API（源码变更后按 RULES 5.4 重新启动）登录 302 + session 建立，`/api/contacts` total=78、`/api/tasks` 64 条 |
| SC-0067-05 集成方式合规 | pass | `--no-ff` merge commit `e2a0d6a37` 双父；`gitnexus detect_changes(staged)` = 86 符号／143 受影响／27 文件／CRITICAL，范围与白名单一致 |

## I 档集成检查：同环境前后对照

没有直接引用 0066 记录的 63 fail 基线（那是不同环境测得，不可比）。改为在同一台机器、
同一套 env 下，用 `chat-agent` 建临时 worktree 跑一次 merge 前全量，再与 merge 后对照：

| | tests | pass | fail | skip |
| --- | --- | --- | --- | --- |
| merge 前（`53e0640e5`） | 4154 | 3852 | 88 | 214 |
| merge 后（`e2a0d6a37`） | 4173 | 3870 | **86** | 217 |

失败集合逐项 diff：**零新增失败**（唯一文本差异是同一夹具文件的 worktree 路径不同）。
两项失败消失：

- `graph gated contact recommendation method uses feature-owned relationship retrieval`
  —— 由本分支「contact scope 区分存储 record key 与 payload domain ID」的修复带好；
- `actual Web 7a formal typography and footer stay usable in a long 390px page ...`
  —— 未定位到对应源码修复，不归功于本次合并，按环境相关波动记录。

原有 86 项失败保持披露，**不宣称全绿**。临时基线 worktree 已 `git worktree remove` 清理。

## 冲突解决的实际决定

唯一冲突文件 `repos/orbits/shared/storage/live-database-config.ts`。除机械合并外做了一处
**收紧**，需要单独记录：钉死校验的比较对象从原分支的 `readEnv(env, "ORBIT_WORKSPACE_ID")`
改为**解析后的 `workspaceId`**。原因是本地开关引入了 `ORBIT_LOCAL_WORKSPACE_ID` 覆盖路径，
若继续比对原始 env，该覆盖就能在钉死环境下生效而校验却看不到。此改动只会让围栏更严，
不放宽任何路径，已由两条反例断言固定。按 RULES 第 0 节以追加记录保留原 Planner 哈希。

顺序也写进实情：本次是先完成冲突合并、再补四组合断言，不是先 RED 后 GREEN。
合并本身是两份既有实现的机械组合；唯一新增行为（上述收紧）由反例断言覆盖。

## 未提交、影响与下一步

- 未提交：工作树中 `AGENTS.md`、`CLAUDE.md`、`repos/orbits/next-env.d.ts` 为用户/工具既有改动，
  全程未暂存、未覆盖。`.env` / `.env.local` 按既有忽略规则不入库。
- 其他端影响：`repos/orbit-app` 本次零改动，复用当日 `npm run typecheck` 通过证据，未跑 App 全量。
- 回退方式：`git revert -m 1 e2a0d6a37` 一条命令退出整次集成。
- 运行环境：本机 Postgres（`orbit_events` 开发库、`orbit_sprint0067_test` 测试库），
  全程未连接任何云端数据库、未部署、未改域名或 Vercel 配置。
- 预算：本 Sprint 无 AI/OCR 调用，累计账本不变。
- 下一步：Phase 0 第二项 **0068 集成 phoneweb 运行时基座**（21 文件，横跨 9 条分支，
  需先选定权威源分支）。

# Sprint 0068 — 执行报告

## 结果

**completed。** 五项 SC 均有同版本证据，功能已提交并合并回 `chat-agent`，合并树验证通过。
唯一 B／run-01，未启动第二次 Generator。批准契约为 [PLANNER.md](PLANNER.md) revision 2／SHA256
`4a9ee4a240a4383a10686e83a25e6da3a9444bf9792149fb8708b6ed13f79b0c`
（revision 1 `fa387ab1…` 因用户在启动后新增"每 Sprint 必须实跑"要求而升版，只加强不削弱）。

## 先用人话说

Phone Web 的运行时基座现在在主线上了。此前它只活在 phoneweb 线的 9 条分支里，主线一个字节都没有；
现在 `npm run web:export` 能从主线导出 13 MB 的 Web 产物，`npm run phoneweb:serve` 能把它以
SPA 方式跑起来并把 `/api/*` 代理到上游。本 Sprint 用真实 Chromium 在 phoneweb 上完成了登录、
读到 78 位联系人；同时 Simulator 冷启动确认原生没有被 `.web` 实现污染。

**归位时发现并补上的一处真实缺口**：主线有一个 phoneweb 线没有的守卫
（`tests/offline-read-inventory.test.ts`），要求每个 API 消费者都在离线读取清单里登记。
新文件触发了三条未登记项，已按守卫的既有约定处理，全量回到全绿。

**明确延后的三个文件**：`docs/phoneweb/vercel.example.json`、
`scripts/phoneweb-retime-events.cjs`、`scripts/phoneweb-retime-events.test.cjs`
是部署与测试数据助手，不属运行时基座，留待真要部署 phoneweb 时单独处理。这是决定，不是遗漏。

## 固定版本

| 内容 | 实际版本 |
| --- | --- |
| 基线 | `chat-agent` = `a0b1f088a`（计划登记后 `11c18c29d`，rev2 `744ed2870`） |
| 源分支 | `codex/phoneweb-a-runtime`（8 提交）、`codex/phoneweb-c-journeys`（9 提交） |
| merge 1 | `708a50095` merge(sprint-0068): integrate phoneweb web runtime adapters |
| merge 2 | `3fa710ee8` merge(sprint-0068): integrate phoneweb journey smoke scripts |
| 归位必需修复 | `3730ddb2f` fix(offline-read): register phoneweb consumers in the read surface inventory |
| 合并回主线 | `chat-agent` fast-forward 至 `3730ddb2f` |

## SC 映射与证据

| SC | 状态 | 证据 |
| --- | --- | --- |
| SC-0068-01 两条源分支成为主线祖先；18 个基座文件存在 | pass | `git merge-base --is-ancestor` 两条均退出码 0；18 文件逐一 `-f` 检查无缺失 |
| SC-0068-02 原生不被污染：App 全量零新增失败 | pass | 同环境对照：合并前 3433/3433 pass/0 fail/0 skip → 合并后 **3452/3452 pass/0 fail/0 skip**，exit 0。中间一次运行出现 2 项失败，处理见下节 |
| SC-0068-03 基座测试可跑；typecheck 0 | pass | 7 个新增测试文件 17 项 + `phoneweb-journey-support.test.mjs` 12 项全通过；`npm run typecheck` 0 error |
| SC-0068-04 未夹带 orbits 改动 | pass | `git diff --name-only a0b1f088a..HEAD -- repos/orbits` 计数 **0** |
| SC-0068-05 运行时验收（phoneweb + Simulator） | pass | phoneweb：`web:export` exit 0（13 MB dist），`phoneweb:serve` 监听 32111、`/api/health` 代理返回 live；真实 Chromium 登录成功跳 `/profile?complete=1`，`/contacts` 渲染 78 位联系人、筛选条与底部 tablist，console 0 errors。Simulator：冷启动首页 14 待办、会话保持 |

## 中间失败与处置（如实记录）

合并后第一次 App 全量出现 2 项新增失败：

1. **`the actual native consumers all have explicit versioned policies`** —— 真实缺口，非波动。
   守卫报出 `browser-auth.ts` 的 `GET /api/auth/csrf`、`POST /api/auth/callback/credentials`
   未登记，以及 `batch-image-source.web.ts:34` 的 `fetch(input.uri)` 路径无法解析。
   源分支根本没有这个守卫（测试文件在那边不存在），所以是归位必须补的登记。处置：
   - 两个真实端点登记进 `route-domain-inventory.ts`；策略由既有规则自动推导，`/api/auth/`
     前缀得到 `online_only_secret` + `never_local`，正是认证密钥应有语义。
   - `batch-image-source.web.ts:34` 读的是浏览器本地 `blob:` object URL，不出网、没有 API 面。
     塞进 `computedPathFamilies` 等于伪造端点，故在审计工具新增 `nonApiTransportSinks` 窄豁免：
     沿用既有 `file:line` 约定，必须写明实际访问什么；并带 `!evaluatedPaths.some(p => p.includes('/api/'))`
     保护，同一行若真出现 API 路径仍会被拦。守卫测试 21/21。
2. **`calendar navigation and confirm actions retain forty-four-pixel touch targets`** ——
   断言值 `43.99993896484375` vs 44，headless Chromium 在全量负载下的亚像素测量。单独跑两次 6/6，
   修复第 1 项后重跑全量未再出现（3452 全绿）。按波动记录，不归因于本次合并，也不改断言。

## 顺带发现（不在本 Sprint 修）

`npm test` 的 glob 只匹配 `tests/**/*.test.ts` 与 `.test.tsx`，
新带入的 `tests/phoneweb-journey-support.test.mjs`（12 项）**在全量里静默不跑**。
本 Sprint 已单独执行确认全绿，但这是一个测试基础设施缺口，建议在 0070（量尺）里一并处理。

## 权威源判定（执行前已完成）

六条候选分支核心运行时文件组合 SHA256 相同（`1309e04d531cd034`），互无祖先；
`consume-0052` 276 文件、`a-0010` 79 文件（含 16 个 AI artifact 改动），
`a-runtime` 38 / `c-journeys` 32 且 orbits 侧零改动。选后两条。判定过程见 PLANNER。

## 冲突解决

- `tests/app-wide-route-coverage.test.ts`：两侧同语义（跳过根目录 `+html`），取分支侧的函数参数写法，
  调用点 `scanAppRouteEntries(appRoot)` 运行时等价，函数自包含更正确。
- `docs/phoneweb/sprints/0001-browser-runtime/REPORT.md`（add/add）：a-runtime 版是严格超集，
  多一节「WebKit 会话复验」的如实记录，取超集不丢记录。

## 未提交、影响与下一步

- 未提交：`AGENTS.md`、`CLAUDE.md`、`repos/orbits/next-env.d.ts` 为用户/工具既有改动，全程未暂存。
- 其他端影响：`repos/orbits` 零改动，复用 0067 证据。
- `detect_changes`（compare 对 chat-agent）：50 符号 / 54 文件 / LOW / 0 受影响流程。
- 回退方式：`git revert -m 1 3fa710ee8`、`git revert -m 1 708a50095`、`git revert 3730ddb2f`。
- 运行环境：本机 Postgres `orbit_events`；Web/API 127.0.0.1:3000（合并后源码）；
  phoneweb 127.0.0.1:32111；Simulator `DA432E9E`。全程未连云端、未部署、未公网发布。
- 预算：无 AI/OCR 调用。
- 下一步：Phase 0 第三项 **0069 集成 sprint-0033 增量同步存量**（22 文件，27 文件冲突面）。

# Sprint W0024 — 执行总结

改了哪些文件看 git diff（`app/(app)/app/events/page.tsx`、新测试 `tests/pages/app-events-registration-actor-id.test.tsx`），这里不逐文件复述。

## 结果

对应 [GOAL.md](GOAL.md)。

- **已验证能做到：**
  - 已登录用户打开活动页，「已报名」标记和「我的活动」（`scope=registered`）都按账号 id 读本人报名，与报名接口写入口径一致。账号 id 与会话 id 不同时，记在账号 id 下的报名显示「已报名」；只记在会话 id 下的旧数据不算。legacy 投影和 canonical 报名两条路径都成立（SC-01）。
  - 账号只解析一次，而且仍在活动目录读取成功之后；报名读取和社群卡片共用这个结果。未登录、目录未配置、目录读取失败时都不解析账号、不读本人报名；账号解析不到时不改用会话 id，页面照常渲染成未报名、未加入（SC-02）。
  - 未登录活动页、社群卡片、活动顺序没有变化；3001 上 verify-plan 的活动页（桌面 1440、手机 375）显示验收活动「已报名」，「我的活动」里能看到，控制台 0 错误（SC-04）。
- **没有达到：** 返回字节增量超过上限。按 PLANNER 假设（1000 人、全部账号 id ≠ 会话 id、每人每天打开 1 次、每人 5 场有效报名）估算月增量约 **311–383 MB**，上限是 30 MB（SC-03 failed）。按 PLANNER 约定：功能提交保留，**不合并**，交用户裁决。

## 运行记录

- 结果：**failed**（SC-03 超上限；其余 SC 通过）。用户裁决 D18：先合并，流量由 W0028 在发布前解决
- Generator：Claude Opus 5.5／2026-09-29；Planner revision 2，`PLANNER.md` SHA256 `93cc80566ea72d858c1d2238989fd3f62e329070537970179d018baad07e0c7c`；run-01
- 基线：`chat-agent` `eb1910a8`；分支 `sprint/W0024-events-registration-actor-id`；功能 SHA `21beec29`；`chat-agent` 合并 SHA：见登记表（按 D18 合并）
- 档位 H；全量对照：基线 5685 个测试／失败 80，HEAD 5694 个测试／失败 80，新增失败 0（详见下文）
- 付费 AI 调用 0；未 push、未部署、未碰生产库
- REPORT 由协调者按 Generator 交回的正文落盘

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-W0024-01 | pass | 新测试前 4 个用例（legacy／canonical × 账号 id／会话 id），断言 `youRsvped` 与 `stats.youRsvped`，并用真实 `EventsList` 渲染 `scope=registered` 看可见结果。RED：`01-red.txt`（改前 6 失败 3 通过，通过的 3 个是未登录与目录失败的守护用例）；GREEN：`02-green-targeted.txt` |
| SC-W0024-02 | pass | 调用日志：登录 `catalogue:read → actor:<会话 id> → registrations:legacy:<账号 id> → registrations:canonical:<账号 id> → community:<账号 id>`；未登录 `catalogue:read → community:-`；目录未配置 `[]`，`read()` 抛错 `[catalogue:read]`（这两种都是账号解析 0、报名读取 0）；解析为 null 时 `catalogue:read → actor → community:-`，报名读取 0，页面正常渲染 |
| SC-W0024-03 | **fail** | `04-measure.txt`，脚本 `measure-events-registration-bytes.ts`（在证据目录，不进仓库）；表格见下 |
| SC-W0024-04 | pass | 定向集 39/39，0 skip（`02-green-targeted.txt`）；`npx tsc --noEmit -p .` 退出 0（`03-tsc.txt`）；浏览器 `06-browser.json` + `events-{all,registered}-{1440,375}.png`；全量对照新增失败 0 |

证据目录：`~/orbit-sprint-evidence/web/sprint-W0024/run-01/`。

### SC-03：语句数与返回字节（本机实测）

口径同 `scripts/measure-plan-read-traffic.ts`（W0017／W0021），即每条语句返回行的 JSON 字节之和。在临时 schema 里测，目录 13 场活动；报名记在账号 id 下，改前按会话 id 读，改后按账号 id 读。

**语句数（登录后每次打开活动页）：** 改前改后相同。
- 账号解析 1 次。改前也是 1 次，只是排在报名读取之后，只给社群卡片用。
- 本人报名读取：legacy 投影 1 条，canonical 1 条。
- 报名窗口每场 1 条，共 13 条，与用户 id 无关。
- 页面层的调用次数由 SC-02 测试证明。

| 有效报名 | 路径 | 改前（会话 id） | 改后（账号 id） | 单次增量 |
| --- | --- | --- | --- | --- |
| 1 场 | legacy 投影 | 1 条／0 行／0 B | 1 条／1 行／2,073 B | +2,073 B |
| 1 场 | canonical | 1 条／0 行／0 B | 1 条／1 行／2,552 B | +2,552 B |
| 5 场 | legacy 投影 | 1 条／0 行／0 B | 1 条／5 行／10,365 B | +10,365 B |
| 5 场 | canonical | 1 条／0 行／0 B | 1 条／5 行／12,760 B | +12,760 B |
| — | 报名窗口（13 场） | 13 条／1,180 B | 13 条／1,180 B | 0 |

**月增量估算**（1000 人 × 每天 1 次 × 30 天，每人 5 场有效报名，全部账号 id ≠ 会话 id）：

| 5 场报名的分布 | 单次增量 | 月增量 | 上限 |
| --- | --- | --- | --- |
| 全在 legacy 投影 | 10,365 B | ≈ 311 MB | 30 MB |
| 全在 canonical | 12,760 B | ≈ 383 MB | 30 MB |

30 MB／月折合每次打开约 1,000 B，而一行报名（含参与者画像）就有 2.0–2.6 KB。所以在这组假设下，只要还是整行读取真实报名，哪种分布都会超上限。

说明：账号 id 与会话 id 相同的用户（例如 verify 账号）改前就已经返回这些行，增量只落在两者不同的用户身上。真实增量随这类用户人数线性变化，PLANNER 假设按全部 1000 人计。

## 全量基线对照

- 用 `git archive` 把 `eb1910a8`（基线）和 `21beec29`（HEAD）导出到临时目录，两份副本对称跑，不动工作树。
- 环境：`ORBIT_EVENT_DATABASE_URL=postgres://<user>@localhost:5432/orbit_test`，先跑 `scripts/assert-local-test-databases.mjs` 通过；没有 source `.env`。
- 排除 `tests/pages/event-registration-readback.test.tsx`（基线上就会挂起）。

| | 测试数 | 失败 | skip |
| --- | --- | --- | --- |
| 基线 | 5685 | 80 | 284 |
| HEAD | 5694（+9 为新测试） | 80 | 284 |

- `comm` 对比失败清单：新增 0，修复 0。
- 失败数高于常见的约 30，是因为导出副本里没有 `.env.local`、未跟踪文件和兄弟仓库。两边条件一致，不影响对照。
- 本 Sprint 相关的活动页测试 0 skip。

## 假设与额外阅读

- 上下文包之外读了这些文件：
  - `features/community/service-factory.ts` 里 `readCommunityJoinedForActor` 的实现：确认 actorId 为空时不读。
  - `tests/pages/app-events-community-card.test.tsx`、`tests/pages/app-events-live-route-services.test.ts` 对页面源码的正则：前者要求 `readCommunityJoinedForActor({ actorId: communityActor?.id })` 原样存在，所以共用的 actor 沿用变量名 `communityActor`。
  - `app/(app)/app/orbit-landing-route-view-model.ts` 的目录快照类型：新测试用真实视图模型。
  - `features/events/registration/storage/live-record-provider.ts`、`features/events/event-operations/storage/canonical-registration-repository.ts` 两条按用户读报名的实现，以及 `tests/services/event-operations-canonical-registration.test.ts` 的 canonical 报名造数方式：测量用。
  - `scripts/verify-session-cookie.ts`、`scripts/verify-server.sh`、`scripts/seed-verify-accounts.ts`：浏览器验收用。
  - `scripts/run-node-tests.mjs`：跑全量用。
- **GitNexus：**
  - `AppEventsPage` 的 upstream impact 是 UNKNOWN（0 调用方，索引落后 15 个提交）。文本搜索确认它只由 Next 路由加载，另有两个测试读页面源码。
  - 暂存区 detect-changes 只动了 `AppEventsPage` 一个符号，risk high：该页面是 9 条执行流的入口，属于预期（`05-detect-changes-feature.txt`）。
- 账号解析为 null 时社群卡片 `signedIn=false`：沿用改前行为（`Boolean(communityActor)`），没有改。
- legacy 投影的 `listRegistrationsForUser` 读的是该用户的**全部**报名记录（不按活动 id 过滤，读出后在内存里筛），所以真实用户报名越多，这一路的字节越大。
- 3001 验收 server 正常（curl 200），直接使用，没有重启，也没有另起临时 server。

## review 处理（仅 H 档）

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| Codex `codex review --base chat-agent`（全文 `codex-review.txt`）P1：活动页每次打开都整行读报名，按报告测量超 30 MB 上限，应先改成只读 eventId／status 的轻量查询再切换账号 id | 成立，与 SC-03 同一问题 | 用户裁决（D18）：先合并本修正，另开 W0028 裁剪报名读取返回列，W0028 必须在 W0019 发布前完成 |

## 交接

- 活动页本人报名读取的口径：`resolveAuthenticatedApiActorFromSession` 返回的 `actor.id`，与 `/app/agent`（W0018）一致；解析不到时不读本人报名。
- **需要用户裁决（SC-03），二选一：**
  - (a) 接受增量上线（按 PLANNER 假设约 311–383 MB／月，真实值随账号 id ≠ 会话 id 的用户数线性变化），协调者合并 `21beec29` 和 REPORT 提交。
  - (b) 另开 Sprint 裁剪 `readRuntimeEventRegistrationStates`／`listRuntimeEventRegistrationsForUser` 的返回列（活动页只需要 eventId 和 status），裁完再合并本分支。
  - 本 Sprint 按 PLANNER 不做裁剪。
- 活动详情页 `/app/events/[id]` 的同类问题已登记为 W0027，本 Sprint 没有碰。
- 回退方式：本分支没合并，不合并就没有影响；如果已合并，revert `21beec29` 即可。

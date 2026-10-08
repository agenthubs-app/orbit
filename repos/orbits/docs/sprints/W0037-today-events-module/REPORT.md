# Sprint W0037 — 执行总结

## 结果

对应 [GOAL.md](GOAL.md)。

- 已验证能做到：
  - 首页「今日要事」在「还有 N 件」之后、追问条之前出现活动小模组。今天没有要事时展开：没加入社群时是紧凑社群卡加活动池的前 2 场，已加入时是前 3 场。有要事时只剩一行「本周还有 N 场适合你的活动 →」（按东京周一到周日算，N=0 时不显示）。要事和活动池都读完才渲染，不会先闪出卡片；部分来源读不到但没有要事时也展开。（SC-01）
  - 活动卡写日期、星期和开始时间（与已报名栏同一格式），还有标题、地点和推荐理由。标题跟随首页语言，日文界面落到英文；地点用来源原文，有才显示；推荐理由分计划、目标、近期三种。整张卡是详情链接，没有报名按钮，也没有费用行。（SC-02）
  - 紧凑社群卡有群名、微信号（标「占位」）和「复制」，剪贴板不可用时改为选中文本。「看二维码」展开一个标「占位」的虚线框。「我已加入」立刻收起社群卡并补上第三场，只发一次 PUT。失败、`joined` 不为 true、网络错误和 401 都会撤回，并在 `role="status"` 里说明。（SC-03）
  - 示例首页的小模组固定展开，用真实活动和真实社群状态。点活动卡直接进真实详情，不弹「这是示例」；「我已加入」真的写入。服务端示例分支只多读一次社群状态，读不到按未加入处理。（SC-04）
  - 「已报名活动」栏只列报名。社群行、第 4 步行和「看看推荐 →」都不再出现。（SC-05）
  - 3001 上走通了三个账号：verify-plan（有事，N=0）、verify-legacy（空日：未加入 → 点「我已加入」→ 显示三场）、verify-new（示例期）。桌面 1440 和手机 375 各看过一次。
- 仍未实现或未验证：
  - 浏览器里没看到「本周还有 N 场」那一行。本机库这周（10/1 周四到 10/4 周日）没有可报名活动，N=0，按 W37-2 不显示。这一行在组件测试里验证过：N=3 的中英文案，以及 N=0 时隐藏。
  - 活动池本身、月历圆点和右栏不在本 Sprint 范围，分别归 W0036 和 W0038。

## 运行记录

- 结果：completed（等待协调者合并）
- Generator：Opus 5.5／2026-10-01；Planner revision 3（SHA256 `1d31e2b4d38c5bcc66b08c0567af4cef85bb4f3646ec1450bd9e49122b74028f`）
- 分支 `sprint/W0037-today-events-module`，基线是 `chat-agent` `c6965bef`（已含 W0035 `3dc60dc4` 与 W0036 `31267c09`）。功能提交 `18d02ae1`；`chat-agent` 合并 SHA 等待协调者。
- 档位 H。全量对照按 RULES §5.2，不 source `.env`。功能已经提交，没法用 stash，所以先把本 Sprint 的路径临时换回 `c6965bef` 跑基线，跑完再换回 HEAD。结果：基线 6141 项、9 项失败；改后 6154 项、9 项失败；两份失败清单一致，**新增失败 0**。日志在 `full-baseline.log`、`full-after.log`、`fail-*.norm.txt`。
- 收口定向集 15 个文件，248/248 通过，skipped 0（`targeted-1.log`）。范围是首页、示例页、`app-events-community-card`、两个 ratchet、`app-home-demo-localization`，以及 `demo-persona` 和壳的其他直接消费者。定向集里没有 PG 用例；`assert-local-test-databases` 已通过。
- `npx tsc --noEmit -p .`：源码 0 错误。只剩 `.next/types/validator.ts` 的 8 条既有错误（过期生成文件）。
- 付费 AI 调用 0 次。未 push、未部署、无迁移。
- 证据目录 `~/orbit-sprint-evidence/web/sprint-W0037/run-01/`：截图 01–07、impact、detect-changes、社群读取实测、全量日志、Codex review 全文。

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-W0037-01 判定与位置 | pass | `tests/pages/app-agent-iorbit-home.test.tsx` 的 W0037 组覆盖了：空日展开，位置紧挨追问条之前；未加入 2 场、已加入 3 场；池 0／1／5 场；已加入且池空时整块不渲染；有事时只剩一行（中英文），N=0 隐藏；计划或 snapshot pending 时不渲染，计划读完后出现；partial 且无事时仍展开。`countHomeEventsThisTokyoWeek` 测了东京周日 23:30 和下周一 00:10 两个边界。截图 01（有事 N=0）、02（空日展开） |
| SC-W0037-02 活动卡 | pass | 直接测 `formatHomeEventReason`：三种理由、中英文、目标只取前 2 个 token。卡片测试覆盖 zh（已知 id 显示中文标题）、en、ja→en、未知 id 显示原标题、地点原文、缺地点；卡内没有按钮、没有费用文案、没有 onClick；计划和目标理由能接到卡上。截图 02、05 |
| SC-W0037-03 紧凑社群卡 | pass | 组件测试覆盖：群名、微信号与「占位」；复制成功和剪贴板不可用两种情况；`aria-expanded` 与「占位」虚线框；乐观更新，连点只发 1 次 PUT；5xx、`joined:false`、抛错、401 都回滚，`role="status"` 文案正确；按钮类名是 `btn ir-te-*`，在 `NEW_BUTTONS` 里中和；新文件没有内联样式。button ratchet 和 scale ratchet 通过。`CommunityCard` 和它的测试相对 `chat-agent` 0 改动（`community-card-unchanged.txt`）。截图 03（二维码占位）、04（加入后显示三场，PUT 返回 200） |
| SC-W0037-04 示例首页 | pass | `tests/pages/app-agent-guide-demo-page.test.tsx`：`REAL_BUSINESS_READS`／`DEMO_FORBIDDEN` 去掉了 `community`；示例期社群恰好读 1 次，参数是 `{ actorId: "account:canonical" }`；`home`、目录、本人报名仍各 1 次；`events`／`registrations`／`plan-read`／`registered-any` 仍是 0 次；示例壳的 props 相对 W0036 只多了 `communityJoined`；全部真实读取都抛错时示例照常渲染，`communityJoined=false`。首页组件测试：示例期固定展开；真实活动链接不被拦截；挂载时 0 请求（`/api/account/me` 除外）；「我已加入」只发 1 次真实 PUT，不弹拦截；`communityJoined` 透传到 `IOrbitHome`；`demoEventCandidates` 为空时没有活动卡。截图 07。浏览器里示例期 PUT 返回 200，点卡进入 `/app/events/ORBIT-VERIFY-UPCOMING`，没有拦截层。预算见下表 |
| SC-W0037-05 已报名栏与回归 | pass | W0003 的旧断言改写成新设计的一条用例「已报名栏只列报名」，覆盖两种社群状态。W0035 的用例改为断言没有社群行和「看看推荐」。定向集、tsc、两个 ratchet 都通过。3001 上看了：verify-plan 有事（截图 01）；verify-legacy 空日（截图 02–04 桌面，05–06 手机 375，无横向滚动）；verify-new 示例（截图 07）。控制台只有既有的 `/api/inbox/summary` 503 和 dev HMR websocket 报错，没有应用错误。verify-legacy 和 verify-new 做过「我已加入」，都已 `--reset`，复测是未加入；verify-plan 只看没写 |

### 示例期调用矩阵（相对 W0036）

| 读取 | 操作级调用（前 → 后） | 底层语句 |
| --- | --- | --- |
| 引导状态 | 不变 | 不变 |
| 复合 home（示例判定用，不注入示例壳） | 1 → 1 | 既有，未变 |
| 公开目录 `readRecords` | 1 → 1 | 2 |
| 本人报名 | 1 → 1 | 1 |
| **社群状态 `readCommunityJoinedForActor`** | **0 → 1** | **1**（`orbit_records` 按主键查，`limit 1`；未加入返回 0 行 0 B，已加入 1 行 624 B） |
| `events`（canonical id）、报名状态、计划、`registered-any` | 0 → 0 | 0 |

客户端请求：示例首页挂载时仍是 0（顶栏既有的 `/api/account/me` 除外）。只有用户点「我已加入」时才发 1 次 PUT。

### 数据库月预算（接 W0036 SC-06，W0017 口径：返回行 JSON 字节）

在本机验收库实测，结果在 `sc04-community-measure.json`；测量脚本放在仓库外的 scratchpad，没提交。一次社群读取是 1 条语句：已加入 624 B，未加入 0 B。下表保守按已加入的 624 B 计。

| 行 | 口径 | 10% | 20% | 100% |
| --- | --- | --- | --- | --- |
| ① 基线 | W0029 总账 | 1,106.83 MB | 1,106.83 MB | 1,106.83 MB |
| ② 示例期近期活动 | W0036 | 49.87 | 49.87 | 49.87 |
| ③ 无目标兜底 | W0036 | 59.84 | 119.69 | 598.44 |
| ④ **示例期社群（W0037 实测，替换 3 MB 占位）** | 624 B × 10 次 × 1000 新用户 | **6.24** | **6.24** | **6.24** |
| ⑤ SC-07 计划活动补查 | W0036；当前 0 | 0 | 0 | 0 |
| **合计** | | **1,222.78 MB** | **1,282.63 MB** | **1,761.38 MB** |

- 判定线 1.6 GB（D39）：10% 和 20% 两档在线下。100% 档本来就超，W0036 已登记为 D32 风险；本 Sprint 让它多了 3.24 MB，超出量从约 158 MB 变成约 161 MB。按 D38／D39 只登记，没有取消兜底。

## 假设与额外阅读

- 额外阅读（读之前都用 GitNexus 或文本搜索查过调用方）：
  - `features/community/service-factory.ts`、`membership.ts`、`contract.ts`：社群读取的口径和测量。
  - `features/agent/home-event-pool.ts`。
  - `events-0918/events-model.ts` 的 `eventDetailHref`。
  - `_demo/demo-mode-core.tsx`：确认拦截层只在调用 `guardWrite` 时出现。
  - `scripts/seed-verify-accounts.ts`、`verify-session-cookie.ts`、`lib/verify-database-target.ts`。
  - `shared/storage/postgres-live-record-store.ts` 的 `getRecord`：用来测语句数。
  - `tests/ui/orbit-button-ratchet.test.ts`、`orbit-scale-ratchet.test.ts`。
- 新增路径：`app/(app)/app/agent/iorbit-0918/iorbit-today-events.tsx`（强制交付的契约文件）。
- 选择：
  - 「要事就绪」直接用 W0036 的 `itemsSettled`（已含计划），再加上 `eventPoolReady`。展开条件是 `items.length === 0`，所以部分来源读不到、但没有要事时也会展开。示例期跳过就绪判定，固定展开。
  - 目标理由：中文写成 `匹配你目标里的『X』`，按 SC 原文的引号；英文是 `Matches “X” in your goal`。两种语言都用「、」连接前 2 个 token，也是照 SC 原文。token 为空时写「匹配你的目标」或 `Matches your goal`。按约定池不会产生空 token 的 goal，这只是防御。
  - 本地乐观状态 `joined` 只在挂载时用服务端的值初始化一次。加入成功后状态行显示「已加入 iOrbit 用户社群。」。
  - 「本周还有 N 场」会再过滤掉 `startsAt <= now` 的场次。池本来已经排除了这些，这里只是再保险一次。
  - 示例分支的社群读取和 `readDemoHomeEventCandidates` 用 `Promise.all` 并行，并加了 `.catch(() => false)`。`readCommunityJoinedForActor` 自己不会抛错，这个 catch 是给测试里的异常注入兜底。
  - 删除了 `DemoHomeData.communityJoined`。`buildDemoHomeData` 是 LOW，这个字段没有别的读取方。
  - 全量基线没法用 stash（功能已经提交），所以把本 Sprint 的 8 个路径临时换回 `c6965bef`，跑完再换回 HEAD，效果相同。
- 影响分析：开工时刷新了索引。FTS 有 2 张表因 UTF-8 问题降级，但图谱本身完整。
  - `IOrbitHome`：**CRITICAL**。
  - `IOrbitDemoBody`：**CRITICAL**。PLANNER 里写的是 HIGH，刷新索引后升了一级；直接调用方仍只有 `IOrbitDemoShell`。
  - `IOrbitDemoShell`：**CRITICAL**。
  - `IOrbitShell`（按文件消歧）：CRITICAL。
  - `AppAgentPage`：**UNKNOWN**。它是路由入口，文本搜索确认没有代码调用方。
  - `buildDemoHomeData`：LOW。
  - 文本搜索确认：`IOrbitShell` 只被 `page.tsx` 调用；`IOrbitHome` 只在壳里的两处渲染。
  - 提交前跑了 `detect-changes --scope staged`：8 个文件、12 个符号，risk 为 high，来自 `AppAgentPage` 的示例分支流程，示例页测试覆盖到了。结果不是 partial，也不是 truncated（`detect-changes-commit1.txt`）。

## review 处理（仅 H 档）

用的命令是 `codex review -c model="gpt-5.6-sol" --base chat-agent`，全文在 `codex-review.txt`。结论：没有可执行的正确性问题。

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| （无） | — | — |

## 交接

- **W0038 契约**：文件是 `repos/orbits/app/(app)/app/agent/iorbit-0918/iorbit-today-events.tsx`，固定在 `18d02ae1`。
  - `export function formatHomeEventReason(reason: HomeEventPoolReason, lang: "en" | "zh"): string`
  - `export function countHomeEventsThisTokyoWeek(pool: readonly HomeEventPoolItem[], now: Date): number`
  - `export function IOrbitTodayEvents(props: IOrbitTodayEventsProps): JSX.Element | null`。`IOrbitTodayEventsProps` 也已导出，定义是 `{ pool: readonly HomeEventPoolItem[]; expanded: boolean; communityJoined: boolean; lang: "en" | "zh"; now: Date }`。
  - 签名与 PLANNER 一致，只是 props 多了 `now`。
- 首页接线：`iorbit-home.tsx` 在今日要事区追问条之前渲染：

  ```tsx
  {demoActive || (itemsSettled && eventPoolReady) ? (
    <IOrbitTodayEvents expanded={demoActive || items.length === 0} … pool={eventPool} />
  ) : null}
  ```

- DOM 标记：`data-orbit-today-events="expanded|collapsed"`、`data-orbit-today-event=<eventId>`、`data-orbit-today-community`、`data-orbit-today-events-status`、`data-orbit-today-events-week`。
- 样式前缀是 `ir-te-*`。`ir-te-copy`／`ir-te-qr`／`ir-te-join` 已加进 `NEW_BUTTONS`。`.ir-m-community` 的规则已删。
- 示例壳现在放行两个真实字段：`demoEventCandidates`（W0036）和 `communityJoined`（W0037）。两者都从 `IOrbitShell` 经 `IOrbitDemoShell`、`IOrbitDemoBody` 传到 `IOrbitHome`。
- W37-1～W37-4、W36-5、W35-2 都按 D38 和协调者裁决执行。
- 需要协调者或用户处理：
  - ① 100% 档预算合计 1,761.38 MB，仍超 1.6 GB。请接着 W0036 的登记，并入 D32 周检。
  - ② 观察项：本机这周没有可报名活动，所以浏览器没看到「本周还有 N 场」那一行。要实机看，需要在本机验收库加一场本周活动；这次没有改 seed。
- `repos/orbits/next-env.d.ts` 被 3001 dev server 改写过，没有提交。
- 回退：`git revert 18d02ae1`。没有迁移。社群加入记录是本人的幂等记录，回退后活动页的社群卡照常读取。

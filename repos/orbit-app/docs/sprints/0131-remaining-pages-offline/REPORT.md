# Sprint 0131 执行报告：其余常用页面断网也能看

**run-01。** Generator 为子代理（没有再派子代理），报告由协调者代存。**状态：completed。**


### 1. 状态

**已完成，有 4 处没做到或没测到，见第 12 节。**

- 分支 `sprint/0131-remaining-pages-offline`，基线 b08cb8dc9。共 10 个提交，都没有合并或推送。
- 两边全量测试都是 0 失败，typecheck 和 lint 都通过。
- 付费调用 0 次。QA 数据已清理，数据库和开工前逐行一致。

### 2. 页面离线清单

全 App 共 91 个路由文件：

| 归属 | 数量 |
|---|---|
| 能断网看（本地优先） | 41 |
| 只能在线 | 35 |
| 不读账号数据（布局、跳转、本机设置） | 15 |

能断网看的 41 个按实现的 Sprint 分：0108 占 8 个，0115 占 3 个，0116 占 3 个，0117 占 4 个，0118 占 4 个，0119 占 4 个，**本 Sprint 0131 占 15 个**。

- 清单文件：`repos/orbit-app/docs/offline/page-inventory.md`，由 `repos/orbit-app/scripts/page-offline-inventory.ts` 生成。
- 审计测试 `tests/page-offline-inventory.test.ts` 会检查三件事：每个路由都有归属、没有过期条目、文件和登记表一致。

**只能在线的 35 个页面及原因：**

| 原因 | 页面 |
|---|---|
| 涉及凭据或会话 | `/account`、`/account/login`、`/account/signup`、`/account/forgot-password`、`/account/reset-password`、`/account/permissions`；`/profile/edit`（离线编辑属于 0120 断网写入） |
| 管理员工具 | `/login-admin`、`/admin`、`/admin/access`、`/admin/events`；`/platform`（平台审核公开活动的队列，本 Sprint 改判为只能在线） |
| 主办方实时运营 | `/events/center`、`/events/:id/operations` 及其下 admission、check-in、experience、roles 四页；`/events/:id/analytics` |
| 付费 AI | `/events/:id/register`（报名问卷由 AI 生成）、`/profile/more`、`/profile/suggestions`、`/profile/onboarding` |
| 名片识别（上传图片做 OCR） | `/contacts/new`、`/contacts/new/batch/:id`、`/contacts/new/batch2`、`/contacts/new/batch2/:id`、`/contacts/new/import/:id` |
| 需要服务器实时计算 | `/contacts/intros`、`/contacts/matches`、`/contacts/pipeline` |
| 需要服务器验证链接或邀请码 | `/invitations/:token`、`/register`、`/register/:code` |
| 给未登录访客的公开页 | `/o/:slug` |

`/profile/onboarding` 是例外：断网时保留 0106 的做法，已填内容留着，联网后继续保存，不显示「需要联网」。其余 34 个在路由上包了「需要联网」外框。

### 3. 各验收项结果

| SC | 结果 | 证据 |
|---|---|---|
| 01 清单与审计 | 通过（先 RED） | 先录了模块不存在时的 RED；再放一个未登记的探针路由，审计报 UNREGISTERED，随后删掉探针。清单测试 4/4 通过 |
| 02 本 Sprint 负责的页面 | 通过，另有 1 项 phoneweb 上无法实测 | 各页面组的 App 测试都先 RED；phoneweb 截图覆盖每个页面；Simulator 截图 29 张 |
| 03 早先 Sprint 的页面同一次断网实测 | phoneweb 全部通过；Simulator 只覆盖了一部分 | Simulator 上漏了 7 页，见第 12 节 |
| 04 只能在线的页面显示「需要联网」 | 通过 | phoneweb 上断网打开 30 页，29 页显示「需要联网」，剩下 1 页是 onboarding（按设计） |
| 05 换账号、撤权清空，全量，typecheck，棘轮 | 通过 | 页面副本在接受租约时，清除其他授权纪元的副本；没有授权时全部清除（`page-copies-sync` 5/5）。全量结果见第 6 节。棘轮文件没有改动 |

SC-02 中无法实测的一项：关系下一步页面（`/tasks/relationship/:id`）需要通过活动交换建立的关系，QA 账号无法造出来。该页断网时如何显示由测试覆盖。

### 4. 设计取舍

**页面副本（新增）：**
- 对服务器实时算出的页面，把上一次联网时成功读到的结果存在设备上。存放位置复用本机已有的同步元数据表（`sync_meta`），键里带账号空间和授权纪元。
- 这份副本绑定离线读取租约：租约一过期就读不到，换账号或撤权时清除。
- 每份副本都有大小上限和份数上限。浏览器端加密保存。
- 一共 13 种副本，每一种在威胁模型文档中都有一节说明为什么可以放进浏览器。
- 公开活动列表是平台数据，但仍按当前身份和授权纪元保存，也随它们一起清除，不在不同账号之间共享。

**服务器可达状态：**
- API 客户端记下每次请求是否连上了服务器。
- 连不上期间每 3 秒探测一次 /api/health。一旦恢复，各同步类别马上补同步一次，只拉增量，不整库重拉。

**协调者的各项决定都已实现：**
- 日历里的活动链接改为打开 `/events/:id`。
- 报名被取消后，活动详情显示中性提示，不当作错误。
- 活动详情对 404 和 5xx 分别给出文案。
- 看板的来源审计改为点按钮才运行，并显示「上次审计」的时间。
- 修复非 ASCII 地区分组被多解码一次的问题，服务器和手机两条路径都修了。
- 联系人页只在用户开始搜索或打开筛选时才读 `/api/search/suggestions`。
- AI 标签页写明本机只搜标题、第一个问题和最近一条消息，并提供「搜索更多」去服务器查。
- 对话消息按行编号从本机分页读取。实测 5000 条消息时，浏览器端读最新一页只要 0.8ms、解密 33 条；读整个类别要 80ms、解密 5003 条。

### 5. 提交

| SHA | 内容 |
|---|---|
| 4e877081e | 全 App 页面离线清单和审计测试 |
| 06c2d9633 | 页面副本、服务器可达状态、需要联网外框；Agent 动作中心和 All Actions 账本 |
| 31a49d845 | 首页、今日、待办列表、待办详情、关系下一步 |
| e29b616b9 | 个人资料、约谈、活动、日历、活动详情；`/platform` 改判只能在线 |
| aa67a3e40 | 搜索建议和来源审计按需读取、地区分组修复、AI 本机搜索范围说明、对话按行分页、恢复联网即同步 |
| fa06e4ff1 | 只能在线的路由把登录检查放在最外层；追加上线步骤 |
| bd17e09ea | 同步过但没有待办时，断网仍能打开 |
| 5f9fbae5b | 待办详情改为只读网络（已被下一个提交取代） |
| 8afae0bf9 | 待办详情保留默认读取，服务器连不上时改用本机副本 |

### 6. 测试

**全量测试（收尾时最后一轮）：**

| 仓库 | 测试 | 通过 | 失败 | 跳过 |
|---|---|---|---|---|
| orbits（服务端） | 5347 | 4760 | 0 | 587 |
| App | 3849 | 3849 | 0 | — |

中途两次全量发现的问题：
- orbits 第一次跑有 1 条失败：功能审计测试发现，外面包了「需要联网」外框后，认不出路由有登录检查。fa06e4ff1 修复。
- App 有一次跑出 2 条失败：`task-date-interactions` 发现只读网络的写法会让保存后重新读取时页面变空白。8afae0bf9 修复。

**真实 Postgres 测试（`--test-concurrency=1`）：**
- `orbit_test` 库：`sync-dashboard-graph-postgres`、`dashboard-snapshot-postgres`、`dashboard-sql-read-model-postgres`、`flow-topology-postgres`、`bootstrap-dashboard-egress-bounds`、`read-receipts-postgres`、`read-cost-postgres`、`contact-owner-boundary`，0 失败。
- `orbit_cutover_test_20260917` 库：`read-projection-parity-postgres` 5/5。

**新增测试，每个都先 RED：**
- 页面清单、页面副本同步、服务器可达状态。
- 各页面组的断网页面测试：动作与账本、首页、待办、个人资料与活动。
- 首页本机计算规则、对话分页、服务器的非 ASCII 分组测试。
- 另有追加测试：搜索建议按需、审计按需、AI 搜索与今日摘要、恢复联网即同步、没有待办时断网、待办详情遇到本机缓存。
- RED 记录都在 `commands/red-*.txt`。

**检查：** App 的 typecheck 和 `tsc` 干净；orbits 的 `typecheck`、`typecheck:app`、`lint` 干净。

### 7. 运行时证据

证据目录：`repos/orbit-app/build/harness-state/evidence/sprint-0131/run-01/`

**环境：** 本地栈启动时把各模型密钥设为空；QA 账号 A、B；phoneweb 跑在 32131 端口。

**phoneweb，账号 A：**
- 38 个能断网看的页面先联网打开一遍，再断网逐个打开。
- 35 页显示「截至」。
- 2 页显示「还没保存在这台设备上」：一个是没有的约谈，另一个是 QA 账号造不出的关系下一步。
- 新建日程页本来就是空白表单。
- 截图在 `screens/web/`。

**phoneweb，账号 B：** 发现没有任何待办的账号断网后打开待办页会报错，已修（bd17e09ea），重新导出后复测通过。

**请求记录：**
- 修改前，联系人页和看板每次打开都会读搜索建议和来源审计（修改前的测试 RED 就是抓这一点）。
- 修改后，多次打开联系人页和看板，两个接口都是 0 次。
- 点一次搜索框：`/api/search/suggestions` 读 1 次。
- 点一次审计按钮：1 次运行加 1 次读取。
- 断网时看板显示「上次审计：9月28日 23:02」。

**非 ASCII 分组：** 「深圳」分组的地址是 `location_%E6%B7%B1%E5%9C%B3`，联网和断网都能打开。

**Simulator（Debug 版加 Metro，服务器临时指向 3100，账号 A）：**
- 29 页先联网打开，停掉本地栈后冷启动。27 页显示离线提示。
- 发现待办详情被本机缓存当作服务器的回答：没有「截至」，「标记完成」还能点。已修，最终版本见第 12 节第 2 条。

**付费调用 0 次：** web-3100 日志里，从开工那一行之后没有 `registration_questions_generated`，也没有任何模型调用记录。

**收尾：**
- 数据库：orbit_records 回到 9246 行，md5 `d3d35e6d…`，和开工前一致；消息三张表回到 1/2/1 行；QA 活动已删；QA 账号的请求记录删了 639 条。
- Simulator 的服务器地址已还原为 `http://127.0.0.1:3000`，回到演示账号首页（17 项待办），App 已关掉。
- Metro、phoneweb、本地栈都已停止，只剩你的 3000 在监听。磁盘剩 13GB。

### 8. GitNexus

impact 结果：
- **HIGH：**`homeScheduleToView`（只改了活动链接）、`createLiveNetworkDistributionAnalyticsService`（分组修复）。
- **LOW：**`mirrorTaskListSource`、`TaskDetailScreen`、`finalSnapshot`（`finalSnapshot` 看了 impact，最后没有改）。
- **detect-changes：**第四批提交前为 high，受影响的流程是个人资料的编辑、补充、建议三页。它们共用的 hook 默认行为没变，仍是只读网络。记录在 `commands/detect-changes-checkpoint4.txt`。之后几次提交都是 low。

### 9. 上线步骤

已写入 `PRODUCTION_ROLLOUT.md`，**需要你确认后执行**。

- **无迁移，服务器不新增表、列或同步类别。**
- ① 部署 orbits（web 和 worker）。
- ② 冒烟：网页看板点一个非 ASCII 的地区分组，能打开明细；`/api/health` 返回 200。
- ③ `npm run web:export` 发布 phoneweb，再发布 App。
- 顺序不限：旧 App 对新服务器不受影响；新 App 对旧服务器时，只有服务器上的非 ASCII 分组明细还会「找不到」。

### 10. 文件

- **App 新增：**`src/data/sync/page-copies.ts`、`src/api/server-reachability.ts`、`src/hooks/usePageCopyResource.ts`、`src/hooks/usePageCopySession.ts`、`src/components/OnlineOnlyBoundary.tsx`、`src/components/NeedsNetworkState.tsx`、`src/view-models/home-local.ts`、`scripts/page-offline-inventory.ts`、`docs/offline/page-inventory.md`。
- **App 修改：**约 30 个页面，34 个路由文件包上「需要联网」外框，同步协调器和本地库，威胁模型，三种语言文案。
- **服务端修改：**`shared/compute/dashboard-distribution.ts`、`shared/api-schema/offline-policy.ts`，以及对应的测试。

### 11. 工作区

只剩你原有的文件：codex-review.md、`.claude/skills/gitnexus/`、`output/`、`docs/designs/2026-09-28-offline-write/`。

### 12. 没做到或没测到的

1. **关系下一步页面无法在运行时实测。** 这个页面需要通过活动交换建立的关系，QA 账号造不出来。断网时的表现由 `offline-pages-tasks` 测试覆盖。
2. **待办详情的最终版本没有在 Simulator 上复测。** 最终版本（8afae0bf9）改为按服务器可达状态判断，由行为测试覆盖（对修复前的代码是 RED）。Simulator 上只验证过中间的只读网络版本（`sim-40`），两个版本改用本机副本的逻辑相同。没复测的原因是：App 切回演示账号时清掉了 3100 那份本机副本，QA 账号也已经删了。
3. **联系人详情（0116 做的页面）在 Simulator 上断网时有两个问题：** 没有离线提示；关系区显示原始的 `ORBIT_APP_NETWORK_ERROR`。另外，打开另一个账号的 AI 会话或联系人时，断网显示「服务器连不上」，而不是「还没保存在这台设备上」。这些是早先 Sprint 的页面，本 Sprint 没改，建议另开小项处理。
4. **有些页面没截图：**
   - Simulator 上没截 `/inbox/sources`、`/contacts/list`、`/contacts/graph`、`/tasks/personal`，以及笔记和日程的编辑页、新建页；这些在 phoneweb 上都截了。
   - 只能在未登录时打开的 5 页（login、signup、forgot-password、reset-password、login-admin）没做断网截图，因为这一轮是在登录状态下跑的。
5. **有 158 条请求记录无法区分来源，没有删。** 这些是开工后匿名的 auth 和公开活动请求，以及演示账号的记录。请求记录里没有端口字段，分不清哪些来自 3100、哪些来自你的 3000。
### 13. 协调者复核

协调者在 `8afae0bf9` 上独立复核：

- **orbits 全量**：5347 条，4760 通过，0 失败，587 跳过。
- **App 全量**：3849/3849 通过。
- **Postgres 测试**：`orbit_test` 上全部使用数据库环境变量的文件，排除需要 cutover 库的 4 个，共 326 条，321 通过，0 失败，5 跳过。
- **页面清单复核**（协调者按用户 2026-09-28 的授权决定）：
  - `/contacts/intros` 需要算别人的数据，`/profile/more` 要调用付费 AI 抽取，都维持只能在线。
  - **`/contacts/pipeline` 改判为应该能断网看**：它只是本人联系人的关系阶段，数据 0116 已经放进手机。并入新 Sprint **0137**。
- **第 12 节的处理**：
  - 第 2、3、4 条：联系人详情断网时的原始错误码、别人内容的空状态、模拟器上漏测的页面 → 并入 **0137**。
  - 第 1 条：关系下一步页面在运行时造不出数据，接受由测试覆盖。
  - 第 5 条：158 条来源不明的请求记录，接受保留。

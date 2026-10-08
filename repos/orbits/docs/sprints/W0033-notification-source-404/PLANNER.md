# Sprint W0033 — 通知来源页 id 重复编码导致 404 的修复

**Plan revision:** 1（2026-09-29）。**模式:** existing-codebase / single-generator。运行状态以登记表为准。

**原需求:** RV-02。来源：W0031 REPORT「观察项」2，用户决定 D29（2026-09-29）。

**单一目标:** `/app/inbox/sources/[id]` 页面把 Next 交来的路由参数还原（`decodeURIComponent`）一次再使用，使 discovery 来源通知的「查看来源」正常显示原始笔记；请求路径只编码一次；越权与路径注入防护不变。

**易读目标:** [GOAL.md](GOAL.md)。

**基线:** 编制时 `chat-agent` `b3db05d5`（W0031 已合并，`f4e04a54`）。开工时 `git diff b3db05d5 HEAD -- 'app/(app)/app/inbox' tests/services/notification-source-navigation.test.ts` 复核并在 REPORT 登记。

**进入条件:**
- W0031 已 completed 并合并（D29）。✔
- 3001 验收 server 可用（`scripts/verify-server.sh`）；verify 账号种子可用。
- 与 W0032 无代码依赖，可先做或并行；并行时按 RULES §2 在外接盘建 worktree，且不与 W0032 同时写 3001 的 verify 账号数据（W0032 的撤销验收会改 verify-plan 的 `passwordChangedAt`）。
- 无开放问题；不需要云端授权，不调用付费 AI，不部署。

## 已查清的事实（`b3db05d5`）

1. **链接生成是对的**：`notification-source-view-model.ts` 第 2–5 行 `notificationWebSourceHref(n)`，discovery 来源（`n.sources.some(s => s.objectId === 'discovery')`）返回 `'/app/inbox/sources/' + encodeURIComponent(n.id)`，即 `inbox%3A…`，编码一次。调用方两个：`typed-notifications-tab.tsx` 第 65 行（「查看来源」按钮，`<a href>` 整页跳转）与 `home/orbit-real-home.tsx` 第 495 行。已有测试 `tests/services/notification-source-navigation.test.ts` 断言 `'/app/inbox/sources/inbox%3Aone'`。
2. **Next 交给页面的参数保持编码形式**：W0031 证据 `~/orbit-sprint-evidence/web/sprint-W0031/run-01/09-browser-3001.json` 与 `05-prod-after-raw.json`：浏览器直接访问 `/app/inbox/sources/inbox:9361…`（冒号未编码），页面发出的请求仍是 `/api/inbox/notifications/inbox%253A9361…`，说明 `params.id` 拿到的是 `inbox%3A…`。站内已有同样结论与做法：`app/(app)/app/tasks/[id]/page.tsx` 第 9–11 行注释「Next passes an encoded segment here」并 `try { decodeURIComponent(id) } catch {}`；`contacts/[id]`、`events/[id]` 等页面同样自行解码。
3. **页面又编码一次**：`sources/[id]/page.tsx` 第 5–8 行把原样的 `id` 传给 `NotificationSourcePage`；`notification-source-page.tsx` 第 11 行 `communicationRequest('/api/inbox/notifications/' + encodeURIComponent(notificationId) + '?language=' + language, …)` → `inbox%253A…` → API 找不到 → 404 → 页面显示「来源已变化或暂不可用」。即使 API 能找到，第 11 行 `notificationDetailView(…, notificationId)` 也会因 `parsed.id !== id`（`inbox:…` 对 `inbox%3A…`）抛错。
4. **API 路由参数是已解码的**：`/api/inbox/notifications/[id]/route.ts` → `handler.ts` 第 27–28 行直接用 `params.id` 调 `runtime.service.get(actor.id, id, lang)`；收件箱通知页签以 `inbox%3A…` 请求详情可正常返回（W0031 场景 ⑤），说明 route handler 拿到的是 `inbox:…`。页面与 route handler 的解码行为不同，Generator 在 REPORT 记下实测。
5. **登录回跳也多编码**：`page.tsx` 第 7 行未登录时 `next: '/app/inbox/sources/' + encodeURIComponent(id)`，对已编码的 id 再编码。`proxy.ts` 对 `/app/*` 未登录请求会先行重定向，这里是兜底路径，顺带修正。
6. **访问控制**：服务端按 `actor.id` 取通知（handler 第 28 行），别人的 id 返回 404；客户端 `notificationDetailView` 核对 `actorId` 与 `id`，`verifiedSourceNote` 核对笔记 owner、account、id、版本。本 Sprint 不改这些。
7. **路径注入面**：修复后 id 来自一次解码，再经 `encodeURIComponent` 放进单个路径段；`/` 会被编码为 `%2F`，不会产生新段。唯一需要注意的是 `encodeURIComponent` 不编码 `.`：解码结果恰为 `.` 或 `..` 时，`/api/inbox/notifications/..` 会被 URL 规范化成 `/api/inbox/`。浏览器会把路径里的 `%2e`、`%2e%2e` 段规范化掉，正常访问到不了这一步，但原始请求（curl）可能送到，按防御处理（SC-02）。
8. **没有页面级测试**：`NotificationSourcePage` 与 `SourcePage` 当前没有单测；`tests/audits/web-route-transport.test.ts` 第 45、105 行只把该路由列入传输审计。

## 调用方与风险（GitNexus，`b3db05d5`，索引落后 3 个文档提交）

- `NotificationSourcePage`：LOW（唯一调用方 `SourcePage`）。
- `SourcePage`（`sources/[id]/page.tsx`）：UNKNOWN（路由入口，由 Next 调用；文本搜索确认无代码调用方）。
- `notificationWebSourceHref`、`verifiedSourceNote`：GitNexus 报 CRITICAL（约 3046，`partial`，结果含 App 端 `EventExperienceScreen` 等明显无关项，属过度连接）；文本搜索直接调用方只有第 1 条列出的两处。**本 Sprint 不修改这两个函数**，只在同一文件新增纯函数。
- 开工时 Generator 须 `analyze --force --index-only` 后重跑 impact，存证据。

## 决定

- 在 `notification-source-view-model.ts` **新增**纯函数（名称可调整）：
  - `notificationIdFromRouteParam(raw: string): string | null`：`try { decodeURIComponent(raw) } catch { raw }`（与 `tasks/[id]` 相同：残缺编码保留原值，交给 API 返回 404）；结果为空、`.` 或 `..` 时返回 null。
  - `notificationDetailPath(id: string): string`：`'/api/inbox/notifications/' + encodeURIComponent(id)`（可选；若 `notification-source-page.tsx` 保持原拼接，测试直接断言拼接结果）。
- `sources/[id]/page.tsx`：`await params` 后先转成 `notificationId`；null → `notFound()`；未登录回跳的 `next` 用还原后的 id 编码一次；把还原后的 id 传给 `NotificationSourcePage`。
- `notification-source-page.tsx`：不改或只改为使用 `notificationDetailPath`；请求仍编码一次，身份与来源核对逻辑不动。
- 不改 `notificationWebSourceHref`、API handler、`verifiedSourceNote`、`notificationDetailView`。

## 上下文包（Generator 从这里起步，不通读其他 REPORT）

- **必读（行号按 `b3db05d5`）：**
  - `app/(app)/app/inbox/sources/[id]/page.tsx`：全文（9 行），修改。
  - `app/(app)/app/inbox/notification-source-view-model.ts`：全文（10 行），新增纯函数。
  - `app/(app)/app/inbox/notification-source-page.tsx`：全文（28 行），第 11 行的请求拼接。
  - `app/(app)/app/tasks/[id]/page.tsx`：第 8–15 行，站内既有解码写法。
  - `app/api/inbox/notifications/handler.ts`：第 11–37 行（只读，确认 actor 隔离与 404）。
  - `app/(app)/app/inbox/notification-inbox-view-model.ts`：第 5 行 `notificationDetailView`（只读）。
- **测试：** `tests/services/notification-source-navigation.test.ts`（在此文件追加用例，复用其中的 `n` 夹具）；`tests/audits/web-route-transport.test.ts`（回归）；`tests/pages/typed-notifications-identity-browser.test.ts`、`tests/pages/inbox-identity-confirmation.test.ts`（W0031，确认来源页仍走共享确认，回归）。
- **3001 造数：** W0031 的做法（REPORT「假设与额外阅读」）：以 verify-plan 身份经 API 建一条笔记，再用证据目录里的临时脚本在本机开发库写一条通知，来源为该笔记、`objectId: 'discovery'`、`target.status: 'available'`。写法参考 `features/notifications/discovery/discovery-worker.ts` 第 18–44 行（`createInboxRuntime(...).service.upsert` 的参数形状：`sources` 含 `sourceKind: 'note'`、`sourceId`、`sourceRevision`＝笔记版本、`objectId: 'discovery'`、`excerpt`）与 `features/notifications/inbox-record-service-factory.ts`（`createInboxRuntime`、`isTypedInboxEnabled`）。脚本只放证据目录，用完删除；结束后 `node --import tsx scripts/seed-verify-accounts.ts --reset verify-plan`，核对非 verify 行指纹不变。cookie 用 `node --import tsx scripts/verify-session-cookie.ts verify-plan --header` 注入，不在登录表单输密码。
- **前序交接要点：** W0031：来源页的身份确认走 `readContactMessageActor`（共享确认），读取失败会 `invalidateInboxActorConfirmation()`；本 Sprint 不改这部分。
- **易错边界（都有对应 SC）：**
  - 只解码一次，不能「循环解码直到不变」（会把真实 id 里的 `%41` 之类变成别的字符）（SC-02）。
  - 残缺编码（如 `%E0%A4%A`）不能让页面崩溃：保留原值，请求照常发出、得 404、页面显示错误提示（SC-02、SC-03）。
  - 解码为 `.`／`..`／空串时不得发请求（SC-02）。
  - 不改链接生成与 API，旧测试断言不改（SC-04）。
  - 访问控制不变：别的账号的通知 id 仍得不到内容（SC-03）。

## 范围与文件

- **修改：** `app/(app)/app/inbox/sources/[id]/page.tsx`；`app/(app)/app/inbox/notification-source-view-model.ts`（只新增）；`app/(app)/app/inbox/notification-source-page.tsx`（仅当改用 `notificationDetailPath`）。
- **修改测试：** `tests/services/notification-source-navigation.test.ts`（追加用例，不改原断言）。
- **新建：** 造数与浏览器脚本只放证据目录 `~/orbit-sprint-evidence/web/sprint-W0033/run-01/`。
- **排除：** API handler 与路由；`notificationWebSourceHref`；收件箱其他页面；其他动态路由的同类问题（若发现，登记为观察项，不在本 Sprint 修）；样式与文案。

## 验收契约（四项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0033-01 | **根因与修复**：`SourcePage` 把路由参数还原一次后使用；请求详情的路径为 `/api/inbox/notifications/` + `encodeURIComponent(原 id)`；未登录回跳 `next` 只编码一次。REPORT 记录实测：页面参数与 route handler 参数各自是否已解码（事实 2、4）。 | 代码 diff；SC-03 浏览器网络记录 |
| SC-W0033-02 | **来回一致与防注入**（单测）：对 id `inbox:abc`、`a/b`、`a b`、`中文:编号`、`100%`、`a%41b`（字面百分号）、`a+b`、`a?b#c` 各做：`notificationWebSourceHref` → 取路径段（即 Next 交给页面的编码形式）→ `notificationIdFromRouteParam` → 结果**等于原 id**；详情路径**等于** `'/api/inbox/notifications/' + encodeURIComponent(原 id)`，且 `new URL(路径, 'http://x').pathname` 以 `/api/inbox/notifications/` 开头、其后恰好一个路径段。残缺编码 `%E0%A4%A` → 保留原值，不抛错。`.`、`..`、`%2E%2E`、空串 → null（页面 `notFound()`，不发请求）。 | 新用例先 RED（新函数不存在或断言失败）后 GREEN |
| SC-W0033-03 | **3001 真实页面**：造一条 discovery 来源通知后，verify-plan 在收件箱通知详情点「查看来源」、以及直接访问 `/app/inbox/sources/inbox%3A…` 与 `/app/inbox/sources/inbox:…` 两种写法，页面都显示笔记标题与正文；网络请求为 `inbox%3A…`（无 `%253A`）、200；桌面 1440 与手机 375 各一次，控制台 0 错误。**越权**：用 verify-legacy 的 cookie 打开同一链接，页面显示错误提示、详情请求 404，看不到内容。**探针**：直接访问两个不存在的特殊 id（如编码后的 `a%41b`、`a/b`），网络请求路径与 SC-02 的期望一致（404 属预期）。结束后 `--reset verify-plan`，非 verify 行指纹不变。 | 截图、网络记录 JSON、reset 与指纹输出 |
| SC-W0033-04 | **回归**：`npx tsc --noEmit -p .` 通过；`notification-source-navigation`（原断言不改）、`web-route-transport`、W0031 两个收件箱身份测试文件全部通过（基线失败项逐条对照）。 | 测试与 tsc 输出 |

## 一次 Generator 的执行顺序

1. 复核进入条件，保存基线与 Planner 哈希；GitNexus 重建与 impact（UNKNOWN 文本补查）。
2. 3001 上先复现：造数，打开来源页，记录 `%253A` 请求与 404（改前证据）。
3. 写 RED：SC-02 用例。
4. 最小实现：新增纯函数 → `page.tsx` 接线（→ 可选 `notification-source-page.tsx` 用新路径函数）。
5. 定向测试与 tsc；3001 验证（dev server 热更新，无需重启；不重启 3001 进程）。
6. reset 与指纹核对 → 暂存区 `detect-changes` → 按路径提交 → 写 REPORT 并交接。

## 最小测试与检查

- **档位：L。** 理由：只改一个路由入口的参数处理和新增纯函数，边界清楚；不改身份、权限、写入与 API。
- **开发定向集：** `node --import tsx --test tests/services/notification-source-navigation.test.ts`。
- **收口：** SC-04 所列文件＋tsc 一次；可见变化用 3001 浏览器验证。不跑全量（RULES §5.1 L 档）。
- **不运行：** 生产构建、付费 AI、Preview、部署。

## 失败与交接

REPORT 写明：改前复现证据、根因（页面与 route handler 参数解码的实测差异）、SC 映射、3001 造数方法与清理、发现的其他同类路由（只登记）。交接：分支 `sprint/W0033-notification-source-404`，固定最终 SHA，目标合并到 `chat-agent`。

**回退：** revert 本 Sprint 的提交，恢复原行为（来源页 404），无数据影响。

## 开放问题

无。根因与修法可由源码和 W0031 证据确定，属可逆的实现细节。

## 修订记录

- revision 1（2026-09-29）：初版。依据 D29、W0031 REPORT 观察项 2 与证据；源码按 `b3db05d5` 核对。方案 review 待做。

# Sprint W0033 — 执行总结

## 结果

对应 [GOAL.md](GOAL.md)。

- 已验证能做到：
  - 在收件箱通知详情点「查看来源」，来源页显示原始笔记的标题和正文，不再显示「来源已变化或暂不可用」。直接输入 `/app/inbox/sources/inbox%3A…` 或 `/app/inbox/sources/inbox:…` 也一样。3001 上桌面 1440、手机 375 都验证过，控制台 0 错误（SC-03）。
  - 请求通知详情时编号只编码一次（`inbox%3A…`，200），改前是 `inbox%253A…`（404）（SC-01、SC-03）。
  - 冒号、斜杠、空格、中文、百分号、`+`、`?`、`#` 的编号都能来回还原，请求路径始终是 `/api/inbox/notifications/` 下的一个路径段；残缺编码保留原值（API 回 404）；`.`、`..`、`%2E%2E`、空串直接 `notFound()`，不发请求（SC-02）。
  - 安全边界不变：verify-legacy 打开 verify-plan 的来源链接，详情请求 404，页面显示错误提示，看不到内容（SC-03）。
- 仍未实现或未验证：
  - `..` 类编号的防护只有单测。真实请求里 Next 会先把 `/app/inbox/sources/%2E%2E` 308 重定向到 `/app/inbox`，`%2e` 重定向到 `/app/inbox/sources`，到不了页面（`07-curl-probes.txt`）。
  - 未登录回跳在实际请求中由 `proxy.ts` 先处理（`next=%2Fapp%2Finbox%2Fsources%2Finbox%253Aabc`，解码后正好是编码一次的路径）。页面里的兜底回跳已改成只编码一次，但没有在浏览器里走到。

## 运行记录

- 结果：completed
- Generator：Claude Opus 5.5，2026-09-29，run-01；Planner revision 1（sha256 `924b3a66089534d08e1069b285e76361d5973a70abe790fed03b2759a1137d96`）
- 分支 `sprint/W0033-notification-source-404`，基线 `a032e523`（`git diff b3db05d5 HEAD -- 'app/(app)/app/inbox' tests/services/notification-source-navigation.test.ts` 为空，`00-diff-b3db.txt`）；功能 SHA `921c5d12`；`chat-agent` 合并 SHA：见登记表
- 档位 L，不跑全量
- 付费 AI 调用 0；未 push；未部署；未碰生产库；3001 未重启，`.next-verify`／`.next` 未动
- REPORT 由协调者按 Generator 交回的正文落盘
- 证据：`~/orbit-sprint-evidence/web/sprint-W0033/run-01/`

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-W0033-01 根因与修复 | pass | `921c5d12` diff；改前 `02-before-browser.json`，改后 `06-after-browser.json`。实测：页面 `params.id` **未解码**（直接访问 `inbox:…` 与 `inbox%3A…` 时页面拿到的都是 `inbox%3A…`，改前两种写法都发出 `inbox%253A…`）；API route handler 的 `params.id` **已解码** |
| SC-W0033-02 来回一致与防注入 | pass | `tests/services/notification-source-navigation.test.ts` 新增 2 条；RED `03-red.txt`（2 条失败：新函数不存在），GREEN `04-green.txt`（4/4） |
| SC-W0033-03 3001 真实页面 | pass | `06-after-browser.json` 与 `06-after-*.png`：点击、直接访问编码写法、直接访问原始写法，1440 与 375 各一次，都显示笔记标题与正文，详情 `inbox%3A…` 200、笔记 200，控制台 0 错误；verify-legacy 越权：详情 404，页面显示错误提示；探针 `a%41b` → `/api/inbox/notifications/a%2541b`，`a/b` → `/api/inbox/notifications/a%2Fb`，都是预期的 404。改前对照 `02-before-*`。清理：`08-reset.txt`，非 verify 行指纹与 summary 与开工前一致（`00-fingerprint-before.txt`／`08-fingerprint-after.txt`，`00-summary-before.txt`／`08-summary-after.txt`） |
| SC-W0033-04 回归 | pass | `05-tsc.txt` exit 0；`05-targeted.txt`：`notification-source-navigation`（原两条断言未改）、`web-route-transport`、`typed-notifications-identity-browser`、`inbox-identity-confirmation` 共 20 条，20 pass、0 fail、0 skip |

## 假设与额外阅读

- 上下文包之外读了：`features/notifications/inbox-record-service.ts` 与 `shared/api-schema/inbox-notifications.ts`（造数时 upsert 校验要求来源带 `readAt`）；`discovery/source-adapters.ts` 读笔记部分、`app/api/notes/collection-handler.ts` POST；`scripts/load-local-env.ts`、`scripts/lib/verify-database-target.ts`、`shared/storage/transactional-postgres.ts`；`typed-notifications-tab.tsx` 第 60–70 行；W0031 证据里的 `browser-3001.mjs`。
- 造数：verify-plan 经 3001 API 建一条笔记，再用临时脚本在本机开发库 upsert 一条 `objectId: 'discovery'`、来源为该笔记的 suggestion 通知（`01-seed.txt`）。造数脚本与浏览器脚本用完已删，cookie 只在内存中。
- `notification-source-page.tsx` 只改了详情请求路径的拼接（`notificationDetailPath`）；身份与来源核对逻辑未动。
- `notificationIdFromRouteParam` 只解码一次；单测覆盖 `%252E%252E` → `%2E%2E`（不循环解码）。

## GitNexus

- 开工 `analyze --force --index-only`。impact（`00-impact.txt`）：`NotificationSourcePage` LOW；`SourcePage` UNKNOWN，文本搜索（`00-impact-text.txt`）确认只是 Next 路由入口；`notificationWebSourceHref` LOW（未修改）。无 HIGH/CRITICAL。
- 提交前 `detect-changes --scope staged`（`09-detect-changes.txt`）：4 个文件、5 个符号、0 个受影响流程，risk low。

## 观察项（只登记，不在本 Sprint 修）

- 以下 `/app` 动态路由页面没有自行解码参数，可能有同类问题，未验证（取决于 id／token 是否会含保留字符）：`events/[id]/register/page.tsx`（第 117 行起，回跳与 `closeHref` 再编码）、`invitations/[token]/page.tsx`（第 16 行 `encodeURIComponent(token)`）、`o/[slug]/page.tsx`、`contacts/analysis/[dimension]/[bucketId]/page.tsx`（第 17 行回跳再编码）。

## 交接

- 新纯函数（`app/(app)/app/inbox/notification-source-view-model.ts`）：`notificationIdFromRouteParam(raw)`：解码一次，残缺编码保留原值，空串／`.`／`..` 返回 null；`notificationDetailPath(id)`：`'/api/inbox/notifications/' + encodeURIComponent(id)`。
- 回退：revert `921c5d12`，恢复原行为（来源页 404），无数据影响。

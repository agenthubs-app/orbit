# Sprint 0141 报告：保存时网络断了，修改不丢

## 1. 状态
**已完成，等协调者复核合并。**
- 分支 `offline-fixes-20261102`，worktree `/Volumes/ORICO/Dev/worktrees/orbit/offline-fixes`，起点 `d9cf8a45c`（与 `chat-agent` 7a81588d0 只差 0141–0145 的计划文档）。
- 未推送，未部署，未碰 Neon / Vercel / 正式库。登记表未改，由协调者更新。

## 2. 验收
| SC | 结果 | 证据 |
|---|---|---|
| 01 待办完成／推迟／详情编辑，传输层失败时入队并显示「尚未同步」 | 通过 | `todo-offline-browser.test.tsx`：To-do「完成」「推迟」请求断网后各入队 1 条，收据编号就是刚才发出去那次的编号，页面提示「尚未同步」，不出现「现在无法操作」。`offline-pages-tasks.test.tsx`：待办列表勾选完成后入队，展开「已完成」看到「尚未同步」；详情改标题后入队，带原版本 `expectedUpdatedAt`，详情显示「尚未同步」 |
| 02 不重复个人日程新建／编辑／删除，传输层失败时入队，日历显示「未同步」 | 通过 | `offline-pages-schedule.test.tsx`：编辑入队（带本机版本 `baseRevision` 和 `expectedUpdatedAt`）并跳到详情，用这条入队记录打开详情显示「未同步」；新建入队（`local:` 临时编号）；删除在原有确认后入队 |
| 03 服务器回 4xx/5xx 不入队，提示不变；不符合离线资格的不入队 | 通过 | To-do、详情、日程各测 409 和 500（列表测 500）：不入队，提示和现在一样（「现在无法操作」「操作未完成，请重试。」「操作未完成，草稿已保留，请重试。」）。不符合资格的：跟进待办（relationship）、会面待办（meeting）、重复日程，断网后都不入队，提示不变 |
| 04 App 全量、类型检查无新增失败 | 通过 | 见第 5 节 |

先写测试再改代码：把四个页面临时换回原来的代码跑 12 条新测试，SC-01/02 的 6 条失败（应该入队，实际显示失败），SC-03 的 6 条通过（这几条用来防止以后误入队）；换回新代码后 12 条全部通过。

## 3. 改了哪些文件
| 文件 | 改动 | 原因 |
|---|---|---|
| `src/screens/todo/TodoScreen.tsx`（约 :370–454） | 「完成」「推迟」的入队代码收成一个小函数，断网分支和新的回落分支共用；请求回 status 0 且错误码是 `ORBIT_APP_NETWORK_ERROR`，并且在手机上、本机有这条待办、通过原有的 `mirroredTaskIds` 判断时，用同一个收据编号入队 | 原来只有页面已经知道断网才入队 |
| `src/screens/tasks/TasksScreen.tsx`（约 :166–199） | 勾选完成／恢复同样处理；资格沿用 `isOfflineTaskCategory`，只在手机上（新引入 `Platform`） | 同上 |
| `src/screens/tasks/TaskDetailScreen.tsx`（约 :184–218） | `mutate` 里待办本身的写入（标题、日期、完成、删除）在传输层失败时入队；要求在手机上、本机有这条待办、类别符合 `isOfflineTaskCategory`；版本用本机副本的 revision | 同上；提醒等其他路径不变 |
| `src/screens/schedule/PersonalScheduleScreen.tsx`（约 :108–131） | 入队代码收成小函数；传输层失败时，如果在手机上、有本机队列、不是重复日程（`isOfflineScheduleEditable`）、新建时没设重复，就入队，并像断网保存一样跳转 | 同上 |
| `tests/helpers/offline-page-harness.ts` | 新增两个可选项：`writeFailure`（写请求按指定状态失败，0 表示断网，读请求照常回答）；`toasts: true`（挂上 ToastProvider，测试才看得到提示） | 原来只能整页离线，模拟不了「页面以为在线、保存时断网」 |
| 三个测试文件 | 12 条新测试，复用各文件已有的数据和写法 | SC-01..03 |

## 4. 判断
- **没有抽共用函数。** 四个页面入队的对象、版本来源和成功后的界面都不一样，真正重复的只有一行判断（status 0 且错误码是网络错误），项目里其他地方也是直接写在原处，所以照这个写法。每个页面内部把原来的断网入队代码收成一个小函数，避免同一段入队代码写两遍。
- **收据编号沿用刚才那次请求的。** 断网时请求可能已经到了服务器，用同一个编号上传，服务器只会执行一次。
- **没有给入队记录标「已尝试过」（`requestAttemptedAt`）。** 参照的 `TaskQuickAdd.tsx` 不标，日程的入队函数也不支持这个字段；待办和日程的队列本来就不合并，标不标对上传没有影响。
- **只在手机上回落。** 网页没有本机队列，原来的断网分支也只在手机上；网页保存失败时提示不变。
- **资格完全照旧。** To-do 页按原有的 `mirroredTaskIds` 判断（含跟进待办的原规则），待办列表和详情仍只认 personal/work/other；资格调整留给 0144。
- 详情页的回落覆盖 `mutate` 里待办本身的所有写入（不只是改标题），因为原来的断网分支就是这样，两条路保持一致。
- 页面离开时客户端取消请求也会返回 status 0，但原有的 `isCurrent()` 检查会先返回，不会误入队。

## 5. 命令与结果
在 `repos/orbit-app`：
- 定向：`node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/todo-offline-browser.test.tsx tests/offline-pages-tasks.test.tsx tests/offline-pages-schedule.test.tsx` — 新增 12 条全部通过，三个文件的原有测试也都通过。
- 类型检查：`npm run typecheck` — 0 错误。
- 全量：`npm test` — **3389 条，3384 通过，3 失败，2 跳过**。3 条失败都是原有的，和本次改动无关：
  - `api-schema-sync.test.ts`「API Schema 副本与服务端真源保持逐字一致」：`calendar-external-events.ts`、`event-discover.ts`、`network-analysis-view.ts` 三个副本过期；
  - `contract-sync.test.ts`「契约副本与源逐字一致」：`calendar-external-events.ts`、`event-discover.ts` 两个副本过期；
  - `route-parity.test.ts`「native app has a route for every web app surface」：缺 `/settings/account/delete`。
  - 为什么确定是原有的：这三条只比较契约副本、服务端源文件和路由文件，本次一个都没碰（改动只有四个页面、三个测试文件和测试工具）；本分支起点和 `chat-agent` 只差文档；单独重跑这三个文件结果相同（12 通过 / 3 失败）。因此没有另开 worktree 复核。

## 6. 提交
- `a31608623` fix(app): queue to-do and personal schedule saves when the request loses the connection
- 本报告单独一个 docs 提交。

## 7. 未决
1. 上面三条全量失败需要有人跑 `npm run sync:contract`，并补上 `/settings/account/delete` 路由或记为例外，不在本 Sprint 范围。
2. 本次只有自动测试，没有在 Simulator 上手动断网验证。

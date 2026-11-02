# Sprint 0143 报告：活动准备页「加入日程」可断网、不重复

## 1. 状态
**已完成，等协调者复核合并。**
- 分支 `offline-fixes-20261102`，worktree `/Volumes/ORICO/Dev/worktrees/orbit/offline-fixes`，起点 `bc21f2a5d`（0142 已在本分支完成）。
- 未推送，未部署，未碰 Neon / Vercel / 正式库。登记表未改，由协调者更新。

## 2. 验收
| SC | 结果 | 证据 |
|---|---|---|
| 01 断网或传输失败时入队，日历显示「未同步」 | 通过 | `tests/offline-pages-event-prep.test.tsx`：手机上页面已知断网时点「添加」，不发请求，进待上传队列（新建、`local:` 编号、无版本号），提示「已存在本机，联网后同步。」，建议卡收起；拿这一条打开日程详情，显示标题和「未同步」。页面以为在线但请求断了（status 0）时，先试一次，再用发出去的同一个编号入队。服务器回 409 / 500 不入队，照旧提示「没有成功，请再试一次」，卡片留着可以重试。浏览器上断网或请求断了，提示「需要联网」，不入队 |
| 02 同一活动项重复点击／重试用同一编号，只生成一条 | 通过 | 同文件：连点两下只发一次请求；第一次 500 失败后再点，第二次请求和最后入队的那条用的都是第一次的编号 |
| 03 使用手机时区 | 通过 | 同文件：页面跑在纽约时区，发出去的 `timeZone` 是 `America/New_York`，开始／结束时间不变；伦敦时区断网入队，队列里的 `timeZone` 是 `Europe/London` |
| 04 App 全量测试、类型检查无新增失败 | 通过 | 见第 5 节 |

先写测试再改代码：5 条新测试在原代码上全部失败（找不到入队、编号每次不同、时区是东京、浏览器没有「需要联网」）；改完后全部通过。

## 3. 改了哪些文件
| 文件 | 改动 | 原因 |
|---|---|---|
| `repos/orbit-app/src/screens/events/v2/PrepPage.tsx`（约 :63–70） | 取登录账号和服务器地址，用日程页同一个 `usePersonalScheduleWriteStatus` 拿到「是否断网」和本机待上传队列；用 `useOrbitTimeZone` 拿手机时区；加一个记录「正在保存」和「这条建议对应哪个编号」的 ref | SC-01/02/03 |
| `repos/orbit-app/src/screens/events/v2/PrepPage.tsx`（`addFollowup`，约 :118–149） | 时区改成手机时区；按「活动 + 这条日程内容」记住编号，重试复用；保存中再点直接忽略；手机上断网直接入队，请求断了（status 0 + `ORBIT_APP_NETWORK_ERROR`）用同一编号入队，入队走 `buildOfflineScheduleMutation`，和日程页 0134/0141 一样；浏览器或没有队列时提示「需要联网」；其他失败照旧提示 | 同上 |
| `repos/orbit-app/tests/helpers/offline-page-harness.ts` | 记录每次 POST 的请求体（`postBodies`）；`timeZoneId` 让测试页按指定时区运行 | 测试要看发出去的编号和时区 |
| `repos/orbit-app/tests/offline-pages-event-prep.test.tsx`（新） | 5 条测试，用现有 `journeyPrep()` 演示数据（去掉 `sample`，示例活动本来就不写日历） | SC-01/02/03 |

## 4. 判断
- **没有抽公共函数。** 和日程页重复的只有「组装入队那几行」，两边的成功后动作（跳转 vs. 收起卡片 + 提示）不同，抽出来反而要多传参数，就在页面里照着写。
- **编号沿用页面原来的 `newIdempotencyKey()`**（`app-…`），没有改成日程页的 `ios:personal:…`；队列只要求请求体里的编号和队列编号一致。
- **入队后的提示用现有的 `schedule.offlineQueued`**（「已存在本机，联网后同步。」，三种语言都有），没有新加文案。
- **请求头没加 `x-orbit-personal-schedule-version: 3`**，在线请求保持原样；入队那条由上传器自己带这个头。
- 页面多了一次日程镜像的轻量检查（和日程页一样，没变化时回 304），用来知道是否断网。
- 编号只在这一次打开页面内有效：入队或成功后建议卡就收起；离开再进来又出现的老问题（在线时也一样）不在本 Sprint 范围。

## 5. 命令与结果
在 `repos/orbit-app`：
- 定向：`node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/offline-pages-event-prep.test.tsx` — 5 条全部通过；把 `PrepPage.tsx` 换回原代码跑，5 条全部失败。
- 类型检查：`npm run typecheck` — 0 错误。
- 全量：`npm test` — **3394 条，3389 通过，3 失败，2 跳过**。3 条都是本基线上已知的原有失败：`api-schema-sync.test.ts`（API Schema 副本逐字一致）、`contract-sync.test.ts`（契约副本逐字一致）、`route-parity.test.ts`（每个网页都有 App 路由）。

## 6. 提交
- `498fa82b7` fix(app): save the event prep follow-up like a personal schedule
- 本报告单独一个 docs 提交。

## 7. 未决
1. 只有浏览器里模拟手机的自动测试，没有在真机上断网点「添加」再联网验证到达服务器。
2. 离开准备页再进来，建议卡会重新出现，再点会生成新编号（在线时也是这样），如需要可另开 Sprint 按活动记住「已加入」。

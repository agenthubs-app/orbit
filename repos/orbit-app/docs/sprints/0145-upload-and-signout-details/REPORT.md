# Sprint 0145 报告：上传时限、退出登录和临时编号跳转

## 1. 状态
**已完成，等协调者复核合并。**
- 分支 `offline-fixes-20261102`，worktree `/Volumes/ORICO/Dev/worktrees/orbit/offline-fixes`，起点 `b2ea73ef3`（0144 已在本分支完成）。
- 未推送，未部署，未碰 Neon / Vercel / 正式库，没有改服务器。登记表未改，由协调者更新。

## 2. 验收
| SC | 结果 | 证据 |
|---|---|---|
| 01 一轮上传共享 30 秒，超时项留待下次 | 通过 | `tests/outbox-uploader.test.ts` 两条：调用方给的截止时间已过时，上传器一条都不领取，行还在队列里、尝试次数是 0、结果是 `time_budget`；真 SQLite 里放一条笔记和一条待办，笔记请求用掉 31 秒，`uploadAllOutboxes` 不再开始待办，待办仍在队列、尝试次数 0，笔记也仍在队列（没丢）。原有的顺序、4 条并行、5 次、退避测试照旧通过 |
| 02 在线且有待同步时出现「先同步再退出」，只弹一次选择 | 通过 | `tests/auth-session-provider-races.test.ts` 四条：有 2 项待同步且服务器可达时，只弹待同步选择（不先问通用确认），选项是 先同步再退出 / 放弃修改并退出登录 / 加密保存并退出登录 / 取消，正文「还有 2 项修改没有同步。退出后会在这台设备上保留 30 天，用同一账号登录会继续上传。」，选「先同步再退出」跑一轮后队列空了直接退出；跑完还剩 1 项时再弹保留／放弃，正文写 1 项，没有「先同步再退出」；服务器不可达时没有这个选项；队列为空时照旧先问通用确认，拒绝则什么都不做。`tests/account-settings-sign-out.test.tsx`：有待同步时设置页不再弹「退出登录？」，「先同步再退出」走一次同步会话的 `synchronize`；原有三条照旧通过 |
| 03 待办、日程详情的临时编号在上传后跳到正式编号 | 通过 | `tests/offline-pages-tasks.test.tsx`、`tests/offline-pages-schedule.test.tsx` 各一条：详情页开着 `local:` 编号，模拟上传确认（队列行消失、正式行到达、别名表有记录），页面 `router.replace` 到 `/tasks/task%3Aformal`、`/schedule/personal/personal%3Aformal`；整个过程用 MutationObserver 盯着，没出现过「待办暂时打不开」「无法确认日程数据」 |
| 04 App 全量测试、类型检查无新增失败 | 通过 | 见第 5 节 |

先写测试再改代码：新加的 9 条测试在原代码上都失败，改完后全部通过。

## 3. 改了哪些文件
| 文件 | 改动 | 原因 |
|---|---|---|
| `src/data/sync/outbox-uploader.ts`（:7、:58–70） | `run({ deadline })`：本轮截止取「自己 30 秒」和调用方截止中更早的那个；`MAX_ROUND_MS` 导出 | SC-01 |
| `src/data/sync/upload-outboxes.ts`（:23、:35–36） | 一轮开始算一个截止时间，传给 6 个上传器；到点后后面的上传器不再开始；`now` 也传下去，大家用同一个钟 | SC-01 |
| `src/data/sync/message-outbox-upload.ts` | `run` 把截止时间转给内部上传器 | 消息上传器包了一层 |
| `src/api/AuthSessionProvider.tsx`（:76、:133–139、:667–699） | `signOut({ confirmSignOut, syncFirst })`；有待同步时只弹待同步选择，在线时多「先同步再退出」，跑完重新数，空了直接退，没空再弹保留／放弃（带剩余数）；队列为空才问 `confirmSignOut` | SC-02 |
| `src/screens/me/AccountSettingsScreen.tsx`（:24–35） | 通用确认交给 `signOut` 决定要不要问；`syncFirst` 走 `useSyncCoordinatorSession` 的 `synchronize("note", { reason: "explicit" })`，和前台、15 秒轮询是同一个单飞入口 | SC-02 |
| `src/i18n/{zh,en,ja}/session.ts`、`src/i18n/copy-kinds.ts` | `session.pendingChangesBody` 改成设计稿原文（带数量）；新增 `session.syncAndSignOut` | 原正文没有数量；保留／放弃两个按钮沿用原文案 |
| `src/data/sync/sync-coordinator.ts`（:150、:823–836） | 新增 `resolveLocalAlias(kind, localId)`，按种类查别名表；`resolveNoteAlias` 改为调用它 | SC-03 |
| `src/data/sync/useLocalAlias.ts`（新） | 临时编号的排队新建没了以后查别名；查到之前 `pending`，查到给出正式编号 | 待办、日程共用 |
| `src/screens/tasks/TaskDetailScreen.tsx`（:98–103、:527、:542–543） | 查到正式编号就 `router.replace`；等待和跳转期间显示加载，不显示「待办暂时打不开」「需要联网」 | SC-03 |
| `src/screens/schedule/personal-schedule-source.ts`、`personal-schedule-source-mirror.ts`、`PersonalScheduleDetailScreen.tsx` | 原生数据源带上 `canonicalId`，等待时是加载、不报错；详情页查到就跳 | SC-03 |
| `scripts/audit-offline-read-surfaces.ts`（:28–29） | 待办详情两处请求行号各 +1 | 多了一行 import，离线清单按行号对；以前的 sprint 也是这样改 |
| 测试 | 见第 2 节；测试页工具加 `fixture.bump(patch)`（改设备状态并重新渲染，模拟上传确认）和 `resolveLocalAlias` | |

## 4. 判断
- **30 秒按整轮算，单个上传器仍保留自己的 30 秒上限。** 两者取早的，单独调用上传器时行为不变。到点时正在发的请求照旧被中止、标回排队（这一条原来就会算一次尝试）；还没轮到的行和后面的上传器完全不碰。
- **「先同步再退出」只看两件事算在线**：不是离线身份进入的，且这个服务器最近没有被记为连不上。没有额外发探测请求。
- **同步失败不报错**：跑完不管成功与否都重新数队列；冲突、未能保存的行也算没同步，会进入保留／放弃。
- **第二次弹窗不再给「先同步再退出」**，按 GOAL 写的「传不完仍可选保留或放弃」，避免反复点同步。
- **按钮文字沿用原有的「加密保存并退出登录」「放弃修改并退出登录」**，没有改成设计稿的「退出」。只改了正文（要带数量）。
- **通用确认放进 `signOut` 里问**：要先数队列才知道该弹哪个，放在设置页会数两次。设置页拒绝通用确认时不显示任何提示（`cancelled: true`），和原来一样；拒绝待同步选择仍显示「已取消退出登录。」，也和原来一样。
- **待办、日程用 `router.replace` 换地址**，不是像笔记那样在页面内换编号：这两个页面的服务器请求、编辑状态都按地址里的编号走，换地址最省事，返回也不会回到临时编号。
- **网页版不受影响**：网页没有本机队列，`local:` 编号也不会出现。

## 5. 命令与结果
在 `repos/orbit-app`：
- 定向：`node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs` 跑 `outbox-uploader`、各 `*outbox*`、`offline-write-acceptance`、`auth-session-provider-races`、`account-settings-sign-out`、`me-settings`、`offline-pages-tasks`、`offline-pages-schedule`、`offline-read-inventory` 和各 locale／copy 测试，全部通过。
- 类型检查：`npx tsc --noEmit` — 0 错误。
- 全量：`npm test` — **3412 条，3406 通过，4 失败，2 跳过**。其中 3 条是已知的原有失败（`api-schema-sync.test.ts`、`contract-sync.test.ts`、`route-parity.test.ts`）；第 4 条是 `offline-read-inventory.test.ts` 的行号清单，因为待办详情多了一行 import，已改 `scripts/audit-offline-read-surfaces.ts` 修好，单独复跑该文件 27 条全过。修好后全量应为 3407 通过、3 失败，没有整套重跑。

## 6. 提交
- `d3b5fe78e` fix(app): share one 30 s budget across a whole upload round
- `d0551a648` fix(app): offer 先同步再退出 when signing out with unsynced writes
- `9f5b90a5d` fix(app): move task and schedule details from a local id to the formal id after upload
- 本报告单独一个 docs 提交。

## 7. 未决
1. 只有自动测试，没有真机断网验证（尤其是退出时同步一轮要等多久的体感）。
2. 设计稿第 9 步的按钮文字是「退出」，App 仍是「加密保存并退出登录」；要不要统一，等用户决定。

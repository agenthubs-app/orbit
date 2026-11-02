# Sprint 0144 报告：离线资格表和实际一致

## 1. 状态
**已完成，等协调者复核合并。**
- 分支 `offline-fixes-20261102`，worktree `/Volumes/ORICO/Dev/worktrees/orbit/offline-fixes`，起点 `b823a560e`（0143 已在本分支完成）。
- 未推送，未部署，未碰 Neon / Vercel / 正式库。登记表未改，由协调者更新。

## 2. 验收
| SC | 结果 | 证据 |
|---|---|---|
| 01 三类断网操作登记在资格表，保存时和上传前走同一检查；「完成并记录结果」仍需联网 | 通过 | `tests/offline-policy-alignment.test.ts`：表里跟进的 complete / update 是断网可做，reopen / cancel / delete 需要联网；iOrbit 历史 PATCH / DELETE、联系人 DELETE 是断网可做；表里每一行和设备上的 `isOfflineEligible` 逐条一致。`lf12-contact-delete-outbox`、`inbox-ai-sync`：协调器对表里没有的操作直接拒绝（「not offline eligible」），不入队；正常删除联系人照旧入队；表里没有的已存行上传前不发。跟进的窄规则（只能直接完成或推迟到更晚）原有测试 `sync-coordinator-lease` 照旧通过 |
| 02 资格表不再允许发消息；已排队的旧消息仍可重试／放弃 | 通过 | `relationship-message-outbox`：发送登记为需要联网，协调器拒绝新消息、队列为空；直接放进队列的旧消息照旧上传、按顺序到达、被拒后可重试、可放弃、保险箱往返后可上传。`offline-write-acceptance` 全链矩阵照旧通过（消息改为直接放进队列） |
| 03 断网被挡的待办显示「需要联网」；笔记有排队修改时不能删并说明 | 通过 | `todo-offline-browser`：页面断网时点「完成」「推迟」，设备拒收，提示「需要联网」，没有「现在无法操作」，不发请求。`notes-interactions`：笔记有排队修改时点「删除笔记」，显示「这条笔记还有修改没同步，同步完成后才能删除。」，不弹确认、不发 DELETE。`memo-delete-note`：排队、冲突、未能保存三种状态都不发请求 |
| 04 App 全量测试、类型检查无新增失败 | 通过 | 见第 5 节 |

先写测试再改代码：新加的测试在原代码上失败（只有「上传前不发」那条原本就通过，见第 4 节）；改完后全部通过。待办那条单独换回原 `TodoScreen.tsx` 复跑，失败。

## 3. 改了哪些文件
| 文件 | 改动 | 原因 |
|---|---|---|
| `src/api/schema/offline-policy.ts`（约 :29–37、:52–54、:64–65、:79–81） | 跟进只有 update / complete 断网可做；消息发送改为需要联网；加联系人 DELETE、iOrbit 历史 PATCH / DELETE 三行 | SC-01/02 |
| `repos/orbits/shared/api-schema/offline-policy.ts`、`repos/orbits/tests/architecture/offline-policy.test.ts` | 同上，逐字同步；服务器的资格表测试矩阵跟着改 | App 副本必须和真源逐字一致（0135 也是两边一起改）。只是共享表和它的测试，没有改服务器行为 |
| `src/data/sync/mutation-adapters.ts`（`isOfflineEligible`） | 不再手写列表，改为读资格表 | 保存时和上传前查的就是这张表 |
| `src/data/offline/policy-registry.ts` | 去掉把跟进强制改成需要联网的覆盖 | 表里已经是允许的子集 |
| `src/data/sync/sync-coordinator.ts`（约 :931、:948、:1008） | 跟进、iOrbit 历史、联系人删除入队前都查 `isOfflineEligible` | 不再绕过 |
| `src/data/sync/contact-outbox-upload.ts`、`ai-session-outbox-upload.ts` | 上传前再查一次 | 上传前检查 |
| `src/screens/todo/TodoScreen.tsx`（约 :376、:406、:416、:459） | 断网被挡、或断网时设备拒收，提示 `sync.needsNetwork`；其他失败仍是 `todo.unavailable` | SC-03 |
| `src/screens/memo/delete-note.ts`、`MemoDetailScreen.tsx`、`MemoListScreen.tsx` | 笔记有排队／冲突／未能保存的修改时不删，先提示；`deleteNoteOnServer` 也兜底返回 `pending` | SC-03 |
| `src/i18n/{zh,en,ja}/notes.ts` | 新增 `notes.deletePending` | 没有合适的现成文案 |
| 测试 | 新增 `offline-policy-alignment.test.ts`；改 `offline-mutation-eligibility`、`relationship-message-outbox`、`offline-write-acceptance`；加 `lf12-contact-delete-outbox`、`inbox-ai-sync`、`todo-offline-browser`、`notes-interactions`、`memo-delete-note`；测试页工具加 `enqueueRefused` | |
| `docs/designs/2026-09-28-offline-write/offline-write-design.html`、`docs/sprints/0120-offline-write-design/REPORT.md` | 第 6 步表下和 D6 加 2026-11-02 用户决定的说明 | 设计案同步 |

## 4. 判断
- **消息发送没有删行，改成「需要联网」。** 表里仍能查到这个接口，只是不再断网排队；发送队列和上传器代码都保留。
- **改了 orbits 里的共享表。** 不改的话 App 副本和真源不一致，下次同步契约会把 App 的改动悄悄覆盖。0135、0142 也在本分支改过 orbits。
- **上传前检查对联系人、iOrbit 历史基本是第二道保险**：已存的行要先通过原来的解析，解析要求的种类和操作正好就是表里允许的那几种，所以「上传前不发」那条测试在原代码上本来也通过。保留它是为了以后表变了也挡得住。
- **跟进没有加上传前检查**：跟进在队列里和个人待办一样是 task，上传器看不出是不是跟进；保存时已经查过表和窄规则。
- **笔记有冲突或「未能保存」时也不让删**，不只排队中。这几种情况笔记都带着未同步的修改，先处理（重试、放弃或选版本）再删。
- **i18n 快照测试不用改**：它只算拆分前那批键的摘要，新键不在里面。
- **待办断网时「完成」「推迟」按钮本来就灰掉**（设备上没有这条时），所以「需要联网」主要出现在设备拒收那一刻。

## 5. 命令与结果
在 `repos/orbit-app`：
- 定向：`npx tsx --test --import ./tests/helpers/register-render-hooks.mjs` 跑上面改动的测试文件，全部通过。
- orbits：`npx tsx --test tests/architecture/offline-policy.test.ts` — 4 条通过。
- 类型检查：`npm run typecheck` — 0 错误。
- 全量：`npm test` — **3403 条，3398 通过，3 失败，2 跳过**。3 条都是已知的原有失败：`api-schema-sync.test.ts`、`contract-sync.test.ts`、`route-parity.test.ts`。`offline-policy.ts` 两边逐字一致，没有加重 `api-schema-sync` 的不一致。

## 6. 提交
- `7a5be52e0` fix(app): one offline table for follow-ups, iOrbit history and contact delete; drop message send
- `ea34352a4` fix(app): offline-blocked to-do writes say 需要联网
- `602aea5b3` fix(app): block note delete while an edit waits to sync
- `c95dbd937` docs(0120): note the 2026-11-02 offline scope decision (D6, step 6)
- 本报告单独一个 docs 提交。

## 7. 未决
1. 设计案 HTML 已发布的 artifact 没有重新发布，只改了仓库里的文件。
2. 只有自动测试，没有真机断网验证。

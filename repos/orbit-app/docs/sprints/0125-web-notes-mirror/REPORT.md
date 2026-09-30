# Sprint 0125 执行报告：浏览器版 App 断网也能看笔记

**run-01**。Generator 为子代理（没有再派子代理），报告由协调者代存。分支是 `sprint/0125-web-notes-mirror`，基线 `7d0f88720`，开工提交 `8d7f12168`。最后一个功能提交是 `b48dc695e`，另有一个文档提交 `6e6e81778`。没有推送。

**状态：completed。** 五项 SC 都有同一版本的证据。另外修了两个隐私缺口，是做浏览器测试时发现的（第 3 节）。

## 1. 结论

- **断网能看笔记**：浏览器版在 `localhost`（secure context）下，笔记列表和详情先显示浏览器里的加密副本，再在后台同步。
  - 断网时显示「无法连接 · 显示截至 X 的内容；新建和编辑需要联网」。
  - 「新建」「编辑」「IORBIT 总结」都禁用，和原生 App 一致。
  - A、B 两个账号都在真实的 phoneweb 上截了在线和断网的图。
- **没有另写一套逻辑**：原生笔记的镜像读取挪进了 `notes-source-mirror.ts`，原生和浏览器共用。浏览器只在镜像不可用时才走原来的服务器搜索，例如经局域网 IP 访问的非 secure context。
- **威胁模型已更新**：写明了用户 2026-09-27 的决定、接受的风险和已有的缓解措施，见第 4 节。
- **已有的浏览器不用清库重建**。升级后第一次同步只多拉一次 notes 的第一页。待办和个人日程的游标不变，不会重拉。
  - 同步完成前，笔记页显示「正在同步」，不会显示成空列表；这时断网则显示错误。
  - 测试第 1–2 步和 phoneweb 的请求记录都证明了这一点。
- **付费调用 0 次**。IORBIT 总结一次也没点。

## 2. 验收

| SC | 结果 | 证据 |
|---|---|---|
| 01 笔记落盘是密文，元数据是明文 | 通过 | `web-notes-mirror-browser` 第 1 条。重载页面后逐字节读 OPFS 里所有文件：找不到笔记的标题、正文和「third-party detail」。对照组能找到记录 id 和密文片段，说明扫描确实读到了文件。SQL 层的 `payload_json` 都是 `orbit-aesgcm-v1:` 格式 |
| 02 换账号、换服务器、撤权后，旧身份的笔记行不再存在 | 通过 | 同一条测试覆盖四种情况：撤权（重载后才拿到新租约，删掉的是真实的行，待办不受影响，空闲页里也没有残留）、同一页面内换账号、新页面换账号、同一页面内换服务器。每种都删了密钥，OPFS 里也扫不到旧的记录 id。phoneweb 上同一浏览器 A→B 时，密钥从 `337bf221…` 变成 `735e7c8f…`，A 的笔记数为 0 |
| 03 本地优先、断网「截至」、在线写入后本地随之更新、别处的改动同步后可见 | 通过 | 渲染测试 `notes-web-local-first` 5 条（按浏览器方式解析 `.web` 文件）。phoneweb 双账号共 14 张截图。另一个浏览器上的 A 用 App 编辑页改了标题，第一个浏览器下一次同步后能看到，断网后仍然保留。编辑页显示「笔记已更新。」，没有出现「本地同步待处理」 |
| 04 非 secure context 仍然不落盘、不报错 | 通过 | 真实 Chromium 用 `http://insecure-orbit.test`（映射到 127.0.0.1），`isSecureContext=false`。状态是 online-only / insecure-context，没有拉任何同步页，没有 OPFS API，没有建密钥库，没有报错。渲染测试确认此时笔记页走服务器读取，也不显示离线提示条 |
| 05 文档、全量、typecheck | 通过 | 见第 4 节和第 6 节 |

## 3. 设计选择，以及测试中发现并修掉的问题

- **复用逻辑**：原生的 `notes-source.ts` 和 `note-source-tasks-source.ts` 现在只是薄包装，逻辑移到了 `notes-source-mirror.ts` 和 `note-source-tasks-mirror.ts`。
  - 浏览器版照待办页（0078）的做法：两个数据源每次都运行，保证 hook 顺序不变；不当前用的那个不发请求。
  - 镜像 hook 加了一个 `enabled` 参数，只控制打开页面时那次探测。浏览器走网络时不会去探镜像。
- **缺口一：会话过期后，上一个账号的镜像留在浏览器里**（新页面换账号时暴露，RED 记录在 `red-fresh-page-account-switch.txt`）。
  - 原来只有同一页面内切换身份才会清库。A 的会话过期后，B 在新页面登录，A 的库和密钥还留在 OPFS 里。这是 0077 以来就有的问题，但笔记进镜像后风险大得多。
  - 现在打开任何身份时，都会删掉本源里其他身份的密钥和库文件，先删密钥再删文件。
  - phoneweb 上实测：A 的会话结束后 B 登录，只剩 B 的密钥。
- **缺口二：撤权后的行留在空闲页里**（RED 记录在 `red-revocation-freed-pages.txt`）。
  - SQLite 删除行时不会清零空闲页，所以撤权后 OPFS 里还能扫到记录 id 和密文。浏览器的密钥仍在，这些密文可以被解密。
  - 现在浏览器镜像的连接开启 `PRAGMA secure_delete = ON`。原生是整库加密，不需要。

## 4. 威胁模型文档（`docs/phoneweb/local-mirror-threat-model.md`）

- 第 1 节的白名单加入 notes，加密范围一行写明 `secure_delete`。
- 第 2 节 notes 从「否」改为「是」，并新增一小节「笔记：决定与接受的风险」：
  - **决定**：用户 2026-09-27 放开，phoneweb 断网也要能看笔记。
  - **接受的风险**：同源脚本（XSS、被注入的第三方脚本、能注入本站的扩展）可以借用不可导出的密钥解密笔记正文，包括联系人笔记里关于第三方的私密内容。
  - **已有缓解**：
    - 按源隔离；
    - 每条笔记独立 IV 的 AES-GCM 落盘加密；
    - 换身份时清库删钥，同一个源只保留一个身份；
    - 撤权按 epoch 清空，加上 `secure_delete`；
    - 非 secure context 不落盘；
    - 退出登录、清除站点数据时一起删除。
  - **未缓解**：页面打开期间，同源脚本可以读到当前账号的全部笔记。这要靠站点自己防 XSS。
  - **升级影响**：已有浏览器只多拉一次；升级前删掉的旧行可能仍在空闲页里，要等下次换身份删库时才消失。
- 第 3 节的威胁表同步补充了以上内容。

## 5. 文件

- **App 源码**：
  - `src/data/sync/web-mirror-storage.ts`（白名单）
  - `src/data/sync/sync-lifecycle.web.ts`（清除其他身份、secure_delete）
  - `src/data/sync/web-mirror-key.ts`（`listWebMirrorKeyDigests`）
  - `src/screens/notes/notes-source-mirror.ts`（新）、`note-source-tasks-mirror.ts`（新）
  - `notes-source.ts`、`notes-source.web.ts`、`note-source-tasks-source.ts`、`note-source-tasks-source.web.ts`
  - zh/en/ja 词典的 `settings.localMirrorReady` 和 `settings.localMirrorActive`（加上「笔记」）
  - `route-domain-inventory.ts`（只改注释）
- **新增测试**：
  - `tests/web-notes-mirror-browser.test.ts`，2 条，真实 Chromium，证明 SC-01、02、04 和升级路径。
  - `tests/notes-web-local-first.test.tsx`，5 条，证明 SC-03：镜像为源时不发 /api/notes；断网显示「截至」，新建、编辑、AI 入口都禁用；保存后拉取一次；非 secure 时走服务器且不报错。
- **修改的旧测试**：
  - `web-mirror-storage-browser`、`web-tasks-mirror-browser`、`local-sync-repository`：白名单现在含 notes，同步请求里多了 notes 的一页。
  - `local-first-source-selection`：源码守卫改为「浏览器复用镜像 hook」。
  - `notes-interactions`、`notes-list-interactions`：这两个测试测的是浏览器网络路径，补了替身，把镜像状态设为 online-only，与 `app-wide-workspaces` 的做法一致。
- **RED 记录**在 `build/harness-state/evidence/sprint-0125/run-01/commands/`：
  - `red-web-notes-mirror-browser.txt`：白名单缺 notes。
  - `red-notes-web-local-first.txt`：4 条失败 / 5 条；第 5 条是非 secure 的回退路径，旧代码本来就通过，是守护用例。
  - `red-fresh-page-account-switch.txt`、`red-revocation-freed-pages.txt`。

## 6. 提交与测试

- `b48dc695e` feat(app): browser notes read the local mirror; one identity per origin; secure_delete (0125)
- `6e6e81778` docs(phoneweb): notes join the browser mirror — user decision, accepted risk, mitigations (0125)
- **App 全量**：3698/3698 通过（`app-full-suite-final.txt`）。
  - 第一次全量没有输出汇总就以 exit 1 结束，它和 Next 构建、expo 导出同时在跑。
  - 第二次全量是 15 条失败：1 条是我没改的白名单断言（已修）；另 14 条是 ink-signal 等界面测试 2–3 秒超时，当时我在同时跑运行时浏览器。这 8 个文件单独重跑，455/455 通过。
  - 最后在机器空闲时跑的全量是 0 失败。
- **orbits 全量**：5202 条，4735 通过，0 失败，466 跳过。orbits 这次没有改代码。
- **typecheck**：App 的 `typecheck`，orbits 的 `typecheck` 和 `typecheck:app`，全部 0 错误。
- **Postgres 环境测试**：没有跑。本 Sprint 没改服务端和 SQL。
- **读取量棘轮文件**：没有改动。
- **GitNexus**：
  - 索引里查不到 0108 新加的 hook，结果是 UNKNOWN，我用文本搜索确认了调用方：NotesScreen、NoteDetailScreen、EditNoteScreen、NewNoteScreen、NoteSourceTasks。
  - `WEB_MIRROR_DOMAIN_IDS` 和 `createWebSyncLifecycle` 在图里都是 LOW，但它们是身份和隐私边界，我按 H 档测试。
  - 三个词典是全局依赖，只改了两行文案。
  - 暂存区 detect-changes 结果是 low，没有受影响的流程。

## 7. 运行时证据

证据目录：`build/harness-state/evidence/sprint-0125/run-01/`，下有 `screens/` 和 `commands/`。

- **环境**：
  - `node scripts/local-stack.mjs start --build`，本机库 `orbit_events`。
  - `npm run web:export` 后，phoneweb 在 `localhost:32125`，上游是 3100。
  - Chromium 390 宽，zh-CN。脚本是 `commands/phoneweb-notes-offline.mjs`，输出在 `phoneweb-run.txt`。
- **在线**：
  - 打开笔记页只发了 lease、manifest，以及 notes、tasks、personal-schedule 各一页，没有 `GET /api/notes`。
  - 设置页显示「本地镜像已启用：笔记、待办与个人日程…」。
  - A、B 互相看不到对方的笔记。
- **断网**（`setOffline`，只用应用内的点击导航）：
  - 详情页：编辑和 IORBIT 都禁用，「需要联网」按钮 2 个。
  - 返回列表：显示「截至 01:16」提示条，笔记 2 篇，新建禁用。
  - 断网期间尝试过的请求只有 `GET /api/sync/lease` 和 `GET /api/events`（详情页读活动名，免费）。页面错误为 0。
- **另一台浏览器的改动**：A 在第二个浏览器里用编辑页改标题 → 第一个浏览器重新打开后显示新标题 → 断网后仍然保留。
- **QA 数据已清理**（`cleanup.txt`）：
  - 一个事务删除了 orbit_records 10 行（2 个账号、2 个 auth_users、4 条笔记、2 个 profiles），以及 read receipts 643 条。
  - 删除的 receipts 是两个 QA 账号的，加上运行期间 source 为 web/other 的匿名登录和注册请求。
  - `orbit_records` 行数和主键 md5 与开工前一致（`3d7541cf…`）。
  - 保留的 137 条 receipts 都是你的 3000 上演示账号（source=app）产生的，没有删。
- **进程**：local-stack 已停（3100 和两个 worker），phoneweb 已停。临时调试用的 32126 服务和 dist-debug 已删除，调试日志没有留在源码里。3000 和 Simulator 都没碰。

## 8. 需要你知道或决定的事

1. **（已存在的问题，建议单开 Sprint）用 `pushState + popstate` 跳到 /home 或 /tasks 时，会清空浏览器镜像。**
   - 我在调试构建里确认过：这种跳转会让根布局重新挂载，`AuthSessionProvider.restoreSession` 的第一步 `setScope(null)` 把当前镜像整库删掉并重建。在线时会悄悄全部重拉，断网时页面显示「同步失败」。
   - 待办页同样受影响，所以这不是 0125 引入的。
   - 应用内点击导航（列表↔详情、返回）没有触发。真实用户操作里什么会触发，例如浏览器的前进后退或错误边界重试，还没有查清。0108 的证据脚本也用过这种跳转。
   - 修的时候要改认证代码，我没有动。
2. 断网时，笔记列表的「返回首页」按钮点了没有反应，页面停在 /notes。原因没有查。
3. 离线时 IORBIT 按钮只是变灰，「需要联网」只写在读屏标签里，没有显示文字。这和原生 0108 的做法一样。
4. 运行时脚本的「另一台浏览器编辑」这一步，第一次跑时在等「笔记已更新。」时超时（20 秒）。原样重跑一次就通过了，原因没有查。
5. **生产上线**：没有迁移。重新导出并发布 phoneweb（web export）即可。已有浏览器下次同步只多拉一次笔记，不需要清库。

**工作区**只剩你原有的未提交文件：各个 codex-review.md、`.claude/skills/gitnexus/`、`output/`，以及构建时生成的 `repos/orbits/next-env.d.ts`。
## 9. 协调者复核

协调者在 `6e6e81778` 上独立复核：

- **App 全量**：3698/3698 通过。
- **新测试单独运行**：`web-notes-mirror-browser`、`notes-web-local-first` 共 7/7 通过。
- **orbits**：本 Sprint 没有改动 orbits 代码。沿用 0129 合并时协调者跑的全量结果：5202 条，0 失败。
- **截图抽查**：A 的断网笔记列表显示「无法连接 · 显示截至 9月28日 01:16」，2 篇笔记可见，「新建」置灰，符合 App 视觉规范。
- **第 8 节第 1 条**（恢复会话时清空本地副本）：协调者在代码里核实过，`AuthSessionProvider.restoreSession` 的第一步是 `setScope(null)`，原生和浏览器在已有作用域时都会 `purge()`，所以**原生同样有风险**。协调者评为 P1，新建 **0130**，排在 0109 之前。第 8 节第 2 条「返回首页按钮没有反应」一并交给 0130。
- **第 8 节第 3、4 条**记为 P2。
- **diff 审查**：codex-review.md 没有被提交。

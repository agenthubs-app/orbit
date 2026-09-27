# Sprint 0104 执行报告：旧 chat 退役（消息 M1），App 收件箱跳过未知通知类型

**run-01**。Generator 是子代理，报告由协调者代存。分支 `sprint/0104-legacy-chat-retirement`，未推送。Planner SHA256 为 `7c705fc5…`。
**状态：completed**（协调者复核见最后一节）。

## 1. 结论

- **旧 chat 接口全部删除**，本地生产构建实测返回 404：`/api/chat/conversations*`、`/api/chat/privacy*`、`/api/chat/assist/followup-draft`。旧服务、存储层、mock/debug 页、网页 chat 路由模型、能力登记也一并删除。
- **回复草稿改为挂在新系统的对话上**：新增 `GET/PUT /api/relationship-communication/conversations/[id]/draft`。只有这段对话的参与者、且绑定有效时才能读写；按编号精确读取；每个账号只看到自己的草稿。App 与网页都能保存、刷新后读回；发送成功后草稿清空。
- **App 删掉三处必然失败的调用**，界面入口一并删除：收件箱的隐私设置、「允许分析」开关，聊天详情的「提取要点」。
- **网页 iOrbit 页不再读旧 chat**：页面只用到其中 `viewModel.suggests`（三条示例问题），改为固定的 starter；改前改后截图一致。
- **网页的「改写」「起草邮件」照常可用**：`/api/chat/assist/rewrite` 原来会整类读取旧对话，对新系统的对话一律返回 409；现在只根据请求里的文字生成，返回 200。
- **App 收件箱逐条校验**：未知的分类、未知的来源类型、单条格式错误都会被跳过，未读数相应扣除；如果出现别的账号的条目，仍然整页拒绝。
- **本地数据**：种子脚本不再生成旧集合。新增 `npm run db:cleanup:legacy-chat`，默认只预演；在本地库删除 86 行，再执行删除 0 行；目标不是本地库时，必须带确认参数。
- **读取上限棘轮**：164 → 162。

## 2. 逐项验收

| SC | 结果 | 证据 |
|---|---|---|
| 01 | 通过 | 5 条真库草稿测试，改前全部失败，覆盖：参与者存取与清空、跨账号隔离、第三人与不存在对话返回 404 且不写库、超长草稿返回 400、撤销后返回 404。另有记录型 store 证明没有读旧集合 |
| 02 | 通过 | App 测试改前 RED；phoneweb 上改后不再发出任何 `/api/chat/*` 请求；旧接口 404；改写从 409 变为 200 |
| 03 | 通过 | Postgres 语句日志：改前有 5 条查询读旧集合，改后剩 1 条，来自 profile-signal，不属于旧 chat；小票上查询数从 35 降到 27 |
| 04 | 通过 | `inbox-notification-tolerance.test.ts` 改前 RED，改后 3/3 通过 |
| 05 | 通过，Simulator 未跑（设备未运行） | 棘轮 162；全量与 typecheck 见第 4 节；phoneweb 走过全程 |

## 3. 设计取舍

1. **「保存草稿」其实是两样东西**：
   - 新建对话的暂存草稿线程：保留原路径，只是不再读旧集合。网页联系人页的「起草邮件」依赖它，所以不能删。
   - 回复草稿：原来只存在页面上，现在落库，挂在新系统的对话上。
2. **AI 的 `chat.context` 也借用过旧 chat**，只在没有登录账号时才会用到，现在改为直接回退。
3. 没有新增管理接口，也没有新增整类读取。

## 4. 测试（子代理执行）

- **orbits 全量**：
  - 第 1 次：43 条失败，其中 10 条是本 Sprint 让断言过期了，已修。
  - 第 2 次：5135 条，34 条失败。按名字对照已知清单，只多出预约并发一条，属于已知不稳定用例。
- **App 全量**：3589 条，2 条失败：route-parity；personal-schedule「time field…」，单独跑 3 次都是 75/75 通过，判为不稳定。
- **Postgres 测试**：13/13 通过。
- **typecheck**：三处都是 0 错误。
- **删除的测试**：只删覆盖已删除功能的测试，清单见子代理报告；orbits 删了 10 个旧 chat 测试文件及若干单条用例，App 删了旧聊天视图模型相关用例；新系统（关系沟通）的测试一条没删。

提交：
- `c68ca7163` feat(orbits)：旧 chat 退役，草稿接到新系统
- `24258850e` feat(orbit-app)：删三处坏调用、回复草稿、通知逐条校验
- `6b7723260` test(orbits)：对齐 10 条过期断言

## 5. GitNexus

- `createOrbitAgentChatContextArtifactService`：HIGH，只改了「没有登录账号」这一分支。
- 第一个提交的 detect_changes 为 high，影响 AppAgentPage，已由页面测试和运行时检查覆盖。

## 6. 上线步骤

部署后先执行 `npm run db:cleanup:legacy-chat` 预演，看生产行数；确认要删，再执行 `-- --apply --confirm-remote=<workspace id>`。**这一步需要用户决定。** 不执行不影响功能。

## 7. 遗留与事故

1. **事故**：子代理停止自己在 3100 端口的服务时，用了过宽的 `pkill`，把用户在 3000 端口的 dev server 一起停了。之后重启 `npm run dev` 返回 500。协调者查明根因是 **0099 引入的回归**：`instrumentation.ts` 用提前 return 的写法挡运行时，Turbopack 仍把 Node 专用的 pg 打进了 edge 包，导致 dev 编译失败（`Can't resolve 'fs'`）；生产构建不受影响。协调者在本分支提交修复 `ec308129a`：改为文档推荐的「条件动态导入 + 单独的 Node 模块 `instrumentation-node.ts`」。dev server 已恢复：登录页 200，公开接口 200，dev 环境也能写小票。**公网隧道（zrok/ngrok）当前没有进程在运行，需要用户决定是否重启。**
2. **还有两处读旧集合**，已经不属于旧 chat 代码：profile-signal 模块整类读取 `messages`，审计模块读取 `conversations`。已加入 0109 的范围。
3. Simulator 没有跑。
4. 付费账本：本 Sprint 没有付费调用。

## 8. 协调者复核
以下由协调者独立执行（`ec308129a`，已包含 dev 编译修复）：

- **Postgres 测试**：设置 `ORBIT_LIFECYCLE_TEST_DATABASE_URL` 后，relationship-drafts、legacy-chat-cleanup、read-receipts 三个文件共 10 条，全部通过。
- **orbits 全量**：5135 条，4683 通过，34 失败，418 跳过。按名字对照已知清单，多出的只有预约并发一条，它在已知不稳定清单里。
- **App 全量**：3589 条，1 条失败，是 route-parity。
- **diff 审查**：没有新增 skip 或 only。棘轮基线只删了两条旧 chat 记录（164 → 162），并附有原因说明。
- **运行时**：3000 端口的 dev server 已由协调者用修复后的代码重启，登录页返回 200，公开接口返回 200，小票能正常写入。

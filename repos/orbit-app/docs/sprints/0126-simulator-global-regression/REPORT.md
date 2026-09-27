# Sprint 0126 执行报告：Simulator 全局回归

**run-01**。Generator 为子代理（没有再派子代理），报告由协调者代存。分支 `sprint/0126-simulator-global-regression`，基线 `b3ca6c601` + 开工提交 `5097f47bb`，最后功能提交 `e885d21c8`，没有推送。

## 1. 结论

- **修好 6 个 P1**（含已知的 Node 版本钉死），每个都先有失败的测试，再在 Simulator 上复验。
- **2 个 P1 需要你决定**：
  - **英文用户的 AI 自我介绍永远生成失败。**服务端把「关于我」限制在 80 个字符，中英文同一个上限。英文账号的一次请求里模型写了 3 版，长度 143、99、84，全部被拒，引导第 4 步每次都显示「This draft didn't come through」。中文账号第一次就成功（58/80）。要修得先定英文的上限，界面计数器现在显示 0/80。
  - **断网时重启 App，会退回登录页。**本地的笔记、日程、待办都看不到，登录页还变成英文（设备语言）。保存的登录会话没有丢，联网后重启直接恢复。原因是启动校验遇到网络错误时，不给任何身份。要修得先定「离线时能信任哪份缓存身份、信任多久」，这是威胁模型问题。0113、0120 都不含这件事，需要新排期。
- **P2 共约 30 项**，已登记去向（第 4 节）。
- 两端全量都没有失败：orbits 5185 条 0 失败，App 3668/3668。三处 typecheck 和 lint 通过，读取量棘轮文件没变。QA 数据已全部删除，66 张表行数与开工前一致。付费调用没超过三类上限，但有一类上限之外的付费调用，见第 6 节。

## 2. 验收

| SC | 结果 | 证据 |
|---|---|---|
| 01 路由矩阵 | 88 个路由文件都打开过；其中 13 个只用无效 id 验证了错误状态 | 第 3 节；`evidence/sprint-0126/run-01/screens/`、`labels/` |
| 02 十条流程 | 10 条都走了，写操作都在网页或第二账号读回；收件箱的「通知」没法在本地验证（本机没跑投递 worker） | 第 5 节 |
| 03 P0/P1 修复 | 6 个已修好并复验；**2 个待你决定，所以本项未满足** | 第 4 节；`commands/red-*`、`green-*` |
| 04 P2 登记 | 全部登记了去向 | 第 4 节 |
| 05 全量、typecheck、清理、付费 | 通过 | 第 7 节 |

## 3. 路由矩阵（截图在 `screens/`，每个路由另有同名 `labels/*.txt`）

「✓」表示能打开、内容对、返回正常。

| 路由 | 结果 | 截图 |
|---|---|---|
| (app)/ai | ✓ | R004-ai |
| (app)/contacts | ✓（修复后搜索可用） | R005-contacts、F3-07 |
| (app)/events | ✓（种子活动都已过期，「0 场」正确；QA 活动能看到） | R006-events、F4-01 |
| (app)/inbox | ✓ | R007-inbox、F6-09 |
| (app)/profile | ✓ | R008-profile |
| (app)/schedule | ✓ | R009-schedule |
| [...legacy] | 跳到首页 ✓ | R-some-legacy-path |
| index | 跳到首页 ✓ | R-acct-index |
| account | ✓（P2：名字显示成邮箱前缀） | R-acct-account |
| account/login、signup、forgot-password、reset-password、permissions、mobile-google | ✓（P2：英文界面出现中文校验提示；重置密码主按钮是蓝色） | R001、R002、F1-01b、R-acct-* |
| admin、admin/access、admin/events | ✓ 普通账号显示空，主办方显示自己的 1 场活动 | R-admin*、F9-O-admin* |
| login-admin | ✓ | R-login-admin |
| agent | P1 已修 | R-agent、F7-05 → F7-07 |
| agent/actions、contacts/all-actions | ✓（P2：中文界面标题是英文 All Actions） | R-agent-actions、F7-04 |
| ai/[id] | ✓ | R-ai-id、R-ai-nonexistent |
| chat | ✓ | R-chat |
| chat/[id] | ✓（P2：不标已读、没有草稿） | R-chat-id、F6-08 |
| contacts/[id] | P1 已修（手动备注不显示） | R-contacts-id、F3-05 → F3-08 |
| contacts/analysis/[dimension]/[bucketId] | ✓ 钻取人数与结构图一致 | R-contacts-analysis-bucket |
| contacts/dashboard、graph（graph 是 dashboard 的别名）、intros、list、matches、pipeline | ✓ | R-contacts-* |
| dashboard | ✓ | R-dashboard |
| contacts/new | ✓ 手动新建、确认候选 | R-contacts-new、F3-01..04 |
| contacts/new/batch2 | ✓ | R-contacts-new-batch2 |
| contacts/new/batch/[id]、batch2/[id]、import/[id] | 只测了无效 id，错误状态正确（P2：两处文案不一致） | R-bad-contacts-new-* |
| events/[id] | ✓ 已取消的活动和 QA 活动都看过 | R-events-eid、F4-02 |
| events/[id]/register | ✓（P2：确认后短暂出现错误条） | R-events-eid-register、F4-03..05 |
| events/[id]/live | ✓ 未报名被拒；已报名时首页、参会者、议程、签到、资料面板都正常 | R-events-eid-live、F4-06..17 |
| events/[id]/operations 及 admission、check-in、roles、analytics | ✓ 非主办方被拒；主办方可用 | R-events-eid-operations*、F4-O-* |
| events/[id]/operations/experience | P2：这场活动没开启体验配置，却显示成「没有权限」 | F4-O-events-eid-operations-experience |
| events/[id]/attendees、participants/[pid] | 旧地址跳到现场页的对应标签或资料面板 ✓ | F10-01、F10-02 |
| events/center | ✓ | R-events-center、F4-O-events-center |
| followups、today、tasks | ✓ | R-followups、R-today、R-tasks |
| tasks/[id] | P1 已修（按返回键丢备注） | F5-02、F5-03 |
| tasks/personal | ✓（P2：页标题是「待办」） | R-tasks-personal |
| tasks/relationship/[id] | ✓ | R-tasks-relationship-id |
| home | ✓ | R003-home、Z-final-home-3000 |
| home/events | ✓（P2：主办方显示为「Organizer #xxxx」） | R-home-events |
| inbox/[id] | ✓ 草稿、已读都正常 | R-inbox-id |
| inbox/notifications/[id]、inbox/sources/[id] | 只测了无效 id | R-bad-inbox-* |
| invitations/[token] | ✓（P2：接受后状态行仍写「等待你确认」） | F6-05、F6-06 |
| notes、notes/new、notes/[id]、notes/[id]/edit | ✓ | R-notes、R-notes-new、F5-05、F5-07、R-notes-id-edit |
| o/[slug] | 只测了无效 slug（P2：先显示一张占位图） | R-o-bad-slug |
| party、party/checkin、party/graph | 无活动时跳到 /events；带活动时跳到现场页，graph 进议程标签 ✓ | R-party*、F10-03、F10-04 |
| platform | ✓ | R-platform |
| profile/continue | 资料已完成时跳首页 ✓ | R-profile-continue |
| profile/edit、more、preview、suggestions、tags、onboarding | ✓（P2：更多资料里「行业」显示未填写；建议列表重复已选标签）；suggestions 那条路径的 P1 已修 | R-profile-*、F1-*、F8-* |
| register、register/[code] | 空状态 ✓；[code] 只测了无效码 | R-register* |
| schedule/personal/new、[id]、[id]/edit | ✓（P2：新建没有默认日期，校验提示被底部按钮挡住） | R-schedule-personal-new、F5-11、R-schedule-personal-id-edit |
| schedule/events/[id]、schedule/meetings/[id] | 只测了无效 id | R-bad-schedule-* |
| settings、settings/api | ✓（P2：英文、日文界面的返回键写「返回」） | R-settings*、L-* |

**英文、日文抽查**（首页、联系人、现场页、设置）：L-en-*、L-ja-*。

## 4. 问题清单

| 级别 | 问题 | 修复提交 / 建议去向 |
|---|---|---|
| P1（已知） | 首页关系跟进和关系待办分页要求 Node 25.6.0 | `80b366028`（第 8 节） |
| P1 | App 联系人关键词搜索返回 503「当前环境暂不支持此搜索」，这条路径没有慢路径可退 | `f188f3573` |
| P1 | 手动新建联系人时写的备注，中文界面显示成「关系背景待补充」，网页却能看到 | `ebfe98ff0` |
| P1 | 待办详情里写完备注直接按返回，备注丢了，没有任何提示 | `0c7e74493` + `5d116395b` |
| P1 | 保存资料后再采纳资料建议，保存时报 409「资料已在其他地方更新」。其实是跟自己上一次保存冲突，建议在服务端已标「已接受」，资料却没改 | `5e76dd2b8` |
| P1 | Agent 动作中心把已完成、已批准的动作也显示成待确认（「4 条待确认」），还能点确认，而全部操作页只有 1 条等待确认 | `e885d21c8` |
| **P1（待决定）** | 英文账号的 AI 自我介绍永远失败（80 字符上限） | 需要你定英文上限；建议归 0109–0120 之前单独处理 |
| **P1（待决定）** | 断网冷启动退回登录页 | 需要威胁模型决定；新 Sprint |
| P2 | 读取量：手动新建的三个接口每次都整个工作区扫描。merge-suggestions 5858 行 / 8.4MB，manual 5641 行 / 7.9MB，confirm 5737 行 / 8.1MB | 0116（联系人本地化） |
| P2 | 组织方没发布问题集时，每读一次报名页就调用一次 DeepSeek 生成问题，没有缓存 | future |
| P2 | 中英日文案：英文注册页中文校验；英文、日文设置页返回键写「返回」；中文界面 All Actions；英文「1 tasks」；英文筛选「Connection ana…」被截断 | future |
| P2 | 引导：第 3 步沿用上一步的滚动位置，标题被遮住；第 2 步不选时间范围就不能继续，却没有提示；中途退出后冷启动不提示续填 | future |
| P2 | 视觉：来源 chip、标签选中态、起草消息、全部采用、使用重置链接用了蓝色填充（黑白规范之外，本 Sprint 之前就存在）；待办详情标题栏「编辑待办」折成两行 | future |
| P2 | 主办方显示为「Organizer #xxxx」；参会者名和账号页名字显示成邮箱前缀；角色页直接显示 actor id | future |
| P2 | 更多资料里「行业」显示未填写（主行业已设）；标签建议重复已选项；个人日程页标题写「待办」；o/[未知] 先显示一张占位图 | future |
| P2 | 运营子页的拒绝样式不统一；体验配置未开启却提示「没有权限」 | future |
| P2 | 手动新建表单：输入框缺无障碍名称；候选生成后出现在按钮下方约 1000pt，按钮附近没有反馈 | future |
| P2 | 个人日程新建没有默认日期，校验提示被固定的底部按钮挡住 | future |
| P2 | 报名确认成功后同时出现「暂时无法读取报名状态」，刷新后消失 | future |
| P2 | 联系人详情「创建邀请链接」只打开引荐页，不带当前联系人，新交换的人没法邀请 | future |
| P2 | 邀请页接受后状态行不更新 | future |
| P2 | chat/[id] 不标已读、没有草稿，和收件箱会话页的行为不一致 | 0109 / 0119 |
| P2 | 待办详情：有未保存内容时，第一次侧滑只保存不返回，要滑第二次 | future |
| P2 | batch 与 batch2 的无效批次提示文案不一致 | future |
| P2（以前就有） | `contact-search-pagination` 在 cutover 库上有 7 条失败（只有资料没有联系人的记录没被选中、微秒时间戳总数不对）。HEAD 上同样失败，与本 Sprint 无关 | future，需要单独查 |

## 5. 十条流程

1. **注册与引导**：A 在 App 注册，完成英文 5 步引导，每一步用网页 `/api/profile` 读回（第 1 步的职位只收到 "Q" 是我输入太快，不是产品问题）。B 做完第 1 步后退出，重进时出现「已完成 1 / 5，从…继续」，然后用中文完成剩下的步骤。网页读回 onboarding=complete，`/app/home` 不再跳到引导页。截图 F1-01..20。
2. **登录、退出、切换账号**：A→B→O→A 来回切换。B 看不到 A 的任何数据（笔记、待办、日程、人脉都是 0）；直接打开 A 的笔记链接被拒。退出登录没有二次确认。截图 F2-01..07。
3. **联系人**：列表、搜索（修复后）、详情、手动新建并确认、结构钻取、看板、匹配、引荐、进度都走了；网页读回备注。截图 F3-01..08、R-contacts-*。
4. **活动与现场**：新建了 QA 活动 `event_qa_0126`，发布状态和别名用 SQL 补写，做法同 0107。
   - A 在 App 报名，B 从网页 API 报名。
   - A 在 App 签到，网页读回 09:30:43；主办方在 App 给 B 签到，B 从网页读回。
   - A 申请交换名片，B 在网页接受，A 的 App 显示「已交换」。
   - A 记笔记，网页读回；B 读不到（私人笔记，符合设计）。
   - A 约时间（3 个候选），B 从网页读到 awaiting_response。
   - 主办方的运营、签到、角色、分析页面都可用。
   - **环境限制**：本机没跑 event-operations worker，交换后的联系人和通知不会自动生成。我只对这场 QA 活动的 8 条 outbox 调用了真实的 projector，没有动演示数据，也没有触发 AI。
5. **待办、笔记、个人日程**：
   - 新建和编辑后都在网页读回。笔记在网页改成 v3 后，App 能看到。
   - 删除这一项没有单独在 App 操作，QA 数据最后统一删除。
   - 停掉 3100 后，笔记、日程页显示「无法连接 · 显示截至 18:19…新建和编辑需要联网」，写入口禁用；待办显示本地内容。
   - **断网重启后退回登录页**（待决定的 P1）；联网重启后恢复。
   - 截图 F5-01..23。
6. **收件箱与消息**：
   - A 从网页创建邀请，B 在 App 接受，关系会话建立。
   - B 在 App 发消息，A 的网页未读数变成 1；A 从网页回复，B 在 App 能看到。
   - 收件箱会话里保存草稿，网页能读回；打开会话后未读数归 0。
   - 通知列表依赖 notification worker，本机没跑，所以没能验证。
7. **AI**：付费对话 1 次，回答用的是 A 自己的联系人。历史列表有、网页读回会话。All Actions 用了 4 条账本数据，不够一页，所以「加载更多」没法实测（0122 用 501 条测过）。
8. **个人资料**：编辑、标签、建议、预览、更多资料、设置、服务器设置都走了。资料建议那条路径的 P1 修复后，网页读回 role 和 offering 都正确。
9. **管理员**：App 和网页的后台都是「当前账号只读」的设计，普通账号看到空列表，主办方看到自己的活动。本地没有配置读取量管理员（`ORBIT_READ_COST_ADMIN_ACCOUNT_IDS`），所以 read-cost 接口对所有人都是 403，「管理员能看」这一面没法测。
10. **旧地址**：`/party*`、attendees、participants、`[...legacy]` 的落点都正确，截图见 F10-*。

## 6. 付费调用

| 类别 | 次数 / 上限 | 明细 |
|---|---|---|
| AI 对话 | 1 / 6 | 09:48:21，A |
| 自我介绍生成 | 2 / 2 | A 英文一次（服务端内部 3 次模型调用，全部被拒，返回 422）；B 中文一次，成功 |
| 名片识别 | 0 / 2 | 没跑 |
| **上限之外** | 最多 7 次 | QA 活动没有发布过问题集，报名页每读一次就可能调用一次 DeepSeek 生成问题（A 6 次，含我从网页读回的一次；B 1 次）。事先没想到，已登记为 P2 |

- 没有触发 AI 匹配与发布。
- `npm test` 的付费边界拦截计数是 0。

## 7. 测试、typecheck、清理

**全量**：
- orbits：5185 条，4723 通过，**0 失败**，461 跳过。与 0123 的 5179/4721/457 相比：多出的 6 条是新加的 Postgres 环境测试（默认全量跳过）；另有 2 条以前按运行时跳过的测试现在会运行。
- App：3668/3668（多出的 13 条都是本 Sprint 新增）。

**Postgres 环境测试**：
- lifecycle-sort、lifecycle-task-pages、relationship-task-page、home-facts：在 Node 24.21.0、25.6.0、25.8.1 下，分别用 ja_JP 和 C 两种系统语言环境，每次 33 通过、2 跳过（增长测试，需要单独开关）。
- 联系人搜索一致性、contact-card-page、owner-boundary：三个 Node 版本都是 6/6。
- contact-search-pagination（cutover 库）：23/30，失败的 7 条在 HEAD 上同样失败。

**typecheck 与 lint**：orbits `typecheck`、`typecheck:app`、App typecheck 都是 0 错误；lint 通过；读取量棘轮文件没变。

**新增或修改的测试**：
- orbits：
  - `lifecycle-sort-order-postgres`（4 条）：固定的旧排序、三个读取器、校对规则漂移时拒绝。
  - `lifecycle-sort-fixture`。
  - `contact-search-runtime-parity-postgres`（2 条）：İ、ß、词尾 σ、开尔文符号、全角、连字、切罗基文、中日文下，SQL 结果与 JS 一致；漂移时拒绝。
  - 另外改了 `lifecycle-sort-runtime`、`app-home-facts-followup-reader`（去掉跳过）、`contact-search-pagination`（跳过条件）。
- App：
  - `contact-manual-note-view-model`（4 条，用真实接口返回的数据）。
  - `task-detail-interactions`（新增 4 条）。
  - `profile-edit-session`（新增 3 条）。
  - `agent-actions-view-model`（新增 2 条）。
  - 另有 3 个测试加了空的 `usePreventRemove`，离线读取审计的行号登记跟着下移。

**QA 数据清理**：一个事务，日志在 `commands/cleanup.txt`。
- 删除的行：
  - orbit_records 155，orbit_read_receipts 972
  - event_ops 系列：relationship_sides 2、relationship_pairs 1、audit_log 6、checkins 2、configuration_heads 1、configurations 1、contact_requests 1、membership_heads 2、membership_versions 2、outbox 8、profile_heads 2、profile_response_versions 4、profile_versions 2、events 1
  - event_aliases 2
  - appointment 系列：command_receipts 2、outbox 1、aggregates 1
  - relationship_lifecycle_command_receipts 1
- 删除后 66 张表的行数与开工前的快照完全一致，orbit_records 的主键集合也与开工前逐字节相同。全库按 QA 标识扫描，没有残留。
- 开工前已有的行，一行都没被修改。

**环境收尾**：
- App 的服务器地址已改回 `http://127.0.0.1:3000`，回到原来的演示账号（首页 16 项待办）。
- 3100 和 Metro 都按端口停掉了；3000 没动过。
- `repos/orbits/next-env.d.ts` 是构建时生成的改动，没有提交。

## 8. Node 版本钉死的修复说明

- **这个检查原来保护什么**：三个读取器（首页跟进摘要、生命周期分页、关系待办分页）的排序完全在 PostgreSQL 里完成（und-x-icu），Node 只是切片，不再排序。钉死 Node 25.6.0 只是为了和旧的 JS `localeCompare` 排序保持一致。
- **查证结果**：
  - 旧的 JS 排序在三个 Node 版本下完全相同。真正会让它变的是系统语言环境：ja-JP、zh-CN 下 Greek 与汉字的先后不同。原来的检查从来没管过这一项。
  - SQL 的排序与 Node 版本、语言环境都无关。
- **改法**：检查条件改为真正决定顺序的数据库校对规则：collversion 153.136、ICU、确定性、UTF8，漂移时仍然拒绝。去掉了 Node 版本和 PostgreSQL 版本号的要求。
- **证明**：把旧排序固定成测试里的常量，在三个 Node 版本 × 两种语言环境下都通过；改之前三个 Node 版本全部失败。
- **运行时对照**（同一份数据，同一个 orbit_events）：
  - 旧代码：`unavailable「关系跟进来源未配置或读取失败」`
  - 新代码：`ready, 1「Follow up QA b after event」`
  - App 待办页的「人脉跟进」也能显示这条。
- **联系人搜索快路径的评估**：它确实依赖 JS 的 `toLowerCase`，而 `toLowerCase` 由 Unicode 版本决定，所以条件改成检查 `process.versions.unicode`（目前是 17.0），同时保留数据库校对规则的检查。

## 9. GitNexus

- `openProfileEditSession` 为 **HIGH**（所有资料编辑页都依赖它）。改动只针对「没有用户编辑、也没有待提交保存，而且服务端版本更新」的会话；资料相关的 286 条测试全部通过。
- 其余符号都是 LOW。几个 UNKNOWN 或 0 调用方的符号，已用文本搜索确认实际调用方。
- 以 `5097f47bb` 为基准的 compare 结果是 low，没有受影响的流程。

## 10. 提交

- `80b366028` fix(orbits): lifecycle follow-ups and relationship task pages no longer require Node 25.6.0
- `f188f3573` fix(orbits): App contact keyword search no longer returns 503 off Node 25.6.0
- `ebfe98ff0` fix(app): contact detail shows the user's own manual note
- `0c7e74493` fix(app): a task note typed right before Back is saved
- `5d116395b` fix(app): task leave guard uses usePreventRemove
- `5e76dd2b8` fix(app): a clean profile edit session follows the newer server profile
- `e885d21c8` fix(app): Agent center lists only actions that still need a decision

## 11. 生产步骤

- 没有迁移，不需要改数据。
- 去掉 Node 钉死后，Vercel 的 LTS Node 也能正常读关系跟进。
- 部署前请只读确认 Neon 上 `und-x-icu` 的 collversion 仍是 153.136（0123 的审计结果是这样）。如果不是，这三个读取器会按设计拒绝服务。

## 12. 需要你决定或知道的事

1. **英文自我介绍的长度上限**（P1）。
2. **离线冷启动的身份策略**（P1）。
3. 本地的 event-operations、notification、encounter 这几个 worker 都没在跑，所以交换名片不会自动生成联系人和通知，收件箱通知也没法在本地验证。要不要在本地回归流程里常驻 worker，请你定。
4. 名片识别（0 次）和账本「加载更多」这次没有实测。
5. **违规记录**：有一次把 typecheck 日志写到了 `/tmp/tc-app.log`，没有用 scratchpad。

证据目录：`/Users/xzhao/Projects/orbit/repos/orbit-app/build/harness-state/evidence/sprint-0126/run-01/`（`screens/`、`labels/`、`commands/`、`api/web-log.txt`、`progress.md`）。日志目录：`/Users/xzhao/Projects/orbit/repos/orbit-app/build/harness-logs/sprint-0126/`。
**状态：completed。** 两个待决 P1 已由用户在 2026-09-27 决定，转入 0127 修复：英文自我介绍单独放宽到 200 字符；离线冷启动信任上次验证的身份，最长 30 天。第 12 节第 3 条也已决定：本地回归时启动 worker，由 0127 编写启动脚本。按 GOAL，0127 修完这两个 P1 之后才继续 0125。

## 13. 协调者复核

协调者在 `e885d21c8` 上独立复核：

- **orbits 全量**：5185 条，4723 通过，0 失败，461 跳过。
- **App 全量**：3668/3668 通过。
- **Postgres 测试**（`orbit_test`）：生命周期、关系待办页、首页事实、联系人搜索一致性、联系人卡片页、主人边界、同步相关文件，共 104 条，87 通过，0 失败，17 跳过。
- **截图抽查**：F7-07，Agent 动作中心修复后显示「2 条待确认」，修复前是 4 条。截图底部的「Open debugger to view warnings」是 Debug 版的开发提示，不是产品界面。蓝色 chip 是早已存在的 P2，已登记。
- **Node 钉死修复的判断**：检查条件从「Node 25.6.0」改成「数据库校对规则 collversion、ICU、确定性、UTF8」，并用固定的旧排序常量，在三个 Node 版本和两种语言环境下对照过。协调者认可这个做法。**生产部署前**需要只读确认 Neon 的 `und-x-icu` collversion 是 153.136，已登记。
- **违规记录**：子代理有一次把日志写到了 `/tmp`，没有写到 scratchpad。
- **报名页每次读取都调用 DeepSeek 生成问题**：这是生产环境里真实存在的付费放大问题，不只是测试环境的问题。协调者建议把它提到 P1 处理，在 0127 之后找合适的 Sprint 修复，会向用户报告。

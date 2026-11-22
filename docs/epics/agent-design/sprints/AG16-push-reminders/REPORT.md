# Sprint AG16 — 执行总结（推送提醒，H）

对应 [GOAL.md](GOAL.md)。服务端部分由第一个生成者（Claude Fable 5.2）写成，原文接在本页后半「服务端部分（原文）」；界面部分由接手的生成者（Claude Opus 5.5）在视觉稿获批之后做完，写在前半。两份都由协调者原样写入（子会话写不了报告文件）。评审结论和最终状态在页尾「协调者复核与结论」。

## 结果

已做到并核对过（截图与视觉稿逐块对照见 run-01/compare.md）：

- 16-1 两端任务页「有新结果时提醒我」：每条任务一个开关管手机和浏览器（D16-1），拨了立即生效、不出卡（PUT /api/agent/automations/[id]/reminder，语言随界面）；开着时下面一句「在手机和浏览器上弹一条「有新结果」，不写活动名称、时间和地点。」和这台设备那一行；关着时只有「现在只放进收件箱。」，不显示设备、不读浏览器任何东西。开着时「怎么通知你」那一行不再重复。已结束的任务不显示这一块。列表上开了提醒的任务第二行多「· 🔔 有新结果时提醒」。
- 16-3 浏览器四种：①还没问过（按钮「允许这个浏览器通知」，只有点了才弹浏览器的询问，D16-3）②会收到（「不在这个浏览器上提醒」）③拒绝（「怎么重新打开」两行步骤）④允许过后来在系统里关了（由那一期提醒被拒收发现，写出那一期的日子，「重新允许」）。另有「在这里关掉过」一种（在这个浏览器上提醒）。部署没配浏览器提醒或浏览器不支持时，不显示浏览器那一行（no-flash 规则「没开通的功能不显示任何相关界面」）。App 沿用「在这台 iPhone 上接收通知」的同一个开关和系统权限：会收到／没问过（按按钮或拨开关才出 iOS 的询问）／被拒（去系统设置打开）／在 Orbit 里关了（在这台手机上提醒）。
- 16-2 对话里开提醒：卡不变；确认之后卡下面接一句「已打开。这个浏览器还没允许通知」＋「允许这个浏览器通知」（App：这台手机），这台设备已会收到时不出。判断「这张卡把某条任务的提醒从关打开了并且成功」写在 shared/compute/agent-reminder.ts，两端共用。
- 16-4 历史两行：第一行「结果已生成 9:04 · 有 3 场新活动 看结果 ›」，第二行由服务端写：送到（✓，带送达时刻）、没有新的所以不提醒、没送到（红字，写原因，结果在收件箱）、第一次没送出去 9:20 补送到了没有重新算（✓）、免打扰／每日上限／通知设置关了（灰字）、当时没开提醒。送达时刻现在由服务端按任务的时区写进那句话（pushHistoryLine 多一个可选时区参数，不传时说法不变）。从没开过提醒的任务历史保持一行（不在每期下面写「当时没开提醒」）。
- 16-5 点开提醒：网页收件箱认 ?delivery=<编号>（Service Worker 点开的地址），按本账号问服务端是哪一条并选中；别的账号、已删的条目、收件箱以外的地址都不跳。没登录时转登录页并带着原地址。App：服务端回答原来缺 success: true，App 客户端不认，点开显示「这条提醒暂时无法读取」——已修，模拟器上重拍为直接进「通知详情」那一期。
- 网页通知设置里「浏览器通知尚未开放」已拿掉。
- 退出登录时，先停掉这个浏览器的提醒（只对登记过的浏览器，最多等 2 秒），避免下一个人在这台电脑上收到上一个人的提醒。

仍未做或未验证：

- 真实投递（真机、真浏览器）：按协调者转达，上线后由用户另做，不是本次的事。
- App 上「没登录 → 登录 → 接着打开那一条」没在模拟器上看到：登录后 App 崩了（SIMULATOR.md 记过：登录后同步时挂调试脚本），这一段是原有的登录守卫，本 sprint 没改。
- App 上「被拒 → 去系统设置打开」没截图（模拟器上没法把通知设成拒绝），文字由 App 测试逐字断言。
- App 上 16-2 卡下那一句没截图（App 不能用链接打开已存对话；本机 UI 服务上新开对话要调付费模型），有组件测试和源码检查。
- 网页浏览器自己的询问框无头浏览器拍不到；App 上的 iOS 询问有截图。

## 运行记录

- Generator：Claude Opus 5.5，2026-11-20（12:25–14:40 被协调者暂停以释放内存，期间没有改动）。
- 分支 sprint/AG16-push-reminders，接手时 470322fc4。合并 AG15 三次：8133233b0（591ecbec6）、de335fc40（e14755693）、81d8f5b2a（3d075db8e）、2378aacae（5bd0e7ce1）。
- 提交：7d64b5ff0 界面；1a17cab46 App 信封与截图里看到的小问题；7f073da52 App 离线清单登记。最终 SHA：7f073da52。
- push、部署、正式站、远程库：没有碰。截图过程不可能连到真实推送服务（subscribe 被替换、离机请求全部中止，日志里 0 条）。

### 合并时的冲突（都保留两边）

- 第一次：shared/contract/agent-v1.ts（AG16 的 push 字段＋AG15 的 display；AG16 与 AG19 的两块都留）、delivery.ts 的 import、eval/CHANGES.md、快照重生成、App 同步。
- 第二次：App 三份 scheduledTasks 词表（AG15 的星期和单位词＋AG16 的提醒词）。
- 第三次：dispatcher.ts（汇总同时数 AG15 的送出／取消和 AG16 的提醒轮；补送成功后先计数再发提醒）、runner.ts（transcript 里同时有提醒那一行和 AG15 的笔记卡片那一行）、eval/CHANGES.md。
- 第四次：无冲突。

### 评测运行（都在 /Volumes/ORICO/Dev/orbit-sprint-evidence/agent-eval-lines/ag16/runs/）

| 运行 | 构建 | 用途 | 硬判定 | 金额（元） |
|---|---|---|---|---|
| 20261120-143741-e147556-ui-card | e147556 | AE-PSH-001 单例，为 16-2 截图留下真实的卡和一次模拟送达 | 1/1 | 0.0056 |
| 20261120-145900-1a17cab-AG16-ui-gate | 1a17cab | 门槛（之后又合并了 AG15，作废，仅记录） | 66/70 | 0.5627 |
| 20261120-152412-3d075db-AG16-ui-final | 3d075db | 门槛（之后 AG15 又出了 2378aacae，作废，仅记录） | 66/70 | 0.5953 |
| 20261120-162003-7f073da-AG16-ui-final2 | 7f073da（干净的树） | **门槛（最终）**，--gate AG16 --workers 3 | 66/70 | 0.6006 |

- 三次门槛未过的都是同样四例：AE-MEM-008、AE-MEM-009、AE-MEM-012、AE-REF-005（归 AG14，本分支没有 AG14）。PSH 五例每次都过；AE-REF-008 这几次都过。
- 评审材料：每次门槛都生成了 judging.md（70 份，每份两次评审）；没有自评。
- 推送一律模拟。本次合计约 1.76（四次运行：0.0056＋0.5627＋0.5953＋0.6006；真实模型调用合计 2＋156＋152＋154 次，按各运行 summary 的口径；分项见各运行的 costs.json） 元（上限：每次门槛 30、每 sprint 150）。

### 测试

- 新增：tests/pages/ag16-reminder.test.tsx（14：开关立即保存、关着时不碰浏览器、四种浏览器状态逐步点、卡下那一句、16-4 每种说法和色调、列表标记、?delivery= 只认本账号收件箱条目、设置页那句已拿掉）；tests/ui/web-push-client.test.ts 加一条（退出登录）；tests/services/agent-rule-push-delivery.test.ts 改一条（送达时刻进那句话，中英日三种，按任务时区）；tests/api/push-tokens-web-subscription.test.ts 加两处（两个接口的信封）；App tests/ag16-reminder.test.tsx（5：手机状态、每种状态的字、开关的接口、卡、页面接线）。
- 先写测试：送达时刻、信封、退出登录三处都先看到失败再改。
- App 新文件没有直接引入 useOrbitApiClient（它在 node 测试里需要 __DEV__，会让引了确认卡的旧测试全挂），由页面把 client 传进来。
- 两端 typecheck：只剩基线的三处。契约快照一致（本次没改共享契约；shared/compute/agent-reminder.ts 是新文件，已同步到 App，四个同步测试和共享计算审计通过）。
- 全量（最后一次改动之后，LANG=en_US.UTF-8）：服务端 9360 条、22 条失败，名字与已知清单（integration-20261119/full-fail-names.txt）完全相同，没有新增（run-01/full-orbits-ui.log、orbits-fail-names-ui.txt）。App 3600 条、4 条失败（full-app-ui.log）：已知的 3 条，加上「durable failure envelope emits a sanitized warning and recovers on foreground」（5 秒超时）；同一次输出里还有「a stale native scroll event during restore cannot erase the Home position」一行。这两条单独跑 3 次都过，所在的代码（NotificationLifecycle、push-device-session、首页滚动恢复）本 sprint 没有改动，判断是机器满载（同时有别的线在跑门槛和构建、交换区 5 GB）下的时序问题，不是新增失败；请协调者在合并树上再看一次。
- 棘轮测试里本 sprint 的文件：服务端「硬编码文字」「非 .btn 按钮」两条的失败输出里没有任何 AG16 文件（typed-notifications-tab.tsx:58 那个按钮是原有的一行）；App「硬编码文字」「路由对齐」没有；「原生调用都有登记」原来列出 scheduled-tasks-api.ts 的 PUT .../reminder，已登记，现在没有。

## 协调者的三项后续（2026-11-20 傍晚）

最终 SHA 改为 **e075319de**（在 7f073da52 之上三个小提交）。

1. **16-2 的卡按获批稿的字**（72bad4e9a）：标签「有新结果」，原值「只放进收件箱」，新值「放进收件箱，并在手机和浏览器上提醒」，下面一句「只改这一条，别的任务照旧只进收件箱。提醒上不写活动名称、时间和地点。」（英、日同改；关提醒那张卡同样不再出现「推送」「站内」）。改在写卡片行的地方（rule/ops.ts 的标签、notifyWords、reminderNote），新建任务卡冻结的那一行同一个标签（那张卡只显示三行，不受影响）。卡的哈希覆盖 display（标签、两个值、那句话）和 preview：新增测试（e075319de）逐个改动这四样，哈希都变。没有任何用例的代码判定断言旧字，用例未改。重跑：`20261120-165400-e075319-card-words`，AE-PSH-001～005 与 AE-SCH-001～003 硬判定 8/8，judging.md 已生成，0.0695 元；AE-PSH-001 的 transcript 里卡上就是稿里的字。
2. **投递接口里原有的两种回答**（70fd8ced8）：事实——App 点开推送走 OrbitNotificationsCoordinator/NotificationLifecycle → /inbox?deliveryId → RelationshipInboxScreen 的 clientGet → 同一个 API 客户端，`isEnvelope` 只认 `{ success, data }`，不认就返回 ORBIT_APP_INVALID_ENVELOPE，屏幕上是「这条提醒暂时无法读取」。在本机 UI 服务上用产品自己的投递服务建了一条旧式投递（不调模型），请求它：回答是 `{"data":…}`，没有 success（work/ui/legacy-delivery-before.json）。所以确实会失败。已在两个分支各加 `success: true`，正文其余不变；先写测试（tests/api/notification-delivery-route.test.ts 两处先失败后通过）。网页只读 `.data`，不受影响。
3. **App 上 16-5 端到端、不挂调试器**：已登出 → `xcrun simctl push` 把一条和提醒同形的通知送到模拟器（只在本机，不经任何推送服务）→ 点通知横幅（app/app-7a-reminder-banner.png）→ App 打开到登录页（app-7b-after-tap-signed-out.png）→ 在登录表单里输入账号密码、按「登录」→ 直接进「通知详情 · 有 3 场新活动」（app/app-7c-entry-after-sign-in.png；iOS 自己的「更新密码」弹层那一张另存为 …-with-ios-sheet.png）。代理日志 app/proxy-16-5-end-to-end.log：`POST /api/auth/mobile/credentials 200` 紧接 `GET /api/notifications/deliveries/rule-push%3A… 200`。全程 App 没有崩。驱动方式照 AG20a：通过 Metro 的检查端口只做 Runtime.evaluate、先 Debugger.disable，用来设地址、登出、按「登录」按钮（模拟器上 idb 点 React Native 的按钮不生效，点系统横幅生效）。只有一处小观察：登出后再从通知进来，栈里有两张登录页（登出那一张和通知转来的那一张），用户看不出来，按登录后照常进入那一条。

对照第 2、4 点（App「看结果 ›」折行、网页 375「历史」不折行）按协调者意见保留，作为与稿的差异交给产品负责人。

## 与视觉稿不同

1. 历史第二行写「手机的通知被关了」「浏览器的通知被关了」，不是「这台手机」：这句话由服务端写，它不知道是哪台设备在看。
2. （已改，见上「三项后续」1）16-2 的卡现在用稿里的字。
3. App 历史的「看结果 ›」接在第一行后面，但这一行比稿长，375 宽时折到下一行。
4. 网页 375 的「历史」不折行（稿里折成两行）。
5. 稿外多做了两种设备状态（浏览器「在这里关掉过」、手机「在 Orbit 里关了」），和「部署没开浏览器提醒时不显示浏览器那一行」。

## 影响分析

| 符号 | 风险 | 怎么改的 |
|---|---|---|
| ConfirmationCard（网页） | HIGH（对话的回合和收件箱的卡片入口都用它） | 只加：卡下面一个兄弟节点，只在「这张卡已完成并把某条任务的提醒打开了」时出现；卡本身不变 |
| signOutAndForget | CRITICAL（每个退出登录按钮） | 只加一步：只在这个浏览器登记过提醒时退订并撤销登记，失败吞掉，最多等 2 秒 |
| ScheduledTaskList / ScheduledTaskDetail / HistoryRow（网页）、ScheduledTasksScreen / ScheduledTaskScreen / HistoryRow（App） | LOW / UNKNOWN（文本搜索确认只有各自的路由页） | AG15 留的位置放提醒块；历史行可选的第二行；列表标记 |
| pushHistoryLine、scheduledRunView | LOW | 可选时区参数，不传时说法不变 |
| TypedNotificationsTab | LOW | ?delivery= 的读取 |
| NotificationDeliverySettings | UNKNOWN（文本搜索：设置页和收件箱的消息页签） | 删掉一行提示 |
| createNotificationDeliveryRouteHandler、提醒开关的 PUT | LOW / UNKNOWN（文本搜索：只有路由本身和测试） | 回答加 success |
| AgentConfirmationCard（App） | LOW | 同网页 |

detect-changes：界面提交 29 个文件、风险 high（来自上面两项），修复提交 7 个文件 4 个符号，登记提交 1 个文件；都没有 partial 或 truncated。输出在 run-01/detect-changes-ui-*.txt。

## 动了谁的文件（给合并的人）

- AG15 的：ScheduledTasks.tsx／.module.css／scheduled-tasks-copy.ts／scheduled-tasks-client.ts、ScheduledTasksScreens.tsx／scheduled-tasks-api.ts／App 三份 scheduledTasks 词表、task-view.ts（一处传参）、App route-domain-inventory.ts（一行）。
- AG16 服务端的：runs.ts（pushHistoryLine）、web-push-client.ts（加 forgetWebPushOnSignOut）、提醒开关路由、deliveries 路由的提醒分支。
- 公共的：confirmation-card.tsx／.module.css（网页）、AgentConfirmationCard.tsx（App）、orbit-sign-out.ts、typed-notifications-tab.tsx、notification-delivery-settings.tsx、copy/notifications.ts。
- 新文件：shared/compute/agent-reminder.ts（及 App 同步副本）、account/ScheduledTaskReminder.tsx、inbox/delivery-entry.ts、App notifications/phone-reminder.ts、screens/me/ScheduledTaskReminder.tsx、两端测试。

## 需要决定

1.、2. 已由协调者答复并完成（见「三项后续」）。
3. 正式站目前没有浏览器提醒的 VAPID 密钥：上线后网页上不会显示浏览器那一行（按 no-flash 规则），而开关下那句仍写「在手机和浏览器上」。真实投递检查之前要配好。

## 证据

/Volumes/ORICO/Dev/orbit-sprint-evidence/agent-design/sprint-AG16/run-01/：compare.md、web/（33 张）、app/、draft-boards/、gate-*-run.log、full-orbits-ui.log、full-app-ui.log、detect-changes-ui-*.txt、impact-ui/、work/（截图、种子、模拟器脚本，均只连本机）。


## 评审之外看到的三处（ae6fb7714）

1. 送达后 15 分钟那一轮只读推送服务的回执：ok → 不发；还没有 → 不发，之后再问，一天后不再问；报错 → 设备没了（DeviceNotRegistered）就撤销、不会变的拒收（InvalidCredentials、MessageTooBig、MismatchSenderId）记为没送到；其余失败补发一次，每台设备每期最多一次，历史写「第一次没送出去，9:26 补送到了。没有重新算。」，补发不再计入当天上限。新测试把时钟推过这一轮：ok、还没有、报错 → 补发一次 → 再报错 → 不发第三次、几种不会变的错误。
2. 开关不再带语言：卡、任务页、对话都只写 { inApp, push }，确认后写进去的正是卡上那一行（writes_exact 测试）。提醒那句话按这一期结果的语言（run.locale）发出；第一版存过的语言被忽略，下次拨开关时去掉。开关接口仍接受旧 App 带来的 locale（schema 是 strict）但不用。测试：日语对话给中文任务打开提醒 → 提醒是中文。PSH.yaml 里与此冲突的是评审项（不是代码判定）：AE-PSH-004 的 R2（第 183 行「那条提醒用日语写」）、AE-PSH-005 的 R2（第 228 行「那条提醒用英语写」），请协调者改。
3. 改任务的卡的文字行：标签和值之间用和新建任务卡一样的「：」（英文 ": "）。

重跑：20261120-173323-ae6fb77-judge-notes，AE-PSH-001～005 硬判定 5/5，0.0444 元，judging.md 已生成。gate 槽这时只剩一个且有人排队，五例改用一个 worker 在本线已在跑的评测服务上依次跑（负载与五次单例开发运行相同）。

---

## 服务端部分（原文）

以下是第一个生成者写的服务端 REPORT（服务端那一轮写成时的内容），原样保留；其中界面没做的几处已由上文取代。

对应 [GOAL.md](GOAL.md)。本页是生成者在 run-01 写的；评审结论和最终状态由协调者在页尾补。

### 结果

**已验证能做到：**

- **提醒是逐条任务开的。** 结果仍然一律进站内收件箱。只有自己开了开关的任务，在某一期有新结果、且结果已经进了收件箱之后，才给任务所有者的手机和浏览器各发一条提醒；没开的任务一次都不尝试。没有新内容的那一期不提醒。
- **提醒只有一句话。** 标题「Orbit」，正文「有新结果，请到 Orbit 查看。」（英文、日文各一句，按开提醒时用户所用的语言）。标题、正文、附带数据里没有活动名称、时间、地点、人名，也没有任务的名字；附带数据只有一个不透明的编号。用户把锁屏内容设成「显示内容」也不影响这一类提醒：拼这句话的函数只收语言和运行编号两样。
- **点开去哪。** 编号只对登录后的本人有效：`GET /api/notifications/deliveries/<编号>` 返回收件箱里那一条的地址，别的账号拿同一个编号得到 404。
- **授权被拒或撤销，收件箱和任务都不受影响。** 浏览器点了拒绝就不登记为可发设备。系统里撤销授权时服务端事先不知道：推送服务拒收之后才撤销那台设备的登记，之后不再发；这一期记为「结果已生成、提醒没送到」，任务照常运行，下一期照常进收件箱。
- **补送只补提醒。** 推送服务明确拒收的，下一次派发再送，最多 5 轮；没有应答的不重发（可能已经送到）。补送只读这一期自己的运行记录、任务的状态和开关、所有者的通知设置和设备登记，不读任何资料，不调模型，不重新算；只改运行记录里提醒那一块，收件箱不会多一条。
- **两件事分开记。** 结果算出的时刻（`computedAt`）和提醒的状态、轮数、送达时刻、没送到或没发的原因各记各的；任务历史每期有两行，第二行由服务端写好。
- **每日上限和免打扰时段（D16-4，已批准）。** 撞上了就只进收件箱，之后也不补发，历史里写原因。和其他自动通知共用同一个每日计数。
- **对话里说一句也能开。**「这条任务以后在手机上提醒我」由代码读成改这条任务，出现有的确认卡，点了才生效；卡上写明只改这一条、提醒上不写内容。用户不说任务原名而是描述它时（英文用例），模型只从给它看的任务清单里回答一个序号，代码核对。
- **浏览器推送是新接的。** Web Push 适配器（加密和 VAPID 签名用 `web-push` 库，请求自己发）；订阅地址只接受各家浏览器的推送服务；Service Worker 只处理 `push` 和 `notificationclick`，点开只去本站收件箱；浏览器端的允许、退订、同步函数（打开页面不会弹询问，只有用户点按钮才问，D16-3）。
- **评测。** 运行器补了 `push_delivery`、`push_excludes`、`revoke: { push }`、`fault: { where: push }` 和浏览器推送的模拟端；PSH 区 5 例在门槛运行里硬判定全过。

**仍未实现或未验证：**

- **两端界面没有做。** 提醒开关、这台设备允不允许通知的几种状态、历史的第二行，都要放在 AG15 的「定时任务」页上，那两页还不存在。视觉稿已于 2026-11-20 获批（D16-1～D16-4 全按推荐），页面由另一位执行者在 AG15 的页面建好后做。界面证据（Web 1440/375、不闪动核对、App 截图）记 blocked。
- **没有任何页面注册 Service Worker**，也没有页面调用浏览器端那几个函数；现在没有用户能从界面上打开提醒，只能在对话里开（或直接调接口）。
- **未做真实投递。** 没有用真实手机和真实浏览器各收一条；需要用户另行同意。不能据此说「真实可送达」：Web Push 的加密格式由测试里的模拟浏览器解开验证过，真实推送服务的行为没有验证。
- **正式环境没有 VAPID 密钥**，没有生成也没有配置；不配时浏览器提醒整体关闭（接口返回 `publicKey: null`），手机提醒不受影响。
- **网页收件箱还不认 `?delivery=<编号>`。** Service Worker 点开的地址带这个参数，页面现在只会停在通知页签，不会选中那一条。
- **退出登录时没有退订浏览器。** 要在页面的退出流程里调 `disableWebPush()`，否则退出后那个浏览器还会收到那一句话（不含内容，点开要先登录）。
- **门槛运行里 5 例没过，都不是推送区的**：AE-MEM-008、009、012 和 AE-REF-005（归 AG14，本分支没有 AG14，与 AG15 门槛相同），以及 AE-REF-008（AG11 的不变量，见下）。
- Expo 回执的事后核对（票据接受之后 15 分钟查回执，回执说设备已注销则改记「没送到」并撤销设备）只有单元测试，评测里没有用例走到。

### 运行记录

- 结果：等协调者评审（硬判定见下）。
- Generator：Claude（Fable 5.2），2026-11-20；Planner revision 1，SHA-256 `349b7284185d15c58455bbd8ce6b3fa094f9b3cd0a710155180f41a63866f239`（开工时记录；之后只在页尾追加「进入条件核对」）。
- 基线 HEAD `002c63eb7`（`sprint/AG15-scheduled-tasks-inbox`）；分支 `sprint/AG16-push-reminders`；最终 SHA `7e29f926c`；由协调者合并。
- 档位 H。push：无。生产库、部署、真实推送服务：没有碰。
- 中途两次中断（06:00 前后账号用量上限、09:21–09:56 之间本机断网），都不是在评测运行当中；没有半写的文件。门槛运行里 149 次主模型、25 次判断调用全部返回 200，没有因断网需要重跑的用例。

#### 提交

| SHA | 内容 |
|---|---|
| `c660463be` | 产品代码与测试：提醒的发送与补送、Web Push 适配器、设备登记、Service Worker、浏览器端函数、对话里开提醒的卡、三个接口、共享契约与 App 同步副本 |
| `221dda53b` | 运行器：`push_delivery`、`push_excludes`、`revoke: { push }`、推送故障、浏览器推送模拟端、种子里的设备与规则开关；`eval/CHANGES.md` 一行 |
| `094577794` | PLANNER 追加「进入条件核对」（门槛构建自这一提交） |
| `7e29f926c` | PLANNER 追加视觉稿获批一条；两个测试的标题（不改产品代码） |

#### 评测运行（都在 `/Volumes/ORICO/Dev/orbit-sprint-evidence/agent-eval-lines/ag16/runs/`）

| 运行 | 用途 | 硬判定 | 真实调用（主模型／判断） | 金额（元） |
|---|---|---|---|---|
| `20261120-084350-002c63e-dev-dispatch` | 开发：AE-PSH-002、003（未提交的工作区） | 2/2 | 0／2 | 0.0009 |
| `20261120-084429-002c63e-dev-conv` | 开发：AE-PSH-001、004、005（未提交的工作区） | 3/3 | 7／6 | 0.0176 |
| `20261120-084943-0945777-dev-stab1` | 稳定性第 1 次（PSH 5 例，门槛同一构建） | 5/5 | 7／8 | 0.0194 |
| `20261120-085029-0945777-dev-stab2` | 稳定性第 2 次 | 5/5 | 8／8 | 0.0233 |
| `20261120-085121-0945777-dev-stab3` | 稳定性第 3 次 | 5/5 | 7／8 | 0.0170 |
| `20261120-085225-0945777-AG16-gate` | **门槛**：`--gate AG16 --workers 3`，70 例（PSH ×5、不变量包 65） | 65/70 | 149／25 | 0.2937 |
| `20261120-085921-0945777-dev-ref008-1` | 诊断：AE-REF-008 单独跑 | 1/1 | 2／0 | 0.0051 |
| `20261120-090006-0945777-dev-ref008-2` | 同上 | 1/1 | 2／0 | 0.0034 |
| `20261120-090045-0945777-dev-ref008-3` | 同上 | 1/1 | 2／0 | 0.0045 |

- 三次稳定性运行里 5 例的硬判定结果完全一致：三张卡的文字相同，发往模拟端的提醒相同（中、日、英各自那一句），RU1 列出的都是街拍工作坊、东京街头摄影展、独立出版市集，RU2 都是设计师之夜。第 2 次里 AE-PSH-005 多一次主模型调用（重试），结果不变。
- 门槛运行：主模型 149 次，提示 349,822 token（其中缓存命中 315,648）、生成 61,221 token；判断模型 25 次，输入 11,596 token；DeepSeek 余额 299.75 → 299.27 元（同时有别的线在跑，差额不全是本线的）。本 sprint 全部运行合计约 0.385 元（上限 150）。推送全部是模拟，不计费；`costs.json` 没有推送一栏，每例发了几条见 transcript 的「模拟推送服务收到的提醒」和 trace 的 `notify.push`。含推送的 5 例都列在 `summary.json` 的 `simulatedCases` 里。
- 评审材料已生成：`20261120-085225-0945777-AG16-gate/judging.md`，70 份、每份两次评审。**没有自评。**
- **AE-REF-008**（AG11 的不变量）在门槛运行里没过 `cites`：第一层把「Based on @客户访谈, am I going to make the deadline on @回复田中的询价?」拆成了两个子目标，第二个依赖读不到笔记的第一个，于是没有回答截止时间。这一例只有一次主模型调用（第一层），不经过本 sprint 改过的任何代码，trace 里没有超时。为了弄清是不是不稳定，单独跑了 3 次，3 次都没拆、都通过。**门槛结果仍是没过，这 3 次不顶替它。** 它不属于「只因超时才可单独重跑」的情形，所以没有据此重跑门槛，也没有开修复轮去改 AG11 的行为；怎么处理请协调者定。
- `judge-pack` 在分线环境里仍要带 `ORBIT_AGENT_EVAL_HOME=/Volumes/ORICO/Dev/orbit-sprint-evidence/agent-eval-lines/ag16`。

#### 待登记的运行（`eval/RUNS.md` 由协调者填）

上表 9 行。门槛那一行：`20261120-085225-0945777-AG16-gate`，提交 `0945777`，70 例，硬判定 65/70（未过：AE-MEM-008、AE-MEM-009、AE-MEM-012、AE-REF-005，归 AG14；AE-REF-008，AG11 的不变量，单独重跑 3 次均通过），真实调用 149＋25，0.2937 元，`bundle.sha256` 的校验值开头 `c49fa066fc7d`。

#### 测试

- 新增（全部通过）：`tests/services/agent-rule-push-delivery.test.ts`（15）、`tests/services/agent-rule-push-postgres.test.ts`（3，真库）、`tests/services/web-push-adapter.test.ts`（5）、`tests/api/push-tokens-web-subscription.test.ts`（6）、`tests/agent-v1/rule-reminder.test.ts`（6）、`tests/ui/web-push-client.test.ts`（9）、`tests/agent-eval/hard-checks-ag16.test.ts`（6）；App `tests/notifications/rule-reminder-navigation.test.ts`（2）。
- 改了 AG15 的两处断言：`tests/capabilities/agent-automation-runs.test.ts`（原来断言「推送只记下、不发」，现在这套没有设备的测试里记为「没送到：没有设备」）、`tests/agent-v1/rule-domain.test.ts`（卡上「提醒方式」那一行的新说法）。
- 操作链收口集 126 条全过、0 跳过（`closing-set.log`）：数据库测试用 `ORBIT_EVENT_DATABASE_URL` 和 `ORBIT_LIFECYCLE_TEST_DATABASE_URL` 指本机专用库 `orbit_ag16_test`（测试在私有 schema 里跑、跑完删掉），先过 `node scripts/assert-local-test-databases.mjs`。
- `npx tsc --noEmit -p .`：只剩基线就有的两处（`tests/scripts/redesign-pixel-lib.test.ts`、`tests/services/contact-profile-inference-postgres.test.ts`）。App `tsc`：只剩基线就有的 `tests/ios-scene-lifecycle-config.test.ts`。
- 契约同步：`shared/contract/agent-v1.ts` 与对应 schema 只加不改（快照工具没有报破坏性变更），同一提交里跑了 `npm run sync:contract`、重写了 `.snapshot.json`；App 的四个同步测试通过。
- **全量对照**（最后一次产品代码改动之后，`LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npm test`）：服务端 9278 条、22 条失败，名字与已知清单完全相同，没有新增；App 3584 条、3 条失败，就是已知的 3 条，没有新增。

证据目录：`/Volumes/ORICO/Dev/orbit-sprint-evidence/agent-design/sprint-AG16/run-01/`（`closing-set.log`、`full-orbits.log`、`full-app.log`、`orbits-fail-names.txt`、`gate-run.log`、`impact/`、三份 `detect-changes-*.txt`）。

### 验收结果

| 验收 | 结果 | 证据 |
|---|---|---|
| AG16-1 提醒由用户逐个任务开启；拒绝或撤销授权后站内结果照常保留 | 服务端与对话 pass（硬判定）；两端提醒开关与授权几种状态的截图 blocked（页面还不存在） | `agent-rule-push-delivery.test.ts`（只给开了开关的任务发、撤销后不再发、收件箱不变、任务仍有效、发送前再查一次开关）；`push-tokens-web-subscription.test.ts`（拒绝授权不登记、收回授权撤销登记、任务页开关只改这一条）；`rule-reminder.test.ts`（卡、点击后才生效）；门槛 AE-PSH-001、002、004、005 |
| AG16-2 提醒内容只说去 Orbit 查看，不含具体资料 | pass（硬判定） | `agent-rule-push-delivery.test.ts`（标题、正文、附带数据不含结果里的词和任务名；三种语言各一句）；`web-push-adapter.test.ts`（模拟浏览器解密后只有固定标题、那一句话和编号）；`web-push-client.test.ts`（Service Worker 只显示服务端给的字、点开只去本站收件箱）；AE-PSH-001、003、004、005 的 `push_excludes` |
| AG16-3 任务完成时间与推送的投递状态分别记录；投递重试不重新计算结果 | pass（硬判定） | `agent-rule-push-delivery.test.ts`（完成时刻不因补送而变、明确拒收补送一次后送达、期间计算次数不变、只有提醒那一块变了、没有应答不重发）；`agent-rule-push-postgres.test.ts`（提醒的待办行与收件箱投递同一事务，派发中途死掉不丢）；AE-PSH-002、003 |
| 真实投递（PLANNER 进入条件 6） | 未做 | 没有用户授权 |

### 与 PLANNER 不同（CONVENTIONS／SPRINTS／brief／协调者指示优先）

1. **分支从 AG15 的分支起**，AG15 未合回；它的页面还没有。
2. **门槛是 PSH ×5**（SPRINTS.md 登记表），PLANNER 写的是 3 例；AE-PSH-004、005 是日文、英文版，要求提醒那句话跟开提醒时用户的语言走，所以规则的 `notify` 多了 `pushLocale`。
3. **没有走现有的投递账本**（`typed-delivery-*`、`NotificationDeliveryService`）。PLANNER 让定时任务的提醒经它建候选、重试；AG15 的 REPORT 建议接在派发器里。选了后者：`scheduler_tick` 调的是派发入口而不是整轮维护；那条账本要求设备先和服务端交接「谁来发」，浏览器没有这一步，会被永远推迟；它在安静时段是推迟到早上汇总，而 D16-4 要的是不发并写明原因。沿用了它的三样：`OrbitPushAdapter`（没有新增第三套）、设备服务、通知设置与每日计数。`typed-delivery-factory.ts`、`typed-delivery-source.ts`、`typed-delivery-worker.ts` 没有改。
4. **浏览器只在这一类提醒的设备清单里出现。** `listActive()` 默认不列浏览器，要 `listActive({ includeWeb: true })` 才列：为手机写的那些发送方（预提醒、消息、跟进）看到的设备和以前完全一样，不会把浏览器订阅当 Expo 令牌发出去。
5. **`ORBIT_WEB_PUSH_SUBJECT`** 不在 CONVENTIONS §2。实现为可选：不设时取站点自己的地址（`AUTH_URL`／`NEXTAUTH_URL`，须为 https）；两样都没有就视为没配置浏览器提醒。请协调者决定是否补进 §2。
6. **新增依赖**：`web-push` 3.6.7（运行时）、`@types/web-push` 3.6.4（开发）。npm 上 2026-11-06 出了 4.0.0，没有用：3.6.7 用了近三年，4.0.0 才两周、接口变化没有核实。合并后协调者的检出要 `npm install`。
7. **App 的 `delivery-navigation.ts` 没有改。** 服务端按它已经认的形状回答（`/inbox/notifications/<编号>`），现有的点开跳转直接可用；加了一条测试证明。
8. **评测的 `push: { count }` 改为只数模拟端接受的提醒**，被拒或没应答的不算发出（原来没有拒收，这一条以前不影响任何用例）；Expo 模拟端对单条消息改为返回单个回执（原来一律返回数组，产品的适配器读不出，之前没有用例走到）。已登记在 `eval/CHANGES.md`。
9. **证据目录**在外置盘，不是 PLANNER 写的 `~/orbit-sprint-evidence/…`。

### 影响分析

索引为本检出单独建（`gnx.sh ag16 analyze --index-only`），加完新文件后重建过一次。改动前做了上游影响分析，输出在证据目录 `impact/`。

| 符号 | 风险 | 本次怎么改的 |
|---|---|---|
| `createStoragePushDeviceService` | CRITICAL | 只加：`listActive` 多一个可选参数（默认行为不变）、`get`、`revoke` 多一个可选的原因 |
| `ruleWriteExecutors` | CRITICAL | 只动「修改」那一个执行器里 `notify` 的写法；其余四个没碰 |
| `rulePart`、`matchRule`（未改） | HIGH | 动词判定里加提醒的代码判据；按名字找不到任务时多一次模型选择；修改路径读提醒的说法 |
| `scheduledRunView` | HIGH | `push` 多出几项，原有三项不变 |
| `notifyWords` | HIGH | 只改开了提醒时的那一句说法 |
| `runHistoryLine`、`pushSaidIn`、`agentAutomationNotify`、`createConfiguredExpoPushAdapter` | HIGH | 没有改 |
| `deliverRun`、`dispatchDueAutomations`、`runRuleItem`、`configuredAutomationDispatchDeps`、`createPushTokenRouteHandlers`、`createNotificationDeliveryRouteHandler`、`prepareRuleOperation`、`runCase`、`createWorldWriter` | LOW | 见下「改了 AG15 的哪些文件」 |
| `buildEvalEnvironment`、`runHardChecks`、`handleControl` | UNKNOWN | 文本搜索确认了调用方（评测环境加载与其测试；运行器；预载脚本自己的请求入口） |

提交前 `detect-changes --scope staged`：产品提交 43 个文件、587 个符号、3 条流程，风险 medium；运行器提交 7 个文件、112 个符号，风险 low；获批记录那次 3 个文件，风险 low；都没有 `partial` 或 `truncated`。

**改了 AG15 的哪些文件**（都只加或只改一处，供 AG15 的执行者回来时对照）：

- `features/agent/automations/contract.ts`：`AgentRuleNotify.pushLocale?`、`AgentRuleSpec.toldFromVersion?`。
- `runs.ts`：`AgentAutomationPushDelivery` 多了 `skipped` 状态、`reason`、`deliveryId`、`targets`；新增编号换算、`pushHistoryLine()`；记录的更新时刻取收件箱和提醒两边较晚的。
- `delivery.ts`：收件箱写成功的那个事务里顺带写提醒的待办行；结果被取消时把等着的提醒一并记为不发。
- `dispatcher.ts`：`deps.push`（可选）、`delivery` 行里键以 `push:` 开头的交给提醒、收件箱送达后立刻发一轮、汇总多两个可选计数；算「告诉过的」时认 `toldFromVersion`。
- `dispatch-configured.ts`：接上提醒的依赖。`task-view.ts`：历史里 `push` 的几项。
- `features/agent-v1/domains/rule/ops.ts`、`apply.ts`、`graph/nodes/rule.ts`、`graph/nodes/route.ts`：见上表。
- `shared/contract/agent-v1.ts` 与 schema：AG15 块里 `push` 那一行加了可选项，文件末尾各加一块 AG16。
- 运行器：`runner.ts`、`hard-checks.ts`、`observations.ts`、`seed.ts`、`env-guard.ts`、`preload/eval-preload.cjs`。

### 假设与额外阅读

- 上下文包之外读了：AG15 的 `runs.ts`／`dispatcher.ts`／`delivery.ts`／`due-index.ts`／`task-view.ts`／`service.ts` 的更新一段、`domains/rule/*`、`graph/nodes/rule.ts`／`route.ts`、`rule/parse.ts`／`prompt.ts`（提醒要从派发器发、要从对话里开）；`delivery-policy.ts`／`delivery-policy-repository.ts`（每日上限和免打扰怎么算）；`app/api/notifications/deliveries/[id]/handler.ts` 和 App 的点开跳转；评测预载、运行器、种子；视觉稿的 AG16 部分。
- **只改提醒开关不算换了一条任务。** 开关一改任务就出新版本，按 AG15 的规矩「告诉过的不再告诉」要从新版本重新算；这样一开提醒，下一期就会把说过的活动再说一遍并且响一声。所以只改开关的那次修改会记下 `toldFromVersion`，之前告诉过的仍然算数；改条数、时间、有效期仍照 AG15 的规矩重新算。
- **用户在通知设置里关掉「更新」这一类时，这类提醒也不发**，历史里写「通知设置里关掉了这类提醒」。视觉稿只说了每日上限和免打扰，这一条是按「宁可少响」自己定的，请确认。
- 早上免打扰结束到 7:50 之间现有通知会攒成一条汇总；定时任务的提醒不参与汇总，这段时间照常发。
- 提醒发出一次，不论几台设备，按一条计入当天的自动通知数；被拒收而没有任何设备收到的不计。
- 一台设备被拒收不影响另一台；有一台送到就算送到。第一轮之后才登记的设备不补发旧提醒。
- 补送间隔 5、10、20 分钟……最长 6 小时，最多 5 轮；之后记为没送到。
- 收件箱送达后，提醒的待办行写在 5 分钟之后（派发器当场就发，这一行只是进程中途死掉时的保底），所以两个派发器不会同时发同一条。
- 订阅地址白名单：`fcm.googleapis.com`、`updates.push.services.mozilla.com`、`*.push.apple.com`、`*.notify.windows.com`，必须 https。别的地址登记时直接拒绝（接口返回 400），不会悄悄存下来。本机模拟端只在 `ORBIT_AGENT_EVAL=1` 时放行。
- 编号 `rule-push:<32 位十六进制>` 就是运行编号的那段哈希换了前缀，不另存一张表；它由工作区、账号、任务、版本、计划时刻算出，不含任何内容。
- 卡上「提醒方式」开着时的说法从「放进站内收件箱，并推送提醒」改成了「放进站内收件箱，并在手机和浏览器上提醒」（英、日同改）；关着时的说法没动。
- 历史第二行里服务端写的是「手机的通知被关了」，不是视觉稿的「这台手机」：服务端不知道是哪台设备在看。页面可用 `push.targets` 里的设备编号和本机编号比对后自己写「这台」。
- 「第一次没送出去，9:20 补送到了」里的时刻不在 `line` 里，页面用 `push.deliveredAt` 拼。

### 交接

**给做页面的执行者（提醒开关、授权几种状态、两行历史）：**

- **开关**：`PUT /api/agent/automations/<任务编号>/reminder`，请求体 `AgentScheduledTaskReminderInputContract`（`{ push: boolean; locale?: "zh" | "en" | "ja" }`，`locale` 传当前界面语言），返回 `{ data: { task: AgentScheduledTaskContract } }`；拨了就生效，不出卡。列表和详情里读 `AgentScheduledTaskContract.notify.push`（`GET /api/agent/automations` 的 `tasks`、`GET /api/agent/automations/<编号>/runs` 的 `task`）。
- **这个浏览器的状态**：`app/(app)/app/orbit-2026/account/web-push-client.ts` 的 `readWebPushState()`，返回 `WebPushState`：`not_asked`（①还没问过）、`on`（②会收到）、`blocked`（③浏览器里禁止了）、`stopped`（④允许过、后来被推送服务拒收）、`off`（允许了但在这里关掉了）、`unavailable`（这个部署没配浏览器提醒）、`unsupported`。按钮「允许这个浏览器通知」「重新允许」调 `enableWebPush()`（只有它会让浏览器弹询问）；「不在这个浏览器上提醒」调 `disableWebPush()`；页面打开时调一次 `syncWebPush()`；退出登录时调 `disableWebPush()`。它们用到的接口：`GET /api/devices/web-push`（`AgentWebPushConfigContract`）、`POST /api/devices/push-tokens`（`{ deviceId, platform: "web", permission, subscription }`）、`GET /api/devices/push-tokens/<设备编号>`（`AgentPushDeviceStateContract`，④ 看 `revokedReason: "provider_rejected"` 和 `revokedAt`）、`DELETE /api/devices/push-tokens/<设备编号>`。
- **这台手机的状态**：App 沿用现有的登记（`src/notifications/push-device-session.ts`）；服务端那一侧同样用 `GET /api/devices/push-tokens/<设备编号>`。
- **两行历史**：`GET /api/agent/automations/<编号>/runs` 的每一期是 `AgentScheduledTaskRunContract`：第一行用 `line` 和 `computedAt`；第二行用 `push`（`AgentScheduledTaskRunPushContract`）：`line`（写好的那句话，`null` 就不显示第二行）、`state`、`attempts`、`deliveredAt`、`lastAttemptAt`、`reason`（`AgentScheduledTaskPushReason`）、`targets`（`AgentScheduledTaskPushTargetContract[]`）。④ 里「11 月 6 日那期」可从历史里找 `targets` 含本机设备且 `state: "revoked"` 的那一期。
- **点开提醒**：App 不用改。网页要让收件箱认 `?tab=notifications&delivery=<编号>`：用 `GET /api/notifications/deliveries/<编号>`，取 `data.target.href` 最后一段（解码后是收件箱条目编号）选中那一条；`target.status` 是 `unavailable` 时停在列表。
- **Service Worker** 在 `public/orbit-push-sw.js`，由 `enableWebPush()`／`syncWebPush()` 注册，页面不用另外注册。
- 网页通知设置页右下那句「浏览器通知尚未开放」到时拿掉。

**后续 sprint 可以依赖的：**

- `pushRun(deps, { ownerId, runId })`（`features/agent/automations/push.ts`）：一轮提醒；`RulePushDeps` 的 `channel`、`devices`、`policy` 都可替换。`configuredRulePushDeps(storage, now)` 是产品自己的那一套。
- `setTaskReminder(service, automationId, { push, locale? })`、`ruleWithReminder()`（`reminder.ts`）；`resolveRuleReminderTarget(actorId, deliveryId)`（`reminder-target.ts`）。
- `createConfiguredWebPushAdapter(env, fetch)`、`parseWebPushSubscription()`、`webPushEndpointAllowed()`、`webPushPublicKey()`（`features/notifications/web-push-adapter.ts`）。
- 评测：`tests/agent-eval/preload/web-push-sim.cjs`（模拟浏览器的密钥和解密）；`evalVapidKeys()`。

**别的线可能冲突的文件：**

- AG15 回来做页面时：上面「改了 AG15 的哪些文件」那一批。
- AG17（要合并 AG15 的分支）、AG14、AG19：`shared/contract/agent-v1.ts` 与 `shared/api-schema/agent-v1.ts`（各在末尾加了一块；schema 那块自带一条 import）、`shared/contract/.snapshot.json`、App 的两份同步副本、`graph/nodes/route.ts`（`isRuleRequest` 里加了一句和一条 import）、`graph/nodes/rule.ts`、`package.json`／`package-lock.json`。
- 运行器：`runner.ts`、`hard-checks.ts`、`observations.ts`、`seed.ts`、`env-guard.ts`、`preload/eval-preload.cjs`、`eval/CHANGES.md`（末尾一行）。

**需要决定：**

1. AE-REF-008 在门槛运行里没过、单独跑 3 次都过：要不要给 AG11 那条行为（有一个引用读不到时，另一个有依据的部分照常回答）加代码规则，由谁加，本门槛是否重跑。
2. 真实投递检查（真实手机和真实浏览器各一条）是否授权；正式环境的 VAPID 密钥谁来生成和配置。
3. 通知设置里关掉「更新」时这类提醒也不发，是否保留。
4. `ORBIT_WEB_PUSH_SUBJECT` 是否进 CONVENTIONS §2；`web-push` 留在 3.6.7 还是升 4.0.0。
5. 只改提醒开关时保留「告诉过的」（`toldFromVersion`），改了 AG15 的一处语义，是否同意。

**回退：** 不合并，或 revert 合并提交。没有新表、没有迁移；运行记录和规则上多出的字段都是可选的。不配 VAPID 密钥时浏览器提醒整体关闭；把所有任务的开关关掉就没有任何提醒发出。

### 协调者对五项待决定的答复（2026-11-20）

本页正文由 Generator 起草，它的会话写不了报告文件，由协调者原样写入。

1. **AE-REF-008 那一次不通过**（AG11 的不变量；第一层把一句话拆开后没有回答）：按波动规则记录——单独重跑三次都通过，本门槛不重跑。「拆开之后每一部分都要有回答」这条放进第三方用例集之后的修复线（AG20）。
2. **真实投递和正式环境的 VAPID 密钥：** 需要用户单独同意，已列入待用户决定的事项。
3. **用户在通知设置里关了「动态」时提醒也不发：** 同意，和视觉稿 D16-4（受每日上限和免打扰管）是同一个原则。
4. **`web-push` 固定在 3.6.7、`ORBIT_WEB_PUSH_SUBJECT` 可选：** 同意；合并时把这个变量补进 CONVENTIONS 第 2 节。
5. **只改提醒开关时保留「已经告诉过的」**（`toldFromVersion`）：同意，打开提醒不应该把以前的结果重新告诉一遍。

界面部分（提醒开关、浏览器的四种授权状态、两行历史、提醒本身）在 AG15 的任务详情页做出来之后，由另一个 Generator 接着做。

## 协调者复核与结论

**结论：completed。** 最终提交 `ae6fb7714`（界面 `7f073da52`，协调者三项后续 `e075319de`，评审之外三处 `ae6fb7714`），经集成线 `agent-v1-next` 合并，随第二次发布（`463de7fdd`）在 2026-11-21 09:17 上正式站。

**评审。** 都是 Claude 新会话，互不相见。

| 运行 | 代码判定 | 评审 | 说明 |
|---|---|---|---|
| `20261120-085225-0945777-AG16-gate`（服务端） | 65/70 | 一位（Fable 5.2），PSH 5 例：5/5 | 没过代码判定的：要 AG14 的 4 例；AE-REF-008 第一层拆分不同，单独 3/3（门槛结果仍记为没过） |
| `20261120-162003-7f073da-AG16-ui-final2`（界面） | 66/70 | 未评 | 之后按三项后续再改，由下一行送评审 |
| `20261120-165400-e075319-card-words` | 8/8 | 一位（Fable 5.2）：8/8 | PSH 五例与 SCH-001～003；评审之外的三点（+15 分钟那一轮、卡后面存的提醒语言、英文回执行标签粘连）在 `ae6fb7714` 改 |
| 上线门槛 `20261121-002824-bdb67c3-release2-gate-all-4` | PSH 5 例全过 | 两位（Opus 5.5） | — |

**协调者看过的截图。** App `app-7c-entry-after-sign-in.png`（没登录时点提醒，登录后直接进那一期）；与稿不同之处见「与视觉稿不同」，第 1、3、4 条按协调者意见保留，列给产品负责人。

**怎么合并的**（`coordination/next/INTEGRATION-LOG.md`）：
- `859a40ed0` 合 `7f073da52`（8 个文件冲突，契约、确认卡、评测运行器，都保留两边）；`7e5945578` 合 `e075319de`；`baaf33a2e` 合 `ae6fb7714`，都没有冲突。
- `cbac7a83f`、`7b2f92842`：AE-PSH-004、005 的 R2 改成「提醒按这一期结果的语言写」（协调者决定 6）。
- `091c80cb6`：合并时看出，存了「回答用日语」这类规矩时结果是日语、提醒却按任务原来的语言。改成运行记录取结果的语言，提醒跟着它。
- 新依赖 `web-push` 3.6.7：比它早建的检出要 `npm install`。

**协调者的决定**（DECISIONS-2026-11-20.md 末节）：卡上的字照获批稿（第 5 条，「推送」「站内」不出现）；提醒语言跟这一期结果（第 6 条）；一个开关管手机和浏览器，历史写「手机／浏览器的通知被关了」不写「这台」，App「看结果 ›」375 宽折行，网页 375「历史」不折行，都作为已知差异（第 7 条）。

**还没做的（要用户本人）。**
- 真实投递：用户 2026-11-20 同意。要先为正式环境生成一对浏览器推送密钥（VAPID）并配上，再请用户在手机和浏览器上各收一条。没配密钥之前，正式站的网页不显示浏览器那一行，而开关下那句仍写「在手机和浏览器上」。
- `ORBIT_WEB_PUSH_SUBJECT` 是可选变量，没有补进 CONVENTIONS §2。

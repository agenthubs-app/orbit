# R14 — B 线执行报告

## 基线与边界

- 2026-10-19 在 `line-b` 先拉取 `origin/redesign`，起点 `ee87af742`；R13、R18a、R31a/b 的已交代码均可读取。后续按路径提交后再次 `git pull --rebase origin redesign`，已合到 `ec83ac5a0`；收口修复后再次拉取，分支仍为最新。**没有 push、Neon/生产连接、部署或 TestFlight。**
- 本轮复用 `orbit_records` 已有集合；**新增数据库迁移编号：无**。本机 PostgreSQL 仅为 `127.0.0.1/orbit_line_b`。没有真实付费 AI 调用。
- R13 REVIEW 的 M 项先修并分别提交：外人原始 owner 过滤、混合 `mail_summary` 整行过滤、Top-1 全局原始候选排序、账号时区分组；其 REPORT 已写复核记录。R13 像素及离线首页项依 README 规则 11 交主会话，没有宣称通过。
- 10 月 19 日重启后确认工作树干净，再次 `git fetch` 和 `git pull --rebase origin redesign`，结果为 up to date。本轮补交的 R13 跨账号秘書预览过滤和 R11b 四项复核各有独立提交；没有重做已完成的全量。
- 证据目录：`../_evidence-b/R14/run-01/`（相对本 worktree）。

## SC 对照

| SC | 状态 | 已证实 / 缺口 |
| --- | --- | --- |
| 01 基线与预检 | **部分** | 源码/路由/来源和原板编号已核对；b5 #13/#29、b11 #31/#32 已按 `2026-10-19 主会话代定` 在原文件内改稿，修订版 preflight 退出 0。样式门禁仍失败，见下。 |
| 02 契约与 CAS | **定向通过** | 旧偏好默认 22:00–07:30、上限 3、秘書可用开关；同起止时间 400，严入宽出；revision CAS 409、旧偏好镜像与 App 合同同步。 |
| 03 静音与全局上限 | **部分** | typed 按账号时区、所有 push 来源共用 1/2/3 配额，消息也占额；本机库双设备/时区/并发预留测过。旧 reminder worker 先运行 typed cutover，旧外发 provider 被禁用；旧 `delivery-service` 的 `claimReady` 在 cutover 后不领 legacy push。活动维护任务的站内记录提前截断已按 RD-30 移除，4/4 回归通过。 |
| 04 7:50 合并 | **部分** | 默认静音、提前/延后结束、同日 digest key、私密正文、合并件数与每设备幂等；数据库并发守卫与失败回执定向测试通过。持有候选的偏好 revision 变化会重新延后重判，未发送的拒绝预留释放配额。候选扫描达 500 条或来源读取失败时使用不报数的私密正文；未做真实多 worker 重启链及系统锁屏截图。 |
| 05 面談例外 | **定向通过** | 仅当前已确认预约聚合体的 30 分钟提醒越过静音，仍走共享配额；取消/过期/他人不例外。 |
| 06 邀请双方 | **定向通过** | 邀请人、受邀人各自产生本人联系人通知，同一连接幂等；本机 PostgreSQL 目标归属测试通过。 |
| 07 落地白名单 | **部分** | 本地联系人/扫描/Task To-do 合法地址开放；保留段、穿越、编码斜杠、外链和多余查询安全回退；冷启动未登录远程 delivery 进入受保护收件箱，由服务端再验 owner。重启后模拟器 `openurl orbit:///task?seg=todo` 实际进入 To-do，截图可查；本机 API 未运行，Task 数据为重试态。系统通知点击与远程 delivery 未做手工链。 |
| 08 App 通知页 | **功能定向通过，像素失败** | 静态私有路由、R31 控件、真实偏好 CAS、系统权限与 opt-in/设备撤销；拒绝态可打开系统设置，离线交给已有在线边界。b5 #13 已改稿；第三轮以清掉 Expo 开发警告的真实模拟器截图比对仍有 21 条未归因超阈带，不能标 PASS。没有手工点按读回。 |
| 09 Web 通知页 | **功能定向通过，像素失败** | 静态受保护路由、账号设置壳、真实偏好保存、三语 copy、响应式双列/单列。b5 #29 已改稿并补实际自動発見卡；1440 门禁初轮 18 条未归因带，修订后重比结果见画板节。1024/390/dark 无板截图待补。 |
| 10 秘書设置 | **功能定向通过，像素失败** | App 静态子页仅提供 R13 已交期限/推荐来源开关，邮件摘要不可见，全局 cap 只读且静音返回同一源。b11 #32 已改稿，清掉 Expo 开发警告后的浅色门禁仍有 12 条未归因超阈带；没有手工点按读回。 |
| 11 注册/权限/旧屏 | **定向通过** | App OS 拒绝时不显示生效的 opt-in；关闭先禁止注册再撤销设备，撤销失败可见；账号切换隔离，旧组件的外部使用点保留并改用 R31。R18a 其他动态段仍在；真实设备 token 注册未实测。 |
| 12 R13/R10/R19 交接 | **部分** | R13 来源、宽进逐条跳过、账号时区分组已回归；未改同步 DTO。活动维护任务已完整写站内通知，保留 semanticKey 幂等；R10/R19 只应消费站内通知，见交接表。 |
| 13 异常/无障碍 | **部分** | 401/503/409、无 token、未知回执、源撤销、OS 拒绝、午夜/DST 定向测试；控件带可读 label/alert。R31 `Toggle` 的 RN Web `aria-checked` 和 `CategoryTabs` 的 `aria-selected` 缺失使浏览器用例失败；A 线组件修复与 VoiceOver/键盘、异常态真实截图待补。 |
| 14 演示世界/i18n | **部分** | mock 偏好改为 07:30/3/mail=false，样本来源仅真实可用种类；App 通知域 copy QA 39/39、Web 通知域零问题，App 三语键一致、硬编码允许清单缩减。中途态 `design=` 与生产不可达证明依赖改稿画板/fixture，未实现。 |
| 15 全量/像素 | **未通过** | 最后 Web 全量 15 失败、2 cancelled；两项取消的迁移测试串行 4/4 通过。App 全量 38 失败、3 cancelled；针对其失败文件串行 496 例中 484 pass、12 fail，原 41 个未通过/取消名称中 29 个串行恢复，稳定失败为旧相机 9、旧 i18n 1、A `Toggle`/`CategoryTabs` 2，确认 B 新失败 0。三个修订板的像素比较均未通过，不能建立 R14 PASS。 |
| 16 报告/交接 | **本报告** | 已列 SC、按路径提交、源代码范围、测试与请求；主会话独立复核后处理后续整合。 |

## PLANNER §3 逐条接手

| 条目 | 结果 |
| --- | --- |
| G01 | Web 经 `AccountLayout` 进入 `ShellPage`；R13 受信箱壳未改。 |
| G02 | 辅助说明使用既有 `ink3Text` / CSS hint；画板对比度待改稿验。 |
| G03 | App 错误态用 `coralText`，Web 用既有 error 类；未新增色值。 |
| G04 | App 操作使用 R31 Button/Toggle；真实 44pt 触控检查待模拟器。 |
| G05 | 三张有板画面已改稿并跑像素门禁；均失败，未标通过。 |
| G06 | 改稿后重跑预检和逐像素；未归因的结构与间距差异仍在。 |
| G07 | 定位 b5 #13/#29、b11 #32；#31 仅锁屏参考。 |
| G08 | demo-world 为只读 `sample:true`，未调用付费 AI。 |
| G09 | 改稿门禁未使用 `[data]` 为结构缺块归因；三板均 FAIL。 |
| G10 | Web 复用 `AccountLayout` 的 ShellPage 插槽。 |
| G11 | Web 390 仍有账号壳标题；无板截图待做。 |
| G12 | Web 设置页未新增搜索入口。 |
| G13 | 页面 CSS module/Scope 隔离；窄屏底部和叠层实测待做。 |
| G14 | Web server route 和 App 私有 route 均有登录守卫。 |
| G15 | 一级壳未动；App 二级路由与返回目标真机核对待做。 |
| G16 | App 页面由 `AppScreen` 承接底栏转场。 |
| G17 | 两个 App 新屏均使用 `AppScreen inset="kit"`。 |
| G18 | 503/离线显示错误或在线边界；来源服务 unavailable 的真机状态待补。 |
| G19 | 既有 DTO 宽进、未知项逐条跳过；本轮未新增同步字段。 |
| G20 | 旧设置控件仍有外部使用点，保留组件并替换内部 UI；硬编码允许清单减少一行。 |
| G21 | Web AccountLayout 包含 `Orbit2026Scope` 和 `ToastProvider`；动效/键盘检查待补。 |
| G22 | Web 用 `useOrbitLanguage`，未拼 `?lang=`。 |
| G23 | 仅用 R31a/b 已交组件；未改 A 线组件库。 |
| G23b | Toggle/Segmented/TextField/Button 参数按当前 R31 导出；两端类型检查 0。 |
| G24 | App 日文 UI 走三语字典与 `UiText`。 |
| G25 | 单板门禁已运行；三板均 FAIL，未使用伪归因。style-diff 与主会话抽检仍待做。 |
| G26 | 改稿重跑预检；残余 token 缺口详见下节，未把画框装饰当组件缺口。 |
| R13-01/02/03/05 | 来源和 inbox 为 R13 所有；本轮仅按用户 REVIEW 指令修四项并做兼容回归。 |
| R13-04 | R14 已放宽安全本地深链；受信箱内部目标仍归 R13。 |
| R14-01 | 联系人、扫描与 Task 深链及负例已实现。 |
| R14-02 | 邀请双方各写一条本人通知，沿连接键幂等。 |
| R14-03 | 契约已有字段落到持久偏好、UI、投递与同步解析；fixture 同值。 |

## 投递路径盘点与决定

| 路径 | 当前事实 | R14 处理 |
| --- | --- | --- |
| `run-notification-delivery-worker` / maintenance `notification_redelivery` | 使用 `runNotificationDeliveryPass` 枚举已注册 actor，先写 cutover，再物化/派送 typed。 | 唯一启用的生产 push ledger；每个 push 经 `reserve()` 共享计数。 |
| `run-reminder-worker` | 原来直接调用旧 ReminderPlan provider。 | 同轮先 typed pass/cutover，失败即停止；旧外发 provider 显式抛错，不能绕过 cap。 |
| 旧 `delivery-service` | legacy worker 的数据库 `claimReady` 在 cutover 后拒领无 `policySource` 的 push；全仓非测试代码无 `createNotificationDeliveryWorker` 调用者。 | 保留历史读取/物化；没有把旧 2 件限额当作新 cap。 |
| agent scheduler | 生产路由提供 durable delivery，只物化 pre-event 候选；直接 `push.send` 在缺 delivery 的兼容分支，生产路由不走。 | typed pass cutover 后不旧发；仍需主会话审视长期兼容分支是否删除。 |
| 事件 journey 通知维护任务 | 原 `capEventNotifications` 在 `write` 之前截断，缺省 2。 | 按 RD-30 移除站内截断和无效 cap 读数依赖；due 逐条经 semanticKey 写入受信箱，push 仍由 typed reserve 控制。 |

本线自定实现细节：digest 以已验证、仍可发送的同设备候选去重计数；超过 500 条或计数读取失败时退回泛化私密文案，不输出可能错误的件数。设备 payload 仅有 `deliveryId`。锁屏 `private/full` 两档、消息与自动来源共用 cap、秘書不启用邮件摘要均来自 PLANNER 已批准的 B-14 决定。

## 验证记录

- Web、App `npm run typecheck -- --pretty false`：各退出 0；修复全量暴露的问题后再查两端仍退出 0（`*-typecheck-final.log`）。
- App 落地/生命周期/权限定向：21/21；task-container：15/15；设备权限控制追加用例：4/4。
- Web typed/账号时区定向及 R13 修复：定向用例通过；`run-reminder-worker` 3/3；typed delivery 6/6；本机 PostgreSQL 配额/并发守卫 1/1；演示世界及秘書预览 9/9。
- App `no-hardcoded-copy` 5/5；App 通知域 `copy:qa --app notifications` 39 条、0 问题；Web 通知域问题 0。全域 copy QA 为 7,277 条、218 个其他域既有问题，退出 1，不记作通过（证据 `copy-qa-full.json`）。
- Web `npm run lint` 退出 0；本机 PostgreSQL 的 cutover lane 负例 1/1（legacy 领 0、typed 领 1）。
- App `i18n-domain-split` 的旧 R03 pre-split 数量快照仍失败：en 2919 vs 2253；同测试的三语键集合、无空值及文件域结构通过。此旧快照失败在 R14 新域之前已存在，不将其记为 R14 通过。
- Web 首轮收口全量经 `heavy.sh b`：**7,698 tests、6,673 pass、18 fail、1,007 skip，退出 1**（`web-full.log`）。与 R13 旧收口失败名对照，旧文案允许清单失败已消失；新增 3 项均由本线修复：共享日期助手违反 `compute-text` 审计（Web 架构/日期/写入审计 12/12、App 同步合同 7/7），偏好接口 404 误失效身份缓存（浏览器 1/1），typed 投递状态的非同步写入未列审计清单（同 12/12）。修复各按路径另提交；复跑结果见下，旧 15 个失败仍不记通过。
- App 首轮收口全量经 `heavy.sh b`：**3,174 tests、3,154 pass、18 fail、2 skip，退出 1**（`app-full.log`）。与 R13 `run-02/app-full-closeout.log` 按失败名对照，旧相机 9、字典钉版 1、A `CategoryTabs` 选中项 1 仍在；新增 7 项中，B 路由覆盖/私有门禁/离线页面清单 3 项已由静态路由登记修复（21/21，`app-route-manifest-fix.log`），偏好 GET 离线读取清单 1 项已登记为 `online_only_secret`（26/26，`app-offline-inventory-fix.log`），两项通知设置快捷按钮尺寸已改用 R31 `Button size="lg"`，浏览器窄屏与宽屏目标 2/2（`app-browser-fix.log`）。余下一项「discovery toggles」来自 A 线 R31 `Toggle` 在 RN Web 上未输出测试要求的 `aria-checked`；组件只给 `accessibilityState.checked`，B 线未越界修改。定向浏览器束总计 2 pass、1 fail；复跑结果见下，App 后续类型检查退出 0（`app-typecheck-after-full.log`）。
- 首次模拟器 `openurl` 尝试停在运行门槛：`heavy.sh b` 因内置盘空间低于 5 GiB 等待（`metro-openurl.log`）。重启后空间恢复，Metro 在 `:8083` 成功打包，`simctl openurl orbit:///task?seg=todo` 成功进入 To-do（`metro-openurl-task-retry.png`）；截图显示本机 API 不可用的 Task 重试卡。`orbit:///settings/notifications` 与 `/secretary` 也打开了 App，但只显示在线边界（`metro-notifications-retry.png`、`metro-secretary-retry.png`），不能据此验证表单或像素。首次截图直写证据盘被 CoreSimulator 拒绝，改为写 `/tmp` 再复制后成功；原始命令与日志为 `metro-*-retry.zsh` / `metro-*-retry.log`。操作后已停 Metro 并关闭 B 模拟器。系统通知点击、远程 delivery、在线设置交互和 VoiceOver 仍未做手工验收。
- 重启前修复后的最后一轮全量：Web **7,738 tests、6,712 pass、15 fail、1,011 skip**（`web-full-review-final.log`），15 个失败名与旧 Web 基线相同；App **3,216 tests、3,173 pass、38 fail、3 cancelled、2 skip**（`app-full-review-final.log`）。App 失败包含既有相机 9、旧 i18n 钉版 1、A 线 `Toggle`；并发浏览器压力下还出现多个 1.5–5 秒等待超时，不能把这轮全量记为通过。随后定向重跑 workspace 2/2、通知注册竞态 15/15、收件箱焦点恢复 1/1；收件箱筛选选中语义 0/1，原因是 A 线 `CategoryTabs` 仅传 `accessibilityState.selected`，RN Web 未输出测试所需的 `aria-selected`（`app-workspace-timeout-review.log`、`app-notification-races-review.log`、`app-inbox-timeout-review.log`）。其余超时未逐个重跑，不宣称已排除。重启后再跑 Web/App 类型检查均退出 0（`*-typecheck-postrestart.log`）。
- 本轮对上述 41 个失败/取消名称所涉的 18 个 App 测试文件用 `--test-concurrency=1` 串行复核（`app-serial-review.log`）：496 tests、484 pass、12 fail、0 cancelled。41 个名称中 29 个转为通过；剩余为 R12 相机/名片 9、旧字典钉版 1、A 线 `Toggle` 1、A 线 `CategoryTabs` 1。与 R13 基线的 11 个稳定失败及已知 A Toggle 对照，**确认 B 本轮新增稳定失败 0**。并行全量本身仍为失败，不以这次串行结果冒充全量通过。
- RD-30 活动来源修复先加 RED：cap 满时两个 due 站内记录写入 0/2；移除站内提前截断及旧 cap helper 后，R27 目标测试 4/4、Web `tsc --noEmit` 退出 0。push 统一配额逻辑未动，活动站内记录仍靠 semanticKey 幂等；证据见本轮终端记录与本报告交接表。
- 活动修复后 Web 再做一轮收口全量（`web-full-after-event.log`）：**7,738 tests、6,710 pass、15 fail、2 cancelled、1,011 skip，退出 1**。15 个失败名称与前轮完全一致；两项新取消是本机 PostgreSQL canonical membership 迁移用例在并发套件里达到 60/120 秒等待限时。随后只跑这两个文件的串行复核 `web-migration-serial-review.log`：4/4 pass、0 fail、0 cancelled；因此无证据表明事件改动新增稳定 Web 失败。全量本身仍未通过。
- 额外一次本机在线截图：`online-settings-check2.log` 以 `buildStackEnv(..., noPaidAi:true)` 将数据库固定为 localhost、付费 provider key 置空，在 B 线 `:3300` 启动 Web、`:8083` 启动 Metro；模拟器深链分别进入通知和秘書表单，截图 `online-notifications.png`、`online-secretary.png`。首次探针使用 `127.0.0.1:8083`，而 Metro 只监听 `localhost`，故 `online-settings-check.log` 超时；更正探针后成功。该次截图拍摄时画板尚未改稿，且通知截图含开发调试提示，**不作像素 PASS**；后续干净截图与门禁见下一节。未手工验证保存读回、系统通知点击或 VoiceOver；这些仍由定向自动测试及后续独立验收承担。结束时已停本轮 Next/Metro，关闭 B 模拟器，并将 Next 启动自动改写的 `next-env.d.ts` / `tsconfig.json` 精确恢复到本轮前内容。

## 画板门禁

PLANNER 定位：A-R14-P01=`b5-me-inbox.html #13`，W-R14-P01=`b5-me-inbox.html #29`，A-R14-P02=`b11-nav-v3.html #32`；`#31` 是系统锁屏参考。原稿预检和数据来源清单保存在 `b5-preflight.*`、`b11-preflight.*`。按本轮主会话授权，直接在 b5/b11 文件改稿，每处均附 `2026-10-19 主会话代定` 注释：四类推送、1/2/3 上限、二档锁屏、端末许可、静音编辑和保存、Web 自動発見、秘書仅期限/推荐、共享 cap，移除邮件摘要、浏览器 push 伪开关和固定上限提示。`#31` 的示例只保留事件来源。App 第三轮再按真实卡片顺序去掉原板多余的标签和图标。最终修订预检在 `b5-preflight-final-pass.*`、`b11-preflight-final-pass.*`，两组均退出 0，疑似不自洽和疑似无功能项为 0。手机框半径、阴影、黑岛等缺 token 为画板装饰，未记作产品组件缺口。

单板门禁都经 `heavy.sh b` 使用本地 Web `:3300`、设计稿 `:3350` 与在线 App 截图运行。A-R14-P01 初次诊断比较 `pixel-revised-app-notifications`：raw 0.1282、24 条未归因超阈带，开发截图含 Expo 警告覆盖。随后在模拟器中用 `idb ui tap` 关闭开发警告，重截 `online-notifications-clean.png` 并复比 `pixel-revised-app-notifications-clean`：raw 0.0844、24 条未归因带；第三轮按真实卡片重排后以同一干净截图复比 `pixel-app-notifications-last`：raw 0.0821、21 条未归因带、17 处缺块，**FAIL**。A-R14-P02 初轮 `pixel-revised-app-secretary`：raw 0.1057、15 条未归因带，开发截图仍有警告；次轮卡片重排并重截无警告的 `online-secretary-clean.png` 后，`pixel-app-secretary-last` raw 0.0567、12 条未归因带、11 处缺块，**FAIL**。W-R14-P01 初轮 `pixel-revised-web-notifications`：raw 0.0301、18 条未归因带；发现板缺实际自動発見卡后改稿，复比 `pixel-revised-web-notifications-v2`：raw 0.0348、23 条未归因带、38 处缺块，**FAIL**。未给数据文字外的差异强行标 `[data]`；未修改归因规则，三板均不得标 PASS。App 截图与 Web triptych、`result.json`、逐带报告均在证据目录。

## 给主会话/其他线的四栏交接

### 待主会话接手

- b5 #13/#29、b11 #31/#32 已按代定改稿；三个页面门禁都失败。需按实际屏幕继续对齐布局、重截无 Expo 覆盖的 App 图并复跑门禁，不可标 PASS。
- 活动通知写站内前的截断已移除。事件线接手时保留「站内逐条幂等、推送端统一限额」边界，勿恢复旧 `dailyCap` 截断。
- 生产推送、Neon 配置/迁移、部署、真机送达与 TestFlight 保留为独立授权项；本轮仅本机验证。

| 是什么 | 当前状态 | 接手必须做到 | 依据 |
| --- | --- | --- | --- |
| 1. 活动来源站内截断 | `notification-job.ts` 和 `notifications.ts` 已移除写入前 cap；R27 回归断言两个 due 记录都写入，Web 类型检查退出 0。 | 事件线继续保持站内逐条 semanticKey upsert；push 只在 typed worker reserve 时受 cap。 | RD-30、SC-03/12；`r27-event-notifications.test.ts`。 |
| 2. R10 首页/R19 小组件 | 站内通知 DTO 与 R13 preview 已交，R14 开关只管 push；未触碰两页。 | 只读 R13 站内来源；核对过滤、时区、离线行为，避免把 push 开关当作隐藏来源。 | R13 REPORT 的 M0 合同 `306f32224`；SC-12。 |
| 3. b5/b11 改稿 | 四板已在原文件改稿且完成预检；三个页面像素门禁均 FAIL。 | 主会话复核版面并协调页面布局对齐、无覆盖的新 App 截图、重新门禁；缺口不得用虚假归因掩盖。 | 本报告「画板门禁」及 `pixel-revised-*` 证据。 |
| 4. 生产推送 | 仅本机 DB/provider 替身验证；没有外部发送。 | 主会话登记 DEFERRED「待用户授权」：生产 worker 开关、凭据、Neon 迁移/配置、部署、APNs/Expo 真机送达、TestFlight；授权后逐项执行并留回执。 | PLANNER B-14-10、§10。 |
| 5. Gmail `mail_summary` | R13 客户端整行隐藏，R14 默认关闭且不展示入口。 | 仅在 D-16 restricted scope 获单独授权和真实来源/权限设计后重新立项；不要打开现有偏好字段冒充可用。 | B-14-5、R13 REVIEW M。 |
| 6. R31 开关浏览器语义 | App 全量中既有发现开关用例的 `getByRole('switch')` 可找到控件，但 `aria-checked` 返回 null；R31 `Toggle` 只设 `accessibilityState.checked`。 | A 线核对 `UiPressable`/RN Web 的属性透传，给 `Toggle` 输出真实选中状态，并重跑 `ink-signal-settings-account`；B 线通知设置复测同一控件。 | `app-full.log`、`app-browser-fix.log`；SC-13/15。 |
| 7. R31 类别标签浏览器语义 | 受信箱筛选测试稳定失败：默认「全部」缺 `aria-selected=true`，切换状态无法从 DOM 宣告；A 线 `Filters.tsx` 的 `CategoryTabs` 只传 `accessibilityState.selected`。 | A 线为 `CategoryTabs` 的每个 tab 输出对应 `aria-selected`（可参照同库 `Segmented`），重跑 `relationship-inbox-lifecycle` 的筛选语义用例；B 线复测通知筛选。 | `app-inbox-timeout-review.log`；SC-13/15。 |

## 提交与越线检查

R14 主提交：`3c04b86ea`（contract）、`0093e3e87`（服务端）、`4fe758d47`（邀请）、`40a58f5c6`（App）、`849d270bc`（Web）、`8c4f01345`（深链）、`4540d2eaa`（权限）、`7253b471b`（旧 worker）、`c9e629000`（fixture）、`f6fbb6018`/`45e0e66d1`（copy）、`9cf11f955`（允许清单）、`5501ba06f`（digest 件数）、`c79b39c1e`（OS 撤权展示）、`022c182d2`（PG cutover lane 测试）、`430e8c5e7`/`98806776c`（权限状态/撤销重试）、`e000ab9ce`（Web 错误色）、`944338364`（重判/配额释放）、`1cfc9135f`（测试类型修正）、`99fa0a541`（非同步写入清单）、`7f1b932fe`（静态路由清单）、`51e4ad20c`（在线偏好读取清单）、`684afc0c7`（快捷按钮触控尺寸）。共享日期/身份缓存收口提交 `687c5949e`/`856704906` 属 R13 联动修复。后续 R13 跨账号预览过滤 `2a321f50c`、复核记录 `ce5c61361`；R11b 按 S1/M1/M2/m1 顺序为 `de06e64b3`、`cfb2b8c86`、`0d32ea4fd`、`18d11dbbe`。R13 REVIEW 的其他独立修复提交与结果见 R13 REPORT。所有提交含 `Co-Authored-By: Codex <noreply@openai.com>`，均未 push。

本轮 R14 补交：`a783e3022`（活动站内通知写入不再受推送 cap 截断）、`08646b68b`（b5/b11 画板原地改稿）、`7215967aa`（App 两板按真实模拟器卡片结构再对齐）。本报告后续按路径单独提交；仍不 push。

改动仅在 B 线 worktree；R13 文件改动来自用户在本轮明确要求先修 REVIEW。未碰 A/D/C 的组件库、token、导航壳或主会话 README/HANDOFF/DEFERRED 台账。最终差异以 `git diff --stat origin/redesign...HEAD` 核对。

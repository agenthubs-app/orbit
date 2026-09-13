# 2026-09-12 原生运行状态核验

final result: blocked

## 当前结论（2026-09-12 22:49 JST）

新版已在 iPhone 17 Pro / iOS 26.4 Simulator 中实际运行并逐页截图检查；**整包原生验收尚未通过**。正常字号长标题裁切、运行中放大字号裁切及非空流程缺口仍开放。诊断期间 App 退出，重开后显示登录页，当前不能继续私有页面验收。下方初始编译错误只是历史快照，不是当前依赖状态。

- 版本：HEAD `8b38b4eb8618505ca4f59f20dc323159e1ad784b` 加未提交 App 改动；仅修改 `repos/orbit-app`。没有 commit、push、部署、Web/API 修改或原生依赖补丁。
- 当前合并 `npm test`：**2190/2190**，0 失败／取消／跳过，203.597864791 秒，exit 0；`npm run typecheck` exit 0。日志 `/tmp/orbit-ink-signal-final-regression3.log`、`/tmp/orbit-ink-signal-final-typecheck3.log`。原生标题检查是独立命令，结果为失败，不属于这 2190 项。
- 设备 UUID `9BF990F2-45B8-42CE-8543-E583B941DA17`；逻辑尺寸 402×874pt，截图 1206×2622px。当前 Metro 仍在 8081，开发包使用现有安装的 React Native 0.86.0。
- 未输入表单内容、提交账号凭证、发送 AI 消息、上传名片、完成任务、报名、审核或签到；没有向真实业务库写样本。已有 API GET 会正常触发读取缓存／鉴权处理，不能因此声称绝对没有本地状态变化。

## 实际原生检查范围

下列截图均已打开目视检查。它们是当前真实页面状态，不是 RNW 截图；正常显示只证明所列范围，不证明写入成功、VoiceOver 或所有字号组合。

| 范围 | 实际结果 | 临时截图证据（均以 `/tmp/orbit-ink-signal-native-` 开头） |
| --- | --- | --- |
| 首页、五项底栏与人脉 | 正常入口、真实列表可见；键盘收起后底栏恢复 | `home-fixed.png`、`contacts-keyboard-closed.png` |
| 人脉详情／编辑 | 真实资料、旧内容、编辑字段可见；未修改／保存 | `contact-detail.png`、`contact-edit.png` |
| 活动列表／详情 | 实际活动可见，详情固定动作区存在；登录态不可用后公开 `event_02` 详情仍能读取，日期修复后显示 `8月15日 周六`、`10:00–12:00`；未报名或分享 | `events.png`、`event-detail.png`（日期修复前）、`event-date-final.png`（修复后公开详情） |
| 我的、设置、账号 | 真实身份和当前工作区可见；未提取、保存、修改权限或退出 | `profile.png`、`settings.png`、`account.png` |
| 日程日／周／月 | 正常字号下三种视图切换可用；日为空，周／月有既有日程指示 | `schedule-day.png`、`schedule-week.png`、`schedule-month.png` |
| 待办／跟进／收件箱 | 真实列表可见；待办日期修复后恢复完整时分；未变更状态 | `tasks-date-fixed.png`、`followups.png`、`inbox.png` |
| IORBIT 首页 | 真实最近会话与建议可见；浅色软件键盘弹出后输入区可见 | `ai.png`、`ai-keyboard.png` |
| 深色首页／IORBIT | 系统外观切换后可见；保留既有深色方案，不冒充 ZIP 未提供的深色对照稿 | `home-dark.png`、`ai-dark.png` |
| 深色既有会话／键盘 | 既有用户与助手内容可读，聚焦后输入区在软件键盘上方；未发送／重试 | `conversation-dark.png`、`conversation-dark-keyboard.png` |
| 登录键盘 | 实际软件键盘可见；滚动后密码、登录、Google 登录按钮完整露出；未输入或提交 | `login-keyboard-scroll2.png` |
| 名片入口 | 单张采集入口可见；批量列表返回读取失败，不能当成空列表或非空复核成功 | `import-entry.png`、`batch-entry.png` |
| 活动运营／审核 | `event_02` 运营仅采到读取中；审核进入真实空队列，不是非空申请人验收 | `operations.png`、`admission.png` |

会话中的 `Insufficient Balance` 是已保存的历史文本，本轮没有调用模型生成，不能据此判定当前 provider 状态。跟进列表和原来的未来活动详情尚未完成日期修复后的原生复拍；公开 `event_02` 详情已补拍。定向测试通过不替代剩余复拍缺口。

## 本轮已修复且验证的原生差异

1. 底栏初始化：`useState(Keyboard.isVisible)` 丢失原生方法接收者，导致启动错误。改成保留 `Keyboard` 接收者的调用，补原生 this 语义失败回归；相关 57/57、独立复审通过，实际 Simulator 已进入新版首页／人脉。未修改 RN 依赖。
2. 东京日期：真实 Hermes 在 `zh-CN` 同时使用 weekday/day/hour/minute 的 `formatToParts` 中，把 `29周六` 合到 day，时分变成 literal；Node/RNW 正常，旧测试因此未发现。`tokyoParts` 与 `eventDetailTiming` 将星期单独格式化，时区和真实数据不变。新增两条原生差异回归先 RED 后 GREEN，四套 178/178、类型检查及独立复审 APPROVE。待办列表已在 Simulator 确认完整 `11:30` 等时分。

日期改动前 GitNexus：`tokyoParts` LOW，3 个直接调用者，11 个受影响符号；`eventDetailTiming` 新符号未收录，UNKNOWN，不是零风险，人工核对页面与分享两处消费者。最终 2190 项包含这些修复。

## 必须保留的原生失败

### P1：运行中切换大字号仍裁切

保持 `/schedule` 打开，将 content size 从 `large` 改为 `accessibility-medium`，标题、9.12 日期与分段文字出现中部裁切。两次稳定截图 `schedule-large.png`、`schedule-large-settled.png` 均目视确认；恢复 `large` 后正常。没有以冷启动大字号截图替代热切换验收，也没有关闭字体缩放。

这与[2026-09-10 只读 LLDB 诊断](../2026-09-08-app-wide-style/2026-09-10-native-followup.md)一致：RN state-only clone 保留了旧的干净测量状态。该诊断已记录原生新字号、旧高度及调用链；本轮没有重做或伪称已经修好。这是全 App 原生 Text 的共享路径，修补按高风险处理，仍需独立方案审批。

### P1：待办详情长标题被裁切

正常字号、冷启动后仍复现。完整标题已到达 `RCTMultilineTextInputView`，`multiline=true`、`scrollEnabled=false`，但实际高度只有 32pt，末尾文字不可见。截图 `task-cold.png`、`task-detail-settled.png`；AX 对应 JSON 含完整值。

新增只读检查 `tests/native/task-title-layout.mjs`，对本次已捕获样本的两行最低高度 64pt 断言失败：

```sh
node tests/native/task-title-layout.mjs /tmp/orbit-ink-signal-native-task-cold.json '整理下周企业 AI 诊断会的访谈提纲' 64
```

输出：`expected at least 64pt, got 32.000000000000014pt`；日志 `/tmp/orbit-ink-signal-native-task-title-red.log`，exit 1。此脚本读取已有 AX 数据，不创建或编辑任务，也不能单独证明所有文字像素可见，修复后仍须目视复查。

独立只读复核已确认脚本对该样本正确失败、报告没有把未验项写成通过，结论 APPROVE；这是检查脚本与报告的复核结论，不是原生验收通过。

固定高度限制原生重新测量是待验证假设，尚未修改生产标题布局。GitNexus 对 `TaskDetailScreen` 返回 LOW／0 个上游调用者，实际路由消费者仍是 `app/tasks/[id].tsx`；图中没有调用边不等于没有使用。当前缺少可用登录态，不能验证布局修复，未用推测替代结果。

## 诊断退出与当前登录状态

22:46 通过调试协议读取当前批次客户端的 GET 返回形状时，`awaitPromise` 没有返回最终数据，只返回 Hermes Promise 包装对象，随后进程退出。崩溃记录 `/Users/xzhao/Library/Logs/DiagnosticReports/Orbit-2026-09-12-224641.ips`：`EXC_BAD_ACCESS`，JavaScript 线程顶部为 `CodeBlock::getSourceLocation` → `Debugger::runUntilValidPauseLocation` → `Debugger::runDebugger`。因此怀疑是该调试调用触发的 Hermes 调试器故障，不把它当成已确认的业务操作崩溃，也不声称所有原生运行稳定。

停止了这条调试方式并重开 App。随后私有页面实际显示登录页，证据 `session-current.png` / `.json`。未收到诊断请求的最终 HTTP 状态，不能断言登录态变化由哪个接口或哪一次操作造成；没有点击退出或提交新凭证。此前一条进度说明误称重开后仍见批次错误，已在查看截图后立即更正；`batch-reopened.png` 实际也是登录页。

另一次只读 LLDB UIKit 表达式因 selector 解析错误而未能取得 TextInput 原生尺寸；调试器已退出，之后确认进程继续运行。没有修改原生内存、断点返回值或依赖。

## 继续验收所需条件

1. 用户在 Simulator 恢复登录后，继续待办标题修复和名片读取失败诊断；所有当前表单保持未输入状态。
2. 先审批已有[原生字号补丁与隔离验收方案](../2026-09-08-app-wide-style/2026-09-10-native-followup.md)：可回滚 RN 测量补丁，保留草稿／焦点／路由，不用整屏重挂载或禁用缩放；重建后测试双向、多次字号热切换。
3. 非空名片、运营／审核等缺样本流程使用另行批准的隔离只读原生 QA 装配，写请求明确拒绝、不进入真实用户缓存；这种布局验证仍不等于真实 OCR／后台写入／跨端回读验收。

结束前已查询并确认系统字号 `large`、外观 `light`。Simulator 和 Metro 保留运行，未安装补丁、未清理用户数据、未改真实业务记录。以上条件未满足前，整包状态保持 blocked。

## 最初状态检查（历史快照）

用户询问 Simulator 是否打开，以及此前靠什么做验证。此记录仅描述本次只读检查，不扩大此前 RNW 批次的验收范围。

后续用户明确同意继续现有逐页验证方法，并要求最后必须经过 Simulator 验证。它是整包交付的必过项，不能以 RNW 或测试计数代替。

- `xcrun simctl list devices booted`：iOS 26.4 / iPhone 17 Pro / `9BF990F2-45B8-42CE-8543-E583B941DA17` 为 Booted。
- Simulator 进程 PID 39200；该设备的 Orbit 进程 PID 61525 均存在。进程存在不等于页面可用。
- 实际屏幕截图 `/tmp/orbit-simulator-status-20260912.png` 已打开检查：显示 Failed to compile / Syntax Error，`ExpoKeepAwake.ts` 无法解析 `expo-modules-core`，不是新版业务页面。
- 本次 `lsof` 未发现 8081 或其他 Node Metro 监听；仅发现 Node 在 127.0.0.1:3000 监听。未访问该服务或业务数据。
- 本地 Node 解析成功：Expo 57.0.8、expo-modules-core 57.0.7、expo-keep-awake 57.0.1、React Native 0.86.0。从 expo-keep-awake 包位置也能解析 expo-modules-core。不能仅根据屏幕旧错误认定当前依赖不存在。
- GitNexus 查询与实际 AppDelegate 一致：Debug 构建通过 RCTBundleURLProvider 读取 `.expo/.virtual-metro-entry`；此处未修改。打包错误是否仍能复现、其原因和当前完整原生运行状态尚未确认。

此前现代化批次的验证是实际 screen/VM/theme 代码经 RNW 在 Chromium 中渲染、受控 native/auth/router/API 边界、交互与业务回归、类型检查和 ZIP 截图对照。设置/账号最终定向测试 75/75、typecheck5 exit 0、独立复审通过，只证明该范围的本地验证；不证明 iOS 原生运行、键盘、VoiceOver、系统字号热切换、真实网络/安全存储或跨端持久化。

未在本次状态询问中重装依赖、改配置、重启应用、写业务数据或宣称原生修复。后续原生验收需先实际启动/复现并检查最新界面；若涉及依赖或原生方案变更，继续保留既有审批边界。

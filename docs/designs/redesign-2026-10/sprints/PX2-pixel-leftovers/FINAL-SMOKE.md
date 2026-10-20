# ⑫ 合回前总验收：全量与冒烟（主会话亲自执行）

日期：2026-10-21。代码：`origin/redesign@7b2b2c3b7`。执行者：Claude 主会话（自 2026-10-21 08:00 起不再调用 Codex）。证据：`/Volumes/ORICO/Dev/worktrees/orbit/_evidence-main/FINAL/` 与 `_evidence-main/final-{web,app}-full.log`。

## 最终全量（verify worktree，仅 LANG/LC_ALL=en_US.UTF-8，不传全局 DB URL）

| 端 | 结果 | 与历史失败集合比较 |
| --- | --- | --- |
| Web | 7,980 tests／6,935 pass／5 fail／1,040 skip | 5 个失败名均为既有（manifest generation、merging、design fixtures、两条 R12 add-scan-flow），**新增 0** |
| App | 3,328 tests／3,324 pass／2 fail／2 skip | `S1 これまでのコード…` 与 `the original split key set…` 均为既有，**新增 0** |

## App 默认构建（不设 ORBIT_ENABLE_WIDGETS）

- 生成工程：仅 `Orbit` 一个 target；无 `OrbitWidgets`、无 App Group entitlement、Podfile.lock 无 `OrbitWidgetSnapshot`；产物 `Orbit.app` 无 `PlugIns`。
- `xcodebuild`（Debug／iphonesimulator，正常模拟器签名、未手动重签）：**BUILD SUCCEEDED**（`xcodebuild.log`）。
- 设备：Orbit Line C 16e（iOS 26.4）。服务：Web 3500（verify，库 `orbit_verify`）、Metro 8084（`EXPO_PUBLIC_ORBIT_API_BASE_URL=http://127.0.0.1:3500`）。

| 步骤 | 结果 | 证据 |
| --- | --- | --- |
| 启动 → 欢迎页 | PASS | 01-launch.png |
| 邮箱密码登录（qa@orbit.test）→ 新首页 | PASS（今日やること 78/2/0、プラン スコア 40 等真实数据） | 02-after-login.png、03-home.png |
| 人脈 | PASS（78 人） | 04-contacts.png |
| Task（カレンダー） | PASS | 05-task.png |
| iOrbit（全屏，符合 NAV-V3） | PASS | 06-iorbit.png |
| イベント | PASS | 07-events.png |
| 受信箱 | PASS | 08-inbox.png |
| 深链 `orbit:///account` → アカウント（R18c 导出／删除入口） | PASS（系统先弹「Orbit で開きますか？」） | 10-account.png |
| 杀进程冷启动仍保持登录 | PASS；Metro 日志 Keychain 相关 0 条 | 11-coldstart.png、metro-8084.log |
| ログアウト → 登录页 | PASS | 12-logout.png |
| 小组件原生缺失 | `WIDGET_NATIVE_UNAVAILABLE` 仅 INFO 一次，无红屏、不影响登录/登出 | metro-8084.log |

结论：D 线 PX2/R19 记录的「登录后因 Keychain 错误被退回」在正常签名的默认构建上**不复现**，属 D 线手动临时重签环境问题。

## Web（3500，同一账号）

| 页面 | 结果 |
| --- | --- |
| /app/home | PASS（与 App 同源数值一致） |
| /app/contacts、/app/tasks、/app/events、/app/inbox、/app/settings、/app/agent | 均 200、标题正确、无错误标记、无 console error |
| 设置 → 退出登录 → 再访问 /app/home | PASS（跳 `/app/account/login?next=%2Fapp%2Fhome`） |

## 观察项（不阻断，列入⑫交接）

- 两端首页「今日やること／今日待办」内有一来源显示「今は読み込めません／暂时无法加载」：`todo/page` 的部分来源在本机为 `not_implemented`／`unavailable` 时按设计只降级该段（R10 SC-06 口径），非崩溃。
- 本次未覆盖：Google 登录、推送、真实邮件、WidgetKit 实屏（均待用户授权）。

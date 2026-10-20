# Sprint R19 — iOS 主屏与锁屏小组件

**状态：主会话已批准（2026-10-20）。** **档位：H。** **负责：D 线**（/Volumes/ORICO/Dev/worktrees/orbit/redesign-d，line-d）。承接 R10 的首页读模型与布局，实施和验收以 [PLANNER.md](PLANNER.md) 为准。本轮只起草文档，不启动产品实现。

## 一句话目标

在 iOS 主屏和锁屏放置只读的 Orbit 小组件：打开便看到与 App 首页同一账号、同一口径的今日、人脈、秘書和计划信息；点按后进入对应 App 页面，并经过现有全局版本门禁。

## 完成后用户能做什么

1. 在主屏使用设计稿已有的小尺寸「今日やること」「人脈」、中尺寸「秘書から」、大尺寸「プラン スコア」；在锁屏使用圆形计划分数和矩形下一场活动。浅色与深色分别对照 widgets.html 的六张画板。没有画板的加载、无数据、过期、离线、权限失败与隐私遮盖态以真实截图标「设计稿无」。
2. 小组件显示 App 最近一次成功写入的同账号首页摘要和「上次更新」时间。过期、登出或切换账号后不把旧人数据当作当前事实；小组件自身不持有会话、Cookie、API token，也不直接请求服务端。
3. 点按小组件进入 Task › To-do、人脈、受信箱「秘書」、Task › プラン或对应活动页；冷启动与已运行状态都由 R18b 根级版本／维护门禁裁决。未登录时使用现有认证流程，不绕过访问控制。

## 边界与依赖

- **数据依赖：** 只调用 R10 已有 App 首页读模型、D-01 布局响应及其既有来源，不在 WidgetKit 里重算计划、活动、To-do、guide 或秘書规则。R19-01 原交接要求计划分数与首页同源，解释为由 App 消费 R10 已用的 plans/v2/summary 投影后写共享快照，不给 extension 凭据。
- **原生依赖：** 当前仓库跟踪 Expo 配置和 config plugin，ios/ 是本机忽略的 prebuild 产物；实施须把 WidgetKit target、App Group entitlements 与桥接模块做成可重复生成的源文件，不能只手改 ios/。
- **本 Sprint 不做：** Live Activity、灵动岛、远程推送刷新、新服务端 API、Android 小组件、无画板的新尺寸或交互、Gmail 正文摘要。widgets.html 的秘書示例仍有已被 Q5 排除的邮件行，执行前需主会话按既定 Q5 修订画板并重比。
- **授权边界：** 仅本机模拟器构建、WidgetKit 预览及 D 线模拟器桌面验证。真机、Apple 开发者签名的正式 App Group 配置、TestFlight 和 EAS 生产构建记 DEFERRED「待用户授权」；本机结果不代表这些路径通过。

## 验收依据

widgets.html #0–#5（主屏小／中／大与锁屏，浅／深）；[PLANNER.md](PLANNER.md) §8 的逐条 SC；[R10 REPORT](../R10-home-widgets/REPORT.md) 给 R19 的已验证读源与剩余风险。必须留 App 写入→共享容器→extension 读取的同 actor 证据、登出／切号清空、过期与深链版本门禁，以及模拟器实际主屏／锁屏截图。若模拟器无法取得有效 App Group entitlement，只能按 PLANNER 的替代路径验证并把真实共享链记为未过。

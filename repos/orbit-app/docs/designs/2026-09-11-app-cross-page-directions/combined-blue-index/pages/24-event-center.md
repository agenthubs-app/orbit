# P24 · 活动中心

[返回页面目录](../PAGE_CATALOG.md) · [独立设计图](../screens/24-event-center.png)

![活动中心设计参考](../screens/24-event-center.png)

## 定位

路由／状态：`/events/center`。实现标记：现有。本页图是静态设计参考，不是运行中 App 的截图。

页面目标：个人参与活动和有权管理的活动，不默认人人主办。

## 入口与返回

活动根页或管理入口进入。

## 信息与动作

主要信息：我参加的/我负责的；活动角色和正式管理入口。

操作及去向：负责人到运营台，签到协助到签到台。

## 业务边界

列表按账号授权过滤；不建立第二个主办方 App。

## 布局要求

这是二级／表单／独立工作页，不显示全局底部导航；使用标准返回入口，保留来源上下文。 采用浅蓝章节、左侧细蓝线、对齐字段与轻分隔线。字号、触控、行高和安全区以 [UI 规格](../UI_DESIGN_SPEC.md) 为准，不从 PNG 像素直接换算。

## 状态与验收

在主状态之外补齐适用的加载、空内容、搜索无结果、请求失败、无权限／过期状态。表单还需键盘遮挡、验证失败、保存中、保存失败保留输入与未保存退出提示；不适用的状态应标明，不强行增加功能。

至少核对：返回到原来源；动作对象不串号；失败不显示成功；长文本和系统大字号不截断关键内容。详细场景见 [状态与验收](../STATES_AND_ACCEPTANCE.md)，业务流程见 [功能规格](../FUNCTIONAL_SPEC.md)。

## 图像校订

图片决定视觉方向，字段权限、数据状态、按钮可用性以文字规格与真实契约为准。头像、事件和数值均为虚构样例；生成图中的额外文案或装饰不自动成为需求。

## 画面细化参考

以下是本页首轮图像的具体画面说明，便于复现视觉意图；它不是 API 规范。如与上方业务说明冲突，以中文业务说明为准。后续校订的原始提示另见生成记录。

Secondary 活动中心, back 活动, NOdock. Tabs 我参加的 / 我负责的, 我负责的 selected for authorizedorganizerexample. Blue chapter 我负责的活动. Three compact photoeventrows: 周末产品交流会 9月12日周六14:00 东京·涩谷 role负责人 button 运营台; 设计师午间聚会 9月13日周日12:00 东京·代官山 role协作者 button 查看管理; 产品与工程圆桌 9月18日周五19:00 东京·五反田 role签到协助 button 签到台. Clear roles not impliedalladmin. A quiet explanatory line 只展示当前账号有权管理的活动。 No neweventcreation wizard/ billing/user-switcher or separate organizerapp.


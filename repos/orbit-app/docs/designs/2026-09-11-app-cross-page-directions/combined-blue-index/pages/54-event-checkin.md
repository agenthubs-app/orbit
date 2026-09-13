# P54 · 签到台

[返回页面目录](../PAGE_CATALOG.md) · [独立设计图](../screens/54-event-checkin.png)

![签到台设计参考](../screens/54-event-checkin.png)

## 定位

路由／状态：`/events/[id]/operations/check-in`。实现标记：现有 · 角色敏感。本页图是静态设计参考，不是运行中 App 的截图。

页面目标：名单搜索、未签到／已签到、真实签到结果。

## 入口与返回

被授权的签到台入口。

## 信息与动作

主要信息：名单、未签到/已签到、搜索、签到动作。

操作及去向：对准确人员签到后回读。

## 业务边界

示例单独采用活动日 9 月 12 日 13:50；不是当前 9 月 11 日实时数据。

## 布局要求

这是二级／表单／独立工作页，不显示全局底部导航；使用标准返回入口，保留来源上下文。 采用浅蓝章节、左侧细蓝线、对齐字段与轻分隔线。字号、触控、行高和安全区以 [UI 规格](../UI_DESIGN_SPEC.md) 为准，不从 PNG 像素直接换算。

## 状态与验收

在主状态之外补齐适用的加载、空内容、搜索无结果、请求失败、无权限／过期状态。表单还需键盘遮挡、验证失败、保存中、保存失败保留输入与未保存退出提示；不适用的状态应标明，不强行增加功能。

至少核对：返回到原来源；动作对象不串号；失败不显示成功；长文本和系统大字号不截断关键内容。详细场景见 [状态与验收](../STATES_AND_ACCEPTANCE.md)，业务流程见 [功能规格](../FUNCTIONAL_SPEC.md)。

## 图像校订

图片决定视觉方向，字段权限、数据状态、按钮可用性以文字规格与真实契约为准。头像、事件和数值均为虚构样例；生成图中的额外文案或装饰不自动成为需求。

## 画面细化参考

以下是本页首轮图像的具体画面说明，便于复现视觉意图；它不是 API 规范。如与上方业务说明冲突，以中文业务说明为准。后续校订的原始提示另见生成记录。

Secondary 签到台, back 运营台, NOdock. Context 周末产品交流会. Fixtureeventday note 9月12日13:50 nottodaySep11. Search 搜索姓名、公司. Tabs 未签到22 / 已签到2 firstactive. Bluechapter 未签到. Fourattendeerows 林悦 云间工作室 未签到 button 签到; 陈默 山海科技 未签到 button 签到; 周宁 松石咨询 未签到 button 签到; 许妍 白露设计 未签到 button 签到. Quiet 刷新名单, no automaticallymark checkin, no fakeQR camera or scanner unsupported, no biometric.


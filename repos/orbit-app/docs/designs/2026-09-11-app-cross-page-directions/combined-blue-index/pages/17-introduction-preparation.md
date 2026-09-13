# P17 · 引荐准备

[返回页面目录](../PAGE_CATALOG.md) · [独立设计图](../screens/17-introduction-preparation.png)

![引荐准备设计参考](../screens/17-introduction-preparation.png)

## 定位

路由／状态：`/contacts/intros`。实现标记：现有 · 受外发边界约束。本页图是静态设计参考，不是运行中 App 的截图。

页面目标：候选来源、准备私人邀请草稿、查看已有准备记录。

## 入口与返回

既有引荐准备入口。

## 信息与动作

主要信息：候选来源、可准备的人、已有私人邀请草稿。

操作及去向：准备邀请只产生可确认草稿；查看资料。

## 业务边界

不自动外发邮件、邀请或创建已确认会面。

## 布局要求

这是二级／表单／独立工作页，不显示全局底部导航；使用标准返回入口，保留来源上下文。 采用浅蓝章节、左侧细蓝线、对齐字段与轻分隔线。字号、触控、行高和安全区以 [UI 规格](../UI_DESIGN_SPEC.md) 为准，不从 PNG 像素直接换算。

## 状态与验收

在主状态之外补齐适用的加载、空内容、搜索无结果、请求失败、无权限／过期状态。表单还需键盘遮挡、验证失败、保存中、保存失败保留输入与未保存退出提示；不适用的状态应标明，不强行增加功能。

至少核对：返回到原来源；动作对象不串号；失败不显示成功；长文本和系统大字号不截断关键内容。详细场景见 [状态与验收](../STATES_AND_ACCEPTANCE.md)，业务流程见 [功能规格](../FUNCTIONAL_SPEC.md)。

## 图像校订

图片决定视觉方向，字段权限、数据状态、按钮可用性以文字规格与真实契约为准。头像、事件和数值均为虚构样例；生成图中的额外文案或装饰不自动成为需求。

## 画面细化参考

以下是本页首轮图像的具体画面说明，便于复现视觉意图；它不是 API 规范。如与上方业务说明冲突，以中文业务说明为准。后续校订的原始提示另见生成记录。

Secondary 引荐准备, back 人脉, NOdock. Chapter 引荐总览, concise 先整理适合牵线的人，邀请可以先保存为草稿。 Chapter 可准备的人, three personrows 林悦 产品设计师·云间工作室 来源：朋友介绍 / 陈默 产品经理·山海科技 来源：活动认识 / 许妍 创业者·白露设计 来源：朋友介绍. Each small 查看资料 and 准备邀请 action. Chapter 已准备的邀请, one row 林悦的交流邀请 草稿·未发送 9月10日. No Sendnow/autoemail/meetingconfirmation. Invitationpreparation private, not claimedplatformidentity. Compact white groupedlist and bluechapter system, no large metricdashboard.


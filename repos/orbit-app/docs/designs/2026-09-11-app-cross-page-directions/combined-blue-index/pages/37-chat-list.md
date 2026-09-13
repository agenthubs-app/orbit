# P37 · 站内聊天列表

[返回页面目录](../PAGE_CATALOG.md) · [独立设计图](../screens/37-chat-list.png)

![站内聊天列表设计参考](../screens/37-chat-list.png)

## 定位

路由／状态：`/chat`。实现标记：现有 · B4资格。本页图是静态设计参考，不是运行中 App 的截图。

页面目标：只展示真实账号会话，不从联系人名称伪造。

## 入口与返回

收件箱站内消息入口。

## 信息与动作

主要信息：真实账号会话、最后一条消息、时间、未读数。

操作及去向：打开同一会话到 P38。

## 业务边界

不从外部联系人姓名构造会话或猜测 userId。

## 布局要求

这是二级／表单／独立工作页，不显示全局底部导航；使用标准返回入口，保留来源上下文。 采用浅蓝章节、左侧细蓝线、对齐字段与轻分隔线。字号、触控、行高和安全区以 [UI 规格](../UI_DESIGN_SPEC.md) 为准，不从 PNG 像素直接换算。

## 状态与验收

在主状态之外补齐适用的加载、空内容、搜索无结果、请求失败、无权限／过期状态。表单还需键盘遮挡、验证失败、保存中、保存失败保留输入与未保存退出提示；不适用的状态应标明，不强行增加功能。

至少核对：返回到原来源；动作对象不串号；失败不显示成功；长文本和系统大字号不截断关键内容。详细场景见 [状态与验收](../STATES_AND_ACCEPTANCE.md)，业务流程见 [功能规格](../FUNCTIONAL_SPEC.md)。

## 图像校订

图片决定视觉方向，字段权限、数据状态、按钮可用性以文字规格与真实契约为准。头像、事件和数值均为虚构样例；生成图中的额外文案或装饰不自动成为需求。

## 画面细化参考

以下是本页首轮图像的具体画面说明，便于复现视觉意图；它不是 API 规范。如与上方业务说明冲突，以中文业务说明为准。后续校订的原始提示另见生成记录。

Secondary 站内消息, back 收件箱, NOdock. Search 搜索会话. Chapter 最近会话. Four rows actual platformaccountfixtures: 陈默 14:12 我们下周二下午再对一下需求？ unread2; 许妍 昨天 谢谢，资料已经收到了。; 王安 9月9日 原型演示很清楚。; 苏禾9月8日 到时见。 Each headshot, name, lastmessage, timestamp separatecolumns. No automaticallyturnexternallin.yuecontactintoaccount, no emailthreadmixing, no fabricatedsenddeliveryreceipt.


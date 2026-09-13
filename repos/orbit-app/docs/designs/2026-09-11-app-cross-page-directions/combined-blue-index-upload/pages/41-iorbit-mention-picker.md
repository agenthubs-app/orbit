# P41 · IORBIT 选择人脉

[返回页面目录](../PAGE_CATALOG.md) · [独立设计图](../screens/41-iorbit-mention-picker.jpg)

![IORBIT 选择人脉设计参考](../screens/41-iorbit-mention-picker.jpg)

## 定位

路由／状态：`/ai/[id]（引用选择状态）`。实现标记：设计建议 · APP-05/B3。本页图是静态设计参考，不是运行中 App 的截图。

页面目标：搜索并选择稳定联系人ID，区分同名者。

## 入口与返回

AI 输入器中的 @ 引用选择。

## 信息与动作

主要信息：搜索、姓名+公司+职位、已选项。

操作及去向：选择稳定联系人 ID，完成后回填但不发送。

## 业务边界

同名人必须能区分；被删或无权的联系人不能残留可用引用。

## 布局要求

这是二级／表单／独立工作页，不显示全局底部导航；使用标准返回入口，保留来源上下文。 采用浅蓝章节、左侧细蓝线、对齐字段与轻分隔线。字号、触控、行高和安全区以 [UI 规格](../UI_DESIGN_SPEC.md) 为准，不从 JPEG 像素直接换算。

## 状态与验收

在主状态之外补齐适用的加载、空内容、搜索无结果、请求失败、无权限／过期状态。表单还需键盘遮挡、验证失败、保存中、保存失败保留输入与未保存退出提示；不适用的状态应标明，不强行增加功能。

至少核对：返回到原来源；动作对象不串号；失败不显示成功；长文本和系统大字号不截断关键内容。详细场景见 [状态与验收](../STATES_AND_ACCEPTANCE.md)，业务流程见 [功能规格](../FUNCTIONAL_SPEC.md)。

## 图像校订

顶部和底部重复“完成”只留一个主要提交入口；如多选已获确认用复选框，不从圆圈控件推断单选限制。

## 画面细化参考

以下是本页首轮图像的具体画面说明，便于复现视觉意图；它不是 API 规范。如与上方业务说明冲突，以中文业务说明为准。原始生成与校订记录保留在未压缩完整版；本上传版保留逐页画面说明。

Full-screen IORBIT contextpicker, back 会话, title 选择人脉, right 完成, NOdock. Search 搜索姓名、公司 input 林. Chapter 搜索结果. Four compactrows roundselection: selected 林悦 产品设计师·云间工作室 东京; unselected 林悦 运营经理·北辰科技 大阪 (same name distinguishcompanyrole); unselected 林青 研究员·谷雨科技 东京; unselected 林澈 工程师·远山科技 京都. Footer 已选1位, pill 林悦·云间工作室 removablex. Note 选择后加入问题上下文，仍需手动发送。 No exposedUUID or automaticmessage.

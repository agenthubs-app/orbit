# P16 · 人脉结构明细

[返回页面目录](../PAGE_CATALOG.md) · [独立设计图](../screens/16-contact-structure-detail.png)

![人脉结构明细设计参考](../screens/16-contact-structure-detail.png)

## 定位

路由／状态：`/contacts/analysis/[dimension]/[bucketId]`。实现标记：现有。本页图是静态设计参考，不是运行中 App 的截图。

页面目标：按行业或来源等维度钻取联系人。

## 入口与返回

由具体维度和桶进入。

## 信息与动作

主要信息：维度名称、数量、搜索和可分页人脉列表。

操作及去向：点击到同一稳定联系人；返回保留原维度。

## 业务边界

不能将分桶数量当成当前已加载数量。

## 布局要求

这是二级／表单／独立工作页，不显示全局底部导航；使用标准返回入口，保留来源上下文。 采用浅蓝章节、左侧细蓝线、对齐字段与轻分隔线。字号、触控、行高和安全区以 [UI 规格](../UI_DESIGN_SPEC.md) 为准，不从 PNG 像素直接换算。

## 状态与验收

在主状态之外补齐适用的加载、空内容、搜索无结果、请求失败、无权限／过期状态。表单还需键盘遮挡、验证失败、保存中、保存失败保留输入与未保存退出提示；不适用的状态应标明，不强行增加功能。

至少核对：返回到原来源；动作对象不串号；失败不显示成功；长文本和系统大字号不截断关键内容。详细场景见 [状态与验收](../STATES_AND_ACCEPTANCE.md)，业务流程见 [功能规格](../FUNCTIONAL_SPEC.md)。

## 图像校订

图片决定视觉方向，字段权限、数据状态、按钮可用性以文字规格与真实契约为准。头像、事件和数值均为虚构样例；生成图中的额外文案或装饰不自动成为需求。

## 画面细化参考

以下是本页首轮图像的具体画面说明，便于复现视觉意图；它不是 API 规范。如与上方业务说明冲突，以中文业务说明为准。后续校订的原始提示另见生成记录。

Secondary designindustry drilldown, back 人脉分析, title 设计服务. NOdock. Caption 48位人脉, search 搜索姓名、公司. Pale-blue chapter 设计服务 · 48 and bluelefttick. Seven visible compact rows 林悦 产品设计师·云间工作室 / 苏禾 品牌设计·夏木设计 / 许妍 创业者·白露设计 / 李珊 用户研究·谷雨科技 / 顾言 创业者·晨光工作室 / 宋岚 产品顾问·栖云咨询 / 沈青 体验设计·白露设计. Use role/contactfixtures noteverycompanytechmeansindustrytypedfine. Thinseparatorsavatars, arrow perrow. End 加载更多 or natural scroll continuation, not fake all48rendered. Quiet explanatory 这里按人脉资料中的行业归类。 No generatingAI or changingclassification.


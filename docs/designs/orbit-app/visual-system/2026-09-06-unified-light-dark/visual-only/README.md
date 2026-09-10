# Orbit — 保持现有产品逻辑的视觉微调

2026-09-06。单一视觉系统，浅色与深色两个主题。使用内置 ImageGen，以真实应用截图为底稿生成；没有修改应用代码。

## 图稿

| 页面（从左到右） | 浅色 | 深色 |
| --- | --- | --- |
| Orbit AI、今天、关系收件箱 | [light-a.png](light-a.png) | [dark-a.png](dark-a.png) |
| 侧边抽屉、活动、人脉分析（结构页滚动位置） | [light-b.png](light-b.png) | [dark-b.png](dark-b.png) |

## 调整边界

- 只调整配色、控件圆角、间距、对齐与局部排布。原页面入口、按钮数量、操作职责、筛选项与导航模型不变。
- 保留 Orbit AI 首页及底部输入框；没有新增底部导航。
- 抽屉保留今天、人脉、活动三个常用入口。
- 收件箱保留四项统计及待处理/对话两个页签；统计改成紧凑横排，不增加分类。
- 活动保留查看活动、记下推荐两个操作；分析保留环形图及原筛选项。

## 视觉方向

暖白/炭灰背景配低饱和灰靛色；柔和矩形按钮；轻分隔线与克制的卡片边界。两套主题使用对应布局。

具体色值与生成约束见 [PROMPTS.md](PROMPTS.md)。色值为设计目标，不是对位图取色后得到的精确实现令牌。

## 核对与限制

四张图均为 1536×1024，每张三个纵向手机页面。已逐图检查主要控件、页面顺序及数据类别。它们是视觉讨论稿，不是可点击原型，也不是逐像素规格。

ImageGen 仍带来小字、日期和主题间细节偏差，例如活动日期的星期文字出现误写，今天页日期有字形变化；部分图片保留了系统状态栏，深色照片也有明暗变化。这些不是产品修改建议。后续实现必须保留现有代码中的文案、日期格式、照片、状态与行为，不能照抄生成图中的偏差。

## 源截图

- `repos/orbit-app/.tmp/audits/2026-08-31-full-ui-baseline/01-ai-home.png`
- `repos/orbit-app/.tmp/audits/2026-08-31-full-ui-baseline/05-today-live.png`
- `repos/orbit-app/.tmp/audits/2026-08-31-full-ui-baseline/07-inbox-live.png`
- `repos/orbit-app/.tmp/audits/2026-08-31-full-ui-baseline/02-navigation-drawer.png`
- `repos/orbit-app/.tmp/audits/2026-08-31-full-ui-baseline/06-events-live.png`
- `repos/orbit-app/.tmp/audits/2026-09-01-inbox-bar-redesign-current-dashboard.png`

本目录取代上级目录中偏离现有页面逻辑的旧探索图；旧文件仅保留供追溯，不作为实施依据。

# 移动端行业圆盘重设计（2026-08-31）

本目录保存 Orbit App「人脉分析 → 结构 → 行业分布」针对手机屏幕重新设计的三张候选视觉稿。

- `01-six-point-focus-ring.png`
- `02-mobile-legend-dock.png`
- `03-six-item-compass.png`

## 统一数据规则

圆盘默认显示五个主要行业和一个“其他 4 个”聚合扇区：

- 科技与互联网：21 人，27%
- 餐饮与食品：19 人，24%
- 专业服务：13 人，17%
- 社群与非营利：11 人，14%
- 金融与投资：9 人，12%
- 其他 4 个：5 人，6%

选中扇区后，在圆盘中心显示行业、人数和占比；“其他 4 个”进入下一层查看制造与供应链、零售与消费、医疗与健康、文化传媒与创意。

## 参考原则

- Apple `SectorMark` 建议圆盘控制在 5–7 个扇区，必要时合并为 “Other”：<https://developer.apple.com/documentation/charts/sectormark>
- Apple Charts HIG 建议紧凑环境优先扩大绘图区，保持数据为第一视觉层级：<https://developer.apple.com/design/human-interface-guidelines/charts>
- Apple Charting Data 建议保持图表简单，并通过交互渐进呈现更多细节：<https://developer.apple.com/design/human-interface-guidelines/charting-data>

# Orbit 新 UI：浅蓝分区 × 对齐索引

日期：2026-09-11。交付对象：用户及接手的 Claude Design。

用户已选择跨页方案 02／03 的组合。首页仍为已批准的第三轮 `02-split-day`，不是把旧首页方案 02、03 重新混合。当前目录是新融合稿的单页图片与 UI／功能交接包；不是 App 实现或上线记录。融合稿细节仍可审阅调整。

## 交接入口

- [交给 Claude Design 的任务说明](CLAUDE_DESIGN_BRIEF.md)：从这里开始。
- [逐页目录](PAGE_CATALOG.md)：72 个页面／关键状态的独立图片与说明。
- [UI 设计规格](UI_DESIGN_SPEC.md)：视觉系统、字号、密度、导航、组件和适配。
- [功能规格](FUNCTIONAL_SPEC.md)：各模块流程、数据归属、权限与后端依赖。
- [状态与验收](STATES_AND_ACCEPTANCE.md)：加载、空、失败、权限与关键场景。
- [决策与交接边界](DECISIONS_AND_HANDOFF.md)：已批准、待确认、未来功能及跨端影响。
- [检查记录](QA_REPORT.md)：实际文件检查结果与精修注意项。

## 文件组织

`screens/` 是每页独立 PNG，`pages/` 是逐页说明，`references/` 是原 02／03 方向板。`ASSET_MANIFEST.json` 记录尺寸、来源和文件校验和；`ROUTE_COVERAGE.json` 记录路由对应关系；`PROMPTS.md` 与 `GENERATION_CHECKPOINT.json` 保留图像生成说明和追溯记录。`PAGE_PLAN.json` 是设计元数据，不是运行时配置。

先用 P01 首页、P08 人脉详情、P07 人脉列表、P40 IORBIT 长文校准组件，再逐页细化。72 张图包括同一路由的不同状态和后期页面，不代表 72 条现有路由。

## 使用边界

这些是高保真静态参考，不是可编辑 Figma／Sketch 文件或客户端运行截图。逻辑尺寸以 UI 规格为准，不能直接把图片像素换成点数。生成图中的额外计数器、素材文字和重复按钮不是新增需求，校订说明见各单页文档。

新笔记接通并保全旧内容前，不删除旧备注输入或数据。D2–D6 和整体实施计划没有因本包自动获批。本次没有修改 App / Web 代码、API、数据库，没有提交、推送或部署。

把整个文件夹交给 Claude Design，从任务说明开始；不要只交 PNG 而遗漏功能和状态边界。

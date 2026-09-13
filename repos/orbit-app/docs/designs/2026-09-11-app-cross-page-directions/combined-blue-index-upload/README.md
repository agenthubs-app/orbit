# Orbit 新 UI 设计 · 20 MB 上传版

本包保留全部 72 张独立页面／关键状态设计图、72 份逐页说明，以及完整 UI、功能、交互状态和交接边界。没有删减业务页面。

## 从这里开始

1. [Claude Design 任务说明](CLAUDE_DESIGN_BRIEF.md)
2. [逐页图片目录](PAGE_CATALOG.md)
3. [UI 设计规格](UI_DESIGN_SPEC.md)
4. [功能规格](FUNCTIONAL_SPEC.md)
5. [状态与验收](STATES_AND_ACCEPTANCE.md)
6. [决策与交接边界](DECISIONS_AND_HANDOFF.md)

## 压缩方式

全部页面由 PNG 转为 JPEG，编码质量 80。保留原来的 853×1844 或 853×1843 像素尺寸，不缩小文字、不裁切、不重新生成界面。JPEG 是有损压缩，细节并非逐像素无损，但详情页和长文页已抽查可读性。

上传版不包含两张旧方案来源板和冗长的完整生成记录；页面本身已经体现所选融合方向。完整 PNG、原始方向板及原压缩包保留在原目录，没有删除或覆盖。

所有文档中的页面图片链接已改为 JPEG。图片编号、页面数和功能说明不变。首页仍沿用已批准的设计，只做文件编码压缩。

## 文件与校订

`screens/`：72 张 JPEG。  
`pages/`：72 份页面说明。  
[素材清单](ASSET_MANIFEST.json)：上传版尺寸、编码和校验和。  
[路由覆盖](ROUTE_COVERAGE.json)：63 个原有路由文件的映射。  
[检查记录](QA_REPORT.md)：上传版完整性核验。  
[原设计精修注意项](DESIGN_REVIEW_NOTES.md)：生成图中不应照搬的细节。

图片是设计参考，不是运行中的 App 截图。原有待确认与后期功能边界继续有效。整个文件夹即可交给 Claude Design，不需要再附原 80 MB 包。

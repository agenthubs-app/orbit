# R31a 独立复核（RD-25）

**结论：不予通过。** SC-03 未完成；SC-05、SC-08 的“done”缺少验收所需证据，另有弹层失焦时序风险。

## S

- **S1｜组件门禁未收口。** `REPORT.md:29–31` 记录 44 张仅 1 张通过，却将 SC-05 标为 done。`repos/orbit-app/src/screens/showcase/ComponentShowcaseScreen.tsx:5` 和 `repos/orbits/scripts/visual/views/app-R31a-components.json:12` 均未纳入 UnderlineTabs、TabBar、FullScreenSearch。补展示与 b2 对照项，逐张通过后再验收。
- **S2｜输入中离页可能留下遮挡新页的 Sheet。** `repos/orbit-app/src/components/ui/BottomSheet.tsx:79–89` 在键盘弹出时跳过路由变化，键盘收起却不重查；根布局 `app/_layout.tsx:101` 向仍挂载的旧页广播新路径。键盘收起时重查失焦状态，并加“输入中跳转→收起键盘”测试。
- **S3｜不退步尚未成立。** `REPORT.md:117–125`：124 个基线键中首轮实跑 107 个、80 个通过；另 8 个 R30 键有单独通过记录，但 9 个需手势键及 14 个 R05 壳区域未复核。首轮 27 个基线失败中，17 个获新 `[raster]` 归因，其余 10 个仍属环境状态或待查。补齐最终重跑和未过键的处理结果，再将 SC-08 标为 done。

## M

- **M1｜Toast 只保证调用顺序。** `repos/orbit-app/src/components/ui/Toast.tsx:125` 调用 `onClose()` 后立即运行回调；状态更新尚未保证提交。关闭渲染完成后再执行回调，并测试回调执行时 Toast 已消失。
- **M2｜无障碍证据不足。** `BottomSheet.tsx:58–59` 有 VoiceOver escape 与禁用遮罩关闭的代码，`tests/ui-overlays.test.ts:80` 只覆盖模拟点击和 Android 返回键。补 iOS VoiceOver 退出及焦点检查，才能确认 SC-04。
- **M3｜开发状态“禁用”已证，“不进正式构建”未证。** `src/screens/add/design-state.ts:6` 经 `addDesignMock` 的 `__DEV__` 条件关闭正式包入口；现有测试未检查发布产物是否包含该开关。按 SC-07 原文补发布包检查，或明确将验收表述改为“正式包不可启用”。

## m 与核实通过项

- `REPORT.md:111–112` 未附 SC-09 要求的 `detect-changes` 结果；补记录。GitNexus 对本次关键组件返回 `UNKNOWN`，不能据此认定调用影响低。
- 工具 `[contrast]` 针对性测试 **7/7**、Sheet 判定测试 **5/5**。原始输出可复算出首轮 **107 键、80 过**；提交确实新增 **17 键、76 带** `[raster]`。用保存的图片独立重算 R16-01、R16-05 深色均为 PASS；门禁对 `[raster]` 仅验标签前缀，这两张的通过不证明全部 17 张的成因。
- 4 处手写件替换、R30 的 8 张重比可查。抽查的计划页调用点只换组件参数；Web 侧改动为共享 token 的生成文件，未见 Web 业务界面改动。本次未改仓库、未提交。
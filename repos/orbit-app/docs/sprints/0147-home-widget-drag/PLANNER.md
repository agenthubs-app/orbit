# Sprint 0147 — 首页小组件：长按就能拖动换位置

**Plan revision:** 1。**模式:** existing-codebase / single-generator；运行状态以[登记表](../README.md#sprint-登记表)为准。
**原需求:** 用户 2026-11-02 需求 2「首页，可以移动小组件，调整位置」；协调者自主决定。
**单一目标:** 拖动换位好找、跟手、落点准确。
**基线:** 0146 合入后的 `chat-agent`。

## 已确认的事实

- 实际首页是 `src/screens/home/HomeWidgetsScreen.tsx`（`HomeDashboardScreen` 已无路由）。已有编辑模式（抖动、×、添加组件）和基于 `PanResponder` 的拖动：只能在编辑模式里、按住 220ms；落点用约 100px 粗略阈值；其他组件不让位；跑在 JS 线程。
- 保存走 `PUT /api/home/layout` 的 `app` 列表（`use-home-layout.ts`），断网存本机草稿。
- 已装 `react-native-gesture-handler` 2.32、`react-native-reanimated` 4.5.1，无拖动列表库。

## 决定（协调者）

- 普通模式长按组件 → 进入编辑并立即开始拖这个组件（iOS 行为）。
- 用 gesture-handler + reanimated 重写拖动：跟手在 UI 线程；按各组件实测布局（onLayout 记录的矩形，支持大小不同的组件）计算落点；其他组件用动画让位。不引入新依赖。
- 保存逻辑不变；删除旧 PanResponder 代码。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0147-01 | 落点按实测矩形计算，宽窄组件混排时位置准确 | 纯函数测试 |
| SC-0147-02 | 普通模式长按进入编辑并开始拖动；完成后保存新顺序 | 页面测试 |
| SC-0147-03 | phoneweb 运行截图：拖动中让位、松手后顺序 | 截图 |
| SC-0147-04 | 全量与类型检查无新增失败 | 命令与计数 |

# PW-0002 — 手机布局与交互

模式：existing-codebase / single-generator。Owner：phoneweb-B。基线：`f416887dc` 加已提交 phoneweb 规划。用户已批准复用实际 App 外观及实施。读项目 DESIGN/README、App RULES、Bridge status/handoffs 与本端 AGENTS；不重新发散视觉风格或索取同一设计批准。

## 文件归属

- 可改：`repos/orbit-app/src/components/AppScreen.tsx`、`OrbitTabBar.tsx`、`src/screens/AiConversationScreen.tsx`（仅必要视口/键盘布局，不改业务）、新增 Web 视口/键盘 adapter 及其 native no-op counterpart、`app/+html.tsx`、Web 样式、对应直接测试；本 Sprint 文档。
- 新适配器如需根布局装配，交 A 线明确 import/props，不并行改 `app/_layout.tsx`。
- 不改：package/lockfile/app.config/Metro、auth/API/storage/notification 适配、业务服务、语言/主题 token 全局重设计、根登记表或其他线。
- 端口32112仅自己验证；A 在32111。不要操作3000/8081、其他线浏览器会话或Simulator。

## 步骤与接口

- [ ] 登记 run-01/HEAD/diff/Planner hash，核对文件锁，在独立 worktree 安装锁定依赖。
- [ ] 读实际 AppScreen/TabBar/聊天输入区和既有渲染测试，盘点浏览器真实差异；同尺寸观察现有组件。需要A构建修复时先做独立组件/viewport验证，不复制其构建改动。
- [ ] GitNexus upstream impact；为确定存在的Web布局/键盘问题建立失败行为用例，然后做最小平台适配。保持原生路径现状，禁止为了演示造假业务数据。
- [ ] 页面根视口支持移动浏览器可见高度与安全区；输入聚焦/键盘展开时底栏不遮挡输入和提交；键盘收起恢复导航。事件listener正确清理，桌面窗口调整不误判为键盘。
- [ ] 保持五入口、真实返回/深链 fallback、触控尺寸和页面滚动；按360/390/430宽度检查，浅色/深色和大字号只覆盖实际变化维度。宽屏可居中内容，不加假手机外框，不隐藏浏览器控件。
- [ ] 定向测试、App typecheck、可运行的浏览器检查；记录截图位置和缺项。实际App截图基线不足时明确标示，不将RNW受控截图声称原生或实体手机证据。
- [ ] detect_changes后显式路径提交，交固定SHA/REPORT；主协调集成，禁止合入chat-agent/push/发布。

## SC（五项）

| SC | 行为 | 证据 |
| --- | --- | --- |
| 01 | 五入口/页面层级与固定App保持一致 | 导航行为/渲染检查与同尺寸截图 |
| 02 | 手机动态视口、安全区和滚动不遮挡关键操作 | 浏览器viewport/滚动检查，实体键盘未测需明示 |
| 03 | 键盘弹出/收起保持输入与提交可达，无事件泄漏 | 受控viewport事件测试和可执行浏览器场景 |
| 04 | 360/390/430窄屏及受影响字号下无新增横向溢出 | 截图+布局断言，不以截图存在替代目视检查 |
| 05 | 原生共享组件既有行为不回归 | 受影响组件/导航测试和typecheck；所需原生证据单列 |

最小验证按App RULES执行。已知失败先定位，不能删测试或降低SC。缺A依赖只暂停该动作，独立工作继续。无新问题不要无关重构/重复全量。

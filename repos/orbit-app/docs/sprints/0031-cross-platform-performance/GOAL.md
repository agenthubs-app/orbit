# Sprint 0031 — App 与 Web 关键路径性能

## 要实现什么

让 Orbit App 和 Web 的常用路径更快响应：先在同一固定环境建立可重复的真实性能基线，再只优化测得最慢且可归因的关键路径，不改变数据权限、业务结果或页面功能。

## 做完能看到什么

- Release App 的冷启动、登录恢复、首页、笔记、收件箱、日程和“我的”切换都有明确耗时；重复打开已缓存内容时减少等待、重复请求和无效渲染。
- production Web 的首页、联系人、笔记、收件箱、日程和 AI 页面都有导航、HTML/RSC/脚本、Core Web Vitals 与关键 API 时间；首屏不再加载当前页面用不到的大型客户端模块。
- AI 请求在 150 ms 内给出可见的“正在处理”反馈；本地编排、数据库与外部 provider 延迟分别记录，不以牺牲答案、权限或审计证据来伪造提速。
- 被选中的 App 和 Web 瓶颈在相同环境下 p50 至少改善 30%，其他关键路径 p95 不得退化超过 10%。

## 怎么验收

所有对比都使用同一 commit、同一生产 Web 服务、同一受控账号/数据集和固定 Simulator。每个场景先预热 3 次，再连续测量 10 次并保存原始 JSON；报告同时列 baseline 和 optimized 的 p50/p95、请求数、渲染次数、包体与失败。最后重新 production build/restart Web，构建并安装 Release App，在 iOS Simulator 走完六条真实路径；固定最终 SHA 提交后由协调者合并回 `chat-agent` 并在精确合并树复验。

完整设计与执行步骤见 [DESIGN.md](DESIGN.md) 和 [PLANNER.md](PLANNER.md)。本页不表示已经实现；状态以执行后的 `REPORT.md`、Bridge 交接和主线验证为准。

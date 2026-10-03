# Sprint W0059 — 执行总结

协调者代写（Generator 写入 REPORT 被拦截，全文取自 Generator 最终回报）。

## 结果

- 已验证能做到：从首页「今日要事」、我的计划、人脉列表（滚动后）、人脉分析（概览与机会）点开联系人详情，用 ×／底部关闭／Esc／点遮罩／左上「‹ 返回 {来源}」任一方式关闭，都回到原页、滚动恢复（差 5–16px）；标签按来源显示，英文同样（SC-01、SC-04）。直开、刷新、非法 returnTo 回 /app/contacts 显示「返回人脉」；合法 returnTo=/app/agent/plan 去该页显示「返回我的计划」（SC-02）。示例弹窗四种关法只收起、0 导航、不读来路；输入框内与拦截层开着时 Esc 不关（SC-03）。iOrbit 对话「查看」「查看联系人」与人脉路由 VM 详情链接对 id 编码（SC-04）。
- 仍未验证：「活动日程弹窗」入口无真实浏览器往返（本机账号无约见，生成需额外写入）；该入口为普通 <a>，与已验证链接同一记录器，标签由测试覆盖。特殊字符 id 仅单测。

## 运行记录

- 结果：completed
- Generator：Claude Opus 5.5／2026-10-03；Planner revision 2（SHA256 c1aaa1f79c3d643d91c68859a7a14613df5de373e3777c6f0079c3b178c3dfc0）
- 分支 sprint/W0059-detail-close-return（基线 58173d1c）；功能 SHA c7925fc3；合并 SHA：见登记表
- 档位 L；未跑全量；付费 AI 0；未 push

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-W0059-01 | pass | tests/pages/app-network-detail-modal.test.tsx（五种操作 router.back 1 次、assign 0 次；无 Router 时 history.back；中英标签）+ tests/pages/contact-detail-return.test.ts |
| SC-W0059-02 | pass | contact-detail-return.test.ts（直开/过期/目标不符/query 不符/刷新/storage 抛错/坏记录；returnTo 20 条拒绝）+ 组件测试 6 场景×5 关法 + 浏览器 08–11 |
| SC-W0059-03 | pass | app-network-demo-mode.test.tsx 新用例 + 既有 Esc/拦截层用例 + 组件测试（INPUT/TEXTAREA/contentEditable、修饰键/中键） |
| SC-W0059-04 | pass（活动日程入口见上） | ~/orbit-sprint-evidence/web/sprint-W0059/run-01/ browser-results.json（01–11）、browser-reload-en.json、1440/375 截图；tests/pages/contact-detail-entry-encoding.test.tsx |

收口：59 文件 790 项，788 pass／0 fail／2 skip（PG 只读断言因未设 ORBIT_EVENT_DATABASE_URL 跳过，无关）；tsc 源码 0 错误（.next/types 8 条为他会话陈旧生成物）。

## 假设与额外阅读

- 额外阅读：use-agent-chat.ts、iorbit-shell.tsx、iorbit-home.tsx、orbit-language-context/core、proxy.ts、network-shell.tsx、verify-server.sh。
- 刷新判定细化为「文档本身就是该详情页且类型 reload」；比较路径忽略 lang 参数。
- 程序化入口在 LOW 的 AgentPeopleRow/AgentTodoRow 与 IOrbitLiveShell navigate 里 noteContactNavigation，不改 HIGH 的 useAgentChat。
- 不撤回被 preventDefault 的点击意图（今日要事标题是 <a>+preventDefault+程序化跳转）。
- 弹窗读 AppRouterContext（无则 history.back），不用 useRouter。
- /app/contacts/analysis/* 同标「返回人脉分析」；returnTo 只收 /app/ 开头；顶栏标题改为返回按钮（aria-label 保留）。
- impact：NetworkDetailModal LOW；AgentPeopleRow/AgentTodoRow/IOrbitLiveShell/contactDetailHref LOW；AppContactDetailPage/AppLayout/NETWORK_STYLES UNKNOWN（文本搜索确认）；useAgentChat、PanelCards HIGH 未修改。detect-changes 报 high（入口下游 13 流程），未改下游，不升 H。
- 同步改一条源码断言（app-agent-contact-recommendations.test.tsx）。

## 交接

- NetworkDetailModal 内 close() 唯一关闭函数；onCloseLink 给两个 <a>；左上 a.btn.nw-detail-back[data-network-detail-back]，文案 detailReturnLabel；Esc 例外在 onKey。
- 纯函数 network-0918/detail-return.ts；记录器 detail-return-recorder.tsx（ContactDetailReturnRecorder 挂 app/(app)/app/layout.tsx；noteContactNavigation(href)）；sessionStorage 键 orbit:contact-detail-return。
- [id]/page.tsx 读 ?returnTo= 校验后作 closeHref。
- 无授权项；回退：revert c7925fc3。

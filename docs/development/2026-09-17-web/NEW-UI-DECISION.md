# 新 UI 边界决定

## 2026-09-21：改为边界 B — 屏级替换（用户拍板）

- 背景：边界 A 交付 35 提交后，用户 2026-09-21 检查发现除落地页 / 顶栏 / 活动列表与详情 / iOrbit 三个新屏外，其余页面均为「作用域 token 重映射」的融合态（diff 佐证：`orbit-real-agent.tsx` 3892 行仅 +23/−2，`orbit-real-contacts.tsx` 1500 行 +76/−20，报名工作区 1932 行 +20/−0），信息架构仍是旧的（如人脉页仍是旧左侧栏，设计为顶部四页签）。用户明确：要的是全部替换，不是融合。
- 新边界 **B**：**一张设计屏 = 一个新组件文件**，从设计稿标记结构长出来，经已抽出的模型层（`explore-model`、`registration-workspace-model`、`profile-save-model` 等）接真实数据；旧 `orbit-real-*.tsx` **不再修改**，路由切到新组件后删除旧文件。
- 废除边界 A 的三条保留项：不再保留 `[data-orbit-real-page]` token 体系（样式只走 `orbit-0918-tokens.ts` + 每屏作用域样式，停止向 `orbit-reference-styles.tsx` 追加）；不再保留 `AccountTopNav`/`OrbitTopNav`（已由 0918 浮岛导航取代）；旧左侧栏一律不进新屏。
- 保留不变：Next.js App Router、`proxy.ts` 资料门禁与豁免表、认证深链 `?next=` 语义、「无接口不做假」「设计 mock 数字不入库」「真实四态」原则、admin 域暗色不动、App 端不动。
- 路由处置：见 [ROUTE-CONSOLIDATION.md](ROUTE-CONSOLIDATION.md)（60 → 38，20 个删除、10 个保留、28 个对应设计屏）。
- 每屏完成定义：DOM 结构与设计屏对应（不是颜色对应）；不 import 任何 `orbit-real-*`；与设计稿并排截图比对；数据走真实 ready/empty/unavailable 态；测试 + ratchet + typecheck + detect-changes 照旧。
- 顺序：① Network 4 屏 + detail/follow 弹窗（**已完成 2026-09-21**，`e3fb6d1e..27f5b062`，见 EXECUTION.md「Network 屏级替换完成」）→ ② 个人中心（profile/persona/settings；含 onboarding 门禁提示；**已完成 2026-09-22**，`261507b4..034b799c`，见 EXECUTION.md「个人中心 屏级替换完成」）→ ③ Events 参与者侧（discover/mine/detail/recap/register 壳/live 六页签/四弹窗；**已完成 2026-09-22**，`ae0e92ad..96802809`，见 EXECUTION.md「Events 参与者侧 屏级替换完成」；host `/app/o/[slug]` 与主办管理页签落点留给 ④）→ ④ 运营台 7 屏 + 协作者抽屉（**已完成 2026-09-22**，`4f0e176a..19922fa0`，见 EXECUTION.md「运营台 屏级替换完成」；7 个旧工作区 + `/operations/roles` 路由 + `features/events/event-analytics/report.tsx` 已删）→ ⑤ 认证四态弹窗 → ⑥ iOrbit chat（最后，最大）。

## 2026-09-18：边界 A — 只换组件层（已作废，保留备查）

日期：2026-09-18。决定人：主代理（用户授权「你自己决定自己做」）。

- 边界：**A — 只换组件层**。保留 Next.js App Router 路由、`proxy.ts` 资料门禁与豁免表、`[data-orbit-real-page]` token 体系、`AccountTopNav`/`OrbitTopNav`、汉堡移动导航。
- 理由：[NEW-UI-INTERFACE-TABLE.md](NEW-UI-INTERFACE-TABLE.md) 第一节全部 server 入口可直接 import；已有设计决定（星空暗色、去 AI 感、处处有据、邮件止于草稿）不需重谈。
- 基线：`1f492f49`。新 UI 工作树 `/Users/li/work/orbit-web-newui-foundation-20260918`，分支 `newui/foundation-batch-1`。
- 批次 1：纯函数抽取（探索页筛选模型、报名工作区回执/转写模型、资料保存/合并模型），零行为变化；计划见 `docs/superpowers/plans/2026-09-18-new-ui-foundation-batch-1.md`。
- 批次 2（未开始）：hook 抽取（资料 Reload/Save 会话、报名回执回读、探索页 URL scope 同步）。
- 旧计划处置：按接口表第三节；未通知其他 session 停止前，其文件锁仍视为有效，本批不触碰锁内文件之外的任何共享文件。

# 新 UI 边界决定

日期：2026-09-18。决定人：主代理（用户授权「你自己决定自己做」）。

- 边界：**A — 只换组件层**。保留 Next.js App Router 路由、`proxy.ts` 资料门禁与豁免表、`[data-orbit-real-page]` token 体系、`AccountTopNav`/`OrbitTopNav`、汉堡移动导航。
- 理由：[NEW-UI-INTERFACE-TABLE.md](NEW-UI-INTERFACE-TABLE.md) 第一节全部 server 入口可直接 import；已有设计决定（星空暗色、去 AI 感、处处有据、邮件止于草稿）不需重谈。
- 基线：`1f492f49`。新 UI 工作树 `/Users/li/work/orbit-web-newui-foundation-20260918`，分支 `newui/foundation-batch-1`。
- 批次 1：纯函数抽取（探索页筛选模型、报名工作区回执/转写模型、资料保存/合并模型），零行为变化；计划见 `docs/superpowers/plans/2026-09-18-new-ui-foundation-batch-1.md`。
- 批次 2（未开始）：hook 抽取（资料 Reload/Save 会话、报名回执回读、探索页 URL scope 同步）。
- 旧计划处置：按接口表第三节；未通知其他 session 停止前，其文件锁仍视为有效，本批不触碰锁内文件之外的任何共享文件。

# 计划 v2 · 设计稿示例 fixture（只在本机 mock 模式）

像素门禁（RD-16）用：把 mock 仓储里的演示计划换成**逐条照设计稿示例数据**填的状态，让同一画面在门禁里只剩「数据文字」差异。

- **只补数据，不改画面结构**：fixture 只能是 `MemoryPlanV2State`（与真实数据同一形状，经同一服务、同一接口、同一组件渲染）。不许为了过门禁在组件里读 fixture、加分支或特殊 class；同一组件换成真实数据必须渲染出同样的结构（HOW-TO 第 8 节）。
- **进不了生产**：只被开发接口 `app/api/dev/plan-design-fixture/route.dev.ts` 引用；`next.config.js` 只在非生产把 `dev.ts` 当路由扩展名，生产构建不收录该接口，也就不会打包这里的数据。测试 `tests/plans/plan-design-fixtures.test.ts` 守这两条。
- **切换**：在 mock 服务器（`ORBIT_REDESIGN_MOCK=plan-v2-summary`）上 `curl -X POST http://localhost:<端口>/api/dev/plan-design-fixture -H 'content-type: application/json' -d '{"name":"<fixture 名>"}'`；`{"name":null}` 回到演示世界；`GET` 列出可用名字。live（有库）或生产一律 404。
- **文件**：`index.ts` 汇总；`a.ts`（概要 + 人物类型）、`b.ts`（生成流程）、`c.ts`（見直し / 完成 / 目标）各组只改自己的文件；`base.ts` 是基于演示世界的构造工具。
- **门禁前先跑（目標入力右栏「最近の会話」）**：`node features/plans/v2/design-fixtures/seed-local-chats.mjs --origin http://localhost:<端口> --storage <qa-storage.json>`——给本机 qa@orbit.test 补 2 条 iOrbit 会话（只写本机库，先校验 localhost，可重复执行）。

# R28 C 线独立复核

日期：2026-10-20。结论：**局部功能已交付，R28 未达到 Sprint 验收条件。** 本复核由 C 线主会话在代码提交后重新查读源码、定向运行关键用例并核对门禁；它不把全量失败或未运行的像素状态记为通过。

## 重新执行

| 项目 | 结果 | 范围 |
| --- | --- | --- |
| Web guide/progress/continue 关键用例 | 40/40 过 | 真实三步投影、actor 流程 CAS、API 401/403、锁定、`next` 与计划入口 UI |
| App route parity/contract sync/intake | 16/16 过 | 路由覆盖、3 份契约副本、平台 href 与 `source:onboarding` 续接 |
| Web 旧标签导出退休后 | 41/41 过 | Web 资料五屏、指南、原 profile 兼容路径；另有导航／资料门禁 13 过、4 项因 PG 测试库未配置而跳 |
| 文案零增长审计 | 9/9 过 | 旧 opening snapshot 原样保留；旧允许清单没有扩大 |
| TypeScript 与契约 | Web typecheck/typecheck:app exit 0、App typecheck exit 0、contract snapshot `--check` exit 0 | Web 旧导出删除后无运行时 import；App 受影响定向 69/69 见 REPORT |
| Web 页面 surface manifest | 87/88 过 | 唯一失败仍是 Host/Search 的三个既有 P0，未涉及 R28；与全量基线同类 |

Web/App 各只跑过一次收口全量，分别 exit 1。新增失败已按 REPORT 所列原因修复并用定向测试复核；**没有第二次全量通过的证据**。`copy:qa` 仍 exit 1，输出与本轮更早基线逐字一致。报告保留这些红项。

## 源码与运行链核对

- `features/guide/start-steps.ts` 与 `progress.ts` import R10 的同一份 `computeGuideRealProgress`；指南与首页的三步完成事实不靠客户端 `currentStep` 猜测。资料进度是 actor 级 CAS；未知服务端资料政策不误判已完成。
- `/api/profile`、资料进度和介绍草稿的示例请求在构造存储或模型前返回 403。C 的计划入口仍依赖 R22–25 的写 API 提供同等保护；Web 资料/指南前端也尚未接一个可统一拦截的示例上下文，因此 SC10 保留部分。
- 本地合成账号走过 App 空生日、双目标、介绍失败后手填、导入跳过；Web 确认三个联系人，创建 onboarding intake；App 恢复同一个 intake。付费 provider 留空，计划 AI 初版失败，没有 active plan；3/3、Task 回程和日文真实 AI 正例无证据。
- 浏览器补核 Web 新注册与匿名／合法／恶意 `next` 的实际路由，结果记于 REPORT。有效邀请、跨设备同标签和 App 登录链仍需同态环境。
- 全仓 import 检索显示 C 指南和资料不再调用 B 的旧 `card-batch-ui`；`profile-0918/profile-model.ts` 无生产引用后由 `f1e98a2b9` 删除。`onboarding-0918` 仍为 Web 资料实现路径。试迁到 `orbit-2026/onboarding` 触发该目录更严格的文案审计：内联硬编码 8/6/1、缺 ja 120/80。已局部撤回试迁，未放宽审计或留下新失败。

## 边界与余项

相对起点 `8862ccce4` 的已提交源代码和测试 diff 位于 R28 归属的资料、指南、契约兼容、视图和证据路径。A 组件、D Task、B 导入业务、R22–25 计划引擎没有被 C 修改；用户原有 `HANDOFF-CLAUDE-2026-10-19.md` 未动。没有推送、部署、生产/Neon 连接或付费模型调用。本地服务和 C 模拟器均已停止；Next 启动时自动写出的 `next-env.d.ts`、`tsconfig.json` 已恢复。

下一次验收必须先取得 A/D 的状态组件和同态 fixture、B 的回程与示例写拒绝、可授权的计划 AI 正例，再补 Web 旧目录文案迁移、前端示例拦截、注册/邀请/设备矩阵和未过像素带。W01 与 A07 锁定态已达每屏三轮上限，本次不再加跑。各 SC 的具体缺项及四方请求见 REPORT。

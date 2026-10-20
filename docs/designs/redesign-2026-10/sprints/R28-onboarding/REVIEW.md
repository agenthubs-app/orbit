# R28 独立复核（RD-25）

**结论：未通过 Sprint 验收。** REPORT 将交付状态列为“部分”，与代码证据相符；付费 AI 正例正在另跑，本次不以此判不通过。

**SC 逐条核对：** 01 预检未全；02 邀请有两端正例，矩阵未全；03 v2 与五屏续填有证据，Web「稍后」漏记状态；04 双目标和类型核对有定向测试；05 额度、幂等有测试，错误 API 仍泄露配置名；06 第五屏导入回程断链；07 Web 硬顺序有反例；08 App 真指南与 route parity 通过，3/3 未验；09 intake 续接有证据，四阶段回 Task 未验；10 本线写拦截有测试，其他入口未联验；11 待 D；12 旧运行时引用已迁，跨线改动待签收；13、14 像素未过；15 离线清单失实；16 全量仍红。

## 问题

**S：无已证实项。**

- **M** `repos/orbits/features/guide/start-steps.ts:92`：联系人未满 3 位但目标已存在时，`?step=2` 可打开（纯函数复现）。解锁应先检查所有前置步骤，已完成标记与可进入状态分开计算。
- **M** `repos/orbits/features/profile/intro-draft-service.ts:170`：缺密钥时把含 `GEMINI_API_KEY` 等配置名的 provider 消息返回给 API 客户端；Web 界面虽已遮蔽。API 边界改为通用错误文案，并断言响应体不含配置名。
- **M** `repos/orbits/app/(app)/app/orbit-2026/onboarding/onboarding-flow.tsx:575`、`repos/orbit-app/src/screens/profile/onboarding/ProfileOnboardingScreen.tsx:434`：第五屏进入 B 线扫描／导入未传受限回程目标，完成态不能回五屏续填。与 B 线约定精确白名单目标并补两端完成链测试。
- **M** `repos/orbits/app/(app)/app/orbit-2026/onboarding/onboarding-flow.tsx:501`：Web「稍后设置」只导航，未执行进度 `defer` CAS；补写入、复读及失败重试。
- **m** `repos/orbit-app/scripts/page-offline-inventory.ts:70`：仍将真实、在线读取的 `/start` 登记为无读取的旧跳转页；更新分类与读取接口并重生成清单。现有清单测试只核对登记和文档一致。

**核实通过与边界：** `BREAKING.md` 先登记 v2，App 先宽进 v1/v2、未知版不误判完成；进度按 actor 隔离并用 CAS／幂等，新增进度为在线读取，无新 outbox 字段。生日不在公开资料契约内；名片 `returnTo` 仅接受 `/app/start`／`/start`。本次定向测试 Web **18/18**、App **22/22**；仓库未改动。D 的 `shell-routes.ts` 及 B 文件确有跨线改动，REPORT 称主会话按 §R28-b～f 授权，`origin/redesign` 文档中未见独立批准记录，D/B 复核仍待回传。

REPORT 的“App 自身新增失败 0”仅有其逐名对照陈述，原始全量日志未随 `origin/redesign` 提供；Web 最后一次全量出现 1 个新失败名，之后仅定向复测、未重跑全量。因此目前不能独立确认两端最终“新增失败 0”。
## 主会话全量核验与代定记录（2026-10-20 23:05）

- verify `origin/redesign@d061c42b0`（含 R28 6f6b78da1、R19）两端全量，与 R10fix/R10/R18c 失败集合逐名比较：Web 5 fail、App 12 fail，**新增 0**。日志 `_evidence-main/r28-{web,app}-full.log`。上文「不能独立确认新增 0」由此关闭。
- 跨线授权的书面记录：主会话按 RD-33 代定 §R28-a～h（原文 `_runs/msg-c-r28-2.md`）：§b 授权 C 只改 D 线 `shell-routes.ts` 两条路由；§d 授权 C 在 B 线扫描／导入路由只加不改 `returnTo` 白名单；§e 授权 C 只加不改地把 plan intake 接入示例写拦截；§f 授权 C 只改首页首步文案判定；§g Task›プラン 交 D 线（R19 修复后执行）。D/B 的事后复核由 D 线在 R28 `REPORT-D.md` 回传，B 线项并入⑪/⑫ 交叉验收。

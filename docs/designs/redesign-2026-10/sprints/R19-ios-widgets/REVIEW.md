# R19 独立复核 REVIEW

**结论：不通过。** 已按要求读取 `origin/redesign` 的 R19 提交，未改仓库。阻断原因是下列代码问题；待授权签名的 App Group 真链和 WidgetKit 实屏不计入本次不通过理由。REPORT 将 SC-04～11 的运行与视觉边界列为未过或部分完成，这一表述基本准确。

## S

- **S1 登出清空失败可能留下前账号内容。** `repos/orbit-app/src/widgets/runtime.ts:41–47` 在原生清空失败时返回 `false`；`repos/orbit-app/src/api/AuthSessionProvider.tsx:668–715` 忽略结果并完成登出。若 `active-scope-v1` 删除失败，extension 仍可读旧快照（`repos/orbit-app/modules/orbit-widget-snapshot/ios/OrbitWidgetSnapshotModule.swift:42–48`）。这使 §R19-9“失败不阻断登出”与 SC-04“立即不露 A”冲突。启用前须确定可验证的撤销失败兜底，并补原生清空失败注入测试。

## M

- **M1 默认构建仍链接 R19 原生桥。** `repos/orbit-app/modules/orbit-widget-snapshot/expo-module.config.json:2–3` 无开关；默认关闭日志仍显示安装、编译 `OrbitWidgetSnapshot` Pod。`app.config.ts:19` 只关闭 extension 插件。因此“默认构建与 R19 前一致”未成立。按开关排除模块自动链接，并对照 R19 前 Pod 清单及默认构建。
- **M2 秘書件数可能被报成精确总数。** `repos/orbit-app/src/widgets/project-home.ts:64–75` 用预览条目数作 `count`，忽略契约的 `hasMore`；有后续条目时显示值并非真实总数。增加准确计数的只加字段，或明确显示“当前预览数”，补 `hasMore=true` 测试。
- **M3 锁屏分数未加隐私遮盖。** `repos/orbit-app/plugins/widgetkit/OrbitWidgetBundle.swift:357–369` 直接显示计划分数；活动标题和地点才使用 `.privacySensitive()`。按 PLANNER 的锁屏隐私要求处理分数，并在签名可用后验锁定／解锁态。

## m

- **m1 较早来源有效期只在纯函数中测试。** `repos/orbit-app/src/screens/home/use-home-widget-snapshot.ts:30` 发布时从未传入 `sourceExpiresAt`。接入来源有效期；若现有来源不提供，应收窄 REPORT 对该能力的表述。

## 核实通过与边界

SC-01、02 的纯模型、03 的双模式生成／编译有代码和日志支撑；extension 无网络客户端或凭据。七个 GET 已登记离线读取清单，未改共享契约、outbox、同步域注册表、OAuth `returnTo` 或 C 线原认证判定；R19 无旧屏删除，目标路由仍在。原始全量日志按失败名核对为基线 14、最终 13、新增 **0**，但全量仍失败。SC-05 同源实数链、SC-10 完整深链门禁仍只部分验证；12 项局部像素比较均 FAIL，REPORT 未将其冒充实屏通过。
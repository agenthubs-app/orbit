# Sprint 0022 — 必要测试路径补充

原 Planner SHA256 `d58db78992f48873a32ed040554a997241c2ee02e6573f30fc80a85ec283d9a7` 不变，SC-0022-01 至 05 不变。适用用户已授权完成C线全部epoch及 RULES 第0节必要可逆文件补充，不重新索取同一执行批准。

新增确切测试路径：`repos/orbit-app/tests/app-wide-workspaces.test.ts`。

原因：0022将旧 FollowupsScreen 改成认证内 Redirect 后，此既有工作区外观夹具仍静态编译旧页面且不提供Redirect；App本轮全量2645项中44项因此在共同setup失败。将其followups场景接到真实TasksScreen并传入relationship范围，继续验证旧工具迁移后的触点、错误态和字号；旧路径本身仍由`ink-signal-followups.test.ts`的实际私有路由包装测试覆盖。工具为既有secondaryButton，按44pt可操作边界验证，不将其认定为50pt领域写入主按钮。

此路径是已发布B0006测试的必要直接消费者；B文件已明确释放，C保留独立B依赖baseline。其他改动仍限原Planner白名单，无Web/API字段/数据库/首页/联系人业务字段扩张。

GitNexus对测试局部open/useLocalSearchParams未收录，返回UNKNOWN；源码核对它们仅属于本文件esbuild夹具，不是产品共享函数。产品initial-route HIGH及其他LOW影响已记录在run-01。全量日志保持原结果，修复仅重跑完整受影响文件及直接消费者，遵守RULES§5.3，不开启第二Generator。

首次完整修复复验64/65，剩余预期同属旧主按钮样式：现有secondaryButtonText为600字重，模板导航按此角色核对；其他领域主按钮仍要求700。第二轮仅更新这一测试预期，产品样式不改。

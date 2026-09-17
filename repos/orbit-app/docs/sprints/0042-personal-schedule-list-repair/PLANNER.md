# Sprint 0042 — 个人日程列表读取修复

Plan revision：1；existing-codebase / single-generator。原需求：R-08/R-09、0010/0026/0027后续回归，C主包 `/tasks/personal` 加载失败。单一目标：[个人日程列表闭环](GOAL.md)。

规划基线与证据见 [汇总](../SIMULATOR_REMEDIATION_PROGRAM.md#1-报告到底证明了什么)；启动时固定实际HEAD，不把规划SHA冒充运行版本。进入条件：适用实施指令、canonical actor与schedule-items契约可用、授权隔离测试对象、0033日程消费者与0041相关测试锁释放。在线修复不依赖0033整项完成；已转为mirror-first的消费者须保留该接线。

## 范围与文件

先读App `src/api/personal-schedule.ts`、`src/api/schema/personal-schedule.ts`、`src/api/contract/tasks.ts`、`src/screens/schedule/PersonalScheduleList.tsx`、`PersonalScheduleScreen.tsx`，Web `app/api/schedule-items/` 与 `features/personal-schedule/` 的列表服务及authority契约；读取0010/0026/0027报告及C最终主包证据。

写入起点（路径均相对仓库根）：

- `repos/orbit-app/src/api/personal-schedule.ts`、`src/api/schema/personal-schedule.ts`、`src/screens/schedule/PersonalScheduleList.tsx`及上述screen必要直接消费者。
- `repos/orbits/features/personal-schedule/{service,authority-service,authority-contract,service-factory}.ts`、`app/api/schedule-items/`中对应集合handler/route；仅实际根因涉及文件。
- 对应共享personal-schedule schema/contract如确需变更先登记；App副本只通过sync:contract生成。新增行为测试可在下列已有测试文件补充，新增专用测试须登记用途。

排除：重写日历/编辑器、另造身份或同步协议、静默滤掉损坏个人记录、真实数据批量修复、OAuth、扩权。当前规划只写文档。路径补充与锁遵守汇总§4。

## 验收契约（五项）

| SC | 可观察行为 | 主验证 |
| --- | --- | --- |
| SC-0042-01 | 有效actor打开个人日程列表得到真实记录，空集合是空态；当前失败被定向用例复现并消除 | Web集合响应→App解码/render行为测试；主包重新读取截图/HTTP |
| SC-0042-02 | 创建→列表→打开详情→编辑→重开→删除后列表/详情/日历一致，无重复或取消记录复活 | 原生UI与同actorWeb/API逐步回执/版本；复用已验证编辑器但补列表链 |
| SC-0042-03 | 非个人日程合法混合项不误判；损坏/重复/错误owner或source记录显式失败，不混入其他账号 | 解码/route严格契约、跨actor和重复ID用例；不得靠删校验GREEN |
| SC-0042-04 | 断网/服务错/未同步与真实空态区分，失败后恢复可重新读取；已交付的local-read接线不退化 | 读取失败与恢复render；如依赖mirror则完整性/冷启动定向测试 |
| SC-0042-05 | 同版本Web生产服务与主包8082完成该链，精确测试记录清理，commit/主线合并树证据完整 | 运行身份、cleanup查询、固定SHA与逐SC报告 |

## 一次执行、最小检查与交接

先抓当前响应与失败字段，区分服务查询、投影、owner/version、客户端解析四处，不预定根因；impact后RED→最小修复。App定向起点 `tests/personal-schedule-interactions.test.tsx`、`tests/personal-schedule-editor.test.ts`；Web `tests/api/personal-schedule-routes.test.ts`、`tests/api/schedule-items-route.test.ts`、`tests/pages/personal-schedule-workspace.test.tsx`。按实际impact选完整文件和直接消费者，不仅依赖源码断言。

身份/共享契约涉及H；受影响端本地收口集成/typecheck一次，写入已有服务复用其隔离/幂等检查。真实HTTP/Simulator必需；不跑付费AI/OAuth。不以未配置数据库的skip代替必要回读。

执行顺序、Web重建重启、唯一run、失败处置、费用、安全、证据归档及commit→固定SHA→merge chat-agent→合并树→适用push全部适用 [共同契约§4](../SIMULATOR_REMEDIATION_PROGRAM.md#4-共同执行验收和交付约束)。REPORT仅run结束生成；未达到SC不标completed。

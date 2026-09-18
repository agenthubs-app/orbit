# Sprint 0043 — 活动读取投影、资格与错误一致性

Plan revision：1；existing-codebase / single-generator。原需求：R-04/R-09/R-14；C有效活动参会者404、分析500/403。单一目标：[入口与实际读取资格一致](GOAL.md)。

基线/证据见 [汇总§1](../SIMULATOR_REMEDIATION_PROGRAM.md#1-报告到底证明了什么)。进入条件：实施指令、实际活动ID与actor角色可核验、有权限/无权限的授权隔离样本；与0033活动源/消费者及0041事件helper无争用。建议C完成0042后领取，业务上不依赖0042修复结果。

## 范围与文件

- App读取/按根因修改 `repos/orbit-app/src/screens/events/{EventAttendeesScreen,EventAnalyticsScreen,EventAnalyticsContent}.tsx`、`src/api/event-detail-contract.ts`及实际入口与对应view-model。新增路径须登记来源及SC，不无界改活动全域。
- Web读取/按根因修改 `repos/orbits/app/api/events/[id]/attendees/{handlers,route}.ts`、`analytics/handlers.ts`及aggregate/attendee route，`owned-event-access.ts`、`event-capability-access.ts`、`registered-event-access.ts`只在证明资格映射错误时改。
- 服务起点 `features/events/attendee-roster/`、`features/acquisition/service-factory.ts`、`features/events/event-analytics/{runtime,read-model,response,contract}.ts`；详情CTA的实际文件在追踪后登记。共享类型改变由契约源生成副本。

排除：新分析指标、导入/报名写入重做、任意用户可见参会者、给真实账号扩权、把404伪装200空数组、未批准migration/部署。无法判定403错误前不把正确拒绝当需修复的授权漏洞。

## 验收契约（五项）

| SC | 可观察行为 | 主验证 |
| --- | --- | --- |
| SC-0043-01 | 同一有效活动入口与参会者投影使用正确ID/资格；授权样本读取真实名单或真实空态 | handler/service与App行为用例；原生详情→CTA→名单HTTP |
| SC-0043-02 | organizer aggregate与registered attendee自身分析按既有角色返回正确范围；未配置存储可识别 | 两种资格真实服务读回、scope/response用例；原生分析页 |
| SC-0043-03 | 无资格、未登录、不存在、上游不可用区分；隐藏资源按既定安全策略，不通过换ID越权 | 401/403或安全404/503矩阵、跨actor/活动请求；入口与错误render |
| SC-0043-04 | 历史/取消活动遵守明确业务规则；缺报名资格不伪称服务坏，名单/分析不暴露额外个人字段 | 历史/取消/有效报名角色矩阵与字段白名单断言 |
| SC-0043-05 | 同版本live Web/API与主包完成有权/无权真实点击，报告解释当前404/500/403各自原因 | 脱敏请求、角色别名、截图、清理与固定SHA/合并树证据 |

## 执行与最小检查

先分别追踪参会者事件身份/owned访问、分析capability/registration/read-model配置及App CTA，记录根因，不把两条状态码合成一个推断。待改符号impact后补RED；复用Web `tests/api/event-analytics.test.ts`、`tests/capabilities/event-attendee-roster.test.ts`、`tests/capabilities/event-attendee-import-live-store.test.ts`、`tests/services/event-analytics-read-model-postgres.test.ts`；App `tests/event-attendees-view-model.test.ts`、`tests/event-analytics-screen-render.test.tsx`、`tests/event-analytics-view-model.test.ts`。必要新建资格/CTA行为测试先登记，不将源码字符串测试当实际授权证明。

权限/共享投影为H：覆盖传递消费者、拒绝/字段边界，本地收口受影响端集成/typecheck一次；数据库缺配置只阻塞对应真实行，不自动改生产配置。无需付费AI、远程Push或OAuth。

一次run执行与失败/交接完全适用 [共同契约§4](../SIMULATOR_REMEDIATION_PROGRAM.md#4-共同执行验收和交付约束)。Web/API修改后生产重建重启再测主包；REPORT逐SC说明合法拒绝与实际修复，固定SHA提交后由协调线合并验证，不提前completed。

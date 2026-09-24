# BR-031 — Web 报名规范身份候选与发布门

- 更新日期：2026-09-17。
- 总状态：source_ready；发布及跨端 verification blocked。P1。
- 发起角色：Web 主开发协调者。
- 下一责任方：W0已接历史身份只读方案及本地合成；App精确修复尚未派发/批准。主代理负责冲突与发布门管理。
- web_status：W3-R源`23646028281f14b2e528e6aa5082ca0d47a351fc`，主集成`66087fff853f0133cbf1f996e39b1e03bd23bb7c`，仅本地候选。
- app_status：本批未修改。当前集成树中的报名屏仍使用raw会话ID严格核对回执，不能宣称已兼容分离的accountId。
- 授权：用户批准Web并行实现；本批不含生产审计/迁移、App修改、部署或付费模型验证。

## 变化与证据

Web准入POST/DELETE不再直接相信响应：核对actor/event/version/status后，再GET独立确认；撤回要求下一版本及withdrawn。scope变化、A→B→A、卸载与迟到响应不覆盖新状态，失败保留回答。

报名页面与以下legacy路由复用既有canonical account resolver：

- `/app/events/[id]/register`
- GET/POST `/api/events/[id]/registration`
- POST `/api/events/[id]/registration/cancel`

响应Schema/枚举/handler不变，但actor语义由原raw session subject收口为accountId。签名与Workspace以同一规范actor核对；membership缺失时不回退raw。

App消费点（相对`repos/orbit-app`）：`src/screens/events/EventRegistrationScreen.tsx`的actor来自`auth.user.id`，GET/报名/取消严格匹配；`src/api/AuthSessionProvider.tsx`的`auth.actorId`来自accountId；`CanonicalEventDetailModules.tsx`优先account但仍有raw fallback，`EventDetailScreen.tsx`亦读取报名。需要另批精确修改及分离ID的跨端回归，不能以类型检查代替。

## 发布前必须解决

1. 历史身份：原legacy稳定ID和canonical membership均精确匹配userId/actor_id，既有迁移不转换账号ID。W0真实service/provider本地memory合成已证明raw报名后account GET/cancel为null，再以account报名可能出现同event双rsvped。未读取生产，未知不当零。
2. 审计须只用有效同workspace profile→account权威映射，分类canonical-only/raw-only/双key/孤儿歧义，覆盖取消及重激活。如受影响，迁移方案须另批且覆盖membership、画像、投影、容量与幂等回执；不允许只改owner行或GET双读掩盖冲突。
3. App回执规范身份修复和同版本联验。当前Web API候选不能在旧消费端未经核验时直接发布。

这些门只阻塞对应发布/兼容动作，不阻塞其他已批准本地开发。

## 验收结果与边界

- 主代理cwd：`/Users/li/work/orbit-web-integration-20260917/repos/orbits`；`env -i`、TZ=Asia/Tokyo、专用本地PG `127.0.0.1:5432/orbit_web_integration_20260917`。14文件84/84，0fail/skip；全`tsc --noEmit --incremental false`退出0，测试schema残留0。
- 领域本地浏览器验证：admitted与pending_review撤回→DELETE→GET→刷新，回答保留、人数0/8；seed相同raw/account ID不代替分离ID测试。
- 分离ID由真实身份解析函数、真实legacy路由/签名、页面装配与严格ACK正负例验证。历史重复报名风险保留为明确测试，不是假称自动迁移。
- 主提交前完整detect_changes：267符号/9流程/HIGH；无降级flags或空ID。保留全仓流程采样限制与非执行JSON证据单列说明，见[执行台账](../docs/development/2026-09-17-web/EXECUTION.md)。
- Web写→App回读、App写→Web回读：本批均未运行。真实模型POST链、生产数据审计、迁移与部署未执行。
- 关闭条件：历史审计与必要迁移有独立授权和可回滚证据；App规范actor接线完成；分离ID同版本双向读写、取消/重报、容量、权限与迟到响应联验通过。

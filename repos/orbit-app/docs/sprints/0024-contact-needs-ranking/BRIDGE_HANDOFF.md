# BR-0024 — 人脉需求与匹配排序

- 创建日期：2026-09-15
- 总状态：integration_ready（主线集成后执行共同运行时与 iOS 验收）
- 优先级：P1
- 发起角色：Web + App
- 下一责任方及是否已接单：Bridge 协调者已接单
- web_status：`bf35efb85` 已提供认证 actor 范围内的确定性需求排序 HTTP 服务
- app_status：基于 `d7180e134` 的限定 App 补丁已完成，包含主页需求入口、共用编辑器、独立排序页、三语文案与分析页层级调整
- verification_status：Web 定向测试 11/11、typecheck exit 0；App typecheck exit 0、0024 受影响测试 70/70、需求真实组件交互 14/14、人脉页面浏览器交互 20/20、路由测试 23/23
- 依赖/阻塞：Sprint 0015 字典基线已由 `d7180e134` 释放；共同本地版本与 iOS 运行时由 Bridge 协调者在导入限定提交后执行
- 设计/实现授权：用户批准 `assets/concept-v2.png`，并明确要求创建 Sprint 0024 后开始实现

## 变化与证据

- 旧行为 → 新行为：关系目标只在分析页出现且没有按目标排序；现在主页保存一条人脉需求，独立页面按该需求显示分数、依据和资料不足分组，分析报告移动到分析内容底部。
- Web HTTP：`GET /api/contacts/needs-matches`。服务读取认证 actor 的 profile 与可访问联系人，不接受客户端 actor，不调用 AI，不写业务数据。
- App 消费：`/contacts` 读取及更新 `GET/PUT /api/profile`；`/contacts/matches` 读取新排序端点；联系人详情沿用 `/contacts/[id]`。
- Web 版本：`bf35efb85`。App 版本：本交接对应的限定提交 SHA 由提交后消息补充。
- 响应：`goal`、`goalVersion`、`dataVersion`、`scoringVersion=needs-lexical-v1`、`criteria`、稳定排序的 `matches`、生成时间及只读 provenance；资料不足使用 `score=null`。
- 保存：发送裁剪后的 `relationshipGoal`、`expectedUpdatedAt` 与稳定重试 `mutationId`；只接受同 actor／服务器／profile、mutation 与值完全一致且版本前进的回执。
- 刷新：App profile 资源按 actor、Cookie 与服务器隔离，联网更新时保留当前草稿；409 读取最新 profile 版本但不覆盖草稿。排序资源使用 network-only，保存后隐藏旧分数并重新读取。换号、换服务器和卸载会中止旧请求，晚到响应不得回填。
- 兼容：旧 App 不调用新端点，既有普通联系人列表与关系价值分不变；新服务不改变 profile 或 contacts 旧契约。

## 验收结果

- Web：服务／路由测试 11 通过、0 失败；typecheck exit 0；未设置 provider key。
- App：最终受影响集合 70 通过、0 失败；真实组件测试 14/14 覆盖空态、保存、取消、清空、伪回执、409、换号及换会话晚到响应、排序、依据与详情入口；浏览器人脉页面 20/20 覆盖 320pt、暗色、报告跳转、机会刷新和身份隔离。
- App 全量：修订前运行 2771 项，2770 通过，唯一失败为已移除 `actionLabel` 的旧测试期望；期望更新为稳定动作码后，包含该测试的最终受影响集合 70/70 通过。未因测试文本修订重复执行五分钟全量。
- 路由 TDD：先观察到全路由清单唯一 RED 为 `unexpected: ['/contacts/matches']`，完成私有入口、静态参数归属、初始路由和覆盖登记后，相关 23 项测试全部通过。
- Web 写 → App 回读：待共同本地版本。
- App 写 → Web 回读：待共同本地版本。
- 原生 UI：Simulator 已存在，但为避免与主线 Metro/安装冲突，Bridge 协调者要求在补丁集成后统一执行 390pt 主页、排序、依据、详情与返回；实现复用现有 30/38、16/22、15/23、13/20、12/17 tokens。
- 未检查：生产部署与远程数据库不在本 Sprint 授权范围。
- 关闭条件：App 限定补丁获得提交 SHA；两端 typecheck 与受影响全量完成；同账号双向需求回读、版本冲突、iOS 关键链路和三语动态字号有可复查证据。

## 更新历史

- 2026-09-15：Web 服务提交完成；App 在 `d7180e134` 干净基线上完成三语、交互、路由、分析页迁移和范围审计，等待 Bridge 协调者导入后执行共同运行时与 iOS 验收。

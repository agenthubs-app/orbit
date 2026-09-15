# BR-0024 — 人脉需求与匹配排序

- 创建日期：2026-09-15
- 总状态：completed（两端已集成；SC-0024-01～05 全部通过）
- 优先级：P1
- 发起角色：Web + App
- 下一责任方及是否已接单：Bridge 协调者已接单
- web_status：`bf35efb85` 已提供认证 actor 范围内的确定性需求排序 HTTP 服务
- app_status：主实现 `725e60b39`、零联系人修复 `146f5fa09`、原生大字号与三语返回修复 `d4cc8a441` 已集成
- verification_status：Web 定向测试 11/11、typecheck exit 0；App typecheck exit 0、扩大受影响测试 94/94、需求真实组件交互 16/16；同账号需求双向回读及当前 Simulator 100 分→依据→详情→返回、中／日／英和原生 Dynamic Type 全部通过
- 依赖/阻塞：无
- 设计/实现授权：用户批准 `assets/concept-v2.png`，并明确要求创建 Sprint 0024 后开始实现

## 变化与证据

- 旧行为 → 新行为：关系目标只在分析页出现且没有按目标排序；现在主页保存一条人脉需求，独立页面按该需求显示分数、依据和资料不足分组，分析报告移动到分析内容底部。
- Web HTTP：`GET /api/contacts/needs-matches`。服务读取认证 actor 的 profile 与可访问联系人，不接受客户端 actor，不调用 AI，不写业务数据。
- App 消费：`/contacts` 读取及更新 `GET/PUT /api/profile`；`/contacts/matches` 读取新排序端点；联系人详情沿用 `/contacts/[id]`。
- Web 版本：`bf35efb85`。App 版本：`725e60b39`，零联系人修复 `146f5fa09`，最终原生修复 `d4cc8a441`。
- 响应：`goal`、`goalVersion`、`dataVersion`、`scoringVersion=needs-lexical-v1`、`criteria`、稳定排序的 `matches`、生成时间及只读 provenance；资料不足使用 `score=null`。
- 保存：发送裁剪后的 `relationshipGoal`、`expectedUpdatedAt` 与稳定重试 `mutationId`；只接受同 actor／服务器／profile、mutation 与值完全一致且版本前进的回执。
- 刷新：App profile 资源按 actor、Cookie 与服务器隔离，联网更新时保留当前草稿；409 读取最新 profile 版本但不覆盖草稿。排序资源使用 network-only，保存后隐藏旧分数并重新读取。换号、换服务器和卸载会中止旧请求，晚到响应不得回填。
- 兼容：旧 App 不调用新端点，既有普通联系人列表与关系价值分不变；新服务不改变 profile 或 contacts 旧契约。

## 验收结果

- Web：服务／路由测试 11 通过、0 失败；typecheck exit 0；未设置 provider key。
- App：最终扩大受影响集合 94 通过、0 失败；需求真实组件测试 16/16，另含 AppScreen 本地化返回标签及默认回归；浏览器人脉页面既有 20/20 仍覆盖 320pt、暗色、报告跳转、机会刷新和身份隔离。
- App 全量：修订前运行 2771 项，2770 通过，唯一失败为已移除 `actionLabel` 的旧测试期望；期望更新为稳定动作码后，包含该测试的最终受影响集合 70/70 通过。未因测试文本修订重复执行五分钟全量。
- 路由 TDD：先观察到全路由清单唯一 RED 为 `unexpected: ['/contacts/matches']`，完成私有入口、静态参数归属、初始路由和覆盖登记后，相关 23 项测试全部通过。
- Web 写 → App 回读：同一隔离账号将需求追加 Osaka 后，App 重新进入匹配页原样回读，通过。
- App 写 → Web 回读：App 保存 `Find a manufacturing procurement partner in Japan` 后 Web 原样回读，通过。
- 原生 UI：当前 Simulator 已验证 Mika Tanaka 0024 的 100 分、两条真实字段依据、详情和返回后保留展开状态；中／日／英分别冷启动，返回标签与正文一致。`accessibility-extra-large` 下头像、正文、分数和依据均可用。归档证据：`build/harness-state/evidence/sprint-0024/run-01/native/`。
- 未检查：生产部署与远程数据库不在本 Sprint 授权范围。
- 关闭条件：已满足；c-0024 监控可停止。

## 更新历史

- 2026-09-15：Web 服务提交完成；App 在 `d7180e134` 干净基线上完成三语、交互、路由、分析页迁移和范围审计，等待 Bridge 协调者导入后执行共同运行时与 iOS 验收。
- 2026-09-15：两端集成后完成同账号需求双向回读；Simulator 首次发现 `ready` 空集合无提示，`146f5fa09` 修复后显示明确三语空态。资料不足依据和详情入口通过，数字评分、返回和原生动态字号仍待补证。
- 2026-09-15：通过正式手工联系人草稿／确认 API 在隔离账号创建真实联系人并得到 100 分；原生验收暴露大字号挤压和非中文返回标签硬编码，按 TDD 以 `d4cc8a441` 修复。最终完成数字评分、依据、详情、返回、三语与 Dynamic Type，Sprint 关闭。

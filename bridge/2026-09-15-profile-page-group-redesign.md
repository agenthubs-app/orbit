# BR-020 — “我的”页面组、资料编辑与公开投影

- 创建/更新日期：2026-09-15
- 总状态：verified
- 优先级：P1
- 发起角色：Bridge
- 下一责任方及是否已接单：协调者按 Sprint 顺序合并到 `chat-agent`；D 线不自行合并
- web_status：source_ready
- app_status：consumer_ready
- verification_status：当前 production Web/API、隔离 PostgreSQL、同账号 Web 与原生 iOS Simulator 已完成双向资料版本回读、409、actor 隔离、八屏和大字号验收
- 依赖/阻塞：无本地产品阻塞；远程部署和实体设备属于发布验收
- 设计/实现/发布授权来源（如适用）：用户提供八屏设计、指定 D 线实施并授权持续执行；不含远程部署或生产数据写入

## 变化与证据

- 用户可见的旧行为 → 新行为：“我的”从单页混合编辑改为新版主页、设置、账号，以及独立主编辑／更多／标签／建议／预览；真实数据失败可恢复，无 fixture 成员、统计或未支持操作。
- Web 页面/服务/HTTP 路径及方法：`GET/PUT /api/profile`；`GET /api/profile/update-suggestions`；`POST /api/profile/update-suggestions/:id/accept|dismiss`；profile service、transactional provider 和 self-profile reader。
- App 页面/消费点：`/profile`、`/settings`、`/account`、`/profile/edit`、`/profile/more`、`/profile/tags`、`/profile/suggestions`、`/profile/preview`。
- Web/App SHA：规划 `c66761eea`；0026 合入基线 `c0d0ac094`；主体功能 `6dd44b94a`；视觉／Dynamic Type `7df4819a2`；最终 D HEAD 由协调者以本分支最新提交读取。
- 响应字段/Schema/枚举变化：profile 新增可选 `spokenLanguages`、LinkedIn／X；signal target 新增 `bio/offering/seeking`；公共 profile 使用显式 projection contract。
- 请求参数、对象 ID、actor/角色、幂等/版本条件：资料 PUT 继续使用 canonical actor、`expectedUpdatedAt`、`mutationId`；建议决策回执核对 suggestion、actor 和 mutation；edit session 以 origin＋canonical actor 分区。
- 刷新、缓存、异步任务与失败处理：409／503 和错误回执保留草稿及 frozen request；同一意图重放；切换账号／服务器清除越界 session；建议部分失败逐项保留。
- 旧 App 兼容策略：省略新字段表示保留，显式空值表示清空；旧 sparse edit 不清生日；旧 headline／relationshipGoal／targetRelationshipTypes／topics 不被新字段保存清除。

## 验收结果

- 自动化：Web profile 定向默认环境 41 pass＋14 skip、隔离 PostgreSQL 补跑 14/14；App 最终定向 227/227、typecheck、最终全量 2829/2829。
- 构建：Web production build 和 live health 通过；iOS Build Succeeded，0 error／0 warning，当前源码 bundle 8083。
- Web 写 → App 回读：通过；同一账号读到 bio、标签、语言、links、生日和同版本，证据 `web-to-app-profile.json`。
- App 写 → Web 回读：通过；role 保存后 production API 回读版本 `2026-09-15T09:13:45.988Z`，证据 `app-to-web-profile.json`。
- 冲突、失败、权限与异步场景：stale PUT 409；第二 actor 隔离；建议重放／部分失败；profile CAS 多连接和 receipt rollback 14/14。
- 原生 UI/浏览器验证：八张目标页当前 Simulator 截图、Web-rendered 对照、Accessibility Medium 冷启动和 VoiceOver JSON 均落盘；P0/P1 已清零，差异见根 `design-qa.md`。
- 未检查范围：远程部署、实体设备、生产数据库、付费 provider、真实私人资料。
- 可客观判断的关闭条件：本地 Sprint 已满足；协调者合并后在精确合并树复跑总矩阵，发布另走 BR-006。

## 更新历史

- 2026-09-15，Bridge：D 线从包含 0026 canonical identity 的 `c0d0ac094` 开始 run-01。
- 2026-09-15，Bridge：主体功能 `6dd44b94a` 完成；production Web/API 与 Simulator 完成双向版本回读、409 和另一 actor 隔离。
- 2026-09-15，Bridge：原生 Dynamic Type 暴露固定行高／导航重叠，RED→GREEN 修复后冷启动截图和 accessibility tree 通过；BR-020 更新为 verified。

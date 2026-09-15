# BR-021 — 日程详情与会议说明

- 创建/更新日期：2026-09-15。
- 总状态：`verified`；优先级：P1。
- 发起角色：App／C 线；下一责任方：总控集成，尚未合并。
- web_status：`source_ready`；app_status：`consumer_ready`；verification_status：`verified`。
- 授权来源：用户批准 Sprint 0027 的设计与实施，并要求 C 线持续完成。

## 变化与证据

- 旧行为：日历中的会议可能回到日历自身或把旧 schedule ID 当成 appointment ID，真实会议因此 404；其他日程目的地缺少统一验收。
- 新行为：任务进入任务详情，活动进入活动预览，个人日程进入编辑页，会议进入会议详情。appointment 会议说明由参会人共享；无 appointment aggregate 的旧日程会议明确使用 actor-scoped 私有说明。
- Web/API：`GET/PATCH /api/appointments/[id]/details` 提供 participant-only 共享说明、原子 expected-version CAS 与 idempotency；`GET/PATCH /api/schedule-items/[id]/meeting-details` 只处理当前 actor 拥有的旧 meeting 记录。
- App：`/schedule/meetings/[id]?source=appointment|schedule` 按来源选端点；只在回执的 ID、规范化内容和版本全部匹配时确认保存。409、网络失败或错误回执保留草稿。
- 版本：Planner `01bcceeb5`；主体 `3ca1f5936`；真实旧会议兼容 `0cbc45ffa`；分支 `codex/c-line-sprint-0027`。
- Schema：`MeetingDetailsContract` 新增 `title` 与 `visibility: participants | private`；App/Web 副本经 `cmp` 核对一致。
- 刷新：Web/API 已按最终源码生产构建并替换本地 3000 进程；App 重新进入详情会 GET 服务端版本。
- 旧 App：新增 response 字段只用于新会议详情消费者；既有 appointment 命令、日程列表和旧状态机不变。

## 验收结果

- Web appointment／legacy 回归 25/25，PostgreSQL 共享详情并发／幂等 1/1；App 日程相关组合 90/90；App/Web typecheck exit 0。
- Web production build exit 0，48/48 static pages；`/api/health` 为 `live/ok`，新 legacy route 未认证访问返回 401。
- iOS Simulator build `BUILD SUCCEEDED`。登录态 Simulator 逐类打开任务、活动、个人日程和会议；旧会议新增说明、保存、返回、重开回读和清空恢复通过。
- 运行证据：`repos/orbit-app/build/harness-state/evidence/sprint-0027/run-01/native/`；执行报告：[Sprint 0027 REPORT](../repos/orbit-app/docs/sprints/0027-open-schedule-meeting-details/REPORT.md)。
- Web 全量历史结果为 3193 pass／22 fail／166 skip，失败均在 0027 之外；App 首轮全量 2808/2810 的两项新 route audit 遗漏已修复，并由 route audit 36/36 和最终相关组合 90/90复验。
- 未检查范围：远程部署、实体设备；不影响本地 Sprint 关闭。

## 更新历史

- 2026-09-15：C 线完成 Web/App 共享契约、真实旧会议兼容和本地共同运行环境验收，交给总控审阅独立分支；没有合并到 `chat-agent`。

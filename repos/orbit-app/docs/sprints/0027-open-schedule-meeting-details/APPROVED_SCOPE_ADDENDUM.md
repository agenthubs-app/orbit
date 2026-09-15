# Sprint 0027 — 已批准范围补充

## 用户批准

用户已把“所有行程／日程条目可打开”和“会议支持添加、编辑详情”作为 0026 之后的独立 C 线 Sprint，并明确批准按建议方案串行实施。该批准覆盖完成此目标所需的 App、Web/API、共享契约、测试及本地共同运行环境，不包含远程部署、生产数据库迁移或外部日历写入。

## 产品与数据规则

- 日历条目必须按来源进入稳定详情目的地，不得把会议或可识别活动再次导航到日历首页。
- 会议详情建立在既有 appointment 聚合上；只有 appointment 参会账号可以读取和修改。
- 会议说明属于 appointment 的共享内容，参会双方读取同一版本。旧 appointment 没有该字段时按空说明读取，不迁移、不推断。
- 新增说明写入使用现有 appointment 的 expected version、原子 compare-and-swap 与 idempotency key。保存成功只接受与当前 appointment、提交内容和服务端版本一致的回执。
- 空字符串表示显式清空。冲突或失败保留本地草稿；会议说明更新不改变确认时间、状态、提醒、Google Calendar 或其他外部系统。

## 实现边界

允许新增 `/api/appointments/[id]/details` 写入端点、窄共享 DTO/schema、App endpoint／view-model／会议详情页面与 Expo route，并修改 appointment aggregate/service/public projection、日程 href 和三语文案。所有旧命令与预约状态机语义保持兼容；不增加参与人、不改会议确认流程、不新建数据库表或迁移。

## 验证边界

这是共享契约、权限、写入、版本和幂等变更，按 H + I 验证。Web/API 改动后必须在目标环境完成生产构建并重启当前 App 实际访问的服务，健康检查通过后再做 Simulator 验收；不得用旧进程或 mock 响应替代。

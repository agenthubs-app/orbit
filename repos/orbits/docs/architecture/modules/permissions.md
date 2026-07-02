# Permissions 模块

## 模块定位

Permissions 负责权限状态、分阶段授权和敏感操作确认，是所有外部副作用前的安全边界。

## 期望行为

模块应报告权限状态、处理权限请求，并为敏感动作提供 approve/reject 确认。业务模块不能自行绕过该边界。

## Mock 行为

Mock 服务返回固定权限状态、请求结果和确认记录，不调用真实设备权限、日历授权、邮箱授权、外部账号或数据库。

## Live Storage 行为

Live permission state 读取 remote `orbit_records` 中的 `permissions`
collection，并把底层 `PermissionStateDTO` 映射成产品 UI 的 staged
authorization contract。底层 capability 字符串不要求和 UI capability 一一相同；
例如 `relationship_local_remote_database` 会映射到 `event-data`，作为 live
关系数据层可用性的来源证据。

当前 live 实现仍然不触发浏览器权限、OAuth、日历、邮箱、通知或设备访问。
`requestPermission()` 只返回 in-app staged review payload。缺少 live store 配置时，
服务返回 `PERMISSION_STATE_LIVE_STORE_UNCONFIGURED`。

## 热拔插边界

调用方必须通过 `features/permissions/service-factory.ts` 获取 permission state 和 sensitive action confirmation 服务。真实授权实现只在 factory 后接入。

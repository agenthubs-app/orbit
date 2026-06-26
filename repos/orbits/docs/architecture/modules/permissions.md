# Permissions 模块

## 模块定位

Permissions 负责权限状态、分阶段授权和敏感操作确认，是所有外部副作用前的安全边界。

## 期望行为

模块应报告权限状态、处理权限请求，并为敏感动作提供 approve/reject 确认。业务模块不能自行绕过该边界。

## Mock 行为

Mock 服务返回固定权限状态、请求结果和确认记录，不调用真实设备权限、日历授权、邮箱授权、外部账号或数据库。

## 热拔插边界

调用方必须通过 `features/permissions/service-factory.ts` 获取 permission state 和 sensitive action confirmation 服务。真实授权实现只在 factory 后接入。

# Connections 模块

## 模块定位

Connections 负责人与人、人与事件、人与证据之间的关系记录，并维护关系阶段和画像。

## 期望行为

模块应提供连接列表、连接详情、证据追加、关系阶段更新和关系画像查询。所有输出都应带有可追溯来源。

## Mock 行为

Mock 服务基于 fixture 返回连接、证据、阶段和画像，并模拟添加证据与受控错误，不进行真实图数据库、CRM、消息或外部写入。

## 热拔插边界

调用方必须通过 `features/connections/service-factory.ts` 获取 connection evidence 和 relationship stage/profile 服务。未来图存储或 CRM 适配器只替换 factory 后方实现。

## 四阶段生命周期基础

共享契约新增 `ConnectionStageCode`，domain 提供对应的 `ConnectionStage`、常量和校验函数，只接受 `needs_follow_up | active | nurture | archived`（待联系、推进中、维系中、已归档）。编译期断言检查契约与 domain 枚举一致，App 通过 `sync:contract` 同步类型。

旧 `RelationshipStage` 六值类型及校验器保持不变，供现有读取路径和后续迁移解析使用。此次仅建立新类型，不切换 Web/App 页面、Contacts 读取或阶段预览接口；任务约束、原子持久化与迁移切换尚未接入。

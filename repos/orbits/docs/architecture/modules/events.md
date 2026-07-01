# Events 模块

## 模块定位

Events 负责活动创建、导入、参会者名单、目标准备、现场记录、想连接对象和会后联系人复核。

## 期望行为

模块应支持活动全生命周期：活动详情、参会者、活动目标、准备度、现场 encounter、want-to-connect 和 post-event review。每一步都应保留来源和操作边界。

## Mock 行为

Mock 服务返回固定活动、参会者、准备度、现场记录、连接意向和会后复核数据，不访问真实日历、活动平台、消息系统、数据库或外部网络。

## Live Store

第一阶段 live 只开放 `event-crud-import` 的 Events Live Store：活动列表、活动详情和手动活动创建。它代表 Orbit 自有活动存储，不代表 Google/Apple Calendar、活动平台或 organizer feed 导入。

其他 Events 子能力仍没有 live provider。请求它们的 live mode 应继续受控失败，直到各自 provider 和替换测试就绪。

## 热拔插边界

调用方必须通过 `features/events/service-factory.ts` 获取事件子服务。真实活动平台、日历或现场记录系统可逐项替换，不影响其他模块。

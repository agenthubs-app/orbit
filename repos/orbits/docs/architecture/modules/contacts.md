# Contacts 模块

## 模块定位

Contacts 负责已确认联系人的列表、搜索、筛选、详情、标签和状态，是关系数据的核心业务对象。

## 期望行为

模块应提供联系人列表查询、详情读取、标签调整和状态更新，并保持与 acquisition、connections、events 和 analysis 的证据关系。

## Mock 行为

Mock 服务返回确定性的联系人、标签、状态、搜索结果和空/失败场景，不访问真实通讯录、CRM、数据库或外部网络。

## 热拔插边界

调用方必须通过 `features/contacts/service-factory.ts` 获取 list/search/filter 和 detail/tag/status 服务。真实联系人存储可以独立接入，不改变页面或 API route。

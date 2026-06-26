# Bootstrap 模块

## 模块定位

Bootstrap 负责应用启动时的聚合数据，向主界面提供账号、联系人、事件、任务、dashboard、agent 和 chat 的初始摘要。

## 期望行为

模块应组合下游服务并返回一个稳定的 app bootstrap envelope，使首页或 AI command center 可以一次性获得首屏状态。

## Mock 行为

Mock 服务从各模块 mock/factory 组合演示数据，保持 deterministic，不触发真实登录、消息、日历、邮件、数据库或网络行为。

## 热拔插边界

调用方必须通过 `features/bootstrap/service-factory.ts` 获取 `AppBootstrapService`。下游模块替换为 live 后，bootstrap 通过 factory 组合即可渐进升级。

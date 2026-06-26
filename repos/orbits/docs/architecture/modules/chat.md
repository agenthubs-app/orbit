# Chat 模块

## 模块定位

Chat 负责会话列表、消息线程、发送消息、写作辅助、摘要抽取和隐私控制，是产品的自然语言交互入口。

## 期望行为

模块应支持用户围绕联系人和事件进行对话，并把摘要、抽取结果和写作建议以可追溯方式交给其他模块使用。隐私设置必须控制是否允许分析。

## Mock 行为

Mock 服务返回本地会话、消息、摘要、抽取结果、改写建议和隐私状态。发送消息、AI 生成、外部网络、邮件、日历和数据库写入均不真实执行。

## 热拔插边界

调用方必须通过 `features/chat/service-factory.ts` 获取 conversation、writing assist、summary extraction 和 privacy controls。真实 chat backend 或 AI provider 只能接在 factory 后。

# AI Provider 模块

## 模块定位

AI Provider 是共享 AI 输出边界，负责消息草稿、运行记录、prompt template、输入哈希和 provenance。

## 期望行为

模块应提供可追溯的 AI-shaped 输出和 run lookup。真实模型接入后，也必须保留 prompt id、input hash、source refs、fallback 信息和外部调用标记。

## Mock 行为

Mock 服务用本地规则生成 message draft 和 run record，明确标记 `modelCallExecuted: false`、`liveAiProviderRequested: false`，不调用真实模型、网络、数据库、邮箱、日历、通知或设备。

## 热拔插边界

调用方必须通过 `shared/ai/service-factory.ts` 获取 `AiProviderService`。真实模型 provider 只能作为 live/hybrid constructor 注册到 factory，不能被 route 直接引用。

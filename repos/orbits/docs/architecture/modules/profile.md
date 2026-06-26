# Profile 模块

## 模块定位

Profile 负责用户自己的资料、资料完整度、文档抽取和资料更新建议，是账号上下文的业务画像层。

## 期望行为

模块应提供资料读取、编辑、完整度评分、名片/简历抽取和来自信号的更新建议。抽取和建议必须可复核。

## Mock 行为

Mock 服务用 fixture 模拟个人资料、名片/简历抽取和更新建议，不执行真实 OCR、PDF 解析、AI 抽取、数据库写入或外部网络访问。

## 热拔插边界

调用方必须通过 `features/profile/service-factory.ts` 获取 profile、document extraction 和 signal review queue 服务。真实 OCR 或资料存储可单独替换。

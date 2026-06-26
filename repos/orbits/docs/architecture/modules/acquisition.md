# Acquisition 模块

## 模块定位

Acquisition 负责联系人进入系统前的采集链路，包括手动创建、名片扫描、名片复核、二维码、活动参会者导入、外部联系人导入、邮件日历线索、推荐联系人和重复合并。

## 期望行为

模块应把多种联系人添加方式统一成可确认的 contact draft，并保留来源证据、复核状态和合并建议。真实实现可以接入 OCR、通讯录、活动系统和推荐服务，但输出契约应保持稳定。

## Mock 行为

Mock 服务使用本地 fixture 模拟各类采集入口。名片扫描、外部导入、邮件日历线索和推荐逻辑均为本地确定性结果，不执行真实 OCR、邮箱、日历、通讯录、网络或数据库写入。

## 热拔插边界

调用方必须通过 `features/acquisition/service-factory.ts` 获取具体采集服务，或使用 `createContactAcquisitionServices()` 组合。每个采集子能力可以独立替换为 live 实现，不需要修改页面和 API route。

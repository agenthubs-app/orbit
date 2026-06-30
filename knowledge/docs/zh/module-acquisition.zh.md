# acquisition 模块架构

本页是 Orbit Wiki 的中文阅读版。它保留原始文档的路径、代码块、命令和接口标识，用中文说明阅读目的、审计依据和结构入口。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/architecture/modules/acquisition.md` |
| 中文镜像 | `knowledge/docs/zh/module-acquisition.zh.md` |
| 分类 | `module-architecture` |
| 状态 | `current` |
| 新鲜度 | `verified-current` |
| 负责人域 | `module:acquisition` |

## 中文摘要

说明 acquisition 模块的定位、期望行为、Mock 行为和热拔插边界。字段和状态仍以对应 contract 文件为准。

## 审计依据

已登记关联代码路径：repos/orbits/features/acquisition/service-factory.ts。

## 结构化阅读入口

- 第 1 节：Acquisition 模块
- 第 2 节：模块定位
- 第 3 节：期望行为
- 第 4 节：Mock 行为
- 第 5 节：热拔插边界

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

## 模块定位

Acquisition 负责联系人进入系统前的采集链路，包括手动创建、名片扫描、名片复核、二维码、活动参会者导入、外部联系人导入、邮件日历线索、推荐联系人和重复合并。

## 期望行为

模块应把多种联系人添加方式统一成可确认的 contact draft，并保留来源证据、复核状态和合并建议。真实实现可以接入 OCR、通讯录、活动系统和推荐服务，但输出契约应保持稳定。

## Mock 行为

Mock 服务使用本地 fixture 模拟各类采集入口。名片扫描、外部导入、邮件日历线索和推荐逻辑均为本地确定性结果，不执行真实 OCR、邮箱、日历、通讯录、网络或数据库写入。

## 热拔插边界

调用方必须通过 `features/acquisition/service-factory.ts` 获取具体采集服务，或使用 `createContactAcquisitionServices()` 组合。每个采集子能力可以独立替换为 live 实现，不需要修改页面和 API route。

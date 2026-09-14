# B5：双面名片的现有边界

2026-09-14，源码基线 `fab788d62`；只读准备，不启动 [0007 Planner](PLANNER.md) 的 Generator。

## 查明结果

1. Web `features/acquisition/business-card-ingest-v2/contract.ts` 的 manifest 只有 fileName、mimeType、rawSize、seq、clientDigest；IngestItemDTO 每项只有一个 extraction、derivativeObjectKey、confirmedContactId。当前身份是图片条目，不是正反面卡片组。
2. `app/api/contact-drafts/business-card/batches/v2/handlers.ts` 的 parseManifest 显式重建上述五个字段，不保留 cardId／side。纯共享 Schema 的隔离检查也确认：输入附加 cardId／side，解析成功但两字段消失。没有调用运行时或上传图片；此结果不是已测到服务器支持新字段。
3. `getConfiguredIngestV2` 首次创建配置即建立 pool 并开始 runBusinessCardIngestV2Migrations；GET 经 withAuthedRuntime 等待 ready。打开页面可能触发初始化，不能为了“只读看看”自行访问真实批次。
4. 已有 per-item confirmItem 事务与 confirmedContactId，不能简单对两张图分别 confirm，再期待客户端删重。需卡片级唯一确认和同一联系人回执。
5. 既有 v2 collecting TTL 24 小时、review TTL 7 天是当前常量，不等于已批准双面原图长期保留。原图／衍生图访问、确认后删除及字段来源需分别定规则。

上述路径均相对 `repos/orbits`；共享副本为 `shared/contract/business-card-batch.ts` 和 `shared/api-schema/business-card-batch.ts`，App 仍经 sync:contract 获得。

## 需要审阅的增量

建议让一张卡片拥有一或两张有明确 side 的图片，保留每面的 OCR 结果与来源；冲突值由用户选定，服务端验证双方属于同一 actor／batch／card。复核提交带两面版本／摘要和稳定确认意图，事务内最多创建一个联系人；旧单面记录按单面卡兼容，不推断邻近 seq 自动配对。

文件边界必然超出当前 App-only Planner：Web manifest、ingest repository／事务、worker 输入、confirm handler、共享类型／Schema和图片生命周期均可能参与。正式方案必须逐文件收敛并审阅；不能借已有 Web 负责人授权直接扩白名单，也不能把两面拼图后只留一份无来源 OCR 当完成。

最小反例集：两面不同时属于当前 actor／card、反面跳过、任一面重拍导致版本过期、正反面字段冲突、同意图重放／异内容冲突、两次并发确认、旧单面继续确认、源图已过期、切账号与迟到回执。实体拍照、OCR 费用及同联系人双端回读仍为必需证据。

当前独立核查已确认协议不会透传卡片分组；后续代码需要 B5 书面审阅，存储初始化／迁移需要具体环境授权，真实相机／OCR／创建需要实体设备、合成或已授权样本及原累计费用账本。没有图片上传、OCR 调用、联系人写入或业务测试通过声明。

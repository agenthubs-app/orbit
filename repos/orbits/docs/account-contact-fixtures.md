# 账号联系人夹具

`shared/mock/account-contact-fixtures.ts` 的 `buildAccountContactFixtures(accountId)` 只构造固定数据，不读取环境、认证或存储。返回12组联系人、关系、各3条证据及原始序位；账号SHA256前10位与01～12序位继续组成稳定ID。原正文、日期、来源和关联保持不变。

9名人物有明确二级行业，同时投影到 contact 和 contact.publicProfile。森花、小林大地、诺拉·费舍尔的原资料不足以唯一分类，保留一级行业和缺失二级；不作为已补齐。依据及24个投影由 `tests/support/industry-fixture-inventory.ts` 的 `readAccountContactIndustryFixtureSource()` 显式登记。

`scripts/seed-account-contact-fixtures.ts` 消费该构造器，但仍会读取账号、写入记录、归档旧夹具和迁移一条精确匹配的介绍草稿。不要为读取或验证夹具导入／执行该CLI。此次提取没有执行CLI，也没有补齐任何真实数据库。

离线检查使用 `tests/capabilities/account-contact-fixture-industries.test.ts`、`account-contact-fixtures-localization.test.ts` 与 `tests/services/secondary-industry-fixture-coverage.test.ts`，验证实际构造输出、所有权和分类缺项；这些检查不替代真实版本条件写和回读。

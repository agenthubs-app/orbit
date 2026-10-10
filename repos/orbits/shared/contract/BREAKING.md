# 契约破坏性变更登记（R08）

`shared/contract` 只加不改：可以加新类型、加可选字段、给枚举加值、把字段类型放宽。
下面这些会被 `scripts/contract-snapshot.mjs`（和 `tests/contracts/contract-append-only.test.ts`）拦下：

- 删类型或字段（改名等于删）；
- 可选字段改成必填，或给已有类型加必填字段；
- 枚举少了值；
- 字段类型不是旧类型的放宽。

文件头注释写了 `@draft` 的契约（目前只有 `plan-v2.ts`，到 R22 定稿）不进快照、不检查。

确实要破坏时，在下面按格式登记一行（id 用反引号，和检查报错里的 id 一致），
写明日期、改动、原因、甲乙双方同意和 App 侧的跟进，然后
`node scripts/contract-snapshot.mjs --write` 更新快照，
提交信息以 `contract:` 开头并注明「App 需要同步」。

| 日期 | id | 改动 | 原因 | 甲乙同意 | App 跟进 |
| --- | --- | --- | --- | --- | --- |

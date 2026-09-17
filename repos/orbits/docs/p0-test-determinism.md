# P0 测试确定性说明

`tests/pages/app-home-live-route-services.test.ts` 是源码契约测试，不连接数据库，也不读取 provider key。Contacts provider 断言配置入口仍使用 `createConfiguredPostgresLiveRecordStore`；profile signal provider 单独断言共享 `createConfiguredTransactionalPostgresRuntime`、runtime workspace/client 传递，以及事务内的 transaction-bound `createPostgresLiveRecordStore`。两条路径都是当前设计，不能用一个构造器断言覆盖它们。

如 provider 架构再次调整，应同步修改这条测试的契约断言，并保留“共享事务 runtime”这一行为要求。

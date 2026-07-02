# App Bootstrap Mock Aggregator 的 Live 实现说明

## 当前实现

App Bootstrap 已经有 live 实现：

- `features/bootstrap/live-service.ts` 实现 `AppBootstrapService`。
- `features/bootstrap/storage/bootstrap-live-record-provider.ts` 从 shared live record store 读取远程 `orbit_records`。
- `features/bootstrap/service-factory.ts` 在 `ORBIT_MODULE_MODE=live` 下注册 live service。
- `/api/app/bootstrap` 使用 `ORBIT_MODULE_MODE ?? ORBIT_FEATURE_MODE` 选择 service mode，并返回对应 `x-orbit-feature-mode` header。

## 读取的 live collections

当前 live provider 读取这些 collections：

- `accounts`
- `profiles`
- `contacts`
- `connections`
- `events`
- `tasks`
- `agentActions`
- `permissions`
- `notifications`
- `evidence`

provider 只负责把 `record.payload` 映射回已有领域 DTO。不要把这些业务字段加进 `shared/storage/live-record-store.ts`；storage 只负责通用 record envelope。

## 切换机制

使用统一模块模式：

```bash
export ORBIT_MODULE_MODE=live
```

live database 连接仍通过 shared storage 配置读取：

- `ORBIT_EVENT_DATABASE_URL`、`ORBIT_LIVE_DATABASE_URL` 或 `ORBIT_DATABASE_URL`
- `ORBIT_WORKSPACE_ID`

不要使用旧的 `ORBIT_APP_BOOTSTRAP_PROVIDER` 开关。

## 隐私 / Privacy 和 Provenance 约束

live bootstrap 是只读聚合边界：

- 不写数据库。
- 不发送通知。
- 不调用 AI provider。
- 不调用 calendar、email、device 或外部 provider。
- 不把 mock-only evidence ids 复制到 live payload。

live payload 使用 `privacy="live-app-bootstrap"`，并把 `databaseReadExecuted=true`、`databaseWriteExecuted=false`、`liveDatabaseAggregationExecuted=true` 写进 provenance。这个 flag 表示本次执行了 live database aggregation。`taskLimit` 只改变 `generationMethod`，不能覆盖 storage provider 的 `sourceLabel`。

## Failure 和 Recovery

未配置 live storage 时返回 `APP_BOOTSTRAP_LIVE_STORE_UNCONFIGURED`，API envelope 使用 503。controlled failure 使用 `APP_BOOTSTRAP_LIVE_FAILED`。

empty、pending 和 failure 必须继续作为明确 envelope 返回，不能藏在 partial success payload 里。

## Replacement tests

- `tests/capabilities/app-bootstrap-live-store.test.ts` 覆盖 memory live store 聚合、未配置 live store fail-closed、factory live registration、API live envelope。
- `tests/capabilities/app-bootstrap-mock-aggregator.test.ts` 继续锁定 mock provider-free 边界、debug view 和 API mock envelopes。
- `tests/pages/app-workbench-page.test.tsx` 覆盖 `/app` 通过 service factory 消费 bootstrap payload。

## 后续方向

当前 live bootstrap 直接读 shared live record store。等各 feature live service 的行为更稳定后，可以考虑把 bootstrap 从直接读取 collections 改为并发调用各 feature service。那时必须保留：

- 超时和错误归因。
- partial recovery。
- 每个区块的 source refs/evidence ids。
- no-write/no-provider/no-notification 副作用边界。

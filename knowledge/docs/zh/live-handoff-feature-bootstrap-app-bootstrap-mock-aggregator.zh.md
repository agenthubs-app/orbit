# bootstrap 能力 Live 交接：app bootstrap mock aggregator

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/features/bootstrap/app-bootstrap-mock-aggregator/LIVE_IMPLEMENTATION.md` |
| 中文镜像 | `knowledge/docs/zh/live-handoff-feature-bootstrap-app-bootstrap-mock-aggregator.zh.md` |
| 分类 | `implementation-handoff` |
| 状态 | `generated-evidence` |
| 新鲜度 | `likely-current` |
| 负责人域 | `feature:bootstrap` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

记录 bootstrap 模块中 app bootstrap mock aggregator 能力从 mock-first 实现切换到 live provider 时需要替换和验证的边界。

## 审计依据

已核对对应 feature 目录存在：repos/orbits/features/bootstrap/app-bootstrap-mock-aggregator。目录级实时行为仍以 service factory、API route 和测试为准。

## 结构化阅读入口

- 第 1 节：App Bootstrap Mock Aggregator 的 Live 实现说明
- 第 2 节：当前实现
- 第 3 节：读取的 live collections
- 第 4 节：切换机制
- 第 5 节：隐私 / Privacy 和 Provenance 约束
- 第 6 节：Failure 和 Recovery
- 第 7 节：Replacement 测试
- 第 8 节：后续方向

## 保留的代码与命令证据

### 代码证据 1

```bash
export ORBIT_MODULE_MODE=live
```

## 源文档正文

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
- `tests/pages/app-home-live-route-services.test.ts` 和真实 `/app/home` route 覆盖 live
  Home 的页面组合边界；旧 `/app` workbench route 已移除，bootstrap 只保留为
  feature service/API 聚合能力。

## 后续方向

当前 live bootstrap 直接读 shared live record store。等各 feature live service 的行为更稳定后，可以考虑把 bootstrap 从直接读取 collections 改为并发调用各 feature service。那时必须保留：

- 超时和错误归因。
- partial recovery。
- 每个区块的 source refs/evidence ids。
- no-write/no-provider/no-notification 副作用边界。

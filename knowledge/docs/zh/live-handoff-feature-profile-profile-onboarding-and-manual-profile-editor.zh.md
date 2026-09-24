# profile 能力 Live 交接：profile onboarding and manual profile editor

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/features/profile/profile-onboarding-and-manual-profile-editor/LIVE_IMPLEMENTATION.md` |
| 中文镜像 | `knowledge/docs/zh/live-handoff-feature-profile-profile-onboarding-and-manual-profile-editor.zh.md` |
| 分类 | `implementation-handoff` |
| 状态 | `generated-evidence` |
| 新鲜度 | `likely-current` |
| 负责人域 | `feature:profile` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

记录 profile 模块中 profile onboarding and manual profile editor 能力从 mock-first 实现切换到 live provider 时需要替换和验证的边界。

## 审计依据

已核对对应 feature 目录存在：repos/orbits/features/profile/profile-onboarding-and-manual-profile-editor。目录级实时行为仍以 service factory、API route 和测试为准。

## 结构化阅读入口

- 第 1 节：Profile Onboarding 和 手动 Profile Editor Live 实现
- 第 2 节：Live 服务 和 Provider Files
- 第 3 节：源标题：Switch Mechanism
- 第 4 节：Required Env Vars 和 权限
- 第 5 节：Privacy 和 Provenance Constraints
- 第 6 节：Replacement 测试

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

This capability now supports both deterministic mock mode and remote live mode.
Live mode reads the generated operator profile from shared live record storage
and writes manual profile edits back to the same `profiles` record. Mock mode
remains deterministic for local tests and fixture-driven debug views.

2026-09-08：mock 与 live 都允许增量资料更新。未传 `displayName` 时保留原姓名，显式空姓名仍返回校验错误；仅发送 `relationshipGoal` 可以更新或明确清空目标，未发送的字段保留。mock 仍按 fixture 返回确定性结果，不新增真实存储写入。

2026-09-14：服务端新增独立 `onboarding`（policyVersion 1），按姓名、合法两级行业和生日计算complete／incomplete，旧六项completeness仍只表示资料丰富度。旧响应契约可省略onboarding，但当前mock/live服务的读取与保存都会重新计算，客户端提供的完成状态不生效。

`birthDate` 是本人私密的YYYY-MM-DD日历日期；拒绝无效日期、非法闰日和未来日期，返回 `PROFILE_BIRTH_DATE_INVALID`，不回显输入值。省略保留旧值，显式null清空并恢复缺项状态；存储只放profile顶层私密扩展，不进入publicProfile、searchText、AI本人资料或人脉总览。provider拒绝userId与accountId冲突的记录，无userId的旧记录仍按accountId匹配读取。新增测试覆盖三种时区下日期不变及另一账号隔离。

版本条件写通过 `expectedUpdatedAt`（首次为null）与 `mutationId` 配对启用。配置入口现在使用同一PostgreSQL事务完成读取／合并／版本检查／保存／私密幂等回执，按workspace和actor加事务锁；序列化失败最多重试两次，其他存储错误安全返回不可确认。同ID同负载重放原回执，即使后来已有新版本也不重新写；同ID不同负载返回冲突。回执只在私密 `profile_mutations` 集合保存，不加入searchText；响应包含mutationId以供客户端核对。

无版本旧请求也在同一事务内合并，省略字段保留；版本时钟单调前进。普通无事务适配器和固定mock不能承诺新协议，返回 `PROFILE_SAVE_UNAVAILABLE`，不假装已做条件保存。生产配置无数据库时仍明确不可用，不自动落入mock。新增测试在本轮独立Unix-socket PostgreSQL集群上验证两个连接、首次创建、幂等、回滚、旧请求、HTTP冲突和配置接线；不使用业务库凭证。

补全页面返回路径和真实Google回跳验收尚未交付；上述存储测试不能代替页面／跨端业务验收。

## Live Service And Provider Files

- Keep `features/profile/service.ts` as the stable service interface consumed by
  route handlers and pages.
- Keep `features/profile/mock-service.ts` as the deterministic fixture-backed
  implementation used by tests and demo routes.
- Keep live code in separate feature-owned files:
  `features/profile/live-service.ts` and
  `features/profile/storage/profile-live-record-provider.ts`.
- The live provider reads generated `profiles` and `accounts` records from
  shared `orbit_records`. Field shape stays in
  `features/profile/contract.ts`; the generic storage layer does not define
  profile-specific columns.
- Keep `app/api/profile/route.ts` thin. It should resolve a profile service,
  translate results into the shared API envelope, and never embed storage rules.

## Switch Mechanism

`app/api/profile/route.ts` resolves the service through
`features/profile/service-factory.ts`. `ORBIT_MODULE_MODE` or
`ORBIT_FEATURE_MODE` selects mock, hybrid, or live behavior. Hybrid currently
inherits the mock profile implementation; live mode uses the shared live record
store and fails closed when database configuration is missing.

## Required Env Vars And Permissions

- Current shared live storage uses `ORBIT_EVENT_DATABASE_URL`,
  `ORBIT_LIVE_DATABASE_URL`, or `ORBIT_DATABASE_URL`.
- `ORBIT_WORKSPACE_ID` selects the workspace partition, defaulting to
  `orbit-dev` for local development.
- `ORBIT_PROFILE_DATABASE_URL`, `ORBIT_PROFILE_SERVICE_ROLE_KEY`, and
  `ORBIT_PROFILE_READONLY_KEY` are reserved names for a future dedicated
  profile store if profile data moves out of the generic live record table.
- No browser storage, device permissions, OAuth scopes, or third-party service
  permissions are required by the current live implementation.

## Privacy And Provenance Constraints

- Every profile read or update must preserve source and evidence provenance.
- Do not store profile fields without a source label, preserved evidence ids,
  and an update timestamp.
- Keep relationship context private to the Orbit account boundary. Do not expose
  profile fields to analytics, messaging, or scoring services unless the caller
  receives provenance with the payload.
- Validation failures must use controlled error codes and must not echo hidden
  credentials or raw provider errors.

## Replacement Tests

Live mode replacement is covered by tests that prove:

- `features/profile/live-service.ts` implements the `ProfileService` interface.
- Provider payloads map into the same DTOs exported from
  `features/profile/contract.ts`.
- `app/api/profile/route.ts` still returns `{ success: true, data }` and
  `{ success: false, error }` envelopes for GET and PUT.
- Empty profile, pending update, and validation failure paths remain covered.
- Source and evidence provenance survive live reads and writes.
- Tests can force mock mode so `features/profile/mock-service.ts` remains
  deterministic.

Current evidence:

- `tests/capabilities/profile-live-store.test.ts` proves live reads and upserts
  generated `profiles` and `accounts` records through shared live storage.
- `tests/capabilities/profile-onboarding-and-manual-profile-editor.test.ts`
  keeps the mock profile contract, route envelopes, debug states, and live
  handoff documentation covered.

# contacts 能力 Live 交接：contacts list search and filter mock

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/features/contacts/contacts-list-search-and-filter-mock/LIVE_IMPLEMENTATION.md` |
| 中文镜像 | `knowledge/docs/zh/live-handoff-feature-contacts-contacts-list-search-and-filter-mock.zh.md` |
| 分类 | `implementation-handoff` |
| 状态 | `generated-evidence` |
| 新鲜度 | `likely-current` |
| 负责人域 | `feature:contacts` |

## 怎么读

这页是当前阅读入口。具体字段、函数签名和运行行为仍以原始来源、相关代码路径和测试为准。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

记录 contacts 模块中 contacts list search and filter mock 能力从 mock-first 实现切换到 live provider 时需要替换和验证的边界。

## 审计依据

已核对对应 feature 目录存在：repos/orbits/features/contacts/contacts-list-search-and-filter-mock。目录级实时行为仍以 service factory、API route 和测试为准。

## 结构化阅读入口

- 第 1 节：联系人 List 搜索 和 Filter Live 实现
- 第 2 节：Live 服务 和 Provider files
- 第 3 节：源标题：Switch mechanism
- 第 4 节：Required env vars 和 权限
- 第 5 节：Privacy 和 provenance constraints
- 第 6 节：Replacement 测试
- 第 7 节：源标题：Live handoff evidence excerpts

## 保留的代码与命令证据

源文档没有独立代码块；涉及的路径、命令和接口名保留在上方元信息中。


## 源文档正文

2026-09-17 增量：`GET /api/contacts` 已透传显式 limit/cursor，无 limit 的旧调用保持完整结果。分页接线与验证边界见 [读取预算](../READ_BUDGET.md)；以下早期 provider 规划不代表云端新版本验收已完成。

## Live service and provider files

- Keep `features/contacts/contract.ts` as the DTO, filter, provenance, state, and error-code boundary for contact list, search, tag filters, source filters, value filters, and status filters.
- Keep `features/contacts/service.ts` as the `ContactsListSearchAndFilterService` interface and API failure mapping boundary.
- Keep `features/contacts/fixtures.ts` and `features/contacts/mock-service.ts` for Milestone C mock mode.
- Add `features/contacts/contacts-list-search-and-filter-mock/live-service.ts` only after the live implementation satisfies the same service interface.
- Add provider adapters under `features/contacts/contacts-list-search-and-filter-mock/providers/` for the approved search indexing service and contact database query layer.
- Keep `app/api/contacts/route.ts` and `app/api/contacts/search/route.ts` as thin route handlers that call the service interface and return the shared API envelope.

## Switch mechanism

- Continue resolving mock behavior through `ORBIT_FEATURE_MODE=mock` for Milestone C.
- `ORBIT_CONTACTS_PROVIDER` selects the future live contacts provider bundle.
- A future live switch should choose `createMockContactsListSearchAndFilterService` in mock mode and a `createLiveContactsListSearchAndFilterService` factory in live mode.
- Hybrid mode may expose fixture-backed contacts beside provider health metadata, but it must not read the live search indexing service or execute live database queries until replacement tests cover those paths.
- `/dev/capabilities/contacts-list-search-and-filter-mock` must continue rendering success, empty, pending, and failure states for whichever service mode is active.

## Required env vars and permissions

- `ORBIT_CONTACTS_PROVIDER` selects the live contacts service adapter.
- `ORBIT_CONTACTS_DATABASE_URL` or the equivalent managed secret identifies the live relationship data store.
- `ORBIT_CONTACTS_SEARCH_INDEX` identifies the approved search indexing service or index name.
- User authorization must prove the user can read the requested workspace contacts before any live list or search result is returned.
- Contact source permissions from acquisition, email, calendar, referral, and event import capabilities must already be staged and preserved before their evidence can appear in the live list.

## Privacy and provenance constraints

- Every live contact row must preserve source, evidence ids, relationship context, relationship value rationale, status, and next-action rationale.
- API failure envelopes must not expose raw database rows, search index internals, credentials, provider request ids, email bodies, calendar text, or private contact details outside the typed response contract.
- Search ranking must be explainable enough to show which local query and filters were applied; opaque provider scores cannot replace Orbit relationship value rationale.
- Tag, source, value, and status filters must be validated against `features/contacts/contract.ts` before reaching the provider layer.
- Live list/search providers should implement `readContactGraphForList` so route
  searches fetch contacts and only the evidence ids attached to listed contacts
  and their related connections. The full `readContactGraph` path remains a
  compatibility fallback, not the preferred live route read path.
- Empty, pending, unsupported filter, and provider failure paths must keep provenance that explains whether the response came from local rules, a live search index, or a live database query.

## Replacement tests

- Replace `tests/capabilities/contacts-list-search-and-filter-mock.test.ts` mock-only assertions with service-mode tests that prove live mode still returns the same envelope shape.
- Keep `tests/capabilities/contacts-live-store.test.ts` proving live list/search
  output matches the service contract and focused search reads do not fetch
  unrelated evidence rows.
- Add contract tests for future provider adapters covering list, text search, tag filters, source filters, value filters, status filters, empty state, pending state, unsupported filters, and provider failure.
- Add API tests for `app/api/contacts/route.ts` and `app/api/contacts/search/route.ts` proving status codes, runtime boundary headers, source/evidence provenance, privacy-safe errors, and stable API envelopes.
- Add privacy tests proving provider raw payloads, credentials, search-index internals, private message text, and database diagnostics never appear in success or failure envelopes.
- Add debug-route tests proving the dev capability surface still renders success, empty, pending, and failure states without owning business logic locally.

## Live handoff evidence excerpts

- Live provider files live under `features/contacts/contacts-list-search-and-filter-mock/`.
- `ORBIT_CONTACTS_PROVIDER` switches from mock to live.
- Live replacement wires a search indexing service and contact database queries behind `ContactsListSearchAndFilterService`.
- Contact list rows preserve source evidence, relationship context, value scoring, status, and follow-up rationale.
- Replacement tests cover list, search, tag/source/value/status filters, empty, pending, unsupported filter, and provider failure paths.

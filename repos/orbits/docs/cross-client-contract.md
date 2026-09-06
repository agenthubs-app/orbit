# 跨客户端契约

## 解决什么问题

网页版通过 React Server Components 进程内直连 `features/`，iOS App 走 HTTP 读
`app/api/`。两条路径看的是同一份数据，但在 2026-07 之前，只有服务端这一侧有类型：
移动端 40 个 view-model 用 `unknown` 加字符串字段名去猜响应形状。结果是网页版改一个
字段，服务端编译通过、网页版正常，移动端在运行时静默拿到空值。

`shared/contract/` 把客户端可见的响应形状收成一份声明，两端共用。契约一改，
网页版的 route view-model 和 iOS 的映射器**同时**编译报错。

## 结构

```
shared/contract/          零 import 的纯类型声明，iOS App 会原样拷贝
  envelope.ts             统一响应壳与错误码
  source.ts               来源、阶段、关系价值枚举
  contacts.ts             联系人列表响应
  index.ts                公开出口
shared/contract-check.ts  ContractMatches：编译期一致性断言（不属于契约，不外发）
shared/domain/industries.ts  行业 ID、三语标签及校验函数，按白名单同步
shared/domain/language.ts    语言常量，按白名单同步
shared/api-schema/       运行时响应校验，单独同步到移动端 src/api/schema
```

## 三条硬规则

1. **零 import。** 契约文件只能 `import type` 同目录下的文件。iOS App 拷贝这些文件时
   不会带上 `features/` 或 `shared/` 的其他部分。
2. **只有类型。** 枚举的常量数组留在 `features/<module>/contract.ts` 或
   `shared/domain/source-types.ts`，契约里只声明对应的字符串联合，并在常量那一侧
   用 `ContractMatches` 断言两边一致。
3. **只有响应。** 请求输入类型不跨端，留在各自 feature 的 `contract.ts`。

`tests/contract-surface.test.ts` 强制前两条。

## 加一个新领域

1. 在 `shared/contract/<domain>.ts` 写响应类型，零 import。
2. 在 `shared/contract/index.ts` 补一行 export。
3. `features/<domain>/contract.ts` 改成从契约转发（`export type { XContract as X }`），
   枚举常量留在原处并补 `ContractMatches` 断言。
4. 跑 `npx tsc --noEmit --incremental false`，确认整个项目（含测试）零类型错误。
5. 到 `repos/orbit-app` 跑 `npm run sync:contract`，再跑 `npm test` 和
   `npm run typecheck`，把被指出来的 view-model 改成引用契约字段。

## 已迁移

| 领域 | 契约文件 | 状态 |
|------|----------|------|
| 响应壳与错误码 | `envelope.ts` | 已接 `shared/errors/app-error.ts` 断言 |
| 来源与关系价值枚举 | `source.ts` | 已接 `shared/domain/source-types.ts` 断言 |
| 联系人列表 | `contacts.ts` | 已接 `features/contacts/contract.ts` 转发 |
| Orbit AI 会话 | `orbit-ai.ts` | 会话列表、消息、建议动作；artifacts 与 diagnostics 未跨端 |
| 个人资料 | `profile.ts` | 资料、完整度、编辑器状态；provenance 未跨端 |
| 跟进任务 | `followups.ts` | 任务、触发原因、复核提示 |
| 活动 | `events.ts` | 活动记录、来源元数据、证据 |
| 行业与语言 | `industries.ts`、`language.ts` | 纯类型；运行时字典在 shared/domain，按两个文件白名单同步 |

移动端对应的取值器分别是 `contactField`、`conversationField` / `messageField` /
`intentField`、`profileField`、`taskField`、`eventField`，它们把字段名约束到
`keyof <契约类型>`，服务端改名时移动端 `npm run typecheck` 立刻报错。

其余 15 个领域仍在各自的 `features/*/contract.ts` 里，尚未跨端共享。
优先级按移动端实际取数量排：dashboard、connections、chat、notifications、search。

## 为什么不直接让 App import 这个目录

`repos/orbit-app/AGENTS.md` 禁止移动端在构建期 import `../orbits` 的源文件，避免两个
仓库的构建互相绑死。所以走拷贝：`repos/orbit-app/scripts/sync-contract.mjs` 生成副本，
`repos/orbit-app/tests/contract-sync.test.ts` 校验副本与这里逐字一致。副本过期，
移动端的 `npm test` 就红。

## 类型检查门槛

2026-09-06 已清理剩余 103 项测试类型错误，未改数据库结构或 API 字段，也未使用
`any`、忽略指令或放宽编译配置。测试直接引用对应领域的 DTO、provider 和模块类型，
不再手写会随接口演进失效的替代形状；故意缺失证据等负向场景仍保留。

- `tests/ui/orbit-typecheck-ratchet.test.ts` 编译完整 `tsconfig.json`，错误上限从 110
  降为 0。编译器启动失败或非类型诊断错误也会让检查失败。
- `tests/contract-compatibility.typecheck.ts` 对联系人筛选项、来源、关系阶段与价值、
  错误码和联系人响应壳执行编译期一致性断言。仅定义一个可能变成 `never` 的类型别名
  不足以报错，因此该文件以 `true satisfies` 形式实际约束断言结果。
- `tsx` 执行测试不等于类型检查；运行时断言、全量编译和移动端副本一致性必须分别通过。

行业和语言的运行时字典已移到 `shared/domain`，契约目录仅保留联合类型和接口。
`tests/contract-compatibility.typecheck.ts` 同时检查两个字典的完整枚举与契约一致，
防止只约束「每个值合法」却漏掉某个合法值。14 个行业 ID、42 个三语标签及排序不变。

移动端 `scripts/sync-contract.mjs` 仅允许复制 `industries.ts` 和 `language.ts` 到
`src/api/domain/`，不复制整个服务端 domain 目录。`tests/domain-sync.test.ts` 校验
逐字一致，并在独立临时目录执行真实同步命令，验证白名单、过期副本清理和重复执行。

零类型错误不等于所有接口都已做运行时校验。当前同步的运行时 Schema 为
`mobile-contacts-dashboard.ts`；通用 API client 的响应壳检查和资源的 Schema 校验
是两个不同层次。剩余运行时回归仍需分别处理，不能用编译通过替代功能验收。

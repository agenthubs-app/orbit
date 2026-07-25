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
4. 跑 `npx tsc --noEmit`，确认没有新增错误。
5. 到 `repos/orbit-app` 跑 `npm run sync:contract`，再跑 `npm test` 和
   `npm run typecheck`，把被指出来的 view-model 改成引用契约字段。

## 已迁移

| 领域 | 契约文件 | 状态 |
|------|----------|------|
| 响应壳与错误码 | `envelope.ts` | 已接 `shared/errors/app-error.ts` 断言 |
| 来源与关系价值枚举 | `source.ts` | 已接 `shared/domain/source-types.ts` 断言 |
| 联系人列表 | `contacts.ts` | 已接 `features/contacts/contract.ts` 转发 |

其余 19 个领域仍在各自的 `features/*/contract.ts` 里，尚未跨端共享。

## 为什么不直接让 App import 这个目录

`repos/orbit-app/AGENTS.md` 禁止移动端在构建期 import `../orbits` 的源文件，避免两个
仓库的构建互相绑死。所以走拷贝：`repos/orbit-app/scripts/sync-contract.mjs` 生成副本，
`repos/orbit-app/tests/contract-sync.test.ts` 校验副本与这里逐字一致。副本过期，
移动端的 `npm test` 就红。

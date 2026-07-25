# 跨客户端契约 (shared/contract)

这里放的是**所有客户端都会看到的响应形状**：网页版、iOS App，以及将来任何新客户端。

## 为什么单独放一层

网页版通过 React Server Components 进程内直连 `features/`，iOS App 走 HTTP。
两条路径，但必须看到同一个响应形状。契约放在这里，两端才有共同的真源；
契约一改，两端同时编译报错，而不是只有客户端在运行时静默拿到错数据。

## 规则

1. **零 import。** 本目录下的文件只允许 `import type` 本目录内的其他文件，不得
   引用 `features/**`、`shared/**` 的其他目录或任何 npm 包。原因是 iOS App 会把
   这些文件原样拷贝进自己的仓库，带外部 import 就拷不过去。
   `tests/contract-surface.test.ts` 会强制这一点。

2. **只放类型，不放运行时代码。** 枚举的常量数组留在 `features/<module>/contract.ts`
   或 `shared/domain/`，这里只声明对应的字符串联合类型，并在原处加一行类型断言
   保证两边不漂移。

3. **只放响应形状。** 请求输入类型留在各自 feature 的 `contract.ts`，它们不跨端。

4. **改动即破坏性变更。** 这里的每一次修改都会同时影响网页版和 iOS App。改之前
   先确认 iOS 侧对应的 view-model 能跟上，见 `repos/orbit-app/scripts/sync-contract.mjs`。

## iOS App 怎么拿到

App 不从 `../orbits` import 源文件（`repos/orbit-app/AGENTS.md` 禁止构建期跨仓库耦合）。
它把本目录原样拷贝到 `src/api/contract/`，由 `npm run sync:contract` 生成、由
`tests/contract-sync.test.ts` 校验副本与这里逐字一致。副本过期，App 的测试就红。

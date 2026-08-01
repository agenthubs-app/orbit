# Orbit 全产品功能审计

- 源码基线：`3f1424f694e2332a92299bfe9aa2f178484f2c0f`
- 源码状态：head-plus-uncommitted-authoritative-inputs；未提交权威输入改动：10
- Web 路由：46（生产 38，开发 8）
- Expo 路由：48
- 路由界面分母：94
- 渲染叶子控件观测：3001 次 / 279 个显式状态 / 273 个状态键（仅状态局部观测，最终分母仍未冻结）
- 弹层实现分母：9；按路由可达实例：31
- 交互控件按路由可达实例分母：2256
- 唯一交互源码位置分母：1244
- 归一化静态行为实现分母：915
- 真实渲染叶子控件分母：未解决（不得用上述三个静态分母替代）
- 已完成运行时界面验证：0/94
- 已有部分运行时证据但尚未全状态关闭的界面：94
- 已完成运行时交互验证：269/2256
- 已登记验证案例：137
- 已登记修复闭环：134
- 外部环境限制：7
- 仍待补齐的审计缺口组：3

## 范围与方法

All Next.js pages including development routes and all Expo Router route files; API handlers are downstream dependencies, not user surfaces.

清单由 Next.js `page.tsx/page.ts` 路由树、Expo Router `app` 路由树、每个入口的本地传递依赖、JSX 控件、回调属性、弹层、可见文案、查询参数信号、跳转信号、数据源信号和测试源码交叉生成。动态 ID 的真实取值、查询参数、hash、角色、数据规模、持久化回读和最终用户内容必须继续用运行时证据关闭。

## 当前结论

这是可追踪分母的第一版，不是完成声明。`inventory.json` 中的 `not-runtime-verified` 明确表示尚无足够证据；静态存在、测试文件命中、HTTP 200 或 schema 正确均不会自动变成通过。

## 仍待补齐的审计缺口

- `GAP-RUNTIME-LEAF-DENOMINATOR`（Whole product，still-uncovered）：The rendered DOM/native-tree leaf-control denominator remains state-local and unresolved; the current route-instance, unique-source-location and normalized-static-implementation counts in this inventory must not be treated as runtime leaf counts.
- `GAP-REMAINING-STATE-MATRICES`（Agent, Events, Party, Admin and account surfaces，still-uncovered）：Several forced network failures, rapid duplicate activations, concurrent writes, uncommon empty/large-data states and responsive/keyboard variants remain only partially sampled; shard evidence records the exact scenario-level boundaries.
- `GAP-ROUTE-CONTRACT-MANIFEST`（All Web and Expo entry routes，still-uncovered）：Route-local query false positives are repaired, but the audit still lacks one authoritative route-tree contract for global shell and diagnostic query namespaces, fixed redirect targets/query/hash behavior, alias and passthrough semantics, Expo custom-scheme/legacy handling, parameter cardinality/decoders/security and per-case runtime probes. The 94 page-file nodes therefore remain an entry-node denominator rather than 94 independently proved terminal UI contracts.

## 外部环境限制

- `EXT-NATIVE-AUTH-STACK-PREFETCH`（Expo authenticated retained-route prefetch timing）：Two independent native actors, logout deletion, actor-keyed SQLite ownership, warm/online/cold cache states and cross-actor non-leakage passed. The exact actor-B before-first-Contacts-network failure window was unavailable because the retained authenticated stack prefetched Contacts before the test could stop the service.
- `EXT-ANDROID-RUNTIME`（Expo Android）：No Android SDK/emulator was available in the audit environment.
- `EXT-NATIVE-BUILD`（Standalone iOS native target）：Xcode 26.1 / Swift 6.2 failed in expo-modules-jsi weak-let compilation before Orbit product code; the native runtime evidence therefore used Expo Go 57.
- `EXT-OAUTH-PROVIDERS`（OAuth and external integrations）：No disposable real Google/OAuth or third-party provider credentials were available for success, denial and callback traversal.
- `EXT-PRIVILEGED-PLATFORM-CAPABILITY`（Privileged Platform success）：Ordinary actor-A/actor-B Admin states and cross-workspace denial passed, but the product defines no persisted privileged Platform role or platform-wide provider. The success state is a product capability unavailable boundary rather than an inferred audit pass.
- `EXT-PROVIDER-STATE-MATRIX`（Party, Event and Agent provider outcomes）：Real provider success/failure/concurrency states for Party, registration, attendee import, voice, match, history deletion and destructive failure were not all available without external fixtures or credentials.
- `EXT-ASSISTIVE-TECH`（Accessibility runtime）：Manual VoiceOver/TalkBack and screen-reader announcement timing were not independently exercised.

## 当前静态候选

- 无静态行为证据的控件：0
- 无静态可访问名称证据的控件：0
- 这些只是候选，必须结合渲染 DOM/原生树和真实点击结果确认，不能把静态误报当成已证实缺陷。

## 可复现命令

```bash
cd repos/orbits
node scripts/generate-full-product-functional-audit.mjs
node --test --import tsx tests/audits/full-product-functional-audit.test.ts
node --test --import tsx tests/audits/web-route-transport.test.ts
npm run build
npx next start -p 3110
# 在另一个终端运行：
ORBIT_AUDIT_BASE_URL=http://127.0.0.1:3110 npm run audit:web-transport
```

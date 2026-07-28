# Orbit 全产品功能审计

- 源码基线：`0d36c5363546071547269a98567559e219640b26`
- Web 路由：46（生产 38，开发 8）
- Expo 路由：48
- 路由界面分母：94
- 弹层实现分母：7；按路由可达实例：47
- 交互控件按路由可达实例分母：2819
- 已完成运行时界面验证：0/94
- 已有部分运行时证据但尚未全状态关闭的界面：55
- 已完成运行时交互验证：40/2819
- 已登记验证案例：28
- 已登记修复闭环：26

## 范围与方法

All Next.js pages including development routes and all Expo Router route files; API handlers are downstream dependencies, not user surfaces.

清单由 Next.js `page.tsx/page.ts` 路由树、Expo Router `app` 路由树、每个入口的本地传递依赖、JSX 控件、回调属性、弹层、可见文案、查询参数信号、跳转信号、数据源信号和测试源码交叉生成。动态 ID 的真实取值、查询参数、hash、角色、数据规模、持久化回读和最终用户内容必须继续用运行时证据关闭。

## 当前结论

这是可追踪分母的第一版，不是完成声明。`inventory.json` 中的 `not-runtime-verified` 明确表示尚无足够证据；静态存在、测试文件命中、HTTP 200 或 schema 正确均不会自动变成通过。

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

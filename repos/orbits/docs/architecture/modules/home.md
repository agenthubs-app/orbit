# Home 模块

## 模块定位

Home 是个人入口和活动入口的页面组合层。它负责把 events、contacts 和
profile 的 route payload 汇总成个人 hub，不负责搜索、存储、推荐或资料
编辑。

## 期望行为

Home 应展示用户身份、报名/相关活动、人脉数量和推进中的关系数量。它只复用
下游 feature 已经批准的 route/service 边界，不直接访问 fixture、database、
search index 或 provider SDK。

## Mock 行为

旧 mock-first Home 由 `getOrbitHomeViewModel()` 同步拼接 landing、contacts
和 profile 的本地 view model。该函数仍可作为旧 UI 辅助存在，但真实
`/app/home` 和 `/app/home/events` 页面不再调用它。

## Live 行为

Live Home 通过 `loadAppHomeRouteViewModel()` 组合三个 live-capable route
loader：

- Events route payload 提供活动列表。
- Contacts route payload 提供人脉统计。
- Profile route payload 提供账户名称和 headline。

Home adapter 只做 UI shape 映射，把这些 payload 转换为 `OrbitHomeViewModel`
供 `OrbitRealHome` 使用。任何 child route 返回 empty、pending 或 failure
时，Home 渲染 shared `StateView`，不会 fallback 到 mock。

## 热拔插边界

Home 不注册自己的 storage provider。events、contacts、profile 的实现从
mock/hybrid/live 切换时，Home 通过这些 route loader 自然继承能力。新增搜索
或向量检索也应先进入对应 feature/search service，再由 Home 消费结果。

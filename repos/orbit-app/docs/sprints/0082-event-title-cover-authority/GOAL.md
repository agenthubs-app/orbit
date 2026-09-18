# Sprint 0082 — 活动标题与封面只有一个来源

## 要实现什么

首页"推荐活动"显示日英双语标题、没有封面；活动列表页靠前端"挑中文段"和硬编码封面表补救；详情页读 canonical 头才是中文。本 Sprint 定一个权威来源，让首页、列表、详情、推荐都拿同一个标题和同一张封面。

## 做完能看到什么

- 首页推荐活动是中文标题，并显示与活动页相同的封面图。
- 列表页不再依赖 `ZH:` 挑段与 `eventCoverById` 硬编码表；`organizer-public.ts` 的重复表一并删除。
- 种子里的 16 个活动都有可解析的标题与封面字段。

## 怎么验收

`/api/recommendations/events` 与 `/api/events` 的响应字段断言；phoneweb 首页与活动页截图对照；Simulator 首页对照。TODO 第 5 条。

完整验收项和启动条件见 [PLANNER.md](PLANNER.md)。当前状态见[登记表](../README.md#sprint-登记表)。

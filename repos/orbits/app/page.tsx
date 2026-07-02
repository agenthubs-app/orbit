/**
 * 根路径 `/` 的页面入口。
 *
 * Web 版打开根路径时应进入和 `/app` 一致的个人主页，而不是公开落地页。
 * 实际加载、live fallback 和页面渲染逻辑统一委托给 `/app` route adapter。
 */
import AppHomePage from "./(app)/app/page";

export default AppHomePage;

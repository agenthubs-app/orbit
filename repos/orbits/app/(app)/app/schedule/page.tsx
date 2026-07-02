/**
 * 日程页兼容入口。
 *
 * 真实日程体验目前由 followups live route 供给；保留 /app/schedule，避免网页版
 * 用户或旧链接进入 404。
 */
import AppFollowupsPage from "../followups/page";

export default AppFollowupsPage;

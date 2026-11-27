// iOS Safari 在聚焦字号 < 16px 的输入框时会自动放大页面，放大后还得手动缩回去（2026-11-27 用户反馈：
// 手机上页面「稍微放大、能左右滑」）。设计稿里不少输入框是 12.5–15px，逐个改成 16px 会偏离画板，
// 所以按常见做法只在 iOS 上给 viewport 追加 maximum-scale=1：iOS 10 起它不再阻止用户双指缩放，
// 只是停掉「聚焦自动放大」。安卓本来不会自动放大，而且 maximum-scale 会禁掉安卓的双指缩放，所以安卓不加。
// 放在根 layout 的 <head> 里；viewport 标签由 Next 生成，加载完成时再补一次以防当时还没插入。
export const ORBIT_IOS_INPUT_ZOOM_SCRIPT = `(function(){try{var n=navigator;var ios=/iP(hone|od|ad)/.test(n.userAgent)||(n.platform==='MacIntel'&&n.maxTouchPoints>1);if(!ios)return;var f=function(){var m=document.querySelector('meta[name="viewport"]');if(m&&m.content.indexOf('maximum-scale')<0)m.setAttribute('content',m.content+', maximum-scale=1');};f();document.addEventListener('DOMContentLoaded',f);}catch(e){}})();`;

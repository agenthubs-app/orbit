/**
 * iOrbit（Orbit_0918）六屏共用的皮肤字符串。
 *
 * 每条规则 = 设计稿一个 style="" 原样搬入；顺序与值不得改动。
 * 前缀一律 `[data-orbit-real-page="iorbit-0918"]`（`@keyframes` 除外）。
 *
 * 任务 5 从 `iorbit-shell.tsx` 抽出：`agent/{actions,plan,strategy}` 三条兄弟路由
 * 要同一份皮肤，但它们不需要壳的聊天 hook —— 如果从壳里 import，`orbit-real-agent.tsx`
 * （3892 行，任务 6 才删）会被拖进这三个路由的客户端包。本文件不含 React，
 * 壳继续 `export { IORBIT_STYLES }` 保持既有 import 路径不变。
 */
// 每条规则 = 设计稿一个 style="" 原样搬入；顺序与值不得改动。前缀 [data-orbit-real-page="iorbit-0918"]。
export const IORBIT_STYLES = `
@keyframes orbit-fade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
/* ── 设计 14–22 的全局 CSS + 25 行的页面包裹 ── */
[data-orbit-real-page="iorbit-0918"] { min-height: 100vh; background: #FBFBFE; color: #0E1225; font-family: "Noto Sans SC", "PingFang SC", "Hiragino Sans GB", sans-serif; -webkit-font-smoothing: antialiased; text-wrap: pretty; overflow-x: clip;
  /* 双层作用域（「审阅修订」2）：外层 [data-orbit-real-page="agent"] 把字号压到 15px、
     行高压到 1.65，设计的 body 两者都没写（=16px / normal），这里显式还原。行高不还原时
     每个块的行盒都高 2px，面包屑→标题→副标题会累积出 5–6px 的纵向漂移。 */
  font-size: 16px; line-height: normal; }
[data-orbit-real-page="iorbit-0918"] * { box-sizing: border-box; }
[data-orbit-real-page="iorbit-0918"] a { color: #3B3F7A; text-decoration: none; }
[data-orbit-real-page="iorbit-0918"] a:hover { color: #0E1225; }
[data-orbit-real-page="iorbit-0918"] input, [data-orbit-real-page="iorbit-0918"] textarea, [data-orbit-real-page="iorbit-0918"] button { font-family: inherit; }
[data-orbit-real-page="iorbit-0918"] input::placeholder, [data-orbit-real-page="iorbit-0918"] textarea::placeholder { color: #9FA3C4; }
/* 视觉隐藏的屏幕标题（设计无此元素；既有测试与审计要 data-orbit-agent-screen-title） */
[data-orbit-real-page="iorbit-0918"] .ir-screen-title { clip-path: inset(50%); height: 1px; margin: -1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px; }
/* ── <main>（设计 43）与概览屏外层（设计 47）── */
[data-orbit-real-page="iorbit-0918"] .ir-main { max-width: 1240px; margin: 0 auto; padding: 14px 40px 72px; display: flex; flex-direction: column; gap: 26px; }
[data-orbit-real-page="iorbit-0918"] .ir-home { display: flex; flex-direction: column; gap: 26px; animation: orbit-fade .3s ease; }
/* ── 标题行（设计 49–55）── */
[data-orbit-real-page="iorbit-0918"] .ir-head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 24px; }
[data-orbit-real-page="iorbit-0918"] .ir-head-copy { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
[data-orbit-real-page="iorbit-0918"] .ir-h1 { margin: 0; font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: clamp(34px, 4vw, 46px); line-height: 1.1; letter-spacing: -0.03em; }
[data-orbit-real-page="iorbit-0918"] .ir-sub { margin: 0; font-size: 16px; color: #3B3F7A; }
[data-orbit-real-page="iorbit-0918"] .ir-today { font-size: 14px; color: #6B6F99; }
/* ── 提问行 + chips + 打开对话（设计 57–74）── */
[data-orbit-real-page="iorbit-0918"] .ir-grid-ask { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 520px), 1fr)); gap: 16px; align-items: start; }
[data-orbit-real-page="iorbit-0918"] .ir-ask-col { display: flex; flex-direction: column; gap: 14px; }
[data-orbit-real-page="iorbit-0918"] .ir-ask { display: flex; align-items: center; gap: 12px; padding: 12px 16px 12px 20px; border: 1px solid #DDDEFA; border-radius: 999px; background: #FFFFFF; box-shadow: 0 6px 24px rgba(59,63,122,0.06); }
[data-orbit-real-page="iorbit-0918"] .ir-ask-icon { color: #4B4FC7; font-size: 16px; }
[data-orbit-real-page="iorbit-0918"] .ir-ask-input { flex: 1; min-width: 0; border: 0; border-radius: 0; outline: none; background: transparent; font-size: 15px; color: #0E1225;
  /* 设计 input 保留 Chrome 默认 padding 1px 2px；基类 reset 清成 0，这里补回 */
  padding: 1px 2px; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-ask-send { width: 36px; height: 36px; border: 0; border-radius: 50%; background: #ECEEFB; color: #2E3270; font-size: 15px; cursor: pointer;
  /* 覆盖 .btn 基类（orbit-reference-styles.tsx:594–611）非设计声明 */
  padding: 0; font-weight: 400; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-ask-send:hover { background: #DDDEFA; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-ask-send:active { transform: none; }
[data-orbit-real-page="iorbit-0918"] .ir-chips { display: flex; flex-wrap: wrap; gap: 10px; }
[data-orbit-real-page="iorbit-0918"] .ir-chip { padding: 9px 16px; border: 1px solid #E8E9F6; border-radius: 999px; background: #FFFFFF; color: #3B3F7A; font-size: 13px; cursor: pointer; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-chip { padding: 9px 16px; border: 1px solid #E8E9F6; border-radius: 999px; background: #FFFFFF; color: #3B3F7A; font-size: 13px;
  height: auto; font-weight: 400; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="iorbit-0918"] .ir-chip:hover, [data-orbit-real-page="iorbit-0918"] .btn.ir-chip:hover { border-color: #B9BCEB; color: #2E3270; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-chip:active { transform: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-open-chat { justify-self: start; display: flex; align-items: center; gap: 12px; padding: 16px 22px; border: 1px solid #B9BCEB; border-radius: 16px; background: #FFFFFF; color: #2E3270; font-size: 16px; font-weight: 500; cursor: pointer;
  height: auto; justify-content: flex-start; white-space: nowrap; text-align: left; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-open-chat:hover { background: #ECEEFB; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-open-chat:active { transform: none; }
[data-orbit-real-page="iorbit-0918"] .ir-open-chat-icon { width: 30px; height: 30px; border-radius: 9px; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; font-size: 14px; }
[data-orbit-real-page="iorbit-0918"] .ir-caret { color: #9FA3C4; }
/* ── 卡片栅格与卡片（设计 77 / 79 / 109 / 148 / 172 / 195 / 214）── */
[data-orbit-real-page="iorbit-0918"] .ir-grid-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 460px), 1fr)); gap: 20px; align-items: start; }
[data-orbit-real-page="iorbit-0918"] .ir-card { border: 1px solid #E8E9F6; border-radius: 20px; background: #FFFFFF; padding: 22px 24px; display: flex; flex-direction: column; gap: 18px; }
[data-orbit-real-page="iorbit-0918"] .ir-card-16 { gap: 16px; }
[data-orbit-real-page="iorbit-0918"] .ir-card-14 { gap: 14px; }
[data-orbit-real-page="iorbit-0918"] .ir-card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-bottom: 16px; border-bottom: 1px solid #E8E9F6; }
[data-orbit-real-page="iorbit-0918"] .ir-card-title { display: flex; align-items: center; gap: 10px; }
[data-orbit-real-page="iorbit-0918"] .ir-card-icon { width: 30px; height: 30px; border-radius: 9px; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; font-size: 14px; }
[data-orbit-real-page="iorbit-0918"] .ir-card-h { font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 19px; letter-spacing: -0.02em; }
[data-orbit-real-page="iorbit-0918"] .ir-card-link { font-size: 13px; color: #4B4FC7; }
/* 任务 6a（任务 5 遗留 10）：下面五条 ir-* 类都落在链接元素上，作用域的
   a{color:#3B3F7A} / a:hover{color:#0E1225} 会压掉它们（设计里这些块要么是按钮，
   要么把墨色写在子元素上）。基规则与 :hover 各自写回自己的字色。 */
[data-orbit-real-page="iorbit-0918"] .ir-card-link:hover { color: #4B4FC7; }
/* ── 今日日程（设计 84–107）── */
[data-orbit-real-page="iorbit-0918"] .ir-brief { padding: 16px 18px; border-radius: 14px; background: #ECEEFB; display: flex; flex-direction: column; gap: 10px; }
[data-orbit-real-page="iorbit-0918"] .ir-brief-head { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 500; color: #2E3270; }
[data-orbit-real-page="iorbit-0918"] .ir-brief-icon { color: #4B4FC7; }
[data-orbit-real-page="iorbit-0918"] .ir-brief-line { font-size: 13px; line-height: 1.7; color: #3B3F7A; }
[data-orbit-real-page="iorbit-0918"] .ir-agenda { display: flex; flex-direction: column; gap: 2px; }
[data-orbit-real-page="iorbit-0918"] .ir-agenda-row { display: grid; grid-template-columns: 96px 14px minmax(0, 1fr); gap: 14px; align-items: flex-start; padding: 12px 0; }
[data-orbit-real-page="iorbit-0918"] .ir-agenda-div { border-top: 1px solid #F1F1FA; }
[data-orbit-real-page="iorbit-0918"] .ir-agenda-time { font-size: 13px; color: #6B6F99; padding-top: 2px; }
[data-orbit-real-page="iorbit-0918"] .ir-agenda-dot { display: block; width: 10px; height: 10px; margin-top: 6px; border-radius: 50%; }
[data-orbit-real-page="iorbit-0918"] .ir-tone-a { background: #4B4FC7; }
[data-orbit-real-page="iorbit-0918"] .ir-tone-b { background: #9FA3C4; }
[data-orbit-real-page="iorbit-0918"] .ir-tone-c { background: #2E3270; }
[data-orbit-real-page="iorbit-0918"] .ir-agenda-copy { display: flex; flex-direction: column; gap: 4px; }
[data-orbit-real-page="iorbit-0918"] .ir-agenda-title { font-size: 15px; font-weight: 500; }
[data-orbit-real-page="iorbit-0918"] .ir-agenda-meta { font-size: 13px; color: #6B6F99; }
/* ── 日历（设计 112–144）── */
[data-orbit-real-page="iorbit-0918"] .ir-cal-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 250px), 1fr)); gap: 18px; align-items: start; }
[data-orbit-real-page="iorbit-0918"] .ir-cal-left { display: flex; flex-direction: column; gap: 12px; }
[data-orbit-real-page="iorbit-0918"] .ir-cal-bar { display: flex; align-items: center; justify-content: space-between; }
[data-orbit-real-page="iorbit-0918"] .ir-cal-month { font-size: 16px; font-weight: 500; }
[data-orbit-real-page="iorbit-0918"] .ir-cal-nav { display: flex; gap: 6px; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-cal-nav-btn { width: 28px; height: 28px; border: 1px solid #E8E9F6; border-radius: 8px; background: #FFFFFF; color: #6B6F99; cursor: pointer;
  /* 设计 117/118 的 button 没写 font-size，浏览器默认 13.3333px；.btn 基类会压成 15px。 */
  padding: 0; font-size: 13.3333px; font-weight: 400; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-cal-nav-btn:hover { border-color: #B9BCEB; color: #2E3270; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-cal-nav-btn:active { transform: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-cal-nav-btn[aria-disabled="true"] { cursor: default; opacity: 0.6; }
[data-orbit-real-page="iorbit-0918"] .ir-cal-wd { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; text-align: center; font-size: 12px; color: #9FA3C4; }
[data-orbit-real-page="iorbit-0918"] .ir-cal-days { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
[data-orbit-real-page="iorbit-0918"] .ir-day-blank { position: relative; height: 34px; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-day { position: relative; height: 34px; border: 0; border-radius: 50%; background: transparent; color: #0E1225; font-size: 13px; font-weight: 400; cursor: pointer;
  padding: 0; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-day:active { transform: none; }
/* 设计 126 的 font-weight:{{ d.weight }} 是动态值：用修饰类，不内联（「审阅修订」21） */
[data-orbit-real-page="iorbit-0918"] .btn.ir-day-on { background: #4B4FC7; color: #FFFFFF; font-weight: 700; }
[data-orbit-real-page="iorbit-0918"] .ir-day-dot { position: absolute; left: 50%; bottom: 1px; transform: translateX(-50%); width: 4px; height: 4px; border-radius: 50%; background: transparent; }
[data-orbit-real-page="iorbit-0918"] .ir-day-dot-a { background: #4B4FC7; }
[data-orbit-real-page="iorbit-0918"] .ir-day-dot-b { background: #B9BCEB; }
[data-orbit-real-page="iorbit-0918"] .ir-day-panel { border-radius: 14px; background: #F7F7FD; padding: 16px; display: flex; flex-direction: column; gap: 14px; }
[data-orbit-real-page="iorbit-0918"] .ir-day-panel-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
[data-orbit-real-page="iorbit-0918"] .ir-day-panel-title { font-size: 15px; font-weight: 500; }
[data-orbit-real-page="iorbit-0918"] .ir-day-panel-count { font-size: 12px; color: #6B6F99; }
[data-orbit-real-page="iorbit-0918"] .ir-day-item { display: flex; gap: 10px; }
[data-orbit-real-page="iorbit-0918"] .ir-day-item-dot { width: 8px; height: 8px; margin-top: 5px; border-radius: 50%; flex: none; }
[data-orbit-real-page="iorbit-0918"] .ir-day-item-copy { display: flex; flex-direction: column; gap: 2px; }
[data-orbit-real-page="iorbit-0918"] .ir-day-item-meta { font-size: 12px; color: #6B6F99; }
[data-orbit-real-page="iorbit-0918"] .ir-day-item-title { font-size: 14px; font-weight: 500; }
/* ── 已报名活动（设计 152–169）── */
[data-orbit-real-page="iorbit-0918"] .ir-event { display: flex; align-items: center; gap: 16px; padding: 12px; border-radius: 14px; background: #FFFFFF; color: #0E1225; }
[data-orbit-real-page="iorbit-0918"] .ir-event:hover { background: #F7F7FD; color: inherit; }
[data-orbit-real-page="iorbit-0918"] .ir-event-date { width: 76px; height: 66px; flex: none; border-radius: 12px; color: #2E3270; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.1; }
[data-orbit-real-page="iorbit-0918"] .ir-bg-a { background: #DDDEFA; }
[data-orbit-real-page="iorbit-0918"] .ir-bg-b { background: #ECEEFB; }
[data-orbit-real-page="iorbit-0918"] .ir-event-month { font-size: 12px; }
[data-orbit-real-page="iorbit-0918"] .ir-event-day { font-size: 22px; font-family: 'Noto Serif SC', serif; font-weight: 900; }
[data-orbit-real-page="iorbit-0918"] .ir-event-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
[data-orbit-real-page="iorbit-0918"] .ir-event-title { font-size: 15px; font-weight: 500; color: #0E1225; }
[data-orbit-real-page="iorbit-0918"] .ir-event-meta { font-size: 13px; color: #6B6F99; }
[data-orbit-real-page="iorbit-0918"] .ir-event-chip { padding: 6px 12px; border-radius: 999px; background: #E6F1EC; color: #2F6B4F; font-size: 12px; }
/* ── 建议与行动（设计 176–192）── */
[data-orbit-real-page="iorbit-0918"] .ir-signal { display: flex; flex-direction: column; gap: 6px; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-action { display: flex; align-items: center; gap: 14px; padding: 14px; border: 1px solid #E8E9F6; border-radius: 14px; background: #FFFFFF; text-align: left; cursor: pointer;
  height: auto; justify-content: flex-start; font-size: 15px; font-weight: 400; white-space: normal; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-action:hover { border-color: #B9BCEB; background: #F7F7FD; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-action:active { transform: none; }
[data-orbit-real-page="iorbit-0918"] .ir-action-icon { width: 34px; height: 34px; flex: none; border-radius: 10px; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; }
[data-orbit-real-page="iorbit-0918"] .ir-action-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
[data-orbit-real-page="iorbit-0918"] .ir-action-title { font-size: 15px; font-weight: 500; }
[data-orbit-real-page="iorbit-0918"] .ir-action-desc { font-size: 13px; color: #6B6F99; }
/* 设计没有画 done / snooze / 刷新，既有写操作必须保留（「审阅修订」10）：沿用 chip 口径 */
[data-orbit-real-page="iorbit-0918"] .ir-signal-ops { display: flex; gap: 8px; padding-left: 48px; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-signal-op, [data-orbit-real-page="iorbit-0918"] .btn.ir-refresh { padding: 5px 12px; border: 1px solid #E8E9F6; border-radius: 999px; background: #FFFFFF; color: #6B6F99; font-size: 12px; cursor: pointer;
  height: auto; font-weight: 400; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-signal-op:hover, [data-orbit-real-page="iorbit-0918"] .btn.ir-refresh:hover { border-color: #B9BCEB; color: #2E3270; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-signal-op:active, [data-orbit-real-page="iorbit-0918"] .btn.ir-refresh:active { transform: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-refresh { align-self: flex-start; }
/* ── 联系人机会（设计 199–211）── */
[data-orbit-real-page="iorbit-0918"] .ir-person { display: flex; align-items: center; gap: 14px; padding: 12px; border-radius: 14px; color: #0E1225; }
[data-orbit-real-page="iorbit-0918"] .ir-person:hover { background: #F7F7FD; color: inherit; }
[data-orbit-real-page="iorbit-0918"] .ir-person-avatar { width: 44px; height: 44px; flex: none; border-radius: 50%; color: #2E3270; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; }
[data-orbit-real-page="iorbit-0918"] .ir-person-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
[data-orbit-real-page="iorbit-0918"] .ir-person-name-row { display: flex; align-items: baseline; gap: 10px; }
[data-orbit-real-page="iorbit-0918"] .ir-person-name { font-size: 15px; font-weight: 500; color: #0E1225; }
[data-orbit-real-page="iorbit-0918"] .ir-person-meta { font-size: 13px; color: #6B6F99; }
/* ── 本周推进（设计 218–234）── */
[data-orbit-real-page="iorbit-0918"] .ir-goal { padding: 16px 18px; border-radius: 14px; background: #ECEEFB; display: flex; flex-wrap: wrap; gap: 14px; align-items: center; }
[data-orbit-real-page="iorbit-0918"] .ir-goal-copy { flex: 1; min-width: 200px; display: flex; flex-direction: column; gap: 5px; }
[data-orbit-real-page="iorbit-0918"] .ir-goal-title { font-size: 14px; color: #2E3270; }
[data-orbit-real-page="iorbit-0918"] .ir-goal-text { font-size: 13px; color: #3B3F7A; }
[data-orbit-real-page="iorbit-0918"] .ir-progress { display: flex; flex-direction: column; gap: 8px; min-width: 140px; }
[data-orbit-real-page="iorbit-0918"] .ir-progress-row { display: flex; justify-content: space-between; font-size: 12px; color: #3B3F7A; }
[data-orbit-real-page="iorbit-0918"] .ir-progress-value { font-weight: 500; }
[data-orbit-real-page="iorbit-0918"] .ir-progress-track { display: block; height: 6px; border-radius: 999px; background: #FFFFFF; }
[data-orbit-real-page="iorbit-0918"] .ir-progress-fill { display: block; height: 6px; border-radius: 999px; background: #4B4FC7; transition: width .3s ease; }
[data-orbit-real-page="iorbit-0918"] .ir-tasks { display: flex; flex-direction: column; gap: 10px; }
[data-orbit-real-page="iorbit-0918"] .ir-task { display: flex; align-items: center; gap: 12px; padding: 4px 0; text-align: left; }
[data-orbit-real-page="iorbit-0918"] .ir-task-box { width: 20px; height: 20px; flex: none; border: 1px solid #DDDEFA; border-radius: 6px; background: #FFFFFF; color: #FFFFFF; display: flex; align-items: center; justify-content: center; font-size: 12px; }
[data-orbit-real-page="iorbit-0918"] .ir-task-box-done { border-color: #4B4FC7; background: #4B4FC7; }
[data-orbit-real-page="iorbit-0918"] .ir-task-text { font-size: 14px; color: #0E1225; text-decoration: none; }
[data-orbit-real-page="iorbit-0918"] .ir-task-text-done { color: #9FA3C4; text-decoration: line-through; }
/* ── 继续对话（设计 239–251）── */
[data-orbit-real-page="iorbit-0918"] .ir-resume-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
[data-orbit-real-page="iorbit-0918"] .ir-resume-title { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
[data-orbit-real-page="iorbit-0918"] .ir-resume-note { font-size: 13px; color: #6B6F99; }
[data-orbit-real-page="iorbit-0918"] .ir-resume-actions { display: flex; gap: 10px; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-history-btn { display: flex; align-items: center; gap: 8px; padding: 9px 16px; border: 1px solid #DDDEFA; border-radius: 999px; background: #FFFFFF; color: #3B3F7A; font-size: 13px; cursor: pointer;
  height: auto; font-weight: 400; justify-content: center; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-history-btn:hover { border-color: #B9BCEB; color: #2E3270; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-history-btn:active { transform: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-enter-btn { padding: 9px 16px; border: 1px solid #B9BCEB; border-radius: 999px; background: #ECEEFB; color: #2E3270; font-size: 13px; cursor: pointer;
  height: auto; font-weight: 400; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-enter-btn:hover { background: #DDDEFA; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-enter-btn:active { transform: none; }
[data-orbit-real-page="iorbit-0918"] .ir-resume-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 12px; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-resume-card { display: flex; align-items: center; gap: 12px; padding: 14px; border: 1px solid #E8E9F6; border-radius: 14px; background: #FFFFFF; text-align: left; cursor: pointer;
  height: auto; justify-content: flex-start; font-size: 15px; font-weight: 400; white-space: normal; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-resume-card:hover { border-color: #B9BCEB; background: #F7F7FD; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-resume-card:active { transform: none; }
[data-orbit-real-page="iorbit-0918"] .ir-resume-icon { width: 32px; height: 32px; flex: none; border-radius: 10px; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; font-size: 13px; }
[data-orbit-real-page="iorbit-0918"] .ir-resume-copy { flex: 1; display: flex; flex-direction: column; gap: 3px; }
[data-orbit-real-page="iorbit-0918"] .ir-resume-card-title { font-size: 14px; font-weight: 500; }
[data-orbit-real-page="iorbit-0918"] .ir-resume-card-meta { font-size: 12px; color: #9FA3C4; }
/* ══ 对话屏（设计 256–319）══════════════════════════════════════════════ */
[data-orbit-real-page="iorbit-0918"] .ir-chat { display: flex; flex-direction: column; gap: 22px; animation: orbit-fade .3s ease; }
/* ── 面包屑（设计 258）── */
[data-orbit-real-page="iorbit-0918"] .ir-crumb { font-size: 13px; color: #9FA3C4; }
[data-orbit-real-page="iorbit-0918"] .ir-crumb-link { color: #6B6F99; }
[data-orbit-real-page="iorbit-0918"] .ir-crumb-link:hover { color: #6B6F99; }
/* ── 标题行 + 两枚按钮（设计 259–267）── */
[data-orbit-real-page="iorbit-0918"] .ir-chat-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 16px; }
[data-orbit-real-page="iorbit-0918"] .ir-chat-head-copy { display: flex; flex-direction: column; gap: 8px; }
[data-orbit-real-page="iorbit-0918"] .ir-chat-h1 { margin: 0; font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: clamp(30px, 3.4vw, 40px); letter-spacing: -0.03em; }
[data-orbit-real-page="iorbit-0918"] .ir-chat-sub { margin: 0; font-size: 15px; color: #3B3F7A; }
[data-orbit-real-page="iorbit-0918"] .ir-chat-actions { display: flex; gap: 10px; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-back-btn { display: flex; align-items: center; gap: 8px; padding: 11px 18px; border: 1px solid #DDDEFA; border-radius: 12px; background: #FFFFFF; color: #3B3F7A; font-size: 14px; cursor: pointer;
  height: auto; font-weight: 400; justify-content: center; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-back-btn:hover { border-color: #B9BCEB; color: #2E3270; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-back-btn:active { transform: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-chat-history-btn { display: flex; align-items: center; gap: 8px; padding: 11px 18px; border: 1px solid #B9BCEB; border-radius: 12px; background: #ECEEFB; color: #2E3270; font-size: 14px; cursor: pointer;
  height: auto; font-weight: 400; justify-content: center; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-chat-history-btn:hover { background: #DDDEFA; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-chat-history-btn:active { transform: none; }
/* ── 两列栅格与线程卡（设计 269–270）；右列 aside（321–343）是任务 4 ── */
[data-orbit-real-page="iorbit-0918"] .ir-chat-grid { display: grid; grid-template-columns: minmax(0, 2.2fr) minmax(280px, 1fr); gap: 22px; align-items: start; }
[data-orbit-real-page="iorbit-0918"] .ir-thread { border: 1px solid #E8E9F6; border-radius: 20px; background: #FFFFFF; padding: 24px; display: flex; flex-direction: column; gap: 20px; }
/* ── 日期分隔（设计 271）── */
[data-orbit-real-page="iorbit-0918"] .ir-day-sep { align-self: center; padding: 6px 16px; border-radius: 999px; background: #F7F7FD; font-size: 12px; color: #6B6F99; }
/* ── 用户回合（设计 272–275）── */
[data-orbit-real-page="iorbit-0918"] .ir-user-row { display: flex; justify-content: flex-end; align-items: flex-start; gap: 12px; }
[data-orbit-real-page="iorbit-0918"] .ir-user-bubble { padding: 12px 16px; border-radius: 14px; background: #ECEEFB; font-size: 14px; color: #2E3270; }
[data-orbit-real-page="iorbit-0918"] .ir-user-avatar { width: 32px; height: 32px; flex: none; border-radius: 50%; background: #DDDEFA; color: #2E3270; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; }
/* ── 助手回合（设计 276–297）；时间戳与 ♡ / ⌄ 无来源，省略 ── */
[data-orbit-real-page="iorbit-0918"] .ir-a-row { display: flex; gap: 12px; align-items: flex-start; }
[data-orbit-real-page="iorbit-0918"] .ir-a-avatar { width: 32px; height: 32px; flex: none; border-radius: 50%; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; }
[data-orbit-real-page="iorbit-0918"] .ir-a-col { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 12px; }
[data-orbit-real-page="iorbit-0918"] .ir-a-name-row { display: flex; align-items: baseline; gap: 10px; }
[data-orbit-real-page="iorbit-0918"] .ir-a-name { font-size: 14px; }
/* 设计 280 的气泡 + 281 的正文字号/颜色（正文由 AgentMarkdown 渲染，样式落在容器上） */
[data-orbit-real-page="iorbit-0918"] .ir-a-body { padding: 18px; border-radius: 16px; background: #F7F7FD; display: flex; flex-direction: column; gap: 14px; font-size: 14px; color: #3B3F7A; }
[data-orbit-real-page="iorbit-0918"] .ir-a-note { font-size: 13px; color: #6B6F99; }
[data-orbit-real-page="iorbit-0918"] .ir-a-tools { display: flex; gap: 14px; color: #9FA3C4; font-size: 14px; }
/* 设计没有重试按钮（既有能力，「审阅修订」8）：沿用追问 chip 的形 */
[data-orbit-real-page="iorbit-0918"] .btn.ir-retry { align-self: flex-start; padding: 7px 14px; border: 1px solid #B9BCEB; border-radius: 999px; background: #FFFFFF; color: #2E3270; font-size: 13px; cursor: pointer;
  height: auto; font-weight: 400; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-retry:hover { background: #ECEEFB; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-retry:active { transform: none; }
/* ── 追问 chips（设计 299–304）：同一个类既给链接也给按钮元素，写两条规则 ── */
[data-orbit-real-page="iorbit-0918"] .ir-followups { display: flex; flex-wrap: wrap; gap: 10px; justify-content: flex-end; }
[data-orbit-real-page="iorbit-0918"] .ir-followup { padding: 9px 16px; border: 1px solid #B9BCEB; border-radius: 999px; background: #FFFFFF; color: #2E3270; font-size: 13px; cursor: pointer; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-followup { padding: 9px 16px; border: 1px solid #B9BCEB; border-radius: 999px; background: #FFFFFF; color: #2E3270; font-size: 13px;
  height: auto; font-weight: 400; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="iorbit-0918"] .ir-followup:hover, [data-orbit-real-page="iorbit-0918"] .btn.ir-followup:hover { background: #ECEEFB; color: #2E3270; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-followup:active { transform: none; }
/* ── 输入区（设计 305–309）── */
[data-orbit-real-page="iorbit-0918"] .ir-composer { display: flex; align-items: center; gap: 12px; padding: 10px 12px 10px 14px; border: 1px solid #DDDEFA; border-radius: 16px; background: #F7F7FD; }
[data-orbit-real-page="iorbit-0918"] .ir-composer-plus { width: 32px; height: 32px; flex: none; border-radius: 10px; background: #FFFFFF; color: #4B4FC7; display: flex; align-items: center; justify-content: center; font-size: 16px; }
[data-orbit-real-page="iorbit-0918"] .ir-composer-input { flex: 1; min-width: 0; border: 0; border-radius: 0; outline: none; background: transparent; font-size: 14px; color: #0E1225;
  /* 设计 input 保留 Chrome 默认 padding 1px 2px；基类 reset 清成 0，这里补回 */
  padding: 1px 2px; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-composer-send { width: 36px; height: 36px; border: 0; border-radius: 50%; background: #ECEEFB; color: #2E3270; font-size: 15px; cursor: pointer;
  padding: 0; font-weight: 400; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-composer-send:hover { background: #DDDEFA; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-composer-send:active { transform: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-composer-send:disabled { color: #9FA3C4; cursor: default; }
/* ── 试试这些问题（设计 310–314）── */
[data-orbit-real-page="iorbit-0918"] .ir-try { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; font-size: 12px; color: #6B6F99; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-try-chip { padding: 7px 14px; border: 1px solid #E8E9F6; border-radius: 999px; background: #FFFFFF; color: #3B3F7A; font-size: 12px; cursor: pointer;
  height: auto; font-weight: 400; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-try-chip:hover { border-color: #B9BCEB; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-try-chip:active { transform: none; }
/* ── 空态 / 加载提示（设计无此元素）── */
[data-orbit-real-page="iorbit-0918"] .ir-note { margin: 0; font-size: 13px; color: #6B6F99; }
[data-orbit-real-page="iorbit-0918"] .ir-note-error { color: #B5473A; }
/* ══ 对话屏右栏 aside（设计 321–343）══════════════════════════════════════ */
[data-orbit-real-page="iorbit-0918"] .ir-aside { display: flex; flex-direction: column; gap: 16px; }
[data-orbit-real-page="iorbit-0918"] .ir-aside-card { border: 1px solid #E8E9F6; border-radius: 18px; background: #FFFFFF; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
[data-orbit-real-page="iorbit-0918"] .ir-aside-card-16 { gap: 16px; }
[data-orbit-real-page="iorbit-0918"] .ir-aside-head { display: flex; align-items: center; gap: 10px; }
[data-orbit-real-page="iorbit-0918"] .ir-aside-icon { width: 28px; height: 28px; border-radius: 9px; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; font-size: 13px; }
[data-orbit-real-page="iorbit-0918"] .ir-aside-h { font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 17px; }
/* 设计 323–325：同一个形既给按钮元素（发消息）也给链接元素（导航），写两条规则 */
[data-orbit-real-page="iorbit-0918"] .ir-aside-next { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 13px 14px; border: 1px solid #E8E9F6; border-radius: 12px; background: #FFFFFF; font-size: 14px; color: #0E1225; text-align: left; cursor: pointer; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-aside-next { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 13px 14px; border: 1px solid #E8E9F6; border-radius: 12px; background: #FFFFFF; font-size: 14px; color: #0E1225; text-align: left;
  height: auto; font-weight: 400; white-space: normal; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="iorbit-0918"] .ir-aside-next:hover, [data-orbit-real-page="iorbit-0918"] .btn.ir-aside-next:hover { border-color: #B9BCEB; background: #F7F7FD; }
/* 中和作用域内的 a:hover（设计的 style-hover 不改字色），见计划「像素规则」 */
[data-orbit-real-page="iorbit-0918"] a.ir-aside-next:hover { color: #0E1225; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-aside-next:active { transform: none; }
[data-orbit-real-page="iorbit-0918"] .ir-aside-context-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
[data-orbit-real-page="iorbit-0918"] .ir-aside-context-copy { display: flex; flex-direction: column; gap: 4px; }
[data-orbit-real-page="iorbit-0918"] .ir-aside-context-note { font-size: 12px; color: #6B6F99; }
[data-orbit-real-page="iorbit-0918"] .ir-aside-edit { font-size: 13px; color: #4B4FC7; }
/* 同上：设计 334 的「编辑」没有 hover 态，中和作用域内的 a:hover */
[data-orbit-real-page="iorbit-0918"] a.ir-aside-edit:hover { color: #4B4FC7; }
[data-orbit-real-page="iorbit-0918"] .ir-aside-group { display: flex; flex-direction: column; gap: 10px; }
[data-orbit-real-page="iorbit-0918"] .ir-aside-group-div { padding-top: 14px; border-top: 1px solid #E8E9F6; }
[data-orbit-real-page="iorbit-0918"] .ir-aside-label { font-size: 13px; color: #3B3F7A; }
[data-orbit-real-page="iorbit-0918"] .ir-aside-tags { display: flex; flex-wrap: wrap; gap: 8px; }
[data-orbit-real-page="iorbit-0918"] .ir-aside-tag { padding: 6px 12px; border-radius: 999px; background: #F7F7FD; color: #3B3F7A; font-size: 12px; }
[data-orbit-real-page="iorbit-0918"] .ir-aside-tag-on { background: #ECEEFB; color: #2E3270; }
/* 设计无空态（它的三段都是 mock chip）：无资料时用一行说明，不造 chip */
[data-orbit-real-page="iorbit-0918"] .ir-aside-empty { font-size: 13px; color: #6B6F99; }
/* ══ 历史记录抽屉（设计 786–804）══════════════════════════════════════════ */
/* 788：z-index 取语义常量 ORBIT_Z.modal（内联），其余逐字 */
[data-orbit-real-page="iorbit-0918"] .ir-drawer-scrim { position: fixed; inset: 0; background: rgba(14,18,37,0.28); backdrop-filter: blur(4px); display: flex; justify-content: flex-end; }
[data-orbit-real-page="iorbit-0918"] .ir-drawer { width: min(400px, 92vw); height: 100%; overflow-y: auto; background: #FFFFFF; box-shadow: -20px 0 60px rgba(14,18,37,0.18); padding: 26px 24px; display: flex; flex-direction: column; gap: 18px; animation: orbit-fade .25s ease; }
[data-orbit-real-page="iorbit-0918"] .ir-drawer-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
[data-orbit-real-page="iorbit-0918"] .ir-drawer-head-copy { display: flex; flex-direction: column; gap: 6px; }
[data-orbit-real-page="iorbit-0918"] .ir-drawer-title-row { display: flex; align-items: center; gap: 10px; }
[data-orbit-real-page="iorbit-0918"] .ir-drawer-title-icon { color: #4B4FC7; }
[data-orbit-real-page="iorbit-0918"] .ir-drawer-title { font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 21px; letter-spacing: -0.02em; }
[data-orbit-real-page="iorbit-0918"] .ir-drawer-sub { font-size: 13px; color: #6B6F99; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-drawer-close { width: 34px; height: 34px; border: 0; border-radius: 50%; background: #F7F7FD; color: #3B3F7A; font-size: 16px; cursor: pointer;
  /* 中和 .btn 基类；**不写 height:auto**——设计 791 的 34px 圆钮靠上面那条 height 成立 */
  padding: 0; font-weight: 400; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-drawer-close:hover { background: #ECEEFB; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-drawer-close:active { transform: none; }
/* 设计没有这一段（能力保全决定）：新对话 + 分组筛选条 */
[data-orbit-real-page="iorbit-0918"] .ir-drawer-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-drawer-new { padding: 9px 16px; border: 1px solid #B9BCEB; border-radius: 999px; background: #ECEEFB; color: #2E3270; font-size: 13px; cursor: pointer;
  height: auto; font-weight: 400; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-drawer-new:hover { background: #DDDEFA; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-drawer-new:active { transform: none; }
[data-orbit-real-page="iorbit-0918"] .ir-drawer-eyebrow { font-size: 12px; color: #9FA3C4; }
/* 795：设计的行本身就是个按钮；三点菜单不能嵌在按钮里，所以外层是带边框的行，
   内层按钮承载 padding 与内容，几何与设计一致 */
/* 任务 6a：role="list" 的包裹层只提供语义，布局仍由抽屉面板的 flex 列给出，
   因此 display:contents（不改任何几何，history 像素基线不动）。 */
[data-orbit-real-page="iorbit-0918"] .ir-hist-list { display: contents; }
[data-orbit-real-page="iorbit-0918"] .ir-hist-row { position: relative; display: flex; align-items: center; border: 1px solid #E8E9F6; border-radius: 12px; background: #FFFFFF; }
/* 905 的 h.bg：当前会话底色 */
[data-orbit-real-page="iorbit-0918"] .ir-hist-row-on { background: #F7F7FD; }
[data-orbit-real-page="iorbit-0918"] .ir-hist-row:hover { border-color: #B9BCEB; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-hist-open { flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; padding: 14px; border: 0; border-radius: 12px; background: transparent; text-align: left; cursor: pointer;
  height: auto; font-size: 14px; font-weight: 400; justify-content: flex-start; white-space: normal; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-hist-open:active { transform: none; }
[data-orbit-real-page="iorbit-0918"] .ir-hist-icon { width: 30px; height: 30px; flex: none; border-radius: 9px; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; font-size: 13px; }
[data-orbit-real-page="iorbit-0918"] .ir-hist-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
[data-orbit-real-page="iorbit-0918"] .ir-hist-title { font-size: 14px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
[data-orbit-real-page="iorbit-0918"] .ir-hist-date { font-size: 12px; color: #9FA3C4; }
/* 设计没有三点菜单钮：静置时透明（不改设计像素），hover / 键盘聚焦 / 菜单展开时显形 */
[data-orbit-real-page="iorbit-0918"] .btn.ir-hist-more { position: absolute; right: 10px; top: 50%; width: 28px; height: 28px; border: 0; border-radius: 8px; background: transparent; color: #6B6F99; font-size: 13px; cursor: pointer; opacity: 0; transform: translateY(-50%);
  padding: 0; font-weight: 400; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="iorbit-0918"] .ir-hist-row:hover .btn.ir-hist-more, [data-orbit-real-page="iorbit-0918"] .btn.ir-hist-more:focus, [data-orbit-real-page="iorbit-0918"] .btn.ir-hist-more[aria-expanded="true"] { opacity: 1; background: #FFFFFF; }
/* .btn:active 的 translateY 会打断上面的定位，这里还原成同一个 transform */
[data-orbit-real-page="iorbit-0918"] .btn.ir-hist-more:active { transform: translateY(-50%); }
[data-orbit-real-page="iorbit-0918"] .ir-hist-menu { position: absolute; right: 10px; top: 44px; min-width: 168px; padding: 6px; border: 1px solid #E8E9F6; border-radius: 12px; background: #FFFFFF; box-shadow: 0 12px 30px rgba(14,18,37,0.12); display: flex; flex-direction: column; gap: 2px; }
[data-orbit-real-page="iorbit-0918"] .ir-hist-menu-label { padding: 6px 10px 2px; font-size: 12px; color: #9FA3C4; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-hist-menu-item { width: 100%; padding: 8px 10px; border: 0; border-radius: 8px; background: transparent; color: #0E1225; font-size: 13px; cursor: pointer;
  height: auto; font-weight: 400; display: flex; align-items: center; justify-content: flex-start; gap: 0; white-space: nowrap; text-align: left; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-hist-menu-item:hover { background: #F7F7FD; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-hist-menu-item:active { transform: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-hist-menu-item:disabled { color: #9FA3C4; cursor: default; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-hist-menu-danger { color: #B5473A; }
[data-orbit-real-page="iorbit-0918"] .ir-hist-rename { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; padding: 10px 12px; }
[data-orbit-real-page="iorbit-0918"] .ir-hist-rename-input { flex: 1; min-width: 0; border: 1px solid #B9BCEB; border-radius: 8px; outline: none; background: #FFFFFF; font-size: 13px; color: #0E1225; padding: 6px 8px; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-hist-rename-ok, [data-orbit-real-page="iorbit-0918"] .btn.ir-hist-rename-cancel { padding: 6px 10px; border: 1px solid #E8E9F6; border-radius: 8px; background: #FFFFFF; color: #3B3F7A; font-size: 12px; cursor: pointer;
  height: auto; font-weight: 400; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-hist-rename-ok:hover, [data-orbit-real-page="iorbit-0918"] .btn.ir-hist-rename-cancel:hover { border-color: #B9BCEB; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-hist-rename-ok:active, [data-orbit-real-page="iorbit-0918"] .btn.ir-hist-rename-cancel:active { transform: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-hist-rename-ok:disabled { color: #9FA3C4; cursor: default; }
[data-orbit-real-page="iorbit-0918"] .ir-drawer-empty { font-size: 13px; color: #6B6F99; }
/* 803 */
[data-orbit-real-page="iorbit-0918"] .btn.ir-drawer-more { align-self: center; padding: 10px 16px; border: 0; background: transparent; color: #4B4FC7; font-size: 13px; cursor: pointer;
  height: auto; font-weight: 400; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; text-align: center; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-drawer-more:active { transform: none; }
/* ══════════════════════════════════════════════════════════════════════
   任务 5：建议与行动（349–426）/ 执行计划（429–501）/ 工作策略（503–660）/
   联系人建议（663–782）。每条规则 = 设计稿一个 style="" 原样搬入。
   ══════════════════════════════════════════════════════════════════════ */
/* ── 三屏共用的外壳（350/430/504/664 的 gap:22px） ── */
[data-orbit-real-page="iorbit-0918"] .ir-screen { display: flex; flex-direction: column; gap: 22px; animation: orbit-fade .3s ease; }
/* 351 / 431 / 505 / 665 */
/* 351 / 431 / 505 / 665：.ir-crumb 在上面的对话屏段（198 行）已声明，这里只补链接色 */
[data-orbit-real-page="iorbit-0918"] .ir-crumb a { color: #6B6F99; }
/* 353 / 434 / 507 */
[data-orbit-real-page="iorbit-0918"] .ir-title-col { display: flex; flex-direction: column; gap: 14px; }
[data-orbit-real-page="iorbit-0918"] .ir-title-col-8 { display: flex; flex-direction: column; gap: 8px; }
[data-orbit-real-page="iorbit-0918"] .ir-title-row { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 20px; }
/* 354 / 433：设计画的是按钮；这里是路由跳转，落成链接 */
[data-orbit-real-page="iorbit-0918"] .ir-back { display: flex; align-items: center; gap: 8px; padding: 10px 18px; border: 1px solid #DDDEFA; border-radius: 12px; background: #FFFFFF; color: #3B3F7A; font-size: 14px; }
[data-orbit-real-page="iorbit-0918"] .ir-title-col > .ir-back { align-self: flex-start; }
[data-orbit-real-page="iorbit-0918"] .ir-back:hover { border-color: #B9BCEB; color: #2E3270; }
/* 355 / 436 / 508 / 668 */
[data-orbit-real-page="iorbit-0918"] .ir-h1-sub { margin: 0; font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: clamp(30px, 3.4vw, 40px); letter-spacing: -0.03em; }
[data-orbit-real-page="iorbit-0918"] .ir-lede { margin: 0; font-size: 15px; color: #3B3F7A; }
/* 358 / 440 */
[data-orbit-real-page="iorbit-0918"] .ir-two-col { display: grid; grid-template-columns: minmax(0, 2.4fr) minmax(260px, 1fr); gap: 22px; align-items: start; }
[data-orbit-real-page="iorbit-0918"] .ir-col-main { display: flex; flex-direction: column; gap: 18px; }
/* .ir-aside / .ir-aside-icon / .ir-aside-h 在上面的对话屏右栏段已声明，本段只加修饰类 */
[data-orbit-real-page="iorbit-0918"] .ir-aside-12 { gap: 12px; }
/* 442 / 457 / 533 / 686：白卡 */
[data-orbit-real-page="iorbit-0918"] .ir-panel { border: 1px solid #E8E9F6; border-radius: 18px; background: #FFFFFF; padding: 22px 24px; display: flex; flex-direction: column; gap: 16px; }
[data-orbit-real-page="iorbit-0918"] .ir-panel-12 { gap: 12px; }
[data-orbit-real-page="iorbit-0918"] .ir-panel-14 { gap: 14px; }
[data-orbit-real-page="iorbit-0918"] .ir-panel-16 { gap: 16px; }
[data-orbit-real-page="iorbit-0918"] .ir-panel-18 { gap: 18px; }
/* 406 / 485 / 494：aside 里的白卡是 padding:22px（不是 22px 24px） */
[data-orbit-real-page="iorbit-0918"] .ir-aside .ir-panel { padding: 22px; }
[data-orbit-real-page="iorbit-0918"] .ir-panel-h { font-size: 15px; font-weight: 500; }
[data-orbit-real-page="iorbit-0918"] .ir-panel-note { font-size: 13px; line-height: 1.7; color: #6B6F99; }
/* 既有「等 W4」卡的处置沿用（strategy 屏 2026-09-19 已交付的形） */
[data-orbit-real-page="iorbit-0918"] .ir-waiting { border-style: dashed; }
[data-orbit-real-page="iorbit-0918"] .ir-waiting-badge { align-self: flex-start; padding: 3px 10px; border: 1px solid #E8E9F6; border-radius: 999px; background: #F7F7FD; color: #3B3F7A; font-size: 12px; }

/* ── 建议与行动 360–403 ── */
[data-orbit-real-page="iorbit-0918"] .ir-tier { border: 1px solid #E8E9F6; border-left: 3px solid #E8E9F6; border-radius: 18px; background: #FFFFFF; padding: 22px 24px; display: flex; flex-direction: column; gap: 14px; }
[data-orbit-real-page="iorbit-0918"] .ir-tier-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
[data-orbit-real-page="iorbit-0918"] .ir-tier-label { display: flex; align-items: center; gap: 10px; }
[data-orbit-real-page="iorbit-0918"] .ir-tier-icon { width: 30px; height: 30px; flex: none; border-radius: 9px; display: flex; align-items: center; justify-content: center; font-size: 14px; }
[data-orbit-real-page="iorbit-0918"] .ir-tint-accent { background: #ECEEFB; color: #4B4FC7; }
[data-orbit-real-page="iorbit-0918"] .ir-tier-h { font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 19px; }
[data-orbit-real-page="iorbit-0918"] .ir-tier-count { font-size: 13px; color: #6B6F99; }
/* 362–365 的行 */
[data-orbit-real-page="iorbit-0918"] .ir-row { display: flex; align-items: center; gap: 14px; padding: 16px; border: 1px solid #E8E9F6; border-radius: 14px; }
[data-orbit-real-page="iorbit-0918"] .ir-row-icon { width: 36px; height: 36px; flex: none; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
[data-orbit-real-page="iorbit-0918"] .ir-row-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
[data-orbit-real-page="iorbit-0918"] .ir-row-title { font-size: 15px; font-weight: 500; }
[data-orbit-real-page="iorbit-0918"] .ir-row-desc { font-size: 13px; color: #6B6F99; }
/* 设计每行只有一枚 CTA；写控件（确认 / 稍后 / 撤销 …）是设计外的能力保全 */
[data-orbit-real-page="iorbit-0918"] .ir-row-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 10px; }
/* 修订轮 1：被删旧屏的状态标签 / 证据 chips / preview（设计无槽位，记偏差） */
[data-orbit-real-page="iorbit-0918"] .ir-row-status { font-size: 12px; color: #9FA3C4; }
[data-orbit-real-page="iorbit-0918"] .ir-row-preview { margin-top: 4px; padding: 12px 14px; border-radius: 10px; background: #F7F7FD; font-size: 13px; line-height: 1.7; color: #3B3F7A; white-space: pre-line; }
[data-orbit-real-page="iorbit-0918"] .ir-row-open { align-items: flex-start; }
[data-orbit-real-page="iorbit-0918"] .ir-row-cta { padding: 9px 14px; border: 1px solid #B9BCEB; border-radius: 10px; background: #FFFFFF; color: #2E3270; font-size: 13px; white-space: nowrap; }
[data-orbit-real-page="iorbit-0918"] .ir-row-cta:hover { background: #ECEEFB; }
/* 406–419 aside */
[data-orbit-real-page="iorbit-0918"] .ir-aside-title { display: flex; align-items: center; gap: 10px; }
/* 407 的 28px 图标格同对话屏右栏，复用同一条规则 */
/* 407 的 serif 17px 卡头同上 */
[data-orbit-real-page="iorbit-0918"] .ir-stat-row { display: flex; align-items: center; justify-content: space-between; font-size: 14px; color: #3B3F7A; }
[data-orbit-real-page="iorbit-0918"] .ir-stat-label { display: flex; align-items: center; gap: 8px; }
[data-orbit-real-page="iorbit-0918"] .ir-stat-dot { width: 8px; height: 8px; border-radius: 50%; }
[data-orbit-real-page="iorbit-0918"] .ir-stat-value { font-size: 16px; color: #0E1225; }
/* 415–418 conic-gradient 进度环（百分比是真实账本计数，内联） */
[data-orbit-real-page="iorbit-0918"] .ir-ring-row { display: flex; align-items: center; gap: 16px; padding-top: 16px; border-top: 1px solid #E8E9F6; }
[data-orbit-real-page="iorbit-0918"] .ir-ring { width: 72px; height: 72px; flex: none; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
[data-orbit-real-page="iorbit-0918"] .ir-ring-hole { width: 54px; height: 54px; border-radius: 50%; background: #FFFFFF; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; color: #2E3270; }
[data-orbit-real-page="iorbit-0918"] .ir-ring-copy { display: flex; flex-direction: column; gap: 4px; }
[data-orbit-real-page="iorbit-0918"] .ir-ring-title { font-size: 15px; }
[data-orbit-real-page="iorbit-0918"] .ir-ring-sub { font-size: 13px; color: #6B6F99; }
[data-orbit-real-page="iorbit-0918"] .ir-ring-hint { font-size: 12px; color: #9FA3C4; }
/* 420–423 语录卡 */
[data-orbit-real-page="iorbit-0918"] .ir-quote { border-radius: 18px; background: #ECEEFB; padding: 20px; display: flex; align-items: flex-start; gap: 12px; }
[data-orbit-real-page="iorbit-0918"] .ir-quote-icon { color: #4B4FC7; }
[data-orbit-real-page="iorbit-0918"] .ir-quote-text { font-size: 14px; line-height: 1.7; color: #2E3270; }

/* ── 执行计划 443–497 ── */
[data-orbit-real-page="iorbit-0918"] .ir-sec-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 14px; }
/* 446 完成度条 */
[data-orbit-real-page="iorbit-0918"] .ir-progress-bar-row { display: flex; align-items: center; gap: 12px; font-size: 13px; color: #6B6F99; }
[data-orbit-real-page="iorbit-0918"] .ir-plan-progress-track { display: block; width: 140px; height: 6px; border-radius: 999px; background: #ECEEFB; }
[data-orbit-real-page="iorbit-0918"] .ir-plan-progress-fill { display: block; height: 6px; border-radius: 999px; background: #4B4FC7; transition: width .3s ease; }
[data-orbit-real-page="iorbit-0918"] .ir-progress-pct { color: #2E3270; font-weight: 500; }
/* 448–453 每行 */
/* 448：设计是 <div>；有落点的行落成链接（修订轮 1），因此要显式写回墨色——
   作用域的 a 规则（本文件 22–23 行）否则会把标题压成 #3B3F7A 并加一个设计没有的 hover。 */
[data-orbit-real-page="iorbit-0918"] .ir-task-row { display: flex; align-items: center; gap: 14px; padding: 16px; border: 1px solid #E8E9F6; border-radius: 14px; color: #0E1225; }
[data-orbit-real-page="iorbit-0918"] .ir-task-no { width: 26px; height: 26px; flex: none; border-radius: 8px; background: #F7F7FD; color: #6B6F99; display: flex; align-items: center; justify-content: center; font-size: 12px; }
/* 450 设计是 toggle 按钮；无行内写接口 → 静态标记（aria-disabled） */
[data-orbit-real-page="iorbit-0918"] .ir-task-mark { display: block; width: 22px; height: 22px; flex: none; border: 1px solid #DDDEFA; border-radius: 6px; background: #FFFFFF; }
[data-orbit-real-page="iorbit-0918"] .ir-task-due { font-size: 13px; color: #6B6F99; white-space: nowrap; }
/* 459–476 手风琴 */
[data-orbit-real-page="iorbit-0918"] .ir-week { border: 1px solid #E8E9F6; border-radius: 14px; overflow: hidden; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-week-head { width: 100%; display: flex; align-items: center; gap: 14px; padding: 16px; border: 0; text-align: left; cursor: pointer;
  height: auto; font-weight: 400; justify-content: flex-start; white-space: normal; letter-spacing: 0; line-height: normal; transition: none; }
[data-orbit-real-page="iorbit-0918"] .btn.ir-week-head:active { transform: none; }
[data-orbit-real-page="iorbit-0918"] .ir-week-no { width: 28px; height: 28px; flex: none; border-radius: 9px; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; }
[data-orbit-real-page="iorbit-0918"] .ir-week-title { font-size: 15px; font-weight: 500; white-space: nowrap; }
[data-orbit-real-page="iorbit-0918"] .ir-week-range { font-size: 13px; color: #6B6F99; white-space: nowrap; }
[data-orbit-real-page="iorbit-0918"] .ir-week-theme { flex: 1; min-width: 0; font-size: 13px; color: #3B3F7A; }
[data-orbit-real-page="iorbit-0918"] .ir-week-body { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr)); gap: 14px; padding: 16px; border-top: 1px solid #E8E9F6; }
[data-orbit-real-page="iorbit-0918"] .ir-week-card { border: 1px solid #E8E9F6; border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 8px; }
[data-orbit-real-page="iorbit-0918"] .ir-week-card-h { font-size: 13px; color: #4B4FC7; }
[data-orbit-real-page="iorbit-0918"] .ir-week-card-body { font-size: 13px; line-height: 1.8; color: #3B3F7A; white-space: pre-line; }
/* 479–482 */
[data-orbit-real-page="iorbit-0918"] .ir-cta-band { border: 1px solid #DDDEFA; border-radius: 18px; background: #ECEEFB; padding: 22px 24px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; }
[data-orbit-real-page="iorbit-0918"] .ir-cta-copy { display: flex; flex-direction: column; gap: 6px; min-width: 240px; }
[data-orbit-real-page="iorbit-0918"] .ir-cta-title { font-size: 16px; color: #2E3270; }
[data-orbit-real-page="iorbit-0918"] .ir-cta-desc { font-size: 13px; color: #3B3F7A; }
[data-orbit-real-page="iorbit-0918"] .ir-cta-btn { padding: 13px 22px; border: 0; border-radius: 12px; background: #2E3270; color: #FFFFFF; font-size: 14px; font-weight: 500; }
/* 486–492 */
[data-orbit-real-page="iorbit-0918"] .ir-stat-line { display: flex; align-items: center; justify-content: space-between; padding: 14px 0; border-top: 1px solid #F1F1FA; }
[data-orbit-real-page="iorbit-0918"] .ir-stat-line-label { font-size: 14px; color: #3B3F7A; }
[data-orbit-real-page="iorbit-0918"] .ir-stat-line-value { font-size: 18px; }
/* 495 */
[data-orbit-real-page="iorbit-0918"] .ir-aside-lines { display: flex; flex-direction: column; }
[data-orbit-real-page="iorbit-0918"] .ir-aside-line { font-size: 13px; line-height: 1.8; color: #6B6F99; }
/* 496 */
[data-orbit-real-page="iorbit-0918"] .ir-aside-btn { padding: 11px; border: 1px solid #DDDEFA; border-radius: 10px; background: #FFFFFF; color: #2E3270; font-size: 13px; text-align: center; }
[data-orbit-real-page="iorbit-0918"] .ir-aside-btn:hover { background: #F7F7FD; }

/* ── 工作策略 / 联系人建议 506–781 ── */
[data-orbit-real-page="iorbit-0918"] .ir-head-split { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 16px; }
[data-orbit-real-page="iorbit-0918"] .ir-head-actions { display: flex; gap: 10px; }
[data-orbit-real-page="iorbit-0918"] .ir-head-btn { display: flex; align-items: center; gap: 8px; padding: 11px 18px; border: 1px solid #DDDEFA; border-radius: 12px; background: #FFFFFF; color: #3B3F7A; font-size: 14px; }
[data-orbit-real-page="iorbit-0918"] .ir-head-btn:hover { border-color: #B9BCEB; color: #2E3270; }
[data-orbit-real-page="iorbit-0918"] .ir-head-btn-soft { border: 1px solid #B9BCEB; background: #ECEEFB; color: #2E3270; }
[data-orbit-real-page="iorbit-0918"] .ir-head-btn-soft:hover { background: #DDDEFA; color: #2E3270; }
/* 535–539 / 747 段头 */
[data-orbit-real-page="iorbit-0918"] .ir-num-head { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
[data-orbit-real-page="iorbit-0918"] .ir-num { width: 28px; height: 28px; flex: none; border-radius: 9px; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; }
[data-orbit-real-page="iorbit-0918"] .ir-sec-h { font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 18px; }
[data-orbit-real-page="iorbit-0918"] .ir-sec-hint { flex: 1; min-width: 180px; font-size: 13px; color: #6B6F99; }
[data-orbit-real-page="iorbit-0918"] .ir-sec-link { font-size: 13px; color: #4B4FC7; }
[data-orbit-real-page="iorbit-0918"] .ir-icon-head { display: flex; align-items: flex-start; gap: 12px; }
[data-orbit-real-page="iorbit-0918"] .ir-icon-head-copy { display: flex; flex-direction: column; gap: 5px; }
/* 541 / 688 */
[data-orbit-real-page="iorbit-0918"] .ir-cards-420 { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr)); gap: 14px; }
[data-orbit-real-page="iorbit-0918"] .ir-cards-280 { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 14px; }
/* 542–551 紧凑联系人卡（设计画的是按钮；这里是导航，落成链接） */
[data-orbit-real-page="iorbit-0918"] .ir-contact-compact { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr) 12px; gap: 16px; align-items: start; padding: 16px; border: 1px solid #E8E9F6; border-radius: 14px; background: #FFFFFF; text-align: left; color: #0E1225; }
[data-orbit-real-page="iorbit-0918"] .ir-contact-compact:hover { border-color: #B9BCEB; background: #F7F7FD; }
[data-orbit-real-page="iorbit-0918"] .ir-contact-id { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
[data-orbit-real-page="iorbit-0918"] .ir-contact-head { display: flex; align-items: center; gap: 12px; }
[data-orbit-real-page="iorbit-0918"] .ir-avatar-38 { width: 38px; height: 38px; flex: none; border-radius: 50%; background: #DDDEFA; color: #2E3270; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; }
[data-orbit-real-page="iorbit-0918"] .ir-contact-name-col { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
[data-orbit-real-page="iorbit-0918"] .ir-contact-name { font-size: 15px; font-weight: 500; }
[data-orbit-real-page="iorbit-0918"] .ir-contact-meta { font-size: 12px; color: #6B6F99; }
[data-orbit-real-page="iorbit-0918"] .ir-chips-inline { display: flex; flex-wrap: wrap; gap: 8px; }
[data-orbit-real-page="iorbit-0918"] .ir-pill-green { padding: 5px 10px; border-radius: 999px; background: #E6F1EC; color: #2F6B4F; font-size: 11px; }
[data-orbit-real-page="iorbit-0918"] .ir-pill-grey { padding: 5px 10px; border-radius: 999px; background: #F7F7FD; color: #6B6F99; font-size: 11px; }
[data-orbit-real-page="iorbit-0918"] .ir-pill-accent { padding: 5px 12px; border-radius: 999px; background: #ECEEFB; color: #2E3270; font-size: 11px; }
[data-orbit-real-page="iorbit-0918"] .ir-contact-why { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
[data-orbit-real-page="iorbit-0918"] .ir-contact-why-h { font-size: 13px; font-weight: 500; color: #2E3270; }
[data-orbit-real-page="iorbit-0918"] .ir-contact-why-body { font-size: 12px; line-height: 1.7; color: #6B6F99; white-space: pre-line; }
[data-orbit-real-page="iorbit-0918"] .ir-caret-mid { align-self: center; color: #9FA3C4; }
/* 623–637 / 771–780 活动行 */
[data-orbit-real-page="iorbit-0918"] .ir-event-list { display: flex; flex-direction: column; gap: 14px; }
[data-orbit-real-page="iorbit-0918"] .ir-event-row { display: flex; align-items: center; gap: 16px; padding: 16px; border: 1px solid #E8E9F6; border-radius: 14px; color: #0E1225; }
[data-orbit-real-page="iorbit-0918"] .ir-event-row:hover { border-color: #B9BCEB; background: #F7F7FD; }
/* 623 的 96px 封面占位块（无图来源，沿用设计自己的纯色块） */
[data-orbit-real-page="iorbit-0918"] .ir-event-cover { width: 96px; height: 80px; flex: none; border-radius: 12px; background: #DDDEFA; }
[data-orbit-real-page="iorbit-0918"] .ir-sec-event-date { width: 76px; flex: none; padding: 16px 0; border-radius: 12px; background: #DDDEFA; color: #2E3270; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.1; font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 18px; }
/* 690–712 完整联系人卡 */
[data-orbit-real-page="iorbit-0918"] .ir-contact-card { border: 1px solid #E8E9F6; border-radius: 14px; padding: 20px; display: flex; flex-direction: column; gap: 16px; }
[data-orbit-real-page="iorbit-0918"] .ir-contact-card-head { display: flex; align-items: flex-start; gap: 14px; }
[data-orbit-real-page="iorbit-0918"] .ir-avatar-52 { width: 52px; height: 52px; flex: none; border-radius: 50%; background: #DDDEFA; color: #2E3270; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 700; }
[data-orbit-real-page="iorbit-0918"] .ir-contact-name-lg { font-size: 17px; font-weight: 500; }
[data-orbit-real-page="iorbit-0918"] .ir-contact-grid { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 12px 14px; align-items: start; }
[data-orbit-real-page="iorbit-0918"] .ir-contact-key { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #3B3F7A; }
[data-orbit-real-page="iorbit-0918"] .ir-contact-key-icon { color: #4B4FC7; }
[data-orbit-real-page="iorbit-0918"] .ir-contact-val { font-size: 13px; line-height: 1.7; color: #6B6F99; }
/* 705 建议开场白：无来源 → 「等 W4」说明，底色仍按设计 */
[data-orbit-real-page="iorbit-0918"] .ir-contact-opener { padding: 12px 14px; border-radius: 10px; background: #F7F7FD; font-size: 13px; line-height: 1.7; color: #3B3F7A; }
[data-orbit-real-page="iorbit-0918"] .ir-contact-waiting { color: #9FA3C4; }
/* 708–711 */
[data-orbit-real-page="iorbit-0918"] .ir-contact-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
[data-orbit-real-page="iorbit-0918"] .ir-contact-action { padding: 11px; border: 1px solid #DDDEFA; border-radius: 10px; background: #FFFFFF; color: #3B3F7A; font-size: 13px; text-align: center; }
[data-orbit-real-page="iorbit-0918"] .ir-contact-action:hover { border-color: #B9BCEB; color: #2E3270; }
[data-orbit-real-page="iorbit-0918"] .ir-contact-action-primary { border: 0; background: #2E3270; color: #FFFFFF; font-weight: 500; }
/* 643–652 本周建议的三张导航卡（设计画的是按钮；这里是导航，落成链接） */
[data-orbit-real-page="iorbit-0918"] .ir-nav-card { display: grid; grid-template-columns: 36px minmax(0, 1fr) 12px; gap: 14px; align-items: center; padding: 16px; border: 1px solid #E8E9F6; border-radius: 14px; background: #FFFFFF; text-align: left; color: #0E1225; }
[data-orbit-real-page="iorbit-0918"] .ir-nav-card:hover { border-color: #B9BCEB; background: #F7F7FD; }
[data-orbit-real-page="iorbit-0918"] .ir-nav-icon { width: 36px; height: 36px; border-radius: 10px; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; }
[data-orbit-real-page="iorbit-0918"] .ir-nav-title { font-size: 14px; font-weight: 500; }
/* 656–658 */
[data-orbit-real-page="iorbit-0918"] .ir-pill-row { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; }
[data-orbit-real-page="iorbit-0918"] .ir-pill-btn { padding: 10px 18px; border: 1px solid #B9BCEB; border-radius: 999px; background: #FFFFFF; color: #2E3270; font-size: 13px; }
[data-orbit-real-page="iorbit-0918"] .ir-pill-btn:hover { background: #ECEEFB; }
/* 作用域内 a:hover 会把文字压成 #0E1225（本文件顶部的全局规则）。设计给这几个
   按钮形的 <a> 的 style-hover 里没有改字色，这里按「像素规则」的唯一例外把它中和。 */
[data-orbit-real-page="iorbit-0918"] .ir-back:hover, [data-orbit-real-page="iorbit-0918"] .ir-row-cta:hover, [data-orbit-real-page="iorbit-0918"] .ir-aside-btn:hover, [data-orbit-real-page="iorbit-0918"] .ir-sec-link:hover, [data-orbit-real-page="iorbit-0918"] .ir-pill-btn:hover, [data-orbit-real-page="iorbit-0918"] .ir-contact-compact:hover, [data-orbit-real-page="iorbit-0918"] .ir-event-row:hover, [data-orbit-real-page="iorbit-0918"] .ir-nav-card:hover, [data-orbit-real-page="iorbit-0918"] .ir-task-row:hover { color: inherit; }
[data-orbit-real-page="iorbit-0918"] .ir-aside-line:hover { color: #6B6F99; }
[data-orbit-real-page="iorbit-0918"] .ir-cta-btn:hover, [data-orbit-real-page="iorbit-0918"] .ir-contact-action-primary:hover { background: #0E1225; color: #FFFFFF; }
/* 设计稿无响应式声明；窄屏收紧 <main> 侧边距、把两列栅格塌成一列（1240 宽度下不生效） */
@media (max-width: 900px) {
  [data-orbit-real-page="iorbit-0918"] .ir-main { padding: 14px 16px 72px; }
  [data-orbit-real-page="iorbit-0918"] .ir-chat-grid { grid-template-columns: minmax(0, 1fr); }
  [data-orbit-real-page="iorbit-0918"] .ir-two-col { grid-template-columns: minmax(0, 1fr); }
  [data-orbit-real-page="iorbit-0918"] .ir-contact-grid { grid-template-columns: minmax(0, 1fr); }
}
`;

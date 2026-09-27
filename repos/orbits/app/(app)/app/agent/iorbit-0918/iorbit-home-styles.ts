/**
 * iOrbit 概览屏报刊式改版的皮肤（2026-09-27）。拼在 IORBIT_STYLES 末尾，
 * 每条规则都以 [data-orbit-real-page="iorbit-0918"] 开头。
 *
 * 颜色沿用 0918 的墨黑 / 靛蓝体系，只新增一个时效色 #C4461B：
 * 只给「今天必须处理、有时间压力」的东西，一屏不超过 3 处。
 * 全页只有主稿用卡片样式；短讯、时间线、栏目区都靠细线分组。
 */
const S = '[data-orbit-real-page="iorbit-0918"]';

// 新增 .btn 类的基类中和（与 IORBIT_STYLES 里既有的 .btn.ir-* 同一口径）。
const NEW_BUTTONS = ["ir-m-primary", "ir-m-link", "ir-m-go", "ir-m-more", "ir-m-chat", "ir-m-session"];
const neutralise =
  NEW_BUTTONS.map((name) => `${S} .btn.${name}`).join(", ") +
  " { height: auto; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; letter-spacing: 0; line-height: normal; transition: none; font-weight: 400; cursor: pointer; }\n" +
  NEW_BUTTONS.map((name) => `${S} .btn.${name}:active`).join(", ") +
  " { transform: none; }\n";

export const IORBIT_HOME_STYLES =
  neutralise +
  `
/* 报头 */
${S} .ir-m-mast { display: flex; flex-direction: column; gap: 14px; padding-bottom: 22px; border-bottom: 1px solid #DDDEFA; }
${S} .ir-m-mast-row { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px 24px; }
${S} .ir-m-title { display: inline-flex; align-items: center; gap: 12px; }
${S} .ir-m-h1 { font-size: clamp(38px, 4.4vw, 54px); line-height: 1; letter-spacing: -0.035em; }
${S} .ir-m-orbit { width: 44px; height: 26px; margin-top: 6px; }
${S} .ir-m-date { font-family: 'Noto Serif SC', serif; font-weight: 600; font-size: 16px; color: #3B3F7A; font-variant-numeric: tabular-nums; }
${S} .ir-m-date small { font-family: "Noto Sans SC", "PingFang SC", sans-serif; font-weight: 400; font-size: 13px; color: #6B6F99; margin-left: 8px; }
${S} .ir-m-lede { margin: 0; max-width: 44em; font-size: 18px; line-height: 1.6; color: #3B3F7A; text-wrap: balance; }
${S} .ir-m-lede strong { color: #0E1225; font-weight: 500; }
/* 两栏骨架 */
${S} .ir-m-spread { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 48px; align-items: start; }
${S} .ir-m-main, ${S} .ir-m-aside { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
${S} .ir-m-aside { gap: 22px; }
${S} .ir-m-label { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; font-size: 12.5px; letter-spacing: 0.14em; color: #6B6F99; font-weight: 500; }
${S} .ir-m-label-side { display: inline-flex; align-items: baseline; gap: 12px; letter-spacing: 0; font-weight: 400; }
${S} .ir-m-label em { font-style: normal; color: #9FA3C4; font-variant-numeric: tabular-nums; }
${S} .ir-m-label .btn.ir-refresh { padding: 0; border: 0; background: transparent; color: #6B6F99; font-size: 12.5px; }
${S} .ir-m-label .btn.ir-refresh:hover { color: #2E3270; }
/* 主稿：全页唯一的卡片 */
${S} .ir-m-lead { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 22px; padding: 28px 30px 24px; border: 1px solid #E8E9F6; border-radius: 18px; background: #FFFFFF; box-shadow: 0 10px 34px rgba(46,50,112,0.08); }
${S} .ir-m-ord { font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 64px; line-height: 0.9; color: #4B4FC7; font-variant-numeric: tabular-nums; }
${S} .ir-m-ord-hot { color: #C4461B; }
${S} .ir-m-lead-body { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
${S} .ir-m-pills { display: flex; flex-wrap: wrap; gap: 8px; }
${S} .ir-m-pill { display: inline-flex; padding: 3px 10px; border-radius: 999px; background: #ECEEFB; color: #3B3F7A; font-size: 12px; font-variant-numeric: tabular-nums; }
${S} .ir-m-pill-hot { background: #FBEDE6; color: #C4461B; font-weight: 500; }
${S} .ir-m-lead-title { margin: 2px 0 0; font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 27px; line-height: 1.3; letter-spacing: -0.02em; text-wrap: balance; }
${S} .ir-m-why { margin: 0; max-width: 36em; font-size: 15.5px; line-height: 1.75; color: #3B3F7A; }
${S} .ir-m-proof { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 12.5px; color: #6B6F99; }
${S} .ir-m-proof > span { display: inline-flex; align-items: center; gap: 6px; }
${S} .ir-m-proof > span::before { content: ""; width: 5px; height: 5px; border-radius: 50%; background: #B9BCEB; flex: none; }
${S} .ir-m-proof b { font-weight: 500; color: #3B3F7A; }
${S} .ir-m-acts { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; margin-top: 10px; }
${S} .btn.ir-m-primary { padding: 9px 16px; border: 1px solid #4B4FC7; border-radius: 10px; background: #4B4FC7; color: #FFFFFF; font-size: 14px; font-weight: 500; }
${S} .btn.ir-m-primary:hover { background: #2E3270; border-color: #2E3270; }
${S} .ir-m-ops { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px 14px; }
${S} .ir-m-ops .btn.ir-signal-op { padding: 0; border: 0; border-radius: 0; background: transparent; color: #6B6F99; font-size: 13px; }
${S} .ir-m-ops .btn.ir-signal-op:hover { color: #2E3270; }
${S} .ir-m-ops .btn.ir-signal-op:disabled { opacity: 0.5; cursor: default; }
${S} .btn.ir-m-link { padding: 0; border: 0; background: transparent; color: #4B4FC7; font-size: 13px; }
${S} .btn.ir-m-link:hover { color: #2E3270; text-decoration: underline; text-underline-offset: 3px; }
${S} .ir-m-partial { margin: 0; padding: 10px 14px; border-radius: 10px; background: #F4F5FC; color: #3B3F7A; font-size: 13.5px; line-height: 1.6; }
${S} .ir-m-quiet { margin: 0; padding: 22px 24px; border: 1px dashed #DDDEFA; border-radius: 14px; font-size: 15px; color: #6B6F99; }
/* 短讯 */
${S} .ir-m-briefs { display: flex; flex-direction: column; }
${S} .ir-m-brief { display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; gap: 14px; align-items: start; padding: 16px 4px; border-top: 1px solid #E8E9F6; }
${S} .ir-m-brief:first-child { border-top: 0; }
${S} .ir-m-brief-n { font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 26px; line-height: 1.1; color: #B9BCEB; text-align: center; }
${S} .ir-m-brief-body { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
${S} .ir-m-brief-title { font-size: 16px; font-weight: 500; line-height: 1.45; }
${S} .btn.ir-m-go { padding: 4px 2px; border: 0; background: transparent; color: #4B4FC7; font-size: 13.5px; }
${S} .btn.ir-m-go:hover { color: #2E3270; text-decoration: underline; text-underline-offset: 3px; }
${S} .btn.ir-m-more { align-self: flex-start; padding: 4px; border: 0; background: transparent; color: #6B6F99; font-size: 13.5px; }
${S} .btn.ir-m-more:hover { color: #0E1225; }
/* 追问条 */
${S} .ir-m-ask { display: flex; align-items: center; gap: 10px; margin-top: 6px; padding: 8px 8px 8px 18px; border: 1px solid #DDDEFA; border-radius: 14px; background: #FFFFFF; }
${S} .ir-m-ask:focus-within { border-color: #B9BCEB; box-shadow: 0 0 0 4px rgba(75,79,199,0.08); }
${S} .ir-m-ask-mark { color: #4B4FC7; font-size: 15px; }
${S} .ir-m-ask-input { flex: 1; min-width: 0; padding: 8px 0; border: 0; border-radius: 0; outline: none; background: transparent; color: #0E1225; font-size: 15px; }
${S} .ir-m-ask .btn.ir-ask-send { width: 36px; height: 36px; border-radius: 10px; }
${S} .ir-m-ask-divider { width: 1px; height: 22px; background: #E8E9F6; }
${S} .btn.ir-m-chat { width: 36px; height: 36px; padding: 0; border: 0; border-radius: 10px; background: transparent; color: #6B6F99; }
${S} .btn.ir-m-chat:hover { background: #ECEEFB; color: #0E1225; }
/* 右栏：时间线 */
${S} .ir-m-tl { display: flex; flex-direction: column; }
${S} .ir-m-tl > div + div .ir-m-tl-item { border-top: 1px solid #E8E9F6; }
${S} .ir-m-tl-item { display: grid; grid-template-columns: 50px minmax(0, 1fr); gap: 12px; padding: 11px 0; }
${S} .ir-m-now + .ir-m-tl-item { border-top: 0 !important; }
${S} .ir-m-tl-past { opacity: 0.45; }
${S} .ir-m-tl-time { font-size: 13px; color: #3B3F7A; font-variant-numeric: tabular-nums; }
${S} .ir-m-tl-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
${S} .ir-m-tl-copy .ir-agenda-title { font-size: 14.5px; font-weight: 500; line-height: 1.4; }
${S} .ir-m-tl-sub { font-size: 12.5px; color: #6B6F99; }
${S} .ir-m-now { display: flex; align-items: center; gap: 8px; padding: 2px 0; font-size: 11.5px; font-weight: 500; color: #C4461B; font-variant-numeric: tabular-nums; }
${S} .ir-m-now::after { content: ""; flex: 1; height: 1px; background: #C4461B; opacity: 0.5; }
${S} .ir-m-tl-empty { margin: 0; padding: 6px 0; font-size: 14px; color: #6B6F99; }
/* 右栏：紧凑月历 */
${S} .ir-m-cal { padding-top: 18px; border-top: 1px solid #DDDEFA; }
${S} .ir-m-cal-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 8px; }
${S} .ir-m-cal-head strong { font-family: 'Noto Serif SC', serif; font-weight: 600; font-size: 15px; }
${S} .ir-m-cal-link { font-size: 12.5px; color: #4B4FC7; }
${S} .ir-m-cal-link:hover { color: #2E3270; }
${S} .ir-m-cal-head-side { display: inline-flex; align-items: baseline; gap: 14px; }
${S} .btn.ir-m-link.ir-m-cal-toggle { display: none; }
${S} .ir-m-cal-wd, ${S} .ir-m-cal-days { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); text-align: center; font-variant-numeric: tabular-nums; }
${S} .ir-m-cal-wd { font-size: 11px; color: #9FA3C4; padding: 4px 0; }
${S} .ir-m-cal-days { row-gap: 2px; }
${S} .ir-m-cal-days .btn.ir-day { width: 100%; height: 34px; border-radius: 9px; color: #3B3F7A; }
${S} .ir-m-cal-days .btn.ir-day:hover { background: #ECEEFB; }
${S} .ir-m-cal-days .btn.ir-day[data-today="true"]:not(.ir-day-on) { color: #2E3270; font-weight: 700; box-shadow: inset 0 0 0 1.5px #4B4FC7; }
${S} .ir-m-cal-days .btn.ir-day-on, ${S} .ir-m-cal-days .btn.ir-day-on:hover { background: #4B4FC7; color: #FFFFFF; box-shadow: none; }
${S} .ir-m-cal-days .ir-day-dot { bottom: 4px; }
${S} .ir-m-cal-days .btn.ir-day-on .ir-day-dot-a { background: #FFFFFF; }
/* 栏目区 */
${S} .ir-m-cols { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-top: 1px solid #DDDEFA; }
${S} .ir-m-col { display: flex; flex-direction: column; gap: 12px; min-width: 0; padding: 22px 28px 4px; border-left: 1px solid #E8E9F6; }
${S} .ir-m-col:first-child { padding-left: 0; border-left: 0; }
${S} .ir-m-col:last-child { padding-right: 0; }
${S} .ir-m-col-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
${S} .ir-m-col-head h3 { margin: 0; font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 18px; letter-spacing: -0.02em; }
${S} .ir-m-col-head a { font-size: 12.5px; color: #4B4FC7; white-space: nowrap; }
${S} .ir-m-col-acts { display: inline-flex; gap: 12px; }
${S} .ir-m-col-acts .btn.ir-history-btn, ${S} .ir-m-col-acts .btn.ir-enter-btn { padding: 0; border: 0; background: transparent; color: #4B4FC7; font-size: 12.5px; font-weight: 400; }
${S} .ir-m-col-acts .btn.ir-history-btn { color: #6B6F99; }
${S} .ir-m-goal { margin: 0; font-size: 14px; line-height: 1.7; color: #3B3F7A; }
${S} .ir-m-bar { display: flex; align-items: center; gap: 10px; font-size: 12.5px; color: #6B6F99; }
${S} .ir-m-bar-track { flex: 1; height: 5px; border-radius: 999px; background: #ECEEFB; overflow: hidden; }
${S} .ir-m-bar-fill { display: block; height: 100%; border-radius: 999px; background: #4B4FC7; }
${S} .ir-m-bar .ir-progress-value { font-weight: 500; color: #0E1225; font-variant-numeric: tabular-nums; }
${S} .ir-m-tasks { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; font-size: 14px; }
${S} .ir-m-task { display: flex; gap: 10px; align-items: baseline; }
${S} .ir-m-task::before { content: ""; flex: none; width: 12px; height: 12px; border-radius: 4px; border: 1.5px solid #B9BCEB; transform: translateY(1px); }
${S} .ir-m-task-done { color: #9FA3C4; text-decoration: line-through; }
${S} .ir-m-task-done::before { background: #4B4FC7; border-color: #4B4FC7; }
${S} .ir-m-strategy { display: flex; flex-wrap: wrap; gap: 6px 16px; padding-top: 4px; font-size: 13.5px; }
${S} .ir-m-strategy a { color: #4B4FC7; }
${S} .ir-m-empty { margin: 0; font-size: 13.5px; line-height: 1.6; color: #9FA3C4; }
${S} .ir-m-empty a { color: #4B4FC7; }
${S} .ir-m-event { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 12px; align-items: start; color: #0E1225; }
${S} .ir-m-event:hover { color: #2E3270; }
${S} .ir-m-event-date { font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 20px; line-height: 1.05; font-variant-numeric: tabular-nums; }
${S} .ir-m-event-date small { display: block; margin-top: 3px; font-family: "Noto Sans SC", "PingFang SC", sans-serif; font-weight: 400; font-size: 11.5px; color: #6B6F99; white-space: nowrap; }
${S} .ir-m-event-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
${S} .ir-m-event-copy strong { font-size: 14.5px; font-weight: 500; line-height: 1.45; }
${S} .ir-m-event-copy span { font-size: 12.5px; color: #6B6F99; }
${S} .ir-m-community .ir-m-event-date { font-size: 17px; color: #4B4FC7; }
${S} .ir-m-community .ir-m-event-date small { color: #4B4FC7; }
${S} .ir-m-sessions { display: flex; flex-direction: column; }
${S} .btn.ir-m-session { justify-content: space-between; gap: 12px; width: 100%; padding: 9px 0; border: 0; border-top: 1px solid #E8E9F6; border-radius: 0; background: transparent; color: #0E1225; font-size: 14px; text-align: left; }
${S} .ir-m-sessions .btn.ir-m-session:first-child { border-top: 0; padding-top: 0; }
${S} .btn.ir-m-session:hover { color: #2E3270; }
${S} .ir-m-session-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
${S} .btn.ir-m-session time { color: #9FA3C4; font-size: 12.5px; }
@media (max-width: 900px) {
  ${S} .ir-home { gap: 26px; }
  ${S} .ir-m-h1 { font-size: 40px; }
  ${S} .ir-m-lede { font-size: 16px; }
  ${S} .ir-m-spread { grid-template-columns: minmax(0, 1fr); gap: 30px; }
  ${S} .ir-m-lead { grid-template-columns: minmax(0, 1fr); gap: 4px; padding: 22px 18px 20px; }
  ${S} .ir-m-ord { font-size: 34px; line-height: 1; }
  ${S} .ir-m-lead-title { font-size: 22px; }
  ${S} .ir-m-why { font-size: 15px; }
  ${S} .ir-m-brief { grid-template-columns: 30px minmax(0, 1fr); padding: 14px 0; }
  ${S} .ir-m-brief-n { font-size: 20px; }
  ${S} .ir-m-brief .btn.ir-m-go { grid-column: 2; justify-self: start; }
  ${S} .ir-m-cols { grid-template-columns: minmax(0, 1fr); }
  ${S} .ir-m-col, ${S} .ir-m-col:first-child, ${S} .ir-m-col:last-child { padding: 18px 0 6px; border-left: 0; border-top: 1px solid #E8E9F6; }
  ${S} .ir-m-col:first-child { border-top: 0; }
  /* 手机：周条在上当日期选择器，整月按需展开 */
  ${S} .ir-m-cal { order: -1; padding-top: 0; border-top: 0; }
  ${S} .btn.ir-m-link.ir-m-cal-toggle { display: inline-flex; }
  ${S} .ir-m-cal:not([data-open="true"]) .ir-m-off-week { display: none; }
  ${S} .ir-m-cal:not([data-open="true"]) .btn.ir-day[data-off-week="true"] { display: none; }
  ${S} .ir-m-cal:not([data-open="true"]) .ir-m-cal-head strong { visibility: hidden; }
}
`;

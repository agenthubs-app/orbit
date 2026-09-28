/**
 * 「我的计划」页（W0009）与首页「本周推进」读计划时的皮肤。拼在 IORBIT_STYLES 末尾，
 * 每条规则都以 [data-orbit-real-page="iorbit-0918"] 开头；数值取自已确认原型 iorbit-plan 的
 * .plan-goal / .plan-meta / .ruler / .analysis / .week-list / .act / .phase / .pd-row / .info-a /
 * .needs / .need / .people / .person / .st / .badge-btn / .log / .log-in / .log-list / .log-item，
 * 版式沿用首页报刊式的两栏与细线分组（`IORBIT_HOME_STYLES`）。
 *
 * 暖色 #C4461B 只给「已延后 N 周」一处。落成 <a> 的类都带自己的 color 与 :hover color
 * （`tests/ui/orbit-0918-anchor-colour.test.ts` 的门禁）。同一选择器只声明一次。
 */
const S = '[data-orbit-real-page="iorbit-0918"]';
const SERIF = "'Noto Serif SC', 'Songti SC', serif";

// 新增 .btn 类的基类中和（与 IORBIT_HOME_STYLES 的 NEW_BUTTONS 同一口径）。
const NEW_BUTTONS = [
  "ir-p-box",
  "ir-p-link",
  "ir-p-phase-h",
  "ir-p-log-btn",
  "ir-m-plan-box",
  "ir-p-match",
  "ir-p-track-btn",
  "ir-p-track-ghost",
  "ir-p-mention",
];
const neutralise =
  NEW_BUTTONS.map((name) => `${S} .btn.${name}`).join(", ") +
  " { height: auto; display: inline-flex; align-items: center; justify-content: center; gap: 0; white-space: nowrap; letter-spacing: 0; line-height: normal; transition: none; font-weight: 400; cursor: pointer; }\n" +
  NEW_BUTTONS.map((name) => `${S} .btn.${name}:active`).join(", ") +
  " { transform: none; }\n";

export const IORBIT_MY_PLAN_STYLES =
  neutralise +
  `
/* 报头：目标原文 + 元信息 + 周进度刻度 */
${S} .ir-p-mast { display: flex; flex-direction: column; gap: 14px; padding-bottom: 22px; border-bottom: 1px solid #DDDEFA; }
${S} .ir-p-goal { margin: 0; font-family: ${SERIF}; font-weight: 900; font-size: clamp(26px, 3vw, 36px); line-height: 1.3; letter-spacing: -.025em; max-width: 26em; text-wrap: balance; color: #0E1225; }
${S} .ir-p-meta { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 10px 20px; align-items: center; font-size: 13px; color: #6B6F99; }
${S} .ir-p-meta-acts { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; }
${S} .btn.ir-p-link { padding: 0; border: 0; background: transparent; color: #4B4FC7; font-size: 13px; }
${S} .btn.ir-p-link:hover { color: #2E3270; background: transparent; }
${S} .ir-p-soon { font-size: 13px; color: #9FA3C4; cursor: not-allowed; }
${S} .ir-p-analysis { font-size: 14.5px; line-height: 1.75; color: #3B3F7A; display: flex; flex-direction: column; gap: 8px; }
${S} .ir-p-analysis p { margin: 0; max-width: 46em; }
${S} .ir-p-analysis b { color: #0E1225; font-weight: 500; }
${S} .ir-p-ruler { display: flex; flex-direction: column; gap: 6px; }
${S} .ir-p-ruler-phases, ${S} .ir-p-ruler-weeks { display: grid; gap: 3px; }
${S} .ir-p-ruler-phases span { border-bottom: 1px solid #B9BCEB; padding-bottom: 3px; font-size: 11.5px; color: #6B6F99; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
${S} .ir-p-ruler-phases span.ir-p-cur { color: #2E3270; font-weight: 500; border-color: #4B4FC7; }
${S} .ir-p-ruler-weeks i { height: 8px; border-radius: 2px; background: #ECEEFB; position: relative; font-style: normal; }
${S} .ir-p-ruler-weeks i.ir-p-past { background: #B9BCEB; }
${S} .ir-p-ruler-weeks i.ir-p-now { background: #4B4FC7; }
${S} .ir-p-ruler-weeks i.ir-p-now span { position: absolute; top: 12px; left: 0; font-size: 11px; color: #4B4FC7; font-weight: 500; white-space: nowrap; }
${S} .ir-p-ruler-foot { display: flex; justify-content: space-between; gap: 12px; font-size: 11.5px; color: #9FA3C4; padding-top: 12px; font-variant-numeric: tabular-nums; }
/* 两栏 */
${S} .ir-p-spread { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 48px; align-items: start; }
${S} .ir-p-col { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
${S} .ir-p-label { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; font-size: 12.5px; letter-spacing: .14em; color: #6B6F99; font-weight: 500; }
${S} .ir-p-label em { font-style: normal; letter-spacing: 0; color: #9FA3C4; font-weight: 400; font-variant-numeric: tabular-nums; }
${S} .ir-p-pill { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; background: #ECEEFB; color: #3B3F7A; font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }
${S} .ir-p-pill-hot { background: #FBEDE6; color: #C4461B; font-weight: 500; }
${S} .ir-p-pill-good { background: #E6F3EC; color: #2F7A55; }
${S} .ir-p-pill-line { background: transparent; box-shadow: inset 0 0 0 1px #DDDEFA; color: #6B6F99; }
${S} .ir-p-empty-line { margin: 0; font-size: 13.5px; color: #9FA3C4; }
${S} .ir-p-alert { margin: 0; padding: 10px 14px; border-radius: 10px; background: #FBEDE6; color: #8A3414; font-size: 13.5px; }
/* 本周行动 */
${S} .ir-p-week-list { display: flex; flex-direction: column; }
${S} .ir-p-act { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 4px 12px; padding: 14px 0; border-top: 1px solid #E8E9F6; }
${S} .ir-p-act:first-child { border-top: 0; padding-top: 4px; }
/* 勾选框：真实点击区 44×44（负外边距让它在版面里只占 15px），15px 的方框与勾由伪元素画出。 */
${S} .btn.ir-p-box, ${S} .btn.ir-m-plan-box { position: relative; width: 44px; height: 44px; min-width: 44px; min-height: 44px; margin: -14.5px; padding: 0; border: 0; border-radius: 8px; background: transparent; transform: translateY(4px); display: grid; place-items: center; }
${S} .btn.ir-p-box::before, ${S} .btn.ir-m-plan-box::before { content: ""; width: 15px; height: 15px; box-sizing: border-box; border: 1.5px solid #B9BCEB; border-radius: 4px; background: #FFFFFF; grid-area: 1 / 1; }
${S} .btn.ir-p-box[aria-checked="true"]::before, ${S} .btn.ir-m-plan-box[aria-checked="true"]::before { background: #4B4FC7; border-color: #4B4FC7; }
${S} .btn.ir-p-box[aria-checked="true"]::after, ${S} .btn.ir-m-plan-box[aria-checked="true"]::after { content: ""; width: 7px; height: 4px; border-left: 1.8px solid #FFFFFF; border-bottom: 1.8px solid #FFFFFF; transform: rotate(-45deg) translate(1px, -1px); grid-area: 1 / 1; }
${S} .btn.ir-p-box:disabled, ${S} .btn.ir-m-plan-box:disabled { cursor: progress; opacity: .7; }
${S} .btn.ir-p-box:focus-visible, ${S} .btn.ir-m-plan-box:focus-visible { outline: 2px solid #4B4FC7; outline-offset: -12px; }
${S} .ir-p-act-t { font-size: 15.5px; font-weight: 500; line-height: 1.5; color: #0E1225; }
${S} .ir-p-act-done .ir-p-act-t { color: #9FA3C4; text-decoration: line-through; }
${S} .ir-p-act-m { grid-column: 2; display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; font-size: 12.5px; color: #6B6F99; }
/* 阶段 */
${S} .ir-p-phase { border-top: 1px solid #DDDEFA; }
${S} .btn.ir-p-phase-h { width: 100%; padding: 16px 0; border: 0; background: transparent; text-align: left; display: grid; grid-template-columns: 40px minmax(0, 1fr) auto; gap: 2px 12px; align-items: baseline; justify-content: stretch; white-space: normal; color: #0E1225; }
${S} .btn.ir-p-phase-h:hover { background: transparent; }
${S} .ir-p-pn { font-family: ${SERIF}; font-weight: 900; font-size: 24px; color: #B9BCEB; grid-row: span 2; line-height: 1; }
${S} .ir-p-phase-cur .ir-p-pn { color: #4B4FC7; }
${S} .ir-p-phase-name { font-family: ${SERIF}; font-weight: 900; font-size: 18px; }
${S} .ir-p-phase-sub { grid-column: 2; font-size: 12.5px; color: #6B6F99; }
${S} .ir-p-phase-toggle { font-style: normal; color: #9FA3C4; font-size: 12px; grid-row: 1 / span 2; grid-column: 3; align-self: center; }
${S} .ir-p-phase-body { padding: 0 0 22px 52px; }
${S} .ir-p-pd { display: flex; flex-direction: column; gap: 14px; }
${S} .ir-p-pd-row { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 16px; padding-top: 14px; border-top: 1px solid #E8E9F6; font-size: 14px; line-height: 1.65; color: #0E1225; }
${S} .ir-p-pd-row:first-child { border-top: 0; padding-top: 0; }
${S} .ir-p-pd-row > span { font-size: 12.5px; color: #6B6F99; padding-top: 2px; }
${S} .ir-p-pd-row ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
${S} .ir-p-pd-row li.ir-p-done { color: #9FA3C4; text-decoration: line-through; }
${S} .ir-p-wk { display: inline-block; min-width: 52px; font-size: 12px; color: #6B6F99; font-variant-numeric: tabular-nums; }
${S} .ir-p-info-a { font-size: 13px; color: #2F7A55; margin-top: 2px; }
${S} .ir-p-info-none { font-size: 13px; color: #9FA3C4; margin-top: 2px; }
${S} .ir-p-script { margin: 0; padding: 12px 16px; border-radius: 10px; background: #F4F5FC; font-size: 14px; line-height: 1.75; color: #0E1225; }
${S} .ir-p-script small { display: block; font-size: 11.5px; color: #6B6F99; margin-bottom: 4px; letter-spacing: .06em; }
/* 右栏：人脉需求 + 计划里的活动 */
${S} .ir-p-needs { display: flex; flex-direction: column; }
${S} .ir-p-need { padding: 16px 0; border-top: 1px solid #E8E9F6; display: flex; flex-direction: column; gap: 10px; }
${S} .ir-p-need:first-child { border-top: 0; padding-top: 2px; }
${S} .ir-p-need-h { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
${S} .ir-p-need-h b { font-size: 15px; font-weight: 500; line-height: 1.45; color: #0E1225; }
${S} .ir-p-need-h small { display: block; font-size: 12px; color: #6B6F99; font-weight: 400; margin-top: 2px; }
/* W0010：「待确认 N」角标（点开共用的匹配确认组件） */
${S} .btn.ir-p-match { flex: none; min-height: 32px; padding: 4px 12px; border: 1px solid #4B4FC7; border-radius: 999px; background: #EEEFFD; color: #4B4FC7; font-size: 12.5px; font-weight: 500; }
${S} .btn.ir-p-match:hover { background: #4B4FC7; color: #FFFFFF; }
${S} .ir-p-act-x { grid-column: 2; margin-top: 4px; }
${S} .ir-p-need-count { display: flex; gap: 14px; font-size: 12.5px; color: #6B6F99; font-variant-numeric: tabular-nums; }
${S} .ir-p-need-count b { color: #0E1225; font-weight: 500; }
${S} .ir-p-people { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
${S} .ir-p-person { display: grid; grid-template-columns: 30px minmax(0, 1fr) auto; gap: 10px; align-items: center; color: #0E1225; }
${S} .ir-p-person:hover { color: #2E3270; }
${S} .ir-p-ini { width: 30px; height: 30px; border-radius: 50%; background: #ECEEFB; color: #3B3F7A; display: grid; place-items: center; font-size: 12px; font-weight: 500; }
${S} .ir-p-person b { font-size: 14px; font-weight: 500; display: block; }
${S} .ir-p-person small { font-size: 12px; color: #6B6F99; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
${S} .ir-p-st { font-size: 11.5px; white-space: nowrap; color: #4B4FC7; }
${S} .ir-p-st-est { color: #2F7A55; }
${S} .ir-p-need-empty { font-size: 13px; color: #9FA3C4; }
${S} .ir-p-ev { display: grid; grid-template-columns: 58px minmax(0, 1fr); gap: 10px; }
${S} .ir-p-ev-date { font-family: ${SERIF}; font-weight: 900; font-size: 19px; line-height: 1.05; font-variant-numeric: tabular-nums; color: #0E1225; }
${S} .ir-p-ev-t { font-size: 14px; font-weight: 500; line-height: 1.45; color: #0E1225; }
${S} .ir-p-ev-t:hover { color: #2E3270; }
${S} .ir-p-ev-s { display: block; font-size: 12.5px; color: #6B6F99; }
/* 底部进展记录 */
${S} .ir-p-log { display: flex; flex-direction: column; gap: 14px; border-top: 1px solid #DDDEFA; padding-top: 22px; }
${S} .ir-p-log-in { display: flex; gap: 8px; }
${S} .ir-p-log-input { flex: 1; min-width: 0; height: 40px; padding: 0 14px; border: 1px solid #DDDEFA; border-radius: 10px; background: #FFFFFF; color: #0E1225; font-size: 14px; }
${S} .ir-p-log-input:focus { outline: 2px solid #4B4FC7; outline-offset: 1px; }
${S} .btn.ir-p-log-btn { height: 40px; padding: 0 18px; border: 0; border-radius: 10px; background: #2E3270; color: #FFFFFF; font-size: 14px; font-weight: 500; }
${S} .btn.ir-p-log-btn:hover { background: #0E1225; }
${S} .btn.ir-p-log-btn:disabled { background: #B9BCEB; cursor: not-allowed; }
${S} .ir-p-log-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
${S} .ir-p-log-item { display: grid; grid-template-columns: 76px 18px minmax(0, 1fr); gap: 10px; padding: 10px 0; border-top: 1px solid #E8E9F6; font-size: 14px; line-height: 1.55; align-items: baseline; color: #0E1225; }
${S} .ir-p-log-item:first-child { border-top: 0; }
${S} .ir-p-log-item time { font-size: 12.5px; color: #6B6F99; font-variant-numeric: tabular-nums; }
${S} .ir-p-log-k { width: 8px; height: 8px; border-radius: 50%; background: #B9BCEB; justify-self: center; transform: translateY(-1px); }
${S} .ir-p-log-manual .ir-p-log-k { background: #4B4FC7; }
${S} .ir-p-log-item small { color: #9FA3C4; font-size: 12px; margin-left: 6px; }
/* 没有计划 / 读不到计划 */
${S} .ir-p-empty { display: flex; flex-direction: column; gap: 12px; padding: 28px 0; border-top: 1px solid #DDDEFA; max-width: 40em; }
${S} .ir-p-empty h2 { margin: 0; font-family: ${SERIF}; font-weight: 900; font-size: 26px; color: #0E1225; }
${S} .ir-p-empty p { margin: 0; font-size: 15px; line-height: 1.7; color: #3B3F7A; }
${S} .ir-p-empty-link { align-self: flex-start; padding: 11px 20px; border-radius: 10px; background: #2E3270; color: #FFFFFF; font-size: 14px; font-weight: 500; }
${S} .ir-p-empty-link:hover { background: #0E1225; color: #FFFFFF; }
/* W0012：重新分析提示条、到期回顾、@ 提及 */
${S} .ir-p-track { display: flex; flex-direction: column; gap: 10px; padding: 16px 18px; border-radius: 12px; background: #F4F5FE; box-shadow: inset 0 0 0 1px #DDDEFA; }
${S} .ir-p-track h3 { margin: 0; font-family: ${SERIF}; font-weight: 900; font-size: 18px; color: #0E1225; }
${S} .ir-p-track ul { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; font-size: 14px; line-height: 1.6; color: #3B3F7A; }
${S} .ir-p-track p { margin: 0; font-size: 13px; color: #6B6F99; }
${S} .ir-p-track-acts { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
${S} .btn.ir-p-track-btn { min-height: 40px; padding: 0 18px; border: 0; border-radius: 10px; background: #2E3270; color: #FFFFFF; font-size: 14px; font-weight: 500; }
${S} .btn.ir-p-track-btn:hover { background: #0E1225; color: #FFFFFF; }
${S} .btn.ir-p-track-btn:disabled { background: #B9BCEB; color: #FFFFFF; cursor: not-allowed; }
${S} .btn.ir-p-track-ghost { min-height: 40px; padding: 0 14px; border: 0; border-radius: 10px; background: transparent; color: #4B4FC7; font-size: 14px; }
${S} .btn.ir-p-track-ghost:hover { background: #ECEEFB; color: #2E3270; }
${S} .btn.ir-p-track-ghost:disabled { color: #9FA3C4; background: transparent; cursor: not-allowed; }
${S} .ir-p-mentions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 8px; font-size: 12.5px; color: #6B6F99; }
${S} .btn.ir-p-mention { min-height: 32px; padding: 4px 12px; border: 1px solid #DDDEFA; border-radius: 999px; background: #FFFFFF; color: #3B3F7A; font-size: 12.5px; }
${S} .btn.ir-p-mention:hover { border-color: #4B4FC7; color: #2E3270; background: #FFFFFF; }
${S} .btn.ir-p-mention[aria-pressed="true"] { border-color: #4B4FC7; background: #EEEFFD; color: #2E3270; font-weight: 500; }
${S} .ir-p-log-mention { margin-left: 6px; font-size: 12.5px; color: #4B4FC7; }
/* 首页「本周推进」读计划时 */
${S} .ir-m-plan-week { font-style: normal; font-size: 12.5px; color: #6B6F99; font-variant-numeric: tabular-nums; white-space: nowrap; }
${S} .ir-m-plan-phase { margin: 0; font-size: 14px; line-height: 1.6; color: #3B3F7A; }
${S} .ir-m-plan-phase b { font-family: ${SERIF}; font-weight: 900; color: #0E1225; }
${S} .ir-m-plan-acts { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
${S} .ir-m-plan-act { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 2px 8px; font-size: 14px; line-height: 1.5; color: #0E1225; }
${S} .ir-m-plan-act-done span { color: #9FA3C4; text-decoration: line-through; }
${S} .ir-m-plan-act small { grid-column: 2; font-size: 12px; color: #6B6F99; }
${S} .ir-m-plan-counts { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12.5px; color: #6B6F99; font-variant-numeric: tabular-nums; }
${S} .ir-m-plan-counts b { color: #0E1225; font-weight: 500; }
${S} .ir-m-plan-alert { margin: 0; font-size: 12.5px; color: #8A3414; }
${S} .ir-m-plan-link { font-size: 13px; color: #4B4FC7; }
${S} .ir-m-plan-link:hover { color: #2E3270; }
@media (max-width: 900px) {
  ${S} .ir-p-spread { grid-template-columns: minmax(0, 1fr); gap: 30px; }
  ${S} .ir-p-phase-body { padding-left: 0; }
  ${S} .ir-p-pd-row { grid-template-columns: minmax(0, 1fr); gap: 4px; }
  ${S} .ir-p-log-item { grid-template-columns: 64px 14px minmax(0, 1fr); }
}
`;

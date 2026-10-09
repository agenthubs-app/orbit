// 引导页 /app/start 的作用域样式（W0006）。取值来自已确认的原型 iorbit-plan（.start-*、.steps、
// .step、.steps-mini、.lead、.slots、.goalbox、.question、.outline-list、.rec、.finish）。
// 选择器全部以 [data-orbit-real-page="start-guide"] 起头；按钮用 .btn.sg-* 并中和
// orbit-reference-styles 的 .btn 基类（高度、字重、间距、过渡）。注意：本模板字面量里不要写反引号。
const S = '[data-orbit-real-page="start-guide"]';

const BUTTONS = ["sg-primary", "sg-secondary", "sg-link", "sg-step"];

export const START_GUIDE_STYLES = `
${S} { min-height: 100dvh; background: #FBFBFE; color: #0E1225; font-family: "Noto Sans SC", "PingFang SC", "Hiragino Sans GB", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
${S} *, ${S} *::before, ${S} *::after { box-sizing: border-box; }
${S} a { text-decoration: none; }
${BUTTONS.map((name) => `${S} .btn.${name}`).join(", ")} { height: auto; display: inline-flex; align-items: center; justify-content: center; gap: 6px; letter-spacing: 0; line-height: 1.4; white-space: nowrap; text-align: center; transition: background .15s, border-color .15s, color .15s; cursor: pointer; box-shadow: none; user-select: auto; }
${BUTTONS.map((name) => `${S} .btn.${name}:active`).join(", ")} { transform: none; }
${S} .btn.sg-primary { padding: 9px 16px; border: 1px solid #4B4FC7; border-radius: 10px; background: #4B4FC7; color: #FFFFFF; font-size: 14px; font-weight: 500; }
${S} .btn.sg-primary:hover:not(:disabled):not([aria-disabled="true"]) { background: #2E3270; border-color: #2E3270; color: #FFFFFF; }
${S} .btn.sg-primary:disabled, ${S} .btn.sg-primary[aria-disabled="true"] { background: #B9BCEB; border-color: #B9BCEB; color: #FFFFFF; cursor: not-allowed; }
${S} .btn.sg-secondary { padding: 9px 16px; border: 1px solid #DDDEFA; border-radius: 10px; background: #FFFFFF; color: #2E3270; font-size: 14px; font-weight: 500; }
${S} .btn.sg-secondary:hover:not(:disabled) { border-color: #B9BCEB; background: #F6F6FD; }
${S} .btn.sg-link { padding: 0; border: 0; border-radius: 0; background: transparent; color: #4B4FC7; font-size: 13.5px; font-weight: 400; white-space: normal; text-align: left; }
${S} .btn.sg-link:hover { color: #2E3270; text-decoration: underline; text-underline-offset: 3px; }
${S} .btn.sg-link.sg-muted { color: #6B6F99; }
${S} .btn.sg-link:disabled { opacity: .6; cursor: progress; }
${S} .sg-lk { color: #4B4FC7; font-size: 13.5px; }
${S} .sg-lk:hover { color: #2E3270; text-decoration: underline; text-underline-offset: 3px; }
${S} .sg-lk.sg-muted { color: #6B6F99; }

/* 顶栏 */
${S} .sg-nav { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 40px; }
${S} .sg-logo { font-family: var(--font); font-weight: 900; font-size: 22px; letter-spacing: -.02em; color: #0E1225; }
${S} .sg-nav-step { font-size: 13px; color: #6B6F99; font-variant-numeric: tabular-nums; }

${S} .sg-wrap { max-width: 860px; width: 100%; margin: 0 auto; padding: 8px 40px 72px; display: flex; flex-direction: column; gap: 24px; }
${S} .sg-top { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
${S} .sg-hint { font-size: 12.5px; color: #6B6F99; }
${S} .sg-mast { display: flex; flex-direction: column; gap: 14px; }
${S} .sg-title { margin: 0; font-family: var(--font); font-weight: 900; font-size: clamp(28px, 3vw, 38px); letter-spacing: -.03em; line-height: 1.2; }
${S} .sg-lede { margin: 0; font-size: 18px; line-height: 1.6; color: #3B3F7A; max-width: 44em; }

/* 步骤条 */
${S} .sg-steps { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
${S} .btn.sg-step { width: 100%; justify-content: flex-start; text-align: left; white-space: normal; border: 0; border-top: 2px solid #DDDEFA; border-radius: 0; background: none; padding: 12px 2px 4px; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 10px; align-items: baseline; color: #0E1225; font-size: 15px; font-weight: 400; }
${S} .sg-step-n { font-family: var(--font); font-weight: 900; font-size: 22px; color: #B9BCEB; grid-row: span 2; line-height: 1; font-variant-numeric: tabular-nums; }
${S} .sg-step-t { font-size: 15px; font-weight: 500; color: #0E1225; }
${S} .sg-step-s { font-size: 12.5px; color: #6B6F99; display: inline-flex; align-items: center; gap: 5px; }
${S} .btn.sg-step[data-status="done"] .sg-step-n, ${S} .btn.sg-step[data-status="current"] .sg-step-n { color: #4B4FC7; }
${S} .btn.sg-step[data-status="current"] .sg-step-s { color: #4B4FC7; font-weight: 500; }
${S} .btn.sg-step[aria-current="step"] { border-top-color: #4B4FC7; }
${S} .btn.sg-step[data-status="locked"] { cursor: not-allowed; }
${S} .btn.sg-step[data-status="locked"] .sg-step-t, ${S} .btn.sg-step[data-status="locked"] .sg-step-s { color: #9FA3C4; }
${S} .btn.sg-step:not([data-status="locked"]):hover .sg-step-t { color: #2E3270; }
${S} .sg-steps-mini { display: none; }
${S} .sg-locked-note { margin: -12px 0 0; font-size: 13px; color: #C4461B; }
${S} .sg-locked-note:empty { display: none; }

/* 当前步骤模块：页面上唯一的卡片 */
${S} .sg-lead { background: #FFFFFF; border: 1px solid #E8E9F6; border-radius: 18px; box-shadow: 0 10px 34px rgba(46,50,112,.08); padding: 28px 30px 26px; display: flex; flex-direction: column; gap: 14px; }
${S} .sg-lead h2 { margin: 0; font-family: var(--font); font-weight: 900; font-size: 27px; line-height: 1.3; letter-spacing: -.02em; }
${S} .sg-why { margin: 0; font-size: 15.5px; line-height: 1.75; color: #3B3F7A; max-width: 38em; }
${S} .sg-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
${S} .sg-pill { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; background: #ECEEFB; color: #3B3F7A; font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }
${S} .sg-pill-good { background: #E6F3EC; color: #2F7A55; }
${S} .sg-acts { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
${S} .sg-error { margin: 0; font-size: 13px; color: #C4461B; }
${S} .sg-error:empty { display: none; }
${S} .sg-status { margin: 0; font-size: 13.5px; line-height: 1.6; color: #2E3270; background: #ECEEFB; border-radius: 10px; padding: 10px 14px; }
${S} .sg-status:empty { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); }

/* 第 1 步：三张名片槽位 */
${S} .sg-slots { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
${S} .sg-slot { border: 1px solid #E8E9F6; border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; gap: 3px; min-width: 0; background: #F4F5FC; min-height: 74px; }
${S} .sg-slot b { font-size: 14.5px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
${S} .sg-slot span { font-size: 12.5px; color: #6B6F99; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
${S} .sg-slot i { font-style: normal; font-size: 11.5px; font-weight: 500; }
${S} .sg-slot[data-slot="confirmed"] { background: #FFFFFF; }
${S} .sg-slot[data-slot="confirmed"] i { color: #2F7A55; }
${S} .sg-slot[data-slot="pending"] i { color: #C4461B; }
${S} .sg-slot[data-slot="empty"] { border-style: dashed; border-color: #B9BCEB; background: transparent; justify-content: center; }
${S} .sg-count { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 13px; color: #6B6F99; }
${S} .sg-count b { color: #0E1225; font-weight: 500; font-variant-numeric: tabular-nums; }

/* 第 2 步 */
${S} .sg-from-ob { font-size: 13.5px; color: #3B3F7A; background: #F4F5FC; border-radius: 10px; padding: 10px 14px; }
${S} .sg-foot { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px; }

/* 第 3 步 */
${S} .sg-goalbox { border-left: 3px solid #4B4FC7; background: #F4F5FC; border-radius: 0 12px 12px 0; padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; }
${S} .sg-goalbox[data-editing="true"] { border-left: 0; background: transparent; padding: 0; border-radius: 0; }
${S} .sg-goalbox-h { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; font-size: 12px; color: #6B6F99; letter-spacing: .08em; }
${S} .sg-goalbox p { margin: 0; font-size: 15px; line-height: 1.65; color: #0E1225; }
${S} .sg-goalbox .sg-goal-empty { color: #9FA3C4; }
${S} .sg-reads { display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 13px; color: #6B6F99; }
${S} .sg-reads b { color: #3B3F7A; font-weight: 500; }
${S} .sg-question { margin: 4px 0 0; font-family: var(--font); font-weight: 900; font-size: 23px; line-height: 1.45; color: #2E3270; letter-spacing: -.01em; }
${S} .sg-ask-badge { display: inline-grid; place-items: center; width: 26px; height: 26px; margin-right: 10px; border-radius: 7px; background: #4B4FC7; color: #FFFFFF; font: 500 13px/1 "Noto Sans SC", "PingFang SC", sans-serif; vertical-align: 4px; }
${S} .sg-input { width: 100%; border: 1px solid #DDDEFA; border-radius: 10px; padding: 10px 14px; font-size: 14.5px; color: #0E1225; background: #FFFFFF; outline: none; }
${S} .sg-input:focus { border-color: #B9BCEB; box-shadow: 0 0 0 4px rgba(75,79,199,.08); }
${S} .sg-input::placeholder { color: #9FA3C4; }
${S} .sg-outline { display: flex; flex-direction: column; gap: 10px; }
${S} .sg-outline-list { margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 20px; font-size: 13px; color: #3B3F7A; counter-reset: sg-o; }
${S} .sg-outline-list li { display: flex; gap: 8px; align-items: baseline; }
${S} .sg-outline-list li::before { content: counter(sg-o); counter-increment: sg-o; font-family: var(--font); font-weight: 900; font-size: 12px; color: #B9BCEB; min-width: 14px; }

/* 完成卡片 */
${S} .sg-finish { display: flex; flex-direction: column; gap: 12px; padding: 24px 26px; border-radius: 18px; background: #E6F3EC; }
${S} .sg-finish h2 { margin: 0; font-family: var(--font); font-weight: 900; font-size: 24px; color: #0E1225; }
${S} .sg-finish p { margin: 0; font-size: 15px; line-height: 1.7; color: #3B3F7A; }

@media (max-width: 820px) {
  ${S} .sg-nav { padding: 14px 16px; }
  ${S} .sg-wrap { padding: 4px 16px 48px; gap: 20px; }
  ${S} .sg-lede { font-size: 16px; }
  ${S} .sg-lead { padding: 22px 18px 20px; }
  ${S} .sg-lead h2 { font-size: 22px; }
  ${S} .sg-why { font-size: 15px; }
  ${S} .sg-steps { display: none; }
  ${S} .sg-steps-mini { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; font-size: 13px; color: #6B6F99; }
  ${S} .sg-steps-mini i { width: 22px; height: 4px; border-radius: 2px; background: #DDDEFA; }
  ${S} .sg-steps-mini i[data-bar="done"] { background: #4B4FC7; }
  ${S} .sg-steps-mini i[data-bar="current"] { background: #4B4FC7; opacity: .45; }
  ${S} .sg-steps-mini b { color: #0E1225; font-weight: 500; }
  ${S} .sg-locked-note { margin-top: -8px; }
  ${S} .sg-slots { grid-template-columns: minmax(0, 1fr); }
  ${S} .sg-slot { min-height: 0; }
  ${S} .sg-question { font-size: 20px; }
  ${S} .sg-outline-list { grid-template-columns: minmax(0, 1fr); }
  ${S} .sg-foot { flex-direction: column; align-items: stretch; }
  ${S} .sg-foot .btn.sg-primary { justify-content: center; }
}
`;

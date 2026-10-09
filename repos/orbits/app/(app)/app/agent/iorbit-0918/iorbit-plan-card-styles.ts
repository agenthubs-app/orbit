/**
 * 计划回答卡片（W0008）的皮肤。拼在 IORBIT_STYLES 末尾，每条规则都以
 * [data-orbit-real-page="iorbit-0918"] 开头；数值取自已确认原型 iorbit-plan 的
 * .ans / .figs / .blk / .stones / .todo3 / .allies / .gaps / .risk / .quote / .acc / .saved /
 * .gen-line / .skel。正文最小 13px，主文 15–16px。
 */
const S = '[data-orbit-real-page="iorbit-0918"]';
const SERIF = "var(--font)";

// 折叠头是 .btn：同一条规则里整段中和 .btn 基类（与 IORBIT_HOME_STYLES 的 NEW_BUTTONS 同一口径），
// 同一选择器只声明一次（iorbit-screens 的去重门禁）。
export const IORBIT_PLAN_CARD_STYLES = `
@keyframes ir-pc-shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
@keyframes ir-pc-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
/* 对话里的计划回合：不套灰色气泡，卡片直接铺在线程里 */
${S} .ir-a-row.ir-pc-row .ir-a-col { gap: 10px; }
${S} .ir-user-bubble small { display: block; margin-top: 4px; font-size: 13px; color: #6B6F99; }
${S} .ir-pc { display: flex; flex-direction: column; gap: 14px; min-width: 0; color: #0E1225; }
${S} .ir-pc-by { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #6B6F99; }
${S} .ir-pc-by i { width: 22px; height: 22px; border-radius: 6px; background: #ECEEFB; color: #4B4FC7; display: grid; place-items: center; font-style: normal; font-size: 12px; }
${S} .ir-pc-ans { display: flex; flex-direction: column; gap: 30px; }
${S} .ir-pc-head { display: flex; flex-direction: column; gap: 10px; }
${S} .ir-pc-eyebrow { font-size: 13px; color: #6B6F99; letter-spacing: .1em; font-weight: 500; }
${S} .ir-pc-head p { margin: 0; font-family: ${SERIF}; font-weight: 900; font-size: clamp(22px, 2.4vw, 27px); line-height: 1.5; letter-spacing: -.015em; color: #0E1225; text-wrap: pretty; }
${S} .ir-pc-head p em { font-style: normal; color: #4B4FC7; }
${S} .ir-pc-figs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-top: 1px solid #DDDEFA; border-bottom: 1px solid #DDDEFA; }
${S} .ir-pc-fig { padding: 16px 18px; border-left: 1px solid #E8E9F6; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
${S} .ir-pc-fig:first-child { border-left: 0; padding-left: 0; }
${S} .ir-pc-fig b { font-family: ${SERIF}; font-weight: 900; font-size: 38px; line-height: 1.05; color: #0E1225; font-variant-numeric: tabular-nums; }
${S} .ir-pc-fig b small { font-family: var(--font); font-size: 15px; font-weight: 500; margin-left: 4px; color: #3B3F7A; }
${S} .ir-pc-fig span { font-size: 14px; color: #6B6F99; }
${S} .ir-pc-blk { display: flex; flex-direction: column; gap: 14px; }
${S} .ir-pc-blk-h { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
${S} .ir-pc-blk-h h3 { margin: 0; font-family: ${SERIF}; font-weight: 900; font-size: 20px; letter-spacing: -.01em; color: #0E1225; }
${S} .ir-pc-blk-h em { font-style: normal; font-size: 13px; color: #6B6F99; text-align: right; }
${S} .ir-pc-gaps-h { margin-top: 6px; }
${S} .ir-pc-gaps-h h3 { font-size: 16px; }
${S} .ir-pc-stones { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr)); gap: 12px; }
${S} .ir-pc-stone { border: 1px solid #E8E9F6; border-radius: 14px; background: #FFFFFF; padding: 16px 18px; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
${S} .ir-pc-stone-cur { border-color: #4B4FC7; box-shadow: inset 0 0 0 1px #4B4FC7; }
${S} .ir-pc-stone-top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
/* 文字色都 ≥ 4.5:1：白底上 #6B6F99 ≈ 4.8:1、靛蓝 #4B4FC7 ≈ 6.5:1；浅底 #F4F5FC 上的次要文字用 #5F6390（≈ 5.3:1），暖色底上的「最大风险」用 #A83A16（≈ 5.6:1） */
${S} .ir-pc-stone-n { font-family: ${SERIF}; font-weight: 900; font-size: 30px; line-height: 1; color: #6B6F99; }
${S} .ir-pc-stone-cur .ir-pc-stone-n { color: #4B4FC7; }
${S} .ir-pc-stone-w { font-size: 13px; color: #6B6F99; font-variant-numeric: tabular-nums; }
${S} .ir-pc-stone h4 { margin: 4px 0 0; font-family: ${SERIF}; font-weight: 900; font-size: 18px; color: #0E1225; }
${S} .ir-pc-stone p { margin: 0; font-size: 14.5px; line-height: 1.65; color: #3B3F7A; }
${S} .ir-pc-who { font-size: 13.5px; color: #6B6F99; padding-top: 8px; margin-top: auto; border-top: 1px dashed #DDDEFA; line-height: 1.6; }
${S} .ir-pc-who b { color: #0E1225; font-weight: 500; }
${S} .ir-pc-skel { display: flex; flex-direction: column; gap: 10px; padding-top: 4px; }
${S} .ir-pc-skel i { display: block; height: 11px; border-radius: 6px; background: linear-gradient(90deg, #ECEEFB 0%, #F4F5FC 50%, #ECEEFB 100%); background-size: 200% 100%; animation: ir-pc-shimmer 1.4s linear infinite; }
${S} .ir-pc-queued { font-size: 13px; color: #6B6F99; }
${S} .ir-pc-gen { display: flex; align-items: center; gap: 10px; font-size: 14px; color: #4B4FC7; font-weight: 500; }
${S} .ir-pc-dot { width: 7px; height: 7px; border-radius: 50%; background: #4B4FC7; animation: ir-pc-pulse 1s ease-in-out infinite; }
${S} .ir-pc-todo3 { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
${S} .ir-pc-todo3 li { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 12px; padding: 14px 0; border-top: 1px solid #E8E9F6; align-items: baseline; }
${S} .ir-pc-todo3 li:first-child { border-top: 0; padding-top: 2px; }
${S} .ir-pc-i { font-family: ${SERIF}; font-weight: 900; font-size: 20px; color: #4B4FC7; }
${S} .ir-pc-todo3 b { display: block; font-size: 16px; font-weight: 500; line-height: 1.5; color: #0E1225; }
${S} .ir-pc-todo3 span { display: block; font-size: 14px; color: #6B6F99; margin-top: 3px; line-height: 1.55; }
${S} .ir-pc-allies { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr)); gap: 12px; }
${S} .ir-pc-ally { display: flex; flex-direction: column; gap: 8px; padding: 14px 16px; border-radius: 14px; background: #F4F5FC; min-width: 0; }
${S} .ir-pc-ally-top { display: flex; gap: 10px; align-items: center; min-width: 0; }
${S} .ir-pc-ini { flex: none; width: 36px; height: 36px; border-radius: 50%; background: #FFFFFF; color: #3B3F7A; display: grid; place-items: center; font-size: 14px; font-weight: 500; }
${S} .ir-pc-ally b { font-size: 15.5px; font-weight: 500; display: block; color: #0E1225; }
${S} .ir-pc-ally small { font-size: 13px; color: #5F6390; display: block; }
${S} .ir-pc-ally p { margin: 0; font-size: 14.5px; line-height: 1.6; color: #3B3F7A; }
${S} .ir-pc-note { margin: 0; font-size: 14px; line-height: 1.6; color: #6B6F99; }
${S} .ir-pc-gaps { display: flex; flex-wrap: wrap; gap: 8px; }
${S} .ir-pc-gap { font-size: 14px; padding: 7px 13px; border-radius: 999px; border: 1px dashed #B9BCEB; color: #3B3F7A; }
${S} .ir-pc-risk { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 12px; padding: 16px 18px; border-radius: 14px; background: #FBEDE6; color: #7A2E12; font-size: 15px; line-height: 1.65; }
${S} .ir-pc-risk b { font-weight: 700; color: #A83A16; white-space: nowrap; }
${S} .ir-pc-quote { margin: 0; padding: 20px 22px; border-radius: 14px; background: #2E3270; color: #FFFFFF; display: flex; flex-direction: column; gap: 8px; }
${S} .ir-pc-quote small { font-size: 13px; opacity: .75; letter-spacing: .08em; }
${S} .ir-pc-quote p { margin: 0; font-family: ${SERIF}; font-weight: 600; font-size: 18px; line-height: 1.75; }
${S} .ir-pc-acc { border-top: 1px solid #DDDEFA; }
${S} .ir-pc-acc:last-child { border-bottom: 1px solid #DDDEFA; }
${S} .btn.ir-pc-acc-h { height: auto; display: flex; align-items: center; justify-content: space-between; gap: 12px; white-space: normal; letter-spacing: 0; line-height: 1.5; transition: none; font-weight: 500; cursor: pointer; width: 100%; padding: 16px 0; border: 0; border-radius: 0; background: none; box-shadow: none; text-align: left; font-size: 16px; color: #0E1225; }
${S} .btn.ir-pc-acc-h:active { transform: none; }
${S} .btn.ir-pc-acc-h:hover { background: none; color: #2E3270; }
${S} .btn.ir-pc-acc-h span { flex: none; font-size: 13.5px; font-weight: 400; color: #6B6F99; }
${S} .ir-pc-acc-b { padding: 0 0 20px; display: flex; flex-direction: column; gap: 16px; font-size: 15px; line-height: 1.7; color: #3B3F7A; }
${S} .ir-pc-acc-b h5 { margin: 0 0 6px; font-size: 13.5px; color: #6B6F99; font-weight: 500; }
${S} .ir-pc-acc-b ul { margin: 0; padding-left: 1.2em; }
${S} .ir-pc-saved { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px 20px; padding: 18px 22px; border-radius: 14px; background: #2E3270; color: #FFFFFF; }
${S} .ir-pc-saved b { font-family: ${SERIF}; font-weight: 900; font-size: 18px; display: block; }
${S} .ir-pc-saved span { font-size: 13px; opacity: .85; }
${S} .ir-pc-saved-link { display: inline-flex; align-items: center; padding: 9px 16px; border-radius: 10px; border: 1px solid #FFFFFF; background: #FFFFFF; color: #2E3270; font-size: 14px; font-weight: 500; white-space: nowrap; }
${S} .ir-pc-saved-link:hover { background: #ECEEFB; border-color: #ECEEFB; color: #2E3270; }
@media (max-width: 640px) {
  ${S} .ir-pc-ans { gap: 24px; }
  ${S} .ir-pc-fig { padding: 12px 8px; }
  ${S} .ir-pc-fig b { font-size: 28px; }
  ${S} .ir-pc-fig b small { font-size: 13px; }
  ${S} .ir-pc-fig span { font-size: 13px; }
  ${S} .ir-pc-quote p { font-size: 16px; }
  ${S} .ir-pc-blk-h { flex-wrap: wrap; }
}
`;

// 名片批量导入（上传 / 正在解析 / 10 名片确认 / 小结 / 提醒）共用样式，新 UI 浅紫色版。
// 取值来自 docs/designs/Orbit_0918/新用户引导.dc.html 与 Network v2.dc.html 的 style=""。
// 作用域是组件自带的 .cbx 根节点（不依赖 data-orbit-real-page），引导页、人脉页、全站浮层都能直接用。
// 注意：本模板字面量的注释里不要写反引号。
const S = ".cbx";

export const CARD_BATCH_STYLES = `
@keyframes orbit-fade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes cb-pulse { 0%, 100% { opacity: .45; } 50% { opacity: 1; } }
@keyframes cb-sheen { from { background-position: -200px 0; } to { background-position: 200px 0; } }
@keyframes cb-scan { 0% { top: -12%; } 100% { top: 100%; } }
${S} { color: #0E1225; font-family: var(--font); -webkit-font-smoothing: antialiased; text-wrap: pretty; }
${S} input, ${S} textarea, ${S} button { font-family: inherit; }
${S} input::placeholder { color: #9FA3C4; }
${S} a { text-decoration: none; }
${S}.cbx-float { display: contents; }
/* .btn 基类（orbit-reference-styles）的非设计声明全部中和，下面的 cb-* 规则逐项给值。 */
${S} .btn { align-items: center; justify-content: center; border: 0; border-radius: 0; background: transparent; display: inline-flex; font-size: inherit; font-weight: 400; gap: 0; height: auto; letter-spacing: normal; line-height: normal; padding: 0; text-align: inherit; transition: none; user-select: auto; white-space: normal; color: inherit; box-shadow: none; }
${S} .btn:active { transform: none; }
${S} .cb-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
${S} .cb-spark { color: #4B4FC7; }
${S} .cb-faint { color: #9FA3C4; }
${S} .cb-head { display: flex; flex-direction: column; gap: 10px; }
${S} .cb-p { margin: 0; font-size: 15px; line-height: 1.65; color: #3B3F7A; }
${S} .cb-kicker { font-size: 13px; letter-spacing: .18em; color: #3B3F7A; }
${S} .cb-chips { display: flex; flex-wrap: wrap; gap: 10px; }
${S} .cb-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 22px; }
${S} .cb-notice { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 12px; font-size: 14px; line-height: 1.6; }
${S} .cb-notice-error { background: #FBEAEA; color: #B5473A; }
${S} .cb-notice-warning { background: #FBF1DC; color: #8A6420; }
${S} .cb-tip { display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px; border-radius: 12px; background: #ECEEFB; color: #2E3270; font-size: 14px; line-height: 1.6; }
${S} .cb-tip-sm { font-size: 13px; line-height: 1.7; }
${S} .cb-label-note { font-weight: 400; color: #6B6F99; }
${S} .cb-privacy { font-size: 13px; }
${S} .btn.cb-btn-dark, ${S} a.cb-btn-dark { padding: 14px 28px; border-radius: 999px; background: #0E1225; color: #FFFFFF; font-size: 15px; font-weight: 500; cursor: pointer; }
${S} .btn.cb-btn-dark:hover, ${S} a.cb-btn-dark:hover { background: #2E3270; color: #FFFFFF; }
${S} .btn.cb-btn-dark[disabled] { background: #0E1225; color: #FFFFFF; opacity: .35; cursor: default; }
${S} .btn.cb-btn-soft { padding: 10px 18px; border: 1px solid #B9BCEB; border-radius: 999px; background: #FFFFFF; color: #2E3270; font-size: 13px; cursor: pointer; white-space: nowrap; }
${S} .btn.cb-btn-soft:hover { background: #ECEEFB; }
${S} .btn.cb-btn-soft[disabled] { background: #FFFFFF; color: #2E3270; border-color: #B9BCEB; opacity: .5; cursor: default; }
${S} .btn.cb-btn-ghost { padding: 13px 20px; border: 1px solid #DDDEFA; border-radius: 999px; background: #FFFFFF; color: #3B3F7A; font-size: 14px; cursor: pointer; }
${S} .btn.cb-btn-ghost:hover { border-color: #B9BCEB; color: #2E3270; }
${S} .btn.cb-btn-ghost[disabled] { background: #FFFFFF; color: #3B3F7A; border-color: #DDDEFA; opacity: .5; cursor: default; }
${S} .btn.cb-link-under { padding: 0 0 3px; border-bottom: 1px solid #B9BCEB; font-size: 14px; color: #3B3F7A; cursor: pointer; }
${S} .btn.cb-link-under:hover { color: #0E1225; }
${S} .cb-link-btn { display: inline-flex; align-items: center; }
${S} .cb-source { display: flex; align-items: center; gap: 14px; padding: 16px; border: 1px solid #E8E9F6; border-radius: 16px; background: #FFFFFF; opacity: .7; }
${S} .cb-source-glyph { width: 42px; height: 42px; flex: none; border-radius: 12px; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; }
${S} .cb-source-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
${S} .cb-source-body strong { font-size: 15px; font-weight: 500; }
${S} .cb-source-body span { font-size: 12px; color: #6B6F99; }

/* ── 上传区（新用户引导.dc.html 225–260 行）── */
${S} .cb-up { border: 1px solid #DDDEFA; border-radius: 18px; background: #F7F7FD; padding: 20px; display: flex; flex-direction: column; gap: 16px; }
${S} .cb-up-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 10px; }
${S} .cb-up-title { display: flex; flex-direction: column; gap: 4px; }
${S} .cb-up-title strong { font-size: 15px; font-weight: 700; }
${S} .cb-up-title span { font-size: 13px; line-height: 1.6; color: #6B6F99; }
${S} .cb-up-badge { padding: 5px 12px; border-radius: 999px; background: #FFFFFF; border: 1px solid #DDDEFA; color: #2E3270; font-size: 12px; white-space: nowrap; }
${S} .btn.cb-drop { display: flex; flex-direction: column; align-items: center; gap: 10px; width: 100%; padding: 30px 20px; border: 1.5px dashed #B9BCEB; border-radius: 14px; background: #FFFFFF; text-align: center; cursor: pointer; }
${S} .btn.cb-drop:hover, ${S} .btn.cb-drop-on { border-color: #4B4FC7; background: #FBFBFE; }
${S} .cb-drop strong { font-size: 15px; font-weight: 500; color: #0E1225; }
${S} .cb-drop span { font-size: 12px; color: #6B6F99; }
${S} .cb-drop .cb-drop-icon { width: 44px; height: 44px; border-radius: 12px; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; font-size: 18px; }
${S} .cb-thumbs { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 10px; border-radius: 12px; }
${S} .cb-thumbs-on { outline: 2px dashed #4B4FC7; outline-offset: 4px; }
${S} .cb-thumb { position: relative; aspect-ratio: 1.6; border-radius: 8px; border: 1px solid #DDDEFA; background: repeating-linear-gradient(135deg, #ECEEFB 0 6px, #F7F7FD 6px 12px); overflow: hidden; display: flex; align-items: flex-end; }
${S} .cb-thumb-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
${S} .cb-thumb-name { position: relative; width: 100%; padding: 3px 6px; background: rgba(255,255,255,0.88); font-family: ui-monospace, Menlo, monospace; font-size: 10px; color: #6B6F99; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
${S} .btn.cb-thumb-x { position: absolute; top: 3px; right: 3px; width: 20px; height: 20px; border-radius: 50%; background: rgba(14,18,37,0.55); color: #FFFFFF; font-size: 12px; line-height: 1; cursor: pointer; }
${S} .btn.cb-thumb-add { aspect-ratio: 1.6; flex-direction: column; gap: 2px; border-radius: 8px; border: 1.5px dashed #B9BCEB; background: #FFFFFF; color: #2E3270; font-size: 12px; cursor: pointer; }
${S} .btn.cb-thumb-add:hover { border-color: #4B4FC7; }
${S} .cb-up-foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; font-size: 12px; line-height: 1.6; color: #6B6F99; }
${S} .cb-up-foot > span { flex: 1 1 240px; }

${S} .cb-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
${S} .cb-btn-dark { padding: 14px 32px; border: 0; border-radius: 999px; background: #0E1225; color: #FFFFFF; font-size: 15px; font-weight: 500; cursor: pointer; transition: opacity .2s ease; }
${S} .cb-btn-dark:hover { background: #2E3270; color: #FFFFFF; }
${S} .cb-btn-dark:disabled { opacity: .35; cursor: default; background: #0E1225; }
${S} .cb-btn-ghost { padding: 13px 20px; border: 1px solid #DDDEFA; border-radius: 999px; background: #FFFFFF; color: #3B3F7A; font-size: 14px; cursor: pointer; }
${S} .cb-btn-ghost:hover { border-color: #B9BCEB; color: #2E3270; }
${S} .cb-btn-ghost:disabled { opacity: .5; cursor: default; }
${S} .cb-btn-soft { padding: 10px 18px; border: 1px solid #B9BCEB; border-radius: 999px; background: #FFFFFF; color: #2E3270; font-size: 13px; cursor: pointer; white-space: nowrap; }
${S} .cb-btn-soft:hover { background: #ECEEFB; }
${S} .cb-btn-soft:disabled { opacity: .5; cursor: default; }
${S} .cb-link-under { padding: 0 0 3px; border: 0; border-bottom: 1px solid #DDDEFA; background: transparent; cursor: pointer; font-size: 15px; color: #6B6F99; }
${S} .cb-link-under:hover { color: #0E1225; }
${S} .cb-kicker { font-size: 13px; letter-spacing: .18em; color: #3B3F7A; }
${S} .cb-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 22px; }
${S} .cb-spark { color: #4B4FC7; }
${S} .cb-tip { display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px; border-radius: 12px; background: #ECEEFB; color: #2E3270; font-size: 14px; line-height: 1.6; }
${S} .cb-tip-sm { font-size: 13px; line-height: 1.7; }
${S} .cb-head { display: flex; flex-direction: column; gap: 10px; }
${S} .cb-p { margin: 0; font-size: 15px; line-height: 1.65; color: #3B3F7A; }
${S} .cb-label-note { font-weight: 400; color: #6B6F99; }
${S} .cb-chips { display: flex; flex-wrap: wrap; gap: 10px; }
${S} .cb-notice { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 12px; font-size: 14px; line-height: 1.6; }
${S} .cb-notice-error { background: #FBEAEA; color: #B5473A; }
${S} .cb-notice-warning { background: #FBF1DC; color: #8A6420; }
${S} .cb-mini-chips { display: flex; flex-wrap: wrap; gap: 6px; }
${S} .cb-mini-chip { padding: 5px 10px; border-radius: 999px; background: #ECEEFB; color: #2E3270; font-size: 12px; }
${S} .cb-source { display: flex; align-items: center; gap: 14px; padding: 16px; border: 1px solid #4B4FC7; border-radius: 16px; background: #F7F7FD; text-align: left; }
${S} .cb-source-off { border-color: #E8E9F6; background: #FFFFFF; opacity: .6; }
${S} .cb-source-glyph { width: 42px; height: 42px; flex: none; border-radius: 12px; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; }
${S} .cb-source-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
${S} .cb-source-body strong { font-size: 15px; font-weight: 500; color: #0E1225; }
${S} .cb-source-body span { font-size: 12px; color: #6B6F99; }
${S} .cb-privacy { font-size: 13px; }
${S} .cb-link-under-strong { font-size: 14px; color: #3B3F7A; border-bottom-color: #B9BCEB; }
${S} .btn.cb-btn-dark[disabled] { background: #0E1225; color: #FFFFFF; border-color: transparent; opacity: .35; cursor: default; }
${S} .btn.cb-btn-ghost[disabled] { background: #FFFFFF; color: #3B3F7A; border-color: #DDDEFA; opacity: .5; cursor: default; }
${S} .btn.cb-btn-soft[disabled] { background: #FFFFFF; color: #2E3270; border-color: #B9BCEB; opacity: .5; cursor: default; }
${S} .cb-review { display: flex; flex-direction: column; gap: 22px; animation: orbit-fade .3s ease; }
${S} .cb-review-top { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 20px; }
${S} .cb-review-head { display: flex; flex-direction: column; gap: 10px; min-width: 0; flex: 1 1 320px; }
/* W0015 活动归属询问：审阅页顶部一行，默认勾选。 */
${S} .cb-attr { display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px; border-radius: 12px; background: #ECEEFB; color: #0E1225; cursor: pointer; }
${S} .cb-attr input { flex: none; width: 18px; height: 18px; margin: 3px 0 0; accent-color: #4B4FC7; cursor: pointer; }
${S} .cb-attr-copy { display: flex; flex-direction: column; gap: 4px; min-width: 0; font-size: 14px; line-height: 1.6; }
${S} .cb-attr-copy strong { font-weight: 600; overflow-wrap: anywhere; }
${S} .cb-attr-copy span { color: #3B3F7A; font-size: 13px; }
${S} .cb-attr-done { padding: 12px 16px; border-radius: 12px; background: #ECEEFB; color: #2E3270; font-size: 14px; line-height: 1.6; }
${S} .cb-review-h { margin: 0; font-family: var(--font); font-weight: 900; font-size: clamp(26px, 2.8vw, 34px); line-height: 1.15; letter-spacing: -0.03em; }
${S} .cb-review-stats { display: flex; gap: 10px; }
${S} .cb-stat { padding: 12px 16px; border-radius: 14px; display: flex; flex-direction: column; gap: 2px; min-width: 96px; }
${S} .cb-stat strong { font-family: var(--font); font-weight: 900; font-size: 22px; }
${S} .cb-stat span { font-size: 12px; }
${S} .cb-stat-green { background: #E6F1EC; color: #2F6B4F; }
${S} .cb-stat-indigo { background: #ECEEFB; color: #2E3270; }
${S} .cb-queue { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 4px; }
${S} .btn.cb-queue-item { flex: none; display: flex; align-items: center; gap: 10px; padding: 8px 16px 8px 8px; border: 1.5px solid #E8E9F6; border-radius: 12px; background: #FFFFFF; cursor: pointer; transition: all .2s; }
${S} .btn.cb-queue-item:hover { border-color: #B9BCEB; }
${S} .btn.cb-queue-on { border-color: #4B4FC7; background: #F7F7FD; }
${S} .btn.cb-queue-item[disabled] { background: #FFFFFF; border-color: #E8E9F6; color: inherit; opacity: .7; cursor: default; }
${S} .cb-queue-n { width: 46px; height: 27px; flex: none; border-radius: 3px; background: #FCFBF7; border: 1px solid #DDDEFA; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #6B6F99; }
${S} .cb-queue-copy { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
${S} .cb-queue-copy strong { font-size: 13px; font-weight: 500; color: #0E1225; white-space: nowrap; }
${S} .cb-queue-st { font-size: 11px; white-space: nowrap; color: #6B6F99; }
${S} .cb-queue-st-ok { color: #2F6B4F; }
${S} .cb-queue-st-later { color: #8A6420; }
${S} .cb-queue-st-muted { color: #9FA3C4; }
${S} .cb-review-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr)); gap: 20px; align-items: start; }
${S} .cb-photo-panel { position: relative; border-radius: 24px; background: #1B1E33; padding: 22px 24px 20px; display: flex; flex-direction: column; gap: 22px; min-height: 420px; }
${S} .cb-photo-top { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
${S} .cb-photo-file { font-family: ui-monospace, Menlo, monospace; font-size: 12px; color: #9FA3C4; overflow-wrap: anywhere; }
${S} .cb-photo-reason { padding: 5px 12px; border-radius: 999px; background: rgba(251,241,220,0.14); color: #F2D9A6; font-size: 12px; }
${S} .cb-photo-stage { flex: 1; display: flex; align-items: center; justify-content: center; padding: 28px 12px; overflow: hidden; }
${S} .cb-photo-frame { width: 100%; max-width: 540px; border-radius: 6px; overflow: hidden; box-shadow: 0 30px 60px rgba(0,0,0,0.45); background: #FCFBF7; transition: transform .35s ease; }
${S} .cb-photo-frame img { display: block; width: 100%; height: auto; }
/* 私有图片组件的加载/失败占位：居中、用面板色，不再是左上角的一行灰字。 */
${S} .cb-photo-frame [data-ingest-private-image] { background-color: #F1F1FA !important; }
${S} .cb-photo-frame [data-ingest-private-image="loading"], ${S} .cb-photo-frame [data-ingest-private-image="error"], ${S} .cb-photo-frame [data-ingest-private-image="expired"] { display: flex; align-items: center; justify-content: center; font-size: 13px; color: #6B6F99; }
${S} .cb-photo-missing { display: block; padding: 60px 20px; text-align: center; font-size: 13px; color: #6B6F99; }
${S} .cb-photo-foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; font-size: 12px; color: #9FA3C4; }
${S} .btn.cb-photo-zoom { padding: 8px 14px; border: 1px solid rgba(255,255,255,0.18); border-radius: 999px; background: transparent; color: #FFFFFF; font-size: 13px; cursor: pointer; }
${S} .btn.cb-photo-zoom:hover { background: rgba(255,255,255,0.08); }
${S} .cb-side-toggle { display: inline-flex; gap: 4px; padding: 3px; border-radius: 999px; background: rgba(255,255,255,0.08); }
${S} .btn.cb-side-btn { padding: 5px 12px; border-radius: 999px; color: #9FA3C4; font-size: 12px; cursor: pointer; }
${S} .btn.cb-side-on { background: #FFFFFF; color: #0E1225; }
${S} .cb-fields-panel { border: 1px solid #E8E9F6; border-radius: 24px; background: #FFFFFF; padding: 24px; display: flex; flex-direction: column; gap: 14px; }
${S} .cb-fields-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding-bottom: 6px; }
${S} .cb-fields-title { display: flex; flex-direction: column; gap: 4px; }
${S} .cb-fields-title strong { font-family: var(--font); font-weight: 900; font-size: 22px; letter-spacing: -0.02em; }
${S} .cb-fields-title span { font-size: 13px; color: #6B6F99; }
${S} .cb-check-chip { padding: 5px 12px; border-radius: 999px; background: #FBF1DC; color: #8A6420; font-size: 12px; white-space: nowrap; }
${S} .cb-check-chip-ok { background: #E6F1EC; color: #2F6B4F; }
${S} .cb-match { padding: 16px 18px; border-radius: 16px; background: #ECEEFB; border: 1px solid #D9DBF5; display: flex; flex-direction: column; gap: 12px; }
${S} .cb-match-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
${S} .cb-match-title { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; color: #2E3270; }
${S} .cb-match-why { font-size: 12px; color: #4A4F9C; padding: 3px 10px; border-radius: 999px; background: #FFFFFF; }
${S} .cb-match-grid { margin: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
${S} .cb-match-row { min-width: 0; padding: 10px 12px; border-radius: 12px; background: #FFFFFF; display: flex; flex-direction: column; gap: 4px; }
${S} .cb-match-row dt { font-size: 12px; color: #6B6F99; }
${S} .cb-match-row dd { margin: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; min-width: 0; }
${S} .cb-match-val { font-size: 14px; color: #0E1225; overflow-wrap: anywhere; }
${S} .cb-match-none .cb-match-val, ${S} .cb-match-fill .cb-match-val { color: #9A9DC0; }
${S} .cb-match-tag { font-size: 11px; padding: 1px 8px; border-radius: 999px; background: #F2F3FB; color: #6B6F99; }
${S} .cb-match-same .cb-match-tag { background: #E4F3EA; color: #2F6B45; }
${S} .cb-match-diff .cb-match-tag { background: #FBF1DC; color: #8A6420; }
${S} .cb-match-fill .cb-match-tag { background: #ECEEFB; color: #2E3270; }
@media (max-width: 560px) { ${S} .cb-match-grid { grid-template-columns: minmax(0, 1fr); } }
${S} .cb-rfield { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border: 1px solid #E8E9F6; border-radius: 14px; background: #FFFFFF; transition: border-color .2s ease; }
${S} .cb-rfield:focus-within { border-color: #4B4FC7; }
${S} .cb-rfield-check { border-color: #E9D3A4; background: #FFFBF2; }
${S} .cb-rfield-edited { border-color: #B9BCEB; }
${S} .cb-rfield-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 13px; font-weight: 500; color: #3B3F7A; }
${S} .cb-rtag { padding: 3px 9px; border-radius: 999px; font-size: 12px; font-weight: 400; white-space: nowrap; }
${S} .cb-rtag-ok { background: #E6F1EC; color: #2F6B4F; }
${S} .cb-rtag-check { background: #FBF1DC; color: #8A6420; }
${S} .cb-rtag-empty { background: #F0F1F8; color: #3B3F7A; }
${S} .cb-rtag-edited { background: #ECEEFB; color: #2E3270; }
${S} .cb-rinput { padding: 11px 13px; border: 1px solid #DDDEFA; border-radius: 10px; background: #FFFFFF; font-size: 15px; color: #0E1225; outline: none; width: 100%; }
${S} .cb-rnotes { resize: vertical; min-height: 72px; line-height: 1.6; font-family: inherit; white-space: pre-wrap; }
${S} .cb-rinput:focus { border-color: #4B4FC7; }
${S} .cb-rindustry { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
${S} .cb-rindustry .cb-rinput { flex: 1 1 140px; min-width: 0; width: auto; }
${S} .cb-rindustry-sep { color: #8A8DB8; font-size: 15px; }
${S} .cb-rhint { flex: 0 0 auto; font-size: 12px; color: #6B6FA8; }
${S} .cb-alts { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 12px; color: #8A6420; }
${S} .btn.cb-alt { padding: 5px 11px; border: 1px solid #E9D3A4; border-radius: 999px; background: #FFFFFF; color: #0E1225; font-size: 13px; cursor: pointer; }
${S} .btn.cb-alt:hover { background: #FBF1DC; }
${S} .cb-review-actions { display: flex; flex-direction: column; gap: 12px; padding-top: 10px; border-top: 1px solid #E8E9F6; }
${S} .cb-review-single { display: flex; flex-direction: column; }
${S} .cb-review-pair { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); gap: 10px; }
${S} .btn.cb-review-merge { display: flex; align-items: center; justify-content: center; padding: 15px; border-radius: 999px; border: 1px solid #B9BCEB; background: #FFFFFF; color: #2E3270; font-size: 15px; font-weight: 500; cursor: pointer; }
${S} .btn.cb-review-merge:hover { background: #ECEEFB; }
${S} .btn.cb-review-merge[disabled] { opacity: .6; }
${S} .cb-review-hint { font-size: 12px; line-height: 1.6; color: #6B6F99; }
@media (max-width: 560px) { ${S} .cb-review-pair { grid-template-columns: minmax(0, 1fr); } }
${S} .btn.cb-review-confirm { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 15px; border-radius: 999px; background: #0E1225; color: #FFFFFF; font-size: 15px; font-weight: 500; cursor: pointer; }
${S} .btn.cb-review-confirm:hover { background: #2E3270; }
${S} .btn.cb-review-confirm[disabled] { background: #0E1225; color: #FFFFFF; opacity: .6; }
${S} .cb-kbd { padding: 2px 7px; border-radius: 6px; background: rgba(255,255,255,0.14); font-size: 12px; }
${S} .cb-review-minor { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
${S} .btn.cb-btn-ghost-sm { padding: 9px 14px; font-size: 13px; }
${S} .cb-review-links { display: flex; gap: 16px; }
${S} .btn.cb-text-btn { padding: 0; color: #3B3F7A; font-size: 13px; cursor: pointer; }
${S} .btn.cb-text-btn:hover { color: #0E1225; }
${S} .btn.cb-text-danger { color: #B5473A; }
${S} .btn.cb-text-btn[disabled] { background: transparent; color: #9FA3C4; }
${S} .cb-parse { display: flex; flex-direction: column; gap: 20px; padding: clamp(20px, 3vw, 32px); border: 1px solid #DDDEFA; border-radius: 20px; background: linear-gradient(180deg, #F7F7FD 0%, #FFFFFF 60%); animation: orbit-fade .3s ease; }
${S} .cb-parse-head { display: flex; flex-direction: column; gap: 8px; }
${S} .cb-parse-steps { display: flex; flex-wrap: wrap; gap: 8px 24px; font-size: 14px; color: #9FA3C4; }
${S} .cb-parse-step { display: flex; align-items: center; gap: 8px; }
${S} .cb-parse-dot { width: 24px; height: 24px; border-radius: 50%; border: 1px solid #DDDEFA; background: #FFFFFF; display: flex; align-items: center; justify-content: center; font-size: 12px; }
${S} .cb-parse-step-on { color: #0E1225; font-weight: 500; }
${S} .cb-parse-step-on .cb-parse-dot { border-color: #4B4FC7; color: #4B4FC7; box-shadow: 0 0 0 4px rgba(75,79,199,0.12); animation: cb-pulse 1.4s ease infinite; }
${S} .cb-parse-step-done { color: #3B3F7A; }
${S} .cb-parse-step-done .cb-parse-dot { border-color: #4B4FC7; background: #4B4FC7; color: #FFFFFF; }
${S} .cb-parse-track { display: block; height: 6px; border-radius: 999px; background: #ECEEFB; overflow: hidden; }
${S} .cb-parse-track span { display: block; height: 6px; border-radius: 999px; background: linear-gradient(90deg, #4B4FC7 0%, #7B7FE0 50%, #4B4FC7 100%); background-size: 200px 100%; animation: cb-sheen 1.6s linear infinite; transition: width .8s ease; }
${S} .cb-parse-wall { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
${S} .cb-mini { position: relative; overflow: hidden; aspect-ratio: 1.75; border-radius: 8px; border: 1px solid #E8E9F6; background: #FCFBF7; padding: 10px 12px; display: flex; flex-direction: column; justify-content: space-between; transition: border-color .3s ease, box-shadow .3s ease; }
${S} .cb-mini-wait, ${S} .cb-mini-upload { opacity: .6; }
${S} .cb-mini-reading { border-color: #B9BCEB; box-shadow: 0 6px 20px rgba(75,79,199,0.12); }
${S} .cb-mini-done { border-color: #CFE3D8; }
${S} .cb-mini-fail { border-color: #F0C9C3; background: #FFF8F7; }
${S} .cb-mini-scan { position: absolute; left: 0; right: 0; height: 12%; background: linear-gradient(180deg, rgba(75,79,199,0) 0%, rgba(75,79,199,0.28) 60%, rgba(75,79,199,0.6) 100%); animation: cb-scan 1.3s ease-in-out infinite alternate; pointer-events: none; }
${S} .cb-mini-lines { display: flex; flex-direction: column; gap: 5px; }
${S} .cb-mini-lines i { display: block; height: 5px; border-radius: 999px; background: #ECEBE4; }
${S} .cb-mini-lines i:nth-child(1) { width: 58%; height: 7px; }
${S} .cb-mini-lines i:nth-child(2) { width: 40%; }
${S} .cb-mini-lines i:nth-child(3) { width: 70%; }
${S} .cb-mini-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
${S} .cb-mini-text strong { font-size: 14px; color: #0E1225; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
${S} .cb-mini-text span { font-size: 11px; color: #6B6F99; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
${S} .cb-mini-foot { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
${S} .cb-mini-name { min-width: 0; font-size: 10px; color: #9FA3C4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
${S} .cb-mini-st { flex: none; padding: 2px 7px; border-radius: 999px; font-size: 10px; background: #F0F1F8; color: #6B6F99; }
${S} .cb-mini-st-reading { background: #ECEEFB; color: #2E3270; }
${S} .cb-mini-st-done { background: #E6F1EC; color: #2F6B4F; }
${S} .cb-mini-st-fail { background: #FBEAEA; color: #B5473A; }
${S} .cb-fin { display: flex; flex-direction: column; gap: 22px; padding: clamp(24px, 3vw, 36px); border: 1px solid #E8E9F6; border-radius: 24px; background: #FFFFFF; box-shadow: 0 10px 40px rgba(59,63,122,0.08); animation: orbit-fade .3s ease; }
${S} .cb-fin-kicker { font-size: 13px; letter-spacing: .18em; color: #2F6B4F; }
${S} .cb-fin-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
${S} .cb-fin-stat { padding: 16px; border-radius: 14px; background: #F7F7FD; display: flex; flex-direction: column; gap: 4px; }
${S} .cb-fin-stat strong { font-family: var(--font); font-weight: 900; font-size: 28px; }
${S} .cb-fin-stat span { font-size: 13px; color: #6B6F99; }
${S} .cb-fin-stat-indigo { background: #ECEEFB; }
${S} .cb-fin-stat-indigo strong, ${S} .cb-fin-stat-indigo span { color: #2E3270; }
${S} .cb-parse-count { display: flex; justify-content: space-between; font-size: 13px; color: #6B6F99; }
${S} .cb-parse-wait { display: flex; flex-direction: column; gap: 12px; padding-top: 18px; border-top: 1px solid #E8E9F6; font-size: 14px; color: #3B3F7A; }
${S} .cb-actions-tight { gap: 14px; }
${S} .btn.cb-btn-outline { padding: 14px 26px; border: 1px solid #B9BCEB; border-radius: 999px; background: #FFFFFF; color: #2E3270; font-size: 15px; cursor: pointer; }
${S} .btn.cb-btn-outline:hover { background: #F7F7FD; }
${S} .btn.cb-float-pill { position: fixed; right: 20px; bottom: 96px; z-index: 90; display: flex; align-items: center; gap: 12px; padding: 10px 18px 10px 14px; border: 1px solid #E8E9F6; border-radius: 999px; background: rgba(255,255,255,0.96); box-shadow: 0 12px 40px rgba(59,63,122,0.14); backdrop-filter: blur(12px); cursor: pointer; color: #0E1225; animation: orbit-fade .3s ease; }
${S} .btn.cb-float-pill-dark { gap: 10px; padding: 12px 20px; border: 0; background: #0E1225; color: #FFFFFF; font-size: 14px; box-shadow: 0 12px 40px rgba(14,18,37,0.25); }
${S} .btn.cb-float-pill-dark:hover { background: #2E3270; }
${S} .cb-float-copy { display: flex; flex-direction: column; align-items: flex-start; gap: 5px; font-size: 13px; }
${S} .cb-float-track { display: block; width: 140px; height: 4px; border-radius: 999px; background: #ECEEFB; }
${S} .cb-float-track span { display: block; height: 4px; border-radius: 999px; background: #4B4FC7; transition: width .8s ease; }
${S} .cb-modal-scrim { position: fixed; inset: 0; z-index: 150; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(14,18,37,0.45); backdrop-filter: blur(6px); }
${S} .cb-modal { position: relative; width: 100%; max-width: 460px; background: #FFFFFF; border-radius: 24px; padding: 36px; box-shadow: 0 30px 80px rgba(14,18,37,0.3); display: flex; flex-direction: column; gap: 22px; animation: orbit-fade .3s ease; }
${S} .btn.cb-modal-close { position: absolute; top: 16px; right: 16px; width: 34px; height: 34px; border-radius: 50%; background: #F7F7FD; color: #6B6F99; font-size: 18px; cursor: pointer; }
${S} .btn.cb-modal-close:hover { background: #ECEEFB; color: #0E1225; }
${S} .cb-modal-badge { width: 48px; height: 48px; border-radius: 50%; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; font-size: 20px; }
${S} .cb-modal-title { margin: 0; font-family: var(--font); font-weight: 900; font-size: 28px; letter-spacing: -0.03em; }
${S} .cb-p-sm { font-size: 14px; line-height: 1.7; }
${S} .cb-modal-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
${S} .cb-modal-stats .cb-fin-stat { padding: 14px 16px; gap: 2px; }
${S} .cb-modal-stats .cb-fin-stat strong { font-size: 26px; }
${S} .cb-fin-stat-amber { background: #FBF1DC; }
${S} .cb-fin-stat-amber strong, ${S} .cb-fin-stat-amber span { color: #8A6420; }
${S} .cb-modal-actions { display: flex; flex-direction: column; gap: 12px; }
${S} .btn.cb-modal-later { align-self: center; font-size: 14px; color: #6B6F99; }
  ${S} .cb-photo-panel { position: sticky; top: 96px; }
  ${S} .cb-photo-panel { min-height: 0; }
  ${S} .cb-photo-stage { padding: 12px 0; }

${S} .btn.cb-float-pill { position: fixed; right: 20px; bottom: 96px; z-index: 90; }

@media (min-width: 1000px) {
  ${S} .cb-photo-panel { position: sticky; top: 96px; }
}
@media (max-width: 860px) {
  ${S} .cb-photo-panel { min-height: 0; }
  ${S} .cb-photo-stage { padding: 12px 0; }
}
`;

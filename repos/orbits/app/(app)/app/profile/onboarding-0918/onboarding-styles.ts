// 新用户引导样式：取值来自 docs/designs/Orbit_0918/新用户引导.dc.html 的 style=""，
// 前缀 [data-orbit-real-page="onboarding-0918"]（两段选择器，压过 orbit-reference-styles 的控件重置）。
// 注意：本模板字面量的注释里不要写反引号。
const S = '[data-orbit-real-page="onboarding-0918"]';

export const ONBOARDING_STYLES = `
@keyframes orbit-fade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes ob-pulse { 0%, 100% { opacity: .45; } 50% { opacity: 1; } }
${S} { min-height: 100vh; background: #FBFBFE; color: #0E1225; font-family: "Noto Sans SC", "PingFang SC", "Hiragino Sans GB", sans-serif; -webkit-font-smoothing: antialiased; text-wrap: pretty; overflow-x: clip; }
${S} a { color: #3B3F7A; text-decoration: none; }
${S} a:hover { color: #0E1225; }
${S} input, ${S} textarea, ${S} button, ${S} select { font-family: inherit; }
${S} input::placeholder, ${S} textarea::placeholder { color: #9FA3C4; }
${S} .ob-serif { font-family: 'Noto Serif SC', serif; font-weight: 900; }
${S} .ob-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
/* 本页按钮都挂 .btn（按钮 ratchet），但视觉取设计稿：先把 .btn 基类的非设计声明（44px 高、600 字重、8px 间距、nowrap、过渡）中和，
   后面的 ob-* 规则同特异度、顺序在后，逐项覆盖。 */
${S} .btn { align-items: center; justify-content: center; border: 0; border-radius: 0; background: transparent; display: inline-flex; font-size: inherit; font-weight: 400; gap: 0; height: auto; letter-spacing: normal; line-height: normal; padding: 0; text-align: inherit; transition: none; user-select: auto; white-space: normal; }
${S} .btn:active { transform: none; }

/* ── 顶栏（设计 27–41 行）── */
${S} .ob-header { position: sticky; top: 0; z-index: 50; padding: 0; transition: padding .35s ease; }
${S} .ob-header-inner { max-width: 1240px; margin: 0 auto; display: flex; align-items: center; gap: 24px; padding: 18px 40px; border-radius: 999px; background: rgba(251,251,254,0.9); border: 1px solid transparent; box-shadow: none; backdrop-filter: blur(16px); transition: all .35s ease; }
${S} .ob-header-scrolled { padding: 14px 24px; }
${S} .ob-header-scrolled .ob-header-inner { max-width: 1180px; padding: 8px 12px 8px 28px; background: rgba(255,255,255,0.92); border-color: #E8E9F6; box-shadow: 0 12px 40px rgba(59,63,122,0.12); }
${S} .ob-logo { padding: 0; border: 0; background: transparent; cursor: pointer; font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 26px; letter-spacing: -0.03em; color: #0E1225; }
${S} .ob-nav { flex: 1; display: flex; justify-content: center; gap: 40px; font-size: 15px; }
${S} .ob-nav-link { padding: 0; border: 0; background: transparent; cursor: pointer; font-size: 15px; color: #3B3F7A; font-weight: 400; }
${S} .ob-nav-link:hover { color: #0E1225; }
${S} .ob-nav-on { color: #0E1225; font-weight: 500; }
${S} .ob-header-right { display: flex; align-items: center; gap: 18px; }
${S} .ob-lang { padding: 0; border: 0; background: transparent; cursor: pointer; display: flex; align-items: center; gap: 6px; font-size: 15px; color: #3B3F7A; }
${S} .ob-avatar-sm { width: 34px; height: 34px; border: 0; border-radius: 50%; background: #DDDEFA; color: #3B3F7A; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; cursor: pointer; }

${S} .ob-main { max-width: 1240px; margin: 0 auto; padding: 14px 40px 110px; display: flex; flex-direction: column; gap: 26px; }

/* ── 通用按钮 ── */
${S} .ob-btn-dark { padding: 14px 32px; border: 0; border-radius: 999px; background: #0E1225; color: #FFFFFF; font-size: 15px; font-weight: 500; cursor: pointer; transition: opacity .2s ease; }
${S} .ob-btn-dark:hover { background: #2E3270; color: #FFFFFF; }
${S} .ob-btn-dark:disabled { opacity: .35; cursor: default; background: #0E1225; }
${S} .ob-btn-dark-lg { padding: 18px 44px; font-size: 17px; }
${S} .ob-btn-ghost { padding: 13px 20px; border: 1px solid #DDDEFA; border-radius: 999px; background: #FFFFFF; color: #3B3F7A; font-size: 14px; cursor: pointer; }
${S} .ob-btn-ghost:hover { border-color: #B9BCEB; color: #2E3270; }
${S} .ob-btn-ghost:disabled { opacity: .5; cursor: default; }
${S} .ob-btn-soft { padding: 10px 18px; border: 1px solid #B9BCEB; border-radius: 999px; background: #FFFFFF; color: #2E3270; font-size: 13px; cursor: pointer; white-space: nowrap; }
${S} .ob-btn-soft:hover { background: #ECEEFB; }
${S} .ob-btn-soft:disabled { opacity: .5; cursor: default; }
${S} .ob-link-under { padding: 0 0 3px; border: 0; border-bottom: 1px solid #DDDEFA; background: transparent; cursor: pointer; font-size: 15px; color: #6B6F99; }
${S} .ob-link-under:hover { color: #0E1225; }
${S} .ob-link-plain { padding: 0; border: 0; background: transparent; cursor: pointer; font-size: 14px; color: #6B6F99; }
${S} .ob-link-plain:hover { color: #0E1225; }

/* ── 欢迎（设计 46–101 行）── */
${S} .ob-welcome { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 460px), 1fr)); gap: 56px; align-items: center; padding: 40px 0 20px; animation: orbit-fade .35s ease; }
${S} .ob-col { display: flex; flex-direction: column; gap: 28px; }
${S} .ob-kicker { font-size: 13px; letter-spacing: .18em; color: #3B3F7A; }
${S} .ob-h1 { margin: 0; font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: clamp(44px, 5.4vw, 76px); line-height: 1.1; letter-spacing: -0.03em; }
${S} .ob-lead { margin: 0; max-width: 500px; font-size: clamp(16px, 1.4vw, 19px); line-height: 1.7; color: #3B3F7A; }
${S} .ob-steplist { display: flex; flex-direction: column; border-top: 1px solid #E8E9F6; }
${S} .ob-steplist-row { display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; gap: 16px; align-items: center; padding: 16px 0; border-bottom: 1px solid #E8E9F6; }
${S} .ob-steplist-num { font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 18px; color: #9FA3C4; }
${S} .ob-steplist-label { font-size: 16px; }
${S} .ob-steplist-time { font-size: 13px; color: #6B6F99; }
${S} .ob-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 22px; }
${S} .ob-panel { background: #ECEEFB; border-radius: 28px; padding: clamp(20px, 3vw, 44px); }
${S} .ob-panel-card { background: #FFFFFF; border-radius: 20px; padding: 28px; box-shadow: 0 10px 40px rgba(59,63,122,0.08); display: flex; flex-direction: column; gap: 18px; }
${S} .ob-iorbit-head { display: flex; align-items: center; gap: 12px; font-size: 15px; }
${S} .ob-iorbit-head strong { font-size: 19px; font-weight: 700; letter-spacing: -0.01em; }
${S} .ob-spark { color: #4B4FC7; }
${S} .ob-vbar { width: 1px; height: 18px; background: #DDDEFA; }
${S} .ob-muted { color: #6B6F99; }
${S} .ob-faint { color: #9FA3C4; }
${S} .ob-fakeask { display: flex; align-items: center; gap: 12px; padding: 12px 8px 12px 18px; border: 1px solid #DDDEFA; border-radius: 999px; background: #F7F7FD; }
${S} .ob-fakeask-text { flex: 1; font-size: 15px; color: #9FA3C4; }
${S} .ob-fakeask-send { width: 34px; height: 34px; border-radius: 50%; background: #DDDEFA; color: #FFFFFF; display: flex; align-items: center; justify-content: center; font-size: 16px; }
${S} .ob-hr { height: 1px; background: #E8E9F6; }
${S} .ob-gain { display: flex; align-items: center; gap: 16px; padding: 14px 0; border-bottom: 1px solid #EEEFF8; }
${S} .ob-gain:last-child { border-bottom: 0; }
${S} .ob-gain-icon { width: 52px; height: 52px; flex: none; border-radius: 12px; background: #DDDEFA; color: #2E3270; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.05; }
${S} .ob-gain-icon small { font-size: 10px; }
${S} .ob-gain-icon strong { font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 19px; }
${S} .ob-gain-quote { background: #ECEEFB; color: #4B4FC7; font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 34px; line-height: 1; padding-top: 14px; }
${S} .ob-gain-pair { position: relative; width: 52px; height: 52px; flex: none; }
${S} .ob-gain-pair span { position: absolute; width: 34px; height: 34px; border-radius: 50%; border: 2px solid #FFFFFF; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; }
${S} .ob-gain-pair span:first-child { left: 0; top: 4px; background: #ECEEFB; color: #6B6F99; }
${S} .ob-gain-pair span:last-child { right: 0; bottom: 2px; background: #DDDEFA; color: #3B3F7A; }
${S} .ob-gain-body { flex: 1; display: flex; flex-direction: column; gap: 8px; }
${S} .ob-gain-body strong { font-size: 16px; }
${S} .ob-skeleton { display: block; height: 8px; border-radius: 999px; background: #F1F1FA; }
${S} .ob-pill { padding: 6px 12px; border-radius: 999px; background: #F7F7FD; color: #6B6F99; font-size: 12px; white-space: nowrap; }
${S} .ob-pill-deep { background: #2E3270; color: #FFFFFF; }
${S} .ob-pill-soft { background: #ECEEFB; color: #2E3270; }
${S} .ob-tip { display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px; border-radius: 12px; background: #ECEEFB; color: #2E3270; font-size: 14px; line-height: 1.6; }
${S} .ob-tip-sm { font-size: 13px; line-height: 1.7; }

/* ── 设置步骤（设计 104–264 行）── */
${S} .ob-steps { display: flex; flex-direction: column; gap: 26px; animation: orbit-fade .3s ease; }
${S} .ob-progress-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; }
${S} .ob-progress { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; font-size: 14px; color: #6B6F99; }
${S} .ob-bars { display: flex; gap: 6px; }
${S} .ob-bar { display: block; width: 44px; height: 5px; border-radius: 999px; background: #DDDEFA; transition: background .3s ease; }
${S} .ob-bar-on { background: #4B4FC7; }
${S} .ob-grid { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(300px, 1fr); gap: 22px; align-items: start; }
${S} .ob-card { border: 1px solid #E8E9F6; border-radius: 24px; background: #FFFFFF; padding: clamp(24px, 3vw, 40px); display: flex; flex-direction: column; gap: 28px; }
${S} .ob-stack { display: flex; flex-direction: column; gap: 26px; }
${S} .ob-head { display: flex; flex-direction: column; gap: 10px; }
${S} .ob-h2 { margin: 0; font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: clamp(28px, 3vw, 38px); letter-spacing: -0.03em; }
${S} .ob-p { margin: 0; font-size: 15px; line-height: 1.65; color: #3B3F7A; }
${S} .ob-autofill { align-self: flex-start; display: flex; align-items: center; gap: 12px; padding: 12px 18px; border: 1px solid #DDDEFA; border-radius: 14px; background: #F7F7FD; color: #2E3270; font-size: 14px; cursor: pointer; }
${S} .ob-autofill:hover { border-color: #B9BCEB; background: #ECEEFB; }
${S} .ob-autofill:disabled { cursor: default; opacity: .6; }
${S} .ob-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); gap: 16px 20px; }
${S} .ob-field { display: flex; flex-direction: column; gap: 9px; font-size: 13px; font-weight: 500; color: #3B3F7A; min-width: 0; }
${S} .ob-field-label { display: flex; align-items: center; gap: 10px; }
${S} .ob-required { padding: 3px 9px; border-radius: 999px; background: #FBEAEA; color: #B5473A; font-size: 12px; font-weight: 500; }
${S} .ob-input { padding: 14px 16px; border: 1px solid #DDDEFA; border-radius: 12px; background: #F7F7FD; font-size: 15px; color: #0E1225; outline: none; width: 100%; min-height: 50px; }
${S} .ob-input:focus { border-color: #4B4FC7; background: #FFFFFF; }
${S} .ob-input:disabled { opacity: .6; }
${S} select.ob-input { appearance: none; -webkit-appearance: none; padding-right: 42px; cursor: pointer; background-image: linear-gradient(45deg, transparent 50%, #3B3F7A 50%), linear-gradient(135deg, #3B3F7A 50%, transparent 50%); background-position: calc(100% - 22px) 50%, calc(100% - 17px) 50%; background-size: 5px 5px, 5px 5px; background-repeat: no-repeat; }
${S} textarea.ob-input { line-height: 1.7; resize: vertical; }
${S} .ob-count { align-self: flex-end; font-size: 12px; font-weight: 400; color: #9FA3C4; }
${S} .ob-count-over { color: #B5473A; }
${S} .ob-label { font-size: 13px; font-weight: 500; color: #3B3F7A; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
${S} .ob-label-note { font-weight: 400; color: #6B6F99; }
${S} .ob-group { display: flex; flex-direction: column; gap: 12px; }
${S} .ob-group-title { font-size: 12px; letter-spacing: .12em; color: #9FA3C4; }
${S} .ob-chips { display: flex; flex-wrap: wrap; gap: 10px; }
${S} .ob-chip { display: inline-flex; align-items: center; gap: 6px; padding: 11px 18px; border: 1px solid #E8E9F6; border-radius: 999px; background: #FFFFFF; color: #3B3F7A; font-size: 14px; cursor: pointer; transition: all .2s ease; }
${S} .ob-chip:hover { border-color: #B9BCEB; }
${S} .ob-chip-suggest { border-color: #B9BCEB; }
${S} .ob-chip-mark { color: #4B4FC7; }
${S} .ob-chip-on, ${S} .ob-chip-on:hover { background: #0E1225; color: #FFFFFF; border-color: #0E1225; }
${S} .ob-chip-on .ob-chip-mark { color: #C9CBEF; }
${S} .ob-chip:disabled { cursor: default; opacity: .4; }
${S} .ob-chip-add { display: inline-flex; align-items: center; gap: 6px; padding: 4px 6px 4px 16px; border: 1px dashed #B9BCEB; border-radius: 999px; background: #F7F7FD; }
${S} .ob-chip-add input { width: 150px; border: 0; outline: none; background: transparent; font-size: 14px; color: #0E1225; padding: 6px 0; }
${S} .ob-chip-add button { padding: 6px 12px; border: 0; border-radius: 999px; background: #ECEEFB; color: #2E3270; font-size: 13px; cursor: pointer; }
${S} .ob-chip-add button:disabled { opacity: .5; cursor: default; }
${S} .ob-seg { display: flex; gap: 6px; padding: 4px; border-radius: 999px; background: #F7F7FD; border: 1px solid #E8E9F6; align-self: flex-start; }
${S} .ob-seg-btn { padding: 8px 18px; border: 0; border-radius: 999px; background: transparent; color: #6B6F99; font-size: 14px; cursor: pointer; box-shadow: none; }
${S} .ob-seg-on { background: #FFFFFF; color: #0E1225; box-shadow: 0 1px 4px rgba(59,63,122,0.15); }
${S} .ob-footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; padding-top: 22px; border-top: 1px solid #E8E9F6; }
${S} .ob-footer-right { display: flex; flex-wrap: wrap; align-items: center; gap: 18px; }
${S} .ob-notice { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 12px; font-size: 14px; line-height: 1.6; }
${S} .ob-notice-error { background: #FBEAEA; color: #B5473A; }
${S} .ob-notice-info { background: #F7F7FD; color: #3B3F7A; }
${S} .ob-notice-warning { background: #FBF1DC; color: #8A6420; }

/* ── AI 介绍（设计外新增屏，沿用步骤卡口径）── */
${S} .ob-ai-box { display: flex; flex-direction: column; gap: 18px; padding: 22px; border: 1px solid #DDDEFA; border-radius: 18px; background: linear-gradient(180deg, #F7F7FD 0%, #FFFFFF 70%); }
${S} .ob-ai-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
${S} .ob-ai-status { display: flex; align-items: center; gap: 10px; font-size: 14px; color: #2E3270; }
${S} .ob-ai-loading { display: flex; flex-direction: column; gap: 12px; padding: 6px 0; }
${S} .ob-ai-loading .ob-skeleton { height: 14px; animation: ob-pulse 1.4s ease infinite; }

/* ── 侧栏「iOrbit 对你的理解」（设计 239–261 行）── */
${S} .ob-aside { position: sticky; top: 96px; border: 1px solid #E8E9F6; border-radius: 24px; background: #FFFFFF; padding: 24px; display: flex; flex-direction: column; gap: 18px; box-shadow: 0 10px 40px rgba(59,63,122,0.06); }
${S} .ob-aside-title { display: flex; flex-direction: column; gap: 4px; }
${S} .ob-aside-title strong { font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 19px; letter-spacing: -0.02em; }
${S} .ob-aside-person { display: flex; align-items: center; gap: 14px; padding-bottom: 18px; border-bottom: 1px solid #E8E9F6; }
${S} .ob-avatar { width: 52px; height: 52px; flex: none; border-radius: 50%; background: #DDDEFA; color: #2E3270; display: flex; align-items: center; justify-content: center; font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 20px; }
${S} .ob-aside-sec { display: flex; flex-direction: column; gap: 8px; }
${S} .ob-aside-label { font-size: 12px; letter-spacing: .12em; color: #6B6F99; }
${S} .ob-aside-val { font-size: 13px; line-height: 1.6; color: #3B3F7A; }
${S} .ob-aside-empty { color: #9FA3C4; }
${S} .ob-mini-chips { display: flex; flex-wrap: wrap; gap: 6px; }
${S} .ob-mini-chip { padding: 5px 10px; border-radius: 999px; background: #ECEEFB; color: #2E3270; font-size: 12px; }
${S} .ob-aside-two { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
${S} .ob-aside-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding-top: 16px; border-top: 1px solid #E8E9F6; }

/* ── 人脉步：只开放扫描名片 ── */
${S} .ob-sources { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 250px), 1fr)); gap: 12px; }
${S} .ob-source { display: flex; align-items: center; gap: 14px; padding: 16px; border: 1px solid #4B4FC7; border-radius: 16px; background: #F7F7FD; text-align: left; }
${S} .ob-source-off { border-color: #E8E9F6; background: #FFFFFF; opacity: .6; }
${S} .ob-source-glyph { width: 42px; height: 42px; flex: none; border-radius: 12px; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; }
${S} .ob-source-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
${S} .ob-source-body strong { font-size: 15px; font-weight: 500; color: #0E1225; }
${S} .ob-source-body span { font-size: 12px; color: #6B6F99; }
${S} .ob-check { width: 22px; height: 22px; flex: none; border-radius: 50%; border: 1px solid #4B4FC7; background: #4B4FC7; color: #FFFFFF; display: flex; align-items: center; justify-content: center; font-size: 12px; }

/* ── 预览（设计 322–503 行）── */
${S} .ob-preview { display: flex; flex-direction: column; gap: 26px; animation: orbit-fade .3s ease; cursor: pointer; }
${S} .ob-preview-banner { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 14px; padding: 14px 18px 14px 20px; border-radius: 16px; background: #0E1225; color: #FFFFFF; font-size: 14px; line-height: 1.6; }
${S} .ob-preview-banner .ob-btn-soft { border-color: #FFFFFF; }
${S} .ob-preview-top { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 24px; }
${S} .ob-preview-h1 { margin: 0; font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: clamp(34px, 4vw, 46px); line-height: 1.1; letter-spacing: -0.03em; }
${S} .ob-ask { display: flex; align-items: center; gap: 12px; padding: 12px 16px 12px 20px; border: 1px solid #DDDEFA; border-radius: 999px; background: #FFFFFF; box-shadow: 0 6px 24px rgba(59,63,122,0.06); }
${S} .ob-ask-text { flex: 1; min-width: 0; font-size: 15px; color: #9FA3C4; }
${S} .ob-ask-go { width: 36px; height: 36px; border-radius: 50%; background: #ECEEFB; color: #2E3270; font-size: 15px; display: flex; align-items: center; justify-content: center; }
${S} .ob-quick { padding: 9px 16px; border: 1px solid #E8E9F6; border-radius: 999px; background: #FFFFFF; color: #3B3F7A; font-size: 13px; cursor: pointer; }
${S} .ob-quick:hover { border-color: #B9BCEB; color: #2E3270; }
${S} .ob-two { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 460px), 1fr)); gap: 20px; align-items: stretch; }
${S} .ob-sec { border: 1px solid #E8E9F6; border-radius: 20px; background: #FFFFFF; padding: 22px 24px; display: flex; flex-direction: column; gap: 16px; }
${S} .ob-sec-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding-bottom: 16px; border-bottom: 1px solid #E8E9F6; }
${S} .ob-sec-title { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
${S} .ob-sec-title strong { font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 19px; letter-spacing: -0.02em; }
${S} .ob-sec-icon { width: 30px; height: 30px; border-radius: 9px; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; font-size: 14px; }
${S} .ob-sample { padding: 3px 9px; border-radius: 999px; border: 1px dashed #B9BCEB; color: #6B6F99; font-size: 11px; letter-spacing: .08em; }
${S} .ob-track { display: block; height: 6px; border-radius: 999px; background: #ECEEFB; }
${S} .ob-track span { display: block; height: 6px; border-radius: 999px; background: #4B4FC7; transition: width .4s ease; }
${S} .ob-plan-row { display: flex; align-items: center; gap: 14px; padding: 13px 0; border-top: 1px solid #F1F1FA; }
${S} .ob-dot { width: 22px; height: 22px; flex: none; border-radius: 50%; border: 1px solid #DDDEFA; background: #FFFFFF; color: #FFFFFF; display: flex; align-items: center; justify-content: center; font-size: 12px; }
${S} .ob-dot-on { border-color: #4B4FC7; background: #4B4FC7; }
${S} .ob-plan-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
${S} .ob-plan-body strong { font-size: 15px; font-weight: 500; color: #0E1225; }
${S} .ob-plan-done strong { color: #9FA3C4; text-decoration: line-through; }
${S} .ob-plan-body span { font-size: 12px; color: #6B6F99; }
${S} .ob-orbit { border-radius: 20px; background: #ECEEFB; padding: 28px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px; text-align: center; }
${S} .ob-rings { position: relative; width: 220px; height: 220px; }
${S} .ob-ring { position: absolute; inset: 0; border-radius: 50%; border: 1px dashed #B9BCEB; }
${S} .ob-ring-2 { inset: 18%; }
${S} .ob-core { position: absolute; inset: 36%; border-radius: 50%; background: #0E1225; color: #FFFFFF; display: flex; align-items: center; justify-content: center; font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 24px; }
${S} .ob-orbit-copy { display: flex; flex-direction: column; gap: 6px; align-items: center; }
${S} .ob-orbit-copy strong { font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 21px; letter-spacing: -0.02em; }
${S} .ob-orbit-copy span { max-width: 340px; font-size: 14px; line-height: 1.65; color: #3B3F7A; }
${S} .ob-events { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 14px; }
${S} .ob-event { display: flex; flex-direction: column; gap: 14px; padding: 18px; border: 1px solid #E8E9F6; border-radius: 16px; background: #FFFFFF; }
${S} .ob-event-top { display: flex; gap: 14px; align-items: center; }
${S} .ob-event-date { width: 62px; height: 58px; flex: none; border-radius: 12px; background: #ECEEFB; color: #2E3270; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.1; }
${S} .ob-event-date small { font-size: 11px; }
${S} .ob-event-date strong { font-size: 20px; font-family: 'Noto Serif SC', serif; font-weight: 900; }
${S} .ob-event-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
${S} .ob-event-copy strong { font-size: 15px; font-weight: 500; }
${S} .ob-event-copy span { font-size: 12px; color: #6B6F99; }
${S} .ob-reason { display: flex; gap: 10px; padding: 12px 14px; border-radius: 12px; background: #F7F7FD; font-size: 13px; line-height: 1.6; color: #3B3F7A; }
${S} .ob-event-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 12px; color: #6B6F99; }
${S} .ob-empty-block { display: flex; flex-direction: column; align-items: flex-start; gap: 14px; padding: 6px 0; }
${S} .ob-empty-block > span:first-child { font-size: 15px; color: #0E1225; }
${S} .ob-empty-block > span:nth-child(2) { font-size: 13px; line-height: 1.7; color: #6B6F99; }
${S} .ob-net-hero { border-radius: 28px; background: #ECEEFB; padding: clamp(28px, 4vw, 56px); display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr)); gap: 40px; align-items: center; }
${S} .ob-net-h2 { margin: 0; font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: clamp(30px, 3.6vw, 46px); line-height: 1.2; letter-spacing: -0.03em; }
${S} .ob-net-way { display: flex; align-items: center; gap: 14px; padding: 16px; border: 0; border-radius: 16px; background: #FFFFFF; text-align: left; cursor: pointer; width: 100%; }
${S} .ob-net-way:hover { box-shadow: 0 8px 24px rgba(59,63,122,0.1); }
${S} .ob-net-way-icon { width: 38px; height: 38px; flex: none; border-radius: 11px; background: #ECEEFB; color: #4B4FC7; display: flex; align-items: center; justify-content: center; }
${S} .ob-net-way-body { flex: 1; display: flex; flex-direction: column; gap: 3px; }
${S} .ob-net-way-body strong { font-size: 15px; font-weight: 500; color: #0E1225; }
${S} .ob-net-way-body span { font-size: 13px; color: #6B6F99; }
${S} .ob-net-orbit { position: relative; width: min(100%, 360px); aspect-ratio: 1; justify-self: center; }
${S} .ob-net-orbit .ob-ring-2 { inset: 16%; }
${S} .ob-net-orbit .ob-ring-3 { position: absolute; inset: 32%; border-radius: 50%; border: 1px solid #DDDEFA; background: #F7F7FD; }
${S} .ob-net-core { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 76px; height: 76px; border-radius: 50%; background: #0E1225; color: #FFFFFF; display: flex; align-items: center; justify-content: center; font-family: 'Noto Serif SC', serif; font-weight: 900; font-size: 28px; }
${S} .ob-net-count { position: absolute; left: 50%; top: 100%; transform: translate(-50%, 14px); white-space: nowrap; font-size: 13px; color: #6B6F99; }
${S} .ob-net-head-btns { display: flex; gap: 12px; }
${S} .ob-btn-square { padding: 13px 22px; border: 1px solid #DDDEFA; border-radius: 12px; background: #FFFFFF; color: #2E3270; font-size: 15px; font-weight: 500; cursor: pointer; }
${S} .ob-btn-square:hover { background: #ECEEFB; }
${S} .ob-btn-square-dark { border: 0; background: #0E1225; color: #FFFFFF; }
${S} .ob-btn-square-dark:hover { background: #2E3270; }
${S} .ob-person { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; padding: 10px 0; }
${S} .ob-person-avatar { width: 48px; height: 48px; flex: none; border-radius: 50%; background: #F7F7FD; border: 1px solid #DDDEFA; color: #3B3F7A; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px; }
${S} .ob-person-main { flex: 1; min-width: 180px; display: flex; flex-direction: column; gap: 3px; }
${S} .ob-person-main strong { font-size: 16px; }
${S} .ob-person-main span { font-size: 13px; color: #6B6F99; }
${S} .ob-person-why { flex: 1.4; min-width: 220px; font-size: 13px; line-height: 1.6; color: #3B3F7A; }
${S} .ob-fine { padding-top: 12px; border-top: 1px solid #F1F1FA; font-size: 12px; color: #9FA3C4; }

/* ── 从内联样式收拢的类（scale ratchet 只数 style 对象里的字面量）── */
${S} .ob-caret { font-size: 11px; }
${S} .ob-spark-lg { font-size: 18px; }
${S} .ob-gain-lead { font-size: 15px; color: #3B3F7A; }
${S} .ob-privacy { font-size: 13px; }
${S} .ob-group-tight { gap: 10px; }
${S} .ob-link-under-strong { font-size: 14px; color: #3B3F7A; border-bottom-color: #B9BCEB; }
${S} .ob-aside-heading { display: flex; align-items: center; gap: 10px; }
${S} .ob-aside-sub { font-size: 12px; color: #9FA3C4; }
${S} .ob-aside-who { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
${S} .ob-aside-who strong { font-size: 16px; color: #0E1225; }
${S} .ob-aside-who strong.ob-aside-empty { color: #9FA3C4; }
${S} .ob-aside-line { font-size: 13px; color: #6B6F99; }
${S} .ob-aside-line.ob-aside-empty { color: #9FA3C4; }
${S} .ob-aside-headline { font-size: 13px; color: #3B3F7A; }
${S} .ob-aside-focus { line-height: 1.7; }
${S} .ob-banner-actions { display: flex; gap: 10px; flex-wrap: wrap; }
${S} .ob-note { font-size: 13px; color: #6B6F99; }
${S} .ob-date { font-size: 14px; color: #6B6F99; }
${S} .ob-col-tight { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
${S} .ob-col-ask { display: flex; flex-direction: column; gap: 14px; }
${S} .ob-p-lg { font-size: 16px; }
${S} .ob-btn-soft-sm { padding: 8px 14px; }
${S} .ob-btn-dark-md { padding: 11px 18px; font-size: 14px; }
${S} .ob-btn-dark-sm { padding: 9px 18px; font-size: 13px; }
${S} .ob-net-top { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 16px; }
${S} .ob-col-title { display: flex; flex-direction: column; gap: 8px; }
${S} .ob-net-title { font-size: 40px; }
${S} .ob-net-copy { display: flex; flex-direction: column; gap: 22px; }
${S} .ob-net-p { max-width: 460px; line-height: 1.7; }
${S} .ob-net-ways { display: flex; flex-direction: column; gap: 10px; }

/* ── 禁用态：压过 [data-orbit-real-page] .btn[disabled]（0,3,0）的灰底 ── */
${S} .btn.ob-btn-dark[disabled] { background: #0E1225; color: #FFFFFF; border-color: transparent; opacity: .35; cursor: default; }
${S} .btn.ob-btn-ghost[disabled] { background: #FFFFFF; color: #3B3F7A; border-color: #DDDEFA; opacity: .5; cursor: default; }
${S} .btn.ob-btn-soft[disabled] { background: #FFFFFF; color: #2E3270; border-color: #B9BCEB; opacity: .5; cursor: default; }
${S} .btn.ob-autofill[disabled] { background: #F7F7FD; color: #2E3270; border-color: #DDDEFA; opacity: .6; cursor: default; }
${S} .btn.ob-chip[disabled] { background: #FFFFFF; color: #3B3F7A; border-color: #E8E9F6; opacity: .4; cursor: default; }
${S} .btn.ob-chip-add-btn[disabled] { background: #ECEEFB; color: #2E3270; opacity: .5; cursor: default; }

${S} .ob-toast { position: fixed; left: 50%; bottom: 80px; transform: translateX(-50%); z-index: 200; padding: 12px 22px; border-radius: 999px; background: #0E1225; color: #FFFFFF; font-size: 14px; box-shadow: 0 18px 40px rgba(14,18,37,0.25); }

@media (max-width: 860px) {
  ${S} .ob-grid { grid-template-columns: minmax(0, 1fr); }
  ${S} .ob-aside { position: static; }
  ${S} .ob-nav { gap: 18px; }
  ${S} .ob-main { padding: 14px 16px 90px; }
  ${S} .ob-header-inner { padding: 14px 16px; gap: 12px; }
}
@media (max-width: 560px) {
  ${S} .ob-nav { display: none; }
}
`;

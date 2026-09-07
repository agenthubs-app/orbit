"use client";

// Faithful React migration of "iOrbit Starfield (Mobile).html" (mobile homepage reference), de-shelled per approval: phone mockup frame, centering backdrop and dynamic island removed; all inner geometry values untouched.
// The scene DOM and inline styles below are a mechanical conversion of the
// reference template (docs/designs); product chrome is intentionally excluded
// and comes from the shared OrbitTopNav mounted by orbit-starfield-home.tsx.
// Runtime behavior is transplanted in ./orbit-starfield-mobile-logic.

import { useEffect, useRef } from "react";
import { runStarfieldMobile } from "./orbit-starfield-mobile-logic";

// Reference functional CSS, values verbatim; selectors mechanically scoped
// (html/body rules via :has(), class rules under #skRoot).
const mobileCss = `html:has(.sk-home-mobile),body:has(.sk-home-mobile){margin:0;padding:0;min-height:100%;background:#04030a;-webkit-font-smoothing:antialiased;}
body:has(.sk-home-mobile){overscroll-behavior:none;}
#skRoot,#skRoot *{box-sizing:border-box;}
/* Route /app inherits app/globals.css element styling (button/input/svg/canvas,
   focus ring); the reference assumes UA defaults. Revert inside the starfield
   so / and /app render identically. Inline styles are unaffected by revert. */
#skRoot button,#skRoot input,#skRoot select,#skRoot textarea,#skRoot img,#skRoot svg,#skRoot canvas{all:revert;box-sizing:border-box;}
#skRoot :focus-visible{box-shadow:none;outline:revert;}
#skRoot ::selection{background:rgba(139,123,240,0.30);}
@property --skAng{syntax:'<angle>';inherits:false;initial-value:0deg;}
@keyframes skFlow{to{--skAng:360deg;}}
@keyframes skCaret{0%,100%{opacity:1;}50%{opacity:0;}}
@keyframes skCue{0%,100%{transform:translateY(0);opacity:.45;}50%{transform:translateY(6px);opacity:1;}}
@keyframes skSpin{to{transform:rotate(360deg);}}
@keyframes skFloat{0%,100%{transform:translateY(0);}50%{transform:translateY(-5px);}}
@keyframes skTwk{0%,100%{opacity:.32;}50%{opacity:1;}}
#skChips::-webkit-scrollbar{display:none;}
@media (min-width:768px){.sk-home-mobile{display:none;}}`;

export function OrbitStarfieldMobile({
  active,
  authenticated,
}: {
  active: boolean;
  authenticated: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active || !hostRef.current) return;
    return runStarfieldMobile(hostRef.current);
  }, [active]);

  return (
    <div className="sk-home-mobile">
      <link rel="stylesheet" href="/iorbit-starfield/fonts/mobile.css" />
      <style>{mobileCss}</style>
      <div ref={hostRef} id="skRoot" style={{"fontFamily":"'Noto Sans SC',system-ui,-apple-system,sans-serif","color":"#eceaf6","background":"#06050d","position":"fixed","inset":"0","overflow":"hidden"}} data-screen-label="iOrbit 移动端">
        {' '}
        {' '}
        {/* FIXED CANVAS SCENE */}
        {' '}
        <div id="skScene" style={{"position":"absolute","inset":"0","zIndex":"1","overflow":"hidden","background":"radial-gradient(130% 100% at 50% 14%, #14122a 0%, #0d0b1e 42%, #08070f 72%, #06050d 100%)"}}>
          {' '}
          <canvas id="skCanvas" style={{"position":"absolute","inset":"0","width":"100%","height":"100%","display":"block"}}>
          </canvas>
          {' '}
          <div id="skFog" style={{"position":"absolute","inset":"0","pointerEvents":"none","opacity":"0"}}>
          </div>
          {' '}
        </div>
        {' '}
        {/* DOT NAV */}
        {' '}
        <div id="skDots" style={{"position":"absolute","right":"16px","top":"50%","transform":"translateY(-50%)","zIndex":"40","display":"flex","flexDirection":"column","gap":"14px"}}>
        </div>
        {' '}
        {/* FIXED UI OVERLAYS */}
        {' '}
        <div id="skUI" style={{"position":"absolute","inset":"0","zIndex":"5","pointerEvents":"none"}}>
          {' '}
          {/* HERO */}
          {' '}
          <div id="skHero" style={{"position":"absolute","top":"15.5%","left":"50%","transform":"translateX(-50%)","width":"90%","textAlign":"center"}}>
            {' '}
            <div id="skKicker" data-i18n-html="kickerHtml" style={{"fontFamily":"'JetBrains Mono',monospace","fontSize":"9.5px","letterSpacing":".2em","textTransform":"uppercase","color":"#c6a06a","marginBottom":"22px","opacity":"0","whiteSpace":"nowrap"}}>
              {"Relationship Starfield  ·  人脉星空"}
            </div>
            {' '}
            <h1 id="skH1" data-serif="" data-i18n-html="h1Html" style={{"fontFamily":"'Noto Serif SC',Georgia,serif","fontWeight":"300","fontSize":"26px","lineHeight":"1.28","letterSpacing":".005em","color":"#f1eff9","margin":"0","textWrap":"balance"}}>
              {' '}
              <span className="sk-word" style={{"display":"inline-block","opacity":"0"}}>
                {"从你认识的人里，"}
              </span>
              <span className="sk-word" style={{"display":"inline-block","opacity":"0"}}>
                {"找出现在"}
              </span>
              <br />
              <span className="sk-word" style={{"display":"inline-block","opacity":"0"}}>
                {"最值得联系的"}
              </span>
              <span className="sk-word" style={{"display":"inline-block","fontWeight":"500","color":"#fff","opacity":"0"}}>
                {"3 位"}
              </span>
              {' '}
            </h1>
            {' '}
            <div id="skSub" style={{"margin":"18px auto 0","maxWidth":"600px","opacity":"0"}}>
              {' '}
              <div style={{"fontFamily":"'Newsreader',Georgia,serif","fontStyle":"italic","fontSize":"16px","color":"#c8c4dd","letterSpacing":".01em"}}>
                {"Your network, in orbit."}
              </div>
              {' '}
              <div data-i18n="subText" style={{"marginTop":"9px","fontSize":"14.5px","lineHeight":"1.7","color":"#a6a3bd"}}>
                {"基于你已授权的人脉、活动与跟进记录，给出联系人、依据和可编辑消息草稿。"}
              </div>
              {' '}
            </div>
            {' '}
          </div>
          {' '}
          {/* FIELD (input — centered, lower) */}
          {' '}
          <div id="skFieldWrap" style={{"position":"absolute","bottom":"15%","left":"50%","transform":"translateX(-50%)","width":"88%","textAlign":"center","opacity":"0","zIndex":"20"}}>
            {' '}
            <div style={{"position":"relative"}}>
              {' '}
              <div style={{"position":"absolute","inset":"-14px","borderRadius":"30px","border":"1px solid rgba(139,123,240,0.12)","pointerEvents":"none"}}>
              </div>
              {' '}
              <div style={{"position":"absolute","inset":"-28px","borderRadius":"44px","border":"1px solid rgba(139,123,240,0.06)","pointerEvents":"none"}}>
              </div>
              {' '}
              <div style={{"position":"absolute","inset":"-14px","borderRadius":"30px","padding":"1px","background":"conic-gradient(from var(--skAng,0deg),transparent 0deg,rgba(139,123,240,.22) 34deg,transparent 78deg,transparent 180deg,rgba(139,123,240,.22) 214deg,transparent 258deg,transparent 360deg)","WebkitMask":"linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0)","WebkitMaskComposite":"xor","maskComposite":"exclude","animation":"skFlow 16s linear infinite","pointerEvents":"none"}}>
              </div>
              {' '}
              <div id="skField" style={{"position":"relative","display":"flex","alignItems":"center","gap":"8px","background":"rgba(255,255,255,0.035)","border":"1px solid rgba(150,145,200,0.15)","borderRadius":"14px","padding":"8px 8px 8px 15px","backdropFilter":"blur(16px)","WebkitBackdropFilter":"blur(16px)","boxShadow":"0 0 60px -26px rgba(120,108,240,0.5),inset 0 1px 0 rgba(255,255,255,0.05)"}}>
                {' '}
                <svg viewBox="0 0 24 24" fill="none" style={{"width":"18px","height":"18px","flex":"0 0 auto","color":"#9389d6","opacity":".85"}}>
                  <path d="M12 3l1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6z" fill="currentColor">
                  </path>
                </svg>
                {' '}
                <input
                  id="skPromptInput"
                  aria-describedby="skPromptScope"
                  aria-label="告诉 iOrbit 你现在想促成的事"
                  autoComplete="off"
                  placeholder="例如：现在最值得联系谁？"
                  style={{"flex":"1","minWidth":"0","border":"0","outline":"none","background":"transparent","padding":"0","textAlign":"left","fontFamily":"inherit","fontSize":"14.5px","lineHeight":"1.4","color":"#eeecf7"}}
                  type="text"
                />
                {' '}
                <button id="skEnter" type="button" aria-label="发送给 iOrbit" style={{"flex":"0 0 auto","width":"32px","height":"32px","padding":"0","borderRadius":"50%","background":"rgba(139,123,240,0.14)","border":"1px solid rgba(150,140,255,0.4)","color":"#c7c0ff","display":"flex","alignItems":"center","justifyContent":"center","cursor":"pointer","pointerEvents":"auto","transition":"background .2s,border-color .2s,transform .2s"}} style-hover="background:rgba(139,123,240,0.28);border-color:rgba(160,150,255,0.8);color:#fff;transform:scale(1.06);">
                  {' '}
                  <svg viewBox="0 0 24 24" fill="none" style={{"width":"18px","height":"18px","display":"block"}}>
                    <path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    </path>
                  </svg>
                  {' '}
                </button>
                {' '}
              </div>
              {' '}
            </div>
            {' '}
            <div id="skChips" style={{"marginTop":"16px","display":"flex","gap":"9px","flexWrap":"nowrap","overflowX":"auto","justifyContent":"flex-start","padding":"2px 2px 8px","pointerEvents":"auto","scrollbarWidth":"none","WebkitOverflowScrolling":"touch","WebkitMask":"linear-gradient(90deg,transparent,#000 18px,#000 calc(100% - 18px),transparent)","mask":"linear-gradient(90deg,transparent,#000 18px,#000 calc(100% - 18px),transparent)"}}>
              {' '}
              <button className="sk-chip" style={{"flex":"0 0 auto","whiteSpace":"nowrap","padding":"10px 16px","borderRadius":"999px","border":"1px solid rgba(160,156,200,0.26)","background":"rgba(255,255,255,0.045)","color":"#ddd9ee","fontSize":"13px","cursor":"pointer","fontFamily":"inherit","backdropFilter":"blur(8px)","WebkitBackdropFilter":"blur(8px)"}} style-hover="border-color:rgba(150,138,245,0.55);color:#fff;background:rgba(255,255,255,0.10);" data-i18n="chip0">
                {"我要创业"}
              </button>
              {' '}
              <button className="sk-chip" style={{"flex":"0 0 auto","whiteSpace":"nowrap","padding":"10px 16px","borderRadius":"999px","border":"1px solid rgba(160,156,200,0.26)","background":"rgba(255,255,255,0.045)","color":"#ddd9ee","fontSize":"13px","cursor":"pointer","fontFamily":"inherit","backdropFilter":"blur(8px)","WebkitBackdropFilter":"blur(8px)"}} style-hover="border-color:rgba(150,138,245,0.55);color:#fff;background:rgba(255,255,255,0.10);" data-i18n="chip1">
                {"看看谁能帮我"}
              </button>
              {' '}
              <button className="sk-chip" style={{"flex":"0 0 auto","whiteSpace":"nowrap","padding":"10px 16px","borderRadius":"999px","border":"1px solid rgba(160,156,200,0.26)","background":"rgba(255,255,255,0.045)","color":"#ddd9ee","fontSize":"13px","cursor":"pointer","fontFamily":"inherit","backdropFilter":"blur(8px)","WebkitBackdropFilter":"blur(8px)"}} style-hover="border-color:rgba(150,138,245,0.55);color:#fff;background:rgba(255,255,255,0.10);" data-i18n="chip2">
                {"找金融 AI 方向的人脉"}
              </button>
              {' '}
              <button className="sk-chip" style={{"flex":"0 0 auto","whiteSpace":"nowrap","padding":"10px 16px","borderRadius":"999px","border":"1px solid rgba(160,156,200,0.26)","background":"rgba(255,255,255,0.045)","color":"#ddd9ee","fontSize":"13px","cursor":"pointer","fontFamily":"inherit","backdropFilter":"blur(8px)","WebkitBackdropFilter":"blur(8px)"}} style-hover="border-color:rgba(150,138,245,0.55);color:#fff;background:rgba(255,255,255,0.10);" data-i18n="chip3">
                {"推荐 AI / 出海活动"}
              </button>
              {' '}
            </div>
            <div id="skPromptScope" data-i18n="promptScope" role="status" aria-live="polite" style={{"marginTop":"7px","fontSize":"11.5px","lineHeight":"1.45","color":"#c4c0d8","pointerEvents":"auto"}}>
              {"示例只会填入输入框，不会自动执行。"}
            </div>
            {' '}
          </div>
          {' '}
          {/* PROCESSING SIGNATURE (input -> compute -> output) */}
          {' '}
          <div id="skProc" style={{"position":"absolute","left":"50%","top":"50%","transform":"translateX(-50%)","zIndex":"6","display":"flex","alignItems":"center","gap":"10px","padding":"8px 17px","borderRadius":"999px","background":"rgba(12,10,22,0.55)","border":"1px solid rgba(139,123,240,0.22)","backdropFilter":"blur(10px)","WebkitBackdropFilter":"blur(10px)","opacity":"0","whiteSpace":"normal","maxWidth":"300px","textAlign":"center","boxShadow":"0 0 34px -16px rgba(139,123,240,0.7)"}}>
            {' '}
            <span style={{"width":"6px","height":"6px","borderRadius":"50%","background":"#8b7bf0","boxShadow":"0 0 8px #8b7bf0","flex":"0 0 auto"}}>
            </span>
            {' '}
            <span id="skProcTxt" style={{"fontFamily":"'JetBrains Mono',monospace","fontSize":"11.5px","letterSpacing":".05em","color":"#cdc8ec"}}>
            </span>
            {' '}
          </div>
          {' '}
          {/* DEMO CARDS (toC recommendations · mobile carousel) */}
          {' '}
          <div id="skDemo" style={{"position":"absolute","left":"50%","transform":"translateX(-50%)"}}>
          </div>
          {' '}
          <div id="skDemoDots" style={{"position":"absolute","left":"50%","transform":"translateX(-50%)","display":"flex","gap":"7px","alignItems":"center","opacity":"0","pointerEvents":"auto","zIndex":"9"}}>
          </div>
          {' '}
          {/* ORBIT CARDS */}
          {' '}
          <div id="skOrbitCards">
          </div>
          {' '}
          {/* MOBILE SINGLE ORBIT CARD */}
          {' '}
          <div id="skMobCard" style={{"position":"absolute","left":"50%","top":"50%","transform":"translateX(-50%)","width":"88%","maxWidth":"348px","opacity":"0","pointerEvents":"none","zIndex":"7"}}>
          </div>
          {' '}
          {/* STEP STARS */}
          {' '}
          <div id="skSteps">
          </div>
          {' '}
          {/* TIP (hover) */}
          {' '}
          <div id="skTip" style={{"position":"absolute","left":"0","top":"0","padding":"7px 13px","borderRadius":"11px","background":"rgba(14,12,24,0.82)","border":"1px solid rgba(150,145,200,0.18)","backdropFilter":"blur(10px)","WebkitBackdropFilter":"blur(10px)","opacity":"0","transform":"translateY(4px)","fontSize":"12.5px","color":"#e7e4f4","whiteSpace":"nowrap","transition":"opacity .18s,transform .18s"}}>
            <span id="skTipName" style={{"fontWeight":"500"}}>
            </span>
            <span id="skTipVal" style={{"color":"#9c98b6","marginLeft":"8px"}}>
            </span>
          </div>
          {' '}
          {/* HOVER / CLICK / CAROUSEL CARD */}
          {' '}
          <div id="skCard" style={{"position":"absolute","left":"0","top":"0","width":"300px","borderRadius":"18px","opacity":"0","transform":"translateY(8px) scale(.97)","transformOrigin":"left center","transition":"opacity .3s ease,transform .3s ease","pointerEvents":"none"}}>
            {' '}
            <div id="skCardBeam" style={{"position":"absolute","inset":"0","borderRadius":"18px","padding":"1px","background":"conic-gradient(from var(--skAng,0deg),transparent 0deg,rgba(176,162,250,0.85) 60deg,transparent 130deg,transparent 360deg)","WebkitMask":"linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0)","WebkitMaskComposite":"xor","maskComposite":"exclude","animation":"skFlow 6s linear infinite","pointerEvents":"none","zIndex":"2"}}>
            </div>
            {' '}
            <div id="skCardBadge" style={{"position":"absolute","top":"-11px","left":"18px","zIndex":"4","display":"none","alignItems":"center","gap":"5px","padding":"4px 11px","borderRadius":"999px","background":"linear-gradient(180deg,#f0cf94,#d8b06a)","boxShadow":"0 5px 16px -4px rgba(216,176,106,0.85)"}}>
              {' '}
              <span style={{"fontSize":"9px","color":"#3a2c11"}}>
                {"★"}
              </span>
              <span style={{"fontFamily":"'JetBrains Mono',monospace","fontSize":"9px","fontWeight":"600","letterSpacing":".04em","color":"#3a2c11"}} data-i18n="badge">
                {"今日最值得认识"}
              </span>
              {' '}
            </div>
            {' '}
            <div id="skCardInner" style={{"position":"relative","zIndex":"3","borderRadius":"17px","background":"linear-gradient(158deg,rgba(20,18,38,0.97),rgba(11,10,22,0.985))","border":"1px solid rgba(150,145,200,0.14)","padding":"17px 18px","display":"flex","flexDirection":"column","gap":"11px","boxShadow":"0 28px 72px -28px rgba(0,0,0,0.85)"}}>
              {' '}
              <div style={{"display":"flex","alignItems":"center","gap":"11px"}}>
                {' '}
                <img id="skCardAva" alt="" style={{"width":"42px","height":"42px","borderRadius":"50%","flex":"0 0 auto","objectFit":"cover","border":"1px solid rgba(150,145,200,0.3)","background":"radial-gradient(circle at 34% 30%,#cfc6ff,#8b7bf0 72%)"}} />
                {' '}
                <div style={{"minWidth":"0","flex":"1"}}>
                  <div id="skCardName" style={{"fontSize":"16px","fontWeight":"600","color":"#F5F6FF","lineHeight":"1.2"}}>
                  </div>
                  <div id="skCardRole" style={{"fontSize":"11.5px","color":"rgba(186,190,214,0.62)","marginTop":"3px","whiteSpace":"nowrap","overflow":"hidden","textOverflow":"ellipsis"}}>
                  </div>
                </div>
                {' '}
              </div>
              {' '}
              <div id="skCardHelp" style={{"fontSize":"14.5px","fontWeight":"500","lineHeight":"1.5","color":"#ECEEFF"}}>
              </div>
              {' '}
              <div style={{"display":"flex","alignItems":"center","gap":"6px"}}>
                <span id="skCardRsnDot" style={{"width":"5px","height":"5px","borderRadius":"50%","background":"#8b7bf0","boxShadow":"0 0 6px #8b7bf0"}}>
                </span>
                <span id="skCardRsn" data-i18n="cardRsn" style={{"fontFamily":"'JetBrains Mono',monospace","fontSize":"10px","letterSpacing":".04em","color":"#a99fe8"}}>
                  {"Orbit 为你匹配"}
                </span>
              </div>
              {' '}
              <div id="skCardMore" style={{"fontSize":"12px","lineHeight":"1.5","color":"rgba(170,176,204,0.8)","borderTop":"1px solid rgba(150,145,200,0.12)","paddingTop":"9px"}}>
              </div>
              {' '}
            </div>
            {' '}
          </div>
          {' '}
          {/* CORNER (event context = visible input on screen 2) */}
          {' '}
          <div id="skCorner" style={{"position":"absolute","top":"112px","left":"16px","display":"flex","alignItems":"center","gap":"9px","padding":"7px 13px","borderRadius":"999px","background":"rgba(10,8,18,0.5)","border":"1px solid rgba(150,145,200,0.16)","backdropFilter":"blur(10px)","WebkitBackdropFilter":"blur(10px)","opacity":"0"}}>
            {' '}
            <span style={{"width":"7px","height":"7px","borderRadius":"50%","background":"#c6a06a","boxShadow":"0 0 8px #c6a06a"}}>
            </span>
            {' '}
            <span style={{"fontFamily":"'JetBrains Mono',monospace","fontSize":"11px","letterSpacing":".06em","color":"#cdcae3"}} data-i18n="corner">
              {"示例预览 · 导入后换成真实数据"}
            </span>
            {' '}
          </div>
          {' '}
          {/* SCREEN-2 SLOGAN (typed) */}
          {' '}
          <div id="skPain" data-serif="" style={{"position":"absolute","top":"20%","left":"50%","transform":"translateX(-50%)","width":"86%","textAlign":"center","whiteSpace":"pre-line","fontFamily":"'Noto Serif SC',serif","fontWeight":"300","fontSize":"19px","lineHeight":"1.55","color":"#f1eff9","opacity":"0"}}>
            <span id="skPainTxt">
            </span>
            <span id="skPainCaret" style={{"display":"none","color":"#9b8bff","fontWeight":"300","animation":"skCaret 1.05s steps(1) infinite"}}>
              {"|"}
            </span>
          </div>
          {' '}
          {/* ENDING */}
          {' '}
          <div id="skOrg" style={{"position":"absolute","inset":"0","display":"flex","flexDirection":"column","alignItems":"stretch","padding":"38px 0 58px","opacity":"0","background":"radial-gradient(120% 90% at 50% 50%, rgba(8,7,16,0.82), rgba(6,5,12,0.97) 70%)"}}>
            {' '}
            {/* LEFT · toC 个人用户 */}
            {' '}
            <div style={{"flex":"1","display":"flex","flexDirection":"column","alignItems":"center","justifyContent":"center","textAlign":"center","padding":"0 22px","gap":"14px"}}>
              {' '}
              <div data-i18n="forYou" style={{"fontFamily":"'JetBrains Mono',monospace","fontSize":"11px","letterSpacing":".26em","textTransform":"uppercase","color":"#a7a1d6"}}>
                {"For You · 个人用户"}
              </div>
              {' '}
              <div id="skMiniC" style={{"position":"relative","width":"230px","height":"150px","transform":"scale(0.86)"}}>
                {' '}
                <span style={{"position":"absolute","left":"18px","top":"18px","width":"3px","height":"3px","borderRadius":"50%","background":"#e6e7f8","boxShadow":"0 0 8px #cfd0ec","animation":"skTwk 3.4s ease-in-out infinite"}}>
                </span>
                {' '}
                <span style={{"position":"absolute","left":"208px","top":"26px","width":"2.5px","height":"2.5px","borderRadius":"50%","background":"#cdd0ec","boxShadow":"0 0 6px #aeb2dd","animation":"skTwk 4.2s .6s ease-in-out infinite"}}>
                </span>
                {' '}
                <span style={{"position":"absolute","left":"122px","top":"12px","width":"2px","height":"2px","borderRadius":"50%","background":"#c6c9e6","boxShadow":"0 0 5px #aeb2dd","animation":"skTwk 3.8s .3s ease-in-out infinite"}}>
                </span>
                {' '}
                <span style={{"position":"absolute","left":"198px","top":"74px","width":"3px","height":"3px","borderRadius":"50%","background":"#e6e7f8","boxShadow":"0 0 8px #cfd0ec","animation":"skTwk 4.6s .9s ease-in-out infinite"}}>
                </span>
                {' '}
                <span style={{"position":"absolute","left":"212px","top":"122px","width":"2.5px","height":"2.5px","borderRadius":"50%","background":"#d6d8f0","boxShadow":"0 0 6px #b9bce0","animation":"skTwk 3.2s .2s ease-in-out infinite"}}>
                </span>
                {' '}
                <span style={{"position":"absolute","left":"150px","top":"134px","width":"2px","height":"2px","borderRadius":"50%","background":"#c6c9e6","boxShadow":"0 0 5px #aeb2dd","animation":"skTwk 4.0s .5s ease-in-out infinite"}}>
                </span>
                {' '}
                <span style={{"position":"absolute","left":"24px","top":"122px","width":"2.5px","height":"2.5px","borderRadius":"50%","background":"#d6d8f0","boxShadow":"0 0 6px #b9bce0","animation":"skTwk 3.6s .7s ease-in-out infinite"}}>
                </span>
                {' '}
                <span style={{"position":"absolute","left":"8px","top":"80px","width":"2px","height":"2px","borderRadius":"50%","background":"#c6c9e6","boxShadow":"0 0 5px #aeb2dd","animation":"skTwk 4.4s .1s ease-in-out infinite"}}>
                </span>
                {' '}
                <span style={{"position":"absolute","left":"80px","top":"30px","width":"2px","height":"2px","borderRadius":"50%","background":"#c6c9e6","boxShadow":"0 0 5px #aeb2dd","animation":"skTwk 3.9s .8s ease-in-out infinite"}}>
                </span>
                {' '}
                <span style={{"position":"absolute","left":"46px","top":"44px","width":"5px","height":"5px","borderRadius":"50%","background":"radial-gradient(circle at 35% 30%,#fff,#cfc6ff)","boxShadow":"0 0 14px 1px #b9aef0"}}>
                </span>
                {' '}
                <div id="skMiniCard" style={{"position":"absolute","left":"34px","top":"54px","width":"178px","borderRadius":"13px","padding":"11px 13px","background":"linear-gradient(158deg,rgba(22,20,40,0.97),rgba(12,11,24,0.985))","border":"1px solid rgba(150,145,200,0.18)","boxShadow":"0 16px 40px -20px rgba(0,0,0,0.85),0 0 34px -18px rgba(123,108,232,0.5)","display":"flex","flexDirection":"column","gap":"7px","transition":"opacity .26s ease","animation":"skFloat 5.5s ease-in-out infinite"}}>
                  {' '}
                  <div style={{"display":"flex","alignItems":"center","gap":"8px"}}>
                    <img id="skMiniAva" alt="" onError={(e)=>{e.currentTarget.removeAttribute('src');e.currentTarget.style.background='radial-gradient(circle at 34% 30%,#cfc6ff,#8b7bf0 72%)';}} style={{"width":"27px","height":"27px","borderRadius":"50%","flex":"0 0 auto","objectFit":"cover","border":"1px solid rgba(150,145,200,0.3)","background":"#1a1830"}} />
                    <div style={{"minWidth":"0","flex":"1","textAlign":"left"}}>
                      <div id="skMiniName" style={{"fontSize":"12.5px","fontWeight":"600","color":"#F5F6FF","lineHeight":"1.15"}}>
                      </div>
                      <div style={{"fontSize":"9px","fontFamily":"'JetBrains Mono',monospace","color":"#a99fe8","letterSpacing":".03em","marginTop":"2px"}} data-i18n="cardRsn">
                        {"Orbit 为你匹配"}
                      </div>
                    </div>
                  </div>
                  {' '}
                  <div id="skMiniHelp" style={{"fontSize":"11px","lineHeight":"1.45","color":"#d7d6e8","textAlign":"left","display":"-webkit-box","WebkitLineClamp":"2","WebkitBoxOrient":"vertical","overflow":"hidden"}}>
                  </div>
                  {' '}
                </div>
                {' '}
              </div>
              {' '}
              <p data-serif="" data-i18n-html="leftParaHtml" style={{"margin":"0","maxWidth":"520px","fontFamily":"'Noto Serif SC',serif","fontWeight":"300","fontSize":"15px","lineHeight":"1.72","color":"#eceaf6"}}>
                {' '}
                <span style={{"display":"block","whiteSpace":"nowrap"}}>
                  {"那些躺在名片夹里的人，"}
                </span>
                {' '}
                <span style={{"display":"block","whiteSpace":"nowrap"}}>
                  {"其实是一片待点亮的星空。"}
                </span>
                {' '}
                <span style={{"display":"block","whiteSpace":"nowrap"}}>
                  {"iOrbit 替你逐颗解读，"}
                </span>
                {' '}
                <span style={{"display":"block","whiteSpace":"nowrap"}}>
                  {"挖出每段关系背后的"}
                  <b style={{"fontWeight":"500","color":"#fff"}}>
                    {"商业价值"}
                  </b>
                  {"。"}
                </span>
                {' '}
              </p>
              {' '}
              <a href={authenticated ? "/app/home" : "/app/account/signup?next=%2Fapp%2Fhome"} style={{"pointerEvents":"auto","display":"inline-flex","alignItems":"center","gap":"8px","padding":"11px 22px","borderRadius":"999px","cursor":"pointer","fontSize":"14px","textDecoration":"none","color":"#f1eef8","border":"1px solid rgba(139,123,240,0.5)","background":"rgba(139,123,240,0.10)"}} style-hover="border-color:rgba(139,123,240,0.85);background:rgba(139,123,240,0.18);">
                {' '}
                <span data-i18n={authenticated ? "enterStarfield" : "leftCTA"}>
                  {authenticated ? "进入我的人脉星图" : "创建我的人脉星图 · 注册"}
                </span>
                <span style={{"color":"#8b7bf0"}}>
                  {"→"}
                </span>
                {' '}
              </a>
              {' '}
            </div>
            {' '}
            <div style={{"height":"1px","alignSelf":"stretch","margin":"0 16%","background":"linear-gradient(90deg,transparent,rgba(150,145,200,0.26),transparent)"}}>
            </div>
            {' '}
            {/* RIGHT · toB 活动主办方 */}
            {' '}
            <div style={{"flex":"1","display":"flex","flexDirection":"column","alignItems":"center","justifyContent":"center","textAlign":"center","padding":"0 22px","gap":"14px"}}>
              {' '}
              <div data-i18n="forOrg" style={{"fontFamily":"'JetBrains Mono',monospace","fontSize":"11px","letterSpacing":".26em","textTransform":"uppercase","color":"#c8a978"}}>
                {"For Organizers · 活动方"}
              </div>
              {' '}
              <div id="skMiniB" style={{"position":"relative","width":"230px","height":"150px","transform":"scale(0.86)","display":"flex","alignItems":"center","justifyContent":"center"}}>
                {' '}
                <div style={{"position":"absolute","width":"204px","height":"112px","border":"1px solid rgba(216,176,106,0.42)","borderRadius":"50%"}}>
                </div>
                {' '}
                <div style={{"position":"absolute","width":"126px","height":"70px","border":"1px solid rgba(216,176,106,0.22)","borderRadius":"50%"}}>
                </div>
                {' '}
                <div style={{"position":"absolute","width":"204px","height":"112px","animation":"skSpin 18s linear infinite"}}>
                  {' '}
                  <span style={{"position":"absolute","left":"50%","top":"0","transform":"translate(-50%,-50%)","width":"9px","height":"9px","borderRadius":"50%","background":"radial-gradient(circle at 34% 30%,#fff,#d8b06a)","boxShadow":"0 0 12px -1px #d8b06a"}}>
                  </span>
                  {' '}
                  <span style={{"position":"absolute","left":"50%","top":"100%","transform":"translate(-50%,-50%)","width":"7px","height":"7px","borderRadius":"50%","background":"radial-gradient(circle at 34% 30%,#fff,#e0c187)","boxShadow":"0 0 10px -1px #d8b06a"}}>
                  </span>
                  {' '}
                </div>
                {' '}
                <span style={{"position":"relative","width":"15px","height":"15px","borderRadius":"50%","background":"radial-gradient(circle at 35% 30%,#cfc6ff,#8b7bf0 70%)","boxShadow":"0 0 16px -2px #8b7bf0"}}>
                </span>
                {' '}
              </div>
              {' '}
              <p data-serif="" data-i18n-html="rightParaHtml" style={{"margin":"0","maxWidth":"520px","fontFamily":"'Noto Serif SC',serif","fontWeight":"300","fontSize":"15px","lineHeight":"1.72","color":"#eceaf6"}}>
                {' '}
                <span style={{"display":"block","whiteSpace":"nowrap"}}>
                  {"让一场活动，"}
                </span>
                {' '}
                <span style={{"display":"block","whiteSpace":"nowrap"}}>
                  {"从「人多」变成"}
                  <b style={{"fontWeight":"500","color":"#fff"}}>
                    {"「人对」"}
                  </b>
                  {"。"}
                </span>
                {' '}
                <span style={{"display":"block","whiteSpace":"nowrap"}}>
                  {"iOrbit 替每位来宾算好轨道，"}
                </span>
                {' '}
                <span style={{"display":"block","whiteSpace":"nowrap"}}>
                  {"落座就在对的人中间。"}
                </span>
                {' '}
              </p>
              {' '}
              <a href="/app/platform" style={{"pointerEvents":"auto","display":"inline-flex","alignItems":"center","gap":"8px","padding":"11px 22px","borderRadius":"999px","cursor":"pointer","fontSize":"14px","textDecoration":"none","color":"#f6efe2","border":"1px solid rgba(198,160,106,0.55)","background":"rgba(198,160,106,0.10)"}} style-hover="border-color:rgba(198,160,106,0.9);background:rgba(198,160,106,0.18);">
                {' '}
                <span data-i18n="rightCTA">
                  {"我是活动主办方 · 接入 Orbit"}
                </span>
                <span style={{"color":"#c6a06a"}}>
                  {"→"}
                </span>
                {' '}
              </a>
              {' '}
            </div>
            {' '}
          </div>
          {' '}
          {/* SCROLL CUE */}
          {' '}
          <div id="skCue" style={{"position":"absolute","bottom":"calc(18px + env(safe-area-inset-bottom))","left":"50%","transform":"translateX(-50%)","display":"flex","flexDirection":"column","alignItems":"center","gap":"8px","pointerEvents":"auto","cursor":"pointer","zIndex":"12","opacity":"0","transition":"opacity .5s ease"}}>
            {' '}
            <span id="skCueTxt" style={{"fontFamily":"'JetBrains Mono',monospace","fontSize":"11px","letterSpacing":".16em","textTransform":"uppercase","color":"#9f9cb8"}}>
              {"滚动 / 空格 · 翻到下一幕"}
            </span>
            {' '}
            <span id="skCueArrow" style={{"color":"#c6a06a","fontSize":"15px","animation":"skCue 2.4s ease-in-out infinite"}}>
              {"↓"}
            </span>
            {' '}
          </div>
          {' '}
        </div>
        {' '}
      </div>
    </div>
  );
}

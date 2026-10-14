// R26 真实验证用的「模糊海报」：本机渲染一张活动海报再加模糊（日时与参加费故意糊到读不清）。不调 AI。
import { chromium } from "playwright";
const out = process.argv[2];
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 600, height: 840 } });
await page.setContent(`<body style="margin:0;font-family:'Hiragino Sans',sans-serif;background:#1f2a44;color:#fff">
<div style="padding:40px"><div style="font-size:20px;letter-spacing:.2em;opacity:.8">NAGOYA · 2026</div>
<div style="font-size:64px;font-weight:800;margin-top:20px">製造業DX</div><div style="font-size:44px;font-weight:700">ナイトセミナー 名古屋</div>
<div style="margin-top:40px;font-size:22px;filter:blur(5px)">2026年10月29日（木）18:30〜21:00</div>
<div style="margin-top:12px;font-size:22px;filter:blur(3px)">会場：名古屋駅周辺（詳細は申込者に連絡）</div>
<div style="margin-top:12px;font-size:22px;filter:blur(6px)">参加費 ¥3,000（懇親会込み）</div>
<div style="margin-top:60px;font-size:20px">主催：中部ものづくりDX協議会</div></div></body>`);
await page.screenshot({ path: out, type: "jpeg", quality: 70 });
await browser.close();

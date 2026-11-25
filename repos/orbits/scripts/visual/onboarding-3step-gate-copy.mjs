// 三步引导门禁用的画板副本：docs/designs/redesign-2026-10/_onboarding-3step-gate.html（不提交）。
// 只做三类替换，其余逐字照画板：① 示例数据文字换成产品候选表里的词（介绍文改到 80 字以内）；② 去掉没有对应功能的「PDF」与「やわらかめ」；③ 手机按钮条放回视口底（真实视口不含 Safari 底栏），去掉盖住红色描边的标注针。
// 用法：node scripts/visual/onboarding-3step-gate-copy.mjs，然后 compare-redesign.mjs --suite scripts/visual/views/web-onboarding-3step.json
import { readFileSync, writeFileSync } from "node:fs";

const dir = new URL("../../../../docs/designs/redesign-2026-10/", import.meta.url);
let html = readFileSync(new URL("onboarding-3step-proposal.html", dir), "utf8");
const swap = (from, to) => {
  if (!html.includes(from)) throw new Error(`画板里找不到：${from}`);
  html = html.replaceAll(from, to);
};
swap("/* ===== 本稿新增 ===== */", ".mweb .foot { bottom: 0 !important; }");
swap("JPG・PNG・HEIC・PDF · ", "JPG・PNG・HEIC · ");
swap("<button>やわらかめ</button>", "");
swap("pin(1, '.gt.err') + ", "");
html = html.replace(/const INTRO = '[^']*'/u, "const INTRO = '株式会社ミナトリンク代表の佐藤です。製造業向けの業務 SaaS を展開しています。シリーズAの資金調達と新規顧客開拓に力を入れています。'");
swap("fld('業界', 'IT・ソフトウェア'", "fld('業界', '金融・投資'");
swap("fld('業界の詳細', 'SaaS'", "fld('業界の詳細', '保険'");
swap("fld('詳細', 'SaaS'", "fld('詳細', '保険'");
swap("IT・ソフトウェア › SaaS", "金融・投資 › 保険");
swap("['補助金の申請', 0], ['海外展開', 0]]", "['投資・資金調達', 0], ['顧客紹介', 0]]");
swap("'VC パートナー'", "'投資家'");
swap("'製造業の決裁者'", "'共同創業者'");
swap("'CFO 候補'", "'見込み顧客'");
swap("'事業会社の経営企画'", "'企業の意思決定者'");
swap("['ゴルフ', 0], ['サウナ', 0], ['経営書', 0]]", "['生成 AI', 0], ['起業・資金調達', 0], ['海外展開・越境', 0]]");
writeFileSync(new URL("_onboarding-3step-gate.html", dir), html);

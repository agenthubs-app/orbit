"use client";

import { signIn } from "next-auth/react";
import { Fragment } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";
import { profileContinuationPath } from "../../profile/profile-onboarding-navigation";
import { Icon, MacTile, Orbit2026Scope } from "../ui";
import s from "./LandingPage.module.css";

type Copy = { ja: string; zh: string; en: string };

// b1 #0: three sample business cards fanned under the floating cards (all sample data).
const PAPERS: { company: Copy | string; role: Copy; name: Copy; mail: string; style: { left: number; top: number; rotate: number } }[] = [
  { company: { ja: "林電機工業", zh: "林电机工业", en: "Hayashi Denki" }, role: { ja: "代表取締役", zh: "董事长", en: "CEO" }, name: { ja: "林 俊介", zh: "林 俊介", en: "Shunsuke Hayashi" }, mail: "s.hayashi@hayashi-denki.example", style: { left: 10, top: 150, rotate: -9 } },
  { company: { ja: "森田精機株式会社", zh: "森田精机株式会社", en: "Morita Seiki" }, role: { ja: "購買部 課長", zh: "采购部 科长", en: "Purchasing Manager" }, name: { ja: "森田 恵", zh: "森田 惠", en: "Megumi Morita" }, mail: "m.morita@morita-seiki.example", style: { left: 40, top: 182, rotate: -3 } },
  { company: "Kibo Ventures", role: { ja: "パートナー", zh: "合伙人", en: "Partner" }, name: { ja: "山口 大樹", zh: "山口 大树", en: "Daiki Yamaguchi" }, mail: "y.yamaguchi@kibo-vc.example", style: { left: 74, top: 214, rotate: 4 } },
];
// kit V2.sbar sample: segment allocation (flex) and earned share.
const SEGMENTS = [[10, 0], [15, 40], [10, 0], [30, 66.67], [15, 0], [10, -1], [10, 100]] as const;

export function LandingPage({ googleEnabled }: { googleEnabled: boolean }) {
  const { language, t } = useOrbitLanguage();
  const signup = "/app/account/signup";
  const login = "/app/account/login";
  const sample = t({ ja: "サンプル", zh: "示例", en: "Sample" });
  return <Orbit2026Scope language={language} as="main" className={s.page}>
    <header className={s.header}>
      <a className={s.brand} href="/" aria-label="Orbit"><span className={s.logo}>O</span><strong>Orbit</strong></a>
      <nav className={s.nav} aria-label={t({ ja: "公開ページ", zh: "公开页面", en: "Public pages" })}>
        <a href="#features">{t({ ja: "機能", zh: "功能", en: "Features" })}</a>
        <a href="/help">{t({ ja: "よくある質問", zh: "常见问题", en: "FAQ" })}</a>
      </nav>
      <div className={s.account}>
        <a className={s.ghost} href={login}>{t({ ja: "ログイン", zh: "登录", en: "Sign in" })}</a>
        <a className={s.primary} href={signup}>{t({ ja: "無料で始める", zh: "免费开始", en: "Get started free" })}</a>
      </div>
    </header>
    <div className={s.body}>
      <section className={s.hero}>
        <div className={s.copy}>
          <span className={s.eyebrow}>{t({ ja: "名刺から始まる、人脈の作戦室", zh: "从名片开始的人脉工作台", en: "Your relationship workspace starts with a card" })}</span>
          <h1>{t({ ja: "名刺の束を、\n次に会うべき人の\nリストに。", zh: "把一叠名片，\n变成下一位该见的人。", en: "Turn business cards into people worth meeting next." }).split("\n").map((line, index) => <Fragment key={line}>{index ? <br /> : null}{line}</Fragment>)}</h1>
          <p>{t({ ja: "撮るだけで名刺を整理。あなたの目標から逆算して、話すべき人のタイプ・行くべきイベント・お礼メールの下書きまで用意します。", zh: "拍下名片即可整理。根据你的目标，准备值得联系的人、活动建议和感谢邮件草稿。", en: "Scan your cards. Orbit organizes them and suggests people, events, and thank-you drafts around your goals." })}</p>
          <div className={s.ctas}>
            <a className={`${s.primary} ${s.cta}`} href={signup}>{t({ ja: "無料で始める", zh: "免费开始", en: "Get started free" })}<Icon name="right" size={16} /></a>
            {googleEnabled ? <button className={s.google} type="button" onClick={() => { void signIn("google", { callbackUrl: profileContinuationPath("/app/home") }); }}><span className={s.g}>G</span>{t({ ja: "Google で続ける", zh: "使用 Google 继续", en: "Continue with Google" })}</button> : null}
          </div>
          <small>{t({ ja: "登録は1分 · クレジットカード不要", zh: "约 1 分钟完成注册 · 无需信用卡", en: "Sign up in about a minute · No credit card required" })}</small>
        </div>
        <div className={s.art} aria-label={sample}>
          <span className={s.sampleLabel}>{sample}</span>
          {PAPERS.map(paper => <div key={paper.mail} className={s.paperAt} style={{ left: paper.style.left, top: paper.style.top, transform: `rotate(${paper.style.rotate}deg)` }} aria-hidden="true">
            <div className={s.paper}><span className={s.pCo}>{typeof paper.company === "string" ? paper.company : t(paper.company)}</span><span className={s.pR}>{t(paper.role)}</span><b className={s.pN}>{t(paper.name)}</b><span className={s.pM}>{paper.mail}<br />03-5555-0142</span></div>
          </div>)}
          <div className={`${s.float} ${s.today}`}>
            <div className={s.row}><MacTile emoji="✨" tone="lav" size="sm" /><b>{t({ ja: "今日の一手", zh: "今日一步", en: "Today's move" })}</b></div>
            <div className={s.todayText}>{t({ ja: "山口さん（Kibo Ventures）へ、昨日のお礼と資料のご案内を。", zh: "给山口（Kibo Ventures）发送昨天的致谢和资料说明。", en: "Thank Yamaguchi (Kibo Ventures) for yesterday and share the materials." })}</div>
            <div className={s.row}><span className={s.chip}>{t({ ja: "下書きの例", zh: "草稿示例", en: "Draft example" })}</span><span className={s.lbl}>{t({ ja: "送信はあなたが行います", zh: "由你决定发送", en: "You send it yourself" })}</span></div>
          </div>
          <div className={`${s.float} ${s.d2} ${s.score}`}>
            <div className={s.between}><span className={s.lbl}>{t({ ja: "プラン スコア", zh: "计划得分", en: "Plan score" })}</span><span className={s.chance}>{t({ ja: "今日 +10", zh: "今日 +10", en: "Today +10" })}</span></div>
            <div className={s.scoreRow}><b className={s.scoreNum}>46</b><b>{t({ ja: "シリーズA 資金調達", zh: "A 轮融资", en: "Series A fundraising" })}</b></div>
            <div className={s.bar} aria-hidden="true">{SEGMENTS.map(([flex, earned], index) => <span key={index} className={`${s.sg} ${earned < 0 ? s.sk : ""}`} style={{ flex }}>{earned > 0 ? <b style={{ width: `${earned}%` }} /> : null}</span>)}</div>
          </div>
          <div className={`${s.float} ${s.d3} ${s.scanned}`}><MacTile emoji="✓" tone="teal" size="sm" /><div><b>{t({ ja: "12枚を読み取りました", zh: "已读取 12 张", en: "12 cards scanned" })}</b><div className={s.lbl}>{t({ ja: "うち3人がプランに合いそうです", zh: "其中 3 人与你的计划相符", en: "3 people fit your plan" })}</div></div></div>
        </div>
        <div className={s.sample} aria-label={sample}>
          <span className={s.sampleLabel}>{sample}</span>
          <div className={s.sampleCard}>📇 {t({ ja: "名刺を12枚読み取りました", zh: "已扫描 12 张名片", en: "12 cards scanned" })}<br/><small>{t({ ja: "うち3人がプランに合いそうです", zh: "其中 3 人与你的计划相符", en: "3 people fit your plan" })}</small></div>
          <div className={`${s.sampleCard} ${s.sampleOffset}`}>🎯 {t({ ja: "プラン スコア 46 · 今日 +10", zh: "计划得分 46 · 今日 +10", en: "Plan score 46 · +10 today" })}</div>
          <div className={s.sampleCard}>✨ {t({ ja: "山口さんへのお礼と資料のご案内", zh: "给山口的致谢与资料说明", en: "Thank-you note and resources for Yamaguchi" })}<br/><small className={s.draft}>{t({ ja: "下書きの例", zh: "草稿示例", en: "Draft example" })}</small></div>
        </div>
      </section>
      <section className={s.features} id="features" aria-label={t({ ja: "機能", zh: "功能", en: "Features" })}>
        <article><MacTile emoji="📇" tone="apricot" /><div><strong>{t({ ja: "撮るだけで、名刺が人脈に", zh: "拍下名片，整理联系人", en: "Turn cards into contacts" })}</strong><p>{t({ ja: "連続撮影・表裏の自動ペア・重複の統合まで。", zh: "连续扫描、正反面配对并合并重复信息。", en: "Batch scan, pair front and back, and merge duplicates." })}</p></div></article>
        <article><MacTile emoji="🎯" tone="lav" /><div><strong>{t({ ja: "目標から逆算した、次の一手", zh: "从目标出发，找到下一步", en: "Find the next step from your goals" })}</strong><p>{t({ ja: "資金調達・新規開拓など最大2つの目標ごとに、ステップ別に話すべき人を提案。", zh: "融资、拓展新客户等，最多2个目标分别按步骤推荐该联系的人。", en: "For up to 2 goals such as fundraising or new business, step-by-step suggestions of who to talk to." })}</p></div></article>
        <article><MacTile emoji="✉️" tone="pink" /><div><strong>{t({ ja: "下書きまで。送信はあなたが行います", zh: "准备草稿，由你决定发送", en: "Drafts ready for your review" })}</strong><p>{t({ ja: "お礼や紹介依頼のメールを下書きします。勝手に送ることはありません。", zh: "起草感谢和引荐请求邮件。发送前由你确认，不会擅自发送。", en: "Orbit drafts thank-you and introduction emails. Nothing is sent without you." })}</p></div></article>
      </section>
    </div>
  </Orbit2026Scope>;
}

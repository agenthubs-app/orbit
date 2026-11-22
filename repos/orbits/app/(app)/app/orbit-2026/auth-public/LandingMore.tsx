"use client";

/**
 * 登录前展示页 v2 的 8 屏（设计稿 docs/designs/redesign-2026-10/landing/v2.html，2026-11-22 用户确认屏数和顺序）。
 * 首屏（LandingPage.tsx）不改，这些屏接在它下面；形式与首屏一致：同字号档、紫色胶囊标签、22px 白卡、MacTile、渐变样例面板。
 * ⑤ 是真实的公开活动（服务端读，最多 3 场）；没有可报名活动时只留标题和「すべてのイベントを見る」。
 * 设计稿里的人名、公司、活动都是示例（面板标「サンプル」）。
 */
import { Fragment } from "react";

import type { LandingEvent } from "../../../../../features/events/journey/landing-events";
import { useOrbitLanguage } from "../../orbit-language-context";
import { shellCopy } from "../copy/shell";
import { MacTile, Orbit2026Scope } from "../ui";
import s from "./LandingMore.module.css";

type Copy = { ja: string; zh: string; en: string };
type Tone = "lav" | "pink" | "blue" | "teal" | "apricot";

const SIGNUP = "/app/account/signup";
const EVENTS = "/app/events";
/** 「4回の日中交流会 / 223人が参加」：数字核对未定（2026-11-22 报告），用户确认前不显示。 */
const TRACK_RECORD: { sessions: number; people: number } | null = null;

function lines(text: string) {
  return text.split("\n").map((line, index) => <Fragment key={index}>{index ? <br /> : null}{line}</Fragment>);
}

function Points({ items, t }: { items: { emoji: string; tone: Tone; title: Copy; body: Copy }[]; t: (copy: Copy) => string }) {
  return <ul className={s.pts}>
    {items.map((item) => <li key={item.title.ja}><MacTile emoji={item.emoji} tone={item.tone} size="sm" /><div><strong>{t(item.title)}</strong><span>{t(item.body)}</span></div></li>)}
  </ul>;
}

const SEGMENTS = [[10, 0], [15, 40], [10, 0], [30, 66.67], [15, 0], [10, -1], [10, 100]] as const;

function eventDate(event: LandingEvent, t: (copy: Copy) => string) {
  const date = new Date(event.startsAt);
  const part = (options: Intl.DateTimeFormatOptions, locale = "en-US") => new Intl.DateTimeFormat(locale, { timeZone: event.timezone, ...options }).format(date);
  const day = part({ day: "numeric" });
  const month = Number(part({ month: "numeric" }));
  const weekdayJa = part({ weekday: "short" }, "ja-JP");
  const weekdayZh = part({ weekday: "short" }, "zh-CN");
  const weekdayEn = part({ weekday: "short" });
  const time = part({ hour: "2-digit", hourCycle: "h23", minute: "2-digit" });
  const sub = t({ ja: `${month}月 ${weekdayJa}`, zh: `${month}月 ${weekdayZh}`, en: `${part({ month: "short" })} ${weekdayEn}` });
  return { day, sub, time };
}

export function LandingMore({ events }: { events: readonly LandingEvent[] | null }) {
  const { language, setLanguage, t } = useOrbitLanguage();
  const sample = t({ ja: "サンプル", zh: "示例", en: "Sample" });
  const card = t({ ja: "名刺", zh: "名片", en: "Card" });
  const qr = t({ ja: "QR交換", zh: "QR 交换", en: "QR" });
  const open = events ?? [];
  return <Orbit2026Scope language={language} className={s.more}>
    {/* ① 名刺の管理 */}
    <section className={s.sec} id="cards">
      <div className={s.txt}>
        <span className={s.eyebrow}>{t({ ja: "名刺の管理", zh: "名片管理", en: "Business cards" })}</span>
        <h2>{lines(t({ ja: "たまった名刺が、\nその日のうちに片づく。", zh: "攒下的名片，\n当天就能整理完。", en: "A stack of cards,\nsorted the same day." }))}</h2>
        <p>{t({ ja: "交流会の帰りに、まとめて撮るだけです。会社名も役職も、探せる形で人脈に入ります。", zh: "交流会回来，一次拍完就好。公司和职位都会以可搜索的形式进入人脉。", en: "Snap them all on the way home. Companies and titles land in your network, ready to search." })}</p>
        <Points t={t} items={[
          { body: { ja: "表と裏は自動でペアになり、同じ人は一つにまとまります。", zh: "正反面自动配对，同一个人合并成一条。", en: "Fronts and backs pair up, and the same person is merged into one." }, emoji: "📷", title: { ja: "何枚でも続けて撮れる", zh: "想拍多少张都行", en: "Scan as many as you like" }, tone: "apricot" },
          { body: { ja: "名刺、QR交換、イベントなど、出会った経路ごとに絞り込めます。", zh: "名片、QR 交换、活动……可按认识的途径筛选。", en: "Filter by how you met: cards, QR exchange, events." }, emoji: "🗂", title: { ja: "どこで会ったかが残る", zh: "记得在哪里认识", en: "Where you met is kept" }, tone: "blue" },
          { body: { ja: "スマホから書き出した連絡先（vCard）や LinkedIn の書き出しファイルを取り込めます。", zh: "可导入从手机导出的通讯录（vCard）和 LinkedIn 导出文件。", en: "Import contacts exported from your phone (vCard) or your LinkedIn export file." }, emoji: "⤵︎", title: { ja: "手持ちの連絡先もまとめて", zh: "已有的联系人也一起", en: "Bring your existing contacts" }, tone: "teal" },
        ]} />
      </div>
      <div className={s.panel} aria-label={sample}>
        <span className={s.sampleLabel}>{sample}</span>
        <div className={s.fan} aria-hidden="true">
          <div className={s.paper}><span className={s.pCo}>{t({ ja: "林電機工業", zh: "林电机工业", en: "Hayashi Denki" })}</span><span className={s.pR}>{t({ ja: "代表取締役", zh: "董事长", en: "CEO" })}</span><b className={s.pN}>{t({ ja: "林 俊介", zh: "林 俊介", en: "Shunsuke Hayashi" })}</b></div>
          <div className={s.paper}><span className={s.pCo}>{t({ ja: "森田精機株式会社", zh: "森田精机株式会社", en: "Morita Seiki" })}</span><span className={s.pR}>{t({ ja: "購買部 課長", zh: "采购部 科长", en: "Purchasing Manager" })}</span><b className={s.pN}>{t({ ja: "森田 恵", zh: "森田 惠", en: "Megumi Morita" })}</b></div>
          <div className={s.paper}><span className={s.pCo}>Kibo Ventures</span><span className={s.pR}>{t({ ja: "パートナー", zh: "合伙人", en: "Partner" })}</span><b className={s.pN}>{t({ ja: "山口 大樹", zh: "山口 大树", en: "Daiki Yamaguchi" })}</b></div>
        </div>
        <div className={s.card}>
          <div className={s.row}><MacTile emoji="✓" tone="teal" size="sm" /><h3>{t({ ja: "12枚を読み取りました", zh: "已读取 12 张", en: "12 cards scanned" })}</h3></div>
          <div className={s.person}><MacTile emoji={t({ ja: "山", zh: "山", en: "D" })} tone="pink" size="sm" /><div><b>{t({ ja: "山口 大樹", zh: "山口 大树", en: "Daiki Yamaguchi" })}</b><small>Kibo Ventures　{t({ ja: "パートナー", zh: "合伙人", en: "Partner" })}</small></div><span className={`${s.chip} ${s.apricot}`}>{card}</span></div>
          <div className={s.person}><MacTile emoji={t({ ja: "森", zh: "森", en: "M" })} tone="teal" size="sm" /><div><b>{t({ ja: "森田 恵", zh: "森田 惠", en: "Megumi Morita" })}</b><small>{t({ ja: "森田精機株式会社　購買部 課長", zh: "森田精机株式会社　采购部 科长", en: "Morita Seiki　Purchasing Manager" })}</small></div><span className={`${s.chip} ${s.apricot}`}>{card}</span></div>
          <div className={s.person}><MacTile emoji={t({ ja: "林", zh: "林", en: "S" })} tone="blue" size="sm" /><div><b>{t({ ja: "林 俊介", zh: "林 俊介", en: "Shunsuke Hayashi" })}</b><small>{t({ ja: "林電機工業　代表取締役", zh: "林电机工业　董事长", en: "Hayashi Denki　CEO" })}</small></div><span className={`${s.chip} ${s.blue}`}>{qr}</span></div>
        </div>
      </div>
    </section>

    {/* ② 人脈を掘る */}
    <section className={`${s.sec} ${s.flip}`} id="network">
      <div className={s.txt}>
        <span className={s.eyebrow}>{t({ ja: "人脈を掘る", zh: "挖掘人脉", en: "Your network" })}</span>
        <h2>{lines(t({ ja: "次に会うべき人は、\nもう人脈の中にいるかもしれない。", zh: "下一位该见的人，\n也许已经在你的人脉里。", en: "The next person to meet\nmay already be in your network." }))}</h2>
        <p>{t({ ja: "目標を一つ決めると、そこまでに話しておくべき人のタイプが並びます。手持ちの人脈に当てはまる人と、まだ足りないタイプが分かります。", zh: "定下一个目标，就会列出实现它之前该聊的几类人。你会看到人脉里谁对得上，还缺哪一类。", en: "Set one goal and Orbit lists the kinds of people to talk to along the way, showing who in your network fits and which kinds are still missing." })}</p>
        <Points t={t} items={[
          { body: { ja: "資金調達や新規開拓など、目標ごとに必要な人のタイプを出します。", zh: "融资、开拓新客户等，按目标列出需要的人。", en: "Fundraising, new business and more: each goal gets the kinds of people it needs." }, emoji: "🎯", title: { ja: "目標から、会う人を逆算する", zh: "从目标倒推要见的人", en: "Work back from your goal" }, tone: "lav" },
          { body: { ja: "何年も前に交換した名刺の中から、いまの目標に合う人を挙げます。", zh: "从多年前交换的名片里，找出符合当前目标的人。", en: "From cards you swapped years ago, Orbit surfaces people who fit today's goal." }, emoji: "🔎", title: { ja: "埋もれている人を見つける", zh: "找出被埋没的人", en: "Find people you forgot" }, tone: "pink" },
          { body: { ja: "目標に足りないタイプは、その人たちが参加するイベントを案内します。", zh: "目标还缺的那类人，会推荐他们会去的活动。", en: "For kinds your goal still lacks, Orbit points to events where they'll be." }, emoji: "🧭", title: { ja: "足りない人には、会える場所を", zh: "缺的人，告诉你去哪见", en: "Where to meet who's missing" }, tone: "teal" },
        ]} />
      </div>
      <div className={s.panel} aria-label={sample}>
        <span className={s.sampleLabel}>{sample}</span>
        <div className={s.card}>
          <div className={s.between}><span className={s.lbl}>{t({ ja: "プラン スコア", zh: "计划得分", en: "Plan score" })}</span><span className={s.chance}>{t({ ja: "今日 +10", zh: "今日 +10", en: "Today +10" })}</span></div>
          <div className={s.scoreRow}><b className={s.scoreNum}>46</b><b>{t({ ja: "シリーズA 資金調達", zh: "A 轮融资", en: "Series A fundraising" })}</b></div>
          <div className={s.bar} aria-hidden="true">{SEGMENTS.map(([flex, earned], index) => <span key={index} className={`${s.sg} ${earned < 0 ? s.sk : ""}`} style={{ flex }}>{earned > 0 ? <b style={{ width: `${earned}%` }} /> : null}</span>)}</div>
        </div>
        <div className={s.card}>
          <h3>{t({ ja: "話しておくべき人", zh: "该聊的人", en: "People to talk to" })}</h3>
          <div className={s.type}><div className={s.between}><b>{t({ ja: "シード期に投資している投資家", zh: "投种子轮的投资人", en: "Seed-stage investors" })}</b><span className={`${s.chip} ${s.teal}`}>{t({ ja: "人脈に2人", zh: "人脉里 2 人", en: "2 in network" })}</span></div><p>{t({ ja: "山口 大樹さん、ほか1人。2年前に名刺を交換しています。", zh: "山口 大树等 2 人。两年前交换过名片。", en: "Daiki Yamaguchi and 1 other. You swapped cards 2 years ago." })}</p></div>
          <div className={s.type}><div className={s.between}><b>{t({ ja: "同じ業界で調達を終えた起業家", zh: "同行业已完成融资的创业者", en: "Founders in your field who've raised" })}</b><span className={`${s.chip} ${s.teal}`}>{t({ ja: "人脈に1人", zh: "人脉里 1 人", en: "1 in network" })}</span></div><p>{t({ ja: "林 俊介さん。先月のイベントで会っています。", zh: "林 俊介。上个月在活动上见过。", en: "Shunsuke Hayashi. You met at an event last month." })}</p></div>
          <div className={s.type}><div className={s.between}><b>{t({ ja: "事業会社の投資担当", zh: "企业投资部门负责人", en: "Corporate venture leads" })}</b><span className={`${s.chip} ${s.pink}`}>{t({ ja: "まだいません", zh: "还没有", en: "None yet" })}</span></div><p>{t({ ja: "12月12日の交流会に、当てはまる人が2人参加します。", zh: "12 月 12 日的交流会上，有 2 位符合的人参加。", en: "2 people who fit are attending the Dec 12 meetup." })}</p></div>
        </div>
      </div>
    </section>

    {/* ③ 会ったあと */}
    <section className={s.sec} id="follow">
      <div className={s.txt}>
        <span className={s.eyebrow}>{t({ ja: "会ったあと", zh: "见面之后", en: "After you meet" })}</span>
        <h2>{lines(t({ ja: "会って終わりに、\nしない。", zh: "见过面，\n不止于此。", en: "Meeting is\nonly the start." }))}</h2>
        <p>{t({ ja: "話した内容と次に連絡する日を残しておくと、その日に Orbit が知らせます。お礼の文面は下書きまで用意します。", zh: "记下聊了什么、下次哪天联系，到那天 Orbit 会提醒你。感谢的话也会先起好草稿。", en: "Note what you talked about and when to follow up, and Orbit reminds you that day. Thank-you notes come drafted." })}</p>
        <Points t={t} items={[
          { body: { ja: "何を話したか、次に何を送るかを一言で残せます。", zh: "一句话记下聊了什么、下次要发什么。", en: "One line on what you discussed and what to send next." }, emoji: "📝", title: { ja: "会った日のメモ", zh: "见面当天的记录", en: "Notes from the day" }, tone: "apricot" },
          { body: { ja: "今日やること、遅れていることが一目で分かります。", zh: "今天要做的、已经晚了的，一眼看清。", en: "See what's due today and what's overdue at a glance." }, emoji: "⏰", title: { ja: "連絡する日が並ぶ", zh: "联系日程一目了然", en: "Follow-ups in one list" }, tone: "lav" },
          { body: { ja: "下書きを直して、自分のメールから送ります。", zh: "改好草稿，用自己的邮箱发送。", en: "Edit the draft and send it from your own email." }, emoji: "✉️", title: { ja: "送信はあなたが行います", zh: "由你亲自发送", en: "You send it yourself" }, tone: "pink" },
        ]} />
      </div>
      <div className={s.panel} aria-label={sample}>
        <span className={s.sampleLabel}>{sample}</span>
        <div className={s.card}>
          <div className={s.row}><MacTile emoji="✨" tone="lav" size="sm" /><h3>{t({ ja: "今日の一手", zh: "今日一步", en: "Today's move" })}</h3></div>
          <div className={s.todo}><span className={s.when}>{t({ ja: "今日", zh: "今天", en: "Today" })}</span><div><b>{t({ ja: "山口さんへ、昨日のお礼と資料のご案内", zh: "给山口发昨天的致谢和资料说明", en: "Thank Yamaguchi for yesterday and share the materials" })}</b><small><span className={s.chip}>{t({ ja: "下書きあり", zh: "已有草稿", en: "Draft ready" })}</span></small></div></div>
          <div className={s.todo}><span className={s.when}>{t({ ja: "3日後", zh: "3 天后", en: "In 3 days" })}</span><div><b>{t({ ja: "森田さんに、見積もりの件で連絡する", zh: "就报价的事联系森田", en: "Contact Morita about the quote" })}</b><small className={s.lbl}>{t({ ja: "メモ　代理店契約の条件を知りたいとのこと", zh: "记录　对方想了解代理合同的条件", en: "Note　Wants the reseller terms" })}</small></div></div>
          <div className={s.todo}><span className={s.when}>{t({ ja: "来週", zh: "下周", en: "Next week" })}</span><div><b>{t({ ja: "林さんと、面談の日程を決める", zh: "和林约面谈时间", en: "Set a meeting date with Hayashi" })}</b><small className={s.lbl}>{t({ ja: "メモ　1月に工場を見に行く話が出た", zh: "记录　聊到 1 月去看工厂", en: "Note　Talked about a factory visit in January" })}</small></div></div>
        </div>
      </div>
    </section>

    {/* ④ イベント（会前 5 人） */}
    <section className={`${s.sec} ${s.flip}`} id="events-feature">
      <div className={s.txt}>
        <span className={s.eyebrow}>{t({ ja: "イベント", zh: "活动", en: "Events" })}</span>
        <h2>{lines(t({ ja: "交流会の前に、\n会うべき5人が届く。", zh: "交流会之前，\n先收到该见的 5 个人。", en: "Before the meetup,\nget the 5 people to meet." }))}</h2>
        <p>{t({ ja: "申し込んだイベントの参加者から、あなたに合う人を最大5人選びます。理由と最初の質問が付くので、会場で迷いません。", zh: "从你报名的活动参加者里，选出最多 5 位适合你的人，附上理由和开场问题，到了会场不用发愁。", en: "From the attendees of an event you joined, Orbit picks up to 5 people who suit you, with reasons and an opening question." })}</p>
        <Points t={t} items={[
          { body: { ja: "二人のプロフィールに書かれていることだけで理由を作ります。", zh: "理由只来自两人资料里写的内容。", en: "Reasons come only from what both profiles say." }, emoji: "🤝", title: { ja: "求めていることと、提供できること", zh: "想找的和能提供的", en: "What you need, what they offer" }, tone: "teal" },
          { body: { ja: "相手が何語で書いていても、あなたの言語で読めます。", zh: "对方用什么语言写，你都能用自己的语言读。", en: "Whatever language they wrote in, you read it in yours." }, emoji: "🌐", title: { ja: "日本語、中文、English", zh: "日本語、中文、English", en: "日本語, 中文, English" }, tone: "blue" },
          { body: { ja: "名刺を撮るか QR で交換すると、上の流れにつながります。", zh: "拍下名片或用 QR 交换，就接上前面的流程。", en: "Snap their card or swap by QR, and they join the flow above." }, emoji: "📇", title: { ja: "会った人は、そのまま人脈に", zh: "见过的人直接进人脉", en: "Who you meet joins your network" }, tone: "apricot" },
        ]} />
      </div>
      <div className={s.panel} aria-label={sample}>
        <span className={s.sampleLabel}>{sample}</span>
        <div className={`${s.card} ${s.rec}`}>
          <div className={`${s.person} ${s.personTop}`}><MacTile emoji={t({ ja: "山", zh: "山", en: "D" })} tone="pink" /><div><b>{t({ ja: "山口 大樹", zh: "山口 大树", en: "Daiki Yamaguchi" })}</b><small>Kibo Ventures　{t({ ja: "パートナー", zh: "合伙人", en: "Partner" })}</small></div><span className={s.chip}>{t({ ja: "おすすめ 1人目", zh: "推荐第 1 位", en: "Pick #1" })}</span></div>
          <div className={s.chips}><span className={`${s.chip} ${s.teal}`}>{t({ ja: "提供　海外市場の販路", zh: "提供　海外市场渠道", en: "Offers　Overseas sales channels" })}</span><span className={`${s.chip} ${s.teal}`}>{t({ ja: "提供　中国市場の知見", zh: "提供　中国市场经验", en: "Offers　China market know-how" })}</span><span className={`${s.chip} ${s.blue}`}>{t({ ja: "話題　新規事業の立ち上げ", zh: "话题　新业务启动", en: "Topic　Launching new ventures" })}</span></div>
          <span className={s.lbl}>{t({ ja: "おすすめの理由", zh: "推荐理由", en: "Why meet" })}</span>
          <p>{t({ ja: "あなたは海外展開のパートナーを探していて、山口さんは海外市場の販路と中国市場の知見を提供できると書いています。新規事業の立ち上げという話題も共通しています。", zh: "你在找海外拓展伙伴，山口写明能提供海外市场渠道和中国市场经验。你们也都关注新业务启动。", en: "You're looking for an overseas expansion partner, and Yamaguchi lists overseas sales channels and China market know-how. You also share an interest in launching new ventures." })}</p>
          <span className={s.lbl}>{t({ ja: "聞いてみること", zh: "可以问的问题", en: "Questions to ask" })}</span>
          <ul><li>{t({ ja: "中国市場で販路をつくるとき、最初に押さえることは何でしょうか。", zh: "在中国市场开拓渠道时，首先要抓住什么？", en: "When building sales channels in China, what comes first?" })}</li><li>{t({ ja: "海外展開のパートナーを選ぶとき、何を一番重く見ていますか。", zh: "选海外拓展伙伴时，你最看重什么？", en: "What matters most to you when choosing an overseas partner?" })}</li></ul>
          <div className={s.hint}>{t({ ja: "まず自分の海外展開の構想を短く伝えてから、具体的な事例を聞くと話が進みます。", zh: "先简单说说自己的海外拓展设想，再问具体案例，话题更容易展开。", en: "Briefly share your own expansion plans first, then ask for concrete examples." })}</div>
        </div>
      </div>
    </section>

    {/* ⑤ いま申し込めるイベント（真实活动） */}
    <section className={`${s.sec} ${s.solo}`} id="events" data-landing-events={open.length}>
      <div className={s.evtop}>
        <div>
          <span className={s.eyebrow}>{t({ ja: "開催予定", zh: "即将举办", en: "Upcoming" })}</span>
          <h2>{t({ ja: "いま申し込めるイベント", zh: "现在可以报名的活动", en: "Events open for registration" })}</h2>
          <p>{t({ ja: "Orbit は、実際の交流会で使われながら作られています。", zh: "Orbit 是在真实的交流会上边用边做出来的。", en: "Orbit is built while being used at real meetups." })}</p>
        </div>
        {TRACK_RECORD ? <div className={s.nums}>
          <div><b>{TRACK_RECORD.sessions}</b>{t({ ja: "回の日中交流会", zh: "场中日交流会", en: "China–Japan meetups" })}</div>
          <div><b>{TRACK_RECORD.people}</b>{t({ ja: "人が参加", zh: "人参加", en: "attendees" })}</div>
        </div> : null}
      </div>
      {open.length ? <div className={`${s.cards} ${s.three}`}>
        {open.map((event) => {
          const date = eventDate(event, t);
          const facts = [event.venue, t({ ja: `${date.time} 開始`, zh: `${date.time} 开始`, en: `Starts ${date.time}` }), event.capacity ? t({ ja: `定員${event.capacity}人`, zh: `限 ${event.capacity} 人`, en: `${event.capacity} seats` }) : null].filter(Boolean).join("　");
          return <article key={event.eventId} className={s.ev} data-landing-event={event.eventId}>
            <div className={s.day}><div><b>{date.day}</b><br /><span>{date.sub}</span></div></div>
            <div className={s.in}>
              <strong>{event.title}</strong>
              <p>{facts}</p>
              <div className={s.between}>
                {event.seatsLeft !== null ? <span className={s.chip}>{t({ ja: `残り${event.seatsLeft}席`, zh: `剩 ${event.seatsLeft} 席`, en: `${event.seatsLeft} left` })}</span> : <span className={`${s.chip} ${s.teal}`}>{t({ ja: "受付中", zh: "报名中", en: "Open" })}</span>}
                <a className={s.primary} href={`${EVENTS}/${encodeURIComponent(event.eventId)}`}>{t({ ja: "申し込む", zh: "报名", en: "Register" })}</a>
              </div>
            </div>
          </article>;
        })}
      </div> : null}
      <a className={s.line} href={EVENTS}>{t({ ja: "すべてのイベントを見る", zh: "查看全部活动", en: "See all events" })}</a>
    </section>

    {/* ⑥ 主催者の方へ */}
    <section className={`${s.sec} ${s.solo}`} id="host">
      <span className={s.eyebrow}>{t({ ja: "主催者の方へ", zh: "给主办方", en: "For organizers" })}</span>
      <h2>{t({ ja: "席決めと紹介文は、Orbit が用意します。", zh: "排座和介绍文字，交给 Orbit。", en: "Seating and introductions, prepared by Orbit." })}</h2>
      <p>{t({ ja: "70人の会でも、参加者ごとの紹介文とテーブル分けが2分ほどで出来上がります。公開する前に、すべて確認できます。", zh: "即使是 70 人的活动，每位参加者的介绍和分桌也只要 2 分钟左右。公开前可以全部检查。", en: "Even for 70 people, each attendee's introductions and the table plan take about 2 minutes. Check everything before you publish." })}</p>
      <div className={`${s.cards} ${s.three}`}>
        <article><MacTile emoji="📣" tone="apricot" /><div><strong>{t({ ja: "申込ページを公開する", zh: "发布报名页", en: "Publish a sign-up page" })}</strong><p>{t({ ja: "日時、場所、定員を入れるだけです。", zh: "填好时间、地点和名额即可。", en: "Just add the date, place and capacity." })}</p></div></article>
        <article><MacTile emoji="📋" tone="blue" /><div><strong>{t({ ja: "名簿がそのまま揃う", zh: "名单自动整理好", en: "The roster builds itself" })}</strong><p>{t({ ja: "参加者が書いたプロフィールが一覧になります。", zh: "参加者填写的资料汇成一览。", en: "Attendees' own profiles become one list." })}</p></div></article>
        <article><MacTile emoji="🪑" tone="lav" /><div><strong>{t({ ja: "紹介とテーブルを作って配る", zh: "生成并发送介绍和分桌", en: "Create and share intros and tables" })}</strong><p>{t({ ja: "確認して公開すると、参加者それぞれの言語で届きます。", zh: "确认后公开，每位参加者都用自己的语言收到。", en: "Once you publish, each attendee gets them in their own language." })}</p></div></article>
      </div>
      <a className={s.line} href={EVENTS}>{t({ ja: "イベントを開く", zh: "举办活动", en: "Host an event" })}</a>
    </section>

    {/* ⑦ データの扱い */}
    <section className={`${s.sec} ${s.solo}`} id="privacy">
      <span className={s.eyebrow}>{t({ ja: "データの扱い", zh: "数据处理", en: "Your data" })}</span>
      <h2>{lines(t({ ja: "名刺と人脈を預かるので、\n決めていることがあります。", zh: "替你保管名片和人脉，\n我们定了几条规矩。", en: "We hold your cards and network,\nso we keep a few rules." }))}</h2>
      <div className={`${s.cards} ${s.two}`}>
        <article><MacTile emoji="🔒" tone="teal" /><div><strong>{t({ ja: "人脈は、あなただけのもの", zh: "人脉只属于你", en: "Your network is yours alone" })}</strong><p>{t({ ja: "登録した名刺やメモが、他の利用者に見えることはありません。", zh: "你登记的名片和记录，其他用户看不到。", en: "Other users never see the cards and notes you add." })}</p></div></article>
        <article><MacTile emoji="👥" tone="blue" /><div><strong>{t({ ja: "プロフィールを見られるのは、同じイベントの参加者と主催者だけ", zh: "只有同场参加者和主办方能看你的资料", en: "Only fellow attendees and the organizer see your profile" })}</strong><p>{t({ ja: "検索エンジンにも、他のイベントの参加者にも表示されません。", zh: "搜索引擎和其他活动的参加者都看不到。", en: "Not search engines, and not attendees of other events." })}</p></div></article>
        <article><MacTile emoji="✉️" tone="pink" /><div><strong>{t({ ja: "メールは下書きまで", zh: "邮件只到草稿", en: "Emails stop at a draft" })}</strong><p>{t({ ja: "お礼も紹介依頼も、Orbit が勝手に送ることはありません。", zh: "感谢也好，引荐请求也好，Orbit 都不会擅自发送。", en: "Thank-yous and intro requests are never sent without you." })}</p></div></article>
        <article><MacTile emoji="📤" tone="apricot" /><div><strong>{t({ ja: "書き出しは、いつでも", zh: "随时导出", en: "Export any time" })}</strong><p>{t({ ja: "人脈のデータは CSV・vCard・JSON で自分で持ち出せます。", zh: "人脉数据可以用 CSV、vCard、JSON 自己带走。", en: "Take your network with you as CSV, vCard or JSON." })}</p></div></article>
      </div>
    </section>

    {/* ⑧ 结尾 + 页脚 */}
    <section className={s.end}>
      <h2>{t({ ja: "まず、手元の名刺を10枚撮ってみませんか。", zh: "先拍 10 张手边的名片试试？", en: "Start with 10 cards you have on hand." })}</h2>
      <div className={s.ctas}><a className={`${s.primary} ${s.cta}`} href={SIGNUP}>{t({ ja: "無料で始める", zh: "免费开始", en: "Get started free" })}</a><a className={s.google} href={EVENTS}>{t({ ja: "イベントを探す", zh: "找活动", en: "Find events" })}</a></div>
      <small>{t({ ja: "登録は1分 · クレジットカード不要", zh: "约 1 分钟完成注册 · 无需信用卡", en: "Sign up in about a minute · No credit card required" })}</small>
    </section>
    <footer className={s.foot}>
      <span>© 2026 Orbit</span>
      <a href="/terms">{t({ ja: "利用規約", zh: "使用条款", en: "Terms" })}</a>
      <a href="/privacy">{t({ ja: "プライバシーポリシー", zh: "隐私政策", en: "Privacy" })}</a>
      <a href="/help">{t({ ja: "よくある質問", zh: "常见问题", en: "FAQ" })}</a>
      <span className={s.lang}>
        {([["ja", shellCopy.languageJa.ja], ["zh", shellCopy.languageZh.zh], ["en", "English"]] as const).map(([code, label]) => code === language
          ? <b key={code} aria-current="true">{label}</b>
          : <button key={code} type="button" lang={code} onClick={() => setLanguage(code)}>{label}</button>)}
      </span>
    </footer>
  </Orbit2026Scope>;
}

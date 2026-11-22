#!/usr/bin/env python3
"""生成登录前展示页三个方案（a/b/c.html）。共用区块写在这里，方案之间只差首屏与顺序。
用法：python3 docs/designs/redesign-2026-10/landing/build.py"""
from pathlib import Path

OUT = Path(__file__).parent

TOP = """<header class="top"><div class="wrap">
  <a class="brand" href="#"><i>O</i>Orbit</a>
  <nav aria-label="ページ内"><a href="#how">使い方</a><a href="#events">イベント</a><a href="#host">主催者の方へ</a></nav>
  <div class="acct"><a href="#">ログイン</a><a class="btn sm" href="#">無料で始める</a></div>
</div></header>"""

CTA = """<div class="cta"><a class="btn" href="#">無料で始める</a><a class="btn line" href="#events">イベントを探す</a></div>
<p class="note">登録は1分で終わります。クレジットカードは要りません。</p>"""


def rec(lang_switch=True):
    sw = """<div class="langsw" role="group" aria-label="表示言語"><label for="l-ja">日本語</label><label for="l-zh">中文</label><label for="l-en">English</label></div>""" if lang_switch else ""
    return """<div class="rec">
  <input type="radio" name="l" id="l-ja" checked><input type="radio" name="l" id="l-zh"><input type="radio" name="l" id="l-en">
  <div class="who"><span class="av p">山</span><div><b>山口 大樹</b><span>Kibo Ventures　パートナー</span></div><span class="rank">おすすめ 1人目</span></div>
  <div class="tags"><span class="o">提供　海外市場の販路</span><span class="o">提供　中国市場の知見</span><span class="k">話題　新規事業の立ち上げ</span></div>
  <div data-l="ja"><h3>おすすめの理由</h3>
    <p>あなたは海外展開のパートナーを探していて、山口さんは海外市場の販路と中国市場の知見を提供できると書いています。新規事業の立ち上げという話題も共通しています。</p>
    <h3>聞いてみること</h3><ul><li>中国市場で販路をつくるとき、最初に押さえることは何でしょうか。</li><li>海外展開のパートナーを選ぶとき、何を一番重く見ていますか。</li></ul>
    <div class="hint">まず自分の海外展開の構想を短く伝えてから、具体的な事例を聞くと話が進みます。</div></div>
  <div data-l="zh"><h3>推荐理由</h3>
    <p>您正在寻找海外拓展的合作伙伴，而山口写明可以提供海外市场的销售渠道和中国市场的经验。新业务启动也是双方共同的话题。</p>
    <h3>可以问的问题</h3><ul><li>在中国市场开拓销售渠道，首先要把握的是什么？</li><li>您在选择海外拓展的合作伙伴时，最看重什么？</li></ul>
    <div class="hint">先简要说说自己的海外拓展构想，再请对方谈具体案例，交流会更顺。</div></div>
  <div data-l="en"><h3>Why we suggest them</h3>
    <p>You are looking for an overseas expansion partner, and Yamaguchi offers overseas sales channels and knowledge of the Chinese market. You also share an interest in launching new businesses.</p>
    <h3>Questions to ask</h3><ul><li>What comes first when building sales channels in China?</li><li>What matters most to you when choosing an expansion partner?</li></ul>
    <div class="hint">Share your own expansion idea briefly, then ask for a concrete case.</div></div>
  """ + sw + "</div>"


TABLE = """<div class="table">
  <div class="tno">テーブル 3　第1ラウンド</div>
  <h3>海外展開を、誰と始めるか</h3>
  <p>販路を持つ人、現地の知見がある人、これから出ていく人が同じ席に座ります。</p>
  <div class="seat"><span class="av s p">山</span><div><b>山口 大樹</b>海外市場の販路と中国市場の知見を提供できます。</div></div>
  <div class="seat"><span class="av s t">森</span><div><b>森田 恵</b>代理店と販売パートナーを探しています。</div></div>
  <div class="seat"><span class="av s b">林</span><div><b>林 俊介</b>最初の顧客とテストユーザーを探しています。</div></div>
  <div class="q">最初の話題　海外で最初の1社を見つけたとき、きっかけは何でしたか。</div>
</div>"""


def ticket(day, mon, title, meta, left, tone=""):
    return f"""<article class="ticket {tone}"><div class="day"><div><b>{day}</b><br><span>{mon}</span></div></div>
<div class="body"><h3>{title}</h3><p>{meta}</p><div class="row"><span class="left">{left}</span><a class="btn sm plum" href="#">申し込む</a></div></div></article>"""


TICKETS = (
    ticket("12", "12月 土", "日中創新創業交流会 Vol.5", "東京・渋谷　18:30 開始　定員70人", "残り 12席")
    + ticket("19", "12月 土", "AIスタートアップ ミートアップ", "東京・六本木　19:00 開始　定員40人", "残り 8席", "r")
    + ticket("16", "1月 金", "海外展開の勉強会と懇親会", "大阪・梅田　18:00 開始　定員30人", "受付中", "g")
)

STEPS = """<section class="sec {tint}" id="how"><div class="wrap">
  <h2>申し込みから翌朝まで、やることは3つです。</h2>
  <div class="steps">
    <div class="step"><div class="when">申し込むとき</div><h3>求めていることと、提供できることを書く</h3><p>選択式なので2分で終わります。ここに書いた内容だけが、紹介に使われます。</p>
      <div class="mini"><div class="tags" style="margin:0"><span class="n">求める　海外展開パートナー</span><span class="o">提供　SNSマーケティング</span><span class="k">話題　生成AIの活用</span></div></div></div>
    <div class="step"><div class="when">開催の前日</div><h3>会うべき5人と、その理由が届く</h3><p>誰に、何を聞くかが決まった状態で会場に入れます。席も同じ考え方で決まります。</p>
      <div class="mini"><div class="line"><span class="av s p">山</span><div><b>山口 大樹</b><small>海外市場の販路を提供できます</small></div></div><div class="line"><span class="av s t">陳</span><div><b>陳 凌岳</b><small>事業パートナーを探しています</small></div></div></div></div>
    <div class="step"><div class="when">会ったあと</div><h3>名刺を撮って、翌朝のお礼まで</h3><p>名刺はその場で人脈に入ります。翌朝、お礼の下書きと次に連絡する日が並びます。送るのはあなたです。</p>
      <div class="mini paperbox" style="display:flex;align-items:center;gap:16px"><div class="paper">Kibo Ventures<b>山口 大樹</b></div><div><b>お礼の下書き</b><small>山口さんへ、昨日のお礼と資料のご案内</small></div></div></div>
  </div>
</div></section>"""


def feat(kind, tint, flip=False):
    vis = rec() if kind == "rec" else TABLE
    if kind == "rec":
        h = "紹介文は、二人のプロフィールに書かれていることだけで作ります。"
        lead = "開催前に、参加者の中からあなたに合う人を最大5人選びます。合う人が5人に満たないときは、無理に埋めません。"
    else:
        h = "席も、話す理由がある人どうしで決まります。"
        lead = "テーブルごとにテーマと最初の話題が付きます。2ラウンドあるので、同じ顔ぶれが続くことはほとんどありません。"
    pts = """<ul class="points">
      <li><b>理由2文、質問2つ、切り出し方1つ</b><span>読むのに30秒。会場で名札を探すところから始められます。</span></li>
      <li><b>日本語、中文、English で届く</b><span>相手が何語でプロフィールを書いていても、あなたの言語で読めます。</span></li>
      <li><b>書いていないことは、書かない</b><span>肩書きや実績を推測で足すことはありません。</span></li></ul>"""
    return f"""<section class="sec feat {'tint' if tint else ''} {'flip' if flip else ''}"><div class="wrap">
  <div class="txt"><h2>{h}</h2><p class="lead">{lead}</p>{pts}</div>
  <div class="vis">{vis}<p class="note"><span class="sample">サンプル</span>　画面は例です。実在の人物ではありません。</p></div>
</div></section>"""


def events(tint, with_list=True):
    lst = f'<div class="events">{TICKETS}</div><div class="more"><a class="btn line" href="#">すべてのイベントを見る</a></div>' if with_list else ""
    return f"""<section class="sec {'tint' if tint else ''}" id="events"><div class="wrap">
  <div class="evhead"><div><h2>{'いま申し込めるイベント' if with_list else 'これまでの開催'}</h2><p class="lead">Orbit は、実際の交流会で使われながら作られています。</p></div>
  <div class="nums"><div><b>4</b>回の日中交流会</div><div><b>223</b>人が参加</div></div></div>
  {lst}
</div></section>"""


HOST = """<section class="sec" id="host"><div class="wrap"><div class="host">
  <div><h2>主催者の方へ。席決めと紹介文は、Orbit が用意します。</h2>
  <p class="lead">70人の会でも、参加者ごとの紹介文とテーブル分けが2分ほどで出来上がります。公開する前に、すべて確認できます。</p>
  <a class="btn" href="#">イベントを開く</a></div>
  <ol><li><div><b>申込ページを公開する</b>日時、場所、定員を入れるだけです。</div></li>
  <li><div><b>名簿がそのまま揃う</b>参加者が書いたプロフィールが一覧になります。</div></li>
  <li><div><b>紹介とテーブルを作って配る</b>確認して公開すると、参加者それぞれの言語で届きます。</div></li></ol>
</div></div></section>"""

PRIV = """<section class="sec {tint}"><div class="wrap">
  <h2>名刺と人脈を預かるので、決めていることがあります。</h2>
  <div class="priv">
    <div><b>プロフィールを見られるのは、同じイベントの参加者だけ</b><span>検索エンジンにも、他のイベントの参加者にも表示されません。</span></div>
    <div><b>紹介に使うのは、あなたが書いたことだけ</b><span>名刺やメモの内容が、他の人への紹介文に出ることはありません。</span></div>
    <div><b>メールは下書きまで</b><span>お礼も紹介依頼も、Orbit が勝手に送ることはありません。</span></div>
    <div><b>書き出しと退会は、いつでも</b><span>人脈のデータは自分で持ち出せます。退会するとデータは削除されます。</span></div>
  </div>
</div></section>"""

END = """<section class="end"><div class="wrap">
  <h2>次の交流会の前に、プロフィールを書いておきませんか。</h2>
  <div class="cta"><a class="btn" href="#">無料で始める</a><a class="btn line" href="#events">イベントを探す</a></div>
</div></section>
<footer class="foot"><div class="wrap"><span>© 2026 Orbit</span><a href="#">利用規約</a><a href="#">プライバシーポリシー</a><a href="#">よくある質問</a>
<span class="lang"><b>日本語</b><a href="#">中文</a><a href="#">English</a></span></div></footer>"""

HERO_A = f"""<section class="hero heroA"><div class="wrap">
  <div><h1>交流会で誰と話すかを、行く前に決めておく。</h1>
  <p class="sub">参加者のプロフィールから、あなたが会うべき5人と、その理由、最初の質問までを開催前にお届けします。</p>{CTA}</div>
  <div class="stack"><div class="when">12月12日の交流会の前日に届きます</div>{rec()}<div class="peek"></div><div class="peek two"></div></div>
</div></section>"""

HERO_B = f"""<section class="hero heroB"><div class="wrap">
  <h1>次の交流会を、<br>名刺交換だけで終わらせない。</h1>
  <p class="sub">申し込むと、開催前に「会うべき5人」とその理由が届きます。まずは近くのイベントから。</p>{CTA}
  <div class="tickets">{TICKETS}</div>
</div></section>"""

PICKS = [("p", "山", "山口さん", 50, 15), ("t", "陳", "陳さん", 85, 38), ("b", "林", "林さん", 74, 80), ("a", "森", "森田さん", 22, 78), ("", "寒", "寒陽さん", 14, 34)]
DIMS = [(50, 2), (93, 62), (38, 96), (4, 58), (30, 10), (66, 24), (70, 62), (34, 60), (8, 82), (88, 16)]
ORBIT = ('<div class="orbit" aria-label="参加者の中から選ばれた5人"><span class="ring"></span><span class="ring"></span><span class="ring"></span>'
         + "".join(f'<span class="dot dim" style="left:{x}%;top:{y}%"></span>' for x, y in DIMS)
         + "".join(f'<span class="pick" style="left:{x}%;top:{y}%"><span class="av s {t}">{k}</span>{n}</span>' for t, k, n, x, y in PICKS)
         + '<span class="me">あなた</span></div>')

HERO_C = f"""<section class="hero heroC"><div class="wrap">
  <div><h1>70人の中から、<br>会うべき5人を。</h1>
  <p class="sub">交流会の前に、話す理由がある人と最初の質問が届きます。会ったあとは、名刺とお礼の下書きまで。</p>{CTA}</div>
  {ORBIT}
</div></section>"""

PAGES = {
    # A：推荐卡片做主角。首屏已经放了推荐卡片，功能屏改放「桌子」。
    "a": ("方案 A · 推荐卡片做主角", [HERO_A, STEPS.format(tint="tint"), feat("table", False), events(True), HOST, PRIV.format(tint="tint"), END]),
    # B：活动做主角。首屏直接放可报名的活动，后面的活动屏只留数字。
    "b": ("方案 B · 活动做主角", [HERO_B, feat("rec", True), STEPS.format(tint=""), HOST, events(True, with_list=False), PRIV.format(tint=""), END]),
    # C：一句话加轨道图。首屏最简，内容靠后面几屏展开。
    "c": ("方案 C · 一句话加轨道图", [HERO_C, STEPS.format(tint="tint"), feat("rec", False, flip=True), events(True), HOST, PRIV.format(tint="tint"), END]),
}

for key, (title, parts) in PAGES.items():
    html = f"""<!doctype html><html lang="ja" data-theme="light"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Orbit 展示页 {title}</title>
<link rel="stylesheet" href="landing.css"></head><body>
{TOP}
<main>
{"".join(parts)}
</main>
</body></html>"""
    (OUT / f"{key}.html").write_text(html, encoding="utf-8")
    print("wrote", key)

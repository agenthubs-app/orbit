/* 示例数据（全部为虚构的人物/公司/活动） */
window.D = {
  me: { name: '佐藤 健一', short: '佐', co: '株式会社ミナトリンク', role: '代表取締役CEO' },
  today: { month: '10月', date: '10月7日（水）', range: '10月1日–10月31日' },
  goals: {
    main: { t: 'シリーズA 資金調達', target: '3億円', due: '2027年3月', week: 6, weeks: 24, pct: 46 },
    sub: { t: '製造業の新規顧客開拓', target: '商談 12件', pct: 58 },
  },
  contacts: [
    { n: '高橋 美咲', i: '高', c: 'c2', co: '青葉ベンチャーズ', role: 'パートナー', stage: '推進中', st: 'lav', val: 'シリーズAのリード投資家候補。SaaS領域に年8社出資', last: '2日前', emo: '💼' },
    { n: '鈴木 大輔', i: '鈴', c: 'c3', co: '北辰製作所', role: 'DX推進室 室長', stage: '関係構築', st: 'blue', val: '工場IoTの導入検討中。PoC予算を持つ決裁者', last: '昨日', emo: '🏭' },
    { n: '伊藤 直子', i: '伊', c: 'c4', co: '株式会社ハルモニア', role: 'CFO', stage: '協業中', st: 'teal', val: '資本政策の相談相手。VC 4社と面識あり', last: '今日', emo: '📊' },
    { n: '渡辺 翔', i: '渡', c: 'c5', co: 'Nexa Robotics', role: '代表取締役', stage: '知り合い', st: 'apricot', val: '同時期にシリーズAを調達。投資家の紹介が可能', last: '1週間前', emo: '🚀' },
    { n: '中村 由紀', i: '中', c: 'c1', co: '光が丘法律事務所', role: '弁護士', stage: '関係構築', st: 'blue', val: '投資契約・種類株式に強い', last: '3週間前', emo: '⚖️' },
    { n: '小林 誠', i: '小', c: 'c2', co: '丸の内イノベーションラボ', role: '主宰', stage: '知り合い', st: 'apricot', val: '大企業の新規事業担当者 300名のコミュニティ', last: '1か月前', emo: '🏢' },
    { n: '加藤 健太', i: '加', c: 'c3', co: 'アクシス商事', role: '営業本部長', stage: '推進中', st: 'lav', val: '中部の製造業 40社に販路', last: '5日前', emo: '🤝' },
    { n: '山本 彩', i: '山', c: 'c4', co: '東都キャピタル', role: 'シニアアソシエイト', stage: '要フォロー', st: 'pink', val: '前回の面談で資料の再送を依頼されたまま', last: '24日前', emo: '💼' },
  ],
  events: [
    { n: 'Japan SaaS Summit 2026 秋', d: '10月16日（金）', place: '東京国際フォーラム', score: 82, v: '参加をおすすめ', vc: 'teal', emo: '🎤', meet: 14, fee: '¥15,000' },
    { n: 'CFO Night Tokyo vol.18', d: '10月7日（水）19:00', place: '渋谷ストリーム', score: 74, v: '参加をおすすめ', vc: 'teal', emo: '🥂', meet: 6, fee: '¥5,000' },
    { n: '製造業DXカンファレンス 大阪', d: '10月23日（金）', place: 'グランフロント大阪', score: 68, v: '条件付き', vc: 'apricot', emo: '🏭', meet: 9, fee: '無料' },
    { n: '丸の内スタートアップ朝会 #42', d: '10月21日（水）8:00', place: '丸の内', score: 41, v: '見送り推奨', vc: 'pink', emo: '☕', meet: 2, fee: '¥1,000' },
  ],
};

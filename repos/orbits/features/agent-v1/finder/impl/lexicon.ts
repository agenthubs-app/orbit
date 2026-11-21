// @ts-nocheck -- finder/impl/lexicon.ts: copied byte for byte from lab-rsi repos/orbits/lab/record-finder/rsi/archive/r10/impl/lexicon.ts
// (lab commit 931bae340, r10 accepted). Only these two header lines differ; the lab code does not pass this repo's build typecheck.
/**
 * General vocabulary (zh / ja / en) used by cleanClue and the finders. Word classes, not anybody's records:
 * kind words, pointers, request verbs, function words, honorifics / job-title words, common surnames, and
 * cross-language synonym classes for everyday business words.
 */
import { fold } from "./text";

export const KIND_WORDS = [
  // zh
  "待办事项", "代办事项", "待辦事項", "待办", "待辦", "代办", "代辦", "任务", "任務", "笔记", "筆記", "备忘录", "備忘録", "备忘", "備忘",
  "日程", "行程", "活动", "活動", "事项", "事項", "提醒", "todo", "to-do", "todos", "to-dos", "task", "tasks", "note", "notes", "memo", "memos",
  "reminder", "reminders", "event", "events", "appointment", "appointments", "schedule", "entry", "item", "items", "record",
  // ja
  "タスク", "メモ", "予定", "イベント", "やること", "やる事", "用事", "ノート", "スケジュール", "アポ", "催し", "リマインダー", "リマインド",
  // contacts
  "联系人", "聯絡人", "連絡先", "contact", "contacts",
  // r04: a list / sheet form of a schedule names the kind (予定表 / 日程表)
  "予定表", "スケジュール表", "日程表", "日程安排表",
  // r05: other zh note forms (便签 / 便条); 付箋 / メモ帳 stay content (bought as goods)
  "便签", "便簽", "便笺", "便箋", "便条", "便條", "备忘", "备注条",
];
/** Kind words that may stand for a whole record only when alone (they are also common title words). */
export const SOFT_KIND_WORDS = ["安排", "事情", "事儿", "事", "会", "打ち合わせ", "ミーティング", "meeting", "记录", "記録", "紀錄"];

export const POINTER_WORDS = [
  "上面那个", "上面那条", "下面那个", "刚才那个", "刚才那条", "刚刚那个", "剛才那個", "那件事儿", "那件事情", "那件事", "这件事", "那个事",
  "那条", "这条", "那條", "這條", "那个", "这个", "那個", "這個", "那篇", "这篇", "那件", "这件", "那位", "这位", "那家", "那场", "这场",
  "那次", "那一次", "这次", "那项", "这项", "那項", "這項", "那张", "这张", "那張", "這張", "那笔", "这笔", "那筆", "那则", "这则", "那封", "这封", "那单", "这单", "那天", "那边", "這邊", "那邊", "这边", "那些", "这些", "那两条", "那两个", "这两条", "哪个", "哪条", "哪些", "那份", "这份",
  "上面", "下面", "刚才", "刚刚", "剛才", "之前", "前面", "最后", "最後", "最新", "那", "这", "這", "其中",
  "それ", "これ", "あれ", "あの", "その", "この", "例の", "さっきの", "さっき", "先ほどの", "先ほど", "上の", "下の", "上から", "下から", "一番上の", "一番下の", "一番上", "一番下", "やつ", "ヤツ", "奴",
  "方", "ほう", "もの", "こと", "の件", "件", "の話", "話",
  "the", "that", "this", "those", "these", "one", "ones", "it", "thing", "things", "stuff", "above", "previous", "latest", "earlier",
  "后面那个", "后面那条", "后面那篇", "后面的", "後面那個", "前面那个", "前面那条", "前面那篇", "中间那个", "中间那条", "中间那篇", "中間那個", "中间的",
  "後のほう", "後の方", "前のほう", "前の方", "真ん中の", "真ん中", "後者", "前者", "后者", "middle", "the middle one",
  "thingy", "thingie", "whatsit", "doohickey",
  // r10: vague Chinese / Japanese nouns for "that thing" (玩意儿 / アレコレ)
  "玩意儿", "玩意兒", "玩意", "玩艺儿", "アレコレ", "あれこれ",
  // r04: formal pointers (该项 / 此条 / 本条 / 当該の)
  "该项", "该条", "该篇", "该笔", "此条", "此项", "此篇", "此事", "本条", "本项", "当該", "当该", "該当", "那则", "此则",
  // r05: chat-thread deixis (楼上 = the message above)
  "楼上", "樓上", "楼下", "樓下", "上头", "上頭", "上边", "上邊",
  // r06: Cantonese pointers (嗰个 = 那个)
  "嗰个", "嗰個", "嗰条", "嗰條", "嗰篇", "嗰件", "嗰张", "嗰張", "嗰份", "嗰单", "嗰單", "嗰次", "嗰位", "嗰",
  "both", "両方", "両方とも", "二つとも", "两条", "两个", "都", "first", "second", "third", "fourth", "fifth", "last", "latter", "former",
];

export const VERB_WORDS = [
  // zh
  "改到", "改成", "改为", "改一下", "改个", "改", "挪到", "挪", "往后挪", "往后推", "推迟到", "推迟", "推到", "推后", "延后", "提前到", "提前", "移到",
  "删了", "删掉", "删除", "删", "不要了", "去掉", "完成了", "完成", "做完了", "做完", "搞定了", "搞定", "勾掉", "打勾", "打个勾", "标成", "标记", "标完成",
  "划掉", "划了", "干掉", "删掉吧", "弄掉", "去掉吧", "处理掉", "勾了", "关联到", "关联", "链接", "绑定", "恢复回来", "恢复", "找回来", "找回", "打开", "看看", "看下", "看一下", "给我看", "发我", "帮我", "找一下", "查一下",
  "取消", "确认一下", "翻出来", "再看一眼", "看一眼", "去过的", "去过", "去的", "去了",
  // ja
  "消して", "消しといて", "消す", "削除して", "削除", "完了にして", "完了", "変更して", "変更", "変えて", "ずらして", "移して", "回して", "見せて",
  "開いて", "紐づけて", "紐づけ", "戻して", "復元", "リスケ", "キャンセル", "済みにして", "行った", "行ってきた", "参加した",
  // en
  "delete", "remove", "mark", "done", "complete", "completed", "move", "push", "change", "update", "open", "show", "link", "restore", "find",
  "cancel", "reschedule", "tick", "check", "off", "set", "showed", "shown", "listed", "mentioned", "gave", "sent", "saying", "says", "said",
  "went", "attended", "visited",
];

/** Function words and wrappers that are never content. */
export const STOP_WORDS = [
  // zh
  "关于", "有关", "相关", "方面", "的", "之", "地", "得", "给", "跟", "和", "与", "同", "对", "把", "被", "让", "将", "在", "从", "向", "为", "了", "吧",
  "呢", "吗", "啊", "嘛", "呀", "啥", "那个啥", "那啥", "手头", "手头上", "手上", "我", "我的", "我们", "我们的", "咱们", "咱们的", "咱", "咱的", "俺", "你", "你的", "您", "您的", "你们", "自己", "说的", "说", "讲的", "提到的", "提到", "里", "里面", "中",
  "要", "要的", "去", "来", "做", "搞", "当", "管", "负责", "一下", "一个", "一条", "什么", "来着", "是", "有", "还", "也", "就", "又", "再", "都是",
  "叫", "叫什么", "谁", "哪", "哪儿", "哪里", "哪天", "几点", "几号", "多少", "怎么样", "怎样", "如何", "是不是", "有没有",
  // ja
  "について", "についての", "に関する", "に関して", "関係", "関連", "の", "を", "に", "と", "が", "は", "で", "も", "へ", "や", "から", "まで",
  "より", "って", "という", "との", "での", "への", "からの", "ってやつ", "ね", "よ", "か", "な", "私", "僕", "俺", "自分", "うち", "わたし", "あなた",
  // en
  "a", "an", "of", "for", "about", "with", "to", "on", "in", "at", "from", "by", "regarding", "re", "and", "or", "i", "me", "my", "mine",
  "you", "your", "we", "our", "us", "is", "was", "are", "were", "be", "been", "what", "which", "who", "when", "where", "how", "again", "please",
  "just", "now", "can", "could", "did", "do", "does", "have", "has", "had", "some", "any", "there", "here", "so", "as",
];

export const PRONOUNS = ["他们", "她们", "他的", "她的", "他", "她", "它", "ta", "人家", "对方", "對方", "先方", "彼女ら", "彼ら", "彼女", "彼", "him", "her", "he", "she", "his", "hers", "them", "they", "their", "theirs"];

/** Honorifics and job-title words that follow a surname. Longest first when matching. */
export const ZH_TITLES = [
  "副总经理", "总经理", "董事长", "副总裁", "总裁", "总监", "副总", "总", "经理", "主管", "主任", "老师", "先生", "女士", "小姐", "律师", "老板", "厂长",
  "行长", "院长", "部长", "处长", "科长", "课长", "所长", "教授", "博士", "医生", "工", "姐", "哥",
  // more roles a surname is called by (any user's contacts)
  "秘书", "秘書", "会计", "會計", "船长", "船長", "机长", "機長", "队长", "隊長", "组长", "組長", "站长", "馆长", "校长", "局长", "司长", "厅长",
  "主编", "导演", "老总", "总工", "工程师", "设计师", "大夫", "护士", "專員", "专员", "书记", "董事", "董秘", "师傅", "師傅",
  "董", "大哥", "大姐", "阿姨", "老师傅", "经理人", "总助", "主管", "店长", "厂长", "副经理", "副厂长", "副主任", "副部长", "副院长", "副行长", "总经办",
];
export const JA_TITLES = [
  "代表取締役", "取締役", "支店長", "社長", "部長", "課長", "係長", "室長", "所長", "店長", "会長", "専務", "常務", "主任", "先生", "教授", "博士",
  "さん", "様", "さま", "サマ", "君", "くん", "ちゃん", "氏", "殿", "担当",
  "先輩", "女史", "次長", "主査", "理事", "相談役", "所長代理", "部長代理", "課長代理", "副社長", "副部長",
];
export const EN_TITLES = ["mr.", "mrs.", "ms.", "dr.", "mr", "mrs", "ms", "dr", "prof.", "prof", "-san", "san", "sensei"];

/** Job-title equivalences used when a title word narrows a surname (D4). */
export const TITLE_EQUIV: string[][] = [
  ["经理", "經理", "manager", "マネージャー", "マネジャー"],
  ["总监", "總監", "director", "ディレクター", "head"],
  ["律师", "律師", "弁護士", "lawyer", "attorney"],
  ["课长", "課長", "section chief"],
  ["部长", "部長", "general manager"],
  ["社长", "社長", "代表", "代表取締役", "president", "ceo", "老板", "总经理", "總經理"],
  ["行长", "支店長", "branch manager"],
  ["副总", "副總", "vp", "vice president"],
  ["厂长", "廠長", "工場長", "工厂长", "plant manager", "factory manager"],
  ["董事", "取締役", "取缔役", "理事", "board director", "board member"],
  ["产品经理", "產品經理", "产品", "產品", "プロダクトマネージャー", "プロダクトマネジャー", "product manager", "pm", "product"],
  ["项目经理", "項目經理", "プロジェクトマネージャー", "project manager"],
  ["技术总监", "技术", "技術", "cto", "engineering"],
  ["财务", "財務", "会计", "會計", "経理", "finance", "accounting", "accountant", "cfo"],
  ["律师助理", "律師助理", "パラリーガル", "paralegal", "legal assistant"],
  ["合伙人", "partner", "パートナー"],
  ["设计师", "デザイナー", "designer"],
  ["主管", "supervisor", "lead"],
  ["总", "總", "总监", "總監", "总经理", "副总", "总裁", "director", "ceo", "head"],
];

/** Common Chinese surnames (two-character ones first). */
export const ZH_SURNAMES_2 = ["欧阳", "歐陽", "司马", "司馬", "上官", "诸葛", "諸葛", "东方", "東方", "皇甫", "慕容", "令狐", "公孙", "长孙", "宇文", "尉迟", "夏侯", "端木"];
export const ZH_SURNAMES_1 = [...
  "王李张張刘劉陈陳杨楊黄黃赵趙吴吳周徐孙孫马馬朱胡郭何高林罗羅郑鄭梁谢謝宋唐许許韩韓冯馮邓鄧曹彭曾肖萧蕭田董袁潘于蒋蔣蔡余杜叶葉程苏蘇魏吕呂丁任沈姚卢盧姜崔钟鍾谭譚陆陸汪范金石廖贾賈夏韦韋付方白邹鄒孟熊秦邱江尹薛闫阎段雷侯龙龍史陶黎贺賀顾顧毛郝龚龔邵万萬钱錢严嚴覃武戴莫孔向汤湯常温溫康施文牛樊葛邢安齐齊易乔喬伍庞龐颜顏倪庄莊聂聶章鲁魯岳翟殷詹申欧歐耿关關兰蘭焦俞左柳甘祝包宁寧尚符舒阮柯纪紀梅童凌毕畢单單季裴霍涂成苗谷盛曲翁冉骆駱蓝藍路游辛靳管柴蒙鲍鮑华華喻祁蒲房滕屈饶饒解牟艾尤阳陽时時穆农農司卓古吉缪繆简簡车車项項连連芦盧麦麥褚娄婁窦竇戚岑景党宫宮费費卜冷晏席卫衛米柏宗瞿桂全佟应應臧闵閔苟邬鄔边邊卞姬师師和仇栾欒隋商刁沙荣榮巫寇桑郎甄丛叢仲虞敖巩鞏明佘池查麻苑迟遲邝鄺",
];

/** Readings of common Japanese surnames written in kanji (romaji), for a Japanese honorific context. */

// ---------------------------------------------------------------- synonym classes
// One class per line, surfaces separated by "|". A leading "!" marks a generic class (verbs such as buy / send /
// confirm): a record that matches only generic words of a query is not a candidate by itself.
const SYNONYM_SRC = `
报告|報告|报告书|報告書|レポート|report|reports
测试|測試|试验|試験|テスト|test|testing|tests
审计|審計|監査|监查|audit
报价|報價|报价单|見積|見積もり|見積り|見積書|御見積|quote|quotes|quotation|quoting
价格|価格|価額|值段|値段|price|prices|pricing
价格改定|価格改定|调价|価格改正|price revision
报销|報銷|报销单|报账|経費精算|経費|精算|精算書|立替|expense|expenses|reimbursement|expense report
!提交|提出|递交|上交|交|出す|submit|hand in
!确认|確認|核实|confirm|check
!买|购买|購入|買う|買い|buy|purchase|shopping
!发送|送付|発送|寄送|邮寄|送る|寄出|ship|send|mail
!准备|準備|用意|prepare|preparation
!整理|まとめ|organize|tidy
!回复|返信|返事|reply|respond|answer
酒店|宾馆|ホテル|hotel|hotels|旅馆|旅館|住宿|宿泊|宿|lodging|accommodation|accommodations
预订|预约|予約|booking|reservation|reserve
机票|機票|航空券|飞机票|フライト|航班|flight|flights|air ticket|plane ticket
飞|飛|飞往|飛往|搭机|搭機|フライト|航班|flight|flights|fly|flying
资料|資料|材料|書類|文件|materials|documents|docs|paperwork
纪要|会议记录|会议纪录|会议笔记|議事録|会議録|会議メモ|打ち合わせメモ|minutes|meeting minutes
会议|会議|ミーティング|打ち合わせ|打合せ|打ち合せ|碰头会|碰头|開会|meeting|meetings|sit-down|sitdown
咨询|諮詢|咨询公司|コンサル|コンサルティング|consulting|consultancy|consultants|consulting firm
合伙人|合夥人|パートナー|partner|partners
周会|例会|定例|定例会|定例ミーティング|週次ミーティング|週次|weekly meeting|team meeting|weekly sync|standup
集装箱|货柜|貨櫃|コンテナ|container|containers
赔偿|賠償|补偿|補償|compensation|claim|賠付
延误|延誤|遅延|延迟|延期|delay|delayed|delays
电话|電話|通话|call|calls|phone|phone call
回电|折り返し|折返し|callback|call back
样品|樣品|サンプル|sample|samples|样机|样本|サンプル機
伴手礼|伴手禮|手信|お土産|土産|手土産|souvenir|souvenirs
礼物|礼品|贈り物|プレゼント|ギフト|gift|gifts|present
介绍|介紹|紹介|引き合わせ|引き合わせる|intro|introduce|introduction|introductions
采访|採訪|访谈|取材|インタビュー|interview|interviews
提纲|大纲|アウトライン|outline
提案|プロポーザル|企画|proposal|proposals|pitch deck
方案|案|プラン|plan|plans|options
展位|摊位|ブース|booth|booths
布置|配置|レイアウト|layout|setup
合同|合約|契約|契约|契約書|contract|contracts|agreement
签约|簽約|調印|締結|契約締結|signing|sign the contract|签合同|签订合同|签署合同|契約を結ぶ|sign the deal
仪式|儀式|式典|ceremony
季度|四半期|quarter
销售|銷售|営業|売上|sales|selling
仓库|倉庫|warehouse|warehouses|库房
物流|ロジスティクス|ロジ|logistics|运输|運送|配送
船务|航运|海运|海運|船舶|shipping|maritime|ocean freight
运费|運賃|送料|海运费|运价|freight|freight rate|freight rates|shipping cost
采购|採購|購買|调达|調達|purchasing|procurement|buyer
律师|律師|弁護士|lawyer|lawyers|attorney|attorneys|法律|法務|法律事務所|律师事务所|律所|legal|law firm
律师助理|律師助理|法律助理|パラリーガル|リーガルアシスタント|paralegal|paralegals|legal assistant
助理|アシスタント|assistant|assistants
商务|商務|商业|商業|ビジネス|business
日中|中日|japan-china|china-japan|sino-japanese
财报|財報|财务报表|財務報表|决算书|決算書|決算報告|财务报告|財務諸表|financial statements|financial statement|financials
保险|保險|保険|insurance
课长|課長|section chief
建材|建築資材|building materials|construction materials
申请|申請|申込|申し込み|申込み|申し込む|application|apply
吃饭|饭局|晚饭|晚餐|晩餐|晚宴|聚餐|会食|食事|夕食|夕飯|ディナー|dinner|meal|meals|宴会
房租|家賃|租金|rent|房费
晨跑|跑步|朝ラン|ランニング|ジョギング|morning run|morning runs|jogging
英会話|英会话|えいかいわ|英語レッスン|英语课|英语会话|english lesson|english conversation
健康诊断|体检|體檢|健診|health check|health checkup|medical checkup|checkup
歯医|牙医|牙醫|看牙|歯科|dentist|dental
复盘|復盤|振り返り|振返り|回顾|回顧|retrospective|retro|review meeting
月度|月次|每月|毎月|monthly
1on1|1:1|1対1|一对一|one-on-one|one on one|1-on-1
接机|接機|お迎え|迎え|出迎え|送迎|接人|pickup|pick-up|pick up|airport pickup
机场|機場|空港|airport
建议|建議|アドバイス|助言|提言|advice|tips|suggestion|suggestions|recommendations
出差|出張|business trip|trip
签证|簽證|ビザ|査証|visa
发票|發票|請求書|インボイス|invoice|invoices
图纸|圖紙|図面|设计图|drawing|drawings|blueprint|blueprints
模具|金型|mold|mould|molds
预算|預算|予算|budget|budgets
预算表|予算表|budget sheet|budget spreadsheet
表格|シート|sheet|sheets|spreadsheet
目录|カタログ|catalog|catalogue|brochure
商标|商標|trademark|trademarks
补助金|補助金|助成金|subsidy|grant|grants
融资|融資|贷款|loan|financing|funding
反馈|フィードバック|feedback
菌株|strain|strains
数据|データ|data
原始数据|原データ|生データ|raw data
规格|仕様|仕様書|spec|specs|specification|spec sheet
咖啡|コーヒー|coffee
产品|製品|商品|プロダクト|product|products
新产品|新製品|新商品|new product
标签|ラベル|label|labels
运单|送り状|waybill|shipping label
工厂|工場|厂|factory|plant|plants|works
见学|見学|参观|參觀|视察|視察|tour|visit the plant|visit|site visit
线上|在线|オンライン|online|リモート|remote|zoom|teams|google meet|web会议|视频会议|視訊會議|video call
博览会|博覧会|展会|展览会|展示会|展销会|交易会|广交会|博会|エキスポ|見本市|expo|exhibition|fair|trade show
研讨会|研討会|セミナー|seminar|seminars|讲座|webinar
峰会|峰會|サミット|summit
交流会|交流會|懇親会|ミートアップ|meetup|mixer|networking|networking event|社交会
创业者|創業者|起業家|创业|創業|founder|founders|startup|startups|entrepreneur|entrepreneurs
酒|お酒|酒会|品酒|红酒|葡萄酒|ワイン|wine|日本酒|清酒|sake|啤酒|ビール|beer|威士忌|ウイスキー|whisky|whiskey
试饮|試飲|品鉴|テイスティング|tasting|利き酒
音乐会|音楽会|演奏会|コンサート|concert|concerts|演唱会|ライブ
婚礼|婚禮|结婚式|結婚式|婚宴|喜宴|披露宴|wedding
高尔夫|高爾夫|ゴルフ|golf
瑜伽|ヨガ|yoga
普拉提|ピラティス|pilates
搬家|搬场|引っ越し|引越し|引越|moving|moving house|move house|house move|relocation|relocating
读书会|読書会|book club
同学会|同学聚会|同窓会|校友会|reunion|alumni
年会|忘年会|年终晚会|尾牙|year-end party|annual party
晚会|ガラ|gala
路演|ピッチ|pitch
之夜|ナイト|night
城市|都市|city
茶|茶叶|茶葉|お茶|お茶っ葉|tea
会员|会員|会員証|membership|会员卡
年卡|年会员|年会員|年会费|annual membership|annual pass
健身房|ジム|gym|fitness
续费|续交|更新料|renewal fee
驾照|驾驶证|運転免許|免許|driver's license|driving license
显卡|グラボ|グラフィックボード|gpu|graphics card
电饭煲|炊飯器|rice cooker
墨水|墨盒|インク|ink|墨粉|トナー|toner|ink cartridge
供应商|供貨商|サプライヤー|仕入先|仕入れ先|supplier|suppliers|vendor|vendors
感谢|答谢|致谢|お礼|御礼|thanks|thank you|thank-you|gratitude
邮件|郵件|メール|mail|email|e-mail
名片|名刺|business card|business cards
logo|ロゴ|标志|徽标|ロゴマーク
年賀状|贺年卡|賀年卡|新年贺卡|new year card|new year cards|new year's card
演示文稿|幻灯片|スライド|プレゼン資料|deck|slides|ppt|slide deck
午餐|午饭|ランチ|昼食|お昼ご飯|lunch
早餐|早饭|朝食|朝ごはん|breakfast
聚会|派对|パーティー|party|parties
大会|カンファレンス|conference|论坛|論壇|フォーラム|forum
工作坊|ワークショップ|workshop
培训|研修|トレーニング|training
招聘|採用|求人|recruiting|recruitment|hiring
合规|コンプライアンス|コンプラ|compliance
市场|マーケティング|marketing|营销|販促
调研|调查|調査|リサーチ|research|survey
市场调研|市場調査|マーケットリサーチ|market research
付款|支付|支払い|payment|payments
税金|税务|税務|tax|taxes
护照|パスポート|passport
银行|銀行|bank
出货|出荷|发货|発送予定|发送|發送|発送|shipment|shipments|shipping|shipping out|dispatch
媒体|媒體|传媒|傳媒|メディア|media|press
跨境电商|跨境電商|越境ec|越境eコマース|cross-border e-commerce|cross-border ecommerce|cross-border ec
跨境|越境|cross-border|crossborder
电商|電商|eコマース|e-commerce|ecommerce|online retail
监管|監管|规制|規制|管制|regulation|regulations|regulatory|rules
放松|放宽|放寬|松绑|鬆綁|緩和|缓和|easing|ease|eased|relax|relaxed|relaxation|deregulation
排期|日程安排|スケジュール|schedule|schedules|时间表|時間表|timetable
价目表|価格表|料金表|price list|价格表|價格表|价格单|pricing sheet|price sheet|pricing sheets|price sheets
更新|アップデート|update|updates|updated|updating|刷新
续期|續期|续签|續簽|续约|續約
检查|檢查|チェック|点检|點檢|検査|check|checking|inspection
最终|最終|final
草稿|草案|下書き|ドラフト|draft|drafts|初稿
问卷|問卷|問診票|问诊表|アンケート|调查问卷|questionnaire|questionnaires|survey form
健康|health
年末调整|年末調整|年調|年末调税|year-end adjustment|year-end tax adjustment
安全数据表|安全數據表|化学品安全说明书|安全データシート|msds|sds|safety data sheet
读书|讀書|読書|阅读|閱讀|reading
周报|週報|周报告|weekly report|weekly reports|weekly update
清单|清單|列表|一览|一覽|一覧|リスト|名单|checklist|check list|list|lists
想法|点子|主意|アイデア|アイディア|idea|ideas
接待|款待|招待客人|もてなし|hosting|entertaining|entertain clients
お歳暮|年末礼品|year-end gift
餐厅|餐馆|レストラン|restaurant|restaurants
场地|会场|会場|venue|venues
租约|租赁|賃貸契約|賃貸|lease|leases
办公室|オフィス|事務所|office
打印机|プリンター|printer
打印|印刷|print|printing|printout
会议室|会議室|meeting room
新干线|新幹線|shinkansen|bullet train
拜访|拜訪|訪問|visit|visits|往訪
生日|誕生日|birthday
广交会|廣交會|広州交易会|canton fair
金融科技|フィンテック|fintech
半导体|半導體|半導体|semiconductor|semiconductors|semicon
风投|風投|ベンチャーキャピタル|venture capital|vc
共享办公|共享辦公|コワーキング|coworking|co-working
在留卡|在留カード|居留卡|residence card
年末年始|正月休み|お正月|新年假期|春节假期|new year holiday|new year break
大阪|おおさか|osaka
东京|東京|とうきょう|tokyo
北京|ペキン|beijing|peking
上海|シャンハイ|shanghai
新加坡|シンガポール|singapore
札幌|さっぽろ|sapporo
釜山|プサン|busan|pusan
台北|タイペイ|taipei
横滨|横浜|yokohama
名古屋|なごや|nagoya
首尔|首爾|ソウル|seoul
香港|ホンコン|hong kong
深圳|シンセン|shenzhen
广州|廣州|広州|guangzhou
苏州|蘇州|suzhou
杭州|hangzhou
京都|きょうと|kyoto
福冈|福岡|fukuoka
羽田|はねだ|haneda
成田|なりた|narita
新宿|しんじゅく|shinjuku
涩谷|渋谷|しぶや|shibuya
银座|銀座|ぎんざ|ginza
六本木|ろっぽんぎ|roppongi
池袋|いけぶくろ|ikebukuro
虎之门|虎ノ門|虎门|とらのもん|toranomon
丸之内|丸の内|marunouchi
品川|しながわ|shinagawa
千叶|千葉|ちば|chiba
箱根|はこね|hakone
洛杉矶|洛杉磯|ロサンゼルス|los angeles|la
纽约|紐約|ニューヨーク|new york|nyc
伦敦|倫敦|ロンドン|london
多伦多|多倫多|トロント|toronto
曼谷|バンコク|bangkok
德国|德國|ドイツ|germany|german
日本|にほん|japan|japanese
中国|中國|ちゅうごく|china|chinese
韩国|韓国|かんこく|korea|korean
美国|美國|アメリカ|america|us|usa
`;

/** Short compounds searched as their parts: 订房 (book a room) = 订 + 酒店. Surface → replacement words. */
export const COMPOUND_PARTS: [string, string[]][] = [
  ["订房", ["订", "酒店"]], ["訂房", ["订", "酒店"]], ["定房", ["订", "酒店"]], ["开房", ["酒店"]],
  ["订机票", ["订", "机票"]], ["订票", ["订", "票"]], ["订餐", ["订", "餐厅"]], ["订位", ["订", "餐厅"]],
];

export interface SynClass { surfaces: string[]; generic: boolean; key: string }
export const SYN_CLASSES: SynClass[] = [];
/** folded surface → class indexes */
export const SURFACE_INDEX = new Map<string, number[]>();
for (const line of SYNONYM_SRC.split("\n").map((l) => l.trim()).filter(Boolean)) {
  const generic = line.startsWith("!");
  const surfaces = [...new Set(line.replace(/^!/, "").split("|").map((s) => fold(s.trim())).filter(Boolean))];
  const idx = SYN_CLASSES.length;
  SYN_CLASSES.push({ surfaces, generic, key: surfaces[0] });
  for (const s of surfaces) {
    const l = SURFACE_INDEX.get(s) ?? [];
    l.push(idx);
    SURFACE_INDEX.set(s, l);
  }
}
/** Longest surface length (in characters) for greedy scanning. */
export const MAX_SURFACE = Math.max(...[...SURFACE_INDEX.keys()].map((s) => [...s].length));

const foldedSet = (xs: string[]) => new Set(xs.map((x) => fold(x)));
export const KIND_SET = foldedSet(KIND_WORDS);
export const SOFT_KIND_SET = foldedSet(SOFT_KIND_WORDS);
export const POINTER_SET = foldedSet(POINTER_WORDS);
export const VERB_SET = foldedSet(VERB_WORDS);
export const STOP_SET = foldedSet(STOP_WORDS);
export const PRONOUN_SET = foldedSet(PRONOUNS);

// ---------------------------------------------------------------- English given names: nicknames, Chinese renderings
/** Each group: one English given name and its common nicknames / spellings (any member names the same person). */
export const EN_NICKNAMES: string[][] = [
["william", "will", "bill", "billy", "liam", "willy"], ["richard", "rick", "ricky", "rich", "dick"],
  ["michael", "mick", "mickey"], ["james", "jim", "jimmy", "jamie"], ["john", "johnny", "jack", "jon"], ["jonathan", "jon", "jonny"],
  ["thomas", "tom", "tommy"], ["joseph", "joe", "joey"], ["daniel", "dan", "danny"], ["christopher", "chris", "kit"],
  ["matthew", "matt"], ["andrew", "andy", "drew"], ["anthony", "tony"], ["steven", "stephen", "steve", "stevie"], ["edward", "ed", "eddie", "ted", "ned"],
  ["alexander", "alex", "sasha", "xander"], ["benjamin", "ben", "benny"], ["samuel", "sam", "sammy"], ["nicholas", "nick", "nicky"], ["charles", "charlie", "chuck"],
  ["timothy", "tim", "timmy"], ["peter", "pete"], ["gregory", "greg"], ["jacob", "jake"], ["joshua", "josh"], ["zachary", "zach", "zack"],
  ["frederick", "fred", "freddie"], ["ronald", "ron", "ronnie"], ["donald", "don", "donnie"], ["lawrence", "larry"], ["theodore", "theo", "ted", "teddy"],
  ["kenneth", "ken", "kenny"], ["patrick", "pat", "paddy"], ["raymond", "ray"], ["gerald", "gerry", "jerry"], ["philip", "phillip", "phil"],
  ["elizabeth", "liz", "lizzy", "beth", "eliza", "betty", "lisa"], ["margaret", "maggie", "meg", "peggy", "maggy"], ["katherine", "catherine", "kathryn", "kate", "katie", "kathy", "cathy", "kat"],
  ["jennifer", "jen", "jenny"], ["patricia", "pat", "patty", "trish"], ["susan", "sue", "susie"], ["deborah", "debra", "deb", "debbie"], ["rebecca", "becky", "becca"],
  ["victoria", "vicky", "tori"], ["abigail", "abby"], ["alexandra", "alex", "sandra", "sasha"],
  ["samantha", "sam"], ["christina", "christine", "chris", "tina"], ["jessica", "jess", "jessie"], ["stephanie", "steph"], ["amanda", "mandy"],
  ["barbara", "barb", "babs"], ["dorothy", "dot", "dottie"], ["eleanor", "ellie", "nora"], ["isabella", "isabel", "bella", "izzy"], ["natalie", "nat"],
  ["olivia", "liv", "livvy"], ["melissa", "mel", "missy"], ["michelle", "shelly"], ["pamela", "pam"], ["angela", "angie"],
  // r08: more common English given names whose nickname is not a plain clip of the name
  ["henry", "hank", "harry", "hal"], ["harold", "harry", "hal"], ["albert", "al", "bert", "bertie"], ["alfred", "alf", "alfie", "fred"], ["arthur", "art", "artie"],
  ["bernard", "bernie"], ["douglas", "doug"], ["eugene", "gene"], ["francis", "frank", "fran"], ["franklin", "frank"], ["herbert", "herb", "bert"],
  ["howard", "howie"], ["jeffrey", "jeff"], ["geoffrey", "geoff", "jeff"], ["leonard", "len", "lenny", "leo"], ["louis", "lou"], ["martin", "marty"],
  ["mitchell", "mitch"], ["nathaniel", "nathan", "nate", "nat"], ["oliver", "ollie"], ["randall", "randolph", "randy"], ["reginald", "reg", "reggie"],
  ["russell", "russ"], ["stanley", "stan"], ["terence", "terrence", "terry"], ["vincent", "vince", "vinny"], ["walter", "walt", "wally"], ["wesley", "wes"],
  ["alan", "allan", "allen", "al"], ["clifford", "cliff"], ["dennis", "denny"], ["dominic", "dom"], ["gabriel", "gabe"], ["isaac", "ike"], ["jerome", "jerry"],
  ["maxwell", "maximilian", "max"], ["norman", "norm"], ["sebastian", "seb"], ["sidney", "sid"], ["solomon", "sol"], ["tobias", "toby"], ["augustus", "gus"],
  ["lawrence", "laurence", "larry", "laurie"], ["harrison", "harry"], ["calvin", "cal"], ["frederic", "fred"], ["ernest", "ernie"], ["leslie", "les"],
  ["alice", "allie"], ["amelia", "millie", "amy"], ["anne", "ann", "anna", "annie", "nan"], ["caroline", "carolyn", "carrie", "carol"], ["cynthia", "cindy"],
  ["evelyn", "evie"], ["florence", "flo"], ["frances", "fran", "frankie"], ["gabrielle", "gabriella", "gabby"], ["harriet", "hattie"], ["helen", "nell", "nellie"],
  ["jacqueline", "jackie"], ["janet", "jan"], ["joanna", "joanne", "jo"], ["josephine", "jo", "josie"], ["judith", "judy"], ["julia", "jules", "julie"],
  ["lillian", "lily", "lil"], ["louise", "lou"], ["madeline", "madeleine", "maddie"], ["mary", "molly", "polly", "mae"],
  ["matilda", "tilly", "tillie"], ["penelope", "penny"], ["rosalind", "roz"], ["rosemary", "rosie"], ["sophia", "sophie"], ["theresa", "teresa", "tess", "terry"],
  ["valerie", "val"], ["veronica", "ronnie"], ["virginia", "ginny"], ["winifred", "winnie"], ["cassandra", "cass", "cassie"], ["constance", "connie"],
  ["eleanor", "elle", "nell"], ["gwendolyn", "gwen"], ["henrietta", "etta", "hettie"], ["marjorie", "margie"], ["wilhelmina", "mina", "willa"],
];
/** Common Chinese renderings of English given names (威廉 = William). */
export const ZH_EN_NAMES: [string, string][] = [
  ["威廉", "william"], ["比尔", "bill"], ["理查德", "richard"], ["迈克尔", "michael"],
  ["詹姆斯", "james"], ["吉姆", "jim"], ["约翰", "john"], ["杰克", "jack"], ["乔纳森", "jonathan"], ["托马斯", "thomas"], ["汤姆", "tom"], ["约瑟夫", "joseph"],
  ["丹尼尔", "daniel"], ["丹尼", "danny"], ["克里斯", "chris"], ["克里斯托弗", "christopher"], ["马修", "matthew"],
  ["安德鲁", "andrew"], ["安东尼", "anthony"], ["托尼", "tony"], ["史蒂文", "steven"], ["史蒂夫", "steve"], ["爱德华", "edward"], ["亚历山大", "alexander"],
  ["亚历克斯", "alex"], ["本杰明", "benjamin"], ["塞缪尔", "samuel"], ["山姆", "sam"], ["尼古拉斯", "nicholas"], ["尼克", "nick"], ["查尔斯", "charles"],
  ["查理", "charlie"], ["蒂姆", "tim"], ["彼得", "peter"], ["格雷格", "greg"], ["雅各布", "jacob"], ["杰克", "jake"], ["乔希", "josh"], ["弗雷德", "fred"],
  ["罗纳德", "ronald"], ["唐纳德", "donald"], ["帕特里克", "patrick"], ["菲利普", "philip"], ["保罗", "paul"],
  ["乔治", "george"], ["亨利", "henry"], ["杰森", "jason"], ["艾伦", "alan"], ["布莱恩", "brian"], ["埃里克", "eric"], ["弗兰克", "frank"], ["加里", "gary"],
  ["马克", "mark"], ["斯科特", "scott"], ["斯蒂芬", "stefan"], ["汉斯", "hans"], ["卢卡斯", "lucas"], ["路易斯", "louis"], ["伊丽莎白", "elizabeth"], ["丽兹", "liz"],
  ["玛格丽特", "margaret"], ["凯瑟琳", "katherine"], ["凯特", "kate"], ["珍妮弗", "jennifer"], ["詹妮弗", "jennifer"], ["珍妮", "jenny"], ["帕特里夏", "patricia"],
  ["苏珊", "susan"], ["丽贝卡", "rebecca"], ["维多利亚", "victoria"], ["艾比", "abby"],
  ["萨曼莎", "samantha"], ["克里斯蒂娜", "christina"], ["杰西卡", "jessica"], ["斯蒂芬妮", "stephanie"], ["阿曼达", "amanda"], ["芭芭拉", "barbara"],
  ["埃莉诺", "eleanor"], ["伊莎贝拉", "isabella"], ["娜塔莉", "natalie"], ["奥利维亚", "olivia"], ["梅丽莎", "melissa"],
  ["米歇尔", "michelle"], ["安吉拉", "angela"], ["劳拉", "laura"], ["琳达", "linda"], ["玛丽", "mary"], ["丽莎", "lisa"], ["安娜", "anna"], ["艾玛", "emma"],
  ["索菲亚", "sophia"], ["露西", "lucy"], ["海伦", "helen"], ["凯伦", "karen"], ["南希", "nancy"], ["朱莉", "julie"], ["菲奥娜", "fiona"], ["汉娜", "hannah"],
  ["安妮", "annie"], ["艾丽斯", "alice"], ["爱丽丝", "alice"], ["格蕾丝", "grace"], ["克莱尔", "claire"], ["瑞秋", "rachel"],
];

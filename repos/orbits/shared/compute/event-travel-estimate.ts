/**
 * R26 移动时间推定（events DESIGN §3.5、§9 #5）：不调地图 API，按地区关系查表，结果一律是「推定」。
 *
 * - オンライン 0 分；同一市区町村 20；東京 23 区内 / 大阪市内 30；同一都道府県 60；隣接県 90；其他 150。
 * - 地区从 `area`（「東京都千代田区」）或会场名（「東京国際フォーラム」「グランフロント大阪」）里认；认不出返回 null（评分按缺失）。
 */

export interface TravelEstimate {
  minutes: number;
  estimated: true;
}

export interface PlaceGuess {
  prefecture: string | null;
  /** 市区町村（「千代田区」「大阪市」）；只认出都道府県时为 null。 */
  municipality: string | null;
  /** 東京 23 区 / 大阪市内（同一大城市圈内按 30 分）。 */
  metro: "tokyo23" | "osaka" | null;
  online: boolean;
}

const PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
  "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
  "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
] as const;

const TOKYO_WARDS = [
  "千代田区", "中央区", "港区", "新宿区", "文京区", "台東区", "墨田区", "江東区", "品川区", "目黒区", "大田区", "世田谷区", "渋谷区", "中野区",
  "杉並区", "豊島区", "北区", "荒川区", "板橋区", "練馬区", "足立区", "葛飾区", "江戸川区",
];

/** 常见会场 / 地名 → 都道府県 + 市区町村（会场名里没有地址时用）。 */
const LANDMARKS: readonly (readonly [string, string, string])[] = [
  ["東京国際フォーラム", "東京都", "千代田区"], ["丸の内", "東京都", "千代田区"], ["大手町", "東京都", "千代田区"], ["有楽町", "東京都", "千代田区"],
  ["日本橋", "東京都", "中央区"], ["銀座", "東京都", "中央区"], ["渋谷", "東京都", "渋谷区"], ["恵比寿", "東京都", "渋谷区"], ["新宿", "東京都", "新宿区"],
  ["六本木", "東京都", "港区"], ["虎ノ門", "東京都", "港区"], ["赤坂", "東京都", "港区"], ["品川", "東京都", "港区"], ["五反田", "東京都", "品川区"],
  ["東京ビッグサイト", "東京都", "江東区"], ["豊洲", "東京都", "江東区"], ["池袋", "東京都", "豊島区"], ["秋葉原", "東京都", "千代田区"],
  ["幕張メッセ", "千葉県", "千葉市"], ["パシフィコ横浜", "神奈川県", "横浜市"], ["みなとみらい", "神奈川県", "横浜市"],
  ["グランフロント大阪", "大阪府", "大阪市"], ["梅田", "大阪府", "大阪市"], ["難波", "大阪府", "大阪市"], ["インテックス大阪", "大阪府", "大阪市"],
  ["名駅", "愛知県", "名古屋市"], ["栄", "愛知県", "名古屋市"],
];

/** 大城市名 → 都道府県（「大阪」「名古屋」这类没有後缀的写法）。 */
const CITY_PREFECTURE: readonly (readonly [string, string, string | null])[] = [
  ["大阪市", "大阪府", "大阪市"], ["名古屋市", "愛知県", "名古屋市"], ["横浜市", "神奈川県", "横浜市"], ["川崎市", "神奈川県", "川崎市"],
  ["札幌市", "北海道", "札幌市"], ["福岡市", "福岡県", "福岡市"], ["神戸市", "兵庫県", "神戸市"], ["京都市", "京都府", "京都市"], ["仙台市", "宮城県", "仙台市"],
  ["名古屋", "愛知県", "名古屋市"], ["横浜", "神奈川県", "横浜市"], ["札幌", "北海道", "札幌市"], ["福岡", "福岡県", "福岡市"], ["神戸", "兵庫県", "神戸市"],
  ["大阪", "大阪府", null], ["京都", "京都府", null], ["東京", "東京都", null],
];

/** 隣接県（只列出相邻关系；双向查）。 */
const ADJACENT: Readonly<Record<string, readonly string[]>> = {
  東京都: ["神奈川県", "埼玉県", "千葉県", "山梨県"],
  神奈川県: ["東京都", "山梨県", "静岡県"],
  埼玉県: ["東京都", "千葉県", "茨城県", "栃木県", "群馬県", "長野県", "山梨県"],
  千葉県: ["東京都", "埼玉県", "茨城県"],
  大阪府: ["京都府", "兵庫県", "奈良県", "和歌山県"],
  京都府: ["大阪府", "兵庫県", "奈良県", "滋賀県", "三重県", "福井県"],
  兵庫県: ["大阪府", "京都府", "岡山県", "鳥取県"],
  愛知県: ["岐阜県", "三重県", "静岡県", "長野県"],
  福岡県: ["佐賀県", "熊本県", "大分県"],
};

const ONLINE = /オンライン|online|zoom|ウェビナー|webinar|配信|线上|在线/i;

export function guessPlace(text: string | null | undefined): PlaceGuess | null {
  const value = (text ?? "").trim();
  if (!value) return null;
  if (ONLINE.test(value)) return { metro: null, municipality: null, online: true, prefecture: null };
  let prefecture: string | null = PREFECTURES.find((name) => value.includes(name)) ?? null;
  let municipality: string | null = null;
  const ward = TOKYO_WARDS.find((name) => value.includes(name));
  if (ward && (!prefecture || prefecture === "東京都")) { prefecture = "東京都"; municipality = ward; }
  if (!municipality) {
    for (const [name, pref, city] of LANDMARKS) {
      if (value.includes(name)) { prefecture = prefecture ?? pref; municipality = pref === prefecture ? city : null; break; }
    }
  }
  if (!municipality) {
    for (const [name, pref, city] of CITY_PREFECTURE) {
      if (value.includes(name)) { prefecture = prefecture ?? pref; municipality = pref === prefecture ? city : null; break; }
    }
  }
  if (!municipality && prefecture) {
    const after = value.slice(value.indexOf(prefecture) + prefecture.length);
    const match = /^([^\s0-9０-９,、]+?[市区町村])/.exec(after);
    municipality = match ? match[1]! : null;
  }
  if (!prefecture) return null;
  const metro = prefecture === "東京都" && municipality && TOKYO_WARDS.includes(municipality) ? "tokyo23" : prefecture === "大阪府" && municipality?.startsWith("大阪市") ? "osaka" : null;
  return { metro, municipality, online: false, prefecture };
}

function adjacent(a: string, b: string): boolean {
  return (ADJACENT[a] ?? []).includes(b) || (ADJACENT[b] ?? []).includes(a);
}

/** 两个地区之间的移动时间推定；任一边认不出（又不是オンライン）返回 null。 */
export function estimateTravelMinutes(input: { home: string | null | undefined; event: string | null | undefined }): TravelEstimate | null {
  const event = guessPlace(input.event);
  if (event?.online) return { estimated: true, minutes: 0 };
  const home = guessPlace(input.home);
  if (!event || !home || home.online || !home.prefecture || !event.prefecture) return null;
  if (home.municipality && event.municipality && home.municipality === event.municipality) return { estimated: true, minutes: 20 };
  if (home.metro && home.metro === event.metro) return { estimated: true, minutes: 30 };
  if (home.prefecture === event.prefecture) return { estimated: true, minutes: 60 };
  if (adjacent(home.prefecture, event.prefecture)) return { estimated: true, minutes: 90 };
  return { estimated: true, minutes: 150 };
}

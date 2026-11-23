/**
 * Generated records of a patch (AG08: base-v1 `contacts-2000`, eval/README.md §11 批量记录): a fixed seed, the
 * same records every time, written through the product's write path like every other fixture record.
 *
 * `generate.contacts: { count, idFrom, industries, regions, lastInteractionWithinDays }` gives `count` contacts
 * numbered from `idFrom`, each with an industry, a region, a company and a role, and one memo that records an
 * interaction with them on a day within the last `lastInteractionWithinDays` days of the world clock (so every
 * generated contact has a recorded last interaction). Names never repeat and never equal an anchor's name.
 */
import { mulberry32 } from "./bulk-generator";
import type { FixtureRecord } from "./world";

const SURNAMES = ["赵", "钱", "孙", "周", "吴", "郑", "冯", "褚", "卫", "蒋", "沈", "韩", "杨", "朱", "秦", "尤", "许", "何", "吕", "施", "孔", "曹", "严", "华", "金", "魏", "陶", "姜", "戚", "谢", "邹", "喻", "柏", "水", "窦", "章", "云", "苏", "潘", "葛"];
const GIVEN = ["一帆", "子涵", "雨桐", "浩然", "思远", "嘉怡", "梓轩", "欣妍", "宇航", "诗涵", "晨曦", "俊杰", "若溪", "明轩", "静怡", "博文", "可馨", "天佑", "语嫣", "皓宇", "佳琪", "泽宇", "梦瑶", "文博", "晓萱", "睿哲", "安然", "书瑶", "铭泽", "雅琴", "立行", "清扬", "知远", "望舒", "景行", "南乔", "北辰", "怀瑾", "若愚", "致远", "沐阳", "星河", "听雨", "向晚", "长青", "如初", "未央", "朝夕", "云舒", "惊蛰", "白露", "小满", "立夏", "谷雨", "霜降", "清和", "初晴", "映雪", "晚照", "松石"];

const ORG_HEAD = ["青禾", "远山", "长桥", "白杨", "海岸", "星野", "南风", "北岭", "朝露", "晴川", "石门", "雪松"];
const ORG_TAIL: Record<string, string[]> = {
  软件: ["科技", "软件", "数据"], 贸易: ["商事", "贸易", "国际"], 摄影: ["影像工作室", "摄影社", "图片社"], 出版: ["出版社", "书房", "文化"],
  设计: ["设计事务所", "设计工作室", "创意"], 物流: ["物流", "运输", "仓储"], 金融: ["资本", "投资", "证券"], 教育: ["学堂", "教育", "培训"],
};
const ROLES: Record<string, string[]> = {
  软件: ["工程师", "产品经理", "技术总监"], 贸易: ["采购", "销售经理", "业务主管"], 摄影: ["摄影师", "图片编辑", "工作室主理人"], 出版: ["编辑", "发行经理", "版权经理"],
  设计: ["设计师", "设计总监", "插画师"], 物流: ["运营", "调度主管", "客户经理"], 金融: ["分析师", "投资经理", "风控"], 教育: ["讲师", "教研主管", "课程顾问"],
};
const CHANNELS = ["phone", "meeting", "message"] as const;
const BODY: Record<(typeof CHANNELS)[number], string> = { meeting: "和{name}见了一面，聊了近况。", message: "和{name}发消息确认了下次见面的时间。", phone: "和{name}通了电话，简单聊了近况。" };

const DAY = 86_400_000;
const dayOf = (ms: number) => new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10);

export interface ContactsGeneration {
  count: number;
  idFrom: string;
  industries: string[];
  regions: string[];
  lastInteractionWithinDays: number;
}

export function generatePatchContacts(spec: ContactsGeneration, options: { account: string; clock: string; anchorNames: ReadonlySet<string>; seed?: number }): FixtureRecord[] {
  const match = spec.idFrom.match(/^([A-Za-z]+)(\d+)$/u);
  if (!match) throw new Error(`generate.contacts.idFrom ${spec.idFrom} is not a prefix and a number`);
  const [, prefix, start] = match;
  const random = mulberry32(options.seed ?? 20261117);
  const pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length)];
  const clock = Date.parse(options.clock);
  const names = new Set<string>();
  const out: FixtureRecord[] = [];
  let cursor = 0;
  for (let index = 0; index < spec.count; index += 1) {
    let name = "";
    while (!name || names.has(name) || options.anchorNames.has(name)) {
      name = `${SURNAMES[cursor % SURNAMES.length]}${GIVEN[Math.floor(cursor / SURNAMES.length) % GIVEN.length]}`;
      cursor += 1;
      if (cursor > SURNAMES.length * GIVEN.length * 2) throw new Error("generated contact names ran out");
    }
    names.add(name);
    const id = `${prefix}${Number(start) + index}`;
    const industry = pick(spec.industries);
    const region = pick(spec.regions);
    const org = `${pick(ORG_HEAD)}${pick(ORG_TAIL[industry] ?? ["公司"])}`;
    const role = pick(ROLES[industry] ?? ["经理"]);
    const daysAgo = 1 + Math.floor(random() * spec.lastInteractionWithinDays);
    const occurredOn = dayOf(clock - daysAgo * DAY);
    const updatedAt = new Date(clock - (daysAgo + 3) * DAY).toISOString();
    out.push({ account: options.account, data: { id, industry, name, org, region, role, updatedAt }, id, kind: "contact", origin: "patch" } as FixtureRecord);
    const channel = pick(CHANNELS);
    const memoId = `MG${Number(start) + index}`;
    out.push({
      account: options.account,
      data: { body: BODY[channel].replace("{name}", name), contactIds: [id], createdAt: `${occurredOn}T12:00:00+09:00`, id: memoId, interaction: { actualContactIds: [id], channel, direction: channel === "meeting" ? "mutual" : "outgoing", occurredOn, precision: "day" }, version: 1 },
      id: memoId,
      kind: "memo",
      origin: "patch",
    } as FixtureRecord);
  }
  return out;
}

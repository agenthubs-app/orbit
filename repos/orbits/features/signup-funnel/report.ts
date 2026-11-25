// 注册漏斗的只读统计：按「第一次出现的那天（东京日期）× 端」把人分组，数每一步有多少人走到。
// 一个人 = 一个账号；没建号的访客按访客标识算一个人。走到后一步的人，前面的步骤都算走到
// （Google 直接建号、被拦掉的打开事件不会让前一步比后一步少）。邮箱验证不在主线上，单独一列。
import type { LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";

export interface SignupFunnelRow {
  day: string;
  client: string;
  opened: number;
  created: number;
  step1: number;
  step2: number;
  step3: number;
  finished: number;
  verified: number;
  fromEvent: number;
}

const COUNTS = ["opened", "created", "step1", "step2", "step3", "finished", "verified", "fromEvent"] as const;

export const SIGNUP_FUNNEL_REPORT_SQL = `
with linked as (
  select distinct on (visitor_id) visitor_id, user_id from signup_funnel_events
  where workspace_id = $1 and name = 'account_created' and visitor_id is not null order by visitor_id, occurred_at
), events as (
  select coalesce(e.user_id, l.user_id, 'visitor:' || e.visitor_id) as person, e.name, e.client, e.source, e.occurred_at, e.id
  from signup_funnel_events e left join linked l on e.user_id is null and l.visitor_id = e.visitor_id
  where e.workspace_id = $1
), people as (
  select person, (array_agg(client order by occurred_at, id))[1] as client, (array_agg(source order by occurred_at, id))[1] as source,
    ((min(occurred_at)) at time zone 'Asia/Tokyo')::date as day,
    max(case name when 'register_opened' then 1 when 'account_created' then 2 when 'onboarding_step1' then 3
      when 'onboarding_step2' then 4 when 'onboarding_step3' then 5 when 'onboarding_finished' then 6 else 0 end) as reached,
    bool_or(name = 'email_verified') as verified
  from events group by person
)
select to_char(day, 'YYYY-MM-DD') as day, client, count(*) filter (where reached >= 1)::int as opened, count(*) filter (where reached >= 2)::int as created,
  count(*) filter (where reached >= 3)::int as step1, count(*) filter (where reached >= 4)::int as step2,
  count(*) filter (where reached >= 5)::int as step3, count(*) filter (where reached >= 6)::int as finished,
  count(*) filter (where verified)::int as verified, count(*) filter (where source = 'event')::int as "fromEvent"
from people where day between $2::date and $3::date group by day, client order by day, client`;

export async function readSignupFunnel(client: Pick<LiveRecordSqlClient, "query">, workspaceId: string, from: string, to: string): Promise<readonly SignupFunnelRow[]> {
  return (await client.query<SignupFunnelRow>(SIGNUP_FUNNEL_REPORT_SQL, [workspaceId, from, to])).rows;
}

export function formatSignupFunnel(rows: readonly SignupFunnelRow[]): string {
  if (!rows.length) return "这段日期没有记录。";
  const totals = new Map<string, SignupFunnelRow>();
  for (const row of rows) for (const client of [row.client, "合计"]) {
    const sum = totals.get(client) ?? { day: "合计", client, opened: 0, created: 0, step1: 0, step2: 0, step3: 0, finished: 0, verified: 0, fromEvent: 0 };
    for (const key of COUNTS) sum[key] += row[key];
    totals.set(client, sum);
  }
  // 每一步写「人数（占上一步的比例）」；邮箱验证与走完占建号的比例；来自活动占打开的比例。
  const cell = (value: number, base: number) => `${value}${base ? ` (${Math.round((value / base) * 100)}%)` : ""}`;
  const line = (r: SignupFunnelRow) => [r.day, r.client, String(r.opened), cell(r.created, r.opened), cell(r.verified, r.created), cell(r.step1, r.created),
    cell(r.step2, r.step1), cell(r.step3, r.step2), cell(r.finished, r.step3), cell(r.finished, r.opened), cell(r.fromEvent, r.opened)];
  const table = [["日期", "端", "打开注册", "建号", "邮箱验证", "引导①", "引导②", "引导③", "走完", "打开→走完", "来自活动"],
    ...rows.map(line), ...["web", "app", "合计"].flatMap((client) => totals.get(client) ? [line(totals.get(client)!)] : [])];
  const width = (text: string) => [...text].reduce((sum, char) => sum + (char.charCodeAt(0) > 0x2e7f ? 2 : 1), 0);
  const widths = table[0]!.map((_, i) => Math.max(...table.map((row) => width(row[i]!))));
  return table.map((row) => row.map((text, i) => text + " ".repeat(widths[i]! - width(text))).join("  ").trimEnd()).join("\n");
}

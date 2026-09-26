/**
 * 管理后台「读取量」页（监控 O3）。
 *
 * 只有 ORBIT_READ_COST_ADMIN_ACCOUNT_IDS 里的账号能看；其他已登录账号得到 404，
 * 未登录跳登录页。数据来自每日汇总表，不直接扫小票。
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { resolveAuthenticatedApiActor } from "../../../../api/_shared/authenticated-actor";
import { isReadCostAdmin } from "../../../../../features/operations/read-cost/config";
import { readReadCostOverview, type ReadCostOverview } from "../../../../../features/operations/read-cost/overview";
import { createConfiguredTransactionalPostgresRuntime } from "../../../../../shared/storage/transactional-postgres";
import { getOrbitServerLanguage } from "../../orbit-language-server";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";

export const dynamic = "force-dynamic";

type Copy = Record<string, { zh: string; en: string }>;
const COPY = {
  title: { zh: "读取量", en: "Read volume" },
  subtitle: { zh: "按每日汇总计算（UTC 日），数字按抽样率放大。", en: "From daily rollups (UTC days), scaled by sample rate." },
  back: { zh: "返回管理后台", en: "Back to admin" },
  days: { zh: "最近 7 天总量与 Neon 对账", en: "Last 7 days vs. Neon transfer" },
  day: { zh: "日期", en: "Day" },
  requests: { zh: "请求数", en: "Requests" },
  recorded: { zh: "我们记录的读取", en: "Recorded reads" },
  neon: { zh: "Neon 传输量", en: "Neon transfer" },
  coverage: { zh: "覆盖率", en: "Coverage" },
  unavailable: { zh: "未取得（未配置 Neon 用量接口）", en: "Unavailable (Neon usage API not configured)" },
  failed: { zh: "未取得（Neon 接口出错）", en: "Unavailable (Neon request failed)" },
  pending: { zh: "尚未汇总", en: "Not rolled up yet" },
  routes: { zh: "最费的 20 个接口（7 天）", en: "Top 20 routes (7 days)" },
  route: { zh: "接口", en: "Route" },
  avg: { zh: "平均每次", en: "Avg per request" },
  total: { zh: "合计", en: "Total" },
  max: { zh: "单次最大", en: "Largest request" },
  accounts: { zh: "最费的 20 个用户（7 天）", en: "Top 20 accounts (7 days)" },
  account: { zh: "账号编号", en: "Account ID" },
  trend: { zh: "接口 30 天趋势", en: "30-day route trend" },
  peak: { zh: "最高", en: "Peak" },
  trendHint: { zh: "点上表中的接口切换。柱高为平均每次读取量。", en: "Pick a route above. Bar height is the average read per request." },
  alerts: { zh: "最近报警（30 天）", en: "Recent alerts (30 days)" },
  noData: { zh: "暂无数据", en: "No data yet" },
  notified: { zh: "已通知", en: "Notified" },
  waiting: { zh: "待通知", en: "Pending" },
} satisfies Copy;
const RULES = {
  route_average_spike: { zh: "平均读取翻倍", en: "Average doubled" },
  large_request: { zh: "单次超过 5 MB", en: "Request over 5 MB" },
  low_coverage: { zh: "覆盖率低于 70%", en: "Coverage below 70%" },
} satisfies Copy;

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024).toLocaleString("en-US")} KB`;
  return `${bytes} B`;
}

const cell = { padding: "8px 10px", borderBottom: "1px solid var(--border)", textAlign: "left" as const, verticalAlign: "middle" as const };
const num = { ...cell, textAlign: "right" as const, fontVariantNumeric: "tabular-nums" as const, whiteSpace: "nowrap" as const };
const head = { ...cell, color: "var(--text-3)", fontWeight: 500, fontSize: "var(--fs-12)" };
const headNum = { ...head, textAlign: "right" as const };

function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  const width = max > 0 ? Math.max(value > 0 ? 2 : 0, Math.round((value / max) * 100)) : 0;
  return (
    <div aria-hidden title={label} style={{ background: "var(--bg-sunken)", borderRadius: 4, height: 8, minWidth: 80, overflow: "hidden" }}>
      <div style={{ background: "var(--accent)", borderRadius: 4, height: 8, width: `${width}%` }} />
    </div>
  );
}

function Section({ title, children, id }: { title: string; children: ReactNode; id: string }) {
  return (
    <section className="card" data-read-cost-section={id} style={{ marginTop: 18, overflowX: "auto", padding: 18 }}>
      <h2 className="h-section" style={{ margin: "0 0 12px" }}>{title}</h2>
      {children}
    </section>
  );
}

function ReadCostView({ data, t, zh }: { data: ReadCostOverview; t: (key: keyof typeof COPY) => string; zh: boolean }) {
  const maxDay = Math.max(0, ...data.days.map((d) => Math.max(d.recordedBytes, d.neonBytes ?? 0)));
  const maxRoute = Math.max(0, ...data.topRoutes.map((r) => r.totalBytes));
  const maxAccount = Math.max(0, ...data.topAccounts.map((a) => a.totalBytes));
  const maxTrend = Math.max(0, ...data.trend.points.map((p) => p.avgBytes));
  const neonLabel = (status: string) => (status === "failed" ? t("failed") : status === "pending" ? t("pending") : t("unavailable"));
  return (
    <>
      <Section id="days" title={t("days")}>
        <table style={{ borderCollapse: "collapse", minWidth: 600, width: "100%" }}>
          <thead><tr><th style={head}>{t("day")}</th><th style={headNum}>{t("requests")}</th><th style={headNum}>{t("recorded")}</th><th style={head} /><th style={headNum}>{t("neon")}</th><th style={headNum}>{t("coverage")}</th></tr></thead>
          <tbody>
            {data.days.map((d) => (
              <tr key={d.day}>
                <td style={{ ...cell, whiteSpace: "nowrap" }}>{d.day}</td>
                <td style={num}>{d.requests.toLocaleString("en-US")}</td>
                <td style={num}>{formatBytes(d.recordedBytes)}</td>
                <td style={{ ...cell, width: "30%" }}><Bar label={formatBytes(d.recordedBytes)} max={maxDay} value={d.recordedBytes} /></td>
                <td style={num}>{d.neonStatus === "ok" && d.neonBytes !== null ? formatBytes(d.neonBytes) : <span style={{ color: "var(--text-3)" }}>{neonLabel(d.neonStatus)}</span>}</td>
                <td style={num}>{d.coverage !== null ? `${Math.round(d.coverage * 100)}%` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section id="routes" title={t("routes")}>
        {data.topRoutes.length === 0 ? <p className="orbit-host-muted">{t("noData")}</p> : (
          <table style={{ borderCollapse: "collapse", minWidth: 600, width: "100%" }}>
            <thead><tr><th style={head}>{t("route")}</th><th style={headNum}>{t("requests")}</th><th style={headNum}>{t("avg")}</th><th style={headNum}>{t("max")}</th><th style={headNum}>{t("total")}</th><th style={head} /></tr></thead>
            <tbody>
              {data.topRoutes.map((r) => (
                <tr key={r.route} style={r.route === data.trend.route ? { background: "var(--accent-softer)" } : undefined}>
                  <td style={{ ...cell, fontFamily: "var(--ff-mono)", fontSize: "var(--fs-13)", whiteSpace: "nowrap" }}>
                    <Link href={`/app/admin/read-cost?route=${encodeURIComponent(r.route)}`}>{r.route}</Link>
                  </td>
                  <td style={num}>{r.requests.toLocaleString("en-US")}</td>
                  <td style={num}>{formatBytes(r.avgBytes)}</td>
                  <td style={num}>{formatBytes(r.maxRequestBytes)}</td>
                  <td style={num}>{formatBytes(r.totalBytes)}</td>
                  <td style={{ ...cell, width: "20%" }}><Bar label={formatBytes(r.totalBytes)} max={maxRoute} value={r.totalBytes} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
      <Section id="accounts" title={t("accounts")}>
        {data.topAccounts.length === 0 ? <p className="orbit-host-muted">{t("noData")}</p> : (
          <table style={{ borderCollapse: "collapse", minWidth: 600, width: "100%" }}>
            <thead><tr><th style={head}>{t("account")}</th><th style={headNum}>{t("requests")}</th><th style={headNum}>{t("avg")}</th><th style={headNum}>{t("total")}</th><th style={head} /></tr></thead>
            <tbody>
              {data.topAccounts.map((a) => (
                <tr key={a.accountId}>
                  <td style={{ ...cell, fontFamily: "var(--ff-mono)", fontSize: "var(--fs-13)", whiteSpace: "nowrap" }}>{a.accountId}</td>
                  <td style={num}>{a.requests.toLocaleString("en-US")}</td>
                  <td style={num}>{formatBytes(a.avgBytes)}</td>
                  <td style={num}>{formatBytes(a.totalBytes)}</td>
                  <td style={{ ...cell, width: "20%" }}><Bar label={formatBytes(a.totalBytes)} max={maxAccount} value={a.totalBytes} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
      <Section id="trend" title={`${t("trend")}${data.trend.route ? ` · ${data.trend.route}` : ""}`}>
        {data.trend.route === null ? <p className="orbit-host-muted">{t("noData")}</p> : (
          <>
            <p className="orbit-host-muted" style={{ margin: "0 0 10px" }}>{t("trendHint")}</p>
            <div role="img" aria-label={`${t("trend")} ${data.trend.route}`} style={{ alignItems: "flex-end", borderBottom: "1px solid var(--border-strong)", display: "flex", gap: 4, height: 140 }}>
              {data.trend.points.map((p) => (
                <div
                  key={p.day}
                  title={`${p.day} · ${t("avg")} ${formatBytes(p.avgBytes)} · ${t("requests")} ${p.requests.toLocaleString("en-US")}`}
                  style={{ alignItems: "flex-end", display: "flex", flex: 1, height: "100%", minWidth: 4 }}
                >
                  <div style={{ background: "var(--accent)", borderRadius: "4px 4px 0 0", height: `${maxTrend > 0 ? Math.max(p.avgBytes > 0 ? 2 : 0, Math.round((p.avgBytes / maxTrend) * 100)) : 0}%`, width: "100%" }} />
                </div>
              ))}
            </div>
            <div className="orbit-host-muted" style={{ display: "flex", fontSize: "var(--fs-12)", justifyContent: "space-between", marginTop: 6 }}>
              <span>{data.trend.points[0]?.day}</span><span>{t("peak")} {formatBytes(maxTrend)}</span><span>{data.trend.points.at(-1)?.day}</span>
            </div>
          </>
        )}
      </Section>
      <Section id="alerts" title={t("alerts")}>
        {data.alerts.length === 0 ? <p className="orbit-host-muted">{t("noData")}</p> : (
          <table style={{ borderCollapse: "collapse", minWidth: 600, width: "100%" }}>
            <tbody>
              {data.alerts.map((a) => (
                <tr key={`${a.rule}:${a.day}:${a.subject}`}>
                  <td style={{ ...cell, whiteSpace: "nowrap" }}>{a.day}</td>
                  <td style={cell}>{RULES[a.rule][zh ? "zh" : "en"]}</td>
                  <td style={{ ...cell, fontFamily: "var(--ff-mono)", fontSize: "var(--fs-13)" }}>{a.subject}</td>
                  <td style={num}>{a.rule === "low_coverage" ? `${Math.round(a.observed * 100)}%` : formatBytes(a.observed)}</td>
                  <td style={cell}>{a.notified ? t("notified") : t("waiting")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </>
  );
}

export default async function AdminReadCostPage({ searchParams }: { searchParams: Promise<{ route?: string | string[] }> }) {
  const actor = await resolveAuthenticatedApiActor();
  if (!actor) redirect("/app/account/login?next=%2Fapp%2Fadmin%2Fread-cost");
  if (!isReadCostAdmin(actor.id)) notFound();
  let language = "zh";
  try { language = await getOrbitServerLanguage(); } catch { /* default zh */ }
  const zh = language === "zh";
  const t = (key: keyof typeof COPY) => COPY[key][zh ? "zh" : "en"];
  const params = await searchParams;
  const route = typeof params.route === "string" ? params.route.slice(0, 300) : null;
  const runtime = createConfiguredTransactionalPostgresRuntime();
  const data = runtime ? await readReadCostOverview(runtime.client, { now: new Date(), route }) : null;
  return (
    <>
      <OrbitReferenceStyles />
      <main data-orbit-route="app-admin-read-cost-route" style={{ background: "var(--bg)", color: "var(--text)", minHeight: "100vh", padding: "28px 16px 64px" }}>
        <div style={{ margin: "0 auto", maxWidth: 1080 }}>
          <Link className="orbit-host-muted" href="/app/admin">← {t("back")}</Link>
          <div className="eyebrow" style={{ marginTop: 16 }}>READ COST</div>
          <h1 className="h-display" style={{ margin: "4px 0" }}>{t("title")}</h1>
          <p className="orbit-host-muted" style={{ margin: 0 }}>{t("subtitle")}{data ? ` ${data.window.from} – ${data.window.to}` : ""}</p>
          {data ? <ReadCostView data={data} t={t} zh={zh} /> : <p style={{ marginTop: 18 }}>{t("noData")}</p>}
        </div>
      </main>
    </>
  );
}

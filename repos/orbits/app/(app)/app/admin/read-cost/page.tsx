/** Authorized, actor-scoped read-cost rollup. No receipt scan or write operation. */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { resolveAuthenticatedApiActor } from "../../../../api/_shared/authenticated-actor";
import { isReadCostAdmin } from "../../../../../features/operations/read-cost/config";
import { readReadCostOverview, type ReadCostOverview } from "../../../../../features/operations/read-cost/overview";
import { createConfiguredTransactionalPostgresRuntime } from "../../../../../shared/storage/transactional-postgres";
import { getOrbitServerLanguage } from "../../orbit-language-server";
import type { OrbitLanguage } from "../../orbit-language-core";
import { adminText } from "../../orbit-2026/copy/admin";
import { Button, Card, EmptyState, Orbit2026Scope, Table, ToastProvider } from "../../orbit-2026/ui";
import { READ_COST_ADMIN_COPY } from "./read-cost-copy";
import styles from "../Admin.module.css";

export const dynamic = "force-dynamic";

const RULES = {
  route_average_spike: { ja: "平均読み取り量が倍増", zh: "平均读取翻倍", en: "Average doubled" },
  large_request: { ja: "1 回で 5 MB 超", zh: "单次超过 5 MB", en: "Request over 5 MB" },
  low_coverage: { ja: "カバー率が 70% 未満", zh: "覆盖率低于 70%", en: "Coverage below 70%" },
};

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024).toLocaleString("en-US")} KB`;
  return `${bytes} B`;
}

function Bar({ value, max }: { value: number; max: number }) {
  const width = max > 0 ? Math.max(value > 0 ? 2 : 0, Math.round(value / max * 100)) : 0;
  return <div className={styles.bar} aria-hidden="true"><div className={styles.barFill} style={{ width: `${width}%` }} /></div>;
}

function hasRecords(data: ReadCostOverview): boolean {
  return data.days.some((day) => day.requests > 0 || day.recordedBytes > 0)
    || data.topRoutes.length > 0 || data.topAccounts.length > 0 || data.alerts.length > 0;
}

function ReadCostView({ data, language }: { data: ReadCostOverview; language: OrbitLanguage }) {
  const t = (key: keyof typeof READ_COST_ADMIN_COPY) => READ_COST_ADMIN_COPY[key][language];
  const maxDay = Math.max(0, ...data.days.map((day) => Math.max(day.recordedBytes, day.neonBytes ?? 0)));
  const maxRoute = Math.max(0, ...data.topRoutes.map((route) => route.totalBytes));
  const maxAccount = Math.max(0, ...data.topAccounts.map((account) => account.totalBytes));
  const maxTrend = Math.max(0, ...data.trend.points.map((point) => point.avgBytes));
  const neonLabel = (status: string) => status === "failed" ? t("failed") : status === "pending" ? t("pending") : t("unavailable");
  return (
    <>
      <Card className={styles.readCostSection} title={t("days")} data-read-cost-section="days">
        <Table caption={t("days")} rows={data.days} rowKey={(day) => day.day} columns={[
          { key: "day", header: t("day"), render: (day) => day.day },
          { key: "requests", header: t("requests"), align: "end", render: (day) => day.requests.toLocaleString("en-US") },
          { key: "recorded", header: t("recorded"), align: "end", render: (day) => formatBytes(day.recordedBytes) },
          { key: "bar", header: "", render: (day) => <Bar value={day.recordedBytes} max={maxDay} /> },
          { key: "neon", header: t("neon"), align: "end", render: (day) => day.neonStatus === "ok" && day.neonBytes !== null ? formatBytes(day.neonBytes) : neonLabel(day.neonStatus) },
          { key: "coverage", header: t("coverage"), align: "end", render: (day) => day.coverage !== null ? `${Math.round(day.coverage * 100)}%` : "—" },
        ]} />
      </Card>
      <Card className={styles.readCostSection} title={t("routes")} data-read-cost-section="routes">
        {data.topRoutes.length === 0 ? <p className={styles.body}>{t("noData")}</p> : <Table caption={t("routes")} rows={data.topRoutes} rowKey={(route) => route.route} columns={[
          { key: "route", header: t("route"), render: (route) => <Link aria-current={route.route === data.trend.route ? "page" : undefined} className={route.route === data.trend.route ? styles.selectedRoute : undefined} href={`/app/admin/read-cost?route=${encodeURIComponent(route.route)}`}>{route.route}</Link> },
          { key: "requests", header: t("requests"), align: "end", render: (route) => route.requests.toLocaleString("en-US") },
          { key: "avg", header: t("avg"), align: "end", render: (route) => formatBytes(route.avgBytes) },
          { key: "max", header: t("max"), align: "end", render: (route) => formatBytes(route.maxRequestBytes) },
          { key: "total", header: t("total"), align: "end", render: (route) => formatBytes(route.totalBytes) },
          { key: "bar", header: "", render: (route) => <Bar value={route.totalBytes} max={maxRoute} /> },
        ]} />}
      </Card>
      <Card className={styles.readCostSection} title={t("accounts")} data-read-cost-section="accounts">
        {data.topAccounts.length === 0 ? <p className={styles.body}>{t("noData")}</p> : <Table caption={t("accounts")} rows={data.topAccounts} rowKey={(account) => account.accountId} columns={[
          { key: "account", header: t("account"), render: (account) => account.accountId },
          { key: "requests", header: t("requests"), align: "end", render: (account) => account.requests.toLocaleString("en-US") },
          { key: "avg", header: t("avg"), align: "end", render: (account) => formatBytes(account.avgBytes) },
          { key: "total", header: t("total"), align: "end", render: (account) => formatBytes(account.totalBytes) },
          { key: "bar", header: "", render: (account) => <Bar value={account.totalBytes} max={maxAccount} /> },
        ]} />}
      </Card>
      <Card className={styles.readCostSection} title={`${t("trend")}${data.trend.route ? ` · ${data.trend.route}` : ""}`} data-read-cost-section="trend">
        {data.trend.route === null ? <p className={styles.body}>{t("noData")}</p> : <>
          <p className={styles.body}>{t("trendHint")}</p>
          <div className={styles.trend} role="img" aria-label={`${t("trend")} ${data.trend.route}`}>
            {data.trend.points.map((point) => <div className={styles.trendColumn} key={point.day} title={`${point.day} · ${t("avg")} ${formatBytes(point.avgBytes)} · ${t("requests")} ${point.requests.toLocaleString("en-US")}`}><div className={styles.trendColumnBar} style={{ height: `${maxTrend > 0 ? Math.max(point.avgBytes > 0 ? 2 : 0, Math.round(point.avgBytes / maxTrend * 100)) : 0}%` }} /></div>)}
          </div>
          <div className={styles.trendLabels}><span>{data.trend.points[0]?.day}</span><span>{t("peak")} {formatBytes(maxTrend)}</span><span>{data.trend.points.at(-1)?.day}</span></div>
        </>}
      </Card>
      <Card className={styles.readCostSection} title={t("alerts")} data-read-cost-section="alerts">
        {data.alerts.length === 0 ? <p className={styles.body}>{t("noData")}</p> : <Table caption={t("alerts")} rows={data.alerts} rowKey={(alert) => `${alert.rule}:${alert.day}:${alert.subject}`} columns={[
          { key: "day", header: t("day"), render: (alert) => alert.day },
          { key: "rule", header: t("alerts"), render: (alert) => RULES[alert.rule][language] },
          { key: "subject", header: t("route"), render: (alert) => alert.subject },
          { key: "observed", header: t("total"), align: "end", render: (alert) => alert.rule === "low_coverage" ? `${Math.round(alert.observed * 100)}%` : formatBytes(alert.observed) },
          { key: "notified", header: "", render: (alert) => alert.notified ? t("notified") : t("waiting") },
        ]} />}
      </Card>
    </>
  );
}

export default async function AdminReadCostPage({ searchParams }: { searchParams: Promise<{ route?: string | string[] }> }) {
  const actor = await resolveAuthenticatedApiActor();
  if (!actor) redirect("/app/account/login?next=%2Fapp%2Fadmin%2Fread-cost");
  if (!isReadCostAdmin(actor.id)) notFound();
  let language: OrbitLanguage = "zh";
  try { language = await getOrbitServerLanguage(); } catch { /* requestless tests use zh */ }
  const t = (key: keyof typeof READ_COST_ADMIN_COPY) => READ_COST_ADMIN_COPY[key][language];
  const params = await searchParams;
  const route = typeof params.route === "string" ? params.route.slice(0, 300) : null;
  let data: ReadCostOverview | null = null;
  let failure: "runtime" | "read" | null = null;
  try {
    const runtime = createConfiguredTransactionalPostgresRuntime();
    if (!runtime) failure = "runtime";
    else data = await readReadCostOverview(runtime.client, { now: new Date(), route });
  } catch {
    failure = "read";
  }
  return (
    <Orbit2026Scope language={language} className={styles.page}>
      <ToastProvider>
        <main className={styles.readCost} data-orbit-route="app-admin-read-cost-route" data-read-cost-state={failure ?? (data && hasRecords(data) ? "ready" : "empty")}>
          <Link href="/app/admin">← {t("back")}</Link>
          <header className={styles.section}>
            <p className={styles.eyebrow}>Orbit · {t("title")}</p>
            <h1 className={styles.title}>{t("title")}</h1>
            <p className={styles.body}>{t("subtitle")}{data ? ` ${data.window.from} – ${data.window.to}` : ""}</p>
          </header>
          {failure ? (
            <Card className={styles.section} title={adminText("readCostUnavailable", language)}>
              <p className={styles.body}>{adminText(failure === "runtime" ? "readCostRuntime" : "readCostFailure", language)}</p>
              <form method="get" action="/app/admin/read-cost">
                {route ? <input type="hidden" name="route" value={route} /> : null}
                <Button label={adminText("retry", language)} type="submit" variant="primary" />
              </form>
            </Card>
          ) : data && hasRecords(data) ? <ReadCostView data={data} language={language} /> : <EmptyState title={t("noData")} message={t("emptyMessage")} />}
        </main>
      </ToastProvider>
    </Orbit2026Scope>
  );
}

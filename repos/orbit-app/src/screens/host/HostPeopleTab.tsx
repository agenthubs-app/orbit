// R17 イベント運営 · 参加者（App；b13 HM-P1–P9）。数据：GET /api/host/events/[id]/people?bucket=&q=&incomplete=&cursor=；
// 决定：POST …/people/[actorId]/decision（approve / waitlist / reject，各带自己的 expectedVersion；批量 = 逐条调用，同 Web runDecisions）。
// 見送り 一律先确认（会通知对方、不能撤回；单条・批量・详情都一样）。成功的行离开当前区分；失败的行留着、标红、保持勾选。
import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";

import type { HostAdmissionDecision, HostPeopleBucket, HostPeopleResponse, HostPeopleRow } from "../../api/contract/host-console";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { BottomSheet, presentConfirm, UiText, useToast } from "../../components/ui";
import { InviteQr } from "../add/invite/InviteQr";
import { JourneyPage } from "../events/v2/JourneyPage";
import type { HostApi } from "./host-api";
import type { HostT } from "./host-model";
import { PcCard, useHostStyles } from "./host-ui";
import { HostPersonSheet } from "./HostPersonSheet";
import { BulkBar, noApplicants, PeopleEmpty, PeopleMenu, PeoplePanel, type PeopleQuery, type RowIssue } from "./people-view";

const DONE_LABEL = { approve: "dApproved", reject: "dRejected", waitlist: "dWaitlisted" } as const;

/** 批量 = 逐条调用（各带自己的版本号）；返回成功数与失败的行（409 → conflict）。 */
export async function runDecisions(
  targets: readonly HostPeopleRow[],
  decide: (row: HostPeopleRow) => Promise<{ ok: boolean; reason?: string }>,
): Promise<{ ok: number; failed: Map<string, RowIssue> }> {
  const failed = new Map<string, RowIssue>();
  let ok = 0;
  for (const row of targets) {
    const res = await decide(row);
    if (res.ok) ok += 1;
    else failed.set(row.actorId, res.reason === "conflict" ? "conflict" : "failed");
  }
  return { failed, ok };
}

export function HostPeopleTab({ api, eventId, t, title, initialBucket, onBack, onChanged }: {
  api: HostApi;
  eventId: string;
  t: HostT;
  title: string;
  initialBucket: HostPeopleBucket | null;
  onBack: () => void;
  /** 有人的状态变了：概要的数字要重读。 */
  onChanged?: () => void;
}) {
  const toast = useToast();
  const { styles: h } = useHostStyles();
  const { baseUrl } = useOrbitApiBaseUrl();
  const [query, setQuery] = useState<PeopleQuery>({ bucket: initialBucket ?? "pending", incomplete: false, q: "" });
  // 没指定区分：第一次回答若当前区分没人，就挪到第一个有人的区分（同旧行为）。
  const pick = useRef(initialBucket === null);
  const [data, setData] = useState<HostPeopleResponse | null>(null);
  const [rows, setRows] = useState<HostPeopleRow[]>([]);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [issues, setIssues] = useState<Map<string, RowIssue>>(new Map());
  const [person, setPerson] = useState<HostPeopleRow | null>(null);
  const [personOpen, setPersonOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [qr, setQr] = useState(false);

  // 只认最后一次请求的结果：快速切换区分 / 打字时，晚到的旧回答不能盖掉新的。
  const latest = useRef(0);
  const load = useCallback(async (next: PeopleQuery) => {
    const seq = ++latest.current;
    const res = await api.people(eventId, next);
    if (seq !== latest.current) return null;
    if (!res.ok) { setFailed(true); return null; }
    if (pick.current) {
      pick.current = false;
      const counts = res.data.counts;
      if (counts[next.bucket] === 0) {
        const first = (["pending", "waitlisted", "approved", "rejected"] as const).find((bucket) => counts[bucket] > 0);
        if (first && first !== next.bucket) { setQuery((prev) => ({ ...prev, bucket: first })); return null; }
      }
    }
    setFailed(false);
    setData(res.data);
    setRows([...res.data.rows]);
    return res.data;
  }, [api, eventId]);
  useEffect(() => {
    const timer = setTimeout(() => void load(query), query.q ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, query]);

  // 换区分时先清空行（显示占位），上一个区分的行不带着勾选框和审核按钮闪一下。
  const change = (patch: Partial<PeopleQuery>) => {
    setSelected(new Set()); setIssues(new Map());
    if (patch.bucket !== undefined && patch.bucket !== query.bucket) { setSelecting(false); setRows([]); }
    setQuery((prev) => ({ ...prev, ...patch }));
  };
  const loading = !data || (data.bucket !== query.bucket);

  const more = async () => {
    if (!data?.nextCursor || busy) return;
    setBusy(true);
    const res = await api.people(eventId, { ...query, cursor: data.nextCursor });
    setBusy(false);
    if (!res.ok) { toast.error(t("loadError")); return; }
    setData(res.data);
    setRows((prev) => { const seen = new Set(prev.map((row) => row.actorId)); return [...prev, ...res.data.rows.filter((row) => !seen.has(row.actorId))]; });
  };

  const decide = async (targets: readonly HostPeopleRow[], decision: HostAdmissionDecision) => {
    setBusy(true);
    const { failed: failedRows, ok } = await runDecisions(targets, async (row) => {
      const res = await api.decide(eventId, row.actorId, decision, row.applicationVersion);
      return res.ok ? { ok: true } : { ok: false, reason: res.reason };
    });
    setBusy(false);
    // 重读列表（成功的行离开本区分；冲突的行拿到最新版本号），失败标记留在仍在列表里的行上。
    const fresh = await load(query);
    const still = new Set((fresh?.rows ?? []).map((row) => row.actorId));
    setIssues(new Map([...failedRows].filter(([actorId]) => still.has(actorId))));
    setSelected(new Set([...failedRows.keys()].filter((actorId) => still.has(actorId))));
    if (failedRows.size === 0) toast.success(targets.length === 1 ? t("pDone", { name: targets[0]!.name, what: t(DONE_LABEL[decision]) }) : t("pBulkDone", { n: ok }));
    else if ([...failedRows.values()].every((issue) => issue === "conflict") && ok === 0) toast.error(t("conflictFirst"));
    else toast.error(t("pBulkPartial", { ng: failedRows.size, ok }));
    if (ok > 0) onChanged?.();
    if (failedRows.size === 0) setSelecting(false);
  };
  /** 見送り だけ先に確認を挟む（通知が飛び、取り消せない）。 */
  const request = async (targets: readonly HostPeopleRow[], decision: HostAdmissionDecision) => {
    if (!targets.length || busy) return;
    if (decision === "reject") {
      const ok = await presentConfirm({
        cancelLabel: t("pRejectKeep"), confirmLabel: t("pRejectConfirm"), destructive: true, icon: "mail", message: t("pRejectBody"),
        title: targets.length === 1 ? t("pRejectTitleOne", { name: targets[0]!.name }) : t("pRejectTitleMany", { n: targets.length }),
      });
      if (!ok) return;
    }
    if (targets.length === 1 && person?.actorId === targets[0]!.actorId) setPersonOpen(false);
    await decide(targets, decision);
  };

  const link = data?.applyPath ? `${baseUrl.replace(/\/$/, "")}${data.applyPath}` : null;
  const copy = async () => {
    if (!link) return;
    try { await Clipboard.setStringAsync(link); toast.success(t("copied")); } catch { toast.error(t("saveError")); }
  };

  const selCount = rows.filter((row) => selected.has(row.actorId)).length;
  const empty = data && !loading && noApplicants(data) && !query.q.trim() && !query.incomplete;
  const pending = data?.counts.pending ?? 0;
  const name = data?.event.title || title;
  return (
    <JourneyPage title={t("tPeople")} subtitle={name ? `${name} · ${t("todoReview", { n: pending })}` : undefined} fallback={`/events/${encodeURIComponent(eventId)}/operations`} leftLabel={t("appBack")} onLeft={onBack}
      footer={selecting && data ? <BulkBar t={t} bucket={query.bucket} count={selCount} busy={busy} onBulk={(decision) => void request(rows.filter((row) => selected.has(row.actorId)), decision)} /> : undefined}
      testID="host-console-people">
      {!data ? (failed ? <PcCard text={t("appLoadError")} emoji="⚠️" tone="apricot" /> : null)
        : empty ? <PeopleEmpty t={t} link={link} onCopy={() => void copy()} onQr={() => setQr(true)} />
          : (
            <PeoplePanel data={data} rows={rows} t={t} query={query} loading={loading} busy={busy} selecting={selecting} selected={selected} issues={issues}
              onBucket={(bucket) => change({ bucket })} onSearch={(q) => change({ q })} onIncomplete={() => change({ incomplete: !query.incomplete })}
              onSelecting={(on) => { setSelecting(on); if (!on) { setSelected(new Set()); setIssues(new Map()); } }}
              onSelect={(actorId) => setSelected((prev) => { const next = new Set(prev); if (next.has(actorId)) next.delete(actorId); else next.add(actorId); return next; })}
              onSelectAll={() => setSelected(new Set(rows.filter((row) => row.status === query.bucket && row.applicationVersion > 0).map((row) => row.actorId)))}
              onOpen={(row) => { setPerson(row); setPersonOpen(true); }}
              onDecide={(row, decision) => void request([row], decision)}
              onMore={() => void more()} onMenu={() => setMenu(true)} />
          )}
      <HostPersonSheet person={person ? { actorId: person.actorId, name: person.name } : null} visible={personOpen} onClose={() => setPersonOpen(false)} api={api} eventId={eventId} t={t}
        busy={busy} onDecide={person && (person.status === "pending" || person.status === "waitlisted") && person.applicationVersion > 0 ? (decision) => void request([person], decision) : undefined} />
      <PeopleMenu visible={menu} t={t} hasLink={Boolean(link)} onClose={() => setMenu(false)} onCopy={() => void copy()} onQr={() => setQr(true)} />
      <BottomSheet visible={qr} onClose={() => setQr(false)} accessibilityLabel={t("pQrTitle")}>
        <View style={{ alignItems: "center", gap: 12, paddingBottom: 12 }} testID="host-people-qr">
          <UiText style={h.h3}>{t("pQrTitle")}</UiText>
          {link ? <InviteQr text={link} label={t("pQrTitle")} size={220} /> : null}
          {link ? <UiText style={h.lbl} numberOfLines={2}>{link}</UiText> : null}
        </View>
      </BottomSheet>
    </JourneyPage>
  );
}

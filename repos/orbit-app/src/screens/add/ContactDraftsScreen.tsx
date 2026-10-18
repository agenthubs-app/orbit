// R12 `contacts/new/drafts` 確認待ちの下書き (DESIGN §2.9, App): the existing draft queue
// (`GET /api/contact-drafts`) with 確認して追加 (the existing confirm) and 破棄 (hidden on
// this device — the draft service has no discard, as before); `?eventId=` adds
// 参加者から取り込む (the existing attendee import). Reached from 人脈を追加 (when there are
// drafts) and from an event's 「去复核联系人」 (reviewQueueHref).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { AppScreen } from "../../components/AppScreen";
import { Avatar, ConfirmDialog, EmptyState, RetryCard, Skeleton, UiText, useToast } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { useAddApi, type ContactDraftRow } from "./add-api";
import { discardDraft, readDiscardedDrafts } from "./add-storage";
import { DensityDots, FadeIn } from "./add-ui";
import { KitChip, KitEmo, KitGradient } from "../plan/plan-kit";
import { useJourneyApi } from "../events/v2/journey-api";
import { draftsDesignFor } from "./scan-design-fixtures";
import { SmallButton } from "./UnifiedReviewApp";

type State = { kind: "loading" } | { kind: "failed" } | { kind: "ready"; drafts: ContactDraftRow[] };

export function ContactDraftsScreen({ eventId, design = null }: { eventId: string | null; design?: string | null }) {
  const api = useAddApi();
  const journey = useJourneyApi();
  const fixture = useMemo(() => draftsDesignFor(design), [design]);
  // b12 #112：取り込む卡写「<活动名> · このイベントの参加者を…」；活动名读概要（读不到就只写说明）。
  const [eventTitle, setEventTitle] = useState<string | null>(fixture?.eventTitle ?? null);
  const toast = useToast();
  const { t } = useOrbitLocale();
  const { colors, styles: d } = useDraftStyles();
  const accountId = useOrbitAuthSession().actorId ?? "";
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState<ContactDraftRow | null>(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  useEffect(() => {
    if (!eventId || fixture) return;
    let live = true;
    void journey.overview(eventId).then((result) => { if (live && result.ok) setEventTitle(result.data.title); });
    return () => { live = false; };
  }, [eventId, journey, fixture]);

  const load = useCallback(async () => {
    if (fixture) { setState({ drafts: fixture.drafts, kind: "ready" }); return; }
    const [drafts, discarded] = await Promise.all([api.listDrafts(), readDiscardedDrafts(accountId)]);
    if (!mounted.current) return;
    if (!drafts.ok) { setState({ kind: "failed" }); return; }
    const hidden = new Set(discarded);
    setState({ drafts: drafts.data.filter((draft) => !hidden.has(draft.id)), kind: "ready" });
  }, [accountId, api, fixture]);
  useEffect(() => { void load(); }, [load]);

  async function confirm(draft: ContactDraftRow) {
    if (busy) return;
    setBusy(draft.id);
    const result = await api.confirmDraft(draft.id);
    if (!mounted.current) return;
    setBusy(null);
    if (!result.ok) { toast.error(t("add.drafts.actionFailed")); return; }
    toast.success(t(result.data.contactId ? "add.drafts.confirmedToast" : "add.drafts.checkedToast"), { sub: draft.displayName });
    await load();
  }

  async function discard(draft: ContactDraftRow) {
    setDiscarding(null);
    await discardDraft(accountId, draft.id);
    if (!mounted.current) return;
    toast.info(t("add.drafts.discardedToast"));
    await load();
  }

  async function importAttendees() {
    if (!eventId || busy) return;
    setBusy("import");
    const result = await api.importAttendees(eventId);
    if (!mounted.current) return;
    setBusy(null);
    if (!result.ok) { toast.error(t("add.drafts.actionFailed")); return; }
    if (result.data.count > 0) toast.success(t("add.drafts.importedToast", { n: result.data.count }));
    else toast.info(t("add.drafts.importNone"));
    await load();
  }

  const count = state.kind === "ready" ? state.drafts.length : null;
  return (
    <AppScreen inset="kit" title={t("add.drafts.title")} subtitle={count === null ? undefined : t("add.drafts.count", { n: count })}>
      <FadeIn testID="add-drafts">
        <UiText style={d.lead}>{t("add.drafts.lead")}</UiText>
        {eventId ? (
          <View style={[d.card, d.importCard]} testID="add-drafts-import">
            {/* .dimport: linear-gradient(135deg, mac-lav, surface 70%). */}
            <KitGradient id="add-drafts-import" from={colors.macLav} to={colors.surface} stop={0.7} />
            <View style={d.row}>
              <KitEmo emoji="🥂" tone="lav" sm />
              <View style={d.grow}>
                <UiText style={d.importTitle}>{t("add.drafts.importTitle")}</UiText>
                <UiText style={d.lbl}>{eventTitle ? `${eventTitle} · ${t("add.drafts.importBody")}` : t("add.drafts.importBody")}</UiText>
              </View>
            </View>
            <View style={d.importAct}><SmallButton primary label={t("add.drafts.importButton")} busy={busy === "import"} disabled={Boolean(busy)} onPress={() => void importAttendees()} testID="add-drafts-import-go" /></View>
          </View>
        ) : null}
        {state.kind === "loading" ? <Skeleton lines={4} /> : null}
        {state.kind === "failed" ? <RetryCard title={t("add.drafts.loadFailed")} onRetry={() => void load()} /> : null}
        {state.kind === "ready" && !state.drafts.length ? <EmptyState title={t("add.drafts.emptyTitle")} message={t("add.drafts.emptyBody")} /> : null}
        {state.kind === "ready" && state.drafts.length ? (
          <View style={d.list}>
            {state.drafts.map((draft, index) => (
              <View key={draft.id} style={[d.card, d.drf, index > 0 && d.drfNext]} testID={`add-draft-${draft.id}`}>
                <View style={d.row}>
                  <Avatar name={draft.displayName} />
                  <View style={d.grow}>
                    <UiText numberOfLines={1} style={d.name}>{draft.displayName}</UiText>
                    <UiText numberOfLines={1} style={d.lbl}>{[draft.organization, draft.role].filter(Boolean).join(" · ")}</UiText>
                  </View>
                  <DensityDots level={1} />
                </View>
                {draft.sourceLabel ? <View style={d.chips}><KitChip label={t("add.drafts.from", { label: draft.sourceLabel })} /></View> : null}
                <View style={d.acts}>
                  <View style={d.act}><SmallButton label={t("add.drafts.confirm")} busy={busy === draft.id} disabled={Boolean(busy)} onPress={() => void confirm(draft)} testID={`add-draft-confirm-${draft.id}`} /></View>
                  <View style={d.act}><SmallButton ghost label={t("add.drafts.discard")} disabled={Boolean(busy)} onPress={() => setDiscarding(draft)} testID={`add-draft-discard-${draft.id}`} /></View>
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </FadeIn>
      <ConfirmDialog
        visible={discarding !== null}
        title={t("add.drafts.discardTitle")}
        message={discarding ? t("add.drafts.discardBodyName", { name: discarding.displayName }) : t("add.drafts.discardBody")}
        confirmLabel={t("add.drafts.discard")}
        destructive
        onConfirm={() => { if (discarding) void discard(discarding); }}
        onCancel={() => setDiscarding(null)}
      />
    </AppScreen>
  );
}

// kit 数值（b12 N08b / N09）：.lbl 引导（margin 0 4 12、行高 1.6）、.card.dimport padding 14、.card.drf padding 14 + 间距 10、
// .av 38、名字 14 / 700、.dn.d1、.chip 来源、.acts 两格（间距 8、margin-top 12）。
const useDraftStyles = createThemedStyles((colors) => StyleSheet.create({
  lead: { marginHorizontal: 4, marginBottom: 12, fontSize: 11.5, fontWeight: "500", lineHeight: 18.4, color: colors.ink2 },
  card: { backgroundColor: colors.surface, borderRadius: 24, padding: 14 },
  importCard: { marginBottom: 12, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  grow: { flex: 1, minWidth: 0 },
  importTitle: { fontSize: 13.5, fontWeight: "700", lineHeight: 20.25, color: colors.ink },
  lbl: { fontSize: 11.5, fontWeight: "500", lineHeight: 17.25, color: colors.ink3 },
  importAct: { marginTop: 10, flexDirection: "row" },
  list: {},
  drf: {},
  drfNext: { marginTop: 10 },
  name: { fontSize: 14, fontWeight: "700", lineHeight: 21, color: colors.ink },
  chips: { flexDirection: "row", gap: 6, marginTop: 8 },
  acts: { flexDirection: "row", gap: 8, marginTop: 12 },
  act: { flex: 1 },
}));

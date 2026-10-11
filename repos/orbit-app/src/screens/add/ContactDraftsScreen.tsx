// R12 `contacts/new/drafts` 確認待ちの下書き (DESIGN §2.9, App): the existing draft queue
// (`GET /api/contact-drafts`) with 確認して追加 (the existing confirm) and 破棄 (hidden on
// this device — the draft service has no discard, as before); `?eventId=` adds
// 参加者から取り込む (the existing attendee import). Reached from 人脈を追加 (when there are
// drafts) and from an event's 「去复核联系人」 (reviewQueueHref).
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";

import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { AppScreen } from "../../components/AppScreen";
import { Button, Card, ConfirmDialog, EmptyState, ListRow, RetryCard, Skeleton, useToast } from "../../components/ui";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { useAddApi, type ContactDraftRow } from "./add-api";
import { discardDraft, readDiscardedDrafts } from "./add-storage";
import { Caption, FadeIn, useAddStyles } from "./add-ui";

type State = { kind: "loading" } | { kind: "failed" } | { kind: "ready"; drafts: ContactDraftRow[] };

export function ContactDraftsScreen({ eventId }: { eventId: string | null }) {
  const api = useAddApi();
  const toast = useToast();
  const { t } = useOrbitLocale();
  const { styles } = useAddStyles();
  const accountId = useOrbitAuthSession().actorId ?? "";
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState<ContactDraftRow | null>(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const load = useCallback(async () => {
    const [drafts, discarded] = await Promise.all([api.listDrafts(), readDiscardedDrafts(accountId)]);
    if (!mounted.current) return;
    if (!drafts.ok) { setState({ kind: "failed" }); return; }
    const hidden = new Set(discarded);
    setState({ drafts: drafts.data.filter((draft) => !hidden.has(draft.id)), kind: "ready" });
  }, [accountId, api]);
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

  return (
    <AppScreen title={t("add.drafts.title")}>
      <FadeIn testID="add-drafts">
        <View style={styles.stack}>
          <Caption>{t("add.drafts.lead")}</Caption>
          {eventId ? (
            <Card variant="flat">
              <View style={styles.stack} testID="add-drafts-import">
                <ListRow title={t("add.drafts.importTitle")} subtitle={t("add.drafts.importBody")} />
                <Button variant="primary" icon="users" label={t("add.drafts.importButton")} loading={busy === "import"} onPress={() => void importAttendees()} />
              </View>
            </Card>
          ) : null}
          {state.kind === "loading" ? <Skeleton lines={4} /> : null}
          {state.kind === "failed" ? <RetryCard title={t("add.drafts.loadFailed")} onRetry={() => void load()} /> : null}
          {state.kind === "ready" && !state.drafts.length ? <EmptyState title={t("add.drafts.emptyTitle")} message={t("add.drafts.emptyBody")} /> : null}
          {state.kind === "ready" ? state.drafts.map((draft) => (
            <Card key={draft.id}>
              <View style={styles.stack} testID={`add-draft-${draft.id}`}>
                <ListRow
                  title={draft.displayName}
                  subtitle={[[draft.organization, draft.role].filter(Boolean).join(" · "), draft.sourceLabel ? t("add.drafts.from", { label: draft.sourceLabel }) : ""].filter(Boolean).join(" · ")}
                />
                <View style={styles.row}>
                  <Button size="sm" variant="primary" icon="user-plus" label={t("add.drafts.confirm")} loading={busy === draft.id} disabled={Boolean(busy)} onPress={() => void confirm(draft)} />
                  <Button size="sm" variant="ghost" label={t("add.drafts.discard")} disabled={Boolean(busy)} onPress={() => setDiscarding(draft)} />
                </View>
              </View>
            </Card>
          )) : null}
        </View>
      </FadeIn>
      <ConfirmDialog
        visible={discarding !== null}
        title={t("add.drafts.discardTitle")}
        message={t("add.drafts.discardBody")}
        confirmLabel={t("add.drafts.discard")}
        destructive
        onConfirm={() => { if (discarding) void discard(discarding); }}
        onCancel={() => setDiscarding(null)}
      />
    </AppScreen>
  );
}

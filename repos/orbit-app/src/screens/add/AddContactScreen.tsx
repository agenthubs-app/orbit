// R12 `contacts/new` 「人脈を追加」 (DESIGN §2.1, App): a plain page with the doors (名刺を
// スキャン / 手入力; 招待コード and その他 hidden until R15 / R16) and 確認待ちの下書き N件
// when the draft queue has drafts (§2.9). Back returns to 人脈 (parentForPath).
import { type Href, useRouter } from "expo-router";
import { useEffect, useState } from "react";

import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { AppScreen } from "../../components/AppScreen";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { useAddApi } from "./add-api";
import { readDiscardedDrafts } from "./add-storage";
import { AddContactDoors } from "./AddContactDoors";
import { FadeIn } from "./add-ui";

export function AddContactScreen() {
  const router = useRouter();
  const api = useAddApi();
  const { t } = useOrbitLocale();
  const accountId = useOrbitAuthSession().actorId ?? "";
  const [draftCount, setDraftCount] = useState(0);
  useEffect(() => {
    let alive = true;
    void (async () => {
      // The draft queue is optional here: a failure just leaves the 下書き door out.
      const [drafts, discarded] = await Promise.all([api.listDrafts(), readDiscardedDrafts(accountId)]);
      if (!alive || !drafts.ok) return;
      const hidden = new Set(discarded);
      setDraftCount(drafts.data.filter((draft) => !hidden.has(draft.id)).length);
    })();
    return () => { alive = false; };
  }, [accountId, api]);
  return (
    <AppScreen title={t("add.doors.title")}>
      <FadeIn testID="add-contact-page">
        <AddContactDoors draftCount={draftCount} onOpen={(href) => router.push(href as Href)} />
      </FadeIn>
    </AppScreen>
  );
}

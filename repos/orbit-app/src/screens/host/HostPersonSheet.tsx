// 参加者詳細的底部弹层（App 惯例：受付 QR 也是 BottomSheet，不另开路由）。只请求这一个人：GET /api/host/events/[id]/people/[actorId]。
// 换人时先清空、显示占位，晚到的旧回答丢弃（同 Web HostPersonDrawer）。
import { useEffect, useState } from "react";

import type { HostPersonResponse } from "../../api/contract/host-console";
import { BottomSheet, UiText } from "../../components/ui";
import type { HostApi } from "./host-api";
import type { HostT } from "./host-model";
import { useHostStyles } from "./host-ui";
import { HostPersonLoading, HostPersonView } from "./person-view";

export function HostPersonSheet({ person, visible, onClose, api, eventId, t }: { person: { actorId: string; name: string } | null; visible: boolean; onClose: () => void; api: HostApi; eventId: string; t: HostT }) {
  const { styles } = useHostStyles();
  const [data, setData] = useState<HostPersonResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const actorId = person?.actorId ?? null;
  useEffect(() => {
    if (!visible || !actorId) return undefined;
    let alive = true;
    setData(null);
    setFailed(false);
    void api.person(eventId, actorId).then((res) => { if (!alive) return; if (res.ok) setData(res.data); else setFailed(true); });
    return () => { alive = false; };
  }, [api, eventId, actorId, visible]);
  const current = data && data.actorId === actorId ? data : null;
  return (
    <BottomSheet visible={visible} onClose={onClose} {...(person ? { accessibilityLabel: t("pdOpen", { name: person.name }) } : {})}>
      {current ? <HostPersonView data={current} t={t} />
        : failed ? <UiText style={styles.sub}>{t("loadError")}</UiText>
          : <HostPersonLoading />}
    </BottomSheet>
  );
}

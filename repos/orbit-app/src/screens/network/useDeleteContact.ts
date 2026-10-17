// R11a（代定 9）：删除一个联系人（详情 ⋯ 与编辑页共用）。联网：DELETE /api/contacts/:id（软删）；
// 连不上：进本机删除队列（contact-delete-queue），联网后再发。之后回到人脈，由列表显示「削除しました · 元に戻す」
// （详情页在返回后卸载，Toast 的撤回必须挂在列表上）。
import { useRouter, type Href } from "expo-router";
import { useCallback, useState } from "react";

import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useToast } from "../../components/ui";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { announceContactDeleted, queueContactDelete } from "./contact-delete-queue";

export function useDeleteContact(onDone?: () => void) {
  const client = useOrbitApiClient();
  const auth = useOrbitAuthSession();
  const router = useRouter();
  const toast = useToast();
  const { t } = useOrbitLocale();
  const [pending, setPending] = useState(false);
  const remove = useCallback(async (contactId: string, name: string, now: () => number = Date.now) => {
    if (pending) return;
    setPending(true);
    const result = await client.delete(`/api/contacts/${encodeURIComponent(contactId)}`).catch(() => ({ success: false as const, status: 0 }));
    const status = (result as { status?: number }).status ?? 0;
    setPending(false);
    if (result.success) announceContactDeleted({ contactId, name, queued: false });
    else if (status === 0 && auth.actorId) {
      await queueContactDelete(auth.actorId, contactId, new Date(now()).toISOString());
      announceContactDeleted({ contactId, name, queued: true });
    } else {
      toast.error(t("network.delete.failed"));
      return;
    }
    onDone?.();
    router.navigate("/contacts" as Href);
  }, [auth.actorId, client, onDone, pending, router, t, toast]);
  return { remove, pending };
}

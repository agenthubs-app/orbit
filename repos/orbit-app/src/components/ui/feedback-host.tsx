import { useEffect, useState } from "react";

import { ActionSheet } from "./ActionSheet";
import { ConfirmDialog } from "./ConfirmDialog";
import { registerFeedbackPresenter, type FeedbackRequest } from "./feedback-requests";
import type { IconName } from "./Icon";

export { presentActionSheet, presentConfirm } from "./feedback-requests";

// Mount once inside <UiPortalHost> (app/_layout.tsx). Shows the requests made with
// presentConfirm / presentActionSheet, one at a time: a new one cancels the old.
export function UiFeedbackHost() {
  const [request, setRequest] = useState<FeedbackRequest | null>(null);
  useEffect(() => {
    registerFeedbackPresenter((next) => setRequest((current) => {
      if (current?.kind === "confirm") current.resolve(false);
      if (current?.kind === "sheet") current.resolve(null);
      return next;
    }));
    return () => registerFeedbackPresenter(null);
  }, []);
  if (!request) return null;
  if (request.kind === "confirm") {
    const finish = (value: boolean) => { setRequest(null); request.resolve(value); };
    return <ConfirmDialog visible title={request.title} {...(request.message ? { message: request.message } : {})} confirmLabel={request.confirmLabel} {...(request.cancelLabel ? { cancelLabel: request.cancelLabel } : {})} destructive={Boolean(request.destructive)} onConfirm={() => finish(true)} onCancel={() => finish(false)} />;
  }
  const finish = (value: string | null) => { setRequest(null); request.resolve(value); };
  return <ActionSheet visible title={request.title} effects={(request.effects ?? []).map((effect) => ({ icon: effect.icon as IconName, text: effect.text }))} options={request.options} onSelect={finish} onClose={() => finish(null)} />;
}

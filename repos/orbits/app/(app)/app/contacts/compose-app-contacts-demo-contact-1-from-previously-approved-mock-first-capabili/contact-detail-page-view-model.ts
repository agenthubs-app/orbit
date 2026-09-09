import type { OrbitLanguage } from "../../orbit-language-core";
import { localizeOrbitTree } from "../../orbit-language-server";
import { applyOrbitContactsPresentation } from "../../orbit-contacts-presentation";
import type { AppContactDetailSuccessModel } from "./contact-detail-route-service";
import { contactDetailRouteToOrbitContactsViewModel } from "./contact-detail-view-model-adapter";

export function contactDetailPageViewModel(model: AppContactDetailSuccessModel, language: OrbitLanguage) {
  const original = contactDetailRouteToOrbitContactsViewModel(model, language);
  const localized = localizeOrbitTree(applyOrbitContactsPresentation(original, language), language);
  return {
    ...localized,
    connections: localized.connections.map((contact, index) => ({
      ...contact,
      // 保留用户写下的原文；全站展示文案翻译不应修改私人备注。
      notes: contact.notes.map((note, noteIndex) => note.privacy === "private" ? original.connections[index].notes[noteIndex] : note),
    })),
  };
}

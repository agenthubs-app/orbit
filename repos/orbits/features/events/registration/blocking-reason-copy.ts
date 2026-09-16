import type { EventRegistrationBlockingReason } from "./contract";

export function registrationBlockingReasonCopy(reason: EventRegistrationBlockingReason | undefined, language: "zh" | "en") {
  const copy = {
    configuration_required: { zh: "主办方尚未补全报名信息，暂不能报名或修改资料。", en: "The organizer has not completed the registration information. Registration and edits are unavailable." },
    migration_in_progress: { zh: "正在更新报名记录，暂不能提交。", en: "The server is updating registration records. Submission is unavailable." },
    invalid_window: { zh: "报名时间设置有误，请联系主办方。", en: "The registration dates are invalid. Contact the organizer." },
    temporarily_unavailable: { zh: "暂时无法读取报名状态，请重新读取后再试。", en: "Registration status could not be read. Reload and try again." },
  };
  return copy[reason && reason in copy ? reason : "temporarily_unavailable"][language];
}

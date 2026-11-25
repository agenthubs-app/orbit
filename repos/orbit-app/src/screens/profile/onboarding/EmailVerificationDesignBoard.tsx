/** Dev builds only: boards VA1, VA2, VA4 and VA5 (onboarding-3step-proposal ⑥) with their own sample data, for the pixel gate. Reads and sends nothing. */
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { EmailSendState } from "../../../api/email-verification";
import { ShellBackground } from "../../../components/ShellBackground";
import { useShellTopGap } from "../../../components/ShellTopBar";
import { Card } from "../../../components/ui";
import { createThemedStyles } from "../../../design/theme";
import { EmailNoticeBar } from "../../../email-verification/EmailNotice";
import { EmailVerificationContext, type EmailVerificationView } from "../../../email-verification/EmailVerificationContext";
import { EmailVerificationRowView } from "../../../email-verification/EmailVerificationRow";
import { MailSentDialog } from "../../../email-verification/MailSentDialog";
import { OnboardingDesignBoard } from "./OnboardingDesignBoard";
import samples from "./onboarding-design-samples.json";

const BOARDS = ["VA1", "VA2", "VA4", "VA5"] as const;
type Board = (typeof BOARDS)[number];
export const isEmailVerificationBoard = (value: unknown): value is Board => BOARDS.includes(value as Board);

const nothing = () => undefined;
const view = (send: EmailSendState = { kind: "idle" }, rest: Partial<EmailVerificationView> = {}): EmailVerificationView =>
  ({ email: samples.basic.email, verified: false, mailed: true, send, noticeVisible: true, requestMail: nothing, ...rest });
const NOTICES: readonly EmailVerificationView[] = [view(), view(undefined, { mailed: false }), view({ kind: "sent" }), view({ kind: "wait", seconds: 45 }), view({ kind: "limit" }), view({ kind: "fail" })];

export function EmailVerificationDesignBoard({ board }: { board: Board }) {
  const { styles } = useStyles();
  const topGap = useShellTopGap();
  if (board === "VA2") return <EmailVerificationContext.Provider value={view()}><OnboardingDesignBoard board="A1" notice /></EmailVerificationContext.Provider>;
  return (
    <SafeAreaView edges={["top"]} style={[styles.page, { paddingTop: topGap }]}>
      {board === "VA1" ? <MailSentDialog email={samples.basic.email} onProceed={nothing} /> : <ShellBackground />}
      {board === "VA4" ? NOTICES.map((notice, index) => <EmailNoticeBar key={index} style={styles.notice} view={notice} />) : null}
      {board === "VA5" ? <View style={styles.rows}>{[view(), view({ kind: "sent" }), view(undefined, { verified: true })].map((row, index) => <Card key={index}><EmailVerificationRowView view={row} /></Card>)}</View> : null}
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  notice: { marginBottom: 10 },
  rows: { gap: 28, paddingHorizontal: 18 },
}));

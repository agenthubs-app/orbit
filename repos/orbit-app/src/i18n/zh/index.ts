// R03: the Chinese dictionary is the key source: MessageKey is derived from it
// (src/i18n/messages.ts). One file per key prefix; add a key to all three locales.
import { inbox } from "./inbox";
import { contacts } from "./contacts";
import { portrait66 } from "./portrait66";
import { personal63 } from "./personal63";
import { personal60 } from "./personal60";
import { registration } from "./registration";
import { aiContactArtifact } from "./aiContactArtifact";
import { common } from "./common";
import { sync } from "./sync";
import { events } from "./events";
import { notes } from "./notes";
import { nav } from "./nav";
import { settings } from "./settings";
import { aiEntityDraft } from "./aiEntityDraft";
import { profile } from "./profile";
import { account } from "./account";
import { session } from "./session";
import { shell } from "./shell";
import { auth } from "./auth";
import { reset } from "./reset";
import { permissions } from "./permissions";
import { home } from "./home";
import { invitation } from "./invitation";
import { businessCard } from "./businessCard";
import { contactNotes } from "./contactNotes";
import { ai } from "./ai";
import { aiConversation } from "./aiConversation";
import { tasks } from "./tasks";
import { schedule } from "./schedule";
import { meetingDetails } from "./meetingDetails";
import { inboxVm } from "./inboxVm";
import { agentActions } from "./agentActions";
import { aiOrganization } from "./aiOrganization";
import { aiMention } from "./aiMention";
import { todayActions } from "./todayActions";
import { workflow } from "./workflow";
import { todayVm } from "./todayVm";
import { schedulePreview } from "./schedulePreview";
import { conversationVm } from "./conversationVm";
import { scheduleVm } from "./scheduleVm";
import { followupVm } from "./followupVm";
import { taskDetail } from "./taskDetail";
import { relationshipTasks } from "./relationshipTasks";
import { today } from "./today";
import { typedInbox } from "./typedInbox";
import { discovery } from "./discovery";
import { personal53 } from "./personal53";
import { personal59 } from "./personal59";
import { onboarding } from "./onboarding";
import { contactAdd } from "./contactAdd";

export const zh = {
  ...inbox,
  ...contacts,
  ...portrait66,
  ...personal63,
  ...personal60,
  ...registration,
  ...aiContactArtifact,
  ...common,
  ...sync,
  ...events,
  ...notes,
  ...nav,
  ...settings,
  ...aiEntityDraft,
  ...profile,
  ...account,
  ...session,
  ...shell,
  ...auth,
  ...reset,
  ...permissions,
  ...home,
  ...invitation,
  ...businessCard,
  ...contactNotes,
  ...ai,
  ...aiConversation,
  ...tasks,
  ...schedule,
  ...meetingDetails,
  ...inboxVm,
  ...agentActions,
  ...aiOrganization,
  ...aiMention,
  ...todayActions,
  ...workflow,
  ...todayVm,
  ...schedulePreview,
  ...conversationVm,
  ...scheduleVm,
  ...followupVm,
  ...taskDetail,
  ...relationshipTasks,
  ...today,
  ...typedInbox,
  ...discovery,
  ...personal53,
  ...personal59,
  ...onboarding,
  ...contactAdd,
} as const;

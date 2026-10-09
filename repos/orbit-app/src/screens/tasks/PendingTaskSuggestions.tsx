import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { taskSuggestionPageSchema } from "../../api/schema/task-suggestion-page";
import { ErrorState } from "../../components/ErrorState";
import { createControlStyles } from "../../design/controls";
import { createThemedStyles } from "../../design/theme";
import { spacing, textStyles } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import { usePageCopyResource } from "../../hooks/usePageCopyResource";
import { OfflineNotice } from "../../components/OfflineNotice";
import { NeedsNetworkState } from "../../components/NeedsNetworkState";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";

/** Canonical suggestions are separate from saved tasks and AI draft artifacts. */
export function PendingTaskSuggestions() {
  const auth=useOrbitAuthSession(), server=useOrbitApiBaseUrl(), locale=useOrbitLocale();
  const {styles}=useStyles();
  const scope=JSON.stringify([auth.actorId,auth.cookieHeader,server.baseUrl]);
  const [position,setPosition]=useState<{scope:string;cursor:string|null}>({scope,cursor:null});
  const cursor=position.scope===scope?position.cursor:null;
  const params=new URLSearchParams({scope:"relationship",limit:"20"});
  if(cursor)params.set("cursor",cursor);
  const enabled=auth.ready&&auth.signedIn&&server.ready&&Boolean(auth.actorId);
  // Sprint 0131: the first page is the page copy "task-suggestions" (offline with 截至); later pages are online reads.
  const firstParams=new URLSearchParams({scope:"relationship",limit:"20"});
  const first=usePageCopyResource<unknown>(`/api/task-suggestions/page?${firstParams}`,()=>false,
    {scopeKey:JSON.stringify([scope,null]),enabled:enabled&&cursor===null,copy:{id:"task-suggestions"},
      accept:(data)=>{const parsed=taskSuggestionPageSchema.safeParse(data);return parsed.success&&parsed.data.actorId===auth.actorId&&parsed.data.scope==="relationship";}});
  const later=useApiResource<unknown>(`/api/task-suggestions/page?${params}`,()=>false,
    {scopeKey:JSON.stringify([scope,cursor]),cachePolicy:"network-only",enabled:enabled&&cursor!==null});
  const state=cursor===null?first:later;
  const offline=cursor===null&&first.copy?.offline===true;
  const loaded=enabled&&(state.kind==="success"||state.kind==="empty");
  const parsed=loaded?taskSuggestionPageSchema.safeParse(state.data):null;
  const page=parsed?.success&&parsed.data.actorId===auth.actorId&&parsed.data.scope==="relationship"?parsed.data:null;
  const failure=state.kind==="offline"?locale.t("sync.notOnDevice"):state.kind==="failure"?state.error.message:loaded&&!page
    ?locale.language==="zh"?"未能确认建议，请重试。":locale.language==="ja"?"提案を確認できません。再試行してください。":"Could not verify suggestions. Please retry.":null;
  const refresh=()=>{setPosition({scope,cursor:null});state.refresh();};
  return <View style={styles.section}>
    <Text accessibilityRole="header" style={styles.heading}>{locale.t("relationshipTasks.pendingSuggestions",{count:page?.total??""})}</Text>
    {offline?<OfflineNotice lastSyncedAt={first.copy?.lastSyncedAt??null} reason={first.copy?.reason??null}/>:null}
    {!page&&!failure?<Text accessibilityRole="progressbar" style={styles.body}>{locale.t("common.loading")}</Text>:null}
    {failure&&state.kind==="offline"?<NeedsNetworkState message={failure} onRetry={refresh}/>:null}
    {failure&&state.kind!=="offline"?<View><ErrorState message={failure}/><Pressable accessibilityRole="button" onPress={refresh} style={styles.button}><Text style={styles.buttonText}>{locale.t("common.retry")}</Text></Pressable></View>:null}
    {page?.total===0?<Text style={styles.body}>{locale.t("relationshipTasks.emptySuggestions")}</Text>:null}
    {page?.items.map(item=><View key={item.id} style={styles.item}><Text style={styles.body}>{item.titlePreview}</Text><Text style={styles.body}>{item.reasonPreview}</Text></View>)}
    {cursor?<Pressable accessibilityRole="button" onPress={()=>setPosition({scope,cursor:null})} style={styles.button}><Text style={styles.buttonText}>{locale.t("contacts.firstPage")}</Text></Pressable>:null}
    {page?.nextCursor&&!offline?<Pressable accessibilityRole="button" onPress={()=>setPosition({scope,cursor:page.nextCursor})} style={styles.button}><Text style={styles.buttonText}>{locale.t("contacts.nextPage")}</Text></Pressable>:null}
  </View>;
}

const useStyles=createThemedStyles(colors=>StyleSheet.create({
  section:{gap:spacing.md},
  heading:{...textStyles.listTitle,color:colors.ink},
  body:{...textStyles.body,color:colors.ink},
  item:{gap:spacing.xs,paddingVertical:spacing.sm,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.line},
  button:{...createControlStyles(colors).secondaryButton},
  buttonText:{...createControlStyles(colors).secondaryButtonText},
}));

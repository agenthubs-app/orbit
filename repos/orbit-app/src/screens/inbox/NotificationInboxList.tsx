import {Ionicons} from '@expo/vector-icons';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import type {InboxNotificationKind,InboxNotificationListDTO} from '../../api/contract/inbox-notifications';
import {useOrbitTheme} from '../../design/theme';
import {useOrbitLocale} from '../../i18n/OrbitLocaleContext';
export const notificationKindIcons:Record<InboxNotificationKind,'time-outline'|'sparkles-outline'|'swap-horizontal-outline'>={reminder:'time-outline',suggestion:'sparkles-outline',update:'swap-horizontal-outline'};
export function NotificationInboxList({data,onOpen,onMore,onRefresh,onFilter,filter,busy,error}:{data:InboxNotificationListDTO;onOpen:(id:string)=>void;onMore:()=>void;onRefresh:()=>void;onFilter:(kind:'all'|InboxNotificationKind|'history')=>void;filter:'all'|InboxNotificationKind|'history';busy:boolean;error:string}) {
 const {colors}=useOrbitTheme(),{t,language}=useOrbitLocale();
 return <View style={styles.container}>
  <View style={styles.filters}>{(['all','reminder','suggestion','update','history'] as const).map(kind=><Pressable key={kind} accessibilityRole="tab" accessibilityState={{selected:filter===kind}} onPress={()=>onFilter(kind)} style={[styles.filter,{backgroundColor:filter===kind?colors.surface2:'transparent'}]}><Text style={{color:filter===kind?colors.accent:colors.text3}}>{t(`typedInbox.${kind}`)}</Text></Pressable>)}</View>
  {error?<View><Text accessibilityRole="alert" style={{color:colors.text}}>{error}</Text><Pressable accessibilityRole="button" onPress={onRefresh} style={styles.filter}><Text style={{color:colors.accent}}>{t('common.retry')}</Text></Pressable></View>:null}
  {!data.items.length?<Text style={[styles.empty,{color:colors.text3}]}>{t('typedInbox.empty')}</Text>:null}
  {data.items.map(n=><Pressable key={n.id} accessibilityRole="button" onPress={()=>onOpen(n.id)} style={[styles.row,{borderBottomColor:colors.border}]}>
    <View style={[styles.icon,{backgroundColor:colors.surface2}]}><Ionicons name={notificationKindIcons[n.kind]} size={21} color={n.kind==='reminder'?colors.accent:colors.text}/></View>
    <View style={styles.content}><View style={styles.meta}><Text style={{color:colors.accent,fontSize:12}}>{t(`typedInbox.${n.kind}`)}</Text>{!n.readAt&&n.disposition==='open'?<View accessibilityLabel={t('typedInbox.unreadState')} style={[styles.dot,{backgroundColor:colors.accent}]}/>:null}</View>
      <Text style={[styles.title,{color:colors.text}]}>{n.title}</Text><Text numberOfLines={2} style={{color:colors.text3,lineHeight:21}}>{n.reason}</Text>
      {n.sources[0]?.excerpt?<Text numberOfLines={2} style={{color:colors.text3,fontSize:12}}>{t('typedInbox.source')} · {n.sources[0].excerpt}</Text>:null}
      <Text style={{color:colors.text3,fontSize:12}}>{t(n.dueAt?'typedInbox.due':n.scheduledFor?'typedInbox.scheduled':'typedInbox.occurred')} · {new Date(n.dueAt??n.scheduledFor??n.occurredAt).toLocaleString(language)}</Text>
    </View>
  </Pressable>)}
  {data.nextCursor?<Pressable accessibilityRole="button" disabled={busy} onPress={onMore} style={styles.filter}><Text style={{color:colors.accent}}>{t('typedInbox.more')}</Text></Pressable>:null}
 </View>;
}
const styles=StyleSheet.create({container:{gap:8},filters:{flexDirection:'row',flexWrap:'wrap',gap:2,paddingHorizontal:12},filter:{paddingHorizontal:12,paddingVertical:13,borderRadius:18,minHeight:44},row:{flexDirection:'row',gap:12,paddingHorizontal:20,paddingVertical:18,borderBottomWidth:StyleSheet.hairlineWidth},icon:{width:38,height:38,borderRadius:12,alignItems:'center',justifyContent:'center'},content:{flex:1,minWidth:0,gap:7},title:{fontSize:16,fontWeight:'600',lineHeight:23},meta:{flexDirection:'row',alignItems:'center',gap:8},dot:{width:6,height:6,borderRadius:3},empty:{padding:32,textAlign:'center'}});

import {useEffect,useRef,useState} from 'react';
import {View} from 'react-native';
import {useOrbitAuthSession} from '../../api/AuthSessionProvider';
import {useOrbitApiBaseUrl} from '../../api/ApiBaseUrlProvider';
import {useOrbitLocale} from '../../i18n/OrbitLocaleContext';
import {useOrbitTheme} from '../../design/theme';
import {Button,Card,Segmented,Skeleton,TextField,Toggle,UiText} from '../../components/ui';
import {useInboxRequests} from '../inbox/RelationshipInboxScreen';
import type {InboxDeliveryPreferencesDTO,InboxDeliveryPreferencesInput} from '../../api/contract/notification-delivery-policy';
import {inboxDeliveryPreferencesSchema} from '../../api/schema/notification-delivery-policy';
import {quietHoursPatch} from './notifications/model';

const endpoint='/api/inbox/delivery/preferences';
type Section='general'|'secretary';
export function NotificationDeliverySettings({conversationId,section='general'}:{conversationId?:string;section?:Section}){
 const auth=useOrbitAuthSession(),server=useOrbitApiBaseUrl();
 const scope=JSON.stringify([auth.actorId,auth.cookieHeader,server.baseUrl,conversationId,section]);
 return auth.ready&&auth.signedIn&&auth.actorId&&server.ready?<ScopedDeliverySettings key={scope} actorId={auth.actorId} scope={scope} conversationId={conversationId} section={section}/>:null;
}
function ScopedDeliverySettings({actorId,scope,conversationId,section}:{actorId:string;scope:string;conversationId?:string|undefined;section:Section}){
 const {t}=useOrbitLocale(),{colors}=useOrbitTheme(),{clientGet,clientPost,isCurrent}=useInboxRequests(scope);
 const [snapshot,setSnapshot]=useState<{owner:typeof isCurrent;data:InboxDeliveryPreferencesDTO}|null>(null),[attempt,setAttempt]=useState(0),[error,setError]=useState(false),[busy,setBusy]=useState(false),[disabled,setDisabled]=useState(false);
 const [start,setStart]=useState('22:00'),[end,setEnd]=useState('07:30'),[invalidTime,setInvalidTime]=useState(false);
 const lock=useRef(false),data=isCurrent()&&snapshot?.owner===isCurrent?snapshot.data:null;
 const read=(raw:unknown)=>{const p=inboxDeliveryPreferencesSchema.safeParse(raw);return p.success&&p.data.actorId===actorId?p.data:null;};
 useEffect(()=>{const abort=new AbortController();setSnapshot(null);setBusy(false);setDisabled(false);lock.current=false;
  void clientGet(endpoint,{signal:abort.signal}).then(r=>{if(abort.signal.aborted||!isCurrent())return;if(!r.success&&r.status===404){setDisabled(true);return;}const next=r.success?read(r.data):null;if(next){setSnapshot({owner:isCurrent,data:next});setError(false);}else setError(true);}).catch(()=>{if(!abort.signal.aborted&&isCurrent())setError(true);});
  return()=>abort.abort();
 },[actorId,clientGet,isCurrent,attempt]);
 useEffect(()=>{if(data){setStart(data.quietStart??'22:00');setEnd(data.quietEnd??'07:30');setInvalidTime(false);}},[data?.revision]);
 async function change(patch:Omit<InboxDeliveryPreferencesInput,'expectedRevision'>){if(!data||lock.current||!isCurrent())return;lock.current=true;setBusy(true);
  try{const r=await clientPost(endpoint,{...patch,expectedRevision:data.revision});if(!isCurrent())return;const next=r.success?read(r.data):null;if(next){setSnapshot({owner:isCurrent,data:next});setError(false);}else{setError(true);setAttempt(v=>v+1);}}
  catch{if(isCurrent())setError(true);}finally{if(isCurrent()){lock.current=false;setBusy(false);}}
 }
 const saveHours=()=>{const patch=quietHoursPatch(start,end);if(!patch){setInvalidTime(true);return;}setInvalidTime(false);void change(patch);};
 if(disabled)return <UiText style={{color:colors.ink3Text}}>{t('notifications.error')}</UiText>;
 if(!data)return error?<View style={{gap:10}}><UiText accessibilityRole="alert" style={{color:colors.coralText}}>{t('notifications.error')}</UiText><Button label={t('notifications.refresh')} onPress={()=>setAttempt(v=>v+1)}/></View>:<Skeleton onRetry={()=>setAttempt(v=>v+1)}/>;
 const row=(key:string,label:string,on:boolean,patch:Omit<InboxDeliveryPreferencesInput,'expectedRevision'>,hint?:string)=><View key={key} style={{minHeight:conversationId?54:section==='secretary'?66:58,flexDirection:'row',alignItems:'center',gap:12,paddingVertical:9}}>
  <View style={{flex:1,gap:2}}><UiText style={{color:colors.ink,fontSize:14,fontWeight:'600'}}>{label}</UiText>{hint?<UiText style={{color:colors.ink3Text,fontSize:12,lineHeight:18}}>{hint}</UiText>:null}</View>
  <Toggle value={on} disabled={busy} accessibilityLabel={label} onValueChange={()=>void change(patch)}/>
 </View>;
 if(conversationId){const muted=data.mutedConversationIds.includes(conversationId);return <Card variant="flat">{row('mute',t('notifications.mute'),muted,{muteConversation:{conversationId,muted:!muted}})}</Card>;}
 if(section==='secretary')return <View style={{gap:16}}>
  <Card>{row('deadline',t('notifications.deadline'),data.secretaryDeadline!==false,{secretaryDeadline:data.secretaryDeadline===false},t('notifications.deadlineHint'))}
   {row('pick',t('notifications.pick'),data.secretaryPick!==false,{secretaryPick:data.secretaryPick===false},t('notifications.pickHint'))}</Card>
  <Card variant="flat"><UiText style={{color:colors.ink,fontWeight:'700'}}>{t('notifications.dailyCap')} · {data.dailyCap??3}</UiText><UiText style={{color:colors.ink3Text,lineHeight:20,marginTop:4}}>{t('notifications.sharedCap')}</UiText></Card>
  <UiText style={{color:colors.ink3Text,lineHeight:20}}>{t('notifications.noSend')}</UiText>
  {error?<UiText accessibilityRole="alert" style={{color:colors.coralText}}>{t('notifications.error')}</UiText>:null}
 </View>;
 return <View style={{gap:16}}>
  <UiText style={{color:colors.ink3Text,lineHeight:20}}>{t('notifications.subtitle')}</UiText>
  <Card><UiText accessibilityRole="header" style={{color:colors.ink,fontWeight:'700',fontSize:15,marginBottom:4}}>{t('notifications.channels')}</UiText>
   {row('message',t('notifications.message'),data.messageEnabled,{messageEnabled:!data.messageEnabled})}
   {row('reminder',t('notifications.reminder'),data.reminderEnabled,{reminderEnabled:!data.reminderEnabled})}
   {row('suggestion',t('notifications.suggestion'),data.suggestionEnabled,{suggestionEnabled:!data.suggestionEnabled})}
   {row('update',t('notifications.update'),data.updateEnabled,{updateEnabled:!data.updateEnabled})}</Card>
  <Card><UiText accessibilityRole="header" style={{color:colors.ink,fontWeight:'700',fontSize:15,marginBottom:12}}>{t('notifications.dailyCap')}</UiText>
   <Segmented segments={[1,2,3].map(value=>({key:String(value),label:String(value)}))} value={String(data.dailyCap??3)} accessibilityLabel={t('notifications.dailyCap')} onChange={key=>void change({dailyCap:Number(key) as 1|2|3})}/>
   <UiText style={{color:colors.ink3Text,fontSize:12,lineHeight:18,marginTop:12}}>{t('notifications.capHint')}</UiText></Card>
  <Card><UiText accessibilityRole="header" style={{color:colors.ink,fontWeight:'700',fontSize:15}}>{t('notifications.quiet')}</UiText>
   {row('quiet',t('notifications.quiet'),data.quietHoursEnabled,{quietHoursEnabled:!data.quietHoursEnabled},t('notifications.quietHint'))}
   <View style={{flexDirection:'row',gap:10,marginTop:8}}><View style={{flex:1}}><TextField label={t('notifications.start')} value={start} onChangeText={setStart} autoCapitalize="none" keyboardType="numbers-and-punctuation" presentation="kit" /></View>
    <View style={{flex:1}}><TextField label={t('notifications.end')} value={end} onChangeText={setEnd} autoCapitalize="none" keyboardType="numbers-and-punctuation" presentation="kit" /></View></View>
   {invalidTime?<UiText accessibilityRole="alert" style={{color:colors.coralText,marginTop:8}}>{t('notifications.invalidTime')}</UiText>:null}
   <View style={{marginTop:12}}><Button label={t('notifications.saveTime')} disabled={busy} onPress={saveHours}/></View>
   {row('meeting',t('notifications.meeting'),data.meetingException!==false,{meetingException:data.meetingException===false},t('notifications.meetingHint'))}</Card>
  <Card><UiText accessibilityRole="header" style={{color:colors.ink,fontWeight:'700',fontSize:15,marginBottom:12}}>{t('notifications.lock')}</UiText>
   <Segmented segments={[{key:'private',label:t('notifications.private')},{key:'full',label:t('notifications.full')}]} value={data.lockScreenContent} accessibilityLabel={t('notifications.lock')} onChange={value=>void change({lockScreenContent:value})}/></Card>
  {error?<View style={{gap:8}}><UiText accessibilityRole="alert" style={{color:colors.coralText}}>{t('notifications.error')}</UiText><Button label={t('notifications.refresh')} onPress={()=>setAttempt(v=>v+1)}/></View>:null}
 </View>;
}

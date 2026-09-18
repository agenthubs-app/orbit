import {useEffect,useRef,useState} from 'react';
import {Pressable,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {randomUUID} from 'expo-crypto';
import {useLocalSearchParams,useRouter,type Href} from 'expo-router';
import {useOrbitAuthSession} from '../../api/AuthSessionProvider';
import {useOrbitApiBaseUrl} from '../../api/ApiBaseUrlProvider';
import type {InboxNotificationDTO,InboxNotificationAction,InboxNotificationActionInput} from '../../api/contract/inbox-notifications';
import {notificationDetailData,notificationDetailPath} from '../../api/inbox-notifications';
import {emitMessageStateInvalidation} from '../../api/message-state';
import {AppScreen} from '../../components/AppScreen';
import {useOrbitLocale} from '../../i18n/OrbitLocaleContext';
import {useOrbitTheme} from '../../design/theme';
import {useInboxRequests} from './RelationshipInboxScreen';
import {notificationKindIcons} from './NotificationInboxList';
export function NotificationDetailScreen(){
 const auth=useOrbitAuthSession(),server=useOrbitApiBaseUrl(),params=useLocalSearchParams<{id?:string|string[]}>();const id=Array.isArray(params.id)?params.id[0]??'':params.id??'';
 const key=JSON.stringify([server.baseUrl,auth.actorId,auth.cookieHeader,id]);
 return auth.actorId?<NotificationDetail key={key} actorId={auth.actorId} id={id} scopeKey={key}/>:null;
}
function NotificationDetail({actorId,id,scopeKey}:{actorId:string;id:string;scopeKey:string}) {
 const {t,language}=useOrbitLocale(),{colors}=useOrbitTheme(),router=useRouter(),{clientGet,clientPost,isCurrent}=useInboxRequests(scopeKey);
 const [snapshot,setSnapshot]=useState<{scope:typeof isCurrent;record:InboxNotificationDTO}|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[busy,setBusy]=useState(false);
 const pending=useRef<InboxNotificationActionInput|null>(null),lock=useRef(false);
 const record=isCurrent()&&snapshot?.scope===isCurrent?snapshot.record:null;
 useEffect(()=>{if(!isCurrent())return;setSnapshot(null);const controller=new AbortController();void clientGet(notificationDetailPath(id)+'?language='+language,{signal:controller.signal}).then(result=>{if(!isCurrent()||controller.signal.aborted)return;const n=result.success?notificationDetailData(result.data,actorId,id):null;if(n){setSnapshot({scope:isCurrent,record:n});setError('');}else setError(t('typedInbox.unavailable'));}).catch(()=>{if(isCurrent()&&!controller.signal.aborted)setError(t('typedInbox.error'));});return()=>controller.abort();},[id,actorId,clientGet,isCurrent,attempt,language]);
 async function act(action:InboxNotificationAction){
  if(!record||lock.current||!isCurrent())return;const request=pending.current??{action,expectedRevision:record.revision,idempotencyKey:randomUUID(),...(action==='snooze'?{scheduledFor:new Date(Date.now()+3600000).toISOString()}:{})};pending.current=request;lock.current=true;setBusy(true);
  try{const result=await clientPost(notificationDetailPath(id)+'/actions?language='+language,request);if(!isCurrent())return;
    const n=result.success?notificationDetailData((result.data as {notification?:unknown})?.notification,actorId,id):null;
    if(!n){if(!result.success&&[404,409,410].includes(result.status)){pending.current=null;setSnapshot(null);setAttempt(n=>n+1);}throw new Error();}
    pending.current=null;setSnapshot({scope:isCurrent,record:n});setError('');emitMessageStateInvalidation();
  }catch{if(isCurrent())setError(t('typedInbox.conflict'));}finally{lock.current=false;if(isCurrent())setBusy(false);}
 }
 const stateKeys={open:'openState',handled:'handledState',dismissed:'dismissedState',accepted:'acceptedState',expired:'expiredState',archived:'archivedState'} as const;
 return <AppScreen title={t('typedInbox.detail')} backLabel={t('inbox.back')}>
  {error?<View><Text accessibilityRole="alert" style={{color:colors.text}}>{error}</Text><Pressable accessibilityRole="button" onPress={()=>pending.current?void act(pending.current.action):setAttempt(n=>n+1)} style={{padding:16,minHeight:44}}><Text style={{color:colors.accent}}>{t(pending.current?'typedInbox.retry':'common.retry')}</Text></Pressable></View>:null}
  {!record&&!error?<Text style={{color:colors.text3}}>{t('common.loading')}</Text>:null}
  {record?<View style={{gap:18}}>
    <View style={{flexDirection:'row',alignItems:'center',gap:8}}><Ionicons name={notificationKindIcons[record.kind]} color={colors.accent} size={24}/><Text style={{color:colors.accent}}>{t(`typedInbox.${record.kind}`)}</Text></View>
    <Text accessibilityRole="header" style={{color:colors.text,fontSize:23,lineHeight:32,fontWeight:'700'}}>{record.title}</Text><Text style={{color:colors.text,lineHeight:24,fontSize:16}}>{record.reason}</Text>
    <Text style={{color:colors.text3}}>{t(`typedInbox.${stateKeys[record.disposition]}`)} · {t(record.readAt?'typedInbox.readState':'typedInbox.unreadState')}</Text>
    {record.dueAt?<Text style={{color:colors.text3}}>{t('typedInbox.due')} · {new Date(record.dueAt).toLocaleString(language)}</Text>:null}
    {record.scheduledFor?<Text style={{color:colors.text3}}>{t('typedInbox.scheduled')} · {new Date(record.scheduledFor).toLocaleString(language)}</Text>:null}
    <Text style={{color:colors.text3}}>{t('typedInbox.occurred')} · {new Date(record.occurredAt).toLocaleString(language)}</Text>
    <View style={{backgroundColor:colors.surface2,padding:16,borderRadius:14,gap:10}}><Text style={{color:colors.text,fontWeight:'600'}}>{t('typedInbox.source')}</Text>{record.sources.map((s,i)=><View key={i} style={{gap:6}}>{s.excerpt?<Text style={{color:colors.text,lineHeight:23}}>{s.excerpt}</Text>:null}<Text style={{color:colors.text3}}>{new Date(s.occurredAt).toLocaleString(language)}</Text></View>)}</View>
    {record.target.href&&record.target.status==='available'?<Pressable accessibilityRole="button" onPress={()=>router.push(record.target.href as Href)} style={{padding:16,borderRadius:12,backgroundColor:colors.accent}}><Text style={{color:colors.onAccent,textAlign:'center'}}>{t('typedInbox.open')}</Text></Pressable>:null}
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{record.actions.filter(a=>a!=='read'||!record.readAt).map(action=><Pressable key={action} accessibilityRole="button" disabled={busy||!!pending.current} onPress={()=>void act(action)} style={{padding:14,borderRadius:12,backgroundColor:colors.surface2,minHeight:44}}><Text style={{color:colors.text}}>{t(`typedInbox.${action}`)}</Text></Pressable>)}</View>
    {busy?<Text style={{color:colors.text3}}>{t('typedInbox.pending')}</Text>:null}
  </View>:null}
 </AppScreen>;
}

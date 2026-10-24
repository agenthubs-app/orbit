import * as Notifications from 'expo-notifications';
import {useEffect,useRef,useState} from 'react';
import {AppState,Linking,Platform,View} from 'react-native';
import {useOrbitAuthSession} from '../../../api/AuthSessionProvider';
import {Card,Button,Toggle,UiText} from '../../../components/ui';
import {useOrbitTheme} from '../../../design/theme';
import {useOrbitApiClient} from '../../../hooks/useOrbitApiClient';
import {useOrbitLocale} from '../../../i18n/OrbitLocaleContext';
import {isPushNotificationsOptedIn,revokeRegisteredPushDevice,setPushNotificationsOptIn} from '../../../notifications/push-device-session';
import {changeNotificationOptIn,effectiveNotificationOptIn} from './notification-permission-control';

export function PushPermissionSettings(){
 const auth=useOrbitAuthSession();
 if(!auth.ready||!auth.signedIn||!auth.actorId||Platform.OS==='web')return null;
 return <ScopedPushPermissionSettings key={`${auth.actorId}:${auth.notificationSessionRevision}`} />;
}

function ScopedPushPermissionSettings(){
 const {t}=useOrbitLocale(),{colors}=useOrbitTheme(),client=useOrbitApiClient();
 const [optedIn,setOptedIn]=useState(false),[permission,setPermission]=useState<'granted'|'denied'|'undetermined'|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(false),[revokeFailed,setRevokeFailed]=useState(false);
 const live=useRef(true),lock=useRef(false),revokeFailedRef=useRef(false);
 useEffect(()=>{
  live.current=true;
  const refresh=async()=>{
   try{
    const [opted,result]=await Promise.all([isPushNotificationsOptedIn(),Notifications.getPermissionsAsync()]);
    const status=result.status==='granted'?'granted':result.status==='denied'?'denied':'undetermined';
    if(live.current&&!lock.current){setOptedIn(effectiveNotificationOptIn(opted,status));setPermission(status);if(!revokeFailedRef.current)setError(false);}
   }catch{if(live.current)setError(true);}
  };
  void refresh();
  const subscription=AppState.addEventListener('change',state=>{if(state==='active')void refresh();});
  return()=>{live.current=false;subscription.remove();};
 },[]);
 async function change(enabled:boolean){
  if(lock.current)return;lock.current=true;setBusy(true);setError(false);
  try{
   const result=await changeNotificationOptIn(enabled,{
    getPermission:async()=>permission??'undetermined',
    requestPermission:async()=>{
     const requested=await Notifications.requestPermissionsAsync();
     return requested.status==='granted'?'granted':requested.status==='denied'?'denied':'undetermined';
    },
    setOptIn:async value=>{if(!live.current)throw new Error('Inactive account');await setPushNotificationsOptIn(value);},
    revoke:()=>revokeRegisteredPushDevice({client}),
   });
   if(!live.current)return;
   setOptedIn(result==='enabled');
   if(result==='enabled')setPermission('granted');
   if(result==='denied')setPermission('denied');
   revokeFailedRef.current=result==='revoke-failed';setRevokeFailed(revokeFailedRef.current);
   if(result==='revoke-failed')setError(true);
  }catch{if(live.current)setError(true);}finally{lock.current=false;if(live.current)setBusy(false);}
 }
 return <Card>
  <View style={{flexDirection:'row',alignItems:'center',gap:12,minHeight:60}}>
   <View style={{flex:1,gap:3}}><UiText style={{color:colors.ink,fontWeight:'700'}}>{t('notifications.pushOptIn')}</UiText><UiText style={{color:colors.ink3Text,fontSize:14,lineHeight:21}}>{t('notifications.pushOptInHint')}</UiText></View>
   <Toggle value={optedIn} disabled={busy||permission===null} accessibilityLabel={t('notifications.pushOptIn')} onValueChange={value=>void change(value)}/>
  </View>
  {permission==='denied'?<View style={{gap:8,marginTop:8}}><UiText style={{color:colors.ink3Text}}>{t('notifications.permissionDenied')}</UiText><Button label={t('notifications.openSystemSettings')} onPress={()=>void Linking.openSettings().catch(()=>setError(true))}/></View>:null}
  {error?<View style={{gap:8,marginTop:8}}><UiText accessibilityRole="alert" style={{color:colors.coralText}}>{t(revokeFailed?'notifications.revokeError':'notifications.pushError')}</UiText>{revokeFailed?<Button label={t('notifications.retryRevoke')} disabled={busy} onPress={()=>void change(false)}/>:null}</View>:null}
 </Card>;
}

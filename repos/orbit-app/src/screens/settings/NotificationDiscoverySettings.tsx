import {DiscoverySettingsContent} from './DiscoverySettingsContent';
import {useEffect,useRef,useState} from 'react';
import {Pressable,Text,View} from 'react-native';
import {useOrbitAuthSession} from '../../api/AuthSessionProvider';
import {useOrbitApiBaseUrl} from '../../api/ApiBaseUrlProvider';
import {useOrbitLocale} from '../../i18n/OrbitLocaleContext';
import {useOrbitTheme} from '../../design/theme';
import {useInboxRequests} from '../inbox/RelationshipInboxScreen';
import type {NotificationDiscoveryStatusDTO} from '../../api/contract/notification-discovery';
import {notificationDiscoveryStatusSchema} from '../../api/schema/notification-discovery';
const endpoint='/api/inbox/discovery/preferences';
type Setting='enabled'|'messageAnalysisEnabled';
export function NotificationDiscoverySettings(){const auth=useOrbitAuthSession(),server=useOrbitApiBaseUrl();const scope=JSON.stringify([auth.actorId,auth.cookieHeader,server.baseUrl]);return auth.ready&&auth.signedIn&&auth.actorId&&server.ready?<ScopedDiscoverySettings key={scope} actorId={auth.actorId} scope={scope}/>:null;}
function ScopedDiscoverySettings({actorId,scope}:{actorId:string;scope:string}){
 const {t,language}=useOrbitLocale(),{clientGet,clientPost,isCurrent}=useInboxRequests(scope),{colors}=useOrbitTheme();
 const [snapshot,setSnapshot]=useState<{owner:typeof isCurrent;data:NotificationDiscoveryStatusDTO}|null>(null),[attempt,setAttempt]=useState(0),[error,setError]=useState(''),[disabled,setDisabled]=useState(false),[busy,setBusy]=useState(false);const lock=useRef(false);
 const data=isCurrent()&&snapshot?.owner===isCurrent?snapshot.data:null;
 const read=(raw:unknown)=>{const parsed=notificationDiscoveryStatusSchema.safeParse(raw);return parsed.success&&parsed.data.preferences.actorId===actorId?parsed.data:null;};
 useEffect(()=>{const controller=new AbortController();setSnapshot(null);setDisabled(false);setBusy(false);lock.current=false;if(!isCurrent())return;void clientGet(endpoint,{signal:controller.signal}).then(r=>{if(controller.signal.aborted||!isCurrent())return;if(!r.success&&r.status===404){setDisabled(true);return;}const next=r.success?read(r.data):null;if(next){setSnapshot({owner:isCurrent,data:next});setError('');}else setError(t('discovery.error'));}).catch(()=>{if(isCurrent()&&!controller.signal.aborted)setError(t('discovery.error'));});return()=>controller.abort();},[actorId,clientGet,isCurrent,attempt]);
 async function change(key:Setting,value:boolean){if(!data||lock.current||!isCurrent())return;lock.current=true;setBusy(true);try{const r=await clientPost(endpoint,{[key]:value,expectedRevision:data.preferences.revision,language,timeZone:data.preferences.timeZone});if(!isCurrent())return;const next=r.success?read(r.data):null;if(next){setSnapshot({owner:isCurrent,data:next});setError('');}else{setError(t('discovery.error'));setAttempt(n=>n+1);}}catch{if(isCurrent())setError(t('discovery.error'));}finally{if(isCurrent()){lock.current=false;setBusy(false);}}}
 if(disabled)return null;
 return data?<DiscoverySettingsContent data={data} busy={busy} error={error} onChange={(key,value)=>void change(key,value)} onRefresh={()=>setAttempt(n=>n+1)}/>:error?<Pressable accessibilityRole="button" onPress={()=>setAttempt(n=>n+1)} style={{padding:16}}><Text accessibilityRole="alert" style={{color:colors.text}}>{error}</Text><Text style={{color:colors.accent}}>{t('common.retry')}</Text></Pressable>:null;
}

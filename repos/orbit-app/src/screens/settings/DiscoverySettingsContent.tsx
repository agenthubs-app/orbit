import {Pressable,Text,View} from 'react-native';
import {useOrbitLocale} from '../../i18n/OrbitLocaleContext';
import {useOrbitTheme} from '../../design/theme';
import type {NotificationDiscoveryStatusDTO} from '../../api/contract/notification-discovery';
type Setting='enabled'|'messageAnalysisEnabled';
export function DiscoverySettingsContent({data,busy,error,onChange,onRefresh}:{data:NotificationDiscoveryStatusDTO;busy:boolean;error:string;onChange:(key:Setting,value:boolean)=>void;onRefresh:()=>void}){
 const {t}=useOrbitLocale(),{colors}=useOrbitTheme();
 const stale=data.preferences.enabled&&(!data.lastRoundAt||Date.now()-Date.parse(data.lastRoundAt)>180000);
 return <View style={{gap:12,paddingVertical:18,borderBottomWidth:1,borderBottomColor:colors.border}}>
  <Text accessibilityRole="header" style={{color:colors.text,fontSize:17,fontWeight:'600'}}>{t('discovery.title')}</Text>
  <Text style={{color:colors.text3,lineHeight:22}}>{t('discovery.hint')}</Text>
  {(['enabled','messageAnalysisEnabled'] as const).map(key=><Pressable key={key} accessibilityRole="switch" aria-checked={data.preferences[key]} accessibilityState={{checked:data.preferences[key],disabled:busy}} accessibilityLabel={t(key==='enabled'?'discovery.enabled':'discovery.messages')} disabled={busy} onPress={()=>onChange(key,!data.preferences[key])} style={{minHeight:48,paddingVertical:12,flexDirection:'row',gap:12,alignItems:'center'}}>
   <Text style={{flex:1,color:colors.text,fontSize:15}}>{t(key==='enabled'?'discovery.enabled':'discovery.messages')}</Text><Text style={{color:colors.accent}}>{t(data.preferences[key]?'discovery.on':'discovery.off')}</Text>
  </Pressable>)}
  <Text style={{color:colors.text3,lineHeight:22}}>{t('discovery.sources')}</Text>
  {data.lastError||stale?<Text accessibilityRole="alert" style={{color:colors.text}}>{t('discovery.unavailable')}</Text>:null}
  <Text style={{color:colors.text3}}>{t('discovery.queued')} · {(data.counts.queued??0)+(data.counts.running??0)}　{t('discovery.failed')} · {data.counts.failed??0}</Text>
  {error?<Text accessibilityRole="alert" style={{color:colors.text}}>{error}</Text>:null}
  <Pressable accessibilityRole="button" onPress={onRefresh} disabled={busy} style={{minHeight:44,justifyContent:'center'}}><Text style={{color:colors.accent}}>{t('discovery.refresh')}</Text></Pressable>
 </View>;
}

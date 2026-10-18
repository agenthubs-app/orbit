import {View} from 'react-native';
import {Card,Toggle,UiText,Button} from '../../../components/ui';
import {useOrbitLocale} from '../../../i18n/OrbitLocaleContext';
import {useOrbitTheme} from '../../../design/theme';
import type {NotificationDiscoveryStatusDTO} from '../../../api/contract/notification-discovery';

type Setting='enabled'|'messageAnalysisEnabled';
export function DiscoverySettingsBlock({data,busy,error,onChange,onRefresh}:{data:NotificationDiscoveryStatusDTO;busy:boolean;error:string;onChange:(key:Setting,value:boolean)=>void;onRefresh:()=>void}){
 const {t}=useOrbitLocale(),{colors}=useOrbitTheme();
 const stale=data.preferences.enabled&&(!data.lastRoundAt||Date.now()-Date.parse(data.lastRoundAt)>180000);
 return <Card><View style={{gap:8}}><UiText accessibilityRole="header" style={{color:colors.ink,fontWeight:'700',fontSize:15}}>{t('discovery.title')}</UiText>
  <UiText style={{color:colors.ink3Text,lineHeight:20}}>{t('discovery.hint')}</UiText></View>
  {(['enabled','messageAnalysisEnabled'] as const).map(key=>{const label=t(key==='enabled'?'discovery.enabled':'discovery.messages');return <View key={key} style={{minHeight:54,flexDirection:'row',alignItems:'center',gap:12,paddingVertical:9}}><UiText style={{flex:1,color:colors.ink}}>{label}</UiText><Toggle value={data.preferences[key]} disabled={busy} accessibilityLabel={label} onValueChange={value=>onChange(key,value)}/></View>;})}
  <UiText style={{color:colors.ink3Text,lineHeight:20}}>{t('discovery.sources')}</UiText>
  {data.lastError||stale?<UiText accessibilityRole="alert" style={{color:colors.coralText,marginTop:8}}>{t('discovery.unavailable')}</UiText>:null}
  <UiText style={{color:colors.ink3Text,marginTop:8}}>{t('discovery.queued')} · {(data.counts.queued??0)+(data.counts.running??0)}　{t('discovery.failed')} · {data.counts.failed??0}</UiText>
  {error?<UiText accessibilityRole="alert" style={{color:colors.coralText,marginTop:8}}>{error}</UiText>:null}
  <View style={{marginTop:12}}><Button label={t('discovery.refresh')} onPress={onRefresh} disabled={busy}/></View>
 </Card>;
}

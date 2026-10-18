import {useRouter} from 'expo-router';
import {View} from 'react-native';
import {AppScreen} from '../../../components/AppScreen';
import {Button,UiText} from '../../../components/ui';
import {useOrbitLocale} from '../../../i18n/OrbitLocaleContext';
import {useOrbitTheme} from '../../../design/theme';
import {NotificationDeliverySettings} from '../NotificationDeliverySettings';
import {NotificationDiscoverySettings} from '../NotificationDiscoverySettings';
import {PushPermissionSettings} from './PushPermissionSettings';

export function NotificationSettingsScreen(){
 const {t}=useOrbitLocale();
 return <AppScreen inset="kit" title={t('notifications.title')}>
  <View style={{gap:20,paddingBottom:24}}><PushPermissionSettings/><NotificationDeliverySettings/><NotificationDiscoverySettings/></View>
 </AppScreen>;
}

export function NotificationSecretarySettingsScreen(){
 const {t}=useOrbitLocale(),{colors}=useOrbitTheme(),router=useRouter();
 return <AppScreen inset="kit" title={t('notifications.secretaryTitle')}>
  <View style={{gap:18,paddingBottom:24}}>
   <UiText style={{color:colors.ink3Text,lineHeight:20}}>{t('notifications.secretarySubtitle')}</UiText>
   <NotificationDeliverySettings section="secretary"/>
   <Button label={t('notifications.goQuiet')} onPress={()=>router.push('/settings/notifications')}/>
  </View>
 </AppScreen>;
}

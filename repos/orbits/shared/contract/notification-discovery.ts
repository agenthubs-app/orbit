export interface NotificationDiscoveryPreferencesDTO {
 actorId:string;
 enabled:boolean;
 messageAnalysisEnabled:boolean;
 timeZone:string;
 language:'zh'|'en'|'ja';
 revision:number;
 generation:number;
 enabledSince:string;
 messageEnabledSince:string;
 updatedAt:string;
}
export interface NotificationDiscoveryStatusDTO {
 preferences:NotificationDiscoveryPreferencesDTO;
 lastRoundAt:string|null;
 lastError:string|null;
 counts:Record<string,number>;
 sources:{email:'unavailable';calendar:'unavailable'};
}
export interface NotificationDiscoveryPreferencesInput {
 expectedRevision:number;
 enabled?:boolean;
 messageAnalysisEnabled?:boolean;
 timeZone?:string;
 language?:'zh'|'en'|'ja';
}

import { useState } from "react";
import { Pressable,Text,TextInput,View } from "react-native";
import { useContactCardPages } from "../../hooks/useContactCardPages";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { useOrbitTheme } from "../../design/theme";

/** Mounted only on explicit selection; searches all owned contacts by pages. */
export function TaskContactPicker({onChoose}:{onChoose:(id:string)=>void}){
  const [query,setQuery]=useState("");
  const pages=useContactCardPages({query},"task-contact-picker");
  const {language}=useOrbitLocale();
  const {colors}=useOrbitTheme();
  const labelStyle={color:colors.ink};
  const text=(zh:string,en:string,ja:string)=>language==="zh"?zh:language==="ja"?ja:en;
  return <View>
    <TextInput accessibilityLabel={text("搜索联系人","Search contacts","連絡先を検索")} value={query} onChangeText={setQuery} maxLength={240} style={{minHeight:44,padding:10,borderWidth:1,borderColor:colors.border,color:colors.ink,backgroundColor:colors.surface}}/>
    {pages.page?.items.map(item=><Pressable key={item.id} accessibilityRole="button" onPress={()=>onChoose(item.id)} style={{minHeight:44,justifyContent:"center"}}><Text style={labelStyle}>{[item.displayName,item.organization].filter(Boolean).join(" · ")}</Text></Pressable>)}
    {pages.state.kind==="failure"||pages.state.kind==="offline"?<Text style={labelStyle} accessibilityRole="alert">{text("联系人读取失败，请重试。","Unable to load contacts. Retry.","連絡先を読み込めません。再試行してください。")}</Text>:null}
    {pages.state.kind==="loading"?<Text style={labelStyle}>{text("正在读取…","Loading…","読み込み中…")}</Text>:null}
    {pages.page?.items.length===0?<Text style={labelStyle}>{text("没有匹配联系人","No matching contacts","該当する連絡先はありません")}</Text>:null}
    {pages.page?.hasMore?<Pressable accessibilityRole="button" onPress={pages.nextPage} style={{minHeight:44}}><Text style={labelStyle}>{text("下一页联系人","Next contact page","次の連絡先")}</Text></Pressable>:null}
    {!pages.isFirstPage?<Pressable accessibilityRole="button" onPress={pages.firstPage} style={{minHeight:44}}><Text style={labelStyle}>{text("返回联系人第一页","First contact page","最初の連絡先")}</Text></Pressable>:null}
  </View>;
}

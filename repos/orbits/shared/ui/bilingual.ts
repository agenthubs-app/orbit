/**
 * 双语 UI 文案的小工具。
 *
 * Orbit 的部分界面同时展示中文和英文。这里集中拼接格式，
 * 避免各个组件手写不同的 “中文 / English” 形式。
 */
export function bilingualText(chinese: string, english: string): string {
  return `${chinese} / ${english}`;
}

export function bilingualPair(input: {
  chinese: string;
  english: string;
}): string {
  // 对象参数版本适合从 view model 直接传递多语言字段。
  return bilingualText(input.chinese, input.english);
}

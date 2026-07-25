import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// 渲染测试的统一入口。
//
// 组件经 react-native-web 渲染成 HTML 字符串再断言，验证的是「这棵树真的能渲染出来、
// 渲染出的内容是什么」——源码正则断言做不到这一点：改了组件结构、传错了 prop、
// 条件分支写反了，正则照样通过。
//
// 需要配合 tests/helpers/register-render-hooks.mjs 使用（npm test 已经带上）。
// 当前是静态渲染，能断言结构与文案，还不能触发交互。
export function renderToHtml(element: ReactElement): string {
  return renderToStaticMarkup(element);
}

// react-native-web 会把文本渲染进 div/span，断言时通常只关心「页面上有没有这句话」。
export function renderedText(element: ReactElement): string {
  return renderToHtml(element)
    .replace(/<[^>]*>/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

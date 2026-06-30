"use client";

import { useEffect } from "react";

export function OrbitVisualFreezeRuntime() {
  useEffect(() => {
    // orbitVisualSeed 是截图/视觉回归测试开关；没有该参数时不影响正常交互动画。
    const params = new URLSearchParams(window.location.search);
    if (!params.get("orbitVisualSeed")) return;
    // 避免多次挂载时重复插入全局 freeze style。
    if (document.querySelector("style[data-orbit-visual-freeze]")) return;

    const style = document.createElement("style");
    style.dataset.orbitVisualFreeze = "true";
    // 禁用动画、过渡和光标闪烁，让截图输出可复现。
    style.textContent = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}";
    document.head.appendChild(style);

    return () => {
      // 组件卸载时清理注入的 style，避免影响后续非冻结页面。
      style.remove();
    };
  }, []);

  return null;
}

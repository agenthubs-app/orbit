/**
 * 既有设置面板（外观 / 记忆 / 反馈 / 自动化 / 执行）在新个人中心壳里的挂载点。
 * 皮肤 <style> 原样搬自旧 settings/page.tsx，作用域 [data-orbit-real-page=settings] → .pc-legacy-settings，
 * 保证五个模块配色不回退。任务 5 的 profile-settings.tsx 在设计三张卡之后挂本组件。
 */
"use client";

import { OrbitAgentAutomationSettings } from "../../settings/orbit-agent-automation-settings";
import { OrbitAgentExecutionSettings } from "../../settings/orbit-agent-execution-settings";
import { OrbitAgentMemorySettings } from "../../settings/orbit-agent-memory-settings";
import { OrbitAgentFeedbackSettings } from "../../settings/orbit-agent-feedback-settings";
import { OrbitAppearanceSettings } from "../../settings/orbit-appearance-settings";

export function ProfileLegacySettings() {
  return (
    <div className="pc-legacy-settings">
      <style>{`
        /* Orbit_0918 批次 2b：设置页整体换肤。变量在页作用域内重定义，
           五个设置模块零改动继承 0918 靛蓝体系（沿用批次 3d 的无引号选择器约定）。 */
        .pc-legacy-settings{
          color-scheme:light;
          --ink:#0E1225;--text:#0E1225;--text-2:#3B3F7A;--text-3:#6B6F99;--text-4:#9FA3C4;
          --bg:#FBFBFE;--bg-soft:#F7F7FD;--bg-sunken:#F1F1FA;
          --surface:#FFFFFF;--surface-2:#F7F7FD;--surface-3:#ECEEFB;
          --border:#E8E9F6;--border-2:#DDDEFA;--border-strong:#B9BCEB;--hairline:#F1F1FA;
          --accent:#4B4FC7;--accent-hover:#2E3270;--accent-soft:#ECEEFB;--accent-ring:#B9BCEB;
          --on-accent:#FFFFFF;
          background:#FBFBFE;color:#0E1225;
        }
        .pc-legacy-settings .eyebrow{color:#6B6F99}
        .pc-legacy-settings .settings-head h1{font-family:'Noto Serif SC','Songti SC','SimSun',serif;font-weight:900;letter-spacing:-0.02em;color:#0E1225}
        .pc-legacy-settings .card{background:#FFFFFF;border:1px solid #E8E9F6;border-radius:18px;box-shadow:none}
        .pc-legacy-settings .card h2{font-family:'Noto Serif SC','Songti SC','SimSun',serif;font-weight:900;letter-spacing:-0.02em}
        .pc-legacy-settings .btn-primary{background:#0E1225;border-color:#0E1225;box-shadow:none;color:#FFFFFF}
        .pc-legacy-settings .btn-primary:hover{background:#2E3270;border-color:#2E3270}
        .pc-legacy-settings .btn-ghost{background:#FFFFFF;border-color:#DDDEFA;color:#3B3F7A}
        .pc-legacy-settings .btn-ghost:hover{border-color:#B9BCEB;color:#2E3270}
        .pc-legacy-settings .chip{border-color:#DDDEFA;color:#3B3F7A;background:#FFFFFF}
      `}</style>
      <OrbitAppearanceSettings />
      <OrbitAgentMemorySettings />
      <OrbitAgentFeedbackSettings />
      <OrbitAgentAutomationSettings />
      <OrbitAgentExecutionSettings />
    </div>
  );
}

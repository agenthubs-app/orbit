/**
 * W0053：文件／活动导入工作区的样式（只在导入页渲染）。全部限定在 network 页面根下；按钮走 `.btn` 体系并用两个 class
 * 的选择器，避开 [data-orbit-real-page] 对 button／select 的重置；链接自带字色与 :hover（0918 anchor-colour 门禁）。
 * 调色板沿用 network-shell 的导入屏（#0E1225 墨色、#4B4FC7 主色、#DDDEFA 边框、#8A6420 提示色）。
 */
const R = '[data-orbit-real-page="network"]';

export const NETWORK_IMPORT_FLOW_CSS = `
${R} .nwi-drop { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; padding: 22px; border: 1.5px dashed #B9BCEB; border-radius: 14px; background: #F7F7FD; }
${R} .nwi-drop-title { margin: 0; font-size: 15px; font-weight: 600; color: #0E1225; }
${R} .nwi-drop-hint { margin: 0; font-size: 13px; color: #6B6F99; line-height: 1.6; }
${R} .nwi-file { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
${R} .btn.nwi-primary, ${R} .btn.nwi-secondary, ${R} .btn.nwi-filter { height: auto; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 18px; border-radius: 10px; font-size: 14px; font-weight: 500; letter-spacing: 0; line-height: normal; white-space: nowrap; cursor: pointer; transition: background .15s, color .15s; position: relative; }
${R} .btn.nwi-primary { background: #0E1225; color: #FFFFFF; border: 1px solid #0E1225; }
${R} .btn.nwi-primary:hover { background: #2E3270; border-color: #2E3270; color: #FFFFFF; }
${R} .btn.nwi-primary:disabled, ${R} .btn.nwi-primary.nwi-disabled { background: #C9CBE6; border-color: #C9CBE6; color: #FFFFFF; cursor: not-allowed; }
${R} .btn.nwi-secondary { background: #FFFFFF; color: #2E3270; border: 1px solid #DDDEFA; }
${R} .btn.nwi-secondary:hover { background: #ECEEFB; color: #2E3270; }
${R} .btn.nwi-secondary:disabled { color: #9FA3C4; cursor: not-allowed; }
${R} .btn.nwi-primary:active, ${R} .btn.nwi-secondary:active, ${R} .btn.nwi-filter:active { transform: none; }
${R} .nwi-link { color: #4B4FC7; text-decoration: underline; text-underline-offset: 2px; }
${R} .nwi-link:hover { color: #2E3270; }
${R} .nwi-error { margin: 0; font-size: 13px; color: #A33A3A; }
${R} .nwi-empty { padding: 24px; text-align: center; color: #9FA3C4; font-size: 14px; }
${R} .nwi-pill { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px; background: #ECEEFB; color: #3B3F7A; font-size: 12px; white-space: nowrap; }
${R} .nwi-pill-warn { background: #FBF1DC; color: #8A6420; }
${R} .nwi-review, ${R} .nwi-events { display: flex; flex-direction: column; gap: 14px; }
${R} .nwi-summary { display: flex; flex-direction: column; gap: 4px; font-size: 14px; color: #3B3F7A; }
${R} .nwi-summary-counts { font-size: 13px; color: #6B6F99; }
${R} .nwi-mapping { border: 1px solid #E8E9F6; border-radius: 12px; padding: 12px 14px; }
${R} .nwi-mapping-summary { cursor: pointer; font-size: 14px; color: #2E3270; }
${R} .nwi-mapping-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 200px), 1fr)); gap: 10px; margin: 12px 0; }
${R} .nwi-mapping-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #6B6F99; }
${R} .nwi-mapping .nwi-select, ${R} .nwi-row .nwi-select { width: 100%; min-width: 0; padding: 7px 8px; border: 1px solid #DDDEFA; border-radius: 8px; background: #FFFFFF; color: #0E1225; font-size: 13px; }
${R} .nwi-row .nwi-select.nwi-select-required { border-color: #C99A3A; background: #FFFBF2; }
${R} .nwi-filters { display: flex; flex-wrap: wrap; gap: 8px; }
${R} .btn.nwi-filter { padding: 6px 12px; border-radius: 999px; background: #FFFFFF; color: #3B3F7A; border: 1px solid #DDDEFA; font-size: 13px; }
${R} .btn.nwi-filter:hover { background: #F7F7FD; color: #3B3F7A; }
${R} .btn.nwi-filter.nwi-filter-on { background: #0E1225; color: #FFFFFF; border-color: #0E1225; }
${R} .nwi-rows { display: flex; flex-direction: column; border: 1px solid #E8E9F6; border-radius: 12px; overflow: hidden; }
${R} .nwi-row { display: grid; grid-template-columns: 36px minmax(0, 1.4fr) minmax(0, 1.4fr) 170px; gap: 12px; align-items: start; padding: 12px 14px; border-top: 1px solid #EEEFF8; font-size: 14px; }
${R} .nwi-row:first-child { border-top: 0; }
${R} .nwi-row[data-import-decision="undecided"] { background: #FFFDF7; }
${R} .nwi-row-seq { color: #9FA3C4; font-size: 12px; padding-top: 2px; }
${R} .nwi-row-main, ${R} .nwi-row-match, ${R} .nwi-row-candidate { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
${R} .nwi-row-main strong { overflow-wrap: anywhere; }
${R} .nwi-row-sub { font-size: 12px; color: #6B6F99; overflow-wrap: anywhere; }
${R} .nwi-row-issue { font-size: 12px; color: #A33A3A; }
${R} .nwi-row-candidate { font-size: 12px; color: #3B3F7A; }
${R} .nwi-row .nwi-pill { align-self: flex-start; }
${R} .nwi-rows > .btn.nwi-secondary { margin: 10px auto; }
${R} .nwi-footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding-top: 4px; }
${R} .nwi-footer-note { font-size: 13px; color: #6B6F99; flex: 1 1 260px; }
${R} .nwi-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
${R} .nwi-done { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; padding: 20px; border: 1px solid #E8E9F6; border-radius: 14px; background: #F7FAF8; }
${R} .nwi-done-title { font-size: 16px; color: #2F6B4F; }
${R} .nwi-done-counts { font-size: 14px; color: #3B3F7A; }
${R} .nwi-event { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; border: 1px solid #E8E9F6; border-radius: 12px; }
${R} .nwi-event-main { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
${R} .nwi-event-counts { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 13px; color: #3B3F7A; }
${R} .nwi-log-follow { margin-left: 6px; font-size: 12px; color: #8A6420; }
${R} .nw-import-row.nwi-log-row { min-width: 860px; display: grid; grid-template-columns: 150px 110px minmax(0, 1.5fr) 80px 90px 90px 90px 80px; gap: 14px; padding: 12px; border-top: 1px solid #EEEFF8; font-size: 14px; align-items: center; color: #0E1225; }
/* 导入屏原有两栏（主区 + 导入说明）在窄屏不折行，主区被挤成约 54px：≤900px 改单栏，说明排到下面。 */
@media (max-width: 900px) {
  ${R} .nw-import-grid { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 700px) {
  ${R} .nwi-row { grid-template-columns: 28px minmax(0, 1fr); }
  ${R} .nwi-row-match, ${R} .nwi-row-decision { grid-column: 2; }
  ${R} .nwi-footer .nwi-actions { width: 100%; }
  ${R} .nwi-footer .btn.nwi-primary { flex: 1 1 auto; white-space: normal; }
}
`;

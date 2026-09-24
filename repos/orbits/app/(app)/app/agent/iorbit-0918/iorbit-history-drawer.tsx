/**
 * iOrbit 历史记录抽屉（Orbit_0918）。
 *
 * JSX 逐元素来自 docs/designs/Orbit_0918/iOrbit.dc.html 第 786–804 行：
 *   788      遮罩 fixed inset 0 / rgba(14,18,37,0.28) / blur(4px) / 右对齐
 *   789      面板 width:min(400px,92vw) / 100% 高 / 阴影 / padding 26px 24px / gap 18 / animation orbit-fade .25s ease
 *   790–792  标题行「◷ 历史记录」+ 副标题 +「✕」
 *   793      eyebrow「最近的对话」
 *   794–802  会话行：▤ 图标 / 标题 / 日期 / ›；`h.bg` 标记当前会话（审阅修订 13 → 绑 `activeSessionId`）
 *   803      「加载更多历史记录 ⌄」
 *
 * 「能力保全决定」：设计只有扁平列表，既有的分组筛选 / 每行 `···`（置顶 · 重命名 ·
 * 移动到分组 · 删除→二次确认）/ 新对话 全部保留在这个结构里，逐条记偏差。删除二次
 * 确认对话框与 toast 由壳挂载（`AgentHistoryDeleteDialog` / `.nc-toast`）。
 *
 * 「加载更多」是**客户端逐段展开**，不是懒加载分页（审阅修订 11）：会话列表在
 * `use-agent-history` 里已经把所有 cursor 页抽干，置顶优先排序与分组计数都是对全集
 * 做的，改成懒加载会让后面几页的置顶会话排不到顶、分组计数出错。
 *
 * a11y 走统一口径（计划陷阱 10）：`useOrbitModalA11y` + `role="dialog"` +
 * `aria-modal` + `ORBIT_Z.modal`，不手写 keydown 陷阱。设计 788 的 `z-index:100`
 * 是设计稿自己的层级刻度，落到产品里取语义常量 `ORBIT_Z.modal`。
 */
"use client";

import { useEffect, useState } from "react";

import type { AiSessionGroupContract } from "../../../../../shared/contract/ai-sessions";
import { useOrbitLanguage } from "../../orbit-language-context";
import type { OrbitAgentHistoryView } from "../../orbit-agent-route-view-model";
import { useOrbitModalA11y } from "../../orbit-modal-a11y";
import { ORBIT_Z } from "../../orbit-z";
import { AgentChatHistoryOrganization } from "../agent-chat-history-organization";
import type { AgentHistoryLanguage } from "./iorbit-model";

/** 设计 794 的 `hint-placeholder-count="6"`：一段展开六条。 */
export const IORBIT_HISTORY_REVEAL_STEP = 6;

export interface IOrbitHistoryDrawerProps {
  activeQ: string;
  activeSessionId: string | null;
  groupMutationPending: boolean;
  groups: readonly AiSessionGroupContract[];
  history: readonly OrbitAgentHistoryView[];
  language: AgentHistoryLanguage;
  onClose: () => void;
  onCreateGroup: (name: string) => void;
  onDelete: (history: OrbitAgentHistoryView) => void;
  onDeleteGroup: (group: AiSessionGroupContract) => void;
  onFilterGroup: (groupId: string | null) => void;
  onMove: (history: OrbitAgentHistoryView, groupId: string | null) => void;
  onNewChat: () => void;
  onNewInGroup: (groupId: string) => void;
  onPick: (history: OrbitAgentHistoryView) => void;
  onRename: (history: OrbitAgentHistoryView, title: string) => void;
  onRenameGroup: (group: AiSessionGroupContract, name: string) => void;
  onTogglePin: (history: OrbitAgentHistoryView) => void;
  pendingSessionId: string | null;
  selectedGroupId: string | null;
}

export function IOrbitHistoryDrawer({
  activeQ,
  activeSessionId,
  groupMutationPending,
  groups,
  history,
  language,
  onClose,
  onCreateGroup,
  onDelete,
  onDeleteGroup,
  onFilterGroup,
  onMove,
  onNewChat,
  onNewInGroup,
  onPick,
  onRename,
  onRenameGroup,
  onTogglePin,
  pendingSessionId,
  selectedGroupId,
}: IOrbitHistoryDrawerProps) {
  const { t } = useOrbitLanguage();
  const panelRef = useOrbitModalA11y(onClose);
  const [revealed, setRevealed] = useState(IORBIT_HISTORY_REVEAL_STEP);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingTitle, setRenamingTitle] = useState("");

  // 换一个分组筛选就是换一份列表，展开量跟着回到第一段。
  useEffect(() => {
    setRevealed(IORBIT_HISTORY_REVEAL_STEP);
  }, [selectedGroupId]);

  const visible = history.slice(0, revealed);
  const hasMore = history.length > visible.length;

  const startRename = (item: OrbitAgentHistoryView) => {
    setMenuOpenId(null);
    setRenamingId(item.id);
    setRenamingTitle(item.title);
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenamingTitle("");
  };

  const finishRename = (item: OrbitAgentHistoryView) => {
    const title = renamingTitle.trim();
    if (title) onRename(item, title);
    cancelRename();
  };

  return (
    <div
      className="ir-drawer-scrim"
      data-orbit-agent-history-drawer
      // 设计 788 的遮罩点击关闭；只认落在遮罩自身上的点击，面板内的冒泡不算
      // （设计 789 的 `stop` 在这里由目标判断代替）。
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
      style={{ zIndex: ORBIT_Z.modal }}
    >
      <div
        aria-labelledby="orbit-iorbit-history-title"
        aria-modal="true"
        className="ir-drawer"
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        {/* 790–792 */}
        <div className="ir-drawer-head">
          <span className="ir-drawer-head-copy">
            <span className="ir-drawer-title-row">
              <span className="ir-drawer-title-icon">◷</span>
              <strong className="ir-drawer-title" id="orbit-iorbit-history-title">
                {t({ en: "History", zh: "历史记录" })}
              </strong>
            </span>
            <span className="ir-drawer-sub">
              {t({
                en: "Browse the conversations you have had with iOrbit.",
                zh: "查看你与 iOrbit 的过往对话记录。",
              })}
            </span>
          </span>
          <button
            aria-label={t({ en: "Close", zh: "关闭" })}
            className="btn ir-drawer-close"
            onClick={onClose}
            type="button"
          >
            ✕
          </button>
        </div>

        {/* 设计没有这一段：既有的「新对话」与分组能力保留（能力保全决定） */}
        <div className="ir-drawer-tools">
          <button className="btn ir-drawer-new" onClick={onNewChat} type="button">
            ＋ {t({ en: "New chat", zh: "新对话" })}
          </button>
          <AgentChatHistoryOrganization
            busy={groupMutationPending}
            currentGroupId={selectedGroupId}
            groups={groups}
            language={language}
            onCreate={onCreateGroup}
            onDelete={onDeleteGroup}
            onFilter={onFilterGroup}
            onNew={onNewInGroup}
            onRename={onRenameGroup}
          />
        </div>

        {/* 793 */}
        <span className="ir-drawer-eyebrow">{t({ en: "Recent conversations", zh: "最近的对话" })}</span>

        {/* 794–802。`role="list"`/`"listitem"` 是设计外的既有 a11y 保障（旧侧栏有，
            `core-product-ux-optimizations.test.ts` 的「long result surfaces」用例钉着它）：
            这一段是 `<div>` 栅格而不是 `<ul>`，所以显式给出列表语义。 */}
        <div className="ir-hist-list" role="list">
        {visible.map((item) => {
          // 设计 905 的 `h.bg` 是「当前会话」的底色，绑 activeSessionId（审阅修订 13），
          // 不是「第一行」。没有 sessionId 的历史行回落到问题原文比对。
          const current = Boolean(
            (item.sessionId && item.sessionId === activeSessionId) ||
              (activeQ && item.q === activeQ),
          );
          const menuOpen = menuOpenId === item.id;
          const renaming = renamingId === item.id;
          const pending = Boolean(item.sessionId) && item.sessionId === pendingSessionId;

          return (
            <div
              aria-busy={pending}
              className={current ? "ir-hist-row ir-hist-row-on" : "ir-hist-row"}
              key={item.id}
              role="listitem"
            >
              {renaming ? (
                <form
                  className="ir-hist-rename"
                  onSubmit={(event) => {
                    event.preventDefault();
                    finishRename(item);
                  }}
                >
                  <input
                    aria-label={t({ en: "Rename conversation", zh: "重命名对话" })}
                    autoFocus
                    className="ir-hist-rename-input"
                    data-orbit-agent-history-rename-input={item.sessionId}
                    onChange={(event) => setRenamingTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Escape") return;
                      // 重命名中的 Esc 先取消编辑，不关整个抽屉。
                      event.preventDefault();
                      event.stopPropagation();
                      cancelRename();
                    }}
                    value={renamingTitle}
                  />
                  <button
                    className="btn ir-hist-rename-ok"
                    data-orbit-agent-history-save-rename={item.sessionId}
                    disabled={!renamingTitle.trim()}
                    type="submit"
                  >
                    {t({ en: "Save", zh: "保存" })}
                  </button>
                  <button
                    className="btn ir-hist-rename-cancel"
                    data-orbit-agent-history-cancel-rename={item.sessionId}
                    onClick={cancelRename}
                    type="button"
                  >
                    {t({ en: "Cancel", zh: "取消" })}
                  </button>
                </form>
              ) : (
                <button
                  className="btn ir-hist-open"
                  onClick={() => {
                    setMenuOpenId(null);
                    onPick(item);
                  }}
                  title={item.q || item.title}
                  type="button"
                >
                  <span className="ir-hist-icon">▤</span>
                  <span className="ir-hist-copy">
                    <strong className="ir-hist-title">{item.title}</strong>
                    {/* 设计 797 的日期。`when` 放的是分组名（审阅修订 12），所以取
                        view model 的 `date`；来源解析不出日期时这一行不渲染。 */}
                    {item.date ? (
                      <span className="ir-hist-date">
                        {item.pinned ? `${t({ en: "Pinned", zh: "已置顶" })} · ${item.date}` : item.date}
                      </span>
                    ) : null}
                  </span>
                  <span className="ir-caret">›</span>
                </button>
              )}
              {/* 重命名中不渲染「···」：它是 `position:absolute; right:10px` 的
                  28×28 钮，`opacity:0` 但 `pointer-events:auto`，会整块盖住重命名行
                  最右侧的「取消」钮的中心点（2026-09-24 运行时取证实测：
                  取消 x1157–1203、··· x1177–1205，`elementFromPoint` 落在 `.ir-hist-more`
                  上），鼠标点「取消」实际打开的是更多菜单。静态截图不取重命名态，
                  故像素不变。 */}
              {item.sessionId && !renaming ? (
                <>
                  <button
                    aria-expanded={menuOpen}
                    aria-haspopup="menu"
                    aria-label={t({ en: "More actions", zh: "更多操作" })}
                    className="btn ir-hist-more"
                    data-orbit-agent-history-menu-button={item.sessionId}
                    disabled={pending}
                    onClick={() => setMenuOpenId(menuOpen ? null : item.id)}
                    type="button"
                  >
                    ···
                  </button>
                  {menuOpen ? (
                    <div
                      className="ir-hist-menu"
                      data-orbit-agent-history-menu={item.sessionId}
                      onKeyDown={(event) => {
                        if (event.key !== "Escape") return;
                        // 菜单开着时 Esc 先收菜单（抽屉的 Esc 来自 useOrbitModalA11y
                        // 的 document 监听，stopPropagation 挡住它）。
                        event.preventDefault();
                        event.stopPropagation();
                        setMenuOpenId(null);
                      }}
                      role="menu"
                      style={{ zIndex: ORBIT_Z.dropdown }}
                    >
                      <button
                        className="btn ir-hist-menu-item"
                        data-orbit-agent-history-pin={item.sessionId}
                        disabled={pending}
                        onClick={() => {
                          setMenuOpenId(null);
                          onTogglePin(item);
                        }}
                        role="menuitem"
                        type="button"
                      >
                        {item.pinned ? t({ en: "Unpin", zh: "取消置顶" }) : t({ en: "Pin", zh: "置顶" })}
                      </button>
                      <button
                        className="btn ir-hist-menu-item"
                        data-orbit-agent-history-rename={item.sessionId}
                        disabled={pending}
                        onClick={() => startRename(item)}
                        role="menuitem"
                        type="button"
                      >
                        {t({ en: "Rename", zh: "重命名" })}
                      </button>
                      <span className="ir-hist-menu-label">{t({ en: "Move to", zh: "移动到" })}</span>
                      <button
                        className="btn ir-hist-menu-item"
                        disabled={pending || item.groupId === null}
                        onClick={() => {
                          setMenuOpenId(null);
                          onMove(item, null);
                        }}
                        role="menuitem"
                        type="button"
                      >
                        {t({ en: "Ungrouped", zh: "未分组" })}
                      </button>
                      {groups.map((group) => (
                        <button
                          className="btn ir-hist-menu-item"
                          disabled={pending || item.groupId === group.id}
                          key={group.id}
                          onClick={() => {
                            setMenuOpenId(null);
                            onMove(item, group.id);
                          }}
                          role="menuitem"
                          type="button"
                        >
                          {group.name}
                        </button>
                      ))}
                      <button
                        className="btn ir-hist-menu-item ir-hist-menu-danger"
                        data-orbit-agent-history-delete={item.sessionId}
                        disabled={pending}
                        onClick={() => {
                          setMenuOpenId(null);
                          onDelete(item);
                        }}
                        role="menuitem"
                        type="button"
                      >
                        {t({ en: "Delete", zh: "删除对话" })}
                      </button>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          );
        })}
        </div>

        {history.length === 0 ? (
          <span className="ir-drawer-empty">
            {t({ en: "No conversations yet.", zh: "还没有对话记录。" })}
          </span>
        ) : null}

        {/* 803：客户端逐段展开（审阅修订 11），列表本身已经抽干 */}
        {hasMore ? (
          <button
            className="btn ir-drawer-more"
            data-orbit-agent-history-reveal-more
            onClick={() => setRevealed((count) => count + IORBIT_HISTORY_REVEAL_STEP)}
            type="button"
          >
            {t({ en: "Load more history ⌄", zh: "加载更多历史记录 ⌄" })}
          </button>
        ) : null}
      </div>
    </div>
  );
}

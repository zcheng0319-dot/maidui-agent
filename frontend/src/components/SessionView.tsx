/**
 * SessionView — 买对 · Active Session 页面骨架（PHASE B1）
 *
 * 职责：
 *   - Session 顶部栏（☰ / 买对 logo / query title / 连接态）
 *   - 左侧 ↔ 右侧可拖拽分屏（默认 58 / 42，clamp 38–72）
 *   - History Drawer（左上 ☰ 唤起，overlay 关闭，ESC 关闭）
 *   - 响应式：< 900px 时右侧转 stack（不做复杂移动端）
 *
 * 数据约束（重要）：
 *   - 本组件纯布局，不触犯 WebSocket / events / turns / submit 数据流
 *   - 对话与商品研究内容均由 App 通过 `left` / `right` 传入
 *   - 不引入 react-resizable-panels 等任何新 dependency
 *   - 不在 SessionView 内复刻任何 mock / fake product / fake Match
 *
 * 视觉：B0 lavender shell 复用；新增 .session-* / .history-drawer / .history-overlay 类。
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import HistorySidebar from "./HistorySidebar";

interface SessionViewProps {
  left: ReactNode;
  right: ReactNode;
  title?: string;
  connected: boolean;
  connecting: boolean;
  buyerName: string;
  onNewChat: () => void;
}

const MIN_PCT = 38;
const MAX_PCT = 72;
const DEFAULT_PCT = 58;

function ConnectionChip({ connected, connecting }: { connected: boolean; connecting: boolean }) {
  let cls = "session-conn-chip";
  let label = "买对在线";
  if (connecting) {
    cls = "session-conn-chip session-conn-connecting";
    label = "连接中";
  } else if (!connected) {
    cls = "session-conn-chip session-conn-off";
    label = "实时连接已断开";
  } else {
    cls = "session-conn-chip session-conn-on";
  }
  return (
    <span className={cls} title={label} aria-label={label}>
      <span className="session-conn-dot" aria-hidden />
      <span className="session-conn-label">{label}</span>
    </span>
  );
}

function MenuIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  );
}

export default function SessionView({
  left,
  right,
  title,
  connected,
  connecting,
  buyerName,
  onNewChat,
}: SessionViewProps) {
  const [splitPct, setSplitPct] = useState<number>(DEFAULT_PCT);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const toggleDrawer = useCallback(() => {
    setDrawerOpen((v) => !v);
  }, []);

  // ESC 关闭抽屉
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  // 拖拽 divider：pointer events 全程挂在 container 上
  const handlePointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.classList.add("is-split-dragging");
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0) return;
      const pct = (e.clientX - rect.left) / rect.width * 100;
      const clamped = Math.min(MAX_PCT, Math.max(MIN_PCT, pct));
      setSplitPct(clamped);
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.classList.remove("is-split-dragging");
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const headerTitle = title?.trim() ? title : "新对话";

  return (
    <div className="session-shell">
      <header className="session-header">
        <div className="session-header-left">
          <button
            type="button"
            className="session-menu-btn"
            aria-label={drawerOpen ? "关闭历史" : "打开历史"}
            aria-expanded={drawerOpen}
            onClick={toggleDrawer}
          >
            <MenuIcon />
          </button>
          <div className="session-brand">
            <img
              src="/logo-main.png"
              alt=""
              width={28}
              height={28}
              className="session-brand-img"
              aria-hidden
            />
            <span className="session-brand-text">买对</span>
          </div>
          <span className="session-divider-line" aria-hidden />
          <span className="session-title" title={headerTitle}>
            {headerTitle}
          </span>
        </div>
        <div className="session-header-right">
          <ConnectionChip connected={connected} connecting={connecting} />
        </div>
      </header>

      <div className="session-body" ref={containerRef}>
        <div
          className="session-left"
          style={{ flexBasis: `${splitPct}%` }}
          aria-label="对话区"
        >
          {left}
        </div>

        <div
          className="session-divider"
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={Math.round(splitPct)}
          aria-valuemin={MIN_PCT}
          aria-valuemax={MAX_PCT}
          aria-label="调整左右分栏宽度"
          onPointerDown={handlePointerDown}
        >
          <span className="session-divider-grip" aria-hidden />
        </div>

        <div
          className="session-right"
          style={{ flexBasis: `${100 - splitPct}%` }}
          aria-label="商品研究区"
        >
          {right}
        </div>
      </div>

      {/* History Drawer */}
      {drawerOpen && (
        <>
          <div
            className="history-overlay"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <aside
            className="history-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="历史会话"
          >
            <HistorySidebar buyerName={buyerName} onNewChat={onNewChat} />
          </aside>
        </>
      )}
    </div>
  );
}

/**
 * HistorySidebar — 买对 · Home 左侧历史侧栏（PHASE B0）
 *
 * 视觉规范：glass-strong 背景 + lavender accent + 罗列式空状态。
 * 数据约束（重要）：
 *   - 当前后端没有真实 history API
 *   - 第一版只显示空状态："暂无历史会话"
 *   - 不创建假历史记录
 *   - 不引入 localStorage 多 session 系统
 *
 * 用户区：固定底部，显示当前买家（来自 App 传入的 buyerId）。
 *
 * 「新对话」按钮：在 Home 视图下，点击只清空 HomeView 输入框（由 App 控制）。
 */

interface HistorySidebarProps {
  buyerName: string;
  onNewChat: () => void;
}

export default function HistorySidebar({ buyerName, onNewChat }: HistorySidebarProps) {
  const initial = (buyerName ?? "我").charAt(0).toUpperCase();

  return (
    <aside className="history-sidebar" aria-label="历史对话">
      <div className="history-head">
        <div className="history-brand">
          <img
            src="/logo-main.png"
            alt=""
            width={32}
            height={32}
            className="history-brand-img"
            aria-hidden
          />
          <span className="history-brand-text">买对 AI</span>
        </div>
      </div>

      <button
        type="button"
        className="history-new"
        onClick={onNewChat}
        aria-label="开始新对话"
      >
        <span className="history-new-icon" aria-hidden>
          +
        </span>
        新对话
      </button>

      <p className="history-section-title">最近的选购对话</p>
      <nav className="history-list" aria-label="历史会话列表">
        <div className="history-empty">
          <p className="history-empty-title">暂无历史会话</p>
          <p className="history-empty-desc">
            开始一条新对话，问问买对 AI 帮你选什么。
          </p>
        </div>
      </nav>

      <div className="history-user" role="group" aria-label="当前用户">
        <div className="history-user-avatar" aria-hidden>
          {initial}
        </div>
        <span className="history-user-name">{buyerName || "我"}</span>
      </div>
    </aside>
  );
}
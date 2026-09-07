import { useState, type FormEvent, type KeyboardEvent } from "react";

/**
 * HomeView — 买对 · Home 页面
 *
 * 视觉规范：lavender accent + ambient 浮动光晕 + glass-strong 卡片 + fade-up 入场。
 * 数据：纯本地，不触发后端。提交时通过 onStart 把 query 交给上层 App，
 *       由 App 切换到 session 视图并复用现有 POST /commerce/intents。
 *
 * 重要约束：
 *   - suggested prompts 仅作"试试这些"提示文案，禁止称"热门趋势/大家在研究"
 *     （当前没有真实趋势数据）
 *   - 点击 suggested prompt 直接进入 session（与输入 + 点发送等价）
 */

const SUGGESTED_PROMPTS = [
  "通勤降噪耳机",
  "秋季徒步装备",
  "1000 元内旅行背包",
  "露营长续航灯",
  "学生党桌面好物",
];

interface HomeViewProps {
  onStart: (query: string) => void;
  busy?: boolean;
}

/** 内联 SVG 图标（避免引 lucide 等新依赖）。 */
function ArrowUpIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 19V5" />
      <path d="M5 12l7-7 7 7" />
    </svg>
  );
}

function SparklesIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
      <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z" />
    </svg>
  );
}

export default function HomeView({ onStart, busy = false }: HomeViewProps) {
  const [value, setValue] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = value.trim();
    if (!text) return;
    onStart(text);
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const text = value.trim();
      if (text) onStart(text);
    }
  };

  const handlePrompt = (text: string) => {
    setValue(text);
    onStart(text);
  };

  return (
    <main className="home-main" aria-label="买对 Home">
      {/* 背景浮动光晕（Lovable 视觉标志） */}
      <div
        className="ambient-orb animate-float-slow"
        style={{
          left: "16%",
          top: "4%",
          width: 420,
          height: 420,
          background: "color-mix(in oklab, var(--accent) 15%, transparent)",
        }}
        aria-hidden
      />
      <div
        className="ambient-orb animate-float-slower"
        style={{
          bottom: "2%",
          right: "10%",
          width: 360,
          height: 360,
          background: "color-mix(in oklab, var(--accent-strong) 12%, transparent)",
          animationDelay: "2s",
        }}
        aria-hidden
      />
      <div
        className="ambient-orb animate-float-reverse"
        style={{
          right: "22%",
          top: "30%",
          width: 280,
          height: 280,
          background: "color-mix(in oklab, var(--warm) 12%, transparent)",
          animationDelay: "5s",
        }}
        aria-hidden
      />

      <div className="home-canvas">
        <header className="home-hero animate-fade-up">
          <div className="home-logo-row">
            <img
              src="/logo-main.png"
              alt="买对"
              width={44}
              height={44}
              className="home-logo-img"
            />
            <h1 className="home-title text-gradient-ink">买对 AI</h1>
          </div>
          <p className="home-eyebrow">Shopping Agent</p>
          <p className="home-tagline">帮你搜、比、选，最后买对。</p>
        </header>

        <form
          className="home-input-card animate-fade-up"
          onSubmit={submit}
          style={{ animationDelay: "80ms" }}
        >
          <textarea
            className="home-input"
            rows={2}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKey}
            placeholder="今天想买什么？例如：800 元以内适合通勤的降噪耳机"
            aria-label="购物需求"
          />
          <div className="home-input-foot">
            <span className="home-input-hint">
              <SparklesIcon />
              买对 AI 会帮你检索、对比并给出建议
            </span>
            <button
              type="submit"
              aria-label="发送"
              className="home-input-submit"
              disabled={!value.trim() || busy}
            >
              <ArrowUpIcon />
            </button>
          </div>
        </form>

        <section
          className="home-prompts animate-fade-up"
          style={{ animationDelay: "160ms" }}
          aria-label="建议尝试"
        >
          <p className="home-prompts-label">试试这些</p>
          <div className="home-prompts-row">
            {SUGGESTED_PROMPTS.map((prompt, i) => (
              <button
                key={prompt}
                type="button"
                className="home-prompt-chip"
                onClick={() => handlePrompt(prompt)}
                style={{ animationDelay: `${200 + i * 50}ms` }}
              >
                {prompt}
              </button>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
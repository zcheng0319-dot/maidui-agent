import { useEffect, useRef, useState } from "react";
import AgentPanel from "./components/AgentPanel";
import ProductCards from "./components/ProductCards";
import WelcomeState from "./components/WelcomeState";
import MaiduiMock from "./MaiduiMock";
import { currentThinkingText } from "./agentSteps";
import type { TradeEvent } from "./types";

/** /mock 或 ?mock=1 时渲染 Agent UI 概念稿（STATIC MOCK，零后端） */
function isMockRoute(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.location.pathname === "/mock" ||
    window.location.search.includes("mock=1")
  );
}

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000";
const WS_BASE = API_BASE.replace(/^http/, "ws");

function loadOrCreate(key: string, prefix: string): string {
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const created = `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
  localStorage.setItem(key, created);
  return created;
}

interface Turn {
  role: "buyer" | "agent";
  text: string;
}

const CAPABILITY_TAGS = ["智能筛选", "参数对比", "实时决策"];

/** 输入框内的轻量辅助提示（仅视觉，不触发真实筛选）。 */
const QUICK_PROMPTS = ["预算", "场景", "偏好"];

/** 兜底轮播：没有任何真实事件到来时（仅 busy / 刚提交）用作通用文案。 */
const FALLBACK_STAGES = [
  "理解你的需求",
  "正在检索商品",
  "正在分析候选",
  "正在比较参数",
  "正在整理推荐",
];

function ConnectionChip({ connected, connecting }: { connected: boolean; connecting: boolean }) {
  let cls = "chip";
  let label = "Agent 在线";
  if (connecting) {
    cls = "chip chip-connecting";
    label = "连接中";
  } else if (!connected) {
    cls = "chip chip-off";
    label = "实时连接已断开";
  } else {
    cls = "chip chip-on";
  }
  return (
    <span className={cls} title={label}>
      <span className="chip-dot" />
      {label}
    </span>
  );
}

/** 左侧 Thinking 卡片：文案优先绑定真实活跃 step，否则用兜底轮播。 */
function ThinkingCard({ text, active }: { text: string | null; active: boolean }) {
  const [idx, setIdx] = useState(0);
  const [swap, setSwap] = useState(false);

  useEffect(() => {
    if (!active) {
      setIdx(0);
      return;
    }
    const t = window.setInterval(() => {
      setSwap(true);
      window.setTimeout(() => {
        setIdx((v) => (v + 1) % FALLBACK_STAGES.length);
        setSwap(false);
      }, 160);
    }, 1900);
    return () => window.clearInterval(t);
  }, [active]);

  if (!active) return null;

  // 有真实绑定文案则不轮播
  const label = text ?? FALLBACK_STAGES[idx];

  return (
    <div className="thinking" role="status" aria-live="polite">
      <span className="thinking-pulse" aria-hidden="true" />
      <span className="thinking-label">买对正在为你工作</span>
      <span className={`thinking-stage${swap && !text ? " swap" : ""}`} key={text ?? idx}>
        {label}
      </span>
      <span className="thinking-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    </div>
  );
}

export default function App() {
  // 概念稿路由：完整静态 Agent 工作流，不接后端
  if (isMockRoute()) return <MaiduiMock />;

  const [sessionId] = useState(() => loadOrCreate("maidui.session", "web"));
  const [buyerId] = useState(() => loadOrCreate("maidui.buyer", "buyer"));
  const [events, setEvents] = useState<TradeEvent[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [streaming, setStreaming] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);

  // 绑定真实事件 → 思考文案
  const thinkText = currentThinkingText(events);
  const hasFinal = events.some((e) => e.type === "final.result");
  const isWorking = busy || (events.length > 0 && !hasFinal);
  const showThinking = isWorking && !streaming;

  // WS 订阅：按会话接收 Agent 过程事件（StrictMode 下会双次挂载，用 closed 标记避免早关告警）
  useEffect(() => {
    let closed = false;
    let retryTimer: number | undefined;

    const connect = () => {
      if (closed) return;
      setConnecting(true);
      const ws = new WebSocket(`${WS_BASE}/commerce/events`);
      wsRef.current = ws;
      ws.onopen = () => {
        if (closed) {
          ws.close();
          return;
        }
        ws.send(JSON.stringify({ shopping_session_id: sessionId }));
        setConnected(true);
        setConnecting(false);
      };
      ws.onclose = () => {
        setConnected(false);
        setConnecting(false);
        if (!closed) {
          // 断线重连，避免长任务期间丢事件
          retryTimer = window.setTimeout(connect, 1500);
        }
      };
      ws.onerror = () => {
        setConnected(false);
      };
      ws.onmessage = (message) => {
        const event: TradeEvent = JSON.parse(message.data);
        if (event.type === "token.delta") {
          setStreaming((prev) => prev + (event.payload.token ?? ""));
          return;
        }
        setEvents((prev) => [...prev, event]);
        if (event.type === "final.result") {
          setStreaming("");
          setTurns((prev) => [...prev, { role: "agent", text: event.payload.text ?? "" }]);
        }
      };
    };

    connect();
    return () => {
      closed = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      wsRef.current?.close();
    };
  }, [sessionId]);

  const submit = async (rawOverride?: string) => {
    const query = (rawOverride ?? input).trim();
    if (!query || busy) return;
    setInput("");
    setBusy(true);
    setTurns((prev) => [...prev, { role: "buyer", text: query }]);
    try {
      await fetch(`${API_BASE}/commerce/intents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopping_session_id: sessionId,
          buyer_id: buyerId,
          locale: "zh-CN",
          currency: "CNY",
          raw_query: query,
        }),
      });
    } catch (error) {
      setTurns((prev) => [...prev, { role: "agent", text: `[error] 请求失败：${error}` }]);
    } finally {
      setBusy(false);
    }
  };

  const isEmpty = turns.length === 0 && !streaming && !busy;

  return (
    <div className="layout">
      <header className="hero">
        <div className="brand-block">
          <div className="brand-mark" role="img" aria-label="买对 App 图标">
            <img src="/logo-main.png" alt="" className="brand-mark-img" />
          </div>
          <div className="brand-text">
            <div className="brand-title-row">
              <h1 className="brand-title">买对</h1>
              <span className="brand-sub">AI 智能选购助手</span>
            </div>
            <p className="brand-value">帮你筛选、比较、决策，再下单。</p>
            <div className="capability-tags">
              {CAPABILITY_TAGS.map((tag) => (
                <span key={tag} className="cap-tag">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="hero-meta">
          <ConnectionChip connected={connected} connecting={connecting} />
          <div className="hero-meta-row">
            <span className="meta-pill">会话 {sessionId}</span>
            <span className="meta-pill">买家 {buyerId}</span>
          </div>
        </div>
      </header>

      <main>
        <section className="chat">
          {isEmpty ? (
            <WelcomeState onPick={(t) => setInput(t)} />
          ) : (
            <div className="turns">
              {turns.map((turn, index) => (
                <div key={index} className={`turn ${turn.role}`}>
                  <div className="who">{turn.role === "buyer" ? "我" : <img src="/bot.png" alt="" className="who-img" />}</div>
                  <div className="text">{turn.text}</div>
                </div>
              ))}
              {streaming && (
                <div className="turn agent streaming">
                  <div className="who"><img src="/bot.png" alt="" className="who-img" /></div>
                  <div className="text">{streaming}</div>
                </div>
              )}
            </div>
          )}

          <ThinkingCard text={thinkText} active={showThinking} />

          <ProductCards events={events} />

          <div className="composer">
            <div className="composer-input">
              <textarea
                value={input}
                placeholder="告诉我你想买什么，例如：800 元以内适合通勤的降噪耳机"
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void submit();
                  }
                }}
              />
              <div className="composer-chips">
                {QUICK_PROMPTS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    className="composer-chip"
                    onClick={() => setInput((prev) => (prev ? `${prev} ` : "") + chip)}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={() => void submit()}
              disabled={busy || !input.trim()}
              className={busy ? "is-busy" : ""}
            >
              {busy ? "处理中" : "发送"}
            </button>
          </div>
        </section>

        <AgentPanel events={events} />
      </main>
    </div>
  );
}

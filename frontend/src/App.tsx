import { useEffect, useRef, useState } from "react";
import AgentPanel from "./components/AgentPanel";
import ProductCards from "./components/ProductCards";
import HomeView from "./components/HomeView";
import HistorySidebar from "./components/HistorySidebar";
import SessionView from "./components/SessionView";
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
  // PHASE B0：Home ↔ Session 视图切换。Home 不直连 WS（实际连接由 Session 进入后保持复用）。
  const [view, setView] = useState<"home" | "session">("home");
  // PHASE B0：触发 HomeView 重新挂载以清空其内部输入框状态（不引入多 session 系统）
  const [homeKey, setHomeKey] = useState(0);
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

  // PHASE B0：Home → Session 切换 + 复用现有 submit(override)
  const handleStart = async (query: string) => {
    if (!query.trim()) return;
    setView("session");
    await submit(query);
  };

  // PHASE B0：「新对话」= 重新挂载 HomeView 清理本地输入框
  const handleNewChat = () => {
    setHomeKey((k) => k + 1);
    setView("home");
  };

  // PHASE B1：最新一条买家 query，用作 Session header 标题
  const latestBuyerQuery = (() => {
    for (let i = turns.length - 1; i >= 0; i -= 1) {
      if (turns[i].role === "buyer") return turns[i].text;
    }
    return undefined;
  })();

  // PHASE B0：Home 视图直接返回；不在此分支触发现有 WS / events / turns 渲染。
  if (view === "home") {
    return (
      <div className="layout-home">
        <HistorySidebar buyerName={buyerId} onNewChat={handleNewChat} />
        <HomeView key={homeKey} onStart={handleStart} busy={busy} />
      </div>
    );
  }

  // PHASE B1：Active Session 走 SessionView 骨架，原 chat 内容作 left，原 AgentPanel 作 right。
  const leftContent = (
    <section className="chat">
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
  );

  // 右栏占位：保留真实 AgentPanel，避免一次性把右侧也清空（B1 只做 layout）
  const rightContent = (
    <div className="session-right-wrap">
      <AgentPanel events={events} />
      <p className="session-right-hint">商品研究区将在后续阶段接入真实候选数据。</p>
    </div>
  );

  return (
    <SessionView
      left={leftContent}
      right={rightContent}
      title={latestBuyerQuery}
      connected={connected}
      connecting={connecting}
      buyerName={buyerId}
      onNewChat={handleNewChat}
    />
  );
}

import { useEffect, useRef, useState } from "react";
import ConversationPanel, { type ConversationTurn } from "./components/ConversationPanel";
import ResearchPanel, { type ResearchTab } from "./components/ResearchPanel";
import HomeView from "./components/HomeView";
import HistorySidebar from "./components/HistorySidebar";
import SessionView from "./components/SessionView";
import MaiduiMock from "./MaiduiMock";
import type { TradeEvent } from "./types";

function isMockRoute(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.pathname === "/mock" || window.location.search.includes("mock=1");
}

// The backend's existing development CORS allow-list uses localhost:5173.
const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";
const WS_BASE = API_BASE.replace(/^http/, "ws");

function loadOrCreate(key: string, prefix: string): string {
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const created = `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
  localStorage.setItem(key, created);
  return created;
}

export default function App() {
  if (isMockRoute()) return <MaiduiMock />;

  const [sessionId] = useState(() => loadOrCreate("maidui.session", "web"));
  const [buyerId] = useState(() => loadOrCreate("maidui.buyer", "buyer"));
  const [events, setEvents] = useState<TradeEvent[]>([]);
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [streaming, setStreaming] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [view, setView] = useState<"home" | "session">("home");
  const [homeKey, setHomeKey] = useState(0);
  const [researchTab, setResearchTab] = useState<ResearchTab>("candidates");
  const wsRef = useRef<WebSocket | null>(null);
  // This ref preserves the existing event stream and supplies a UI-only turn boundary.
  const eventsRef = useRef<TradeEvent[]>([]);

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
        if (!closed) retryTimer = window.setTimeout(connect, 1500);
      };
      ws.onerror = () => setConnected(false);
      ws.onmessage = (message) => {
        const event: TradeEvent = JSON.parse(message.data);
        if (event.type === "token.delta") {
          setStreaming((previous) => previous + (event.payload.token ?? ""));
          return;
        }

        const nextEvents = [...eventsRef.current, event];
        eventsRef.current = nextEvents;
        setEvents(nextEvents);
        if (event.type === "final.result") {
          setStreaming("");
          setTurns((previous) => [
            ...previous,
            { role: "agent", text: event.payload.text ?? "", finalEventIndex: nextEvents.length - 1 },
          ]);
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
    setTurns((previous) => [...previous, { role: "buyer", text: query }]);
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
      setTurns((previous) => [...previous, { role: "agent", text: `[error] 请求失败：${error}` }]);
    } finally {
      setBusy(false);
    }
  };

  const handleStart = async (query: string) => {
    if (!query.trim()) return;
    setView("session");
    await submit(query);
  };

  const handleNewChat = () => {
    setHomeKey((key) => key + 1);
    setView("home");
  };

  const latestBuyerQuery = (() => {
    for (let index = turns.length - 1; index >= 0; index -= 1) {
      if (turns[index].role === "buyer") return turns[index].text;
    }
    return undefined;
  })();

  if (view === "home") {
    return (
      <div className="layout-home">
        <HistorySidebar buyerName={buyerId} onNewChat={handleNewChat} />
        <HomeView key={homeKey} onStart={handleStart} busy={busy} />
      </div>
    );
  }

  const leftContent = (
    <ConversationPanel
      turns={turns}
      events={events}
      streaming={streaming}
      busy={busy}
      input={input}
      onInputChange={setInput}
      onSubmit={(value) => void submit(value)}
      onOpenTab={setResearchTab}
    />
  );

  const rightContent = (
    <ResearchPanel events={events} activeTab={researchTab} onTabChange={setResearchTab} />
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

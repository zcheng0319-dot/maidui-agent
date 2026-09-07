import { useEffect, useRef, type ReactNode } from "react";
import { getEventsForActiveAgentTurn, getEventsForAgentTurn } from "../agentSteps";
import { AgentMessage, UserMessage } from "./Message";
import type { TradeEvent } from "../types";

export interface ConversationTurn {
  role: "buyer" | "agent";
  text: string;
  finalEventIndex?: number;
}

interface ConversationPanelProps {
  turns: ConversationTurn[];
  events: TradeEvent[];
  streaming: string;
  busy: boolean;
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (value?: string) => void;
  productCards: ReactNode;
}

const QUICK_PROMPTS = ["更轻", "更便宜", "更耐用", "只看 500 元内"];

export default function ConversationPanel({
  turns,
  events,
  streaming,
  busy,
  input,
  onInputChange,
  onSubmit,
  productCards,
}: ConversationPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeEvents = getEventsForActiveAgentTurn(events);
  // No final.result means this real event slice still belongs to the live reply.
  const liveReplyActive = busy || activeEvents.length > 0;
  const showLiveAgent = Boolean(streaming) || liveReplyActive;

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
  }, [turns, streaming, events.length, busy]);

  return (
    <section className="conversation-panel" aria-label="与买对的对话">
      <div className="conversation-scroll" ref={scrollRef} aria-live="polite">
        <div className="conversation-messages">
          {turns.map((turn, index) => {
            if (turn.role === "buyer") return <UserMessage key={index} text={turn.text} />;
            const turnEvents = turn.finalEventIndex === undefined
              ? []
              : getEventsForAgentTurn(events, turn.finalEventIndex);
            return <AgentMessage key={index} text={turn.text} events={turnEvents} />;
          })}

          {showLiveAgent && (
            <AgentMessage
              text={streaming}
              events={activeEvents}
              streaming={Boolean(streaming)}
              active={liveReplyActive}
            />
          )}

          {productCards}
        </div>
      </div>

      <div className="composer-shell">
        <textarea
          value={input}
          placeholder="继续告诉买对你的偏好，例如：更轻，还是更便宜？"
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSubmit();
            }
          }}
        />
        <div className="composer-actions">
          <div className="quick-prompts" aria-label="快捷追问">
            {QUICK_PROMPTS.map((prompt) => (
              <button key={prompt} type="button" onClick={() => onSubmit(prompt)} disabled={busy}>
                {prompt}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="composer-submit"
            onClick={() => onSubmit()}
            disabled={busy || !input.trim()}
          >
            {busy ? "处理中" : "发送"}
          </button>
        </div>
      </div>
    </section>
  );
}

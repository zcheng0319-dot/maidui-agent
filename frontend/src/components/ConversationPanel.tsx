import { useEffect, useRef } from "react";
import { getEventsForActiveAgentTurn, getEventsForAgentTurn } from "../agentSteps";
import { latestCards } from "../productData";
import { AgentMessage, UserMessage } from "./Message";
import type { TradeEvent } from "../types";
import type { ResearchTab } from "./ResearchPanel";

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
  onOpenTab: (tab: ResearchTab) => void;
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
  onOpenTab,
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
            const turnCards = latestCards(turnEvents);
            const actions = [
              ...(turnCards.length > 0 ? [{ label: "查看候选商品", onClick: () => onOpenTab("candidates") }] : []),
              ...(turnCards.length >= 2 ? [{ label: "查看完整对比", onClick: () => onOpenTab("comparison") }] : []),
              ...(turn.finalEventIndex !== undefined ? [{ label: "查看详细分析", onClick: () => onOpenTab("recommendation") }] : []),
            ];
            return <AgentMessage key={index} text={turn.text} events={turnEvents} actions={actions} />;
          })}

          {showLiveAgent && (
            <AgentMessage
              text={streaming}
              events={activeEvents}
              streaming={Boolean(streaming)}
              active={liveReplyActive}
            />
          )}
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

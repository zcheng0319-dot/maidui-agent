import type { ReactNode } from "react";
import WorkTrace from "./WorkTrace";
import type { TradeEvent } from "../types";

export function UserMessage({ text }: { text: string }) {
  return (
    <div className="message-row message-row-user">
      <div className="user-message">{text}</div>
    </div>
  );
}

interface AgentMessageProps {
  text?: string;
  events: TradeEvent[];
  streaming?: boolean;
  active?: boolean;
  children?: ReactNode;
  actions?: Array<{ label: string; onClick: () => void }>;
}

export function AgentMessage({ text, events, streaming = false, active = false, children, actions }: AgentMessageProps) {
  return (
    <div className={`message-row message-row-agent${streaming ? " is-streaming" : ""}`}>
      <div className="agent-avatar" aria-hidden="true">买</div>
      <div className="agent-content">
        {text && <div className="agent-message">{text}</div>}
        <WorkTrace events={events} active={active} />
        {actions && actions.length > 0 && (
          <div className="message-actions">
            {actions.map((action) => (
              <button type="button" key={action.label} onClick={action.onClick}>{action.label} →</button>
            ))}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
